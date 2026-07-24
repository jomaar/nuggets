import { createHash } from 'crypto'
import { prisma } from './prisma'
import { anthropic, CLAUDE_MODEL, describeAiError } from './anthropic'
import { fallbackTitle } from './content'
import type { AnchorToken } from './bookmarkLink'
import type { Insight } from '@prisma/client'

/**
 * Insight generation — the knowledge graph reasoning ABOUT the user's material.
 *
 * Design principle: the graph does the SELECTION, the LLM does the SYNTHESIS.
 * The model never sees a nugget body — only the distilled per-edge `note`s (what
 * each nugget says about a concept) plus the concept's definition. That keeps
 * every call tiny and cheap, and results are cached by `inputHash` so re-viewing
 * a concept spends zero tokens until its edges actually change.
 *
 * Stage 1 ships ONE engine (tension). question/bridge/theme reuse `distillConcept`
 * and the same cache/upsert shape.
 */

export interface Reading {
  nuggetId: string
  title: string
  relevance: number
  note: string
}

export interface ConceptDistillation {
  conceptId: string
  term: string
  description: string
  readings: Reading[]
}

/** Primary human label for a concept: German first, then English, then any. */
function primaryTerm(labels: { language: string; term: string }[]): string {
  return (
    labels.find(l => l.language === 'de')?.term ??
    labels.find(l => l.language === 'en')?.term ??
    labels[0]?.term ??
    '?'
  )
}

/**
 * Builds the body-free distilled record for one concept: its abstract definition
 * plus every nugget's short reading of it (the edge `note`s). This — NOT the
 * nugget bodies — is the entire input the insight engines see. Readings without a
 * note are dropped (nothing to reason about). Ordered by relevance for the prompt.
 */
export async function distillConcept(conceptId: string): Promise<ConceptDistillation | null> {
  const concept = await prisma.concept.findUnique({
    where: { id: conceptId },
    include: {
      labels: { select: { language: true, term: true } },
      nuggets: {
        include: { nugget: { select: { id: true, title: true, contentHtml: true } } },
        orderBy: { relevance: 'desc' },
      },
    },
  })
  if (!concept) return null

  const readings: Reading[] = concept.nuggets
    .filter(nc => nc.note && nc.note.trim())
    .map(nc => ({
      nuggetId: nc.nugget.id,
      title: nc.nugget.title || fallbackTitle(nc.nugget.contentHtml),
      relevance: nc.relevance,
      note: nc.note!.trim(),
    }))

  return {
    conceptId,
    term: primaryTerm(concept.labels),
    description: concept.description,
    readings,
  }
}

/**
 * A stable fingerprint of the distilled input. Order-independent (readings are
 * sorted by nugget id) and covers the concept's definition too, so editing either
 * a note or the description re-triggers generation, while merely re-opening the
 * concept does not. This is the cache key that keeps token spend near zero.
 */
function hashInput(d: ConceptDistillation): string {
  const norm = d.readings
    .map(r => ({ n: r.nuggetId, r: Math.round(r.relevance * 100) / 100, t: r.note }))
    .sort((a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : 0))
  return createHash('sha256')
    .update(JSON.stringify({ c: d.conceptId, term: d.term, desc: d.description, readings: norm }))
    .digest('hex')
}

const TENSION_SYSTEM_PROMPT = `Du bist ein theologisch und philosophisch geschulter Denkpartner in einer persönlichen Wissens-App (Schwerpunkt Glaube und Bibel).

Du bekommst EIN Konzept mit seiner Definition und mehreren "Lesarten" — kurze Notizen aus verschiedenen Nuggets (Notizen des Nutzers), die jeweils festhalten, was DIESE Notiz über das Konzept sagt.

Deine Aufgabe: echte gedankliche SPANNUNGEN oder WIDERSPRÜCHE zwischen diesen Lesarten aufdecken — Stellen, an denen der Nutzer dasselbe Konzept an verschiedenen Orten unterschiedlich, unvereinbar oder in Reibung zueinander liest, ohne es vielleicht bemerkt zu haben. Das ist der Wert: ihm etwas zeigen, das er selbst nicht gesehen hat.

Strenge Regeln:
- Nur ECHTE Spannungen. Zwei Lesarten, die einfach verschiedene Aspekte beleuchten, sind KEINE Spannung. Erfinde nichts, konstruiere keine Reibung, wo Kohärenz herrscht.
- Sind die Lesarten stimmig, gib eine LEERE Liste zurück. Eine ehrliche leere Antwort ist besser als eine erfundene Spannung.
- Jede Spannung nennt genau ZWEI Lesarten (über ihre Nummer) und formuliert die Reibung als eine zugespitzte Frage oder These im "title", plus 2–4 Sätze im "body", die erklären, worin die Spannung genau besteht und warum sie bedenkenswert ist.
- Antworte in der Sprache der Notizen (überwiegend Deutsch).
- Gib das Ergebnis ausschließlich über das Werkzeug save_tensions zurück.`

type GenResult = { ok: true; insights: Insight[] } | { ok: false; error: string }

/** One insight the engine wants persisted (before token/kind/hash are attached). */
interface NewInsightRow {
  title: string
  body: string
  refs: { conceptIds: string[]; nuggetIds: string[] }
}

/** What an engine's synthesis step returns: the rows to persist + the call's token usage. */
type Synthesis =
  | { ok: true; rows: NewInsightRow[]; inputTokens: number; outputTokens: number }
  | { ok: false; error: string }

/**
 * Numbered reading list + user message, shared by every concept-scoped engine.
 * The model refers to readings by index; the engine maps indices back to nugget
 * ids — far more robust than trusting the model to echo opaque cuid strings.
 */
function buildUserMessage(distilled: ConceptDistillation): string {
  const readingList = distilled.readings
    .map((r, i) => `[${i + 1}] „${r.note}" (aus: ${r.title})`)
    .join('\n')
  return `Konzept: ${distilled.term}\nDefinition: ${distilled.description}\n\nLesarten:\n${readingList}`
}

/**
 * Shared backbone for every concept-scoped insight engine (tension, question, …).
 * Handles the whole efficiency + idempotency machinery so each engine only has to
 * supply its prompt/tool/mapping via `synthesize`:
 *  - never sends nugget bodies (input is the distilled edge-notes only);
 *  - on a cache hit for (kind, anchorConcept, inputHash) it returns the surviving
 *    (non-dismissed) rows WITHOUT any model call (zero tokens);
 *  - on a fresh input it first sweeps stale, non-dismissed rows OF THIS KIND for
 *    the concept, so the panel never mixes readings from an older edge set;
 *  - dismissed rows are always preserved, so a rejected insight never resurrects;
 *  - records the whole call's token usage on the first created row (the rest carry
 *    0), so summing the concept's rows reconstructs one generation's cost.
 * tension and question share the SAME inputHash (same distilled input) but are
 * scoped by `kind`, so they coexist without colliding (index is [kind, inputHash],
 * not a unique constraint).
 */
async function generateForConcept(
  conceptId: string,
  kind: string,
  minReadings: number,
  synthesize: (distilled: ConceptDistillation) => Promise<Synthesis>,
): Promise<GenResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'KI nicht konfiguriert (kein API-Key hinterlegt).' }
  }

  const distilled = await distillConcept(conceptId)
  if (!distilled) return { ok: false, error: 'Konzept nicht gefunden.' }
  // Too few readings to reason about — nothing to do (honest empty).
  if (distilled.readings.length < minReadings) return { ok: true, insights: [] }

  const inputHash = hashInput(distilled)

  const cached = await prisma.insight.findMany({
    where: { kind, anchorConceptId: conceptId, inputHash },
    orderBy: { createdAt: 'asc' },
  })
  if (cached.length > 0) {
    return { ok: true, insights: cached.filter(i => i.status !== 'dismissed') }
  }

  await prisma.insight.deleteMany({
    where: { kind, anchorConceptId: conceptId, inputHash: { not: inputHash }, status: { not: 'dismissed' } },
  })

  const result = await synthesize(distilled)
  if (!result.ok) return { ok: false, error: result.error }

  const created: Insight[] = []
  for (let i = 0; i < result.rows.length; i++) {
    const r = result.rows[i]
    const insight = await prisma.insight.create({
      data: {
        kind,
        status: 'new',
        title: r.title,
        body: r.body,
        anchorConceptId: conceptId,
        refs: JSON.stringify(r.refs),
        inputHash,
        model: CLAUDE_MODEL,
        inputTokens: i === 0 ? result.inputTokens : 0,
        outputTokens: i === 0 ? result.outputTokens : 0,
      },
    })
    created.push(insight)
  }

  return { ok: true, insights: created }
}

interface TensionOutput {
  tensions: {
    readingA: number
    readingB: number
    title: string
    body: string
  }[]
}

/**
 * Generate (or return cached) tension insights for one concept: genuine frictions
 * between how different nuggets read the same concept. Needs ≥2 readings. The
 * cache/sweep/token machinery lives in `generateForConcept`.
 */
export function generateTensions(conceptId: string): Promise<GenResult> {
  return generateForConcept(conceptId, 'tension', 2, async distilled => {
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        system: TENSION_SYSTEM_PROMPT,
        tools: [
          {
            name: 'save_tensions',
            description: 'Save the genuine tensions found between the readings (empty if the readings are coherent).',
            input_schema: {
              type: 'object' as const,
              properties: {
                tensions: {
                  type: 'array',
                  description: 'Distinct genuine tensions. Empty array if the readings are coherent.',
                  items: {
                    type: 'object',
                    properties: {
                      readingA: { type: 'integer', description: 'Number of the first reading in tension' },
                      readingB: { type: 'integer', description: 'Number of the second reading in tension' },
                      title: { type: 'string', description: 'The tension as one pointed line (question or thesis), language of the notes' },
                      body: { type: 'string', description: '2–4 sentences: what exactly is in tension and why it is worth thinking about. Markdown allowed.' },
                    },
                    required: ['readingA', 'readingB', 'title', 'body'],
                  },
                },
              },
              required: ['tensions'],
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'save_tensions' },
        messages: [{ role: 'user', content: buildUserMessage(distilled) }],
      })

      const toolUse = response.content.find(b => b.type === 'tool_use')
      if (!toolUse || toolUse.type !== 'tool_use') {
        return { ok: false, error: 'KI-Anfrage fehlgeschlagen (unerwartete Antwort).' }
      }
      const out = toolUse.input as TensionOutput
      const tensions = Array.isArray(out.tensions) ? out.tensions : []

      // Map reading indices → nugget ids; drop any tension referencing an
      // out-of-range or identical pair (schema violations despite forced tools).
      const rows: NewInsightRow[] = tensions
        .map(t => {
          const a = distilled.readings[t.readingA - 1]
          const b = distilled.readings[t.readingB - 1]
          if (!a || !b || a.nuggetId === b.nuggetId) return null
          if (!t.title?.trim() || !t.body?.trim()) return null
          return {
            title: t.title.trim(),
            body: t.body.trim(),
            refs: { conceptIds: [] as string[], nuggetIds: [a.nuggetId, b.nuggetId] },
          }
        })
        .filter((r): r is NewInsightRow => r !== null)

      return { ok: true, rows, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
    } catch (error) {
      console.error('[insights] tension generation failed:', error)
      return { ok: false, error: describeAiError(error) }
    }
  })
}

const QUESTION_SYSTEM_PROMPT = `Du bist ein theologisch und philosophisch geschulter Denkpartner in einer persönlichen Wissens-App (Schwerpunkt Glaube und Bibel).

Du bekommst EIN Konzept mit seiner Definition und mehreren "Lesarten" — kurze Notizen aus verschiedenen Nuggets (Notizen des Nutzers), die jeweils festhalten, was DIESE Notiz über das Konzept sagt.

Deine Aufgabe: die stärksten OFFENEN FRAGEN formulieren, die dieses Material aufwirft, aber selbst NICHT beantwortet — die gedankliche Leerstelle, den nächsten Schritt, dem der Nutzer nachgehen sollte. Der Wert liegt darin, ihm eine produktive Frage zu geben, die aus seinem EIGENEN Material erwächst und die er noch nicht durchdacht hat.

Strenge Regeln:
- Nur echte Fragen, die aus dem Material erwachsen. KEINE allgemeinen Lehrbuchfragen, keine Frage, die eine der Lesarten bereits beantwortet.
- Höchstens ZWEI Fragen, lieber EINE. Eine präzise, tiefe Frage schlägt mehrere flache.
- Wirft das Material keine echte offene Frage auf, gib eine LEERE Liste zurück. Eine ehrliche leere Antwort ist besser als eine erfundene Frage.
- Formuliere die Frage zugespitzt als "title" (die Frage selbst, ein Satz), plus 2–4 Sätze im "body": warum die Frage offen ist, woran sie im Material hängt und wohin sie führt.
- Nenne unter "readings" die Nummern der ein oder zwei Lesarten, aus denen die Frage erwächst — nur wenn eindeutig, sonst eine leere Liste.
- Antworte in der Sprache der Notizen (überwiegend Deutsch).
- Gib das Ergebnis ausschließlich über das Werkzeug save_questions zurück.`

interface QuestionOutput {
  questions: {
    title: string
    body: string
    readings?: number[]
  }[]
}

/**
 * Generate (or return cached) open-question insights for one concept: the
 * productive questions the material raises but does not answer. Needs ≥1 reading
 * (a single rich reading can already leave something open). Shares `distillConcept`
 * and the whole cache/sweep/token backbone with the tension engine; only the
 * prompt, tool schema and index→nuggetId mapping differ.
 */
export function generateQuestions(conceptId: string): Promise<GenResult> {
  return generateForConcept(conceptId, 'question', 1, async distilled => {
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 2048,
        system: QUESTION_SYSTEM_PROMPT,
        tools: [
          {
            name: 'save_questions',
            description: 'Save the genuine open questions the material raises (empty if it raises none).',
            input_schema: {
              type: 'object' as const,
              properties: {
                questions: {
                  type: 'array',
                  description: 'Distinct open questions (at most two). Empty array if the material raises no genuine open question.',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string', description: 'The open question itself, one pointed sentence, language of the notes' },
                      body: { type: 'string', description: '2–4 sentences: why it is open, what in the material it hangs on and where it leads. Markdown allowed.' },
                      readings: {
                        type: 'array',
                        description: 'Numbers of the 1–2 readings the question arises from; empty if not clearly tied to specific readings.',
                        items: { type: 'integer' },
                      },
                    },
                    required: ['title', 'body'],
                  },
                },
              },
              required: ['questions'],
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'save_questions' },
        messages: [{ role: 'user', content: buildUserMessage(distilled) }],
      })

      const toolUse = response.content.find(b => b.type === 'tool_use')
      if (!toolUse || toolUse.type !== 'tool_use') {
        return { ok: false, error: 'KI-Anfrage fehlgeschlagen (unerwartete Antwort).' }
      }
      const out = toolUse.input as QuestionOutput
      const questions = Array.isArray(out.questions) ? out.questions : []

      // Map the cited reading indices → nugget ids (deduped, out-of-range dropped)
      // so the card can offer jump chips; a question without clear refs shows none.
      const rows: NewInsightRow[] = questions
        .map(q => {
          if (!q.title?.trim() || !q.body?.trim()) return null
          const nuggetIds = Array.isArray(q.readings)
            ? [...new Set(
                q.readings
                  .map(n => distilled.readings[n - 1]?.nuggetId)
                  .filter((v): v is string => typeof v === 'string'),
              )]
            : []
          return { title: q.title.trim(), body: q.body.trim(), refs: { conceptIds: [] as string[], nuggetIds } }
        })
        .filter((r): r is NewInsightRow => r !== null)

      return { ok: true, rows, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
    } catch (error) {
      console.error('[insights] question generation failed:', error)
      return { ok: false, error: describeAiError(error) }
    }
  })
}

const LOCATE_SYSTEM_PROMPT = `Du erhältst den Volltext eines Nuggets (einer Notiz) und die Beschreibung eines Denkanstoßes (einer gedanklichen Spannung), der sich auf dieses Nugget bezieht. Finde die EINE Textstelle im Nugget, auf die sich der Denkanstoß am direktesten bezieht.

Gib über das Werkzeug locate_passage ausschließlich ein WÖRTLICHES, zusammenhängendes Zitat aus dem Nugget-Text zurück:
- ein bis zwei Sätze, ZEICHENGENAU aus dem Text kopiert (gleiche Groß-/Kleinschreibung, Satzzeichen, Umlaute) — keine Umformulierung, keine Auslassungen (…), keine umschließenden Anführungszeichen.
- Das Zitat MUSS als exakte Teilzeichenkette im gelieferten Nugget-Text vorkommen.
- Wähle die kürzeste, prägnanteste Stelle, die den Kern trifft.
Findest du keine passende Stelle, gib ein leeres Zitat zurück.`

/** Escape a string for safe use inside a RegExp. */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const CONTEXT_LEN = 30 // chars of prefix/suffix, matching the bookmark anchor capture

/**
 * Build a text-quote anchor (quote + prefix/suffix context, the bookmark shape)
 * from a verbatim quote the model claims to have copied from `contentPlain`.
 * Returns null unless the quote genuinely occurs in the text — exact match first,
 * then a whitespace-flexible fallback (the model occasionally re-spaces). Without
 * a real substring `findRanges` in the reader can't resolve it, so the caller
 * falls back to jumping to the nugget top rather than to a wrong or dead spot.
 */
function buildAnchor(contentPlain: string, rawQuote: string): AnchorToken | null {
  const q = rawQuote.trim()
  if (!q) return null

  let idx = contentPlain.indexOf(q)
  let matched = q
  if (idx === -1) {
    const pattern = q.split(/\s+/).map(escapeRegex).join('\\s+')
    const m = new RegExp(pattern).exec(contentPlain)
    if (m) { idx = m.index; matched = m[0] }
  }
  if (idx === -1) return null

  const prefix = contentPlain.slice(Math.max(0, idx - CONTEXT_LEN), idx)
  const suffix = contentPlain.slice(idx + matched.length, idx + matched.length + CONTEXT_LEN)
  return { quote: matched, prefix, suffix }
}

/**
 * On-demand locate: given an insight and one of the nuggets it references, ask
 * the model for the single passage the insight is about and return a jump anchor
 * for it. LAZY by design — the (potentially large) nugget body is read only here,
 * only for the 1–2 nuggets a tension points at, and only when the user taps to
 * jump. Never throws. Returns `{ anchor: null }` when nothing resolves (caller
 * jumps to the nugget top). The strongest locator hint is this nugget's edge-note
 * for the insight's anchor concept — the distilled reading — passed alongside.
 */
export async function locateInsightPassage(
  insightId: string,
  nuggetId: string,
): Promise<{ ok: true; anchor: AnchorToken | null } | { ok: false; error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'KI nicht konfiguriert (kein API-Key hinterlegt).' }
  }

  const insight = await prisma.insight.findUnique({ where: { id: insightId } })
  if (!insight) return { ok: false, error: 'Insight nicht gefunden.' }

  let refNuggetIds: string[] = []
  try {
    const parsed = JSON.parse(insight.refs)
    refNuggetIds = Array.isArray(parsed?.nuggetIds) ? parsed.nuggetIds : []
  } catch { /* empty */ }
  if (!refNuggetIds.includes(nuggetId)) {
    return { ok: false, error: 'Nugget gehört nicht zu diesem Denkanstoß.' }
  }

  const nugget = await prisma.nugget.findUnique({ where: { id: nuggetId }, select: { contentPlain: true } })
  if (!nugget || !nugget.contentPlain.trim()) return { ok: true, anchor: null }

  // The edge-note for the anchor concept is the distilled reading of THIS nugget —
  // the sharpest pointer to where the tension lives in the text.
  let readingNote: string | null = null
  if (insight.anchorConceptId) {
    const edge = await prisma.nuggetConcept.findUnique({
      where: { nuggetId_conceptId: { nuggetId, conceptId: insight.anchorConceptId } },
      select: { note: true },
    })
    readingNote = edge?.note ?? null
  }

  const userMessage =
    `Denkanstoß: ${insight.title}\n${insight.body}` +
    (readingNote ? `\n\nLesart dieses Nuggets: ${readingNote}` : '') +
    `\n\nNugget-Text:\n${nugget.contentPlain}`

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system: LOCATE_SYSTEM_PROMPT,
      tools: [
        {
          name: 'locate_passage',
          description: 'Return the single verbatim passage from the nugget text the insight is about (empty if none fits).',
          input_schema: {
            type: 'object' as const,
            properties: {
              quote: { type: 'string', description: 'Verbatim, character-exact substring of the nugget text (1–2 sentences); empty string if no passage fits.' },
            },
            required: ['quote'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'locate_passage' },
      messages: [{ role: 'user', content: userMessage }],
    })

    // Locating spends budget too — book it on the nugget, like concept extraction.
    await prisma.nugget.update({
      where: { id: nuggetId },
      data: {
        aiInputTokens: { increment: response.usage.input_tokens },
        aiOutputTokens: { increment: response.usage.output_tokens },
      },
    })

    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') return { ok: true, anchor: null }
    const quote = (toolUse.input as { quote?: unknown }).quote
    if (typeof quote !== 'string') return { ok: true, anchor: null }

    return { ok: true, anchor: buildAnchor(nugget.contentPlain, quote) }
  } catch (error) {
    console.error('[insights] locate failed:', error)
    return { ok: false, error: describeAiError(error) }
  }
}
