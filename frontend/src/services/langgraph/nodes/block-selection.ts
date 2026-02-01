/**
 * Block Selection Node
 *
 * Selects and places PCB blocks based on project requirements.
 * Returns a suggested layout with reasoning.
 *
 * Uses @variables for context:
 * - @projectName - Project name from final spec
 * - @description - User's project description
 * - @finalSpec - Full final specification object
 * - @availableBlocks - List of available hardware blocks
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'
import { parsePCBSuggestionResponse } from '../../../prompts/pcb-selection'

// =============================================================================
// Schemas
// =============================================================================

// Input is minimal - all context comes from @variables in system prompt
export const BlockSelectionInputSchema = z.object({})
export type BlockSelectionInput = z.infer<typeof BlockSelectionInputSchema>

const BlockPlacementSchema = z.object({
  slug: z.string(),
  gridX: z.number(),
  gridY: z.number(),
  rotation: z.union([z.literal(0), z.literal(180)]),
  reason: z.string(),
})

export const BlockSelectionOutputSchema = z.object({
  blocks: z.array(BlockPlacementSchema),
  boardSize: z.object({
    width: z.number(),
    height: z.number(),
  }),
  notes: z.string(),
})
export type BlockSelectionOutput = z.infer<typeof BlockSelectionOutputSchema>

// =============================================================================
// Node Implementation
// =============================================================================

async function invokeBlockSelection(
  _input: BlockSelectionInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<BlockSelectionOutput>> {
  // System prompt comes from database with @variables already expanded
  const systemPrompt = context.systemPrompt

  // Simple user prompt - all context is in the system prompt via @variables
  const userPrompt = `Select and place PCB blocks based on the project requirements and available blocks provided in the context. Return the JSON response with blocks, boardSize, and notes.`

  const response = await context.llmChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: config.temperature ?? 0.3,
    model: config.model,
    projectId: context.projectId,
  })

  // Parse the response
  const parsed = parsePCBSuggestionResponse(response.content)
  if (!parsed) {
    throw new Error('Failed to parse block selection response')
  }

  return {
    output: {
      blocks: parsed.blocks,
      boardSize: parsed.boardSize,
      notes: parsed.notes,
    },
    rawResponse: response.content,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
  }
}

// =============================================================================
// Node Definition
// =============================================================================

export const blockSelectionNode: LangGraphNode<
  typeof BlockSelectionInputSchema,
  typeof BlockSelectionOutputSchema
> = {
  name: 'block_selection',
  description: 'Select and place PCB blocks based on project requirements',
  type: 'chat',
  multimodal: false,
  inputSchema: BlockSelectionInputSchema,
  outputSchema: BlockSelectionOutputSchema,
  defaultTemperature: 0.3,
  category: 'spec',
  contextTypes: ['projectState', 'availableBlocks'], // Enables @projectName, @description, @finalSpec, @availableBlocks
  invoke: invokeBlockSelection,
}

// Register the node
registerNode(blockSelectionNode)
