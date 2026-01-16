/**
 * Public Orchestrator Prompt API
 * GET /api/orchestrator/prompts/:node_name
 *
 * Returns the system prompt for a given node, used at runtime by the orchestrator.
 * Falls back to hardcoded defaults if DB lookup fails.
 */

import type { Env } from '../../../env'
import type { OrchestratorPromptRow } from '../../../../src/db/schema'
import {
  ORCHESTRATOR_SYSTEM_PROMPT,
} from '../../../../src/prompts/orchestrator'
import {
  FEASIBILITY_SYSTEM_PROMPT,
} from '../../../../src/prompts/feasibility'
import {
  ENCLOSURE_SYSTEM_PROMPT,
  ENCLOSURE_VISION_SYSTEM_PROMPT,
} from '../../../../src/prompts/enclosure'
import {
  FIRMWARE_SYSTEM_PROMPT,
} from '../../../../src/prompts/firmware'
import {
  ENCLOSURE_REVIEW_PROMPT,
  FIRMWARE_REVIEW_PROMPT,
} from '../../../../src/prompts/review'
import {
  NAMING_SYSTEM_PROMPT,
} from '../../../../src/prompts/naming'

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
    // Try to load from database first
    const row = await env.DB.prepare(
      'SELECT system_prompt FROM orchestrator_prompts WHERE node_name = ? AND is_active = 1'
    )
      .bind(nodeName)
      .first<Pick<OrchestratorPromptRow, 'system_prompt'>>()

    if (row) {
      return Response.json({
        nodeName,
        systemPrompt: row.system_prompt,
        source: 'database',
      })
    }
  } catch (error) {
    // Database error, fall through to hardcoded
    console.error('Failed to load prompt from database:', error)
  }

  // Fall back to hardcoded
  const hardcoded = HARDCODED_PROMPTS[nodeName]
  if (hardcoded) {
    return Response.json({
      nodeName,
      systemPrompt: hardcoded,
      source: 'hardcoded',
    })
  }

  return Response.json({ error: 'Prompt not found' }, { status: 404 })
}
