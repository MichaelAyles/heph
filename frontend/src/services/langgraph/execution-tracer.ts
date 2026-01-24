/**
 * Execution Tracer - Event types and utilities for LangGraph debugging
 *
 * Provides types and helpers for tracking graph execution in real-time.
 * Used by the debugger UI to show node highlighting, edge animations, and state inspection.
 *
 * Supports both flat graphs and nested subgraph execution.
 */

import { z } from 'zod'

// =============================================================================
// Event Schemas
// =============================================================================

export const GraphStartEventSchema = z.object({
  type: z.literal('graph_start'),
  graphId: z.string(),
  timestamp: z.number(),
  threadId: z.string().optional(),
  input: z.unknown().optional(),
})

export const NodeEnterEventSchema = z.object({
  type: z.literal('node_enter'),
  node: z.string(),
  timestamp: z.number(),
  state: z.record(z.string(), z.unknown()),
  subgraph: z.string().optional(), // Which subgraph this node belongs to
})

export const NodeExitEventSchema = z.object({
  type: z.literal('node_exit'),
  node: z.string(),
  timestamp: z.number(),
  output: z.record(z.string(), z.unknown()),
  durationMs: z.number(),
  stateAfter: z.record(z.string(), z.unknown()).optional(),
  subgraph: z.string().optional(), // Which subgraph this node belongs to
})

export const EdgeTakenEventSchema = z.object({
  type: z.literal('edge_taken'),
  from: z.string(),
  to: z.string(),
  timestamp: z.number(),
  condition: z.string().optional(),
  conditional: z.boolean().default(false),
  subgraph: z.string().optional(), // Which subgraph this edge belongs to
})

export const GraphEndEventSchema = z.object({
  type: z.literal('graph_end'),
  timestamp: z.number(),
  finalState: z.record(z.string(), z.unknown()),
  totalDurationMs: z.number(),
  success: z.boolean().default(true),
})

export const ErrorEventSchema = z.object({
  type: z.literal('error'),
  node: z.string().optional(),
  timestamp: z.number(),
  error: z.string(),
  stack: z.string().optional(),
  subgraph: z.string().optional(), // Which subgraph the error occurred in
})

// New: Subgraph lifecycle events
export const SubgraphEnterEventSchema = z.object({
  type: z.literal('subgraph_enter'),
  subgraphId: z.string(), // 'spec' | 'pcb' | 'enclosure' | 'firmware' | 'export'
  parentNode: z.string(), // The node in the parent graph that invoked this subgraph
  timestamp: z.number(),
  state: z.record(z.string(), z.unknown()).optional(),
})

export const SubgraphExitEventSchema = z.object({
  type: z.literal('subgraph_exit'),
  subgraphId: z.string(),
  parentNode: z.string(),
  timestamp: z.number(),
  durationMs: z.number(),
  success: z.boolean().default(true),
  output: z.record(z.string(), z.unknown()).optional(),
})

export const ExecutionEventSchema = z.discriminatedUnion('type', [
  GraphStartEventSchema,
  NodeEnterEventSchema,
  NodeExitEventSchema,
  EdgeTakenEventSchema,
  GraphEndEventSchema,
  ErrorEventSchema,
  SubgraphEnterEventSchema,
  SubgraphExitEventSchema,
])

// =============================================================================
// Types
// =============================================================================

export type GraphStartEvent = z.infer<typeof GraphStartEventSchema>
export type NodeEnterEvent = z.infer<typeof NodeEnterEventSchema>
export type NodeExitEvent = z.infer<typeof NodeExitEventSchema>
export type EdgeTakenEvent = z.infer<typeof EdgeTakenEventSchema>
export type GraphEndEvent = z.infer<typeof GraphEndEventSchema>
export type ErrorEvent = z.infer<typeof ErrorEventSchema>
export type SubgraphEnterEvent = z.infer<typeof SubgraphEnterEventSchema>
export type SubgraphExitEvent = z.infer<typeof SubgraphExitEventSchema>
export type ExecutionEvent = z.infer<typeof ExecutionEventSchema>

// =============================================================================
// Execution Run
// =============================================================================

export interface ExecutionRun {
  /** Unique identifier for this execution run */
  id: string
  /** Thread ID (for checkpointing) */
  threadId?: string
  /** User input that triggered the run */
  input: string
  /** Ordered list of execution events */
  events: ExecutionEvent[]
  /** Start timestamp */
  startedAt: number
  /** End timestamp (if completed) */
  endedAt?: number
  /** Total duration in milliseconds */
  durationMs?: number
  /** Whether the run completed successfully */
  success?: boolean
  /** Error message if failed */
  error?: string
}

// =============================================================================
// Node Status
// =============================================================================

export type NodeStatus = 'idle' | 'entering' | 'active' | 'exiting' | 'completed' | 'error'

export interface NodeState {
  status: NodeStatus
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  durationMs?: number
  error?: string
  enteredAt?: number
  exitedAt?: number
}

export interface EdgeState {
  active: boolean
  takenAt?: number
  condition?: string
}

// =============================================================================
// Subgraph Status
// =============================================================================

export type SubgraphStatus = 'idle' | 'running' | 'completed' | 'error'

export interface SubgraphState {
  status: SubgraphStatus
  parentNode: string
  enteredAt?: number
  exitedAt?: number
  durationMs?: number
  success?: boolean
  nodeStates: Map<string, NodeState>
}

// =============================================================================
// Timeline Step
// =============================================================================

export interface TimelineStep {
  index: number
  type: ExecutionEvent['type']
  node?: string
  from?: string
  to?: string
  timestamp: number
  durationMs?: number
  label: string
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a graph start event
 */
export function createGraphStartEvent(
  graphId: string,
  input?: unknown,
  threadId?: string
): GraphStartEvent {
  return {
    type: 'graph_start',
    graphId,
    timestamp: Date.now(),
    threadId,
    input,
  }
}

/**
 * Create a node enter event
 */
export function createNodeEnterEvent(node: string, state: Record<string, unknown>): NodeEnterEvent {
  return {
    type: 'node_enter',
    node,
    timestamp: Date.now(),
    state,
  }
}

/**
 * Create a node exit event
 */
export function createNodeExitEvent(
  node: string,
  output: Record<string, unknown>,
  durationMs: number,
  stateAfter?: Record<string, unknown>
): NodeExitEvent {
  return {
    type: 'node_exit',
    node,
    timestamp: Date.now(),
    output,
    durationMs,
    stateAfter,
  }
}

/**
 * Create an edge taken event
 */
export function createEdgeTakenEvent(
  from: string,
  to: string,
  conditional: boolean = false,
  condition?: string
): EdgeTakenEvent {
  return {
    type: 'edge_taken',
    from,
    to,
    timestamp: Date.now(),
    conditional,
    condition,
  }
}

/**
 * Create a graph end event
 */
export function createGraphEndEvent(
  finalState: Record<string, unknown>,
  totalDurationMs: number,
  success: boolean = true
): GraphEndEvent {
  return {
    type: 'graph_end',
    timestamp: Date.now(),
    finalState,
    totalDurationMs,
    success,
  }
}

/**
 * Create an error event
 */
export function createErrorEvent(
  error: string,
  node?: string,
  stack?: string,
  subgraph?: string
): ErrorEvent {
  return {
    type: 'error',
    timestamp: Date.now(),
    error,
    node,
    stack,
    subgraph,
  }
}

/**
 * Create a subgraph enter event
 */
export function createSubgraphEnterEvent(
  subgraphId: string,
  parentNode: string,
  state?: Record<string, unknown>
): SubgraphEnterEvent {
  return {
    type: 'subgraph_enter',
    subgraphId,
    parentNode,
    timestamp: Date.now(),
    state,
  }
}

/**
 * Create a subgraph exit event
 */
export function createSubgraphExitEvent(
  subgraphId: string,
  parentNode: string,
  durationMs: number,
  success: boolean = true,
  output?: Record<string, unknown>
): SubgraphExitEvent {
  return {
    type: 'subgraph_exit',
    subgraphId,
    parentNode,
    timestamp: Date.now(),
    durationMs,
    success,
    output,
  }
}

/**
 * Convert execution events to timeline steps
 */
export function eventsToTimeline(events: ExecutionEvent[]): TimelineStep[] {
  // Filter out undefined/null events
  const validEvents = events.filter((e): e is ExecutionEvent => e != null)

  return validEvents.map((event, index) => {
    switch (event.type) {
      case 'graph_start':
        return {
          index,
          type: event.type,
          timestamp: event.timestamp,
          label: 'Start',
        }
      case 'node_enter':
        return {
          index,
          type: event.type,
          node: event.node,
          timestamp: event.timestamp,
          label: event.subgraph ? `[${event.subgraph}] Enter ${event.node}` : `Enter ${event.node}`,
        }
      case 'node_exit':
        return {
          index,
          type: event.type,
          node: event.node,
          timestamp: event.timestamp,
          durationMs: event.durationMs,
          label: event.subgraph ? `[${event.subgraph}] Exit ${event.node}` : `Exit ${event.node}`,
        }
      case 'edge_taken':
        return {
          index,
          type: event.type,
          from: event.from,
          to: event.to,
          timestamp: event.timestamp,
          label: event.subgraph
            ? `[${event.subgraph}] ${event.from} → ${event.to}`
            : `${event.from} → ${event.to}`,
        }
      case 'graph_end':
        return {
          index,
          type: event.type,
          timestamp: event.timestamp,
          durationMs: event.totalDurationMs,
          label: event.success ? 'Complete' : 'Failed',
        }
      case 'error':
        return {
          index,
          type: event.type,
          node: event.node,
          timestamp: event.timestamp,
          label: event.subgraph
            ? `[${event.subgraph}] Error${event.node ? ` in ${event.node}` : ''}`
            : `Error${event.node ? ` in ${event.node}` : ''}`,
        }
      case 'subgraph_enter':
        return {
          index,
          type: event.type,
          node: event.parentNode,
          timestamp: event.timestamp,
          label: `Enter subgraph: ${event.subgraphId}`,
        }
      case 'subgraph_exit':
        return {
          index,
          type: event.type,
          node: event.parentNode,
          timestamp: event.timestamp,
          durationMs: event.durationMs,
          label: event.success
            ? `Exit subgraph: ${event.subgraphId}`
            : `Subgraph failed: ${event.subgraphId}`,
        }
    }
  })
}

/**
 * Get node states at a specific point in time (by event index)
 */
export function getNodeStatesAtStep(
  events: ExecutionEvent[],
  stepIndex: number
): Map<string, NodeState> {
  const states = new Map<string, NodeState>()

  for (let i = 0; i <= stepIndex && i < events.length; i++) {
    const event = events[i]
    if (!event) continue // Skip undefined events

    switch (event.type) {
      case 'node_enter':
        states.set(event.node, {
          status: 'active',
          input: event.state,
          enteredAt: event.timestamp,
        })
        break
      case 'node_exit': {
        const existing = states.get(event.node)
        states.set(event.node, {
          ...existing,
          status: 'completed',
          output: event.output,
          durationMs: event.durationMs,
          exitedAt: event.timestamp,
        })
        break
      }
      case 'error': {
        if (event.node) {
          const errorState = states.get(event.node) || { status: 'idle' }
          states.set(event.node, {
            ...errorState,
            status: 'error',
            error: event.error,
          })
        }
        break
      }
    }
  }

  return states
}

/**
 * Get active edges at a specific point in time (by event index)
 */
export function getActiveEdgesAtStep(
  events: ExecutionEvent[],
  stepIndex: number
): Map<string, EdgeState> {
  const edges = new Map<string, EdgeState>()

  for (let i = 0; i <= stepIndex && i < events.length; i++) {
    const event = events[i]
    if (!event) continue // Skip undefined events

    if (event.type === 'edge_taken') {
      const edgeKey = `${event.from}->${event.to}`
      edges.set(edgeKey, {
        active: true,
        takenAt: event.timestamp,
        condition: event.condition,
      })
    }
  }

  return edges
}

/**
 * Calculate node stats from a series of execution runs
 */
export function calculateNodeStats(
  runs: ExecutionRun[]
): Map<string, { avgDuration: number; successRate: number; runCount: number }> {
  const stats = new Map<string, { durations: number[]; successes: number }>()

  for (const run of runs) {
    for (const event of run.events) {
      if (event.type === 'node_exit') {
        const existing = stats.get(event.node) || { durations: [], successes: 0 }
        existing.durations.push(event.durationMs)
        existing.successes++
        stats.set(event.node, existing)
      }
      if (event.type === 'error' && event.node) {
        const existing = stats.get(event.node) || { durations: [], successes: 0 }
        // Don't increment successes
        stats.set(event.node, existing)
      }
    }
  }

  const result = new Map<string, { avgDuration: number; successRate: number; runCount: number }>()

  for (const [node, data] of stats) {
    const totalRuns = data.durations.length + (stats.get(node)?.successes === 0 ? 1 : 0)
    result.set(node, {
      avgDuration:
        data.durations.length > 0
          ? data.durations.reduce((a, b) => a + b, 0) / data.durations.length
          : 0,
      successRate: totalRuns > 0 ? data.successes / totalRuns : 0,
      runCount: data.durations.length,
    })
  }

  return result
}

/**
 * Get subgraph states at a specific point in time (by event index)
 */
export function getSubgraphStatesAtStep(
  events: ExecutionEvent[],
  stepIndex: number
): Map<string, SubgraphState> {
  const subgraphs = new Map<string, SubgraphState>()

  for (let i = 0; i <= stepIndex && i < events.length; i++) {
    const event = events[i]
    if (!event) continue

    switch (event.type) {
      case 'subgraph_enter':
        subgraphs.set(event.subgraphId, {
          status: 'running',
          parentNode: event.parentNode,
          enteredAt: event.timestamp,
          nodeStates: new Map(),
        })
        break

      case 'subgraph_exit': {
        const existing = subgraphs.get(event.subgraphId)
        if (existing) {
          subgraphs.set(event.subgraphId, {
            ...existing,
            status: event.success ? 'completed' : 'error',
            exitedAt: event.timestamp,
            durationMs: event.durationMs,
            success: event.success,
          })
        }
        break
      }

      case 'node_enter':
        if (event.subgraph) {
          const subgraphState = subgraphs.get(event.subgraph)
          if (subgraphState) {
            subgraphState.nodeStates.set(event.node, {
              status: 'active',
              input: event.state,
              enteredAt: event.timestamp,
            })
          }
        }
        break

      case 'node_exit':
        if (event.subgraph) {
          const subgraphState = subgraphs.get(event.subgraph)
          if (subgraphState) {
            const existing = subgraphState.nodeStates.get(event.node)
            subgraphState.nodeStates.set(event.node, {
              ...existing,
              status: 'completed',
              output: event.output,
              durationMs: event.durationMs,
              exitedAt: event.timestamp,
            })
          }
        }
        break

      case 'error':
        if (event.subgraph) {
          const subgraphState = subgraphs.get(event.subgraph)
          if (subgraphState && event.node) {
            const existing = subgraphState.nodeStates.get(event.node) || { status: 'idle' as const }
            subgraphState.nodeStates.set(event.node, {
              ...existing,
              status: 'error',
              error: event.error,
            })
          }
        }
        break
    }
  }

  return subgraphs
}

/**
 * Get the currently active subgraph at a step
 */
export function getActiveSubgraphAtStep(
  events: ExecutionEvent[],
  stepIndex: number
): string | null {
  const subgraphStates = getSubgraphStatesAtStep(events, stepIndex)

  for (const [subgraphId, state] of subgraphStates) {
    if (state.status === 'running') {
      return subgraphId
    }
  }

  return null
}

/**
 * Calculate subgraph stats from a series of execution runs
 */
export function calculateSubgraphStats(
  runs: ExecutionRun[]
): Map<string, { avgDuration: number; successRate: number; runCount: number }> {
  const stats = new Map<string, { durations: number[]; successes: number; failures: number }>()

  for (const run of runs) {
    for (const event of run.events) {
      if (event.type === 'subgraph_exit') {
        const existing = stats.get(event.subgraphId) || { durations: [], successes: 0, failures: 0 }
        existing.durations.push(event.durationMs)
        if (event.success) {
          existing.successes++
        } else {
          existing.failures++
        }
        stats.set(event.subgraphId, existing)
      }
    }
  }

  const result = new Map<string, { avgDuration: number; successRate: number; runCount: number }>()

  for (const [subgraphId, data] of stats) {
    const totalRuns = data.successes + data.failures
    result.set(subgraphId, {
      avgDuration:
        data.durations.length > 0
          ? data.durations.reduce((a, b) => a + b, 0) / data.durations.length
          : 0,
      successRate: totalRuns > 0 ? data.successes / totalRuns : 0,
      runCount: totalRuns,
    })
  }

  return result
}

/**
 * Filter events to only those within a specific subgraph
 */
export function filterEventsBySubgraph(
  events: ExecutionEvent[],
  subgraphId: string
): ExecutionEvent[] {
  let inSubgraph = false
  const filtered: ExecutionEvent[] = []

  for (const event of events) {
    if (event.type === 'subgraph_enter' && event.subgraphId === subgraphId) {
      inSubgraph = true
      filtered.push(event)
    } else if (event.type === 'subgraph_exit' && event.subgraphId === subgraphId) {
      filtered.push(event)
      inSubgraph = false
    } else if (inSubgraph) {
      // Include events that belong to this subgraph
      if (
        (event.type === 'node_enter' ||
          event.type === 'node_exit' ||
          event.type === 'edge_taken' ||
          event.type === 'error') &&
        event.subgraph === subgraphId
      ) {
        filtered.push(event)
      }
    }
  }

  return filtered
}
