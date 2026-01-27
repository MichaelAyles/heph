/**
 * LangGraph Node Registry
 *
 * Central registry for all standalone LangGraph nodes.
 * Nodes can be looked up by name and invoked via API.
 */

import { z } from 'zod'
import type { LangGraphNode, NodeMetadata, NodeContext, NodeConfig } from './types'

/**
 * Convert a Zod schema to a simplified JSON schema representation.
 * This is a basic implementation that works with Zod 4's new API.
 */
function schemaToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  // For now, return a basic representation
  // In a full implementation, we'd walk the schema structure
  try {
    // Try to get type info from the schema
    const description = (schema as unknown as { description?: string }).description
    return {
      type: 'object',
      description: description || 'Schema definition',
    }
  } catch {
    return { type: 'unknown' }
  }
}

// =============================================================================
// Registry
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeRegistry = new Map<string, LangGraphNode<any, any>>()

/**
 * Register a node in the registry
 */
export function registerNode<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny>(
  node: LangGraphNode<TInput, TOutput>
): void {
  if (nodeRegistry.has(node.name)) {
    console.warn(`Node "${node.name}" is already registered. Overwriting.`)
  }
  nodeRegistry.set(node.name, node)
}

/**
 * Get a node by name
 */
export function getNode(name: string): LangGraphNode | undefined {
  return nodeRegistry.get(name)
}

/**
 * Check if a node exists
 */
export function hasNode(name: string): boolean {
  return nodeRegistry.has(name)
}

/**
 * Get all registered nodes
 */
export function getAllNodes(): LangGraphNode[] {
  return Array.from(nodeRegistry.values())
}

/**
 * Get all node names
 */
export function getAllNodeNames(): string[] {
  return Array.from(nodeRegistry.keys())
}

/**
 * Get metadata for all nodes (for API responses)
 */
export function getAllNodeMetadata(): NodeMetadata[] {
  return getAllNodes().map((node) => ({
    name: node.name,
    description: node.description,
    type: node.type,
    multimodal: node.multimodal,
    category: node.category,
    defaultTemperature: node.defaultTemperature,
    inputSchema: schemaToJsonSchema(node.inputSchema),
    outputSchema: schemaToJsonSchema(node.outputSchema),
  }))
}

/**
 * Get metadata for a specific node
 */
export function getNodeMetadata(name: string): NodeMetadata | undefined {
  const node = getNode(name)
  if (!node) return undefined

  return {
    name: node.name,
    description: node.description,
    type: node.type,
    multimodal: node.multimodal,
    category: node.category,
    defaultTemperature: node.defaultTemperature,
    inputSchema: schemaToJsonSchema(node.inputSchema),
    outputSchema: schemaToJsonSchema(node.outputSchema),
  }
}

// =============================================================================
// Invocation Helper
// =============================================================================

/**
 * Invoke a node by name
 *
 * @param nodeName - Name of the node to invoke
 * @param input - Input data (will be validated against node's inputSchema)
 * @param config - Optional configuration overrides
 * @param context - Execution context
 * @returns Node result with output and debug info
 */
export async function invokeNode(
  nodeName: string,
  input: unknown,
  config: NodeConfig,
  context: NodeContext
): Promise<{
  output: unknown
  nodeId: string
  debug: {
    nodeName: string
    startTime: string
    endTime: string
    durationMs: number
    promptTokens?: number
    completionTokens?: number
    model: string
    temperature: number
    systemPrompt: string
    userPrompt: string
    rawResponse: string
    costUsd?: number
  }
}> {
  const node = getNode(nodeName)
  if (!node) {
    throw new Error(`Node "${nodeName}" not found in registry`)
  }

  // Validate input
  const parseResult = node.inputSchema.safeParse(input)
  if (!parseResult.success) {
    throw new Error(`Invalid input for node "${nodeName}": ${parseResult.error.message}`)
  }

  const nodeId = crypto.randomUUID()
  const startTime = new Date().toISOString()
  const startMs = Date.now()

  // Merge config with defaults
  const finalConfig: NodeConfig = {
    temperature: config.temperature ?? node.defaultTemperature,
    model: config.model,
    maxTokens: config.maxTokens,
  }

  // Invoke the node
  const result = await node.invoke(parseResult.data, finalConfig, context)

  const endTime = new Date().toISOString()
  const durationMs = Date.now() - startMs

  // Validate output
  const outputParseResult = node.outputSchema.safeParse(result.output)
  if (!outputParseResult.success) {
    console.warn(
      `Output validation failed for node "${nodeName}": ${outputParseResult.error.message}`
    )
    // Continue anyway - output may have extra fields
  }

  return {
    output: result.output,
    nodeId,
    debug: {
      nodeName,
      startTime,
      endTime,
      durationMs,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      model: finalConfig.model || 'default',
      temperature: finalConfig.temperature ?? node.defaultTemperature,
      systemPrompt: context.systemPromptOverride || '(using default prompt)',
      userPrompt: JSON.stringify(input).slice(0, 1000),
      rawResponse: result.rawResponse,
      costUsd: result.costUsd,
    },
  }
}
