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

// Input is minimal - project data comes from @variables in system prompt
// Only count is needed as configuration for how many images to generate
export const BlueprintInputSchema = z.object({
  // Number of variations to generate (default 8)
  count: z.number().min(1).max(8).default(8),
})
export type BlueprintInput = z.infer<typeof BlueprintInputSchema>

const BlueprintImageSchema = z.object({
  imageUrl: z.string(),
  prompt: z.string(),
  style: z.string(),
  variation: z.number(),
})

export const BlueprintOutputSchema = z.object({
  // Array of generated images
  images: z.array(BlueprintImageSchema),
  // Legacy single-image fields for backwards compatibility
  imageUrl: z.string().optional(),
  prompt: z.string().optional(),
  style: z.string().optional(),
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
  // Get data from dynamic context (projectState) via @variables
  const projectSpec = context.dynamicContext?.projectState?.spec as
    | {
        description?: string
        decisions?: { questionId: string; question: string; answer: string; timestamp?: string }[]
        feasibility?: {
          inputs?: { items?: string[] }
          outputs?: { items?: string[] }
        }
      }
    | undefined

  const description = projectSpec?.description || ''
  const rawDecisions = projectSpec?.decisions || []
  const rawFeasibility = projectSpec?.feasibility

  // Convert to types expected by buildBlueprintPrompts
  const decisions: Decision[] = rawDecisions.map((d) => ({
    questionId: d.questionId,
    question: d.question,
    answer: d.answer,
    timestamp: d.timestamp ?? new Date().toISOString(),
  }))

  const feasibility: FeasibilityAnalysis = {
    inputs: { items: rawFeasibility?.inputs?.items ?? [], confidence: 0 },
    outputs: { items: rawFeasibility?.outputs?.items ?? [], confidence: 0 },
    communication: { type: 'unknown', confidence: 0, notes: '' },
    processing: { level: 'unknown', confidence: 0, notes: '' },
    power: { options: [], confidence: 0, notes: '' },
    overallScore: 0,
    manufacturable: true,
  }

  // Check if image generation function is available
  if (!context.llmImage) {
    throw new Error('Image generation not available in this context')
  }

  // Generate all prompts
  const prompts = buildBlueprintPrompts(description, decisions, feasibility)

  // Generate all variations in parallel
  const count = input.count || 8
  const variations = Array.from({ length: count }, (_, i) => i + 1)

  const imagePromises = variations.map(async (variation) => {
    const variationIndex = variation - 1
    const prompt = prompts[variationIndex] || prompts[0]
    const style = variation <= 4 ? 'render' : 'photo'

    try {
      const response = await context.llmImage!({
        prompt,
        model: config.model,
        projectId: context.projectId,
      })
      return { imageUrl: response.url, prompt, style, variation }
    } catch (error) {
      // Return error placeholder so other images can still succeed
      return {
        imageUrl: '',
        prompt,
        style,
        variation,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  const images = await Promise.all(imagePromises)
  const successfulImages = images.filter((img) => img.imageUrl !== '')

  return {
    output: {
      images: successfulImages,
      // Legacy fields - use first successful image
      imageUrl: successfulImages[0]?.imageUrl,
      prompt: successfulImages[0]?.prompt,
      style: successfulImages[0]?.style,
    },
    rawResponse: JSON.stringify({ images: successfulImages }),
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
