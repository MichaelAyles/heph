/**
 * FlowNode - Custom React Flow node component for LangGraph visualization
 *
 * Features:
 * - Category-based coloring (agent=blue, generator=green, reviewer=yellow)
 * - Status-based styling (idle, active, completed, error)
 * - Pulsing animation when active
 * - Quick stats on hover
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { clsx } from 'clsx'
import { Play, Check, AlertCircle } from 'lucide-react'
import type { NodeStatus } from '../../../services/langgraph/execution-tracer'

export interface FlowNodeData extends Record<string, unknown> {
  label: string
  nodeType: 'start' | 'end' | 'node'
  category?: 'agent' | 'generator' | 'reviewer'
  status?: NodeStatus
  durationMs?: number
  avgDuration?: number
  successRate?: number
  isSelected?: boolean
}

const categoryColors = {
  agent: {
    base: 'bg-blue-500/20 border-blue-500/50',
    active: 'bg-blue-500/40 border-blue-500 shadow-blue-500/20',
    completed: 'bg-blue-500/30 border-blue-500/70',
    text: 'text-blue-300',
    icon: 'text-blue-400',
  },
  generator: {
    base: 'bg-emerald-500/20 border-emerald-500/50',
    active: 'bg-emerald-500/40 border-emerald-500 shadow-emerald-500/20',
    completed: 'bg-emerald-500/30 border-emerald-500/70',
    text: 'text-emerald-300',
    icon: 'text-emerald-400',
  },
  reviewer: {
    base: 'bg-amber-500/20 border-amber-500/50',
    active: 'bg-amber-500/40 border-amber-500 shadow-amber-500/20',
    completed: 'bg-amber-500/30 border-amber-500/70',
    text: 'text-amber-300',
    icon: 'text-amber-400',
  },
}

const defaultColors = {
  base: 'bg-surface-800 border-surface-600',
  active: 'bg-copper/30 border-copper shadow-copper/20',
  completed: 'bg-surface-700 border-surface-500',
  text: 'text-steel',
  icon: 'text-steel-dim',
}

interface FlowNodeProps {
  data: FlowNodeData
  selected?: boolean
}

function FlowNodeComponent({ data, selected }: FlowNodeProps) {
  const { label, nodeType, category, status = 'idle', durationMs, avgDuration, successRate, isSelected } = data

  const isStartEnd = nodeType === 'start' || nodeType === 'end'
  const colors = category ? categoryColors[category] : defaultColors
  const isActive = status === 'active' || status === 'entering'
  const isCompleted = status === 'completed' || status === 'exiting'
  const isError = status === 'error'

  // Determine background style based on status
  const getBackgroundClass = () => {
    if (isError) return 'bg-red-500/30 border-red-500 shadow-red-500/20'
    if (isActive) return colors.active
    if (isCompleted) return colors.completed
    return colors.base
  }

  // Determine status icon (rendered inline to avoid component creation during render)
  const statusIcon = isError ? (
    <AlertCircle className="w-3 h-3 text-red-400" />
  ) : isActive ? (
    <Play className="w-3 h-3 text-copper animate-pulse" />
  ) : isCompleted ? (
    <Check className="w-3 h-3 text-emerald-400" />
  ) : null

  // Start/End nodes have special styling
  if (isStartEnd) {
    return (
      <div
        className={clsx(
          'px-3 py-2 rounded-full border-2 transition-all duration-300',
          nodeType === 'start'
            ? 'bg-indigo-500/30 border-indigo-500 text-indigo-300'
            : 'bg-rose-500/30 border-rose-500 text-rose-300',
          (selected || isSelected) && 'ring-2 ring-offset-2 ring-offset-surface-900 ring-copper'
        )}
      >
        {/* Only target handle for start, only source handle for end */}
        {nodeType === 'start' && (
          <Handle
            type="source"
            position={Position.Bottom}
            className="!bg-indigo-400 !border-indigo-300 !w-2 !h-2"
          />
        )}
        {nodeType === 'end' && (
          <Handle
            type="target"
            position={Position.Top}
            className="!bg-rose-400 !border-rose-300 !w-2 !h-2"
          />
        )}
        <span className="text-xs font-medium">{label}</span>
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'relative min-w-[120px] rounded-lg border-2 transition-all duration-300',
        getBackgroundClass(),
        isActive && 'shadow-lg animate-pulse',
        (selected || isSelected) && 'ring-2 ring-offset-2 ring-offset-surface-900 ring-copper'
      )}
    >
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className={clsx(
          '!w-2 !h-2 !border-2',
          category ? `!bg-${category === 'agent' ? 'blue' : category === 'generator' ? 'emerald' : 'amber'}-400` : '!bg-surface-400',
          '!border-surface-600'
        )}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className={clsx(
          '!w-2 !h-2 !border-2',
          category ? `!bg-${category === 'agent' ? 'blue' : category === 'generator' ? 'emerald' : 'amber'}-400` : '!bg-surface-400',
          '!border-surface-600'
        )}
      />

      {/* Node content */}
      <div className="px-3 py-2">
        {/* Header with label and status */}
        <div className="flex items-center justify-between gap-2">
          <span className={clsx('text-sm font-medium', colors.text)}>
            {label}
          </span>
          {statusIcon}
        </div>

        {/* Category badge */}
        {category && (
          <div className={clsx('text-[10px] uppercase tracking-wider mt-1', colors.icon)}>
            {category}
          </div>
        )}

        {/* Stats (show on hover or when completed) */}
        {(durationMs !== undefined || avgDuration !== undefined) && (
          <div className="mt-2 pt-2 border-t border-surface-600/50 space-y-0.5">
            {durationMs !== undefined && (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-steel-dim">Duration</span>
                <span className="text-steel font-mono">{durationMs}ms</span>
              </div>
            )}
            {avgDuration !== undefined && (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-steel-dim">Avg</span>
                <span className="text-steel font-mono">{Math.round(avgDuration)}ms</span>
              </div>
            )}
            {successRate !== undefined && (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-steel-dim">Success</span>
                <span className={clsx(
                  'font-mono',
                  successRate >= 0.9 ? 'text-emerald-400' : successRate >= 0.7 ? 'text-amber-400' : 'text-red-400'
                )}>
                  {Math.round(successRate * 100)}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active indicator ring */}
      {isActive && (
        <div className="absolute -inset-1 rounded-lg border-2 border-copper/50 animate-ping" />
      )}
    </div>
  )
}

export const FlowNode = memo(FlowNodeComponent)
