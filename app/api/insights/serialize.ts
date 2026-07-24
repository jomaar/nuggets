import type { Insight } from '@prisma/client'

export interface InsightRefs {
  conceptIds: string[]
  nuggetIds: string[]
}

export interface SerializedInsight {
  id: string
  kind: string
  status: string
  title: string
  body: string
  anchorConceptId: string | null
  refs: InsightRefs
  createdAt: Date
}

/**
 * Shapes an Insight row for the API: parses the `refs` JSON string into an object
 * (tolerant of malformed data) and drops server-only fields (inputHash, model,
 * token counts). Mirrors how the app parses `tags`/`markScheme` before shipping.
 */
export function serializeInsight(insight: Insight): SerializedInsight {
  let refs: InsightRefs = { conceptIds: [], nuggetIds: [] }
  try {
    const parsed = JSON.parse(insight.refs)
    refs = {
      conceptIds: Array.isArray(parsed?.conceptIds) ? parsed.conceptIds : [],
      nuggetIds: Array.isArray(parsed?.nuggetIds) ? parsed.nuggetIds : [],
    }
  } catch {
    /* keep the empty default */
  }
  return {
    id: insight.id,
    kind: insight.kind,
    status: insight.status,
    title: insight.title,
    body: insight.body,
    anchorConceptId: insight.anchorConceptId,
    refs,
    createdAt: insight.createdAt,
  }
}
