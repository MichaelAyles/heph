/**
 * Orchestrator Types
 *
 * Type definitions for the hardware design orchestrator service.
 */

import type {
  ProjectSpec,
  PcbBlock,
  PersistedOrchestratorState,
} from '@/db/schema'
import type { ChatMessage } from '../llm'
import type { ValidationResult } from '@/prompts/validation'

// =============================================================================
// CORE TYPES
// =============================================================================

export type OrchestratorMode = 'vibe_it' | 'fix_it' | 'design_it'

export type OrchestratorStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'validating'
  | 'fixing'
  | 'complete'
  | 'error'

export type OrchestratorStage = 'spec' | 'pcb' | 'enclosure' | 'firmware' | 'export'

export interface OrchestratorHistoryItem {
  id: string
  timestamp: string
  type: 'tool_call' | 'tool_result' | 'validation' | 'error' | 'fix' | 'progress' | 'thinking'
  stage: OrchestratorStage
  action: string
  result?: string
  details?: Record<string, unknown>
}

export interface OrchestratorState {
  projectId: string
  status: OrchestratorStatus
  mode: OrchestratorMode
  currentStage: OrchestratorStage
  history: OrchestratorHistoryItem[]
  currentAction: string | null
  error: string | null
  validationResult: ValidationResult | null
  iterationCount: number
  startedAt: string | null
  completedAt: string | null
}

export interface OrchestratorCallbacks {
  onStateChange: (state: OrchestratorState) => void
  onSpecUpdate: (spec: Partial<ProjectSpec>) => Promise<void>
  onComplete: (state: OrchestratorState) => void
  onError: (error: Error) => void
  onUserInputRequired?: (question: string, options?: string[]) => Promise<string>
}

// =============================================================================
// TOOL CONTEXT
// =============================================================================

/**
 * Context passed to each tool handler.
 * Contains everything needed to execute tools independently.
 */
export interface OrchestratorContext {
  projectId: string
  mode: OrchestratorMode
  currentSpec: ProjectSpec | null
  availableBlocks: PcbBlock[]
  callbacks: OrchestratorCallbacks

  // State accessors
  getCurrentStage: () => OrchestratorStage

  // State mutators
  updateSpec: (spec: ProjectSpec | null) => void
  setSpec: (partial: Partial<ProjectSpec>) => Promise<void>
  addHistoryItem: (item: Omit<OrchestratorHistoryItem, 'id' | 'timestamp'>) => void
  updateState: (updates: Partial<OrchestratorState>) => void

  // Shared state for cross-tool communication
  generatedNames: Array<{ name: string; style: string; reasoning: string }>
  selectedProjectName: string | null
  setGeneratedNames: (names: Array<{ name: string; style: string; reasoning: string }>) => void
  setSelectedProjectName: (name: string | null) => void
}

// =============================================================================
// TOOL TYPES
// =============================================================================

export type ToolResult = Record<string, unknown>

export type ToolHandler = (
  ctx: OrchestratorContext,
  args: Record<string, unknown>
) => Promise<ToolResult>

export interface ToolRegistry {
  [toolName: string]: ToolHandler
}

// =============================================================================
// PERSISTENCE TYPES
// =============================================================================

export type PersistenceStatus = PersistedOrchestratorState['status']

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// Re-export for convenience
export type { ChatMessage, ProjectSpec, PcbBlock, ValidationResult, PersistedOrchestratorState }
