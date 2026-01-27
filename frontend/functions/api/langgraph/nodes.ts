/**
 * LangGraph Nodes List API
 *
 * GET /api/langgraph/nodes
 *
 * Returns a list of all registered LangGraph nodes with their metadata.
 */

import type { Env } from '../../env'
import { getAllNodeMetadata } from '../../../src/services/langgraph/nodes'

interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin: boolean
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { data } = context
  const user = data.user as User | undefined

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get all node metadata
  const nodes = getAllNodeMetadata()

  return Response.json({
    nodes,
    count: nodes.length,
  })
}
