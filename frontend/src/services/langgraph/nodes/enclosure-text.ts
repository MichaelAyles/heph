/**
 * Enclosure Text Node
 *
 * Generates OpenSCAD enclosure code from text descriptions.
 * This is the fallback when no blueprint image is available.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'
import { buildEnclosurePrompt, type EnclosureInput } from '../../../prompts/enclosure'

// =============================================================================
// Schemas
// =============================================================================

export const EnclosureTextInputSchema = z.object({
  projectName: z.string(),
  description: z.string(),
  boardWidth: z.number().positive(),
  boardHeight: z.number().positive(),
  boardThickness: z.number().positive().default(1.6),
  wallThickness: z.number().positive().default(2),
  features: z.array(z.string()).default([]),
  style: z.string().optional(),
})
export type EnclosureTextInput = z.infer<typeof EnclosureTextInputSchema>

export const EnclosureTextOutputSchema = z.object({
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
export type EnclosureTextOutput = z.infer<typeof EnclosureTextOutputSchema>

// =============================================================================
// Node Implementation
// =============================================================================

async function invokeEnclosureText(
  input: EnclosureTextInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<EnclosureTextOutput>> {
  // System prompt comes from database (required)
  const systemPrompt = context.systemPrompt

  // Build the enclosure input for the prompt builder
  const enclosureInput: EnclosureInput = {
    projectName: input.projectName,
    description: input.description,
    boardWidth: input.boardWidth,
    boardHeight: input.boardHeight,
    boardThickness: input.boardThickness,
    wallThickness: input.wallThickness,
    features: input.features,
  }

  const userPrompt = buildEnclosurePrompt(enclosureInput)

  const response = await context.llmChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: config.temperature ?? 0.3,
    model: config.model,
    projectId: context.projectId,
  })

  // Extract OpenSCAD code from response
  // Look for code block or take the whole response
  let openScadCode = response.content
  const codeBlockMatch = response.content.match(/```(?:openscad)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    openScadCode = codeBlockMatch[1].trim()
  }

  // Try to extract any notes after the code
  let designNotes: string | undefined
  const afterCodeMatch = response.content.match(/```[\s\S]*?```\s*([\s\S]+)$/)
  if (afterCodeMatch) {
    designNotes = afterCodeMatch[1].trim()
  }

  // Estimate dimensions (wall thickness * 2 + board size + clearance)
  const clearance = 1.0 // mm on each side
  const estimatedDimensions = {
    width: input.boardWidth + input.wallThickness * 2 + clearance * 2,
    height: input.boardHeight + input.wallThickness * 2 + clearance * 2,
    depth: input.boardThickness + input.wallThickness * 2 + 10, // 10mm for components
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

export const enclosureTextNode: LangGraphNode<
  typeof EnclosureTextInputSchema,
  typeof EnclosureTextOutputSchema
> = {
  name: 'enclosure_text',
  description: 'Generate OpenSCAD enclosure from text description',
  type: 'chat',
  multimodal: false,
  inputSchema: EnclosureTextInputSchema,
  outputSchema: EnclosureTextOutputSchema,
  defaultTemperature: 0.3,
  category: 'enclosure',
  invoke: invokeEnclosureText,
}

// Register the node
registerNode(enclosureTextNode)
