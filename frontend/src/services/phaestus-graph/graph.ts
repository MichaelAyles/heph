/**
 * PHAESTUS Graph
 *
 * Main graph orchestration for the chat-first capability assessment pipeline.
 * Implements a simple state machine without LangGraph dependencies for
 * browser/Cloudflare Worker compatibility.
 */

import type { PhaestusState } from './state'
import {
  createInitialState,
  addDebugStep,
  setDebugSystemPrompt,
  setDebugHardRejection,
  finalizeDebug,
} from './state'
import { hardRejectionNode, checkHardRejectionFromDb } from './nodes/hard-rejection'
import { capabilityAssessNode, getActiveSystemPrompt, type LLMClient } from './nodes/capability-assess'
import { rejectNode } from './nodes/reject'
import { clarifyNode } from './nodes/clarify'
import { proceedNode } from './nodes/proceed'
import type { HardRejectionCriteria, SystemPrompt } from '../../db/schema'
import type { D1Database } from './types'

// =============================================================================
// Graph Configuration
// =============================================================================

export interface GraphConfig {
  db?: D1Database
  llm: LLMClient
  hardRejectionCriteria?: HardRejectionCriteria[]
  systemPrompt?: SystemPrompt
}

export interface GraphResult {
  state: PhaestusState
  response: string
  route: 'REJECT' | 'CLARIFY' | 'PROCEED' | null
  projectId: string | null
  sessionId: string
}

// =============================================================================
// Graph Execution
// =============================================================================

/**
 * Run the full PHAESTUS graph pipeline
 */
export async function runGraph(
  message: string,
  config: GraphConfig,
  existingSessionId?: string
): Promise<GraphResult> {
  // Initialize state
  let state = createInitialState(message, existingSessionId)
  state = addDebugStep(state, 'init', { message, sessionId: existingSessionId })

  // Step 1: Hard rejection check (pattern matching, no LLM)
  const hardRejectionStart = Date.now()
  if (config.db) {
    const rejection = await checkHardRejectionFromDb(message, config.db)
    state = setDebugHardRejection(
      state,
      rejection.criteriaCount ?? 0,
      rejection.rejected ? rejection.matchedPattern ?? null : null
    )
    state = addDebugStep(
      state,
      'hard_rejection_check',
      { message },
      rejection,
      Date.now() - hardRejectionStart
    )

    if (rejection.rejected) {
      // Create a mock criteria array for the node
      const mockCriteria: HardRejectionCriteria[] = [{
        id: 0,
        pattern: rejection.matchedPattern ?? '',
        reason: rejection.reason!,
        category: rejection.category as 'safety' | 'capability' | 'legal',
        isActive: true,
        createdAt: new Date().toISOString(),
      }]
      state = await hardRejectionNode(state, mockCriteria)
      state = addDebugStep(state, 'hard_rejection_node', null, { reason: rejection.reason })
      state = finalizeDebug(state)

      // Return early - no need for LLM call
      const lastMessage = state.messages[state.messages.length - 1]
      return {
        state,
        response: lastMessage?.content ?? '',
        route: 'REJECT',
        projectId: null,
        sessionId: state.sessionId,
      }
    }
  } else if (config.hardRejectionCriteria) {
    state = setDebugHardRejection(state, config.hardRejectionCriteria.length, null)
    state = await hardRejectionNode(state, config.hardRejectionCriteria)
    state = addDebugStep(
      state,
      'hard_rejection_check',
      { criteriaCount: config.hardRejectionCriteria.length },
      { rejected: state.route === 'REJECT' },
      Date.now() - hardRejectionStart
    )
    if (state.route === 'REJECT') {
      state = finalizeDebug(state)
      const lastMessage = state.messages[state.messages.length - 1]
      return {
        state,
        response: lastMessage?.content ?? '',
        route: 'REJECT',
        projectId: null,
        sessionId: state.sessionId,
      }
    }
  }

  // Step 2: Get system prompt (from DB or config)
  let systemPrompt = config.systemPrompt
  if (!systemPrompt && config.db) {
    systemPrompt = await getActiveSystemPrompt(config.db) ?? undefined
  }
  if (!systemPrompt) {
    // Use default prompt if none configured
    systemPrompt = getDefaultSystemPrompt()
  }

  // Track system prompt in debug
  state = setDebugSystemPrompt(
    state,
    systemPrompt.name,
    systemPrompt.capabilityAssessmentBase
  )
  state = addDebugStep(state, 'system_prompt_loaded', null, { name: systemPrompt.name })

  // Step 3: Capability assessment (LLM call)
  const llmStart = Date.now()
  state = await capabilityAssessNode(state, config.llm, systemPrompt)
  state = addDebugStep(
    state,
    'capability_assess',
    { userRequest: state.userRequest },
    { assessment: state.capabilityAssessment, route: state.route },
    Date.now() - llmStart
  )

  // Check for errors
  if (state.error) {
    const errorMessage = state.error
    state = addDebugStep(state, 'error', null, { error: errorMessage })
    state = finalizeDebug(state)
    return {
      state,
      response: errorMessage,
      route: null,
      projectId: null,
      sessionId: state.sessionId,
    }
  }

  // Step 4: Route based on assessment
  const routeStart = Date.now()
  switch (state.route) {
    case 'REJECT':
      state = rejectNode(state)
      state = addDebugStep(state, 'reject_node', null, null, Date.now() - routeStart)
      break
    case 'CLARIFY':
      state = clarifyNode(state)
      state = addDebugStep(state, 'clarify_node', null, null, Date.now() - routeStart)
      break
    case 'PROCEED':
      state = await proceedNode(state, config.db)
      state = addDebugStep(
        state,
        'proceed_node',
        null,
        { projectId: state.projectId },
        Date.now() - routeStart
      )
      break
    default:
      // Should not happen, but handle gracefully
      state = clarifyNode(state)
      state = addDebugStep(state, 'clarify_node_fallback', null, null, Date.now() - routeStart)
      break
  }

  // Finalize debug timing
  state = finalizeDebug(state)

  // Return result
  const lastMessage = state.messages[state.messages.length - 1]
  return {
    state,
    response: lastMessage?.content ?? '',
    route: state.route,
    projectId: state.projectId,
    sessionId: state.sessionId,
  }
}

// =============================================================================
// Default System Prompt
// =============================================================================

function getDefaultSystemPrompt(): SystemPrompt {
  return {
    id: 0,
    name: 'default',
    description: 'Default system prompt',
    capabilityAssessmentBase: `You are PHAESTUS, an AI hardware design assistant. Assess whether a user's hardware project can be built with available components.

Available Components:
- MCU: ESP32-C6 (WiFi 6, BLE 5.3, Zigbee/Thread)
- Sensors: BME280, SHT40, LIS3DH, VEML7700, VL53L0X, PIR
- Power: LiPo+TP4056, buck converter (7-24V), 2xAA/AAA boost, CR2032
- Outputs: WS2812B LEDs, piezo buzzer, relay, DRV8833 motor driver
- Displays: 0.96" OLED (I2C), SPI LCD
- Input: Up to 4 buttons, rotary encoder

Respond with JSON:
{
  "canBuild": boolean,
  "confidence": number (0-1),
  "reasoning": "Brief explanation",
  "missingCapabilities": ["list of missing features"],
  "suggestedAlternatives": ["list of alternatives"]
}`,
    designConstraints: `Hard Rejections:
- FPGA, high voltage (>24V), mains power
- Safety-critical, medical devices
- Complex RF, precision analog`,
    cadCapability: null,
    firmwareCapability: null,
    isActive: true,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

// =============================================================================
// Exports
// =============================================================================

export { createInitialState } from './state'
export type { PhaestusState, ChatMessage, BlockSummary } from './state'
export type { HardRejectionResult } from './nodes/hard-rejection'
export type { LLMClient } from './nodes/capability-assess'
