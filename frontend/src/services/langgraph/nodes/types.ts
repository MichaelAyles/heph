/**
 * LangGraph Node Types
 *
 * Base interfaces and schemas for standalone LangGraph nodes.
 * Each node can be invoked independently via API.
 */

import { z } from 'zod'

// =============================================================================
// Base Schemas
// =============================================================================

/**
 * Node types - determines how the LLM is called
 */
export const NodeTypeSchema = z.enum(['chat', 'image'])
export type NodeType = z.infer<typeof NodeTypeSchema>

/**
 * Node configuration passed at invocation time
 */
export const NodeConfigSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  model: z.string().optional(),
  maxTokens: z.number().optional(),
})
export type NodeConfig = z.infer<typeof NodeConfigSchema>

/**
 * Debug information captured during execution
 */
export const ExecutionDebugSchema = z.object({
  nodeName: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationMs: z.number(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  model: z.string(),
  temperature: z.number(),
  systemPrompt: z.string(),
  userPrompt: z.string(),
  rawResponse: z.string(),
  costUsd: z.number().optional(),
})
export type ExecutionDebug = z.infer<typeof ExecutionDebugSchema>

/**
 * Result returned from node invocation
 */
export const NodeResultSchema = <T extends z.ZodTypeAny>(outputSchema: T) =>
  z.object({
    output: outputSchema,
    nodeId: z.string(),
    debug: ExecutionDebugSchema,
  })

// =============================================================================
// Node Definition Interface
// =============================================================================

/**
 * Base interface for all LangGraph nodes
 */
export interface LangGraphNode<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> {
  /** Unique node name (e.g., "feasibility") */
  name: string

  /** Human-readable description */
  description: string

  /** LLM call type */
  type: NodeType

  /** Whether the node accepts image inputs */
  multimodal: boolean

  /** Zod schema for input validation */
  inputSchema: TInput

  /** Zod schema for output validation */
  outputSchema: TOutput

  /** Default temperature for LLM calls */
  defaultTemperature: number

  /** Category for grouping in UI */
  category: 'spec' | 'enclosure' | 'firmware' | 'export' | 'admin'

  /**
   * The invoke function that performs the LLM call
   * @param input - Validated input matching inputSchema
   * @param config - Optional configuration overrides
   * @param context - Execution context (LLM client, project info, etc.)
   */
  invoke: (
    input: z.infer<TInput>,
    config: NodeConfig,
    context: NodeContext
  ) => Promise<NodeInvokeResult<z.infer<TOutput>>>
}

/**
 * Context passed to node invoke functions
 */
export interface NodeContext {
  /** Project ID for cost tracking */
  projectId?: string

  /** User ID for attribution */
  userId?: string

  /** Thread ID for checkpointing */
  threadId?: string

  /** System prompt override from database */
  systemPromptOverride?: string

  /** LLM chat function */
  llmChat: (params: LLMChatParams) => Promise<LLMChatResponse>

  /** LLM image function */
  llmImage?: (params: LLMImageParams) => Promise<LLMImageResponse>
}

/**
 * LLM chat parameters
 */
export interface LLMChatParams {
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content:
      | string
      | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
  }>
  temperature?: number
  model?: string
  maxTokens?: number
  projectId?: string
}

/**
 * LLM chat response
 */
export interface LLMChatResponse {
  content: string
  model: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * LLM image parameters
 */
export interface LLMImageParams {
  prompt: string
  model?: string
  size?: string
  projectId?: string
}

/**
 * LLM image response
 */
export interface LLMImageResponse {
  url: string
  model: string
}

/**
 * Result from node invocation (before wrapping with debug info)
 */
export interface NodeInvokeResult<T> {
  output: T
  rawResponse: string
  promptTokens?: number
  completionTokens?: number
  costUsd?: number
}

// =============================================================================
// Node Metadata Schema (for API responses)
// =============================================================================

/**
 * Node metadata for listing available nodes
 */
export const NodeMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: NodeTypeSchema,
  multimodal: z.boolean(),
  category: z.enum(['spec', 'enclosure', 'firmware', 'export', 'admin']),
  defaultTemperature: z.number(),
  inputSchema: z.record(z.string(), z.unknown()), // JSON Schema
  outputSchema: z.record(z.string(), z.unknown()), // JSON Schema
})
export type NodeMetadata = z.infer<typeof NodeMetadataSchema>

// =============================================================================
// API Request/Response Schemas
// =============================================================================

/**
 * Invoke node API request
 */
export const InvokeNodeRequestSchema = z.object({
  input: z.record(z.string(), z.unknown()),
  threadId: z.string().optional(),
  config: NodeConfigSchema.optional(),
})
export type InvokeNodeRequest = z.infer<typeof InvokeNodeRequestSchema>

/**
 * Invoke node API response
 */
export const InvokeNodeResponseSchema = z.object({
  output: z.record(z.string(), z.unknown()),
  nodeId: z.string(),
  debug: ExecutionDebugSchema,
})
export type InvokeNodeResponse = z.infer<typeof InvokeNodeResponseSchema>
