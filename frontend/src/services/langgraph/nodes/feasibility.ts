/**
 * Feasibility Node
 *
 * Analyzes project descriptions to determine if they can be built
 * with available hardware components.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'
import { FEASIBILITY_SYSTEM_PROMPT, buildFeasibilityPrompt } from '../../../prompts/feasibility'

// =============================================================================
// Schemas
// =============================================================================

export const FeasibilityInputSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  availableBlocks: z.array(z.string()).optional(),
})
export type FeasibilityInput = z.infer<typeof FeasibilityInputSchema>

// Category schemas
const CommunicationSchema = z.object({
  type: z.string(),
  confidence: z.number(),
  notes: z.string(),
})

const ProcessingSchema = z.object({
  level: z.string(),
  confidence: z.number(),
  notes: z.string(),
})

const PowerSchema = z.object({
  options: z.array(z.string()),
  confidence: z.number(),
  notes: z.string(),
})

const ItemsSchema = z.object({
  items: z.array(z.string()),
  confidence: z.number().optional(),
  notes: z.string().optional(),
})

const OpenQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.string()).optional().default([]),
  category: z.string().optional(),
  impact: z.string().optional(),
})

const SuggestedRevisionsSchema = z
  .object({
    summary: z.string(),
    changes: z.array(z.string()),
    revisedDescription: z.string(),
  })
  .nullable()
  .optional()

export const FeasibilityOutputSchema = z.object({
  manufacturable: z.boolean(),
  rejectionReason: z.string().nullable().optional(),
  overallScore: z.number().min(0).max(100).optional(),
  communication: CommunicationSchema.optional(),
  processing: ProcessingSchema.optional(),
  power: PowerSchema.optional(),
  inputs: ItemsSchema.optional(),
  outputs: ItemsSchema.optional(),
  openQuestions: z.array(OpenQuestionSchema).optional().default([]),
  suggestedRevisions: SuggestedRevisionsSchema,
})
export type FeasibilityOutput = z.infer<typeof FeasibilityOutputSchema>

// =============================================================================
// Node Implementation
// =============================================================================

async function invokeFeasibility(
  input: FeasibilityInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<FeasibilityOutput>> {
  // Use override prompt from database if available, otherwise use default
  const systemPrompt = context.systemPromptOverride || FEASIBILITY_SYSTEM_PROMPT
  const userPrompt = buildFeasibilityPrompt(input.description)

  const response = await context.llmChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: config.temperature ?? 0.3,
    model: config.model,
    projectId: context.projectId,
  })

  // Extract JSON from response
  const jsonMatch = response.content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No JSON found in response')
  }

  const parsed = JSON.parse(jsonMatch[0])
  const validated = FeasibilityOutputSchema.parse(parsed)

  return {
    output: validated,
    rawResponse: response.content,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
  }
}

// =============================================================================
// Node Definition
// =============================================================================

export const feasibilityNode: LangGraphNode<
  typeof FeasibilityInputSchema,
  typeof FeasibilityOutputSchema
> = {
  name: 'feasibility',
  description: 'Analyze project feasibility with available hardware components',
  type: 'chat',
  multimodal: false,
  inputSchema: FeasibilityInputSchema,
  outputSchema: FeasibilityOutputSchema,
  defaultTemperature: 0.3,
  category: 'spec',
  invoke: invokeFeasibility,
}

// Register the node
registerNode(feasibilityNode)
