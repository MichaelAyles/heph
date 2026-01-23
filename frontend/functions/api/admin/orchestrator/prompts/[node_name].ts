/**
 * Admin Orchestrator Single Prompt API
 * PUT - Update a prompt by node_name
 * DELETE - Delete a prompt by node_name
 */

import type { Env } from '../../../../env.d'

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { env, data, request, params } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined
  const nodeName = params.node_name as string

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (!nodeName) {
    return Response.json({ error: 'node_name parameter required' }, { status: 400 })
  }

  const body = (await request.json()) as {
    displayName?: string
    description?: string
    systemPrompt?: string
    category?: 'agent' | 'generator' | 'reviewer'
    stage?: string | null
    isActive?: boolean
    tokenEstimate?: number
  }

  // Check if prompt exists
  const existing = await env.DB.prepare(
    'SELECT id, version FROM orchestrator_prompts WHERE node_name = ?'
  )
    .bind(nodeName)
    .first<{ id: string; version: number }>()

  if (!existing) {
    return Response.json({ error: 'Prompt not found' }, { status: 404 })
  }

  // Build update query dynamically
  const updates: string[] = []
  const values: (string | number | null)[] = []

  if (body.displayName !== undefined) {
    updates.push('display_name = ?')
    values.push(body.displayName)
  }

  if (body.description !== undefined) {
    updates.push('description = ?')
    values.push(body.description || null)
  }

  if (body.systemPrompt !== undefined) {
    updates.push('system_prompt = ?')
    values.push(body.systemPrompt)

    // Auto-update token estimate if not provided
    if (body.tokenEstimate === undefined) {
      updates.push('token_estimate = ?')
      values.push(Math.ceil(body.systemPrompt.length / 4))
    }
  }

  if (body.category !== undefined) {
    updates.push('category = ?')
    values.push(body.category)
  }

  if (body.stage !== undefined) {
    updates.push('stage = ?')
    values.push(body.stage)
  }

  if (body.isActive !== undefined) {
    updates.push('is_active = ?')
    values.push(body.isActive ? 1 : 0)
  }

  if (body.tokenEstimate !== undefined) {
    updates.push('token_estimate = ?')
    values.push(body.tokenEstimate)
  }

  if (updates.length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Always increment version and update timestamp
  updates.push('version = ?')
  values.push(existing.version + 1)

  updates.push("updated_at = datetime('now')")

  // Add node_name to values for WHERE clause
  values.push(nodeName)

  await env.DB.prepare(
    `UPDATE orchestrator_prompts SET ${updates.join(', ')} WHERE node_name = ?`
  )
    .bind(...values)
    .run()

  return Response.json({ success: true, version: existing.version + 1 })
}

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined
  const nodeName = params.node_name as string

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (!nodeName) {
    return Response.json({ error: 'node_name parameter required' }, { status: 400 })
  }

  // Check if prompt exists
  const existing = await env.DB.prepare(
    'SELECT id FROM orchestrator_prompts WHERE node_name = ?'
  )
    .bind(nodeName)
    .first()

  if (!existing) {
    return Response.json({ error: 'Prompt not found' }, { status: 404 })
  }

  await env.DB.prepare('DELETE FROM orchestrator_prompts WHERE node_name = ?')
    .bind(nodeName)
    .run()

  return Response.json({ success: true })
}
