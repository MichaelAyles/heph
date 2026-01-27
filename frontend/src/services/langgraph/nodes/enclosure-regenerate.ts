/**
 * Enclosure Regenerate Node
 *
 * Regenerates OpenSCAD code based on user feedback.
 * Used for iterative refinement of enclosure designs.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'
import {
  ENCLOSURE_SYSTEM_PROMPT,
  buildEnclosureRegenerationPrompt,
  type EnclosureInput,
} from '../../../prompts/enclosure'

// =============================================================================
// Schemas
// =============================================================================

export const EnclosureRegenerateInputSchema = z.object({
  currentCode: z.string().min(1, 'Current OpenSCAD code is required'),
  feedback: z.string().min(1, 'Feedback is required'),
  projectName: z.string().default('project'),
  description: z.string().default(''),
  boardWidth: z.number().positive(),
  boardHeight: z.number().positive(),
  boardThickness: z.number().positive().default(1.6),
  wallThickness: z.number().positive().default(2),
  features: z.array(z.string()).default([]),
  previousIterations: z.number().min(0).default(0),
})
export type EnclosureRegenerateInput = z.infer<typeof EnclosureRegenerateInputSchema>

export const EnclosureRegenerateOutputSchema = z.object({
  openScadCode: z.string(),
  changesApplied: z.array(z.string()),
  designNotes: z.string().optional(),
})
export type EnclosureRegenerateOutput = z.infer<typeof EnclosureRegenerateOutputSchema>

// =============================================================================
// Node Implementation
// =============================================================================

async function invokeEnclosureRegenerate(
  input: EnclosureRegenerateInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<EnclosureRegenerateOutput>> {
  // Use override prompt from database if available, otherwise use default
  const systemPrompt = context.systemPromptOverride || ENCLOSURE_SYSTEM_PROMPT

  // Build enclosure input for the prompt
  const enclosureInput: EnclosureInput = {
    projectName: input.projectName,
    description: input.description,
    boardWidth: input.boardWidth,
    boardHeight: input.boardHeight,
    boardThickness: input.boardThickness,
    wallThickness: input.wallThickness,
    features: input.features,
  }

  const userPrompt = buildEnclosureRegenerationPrompt(
    input.currentCode,
    input.feedback,
    enclosureInput
  )

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

  // Parse changes applied from the feedback
  const changesApplied = [input.feedback]

  // Try to extract design notes
  let designNotes: string | undefined
  const afterCodeMatch = response.content.match(/```[\s\S]*?```\s*([\s\S]+)$/)
  if (afterCodeMatch) {
    designNotes = afterCodeMatch[1].trim()
  }

  return {
    output: {
      openScadCode,
      changesApplied,
      designNotes,
    },
    rawResponse: response.content,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
  }
}

// =============================================================================
// Node Definition
// =============================================================================

export const enclosureRegenerateNode: LangGraphNode<
  typeof EnclosureRegenerateInputSchema,
  typeof EnclosureRegenerateOutputSchema
> = {
  name: 'enclosure_regenerate',
  description: 'Regenerate OpenSCAD based on user feedback',
  type: 'chat',
  multimodal: false,
  inputSchema: EnclosureRegenerateInputSchema,
  outputSchema: EnclosureRegenerateOutputSchema,
  defaultTemperature: 0.3,
  category: 'enclosure',
  invoke: invokeEnclosureRegenerate,
}

// Register the node
registerNode(enclosureRegenerateNode)
