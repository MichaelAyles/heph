/**
 * Admin Orchestrator Prompt Reset API
 * POST /api/admin/orchestrator/prompts/:node_name/reset
 * Resets a prompt to its hardcoded default
 */

import type { Env } from '../../../../../env'
import {
  ORCHESTRATOR_SYSTEM_PROMPT,
} from '../../../../../../src/prompts/orchestrator'
import {
  FEASIBILITY_SYSTEM_PROMPT,
} from '../../../../../../src/prompts/feasibility'
import {
  ENCLOSURE_SYSTEM_PROMPT,
  ENCLOSURE_VISION_SYSTEM_PROMPT,
} from '../../../../../../src/prompts/enclosure'
import {
  FIRMWARE_SYSTEM_PROMPT,
} from '../../../../../../src/prompts/firmware'
import {
  ENCLOSURE_REVIEW_PROMPT,
  FIRMWARE_REVIEW_PROMPT,
} from '../../../../../../src/prompts/review'
import {
  NAMING_SYSTEM_PROMPT,
} from '../../../../../../src/prompts/naming'

// Map node_name to hardcoded prompts
const HARDCODED_PROMPTS: Record<string, {
  displayName: string
  description: string
  systemPrompt: string
  category: string
  stage: string | null
  tokenEstimate: number
}> = {
  orchestrator: {
    displayName: 'Orchestrator Agent',
    description: 'Main orchestrator that coordinates the entire hardware design pipeline',
    systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
    category: 'agent',
    stage: null,
    tokenEstimate: 800,
  },
  feasibility: {
    displayName: 'Feasibility Analyzer',
    description: 'Analyzes user description to determine if the project is within system capabilities',
    systemPrompt: FEASIBILITY_SYSTEM_PROMPT,
    category: 'agent',
    stage: 'spec',
    tokenEstimate: 600,
  },
  enclosure: {
    displayName: 'Enclosure Generator',
    description: 'Generates parametric OpenSCAD code for enclosures based on PCB dimensions',
    systemPrompt: ENCLOSURE_SYSTEM_PROMPT,
    category: 'generator',
    stage: 'enclosure',
    tokenEstimate: 400,
  },
  enclosure_vision: {
    displayName: 'Vision Enclosure Generator',
    description: 'Blueprint-aware enclosure generator that uses product images for design intent',
    systemPrompt: ENCLOSURE_VISION_SYSTEM_PROMPT,
    category: 'generator',
    stage: 'enclosure',
    tokenEstimate: 500,
  },
  firmware: {
    displayName: 'Firmware Generator',
    description: 'Generates ESP32-C6 firmware (Arduino/PlatformIO) based on the final spec',
    systemPrompt: FIRMWARE_SYSTEM_PROMPT,
    category: 'generator',
    stage: 'firmware',
    tokenEstimate: 500,
  },
  naming: {
    displayName: 'Project Naming',
    description: 'Generates creative, distinctive project names based on the hardware description',
    systemPrompt: NAMING_SYSTEM_PROMPT,
    category: 'generator',
    stage: 'spec',
    tokenEstimate: 300,
  },
  enclosure_review: {
    displayName: 'Enclosure Reviewer',
    description: 'Reviews OpenSCAD code against the project specification',
    systemPrompt: ENCLOSURE_REVIEW_PROMPT,
    category: 'reviewer',
    stage: 'enclosure',
    tokenEstimate: 500,
  },
  firmware_review: {
    displayName: 'Firmware Reviewer',
    description: 'Reviews generated firmware code against the project specification and PCB design',
    systemPrompt: FIRMWARE_REVIEW_PROMPT,
    category: 'reviewer',
    stage: 'firmware',
    tokenEstimate: 500,
  },
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as { id: string; isAdmin: boolean } | undefined
  const nodeName = params.node_name as string

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
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
