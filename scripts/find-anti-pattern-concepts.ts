/**
 * READ-ONLY audit: scans every Concept's labels for the same anti-patterns
 * lib/concepts.ts now flags on new extractions (attribution-suffix, "vs."
 * contrasts), printing offenders with linked nugget titles for manual
 * cleanup. Never writes.
 *
 * Run on the server (or locally against tmp/prod_snapshot.db):
 *   npx tsx scripts/find-anti-pattern-concepts.ts
 */
import { prisma } from '../lib/prisma'
import { detectAntiPatternLabels } from '../lib/concepts'

async function main(): Promise<void> {
  const concepts = await prisma.concept.findMany({
    include: {
      labels: { select: { term: true } },
      nuggets: { include: { nugget: { select: { title: true } } } },
    },
  })
  let flaggedCount = 0
  for (const c of concepts) {
    const flagged = detectAntiPatternLabels(c.labels.map(l => l.term))
    if (flagged.length === 0) continue
    flaggedCount++
    const nuggetTitles = c.nuggets.map(nc => nc.nugget.title || '(ohne Titel)').join(', ')
    console.log(`${c.id}  ${flagged.join(' / ')}\n  nuggets: ${nuggetTitles}`)
  }
  console.log(`\n${flaggedCount} concept(s) flagged out of ${concepts.length}.`)
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
