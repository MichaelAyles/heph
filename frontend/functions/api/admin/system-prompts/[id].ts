/**
 * Admin System Prompts - Individual Prompt Operations
 *
 * GET    /api/admin/system-prompts/:id - Get prompt by ID
 * PUT    /api/admin/system-prompts/:id - Update prompt
 * DELETE /api/admin/system-prompts/:id - Delete prompt
 */

import type { Env } from '../../../env.d'
import { createLogger } from '../../../lib/logger'

interface PagesFunction<E> {
  (context: {
    request: Request
    env: E
    params: Record<string, string>
    data: Record<string, unknown>
  }): Promise<Response>
}

interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin?: boolean
}

interface SystemPromptRow {
  id: number
  name: string
  description: string | null
  capability_assessment_base: string
  design_constraints: string | null
  cad_capability: string | null
  firmware_capability: string | null
  is_active: number
  version: number
  created_at: string
  updated_at: string
}

interface SystemPrompt {
  id: number
  name: string
  description: string | null
  capabilityAssessmentBase: string
  designConstraints: string | null
  cadCapability: string | null
  firmwareCapability: string | null
  isActive: boolean
  version: number
  createdAt: string
  updatedAt: string
}

function rowToPrompt(row: SystemPromptRow): SystemPrompt {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    capabilityAssessmentBase: row.capability_assessment_base,
    designConstraints: row.design_constraints,
    cadCapability: row.cad_capability,
    firmwareCapability: row.firmware_capability,
    isActive: row.is_active === 1,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// =============================================================================
// GET - Get prompt by ID
// =============================================================================

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)
  const id = parseInt(params.id, 10)

  // Admin check
  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (isNaN(id)) {
    return Response.json({ error: 'Invalid prompt ID' }, { status: 400 })
  }

  try {
    const row = await env.DB.prepare('SELECT * FROM system_prompts WHERE id = ?')
      .bind(id)
      .first<SystemPromptRow>()

    if (!row) {
      return Response.json({ error: 'Prompt not found' }, { status: 404 })
    }

    await logger.debug('api', 'System prompt retrieved', { id })

    return Response.json({ prompt: rowToPrompt(row) })
  } catch (error) {
    await logger.error('api', 'Failed to get system prompt', { error: String(error), id })
    return Response.json({ error: 'Failed to get prompt' }, { status: 500 })
  }
}

// =============================================================================
// PUT - Update prompt
// =============================================================================

interface UpdatePromptRequest {
  name?: string
  description?: string | null
  capabilityAssessmentBase?: string
  designConstraints?: string | null
  cadCapability?: string | null
  firmwareCapability?: string | null
  isActive?: boolean
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)
  const id = parseInt(params.id, 10)

  // Admin check
  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (isNaN(id)) {
    return Response.json({ error: 'Invalid prompt ID' }, { status: 400 })
  }

  try {
    const body = (await context.request.json()) as UpdatePromptRequest

    // Check prompt exists
    const existing = await env.DB.prepare('SELECT * FROM system_prompts WHERE id = ?')
      .bind(id)
      .first<SystemPromptRow>()

    if (!existing) {
      return Response.json({ error: 'Prompt not found' }, { status: 404 })
    }

    // Check for duplicate name if changing
    if (body.name && body.name !== existing.name) {
      const duplicate = await env.DB.prepare(
        'SELECT id FROM system_prompts WHERE name = ? AND id != ?'
      )
        .bind(body.name, id)
        .first()

      if (duplicate) {
        return Response.json({ error: 'A prompt with this name already exists' }, { status: 409 })
      }
    }

    // If activating this prompt, deactivate others
    if (body.isActive === true && existing.is_active === 0) {
      await env.DB.prepare('UPDATE system_prompts SET is_active = 0 WHERE id != ?')
        .bind(id)
        .run()
    }

    const now = new Date().toISOString()
    const newVersion = existing.version + 1

    await env.DB.prepare(
      `UPDATE system_prompts
       SET name = ?, description = ?, capability_assessment_base = ?,
           design_constraints = ?, cad_capability = ?, firmware_capability = ?,
           is_active = ?, version = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(
        body.name ?? existing.name,
        body.description !== undefined ? body.description : existing.description,
        body.capabilityAssessmentBase ?? existing.capability_assessment_base,
        body.designConstraints !== undefined ? body.designConstraints : existing.design_constraints,
        body.cadCapability !== undefined ? body.cadCapability : existing.cad_capability,
        body.firmwareCapability !== undefined ? body.firmwareCapability : existing.firmware_capability,
        body.isActive !== undefined ? (body.isActive ? 1 : 0) : existing.is_active,
        newVersion,
        now,
        id
      )
      .run()

    // Fetch updated prompt
    const updated = await env.DB.prepare('SELECT * FROM system_prompts WHERE id = ?')
      .bind(id)
      .first<SystemPromptRow>()

    if (!updated) {
      return Response.json({ error: 'Failed to retrieve updated prompt' }, { status: 500 })
    }

    await logger.info('api', 'System prompt updated', { id, version: newVersion })

    return Response.json({ prompt: rowToPrompt(updated) })
  } catch (error) {
    await logger.error('api', 'Failed to update system prompt', { error: String(error), id })
    return Response.json({ error: 'Failed to update prompt' }, { status: 500 })
  }
}

// =============================================================================
// DELETE - Delete prompt
// =============================================================================

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)
  const id = parseInt(params.id, 10)

  // Admin check
  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (isNaN(id)) {
    return Response.json({ error: 'Invalid prompt ID' }, { status: 400 })
  }

  try {
    // Check prompt exists
    const existing = await env.DB.prepare('SELECT * FROM system_prompts WHERE id = ?')
      .bind(id)
      .first<SystemPromptRow>()

    if (!existing) {
      return Response.json({ error: 'Prompt not found' }, { status: 404 })
    }

    // Don't allow deleting the active prompt
    if (existing.is_active === 1) {
      return Response.json(
        { error: 'Cannot delete the active prompt. Activate another prompt first.' },
        { status: 400 }
      )
    }

    await env.DB.prepare('DELETE FROM system_prompts WHERE id = ?').bind(id).run()

    await logger.info('api', 'System prompt deleted', { id, name: existing.name })

    return Response.json({ success: true })
  } catch (error) {
    await logger.error('api', 'Failed to delete system prompt', { error: String(error), id })
    return Response.json({ error: 'Failed to delete prompt' }, { status: 500 })
  }
}
