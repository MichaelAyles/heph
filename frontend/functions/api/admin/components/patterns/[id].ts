/**
 * Admin JLCPCB Footprint Patterns - Individual Pattern Operations
 *
 * GET    /api/admin/components/patterns/:id - Get pattern by ID
 * PUT    /api/admin/components/patterns/:id - Update pattern
 * DELETE /api/admin/components/patterns/:id - Delete pattern
 */

import type { Env } from '../../../../env'
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
// GET - Get pattern by ID
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
    return Response.json({ error: 'Invalid pattern ID' }, { status: 400 })
  }

  try {
    const row = await env.DB.prepare('SELECT * FROM jlcpcb_footprint_patterns WHERE id = ?')
      .bind(id)
      .first<FootprintPatternRow>()

    if (!row) {
      return Response.json({ error: 'Pattern not found' }, { status: 404 })
    }

    await logger.debug('api', 'Footprint pattern retrieved', { id })

    return Response.json({ pattern: rowToPattern(row) })
  } catch (error) {
    await logger.error('api', 'Failed to get footprint pattern', { error: String(error), id })
    return Response.json({ error: 'Failed to get pattern' }, { status: 500 })
  }
}

// =============================================================================
// PUT - Update pattern
// =============================================================================

interface UpdatePatternRequest {
  pattern?: string
  rotationOffset?: number
  priority?: number
  comment?: string | null
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
    return Response.json({ error: 'Invalid pattern ID' }, { status: 400 })
  }

  try {
    const body = (await context.request.json()) as UpdatePatternRequest

    // Check pattern exists
    const existing = await env.DB.prepare('SELECT * FROM jlcpcb_footprint_patterns WHERE id = ?')
      .bind(id)
      .first<FootprintPatternRow>()

    if (!existing) {
      return Response.json({ error: 'Pattern not found' }, { status: 404 })
    }

    // Validate new pattern if provided
    const newPattern = body.pattern ?? existing.pattern
    if (body.pattern) {
      try {
        new RegExp(body.pattern, 'i')
      } catch {
        return Response.json({ error: 'Invalid regex pattern' }, { status: 400 })
      }

      // Check for duplicate pattern (if changing)
      if (body.pattern !== existing.pattern) {
        const duplicate = await env.DB.prepare(
          'SELECT id FROM jlcpcb_footprint_patterns WHERE pattern = ? AND id != ?'
        )
          .bind(body.pattern, id)
          .first()

        if (duplicate) {
          return Response.json({ error: 'A pattern with this regex already exists' }, { status: 409 })
        }
      }
    }

    await env.DB.prepare(
      `UPDATE jlcpcb_footprint_patterns
       SET pattern = ?,
           rotation_offset = ?,
           priority = ?,
           comment = ?
       WHERE id = ?`
    )
      .bind(
        newPattern,
        body.rotationOffset !== undefined ? body.rotationOffset : existing.rotation_offset,
        body.priority !== undefined ? body.priority : existing.priority,
        body.comment !== undefined ? body.comment : existing.comment,
        id
      )
      .run()

    // Fetch updated pattern
    const updated = await env.DB.prepare('SELECT * FROM jlcpcb_footprint_patterns WHERE id = ?')
      .bind(id)
      .first<FootprintPatternRow>()

    if (!updated) {
      return Response.json({ error: 'Failed to retrieve updated pattern' }, { status: 500 })
    }

    await logger.info('api', 'Footprint pattern updated', { id })

    return Response.json({ pattern: rowToPattern(updated) })
  } catch (error) {
    await logger.error('api', 'Failed to update footprint pattern', { error: String(error), id })
    return Response.json({ error: 'Failed to update pattern' }, { status: 500 })
  }
}

// =============================================================================
// DELETE - Delete pattern
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
    return Response.json({ error: 'Invalid pattern ID' }, { status: 400 })
  }

  try {
    // Check pattern exists
    const existing = await env.DB.prepare('SELECT * FROM jlcpcb_footprint_patterns WHERE id = ?')
      .bind(id)
      .first<FootprintPatternRow>()

    if (!existing) {
      return Response.json({ error: 'Pattern not found' }, { status: 404 })
    }

    await env.DB.prepare('DELETE FROM jlcpcb_footprint_patterns WHERE id = ?').bind(id).run()

    await logger.info('api', 'Footprint pattern deleted', { id, pattern: existing.pattern })

    return Response.json({ success: true })
  } catch (error) {
    await logger.error('api', 'Failed to delete footprint pattern', { error: String(error), id })
    return Response.json({ error: 'Failed to delete pattern' }, { status: 500 })
  }
}
