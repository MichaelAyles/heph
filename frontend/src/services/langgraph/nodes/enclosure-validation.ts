/**
 * Enclosure Validation Node
 *
 * Validates OpenSCAD code for syntax and design constraints.
 * Checks for common issues that would prevent printing or assembly.
 *
 * Context from @variables (via projectState):
 * - @pcb.boardSize: Board dimensions for constraint checking
 * - @finalSpec: Final specification with inputs/outputs for feature checking
 *
 * Runtime inputs (must be passed):
 * - openScadCode: Code being validated (not yet saved to spec)
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'

// =============================================================================
// Schemas
// =============================================================================

export const EnclosureValidationInputSchema = z.object({
  // Runtime input - the code being validated (may not be saved yet)
  openScadCode: z.string().min(1, 'OpenSCAD code is required'),
})
export type EnclosureValidationInput = z.infer<typeof EnclosureValidationInputSchema>

const ValidationIssueSchema = z.object({
  severity: z.enum(['critical', 'warning', 'suggestion']),
  category: z.string(),
  description: z.string(),
  location: z.string().optional(),
  fix: z.string(),
})

export const EnclosureValidationOutputSchema = z.object({
  isValid: z.boolean(),
  issues: z.array(ValidationIssueSchema),
  summary: z.string(),
})
export type EnclosureValidationOutput = z.infer<typeof EnclosureValidationOutputSchema>

// =============================================================================
// Helpers
// =============================================================================

interface ValidationResult {
  isValid: boolean
  issues: Array<{
    severity: 'critical' | 'warning' | 'suggestion'
    category: string
    description: string
    location?: string
    fix: string
  }>
  summary: string
}

function parseValidationResponse(content: string): ValidationResult {
  // Try to extract JSON from the response
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return {
      isValid: false,
      issues: [
        {
          severity: 'critical',
          category: 'parse_error',
          description: 'Failed to parse validation response',
          fix: 'Regenerate the code',
        },
      ],
      summary: 'Validation response could not be parsed',
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    return {
      isValid: parsed.isValid ?? false,
      issues: parsed.issues ?? [],
      summary: parsed.summary ?? 'Validation complete',
    }
  } catch {
    return {
      isValid: false,
      issues: [
        {
          severity: 'critical',
          category: 'parse_error',
          description: 'Invalid JSON in validation response',
          fix: 'Regenerate the code',
        },
      ],
      summary: 'Validation response contained invalid JSON',
    }
  }
}

// =============================================================================
// Node Implementation
// =============================================================================

async function invokeEnclosureValidation(
  input: EnclosureValidationInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<EnclosureValidationOutput>> {
  // System prompt comes from database with @variables already expanded
  const systemPrompt = context.systemPrompt

  // Build user prompt with the code to validate
  const userPrompt = `Validate the following OpenSCAD code for an enclosure design. Check for syntax errors, design constraints, and manufacturing issues.

OpenSCAD Code:
\`\`\`openscad
${input.openScadCode}
\`\`\`

Return a JSON object with: isValid (boolean), issues (array of {severity, category, description, location?, fix}), and summary (string).`

  const response = await context.llmChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: config.temperature ?? 0.2,
    model: config.model,
    projectId: context.projectId,
  })

  const result = parseValidationResponse(response.content)

  return {
    output: result,
    rawResponse: response.content,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
  }
}

// =============================================================================
// Node Definition
// =============================================================================

export const enclosureValidationNode: LangGraphNode<
  typeof EnclosureValidationInputSchema,
  typeof EnclosureValidationOutputSchema
> = {
  name: 'enclosure_validation',
  description: 'Validate OpenSCAD code for syntax and design constraints',
  type: 'chat',
  multimodal: false,
  inputSchema: EnclosureValidationInputSchema,
  outputSchema: EnclosureValidationOutputSchema,
  defaultTemperature: 0.2,
  category: 'enclosure',
  contextTypes: ['projectState'], // Enables @pcb.boardSize, @finalSpec for constraint checking
  invoke: invokeEnclosureValidation,
}

// Register the node
registerNode(enclosureValidationNode)
