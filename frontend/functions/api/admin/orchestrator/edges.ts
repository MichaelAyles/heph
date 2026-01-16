/**
 * Admin Orchestrator Edges API
 * List and manage orchestrator flow edges
 */

import type { Env } from '../../../env'
import type { OrchestratorEdgeRow } from '../../../../src/db/schema'

// =============================================================================
// GET /api/admin/orchestrator/edges - List all edges
// =============================================================================

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const url = new URL(context.request.url)
  const edgeType = url.searchParams.get('type')
  const activeOnly = url.searchParams.get('active') === 'true'

  let query = 'SELECT * FROM orchestrator_edges WHERE 1=1'
  const params: (string | number)[] = []

  if (edgeType && edgeType !== 'all') {
    query += ' AND edge_type = ?'
    params.push(edgeType)
  }

  if (activeOnly) {
    query += ' AND is_active = 1'
  }

  query += ' ORDER BY priority DESC, from_node, to_node'

  const stmt = env.DB.prepare(query)
  const result = await (params.length > 0 ? stmt.bind(...params) : stmt).all<OrchestratorEdgeRow>()

  // Transform to camelCase
  const edges = result.results.map((row) => ({
    id: row.id,
    fromNode: row.from_node,
    toNode: row.to_node,
    condition: row.condition ? JSON.parse(row.condition) : null,
    edgeType: row.edge_type,
    priority: row.priority,
    description: row.description,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  return Response.json({ edges })
}

// =============================================================================
// POST /api/admin/orchestrator/edges - Create new edge
// =============================================================================

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data, request } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json() as {
    fromNode: string
    toNode: string
    condition?: Record<string, unknown>
    edgeType?: string
    priority?: number
    description?: string
  }

  if (!body.fromNode || !body.toNode) {
    return Response.json({ error: 'fromNode and toNode are required' }, { status: 400 })
  }

  // Check for duplicate edge
  const existing = await env.DB.prepare('SELECT id FROM orchestrator_edges WHERE from_node = ? AND to_node = ?')
    .bind(body.fromNode, body.toNode)
    .first()

  if (existing) {
    return Response.json({ error: 'An edge between these nodes already exists' }, { status: 409 })
  }

  const result = await env.DB.prepare(`
    INSERT INTO orchestrator_edges (from_node, to_node, condition, edge_type, priority, description)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING id
  `)
    .bind(
      body.fromNode,
      body.toNode,
      body.condition ? JSON.stringify(body.condition) : null,
      body.edgeType || 'flow',
      body.priority || 0,
      body.description || null
    )
    .first<{ id: string }>()

  return Response.json({ success: true, id: result?.id })
}

// =============================================================================
// PUT /api/admin/orchestrator/edges - Update edge by ID (in body)
// =============================================================================

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { env, data, request } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json() as {
    id: string
    condition?: Record<string, unknown> | null
    edgeType?: string
    priority?: number
    description?: string | null
    isActive?: boolean
  }

  if (!body.id) {
    return Response.json({ error: 'id is required' }, { status: 400 })
  }

  // Build update query
  const updates: string[] = []
  const values: (string | number | null)[] = []

  if (body.condition !== undefined) {
    updates.push('condition = ?')
    values.push(body.condition ? JSON.stringify(body.condition) : null)
  }
  if (body.edgeType !== undefined) {
    updates.push('edge_type = ?')
    values.push(body.edgeType)
  }
  if (body.priority !== undefined) {
    updates.push('priority = ?')
    values.push(body.priority)
  }
  if (body.description !== undefined) {
    updates.push('description = ?')
    values.push(body.description)
  }
  if (body.isActive !== undefined) {
    updates.push('is_active = ?')
    values.push(body.isActive ? 1 : 0)
  }

  if (updates.length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  updates.push("updated_at = datetime('now')")
  values.push(body.id)

  const result = await env.DB.prepare(`UPDATE orchestrator_edges SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run()

  if (result.meta.changes === 0) {
    return Response.json({ error: 'Edge not found' }, { status: 404 })
  }

  return Response.json({ success: true })
}

// =============================================================================
// DELETE /api/admin/orchestrator/edges?id=xxx
// =============================================================================

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const url = new URL(context.request.url)
  const id = url.searchParams.get('id')

  if (!id) {
    return Response.json({ error: 'id query parameter is required' }, { status: 400 })
  }

  const result = await env.DB.prepare('DELETE FROM orchestrator_edges WHERE id = ?')
    .bind(id)
    .run()

  if (result.meta.changes === 0) {
    return Response.json({ error: 'Edge not found' }, { status: 404 })
  }

  return Response.json({ success: true })
}
