/**
 * Admin Hard Rejection Criteria API
 *
 * GET  /api/admin/system-prompts/criteria - List all criteria
 * POST /api/admin/system-prompts/criteria - Create new criterion
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
// GET - List all criteria
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
      'SELECT * FROM hard_rejection_criteria ORDER BY category, id'
    ).all<CriteriaRow>()

    const criteria = (result.results ?? []).map(rowToCriteria)

    await logger.debug('api', 'Hard rejection criteria listed', { count: criteria.length })

    return Response.json({ criteria })
  } catch (error) {
    await logger.error('api', 'Failed to list criteria', { error: String(error) })
    return Response.json({ error: 'Failed to list criteria' }, { status: 500 })
  }
}

// =============================================================================
// POST - Create new criterion
// =============================================================================

interface CreateCriteriaRequest {
  pattern: string
  reason: string
  category: 'safety' | 'capability' | 'legal'
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
    const body = (await context.request.json()) as CreateCriteriaRequest

    // Validate required fields
    if (!body.pattern || !body.reason || !body.category) {
      return Response.json(
        { error: 'pattern, reason, and category are required' },
        { status: 400 }
      )
    }

    // Validate category
    if (!['safety', 'capability', 'legal'].includes(body.category)) {
      return Response.json(
        { error: 'category must be one of: safety, capability, legal' },
        { status: 400 }
      )
    }

    // Validate regex pattern
    try {
      new RegExp(body.pattern, 'i')
    } catch {
      return Response.json({ error: 'Invalid regex pattern' }, { status: 400 })
    }

    const now = new Date().toISOString()

    const result = await env.DB.prepare(
      `INSERT INTO hard_rejection_criteria (pattern, reason, category, is_active, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(
        body.pattern,
        body.reason,
        body.category,
        body.isActive !== false ? 1 : 0,
        now
      )
      .run()

    const newId = result.meta.last_row_id

    // Fetch the created criterion
    const created = await env.DB.prepare('SELECT * FROM hard_rejection_criteria WHERE id = ?')
      .bind(newId)
      .first<CriteriaRow>()

    if (!created) {
      return Response.json({ error: 'Failed to retrieve created criterion' }, { status: 500 })
    }

    await logger.info('api', 'Hard rejection criterion created', { id: newId, pattern: body.pattern })

    return Response.json({ criterion: rowToCriteria(created) }, { status: 201 })
  } catch (error) {
    await logger.error('api', 'Failed to create criterion', { error: String(error) })
    return Response.json({ error: 'Failed to create criterion' }, { status: 500 })
  }
}
