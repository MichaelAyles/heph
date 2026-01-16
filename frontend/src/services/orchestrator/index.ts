/**
 * Orchestrator Module
 *
 * Re-exports the orchestrator service for backward compatibility.
 * Import from '@/services/orchestrator' works the same as before.
 */

// Main class and factory
export { HardwareOrchestrator, createOrchestrator } from './orchestrator'

// Types
export type {
  OrchestratorMode,
  OrchestratorStatus,
  OrchestratorStage,
  OrchestratorHistoryItem,
  OrchestratorState,
  OrchestratorCallbacks,
  OrchestratorContext,
  ToolResult,
  ToolHandler,
  ToolRegistry,
} from './types'

// Tool registry (for advanced usage)
export { toolRegistry, getTool, hasTool, getToolNames } from './tools'

// Helpers (for testing or extension)
export { compressToolResult } from './helpers/compression'
export { extractEnclosureDimensions, extractEnclosureFeatures } from './helpers/code-parsing'
export { trimConversationHistory, persistState, buildDefaultStages } from './helpers/state'
export { callLlmWithJson, callLlmWithCode } from './helpers/llm-helpers'
