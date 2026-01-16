/**
 * HookConfiguration Component
 *
 * Panel for managing orchestrator hooks for a selected node.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Plus, Trash2, Power, PowerOff, Loader2 } from 'lucide-react'
import type { OrchestratorHook } from '@/db/schema'

interface HookConfigurationProps {
  nodeName: string | null
}

async function fetchHooks(nodeName: string): Promise<{ hooks: OrchestratorHook[] }> {
  const response = await fetch(`/api/admin/orchestrator/hooks?node=${nodeName}&active=false`)
  if (!response.ok) throw new Error('Failed to fetch hooks')
  return response.json()
}

async function updateHook(id: string, data: Partial<OrchestratorHook>): Promise<void> {
  const response = await fetch('/api/admin/orchestrator/hooks', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  })
  if (!response.ok) throw new Error('Failed to update hook')
}

async function deleteHook(id: string): Promise<void> {
  const response = await fetch(`/api/admin/orchestrator/hooks?id=${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error('Failed to delete hook')
}

async function createHook(data: {
  nodeName: string
  hookType: string
  hookFunction: string
  hookConfig?: Record<string, unknown>
}): Promise<{ id: string }> {
  const response = await fetch('/api/admin/orchestrator/hooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error('Failed to create hook')
  return response.json()
}

const HOOK_TYPES = ['on_enter', 'on_exit', 'on_result', 'on_error'] as const
const HOOK_FUNCTIONS = ['report_progress', 'log_event', 'validate_spec', 'validate_pcb'] as const

const HOOK_TYPE_COLORS: Record<string, string> = {
  on_enter: 'text-green-400',
  on_exit: 'text-blue-400',
  on_result: 'text-purple-400',
  on_error: 'text-red-400',
}

export function HookConfiguration({ nodeName }: HookConfigurationProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [newHookType, setNewHookType] = useState<string>('on_enter')
  const [newHookFunction, setNewHookFunction] = useState<string>('report_progress')
  const [newHookConfig, setNewHookConfig] = useState<string>('{}')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['orchestrator-hooks', nodeName],
    queryFn: () => fetchHooks(nodeName!),
    enabled: !!nodeName,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateHook(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestrator-hooks', nodeName] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteHook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestrator-hooks', nodeName] })
    },
  })

  const createMutation = useMutation({
    mutationFn: createHook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestrator-hooks', nodeName] })
      setIsAdding(false)
      setNewHookConfig('{}')
    },
  })

  const handleAdd = () => {
    if (!nodeName) return
    try {
      const config = JSON.parse(newHookConfig)
      createMutation.mutate({
        nodeName,
        hookType: newHookType,
        hookFunction: newHookFunction,
        hookConfig: config,
      })
    } catch {
      alert('Invalid JSON config')
    }
  }

  if (!nodeName) {
    return (
      <div className="p-4 text-center text-steel-dim text-sm">
        Select a node to configure hooks
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-copper animate-spin" />
      </div>
    )
  }

  const hooks = data?.hooks || []

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-surface-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-steel">Hooks</h3>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className={clsx(
            'p-1 transition-colors',
            isAdding ? 'text-copper' : 'text-steel-dim hover:text-steel'
          )}
        >
          <Plus className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {isAdding && (
        <div className="p-3 border-b border-surface-700 bg-surface-800">
          <div className="space-y-2">
            <div className="flex gap-2">
              <select
                value={newHookType}
                onChange={(e) => setNewHookType(e.target.value)}
                className="flex-1 px-2 py-1 bg-surface-700 border border-surface-600 text-sm text-steel"
              >
                {HOOK_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                value={newHookFunction}
                onChange={(e) => setNewHookFunction(e.target.value)}
                className="flex-1 px-2 py-1 bg-surface-700 border border-surface-600 text-sm text-steel"
              >
                {HOOK_FUNCTIONS.map((fn) => (
                  <option key={fn} value={fn}>
                    {fn}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={newHookConfig}
              onChange={(e) => setNewHookConfig(e.target.value)}
              placeholder='{"key": "value"}'
              className="w-full px-2 py-1 bg-surface-700 border border-surface-600 text-sm text-steel font-mono h-16 resize-none"
            />
            <button
              onClick={handleAdd}
              disabled={createMutation.isPending}
              className="w-full px-3 py-1.5 bg-copper text-white text-sm hover:bg-copper/80 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Adding...' : 'Add Hook'}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {hooks.length === 0 ? (
          <div className="p-4 text-center text-steel-dim text-sm">
            No hooks configured
          </div>
        ) : (
          <div className="divide-y divide-surface-700">
            {hooks.map((hook) => (
              <div
                key={hook.id}
                className={clsx(
                  'p-3 flex items-start gap-2',
                  !hook.isActive && 'opacity-50'
                )}
              >
                <button
                  onClick={() =>
                    toggleMutation.mutate({ id: hook.id, isActive: !hook.isActive })
                  }
                  className={clsx(
                    'p-1 transition-colors mt-0.5',
                    hook.isActive ? 'text-green-400' : 'text-steel-dim'
                  )}
                >
                  {hook.isActive ? (
                    <Power className="w-4 h-4" strokeWidth={1.5} />
                  ) : (
                    <PowerOff className="w-4 h-4" strokeWidth={1.5} />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={clsx('text-xs font-mono', HOOK_TYPE_COLORS[hook.hookType])}>
                      {hook.hookType}
                    </span>
                    <span className="text-xs text-steel">{hook.hookFunction}</span>
                  </div>
                  {hook.hookConfig && (
                    <pre className="mt-1 text-[10px] text-steel-dim font-mono truncate">
                      {JSON.stringify(hook.hookConfig)}
                    </pre>
                  )}
                </div>

                <button
                  onClick={() => {
                    if (confirm('Delete this hook?')) {
                      deleteMutation.mutate(hook.id)
                    }
                  }}
                  className="p-1 text-steel-dim hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
