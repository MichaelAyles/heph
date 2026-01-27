/**
 * Requirements Extraction Prompt
 *
 * System prompt for extracting structured requirements from natural language
 */

// NOTE: System prompt is stored in database (orchestrator_prompts table)
// Use /api/langgraph/invoke/requirements

export function buildRequirementsPrompt(description: string): string {
  return `Extract requirements from this product description:

"${description}"

Respond with the JSON object only, no additional text.`
}
