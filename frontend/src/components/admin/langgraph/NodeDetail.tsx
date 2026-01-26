/**
 * NodeDetail - Full node inspection panel
 *
 * Shows:
 * - Node name and category
 * - Node type, stage, and description
 * - Incoming/outgoing edges (connectivity)
 * - Current status with timing
 * - Input state (what the node received)
 * - Output/result (what the node produced)
 * - State diff (what changed)
 * - System prompt used (if applicable)
 * - LLM response (if applicable)
 */

import { useState, useMemo } from 'react'
import { clsx } from 'clsx'
import {
  ChevronDown,
  ChevronRight,
  Clock,
  FileCode,
  ArrowRight,
  ArrowLeft,
  Diff,
  Bot,
  Code2,
  Copy,
  Check,
  GitBranch,
  Database,
} from 'lucide-react'
import type { NodeState } from '../../../services/langgraph/execution-tracer'

// =============================================================================
// Types
// =============================================================================

export interface EdgeInfo {
  from: string
  to: string
  conditional: boolean
  label?: string
}

export interface NodeDetailProps {
  /** Node name */
  nodeName: string | null
  /** Node type (start, end, node) */
  nodeType?: 'start' | 'end' | 'node'
  /** Node category */
  category?: 'agent' | 'generator' | 'reviewer'
  /** Node display name */
  displayName?: string
  /** Node description */
  description?: string
  /** Stage this node belongs to */
  stage?: string | null
  /** All edges in the current graph */
  edges?: EdgeInfo[]
  /** Node state from execution */
  nodeState?: NodeState
  /** Input state when node was entered */
  inputState?: Record<string, unknown>
  /** Output produced by the node */
  outputState?: Record<string, unknown>
  /** System prompt used (if LLM node) */
  systemPrompt?: string
  /** LLM response text (if LLM node) */
  llmResponse?: string
}

// =============================================================================
// Helper Components
// =============================================================================

interface CollapsibleSectionProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  badge?: string
}

function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
  badge,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border border-surface-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-surface-800 hover:bg-surface-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-steel-dim" />
          ) : (
            <ChevronRight className="w-4 h-4 text-steel-dim" />
          )}
          <span className="text-steel-dim">{icon}</span>
          <span className="text-sm font-medium text-steel">{title}</span>
          {badge && (
            <span className="px-1.5 py-0.5 text-[10px] bg-surface-600 text-steel-dim rounded">
              {badge}
            </span>
          )}
        </div>
      </button>
      {isOpen && (
        <div className="p-3 bg-surface-900 border-t border-surface-700">{children}</div>
      )}
    </div>
  )
}

interface JsonViewerProps {
  data: unknown
  maxHeight?: string
}

function JsonViewer({ data, maxHeight = '200px' }: JsonViewerProps) {
  const [copied, setCopied] = useState(false)

  const jsonString = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return String(data)
    }
  }, [data])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group">
      <pre
        className="p-3 bg-surface-950 rounded text-xs text-steel font-mono overflow-auto"
        style={{ maxHeight }}
      >
        {jsonString}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded bg-surface-800 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="w-3 h-3 text-emerald-400" />
        ) : (
          <Copy className="w-3 h-3 text-steel-dim" />
        )}
      </button>
    </div>
  )
}

// =============================================================================
// State Diff Calculator
// =============================================================================

interface StateDiff {
  added: Record<string, unknown>
  changed: Record<string, { from: unknown; to: unknown }>
  removed: string[]
}

function calculateStateDiff(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): StateDiff {
  const diff: StateDiff = {
    added: {},
    changed: {},
    removed: [],
  }

  if (!before || !after) return diff

  // Check for added and changed keys
  for (const key of Object.keys(after)) {
    if (!(key in before)) {
      diff.added[key] = after[key]
    } else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff.changed[key] = { from: before[key], to: after[key] }
    }
  }

  // Check for removed keys
  for (const key of Object.keys(before)) {
    if (!(key in after)) {
      diff.removed.push(key)
    }
  }

  return diff
}

// =============================================================================
// Component
// =============================================================================

export function NodeDetail({
  nodeName,
  nodeType,
  category,
  displayName,
  description,
  stage,
  edges,
  nodeState,
  inputState,
  outputState,
  systemPrompt,
  llmResponse,
}: NodeDetailProps) {
  // Calculate state diff
  const stateDiff = useMemo(
    () => calculateStateDiff(inputState, outputState),
    [inputState, outputState]
  )

  const hasDiff =
    Object.keys(stateDiff.added).length > 0 ||
    Object.keys(stateDiff.changed).length > 0 ||
    stateDiff.removed.length > 0

  // Calculate incoming and outgoing edges
  const { incomingEdges, outgoingEdges } = useMemo(() => {
    if (!nodeName || !edges) return { incomingEdges: [], outgoingEdges: [] }
    return {
      incomingEdges: edges.filter((e) => e.to === nodeName),
      outgoingEdges: edges.filter((e) => e.from === nodeName),
    }
  }, [nodeName, edges])

  // Get state keys available to this node
  const stateKeys = useMemo(() => {
    if (!inputState) return []
    return Object.keys(inputState).sort()
  }, [inputState])

  if (!nodeName) {
    return (
      <div className="p-4 bg-surface-800 rounded-lg text-center text-steel-dim text-sm">
        Select a node to inspect
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Node header */}
      <div className="p-3 bg-surface-800 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold text-steel">{displayName || nodeName}</h3>
            {nodeType && nodeType !== 'node' && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-indigo-500/20 text-indigo-400">
                {nodeType}
              </span>
            )}
            {category && (
              <span
                className={clsx(
                  'px-2 py-0.5 text-xs font-medium rounded',
                  category === 'agent' && 'bg-blue-500/20 text-blue-400',
                  category === 'generator' && 'bg-emerald-500/20 text-emerald-400',
                  category === 'reviewer' && 'bg-amber-500/20 text-amber-400'
                )}
              >
                {category}
              </span>
            )}
            {stage && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-purple-500/20 text-purple-400">
                {stage}
              </span>
            )}
          </div>

          {nodeState?.status && (
            <span
              className={clsx(
                'px-2 py-0.5 text-xs font-medium rounded',
                nodeState.status === 'idle' && 'bg-surface-600 text-steel-dim',
                nodeState.status === 'active' && 'bg-copper/20 text-copper',
                nodeState.status === 'completed' && 'bg-emerald-500/20 text-emerald-400',
                nodeState.status === 'error' && 'bg-red-500/20 text-red-400'
              )}
            >
              {nodeState.status}
            </span>
          )}
        </div>

        {/* Node ID (if different from display name) */}
        {displayName && displayName !== nodeName && (
          <div className="mt-1 text-xs text-steel-dim font-mono">{nodeName}</div>
        )}

        {/* Description */}
        {description && (
          <p className="mt-2 text-xs text-steel-dim">{description}</p>
        )}

        {/* Timing info */}
        {nodeState?.durationMs !== undefined && (
          <div className="flex items-center gap-1 mt-2 text-xs text-steel-dim">
            <Clock className="w-3 h-3" />
            <span>Executed in {nodeState.durationMs}ms</span>
          </div>
        )}

        {/* Error message */}
        {nodeState?.error && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
            {nodeState.error}
          </div>
        )}
      </div>

      {/* Connectivity - Edges In/Out */}
      {edges && edges.length > 0 && (incomingEdges.length > 0 || outgoingEdges.length > 0) && (
        <CollapsibleSection
          title="Connectivity"
          icon={<GitBranch className="w-4 h-4" />}
          defaultOpen
          badge={`${incomingEdges.length} in, ${outgoingEdges.length} out`}
        >
          <div className="space-y-3">
            {/* Incoming edges */}
            {incomingEdges.length > 0 && (
              <div>
                <div className="flex items-center gap-1 text-xs font-medium text-steel-dim mb-2">
                  <ArrowLeft className="w-3 h-3" />
                  <span>Incoming ({incomingEdges.length})</span>
                </div>
                <div className="space-y-1">
                  {incomingEdges.map((edge, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs bg-surface-950 rounded px-2 py-1"
                    >
                      <span className="text-blue-400 font-mono">{edge.from}</span>
                      <span className="text-steel-dim">→</span>
                      {edge.label && (
                        <span className="text-steel-dim italic">({edge.label})</span>
                      )}
                      {edge.conditional && (
                        <span className="text-amber-400/60 text-[10px]">conditional</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Outgoing edges */}
            {outgoingEdges.length > 0 && (
              <div>
                <div className="flex items-center gap-1 text-xs font-medium text-steel-dim mb-2">
                  <ArrowRight className="w-3 h-3" />
                  <span>Outgoing ({outgoingEdges.length})</span>
                </div>
                <div className="space-y-1">
                  {outgoingEdges.map((edge, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs bg-surface-950 rounded px-2 py-1"
                    >
                      <span className="text-steel-dim">→</span>
                      <span className="text-emerald-400 font-mono">{edge.to}</span>
                      {edge.label && (
                        <span className="text-steel-dim italic">({edge.label})</span>
                      )}
                      {edge.conditional && (
                        <span className="text-amber-400/60 text-[10px]">conditional</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Available State Keys */}
      {stateKeys.length > 0 && (
        <CollapsibleSection
          title="Available State"
          icon={<Database className="w-4 h-4" />}
          badge={`${stateKeys.length} keys`}
        >
          <div className="flex flex-wrap gap-1">
            {stateKeys.map((key) => (
              <span
                key={key}
                className="px-2 py-0.5 text-[10px] font-mono bg-surface-950 text-steel-dim rounded"
              >
                {key}
              </span>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Input State */}
      {inputState && (
        <CollapsibleSection
          title="Input State"
          icon={<ArrowRight className="w-4 h-4" />}
          badge={`${Object.keys(inputState).length} keys`}
        >
          <JsonViewer data={inputState} maxHeight="300px" />
        </CollapsibleSection>
      )}

      {/* Output State */}
      {outputState && (
        <CollapsibleSection
          title="Output State"
          icon={<FileCode className="w-4 h-4" />}
          defaultOpen
          badge={`${Object.keys(outputState).length} keys`}
        >
          <JsonViewer data={outputState} maxHeight="300px" />
        </CollapsibleSection>
      )}

      {/* State Diff */}
      {hasDiff && (
        <CollapsibleSection title="State Changes" icon={<Diff className="w-4 h-4" />}>
          <div className="space-y-3 text-xs">
            {/* Added keys */}
            {Object.keys(stateDiff.added).length > 0 && (
              <div>
                <div className="text-emerald-400 font-medium mb-1">Added:</div>
                <div className="space-y-1">
                  {Object.entries(stateDiff.added).map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <span className="text-emerald-400 font-mono">+ {key}</span>
                      <span className="text-steel-dim font-mono truncate">
                        {JSON.stringify(value).substring(0, 50)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Changed keys */}
            {Object.keys(stateDiff.changed).length > 0 && (
              <div>
                <div className="text-amber-400 font-medium mb-1">Changed:</div>
                <div className="space-y-2">
                  {Object.entries(stateDiff.changed).map(([key, { from, to }]) => (
                    <div key={key} className="bg-surface-950 rounded p-2">
                      <div className="text-amber-400 font-mono mb-1">~ {key}</div>
                      <div className="flex items-start gap-2">
                        <span className="text-red-400/60 text-[10px]">FROM:</span>
                        <span className="text-steel-dim font-mono text-[10px] truncate flex-1">
                          {JSON.stringify(from).substring(0, 80)}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-emerald-400/60 text-[10px]">TO:</span>
                        <span className="text-steel font-mono text-[10px] truncate flex-1">
                          {JSON.stringify(to).substring(0, 80)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Removed keys */}
            {stateDiff.removed.length > 0 && (
              <div>
                <div className="text-red-400 font-medium mb-1">Removed:</div>
                <div className="space-y-1">
                  {stateDiff.removed.map((key) => (
                    <div key={key} className="text-red-400 font-mono">
                      - {key}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* System Prompt */}
      {systemPrompt && (
        <CollapsibleSection
          title="System Prompt"
          icon={<Bot className="w-4 h-4" />}
          badge={`${systemPrompt.length} chars`}
        >
          <pre className="p-3 bg-surface-950 rounded text-xs text-steel font-mono whitespace-pre-wrap max-h-[300px] overflow-auto">
            {systemPrompt}
          </pre>
        </CollapsibleSection>
      )}

      {/* LLM Response */}
      {llmResponse && (
        <CollapsibleSection
          title="LLM Response"
          icon={<Code2 className="w-4 h-4" />}
          defaultOpen
          badge={`${llmResponse.length} chars`}
        >
          <pre className="p-3 bg-surface-950 rounded text-xs text-steel font-mono whitespace-pre-wrap max-h-[300px] overflow-auto">
            {llmResponse}
          </pre>
        </CollapsibleSection>
      )}
    </div>
  )
}
