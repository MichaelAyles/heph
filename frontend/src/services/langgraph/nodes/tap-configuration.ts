/**
 * Tap Configuration Node
 *
 * Configures 0R resistor taps for I2C addresses, signal routing, and power isolation.
 * Returns the optimal tap configuration with conflict detection.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'
import {
  buildTapConfigPrompt,
  parseTapConfigResponse,
  type TapConfigContext,
  type TapConfigResponse,
} from '../../../prompts/tap-configuration'
import type { BlockDefinition } from '../../../schemas/block'

// =============================================================================
// Schemas
// =============================================================================

const PlacedBlockSchema = z.object({
  blockId: z.string(),
  blockSlug: z.string(),
  gridX: z.number(),
  gridY: z.number(),
  rotation: z.number().optional(),
})

const FinalSpecSchema = z
  .object({
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
    communication: z
      .object({
        type: z.string(),
        protocol: z.string().optional(),
      })
      .optional(),
  })
  .optional()
  .nullable()

// Block definition is complex, so we use a loose schema and cast
const BlockDefinitionSchema = z.record(z.string(), z.unknown())

export const TapConfigurationInputSchema = z.object({
  projectName: z.string().min(1, 'Project name is required'),
  projectDescription: z.string().optional(),
  finalSpec: FinalSpecSchema,
  placedBlocks: z.array(PlacedBlockSchema),
  // Block definitions as a JSON object keyed by slug
  blockDefinitions: z.record(z.string(), BlockDefinitionSchema),
})
export type TapConfigurationInput = z.infer<typeof TapConfigurationInputSchema>

const TapConfigSchema = z.object({
  blockSlug: z.string(),
  reference: z.string(),
  signal: z.string(),
  populated: z.boolean(),
  reason: z.string(),
})

const ConflictSchema = z.object({
  type: z.enum(['i2c_address', 'gpio', 'power', 'signal']),
  description: z.string(),
  affectedBlocks: z.array(z.string()),
  resolution: z.string().optional(),
})

export const TapConfigurationOutputSchema = z.object({
  configurations: z.array(TapConfigSchema),
  conflicts: z.array(ConflictSchema),
  notes: z.string(),
})
export type TapConfigurationOutput = z.infer<typeof TapConfigurationOutputSchema>

// =============================================================================
// Node Implementation
// =============================================================================

async function invokeTapConfiguration(
  input: TapConfigurationInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<TapConfigurationOutput>> {
  // System prompt comes from database (required)
  const systemPrompt = context.systemPrompt

  // Convert block definitions from object to Map
  const blockDefinitionsMap = new Map<string, BlockDefinition>()
  for (const [slug, def] of Object.entries(input.blockDefinitions)) {
    blockDefinitionsMap.set(slug, def as unknown as BlockDefinition)
  }

  // Build the context for the prompt builder
  const tapContext: TapConfigContext = {
    projectName: input.projectName,
    projectDescription: input.projectDescription,
    finalSpec: input.finalSpec as TapConfigContext['finalSpec'],
    placedBlocks: input.placedBlocks.map((b) => ({
      blockId: b.blockId,
      blockSlug: b.blockSlug,
      gridX: b.gridX,
      gridY: b.gridY,
      rotation: (b.rotation ?? 0) as 0 | 90 | 180 | 270,
    })),
    blockDefinitions: blockDefinitionsMap,
  }

  const userPrompt = buildTapConfigPrompt(tapContext)

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
  const parsed: TapConfigResponse | null = parseTapConfigResponse(response.content)
  if (!parsed) {
    throw new Error('Failed to parse tap configuration response')
  }

  return {
    output: {
      configurations: parsed.configurations,
      conflicts: parsed.conflicts,
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

export const tapConfigurationNode: LangGraphNode<
  typeof TapConfigurationInputSchema,
  typeof TapConfigurationOutputSchema
> = {
  name: 'tap_configuration',
  description: 'Configure 0R resistor taps for I2C addresses and signal routing',
  type: 'chat',
  multimodal: false,
  inputSchema: TapConfigurationInputSchema,
  outputSchema: TapConfigurationOutputSchema,
  defaultTemperature: 0.3,
  category: 'spec',
  invoke: invokeTapConfiguration,
}

// Register the node
registerNode(tapConfigurationNode)
