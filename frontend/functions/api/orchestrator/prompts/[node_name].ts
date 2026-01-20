/**
 * Public Orchestrator Prompt API
 * GET /api/orchestrator/prompts/:node_name
 *
 * Returns the full prompt configuration for a given node, used at runtime by the orchestrator.
 * Includes enhanced fields: inputSchema, outputSchema, contextSelector, iterationConfig, etc.
 * Falls back to hardcoded defaults if DB lookup fails.
 */

import type { Env } from '../../../env'
import { createLogger } from '../../../lib/logger'
import type { OrchestratorPromptRow } from '../../../../src/db/schema'
import { ORCHESTRATOR_SYSTEM_PROMPT } from '../../../../src/prompts/orchestrator'
import { FEASIBILITY_SYSTEM_PROMPT } from '../../../../src/prompts/feasibility'
import {
  ENCLOSURE_SYSTEM_PROMPT,
  ENCLOSURE_VISION_SYSTEM_PROMPT,
} from '../../../../src/prompts/enclosure'
import { FIRMWARE_SYSTEM_PROMPT } from '../../../../src/prompts/firmware'
import { ENCLOSURE_REVIEW_PROMPT, FIRMWARE_REVIEW_PROMPT } from '../../../../src/prompts/review'
import { NAMING_SYSTEM_PROMPT } from '../../../../src/prompts/naming'

// Hardcoded fallback prompts
const HARDCODED_PROMPTS: Record<string, string> = {
  orchestrator: ORCHESTRATOR_SYSTEM_PROMPT,
  feasibility: FEASIBILITY_SYSTEM_PROMPT,
  enclosure: ENCLOSURE_SYSTEM_PROMPT,
  enclosure_vision: ENCLOSURE_VISION_SYSTEM_PROMPT,
  firmware: FIRMWARE_SYSTEM_PROMPT,
  naming: NAMING_SYSTEM_PROMPT,
  enclosure_review: ENCLOSURE_REVIEW_PROMPT,
  firmware_review: FIRMWARE_REVIEW_PROMPT,
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params } = context
  const nodeName = params.node_name as string

  try {
    // Try to load from database first - fetch all fields including enhanced ones
    const row = await env.DB.prepare(
      `
      SELECT
        id, node_name, display_name, description, system_prompt, category, stage,
        is_active, token_estimate, version, context_tags, created_at, updated_at,
        input_schema, output_schema, context_selector, iteration_config,
        user_prompt_template, output_format
      FROM orchestrator_prompts
      WHERE node_name = ? AND is_active = 1
    `
    )
      .bind(nodeName)
      .first<OrchestratorPromptRow>()

    if (row) {
      return Response.json({
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
        // Enhanced fields
        inputSchema: row.input_schema ? JSON.parse(row.input_schema) : null,
        outputSchema: row.output_schema ? JSON.parse(row.output_schema) : null,
        contextSelector: row.context_selector ? JSON.parse(row.context_selector) : null,
        iterationConfig: row.iteration_config ? JSON.parse(row.iteration_config) : null,
        userPromptTemplate: row.user_prompt_template,
        outputFormat: row.output_format || 'json',
        source: 'database',
      })
    }
  } catch (error) {
    // Database error, fall through to hardcoded
    const logger = createLogger(env)
    await logger.warn('api', 'Failed to load prompt from database, using hardcoded', {
      nodeName,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  // Fall back to hardcoded
  const hardcoded = HARDCODED_PROMPTS[nodeName]
  if (hardcoded) {
    return Response.json({
      nodeName,
      systemPrompt: hardcoded,
      source: 'hardcoded',
      // Enhanced fields not available for hardcoded prompts
      inputSchema: null,
      outputSchema: null,
      contextSelector: null,
      iterationConfig: null,
      userPromptTemplate: null,
      outputFormat: 'json',
    })
  }

  return Response.json({ error: 'Prompt not found' }, { status: 404 })
}
