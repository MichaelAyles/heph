/**
 * Execution Tracer - Event types and utilities for LangGraph debugging
 *
 * Provides types and helpers for tracking graph execution in real-time.
 * Used by the debugger UI to show node highlighting, edge animations, and state inspection.
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
})

export const NodeExitEventSchema = z.object({
  type: z.literal('node_exit'),
  node: z.string(),
  timestamp: z.number(),
  output: z.record(z.string(), z.unknown()),
  durationMs: z.number(),
  stateAfter: z.record(z.string(), z.unknown()).optional(),
})

export const EdgeTakenEventSchema = z.object({
  type: z.literal('edge_taken'),
  from: z.string(),
  to: z.string(),
  timestamp: z.number(),
  condition: z.string().optional(),
  conditional: z.boolean().default(false),
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
})

export const ExecutionEventSchema = z.discriminatedUnion('type', [
  GraphStartEventSchema,
  NodeEnterEventSchema,
  NodeExitEventSchema,
  EdgeTakenEventSchema,
  GraphEndEventSchema,
  ErrorEventSchema,
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
export function createErrorEvent(error: string, node?: string, stack?: string): ErrorEvent {
  return {
    type: 'error',
    timestamp: Date.now(),
    error,
    node,
    stack,
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
          label: `Enter ${event.node}`,
        }
      case 'node_exit':
        return {
          index,
          type: event.type,
          node: event.node,
          timestamp: event.timestamp,
          durationMs: event.durationMs,
          label: `Exit ${event.node}`,
        }
      case 'edge_taken':
        return {
          index,
          type: event.type,
          from: event.from,
          to: event.to,
          timestamp: event.timestamp,
          label: `${event.from} → ${event.to}`,
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
          label: `Error${event.node ? ` in ${event.node}` : ''}`,
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
