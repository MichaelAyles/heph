/**
 * Debug Breakpoint Store
 * Manages the state for debug mode breakpoints that pause LLM execution
 */

import { create } from 'zustand'

/**
 * Dynamic context that can be injected into LLM calls
 * Fetched at invocation time based on node requirements
 */
export interface DynamicContext {
  /** Available PCB blocks with their capabilities */
  availableBlocks?: Array<{
    slug: string
    name: string
    category: string
    description: string
    interfaces?: string[]
  }>
  /** Current project state (spec, PCB artifacts, etc.) */
  projectState?: {
    status: string
    spec?: Record<string, unknown>
    pcbArtifacts?: Record<string, unknown>
  }
  /** User-defined requirements or constraints */
  requirements?: string[]
  /** Any additional context data */
  custom?: Record<string, unknown>
}

export interface BreakpointData {
  id: string
  nodeName: string
  nodeType: 'chat' | 'image'
  systemPromptTemplate: string // Raw template with @variables
  systemPromptExpanded: string // Expanded with actual values
  dynamicContext: DynamicContext
  fullInput: Record<string, unknown>
  invocationConfig: Record<string, unknown> | null
  tokenEstimate: number
  projectId?: string
  threadId?: string
  expiresAt: string
}

interface DebugBreakpointState {
  pendingBreakpoint: BreakpointData | null
  resolveBreakpoint: ((action: 'continue' | 'cancel') => void) | null

  // Show a breakpoint modal and wait for user action
  showBreakpoint: (data: BreakpointData) => Promise<'continue' | 'cancel'>

  // Resolve the current breakpoint (called by modal buttons)
  resolveWith: (action: 'continue' | 'cancel') => void

  // Clear the breakpoint state (for cleanup/expiry)
  clearBreakpoint: () => void
}

export const useDebugBreakpointStore = create<DebugBreakpointState>((set, get) => ({
  pendingBreakpoint: null,
  resolveBreakpoint: null,

  showBreakpoint: (data: BreakpointData) => {
    return new Promise<'continue' | 'cancel'>((resolve) => {
      set({
        pendingBreakpoint: data,
        resolveBreakpoint: resolve,
      })
    })
  },

  resolveWith: (action: 'continue' | 'cancel') => {
    const { resolveBreakpoint } = get()
    if (resolveBreakpoint) {
      resolveBreakpoint(action)
    }
    set({
      pendingBreakpoint: null,
      resolveBreakpoint: null,
    })
  },

  clearBreakpoint: () => {
    const { resolveBreakpoint } = get()
    // If there's a pending resolver, resolve with cancel
    if (resolveBreakpoint) {
      resolveBreakpoint('cancel')
    }
    set({
      pendingBreakpoint: null,
      resolveBreakpoint: null,
    })
  },
}))
