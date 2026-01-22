/**
 * LangGraph Thread Management API
 *
 * GET /api/admin/langgraph/threads - List all threads
 * GET /api/admin/langgraph/threads/:id - Get thread details
 * DELETE /api/admin/langgraph/threads/:id - Delete a thread
 */

import type { Env, AuthenticatedRequest } from '../../_middleware'

interface ThreadSummary {
  threadId: string
  projectName: string | null
  checkpointCount: number
  lastActivity: string
  currentNode: string | null
}

// GET /api/admin/langgraph/threads
export const onRequestGet: PagesFunction<Env, '', AuthenticatedRequest> = async (context) => {
  const { user, db } = context.data

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    // Get all threads with their checkpoint counts and last activity
    const result = await db
      .prepare(
        `
        SELECT
          lc.thread_id,
          COUNT(*) as checkpoint_count,
          MAX(lc.created_at) as last_activity,
          p.name as project_name
        FROM langgraph_checkpoints lc
        LEFT JOIN projects p ON lc.thread_id = p.id
        GROUP BY lc.thread_id
        ORDER BY last_activity DESC
        LIMIT 100
      `
      )
      .all<{
        thread_id: string
        checkpoint_count: number
        last_activity: string
        project_name: string | null
      }>()

    const threads: ThreadSummary[] = (result.results || []).map((row) => ({
      threadId: row.thread_id,
      projectName: row.project_name,
      checkpointCount: row.checkpoint_count,
      lastActivity: row.last_activity,
      currentNode: null, // Would need to parse checkpoint to get this
    }))

    return Response.json({ threads })
  } catch (error) {
    // Table might not exist yet
    if (error instanceof Error && error.message.includes('no such table')) {
      return Response.json({ threads: [] })
    }
    throw error
  }
}

// DELETE /api/admin/langgraph/threads/:id
export const onRequestDelete: PagesFunction<Env, 'id', AuthenticatedRequest> = async (context) => {
  const { user, db } = context.data
  const threadId = context.params.id

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  if (!threadId || typeof threadId !== 'string') {
    return Response.json({ error: 'Thread ID required' }, { status: 400 })
  }

  try {
    // Delete all checkpoints for this thread
    await db
      .prepare('DELETE FROM langgraph_checkpoints WHERE thread_id = ?')
      .bind(threadId)
      .run()

    // Delete all checkpoint writes for this thread
    await db
      .prepare('DELETE FROM langgraph_checkpoints_writes WHERE thread_id = ?')
      .bind(threadId)
      .run()

    return Response.json({ success: true, deletedThreadId: threadId })
  } catch (error) {
    if (error instanceof Error && error.message.includes('no such table')) {
      return Response.json({ success: true, deletedThreadId: threadId })
    }
    throw error
  }
}
