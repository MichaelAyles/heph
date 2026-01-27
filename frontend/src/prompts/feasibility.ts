/**
 * Feasibility prompt stubs
 * This file provides minimal implementations for the spec stage.
 * The full capability assessment is now handled by the chat/LangGraph interface.
 */

// NOTE: System prompt is stored in database (orchestrator_prompts table)
// Use /api/langgraph/invoke/feasibility

export function buildFeasibilityPrompt(description: string): string {
  return `Analyze this hardware project for feasibility:

${description}

Determine if this can be built with our available components. If not manufacturable, provide suggested revisions.`
}
