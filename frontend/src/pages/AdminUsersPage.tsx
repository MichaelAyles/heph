import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, X, Users, Clock, CheckCircle, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'

interface User {
  id: string
  username: string
  display_name: string | null
  is_admin: number
  is_approved: number
  created_at: string
  last_login_at: string | null
}

type Filter = 'pending' | 'approved' | 'all'

export function AdminUsersPage() {
  const [filter, setFilter] = useState<Filter>('pending')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', filter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users?filter=${filter}`)
      if (!res.ok) throw new Error('Failed to fetch users')
      return res.json() as Promise<{ users: User[] }>
    },
  })

  const approveMutation = useMutation({
    mutationFn: async ({ userId, isApproved }: { userId: string; isApproved: boolean }) => {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isApproved }),
      })
      if (!res.ok) throw new Error('Failed to update user')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  const users = data?.users || []

  return (
    <div className="min-h-screen bg-ash p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link
            to="/"
            className="p-2 hover:bg-surface-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-steel-dim" strokeWidth={1.5} />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-steel">User Management</h1>
            <p className="text-steel-dim text-sm">Approve access requests</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setFilter('pending')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
              filter === 'pending'
                ? 'bg-copper text-ash'
                : 'bg-surface-800 text-steel-dim hover:text-steel'
            )}
          >
            <Clock className="w-4 h-4" strokeWidth={1.5} />
            Pending
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
              filter === 'approved'
                ? 'bg-copper text-ash'
                : 'bg-surface-800 text-steel-dim hover:text-steel'
            )}
          >
            <CheckCircle className="w-4 h-4" strokeWidth={1.5} />
            Approved
          </button>
          <button
            onClick={() => setFilter('all')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
              filter === 'all'
                ? 'bg-copper text-ash'
                : 'bg-surface-800 text-steel-dim hover:text-steel'
            )}
          >
            <Users className="w-4 h-4" strokeWidth={1.5} />
            All
          </button>
        </div>

        {/* Users List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-copper animate-spin" strokeWidth={1.5} />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-steel-dim">
            {filter === 'pending' ? 'No pending access requests' : 'No users found'}
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 bg-surface-900 border border-surface-700"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-steel">{user.username}</span>
                    {user.is_admin === 1 && (
                      <span className="px-2 py-0.5 text-xs bg-copper/20 text-copper">Admin</span>
                    )}
                    {user.is_approved === 1 ? (
                      <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400">Approved</span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400">Pending</span>
                    )}
                  </div>
                  {user.display_name && (
                    <p className="text-sm text-steel-dim mt-0.5">{user.display_name}</p>
                  )}
                  <p className="text-xs text-steel-dim mt-1">
                    Joined {new Date(user.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {user.is_approved === 0 ? (
                    <button
                      onClick={() => approveMutation.mutate({ userId: user.id, isApproved: true })}
                      disabled={approveMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-sm font-medium transition-colors"
                    >
                      <Check className="w-4 h-4" strokeWidth={1.5} />
                      Approve
                    </button>
                  ) : (
                    <button
                      onClick={() => approveMutation.mutate({ userId: user.id, isApproved: false })}
                      disabled={approveMutation.isPending || user.is_admin === 1}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <X className="w-4 h-4" strokeWidth={1.5} />
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
