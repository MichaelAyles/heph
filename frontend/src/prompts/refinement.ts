/**
 * Refinement prompt stubs
 * Used to gather additional details about the project.
 */

import type { FeasibilityAnalysis, Decision } from '../db/schema'

export const REFINEMENT_SYSTEM_PROMPT = `You are a hardware design refinement assistant. Based on the project description and feasibility analysis, ask clarifying questions to finalize the specification.

Respond with JSON containing:
{
  "complete": boolean,
  "additionalQuestions": [{ "id": string, "question": string, "options": string[] }]
}

If all necessary details are captured and no more questions are needed, set complete: true.`

export function buildRefinementPrompt(
  description: string,
  feasibility: FeasibilityAnalysis,
  decisions: Decision[]
): string {
  const decisionsSummary = decisions
    .map((d) => `- ${d.question}: ${d.answer}`)
    .join('\n')

  return `Project: ${description}

Feasibility Score: ${feasibility.overallScore}%

Previous Decisions:
${decisionsSummary || 'None yet'}

Based on this information, determine if more questions are needed to finalize the design, or if we have enough detail to proceed.`
}
