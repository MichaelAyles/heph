/**
 * FlowVisualization Component
 *
 * SVG-based visualization of the orchestrator node/edge graph.
 * Shows loops as curved arrows with max loop counts,
 * conditional edges with condition summaries.
 */

import { useMemo, useState } from 'react'
import type { OrchestratorPrompt, OrchestratorEdge } from '@/db/schema'

interface FlowVisualizationProps {
  prompts: OrchestratorPrompt[]
  edges: OrchestratorEdge[]
  selectedNode: string | null
  onSelectNode: (nodeName: string) => void
}

interface EdgeTooltip {
  x: number
  y: number
  edge: OrchestratorEdge
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

const EDGE_TYPE_STYLES: Record<string, { stroke: string; dashArray?: string; label?: string }> = {
  flow: { stroke: '#52525b' },
  conditional: { stroke: '#f59e0b', dashArray: '4,4', label: 'if' },
  loop: { stroke: '#8b5cf6', dashArray: '2,2', label: 'loop' },
}

interface NodePosition {
  x: number
  y: number
  stage: string
}

/**
 * Format a condition for display as a short summary.
 */
function formatConditionSummary(condition: unknown): string {
  if (!condition || typeof condition !== 'object') return ''
  const cond = condition as Record<string, unknown>

  // Simple condition
  if (cond.field && cond.operator) {
    const op = cond.operator === '==' ? '=' : cond.operator
    return `${cond.field} ${op} ${cond.value}`
  }

  // Compound condition
  if (cond.all && Array.isArray(cond.all)) {
    return `all(${cond.all.length})`
  }
  if (cond.any && Array.isArray(cond.any)) {
    return `any(${cond.any.length})`
  }

  return ''
}

export function FlowVisualization({
  prompts,
  edges,
  selectedNode,
  onSelectNode,
}: FlowVisualizationProps) {
  const [hoveredEdge, setHoveredEdge] = useState<EdgeTooltip | null>(null)
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
    <div className="relative h-full overflow-auto bg-surface-900">
      {/* Legend */}
      <div className="absolute right-4 top-4 z-10 rounded border border-surface-700 bg-surface-800/90 p-2 text-xs">
        <div className="mb-1 font-medium text-surface-300">Edge Types</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-0.5 w-6 bg-zinc-600" />
            <span className="text-surface-400">Flow</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-0.5 w-6 bg-amber-500" style={{ background: 'repeating-linear-gradient(90deg, #f59e0b 0, #f59e0b 4px, transparent 4px, transparent 8px)' }} />
            <span className="text-surface-400">Conditional</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-0.5 w-6 bg-purple-500" style={{ background: 'repeating-linear-gradient(90deg, #8b5cf6 0, #8b5cf6 2px, transparent 2px, transparent 4px)' }} />
            <span className="text-surface-400">Loop</span>
          </div>
        </div>
      </div>

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

            // Calculate path based on edge type
            const isLoop = edge.edgeType === 'loop'
            const isConditional = edge.edgeType === 'conditional'
            const isSameRow = Math.abs(from.y - to.y) < 20
            const isBackward = y2 < y1 // Going up the graph

            let path: string
            let labelX: number
            let labelY: number

            if (isLoop || isBackward) {
              // Curved path for loops - curve to the right side
              const curveOffset = 60 + Math.abs(y1 - y2) * 0.3
              path = `M ${x1} ${y1} C ${x1 + curveOffset} ${y1 + 20} ${x2 + curveOffset} ${y2 - 20} ${x2} ${y2}`
              labelX = Math.max(x1, x2) + curveOffset - 10
              labelY = (y1 + y2) / 2
            } else if (isSameRow) {
              // Horizontal edge with curve
              const midX = (x1 + x2) / 2
              const curveY = from.y - 30
              path = `M ${x1} ${from.y} Q ${midX} ${curveY} ${x2} ${to.y}`
              labelX = midX
              labelY = curveY - 5
            } else {
              // Straight line for normal flow
              path = `M ${x1} ${y1} L ${x2} ${y2}`
              labelX = (x1 + x2) / 2
              labelY = (y1 + y2) / 2 - 5
            }

            // Build label text
            let labelText = ''
            if (isConditional && edge.condition) {
              labelText = formatConditionSummary(edge.condition)
            }
            if (isLoop && edge.maxLoops) {
              labelText = `max: ${edge.maxLoops}`
            }

            const markerId = isLoop ? 'arrowhead-loop' : isConditional ? 'arrowhead-cond' : 'arrowhead'

            return (
              <g
                key={edge.id}
                onMouseEnter={(e) =>
                  setHoveredEdge({ x: e.clientX, y: e.clientY, edge })
                }
                onMouseLeave={() => setHoveredEdge(null)}
                className="cursor-pointer"
              >
                {/* Wider invisible path for easier hover */}
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={12}
                />
                {/* Visible edge */}
                <path
                  d={path}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={1.5}
                  strokeDasharray={style.dashArray}
                  markerEnd={`url(#${markerId})`}
                />
                {/* Edge label */}
                {labelText && (
                  <g>
                    <rect
                      x={labelX - 25}
                      y={labelY - 8}
                      width={50}
                      height={14}
                      fill="#18181b"
                      rx={2}
                    />
                    <text
                      x={labelX}
                      y={labelY + 3}
                      fill={style.stroke}
                      fontSize={9}
                      textAnchor="middle"
                      className="pointer-events-none"
                    >
                      {labelText.length > 12 ? labelText.slice(0, 10) + '..' : labelText}
                    </text>
                  </g>
                )}
              </g>
            )
          })}
        </g>

        {/* Arrowhead markers */}
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
          <marker
            id="arrowhead-loop"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#8b5cf6" />
          </marker>
          <marker
            id="arrowhead-cond"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b" />
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

      {/* Edge tooltip */}
      {hoveredEdge && (
        <div
          className="fixed z-50 max-w-xs rounded border border-surface-700 bg-surface-800 p-3 shadow-lg"
          style={{
            left: hoveredEdge.x + 10,
            top: hoveredEdge.y + 10,
          }}
        >
          <div className="mb-2 text-xs font-bold text-surface-200">
            {hoveredEdge.edge.fromNode} → {hoveredEdge.edge.toNode}
          </div>
          <div className="space-y-1 text-xs text-surface-400">
            <div>
              <span className="text-surface-500">Type:</span>{' '}
              <span
                className={
                  hoveredEdge.edge.edgeType === 'loop'
                    ? 'text-purple-400'
                    : hoveredEdge.edge.edgeType === 'conditional'
                      ? 'text-amber-400'
                      : 'text-surface-300'
                }
              >
                {hoveredEdge.edge.edgeType}
              </span>
            </div>
            {hoveredEdge.edge.maxLoops && (
              <div>
                <span className="text-surface-500">Max loops:</span>{' '}
                {hoveredEdge.edge.maxLoops}
              </div>
            )}
            {hoveredEdge.edge.condition && (
              <div>
                <span className="text-surface-500">Condition:</span>
                <pre className="mt-1 overflow-auto rounded bg-surface-900 p-1 text-[10px]">
                  {JSON.stringify(hoveredEdge.edge.condition, null, 2)}
                </pre>
              </div>
            )}
            {hoveredEdge.edge.description && (
              <div>
                <span className="text-surface-500">Description:</span>{' '}
                {hoveredEdge.edge.description}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
