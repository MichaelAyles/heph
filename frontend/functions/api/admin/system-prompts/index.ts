/**
 * Admin System Prompts API
 *
 * GET  /api/admin/system-prompts - List all system prompts
 * POST /api/admin/system-prompts - Create new prompt
 * GET  /api/admin/system-prompts/:id - Get prompt by ID
 * PUT  /api/admin/system-prompts/:id - Update prompt
 * DELETE /api/admin/system-prompts/:id - Delete prompt
 */

import type { Env } from '../../../env'
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
// GET - List all system prompts
// =============================================================================

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)

  // Admin check
  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const result = await env.DB.prepare(
      'SELECT * FROM system_prompts ORDER BY is_active DESC, version DESC'
    ).all<SystemPromptRow>()

    const prompts = (result.results ?? []).map(rowToPrompt)

    await logger.debug('api', 'System prompts listed', { count: prompts.length })

    return Response.json({ prompts })
  } catch (error) {
    await logger.error('api', 'Failed to list system prompts', { error: String(error) })
    return Response.json({ error: 'Failed to list prompts' }, { status: 500 })
  }
}

// =============================================================================
// POST - Create new system prompt
// =============================================================================

interface CreatePromptRequest {
  name: string
  description?: string
  capabilityAssessmentBase: string
  designConstraints?: string
  cadCapability?: string
  firmwareCapability?: string
  isActive?: boolean
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)

  // Admin check
  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const body = (await context.request.json()) as CreatePromptRequest

    // Validate required fields
    if (!body.name || !body.capabilityAssessmentBase) {
      return Response.json(
        { error: 'name and capabilityAssessmentBase are required' },
        { status: 400 }
      )
    }

    // Check for duplicate name
    const existing = await env.DB.prepare(
      'SELECT id FROM system_prompts WHERE name = ?'
    )
      .bind(body.name)
      .first()

    if (existing) {
      return Response.json({ error: 'A prompt with this name already exists' }, { status: 409 })
    }

    // If this will be active, deactivate others
    if (body.isActive !== false) {
      await env.DB.prepare('UPDATE system_prompts SET is_active = 0').run()
    }

    const now = new Date().toISOString()

    const result = await env.DB.prepare(
      `INSERT INTO system_prompts (name, description, capability_assessment_base, design_constraints, cad_capability, firmware_capability, is_active, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
      .bind(
        body.name,
        body.description || null,
        body.capabilityAssessmentBase,
        body.designConstraints || null,
        body.cadCapability || null,
        body.firmwareCapability || null,
        body.isActive !== false ? 1 : 0,
        now,
        now
      )
      .run()

    const newId = result.meta.last_row_id

    // Fetch the created prompt
    const created = await env.DB.prepare('SELECT * FROM system_prompts WHERE id = ?')
      .bind(newId)
      .first<SystemPromptRow>()

    if (!created) {
      return Response.json({ error: 'Failed to retrieve created prompt' }, { status: 500 })
    }

    await logger.info('api', 'System prompt created', { id: newId, name: body.name })

    return Response.json({ prompt: rowToPrompt(created) }, { status: 201 })
  } catch (error) {
    await logger.error('api', 'Failed to create system prompt', { error: String(error) })
    return Response.json({ error: 'Failed to create prompt' }, { status: 500 })
  }
}
