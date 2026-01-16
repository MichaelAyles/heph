/**
 * Admin Orchestrator Prompts API
 * List and manage orchestrator system prompts
 */

import type { Env } from '../../../env'
import type { OrchestratorPromptRow } from '@/db/schema'

// =============================================================================
// GET /api/admin/orchestrator/prompts - List all prompts
// =============================================================================

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const url = new URL(context.request.url)
  const category = url.searchParams.get('category')
  const stage = url.searchParams.get('stage')

  let query = 'SELECT * FROM orchestrator_prompts WHERE 1=1'
  const params: (string | null)[] = []

  if (category && category !== 'all') {
    query += ' AND category = ?'
    params.push(category)
  }

  if (stage && stage !== 'all') {
    if (stage === 'null') {
      query += ' AND stage IS NULL'
    } else {
      query += ' AND stage = ?'
      params.push(stage)
    }
  }

  query += ' ORDER BY category, stage, display_name'

  const stmt = env.DB.prepare(query)
  const result = await (params.length > 0 ? stmt.bind(...params) : stmt).all<OrchestratorPromptRow>()

  // Transform to camelCase
  const prompts = result.results.map((row) => ({
    id: row.id,
    nodeName: row.node_name,
    displayName: row.display_name,
    description: row.description,
    systemPrompt: row.system_prompt,
    category: row.category,
    stage: row.stage,
    isActive: row.is_active === 1,
    tokenEstimate: row.token_estimate,
    version: row.version,
    contextTags: row.context_tags ? JSON.parse(row.context_tags) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))

  return Response.json({ prompts })
}

// =============================================================================
// POST /api/admin/orchestrator/prompts - Create new prompt
// =============================================================================

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data, request } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json() as {
    nodeName: string
    displayName: string
    description?: string
    systemPrompt: string
    category: string
    stage?: string
    tokenEstimate?: number
    contextTags?: string[]
  }

  if (!body.nodeName || !body.displayName || !body.systemPrompt || !body.category) {
    return Response.json({ error: 'nodeName, displayName, systemPrompt, and category are required' }, { status: 400 })
  }

  // Check for duplicate node_name
  const existing = await env.DB.prepare('SELECT id FROM orchestrator_prompts WHERE node_name = ?')
    .bind(body.nodeName)
    .first()

  if (existing) {
    return Response.json({ error: 'A prompt with this node_name already exists' }, { status: 409 })
  }

  const result = await env.DB.prepare(`
    INSERT INTO orchestrator_prompts (node_name, display_name, description, system_prompt, category, stage, token_estimate, context_tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `)
    .bind(
      body.nodeName,
      body.displayName,
      body.description || null,
      body.systemPrompt,
      body.category,
      body.stage || null,
      body.tokenEstimate || null,
      body.contextTags ? JSON.stringify(body.contextTags) : '[]'
    )
    .first<{ id: string }>()

  return Response.json({ success: true, id: result?.id })
}
