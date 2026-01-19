/**
 * LangGraph State API
 *
 * GET: Retrieve current state for a project
 * PUT: Update state (for persistence)
 */

import type { Env } from '../../env'

interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin: boolean
}

interface LangGraphState {
  threadId: string
  checkpointId: string
  state: Record<string, unknown>
  status: 'running' | 'paused' | 'complete' | 'error' | 'awaiting_input'
  currentNode: string | null
  updatedAt: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
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

  // Verify user owns the project (thread_id is project_id)
  const project = await env.DB.prepare(
    'SELECT id, user_id, spec FROM projects WHERE id = ?'
  )
    .bind(threadId)
    .first<{ id: string; user_id: string; spec: string | null }>()

  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 })
  }

  if (project.user_id !== user.id && !user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Get latest checkpoint
  const checkpoint = await env.DB.prepare(
    `SELECT checkpoint_id, checkpoint, metadata, created_at
     FROM langgraph_checkpoints
     WHERE thread_id = ? AND checkpoint_ns = ''
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(threadId)
    .first<{
      checkpoint_id: string
      checkpoint: string
      metadata: string
      created_at: string
    }>()

  if (!checkpoint) {
    // No checkpoint exists yet, return state from project spec
    const spec = project.spec ? JSON.parse(project.spec) : null
    return Response.json({
      threadId,
      checkpointId: null,
      state: spec?.orchestratorState ?? null,
      status: 'idle',
      currentNode: null,
      updatedAt: null,
    })
  }

  const checkpointData = JSON.parse(checkpoint.checkpoint)
  const _metadata = JSON.parse(checkpoint.metadata) // Available for future use

  return Response.json({
    threadId,
    checkpointId: checkpoint.checkpoint_id,
    state: checkpointData.channel_values,
    status: checkpointData.channel_values?.status ?? 'unknown',
    currentNode: checkpointData.channel_values?.currentNode ?? null,
    updatedAt: checkpoint.created_at,
  } satisfies LangGraphState)
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User | undefined

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await context.request.json<{
    thread_id: string
    checkpoint_id: string
    state: Record<string, unknown>
    parent_checkpoint_id?: string
  }>()

  if (!body.thread_id || !body.checkpoint_id || !body.state) {
    return Response.json(
      { error: 'thread_id, checkpoint_id, and state are required' },
      { status: 400 }
    )
  }

  // Verify user owns the project
  const project = await env.DB.prepare('SELECT user_id FROM projects WHERE id = ?')
    .bind(body.thread_id)
    .first<{ user_id: string }>()

  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 })
  }

  if (project.user_id !== user.id && !user.isAdmin) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Build checkpoint structure
  const checkpoint = {
    v: 1,
    id: body.checkpoint_id,
    ts: new Date().toISOString(),
    channel_values: body.state,
    channel_versions: {},
    versions_seen: {},
    pending_sends: [],
  }

  const metadata = {
    source: 'input',
    step: 1,
    writes: {},
    parents: {},
  }

  // Store checkpoint
  await env.DB.prepare(
    `INSERT OR REPLACE INTO langgraph_checkpoints
     (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata, created_at)
     VALUES (?, '', ?, ?, 'checkpoint', ?, ?, ?)`
  )
    .bind(
      body.thread_id,
      body.checkpoint_id,
      body.parent_checkpoint_id ?? null,
      JSON.stringify(checkpoint),
      JSON.stringify(metadata),
      new Date().toISOString()
    )
    .run()

  // Also update project spec with orchestrator state
  const specResult = await env.DB.prepare('SELECT spec FROM projects WHERE id = ?')
    .bind(body.thread_id)
    .first<{ spec: string | null }>()

  const existingSpec = specResult?.spec ? JSON.parse(specResult.spec) : {}
  const updatedSpec = {
    ...existingSpec,
    orchestratorState: {
      conversationHistory: [],
      iteration: body.state.iterationCount ?? 0,
      status: body.state.status ?? 'running',
      currentStage: body.state.currentStage ?? 'spec',
      updatedAt: new Date().toISOString(),
    },
  }

  await env.DB.prepare('UPDATE projects SET spec = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(updatedSpec), new Date().toISOString(), body.thread_id)
    .run()

  return Response.json({
    success: true,
    checkpointId: body.checkpoint_id,
  })
}
