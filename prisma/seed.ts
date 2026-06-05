import { prisma } from '../lib/prisma'

/** Seeds the 4 default domains. Safe to re-run (upsert). */
async function main() {
  const domains = [
    { slug: 'faith',    name: 'Glaube & Bibel',      icon: '✝️' },
    { slug: 'business', name: 'Business & Technik',   icon: '⚙️' },
    { slug: 'health',   name: 'Gesundheit & Fitness', icon: '🏃' },
    { slug: 'books',    name: 'Bücher & Ideen',       icon: '📚' },
  ]

  for (const d of domains) {
    await prisma.domain.upsert({
      where: { slug: d.slug },
      update: {},
      create: d,
    })
  }
  console.log('✓ Domains seeded')
}

main().catch(console.error).finally(() => prisma.$disconnect())
