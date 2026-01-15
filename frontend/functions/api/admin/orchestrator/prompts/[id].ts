/**
 * Single Orchestrator Prompt API
 *
 * GET /api/admin/orchestrator/prompts/:id - Get single prompt
 * PUT /api/admin/orchestrator/prompts/:id - Update prompt
 * Requires admin authentication.
 */

import type { Env, AuthenticatedRequest } from '../../../../types'

interface OrchestratorPrompt {
  id: string
  node_name: string
  display_name: string
  stage: string
  description: string | null
  system_prompt: string
  user_prompt_template: string
  temperature: number
  max_tokens: number
  is_active: number
  updated_at: string
  updated_by: string | null
}

interface UpdatePromptBody {
  system_prompt?: string
  user_prompt_template?: string
  temperature?: number
  max_tokens?: number
  description?: string
  is_active?: boolean
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const request = context.request as AuthenticatedRequest
  const { env, params } = context
  const promptId = params.id as string

  // Check admin access
  if (!request.user?.isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const result = await env.DB.prepare(
      'SELECT * FROM orchestrator_prompts WHERE id = ? OR node_name = ?'
    )
      .bind(promptId, promptId)
      .first<OrchestratorPrompt>()

    if (!result) {
      return new Response(JSON.stringify({ error: 'Prompt not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ prompt: result }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const request = context.request as AuthenticatedRequest
  const { env, params } = context
  const promptId = params.id as string

  // Check admin access
  if (!request.user?.isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = (await request.json()) as UpdatePromptBody

    // Validate at least one field is provided
    if (
      !body.system_prompt &&
      !body.user_prompt_template &&
      body.temperature === undefined &&
      body.max_tokens === undefined &&
      body.description === undefined &&
      body.is_active === undefined
    ) {
      return new Response(JSON.stringify({ error: 'No fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Build dynamic update query
    const updates: string[] = []
    const values: (string | number)[] = []

    if (body.system_prompt !== undefined) {
      updates.push('system_prompt = ?')
      values.push(body.system_prompt)
    }
    if (body.user_prompt_template !== undefined) {
      updates.push('user_prompt_template = ?')
      values.push(body.user_prompt_template)
    }
    if (body.temperature !== undefined) {
      updates.push('temperature = ?')
      values.push(body.temperature)
    }
    if (body.max_tokens !== undefined) {
      updates.push('max_tokens = ?')
      values.push(body.max_tokens)
    }
    if (body.description !== undefined) {
      updates.push('description = ?')
      values.push(body.description)
    }
    if (body.is_active !== undefined) {
      updates.push('is_active = ?')
      values.push(body.is_active ? 1 : 0)
    }

    // Always update timestamp and user
    updates.push('updated_at = ?')
    values.push(new Date().toISOString())
    updates.push('updated_by = ?')
    values.push(request.user.username)

    // Add WHERE clause values
    values.push(promptId)
    values.push(promptId)

    const query = `UPDATE orchestrator_prompts SET ${updates.join(', ')} WHERE id = ? OR node_name = ?`

    const result = await env.DB.prepare(query).bind(...values).run()

    if (result.changes === 0) {
      return new Response(JSON.stringify({ error: 'Prompt not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Fetch updated prompt
    const updated = await env.DB.prepare(
      'SELECT * FROM orchestrator_prompts WHERE id = ? OR node_name = ?'
    )
      .bind(promptId, promptId)
      .first<OrchestratorPrompt>()

    return new Response(JSON.stringify({ prompt: updated }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
