/**
 * Re-runs concept extraction for nuggets — all of them by default, or only
 * the nugget ids passed as arguments.
 *
 * Per nugget, sequentially:
 *   1. delete its existing concept edges (the old, too-fine extraction),
 *   2. sweep concepts that thereby became orphans (so they stop polluting
 *      the "existing concepts" list fed into the prompt),
 *   3. extract fresh via lib/concepts.ts (budget + anti-pattern rules).
 *
 * Content, highlights, and bookmarks are untouched — extraction never
 * rewrites content (no reviseContent) and only fills title/tags/sourceUrl
 * when they are still empty, which they are not for existing nuggets.
 *
 * Run on the server (needs ANTHROPIC_API_KEY + DATABASE_URL from .env):
 *   cd ~/nuggets.jomaar.de && set -a && source .env && set +a \
 *     && npx tsx scripts/reextract-concepts.ts [nuggetId …]
 */
import { prisma } from '../lib/prisma'
import { extractAndLinkConcepts } from '../lib/concepts'

async function main(): Promise<void> {
  const ids = process.argv.slice(2)
  const nuggets = await prisma.nugget.findMany({
    where: ids.length > 0 ? { id: { in: ids } } : undefined,
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, contentMarkdown: true, domainId: true },
  })
  console.log(`Re-extracting concepts for ${nuggets.length} nugget(s)…`)

  for (const nugget of nuggets) {
    console.log(`\n→ ${nugget.title || nugget.id}`)
    if (!nugget.contentMarkdown.trim()) {
      console.log('  skipped: empty contentMarkdown')
      continue
    }
    await prisma.nuggetConcept.deleteMany({ where: { nuggetId: nugget.id } })
    const orphans = await prisma.concept.deleteMany({ where: { nuggets: { none: {} } } })
    if (orphans.count > 0) console.log(`  swept ${orphans.count} orphaned concept(s)`)
    const result = await extractAndLinkConcepts(nugget.id, nugget.contentMarkdown, { domainId: nugget.domainId })
    if (result.ok && result.warning) console.log(`  ⚠ ${result.warning}`)
  }

  const conceptCount = await prisma.concept.count()
  const edgeCount = await prisma.nuggetConcept.count()
  console.log(`\nDone: ${conceptCount} concept(s), ${edgeCount} edge(s) in the graph.`)
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
