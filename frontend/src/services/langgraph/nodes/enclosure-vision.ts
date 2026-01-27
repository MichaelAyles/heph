/**
 * Enclosure Vision Node
 *
 * Generates OpenSCAD code from a blueprint image using multimodal LLM.
 * This is the primary enclosure generation path when a blueprint is available.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'
import { buildVisionEnclosurePrompt } from '../../../prompts/enclosure'

// =============================================================================
// Schemas
// =============================================================================

export const EnclosureVisionInputSchema = z.object({
  blueprintImage: z.string().min(1, 'Blueprint image URL or base64 is required'),
  pcbWidth: z.number().positive(),
  pcbHeight: z.number().positive(),
  pcbThickness: z.number().positive().default(1.6),
  wallThickness: z.number().positive().default(2),
  features: z.array(z.string()).default([]),
  style: z.string().optional(),
})
export type EnclosureVisionInput = z.infer<typeof EnclosureVisionInputSchema>

export const EnclosureVisionOutputSchema = z.object({
  openScadCode: z.string(),
  designNotes: z.string().optional(),
  estimatedDimensions: z
    .object({
      width: z.number(),
      height: z.number(),
      depth: z.number(),
    })
    .optional(),
})
export type EnclosureVisionOutput = z.infer<typeof EnclosureVisionOutputSchema>

// =============================================================================
// Node Implementation
// =============================================================================

async function invokeEnclosureVision(
  input: EnclosureVisionInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<EnclosureVisionOutput>> {
  // System prompt comes from database (required)
  const systemPrompt = context.systemPrompt

  const userPrompt = buildVisionEnclosurePrompt({
    pcbWidth: input.pcbWidth,
    pcbHeight: input.pcbHeight,
    wallThickness: input.wallThickness,
    features: input.features,
  })

  // Build multimodal message with image
  const response = await context.llmChat({
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          {
            type: 'image_url',
            image_url: {
              url: input.blueprintImage,
            },
          },
        ],
      },
    ],
    temperature: config.temperature ?? 0.3,
    model: config.model,
    projectId: context.projectId,
  })

  // Extract OpenSCAD code from response
  let openScadCode = response.content
  const codeBlockMatch = response.content.match(/```(?:openscad)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    openScadCode = codeBlockMatch[1].trim()
  }

  // Try to extract design notes
  let designNotes: string | undefined
  const afterCodeMatch = response.content.match(/```[\s\S]*?```\s*([\s\S]+)$/)
  if (afterCodeMatch) {
    designNotes = afterCodeMatch[1].trim()
  }

  // Estimate dimensions
  const clearance = 1.0
  const estimatedDimensions = {
    width: input.pcbWidth + input.wallThickness * 2 + clearance * 2,
    height: input.pcbHeight + input.wallThickness * 2 + clearance * 2,
    depth: input.pcbThickness + input.wallThickness * 2 + 10,
  }

  return {
    output: {
      openScadCode,
      designNotes,
      estimatedDimensions,
    },
    rawResponse: response.content,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
  }
}

// =============================================================================
// Node Definition
// =============================================================================

export const enclosureVisionNode: LangGraphNode<
  typeof EnclosureVisionInputSchema,
  typeof EnclosureVisionOutputSchema
> = {
  name: 'enclosure_vision',
  description: 'Generate OpenSCAD from blueprint image (multimodal)',
  type: 'chat',
  multimodal: true,
  inputSchema: EnclosureVisionInputSchema,
  outputSchema: EnclosureVisionOutputSchema,
  defaultTemperature: 0.3,
  category: 'enclosure',
  invoke: invokeEnclosureVision,
}

// Register the node
registerNode(enclosureVisionNode)
