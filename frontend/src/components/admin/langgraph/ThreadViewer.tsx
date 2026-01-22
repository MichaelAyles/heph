/**
 * ThreadViewer - View and manage LangGraph checkpointed threads
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, Trash2, ChevronRight, Database, AlertCircle, Folder } from 'lucide-react'
import { clsx } from 'clsx'

interface ThreadSummary {
  threadId: string
  projectName: string | null
  checkpointCount: number
  lastActivity: string
  currentNode: string | null
}

interface Checkpoint {
  checkpointId: string
  parentCheckpointId: string | null
  createdAt: string
  metadata: Record<string, unknown>
}

interface ThreadViewerProps {
  onSelectThread?: (threadId: string) => void
  selectedThreadId?: string
}

export function ThreadViewer({ onSelectThread, selectedThreadId }: ThreadViewerProps) {
  const queryClient = useQueryClient()
  const [expandedThread, setExpandedThread] = useState<string | null>(null)

  // Fetch threads
  const {
    data: threadsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['admin-langgraph-threads'],
    queryFn: async () => {
      const res = await fetch('/api/admin/langgraph/threads')
      if (!res.ok) throw new Error('Failed to fetch threads')
      return res.json() as Promise<{ threads: ThreadSummary[] }>
    },
  })

  // Fetch thread history when expanded
  const { data: historyData } = useQuery({
    queryKey: ['admin-langgraph-history', expandedThread],
    queryFn: async () => {
      if (!expandedThread) return null
      const res = await fetch(`/api/langgraph/history?thread_id=${expandedThread}&limit=20`)
      if (!res.ok) throw new Error('Failed to fetch history')
      return res.json() as Promise<{ checkpoints: Checkpoint[] }>
    },
    enabled: !!expandedThread,
  })

  // Delete thread mutation
  const deleteMutation = useMutation({
    mutationFn: async (threadId: string) => {
      const res = await fetch(`/api/admin/langgraph/threads/${threadId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete thread')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-langgraph-threads'] })
      setExpandedThread(null)
    },
  })

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString()
  }

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-steel-dim">
        <Database className="w-5 h-5 animate-pulse mr-2" />
        Loading threads...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-32 text-red-400">
        <AlertCircle className="w-5 h-5 mr-2" />
        Failed to load threads
      </div>
    )
  }

  const threads = threadsData?.threads || []

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-steel-dim">
        <Database className="w-8 h-8 mb-2" />
        <p className="text-sm">No threads found</p>
        <p className="text-xs mt-1">Threads are created when users interact with the chat</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {threads.map((thread) => {
        const isExpanded = expandedThread === thread.threadId
        const isSelected = selectedThreadId === thread.threadId

        return (
          <div
            key={thread.threadId}
            className={clsx(
              'border rounded-lg overflow-hidden transition-colors',
              isSelected
                ? 'border-copper bg-copper/5'
                : isExpanded
                  ? 'border-surface-600 bg-surface-800'
                  : 'border-surface-700 bg-surface-900'
            )}
          >
            {/* Thread Header */}
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-surface-800"
              onClick={() => {
                setExpandedThread(isExpanded ? null : thread.threadId)
                onSelectThread?.(thread.threadId)
              }}
            >
              <div className="flex items-center gap-3">
                <ChevronRight
                  className={clsx(
                    'w-4 h-4 text-steel-dim transition-transform',
                    isExpanded && 'rotate-90'
                  )}
                />
                {thread.projectName ? (
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-copper" />
                    <span className="text-sm text-steel">{thread.projectName}</span>
                  </div>
                ) : (
                  <span className="font-mono text-xs text-steel-dim">
                    {thread.threadId.substring(0, 8)}...
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 text-xs text-steel-dim">
                  <Database className="w-3 h-3" />
                  {thread.checkpointCount}
                </div>
                <div className="flex items-center gap-1 text-xs text-steel-dim">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(thread.lastActivity)}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm('Delete this thread and all its checkpoints?')) {
                      deleteMutation.mutate(thread.threadId)
                    }
                  }}
                  className="p-1 text-steel-dim hover:text-red-400 transition-colors"
                  title="Delete thread"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Expanded Content - Checkpoint History */}
            {isExpanded && (
              <div className="border-t border-surface-700 p-3 space-y-2">
                <div className="text-xs text-steel-dim mb-2">
                  Thread ID:{' '}
                  <code className="bg-surface-700 px-1 rounded">{thread.threadId}</code>
                </div>

                {historyData?.checkpoints && historyData.checkpoints.length > 0 ? (
                  <div className="space-y-1">
                    <h4 className="text-xs font-medium text-steel-dim mb-2">
                      Checkpoint History ({historyData.checkpoints.length})
                    </h4>
                    {historyData.checkpoints.map((checkpoint, index) => (
                      <div
                        key={checkpoint.checkpointId}
                        className="flex items-center justify-between px-3 py-2 bg-surface-900 rounded text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-steel-dim">#{index + 1}</span>
                          <code className="text-steel">
                            {checkpoint.checkpointId.substring(0, 8)}
                          </code>
                        </div>
                        <span className="text-steel-dim">
                          {formatDate(checkpoint.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-steel-dim">Loading checkpoints...</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
