/**
 * Maintenance: deletes bookmarks, annotations and concept edges whose nugget
 * no longer exists, then sweeps concepts left without any edge.
 *
 * Such orphans can NOT come from the app (the schema cascades on delete and
 * PRAGMA foreign_keys is enforced at runtime) — they appear when a nugget is
 * deleted PAST the app, e.g. via the sqlite3 CLI on the server, where
 * foreign_keys defaults to OFF and ON DELETE CASCADE is inert.
 *
 * Run on the server:
 *   cd ~/nuggets.jomaar.de && set -a && source .env && set +a \
 *     && npx tsx scripts/cleanup-orphan-anchors.ts
 */
import { prisma } from '../lib/prisma'

/**
 * Deletes rows from `table` whose nuggetId is not in `livingIds`.
 * The models have no optional relation to filter on (`nugget: null` is not
 * expressible for a required relation), so the diff is computed in JS —
 * fine at this data size, and it keeps the project's no-raw-SQL rule.
 */
async function main(): Promise<void> {
  const livingIds = new Set(
    (await prisma.nugget.findMany({ select: { id: true } })).map(n => n.id),
  )

  const bookmarks = await prisma.bookmark.findMany({ select: { id: true, nuggetId: true } })
  const orphanBookmarkIds = bookmarks.filter(b => !livingIds.has(b.nuggetId)).map(b => b.id)
  const deletedBookmarks = await prisma.bookmark.deleteMany({
    where: { id: { in: orphanBookmarkIds } },
  })

  const annotations = await prisma.annotation.findMany({ select: { id: true, nuggetId: true } })
  const orphanAnnotationIds = annotations.filter(a => !livingIds.has(a.nuggetId)).map(a => a.id)
  const deletedAnnotations = await prisma.annotation.deleteMany({
    where: { id: { in: orphanAnnotationIds } },
  })

  // NuggetConcept has a composite key — delete by orphaned nuggetId instead.
  const edges = await prisma.nuggetConcept.findMany({ select: { nuggetId: true } })
  const orphanEdgeNuggetIds = [
    ...new Set(edges.map(e => e.nuggetId).filter(id => !livingIds.has(id))),
  ]
  const deletedEdges = await prisma.nuggetConcept.deleteMany({
    where: { nuggetId: { in: orphanEdgeNuggetIds } },
  })

  // Removing orphan edges can leave concepts without any edge — sweep those
  // too, exactly like the app's DELETE route does.
  const deletedConcepts = await prisma.concept.deleteMany({ where: { nuggets: { none: {} } } })

  console.log(
    `Deleted ${deletedBookmarks.count} bookmark(s), ${deletedAnnotations.count} annotation(s), ` +
    `${deletedEdges.count} concept edge(s), ${deletedConcepts.count} orphaned concept(s).`,
  )
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
