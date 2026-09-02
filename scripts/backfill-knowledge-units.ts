/**
 * One-time (or re-run-after-model-change) indexer for the Spinnennetz
 * "Naheliegendes" feature: builds KnowledgeUnit rows for every nugget in the
 * corpus — all of them by default, or only the nugget ids passed as
 * arguments. Safe to re-run: reindexNugget diffs by content hash and only
 * re-embeds what actually changed, so running this twice in a row costs
 * (almost) nothing the second time.
 *
 * Requires the embedding daemon (python/embed_server.py) to already be
 * running locally — reindexNugget degrades gracefully (logs, skips) if it
 * isn't reachable, so a failed run just leaves that nugget unindexed rather
 * than crashing the whole backfill.
 *
 * After a model change (EMBED_MODEL bumped in lib/embeddings.ts), re-run
 * this in full (no ids) — old-model rows are filtered out at query time
 * (see lib/nearbyIndex.ts) but otherwise linger until re-embedded.
 *
 * Run on the server (needs ANTHROPIC_API_KEY + DATABASE_URL from .env):
 *   cd ~/nuggets.jomaar.de && set -a && source .env && set +a \
 *     && npx tsx scripts/backfill-knowledge-units.ts [nuggetId …]
 */
import { prisma } from '../lib/prisma'
import { reindexNugget } from '../lib/knowledgeUnits'

async function main(): Promise<void> {
  const ids = process.argv.slice(2)
  const nuggets = await prisma.nugget.findMany({
    where: ids.length > 0 ? { id: { in: ids } } : undefined,
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true },
  })
  console.log(`Indexing ${nuggets.length} nugget(s)…`)

  for (const nugget of nuggets) {
    console.log(`→ ${nugget.title || nugget.id}`)
    await reindexNugget(nugget.id)
  }

  const unitCount = await prisma.knowledgeUnit.count()
  const byKind = await prisma.knowledgeUnit.groupBy({ by: ['kind'], _count: true })
  console.log(`\nDone: ${unitCount} knowledge unit(s) indexed.`)
  for (const row of byKind) console.log(`  ${row.kind}: ${row._count}`)
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
