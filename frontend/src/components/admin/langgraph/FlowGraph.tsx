/**
 * FlowGraph - React Flow based LangGraph visualization
 *
 * Replaces Mermaid with an interactive graph that supports:
 * - Real-time node highlighting during execution
 * - Edge animations showing flow direction
 * - Click-to-inspect node details
 * - Hover stats display
 * - Auto-layout using dagre
 */

import { useMemo, useCallback, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  Position,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import { FlowNode, type FlowNodeData } from './FlowNode'
import { FlowEdge, type FlowEdgeData } from './FlowEdge'
import type { NodeState, EdgeState, ExecutionEvent } from '../../../services/langgraph/execution-tracer'
import { getNodeStatesAtStep, getActiveEdgesAtStep } from '../../../services/langgraph/execution-tracer'

// =============================================================================
// Types
// =============================================================================

export interface GraphNodeDef {
  name: string
  type: 'start' | 'end' | 'node'
  category?: 'agent' | 'generator' | 'reviewer'
}

export interface GraphEdgeDef {
  from: string
  to: string
  conditional: boolean
  label?: string
}

export interface FlowGraphProps {
  /** Node definitions */
  nodes: GraphNodeDef[]
  /** Edge definitions */
  edges: GraphEdgeDef[]
  /** Execution events for visualization */
  events?: ExecutionEvent[]
  /** Current timeline step index */
  currentStep?: number
  /** Node states (alternative to events+currentStep) */
  nodeStates?: Map<string, NodeState>
  /** Edge states (alternative to events+currentStep) */
  edgeStates?: Map<string, EdgeState>
  /** Currently selected node */
  selectedNode?: string
  /** Callback when a node is clicked */
  onNodeClick?: (nodeName: string) => void
  /** Callback when a node is double-clicked (e.g., to edit) */
  onNodeDoubleClick?: (nodeName: string) => void
  /** Whether the graph is loading */
  isLoading?: boolean
  /** Error message */
  error?: string | null
  /** Whether to show the minimap */
  showMinimap?: boolean
  /** Whether to show controls */
  showControls?: boolean
  /** Node stats for hover display */
  nodeStats?: Map<string, { avgDuration: number; successRate: number; runCount: number }>
}

// =============================================================================
// Custom node and edge types
// =============================================================================

const nodeTypes = {
  custom: FlowNode,
}

const edgeTypes = {
  custom: FlowEdge,
}

// =============================================================================
// Layout with dagre
// =============================================================================

const dagreGraph = new dagre.graphlib.Graph()
dagreGraph.setDefaultEdgeLabel(() => ({}))

const NODE_WIDTH = 140
const NODE_HEIGHT = 80

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 80 })

  nodes.forEach((node) => {
    const nodeData = node.data as FlowNodeData
    dagreGraph.setNode(node.id, {
      width: nodeData.nodeType === 'start' || nodeData.nodeType === 'end' ? 80 : NODE_WIDTH,
      height: nodeData.nodeType === 'start' || nodeData.nodeType === 'end' ? 40 : NODE_HEIGHT,
    })
  })

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  dagre.layout(dagreGraph)

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    const nodeData = node.data as FlowNodeData
    const width = nodeData.nodeType === 'start' || nodeData.nodeType === 'end' ? 80 : NODE_WIDTH
    const height = nodeData.nodeType === 'start' || nodeData.nodeType === 'end' ? 40 : NODE_HEIGHT

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    }
  })

  return { nodes: layoutedNodes, edges }
}

// =============================================================================
// Component
// =============================================================================

export function FlowGraph({
  nodes: nodeDefs,
  edges: edgeDefs,
  events,
  currentStep,
  nodeStates: externalNodeStates,
  edgeStates: externalEdgeStates,
  selectedNode,
  onNodeClick,
  onNodeDoubleClick,
  isLoading,
  error,
  showMinimap = false,
  showControls = true,
  nodeStats,
}: FlowGraphProps) {
  // Calculate node and edge states from events if provided
  const calculatedNodeStates = useMemo(() => {
    if (externalNodeStates) return externalNodeStates
    if (events && currentStep !== undefined) {
      return getNodeStatesAtStep(events, currentStep)
    }
    return new Map<string, NodeState>()
  }, [events, currentStep, externalNodeStates])

  const calculatedEdgeStates = useMemo(() => {
    if (externalEdgeStates) return externalEdgeStates
    if (events && currentStep !== undefined) {
      return getActiveEdgesAtStep(events, currentStep)
    }
    return new Map<string, EdgeState>()
  }, [events, currentStep, externalEdgeStates])

  // Convert node definitions to React Flow nodes
  const initialNodes = useMemo<Node[]>(() => {
    return nodeDefs.map((nodeDef) => {
      const state = calculatedNodeStates.get(nodeDef.name)
      const stats = nodeStats?.get(nodeDef.name)

      const data: FlowNodeData = {
        label: nodeDef.name === '__start__' ? 'START' : nodeDef.name === '__end__' ? 'END' : nodeDef.name,
        nodeType: nodeDef.type,
        category: nodeDef.category,
        status: state?.status || 'idle',
        durationMs: state?.durationMs,
        avgDuration: stats?.avgDuration,
        successRate: stats?.successRate,
        isSelected: nodeDef.name === selectedNode,
      }

      return {
        id: nodeDef.name,
        type: 'custom',
        position: { x: 0, y: 0 }, // Will be set by dagre
        data,
      }
    })
  }, [nodeDefs, calculatedNodeStates, selectedNode, nodeStats])

  // Convert edge definitions to React Flow edges
  const initialEdges = useMemo<Edge[]>(() => {
    return edgeDefs.map((edgeDef, index) => {
      const edgeKey = `${edgeDef.from}->${edgeDef.to}`
      const state = calculatedEdgeStates.get(edgeKey)

      const data: FlowEdgeData = {
        conditional: edgeDef.conditional,
        label: edgeDef.label,
        active: state?.active || false,
        taken: !!state?.takenAt,
      }

      return {
        id: `edge-${index}`,
        source: edgeDef.from,
        target: edgeDef.to,
        type: 'custom',
        data,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 15,
          height: 15,
          color: state?.active ? '#c9a45c' : state?.takenAt ? '#10b981' : '#64748b',
        },
      }
    })
  }, [edgeDefs, calculatedEdgeStates])

  // Apply layout
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(initialNodes, initialEdges),
    [initialNodes, initialEdges]
  )

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges)

  // Update nodes when layout changes
  useEffect(() => {
    setNodes(layoutedNodes)
    setEdges(layoutedEdges)
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges])

  // Handle node click
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const nodeData = node.data as FlowNodeData
      if (nodeData.nodeType !== 'start' && nodeData.nodeType !== 'end') {
        onNodeClick?.(node.id)
      }
    },
    [onNodeClick]
  )

  // Handle node double-click
  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const nodeData = node.data as FlowNodeData
      if (nodeData.nodeType !== 'start' && nodeData.nodeType !== 'end') {
        onNodeDoubleClick?.(node.id)
      }
    },
    [onNodeDoubleClick]
  )

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] bg-surface-800 rounded-lg">
        <div className="w-6 h-6 border-2 border-copper border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] bg-surface-800 rounded-lg gap-2">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-[300px] bg-surface-900 rounded-lg overflow-hidden border border-surface-700">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={2}
        defaultEdgeOptions={{
          animated: false,
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#334155" gap={20} size={1} />
        {showControls && (
          <Controls
            className="!bg-surface-800 !border-surface-600 !shadow-lg [&_button]:!bg-surface-700 [&_button]:!border-surface-600 [&_button:hover]:!bg-surface-600 [&_button_svg]:!fill-steel"
          />
        )}
        {showMinimap && (
          <MiniMap
            className="!bg-surface-800 !border-surface-600"
            nodeColor={(node) => {
              const nodeData = node.data as FlowNodeData | undefined
              if (nodeData?.status === 'active') return '#c9a45c'
              if (nodeData?.status === 'completed') return '#10b981'
              if (nodeData?.status === 'error') return '#ef4444'
              if (nodeData?.nodeType === 'start') return '#6366f1'
              if (nodeData?.nodeType === 'end') return '#f43f5e'
              return '#475569'
            }}
            maskColor="rgba(15, 23, 42, 0.7)"
          />
        )}
      </ReactFlow>
    </div>
  )
}
