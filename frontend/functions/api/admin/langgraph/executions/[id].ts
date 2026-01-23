/**
 * GET /api/admin/langgraph/executions/[id]
 *
 * Fetches a specific execution run with all events for replay.
 *
 * DELETE /api/admin/langgraph/executions/[id]
 *
 * Deletes a specific execution run.
 */

import type { Env, AuthenticatedRequest } from '../../../_middleware'

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
  const { id } = context.params

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (typeof id !== 'string') {
    return Response.json({ error: 'Invalid execution ID' }, { status: 400 })
  }

  try {
    const result = await DB.prepare(
      `SELECT * FROM execution_runs WHERE id = ?`
    )
      .bind(id)
      .first<ExecutionRunRow>()

    if (!result) {
      return Response.json({ error: 'Execution run not found' }, { status: 404 })
    }

    // Parse events JSON
    let events: unknown[] = []
    try {
      events = JSON.parse(result.events || '[]')
    } catch {
      console.error('Failed to parse events JSON for run:', id)
    }

    return Response.json({
      id: result.id,
      threadId: result.thread_id,
      userId: result.user_id,
      input: result.input,
      events,
      startedAt: result.started_at,
      endedAt: result.ended_at,
      durationMs: result.duration_ms,
      success: result.success === 1,
      error: result.error,
      createdAt: result.created_at,
    })
  } catch (error) {
    console.error('Failed to fetch execution run:', error)
    return Response.json({ error: 'Failed to fetch execution run' }, { status: 500 })
  }
}

export const onRequestDelete: PagesFunction<Env, '', AuthenticatedRequest> = async (context) => {
  const { user } = context.data
  const { DB } = context.env
  const { id } = context.params

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (typeof id !== 'string') {
    return Response.json({ error: 'Invalid execution ID' }, { status: 400 })
  }

  try {
    const result = await DB.prepare(
      `DELETE FROM execution_runs WHERE id = ?`
    )
      .bind(id)
      .run()

    if (result.changes === 0) {
      return Response.json({ error: 'Execution run not found' }, { status: 404 })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Failed to delete execution run:', error)
    return Response.json({ error: 'Failed to delete execution run' }, { status: 500 })
  }
}
