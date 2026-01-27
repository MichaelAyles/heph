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

import { useMemo, useCallback, useEffect, useRef } from 'react'
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
import type {
  NodeState,
  EdgeState,
  ExecutionEvent,
} from '../../../services/langgraph/execution-tracer'
import {
  getNodeStatesAtStep,
  getActiveEdgesAtStep,
} from '../../../services/langgraph/execution-tracer'

// =============================================================================
// Types
// =============================================================================

export interface GraphNodeDef {
  name: string
  type: 'start' | 'end' | 'node'
  category?: 'agent' | 'generator' | 'reviewer'
  displayName?: string
  description?: string
  stage?: string | null
  systemPrompt?: string
  tokenEstimate?: number
  position?: { x: number; y: number } | null
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
  /** Callback when node positions change (for persistence) */
  onPositionsChange?: (positions: Array<{ nodeName: string; x: number; y: number }>) => void
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

const NODE_WIDTH = 220
const NODE_HEIGHT = 140

interface StoredPositions {
  [nodeName: string]: { x: number; y: number }
}

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  storedPositions: StoredPositions = {},
  direction: 'TB' | 'LR' = 'TB'
): { nodes: Node[]; edges: Edge[] } {
  // Guard against empty or invalid nodes
  if (!nodes || nodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  // Filter out any invalid nodes (defensive)
  const validNodes = nodes.filter(
    (node) => node && typeof node.id === 'string' && node.type === 'custom'
  )

  if (validNodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  // Build a set of valid node IDs for edge filtering
  const validNodeIds = new Set(validNodes.map((n) => n.id))

  // Filter edges to only include those with valid source/target nodes
  const validEdges = edges.filter(
    (edge) => edge && validNodeIds.has(edge.source) && validNodeIds.has(edge.target)
  )

  // Check if all nodes have stored positions - if so, skip dagre entirely
  const allHavePositions = validNodes.every((node) => storedPositions[node.id])

  if (!allHavePositions) {
    // Create a fresh dagre graph instance to avoid stale state
    const graph = new dagre.graphlib.Graph()
    graph.setDefaultEdgeLabel(() => ({}))
    graph.setGraph({ rankdir: direction, nodesep: 60, ranksep: 100 })

    validNodes.forEach((node) => {
      const nodeData = node.data as FlowNodeData | undefined
      const nodeType = nodeData?.nodeType
      graph.setNode(node.id, {
        width: nodeType === 'start' || nodeType === 'end' ? 80 : NODE_WIDTH,
        height: nodeType === 'start' || nodeType === 'end' ? 40 : NODE_HEIGHT,
      })
    })

    validEdges.forEach((edge) => {
      graph.setEdge(edge.source, edge.target)
    })

    dagre.layout(graph)

    // Update the module-level graph for position lookups
    validNodes.forEach((node) => {
      const graphNode = graph.node(node.id)
      if (graphNode) {
        dagreGraph.setNode(node.id, graphNode)
      }
    })
  }

  const layoutedNodes = validNodes.map((node) => {
    const nodeData = node.data as FlowNodeData | undefined
    const nodeType = nodeData?.nodeType
    const width = nodeType === 'start' || nodeType === 'end' ? 80 : NODE_WIDTH
    const height = nodeType === 'start' || nodeType === 'end' ? 40 : NODE_HEIGHT

    // Use stored position if available, otherwise use dagre layout
    let position: { x: number; y: number }
    if (storedPositions[node.id]) {
      position = storedPositions[node.id]
    } else {
      const nodeWithPosition = dagreGraph.node(node.id)
      // Guard against missing dagre node (can happen during rapid updates)
      if (nodeWithPosition && typeof nodeWithPosition.x === 'number') {
        position = {
          x: nodeWithPosition.x - width / 2,
          y: nodeWithPosition.y - height / 2,
        }
      } else {
        // Fallback position if dagre layout failed
        position = { x: 0, y: 0 }
      }
    }

    return {
      ...node,
      position,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    }
  })

  return { nodes: layoutedNodes, edges: validEdges }
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
  onPositionsChange,
  isLoading,
  error,
  showMinimap = false,
  showControls = true,
  nodeStats,
}: FlowGraphProps) {
  // Build stored positions map from node definitions
  const storedPositions = useMemo<StoredPositions>(() => {
    const positions: StoredPositions = {}
    for (const nodeDef of nodeDefs) {
      if (nodeDef.position) {
        positions[nodeDef.name] = nodeDef.position
      }
    }
    return positions
  }, [nodeDefs])

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
    // Filter out any invalid node definitions
    const validNodeDefs = nodeDefs.filter(
      (nodeDef) => nodeDef && typeof nodeDef.name === 'string' && nodeDef.name.length > 0
    )

    return validNodeDefs.map((nodeDef) => {
      const state = calculatedNodeStates.get(nodeDef.name)
      const stats = nodeStats?.get(nodeDef.name)

      // Ensure nodeType is always a valid value
      const nodeType: 'start' | 'end' | 'node' =
        nodeDef.type === 'start' || nodeDef.type === 'end' ? nodeDef.type : 'node'

      const data: FlowNodeData = {
        label:
          nodeDef.name === '__start__'
            ? 'START'
            : nodeDef.name === '__end__'
              ? 'END'
              : nodeDef.displayName || nodeDef.name,
        nodeName: nodeDef.name,
        nodeType,
        category: nodeDef.category,
        description: nodeDef.description,
        stage: nodeDef.stage,
        systemPrompt: nodeDef.systemPrompt,
        tokenEstimate: nodeDef.tokenEstimate,
        status: state?.status || 'idle',
        durationMs: state?.durationMs,
        avgDuration: stats?.avgDuration,
        successRate: stats?.successRate,
        isSelected: nodeDef.name === selectedNode,
      }

      return {
        id: nodeDef.name,
        type: 'custom' as const,
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

  // Apply layout (uses stored positions when available)
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(initialNodes, initialEdges, storedPositions),
    [initialNodes, initialEdges, storedPositions]
  )

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges)

  // Track initial load to avoid resetting user-dragged positions
  const initializedRef = useRef(false)
  const nodeDefsKeyRef = useRef(
    nodeDefs
      .filter((n) => n && n.name)
      .map((n) => n.name)
      .join(',')
  )

  // Single effect to handle all node/edge updates (avoids race conditions)
  useEffect(() => {
    // Guard against empty layoutedNodes
    if (!layoutedNodes || layoutedNodes.length === 0) {
      return
    }

    const currentKey = nodeDefs
      .filter((n) => n && n.name)
      .map((n) => n.name)
      .join(',')
    const nodeDefsChanged = currentKey !== nodeDefsKeyRef.current

    if (!initializedRef.current || nodeDefsChanged) {
      // Full node reset when structure changes
      setNodes(layoutedNodes)
      initializedRef.current = true
      nodeDefsKeyRef.current = currentKey
    } else {
      // Only update node data (status, etc.) without resetting positions
      setNodes((currentNodes) => {
        // Guard against empty current nodes
        if (!currentNodes || currentNodes.length === 0) {
          return layoutedNodes
        }

        return currentNodes.map((node) => {
          // Guard against invalid node
          if (!node || !node.id) return node

          const layoutedNode = layoutedNodes.find((n) => n && n.id === node.id)
          if (layoutedNode) {
            return {
              ...node,
              data: layoutedNode.data, // Update data but keep position
            }
          }
          return node
        })
      })
    }

    // Always update edges (they carry status info)
    setEdges(layoutedEdges)
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges, nodeDefs])

  // Handle node drag end - save positions
  const handleNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!onPositionsChange) return

      // Save the dragged node's position
      onPositionsChange([
        {
          nodeName: node.id,
          x: node.position.x,
          y: node.position.y,
        },
      ])
    },
    [onPositionsChange]
  )

  // Handle node click
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Guard against invalid node
      if (!node || !node.id || !node.data) return

      const nodeData = node.data as FlowNodeData | undefined
      const nodeType = nodeData?.nodeType
      if (nodeType !== 'start' && nodeType !== 'end') {
        onNodeClick?.(node.id)
      }
    },
    [onNodeClick]
  )

  // Handle node double-click
  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Guard against invalid node
      if (!node || !node.id || !node.data) return

      const nodeData = node.data as FlowNodeData | undefined
      const nodeType = nodeData?.nodeType
      if (nodeType !== 'start' && nodeType !== 'end') {
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
        onNodeDragStop={handleNodeDragStop}
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
          <Controls className="!bg-surface-800 !border-surface-600 !shadow-lg [&_button]:!bg-surface-700 [&_button]:!border-surface-600 [&_button:hover]:!bg-surface-600 [&_button_svg]:!fill-steel" />
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
