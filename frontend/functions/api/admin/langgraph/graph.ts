/**
 * GET /api/admin/langgraph/graph
 *
 * Returns the code-defined graph structure for visualization.
 * The new subgraph architecture defines graphs in code, not in the database.
 */

import type { Env, AuthenticatedRequest } from '../../_middleware'
import { getCodeDefinedGraphData, type CodeDefinedGraphData } from '../../../lib/graph-builder'

export const onRequestGet: PagesFunction<Env, '', AuthenticatedRequest> = async (context) => {
  const { user } = context.data

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const graphData: CodeDefinedGraphData = getCodeDefinedGraphData()
    return Response.json(graphData)
  } catch (error) {
    console.error('Failed to fetch graph data:', error)
    return Response.json({ error: 'Failed to fetch graph data' }, { status: 500 })
  }
}
