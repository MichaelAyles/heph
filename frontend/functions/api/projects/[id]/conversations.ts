/**
 * GET /api/projects/:id/conversations
 * Get conversation history for a project (admin only for now)
 */

import type { Env } from '../../../env'

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

interface ConversationRow {
  id: string
  project_id: string | null
  user_id: string
  request_id: string | null
  messages_in: string
  message_out: string | null
  model: string | null
  temperature: number | null
  max_tokens: number | null
  prompt_tokens: number | null
  completion_tokens: number | null
  latency_ms: number | null
  status: string
  error_message: string | null
  created_at: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as User
  const projectId = params.id

  // Admin only for now (contains sensitive prompt data)
  if (!user.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const url = new URL(context.request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const offset = parseInt(url.searchParams.get('offset') || '0')

  try {
    // Get conversations for this project
    const { results } = await env.DB.prepare(
      `
      SELECT id, project_id, user_id, request_id, messages_in, message_out, model,
             temperature, max_tokens, prompt_tokens, completion_tokens, latency_ms,
             status, error_message, created_at
      FROM llm_conversations
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `
    )
      .bind(projectId, limit, offset)
      .all<ConversationRow>()

    // Get total count
    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM llm_conversations WHERE project_id = ?`
    )
      .bind(projectId)
      .first<{ count: number }>()

    // Parse JSON fields
    const conversations = results.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      userId: row.user_id,
      requestId: row.request_id,
      messagesIn: JSON.parse(row.messages_in),
      messageOut: row.message_out,
      model: row.model,
      temperature: row.temperature,
      maxTokens: row.max_tokens,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      latencyMs: row.latency_ms,
      status: row.status,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    }))

    return Response.json({
      conversations,
      pagination: {
        total: countResult?.count || 0,
        limit,
        offset,
        hasMore: (countResult?.count || 0) > offset + limit,
      },
    })
  } catch (error) {
    console.error('Error fetching conversations:', error)
    return Response.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}
