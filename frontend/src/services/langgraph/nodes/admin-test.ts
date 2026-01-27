/**
 * Admin Test Node
 *
 * Simple node for testing LLM connectivity from the admin panel.
 * Returns "Hello World" or a custom response based on prompt.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeConfig, NodeContext, NodeInvokeResult } from './types'
import { registerNode } from './registry'

// =============================================================================
// Schemas
// =============================================================================

export const AdminTestInputSchema = z.object({
  prompt: z.string().optional().default('Say exactly "Hello World"'),
  model: z.string().optional(),
})
export type AdminTestInput = z.infer<typeof AdminTestInputSchema>

export const AdminTestOutputSchema = z.object({
  response: z.string(),
  model: z.string(),
  latencyMs: z.number(),
  tokensUsed: z.number().optional(),
})
export type AdminTestOutput = z.infer<typeof AdminTestOutputSchema>

// =============================================================================
// Node Implementation
// =============================================================================

async function invokeAdminTest(
  input: AdminTestInput,
  config: NodeConfig,
  context: NodeContext
): Promise<NodeInvokeResult<AdminTestOutput>> {
  const startMs = Date.now()

  const response = await context.llmChat({
    messages: [{ role: 'user', content: input.prompt || 'Say exactly "Hello World"' }],
    temperature: config.temperature ?? 0,
    model: config.model ?? input.model,
    projectId: context.projectId,
  })

  const latencyMs = Date.now() - startMs

  return {
    output: {
      response: response.content,
      model: response.model,
      latencyMs,
      tokensUsed: response.usage?.total_tokens,
    },
    rawResponse: response.content,
    promptTokens: response.usage?.prompt_tokens,
    completionTokens: response.usage?.completion_tokens,
  }
}

// =============================================================================
// Node Definition
// =============================================================================

export const adminTestNode: LangGraphNode<
  typeof AdminTestInputSchema,
  typeof AdminTestOutputSchema
> = {
  name: 'admin_test',
  description: 'Test LLM connectivity with a simple prompt',
  type: 'chat',
  multimodal: false,
  inputSchema: AdminTestInputSchema,
  outputSchema: AdminTestOutputSchema,
  defaultTemperature: 0,
  category: 'admin',
  invoke: invokeAdminTest,
}

// Register the node
registerNode(adminTestNode)
