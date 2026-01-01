import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle, RefreshCw, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'

interface DebugLog {
  id: string
  user_id: string | null
  level: string
  category: string
  message: string
  metadata: Record<string, unknown> | null
  request_id: string | null
  created_at: string
}

interface LogsResponse {
  logs: DebugLog[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

const LEVELS = ['all', 'debug', 'info', 'warn', 'error'] as const
const CATEGORIES = ['all', 'general', 'api', 'auth', 'llm', 'project', 'image', 'db', 'middleware'] as const

async function fetchLogs(params: {
  level?: string
  category?: string
  limit: number
  offset: number
}): Promise<LogsResponse> {
  const searchParams = new URLSearchParams()
  if (params.level && params.level !== 'all') searchParams.set('level', params.level)
  if (params.category && params.category !== 'all') searchParams.set('category', params.category)
  searchParams.set('limit', params.limit.toString())
  searchParams.set('offset', params.offset.toString())

  const response = await fetch(`/api/admin/logs?${searchParams}`)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch logs')
  }
  return response.json()
}

async function deleteLogs(olderThanDays: number): Promise<{ deleted: number }> {
  const response = await fetch(`/api/admin/logs?olderThanDays=${olderThanDays}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error('Failed to delete logs')
  return response.json()
}

function getLevelColor(level: string): string {
  switch (level) {
    case 'error':
      return 'text-red-400 bg-red-500/10'
    case 'warn':
      return 'text-yellow-400 bg-yellow-500/10'
    case 'info':
      return 'text-blue-400 bg-blue-500/10'
    case 'debug':
      return 'text-steel-dim bg-surface-700'
    default:
      return 'text-steel-dim bg-surface-700'
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'Z')
  return date.toLocaleString()
}

export function AdminLogsPage() {
  const [level, setLevel] = useState<string>('all')
  const [category, setCategory] = useState<string>('all')
  const [page, setPage] = useState(0)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)
  const limit = 50

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-logs', level, category, page],
    queryFn: () => fetchLogs({ level, category, limit, offset: page * limit }),
    refetchInterval: 10000, // Auto-refresh every 10s
  })

  const handleDelete = async () => {
    if (!confirm('Delete logs older than 7 days?')) return
    try {
      const result = await deleteLogs(7)
      alert(`Deleted ${result.deleted} logs`)
      refetch()
    } catch {
      alert('Failed to delete logs')
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-copper animate-spin" strokeWidth={1.5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" strokeWidth={1.5} />
          <p className="text-red-400">{error instanceof Error ? error.message : 'Failed to load logs'}</p>
        </div>
      </div>
    )
  }

  const logs = data?.logs || []
  const pagination = data?.pagination || { total: 0, limit, offset: 0, hasMore: false }
  const totalPages = Math.ceil(pagination.total / limit)

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-8 border-b border-surface-700">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold text-steel tracking-tight">ADMIN LOGS</h1>
          <span className="text-xs text-steel-dim font-mono">
            {pagination.total} total
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-steel-dim hover:text-steel hover:bg-surface-700 transition-colors"
          >
            <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} strokeWidth={1.5} />
            Refresh
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
            Cleanup
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="px-8 py-3 border-b border-surface-700 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-steel-dim">Level:</span>
          <div className="flex gap-1">
            {LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => { setLevel(l); setPage(0) }}
                className={clsx(
                  'px-2 py-1 text-xs font-mono transition-colors',
                  level === l
                    ? 'bg-copper/20 text-copper'
                    : 'text-steel-dim hover:text-steel hover:bg-surface-700'
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-steel-dim">Category:</span>
          <div className="flex gap-1 flex-wrap">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => { setCategory(c); setPage(0) }}
                className={clsx(
                  'px-2 py-1 text-xs font-mono transition-colors',
                  category === c
                    ? 'bg-copper/20 text-copper'
                    : 'text-steel-dim hover:text-steel hover:bg-surface-700'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-800 sticky top-0">
            <tr className="text-left text-xs text-steel-dim font-mono">
              <th className="px-4 py-2 w-40">Time</th>
              <th className="px-4 py-2 w-20">Level</th>
              <th className="px-4 py-2 w-24">Category</th>
              <th className="px-4 py-2">Message</th>
              <th className="px-4 py-2 w-32">Request ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-700">
            {logs.map((log) => (
              <tr
                key={log.id}
                className="hover:bg-surface-800/50 cursor-pointer"
                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
              >
                <td className="px-4 py-2 text-xs text-steel-dim font-mono whitespace-nowrap">
                  {formatDate(log.created_at)}
                </td>
                <td className="px-4 py-2">
                  <span className={clsx('px-2 py-0.5 text-xs font-mono uppercase', getLevelColor(log.level))}>
                    {log.level}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-steel-dim font-mono">
                  {log.category}
                </td>
                <td className="px-4 py-2 text-steel">
                  <div className="truncate max-w-xl">{log.message}</div>
                  {expandedLog === log.id && log.metadata && (
                    <pre className="mt-2 p-2 bg-surface-900 border border-surface-600 text-xs text-steel-dim overflow-x-auto">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-steel-dim font-mono truncate">
                  {log.request_id?.slice(0, 8) || '-'}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-steel-dim">
                  No logs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-8 py-3 border-t border-surface-700 flex items-center justify-between">
          <span className="text-xs text-steel-dim">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-steel-dim hover:text-steel hover:bg-surface-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
              Prev
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={!pagination.hasMore}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-steel-dim hover:text-steel hover:bg-surface-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
