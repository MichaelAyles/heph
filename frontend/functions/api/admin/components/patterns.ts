/**
 * Admin JLCPCB Footprint Patterns API
 *
 * GET  /api/admin/components/patterns - List all patterns
 * POST /api/admin/components/patterns - Create new pattern
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

interface FootprintPatternRow {
  id: number
  pattern: string
  rotation_offset: number
  priority: number
  comment: string | null
  created_at: string
}

interface FootprintPattern {
  id: number
  pattern: string
  rotationOffset: number
  priority: number
  comment: string | null
  createdAt: string
}

function rowToPattern(row: FootprintPatternRow): FootprintPattern {
  return {
    id: row.id,
    pattern: row.pattern,
    rotationOffset: row.rotation_offset,
    priority: row.priority,
    comment: row.comment,
    createdAt: row.created_at,
  }
}

// =============================================================================
// GET - List all patterns (sorted by priority descending)
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
      'SELECT * FROM jlcpcb_footprint_patterns ORDER BY priority DESC, pattern ASC'
    ).all<FootprintPatternRow>()

    const patterns = (result.results ?? []).map(rowToPattern)

    await logger.debug('api', 'JLCPCB footprint patterns listed', { count: patterns.length })

    return Response.json({ patterns })
  } catch (error) {
    await logger.error('api', 'Failed to list footprint patterns', { error: String(error) })
    return Response.json({ error: 'Failed to list patterns' }, { status: 500 })
  }
}

// =============================================================================
// POST - Create new pattern
// =============================================================================

interface CreatePatternRequest {
  pattern: string
  rotationOffset?: number
  priority?: number
  comment?: string
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
    const body = (await context.request.json()) as CreatePatternRequest

    // Validate required fields
    if (!body.pattern) {
      return Response.json({ error: 'pattern is required' }, { status: 400 })
    }

    // Validate regex pattern
    try {
      new RegExp(body.pattern, 'i')
    } catch {
      return Response.json({ error: 'Invalid regex pattern' }, { status: 400 })
    }

    // Check for duplicate
    const existing = await env.DB.prepare(
      'SELECT id FROM jlcpcb_footprint_patterns WHERE pattern = ?'
    )
      .bind(body.pattern)
      .first()

    if (existing) {
      return Response.json({ error: 'A pattern with this regex already exists' }, { status: 409 })
    }

    const now = new Date().toISOString()

    const result = await env.DB.prepare(
      `INSERT INTO jlcpcb_footprint_patterns (pattern, rotation_offset, priority, comment, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(
        body.pattern,
        body.rotationOffset ?? 0,
        body.priority ?? 0,
        body.comment || null,
        now
      )
      .run()

    const newId = result.meta.last_row_id

    // Fetch the created pattern
    const created = await env.DB.prepare('SELECT * FROM jlcpcb_footprint_patterns WHERE id = ?')
      .bind(newId)
      .first<FootprintPatternRow>()

    if (!created) {
      return Response.json({ error: 'Failed to retrieve created pattern' }, { status: 500 })
    }

    await logger.info('api', 'Footprint pattern created', { id: newId, pattern: body.pattern })

    return Response.json({ pattern: rowToPattern(created) }, { status: 201 })
  } catch (error) {
    await logger.error('api', 'Failed to create footprint pattern', { error: String(error) })
    return Response.json({ error: 'Failed to create pattern' }, { status: 500 })
  }
}
