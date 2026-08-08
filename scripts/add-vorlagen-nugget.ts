/**
 * One-off: creates the "Markierungs-Vorlagen" learning nugget from a Markdown
 * file, mirroring what POST /api/nuggets does (normalizeToHtml → htmlToMarkdown
 * → htmlToPlain), but WITHOUT the AI concept extraction (title/tags are set by
 * hand here, so there is nothing for the extractor to fill in).
 *
 *   DATABASE_URL="file:$(pwd)/prisma/dev.db" npx tsx scripts/tmp-add-nugget.ts <file.md> [--dry]
 */
import { readFileSync } from 'fs'
import { prisma } from '../lib/prisma'
import { normalizeToHtml, htmlToMarkdown, htmlToPlain } from '../lib/content'
import { MARK_DIMENSIONS, markKey } from '../lib/marking'

const TITLE = 'Markierungs-Vorlagen: Exegese · Position · Bibeltext'
const TAGS = ['Markierungen', 'Vorlagen', 'Methode', 'Denkspuren']
const DOMAIN_SLUG = 'faith'

/**
 * The nugget documents the fixed colour→dimension frame, so its own scheme is
 * exactly that frame (no template applied — the legend pill stays "Keine
 * Vorlage", which is honest: these are the dimension names, not a genre's
 * wording). Labels stay within the 7-character swatch cap.
 */
const UL_LABELS: Record<string, string> = {
  yellow: 'Wort',
  orange: 'Verweis',
  pink: 'Nicht',
  green: 'Gebot',
  blue: 'Logik',
  purple: 'Frage',
}

function buildScheme(): Record<string, string> {
  const scheme: Record<string, string> = {}
  for (const d of MARK_DIMENSIONS) {
    scheme[markKey('hl', d.color)] = d.name
    scheme[markKey('ul', d.color)] = UL_LABELS[d.color]
  }
  return scheme
}

async function main(): Promise<void> {
  const file = process.argv[2]
  const dry = process.argv.includes('--dry')
  if (!file) throw new Error('usage: tmp-add-nugget.ts <file.md> [--dry]')

  const markdown = readFileSync(file, 'utf8')
  const contentHtml = normalizeToHtml(markdown)
  const contentMarkdown = htmlToMarkdown(contentHtml)
  const contentPlain = htmlToPlain(contentHtml)
  const markScheme = JSON.stringify(buildScheme())

  const domain = await prisma.domain.findUnique({ where: { slug: DOMAIN_SLUG } })
  if (!domain) throw new Error(`domain "${DOMAIN_SLUG}" not found`)

  console.log('--- contentHtml ---\n' + contentHtml)
  console.log('\n--- marks: ' + (contentHtml.match(/<mark |<u data-color/g) ?? []).length)
  console.log('--- mermaid blocks: ' + (contentHtml.match(/language-mermaid/g) ?? []).length)
  console.log('--- tables: ' + (contentHtml.match(/<table>/g) ?? []).length)
  console.log('--- plain chars: ' + contentPlain.length)

  if (dry) {
    console.log('\n[dry run — nothing written]')
    return
  }

  const nugget = await prisma.nugget.create({
    data: {
      title: TITLE,
      contentHtml,
      contentMarkdown,
      contentPlain,
      tags: JSON.stringify(TAGS),
      markScheme,
      domainId: domain.id,
    },
  })
  console.log(`\nCreated nugget ${nugget.id}`)
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
