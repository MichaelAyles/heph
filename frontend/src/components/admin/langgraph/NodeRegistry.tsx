/**
 * NodeRegistry Component
 *
 * Displays all registered LangGraph nodes with their metadata.
 * Allows manual invocation of nodes for testing.
 */

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Play,
  Loader2,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  Code,
  Image,
  Eye,
} from 'lucide-react'
import { clsx } from 'clsx'

// =============================================================================
// Types
// =============================================================================

interface NodeMetadata {
  name: string
  description: string
  type: 'chat' | 'image'
  multimodal: boolean
  category: 'spec' | 'enclosure' | 'firmware' | 'export' | 'admin'
  defaultTemperature: number
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
}

interface NodesResponse {
  nodes: NodeMetadata[]
  count: number
}

interface ExecutionSummary {
  id: string
  nodeName: string
  threadId: string | null
  projectId: string | null
  startedAt: string
  completedAt: string | null
  durationMs: number | null
  success: boolean
  error: string | null
  model: string | null
  temperature: number | null
  promptTokens: number | null
  completionTokens: number | null
  costUsd: number | null
}

interface ExecutionsResponse {
  executions: ExecutionSummary[]
  total: number
  limit: number
  offset: number
}

interface InvokeResponse {
  output: Record<string, unknown>
  nodeId: string
  debug: {
    nodeName: string
    startTime: string
    endTime: string
    durationMs: number
    model: string
    temperature: number
    systemPrompt: string
    userPrompt: string
    rawResponse: string
  }
}

// =============================================================================
// Category Colors
// =============================================================================

const categoryColors: Record<string, string> = {
  spec: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  enclosure: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  firmware: 'bg-green-500/20 text-green-300 border-green-500/30',
  export: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  admin: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
}

// =============================================================================
// NodeCard Component
// =============================================================================

interface NodeCardProps {
  node: NodeMetadata
  onInvoke: (nodeName: string, input: Record<string, unknown>) => void
  isInvoking: boolean
  recentExecutions: ExecutionSummary[]
}

function NodeCard({ node, onInvoke, isInvoking, recentExecutions }: NodeCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [inputJson, setInputJson] = useState('{}')
  const [inputError, setInputError] = useState<string | null>(null)

  const handleInvoke = () => {
    try {
      const input = JSON.parse(inputJson)
      setInputError(null)
      onInvoke(node.name, input)
    } catch (e) {
      setInputError('Invalid JSON: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const nodeExecutions = recentExecutions.filter((e) => e.nodeName === node.name).slice(0, 3)

  return (
    <div className="bg-surface-800 rounded-lg border border-surface-700 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-surface-700/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-steel-dim flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-steel-dim flex-shrink-0" />
        )}

        {/* Type Icon */}
        {node.type === 'image' ? (
          <Image className="w-4 h-4 text-purple-400 flex-shrink-0" />
        ) : node.multimodal ? (
          <Eye className="w-4 h-4 text-blue-400 flex-shrink-0" />
        ) : (
          <Code className="w-4 h-4 text-steel-dim flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-copper">{node.name}</span>
            <span
              className={clsx(
                'px-2 py-0.5 text-xs rounded border',
                categoryColors[node.category] || categoryColors.admin
              )}
            >
              {node.category}
            </span>
            {node.multimodal && (
              <span className="px-2 py-0.5 text-xs rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                multimodal
              </span>
            )}
          </div>
          <p className="text-sm text-steel-dim mt-0.5 truncate">{node.description}</p>
        </div>

        {/* Recent status */}
        {nodeExecutions.length > 0 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {nodeExecutions.map((exec) => (
              <span
                key={exec.id}
                className={clsx(
                  'w-2 h-2 rounded-full',
                  exec.success ? 'bg-emerald-500' : 'bg-red-500'
                )}
                title={`${exec.success ? 'Success' : 'Failed'} - ${exec.durationMs}ms`}
              />
            ))}
          </div>
        )}
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-surface-700 pt-4 space-y-4">
          {/* Node Info */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-steel-dim">Type:</span>
              <span className="ml-2 text-steel">{node.type}</span>
            </div>
            <div>
              <span className="text-steel-dim">Temperature:</span>
              <span className="ml-2 text-steel">{node.defaultTemperature}</span>
            </div>
            <div>
              <span className="text-steel-dim">Multimodal:</span>
              <span className="ml-2 text-steel">{node.multimodal ? 'Yes' : 'No'}</span>
            </div>
          </div>

          {/* Input Editor */}
          <div>
            <label className="block text-sm text-steel-dim mb-1">Input JSON:</label>
            <textarea
              value={inputJson}
              onChange={(e) => setInputJson(e.target.value)}
              className="w-full h-32 p-3 bg-surface-900 border border-surface-700 rounded font-mono text-sm text-steel focus:outline-none focus:border-copper resize-y"
              placeholder='{"key": "value"}'
            />
            {inputError && <p className="mt-1 text-sm text-red-400">{inputError}</p>}
          </div>

          {/* Invoke Button */}
          <button
            onClick={handleInvoke}
            disabled={isInvoking}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded font-medium transition-colors',
              isInvoking
                ? 'bg-surface-700 text-steel-dim cursor-not-allowed'
                : 'bg-copper text-surface-900 hover:bg-copper-light'
            )}
          >
            {isInvoking ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Invoke Node
          </button>

          {/* Recent Executions */}
          {nodeExecutions.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-steel mb-2">Recent Executions</h4>
              <div className="space-y-2">
                {nodeExecutions.map((exec) => (
                  <div
                    key={exec.id}
                    className="flex items-center gap-3 p-2 bg-surface-900 rounded text-sm"
                  >
                    {exec.success ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    )}
                    <span className="text-steel-dim">
                      {new Date(exec.startedAt).toLocaleString()}
                    </span>
                    <Clock className="w-3 h-3 text-steel-dim" />
                    <span className="text-steel">{exec.durationMs}ms</span>
                    {exec.model && (
                      <span className="text-steel-dim text-xs truncate max-w-[150px]">
                        {exec.model}
                      </span>
                    )}
                    {exec.error && (
                      <span className="text-red-400 text-xs truncate flex-1">{exec.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// InvokeResult Component
// =============================================================================

interface InvokeResultProps {
  result: InvokeResponse | null
  error: string | null
}

function InvokeResult({ result, error }: InvokeResultProps) {
  const [showRaw, setShowRaw] = useState(false)

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
        <h3 className="font-medium text-red-400 mb-2">Invocation Failed</h3>
        <p className="text-sm text-red-300">{error}</p>
      </div>
    )
  }

  if (!result) return null

  return (
    <div className="bg-surface-800 border border-surface-700 rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-surface-700/50 flex items-center justify-between">
        <h3 className="font-medium text-steel">
          <CheckCircle className="w-4 h-4 inline text-emerald-500 mr-2" />
          Invocation Result
        </h3>
        <div className="flex items-center gap-4 text-sm text-steel-dim">
          <span>{result.debug.durationMs}ms</span>
          <span>{result.debug.model}</span>
          <button onClick={() => setShowRaw(!showRaw)} className="text-copper hover:underline">
            {showRaw ? 'Show Output' : 'Show Raw'}
          </button>
        </div>
      </div>
      <div className="p-4">
        <pre className="bg-surface-900 rounded p-3 overflow-auto max-h-96 text-sm text-steel font-mono">
          {showRaw ? result.debug.rawResponse : JSON.stringify(result.output, null, 2)}
        </pre>
      </div>
    </div>
  )
}

// =============================================================================
// NodeRegistry Component
// =============================================================================

export function NodeRegistry() {
  const [invokeResult, setInvokeResult] = useState<InvokeResponse | null>(null)
  const [invokeError, setInvokeError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  // Fetch nodes
  const { data: nodesData, isLoading: isLoadingNodes } = useQuery({
    queryKey: ['langgraph-nodes'],
    queryFn: async () => {
      const res = await fetch('/api/langgraph/nodes')
      if (!res.ok) throw new Error('Failed to fetch nodes')
      return res.json() as Promise<NodesResponse>
    },
  })

  // Fetch recent executions
  const { data: executionsData, refetch: refetchExecutions } = useQuery({
    queryKey: ['langgraph-executions'],
    queryFn: async () => {
      const res = await fetch('/api/langgraph/executions?limit=50')
      if (!res.ok) throw new Error('Failed to fetch executions')
      return res.json() as Promise<ExecutionsResponse>
    },
  })

  // Invoke mutation
  const invokeMutation = useMutation({
    mutationFn: async ({
      nodeName,
      input,
    }: {
      nodeName: string
      input: Record<string, unknown>
    }) => {
      const res = await fetch(`/api/langgraph/invoke/${nodeName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Invocation failed')
      }
      return res.json() as Promise<InvokeResponse>
    },
    onSuccess: (data) => {
      setInvokeResult(data)
      setInvokeError(null)
      refetchExecutions()
    },
    onError: (error) => {
      setInvokeResult(null)
      setInvokeError(error instanceof Error ? error.message : String(error))
    },
  })

  const handleInvoke = (nodeName: string, input: Record<string, unknown>) => {
    invokeMutation.mutate({ nodeName, input })
  }

  // Filter nodes
  const filteredNodes = (nodesData?.nodes || []).filter((node) => {
    if (categoryFilter !== 'all' && node.category !== categoryFilter) return false
    if (filter && !node.name.toLowerCase().includes(filter.toLowerCase())) return false
    return true
  })

  // Group by category
  const nodesByCategory = filteredNodes.reduce(
    (acc, node) => {
      if (!acc[node.category]) acc[node.category] = []
      acc[node.category].push(node)
      return acc
    },
    {} as Record<string, NodeMetadata[]>
  )

  const categories = ['spec', 'enclosure', 'firmware', 'export', 'admin']

  if (isLoadingNodes) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-copper animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex gap-4 items-center">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search nodes..."
          className="flex-1 max-w-xs px-3 py-2 bg-surface-800 border border-surface-700 rounded text-steel placeholder:text-steel-dim focus:outline-none focus:border-copper"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 bg-surface-800 border border-surface-700 rounded text-steel focus:outline-none focus:border-copper"
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>
        <div className="text-sm text-steel-dim">
          {filteredNodes.length} of {nodesData?.count || 0} nodes
        </div>
      </div>

      {/* Result Display */}
      {(invokeResult || invokeError) && <InvokeResult result={invokeResult} error={invokeError} />}

      {/* Nodes by Category */}
      {categories.map((category) => {
        const nodes = nodesByCategory[category]
        if (!nodes || nodes.length === 0) return null

        return (
          <div key={category}>
            <h3 className="text-lg font-medium text-copper mb-3 capitalize">{category}</h3>
            <div className="space-y-2">
              {nodes.map((node) => (
                <NodeCard
                  key={node.name}
                  node={node}
                  onInvoke={handleInvoke}
                  isInvoking={invokeMutation.isPending}
                  recentExecutions={executionsData?.executions || []}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
