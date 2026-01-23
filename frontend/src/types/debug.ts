/**
 * Debug Types for Chat Pipeline
 *
 * Types for visualizing execution traces in the debug panel.
 * Moved from phaestus-graph during cleanup.
 */

export interface DebugStep {
  node: string
  timestamp: string
  input?: unknown
  output?: unknown
  duration?: number
}

export interface DebugInfo {
  // Execution trace
  steps: DebugStep[]

  // System prompt used
  systemPromptName: string | null
  systemPromptContent: string | null

  // Hard rejection check
  hardRejectionCriteriaCount: number
  hardRejectionMatched: string | null

  // LLM call details
  llmPrompt: string | null
  llmRawResponse: string | null

  // Timing
  startTime: string
  endTime: string | null
  totalDuration: number | null
}
