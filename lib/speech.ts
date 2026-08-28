import { createHash } from 'crypto'
import { prisma } from './prisma'
import { anthropic, CLAUDE_MODEL, describeAiError } from './anthropic'
import { stripOriginalLanguageQuotes, buildSpeechSegments, type SpeechSegment, type ForeignSpan } from './speechText'

/**
 * "Vorlesen" (read-aloud) — generates the German/English/Latin language
 * tagging that lets the browser's built-in speech synthesis (free, on-device)
 * switch voices mid-nugget instead of reading everything with one accent.
 * Hebrew/Greek script is stripped BEFORE this ever runs (deterministic, see
 * lib/speechText.ts) — the model only ever sees Latin-alphabet text, and its
 * one job is telling German apart from genuine English/Latin passages, which
 * script alone can't do.
 *
 * Lazy by design, mirroring the Insight engines (lib/insights.ts) and
 * locateInsightPassage: most nuggets are never listened to, so generating this
 * eagerly at save time would spend tokens on nuggets nobody hears. Cached on
 * `Nugget.speechSegments` keyed by a hash of the stripped text — editing the
 * nugget invalidates the cache automatically (contentPlain changes → hash
 * changes), re-viewing without editing costs zero tokens.
 */

const SPEECH_SYSTEM_PROMPT = `Du bekommst den Fließtext eines Nuggets (einer deutschsprachigen Notiz, oft exegetisch) — teils mit englischen oder lateinischen Zitaten/Fachbegriffen durchsetzt, und teils mit LATEINISCH TRANSKRIBIERTEN hebräischen oder griechischen Wörtern (Aussprachehilfen wie "yādaʿ" oder "mē kauchasthō ho sophos en tē sophia autou" — der hebräische/griechische Originaltext selbst wurde bereits entfernt, aber solche Umschriften stehen oft noch daneben, meist kursiv oder zwischen Schrägstrichen). Zweck: Der Text soll vorgelesen werden.

Aufgabe: identifiziere JEDEN zusammenhängenden Abschnitt, der NICHT auf Deutsch ist, und ordne ihm eine von drei Kategorien zu:
- "en" — echtes Englisch (Zitat, Buchtitel, Fachbegriff).
- "la" — echtes Latein (z. B. "de facto", "vice versa", "sensu stricto").
- "translit" — eine lateinisch umschriebene hebräische oder griechische Wortform (KEINE eigene Sprache, sondern eine Aussprachehilfe für das Original) — z. B. "yādaʿ", "mišpāṭ", "hina", "kauchaomai". Erkennbar oft an ungewöhnlichen Diakritika (ā, ē, ō, ṣ, ḥ) oder daran, dass direkt davor ein hebräisches/griechisches Wort stand (das im gelieferten Text bereits fehlt).

Regeln:
- Nur ECHTE fremdsprachige/transliterierte Passagen (mindestens ein ganzes Wort) — keine im Deutschen längst eingebürgerten Fachwörter (z. B. "Computer", "Team", "Status", "Online" NICHT markieren) und keine Abkürzungen wie "etc." oder "vs.".
- Jede Passage als WÖRTLICHES, zeichengenaues Zitat aus dem Text (exakte Teilzeichenkette, keine Umformulierung, keine Auslassungen).
- Im Zweifel zwischen "la" und "translit": Ein Wort mit hebräischer/griechischer Umschrift-Orthographie (ʿ, ḥ, ṣ, ā/ē/ō mit Makron, altgriechische Lautfolgen) ist "translit", nicht "la" — echtes Latein sieht orthographisch anders aus (z. B. "-us", "-um", "-tio"-Endungen ohne Sonderzeichen).
- Findest du nichts, gib eine leere Liste zurück.
- Gib das Ergebnis ausschließlich über das Werkzeug mark_foreign_spans zurück.`

interface SpanOutput {
  spans: { quote: string; lang: string }[]
}

/**
 * Cached segments only — no AI call, no cost. Returns null if never generated
 * OR if the nugget was edited since (stripped-text hash mismatch), so a stale
 * reading is never served; the caller then falls back to plain reading (or, if
 * owner, can trigger regeneration via {@link generateSpeechSegments}).
 */
export async function cachedSpeechSegments(nuggetId: string): Promise<SpeechSegment[] | null> {
  const nugget = await prisma.nugget.findUnique({
    where: { id: nuggetId },
    select: { contentPlain: true, speechSegments: true },
  })
  if (!nugget?.speechSegments) return null
  try {
    const cached = JSON.parse(nugget.speechSegments) as { hash?: string; segments?: unknown }
    const currentHash = createHash('sha256')
      .update(stripOriginalLanguageQuotes(nugget.contentPlain))
      .digest('hex')
    if (cached.hash !== currentHash || !Array.isArray(cached.segments)) return null
    return cached.segments as SpeechSegment[]
  } catch {
    return null
  }
}

/**
 * Returns cached segments if fresh, otherwise runs the one-time AI pass and
 * caches the result. The only code path that spends tokens — gate calls to
 * this behind the owner check (see app/api/nuggets/[id]/speech/route.ts);
 * reading the cache ({@link cachedSpeechSegments}) stays public/free.
 */
export async function generateSpeechSegments(
  nuggetId: string,
): Promise<{ ok: true; segments: SpeechSegment[] } | { ok: false; error: string }> {
  const cached = await cachedSpeechSegments(nuggetId)
  if (cached) return { ok: true, segments: cached }

  const nugget = await prisma.nugget.findUnique({ where: { id: nuggetId }, select: { contentPlain: true } })
  if (!nugget) return { ok: false, error: 'Nugget nicht gefunden.' }

  const stripped = stripOriginalLanguageQuotes(nugget.contentPlain)
  const hash = createHash('sha256').update(stripped).digest('hex')
  if (!stripped.trim()) {
    await prisma.nugget.update({ where: { id: nuggetId }, data: { speechSegments: JSON.stringify({ hash, segments: [] }) } })
    return { ok: true, segments: [] }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'KI nicht konfiguriert (kein API-Key hinterlegt).' }
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: SPEECH_SYSTEM_PROMPT,
      tools: [
        {
          name: 'mark_foreign_spans',
          description: 'Save every non-German (English or Latin) passage found in the text (empty array if none).',
          input_schema: {
            type: 'object' as const,
            properties: {
              spans: {
                type: 'array',
                description: 'Distinct non-German passages, in any order.',
                items: {
                  type: 'object',
                  properties: {
                    quote: { type: 'string', description: 'Verbatim, character-exact substring of the given text.' },
                    lang: { type: 'string', enum: ['en', 'la', 'translit'], description: '"en" English, "la" real Latin, "translit" a romanized Hebrew/Greek word (pronunciation aid, not a language of its own).' },
                  },
                  required: ['quote', 'lang'],
                },
              },
            },
            required: ['spans'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'mark_foreign_spans' },
      messages: [{ role: 'user', content: stripped }],
    })

    // Booked on the nugget, like concept extraction and insight locating.
    await prisma.nugget.update({
      where: { id: nuggetId },
      data: {
        aiInputTokens: { increment: response.usage.input_tokens },
        aiOutputTokens: { increment: response.usage.output_tokens },
      },
    })

    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      return { ok: false, error: 'KI-Anfrage fehlgeschlagen (unerwartete Antwort).' }
    }
    const out = toolUse.input as SpanOutput
    const spans: ForeignSpan[] = Array.isArray(out.spans)
      ? out.spans
          .filter((s): s is { quote: string; lang: string } =>
            typeof s?.quote === 'string' && (s.lang === 'en' || s.lang === 'la' || s.lang === 'translit'))
          .map(s => ({ quote: s.quote, lang: s.lang as 'en' | 'la' | 'translit' }))
      : []

    const segments = buildSpeechSegments(stripped, spans)
    await prisma.nugget.update({
      where: { id: nuggetId },
      data: { speechSegments: JSON.stringify({ hash, segments }) },
    })
    return { ok: true, segments }
  } catch (error) {
    console.error('[speech] segmentation failed:', error)
    return { ok: false, error: describeAiError(error) }
  }
}
