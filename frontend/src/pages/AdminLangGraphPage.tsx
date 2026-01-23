/**
 * AdminLangGraphPage - LangGraph workflow visualization and management
 *
 * Provides:
 * - React Flow-based graph visualization with real-time debugging
 * - Execution timeline with scrubbing
 * - Node inspection with state diff
 * - Node (orchestrator prompt) editing
 * - Edge management
 * - Thread viewer with checkpoint history
 * - Interactive test runner
 * - State inspector
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  GitBranch,
  Play,
  Database,
  Settings,
  Network,
  Eye,
  Cog,
  Bug,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { clsx } from 'clsx'
import {
  GraphViewer,
  NodeEditor,
  EdgeEditor,
  ThreadViewer,
  TestRunner,
  StateInspector,
  ConfigEditor,
  FlowGraph,
  ExecutionTimeline,
  NodeDetail,
  type GraphNodeDef,
  type GraphEdgeDef,
} from '@/components/admin/langgraph'
import type {
  ExecutionEvent,
  ExecutionRun,
  NodeState,
} from '@/services/langgraph/execution-tracer'
import {
  createGraphStartEvent,
  createNodeEnterEvent,
  createNodeExitEvent,
  createEdgeTakenEvent,
  createGraphEndEvent,
  getNodeStatesAtStep,
} from '@/services/langgraph/execution-tracer'

type Tab = 'debugger' | 'graph' | 'nodes' | 'edges' | 'threads' | 'test' | 'config'

interface GraphData {
  mermaid: string
  nodes: Array<{ name: string; type: 'start' | 'end' | 'node'; category?: 'agent' | 'generator' | 'reviewer' }>
  edges: Array<{ from: string; to: string; conditional: boolean; label?: string }>
}

interface ChatResponse {
  response: string
  intent: string
  route: string | null
  projectId: string | null
  sessionId: string
  debug?: {
    startTime: string
    endTime: string
    totalDurationMs: number
    steps: Array<{
      node: string
      timestamp: string
      input: Record<string, unknown>
      output: Record<string, unknown>
      durationMs: number
    }>
  }
}

export function AdminLangGraphPage() {
  const [activeTab, setActiveTab] = useState<Tab>('debugger')
  const [selectedNode, setSelectedNode] = useState<string | undefined>()
  const [highlightedNode, setHighlightedNode] = useState<string | undefined>()
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>()

  // Debugger state
  const [debuggerInput, setDebuggerInput] = useState('')
  const [currentRun, setCurrentRun] = useState<ExecutionRun | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(500) // ms between steps
  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch graph data
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
      return res.json() as Promise<GraphData>
    },
  })

  // Convert GraphData to FlowGraph format
  const flowNodes = useMemo<GraphNodeDef[]>(() => {
    const nodes = graphData?.nodes
    if (!nodes) return []
    return nodes.map((n) => ({
      name: n.name,
      type: n.type,
      category: n.category,
    }))
  }, [graphData])

  const flowEdges = useMemo<GraphEdgeDef[]>(() => {
    const edges = graphData?.edges
    if (!edges) return []
    return edges.map((e) => ({
      from: e.from,
      to: e.to,
      conditional: e.conditional,
      label: e.label,
    }))
  }, [graphData])

  // Execute graph mutation
  const executeMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          sessionId: crypto.randomUUID(),
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to run graph')
      }
      return res.json() as Promise<ChatResponse>
    },
    onSuccess: (data) => {
      // Convert debug steps to execution events
      const events: ExecutionEvent[] = []
      const runId = crypto.randomUUID()

      // Graph start
      events.push(createGraphStartEvent(runId, debuggerInput, data.sessionId))

      if (data.debug?.steps) {
        for (let i = 0; i < data.debug.steps.length; i++) {
          const step = data.debug.steps[i]

          // Add edge from previous node (or __start__)
          const prevNode = i === 0 ? '__start__' : data.debug.steps[i - 1].node
          events.push(
            createEdgeTakenEvent(prevNode, step.node, step.node !== 'start', `intent: ${data.intent}`)
          )

          // Node enter
          events.push(createNodeEnterEvent(step.node, step.input))

          // Node exit
          events.push(createNodeExitEvent(step.node, step.output, step.durationMs))
        }

        // Add final edge to __end__
        if (data.debug.steps.length > 0) {
          const lastNode = data.debug.steps[data.debug.steps.length - 1].node
          events.push(createEdgeTakenEvent(lastNode, '__end__', false))
        }
      }

      // Graph end
      events.push(
        createGraphEndEvent(
          { response: data.response, intent: data.intent, route: data.route },
          data.debug?.totalDurationMs || 0,
          true
        )
      )

      const run: ExecutionRun = {
        id: runId,
        threadId: data.sessionId,
        input: debuggerInput,
        events,
        startedAt: events[0]?.timestamp || Date.now(),
        endedAt: events[events.length - 1]?.timestamp,
        durationMs: data.debug?.totalDurationMs,
        success: true,
      }

      setCurrentRun(run)
      setCurrentStep(0)
      setIsPlaying(true)
    },
  })

  // Handle debugger execution
  const handleExecute = useCallback(() => {
    if (debuggerInput.trim()) {
      executeMutation.mutate(debuggerInput.trim())
    }
  }, [debuggerInput, executeMutation])

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
    if (!selectedNode || !currentRun) return undefined
    // Find the node_enter event for this node
    for (let i = currentStep; i >= 0; i--) {
      const event = currentRun.events[i]
      if (event.type === 'node_enter' && event.node === selectedNode) {
        return event.state
      }
    }
    return undefined
  }, [selectedNode, currentRun, currentStep])

  const selectedNodeOutput = useMemo(() => {
    if (!selectedNode || !currentRun) return undefined
    // Find the node_exit event for this node
    for (let i = currentStep; i >= 0; i--) {
      const event = currentRun.events[i]
      if (event.type === 'node_exit' && event.node === selectedNode) {
        return event.output
      }
    }
    return undefined
  }, [selectedNode, currentRun, currentStep])

  const tabs = [
    { id: 'debugger' as const, label: 'Debugger', icon: Bug },
    { id: 'graph' as const, label: 'Graph', icon: Network },
    { id: 'nodes' as const, label: 'Nodes', icon: Settings },
    { id: 'edges' as const, label: 'Edges', icon: GitBranch },
    { id: 'threads' as const, label: 'Threads', icon: Database },
    { id: 'test' as const, label: 'Test', icon: Play },
    { id: 'config' as const, label: 'Config', icon: Cog },
  ]

  // Get available node names for edge editor
  const availableNodes =
    graphData?.nodes.filter((n) => n.type === 'node').map((n) => n.name) || []

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-4 border-b border-surface-700 bg-surface-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Network className="w-6 h-6 text-copper" />
            <div>
              <h1 className="text-lg font-semibold text-steel">LangGraph</h1>
              <p className="text-xs text-steel-dim">Workflow visualization and real-time debugging</p>
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
      <div className="flex-1 overflow-hidden flex">
        {/* Main Panel */}
        <div className="flex-1 overflow-auto p-6">
          {/* NEW: Debugger Tab */}
          {activeTab === 'debugger' && (
            <div className="h-full flex flex-col gap-4">
              {/* Input and Controls */}
              <div className="flex-shrink-0 bg-surface-800 rounded-lg p-4">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={debuggerInput}
                    onChange={(e) => setDebuggerInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
                    placeholder="Enter a test message... (e.g., 'I want to build a smart plant monitor')"
                    className="flex-1 px-3 py-2 bg-surface-900 border border-surface-700 rounded text-sm text-steel focus:outline-none focus:border-copper"
                  />
                  <button
                    onClick={handleExecute}
                    disabled={!debuggerInput.trim() || executeMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-copper text-surface-900 rounded font-medium hover:bg-copper/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {executeMutation.isPending ? (
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
                </div>

                {/* Playback speed */}
                <div className="flex items-center gap-4 mt-3 text-xs text-steel-dim">
                  <span>Playback speed:</span>
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

                {/* Error display */}
                {executeMutation.isError && (
                  <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
                    {executeMutation.error.message}
                  </div>
                )}
              </div>

              {/* Graph and Inspector */}
              <div className="flex-1 flex gap-4 min-h-0">
                {/* Graph View */}
                <div className="flex-1 flex flex-col gap-4">
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

                  {/* Timeline */}
                  {currentRun && (
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
                  )}
                </div>

                {/* Node Inspector Panel */}
                <div className="w-96 flex-shrink-0 border-l border-surface-700 pl-4 overflow-auto">
                  <div className="flex items-center gap-2 mb-3">
                    <Eye className="w-4 h-4 text-steel-dim" />
                    <h3 className="text-sm font-medium text-steel">Node Inspector</h3>
                  </div>
                  <NodeDetail
                    nodeName={selectedNode || null}
                    category={flowNodes.find((n) => n.name === selectedNode)?.category}
                    nodeState={selectedNodeState}
                    inputState={selectedNodeInput}
                    outputState={selectedNodeOutput}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'graph' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-medium text-steel mb-3">Workflow Graph (Mermaid)</h2>
                <p className="text-xs text-steel-dim mb-3">
                  Static view using Mermaid. Use the Debugger tab for interactive visualization.
                </p>
                <GraphViewer
                  mermaidCode={graphData?.mermaid || ''}
                  nodes={graphData?.nodes || []}
                  edges={graphData?.edges || []}
                  highlightNode={highlightedNode || selectedNode}
                  onNodeClick={(name) => {
                    setSelectedNode(name)
                    setActiveTab('nodes')
                  }}
                  isLoading={isLoadingGraph}
                  error={graphError?.message}
                />
              </div>

              {/* Graph Legend */}
              <div className="flex flex-wrap gap-4 text-xs text-steel-dim">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-indigo-500" />
                  Start/End nodes
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-surface-700 border border-surface-600" />
                  Regular nodes
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-0.5 bg-surface-600" />
                  Static edge
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-0.5 border-t border-dashed border-surface-600" />
                  Conditional edge
                </div>
              </div>
            </div>
          )}

          {activeTab === 'nodes' && (
            <div>
              <h2 className="text-sm font-medium text-steel mb-3">Orchestrator Nodes</h2>
              <p className="text-xs text-steel-dim mb-4">
                Edit system prompts for each orchestrator agent. Changes are saved to the database.
              </p>
              <NodeEditor selectedNode={selectedNode} onNodeSelect={setSelectedNode} />
            </div>
          )}

          {activeTab === 'edges' && (
            <div>
              <h2 className="text-sm font-medium text-steel mb-3">Workflow Edges</h2>
              <p className="text-xs text-steel-dim mb-4">
                Define transitions between nodes. Conditional edges require a condition expression.
              </p>
              <EdgeEditor availableNodes={availableNodes} />
            </div>
          )}

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

          {activeTab === 'test' && (
            <div className="flex gap-6">
              {/* Test Runner */}
              <div className="flex-1">
                <h2 className="text-sm font-medium text-steel mb-3">Test Runner</h2>
                <p className="text-xs text-steel-dim mb-4">
                  Send test messages to the LangGraph and see the execution trace.
                </p>
                <TestRunner onHighlightNode={setHighlightedNode} />
              </div>

              {/* Live Graph View */}
              <div className="w-96 border-l border-surface-700 pl-6">
                <h3 className="text-sm font-medium text-steel mb-3">Live Graph</h3>
                <GraphViewer
                  mermaidCode={graphData?.mermaid || ''}
                  nodes={graphData?.nodes || []}
                  edges={graphData?.edges || []}
                  highlightNode={highlightedNode}
                  isLoading={isLoadingGraph}
                  error={graphError?.message}
                />
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div>
              <h2 className="text-sm font-medium text-steel mb-3">Platform Configuration</h2>
              <p className="text-xs text-steel-dim mb-4">
                Configure system prompts and hard rejection criteria for capability assessment.
              </p>
              <ConfigEditor />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
