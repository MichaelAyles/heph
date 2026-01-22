/**
 * StateInspector - Deep state inspection for LangGraph threads
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronRight,
  ChevronDown,
  MessageSquare,
  User,
  Bot,
  Code,
  Eye,
  Database,
} from 'lucide-react'
import { clsx } from 'clsx'

interface StateInspectorProps {
  threadId: string | null
}

interface ThreadState {
  status: string
  currentNode: string | null
  state: Record<string, unknown>
  updatedAt: string | null
}

export function StateInspector({ threadId }: StateInspectorProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(['messages', 'debug']))
  const [viewMode, setViewMode] = useState<'tree' | 'json'>('tree')

  // Fetch thread state
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-langgraph-state', threadId],
    queryFn: async () => {
      if (!threadId) return null
      const res = await fetch(`/api/langgraph/state?thread_id=${threadId}`)
      if (!res.ok) throw new Error('Failed to fetch state')
      return res.json() as Promise<ThreadState>
    },
    enabled: !!threadId,
  })

  const toggleExpand = (key: string) => {
    const newExpanded = new Set(expandedKeys)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedKeys(newExpanded)
  }

  if (!threadId) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-steel-dim">
        <Database className="w-8 h-8 mb-2" />
        <p className="text-sm">Select a thread to inspect its state</p>
      </div>
    )
  }

  if (isLoading) {
    return <div className="text-steel-dim text-sm py-4">Loading state...</div>
  }

  if (error) {
    return <div className="text-red-400 text-sm py-4">Failed to load state</div>
  }

  if (!data || !data.state) {
    return <div className="text-steel-dim text-sm py-4">No state found for this thread</div>
  }

  const state = data.state

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-steel-dim">
          Status: <span className="text-copper font-medium">{data.status}</span>
          {data.currentNode && (
            <>
              {' '}
              | Node: <span className="text-amber-400 font-medium">{data.currentNode}</span>
            </>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('tree')}
            className={clsx(
              'p-1.5 rounded transition-colors',
              viewMode === 'tree' ? 'bg-copper text-surface-900' : 'text-steel-dim hover:bg-surface-700'
            )}
            title="Tree view"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('json')}
            className={clsx(
              'p-1.5 rounded transition-colors',
              viewMode === 'json' ? 'bg-copper text-surface-900' : 'text-steel-dim hover:bg-surface-700'
            )}
            title="JSON view"
          >
            <Code className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'json' ? (
        <pre className="p-3 bg-surface-900 border border-surface-700 rounded text-xs text-steel overflow-auto max-h-96 font-mono">
          {JSON.stringify(state, null, 2)}
        </pre>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {Object.entries(state).map(([key, value]) => (
            <StateNode
              key={key}
              keyName={key}
              value={value}
              path={key}
              isExpanded={expandedKeys.has(key)}
              onToggle={() => toggleExpand(key)}
              expandedKeys={expandedKeys}
              onToggleKey={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface StateNodeProps {
  keyName: string
  value: unknown
  path: string
  isExpanded: boolean
  onToggle: () => void
  expandedKeys: Set<string>
  onToggleKey: (key: string) => void
}

function StateNode({
  keyName,
  value,
  path,
  isExpanded,
  onToggle,
  expandedKeys,
  onToggleKey,
}: StateNodeProps) {
  const isExpandable =
    value !== null &&
    typeof value === 'object' &&
    (Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0)

  const renderValue = () => {
    if (value === null) return <span className="text-steel-dim">null</span>
    if (value === undefined) return <span className="text-steel-dim">undefined</span>

    if (typeof value === 'string') {
      if (value.length > 100) {
        return <span className="text-emerald-400">"{value.substring(0, 100)}..."</span>
      }
      return <span className="text-emerald-400">"{value}"</span>
    }

    if (typeof value === 'number') return <span className="text-amber-400">{value}</span>
    if (typeof value === 'boolean')
      return <span className="text-purple-400">{value ? 'true' : 'false'}</span>

    if (Array.isArray(value)) {
      return <span className="text-steel-dim">Array({value.length})</span>
    }

    if (typeof value === 'object') {
      return <span className="text-steel-dim">Object({Object.keys(value).length})</span>
    }

    return <span className="text-steel">{String(value)}</span>
  }

  // Special rendering for messages
  if (keyName === 'messages' && Array.isArray(value) && isExpanded) {
    return (
      <div className="border-l-2 border-surface-700 ml-2">
        <div
          className="flex items-center gap-2 px-2 py-1 hover:bg-surface-800 cursor-pointer"
          onClick={onToggle}
        >
          <ChevronDown className="w-3 h-3 text-steel-dim" />
          <MessageSquare className="w-3 h-3 text-copper" />
          <span className="text-xs text-copper font-medium">{keyName}</span>
          <span className="text-xs text-steel-dim">({value.length} messages)</span>
        </div>
        <div className="ml-4 space-y-1">
          {value.map((msg: Record<string, unknown>, idx: number) => {
            // Messages from LangGraph can have _getType method or serialized type
            const getType = msg._getType as (() => string) | undefined
            const type = (typeof getType === 'function' ? getType() : null) || msg.type || 'unknown'
            const content = (msg.content as string) || ''
            const isHuman = type === 'human'
            return (
              <div
                key={idx}
                className="flex items-start gap-2 px-2 py-1 bg-surface-900 rounded text-xs"
              >
                {isHuman ? (
                  <User className="w-3 h-3 text-blue-400 mt-0.5" />
                ) : (
                  <Bot className="w-3 h-3 text-emerald-400 mt-0.5" />
                )}
                <span className="text-steel truncate">{content.substring(0, 100)}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="border-l-2 border-surface-700 ml-2">
      <div
        className={clsx(
          'flex items-center gap-2 px-2 py-1 hover:bg-surface-800',
          isExpandable && 'cursor-pointer'
        )}
        onClick={isExpandable ? onToggle : undefined}
      >
        {isExpandable ? (
          isExpanded ? (
            <ChevronDown className="w-3 h-3 text-steel-dim" />
          ) : (
            <ChevronRight className="w-3 h-3 text-steel-dim" />
          )
        ) : (
          <span className="w-3" />
        )}
        <span className="text-xs text-copper font-medium">{keyName}:</span>
        {!isExpanded && renderValue()}
      </div>

      {isExpanded && isExpandable && (
        <div className="ml-4 space-y-0.5">
          {Array.isArray(value)
            ? value.map((item, idx) => (
                <StateNode
                  key={idx}
                  keyName={`[${idx}]`}
                  value={item}
                  path={`${path}[${idx}]`}
                  isExpanded={expandedKeys.has(`${path}[${idx}]`)}
                  onToggle={() => onToggleKey(`${path}[${idx}]`)}
                  expandedKeys={expandedKeys}
                  onToggleKey={onToggleKey}
                />
              ))
            : Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                <StateNode
                  key={k}
                  keyName={k}
                  value={v}
                  path={`${path}.${k}`}
                  isExpanded={expandedKeys.has(`${path}.${k}`)}
                  onToggle={() => onToggleKey(`${path}.${k}`)}
                  expandedKeys={expandedKeys}
                  onToggleKey={onToggleKey}
                />
              ))}
        </div>
      )}
    </div>
  )
}
