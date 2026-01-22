/**
 * LangGraph Module
 *
 * PHAESTUS hardware design assistant powered by LangGraph.
 *
 * Usage:
 * ```typescript
 * import { runGraph } from '@/services/langgraph'
 *
 * const result = await runGraph('I want to build a plant monitor', {
 *   db: env.DB,
 *   llm: llmClient,
 * })
 *
 * console.log(result.response)  // Assistant's response
 * console.log(result.route)     // 'REJECT' | 'CLARIFY' | 'PROCEED' | null
 * console.log(result.projectId) // Set when project created
 * ```
 */

// Graph exports
export { runGraph, buildGraph } from './graph'
export type { GraphConfig, GraphResult, LLMClient } from './graph'

// State exports
export {
  PhaestusStateAnnotation,
  createInitialState,
  createMessage,
  createDebugStep,
} from './state'
export type {
  PhaestusState,
  PhaestusStateUpdate,
  ChatMessage,
  BlockSummary,
  ProjectSummary,
  UserIntent,
  DebugStep,
  DebugInfo,
} from './state'
