/**
 * Block Selection Node
 *
 * Selects and places PCB blocks based on project requirements.
 * Returns a suggested layout with reasoning.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'
import {
  buildPCBSelectionUserPrompt,
  parsePCBSuggestionResponse,
  type PCBSuggestionRequest,
  type BlockCatalogEntry,
} from '../../../prompts/pcb-selection'

// =============================================================================
// Schemas
// =============================================================================

const BlockCatalogEntrySchema = z.object({
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  gridSize: z.tuple([z.number(), z.number()]),
  description: z.string(),
  provides: z.array(z.string()).optional(),
  requires: z.array(z.string()).optional(),
  interfaces: z.array(z.string()).optional(),
  edgeMount: z.string().optional(),
})

const FinalSpecSchema = z.object({
  name: z.string().optional(),
  summary: z.string().optional(),
  inputs: z
    .array(
      z.object({
        type: z.string(),
        count: z.number(),
        notes: z.string().optional(),
      })
    )
    .optional(),
  outputs: z
    .array(
      z.object({
        type: z.string(),
        count: z.number(),
        notes: z.string().optional(),
      })
    )
    .optional(),
  power: z
    .object({
      source: z.string(),
      voltage: z.string(),
    })
    .optional(),
  communication: z
    .object({
      type: z.string(),
      protocol: z.string().optional(),
    })
    .optional(),
})

export const BlockSelectionInputSchema = z.object({
  projectName: z.string().min(1, 'Project name is required'),
  description: z.string().min(1, 'Description is required'),
  finalSpec: FinalSpecSchema.optional().nullable(),
  availableBlocks: z.array(BlockCatalogEntrySchema),
})
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
  input: BlockSelectionInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<BlockSelectionOutput>> {
  // System prompt comes from database (required)
  const systemPrompt = context.systemPrompt

  // Build the request for the user prompt builder
  const request: PCBSuggestionRequest = {
    projectName: input.projectName,
    description: input.description,
    finalSpec: input.finalSpec as PCBSuggestionRequest['finalSpec'],
    availableBlocks: input.availableBlocks as BlockCatalogEntry[],
  }

  const userPrompt = buildPCBSelectionUserPrompt(request)

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
  invoke: invokeBlockSelection,
}

// Register the node
registerNode(blockSelectionNode)
