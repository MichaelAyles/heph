/**
 * LangGraph Execution History API
 *
 * GET /api/langgraph/executions
 *
 * Returns execution history for LangGraph nodes.
 * Supports filtering by node name, project, and pagination.
 */

import type { Env } from '../../env'

interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin: boolean
}

interface ExecutionRow {
  id: string
  node_name: string
  thread_id: string | null
  project_id: string | null
  user_id: string | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  input_json: string
  output_json: string | null
  error: string | null
  model: string | null
  temperature: number | null
  system_prompt: string | null
  user_prompt: string | null
  raw_response: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  cost_usd: number | null
  created_at: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User | undefined

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(context.request.url)
  const nodeName = url.searchParams.get('node_name')
  const projectId = url.searchParams.get('project_id')
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)
  const includeDebug = url.searchParams.get('include_debug') === 'true'

  // Build query
  const conditions: string[] = []
  const params: (string | number)[] = []

  // Non-admin users can only see their own executions
  if (!user.isAdmin) {
    conditions.push('user_id = ?')
    params.push(user.id)
  }

  if (nodeName) {
    conditions.push('node_name = ?')
    params.push(nodeName)
  }

  if (projectId) {
    // Verify user has access to this project
    if (!user.isAdmin) {
      const project = await env.DB.prepare('SELECT user_id FROM projects WHERE id = ?')
        .bind(projectId)
        .first<{ user_id: string }>()

      if (!project || project.user_id !== user.id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    conditions.push('project_id = ?')
    params.push(projectId)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // Count total
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM langgraph_executions ${whereClause}`
  )
    .bind(...params)
    .first<{ count: number }>()

  // Get executions
  const selectFields = includeDebug
    ? '*'
    : `id, node_name, thread_id, project_id, user_id, started_at, completed_at, duration_ms,
       error, model, temperature, prompt_tokens, completion_tokens, cost_usd, created_at`

  const executions = await env.DB.prepare(
    `SELECT ${selectFields} FROM langgraph_executions ${whereClause}
     ORDER BY started_at DESC LIMIT ? OFFSET ?`
  )
    .bind(...params, limit, offset)
    .all<ExecutionRow>()

  // Transform results
  const results = executions.results.map((row) => ({
    id: row.id,
    nodeName: row.node_name,
    threadId: row.thread_id,
    projectId: row.project_id,
    userId: row.user_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    success: !row.error,
    error: row.error,
    model: row.model,
    temperature: row.temperature,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    costUsd: row.cost_usd,
    // Only include these if requested
    ...(includeDebug && {
      input: row.input_json ? JSON.parse(row.input_json) : null,
      output: row.output_json ? JSON.parse(row.output_json) : null,
      systemPrompt: row.system_prompt,
      userPrompt: row.user_prompt,
      rawResponse: row.raw_response,
    }),
  }))

  return Response.json({
    executions: results,
    total: countResult?.count ?? 0,
    limit,
    offset,
  })
}
