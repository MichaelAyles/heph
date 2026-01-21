/**
 * PHAESTUS Graph - Chat-First Capability Assessment
 *
 * A simple state machine for assessing hardware project feasibility
 * through natural language conversation.
 *
 * Usage:
 * ```typescript
 * import { runGraph } from '@/services/phaestus-graph'
 *
 * const result = await runGraph('I want to build a plant monitor', {
 *   db: env.DB,
 *   llm: llmClient,
 * })
 *
 * console.log(result.response) // "Great news! I can help you build this..."
 * console.log(result.route)    // "PROCEED"
 * console.log(result.projectId) // "abc123..."
 * ```
 */

// Main exports
export { runGraph, createInitialState } from './graph'
export type {
  GraphConfig,
  GraphResult,
  PhaestusState,
  ChatMessage,
  BlockSummary,
  LLMClient,
} from './graph'

// Node exports (for testing)
export { checkHardRejection, hardRejectionNode } from './nodes/hard-rejection'
export { capabilityAssessNode, parseAssessmentResponse, determineRoute } from './nodes/capability-assess'
export { rejectNode, generateRejectionMessage } from './nodes/reject'
export { clarifyNode, generateClarifyingQuestions } from './nodes/clarify'
export { proceedNode, generateProceedMessage } from './nodes/proceed'

// State helpers
export {
  addMessage,
  setAssessment,
  setRoute,
  setProjectId,
  setError,
  incrementIteration,
} from './state'

// Debug types
export type { DebugInfo, DebugStep } from './state'
