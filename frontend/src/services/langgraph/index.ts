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
 *   userProjects: [], // User's existing projects
 *   threadId: 'session-123', // For conversation persistence
 * })
 *
 * console.log(result.response)  // Assistant's response
 * console.log(result.intent)    // 'new_project' | 'load_project' | 'question'
 * console.log(result.projectId) // Set when project loaded
 * ```
 */

// Graph exports
export { runGraph, buildGraph, compiledGraph } from './graph'
export type { GraphConfig, GraphResult } from './graph'

// State exports
export {
  PhaestusStateSchema,
  createDebugStep,
  createInitialDebugInfo,
  getMessageContent,
  // Schemas for validation
  ProjectSummarySchema,
  BlockSummarySchema,
  UserIntentSchema,
  DebugStepSchema,
  DebugInfoSchema,
} from './state'

export type {
  PhaestusState,
  PhaestusStateUpdate,
  ProjectSummary,
  BlockSummary,
  UserIntent,
  DebugStep,
  DebugInfo,
} from './state'
