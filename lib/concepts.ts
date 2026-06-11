import { prisma } from './prisma'
import { anthropic } from './anthropic'
import { normalizeToHtml, htmlToPlain } from './content'

const SYSTEM_PROMPT = `You are a knowledge graph assistant for a personal knowledge management app.
The user writes notes in German, English, or sometimes includes Greek/Hebrew theological terms.

Your task: analyze a new note, give it a title, link it to concepts, suggest tags, and extract URLs if present.

THE CORE PRINCIPLE — concepts are ABSTRACT, REUSABLE NODES, not statements about the note:
- A concept is a single, general, reusable idea that could plausibly recur across MANY unrelated notes.
- A concept is essentially a noun or named entity: "Logos", "Glaube", "Kreuzestheologie", "Hebräerbrief", "Demut".
- A concept is NEVER an interpretation, claim, or sentence about this note. It must not contain the note's specific spin.
  - WRONG (too specific, a statement): "Logos als Sprach- und Ausdrucksfähigkeit", "Glaube als Voraussetzung für Gotteserkenntnis"
  - RIGHT (abstract node): "Logos", "Glaube"
- Ask yourself: "Could a completely different note, on a different day, about a different source, legitimately point to this exact same node?" If no, it is too specific — generalize it.
- What THIS note specifically says about a concept does NOT belong in the concept. It belongs in the connection's "note" field (see below).

NAMED-ENTITY-LINKING — strongly prefer reusing existing concepts:
- You receive the list of concepts already in the graph. Default to MATCHING an existing concept.
- Only mint a NEW concept when no existing node genuinely covers the idea. When unsure, match rather than create.
- Match across languages (ἀγάπη = Liebe = Love = the same concept node).
- Greek terms ἀγάπη, φιλία, ἔρως are DISTINCT concepts — never merge different Greek words.

The connection "note" field (for both matched and new concepts):
- One short phrase capturing what THIS note specifically says about the concept — its particular reading, angle, or claim.
- This is where the specificity goes. Example: concept "Logos" + note "read as the human capacity for speech and self-expression".
- Same language as the note. Keep it to a clause, not a paragraph.

Other rules:
- Title: one short line (max 80 chars), in the same language as the note, capturing the core idea
- Tags: 2–4 short keywords in the note's language (e.g. "Gebet", "Motivation", "Leadership")
- sourceUrl: extract only if a URL is explicitly present in the note text — otherwise omit
- sourceLabel: short human-readable name for the source (e.g. "YouTube", "Wikipedia", "Buch", domain name)
- Only link concepts CENTRAL to the text — not briefly mentioned (minimum relevance: 0.3)
- Relevance scale: 1.0 = main topic, 0.7 = important supporting idea, 0.3 = briefly mentioned
- A note covering several distinct topics should link to several distinct abstract concepts, each with its own note
- Description (new concepts only): one concise, language-neutral sentence defining the concept itself (NOT this note's take) — also disambiguates homonyms
- Labels: detect the language of each term and tag it ("de", "en", "el" for Greek, "he" for Hebrew)`

const REVISION_PROMPT = `

Additionally, revise the note's content and return it as "revisedContent" (Markdown, same language as the note):
- Eliminate redundancy and conversational artifacts (questions, repetitions) without losing information
- Restructure for clarity (headings, paragraphs, lists where helpful)
- Shorten without information loss
- Preserve technical terms, direct quotes, and source references verbatim`

interface ExtractionOptions {
  domainId?: string | null
  reviseContent?: boolean
  /**
   * Optional per-note instruction from the user (Phase 5c). Steers how Claude
   * revises/condenses/filters THIS note (e.g. length limits, keep only certain
   * points). Passed as a high-priority system-prompt addition, never stored.
   */
  aiHint?: string
}

interface ExistingConceptsArg {
  id: string
  description: string
  labels: { language: string; term: string }[]
}

interface ClauseResult {
  title: string
  tags: string[]
  sourceUrl?: string
  sourceLabel?: string
  revisedContent?: string
  existingConcepts: { id: string; relevance: number; note?: string }[]
  newConcepts: {
    description: string
    labels: { language: string; term: string }[]
    relevance: number
    note?: string
  }[]
}

/**
 * Calls Claude to generate a title, extract concepts, optionally revise the content,
 * and link concepts to the nugget. Never throws — failures are logged but do not affect the nugget.
 */
export async function extractAndLinkConcepts(nuggetId: string, text: string, options: ExtractionOptions = {}): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[concepts] ANTHROPIC_API_KEY not set — skipping extraction')
    return
  }
  if (!text.trim()) return

  const { domainId, reviseContent, aiHint } = options

  try {
    const [existing, domain, settings] = await Promise.all([
      prisma.concept.findMany({
        include: { labels: { select: { language: true, term: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      domainId
        ? prisma.domain.findUnique({ where: { id: domainId }, select: { domainPrompt: true } })
        : Promise.resolve(null),
      prisma.appSettings.findUnique({ where: { id: 'global' }, select: { globalPromptAddition: true } }),
    ])

    const existingForPrompt: ExistingConceptsArg[] = existing.map(c => ({
      id: c.id,
      description: c.description,
      labels: c.labels,
    }))

    const userMessage = existing.length > 0
      ? `Existing concepts in the knowledge graph:\n${JSON.stringify(existingForPrompt, null, 2)}\n\nNew note to analyze:\n"${text}"`
      : `No existing concepts yet.\n\nNew note to analyze:\n"${text}"`

    let systemPrompt = SYSTEM_PROMPT
    if (settings?.globalPromptAddition) systemPrompt += `\n\n${settings.globalPromptAddition}`
    if (domain?.domainPrompt) systemPrompt += `\n\n${domain.domainPrompt}`
    if (reviseContent) systemPrompt += REVISION_PROMPT
    // Per-note user instruction (Phase 5c) — appended last and framed as the
    // top-priority directive. Models otherwise tend to treat it as just one
    // more hint among the revision/domain/global rules and under-apply it, so
    // we state the override explicitly. The one thing it must NOT override is
    // the structural output contract (the save_concepts tool + its required
    // fields) — that interface has to stay stable regardless of what the user
    // writes, otherwise the response can't be parsed.
    if (aiHint?.trim())
      systemPrompt += `\n\nADDITIONAL INSTRUCTION FROM THE USER for THIS specific note. This instruction has the HIGHEST PRIORITY: it OVERRIDES every other content instruction above (the revision rules, the domain prompt and the global addition) wherever they conflict. Treat it as the primary directive when revising, condensing or filtering the content, and strictly honor any length or content limits it states — even if that contradicts the generic rules. The ONLY thing it may NOT change is the structural output contract: you must still return your result through the save_concepts tool with all of its required fields. User instruction: ${aiHint.trim()}`

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      system: systemPrompt,
      tools: [
        {
          name: 'save_concepts',
          description: 'Save the title, extracted concepts, and matched concepts for this note.',
          input_schema: {
            type: 'object' as const,
            properties: {
              title: {
                type: 'string',
                description: 'Short title summarizing the note (max 80 chars, same language as note)',
              },
              tags: {
                type: 'array',
                description: '2–4 short keyword tags in the note\'s language',
                items: { type: 'string' },
              },
              sourceUrl: {
                type: 'string',
                description: 'URL found verbatim in the note text — omit if no URL present',
              },
              sourceLabel: {
                type: 'string',
                description: 'Short human-readable source name (YouTube, Wikipedia, domain, …)',
              },
              revisedContent: {
                type: 'string',
                description: 'Revised, restructured Markdown version of the note — only include if content revision was requested in the instructions',
              },
              existingConcepts: {
                type: 'array',
                description: 'Existing concepts from the list that apply to this note.',
                items: {
                  type: 'object',
                  properties: {
                    id:        { type: 'string', description: 'Exact ID from the existing list' },
                    relevance: { type: 'number', description: '0.3–1.0' },
                    note:      { type: 'string', description: 'Short phrase: what THIS note specifically says about the concept (same language as note)' },
                  },
                  required: ['id', 'relevance'],
                },
              },
              newConcepts: {
                type: 'array',
                description: 'New concepts not yet in the graph.',
                items: {
                  type: 'object',
                  properties: {
                    description: { type: 'string', description: 'One concise language-neutral sentence' },
                    labels: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          language: { type: 'string', description: 'ISO code: de, en, el, he, …' },
                          term:     { type: 'string' },
                        },
                        required: ['language', 'term'],
                      },
                    },
                    relevance: { type: 'number', description: '0.3–1.0' },
                    note:      { type: 'string', description: 'Short phrase: what THIS note specifically says about the concept (same language as note)' },
                  },
                  required: ['description', 'labels', 'relevance'],
                },
              },
            },
            required: ['title', 'tags', 'existingConcepts', 'newConcepts'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'save_concepts' },
      messages: [{ role: 'user', content: userMessage }],
    })

    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') return

    const result = toolUse.input as ClauseResult

    // Persist token usage
    await prisma.nugget.update({
      where: { id: nuggetId },
      data: {
        aiInputTokens:  { increment: response.usage.input_tokens },
        aiOutputTokens: { increment: response.usage.output_tokens },
      },
    })

    // Update title, tags, and source URL (only fields not already set by the user)
    const nugget = await prisma.nugget.findUnique({
      where: { id: nuggetId },
      select: { title: true, tags: true, sourceUrl: true },
    })
    if (nugget) {
      const patch: Record<string, unknown> = {}
      if (result.title && !nugget.title)
        patch.title = result.title
      if (result.tags?.length && nugget.tags === '[]')
        patch.tags = JSON.stringify(result.tags)
      if (result.sourceUrl && !nugget.sourceUrl) {
        patch.sourceUrl = result.sourceUrl
        if (result.sourceLabel) patch.sourceLabel = result.sourceLabel
      }
      if (reviseContent && result.revisedContent?.trim()) {
        const contentHtml = normalizeToHtml(result.revisedContent)
        patch.contentMarkdown = result.revisedContent
        patch.contentHtml     = contentHtml
        patch.contentPlain    = htmlToPlain(contentHtml)
      }
      if (Object.keys(patch).length > 0)
        await prisma.nugget.update({ where: { id: nuggetId }, data: patch })
    }

    // Link existing concepts
    for (const { id, relevance, note } of result.existingConcepts ?? []) {
      if (!existing.find(c => c.id === id)) continue
      await prisma.nuggetConcept.upsert({
        where: { nuggetId_conceptId: { nuggetId, conceptId: id } },
        update: { relevance, note: note ?? null },
        create: { nuggetId, conceptId: id, relevance, note: note ?? null },
      })
    }

    // Create new concepts and link them
    for (const nc of result.newConcepts ?? []) {
      const concept = await prisma.concept.create({
        data: {
          description: nc.description,
          labels: {
            create: nc.labels.map(l => ({ language: l.language, term: l.term })),
          },
        },
      })
      await prisma.nuggetConcept.create({
        data: { nuggetId, conceptId: concept.id, relevance: nc.relevance, note: nc.note ?? null },
      })
    }

    console.log(`[concepts] nugget ${nuggetId}: title="${result.title}", tags=${JSON.stringify(result.tags)}, ${result.existingConcepts?.length ?? 0} matched, ${result.newConcepts?.length ?? 0} new`)
  } catch (err) {
    console.error('[concepts] extraction failed:', err)
  }
}
