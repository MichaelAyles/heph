import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'

interface TrackedLoginSummary {
  username: string
  loginCount: number
  mostRecentLoginAt: string | null
}

interface AdminLoginsResponse {
  users: TrackedLoginSummary[]
  trackedUsers: string[]
}

async function fetchTrackedLogins(): Promise<AdminLoginsResponse> {
  const response = await fetch('/api/admin/logins')
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch tracked logins')
  }
  return response.json()
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  return new Date(`${dateStr}Z`).toLocaleString()
}

export function AdminLoginsPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-logins'],
    queryFn: fetchTrackedLogins,
    refetchInterval: 10000,
  })

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
          <p className="text-red-400">
            {error instanceof Error ? error.message : 'Failed to load tracked logins'}
          </p>
        </div>
      </div>
    )
  }

  const users = data?.users ?? []
  const totalLogins = users.reduce((sum, user) => sum + user.loginCount, 0)

  return (
    <div className="flex-1 flex flex-col">
      <header className="h-14 flex items-center justify-between px-8 border-b border-surface-700">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold text-steel tracking-tight">TRACKED LOGINS</h1>
          <span className="text-xs text-steel-dim font-mono">{totalLogins} total login events</span>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-steel-dim hover:text-steel hover:bg-surface-700 transition-colors"
        >
          <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} strokeWidth={1.5} />
          Refresh
        </button>
      </header>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-800 sticky top-0">
            <tr className="text-left text-xs text-steel-dim font-mono">
              <th className="px-4 py-2">Username</th>
              <th className="px-4 py-2 w-48">Login Count</th>
              <th className="px-4 py-2 w-80">Most Recent Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-700">
            {users.map((user) => (
              <tr key={user.username} className="hover:bg-surface-800/50">
                <td className="px-4 py-2 text-steel font-medium">{user.username}</td>
                <td className="px-4 py-2 text-steel">{user.loginCount}</td>
                <td className="px-4 py-2 text-steel-dim font-mono text-xs">
                  {formatDate(user.mostRecentLoginAt)}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-steel-dim">
                  No tracked users configured
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
