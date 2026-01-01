/**
 * Admin Debug Logs Endpoint
 * View debug logs (admin only)
 */

import type { Env } from '../../env'

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
  isAdmin: boolean
}

interface DebugLog {
  id: string
  user_id: string | null
  level: string
  category: string
  message: string
  metadata: string | null
  request_id: string | null
  created_at: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User

  // Admin only
  if (!user.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const url = new URL(context.request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500)
  const offset = parseInt(url.searchParams.get('offset') || '0')
  const level = url.searchParams.get('level') // debug, info, warn, error
  const category = url.searchParams.get('category') // api, llm, auth, etc.
  const requestId = url.searchParams.get('requestId')

  try {
    let query = `
      SELECT id, user_id, level, category, message, metadata, request_id, created_at
      FROM debug_logs
      WHERE 1=1
    `
    const bindings: (string | number)[] = []

    if (level) {
      query += ` AND level = ?`
      bindings.push(level)
    }

    if (category) {
      query += ` AND category = ?`
      bindings.push(category)
    }

    if (requestId) {
      query += ` AND request_id = ?`
      bindings.push(requestId)
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
    bindings.push(limit, offset)

    const { results } = await env.DB.prepare(query)
      .bind(...bindings)
      .all<DebugLog>()

    // Get total count
    let countQuery = `SELECT COUNT(*) as count FROM debug_logs WHERE 1=1`
    const countBindings: string[] = []

    if (level) {
      countQuery += ` AND level = ?`
      countBindings.push(level)
    }

    if (category) {
      countQuery += ` AND category = ?`
      countBindings.push(category)
    }

    if (requestId) {
      countQuery += ` AND request_id = ?`
      countBindings.push(requestId)
    }

    const countResult = await env.DB.prepare(countQuery)
      .bind(...countBindings)
      .first<{ count: number }>()

    // Parse metadata JSON
    const logs = results.map((log) => ({
      ...log,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
    }))

    return Response.json({
      logs,
      pagination: {
        total: countResult?.count || 0,
        limit,
        offset,
        hasMore: (countResult?.count || 0) > offset + limit,
      },
    })
  } catch (error) {
    console.error('Error fetching logs:', error)
    return Response.json({ error: 'Failed to fetch logs' }, { status: 500 })
  }
}

// Delete old logs (admin only)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User

  if (!user.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const url = new URL(context.request.url)
  const olderThanDays = parseInt(url.searchParams.get('olderThanDays') || '7')

  try {
    const result = await env.DB.prepare(
      `DELETE FROM debug_logs WHERE created_at < datetime('now', '-' || ? || ' days')`
    )
      .bind(olderThanDays)
      .run()

    return Response.json({
      deleted: result.meta.changes,
      message: `Deleted logs older than ${olderThanDays} days`,
    })
  } catch (error) {
    console.error('Error deleting logs:', error)
    return Response.json({ error: 'Failed to delete logs' }, { status: 500 })
  }
}
