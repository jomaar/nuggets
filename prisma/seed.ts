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

  await seedMarkTemplates()
}

/**
 * Seeds the 3 built-in marking templates. Safe to re-run (upsert on `name`).
 *
 * All three sit on the SAME colour→dimension frame (MARK_DIMENSIONS in
 * lib/marking.ts) — only the wording specializes per text genre, so the reader's
 * muscle memory carries across templates and Denkspuren can bucket by dimension
 * corpus-wide. Labels are ≤ 6 characters on purpose: `.swatch-label` in
 * globals.css caps at 2rem / 8.5px with ellipsis, and the BubbleMenu must still
 * fit 6 cells plus the ✕ / comment / share / AI buttons on a 375px iPhone. The
 * long-form meaning lives in `glossary`, shown in the popup's glossary panel.
 *
 * Like `domainPrompt` above, an existing template is NOT overwritten — the owner
 * can rename slots via "Als Vorlage speichern" and a redeploy must not wipe that.
 */
async function seedMarkTemplates() {
  const templates = [
    {
      name: 'Exegese',
      description: 'Sekundärtext und Analyse erschließen — der Standardfall.',
      sortOrder: 1,
      slots: {
        'hl:yellow': ['Kern', 'Kernaussage / These des Textes.'],
        'hl:orange': ['Grund', 'Beleg, Parallelstelle, Wortbedeutung.'],
        'hl:pink': ['Gegen', 'Abgrenzung: was gerade nicht gemeint ist.'],
        'hl:green': ['Gilt', 'Der Positiv-Pol: was der Text bejaht.'],
        'hl:blue': ['Aufbau', 'Denkbewegung, Gliederung, Blaupause.'],
        'hl:purple': ['Ich', 'Eigener Gedanke, Hypothese.'],
        'ul:yellow': ['Wort', 'Lexem oder Leitwort, um das es geht.'],
        'ul:orange': ['Zitat', 'Zitat- und Verweisformel.'],
        'ul:pink': ['Nicht', 'οὐ, μή, ἀλλά, „nicht … sondern".'],
        'ul:green': ['Gebot', 'Imperativ, Aufforderung.'],
        'ul:blue': ['Logik', 'γάρ, οὖν, δέ, „deshalb", „wenn".'],
        'ul:purple': ['Frage', 'Unklar, zu prüfen.'],
      },
    },
    {
      name: 'Position',
      description: 'Debatte und Sekundärliteratur — konkurrierende Positionen.',
      sortOrder: 2,
      slots: {
        'hl:yellow': ['These', 'Kernthese dieser Position.'],
        'hl:orange': ['Beleg', 'Quelle, Nachweis, Textbasis.'],
        'hl:pink': ['Einwand', 'Gegenargument, Kritikpunkt.'],
        'hl:green': ['Stütze', 'Stützendes Argument.'],
        'hl:blue': ['Aufbau', 'Argumentationsgang.'],
        'hl:purple': ['Urteil', 'Eigene Bewertung.'],
        'ul:yellow': ['Begriff', 'Der strittige Terminus.'],
        'ul:orange': ['Autor', 'Vertreter der Position.'],
        'ul:pink': ['Nicht', 'Verneinung, Abgrenzungsformel.'],
        'ul:green': ['Folgt', 'Konsequenz, „daraus folgt".'],
        'ul:blue': ['Wenn', 'Prämisse, Bedingung.'],
        'ul:purple': ['Prüfen', 'Zu verifizieren.'],
      },
    },
    {
      name: 'Bibeltext',
      description: 'Primärtext lesen — Bibelbuch oder Abschnitt.',
      sortOrder: 3,
      slots: {
        'hl:yellow': ['Kern', 'Zentralaussage des Abschnitts.'],
        'hl:orange': ['Grund', 'Begründung, Schriftbezug.'],
        'hl:pink': ['Warnung', 'Warnung, Gericht, Unheilsansage.'],
        'hl:green': ['Zusage', 'Verheißung, Zuspruch, Heilsansage.'],
        'hl:blue': ['Aufbau', 'Gliederung, Erzählschritt, Wendepunkt.'],
        'hl:purple': ['Ich', 'Eigene Beobachtung.'],
        'ul:yellow': ['Wort', 'Leitwort oder Wortfeld im Abschnitt.'],
        'ul:orange': ['Zitat', 'Schriftzitat, Verweisformel.'],
        'ul:pink': ['Nicht', 'Verneinung, Gegensatz.'],
        'ul:green': ['Gebot', 'Imperativ, Mahnung.'],
        'ul:blue': ['Logik', 'οὖν, γάρ, δέ, „deshalb".'],
        'ul:purple': ['Frage', 'Unklar, zu prüfen.'],
      },
    },
  ]

  for (const t of templates) {
    const scheme: Record<string, string> = {}
    const glossary: Record<string, string> = {}
    for (const [key, [label, gloss]] of Object.entries(t.slots)) {
      scheme[key] = label
      glossary[key] = gloss
    }
    await prisma.markTemplate.upsert({
      where: { name: t.name },
      update: {}, // never clobber owner edits
      create: {
        name: t.name,
        description: t.description,
        sortOrder: t.sortOrder,
        builtIn: true,
        scheme: JSON.stringify(scheme),
        glossary: JSON.stringify(glossary),
      },
    })
  }
  console.log('✓ Mark templates seeded')
}

main().catch(console.error).finally(() => prisma.$disconnect())
