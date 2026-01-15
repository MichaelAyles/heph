import { useState, useCallback, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  ArrowLeft,
  Loader2,
  X,
  Workflow,
  ToggleLeft,
  ToggleRight,
  Save,
  RotateCcw,
} from 'lucide-react'
import { clsx } from 'clsx'

// =============================================================================
// TYPES
// =============================================================================

interface GraphNode {
  id: string
  name: string
  displayName: string
  stage: string
  description: string | null
  hasPrompt: boolean
  isActive: boolean
  temperature?: number
  maxTokens?: number
}

interface GraphEdge {
  id: string
  source: string
  target: string
  condition?: string
  label?: string
  type: string
}

interface OrchestratorPrompt {
  id: string
  node_name: string
  display_name: string
  stage: string
  description: string | null
  system_prompt: string
  user_prompt_template: string
  temperature: number
  max_tokens: number
  is_active: number
  updated_at: string
  updated_by: string | null
}

// =============================================================================
// CONSTANTS
// =============================================================================

const STAGE_COLORS: Record<string, string> = {
  spec: '#10B981',
  pcb: '#3B82F6',
  enclosure: '#8B5CF6',
  firmware: '#F59E0B',
  export: '#EF4444',
}

const STAGE_LABELS: Record<string, string> = {
  spec: 'Specification',
  pcb: 'PCB Layout',
  enclosure: 'Enclosure',
  firmware: 'Firmware',
  export: 'Export',
}

// =============================================================================
// LAYOUT HELPERS
// =============================================================================

function layoutNodes(graphNodes: GraphNode[]): Node[] {
  // Group nodes by stage
  const stageGroups: Record<string, GraphNode[]> = {
    spec: [],
    pcb: [],
    enclosure: [],
    firmware: [],
    export: [],
  }

  for (const node of graphNodes) {
    if (node.id === 'START') {
      stageGroups.spec.unshift(node)
    } else if (node.id === 'END') {
      stageGroups.export.push(node)
    } else {
      stageGroups[node.stage]?.push(node)
    }
  }

  const nodes: Node[] = []
  let y = 0
  const stageSpacing = 200
  const nodeSpacing = 120
  const stageX: Record<string, number> = {}

  // Layout nodes stage by stage
  for (const stage of ['spec', 'pcb', 'enclosure', 'firmware', 'export']) {
    const stageNodes = stageGroups[stage]
    if (stageNodes.length === 0) continue

    stageX[stage] = y

    for (let i = 0; i < stageNodes.length; i++) {
      const node = stageNodes[i]
      const isStartEnd = node.id === 'START' || node.id === 'END'

      nodes.push({
        id: node.id,
        type: isStartEnd ? 'input' : node.hasPrompt ? 'default' : 'output',
        position: { x: i * nodeSpacing, y },
        data: {
          label: node.displayName,
          ...node,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        style: {
          background: isStartEnd
            ? '#374151'
            : node.hasPrompt
              ? STAGE_COLORS[node.stage]
              : '#4B5563',
          color: '#fff',
          border: 'none',
          borderRadius: isStartEnd ? '50%' : '8px',
          padding: isStartEnd ? '12px' : '10px 16px',
          fontSize: '12px',
          fontWeight: 500,
          minWidth: isStartEnd ? '60px' : '120px',
          textAlign: 'center' as const,
          cursor: node.hasPrompt ? 'pointer' : 'default',
          opacity: node.isActive ? 1 : 0.5,
        },
      })
    }

    y += stageSpacing
  }

  return nodes
}

function layoutEdges(graphEdges: GraphEdge[]): Edge[] {
  return graphEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: edge.type === 'loop' ? 'smoothstep' : 'default',
    animated: edge.type === 'loop',
    style: {
      stroke: edge.type === 'conditional' ? '#F59E0B' : edge.type === 'loop' ? '#EF4444' : '#6B7280',
      strokeWidth: 2,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: edge.type === 'conditional' ? '#F59E0B' : edge.type === 'loop' ? '#EF4444' : '#6B7280',
    },
    labelStyle: {
      fill: '#9CA3AF',
      fontSize: 10,
    },
    labelBgStyle: {
      fill: '#1F2937',
    },
  }))
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AdminOrchestratorPage() {
  // Feature flag state
  const [useLangGraph, setUseLangGraph] = useState(() => {
    return localStorage.getItem('USE_LANGGRAPH_ORCHESTRATOR') === 'true'
  })

  // Graph state
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null)
  const [isLoadingGraph, setIsLoadingGraph] = useState(true)
  const [graphError, setGraphError] = useState<string | null>(null)

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // Selected node for editing
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedPrompt, setSelectedPrompt] = useState<OrchestratorPrompt | null>(null)
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Edited prompt state
  const [editedSystemPrompt, setEditedSystemPrompt] = useState('')
  const [editedUserTemplate, setEditedUserTemplate] = useState('')
  const [editedTemperature, setEditedTemperature] = useState(0.3)
  const [editedMaxTokens, setEditedMaxTokens] = useState(4096)

  // Check if there are unsaved changes
  const hasChanges = useMemo(() => {
    if (!selectedPrompt) return false
    return (
      editedSystemPrompt !== selectedPrompt.system_prompt ||
      editedUserTemplate !== selectedPrompt.user_prompt_template ||
      editedTemperature !== selectedPrompt.temperature ||
      editedMaxTokens !== selectedPrompt.max_tokens
    )
  }, [selectedPrompt, editedSystemPrompt, editedUserTemplate, editedTemperature, editedMaxTokens])

  // Fetch graph data
  useEffect(() => {
    async function fetchGraph() {
      setIsLoadingGraph(true)
      setGraphError(null)
      try {
        const response = await fetch('/api/admin/orchestrator/graph')
        if (!response.ok) {
          throw new Error(`Failed to fetch graph: ${response.status}`)
        }
        const data = await response.json()
        setGraphData(data)

        // Layout and set nodes/edges
        const layoutedNodes = layoutNodes(data.nodes)
        const layoutedEdges = layoutEdges(data.edges)
        setNodes(layoutedNodes)
        setEdges(layoutedEdges)
      } catch (error) {
        setGraphError(error instanceof Error ? error.message : 'Unknown error')
      } finally {
        setIsLoadingGraph(false)
      }
    }

    fetchGraph()
  }, [setNodes, setEdges])

  // Fetch prompt when node is selected
  useEffect(() => {
    if (!selectedNode) {
      setSelectedPrompt(null)
      return
    }

    const node = graphData?.nodes.find((n) => n.id === selectedNode)
    if (!node?.hasPrompt) {
      setSelectedPrompt(null)
      return
    }

    async function fetchPrompt() {
      setIsLoadingPrompt(true)
      setSaveError(null)
      try {
        const response = await fetch(`/api/admin/orchestrator/prompts/${selectedNode}`)
        if (!response.ok) {
          throw new Error(`Failed to fetch prompt: ${response.status}`)
        }
        const data = await response.json()
        setSelectedPrompt(data.prompt)
        setEditedSystemPrompt(data.prompt.system_prompt)
        setEditedUserTemplate(data.prompt.user_prompt_template)
        setEditedTemperature(data.prompt.temperature)
        setEditedMaxTokens(data.prompt.max_tokens)
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Unknown error')
      } finally {
        setIsLoadingPrompt(false)
      }
    }

    fetchPrompt()
  }, [selectedNode, graphData])

  // Handle node click
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const nodeData = node.data as unknown as GraphNode
    if (nodeData.hasPrompt) {
      setSelectedNode(node.id)
    }
  }, [])

  // Toggle feature flag
  const toggleFeatureFlag = useCallback(() => {
    const newValue = !useLangGraph
    setUseLangGraph(newValue)
    localStorage.setItem('USE_LANGGRAPH_ORCHESTRATOR', String(newValue))
  }, [useLangGraph])

  // Save prompt
  const savePrompt = useCallback(async () => {
    if (!selectedNode || !selectedPrompt) return

    setIsSaving(true)
    setSaveError(null)
    try {
      const response = await fetch(`/api/admin/orchestrator/prompts/${selectedNode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_prompt: editedSystemPrompt,
          user_prompt_template: editedUserTemplate,
          temperature: editedTemperature,
          max_tokens: editedMaxTokens,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || `Failed to save: ${response.status}`)
      }

      const data = await response.json()
      setSelectedPrompt(data.prompt)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setIsSaving(false)
    }
  }, [selectedNode, selectedPrompt, editedSystemPrompt, editedUserTemplate, editedTemperature, editedMaxTokens])

  // Reset changes
  const resetChanges = useCallback(() => {
    if (selectedPrompt) {
      setEditedSystemPrompt(selectedPrompt.system_prompt)
      setEditedUserTemplate(selectedPrompt.user_prompt_template)
      setEditedTemperature(selectedPrompt.temperature)
      setEditedMaxTokens(selectedPrompt.max_tokens)
    }
  }, [selectedPrompt])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-6 border-b border-surface-700 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 hover:bg-surface-800 transition-colors">
            <ArrowLeft className="w-5 h-5 text-steel-dim" strokeWidth={1.5} />
          </Link>
          <h1 className="text-base font-semibold text-steel tracking-tight">
            ORCHESTRATOR GRAPH EDITOR
          </h1>
        </div>

        {/* Feature Flag Toggle */}
        <button
          onClick={toggleFeatureFlag}
          className={clsx(
            'flex items-center gap-2 px-4 py-1.5 text-sm transition-all',
            useLangGraph
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-surface-700 text-steel-dim border border-surface-600'
          )}
        >
          {useLangGraph ? (
            <>
              <ToggleRight className="w-4 h-4" strokeWidth={1.5} />
              LangGraph Enabled
            </>
          ) : (
            <>
              <ToggleLeft className="w-4 h-4" strokeWidth={1.5} />
              LangGraph Disabled
            </>
          )}
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Graph Panel */}
        <div className="flex-1 relative">
          {isLoadingGraph ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-copper animate-spin" strokeWidth={1.5} />
            </div>
          ) : graphError ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <X className="w-8 h-8 text-red-400 mx-auto mb-2" strokeWidth={1.5} />
                <p className="text-red-400">{graphError}</p>
                <p className="text-steel-dim text-sm mt-2">
                  Make sure to run the migration: pnpm db:migrate
                </p>
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#374151" />
              <Controls
                style={{
                  background: '#1F2937',
                  border: '1px solid #374151',
                  borderRadius: '4px',
                }}
              />
            </ReactFlow>
          )}

          {/* Stage Legend */}
          <div className="absolute bottom-4 left-4 bg-surface-800 border border-surface-700 p-3 rounded">
            <p className="text-xs font-mono text-steel-dim mb-2">STAGES</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(STAGE_LABELS).map(([stage, label]) => (
                <div key={stage} className="flex items-center gap-1.5">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: STAGE_COLORS[stage] }}
                  />
                  <span className="text-xs text-steel-dim">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div className="absolute top-4 left-4 bg-surface-800/90 border border-surface-700 p-3 rounded text-xs text-steel-dim max-w-xs">
            <p className="font-medium text-steel mb-1">Click a colored node to edit its prompt</p>
            <p>Gray nodes are control flow only (no LLM calls)</p>
          </div>
        </div>

        {/* Editor Panel */}
        <div className="w-[500px] border-l border-surface-700 flex flex-col bg-surface-900 overflow-hidden">
          {selectedNode && selectedPrompt ? (
            <>
              {/* Editor Header */}
              <div className="p-4 border-b border-surface-700 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-steel">
                    {selectedPrompt.display_name}
                  </h2>
                  <span
                    className="text-xs px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: `${STAGE_COLORS[selectedPrompt.stage]}20`,
                      color: STAGE_COLORS[selectedPrompt.stage],
                    }}
                  >
                    {selectedPrompt.stage}
                  </span>
                </div>
                {selectedPrompt.description && (
                  <p className="text-xs text-steel-dim">{selectedPrompt.description}</p>
                )}
              </div>

              {/* Editor Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {isLoadingPrompt ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-copper animate-spin" strokeWidth={1.5} />
                  </div>
                ) : (
                  <>
                    {/* System Prompt */}
                    <div>
                      <label className="block text-xs font-mono text-steel-dim mb-2">
                        SYSTEM PROMPT
                      </label>
                      <textarea
                        value={editedSystemPrompt}
                        onChange={(e) => setEditedSystemPrompt(e.target.value)}
                        className="w-full h-48 px-3 py-2 bg-surface-800 border border-surface-600 text-steel text-xs font-mono focus:border-copper focus:outline-none resize-none"
                        placeholder="System prompt..."
                      />
                    </div>

                    {/* User Prompt Template */}
                    <div>
                      <label className="block text-xs font-mono text-steel-dim mb-2">
                        USER PROMPT TEMPLATE
                        <span className="text-steel-dim/50 ml-2">
                          (use {'{{variable}}'} for substitution)
                        </span>
                      </label>
                      <textarea
                        value={editedUserTemplate}
                        onChange={(e) => setEditedUserTemplate(e.target.value)}
                        className="w-full h-32 px-3 py-2 bg-surface-800 border border-surface-600 text-steel text-xs font-mono focus:border-copper focus:outline-none resize-none"
                        placeholder="User prompt template..."
                      />
                    </div>

                    {/* Parameters */}
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-mono text-steel-dim mb-2">
                          TEMPERATURE
                        </label>
                        <input
                          type="number"
                          value={editedTemperature}
                          onChange={(e) => setEditedTemperature(parseFloat(e.target.value) || 0)}
                          min={0}
                          max={2}
                          step={0.1}
                          className="w-full px-3 py-2 bg-surface-800 border border-surface-600 text-steel text-sm focus:border-copper focus:outline-none"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-mono text-steel-dim mb-2">
                          MAX TOKENS
                        </label>
                        <input
                          type="number"
                          value={editedMaxTokens}
                          onChange={(e) => setEditedMaxTokens(parseInt(e.target.value) || 0)}
                          min={100}
                          max={16000}
                          step={100}
                          className="w-full px-3 py-2 bg-surface-800 border border-surface-600 text-steel text-sm focus:border-copper focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Last Updated */}
                    {selectedPrompt.updated_at && (
                      <p className="text-xs text-steel-dim">
                        Last updated: {new Date(selectedPrompt.updated_at).toLocaleString()}
                        {selectedPrompt.updated_by && ` by ${selectedPrompt.updated_by}`}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Editor Footer */}
              <div className="p-4 border-t border-surface-700 flex-shrink-0">
                {saveError && (
                  <p className="text-red-400 text-xs mb-3">{saveError}</p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={savePrompt}
                    disabled={!hasChanges || isSaving}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-all',
                      hasChanges && !isSaving
                        ? 'bg-copper-gradient text-ash hover:opacity-90'
                        : 'bg-surface-700 text-steel-dim cursor-not-allowed'
                    )}
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                    ) : (
                      <Save className="w-4 h-4" strokeWidth={1.5} />
                    )}
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={resetChanges}
                    disabled={!hasChanges}
                    className={clsx(
                      'px-4 py-2 text-sm font-medium transition-all',
                      hasChanges
                        ? 'bg-surface-700 text-steel border border-surface-600 hover:bg-surface-600'
                        : 'bg-surface-800 text-steel-dim cursor-not-allowed'
                    )}
                  >
                    <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </>
          ) : selectedNode ? (
            <div className="flex-1 flex items-center justify-center text-steel-dim">
              <div className="text-center">
                <Workflow className="w-8 h-8 mx-auto mb-2 opacity-50" strokeWidth={1.5} />
                <p>This node has no editable prompt</p>
                <p className="text-xs mt-1">Control flow nodes don't call the LLM</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-steel-dim">
              <div className="text-center">
                <Workflow className="w-8 h-8 mx-auto mb-2 opacity-50" strokeWidth={1.5} />
                <p>Select a node to edit its prompt</p>
                <p className="text-xs mt-1">Click any colored node in the graph</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
