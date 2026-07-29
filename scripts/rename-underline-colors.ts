/**
 * One-off migration for the underline-palette redesign (`lib/marking.ts`):
 * the old UNDERLINE_PALETTE colours "red" and "teal" were replaced by "pink"
 * and "yellow" so both palettes share the same 6 paired names. This renames
 * any already-marked content so it keeps rendering with the new palette:
 *
 *   <u data-color="red">   → <u data-color="pink">   (contentHtml)
 *   <u data-color="teal">  → <u data-color="blue">   (contentHtml)
 *   markScheme key "ul:red"  → "ul:pink"  (custom label preserved)
 *   markScheme key "ul:teal" → "ul:blue"  (custom label preserved)
 *
 * Safe by default: prints a per-nugget plan and does NOT write unless --apply
 * is passed. Aborts a nugget's markScheme rename (whole run still reports it)
 * if the target key already holds a DIFFERENT label than the source — that
 * needs a manual look, not a silent overwrite.
 *
 * Run on the server (DATABASE_URL from .env):
 *   cd ~/nuggets.jomaar.de && set -a && source .env && set +a \
 *     && npx tsx scripts/rename-underline-colors.ts          # dry run
 *     && npx tsx scripts/rename-underline-colors.ts --apply  # writes
 */
import { prisma } from '../lib/prisma'

const HTML_RENAMES: [from: string, to: string][] = [
  ['<u data-color="red"', '<u data-color="pink"'],
  ['<u data-color="teal"', '<u data-color="blue"'],
]
const SCHEME_RENAMES: [from: string, to: string][] = [
  ['ul:red', 'ul:pink'],
  ['ul:teal', 'ul:blue'],
]

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const nuggets = await prisma.nugget.findMany({
    where: {
      OR: [
        { contentHtml: { contains: 'data-color="red"' } },
        { contentHtml: { contains: 'data-color="teal"' } },
        { markScheme: { contains: 'ul:red' } },
        { markScheme: { contains: 'ul:teal' } },
      ],
    },
    select: { id: true, title: true, contentHtml: true, markScheme: true },
  })
  console.log(`${nuggets.length} nugget(s) affected.${apply ? '' : ' (dry run — pass --apply to write)'}\n`)

  for (const nugget of nuggets) {
    console.log(`→ ${nugget.title || nugget.id}`)
    let html = nugget.contentHtml
    for (const [from, to] of HTML_RENAMES) {
      const count = html.split(from).length - 1
      if (count > 0) console.log(`  contentHtml: ${count}× "${from}" → "${to}"`)
      html = html.split(from).join(to)
    }

    let schemeText = nugget.markScheme
    if (schemeText) {
      const scheme = JSON.parse(schemeText) as Record<string, string>
      let blocked = false
      for (const [from, to] of SCHEME_RENAMES) {
        if (!(from in scheme)) continue
        if (to in scheme && scheme[to] !== scheme[from]) {
          console.log(`  markScheme: SKIPPED "${from}" → "${to}" — target already holds a different label ("${scheme[to]}" vs "${scheme[from]}"), resolve manually`)
          blocked = true
          continue
        }
        console.log(`  markScheme: "${from}": "${scheme[from]}" → "${to}"`)
        scheme[to] = scheme[from]
        delete scheme[from]
      }
      if (!blocked) schemeText = JSON.stringify(scheme)
    }

    if (apply) {
      await prisma.nugget.update({
        where: { id: nugget.id },
        data: { contentHtml: html, markScheme: schemeText },
      })
    }
  }

  console.log(apply ? '\nDone.' : '\nDry run only — nothing written.')
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
