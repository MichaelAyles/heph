/**
 * Enclosure Vision Node
 *
 * Generates OpenSCAD code from a blueprint image using multimodal LLM.
 * This is the primary enclosure generation path when a blueprint is available.
 *
 * Context from @variables (via projectState):
 * - @projectName: Product name
 * - @pcb.boardSize: Board dimensions
 * - @finalSpec: Final specification with inputs/outputs
 * - @image:visualization.selected: The selected blueprint image (injected automatically)
 *
 * No runtime inputs required - all context comes from @variables.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'

// =============================================================================
// Schemas
// =============================================================================

export const EnclosureVisionInputSchema = z.object({
  // No required inputs - blueprint image comes from @image:visualization.selected
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
  _input: EnclosureVisionInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<EnclosureVisionOutput>> {
  // System prompt comes from database with @variables already expanded
  const systemPrompt = context.systemPrompt

  // Simple user prompt - context is in system prompt
  // Image is injected automatically via @image:visualization.selected in the template
  const userPrompt = `Generate OpenSCAD code for an enclosure based on the provided blueprint image and project context. Output the code in a single code block.`

  // The invoke endpoint will inject the image from @image: variables into the first user message
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

  // Estimate dimensions from dynamic context
  const pcb = context.dynamicContext?.projectState?.spec?.pcb as
    | { boardSize?: { width?: number; height?: number } }
    | undefined
  const pcbWidth = pcb?.boardSize?.width ?? 50
  const pcbHeight = pcb?.boardSize?.height ?? 40
  const pcbThickness = 1.6
  const wallThickness = 2
  const clearance = 1.0

  const estimatedDimensions = {
    width: pcbWidth + wallThickness * 2 + clearance * 2,
    height: pcbHeight + wallThickness * 2 + clearance * 2,
    depth: pcbThickness + wallThickness * 2 + 10,
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
  contextTypes: ['projectState'], // Enables @projectName, @pcb.boardSize, @finalSpec
  invoke: invokeEnclosureVision,
}

// Register the node
registerNode(enclosureVisionNode)
