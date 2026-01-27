/**
 * Refinement prompt stubs
 * Used to gather additional details about the project.
 */

import type { FeasibilityAnalysis, Decision } from '../db/schema'

// NOTE: System prompt is stored in database (orchestrator_prompts table)
// Use /api/langgraph/invoke/refinement

export function buildRefinementPrompt(
  description: string,
  feasibility: FeasibilityAnalysis,
  decisions: Decision[]
): string {
  const decisionsSummary = decisions.map((d) => `- ${d.question}: ${d.answer}`).join('\n')

  return `Project: ${description}

Feasibility Score: ${feasibility.overallScore}%

Previous Decisions:
${decisionsSummary || 'None yet'}

Based on this information, determine if more questions are needed to finalize the design, or if we have enough detail to proceed.`
}
