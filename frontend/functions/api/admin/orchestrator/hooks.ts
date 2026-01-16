/**
 * Admin Orchestrator Hooks API
 * List and manage orchestrator lifecycle hooks
 */

import type { Env } from '../../../env'
import type { OrchestratorHookRow } from '@/db/schema'

// =============================================================================
// GET /api/admin/orchestrator/hooks - List all hooks
// =============================================================================

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const url = new URL(context.request.url)
  const nodeName = url.searchParams.get('node')
  const hookType = url.searchParams.get('type')
  const activeOnly = url.searchParams.get('active') === 'true'

  let query = 'SELECT * FROM orchestrator_hooks WHERE 1=1'
  const params: (string | number)[] = []

  if (nodeName) {
    query += ' AND (node_name = ? OR node_name = ?)'
    params.push(nodeName, '*')  // Include wildcard hooks
  }

  if (hookType && hookType !== 'all') {
    query += ' AND hook_type = ?'
    params.push(hookType)
  }

  if (activeOnly) {
    query += ' AND is_active = 1'
  }

  query += ' ORDER BY priority DESC, node_name, hook_type'

  const stmt = env.DB.prepare(query)
  const result = await (params.length > 0 ? stmt.bind(...params) : stmt).all<OrchestratorHookRow>()

  // Transform to camelCase
  const hooks = result.results.map((row) => ({
    id: row.id,
    nodeName: row.node_name,
    hookType: row.hook_type,
    hookFunction: row.hook_function,
    hookConfig: row.hook_config ? JSON.parse(row.hook_config) : null,
    priority: row.priority,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  return Response.json({ hooks })
}

// =============================================================================
// POST /api/admin/orchestrator/hooks - Create new hook
// =============================================================================

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data, request } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json() as {
    nodeName: string
    hookType: string
    hookFunction: string
    hookConfig?: Record<string, unknown>
    priority?: number
  }

  if (!body.nodeName || !body.hookType || !body.hookFunction) {
    return Response.json({ error: 'nodeName, hookType, and hookFunction are required' }, { status: 400 })
  }

  // Validate hook type
  const validHookTypes = ['on_enter', 'on_exit', 'on_result', 'on_error']
  if (!validHookTypes.includes(body.hookType)) {
    return Response.json({ error: `hookType must be one of: ${validHookTypes.join(', ')}` }, { status: 400 })
  }

  // Check for duplicate hook
  const existing = await env.DB.prepare(
    'SELECT id FROM orchestrator_hooks WHERE node_name = ? AND hook_type = ? AND hook_function = ?'
  )
    .bind(body.nodeName, body.hookType, body.hookFunction)
    .first()

  if (existing) {
    return Response.json({ error: 'This hook already exists for this node' }, { status: 409 })
  }

  const result = await env.DB.prepare(`
    INSERT INTO orchestrator_hooks (node_name, hook_type, hook_function, hook_config, priority)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `)
    .bind(
      body.nodeName,
      body.hookType,
      body.hookFunction,
      body.hookConfig ? JSON.stringify(body.hookConfig) : null,
      body.priority || 0
    )
    .first<{ id: string }>()

  return Response.json({ success: true, id: result?.id })
}

// =============================================================================
// PUT /api/admin/orchestrator/hooks - Update hook by ID (in body)
// =============================================================================

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { env, data, request } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json() as {
    id: string
    hookConfig?: Record<string, unknown> | null
    priority?: number
    isActive?: boolean
  }

  if (!body.id) {
    return Response.json({ error: 'id is required' }, { status: 400 })
  }

  // Build update query
  const updates: string[] = []
  const values: (string | number | null)[] = []

  if (body.hookConfig !== undefined) {
    updates.push('hook_config = ?')
    values.push(body.hookConfig ? JSON.stringify(body.hookConfig) : null)
  }
  if (body.priority !== undefined) {
    updates.push('priority = ?')
    values.push(body.priority)
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

  const result = await env.DB.prepare(`UPDATE orchestrator_hooks SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run()

  if (result.meta.changes === 0) {
    return Response.json({ error: 'Hook not found' }, { status: 404 })
  }

  return Response.json({ success: true })
}

// =============================================================================
// DELETE /api/admin/orchestrator/hooks?id=xxx
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

  const result = await env.DB.prepare('DELETE FROM orchestrator_hooks WHERE id = ?')
    .bind(id)
    .run()

  if (result.meta.changes === 0) {
    return Response.json({ error: 'Hook not found' }, { status: 404 })
  }

  return Response.json({ success: true })
}
