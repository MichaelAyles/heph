/**
 * Enclosure Visual Compare Node
 *
 * Compares a blueprint image to a rendered STL screenshot.
 * Uses multimodal LLM to analyze similarity and provide feedback.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'
import {
  VISUAL_COMPARISON_PROMPT,
  parseVisualValidationResponse,
} from '../../../prompts/enclosure-validation'

// =============================================================================
// Schemas
// =============================================================================

export const EnclosureVisualCompareInputSchema = z.object({
  blueprintImage: z.string().min(1, 'Blueprint image URL or base64 is required'),
  stlScreenshot: z.string().min(1, 'STL screenshot URL or base64 is required'),
  designIntent: z.string().optional(),
})
export type EnclosureVisualCompareInput = z.infer<typeof EnclosureVisualCompareInputSchema>

const ScoresSchema = z.object({
  formFactor: z.number().min(0).max(100),
  featurePlacement: z.number().min(0).max(100),
  visualStyle: z.number().min(0).max(100),
  assembly: z.number().min(0).max(100),
})

const VisualIssueSchema = z.object({
  category: z.enum(['formFactor', 'featurePlacement', 'visualStyle', 'assembly']),
  description: z.string(),
})

export const EnclosureVisualCompareOutputSchema = z.object({
  overallScore: z.number().min(0).max(100),
  scores: ScoresSchema,
  matches: z.boolean(),
  issues: z.array(VisualIssueSchema),
  fixInstructions: z.string(),
})
export type EnclosureVisualCompareOutput = z.infer<typeof EnclosureVisualCompareOutputSchema>

// =============================================================================
// Node Implementation
// =============================================================================

async function invokeEnclosureVisualCompare(
  input: EnclosureVisualCompareInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<EnclosureVisualCompareOutput>> {
  // Use override prompt from database if available, otherwise use default
  const systemPrompt = context.systemPromptOverride || VISUAL_COMPARISON_PROMPT

  // Build user prompt with design intent if provided
  let userPrompt =
    'Compare the original product blueprint (first image) with the generated enclosure render (second image).'
  if (input.designIntent) {
    userPrompt += `\n\nDesign Intent: ${input.designIntent}`
  }

  // Build multimodal message with two images
  const response = await context.llmChat({
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          {
            type: 'image_url',
            image_url: { url: input.blueprintImage },
          },
          {
            type: 'image_url',
            image_url: { url: input.stlScreenshot },
          },
        ],
      },
    ],
    temperature: config.temperature ?? 0.2,
    model: config.model,
    projectId: context.projectId,
  })

  // Parse the response using the existing parser
  const result = parseVisualValidationResponse(response.content)

  return {
    output: {
      overallScore: result.overallScore,
      scores: result.scores,
      matches: result.matches,
      issues: result.issues,
      fixInstructions: result.fixInstructions,
    },
    rawResponse: response.content,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
  }
}

// =============================================================================
// Node Definition
// =============================================================================

export const enclosureVisualCompareNode: LangGraphNode<
  typeof EnclosureVisualCompareInputSchema,
  typeof EnclosureVisualCompareOutputSchema
> = {
  name: 'enclosure_visual_compare',
  description: 'Compare blueprint to rendered enclosure (multimodal)',
  type: 'chat',
  multimodal: true,
  inputSchema: EnclosureVisualCompareInputSchema,
  outputSchema: EnclosureVisualCompareOutputSchema,
  defaultTemperature: 0.2,
  category: 'enclosure',
  invoke: invokeEnclosureVisualCompare,
}

// Register the node
registerNode(enclosureVisualCompareNode)
