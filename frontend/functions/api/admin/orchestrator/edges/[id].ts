/**
 * Admin Orchestrator Single Edge API
 * DELETE - Delete an edge by id
 * PUT - Update an edge by id
 */

import type { Env } from '../../../../env.d'

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined
  const edgeId = params.id as string

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (!edgeId) {
    return Response.json({ error: 'edge id parameter required' }, { status: 400 })
  }

  // Check if edge exists
  const existing = await env.DB.prepare(
    'SELECT id FROM orchestrator_edges WHERE id = ?'
  )
    .bind(edgeId)
    .first()

  if (!existing) {
    return Response.json({ error: 'Edge not found' }, { status: 404 })
  }

  await env.DB.prepare('DELETE FROM orchestrator_edges WHERE id = ?')
    .bind(edgeId)
    .run()

  return Response.json({ success: true })
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { env, data, request, params } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined
  const edgeId = params.id as string

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (!edgeId) {
    return Response.json({ error: 'edge id parameter required' }, { status: 400 })
  }

  const body = (await request.json()) as {
    edge_type?: 'flow' | 'conditional' | 'loop'
    condition?: string | null
    priority?: number
    description?: string | null
    is_active?: boolean
  }

  // Check if edge exists
  const existing = await env.DB.prepare(
    'SELECT id FROM orchestrator_edges WHERE id = ?'
  )
    .bind(edgeId)
    .first()

  if (!existing) {
    return Response.json({ error: 'Edge not found' }, { status: 404 })
  }

  // Build update query dynamically
  const updates: string[] = []
  const values: (string | number | null)[] = []

  if (body.edge_type !== undefined) {
    updates.push('edge_type = ?')
    values.push(body.edge_type)
  }

  if (body.condition !== undefined) {
    updates.push('condition = ?')
    values.push(body.condition)
  }

  if (body.priority !== undefined) {
    updates.push('priority = ?')
    values.push(body.priority)
  }

  if (body.description !== undefined) {
    updates.push('description = ?')
    values.push(body.description)
  }

  if (body.is_active !== undefined) {
    updates.push('is_active = ?')
    values.push(body.is_active ? 1 : 0)
  }

  if (updates.length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Always update timestamp
  updates.push("updated_at = datetime('now')")

  // Add id to values for WHERE clause
  values.push(edgeId)

  await env.DB.prepare(
    `UPDATE orchestrator_edges SET ${updates.join(', ')} WHERE id = ?`
  )
    .bind(...values)
    .run()

  return Response.json({ success: true })
}
