/**
 * Shows or sets Domain.domainPrompt (the per-domain addition to the AI
 * extraction system prompt). Stop-gap until the Session-B admin UI exists —
 * usable over SSH when Prisma Studio is out of reach.
 *
 * Usage (on the server, .env sourced):
 *   npx tsx scripts/set-domain-prompt.ts                  # list all domains + prompts
 *   npx tsx scripts/set-domain-prompt.ts <slug>           # show one domain's prompt
 *   npx tsx scripts/set-domain-prompt.ts <slug> "<text>"  # set it
 *   npx tsx scripts/set-domain-prompt.ts <slug> ""        # clear it
 */
import { prisma } from '../lib/prisma'

async function main(): Promise<void> {
  const [slug, prompt] = process.argv.slice(2)

  if (!slug) {
    const domains = await prisma.domain.findMany({ orderBy: { slug: 'asc' } })
    for (const d of domains)
      console.log(`${d.slug} (${d.name}):\n  ${d.domainPrompt ?? '— no prompt —'}\n`)
    return
  }

  const domain = await prisma.domain.findUnique({ where: { slug } })
  if (!domain) {
    console.error(`No domain with slug "${slug}"`)
    process.exitCode = 1
    return
  }

  if (prompt === undefined) {
    console.log(domain.domainPrompt ?? '— no prompt —')
    return
  }

  await prisma.domain.update({
    where: { slug },
    data: { domainPrompt: prompt.trim() || null },
  })
  console.log(`Updated domainPrompt for ${slug}.`)
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
