/**
 * Admin Orchestrator Prompts API
 * GET - List all orchestrator prompts
 * POST - Create a new prompt
 */

import type { Env } from '../../../env.d'

interface PromptRow {
  id: string
  node_name: string
  display_name: string
  description: string | null
  system_prompt: string
  category: 'agent' | 'generator' | 'reviewer'
  stage: string | null
  is_active: number
  token_estimate: number | null
  version: number
  created_at: string
  updated_at: string
}

interface TransformedPrompt {
  id: string
  nodeName: string
  displayName: string
  description: string
  systemPrompt: string
  category: 'agent' | 'generator' | 'reviewer'
  stage: string | null
  isActive: boolean
  tokenEstimate: number
  version: number
}

function transformPrompt(row: PromptRow): TransformedPrompt {
  return {
    id: row.id,
    nodeName: row.node_name,
    displayName: row.display_name,
    description: row.description || '',
    systemPrompt: row.system_prompt,
    category: row.category,
    stage: row.stage,
    isActive: row.is_active === 1,
    tokenEstimate: row.token_estimate || 0,
    version: row.version,
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const result = await env.DB.prepare(
    `SELECT id, node_name, display_name, description, system_prompt,
            category, stage, is_active, token_estimate, version,
            created_at, updated_at
     FROM orchestrator_prompts
     ORDER BY category, node_name`
  ).all<PromptRow>()

  const prompts = (result.results || []).map(transformPrompt)

  return Response.json({ prompts })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data, request } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = (await request.json()) as {
    nodeName: string
    displayName: string
    description?: string
    systemPrompt: string
    category?: 'agent' | 'generator' | 'reviewer'
    stage?: string | null
    tokenEstimate?: number
  }

  if (!body.nodeName || !body.displayName || !body.systemPrompt) {
    return Response.json(
      { error: 'nodeName, displayName, and systemPrompt are required' },
      { status: 400 }
    )
  }

  // Check if node_name already exists
  const existing = await env.DB.prepare(
    'SELECT id FROM orchestrator_prompts WHERE node_name = ?'
  )
    .bind(body.nodeName)
    .first()

  if (existing) {
    return Response.json(
      { error: 'A prompt with this node name already exists' },
      { status: 409 }
    )
  }

  const id = crypto.randomUUID().replace(/-/g, '').toLowerCase()
  const tokenEstimate = body.tokenEstimate || Math.ceil((body.systemPrompt.length || 0) / 4)

  await env.DB.prepare(
    `INSERT INTO orchestrator_prompts
     (id, node_name, display_name, description, system_prompt, category, stage, token_estimate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.nodeName,
      body.displayName,
      body.description || null,
      body.systemPrompt,
      body.category || 'generator',
      body.stage || null,
      tokenEstimate
    )
    .run()

  return Response.json({ success: true, id })
}
