/**
 * Finalization Node
 *
 * Generates the final locked specification with BOM based on
 * user decisions and selected blueprint.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'

// =============================================================================
// Schemas
// =============================================================================

// Input is empty - all context comes from @variables in system prompt
export const FinalizationInputSchema = z.object({})
export type FinalizationInput = z.infer<typeof FinalizationInputSchema>

const PCBSizeSchema = z.object({
  width: z.number(),
  height: z.number(),
  unit: z.enum(['mm', 'inch']).default('mm'),
})

const ComponentSchema = z.object({
  type: z.string(),
  count: z.number(),
  notes: z.string().optional(),
})

const PowerSchema = z.object({
  source: z.string(),
  voltage: z.string(),
  current: z.string(),
  batteryLife: z.string().optional(),
})

const CommunicationSchema = z.object({
  type: z.string(),
  protocol: z.string().optional(),
})

const EnclosureSchema = z.object({
  style: z.string(),
  width: z.number(),
  height: z.number(),
  depth: z.number(),
})

const BOMItemSchema = z.object({
  item: z.string(),
  quantity: z.number(),
  unitCost: z.number(),
})

export const FinalizationOutputSchema = z.object({
  name: z.string(),
  summary: z.string(),
  pcbSize: PCBSizeSchema.optional(),
  inputs: z.array(ComponentSchema).optional().default([]),
  outputs: z.array(ComponentSchema).optional().default([]),
  power: PowerSchema.optional(),
  communication: CommunicationSchema.optional(),
  enclosure: EnclosureSchema.optional(),
  estimatedBOM: z.array(BOMItemSchema).optional().default([]),
})
export type FinalizationOutput = z.infer<typeof FinalizationOutputSchema>

// =============================================================================
// Node Implementation
// =============================================================================

async function invokeFinalization(
  _input: FinalizationInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<FinalizationOutput>> {
  // System prompt comes from database with @variables already expanded
  const systemPrompt = context.systemPrompt

  // Simple user prompt - all context is in the system prompt via @variables
  const userPrompt = `Generate the final specification JSON based on the context provided. Include all required fields: name, summary, pcbSize, inputs, outputs, power, communication, enclosure, and estimatedBOM.`

  const response = await context.llmChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: config.temperature ?? 0.3,
    model: config.model,
    projectId: context.projectId,
  })

  // Extract JSON from response
  const jsonMatch = response.content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No JSON found in response')
  }

  const parsed = JSON.parse(jsonMatch[0])
  const validated = FinalizationOutputSchema.parse(parsed)

  return {
    output: validated,
    rawResponse: response.content,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
  }
}

// =============================================================================
// Node Definition
// =============================================================================

export const finalizationNode: LangGraphNode<
  typeof FinalizationInputSchema,
  typeof FinalizationOutputSchema
> = {
  name: 'finalization',
  description: 'Generate the final locked specification with BOM',
  type: 'chat',
  multimodal: false,
  inputSchema: FinalizationInputSchema,
  outputSchema: FinalizationOutputSchema,
  defaultTemperature: 0.3,
  category: 'spec',
  contextTypes: ['projectState'], // Enables @description, @feasibility, @decisions, @selectedBlueprintPrompt
  invoke: invokeFinalization,
}

// Register the node
registerNode(finalizationNode)
