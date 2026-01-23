/**
 * Admin Hard Rejection Criteria - Individual Operations
 *
 * GET    /api/admin/system-prompts/criteria/:id - Get criterion by ID
 * PUT    /api/admin/system-prompts/criteria/:id - Update criterion
 * DELETE /api/admin/system-prompts/criteria/:id - Delete criterion
 */

import type { Env } from '../../../../env.d'
import { createLogger } from '../../../../lib/logger'

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

interface CriteriaRow {
  id: number
  pattern: string
  reason: string
  category: string
  is_active: number
  created_at: string
}

interface Criteria {
  id: number
  pattern: string
  reason: string
  category: 'safety' | 'capability' | 'legal'
  isActive: boolean
  createdAt: string
}

function rowToCriteria(row: CriteriaRow): Criteria {
  return {
    id: row.id,
    pattern: row.pattern,
    reason: row.reason,
    category: row.category as 'safety' | 'capability' | 'legal',
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  }
}

// =============================================================================
// GET - Get criterion by ID
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
    return Response.json({ error: 'Invalid criterion ID' }, { status: 400 })
  }

  try {
    const row = await env.DB.prepare('SELECT * FROM hard_rejection_criteria WHERE id = ?')
      .bind(id)
      .first<CriteriaRow>()

    if (!row) {
      return Response.json({ error: 'Criterion not found' }, { status: 404 })
    }

    await logger.debug('api', 'Criterion retrieved', { id })

    return Response.json({ criterion: rowToCriteria(row) })
  } catch (error) {
    await logger.error('api', 'Failed to get criterion', { error: String(error), id })
    return Response.json({ error: 'Failed to get criterion' }, { status: 500 })
  }
}

// =============================================================================
// PUT - Update criterion
// =============================================================================

interface UpdateCriteriaRequest {
  pattern?: string
  reason?: string
  category?: 'safety' | 'capability' | 'legal'
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
    return Response.json({ error: 'Invalid criterion ID' }, { status: 400 })
  }

  try {
    const body = (await context.request.json()) as UpdateCriteriaRequest

    // Check criterion exists
    const existing = await env.DB.prepare('SELECT * FROM hard_rejection_criteria WHERE id = ?')
      .bind(id)
      .first<CriteriaRow>()

    if (!existing) {
      return Response.json({ error: 'Criterion not found' }, { status: 404 })
    }

    // Validate category if provided
    if (body.category && !['safety', 'capability', 'legal'].includes(body.category)) {
      return Response.json(
        { error: 'category must be one of: safety, capability, legal' },
        { status: 400 }
      )
    }

    // Validate regex pattern if provided
    if (body.pattern) {
      try {
        new RegExp(body.pattern, 'i')
      } catch {
        return Response.json({ error: 'Invalid regex pattern' }, { status: 400 })
      }
    }

    await env.DB.prepare(
      `UPDATE hard_rejection_criteria
       SET pattern = ?, reason = ?, category = ?, is_active = ?
       WHERE id = ?`
    )
      .bind(
        body.pattern ?? existing.pattern,
        body.reason ?? existing.reason,
        body.category ?? existing.category,
        body.isActive !== undefined ? (body.isActive ? 1 : 0) : existing.is_active,
        id
      )
      .run()

    // Fetch updated criterion
    const updated = await env.DB.prepare('SELECT * FROM hard_rejection_criteria WHERE id = ?')
      .bind(id)
      .first<CriteriaRow>()

    if (!updated) {
      return Response.json({ error: 'Failed to retrieve updated criterion' }, { status: 500 })
    }

    await logger.info('api', 'Criterion updated', { id })

    return Response.json({ criterion: rowToCriteria(updated) })
  } catch (error) {
    await logger.error('api', 'Failed to update criterion', { error: String(error), id })
    return Response.json({ error: 'Failed to update criterion' }, { status: 500 })
  }
}

// =============================================================================
// DELETE - Delete criterion
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
    return Response.json({ error: 'Invalid criterion ID' }, { status: 400 })
  }

  try {
    // Check criterion exists
    const existing = await env.DB.prepare('SELECT * FROM hard_rejection_criteria WHERE id = ?')
      .bind(id)
      .first<CriteriaRow>()

    if (!existing) {
      return Response.json({ error: 'Criterion not found' }, { status: 404 })
    }

    await env.DB.prepare('DELETE FROM hard_rejection_criteria WHERE id = ?').bind(id).run()

    await logger.info('api', 'Criterion deleted', { id, pattern: existing.pattern })

    return Response.json({ success: true })
  } catch (error) {
    await logger.error('api', 'Failed to delete criterion', { error: String(error), id })
    return Response.json({ error: 'Failed to delete criterion' }, { status: 500 })
  }
}
