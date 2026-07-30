import { NextRequest, NextResponse } from 'next/server'
import { loadDomainMarks } from '@/lib/marks'

// GET /api/marks?domain=<slug>
//
// Public read (consistent with /api/nuggets, /api/concepts, /api/insights/feed —
// none of these are owner-gated; marks are readable content like the rest).
// `domain` is optional; omitted means "every domain". Response is the
// `DomainMarks` shape from lib/marks.ts — never raw contentHtml.
//
// Facet/search filtering (by colour, by meaning, by text) happens CLIENT-SIDE
// against this one payload rather than re-fetching per tap: a domain's marks
// are already fully loaded, so a second round trip per facet click would only
// add latency for no benefit.
export async function GET(req: NextRequest) {
  const domainSlug = new URL(req.url).searchParams.get('domain')?.trim() || null
  const result = await loadDomainMarks(domainSlug)
  return NextResponse.json(result)
}
