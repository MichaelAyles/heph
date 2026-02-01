/**
 * Refinement Node
 *
 * Generates clarifying questions based on feasibility analysis
 * and previous decisions. Used to refine project requirements.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'

// =============================================================================
// Schemas
// =============================================================================

// Input is minimal - all context comes from @variables in system prompt
export const RefinementInputSchema = z.object({})
export type RefinementInput = z.infer<typeof RefinementInputSchema>

const OpenQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.string()).default([]),
  category: z.string().optional(),
})

export const RefinementOutputSchema = z.object({
  questions: z.array(OpenQuestionSchema).default([]),
  complete: z.boolean(),
  reasoning: z.string().optional(),
})
export type RefinementOutput = z.infer<typeof RefinementOutputSchema>

// =============================================================================
// Node Implementation
// =============================================================================

async function invokeRefinement(
  _input: RefinementInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<RefinementOutput>> {
  // System prompt comes from database with @variables already expanded
  // Includes @description, @feasibility, @decisions
  const systemPrompt = context.systemPrompt

  // Simple user prompt - all context is in the system prompt via @variables
  const userPrompt = `Based on the project description, feasibility analysis, and previous decisions provided in the context, generate clarifying questions to refine the requirements. Return a JSON response with questions array and complete boolean.`

  const response = await context.llmChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: config.temperature ?? 0.4,
    model: config.model,
    projectId: context.projectId,
  })

  // Extract JSON from response
  const jsonMatch = response.content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No JSON found in response')
  }

  const parsed = JSON.parse(jsonMatch[0])

  // Transform the response to match our output schema
  const output: RefinementOutput = {
    questions: parsed.additionalQuestions || parsed.questions || [],
    complete: parsed.complete ?? false,
    reasoning: parsed.reasoning,
  }

  return {
    output,
    rawResponse: response.content,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
  }
}

// =============================================================================
// Node Definition
// =============================================================================

export const refinementNode: LangGraphNode<
  typeof RefinementInputSchema,
  typeof RefinementOutputSchema
> = {
  name: 'refinement',
  description: 'Generate clarifying questions to refine project requirements',
  type: 'chat',
  multimodal: false,
  inputSchema: RefinementInputSchema,
  outputSchema: RefinementOutputSchema,
  defaultTemperature: 0.4,
  category: 'spec',
  contextTypes: ['projectState'], // Enables @description, @feasibility, @decisions
  invoke: invokeRefinement,
}

// Register the node
registerNode(refinementNode)
