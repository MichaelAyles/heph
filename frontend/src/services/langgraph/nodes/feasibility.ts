/**
 * Feasibility Node
 *
 * Analyzes project descriptions to determine if they can be built
 * with available hardware components.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'

// =============================================================================
// Schemas
// =============================================================================

// Input is minimal - all context comes from @variables in system prompt
export const FeasibilityInputSchema = z.object({})
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
  _input: FeasibilityInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<FeasibilityOutput>> {
  // System prompt comes from database with @variables already expanded
  // Includes @description and @availableBlocks
  const systemPrompt = context.systemPrompt

  // Simple user prompt - all context is in the system prompt via @variables
  const userPrompt = `Analyze the project description provided in the context and determine its feasibility. Return a JSON response with manufacturable, overallScore, and detailed analysis.`

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
  contextTypes: ['availableBlocks', 'projectState'], // Enables @description, @availableBlocks
  invoke: invokeFeasibility,
}

// Register the node
registerNode(feasibilityNode)
