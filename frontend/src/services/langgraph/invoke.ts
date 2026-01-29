/**
 * LangGraph Node Invoke Wrapper
 *
 * Wrapper for invoking LangGraph nodes that handles debug_it mode breakpoints.
 * When in debug_it mode, execution pauses and shows a modal before each LLM call.
 */

import { useDebugBreakpointStore, type BreakpointData } from '../../stores/debug-breakpoint'
import type { NodeConfig, InvokeNodeResponse } from './nodes/types'

export interface InvokeNodeParams {
  nodeName: string
  input: Record<string, unknown>
  projectId?: string
  threadId?: string
  config?: NodeConfig
}

export interface InvokeNodeResult {
  output: Record<string, unknown>
  nodeId: string
  debug: InvokeNodeResponse['debug']
}

export class BreakpointCancelledError extends Error {
  constructor() {
    super('Execution cancelled at debug breakpoint')
    this.name = 'BreakpointCancelledError'
  }
}

export class BreakpointExpiredError extends Error {
  constructor() {
    super('Debug breakpoint expired')
    this.name = 'BreakpointExpiredError'
  }
}

/**
 * Invoke a LangGraph node with debug_it mode breakpoint support.
 *
 * When the user is in debug_it mode, this function will:
 * 1. Make the initial invoke request
 * 2. If paused, show the breakpoint modal via Zustand store
 * 3. Wait for user to click Continue or Cancel
 * 4. Resolve the breakpoint via API and return the final result
 */
export async function invokeLangGraphNode(params: InvokeNodeParams): Promise<InvokeNodeResult> {
  const { nodeName, input, projectId, threadId, config } = params

  // Make the initial invoke request
  const response = await fetch(`/api/langgraph/invoke/${nodeName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input,
      projectId,
      threadId,
      config,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || `Failed to invoke node ${nodeName}`)
  }

  const result = await response.json()

  // Check if execution was paused for debug breakpoint
  if (result.paused && result.breakpointData) {
    const breakpointData = result.breakpointData as BreakpointData

    // Show the breakpoint modal and wait for user action
    const store = useDebugBreakpointStore.getState()
    const action = await store.showBreakpoint(breakpointData)

    // Resolve the breakpoint via API
    const resolveResponse = await fetch(`/api/langgraph/breakpoint/${breakpointData.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })

    if (!resolveResponse.ok) {
      const error = await resolveResponse.json()

      if (error.expired) {
        throw new BreakpointExpiredError()
      }

      throw new Error(error.error || 'Failed to resolve breakpoint')
    }

    const resolveResult = await resolveResponse.json()

    // If cancelled, throw a cancellation error
    if (resolveResult.cancelled) {
      throw new BreakpointCancelledError()
    }

    // Return the actual invocation result
    return {
      output: resolveResult.output,
      nodeId: resolveResult.nodeId,
      debug: resolveResult.debug,
    }
  }

  // Normal execution (no breakpoint)
  return {
    output: result.output,
    nodeId: result.nodeId,
    debug: result.debug,
  }
}
