/**
 * Edge Execution Engine
 *
 * Graph-driven execution engine that uses orchestrator edges to determine
 * workflow transitions, handle loops, and execute lifecycle hooks.
 */

import type {
  EnhancedOrchestratorEdge,
  CompoundCondition,
  EdgeExecutionContext,
  EdgeExecutionState,
} from '../../schemas/orchestrator-node'
import type { OrchestratorHook } from '../../db/schema'
import { logger } from '../../lib/logger'

// =============================================================================
// EDGE EXECUTION ENGINE CLASS
// =============================================================================

export class EdgeExecutionEngine {
  private edges: EnhancedOrchestratorEdge[] = []
  private hooks: OrchestratorHook[] = []
  private state: EdgeExecutionState

  constructor(initialNode = 'start') {
    this.state = {
      currentNode: initialNode,
      visitedNodes: new Set([initialNode]),
      loopCounts: new Map(),
      context: this.createEmptyContext(),
      history: [],
    }
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Load edges from the database or API.
   */
  async loadEdges(): Promise<void> {
    try {
      const response = await fetch('/api/orchestrator/edges/graph')
      if (!response.ok) {
        throw new Error(`Failed to load edges: ${response.status}`)
      }
      const data = await response.json()
      this.edges = (data.edges || data).map(this.transformEdgeRow)
    } catch (error) {
      logger.error('orchestrator', 'Failed to load edges, using empty graph', { error })
      this.edges = []
    }
  }

  /**
   * Load hooks from the database or API.
   */
  async loadHooks(): Promise<void> {
    try {
      const response = await fetch('/api/admin/orchestrator/hooks')
      if (!response.ok) {
        // Hooks are optional, don't throw
        logger.warn('orchestrator', `Failed to load hooks: ${response.status}`)
        return
      }
      const data = await response.json()
      this.hooks = data.hooks || data || []
    } catch (error) {
      logger.warn('orchestrator', 'Failed to load hooks', { error })
      this.hooks = []
    }
  }

  /**
   * Set edges directly (for testing or when already loaded).
   */
  setEdges(edges: EnhancedOrchestratorEdge[]): void {
    this.edges = edges
  }

  /**
   * Set hooks directly.
   */
  setHooks(hooks: OrchestratorHook[]): void {
    this.hooks = hooks
  }

  // ===========================================================================
  // STATE MANAGEMENT
  // ===========================================================================

  /**
   * Get current execution state.
   */
  getState(): EdgeExecutionState {
    return { ...this.state }
  }

  /**
   * Update execution context.
   */
  updateContext(updates: Partial<EdgeExecutionContext>): void {
    this.state.context = { ...this.state.context, ...updates }
  }

  /**
   * Get current node name.
   */
  getCurrentNode(): string {
    return this.state.currentNode
  }

  /**
   * Reset to a specific node.
   */
  resetTo(nodeName: string): void {
    this.state.currentNode = nodeName
    this.state.visitedNodes.add(nodeName)
    this.addToHistory(nodeName, null)
  }

  // ===========================================================================
  // EDGE NAVIGATION
  // ===========================================================================

  /**
   * Get all possible next nodes from the current node.
   * Returns nodes sorted by priority (higher priority first).
   */
  getNextNodes(): string[] {
    const outgoingEdges = this.edges
      .filter((edge) => edge.fromNode === this.state.currentNode && edge.isActive)
      .sort((a, b) => b.priority - a.priority)

    const validNextNodes: string[] = []

    for (const edge of outgoingEdges) {
      // Check if condition is met
      if (!edge.condition || this.evaluateCondition(edge.condition as CompoundCondition)) {
        // Check loop limits
        if (edge.edgeType === 'loop' && edge.maxLoops) {
          const loopKey = `${edge.fromNode}->${edge.toNode}`
          const currentCount = this.state.loopCounts.get(loopKey) || 0
          if (currentCount >= edge.maxLoops) {
            continue // Skip this edge, max loops reached
          }
        }

        validNextNodes.push(edge.toNode)
      }
    }

    return validNextNodes
  }

  /**
   * Get the single best next node (highest priority valid transition).
   */
  getNextNode(): string | null {
    const nextNodes = this.getNextNodes()
    return nextNodes.length > 0 ? nextNodes[0] : null
  }

  /**
   * Transition to the next node.
   * Executes hooks and updates state.
   */
  async transitionTo(nodeName: string): Promise<boolean> {
    // Find the edge being taken
    const edge = this.edges.find(
      (e) => e.fromNode === this.state.currentNode && e.toNode === nodeName && e.isActive
    )

    if (!edge) {
      logger.warn('orchestrator', `No edge from ${this.state.currentNode} to ${nodeName}`)
      return false
    }

    // Execute on_exit hooks for current node
    await this.executeHooks(this.state.currentNode, 'on_exit')

    // Update loop counts for loop edges
    if (edge.edgeType === 'loop') {
      const loopKey = `${edge.fromNode}->${edge.toNode}`
      const currentCount = this.state.loopCounts.get(loopKey) || 0
      this.state.loopCounts.set(loopKey, currentCount + 1)
    }

    // Update state
    const previousNode = this.state.currentNode
    this.state.currentNode = nodeName
    this.state.visitedNodes.add(nodeName)

    // Add to history
    this.addToHistory(nodeName, edge.id)

    // Execute on_enter hooks for new node
    await this.executeHooks(nodeName, 'on_enter')

    console.log(`Transitioned from ${previousNode} to ${nodeName} via ${edge.id}`)
    return true
  }

  /**
   * Check if the workflow is complete.
   */
  isComplete(): boolean {
    return this.state.currentNode === 'end' || this.getNextNode() === null
  }

  /**
   * Get loop count for a specific edge.
   */
  getLoopCount(fromNode: string, toNode: string): number {
    const loopKey = `${fromNode}->${toNode}`
    return this.state.loopCounts.get(loopKey) || 0
  }

  /**
   * Reset loop count for an edge.
   */
  resetLoopCount(fromNode: string, toNode: string): void {
    const loopKey = `${fromNode}->${toNode}`
    this.state.loopCounts.delete(loopKey)
  }

  // ===========================================================================
  // CONDITION EVALUATION
  // ===========================================================================

  /**
   * Evaluate a condition against the current context.
   */
  evaluateCondition(condition: CompoundCondition): boolean {
    // Handle compound conditions
    if ('all' in condition && condition.all) {
      return condition.all.every((c) => this.evaluateCondition(c))
    }

    if ('any' in condition && condition.any) {
      return condition.any.some((c) => this.evaluateCondition(c))
    }

    // Handle simple condition
    if (!condition.field || !condition.operator) {
      return true // No condition means always pass
    }

    const actualValue = this.getContextValue(condition.field)
    const expectedValue = condition.value

    return this.compareValues(actualValue, condition.operator, expectedValue)
  }

  /**
   * Get a value from the execution context by dot-path.
   */
  private getContextValue(path: string): unknown {
    const parts = path.split('.')
    let current: unknown = this.state.context

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined
      }
      if (typeof current !== 'object') {
        return undefined
      }
      current = (current as Record<string, unknown>)[part]
    }

    return current
  }

  /**
   * Compare two values with an operator.
   */
  private compareValues(actual: unknown, operator: string, expected: unknown): boolean {
    switch (operator) {
      case '==':
        return actual === expected
      case '!=':
        return actual !== expected
      case '>=':
        return typeof actual === 'number' && typeof expected === 'number' && actual >= expected
      case '<=':
        return typeof actual === 'number' && typeof expected === 'number' && actual <= expected
      case '>':
        return typeof actual === 'number' && typeof expected === 'number' && actual > expected
      case '<':
        return typeof actual === 'number' && typeof expected === 'number' && actual < expected
      case 'contains':
        if (typeof actual === 'string' && typeof expected === 'string') {
          return actual.includes(expected)
        }
        if (Array.isArray(actual)) {
          return actual.includes(expected)
        }
        return false
      case 'notContains':
        if (typeof actual === 'string' && typeof expected === 'string') {
          return !actual.includes(expected)
        }
        if (Array.isArray(actual)) {
          return !actual.includes(expected)
        }
        return true
      default:
        logger.warn('orchestrator', `Unknown operator: ${operator}`)
        return false
    }
  }

  // ===========================================================================
  // HOOK EXECUTION
  // ===========================================================================

  /**
   * Execute hooks for a node at a specific lifecycle point.
   */
  async executeHooks(
    nodeName: string,
    hookType: 'on_enter' | 'on_exit' | 'on_result' | 'on_error'
  ): Promise<void> {
    const nodeHooks = this.hooks
      .filter((h) => h.nodeName === nodeName && h.hookType === hookType && h.isActive)
      .sort((a, b) => a.priority - b.priority)

    for (const hook of nodeHooks) {
      try {
        await this.executeHook(hook)
      } catch (error) {
        logger.error('orchestrator', `Hook execution failed: ${hook.id}`, { error })
        // Continue with other hooks unless this is a critical hook
      }
    }
  }

  /**
   * Execute a single hook.
   */
  private async executeHook(hook: OrchestratorHook): Promise<void> {
    // Hook functions are defined as strings that reference built-in functions
    // or custom functions defined in the hook config
    const builtInHooks: Record<
      string,
      (config: Record<string, unknown>, ctx: EdgeExecutionContext) => Promise<void>
    > = {
      log: async (config) => {
        console.log(`[Hook] ${hook.nodeName}:${hook.hookType}`, config.message || '')
      },
      updateContext: async (config, ctx) => {
        Object.assign(ctx, config.updates || {})
      },
      resetLoopCount: async (config) => {
        if (config.fromNode && config.toNode) {
          this.resetLoopCount(config.fromNode as string, config.toNode as string)
        }
      },
      incrementStageLoopCount: async (_, ctx) => {
        const stage = ctx.currentStage
        if (stage in ctx.loopCount) {
          ctx.loopCount[stage as keyof typeof ctx.loopCount] += 1
        }
      },
    }

    const hookFn = builtInHooks[hook.hookFunction]
    if (hookFn) {
      await hookFn(hook.hookConfig || {}, this.state.context)
    } else {
      logger.warn('orchestrator', `Unknown hook function: ${hook.hookFunction}`)
    }
  }

  // ===========================================================================
  // HISTORY & UTILITIES
  // ===========================================================================

  /**
   * Add an entry to the execution history.
   */
  private addToHistory(node: string, edgeId: string | null): void {
    this.state.history.push({
      node,
      edge: edgeId,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Create an empty execution context.
   */
  private createEmptyContext(): EdgeExecutionContext {
    return {
      mode: 'vibe_it',
      spec: {},
      lastResult: null,
      lastValidation: null,
      lastReview: null,
      loopCount: {
        spec: 0,
        pcb: 0,
        enclosure: 0,
        firmware: 0,
      },
      currentStage: 'spec',
    }
  }

  /**
   * Transform a database row to EnhancedOrchestratorEdge.
   */
  private transformEdgeRow(row: Record<string, unknown>): EnhancedOrchestratorEdge {
    return {
      id: String(row.id || ''),
      fromNode: String(row.from_node || row.fromNode || ''),
      toNode: String(row.to_node || row.toNode || ''),
      condition: parseJsonField(row.condition, null),
      edgeType: (row.edge_type || row.edgeType || 'flow') as 'flow' | 'conditional' | 'loop',
      priority: typeof row.priority === 'number' ? row.priority : 0,
      description: row.description as string | null,
      isActive: row.is_active === 1 || row.isActive === true,
      maxLoops: typeof row.max_loops === 'number' ? row.max_loops : (row.maxLoops as number | null),
      createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
      updatedAt: String(row.updated_at || row.updatedAt || new Date().toISOString()),
    }
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Parse a JSON field that may be a string or already parsed.
 */
function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new EdgeExecutionEngine instance.
 */
export function createEdgeEngine(initialNode = 'start'): EdgeExecutionEngine {
  return new EdgeExecutionEngine(initialNode)
}

/**
 * Create and initialize an EdgeExecutionEngine with edges loaded.
 */
export async function createInitializedEdgeEngine(
  initialNode = 'start'
): Promise<EdgeExecutionEngine> {
  const engine = new EdgeExecutionEngine(initialNode)
  await Promise.all([engine.loadEdges(), engine.loadHooks()])
  return engine
}
