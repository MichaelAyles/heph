/**
 * FlowVisualization Component
 *
 * SVG-based visualization of the orchestrator node/edge graph.
 */

import { useMemo } from 'react'
import type { OrchestratorPrompt, OrchestratorEdge } from '@/db/schema'

interface FlowVisualizationProps {
  prompts: OrchestratorPrompt[]
  edges: OrchestratorEdge[]
  selectedNode: string | null
  onSelectNode: (nodeName: string) => void
}

// Layout configuration
const NODE_WIDTH = 140
const NODE_HEIGHT = 40
const STAGE_HEIGHT = 100
const STAGE_GAP = 20
const NODE_GAP = 20
const PADDING = 40

// Colors
const STAGE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  spec: { bg: '#1e3a5f20', border: '#1e3a5f', text: '#60a5fa' },
  pcb: { bg: '#14532d20', border: '#14532d', text: '#4ade80' },
  enclosure: { bg: '#4c1d9520', border: '#4c1d95', text: '#c084fc' },
  firmware: { bg: '#7c2d1220', border: '#7c2d12', text: '#fb923c' },
  export: { bg: '#71717a20', border: '#71717a', text: '#a1a1aa' },
}

const EDGE_TYPE_STYLES: Record<string, { stroke: string; dashArray?: string }> = {
  flow: { stroke: '#52525b' },
  conditional: { stroke: '#52525b', dashArray: '4,4' },
  loop: { stroke: '#52525b', dashArray: '2,2' },
}

interface NodePosition {
  x: number
  y: number
  stage: string
}

export function FlowVisualization({
  prompts,
  edges,
  selectedNode,
  onSelectNode,
}: FlowVisualizationProps) {
  // Calculate node positions
  const { nodes, width, height } = useMemo(() => {
    const positions: Record<string, NodePosition> = {}
    const stages = ['spec', 'pcb', 'enclosure', 'firmware', 'export']
    let maxNodesInStage = 0

    // Group prompts by stage
    const stagePrompts: Record<string, OrchestratorPrompt[]> = {}
    for (const prompt of prompts) {
      const stage = prompt.stage || 'spec'
      if (!stagePrompts[stage]) stagePrompts[stage] = []
      stagePrompts[stage].push(prompt)
      maxNodesInStage = Math.max(maxNodesInStage, stagePrompts[stage].length)
    }

    // Calculate positions
    let yOffset = PADDING
    for (const stage of stages) {
      const stageNodes = stagePrompts[stage] || []
      const xOffset = PADDING

      for (let i = 0; i < stageNodes.length; i++) {
        const prompt = stageNodes[i]
        positions[prompt.nodeName] = {
          x: xOffset + i * (NODE_WIDTH + NODE_GAP),
          y: yOffset + STAGE_HEIGHT / 2 - NODE_HEIGHT / 2,
          stage,
        }
      }

      yOffset += STAGE_HEIGHT + STAGE_GAP
    }

    // Add edge endpoints for non-prompt nodes
    const edgeNodes = new Set<string>()
    for (const edge of edges) {
      if (!positions[edge.fromNode]) edgeNodes.add(edge.fromNode)
      if (!positions[edge.toNode]) edgeNodes.add(edge.toNode)
    }

    // Place start/end nodes
    if (edgeNodes.has('start')) {
      positions['start'] = { x: PADDING, y: PADDING / 2, stage: 'start' }
    }
    if (edgeNodes.has('end')) {
      positions['end'] = { x: PADDING, y: yOffset, stage: 'end' }
    }

    const w = Math.max(maxNodesInStage * (NODE_WIDTH + NODE_GAP) + PADDING * 2, 600)
    const h = yOffset + PADDING

    return { nodes: positions, width: w, height: h }
  }, [prompts, edges])

  // Filter edges to only include those with both endpoints
  const validEdges = useMemo(() => {
    return edges.filter((edge) => nodes[edge.fromNode] && nodes[edge.toNode])
  }, [edges, nodes])

  return (
    <div className="h-full overflow-auto bg-surface-900">
      <svg width={width} height={height} className="block">
        {/* Stage backgrounds */}
        {Object.entries(STAGE_COLORS).map(([stage, colors], index) => (
          <g key={stage}>
            <rect
              x={PADDING / 2}
              y={PADDING + index * (STAGE_HEIGHT + STAGE_GAP) - 10}
              width={width - PADDING}
              height={STAGE_HEIGHT}
              fill={colors.bg}
              stroke={colors.border}
              strokeWidth={1}
              rx={4}
            />
            <text
              x={PADDING}
              y={PADDING + index * (STAGE_HEIGHT + STAGE_GAP) + 10}
              fill={colors.text}
              fontSize={10}
              fontWeight="bold"
              style={{ textTransform: 'uppercase' }}
            >
              {stage.toUpperCase()}
            </text>
          </g>
        ))}

        {/* Edges */}
        <g>
          {validEdges.map((edge) => {
            const from = nodes[edge.fromNode]
            const to = nodes[edge.toNode]
            if (!from || !to) return null

            const style = EDGE_TYPE_STYLES[edge.edgeType] || EDGE_TYPE_STYLES.flow
            const x1 = from.x + NODE_WIDTH / 2
            const y1 = from.y + NODE_HEIGHT
            const x2 = to.x + NODE_WIDTH / 2
            const y2 = to.y

            // Simple straight line or curve for loops
            const isLoop = edge.edgeType === 'loop'
            const path = isLoop
              ? `M ${x1} ${y1} C ${x1 + 50} ${y1 + 30} ${x2 + 50} ${y2 - 30} ${x2} ${y2}`
              : `M ${x1} ${y1} L ${x2} ${y2}`

            return (
              <g key={edge.id}>
                <path
                  d={path}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={1.5}
                  strokeDasharray={style.dashArray}
                  markerEnd="url(#arrowhead)"
                />
              </g>
            )
          })}
        </g>

        {/* Arrowhead marker */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#52525b" />
          </marker>
        </defs>

        {/* Nodes */}
        <g>
          {prompts.map((prompt) => {
            const pos = nodes[prompt.nodeName]
            if (!pos) return null

            const isSelected = selectedNode === prompt.nodeName
            const colors = STAGE_COLORS[pos.stage] || STAGE_COLORS.spec

            return (
              <g
                key={prompt.nodeName}
                onClick={() => onSelectNode(prompt.nodeName)}
                className="cursor-pointer"
              >
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  fill={isSelected ? '#c2855a30' : '#27272a'}
                  stroke={isSelected ? '#c2855a' : colors.border}
                  strokeWidth={isSelected ? 2 : 1}
                  rx={4}
                />
                <text
                  x={pos.x + NODE_WIDTH / 2}
                  y={pos.y + NODE_HEIGHT / 2 + 4}
                  fill={isSelected ? '#c2855a' : '#a1a1aa'}
                  fontSize={11}
                  textAnchor="middle"
                  className="pointer-events-none"
                >
                  {prompt.displayName.length > 16
                    ? prompt.displayName.slice(0, 14) + '...'
                    : prompt.displayName}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
