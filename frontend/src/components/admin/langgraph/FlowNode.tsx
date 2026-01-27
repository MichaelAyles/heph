/**
 * FlowNode - Custom React Flow node component for LangGraph visualization
 *
 * JSONCrack-style node display showing:
 * - Node name
 * - Stage (data permissions)
 * - System prompt preview
 * - Category and status indicators
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { clsx } from 'clsx'
import { Play, Check, AlertCircle, FileText, Cpu, Layers } from 'lucide-react'
import type { NodeStatus } from '../../../services/langgraph/execution-tracer'

export interface FlowNodeData extends Record<string, unknown> {
  label: string
  nodeName?: string
  nodeType: 'start' | 'end' | 'node'
  category?: 'agent' | 'generator' | 'reviewer'
  description?: string
  stage?: string | null
  systemPrompt?: string
  tokenEstimate?: number
  status?: NodeStatus
  durationMs?: number
  avgDuration?: number
  successRate?: number
  isSelected?: boolean
}

const categoryColors = {
  agent: {
    base: 'bg-blue-500/10 border-blue-500/40',
    active: 'bg-blue-500/30 border-blue-500 shadow-blue-500/20',
    completed: 'bg-blue-500/20 border-blue-500/60',
    header: 'bg-blue-500/20 border-blue-500/30',
    text: 'text-blue-300',
    accent: 'text-blue-400',
    label: 'text-blue-200',
  },
  generator: {
    base: 'bg-emerald-500/10 border-emerald-500/40',
    active: 'bg-emerald-500/30 border-emerald-500 shadow-emerald-500/20',
    completed: 'bg-emerald-500/20 border-emerald-500/60',
    header: 'bg-emerald-500/20 border-emerald-500/30',
    text: 'text-emerald-300',
    accent: 'text-emerald-400',
    label: 'text-emerald-200',
  },
  reviewer: {
    base: 'bg-amber-500/10 border-amber-500/40',
    active: 'bg-amber-500/30 border-amber-500 shadow-amber-500/20',
    completed: 'bg-amber-500/20 border-amber-500/60',
    header: 'bg-amber-500/20 border-amber-500/30',
    text: 'text-amber-300',
    accent: 'text-amber-400',
    label: 'text-amber-200',
  },
}

const defaultColors = {
  base: 'bg-surface-800/80 border-surface-600',
  active: 'bg-copper/20 border-copper shadow-copper/20',
  completed: 'bg-surface-700 border-surface-500',
  header: 'bg-surface-700/50 border-surface-600',
  text: 'text-steel',
  accent: 'text-steel-dim',
  label: 'text-steel',
}

interface FlowNodeProps {
  data: FlowNodeData
  selected?: boolean
}

/**
 * Truncate text with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

/**
 * Extract a meaningful preview from the system prompt
 */
function getPromptPreview(prompt: string | undefined, maxLength: number = 80): string {
  if (!prompt) return '(no prompt)'
  // Remove common prefixes and get the essence
  const cleaned = prompt
    .replace(/^You are (a |an )?/i, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return truncate(cleaned, maxLength)
}

function FlowNodeComponent({ data, selected }: FlowNodeProps) {
  // Guard against undefined data
  if (!data) {
    return (
      <div className="px-4 py-2 bg-surface-800 rounded border border-surface-600 text-steel-dim text-xs">
        Invalid node data
      </div>
    )
  }

  const {
    label = 'Unknown',
    nodeName,
    nodeType = 'node',
    category,
    stage,
    systemPrompt,
    tokenEstimate,
    status = 'idle',
    durationMs,
    isSelected,
  } = data

  const isStartEnd = nodeType === 'start' || nodeType === 'end'
  const colors = category ? categoryColors[category] : defaultColors
  const isActive = status === 'active' || status === 'entering'
  const isCompleted = status === 'completed' || status === 'exiting'
  const isError = status === 'error'

  // Determine background style based on status
  const getBackgroundClass = () => {
    if (isError) return 'bg-red-500/20 border-red-500'
    if (isActive) return colors.active
    if (isCompleted) return colors.completed
    return colors.base
  }

  // Status icon
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
          'px-4 py-2 rounded-full border-2 transition-all duration-300',
          nodeType === 'start'
            ? 'bg-indigo-500/30 border-indigo-500 text-indigo-300'
            : 'bg-rose-500/30 border-rose-500 text-rose-300',
          (selected || isSelected) && 'ring-2 ring-offset-2 ring-offset-surface-900 ring-copper'
        )}
      >
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
        'relative w-[200px] rounded-lg border transition-all duration-300 overflow-hidden',
        getBackgroundClass(),
        isActive && 'shadow-lg',
        (selected || isSelected) && 'ring-2 ring-offset-2 ring-offset-surface-900 ring-copper'
      )}
    >
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !border !bg-surface-400 !border-surface-500"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !border !bg-surface-400 !border-surface-500"
      />

      {/* Header with node name */}
      <div
        className={clsx('px-2.5 py-1.5 border-b flex items-center justify-between', colors.header)}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Cpu className={clsx('w-3 h-3 flex-shrink-0', colors.accent)} />
          <span className={clsx('text-xs font-semibold truncate', colors.label)}>{label}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {statusIcon}
          {category && (
            <span
              className={clsx(
                'text-[9px] uppercase font-medium px-1 rounded',
                colors.text,
                'bg-black/20'
              )}
            >
              {category.slice(0, 3)}
            </span>
          )}
        </div>
      </div>

      {/* Content - Key/Value pairs */}
      <div className="px-2.5 py-2 space-y-1.5 text-[10px]">
        {/* Node ID */}
        {nodeName && nodeName !== label && (
          <div className="flex items-start gap-1.5">
            <span className="text-steel-dim w-12 flex-shrink-0">id:</span>
            <span className="text-steel font-mono truncate">{nodeName}</span>
          </div>
        )}

        {/* Stage (Data Permissions) */}
        <div className="flex items-start gap-1.5">
          <span className="text-steel-dim w-12 flex-shrink-0 flex items-center gap-0.5">
            <Layers className="w-2.5 h-2.5" />
            stage:
          </span>
          <span className={clsx('font-mono', stage ? 'text-copper' : 'text-steel-dim')}>
            {stage || 'global'}
          </span>
        </div>

        {/* System Prompt Preview */}
        <div className="flex items-start gap-1.5">
          <span className="text-steel-dim w-12 flex-shrink-0 flex items-center gap-0.5">
            <FileText className="w-2.5 h-2.5" />
            prompt:
          </span>
          <span className="text-steel leading-tight line-clamp-2">
            {getPromptPreview(systemPrompt, 60)}
          </span>
        </div>

        {/* Token Estimate */}
        {tokenEstimate && (
          <div className="flex items-start gap-1.5">
            <span className="text-steel-dim w-12 flex-shrink-0">tokens:</span>
            <span className="text-steel font-mono">~{tokenEstimate.toLocaleString()}</span>
          </div>
        )}

        {/* Duration if executed */}
        {durationMs !== undefined && (
          <div className="flex items-start gap-1.5 pt-1 border-t border-surface-600/50">
            <span className="text-steel-dim w-12 flex-shrink-0">time:</span>
            <span className="text-emerald-400 font-mono">{durationMs}ms</span>
          </div>
        )}
      </div>

      {/* Active indicator ring */}
      {isActive && (
        <div className="absolute -inset-0.5 rounded-lg border border-copper/50 animate-pulse pointer-events-none" />
      )}
    </div>
  )
}

export const FlowNode = memo(FlowNodeComponent)
