/**
 * Admin Orchestrator Prompt API - Single Prompt Operations
 * GET/PUT/DELETE for individual prompts by node_name
 */

import type { Env } from '../../../../env'
import type { OrchestratorPromptRow } from '../../../../../src/db/schema'

// Hardcoded defaults for reset functionality
const HARDCODED_PROMPTS: Record<string, { displayName: string; description: string; systemPrompt: string; category: string; stage: string | null; tokenEstimate: number }> = {
  orchestrator: {
    displayName: 'Orchestrator Agent',
    description: 'Main orchestrator that coordinates the entire hardware design pipeline',
    systemPrompt: `You are PHAESTUS, the central orchestrator for hardware design.

## Your Role
You are the BRAIN. Specialists execute tasks and return FULL results to you. You make ALL decisions.

## Workflow

### Spec Stage
1. analyze_feasibility → answer_questions_auto → generate_blueprints → select_blueprint
2. generate_project_names → select_project_name (pick best or in DESIGN IT mode, let user choose)
3. finalize_spec → mark_stage_complete('spec')

### PCB Stage
1. select_pcb_blocks → validate_cross_stage
2. mark_stage_complete('pcb')

### Enclosure Stage (Generate → Review → Decide)
1. generate_enclosure(style) → Returns full OpenSCAD code to you
2. review_enclosure() → Analyst returns { score, issues[], verdict }
3. YOU DECIDE based on review:
   - score>=85 AND verdict="accept" → accept_and_render('enclosure') → mark_stage_complete('enclosure')
   - score<85 OR verdict="revise" → MUST call generate_enclosure with feedback parameter containing the issues
   - Max 3 attempts, then ask user

CRITICAL: When revising, you MUST pass feedback like:
generate_enclosure(style="desktop", feedback="Fix issues: 1) PCB clearance too tight - increase to 1mm. 2) USB cutout wrong - use difference() not union()")

### Firmware Stage (Generate → Review → Decide)
1. generate_firmware() → Returns full code files to you
2. review_firmware() → Analyst returns { score, issues[], verdict }
3. YOU DECIDE based on review:
   - score>=85 AND verdict="accept" → accept_and_render('firmware') → mark_stage_complete('firmware')
   - score<85 OR verdict="revise" → MUST call generate_firmware with feedback parameter

CRITICAL: When revising, you MUST pass feedback like:
generate_firmware(feedback="Fix issues: 1) Missing deep sleep. 2) Wrong pin for LED")

### Export Stage
1. mark_stage_complete('export')

## Critical Rules
- You see ALL specialist outputs - use them to make informed decisions
- Always review before accepting (enclosure, firmware)
- NEVER regenerate without feedback - extract issues from review and pass them in the feedback parameter
- After each tool result, immediately call the next tool
- Track revision attempts - after 3 failed attempts, ask the user

## Decision Making
- VIBE IT mode: Make sensible defaults, minimize user interaction
- FIX IT mode: Ask user on major decisions only
- DESIGN IT mode: Present options at each step`,
    category: 'agent',
    stage: null,
    tokenEstimate: 800,
  },
  feasibility: {
    displayName: 'Feasibility Analyzer',
    description: 'Analyzes user description to determine if the project is within system capabilities',
    systemPrompt: `You are PHAESTUS, an expert hardware design assistant. Your task is to analyze a product description and determine if it can be manufactured using the available components.`,
    category: 'agent',
    stage: 'spec',
    tokenEstimate: 600,
  },
  enclosure_review: {
    displayName: 'Enclosure Reviewer',
    description: 'Reviews OpenSCAD code against the project specification',
    systemPrompt: `You are an expert enclosure design analyst for 3D-printed hardware projects.`,
    category: 'reviewer',
    stage: 'enclosure',
    tokenEstimate: 500,
  },
  firmware_review: {
    displayName: 'Firmware Reviewer',
    description: 'Reviews generated firmware code against the project specification and PCB design',
    systemPrompt: `You are an expert embedded systems firmware analyst specializing in ESP32-C6.`,
    category: 'reviewer',
    stage: 'firmware',
    tokenEstimate: 500,
  },
}

// =============================================================================
// GET /api/admin/orchestrator/prompts/:node_name
// =============================================================================

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined
  const nodeName = params.node_name as string

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const row = await env.DB.prepare('SELECT * FROM orchestrator_prompts WHERE node_name = ?')
    .bind(nodeName)
    .first<OrchestratorPromptRow>()

  if (!row) {
    return Response.json({ error: 'Prompt not found' }, { status: 404 })
  }

  const prompt = {
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
    hasDefault: nodeName in HARDCODED_PROMPTS,
  }

  return Response.json({ prompt })
}

// =============================================================================
// PUT /api/admin/orchestrator/prompts/:node_name - Update prompt
// =============================================================================

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { env, data, params, request } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined
  const nodeName = params.node_name as string

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json() as {
    displayName?: string
    description?: string
    systemPrompt?: string
    category?: string
    stage?: string | null
    isActive?: boolean
    tokenEstimate?: number | null
    contextTags?: string[]
  }

  // Check if prompt exists
  const existing = await env.DB.prepare('SELECT id, version FROM orchestrator_prompts WHERE node_name = ?')
    .bind(nodeName)
    .first<{ id: string; version: number }>()

  if (!existing) {
    return Response.json({ error: 'Prompt not found' }, { status: 404 })
  }

  // Build update query dynamically
  const updates: string[] = []
  const values: (string | number | null)[] = []

  if (body.displayName !== undefined) {
    updates.push('display_name = ?')
    values.push(body.displayName)
  }
  if (body.description !== undefined) {
    updates.push('description = ?')
    values.push(body.description)
  }
  if (body.systemPrompt !== undefined) {
    updates.push('system_prompt = ?')
    values.push(body.systemPrompt)
  }
  if (body.category !== undefined) {
    updates.push('category = ?')
    values.push(body.category)
  }
  if (body.stage !== undefined) {
    updates.push('stage = ?')
    values.push(body.stage)
  }
  if (body.isActive !== undefined) {
    updates.push('is_active = ?')
    values.push(body.isActive ? 1 : 0)
  }
  if (body.tokenEstimate !== undefined) {
    updates.push('token_estimate = ?')
    values.push(body.tokenEstimate)
  }
  if (body.contextTags !== undefined) {
    updates.push('context_tags = ?')
    values.push(JSON.stringify(body.contextTags))
  }

  if (updates.length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Increment version and update timestamp
  updates.push('version = ?')
  values.push(existing.version + 1)
  updates.push("updated_at = datetime('now')")

  // Add node_name for WHERE clause
  values.push(nodeName)

  await env.DB.prepare(`UPDATE orchestrator_prompts SET ${updates.join(', ')} WHERE node_name = ?`)
    .bind(...values)
    .run()

  return Response.json({ success: true, version: existing.version + 1 })
}

// =============================================================================
// DELETE /api/admin/orchestrator/prompts/:node_name
// =============================================================================

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined
  const nodeName = params.node_name as string

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Don't allow deleting core prompts
  if (nodeName in HARDCODED_PROMPTS) {
    return Response.json({ error: 'Cannot delete core prompt. Use reset instead.' }, { status: 400 })
  }

  const result = await env.DB.prepare('DELETE FROM orchestrator_prompts WHERE node_name = ?')
    .bind(nodeName)
    .run()

  if (result.meta.changes === 0) {
    return Response.json({ error: 'Prompt not found' }, { status: 404 })
  }

  return Response.json({ success: true })
}

// =============================================================================
// POST /api/admin/orchestrator/prompts/:node_name/reset - Reset to default
// =============================================================================

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data, params, request } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined
  const nodeName = params.node_name as string

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Check if this is a reset action
  const url = new URL(request.url)
  if (!url.pathname.endsWith('/reset')) {
    return Response.json({ error: 'Invalid action' }, { status: 400 })
  }

  const defaultPrompt = HARDCODED_PROMPTS[nodeName]
  if (!defaultPrompt) {
    return Response.json({ error: 'No default available for this prompt' }, { status: 400 })
  }

  // Get current version
  const existing = await env.DB.prepare('SELECT version FROM orchestrator_prompts WHERE node_name = ?')
    .bind(nodeName)
    .first<{ version: number }>()

  if (!existing) {
    return Response.json({ error: 'Prompt not found' }, { status: 404 })
  }

  await env.DB.prepare(`
    UPDATE orchestrator_prompts
    SET display_name = ?, description = ?, system_prompt = ?, category = ?, stage = ?,
        token_estimate = ?, version = ?, updated_at = datetime('now')
    WHERE node_name = ?
  `)
    .bind(
      defaultPrompt.displayName,
      defaultPrompt.description,
      defaultPrompt.systemPrompt,
      defaultPrompt.category,
      defaultPrompt.stage,
      defaultPrompt.tokenEstimate,
      existing.version + 1,
      nodeName
    )
    .run()

  return Response.json({ success: true, version: existing.version + 1 })
}
