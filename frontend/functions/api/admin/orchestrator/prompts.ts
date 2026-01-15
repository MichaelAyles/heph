/**
 * Orchestrator Prompts API
 *
 * GET /api/admin/orchestrator/prompts - List all prompts
 * Requires admin authentication.
 */

import type { Env } from '../../../types'

interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin: boolean
}

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

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User

  // Check admin access
  if (!user?.isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Get optional stage filter
    const url = new URL(context.request.url)
    const stage = url.searchParams.get('stage')

    let query = 'SELECT * FROM orchestrator_prompts'
    const params: string[] = []

    if (stage) {
      query += ' WHERE stage = ?'
      params.push(stage)
    }

    query += ' ORDER BY stage, display_name'

    const result = await env.DB.prepare(query).bind(...params).all<OrchestratorPrompt>()

    return new Response(JSON.stringify({ prompts: result.results }), {
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
