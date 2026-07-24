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

interface TensionOutput {
  tensions: {
    readingA: number
    readingB: number
    title: string
    body: string
  }[]
}

type GenResult = { ok: true; insights: Insight[] } | { ok: false; error: string }

/**
 * Generate (or return cached) tension insights for one concept. Never sends
 * nugget bodies. Idempotent per (kind, anchorConcept, inputHash): on a cache hit
 * it returns the surviving insights without any model call (zero tokens); a
 * fresh input first sweeps stale, non-dismissed tension rows for the concept so
 * the panel never mixes readings from an older edge set. Dismissed rows are
 * always preserved, so a rejected insight is never resurrected.
 */
export async function generateTensions(conceptId: string): Promise<GenResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'KI nicht konfiguriert (kein API-Key hinterlegt).' }
  }

  const distilled = await distillConcept(conceptId)
  if (!distilled) return { ok: false, error: 'Konzept nicht gefunden.' }
  // A tension needs at least two readings to compare — nothing to do otherwise.
  if (distilled.readings.length < 2) return { ok: true, insights: [] }

  const inputHash = hashInput(distilled)

  // Cache hit: this exact input was already analyzed. Return the surviving
  // (non-dismissed) insights; dismissed ones stay hidden. No model call.
  const cached = await prisma.insight.findMany({
    where: { kind: 'tension', anchorConceptId: conceptId, inputHash },
    orderBy: { createdAt: 'asc' },
  })
  if (cached.length > 0) {
    return { ok: true, insights: cached.filter(i => i.status !== 'dismissed') }
  }

  // Fresh input (first run or the concept's edges changed): drop stale,
  // non-dismissed tension rows for this concept so old readings don't linger.
  await prisma.insight.deleteMany({
    where: {
      kind: 'tension',
      anchorConceptId: conceptId,
      inputHash: { not: inputHash },
      status: { not: 'dismissed' },
    },
  })

  // Present readings as a numbered list; the model refers to them by index, and
  // we map indices back to nugget ids — far more robust than trusting the model
  // to echo opaque cuid strings.
  const readingList = distilled.readings
    .map((r, i) => `[${i + 1}] „${r.note}" (aus: ${r.title})`)
    .join('\n')
  const userMessage = `Konzept: ${distilled.term}\nDefinition: ${distilled.description}\n\nLesarten:\n${readingList}`

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
      messages: [{ role: 'user', content: userMessage }],
    })

    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      return { ok: false, error: 'KI-Anfrage fehlgeschlagen (unerwartete Antwort).' }
    }
    const out = toolUse.input as TensionOutput
    const tensions = Array.isArray(out.tensions) ? out.tensions : []

    // Map reading indices → nugget ids; drop any tension referencing an
    // out-of-range or identical pair (schema violations despite forced tools).
    const rows = tensions
      .map(t => {
        const a = distilled.readings[t.readingA - 1]
        const b = distilled.readings[t.readingB - 1]
        if (!a || !b || a.nuggetId === b.nuggetId) return null
        if (!t.title?.trim() || !t.body?.trim()) return null
        return { a, b, title: t.title.trim(), body: t.body.trim() }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    // Record the whole call's token usage on the first row (the rest carry 0),
    // so summing the concept's rows reconstructs one generation's cost. A
    // zero-tension run records nothing — an accepted, minor blind spot.
    const created: Insight[] = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const insight = await prisma.insight.create({
        data: {
          kind: 'tension',
          status: 'new',
          title: r.title,
          body: r.body,
          anchorConceptId: conceptId,
          refs: JSON.stringify({ conceptIds: [], nuggetIds: [r.a.nuggetId, r.b.nuggetId] }),
          inputHash,
          model: CLAUDE_MODEL,
          inputTokens: i === 0 ? response.usage.input_tokens : 0,
          outputTokens: i === 0 ? response.usage.output_tokens : 0,
        },
      })
      created.push(insight)
    }

    return { ok: true, insights: created }
  } catch (error) {
    console.error('[insights] tension generation failed:', error)
    return { ok: false, error: describeAiError(error) }
  }
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
