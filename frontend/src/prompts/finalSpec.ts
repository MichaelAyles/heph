/**
 * Final Specification Generation Prompt
 *
 * Generates a comprehensive, locked product specification
 * based on the description, decisions, and selected blueprint.
 */

// NOTE: System prompt is stored in database (orchestrator_prompts table)
// Use /api/langgraph/invoke/finalization

export function buildFinalSpecPrompt(
  description: string,
  feasibility: object,
  decisions: { question: string; answer: string }[],
  selectedBlueprintPrompt: string
): string {
  const decisionsText = decisions.map((d) => `- ${d.question}: ${d.answer}`).join('\n')

  return `Generate a complete product specification for this device.

Original Description:
"${description}"

Feasibility Analysis:
${JSON.stringify(feasibility, null, 2)}

User Decisions:
${decisionsText}

Selected Design Style:
${selectedBlueprintPrompt}

Generate the final specification JSON. Be comprehensive and realistic with estimates.`
}
