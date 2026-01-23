/**
 * GET /api/admin/langgraph/graph
 *
 * Returns the graph structure from the database.
 * Uses the dynamic graph builder to fetch nodes from orchestrator_prompts
 * and edges from orchestrator_edges tables.
 */

import type { Env, AuthenticatedRequest } from '../../_middleware'
import { getGraphData } from '../../../lib/graph-builder'

export const onRequestGet: PagesFunction<Env, '', AuthenticatedRequest> = async (context) => {
  const { user } = context.data
  const { DB } = context.env

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const graphData = await getGraphData(DB)
    return Response.json(graphData)
  } catch (error) {
    console.error('Failed to fetch graph data:', error)
    return Response.json(
      { error: 'Failed to fetch graph data' },
      { status: 500 }
    )
  }
}
