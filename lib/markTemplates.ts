/**
 * Marking templates — reusable naming schemes for the 12 (style, colour) slots.
 *
 * The colour→dimension frame is fixed in code (MARK_DIMENSIONS in lib/marking.ts);
 * a template only specializes the LABELS inside that frame for a text genre.
 * Applying one copies its `scheme` into `Nugget.markScheme`, so no rendering path
 * ever has to resolve a template — the stored `markTemplateId` exists purely so
 * the markings popup can show the template's name and its long-form glossary.
 *
 * Storage mirrors `Nugget.tags` / `Nugget.markScheme`: JSON strings in SQLite,
 * parsed at the edge. Both maps are validated with `sanitizeMarkScheme`, which
 * already enforces "known markKeys only, non-empty trimmed strings".
 */
import { prisma } from './prisma'
import { sanitizeMarkScheme, type MarkScheme } from './marking'

/** A template as the client consumes it — JSON columns already parsed. */
export interface MarkTemplateView {
  id: string
  name: string
  description: string
  /** markKey → short label (what lands in the nugget's markScheme). */
  scheme: MarkScheme
  /** markKey → long explanation, shown in the popup's glossary panel. */
  glossary: MarkScheme
  builtIn: boolean
  sortOrder: number
}

/** Longest accepted template name / description (labels are capped separately). */
export const TEMPLATE_NAME_MAX = 40
export const TEMPLATE_DESCRIPTION_MAX = 200

/** Row shape as stored, before the JSON columns are parsed. */
interface MarkTemplateRow {
  id: string
  name: string
  description: string
  scheme: string
  glossary: string
  builtIn: boolean
  sortOrder: number
}

/**
 * Parse a stored row into its client shape. Tolerant like `parseMarkScheme`:
 * malformed JSON degrades to an empty map rather than throwing, so one bad row
 * can never take down the whole list.
 */
export function toTemplateView(row: MarkTemplateRow): MarkTemplateView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    scheme: parseJsonScheme(row.scheme),
    glossary: parseJsonScheme(row.glossary),
    builtIn: row.builtIn,
    sortOrder: row.sortOrder,
  }
}

function parseJsonScheme(json: string): MarkScheme {
  try {
    return sanitizeMarkScheme(JSON.parse(json)) ?? {}
  } catch {
    return {}
  }
}

const TEMPLATE_SELECT = {
  id: true,
  name: true,
  description: true,
  scheme: true,
  glossary: true,
  builtIn: true,
  sortOrder: true,
} as const

/** All templates, built-ins first, then by name. */
export async function listMarkTemplates(): Promise<MarkTemplateView[]> {
  const rows = await prisma.markTemplate.findMany({
    select: TEMPLATE_SELECT,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  return rows.map(toTemplateView)
}

export { TEMPLATE_SELECT }
