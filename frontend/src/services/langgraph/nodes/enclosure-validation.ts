/**
 * Enclosure Validation Node
 *
 * Validates OpenSCAD code for syntax and design constraints.
 * Checks for common issues that would prevent printing or assembly.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'
import {
  buildValidationPrompt,
  parseValidationResponse,
} from '../../../prompts/enclosure-validation'

// =============================================================================
// Schemas
// =============================================================================

export const EnclosureValidationInputSchema = z.object({
  openScadCode: z.string().min(1, 'OpenSCAD code is required'),
  pcbWidth: z.number().positive(),
  pcbHeight: z.number().positive(),
  pcbThickness: z.number().positive().default(1.6),
  hasOled: z.boolean().default(false),
  hasUsb: z.boolean().default(true),
  hasButtons: z.boolean().default(false),
  requirements: z.array(z.string()).optional().default([]),
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
// Node Implementation
// =============================================================================

async function invokeEnclosureValidation(
  input: EnclosureValidationInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<EnclosureValidationOutput>> {
  // System prompt comes from database (required)
  const systemPrompt = context.systemPrompt

  const userPrompt = buildValidationPrompt(input.openScadCode, {
    pcbWidth: input.pcbWidth,
    pcbHeight: input.pcbHeight,
    hasOled: input.hasOled,
    hasUsb: input.hasUsb,
    hasButtons: input.hasButtons,
  })

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
  invoke: invokeEnclosureValidation,
}

// Register the node
registerNode(enclosureValidationNode)
