/**
 * One-time maintenance: deletes concepts that have no edge to any nugget.
 * Orphans accumulated because nugget deletion used to cascade only the edges
 * (fixed in app/api/nuggets/[id]/route.ts, which now sweeps after DELETE).
 *
 * Run on the server:
 *   cd ~/nuggets.jomaar.de && set -a && source .env && set +a \
 *     && npx tsx scripts/cleanup-orphan-concepts.ts
 */
import { prisma } from '../lib/prisma'

async function main(): Promise<void> {
  const total = await prisma.concept.count()
  const { count } = await prisma.concept.deleteMany({ where: { nuggets: { none: {} } } })
  console.log(`Deleted ${count} orphaned concept(s); ${total - count} concept(s) remain.`)
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
