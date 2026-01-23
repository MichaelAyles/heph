/**
 * Admin Orchestrator Edges API
 * GET - List all orchestrator edges
 * POST - Create a new edge
 */

import type { Env } from '../../../env.d'

interface EdgeRow {
  id: string
  from_node: string
  to_node: string
  edge_type: 'flow' | 'conditional' | 'loop'
  condition: string | null
  priority: number
  description: string | null
  is_active: number
  created_at: string
  updated_at: string
}

interface TransformedEdge {
  id: number | string
  fromNode: string
  toNode: string
  edgeType: 'flow' | 'conditional' | 'loop'
  condition: string | null
  priority: number
  description: string | null
  isActive: boolean
}

function transformEdge(row: EdgeRow): TransformedEdge {
  return {
    id: row.id,
    fromNode: row.from_node,
    toNode: row.to_node,
    edgeType: row.edge_type,
    condition: row.condition,
    priority: row.priority,
    description: row.description,
    isActive: row.is_active === 1,
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const result = await env.DB.prepare(
    `SELECT id, from_node, to_node, edge_type, condition, priority,
            description, is_active, created_at, updated_at
     FROM orchestrator_edges
     ORDER BY from_node, priority, to_node`
  ).all<EdgeRow>()

  const edges = (result.results || []).map(transformEdge)

  return Response.json({ edges })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data, request } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = (await request.json()) as {
    from_node: string
    to_node: string
    edge_type?: 'flow' | 'conditional' | 'loop'
    condition?: string | null
    priority?: number
    description?: string | null
  }

  if (!body.from_node || !body.to_node) {
    return Response.json(
      { error: 'from_node and to_node are required' },
      { status: 400 }
    )
  }

  // Check if edge already exists
  const existing = await env.DB.prepare(
    'SELECT id FROM orchestrator_edges WHERE from_node = ? AND to_node = ?'
  )
    .bind(body.from_node, body.to_node)
    .first()

  if (existing) {
    return Response.json(
      { error: 'An edge from this node to that node already exists' },
      { status: 409 }
    )
  }

  const id = crypto.randomUUID().replace(/-/g, '').toLowerCase()

  await env.DB.prepare(
    `INSERT INTO orchestrator_edges
     (id, from_node, to_node, edge_type, condition, priority, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.from_node,
      body.to_node,
      body.edge_type || 'flow',
      body.condition || null,
      body.priority || 0,
      body.description || null
    )
    .run()

  return Response.json({ success: true, id })
}
