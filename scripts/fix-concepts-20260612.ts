/**
 * One-time data fix (2026-06-12): resolves the three anti-pattern concepts
 * that survived the granularity re-extraction, and appends the granularity
 * rule to the faith domain prompt. Idempotent — skips whatever is already done.
 *
 *   1. SPLIT  "Nachfolge-Metaphorik vs. Teilhabe-Metaphorik"
 *             → edges to "In Christus sein" (the Teilhabe side, exists)
 *               AND a new node "Nachfolge" (ἀκολουθέω); notes carry the contrast.
 *   2. MERGE  "Christusgemäß statt bibelgemäß" → "Christologische Schriftauslegung"
 *   3. MERGE  "Ambivalenz biblischer Begründung" → "Schriftgebrauch und Schriftautorität"
 *   4. APPEND concept-granularity rule to Domain(faith).domainPrompt
 *
 * Run on the server:
 *   cd ~/nuggets.jomaar.de && set -a && source .env && set +a \
 *     && npx tsx scripts/fix-concepts-20260612.ts
 */
import { prisma } from '../lib/prisma'

/** Finds a concept by one of its label terms (exact match), or null. */
async function conceptByTerm(term: string) {
  const label = await prisma.conceptLabel.findFirst({
    where: { term },
    include: { concept: true },
  })
  return label?.concept ?? null
}

/** Joins two edge notes into one, dropping empties. */
function combineNotes(a: string | null, b: string | null): string | null {
  return [a, b].filter(Boolean).join(' · ') || null
}

/**
 * Moves every edge of `fromTerm`'s concept onto `toTerm`'s concept, then
 * deletes the source node. When a nugget already links to the target, the
 * notes are combined and the higher relevance wins (unique key nuggetId+conceptId).
 */
async function mergeConcept(fromTerm: string, toTerm: string): Promise<void> {
  const from = await conceptByTerm(fromTerm)
  if (!from) {
    console.log(`skip merge "${fromTerm}" — not found (already merged?)`)
    return
  }
  const to = await conceptByTerm(toTerm)
  if (!to) throw new Error(`merge target "${toTerm}" not found`)

  const edges = await prisma.nuggetConcept.findMany({ where: { conceptId: from.id } })
  for (const edge of edges) {
    const existing = await prisma.nuggetConcept.findUnique({
      where: { nuggetId_conceptId: { nuggetId: edge.nuggetId, conceptId: to.id } },
    })
    if (existing) {
      await prisma.nuggetConcept.update({
        where: { nuggetId_conceptId: { nuggetId: edge.nuggetId, conceptId: to.id } },
        data: {
          note: combineNotes(existing.note, edge.note),
          relevance: Math.max(existing.relevance, edge.relevance),
        },
      })
      await prisma.nuggetConcept.delete({
        where: { nuggetId_conceptId: { nuggetId: edge.nuggetId, conceptId: from.id } },
      })
    } else {
      await prisma.nuggetConcept.update({
        where: { nuggetId_conceptId: { nuggetId: edge.nuggetId, conceptId: from.id } },
        data: { conceptId: to.id },
      })
    }
  }
  await prisma.concept.delete({ where: { id: from.id } })
  console.log(`merged "${fromTerm}" → "${toTerm}" (${edges.length} edge(s))`)
}

/**
 * Splits the "X vs. Y" node: every linked nugget gets an edge to BOTH sides
 * (Teilhabe = existing "In Christus sein", Nachfolge = new node), each
 * carrying the original note (the contrast). Then deletes the vs-node.
 */
async function splitNachfolgeVsTeilhabe(): Promise<void> {
  const from = await conceptByTerm('Nachfolge-Metaphorik vs. Teilhabe-Metaphorik')
  if (!from) {
    console.log('skip split — vs-concept not found (already split?)')
    return
  }
  const teilhabe = await conceptByTerm('In Christus sein')
  if (!teilhabe) throw new Error('split target "In Christus sein" not found')

  // "Teilhabe" as an extra label improves future NEL matching onto this node.
  await prisma.conceptLabel.upsert({
    where: { conceptId_language_term: { conceptId: teilhabe.id, language: 'de', term: 'Teilhabe' } },
    update: {},
    create: { conceptId: teilhabe.id, language: 'de', term: 'Teilhabe' },
  })

  let nachfolge = await conceptByTerm('Nachfolge')
  if (!nachfolge) {
    nachfolge = await prisma.concept.create({
      data: {
        description: 'Discipleship — following Jesus (ἀκολουθέω); the synoptic, pre-Easter mode of relating to Christ.',
        labels: {
          create: [
            { language: 'de', term: 'Nachfolge' },
            { language: 'el', term: 'ἀκολουθέω' },
          ],
        },
      },
    })
    console.log('created concept "Nachfolge" (ἀκολουθέω)')
  }

  const edges = await prisma.nuggetConcept.findMany({ where: { conceptId: from.id } })
  for (const edge of edges) {
    for (const target of [teilhabe, nachfolge]) {
      const existing = await prisma.nuggetConcept.findUnique({
        where: { nuggetId_conceptId: { nuggetId: edge.nuggetId, conceptId: target.id } },
      })
      if (existing) {
        await prisma.nuggetConcept.update({
          where: { nuggetId_conceptId: { nuggetId: edge.nuggetId, conceptId: target.id } },
          data: {
            note: combineNotes(existing.note, edge.note),
            relevance: Math.max(existing.relevance, edge.relevance),
          },
        })
      } else {
        await prisma.nuggetConcept.create({
          data: { nuggetId: edge.nuggetId, conceptId: target.id, relevance: edge.relevance, note: edge.note },
        })
      }
    }
  }
  await prisma.concept.delete({ where: { id: from.id } }) // cascades its edges
  console.log(`split "Nachfolge-Metaphorik vs. Teilhabe-Metaphorik" → "In Christus sein" + "Nachfolge" (${edges.length} nugget(s))`)
}

/** Appends the concept-granularity rule to the faith domain prompt (once). */
async function appendFaithGranularityRule(): Promise<void> {
  const ADDITION = `CONCEPT GRANULARITY (graph nodes): valid concept nodes for this domain are lexemes (Greek/Hebrew terms), biblical books and texts, persons, and established theologumena (e.g. Kreuzestheologie, Rechtfertigung). Interpretations and readings ("X als Y"), contrasts ("X vs. Y"), and applications are NEVER nodes — they belong in the connection note.`

  const domain = await prisma.domain.findUnique({ where: { slug: 'faith' } })
  if (!domain) throw new Error('faith domain not found')
  if (domain.domainPrompt?.includes('CONCEPT GRANULARITY')) {
    console.log('skip faith prompt — granularity rule already present')
    return
  }
  await prisma.domain.update({
    where: { slug: 'faith' },
    data: { domainPrompt: `${domain.domainPrompt ?? ''}\n\n${ADDITION}`.trim() },
  })
  console.log('appended granularity rule to faith domainPrompt')
}

/** Runs all four fixes in order and prints the resulting graph size. */
async function main(): Promise<void> {
  await splitNachfolgeVsTeilhabe()
  await mergeConcept('Christusgemäß statt bibelgemäß', 'Christologische Schriftauslegung')
  await mergeConcept('Ambivalenz biblischer Begründung', 'Schriftgebrauch und Schriftautorität')
  await appendFaithGranularityRule()

  const concepts = await prisma.concept.count()
  const edges = await prisma.nuggetConcept.count()
  console.log(`\nDone: ${concepts} concept(s), ${edges} edge(s) in the graph.`)
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
