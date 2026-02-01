/**
 * Enclosure Text Node
 *
 * Generates OpenSCAD enclosure code from text descriptions.
 * This is the fallback when no blueprint image is available.
 *
 * All context comes from @variables in the system prompt:
 * - @projectName: Product name
 * - @description: User's project description
 * - @pcb.boardSize: Board dimensions
 * - @finalSpec: Final specification with inputs/outputs
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'

// =============================================================================
// Schemas
// =============================================================================

// Input is empty - all context comes from @variables in system prompt
export const EnclosureTextInputSchema = z.object({})
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
  _input: EnclosureTextInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<EnclosureTextOutput>> {
  // System prompt comes from database with @variables already expanded
  const systemPrompt = context.systemPrompt

  // Simple user prompt - all context is in the system prompt via @variables
  const userPrompt = `Generate the OpenSCAD enclosure code based on the context provided. Output the code in a single code block.`

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

  // Estimate dimensions from dynamic context
  const pcb = context.dynamicContext?.projectState?.spec?.pcb as
    | { boardSize?: { width?: number; height?: number } }
    | undefined
  const boardWidth = pcb?.boardSize?.width ?? 50
  const boardHeight = pcb?.boardSize?.height ?? 40
  const wallThickness = 2
  const boardThickness = 1.6
  const clearance = 1.0 // mm on each side

  const estimatedDimensions = {
    width: boardWidth + wallThickness * 2 + clearance * 2,
    height: boardHeight + wallThickness * 2 + clearance * 2,
    depth: boardThickness + wallThickness * 2 + 10, // 10mm for components
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
  contextTypes: ['projectState'], // Enables @projectName, @description, @pcb.boardSize, @finalSpec
  invoke: invokeEnclosureText,
}

// Register the node
registerNode(enclosureTextNode)
