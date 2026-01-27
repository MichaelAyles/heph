/**
 * AdminLangGraphPage - LangGraph workflow visualization and management
 *
 * Provides:
 * - React Flow-based graph visualization with subgraph support
 * - SSE streaming for live execution events
 * - Execution timeline with scrubbing
 * - Execution history with replay
 * - Node inspection with state diff
 * - Thread viewer with checkpoint history
 * - Static structure view of code-defined graphs
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Network,
  Play,
  Database,
  Bug,
  Loader2,
  RefreshCw,
  History,
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
  Eye,
  GitBranch,
  Download,
  Upload,
  Boxes,
} from 'lucide-react'
import { clsx } from 'clsx'
import {
  ThreadViewer,
  StateInspector,
  FlowGraph,
  ExecutionTimeline,
  NodeDetail,
  SubgraphSelector,
  getDefaultSubgraphOptions,
  StructureViewer,
  NodeRegistry,
  type GraphNodeDef,
  type GraphEdgeDef,
  type SubgraphId,
  type OrchestratorPrompt,
} from '../components/admin/langgraph'
import type {
  ExecutionEvent,
  ExecutionRun,
  NodeState,
} from '../services/langgraph/execution-tracer'
import { getNodeStatesAtStep } from '../services/langgraph/execution-tracer'
import { logger } from '../lib/logger'
import type { CodeDefinedGraphData, SubgraphDefinition } from '../types/langgraph'

type Tab = 'debugger' | 'threads' | 'structure' | 'nodes'

// Predefined test messages for quick debugging
const PREDEFINED_MESSAGES = [
  {
    label: 'New Project',
    value: 'I want to build a smart plant monitor with soil moisture sensing and WiFi alerts',
  },
  { label: 'Revise Spec', value: 'Actually, I want to add temperature and humidity sensing too' },
  { label: 'Start PCB', value: "The spec looks good, let's move on to designing the PCB" },
  { label: 'Add Block', value: 'Add a BME280 sensor block to the board' },
  { label: 'Generate Enclosure', value: 'Generate an enclosure for this design' },
  { label: 'Compile Firmware', value: 'Compile the firmware for the ESP32' },
  { label: 'Export Files', value: 'Export the manufacturing files for this project' },
  { label: 'Simple Query', value: 'What components are available for power management?' },
  { label: 'Help Request', value: 'Help me understand what blocks I should use' },
]

interface ExecutionHistoryItem {
  id: string
  thread_id: string | null
  user_id: string | null
  input: string
  started_at: number
  ended_at: number | null
  duration_ms: number | null
  success: number
  error: string | null
  created_at: string
}

interface ExecutionHistoryResponse {
  runs: ExecutionHistoryItem[]
  total: number
  limit: number
  offset: number
}

interface ExecutionRunResponse {
  id: string
  threadId: string | null
  userId: string | null
  input: string
  events: ExecutionEvent[]
  startedAt: number
  endedAt: number | null
  durationMs: number | null
  success: boolean
  error: string | null
  createdAt: string
}

// =============================================================================
// Import/Export Types
// =============================================================================

interface ExportedExecution {
  version: '1.0'
  exportedAt: string
  execution: {
    id: string
    threadId: string | null
    input: string
    events: ExecutionEvent[]
    startedAt: number
    endedAt: number | null
    durationMs: number | null
    success: boolean
    error: string | null
  }
}

interface ExportedExecutionBatch {
  version: '1.0'
  exportedAt: string
  count: number
  executions: ExportedExecution['execution'][]
}

interface ExportedGraphStructure {
  version: '1.0'
  exportedAt: string
  graphData: CodeDefinedGraphData
}

// =============================================================================
// Import/Export Utilities
// =============================================================================

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function exportExecution(
  run: ExecutionHistoryItem | ExecutionRunResponse,
  events?: ExecutionEvent[]
): ExportedExecution {
  const isDetailed = 'events' in run
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    execution: {
      id: run.id,
      threadId: 'threadId' in run ? run.threadId : run.thread_id,
      input: run.input,
      events: events || (isDetailed ? run.events : []),
      startedAt: 'startedAt' in run ? run.startedAt : run.started_at,
      endedAt: 'endedAt' in run ? run.endedAt : run.ended_at,
      durationMs: 'durationMs' in run ? run.durationMs : run.duration_ms,
      success: typeof run.success === 'boolean' ? run.success : run.success === 1,
      error: run.error,
    },
  }
}

function exportExecutionBatch(runs: ExecutionHistoryItem[]): ExportedExecutionBatch {
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    count: runs.length,
    executions: runs.map((run) => ({
      id: run.id,
      threadId: run.thread_id,
      input: run.input,
      events: [], // Summary export doesn't include full events
      startedAt: run.started_at,
      endedAt: run.ended_at,
      durationMs: run.duration_ms,
      success: run.success === 1,
      error: run.error,
    })),
  }
}

function exportGraphStructure(graphData: CodeDefinedGraphData): ExportedGraphStructure {
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    graphData,
  }
}

function isValidExecutionImport(data: unknown): data is ExportedExecution | ExportedExecutionBatch {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  if (obj.version !== '1.0') return false
  // Single execution
  if ('execution' in obj && typeof obj.execution === 'object') return true
  // Batch
  if ('executions' in obj && Array.isArray(obj.executions)) return true
  return false
}

/**
 * Convert SubgraphDefinition to FlowGraph format
 */
function subgraphToFlowNodes(subgraph: SubgraphDefinition | undefined): GraphNodeDef[] {
  if (!subgraph?.nodes) return []
  return subgraph.nodes
    .filter((node) => node && typeof node.name === 'string')
    .map((node) => ({
      name: node.name,
      type: node.type || 'node',
      displayName: node.displayName || node.name,
      stage: subgraph.stage,
    }))
}

function subgraphToFlowEdges(subgraph: SubgraphDefinition | undefined): GraphEdgeDef[] {
  if (!subgraph?.edges) return []
  return subgraph.edges
    .filter((edge) => edge && edge.from && edge.to)
    .map((edge) => ({
      from: edge.from,
      to: edge.to,
      conditional: edge.conditional ?? false,
      label: edge.label,
    }))
}

export function AdminLangGraphPage() {
  const [activeTab, setActiveTab] = useState<Tab>('debugger')
  const [selectedNode, setSelectedNode] = useState<string | undefined>()
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>()
  const [selectedGraph, setSelectedGraph] = useState<SubgraphId>('orchestrator')

  // Debugger state
  const [debuggerInput, setDebuggerInput] = useState('')
  const [currentRun, setCurrentRun] = useState<ExecutionRun | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(500) // ms between steps
  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [executeError, setExecuteError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  // Import state
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // Fetch code-defined graph data
  const {
    data: graphData,
    isLoading: isLoadingGraph,
    error: graphError,
    refetch: refetchGraph,
  } = useQuery({
    queryKey: ['admin-langgraph-graph'],
    queryFn: async () => {
      const res = await fetch('/api/admin/langgraph/graph')
      if (!res.ok) throw new Error('Failed to fetch graph')
      return res.json() as Promise<CodeDefinedGraphData>
    },
  })

  // Get the currently selected graph's nodes and edges
  const { flowNodes, flowEdges } = useMemo(() => {
    if (!graphData) {
      return { flowNodes: [], flowEdges: [] }
    }

    let subgraph: SubgraphDefinition
    if (selectedGraph === 'orchestrator') {
      subgraph = graphData.orchestrator
    } else {
      subgraph = graphData.subgraphs[selectedGraph]
    }

    return {
      flowNodes: subgraphToFlowNodes(subgraph),
      flowEdges: subgraphToFlowEdges(subgraph),
    }
  }, [graphData, selectedGraph])

  // Build subgraph options from data
  const subgraphOptions = useMemo(() => {
    if (!graphData) {
      return getDefaultSubgraphOptions()
    }

    return [
      {
        id: 'orchestrator' as const,
        label: graphData.orchestrator.displayName,
        description: 'Parent graph coordinating all stages',
        nodeCount: graphData.orchestrator.nodes.length,
      },
      ...Object.entries(graphData.subgraphs).map(([key, subgraph]) => ({
        id: key as SubgraphId,
        label: subgraph.displayName,
        description: `${subgraph.nodes.filter((n) => n.type === 'node').length} processing nodes`,
        nodeCount: subgraph.nodes.length,
      })),
    ]
  }, [graphData])

  // Fetch execution history
  const {
    data: historyData,
    isLoading: isLoadingHistory,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['admin-langgraph-executions'],
    queryFn: async () => {
      const res = await fetch('/api/admin/langgraph/executions?limit=20')
      if (!res.ok) throw new Error('Failed to fetch execution history')
      return res.json() as Promise<ExecutionHistoryResponse>
    },
    enabled: showHistory,
  })

  // Fetch orchestrator prompts for node inspection
  const queryClient = useQueryClient()
  const { data: promptsData } = useQuery({
    queryKey: ['admin-orchestrator-prompts'],
    queryFn: async () => {
      const res = await fetch('/api/admin/orchestrator/prompts')
      if (!res.ok) throw new Error('Failed to fetch prompts')
      return res.json() as Promise<{ prompts: OrchestratorPrompt[] }>
    },
  })

  // Update prompt mutation
  const [isUpdatingPrompt, setIsUpdatingPrompt] = useState(false)
  const updatePromptMutation = useMutation({
    mutationFn: async ({ nodeName, systemPrompt }: { nodeName: string; systemPrompt: string }) => {
      const res = await fetch(`/api/admin/orchestrator/prompts/${nodeName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt }),
      })
      if (!res.ok) throw new Error('Failed to update prompt')
      return res.json()
    },
    onMutate: () => setIsUpdatingPrompt(true),
    onSettled: () => setIsUpdatingPrompt(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orchestrator-prompts'] })
    },
  })

  // Handle prompt update
  const handlePromptUpdate = useCallback(
    async (nodeName: string, newPrompt: string) => {
      await updatePromptMutation.mutateAsync({ nodeName, systemPrompt: newPrompt })
    },
    [updatePromptMutation]
  )

  // Get the selected node's orchestrator prompt
  const selectedNodePrompt = useMemo(() => {
    if (!selectedNode || !promptsData?.prompts) return null
    return promptsData.prompts.find((p) => p.nodeName === selectedNode) || null
  }, [selectedNode, promptsData])

  // Execute graph via SSE
  const executeGraph = useCallback(
    async (message: string) => {
      setIsExecuting(true)
      setExecuteError(null)

      const events: ExecutionEvent[] = []
      const threadId = crypto.randomUUID()

      try {
        const res = await fetch('/api/admin/langgraph/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, threadId }),
        })

        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.error || 'Failed to execute graph')
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let buffer = ''

        // Start playing immediately
        setCurrentStep(0)
        setIsPlaying(true)

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE events
          const lines = buffer.split('\n\n')
          buffer = lines.pop() || '' // Keep incomplete data in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6)) as ExecutionEvent
                events.push(event)

                // Update current run with new events
                const run: ExecutionRun = {
                  id: threadId,
                  threadId,
                  input: message,
                  events: [...events],
                  startedAt: events[0]?.timestamp || Date.now(),
                  success: true,
                }
                setCurrentRun(run)
              } catch {
                logger.warn('orchestrator', 'Failed to parse SSE event', { line })
              }
            }
          }
        }

        // Final update with all events
        const graphEndEvent = events.find((e) => e.type === 'graph_end')
        const run: ExecutionRun = {
          id: threadId,
          threadId,
          input: message,
          events,
          startedAt: events[0]?.timestamp || Date.now(),
          endedAt: graphEndEvent?.timestamp,
          durationMs:
            graphEndEvent && 'totalDurationMs' in graphEndEvent
              ? graphEndEvent.totalDurationMs
              : undefined,
          success: true,
        }
        setCurrentRun(run)
        setCurrentStep(events.length - 1)
        setIsPlaying(false)

        // Refetch history to show new run
        if (showHistory) {
          refetchHistory()
        }
      } catch (error) {
        setExecuteError(error instanceof Error ? error.message : 'Unknown error')
        setIsPlaying(false)
      } finally {
        setIsExecuting(false)
      }
    },
    [showHistory, refetchHistory]
  )

  // Load execution from history
  const loadExecution = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/langgraph/executions/${id}`)
      if (!res.ok) throw new Error('Failed to load execution')

      const data = (await res.json()) as ExecutionRunResponse

      const run: ExecutionRun = {
        id: data.id,
        threadId: data.threadId || undefined,
        input: data.input,
        events: data.events,
        startedAt: data.startedAt,
        endedAt: data.endedAt || undefined,
        durationMs: data.durationMs || undefined,
        success: data.success,
        error: data.error || undefined,
      }

      setCurrentRun(run)
      setCurrentStep(0)
      setIsPlaying(true)
      setShowHistory(false)
    } catch (error) {
      logger.error('orchestrator', 'Failed to load execution', { error })
    }
  }, [])

  // Delete execution from history
  const deleteExecution = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/admin/langgraph/executions/${id}`, {
          method: 'DELETE',
        })
        if (!res.ok) throw new Error('Failed to delete execution')
        refetchHistory()
      } catch (error) {
        logger.error('orchestrator', 'Failed to delete execution', { error })
      }
    },
    [refetchHistory]
  )

  // Handle debugger execution
  const handleExecute = useCallback(() => {
    if (debuggerInput.trim()) {
      executeGraph(debuggerInput.trim())
    }
  }, [debuggerInput, executeGraph])

  // Export single execution with full events
  const handleExportExecution = useCallback(async (run: ExecutionHistoryItem) => {
    try {
      // Fetch full execution to get events
      const res = await fetch(`/api/admin/langgraph/executions/${run.id}`)
      if (!res.ok) throw new Error('Failed to fetch execution')
      const data = (await res.json()) as ExecutionRunResponse

      const exported = exportExecution(data)
      const date = new Date(run.created_at).toISOString().split('T')[0]
      downloadJson(exported, `langgraph-execution-${date}-${run.id.slice(0, 8)}.json`)
    } catch (error) {
      logger.error('orchestrator', 'Failed to export execution', { error })
    }
  }, [])

  // Export all visible executions (summary without events)
  const handleExportAllExecutions = useCallback(() => {
    if (!historyData?.runs.length) return
    const exported = exportExecutionBatch(historyData.runs)
    const date = new Date().toISOString().split('T')[0]
    downloadJson(exported, `langgraph-executions-${date}.json`)
  }, [historyData])

  // Export graph structure
  const handleExportGraphStructure = useCallback(() => {
    if (!graphData) return
    const exported = exportGraphStructure(graphData)
    const date = new Date().toISOString().split('T')[0]
    downloadJson(exported, `langgraph-structure-${date}.json`)
  }, [graphData])

  // Import execution(s) from JSON file
  const handleImportFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportError(null)
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (!isValidExecutionImport(data)) {
        throw new Error('Invalid import file format. Expected LangGraph execution export.')
      }

      // Handle single or batch import
      const executions = 'execution' in data ? [data.execution] : data.executions

      // Load the first execution into the viewer
      if (executions.length > 0) {
        const first = executions[0]
        const run: ExecutionRun = {
          id: first.id,
          threadId: first.threadId || undefined,
          input: first.input,
          events: first.events,
          startedAt: first.startedAt,
          endedAt: first.endedAt || undefined,
          durationMs: first.durationMs || undefined,
          success: first.success,
          error: first.error || undefined,
        }
        setCurrentRun(run)
        setCurrentStep(0)
        setIsPlaying(first.events.length > 0)
        setShowHistory(false)
      }

      logger.info('orchestrator', `Imported ${executions.length} execution(s)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import file'
      setImportError(message)
      logger.error('orchestrator', 'Failed to import execution', { error })
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  // Playback logic
  useEffect(() => {
    if (isPlaying && currentRun) {
      playbackTimerRef.current = setTimeout(() => {
        if (currentStep < currentRun.events.length - 1) {
          setCurrentStep((s) => s + 1)
        } else {
          setIsPlaying(false)
        }
      }, playbackSpeed)
    }

    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current)
      }
    }
  }, [isPlaying, currentStep, currentRun, playbackSpeed])

  // Toggle playback
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false)
    } else if (currentRun) {
      // If at end, restart
      if (currentStep >= currentRun.events.length - 1) {
        setCurrentStep(0)
      }
      setIsPlaying(true)
    }
  }, [isPlaying, currentRun, currentStep])

  // Get node states at current step
  const nodeStates = useMemo(() => {
    if (!currentRun) return new Map<string, NodeState>()
    return getNodeStatesAtStep(currentRun.events, currentStep)
  }, [currentRun, currentStep])

  // Get selected node details
  const selectedNodeState = useMemo(() => {
    if (!selectedNode || !currentRun) return undefined
    return nodeStates.get(selectedNode)
  }, [selectedNode, nodeStates, currentRun])

  // Get input/output for selected node at current step
  const selectedNodeInput = useMemo(() => {
    if (!selectedNode || !currentRun?.events?.length) return undefined
    // Find the node_enter event for this node
    const maxIndex = Math.min(currentStep, currentRun.events.length - 1)
    for (let i = maxIndex; i >= 0; i--) {
      const event = currentRun.events[i]
      if (event && event.type === 'node_enter' && event.node === selectedNode) {
        return event.state
      }
    }
    return undefined
  }, [selectedNode, currentRun, currentStep])

  const selectedNodeOutput = useMemo(() => {
    if (!selectedNode || !currentRun?.events?.length) return undefined
    // Find the node_exit event for this node
    const maxIndex = Math.min(currentStep, currentRun.events.length - 1)
    for (let i = maxIndex; i >= 0; i--) {
      const event = currentRun.events[i]
      if (event && event.type === 'node_exit' && event.node === selectedNode) {
        return event.output
      }
    }
    return undefined
  }, [selectedNode, currentRun, currentStep])

  // Get selected node definition (consolidated lookup)
  const selectedNodeDef = useMemo(() => {
    if (!selectedNode) return undefined
    return flowNodes.find((n) => n.name === selectedNode)
  }, [selectedNode, flowNodes])

  const tabs = [
    { id: 'debugger' as const, label: 'Debugger', icon: Bug },
    { id: 'threads' as const, label: 'Threads', icon: Database },
    { id: 'structure' as const, label: 'Structure', icon: GitBranch },
    { id: 'nodes' as const, label: 'Nodes', icon: Boxes },
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-4 border-b border-surface-700 bg-surface-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Network className="w-6 h-6 text-copper" />
            <div>
              <h1 className="text-lg font-semibold text-steel">LangGraph</h1>
              <p className="text-xs text-steel-dim">
                Subgraph architecture with real-time debugging
              </p>
            </div>
          </div>
          <button
            onClick={() => refetchGraph()}
            className="p-2 rounded hover:bg-surface-800 transition-colors"
            title="Refresh graph"
          >
            <RefreshCw className="w-4 h-4 text-steel-dim" />
          </button>
        </div>

        {/* Tabs */}
        <nav className="flex gap-1 mt-4">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t transition-colors',
                  isActive
                    ? 'bg-surface-800 text-copper border-t border-x border-surface-700'
                    : 'text-steel-dim hover:text-steel hover:bg-surface-800/50'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex min-h-0">
        {/* Main Panel */}
        <div
          className={clsx(
            'flex-1 overflow-auto',
            activeTab === 'debugger' ? 'p-4 flex flex-col' : 'p-6'
          )}
        >
          {/* Debugger Tab */}
          {activeTab === 'debugger' && (
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              {/* Input and Controls */}
              <div className="flex-shrink-0 bg-surface-800 rounded-lg p-4">
                <div className="flex gap-3">
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        setDebuggerInput(e.target.value)
                      }
                    }}
                    className="w-40 px-2 py-2 bg-surface-900 border border-surface-700 rounded text-sm text-steel focus:outline-none focus:border-copper"
                  >
                    <option value="">Quick message...</option>
                    {PREDEFINED_MESSAGES.map((msg) => (
                      <option key={msg.label} value={msg.value}>
                        {msg.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={debuggerInput}
                    onChange={(e) => setDebuggerInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
                    placeholder="Enter a test message or select from dropdown..."
                    className="flex-1 px-3 py-2 bg-surface-900 border border-surface-700 rounded text-sm text-steel focus:outline-none focus:border-copper"
                  />
                  <button
                    onClick={handleExecute}
                    disabled={!debuggerInput.trim() || isExecuting}
                    className="flex items-center gap-2 px-4 py-2 bg-copper text-surface-900 rounded font-medium hover:bg-copper/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Execute
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2 rounded font-medium transition-colors',
                      showHistory
                        ? 'bg-copper/20 text-copper border border-copper/50'
                        : 'bg-surface-700 text-steel hover:bg-surface-600'
                    )}
                    title="Show execution history"
                  >
                    <History className="w-4 h-4" />
                  </button>
                </div>

                {/* Graph selector and playback speed */}
                <div className="flex items-center gap-4 mt-3">
                  <SubgraphSelector
                    selectedGraph={selectedGraph}
                    onSelect={setSelectedGraph}
                    options={subgraphOptions}
                  />

                  <div className="flex items-center gap-2 text-xs text-steel-dim">
                    <span>Playback:</span>
                    <select
                      value={playbackSpeed}
                      onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                      className="px-2 py-1 bg-surface-900 border border-surface-700 rounded text-steel"
                    >
                      <option value={1000}>Slow (1s)</option>
                      <option value={500}>Normal (0.5s)</option>
                      <option value={200}>Fast (0.2s)</option>
                      <option value={100}>Very Fast (0.1s)</option>
                    </select>
                  </div>
                </div>

                {/* Error display */}
                {executeError && (
                  <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
                    {executeError}
                  </div>
                )}
              </div>

              {/* Execution History Panel */}
              {showHistory && (
                <div className="flex-shrink-0 bg-surface-800 rounded-lg p-4 max-h-64 overflow-auto">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-steel-dim" />
                      <h3 className="text-sm font-medium text-steel">Execution History</h3>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Hidden file input for import */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        onChange={handleImportFile}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-1 rounded hover:bg-surface-700 transition-colors"
                        title="Import execution from JSON"
                      >
                        <Upload className="w-3 h-3 text-steel-dim" />
                      </button>
                      <button
                        onClick={handleExportAllExecutions}
                        disabled={!historyData?.runs.length}
                        className="p-1 rounded hover:bg-surface-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Export all executions"
                      >
                        <Download className="w-3 h-3 text-steel-dim" />
                      </button>
                      <button
                        onClick={() => refetchHistory()}
                        className="p-1 rounded hover:bg-surface-700 transition-colors"
                        title="Refresh history"
                      >
                        <RefreshCw className="w-3 h-3 text-steel-dim" />
                      </button>
                    </div>
                  </div>
                  {/* Import error display */}
                  {importError && (
                    <div className="mb-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
                      {importError}
                    </div>
                  )}
                  {isLoadingHistory ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 text-steel-dim animate-spin" />
                    </div>
                  ) : historyData?.runs.length === 0 ? (
                    <p className="text-xs text-steel-dim text-center py-4">
                      No execution history yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {historyData?.runs.map((run) => (
                        <div
                          key={run.id}
                          className="flex items-center gap-3 p-2 bg-surface-900 rounded hover:bg-surface-700 cursor-pointer transition-colors"
                          onClick={() => loadExecution(run.id)}
                        >
                          {run.success ? (
                            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-steel truncate">{run.input}</p>
                            <div className="flex items-center gap-2 text-xs text-steel-dim">
                              <Clock className="w-3 h-3" />
                              {new Date(run.created_at).toLocaleString()}
                              {run.duration_ms && (
                                <span className="text-copper">{run.duration_ms}ms</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleExportExecution(run)
                            }}
                            className="p-1 rounded hover:bg-surface-600 transition-colors"
                            title="Export execution"
                          >
                            <Download className="w-3 h-3 text-steel-dim hover:text-copper" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteExecution(run.id)
                            }}
                            className="p-1 rounded hover:bg-surface-600 transition-colors"
                            title="Delete execution"
                          >
                            <Trash2 className="w-3 h-3 text-steel-dim hover:text-red-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Graph and Inspector */}
              <div className="flex-1 flex gap-4 min-h-0">
                {/* Graph View */}
                <div className="flex-1 flex flex-col gap-3 min-h-0">
                  <div className="flex-1 min-h-0">
                    <FlowGraph
                      nodes={flowNodes}
                      edges={flowEdges}
                      events={currentRun?.events}
                      currentStep={currentStep}
                      selectedNode={selectedNode}
                      onNodeClick={(name) => {
                        setSelectedNode(name === selectedNode ? undefined : name)
                      }}
                      isLoading={isLoadingGraph}
                      error={graphError?.message}
                      showMinimap
                      showControls
                    />
                  </div>

                  {/* Timeline */}
                  {currentRun && (
                    <div className="flex-shrink-0">
                      <ExecutionTimeline
                        events={currentRun.events}
                        currentStep={currentStep}
                        onStepChange={(step) => {
                          setCurrentStep(step)
                          setIsPlaying(false)
                        }}
                        isPlaying={isPlaying}
                        onPlayPause={handlePlayPause}
                        totalDuration={currentRun.durationMs}
                      />
                    </div>
                  )}

                  {/* Legend */}
                  <div className="flex-shrink-0 flex flex-wrap gap-4 text-xs text-steel-dim px-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                      Start/End
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded bg-blue-500" />
                      Node
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded bg-purple-500" />
                      Subgraph
                    </div>
                    <span className="text-steel-dim/50">|</span>
                    <span>Click to inspect</span>
                  </div>
                </div>

                {/* Node Inspector Panel */}
                <div className="w-80 flex-shrink-0 border-l border-surface-700 pl-4 overflow-auto">
                  <div className="flex items-center gap-2 mb-3">
                    <Eye className="w-4 h-4 text-steel-dim" />
                    <h3 className="text-sm font-medium text-steel">Node Inspector</h3>
                  </div>
                  <NodeDetail
                    nodeName={selectedNode || null}
                    nodeType={selectedNodeDef?.type}
                    category={selectedNodeDef?.category}
                    displayName={selectedNodeDef?.displayName}
                    description={selectedNodeDef?.description}
                    stage={selectedNodeDef?.stage}
                    edges={flowEdges}
                    nodeState={selectedNodeState}
                    inputState={selectedNodeInput}
                    outputState={selectedNodeOutput}
                    orchestratorPrompt={selectedNodePrompt}
                    onPromptUpdate={handlePromptUpdate}
                    isUpdatingPrompt={isUpdatingPrompt}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Threads Tab */}
          {activeTab === 'threads' && (
            <div className="flex gap-6">
              <div className="flex-1">
                <h2 className="text-sm font-medium text-steel mb-3">Checkpointed Threads</h2>
                <p className="text-xs text-steel-dim mb-4">
                  View and manage LangGraph threads. Each thread has a history of checkpoints.
                </p>
                <ThreadViewer
                  selectedThreadId={selectedThreadId}
                  onSelectThread={setSelectedThreadId}
                />
              </div>

              {/* State Inspector Panel */}
              <div className="w-96 border-l border-surface-700 pl-6">
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="w-4 h-4 text-steel-dim" />
                  <h3 className="text-sm font-medium text-steel">State Inspector</h3>
                </div>
                <StateInspector threadId={selectedThreadId || null} />
              </div>
            </div>
          )}

          {/* Structure Tab */}
          {activeTab === 'structure' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-steel">Graph Structure</h2>
                <button
                  onClick={handleExportGraphStructure}
                  disabled={!graphData}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs bg-surface-700 text-steel rounded hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Export graph structure as JSON"
                >
                  <Download className="w-3 h-3" />
                  Export JSON
                </button>
              </div>
              <p className="text-xs text-steel-dim mb-4">
                Read-only view of the code-defined graph structure. Graphs are defined in{' '}
                <code className="bg-surface-800 px-1 rounded">src/services/langgraph/graphs/</code>.
              </p>
              <StructureViewer
                graphData={graphData || null}
                isLoading={isLoadingGraph}
                error={graphError?.message}
              />
            </div>
          )}

          {/* Nodes Tab */}
          {activeTab === 'nodes' && (
            <div>
              <div className="mb-4">
                <h2 className="text-sm font-medium text-steel">Standalone Nodes</h2>
                <p className="text-xs text-steel-dim mt-1">
                  All LangGraph nodes registered in the system. Each node can be invoked
                  independently via{' '}
                  <code className="bg-surface-800 px-1 rounded">
                    POST /api/langgraph/invoke/:nodeName
                  </code>
                  .
                </p>
              </div>
              <NodeRegistry />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
