/**
 * LangGraph History API
 *
 * GET: List checkpoints for a thread
 * DELETE: Clear checkpoints for a thread
 */

import type { Env } from '../../env'

interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin: boolean
}

interface CheckpointSummary {
  checkpointId: string
  parentCheckpointId: string | null
  createdAt: string
  status: string
  currentNode: string | null
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User | undefined

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(context.request.url)
  const threadId = url.searchParams.get('thread_id')
  const limit = parseInt(url.searchParams.get('limit') ?? '20', 10)

  if (!threadId) {
    return Response.json({ error: 'thread_id is required' }, { status: 400 })
  }

  // Verify user owns the project
  const project = await env.DB.prepare('SELECT user_id FROM projects WHERE id = ?')
    .bind(threadId)
    .first<{ user_id: string }>()

  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 })
  }

  if (project.user_id !== user.id && !user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Get checkpoint history
  const checkpoints = await env.DB.prepare(
    `SELECT checkpoint_id, parent_checkpoint_id, checkpoint, created_at
     FROM langgraph_checkpoints
     WHERE thread_id = ? AND checkpoint_ns = ''
     ORDER BY created_at DESC
     LIMIT ?`
  )
    .bind(threadId, limit)
    .all<{
      checkpoint_id: string
      parent_checkpoint_id: string | null
      checkpoint: string
      created_at: string
    }>()

  const history: CheckpointSummary[] = checkpoints.results.map((row) => {
    const checkpointData = JSON.parse(row.checkpoint)
    return {
      checkpointId: row.checkpoint_id,
      parentCheckpointId: row.parent_checkpoint_id,
      createdAt: row.created_at,
      status: checkpointData.channel_values?.status ?? 'unknown',
      currentNode: checkpointData.channel_values?.currentNode ?? null,
    }
  })

  return Response.json({
    threadId,
    checkpoints: history,
    total: checkpoints.results.length,
  })
}

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User | undefined

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(context.request.url)
  const threadId = url.searchParams.get('thread_id')

  if (!threadId) {
    return Response.json({ error: 'thread_id is required' }, { status: 400 })
  }

  // Verify user owns the project
  const project = await env.DB.prepare('SELECT user_id FROM projects WHERE id = ?')
    .bind(threadId)
    .first<{ user_id: string }>()

  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 })
  }

  if (project.user_id !== user.id && !user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Delete all checkpoints for this thread
  await env.DB.prepare('DELETE FROM langgraph_checkpoints_writes WHERE thread_id = ?')
    .bind(threadId)
    .run()

  const result = await env.DB.prepare('DELETE FROM langgraph_checkpoints WHERE thread_id = ?')
    .bind(threadId)
    .run()

  // Also clear orchestrator state from project spec
  const specResult = await env.DB.prepare('SELECT spec FROM projects WHERE id = ?')
    .bind(threadId)
    .first<{ spec: string | null }>()

  if (specResult?.spec) {
    const existingSpec = JSON.parse(specResult.spec)
    delete existingSpec.orchestratorState
    await env.DB.prepare('UPDATE projects SET spec = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(existingSpec), new Date().toISOString(), threadId)
      .run()
  }

  return Response.json({
    success: true,
    deleted: result.meta.changes,
  })
}
