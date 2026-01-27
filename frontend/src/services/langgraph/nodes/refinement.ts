/**
 * Refinement Node
 *
 * Generates clarifying questions based on feasibility analysis
 * and previous decisions. Used to refine project requirements.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'
import { buildRefinementPrompt } from '../../../prompts/refinement'
import type { FeasibilityAnalysis, Decision } from '../../../db/schema'

// =============================================================================
// Schemas
// =============================================================================

const FeasibilityAnalysisSchema = z.object({
  communication: z
    .object({
      type: z.string(),
      confidence: z.number(),
      notes: z.string(),
    })
    .optional(),
  processing: z
    .object({
      level: z.string(),
      confidence: z.number(),
      notes: z.string(),
    })
    .optional(),
  power: z
    .object({
      options: z.array(z.string()),
      confidence: z.number(),
      notes: z.string(),
    })
    .optional(),
  inputs: z
    .object({
      items: z.array(z.string()),
      confidence: z.number().optional(),
    })
    .optional(),
  outputs: z
    .object({
      items: z.array(z.string()),
      confidence: z.number().optional(),
    })
    .optional(),
  overallScore: z.number(),
  manufacturable: z.boolean(),
  rejectionReason: z.string().optional(),
})

const DecisionSchema = z.object({
  questionId: z.string(),
  question: z.string(),
  answer: z.string(),
  timestamp: z.string().optional(),
})

export const RefinementInputSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  feasibility: FeasibilityAnalysisSchema,
  previousDecisions: z.array(DecisionSchema).default([]),
  round: z.number().min(1).max(5).default(1),
})
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
  input: RefinementInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<RefinementOutput>> {
  // System prompt comes from database (required)
  const systemPrompt = context.systemPrompt

  // Convert Zod-parsed input to the types expected by buildRefinementPrompt
  const feasibility: FeasibilityAnalysis = {
    communication: input.feasibility.communication ?? { type: 'unknown', confidence: 0, notes: '' },
    processing: input.feasibility.processing ?? { level: 'unknown', confidence: 0, notes: '' },
    power: input.feasibility.power ?? { options: [], confidence: 0, notes: '' },
    inputs: {
      items: input.feasibility.inputs?.items ?? [],
      confidence: input.feasibility.inputs?.confidence ?? 0,
    },
    outputs: {
      items: input.feasibility.outputs?.items ?? [],
      confidence: input.feasibility.outputs?.confidence ?? 0,
    },
    overallScore: input.feasibility.overallScore,
    manufacturable: input.feasibility.manufacturable,
    rejectionReason: input.feasibility.rejectionReason,
  }

  const decisions: Decision[] = input.previousDecisions.map((d) => ({
    questionId: d.questionId,
    question: d.question,
    answer: d.answer,
    timestamp: d.timestamp ?? new Date().toISOString(),
  }))

  const userPrompt = buildRefinementPrompt(input.description, feasibility, decisions)

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
  invoke: invokeRefinement,
}

// Register the node
registerNode(refinementNode)
