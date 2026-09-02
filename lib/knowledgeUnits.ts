/**
 * Builds and maintains the `KnowledgeUnit` index behind "Naheliegendes"
 * (Spinnennetz Stufe 1) — see the plan for the full design. Three kinds of
 * unit, two very different sourcing strategies:
 *
 * - "paragraph": no existing extraction path, so a dedicated LLM call
 *   (`segmentNuggetProse`) reads the nugget's full text and identifies
 *   several independent thoughts, each as a verbatim quote — verified via
 *   `buildAnchor` (lib/textAnchor.ts) before being trusted, same mechanism
 *   `lib/insights.ts`'s `locateInsightPassage` already uses for exactly this
 *   "did the model really quote the text" problem.
 * - "mark"/"comment": already have exact positions (a `<mark>`/`<u data-color>`
 *   element, or a stored `Annotation` anchor) — purely mechanical, reusing
 *   `lib/marks.ts`'s `extractMarks` and the `Annotation` rows directly, no
 *   LLM call needed.
 *
 * `reindexNugget` is the one orchestrator: diffs against the previous set by
 * content hash (so an unrelated edit doesn't re-embed everything), embeds
 * only what changed in ONE batched call, and never throws out of a save
 * path — a failed embed just means that nugget doesn't show up as "related"
 * yet, logged, not surfaced as an error.
 */
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { anthropic, CLAUDE_MODEL, describeAiError } from '@/lib/anthropic'
import { buildAnchor } from '@/lib/textAnchor'
import { extractMarks } from '@/lib/marks'
import { embedTexts, packVector, EMBED_MODEL, EMBED_DIM } from '@/lib/embeddings'
import { bumpNearbyIndexVersion } from '@/lib/nearbyIndex'
import type { AnchorToken } from '@/lib/bookmarkLink'

/** Caps a unit's displayed/embedded text — bigger than lib/marks.ts's MARK_TEXT_MAX(400) since a paragraph-thought or comment carries more context. */
const UNIT_TEXT_MAX = 800

// ── Prose segmentation (LLM) ─────────────────────────────────────────────────

const SEGMENT_SYSTEM_PROMPT = `Du hilfst dabei, ein Nugget (eine Notiz) für eine feingranulare Ähnlichkeitssuche zu erschließen. Andere Nuggets im Bestand sollen später anhand einzelner Gedanken gefunden werden können, nicht nur anhand des ganzen Textes.

Finde bis zu {maxUnits} inhaltlich eigenständige Gedanken/Aussagen im Text — Stellen, an denen jeweils EIN abgeschlossener Gedanke steht (ein bis wenige Sätze), der auch isoliert für sich verständlich ist.

Gib für jeden Gedanken über das Werkzeug save_units zurück:
- quote: ein WÖRTLICHES, zusammenhängendes Zitat aus dem Text — ZEICHENGENAU kopiert (gleiche Groß-/Kleinschreibung, Satzzeichen, Umlaute), keine Umformulierung, keine Auslassungen (…), keine umschließenden Anführungszeichen. Das Zitat MUSS als exakte Teilzeichenkette im gelieferten Text vorkommen.
- gloss: ein sehr kurzes Schlagwort für den Gedanken (wenige Worte, kein ganzer Satz), z. B. "Demut als Vorbedingung fürs Gebet".

Wähle nur Stellen, die für eine spätere Suche wirklich lohnend sind — keine reinen Übergangssätze, keine bloßen Aufzählungen ohne eigenen Gehalt. Ist der Text zu kurz oder zu homogen für mehrere eigenständige Gedanken, gib entsprechend weniger zurück (auch nur einen oder gar keinen).`

const SEGMENT_TOOL = {
  name: 'save_units',
  description: 'Return the distinct, independently meaningful thoughts found in the nugget text, each as a verbatim quote plus a short label.',
  input_schema: {
    type: 'object' as const,
    properties: {
      units: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            quote: { type: 'string' as const, description: 'Verbatim, character-exact substring of the nugget text.' },
            gloss: { type: 'string' as const, description: 'A short label for the thought (a few words, not a sentence).' },
          },
          required: ['quote', 'gloss'],
        },
      },
    },
    required: ['units'],
  },
}

export interface SegmentedUnit {
  quote: string
  gloss: string
  anchor: AnchorToken
}

/** Scales the requested unit count with nugget length — a short note likely IS one thought, a long one may hold many. Mirrors conceptBudget's shape (lib/concepts.ts) but starts from 1, not 3: unlike concepts, a tiny nugget doesn't need to be force-split. */
function unitBudget(wordCount: number): number {
  return Math.min(20, Math.max(1, Math.round(wordCount / 50)))
}

/**
 * Dedicated, narrow LLM call — one small purpose-built prompt, not folded
 * into lib/concepts.ts's already carefully-tuned `save_concepts` call, which
 * mirrors how every lib/insights.ts engine keeps its own focused prompt
 * rather than overloading a shared one. Never throws: a missing API key or a
 * failed call yields an empty result, so a save is never blocked by this.
 */
export async function segmentNuggetProse(nuggetId: string, contentPlain: string): Promise<SegmentedUnit[]> {
  const text = contentPlain.trim()
  if (!text) return []
  if (!process.env.ANTHROPIC_API_KEY) return []

  const wordCount = text.split(/\s+/).length
  const maxUnits = unitBudget(wordCount)
  const system = SEGMENT_SYSTEM_PROMPT.replace('{maxUnits}', String(maxUnits))

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system,
      tools: [SEGMENT_TOOL],
      tool_choice: { type: 'tool', name: 'save_units' },
      messages: [{ role: 'user', content: text }],
    })

    // Segmenting spends budget too — book it on the nugget, like concept extraction and insight locating.
    await prisma.nugget
      .update({
        where: { id: nuggetId },
        data: {
          aiInputTokens: { increment: response.usage.input_tokens },
          aiOutputTokens: { increment: response.usage.output_tokens },
        },
      })
      .catch(() => { /* nugget deleted mid-flight — token booking is best-effort */ })

    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') return []
    const raw = (toolUse.input as { units?: unknown }).units
    if (!Array.isArray(raw)) return []

    const units: SegmentedUnit[] = []
    for (const item of raw.slice(0, maxUnits)) {
      if (!item || typeof item !== 'object') continue
      const quote = (item as { quote?: unknown }).quote
      const gloss = (item as { gloss?: unknown }).gloss
      if (typeof quote !== 'string' || typeof gloss !== 'string') continue
      // Hallucinated or reworded "quotes" are silently dropped, never guessed at —
      // an unresolvable anchor would mean a jump link that lands nowhere useful.
      const anchor = buildAnchor(contentPlain, quote)
      if (!anchor) continue
      units.push({ quote: anchor.quote, gloss: gloss.trim().slice(0, 120), anchor })
    }
    return units
  } catch (error) {
    console.error('[knowledgeUnits] segmentation failed:', describeAiError(error), error)
    return []
  }
}

// ── Mechanical extraction (marks, comments) ──────────────────────────────────

/** One candidate unit before hashing/embedding — the common shape all three kinds normalize into. */
export interface UnitCandidate {
  kind: 'paragraph' | 'mark' | 'comment'
  sourceId: string | null
  color: string | null
  /** "hl" | "ul" for kind="mark" only — ExtractedMark.kind, distinct from this interface's own `kind`; MarkSwatch needs it to render circle vs. bar. */
  markStyle: string | null
  text: string
  gloss: string | null
  quote: string
  prefix: string
  suffix: string
}

function buildParagraphUnits(units: SegmentedUnit[]): UnitCandidate[] {
  return units.map(u => ({
    kind: 'paragraph' as const,
    sourceId: null,
    color: null,
    markStyle: null,
    text: u.quote.slice(0, UNIT_TEXT_MAX),
    gloss: u.gloss,
    quote: u.anchor.quote,
    prefix: u.anchor.prefix,
    suffix: u.anchor.suffix,
  }))
}

/** Thin map over lib/marks.ts's extractMarks — no new anchor logic needed, it already returns a resolvable AnchorToken per merged marking. */
function buildMarkUnits(contentHtml: string): UnitCandidate[] {
  return extractMarks(contentHtml).map(m => ({
    kind: 'mark' as const,
    sourceId: null,
    color: m.color,
    markStyle: m.kind,
    text: m.text,
    gloss: null,
    quote: m.anchor.quote,
    prefix: m.anchor.prefix,
    suffix: m.anchor.suffix,
  }))
}

interface AnnotationSource {
  id: string
  quote: string
  prefix: string
  suffix: string
  body: string
}

/** One unit per non-empty comment — same filter lib/annotations.ts's loadDomainAnnotations already applies. `text` prepends the quoted passage so the unit captures both what it's about and what was said. */
function buildCommentUnits(annotations: AnnotationSource[]): UnitCandidate[] {
  return annotations
    .filter(a => a.body.trim() !== '')
    .map(a => ({
      kind: 'comment' as const,
      sourceId: a.id,
      color: null,
      markStyle: null,
      text: `${a.quote} — ${a.body}`.slice(0, UNIT_TEXT_MAX),
      gloss: null,
      quote: a.quote,
      prefix: a.prefix,
      suffix: a.suffix,
    }))
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** Stable dedup/diff key: comments key off their stable Annotation id (so an edited comment's old row is found by identity, not just by luck of a hash match); paragraphs/marks have no such identity across edits, so kind+hash is the whole key. */
function unitKey(kind: string, sourceId: string | null, contentHash: string): string {
  return kind === 'comment' ? `comment:${sourceId}:${contentHash}` : `${kind}:${contentHash}`
}

// ── Orchestration ─────────────────────────────────────────────────────────────

/** Per-nugget serialization so two overlapping saves of the same nugget can't race and leave a stale reindex clobbering a newer one. */
const inFlight = new Map<string, Promise<void>>()

/**
 * Rebuilds a nugget's KnowledgeUnit rows from its current content. Safe to
 * call after every content-changing save — unchanged chunks (by content
 * hash) are never re-embedded. Never throws: every failure is caught and
 * logged, so a background reindex can never break the save path that
 * triggered it.
 */
export async function reindexNugget(nuggetId: string): Promise<void> {
  const previous = inFlight.get(nuggetId) ?? Promise.resolve()
  const next = previous
    .then(() => doReindex(nuggetId))
    .catch(error => {
      console.error('[knowledgeUnits] reindex failed for', nuggetId, error)
    })
  inFlight.set(nuggetId, next)
  await next
  if (inFlight.get(nuggetId) === next) inFlight.delete(nuggetId)
}

async function doReindex(nuggetId: string): Promise<void> {
  const [nugget, annotations] = await Promise.all([
    prisma.nugget.findUnique({ where: { id: nuggetId }, select: { contentHtml: true, contentPlain: true } }),
    prisma.annotation.findMany({ where: { nuggetId }, select: { id: true, quote: true, prefix: true, suffix: true, body: true } }),
  ])

  if (!nugget) {
    // Nugget gone (a delete raced this reindex) — make sure no stale rows linger; the FK cascade already handles the normal case.
    await prisma.knowledgeUnit.deleteMany({ where: { nuggetId } })
    bumpNearbyIndexVersion()
    return
  }

  const segmented = await segmentNuggetProse(nuggetId, nugget.contentPlain)
  const candidates: UnitCandidate[] = [
    ...buildParagraphUnits(segmented),
    ...buildMarkUnits(nugget.contentHtml),
    ...buildCommentUnits(annotations),
  ]
  // Hash the EMBEDDED text, not the anchor quote: a comment's quote (the
  // anchored passage) stays fixed once created, but its body — which is
  // folded into `text`, not `quote` — is exactly what an edit changes. A
  // quote-only hash would never notice a body edit and leave a stale
  // embedding in place.
  const withHash = candidates.map(c => ({ ...c, contentHash: sha256(c.text) }))

  const existing = await prisma.knowledgeUnit.findMany({
    where: { nuggetId },
    select: { id: true, kind: true, sourceId: true, contentHash: true },
  })
  const existingByKey = new Map(existing.map(row => [unitKey(row.kind, row.sourceId, row.contentHash), row]))

  const toEmbed: (UnitCandidate & { contentHash: string })[] = []
  const keepIds = new Set<string>()
  for (const c of withHash) {
    const match = existingByKey.get(unitKey(c.kind, c.sourceId, c.contentHash))
    if (match) keepIds.add(match.id)
    else toEmbed.push(c)
  }
  const staleIds = existing.filter(e => !keepIds.has(e.id)).map(e => e.id)

  let vectors: Float32Array[] = []
  if (toEmbed.length > 0) {
    try {
      vectors = await embedTexts(toEmbed.map(c => c.text), 'passage')
    } catch (error) {
      // Daemon down/failed — leave the existing rows untouched rather than
      // partially updating (stale-but-consistent beats half-rebuilt).
      console.error('[knowledgeUnits] embedding failed for', nuggetId, error)
      return
    }
  }

  await prisma.$transaction([
    prisma.knowledgeUnit.deleteMany({ where: { id: { in: staleIds } } }),
    ...(toEmbed.length > 0
      ? [
          prisma.knowledgeUnit.createMany({
            data: toEmbed.map((c, i) => ({
              nuggetId,
              kind: c.kind,
              sourceId: c.sourceId,
              color: c.color,
              markStyle: c.markStyle,
              text: c.text,
              gloss: c.gloss,
              quote: c.quote,
              prefix: c.prefix,
              suffix: c.suffix,
              contentHash: c.contentHash,
              embedding: packVector(vectors[i]),
              model: EMBED_MODEL,
              dim: EMBED_DIM,
            })),
          }),
        ]
      : []),
  ])

  bumpNearbyIndexVersion()
}

/** Direct, cheap removal for a single deleted comment — a full reindexNugget would otherwise re-run prose segmentation for no reason (comments have stable identity via sourceId, unlike paragraphs/marks). */
export async function removeCommentUnit(annotationId: string): Promise<void> {
  await prisma.knowledgeUnit.deleteMany({ where: { sourceId: annotationId } })
  bumpNearbyIndexVersion()
}

/**
 * Syncs ONE comment's KnowledgeUnit row after it's created or edited —
 * deliberately NOT a call to reindexNugget: that would re-run
 * segmentNuggetProse's LLM call on every comment save even though the
 * nugget's own text never changed, spending tokens for no reason. Comments
 * have no LLM step at all (see buildCommentUnits), so this only ever costs
 * one local embedding call, and skips even that when the comment's `text`
 * (quote + body) is unchanged.
 */
export async function syncCommentUnit(annotationId: string): Promise<void> {
  const annotation = await prisma.annotation.findUnique({
    where: { id: annotationId },
    select: { id: true, nuggetId: true, quote: true, prefix: true, suffix: true, body: true },
  })
  if (!annotation || !annotation.body.trim()) {
    await removeCommentUnit(annotationId)
    return
  }

  const [candidate] = buildCommentUnits([annotation])
  if (!candidate) {
    await removeCommentUnit(annotationId)
    return
  }
  const contentHash = sha256(candidate.text)

  const existing = await prisma.knowledgeUnit.findFirst({
    where: { sourceId: annotationId, kind: 'comment' },
    select: { id: true, contentHash: true },
  })
  if (existing?.contentHash === contentHash) return // unchanged — nothing to do, no embedding call spent

  let vector: Float32Array
  try {
    const vectors = await embedTexts([candidate.text], 'passage')
    vector = vectors[0]
  } catch (error) {
    console.error('[knowledgeUnits] comment embedding failed for', annotationId, error)
    return
  }

  await prisma.$transaction([
    prisma.knowledgeUnit.deleteMany({ where: { sourceId: annotationId, kind: 'comment' } }),
    prisma.knowledgeUnit.create({
      data: {
        nuggetId: annotation.nuggetId,
        kind: 'comment',
        sourceId: annotationId,
        color: null,
        markStyle: null,
        text: candidate.text,
        gloss: null,
        quote: candidate.quote,
        prefix: candidate.prefix,
        suffix: candidate.suffix,
        contentHash,
        embedding: packVector(vector),
        model: EMBED_MODEL,
        dim: EMBED_DIM,
      },
    }),
  ])
  bumpNearbyIndexVersion()
}
