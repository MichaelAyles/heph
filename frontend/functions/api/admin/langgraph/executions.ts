/**
 * GET /api/admin/langgraph/executions
 *
 * Lists past execution runs with pagination.
 * Used by the debugger UI to show execution history for replay.
 *
 * Query params:
 * - limit: number (default 20, max 100)
 * - offset: number (default 0)
 * - threadId: string (optional filter)
 */

import type { Env, AuthenticatedRequest } from '../../_middleware'

interface ExecutionRunRow {
  id: string
  thread_id: string | null
  user_id: string | null
  input: string
  events: string
  started_at: number
  ended_at: number | null
  duration_ms: number | null
  success: number
  error: string | null
  created_at: string
}

export const onRequestGet: PagesFunction<Env, '', AuthenticatedRequest> = async (context) => {
  const { user } = context.data
  const { DB } = context.env

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const url = new URL(context.request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)
  const threadId = url.searchParams.get('threadId')

  try {
    let query: string
    let params: (string | number)[]

    if (threadId) {
      query = `
        SELECT id, thread_id, user_id, input, started_at, ended_at, duration_ms, success, error, created_at
        FROM execution_runs
        WHERE thread_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `
      params = [threadId, limit, offset]
    } else {
      query = `
        SELECT id, thread_id, user_id, input, started_at, ended_at, duration_ms, success, error, created_at
        FROM execution_runs
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `
      params = [limit, offset]
    }

    const result = await DB.prepare(query).bind(...params).all<Omit<ExecutionRunRow, 'events'>>()

    // Get total count
    const countQuery = threadId
      ? `SELECT COUNT(*) as count FROM execution_runs WHERE thread_id = ?`
      : `SELECT COUNT(*) as count FROM execution_runs`
    const countParams = threadId ? [threadId] : []
    const countResult = await DB.prepare(countQuery).bind(...countParams).first<{ count: number }>()

    return Response.json({
      runs: result.results || [],
      total: countResult?.count || 0,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Failed to fetch execution runs:', error)
    return Response.json({ error: 'Failed to fetch execution runs' }, { status: 500 })
  }
}
