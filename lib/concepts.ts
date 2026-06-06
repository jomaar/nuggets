import { prisma } from './prisma'
import { anthropic } from './anthropic'

const SYSTEM_PROMPT = `You are a knowledge graph assistant for a personal knowledge management app.
The user writes notes in German, English, or sometimes includes Greek/Hebrew theological terms.

Your task: analyze a new note, give it a title, extract concepts, suggest tags, and extract URLs if present.

Rules:
- Title: one short line (max 80 chars), in the same language as the note, capturing the core idea
- Tags: 2–4 short keywords in the note's language (e.g. "Gebet", "Motivation", "Leadership")
- sourceUrl: extract only if a URL is explicitly present in the note text — otherwise omit
- sourceLabel: short human-readable name for the source (e.g. "YouTube", "Wikipedia", "Buch", domain name)
- Only include concepts CENTRAL to the text — not briefly mentioned (minimum relevance: 0.3)
- Relevance scale: 1.0 = main topic, 0.7 = important supporting idea, 0.3 = briefly mentioned
- Match existing concepts even across languages (ἀγάπη = Liebe = Love = same concept)
- Greek terms ἀγάπη, φιλία, ἔρως are DISTINCT concepts — never merge different Greek words
- Create new concepts only for ideas genuinely absent from the existing list
- Description: one concise language-neutral sentence explaining the concept
- Labels: detect the language of each term and tag it ("de", "en", "el" for Greek, "he" for Hebrew)`

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
  existingConcepts: { id: string; relevance: number }[]
  newConcepts: {
    description: string
    labels: { language: string; term: string }[]
    relevance: number
  }[]
}

/**
 * Calls Claude to generate a title, extract concepts, and link them to the nugget.
 * Never throws — failures are logged but do not affect the nugget.
 */
export async function extractAndLinkConcepts(nuggetId: string, text: string): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[concepts] ANTHROPIC_API_KEY not set — skipping extraction')
    return
  }
  if (!text.trim()) return

  try {
    const existing = await prisma.concept.findMany({
      include: { labels: { select: { language: true, term: true } } },
      orderBy: { createdAt: 'asc' },
    })

    const existingForPrompt: ExistingConceptsArg[] = existing.map(c => ({
      id: c.id,
      description: c.description,
      labels: c.labels,
    }))

    const userMessage = existing.length > 0
      ? `Existing concepts in the knowledge graph:\n${JSON.stringify(existingForPrompt, null, 2)}\n\nNew note to analyze:\n"${text}"`
      : `No existing concepts yet.\n\nNew note to analyze:\n"${text}"`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
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
              existingConcepts: {
                type: 'array',
                description: 'Existing concepts from the list that apply to this note.',
                items: {
                  type: 'object',
                  properties: {
                    id:        { type: 'string', description: 'Exact ID from the existing list' },
                    relevance: { type: 'number', description: '0.3–1.0' },
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
      if (Object.keys(patch).length > 0)
        await prisma.nugget.update({ where: { id: nuggetId }, data: patch })
    }

    // Link existing concepts
    for (const { id, relevance } of result.existingConcepts ?? []) {
      if (!existing.find(c => c.id === id)) continue
      await prisma.nuggetConcept.upsert({
        where: { nuggetId_conceptId: { nuggetId, conceptId: id } },
        update: { relevance },
        create: { nuggetId, conceptId: id, relevance },
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
        data: { nuggetId, conceptId: concept.id, relevance: nc.relevance },
      })
    }

    console.log(`[concepts] nugget ${nuggetId}: title="${result.title}", tags=${JSON.stringify(result.tags)}, ${result.existingConcepts?.length ?? 0} matched, ${result.newConcepts?.length ?? 0} new`)
  } catch (err) {
    console.error('[concepts] extraction failed:', err)
  }
}
