/**
 * FlowEdge - Custom React Flow edge component with animations
 *
 * Features:
 * - Animated flow direction when edge is taken
 * - Conditional edge styling (dashed)
 * - Condition label display
 * - Color changes based on edge state
 */

import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Position,
} from '@xyflow/react'
import { clsx } from 'clsx'

export interface FlowEdgeData extends Record<string, unknown> {
  conditional?: boolean
  condition?: string
  label?: string
  active?: boolean
  taken?: boolean
}

interface FlowEdgeProps {
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: Position
  targetPosition: Position
  data?: FlowEdgeData
  style?: React.CSSProperties
  markerEnd?: string
}

function FlowEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
}: FlowEdgeProps) {
  const conditional = data?.conditional ?? false
  const condition = data?.condition
  const label = data?.label
  const active = data?.active ?? false
  const taken = data?.taken ?? false

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  // Determine edge color based on state
  const getStrokeColor = () => {
    if (active) return '#c9a45c' // copper
    if (taken) return '#10b981' // emerald
    return '#64748b' // steel-dim
  }

  // Edge animation styles
  const animationStyle: React.CSSProperties = active
    ? {
        strokeDasharray: '5 5',
        animation: 'flowAnimation 1s linear infinite',
      }
    : taken
    ? {
        strokeDasharray: 'none',
      }
    : conditional
    ? {
        strokeDasharray: '5 5',
      }
    : {}

  return (
    <>
      {/* Add keyframes for flow animation */}
      <style>
        {`
          @keyframes flowAnimation {
            0% {
              stroke-dashoffset: 10;
            }
            100% {
              stroke-dashoffset: 0;
            }
          }
        `}
      </style>

      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: getStrokeColor(),
          strokeWidth: active ? 3 : taken ? 2.5 : 2,
          ...animationStyle,
        }}
        markerEnd={markerEnd}
      />

      {/* Edge label */}
      {(label || condition) && (
        <EdgeLabelRenderer>
          <div
            className={clsx(
              'absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-all',
              'px-2 py-0.5 rounded text-[10px] font-medium',
              active
                ? 'bg-copper/20 text-copper border border-copper/50'
                : taken
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                : 'bg-surface-800 text-steel-dim border border-surface-600',
              'transition-all duration-300'
            )}
            style={{
              left: labelX,
              top: labelY,
            }}
          >
            {label || condition}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Flow particles animation when active */}
      {active && (
        <g className="flow-particles">
          <circle r="4" fill="#c9a45c">
            <animateMotion dur="1s" repeatCount="indefinite" path={edgePath} />
          </circle>
        </g>
      )}
    </>
  )
}

export const FlowEdge = memo(FlowEdgeComponent)
