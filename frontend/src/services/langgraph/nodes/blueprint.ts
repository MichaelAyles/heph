/**
 * Blueprint Node
 *
 * Generates product visualization images using image generation API.
 * This node uses the image LLM endpoint instead of chat.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'
import { buildBlueprintPrompts } from '../../../prompts/blueprint'
import type { Decision, FeasibilityAnalysis } from '../../../db/schema'

// =============================================================================
// Schemas
// =============================================================================

const DecisionSchema = z.object({
  questionId: z.string(),
  question: z.string(),
  answer: z.string(),
  timestamp: z.string().optional(),
})

const FeasibilitySchema = z.object({
  inputs: z
    .object({
      items: z.array(z.string()).optional(),
    })
    .optional(),
  outputs: z
    .object({
      items: z.array(z.string()).optional(),
    })
    .optional(),
})

export const BlueprintInputSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  decisions: z.array(DecisionSchema).default([]),
  feasibility: FeasibilitySchema.optional(),
  style: z.enum(['render', 'photo']).default('render'),
  variation: z.number().min(1).max(8).default(1),
})
export type BlueprintInput = z.infer<typeof BlueprintInputSchema>

export const BlueprintOutputSchema = z.object({
  imageUrl: z.string(),
  prompt: z.string(),
  style: z.string(),
})
export type BlueprintOutput = z.infer<typeof BlueprintOutputSchema>

// =============================================================================
// Node Implementation
// =============================================================================

async function invokeBlueprint(
  input: BlueprintInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<BlueprintOutput>> {
  // Convert input to types expected by buildBlueprintPrompts
  const decisions: Decision[] = input.decisions.map((d) => ({
    questionId: d.questionId,
    question: d.question,
    answer: d.answer,
    timestamp: d.timestamp ?? new Date().toISOString(),
  }))

  const feasibility: FeasibilityAnalysis = {
    inputs: { items: input.feasibility?.inputs?.items ?? [], confidence: 0 },
    outputs: { items: input.feasibility?.outputs?.items ?? [], confidence: 0 },
    communication: { type: 'unknown', confidence: 0, notes: '' },
    processing: { level: 'unknown', confidence: 0, notes: '' },
    power: { options: [], confidence: 0, notes: '' },
    overallScore: 0,
    manufacturable: true,
  }

  // Generate all prompts and select the one for this variation
  const prompts = buildBlueprintPrompts(input.description, decisions, feasibility)
  const variationIndex = input.variation - 1
  const prompt = prompts[variationIndex] || prompts[0]

  // Determine style based on variation (1-4 are renders, 5-8 are photos)
  const style = input.variation <= 4 ? 'render' : 'photo'

  // Check if image generation function is available
  if (!context.llmImage) {
    throw new Error('Image generation not available in this context')
  }

  const response = await context.llmImage({
    prompt,
    model: config.model,
    projectId: context.projectId,
  })

  return {
    output: {
      imageUrl: response.url,
      prompt,
      style,
    },
    rawResponse: JSON.stringify({ url: response.url, prompt }),
  }
}

// =============================================================================
// Node Definition
// =============================================================================

export const blueprintNode: LangGraphNode<
  typeof BlueprintInputSchema,
  typeof BlueprintOutputSchema
> = {
  name: 'blueprint',
  description: 'Generate product visualization images',
  type: 'image',
  multimodal: false,
  inputSchema: BlueprintInputSchema,
  outputSchema: BlueprintOutputSchema,
  defaultTemperature: 1.0, // Not used for image generation
  category: 'spec',
  contextTypes: ['projectState'], // Access feasibility data via @feasibility template
  invoke: invokeBlueprint,
}

// Register the node
registerNode(blueprintNode)
