/**
 * Orchestrator Node Schema Types
 *
 * Type definitions for enhanced orchestrator prompts with input/output schemas,
 * context selectors, and iteration configuration.
 */

import { z } from 'zod'

// =============================================================================
// CONTEXT SELECTOR TYPES
// =============================================================================

/**
 * Context selector patterns:
 * - ["*"] - Include all spec fields
 * - ["description", "feasibility"] - Specific top-level fields
 * - ["decisions[*].answer"] - Extract from arrays
 * - ["!orchestratorState"] - Exclude a field
 * - ["finalSpec.pcbSize.width"] - Nested field access
 */
export type ContextSelectorPath = string

export const ContextSelectorSchema = z.array(z.string())
export type ContextSelector = z.infer<typeof ContextSelectorSchema>

// =============================================================================
// ITERATION CONFIG TYPES
// =============================================================================

/**
 * Configuration for prompt nodes that may need multiple iterations
 * (e.g., generate -> review -> fix cycles)
 */
export const IterationConfigSchema = z.object({
  /** Maximum number of attempts before escalating to user */
  maxAttempts: z.number().min(1).max(10).default(3),
  /** JavaScript expression evaluated against context to determine if iteration should stop */
  exitCondition: z.string().optional(),
  /** Numeric threshold for exit (e.g., score >= 85) */
  exitThreshold: z.number().min(0).max(100).optional(),
})

export type IterationConfig = z.infer<typeof IterationConfigSchema>

// =============================================================================
// OUTPUT FORMAT TYPES
// =============================================================================

export const OutputFormatSchema = z.enum(['json', 'code', 'text', 'image_prompt'])
export type OutputFormat = z.infer<typeof OutputFormatSchema>

// =============================================================================
// SCHEMA DEFINITION TYPES
// =============================================================================

/**
 * JSON Schema-compatible type definitions for input/output validation
 * Using z.unknown() for nested structures to avoid recursive type issues
 */
export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  enum?: string[]
  format?: string
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
}

// Simple schema for validation - uses unknown for nested properties
export const JsonSchemaPropertySchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  description: z.string().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  minItems: z.number().optional(),
  maxItems: z.number().optional(),
  enum: z.array(z.string()).optional(),
  format: z.string().optional(),
  items: z.unknown().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  required: z.array(z.string()).optional(),
})

export const NodeSchemaDefinitionSchema = z.object({
  type: z.literal('object'),
  properties: z.record(z.string(), z.unknown()),
  required: z.array(z.string()).optional(),
})

export type NodeSchemaDefinition = z.infer<typeof NodeSchemaDefinitionSchema>

// =============================================================================
// ENHANCED ORCHESTRATOR PROMPT
// =============================================================================

export const EnhancedOrchestratorPromptSchema = z.object({
  id: z.string(),
  nodeName: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  systemPrompt: z.string(),
  category: z.enum(['agent', 'generator', 'reviewer']),
  stage: z.enum(['spec', 'pcb', 'enclosure', 'firmware']).nullable(),
  isActive: z.boolean(),
  tokenEstimate: z.number().nullable(),
  version: z.number(),
  contextTags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),

  // New enhanced fields
  inputSchema: NodeSchemaDefinitionSchema.nullable().optional(),
  outputSchema: NodeSchemaDefinitionSchema.nullable().optional(),
  contextSelector: ContextSelectorSchema.nullable().optional(),
  iterationConfig: IterationConfigSchema.nullable().optional(),
  userPromptTemplate: z.string().nullable().optional(),
  outputFormat: OutputFormatSchema.default('json'),
})

export type EnhancedOrchestratorPrompt = z.infer<typeof EnhancedOrchestratorPromptSchema>

// =============================================================================
// EDGE CONDITION TYPES
// =============================================================================

/**
 * Simple condition: { field, operator, value }
 */
export const SimpleConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(['==', '!=', '>=', '<=', '>', '<', 'contains', 'notContains']),
  value: z.union([z.string(), z.number(), z.boolean()]),
})

export type SimpleCondition = z.infer<typeof SimpleConditionSchema>

/**
 * Compound conditions with AND/OR logic
 * Using a simplified schema that accepts unknown for nested arrays to avoid recursive issues
 */
export interface CompoundCondition {
  field?: string
  operator?: '==' | '!=' | '>=' | '<=' | '>' | '<' | 'contains' | 'notContains'
  value?: string | number | boolean
  all?: CompoundCondition[]
  any?: CompoundCondition[]
}

export const CompoundConditionSchema = z.union([
  SimpleConditionSchema,
  z.object({ all: z.array(z.unknown()) }),
  z.object({ any: z.array(z.unknown()) }),
])

// =============================================================================
// ENHANCED ORCHESTRATOR EDGE
// =============================================================================

export const EnhancedOrchestratorEdgeSchema = z.object({
  id: z.string(),
  fromNode: z.string(),
  toNode: z.string(),
  condition: CompoundConditionSchema.nullable(),
  edgeType: z.enum(['flow', 'conditional', 'loop']),
  priority: z.number(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  maxLoops: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type EnhancedOrchestratorEdge = z.infer<typeof EnhancedOrchestratorEdgeSchema>

// =============================================================================
// EXECUTION CONTEXT TYPES
// =============================================================================

/**
 * Runtime context available during edge condition evaluation
 */
export interface EdgeExecutionContext {
  /** Current orchestrator mode */
  mode: 'vibe_it' | 'fix_it' | 'design_it' | 'debug_it'
  /** Current spec state */
  spec: Record<string, unknown>
  /** Result from the last tool/prompt execution */
  lastResult: Record<string, unknown> | null
  /** Result from the last validation */
  lastValidation: { isValid: boolean; errors?: string[] } | null
  /** Result from the last review */
  lastReview: { score: number; verdict: string; issues: unknown[] } | null
  /** Loop counts per stage */
  loopCount: {
    spec: number
    pcb: number
    enclosure: number
    firmware: number
  }
  /** Current stage */
  currentStage: 'spec' | 'pcb' | 'enclosure' | 'firmware' | 'export'
}

/**
 * State tracked during edge-driven execution
 */
export interface EdgeExecutionState {
  currentNode: string
  visitedNodes: Set<string>
  loopCounts: Map<string, number>
  context: EdgeExecutionContext
  history: Array<{
    node: string
    edge: string | null
    timestamp: string
    result?: unknown
  }>
}

// =============================================================================
// PROMPT EXECUTION TYPES
// =============================================================================

/**
 * Input for executing a prompt node
 */
export interface PromptExecutionInput {
  /** The prompt definition */
  prompt: EnhancedOrchestratorPrompt
  /** Context built from selector */
  context: Record<string, unknown>
  /** Optional feedback from previous iteration */
  feedback?: string
  /** Current iteration number (for loops) */
  iteration?: number
}

/**
 * Result from executing a prompt node
 */
export interface PromptExecutionResult {
  /** Whether execution was successful */
  success: boolean
  /** The parsed/validated output */
  data?: unknown
  /** Raw LLM response */
  rawResponse?: string
  /** Validation errors if any */
  errors?: string[]
  /** Token usage */
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}
