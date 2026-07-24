import { NextResponse } from 'next/server'
import { detectConceptCommunities } from '@/lib/conceptCommunities'

/**
 * GET /api/concepts/communities — the theme-map assignment for the Konzept-Wolke.
 *
 * Runs the SAME community detection the theme insight engine uses (Louvain over the
 * derived concept↔concept cosine graph, compute-on-read — nothing stored), but here
 * only to COLOUR the concept cloud, so it returns just the assignment, not any AI.
 * Communities come largest-first; the client colours each chip by its community
 * index and labels the legend with the lead term.
 *
 * Concepts below MIN_COMMUNITY_SIZE carry no theme and are simply absent here → the
 * client renders them neutral (honest: only real themes get a colour).
 */
export async function GET() {
  const { communities } = await detectConceptCommunities()
  const payload = communities.map(community => ({
    lead: { id: community.lead.conceptId, term: community.lead.term },
    conceptIds: community.members.map(member => member.conceptId),
  }))
  return NextResponse.json({ communities: payload })
}
