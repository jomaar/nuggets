import { prisma } from '../lib/prisma'

/**
 * Seeds the 4 default domains. Safe to re-run (upsert).
 *
 * - `icon` is a Lucide key (see DOMAIN_ICON_REGISTRY in components/DomainIcon.tsx),
 *   NOT an emoji — it drives app-wide icon rendering.
 * - `color` is the domain's accent hex.
 * icon/color are (re)applied on every run so a DB that was seeded with the old
 * emoji icons / no colour self-heals. Once Session B adds an admin UI for
 * icon/colour, switch these to the same "don't overwrite admin edits" guard
 * that `domainPrompt` already uses below.
 *
 * domainPrompt is only ever set as a default for new/empty domains — never overwrites
 * a prompt the admin has since customized via /admin (which would otherwise be wiped on every deploy).
 */
async function main() {
  const domains = [
    {
      slug: 'faith', name: 'Glaube & Bibel', icon: 'Cross', color: '#CA8A04',
      domainPrompt: 'This domain covers biblical theology and exegesis. Greek terms (ἀγάπη, φιλία, ἔρως, '
        + 'λόγος etc.) are DISTINCT concepts — never merge them. Hebrew terms should be '
        + 'transliterated. Distinguish NT from OT usage carefully.',
    },
    {
      slug: 'business', name: 'Business & Technik', icon: 'Briefcase', color: '#2563EB',
      domainPrompt: 'This domain covers business, technology, and IoT. Focus on practical frameworks, '
        + 'processes, and technical concepts. Distinguish between strategy and implementation.',
    },
    {
      slug: 'health', name: 'Gesundheit & Fitness', icon: 'HeartPulse', color: '#DC2626',
      domainPrompt: 'This domain covers health, fitness, and nutrition. Prefer evidence-based concepts. '
        + 'Distinguish between mental and physical health topics.',
    },
    {
      slug: 'books', name: 'Bücher & Ideen', icon: 'BookOpen', color: '#7C3AED',
      domainPrompt: 'This domain covers book notes, philosophy, and general knowledge. Capture the '
        + "author's core argument and key concepts. Note direct quotes explicitly.",
    },
  ]

  for (const d of domains) {
    const existing = await prisma.domain.findUnique({ where: { slug: d.slug }, select: { domainPrompt: true } })
    await prisma.domain.upsert({
      where: { slug: d.slug },
      // icon/color always refreshed; domainPrompt preserved if the admin edited it.
      update: { icon: d.icon, color: d.color, ...(existing?.domainPrompt ? {} : { domainPrompt: d.domainPrompt }) },
      create: d,
    })
  }
  console.log('✓ Domains seeded')
}

main().catch(console.error).finally(() => prisma.$disconnect())
