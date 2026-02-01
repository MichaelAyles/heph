/**
 * NodeEditor - CRUD editor for orchestrator prompts (LangGraph nodes)
 *
 * Uses the existing orchestrator_prompts table and API endpoints.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Save, RotateCcw, CheckCircle, XCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { PromptEditor } from './PromptEditor'

interface OrchestratorPrompt {
  id: number
  nodeName: string
  displayName: string
  description: string
  systemPrompt: string
  category: 'agent' | 'generator' | 'reviewer'
  stage: string | null
  isActive: boolean
  tokenEstimate: number
  version: number
}

interface NodeEditorProps {
  selectedNode?: string
  onNodeSelect?: (nodeName: string | undefined) => void
}

const CATEGORY_COLORS = {
  agent: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  generator: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  reviewer: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
}

export function NodeEditor({ selectedNode, onNodeSelect }: NodeEditorProps) {
  const queryClient = useQueryClient()
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({})

  // Fetch prompts from orchestrator API
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-orchestrator-prompts'],
    queryFn: async () => {
      const res = await fetch('/api/admin/orchestrator/prompts')
      if (!res.ok) throw new Error('Failed to fetch prompts')
      return res.json() as Promise<{ prompts: OrchestratorPrompt[] }>
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ nodeName, systemPrompt }: { nodeName: string; systemPrompt: string }) => {
      const res = await fetch(`/api/admin/orchestrator/prompts/${nodeName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt }),
      })
      if (!res.ok) throw new Error('Failed to update prompt')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-orchestrator-prompts'] })
    },
  })

  const toggleExpand = (nodeName: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(nodeName)) {
      newExpanded.delete(nodeName)
    } else {
      newExpanded.add(nodeName)
    }
    setExpandedNodes(newExpanded)
    onNodeSelect?.(newExpanded.has(nodeName) ? nodeName : undefined)
  }

  const handlePromptChange = (nodeName: string, value: string) => {
    setEditedPrompts((prev) => ({ ...prev, [nodeName]: value }))
  }

  const handleSave = (nodeName: string) => {
    const newPrompt = editedPrompts[nodeName]
    if (newPrompt !== undefined) {
      updateMutation.mutate({ nodeName, systemPrompt: newPrompt })
      setEditedPrompts((prev) => {
        const next = { ...prev }
        delete next[nodeName]
        return next
      })
    }
  }

  const handleReset = (nodeName: string, _originalPrompt: string) => {
    setEditedPrompts((prev) => {
      const next = { ...prev }
      delete next[nodeName]
      return next
    })
  }

  const estimateTokens = (text: string): number => {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4)
  }

  if (isLoading) {
    return <div className="text-steel-dim text-sm">Loading nodes...</div>
  }

  if (error) {
    return <div className="text-red-400 text-sm">Failed to load nodes</div>
  }

  const prompts = data?.prompts || []

  return (
    <div className="space-y-2">
      {prompts.map((prompt) => {
        const isExpanded = expandedNodes.has(prompt.nodeName) || selectedNode === prompt.nodeName
        const editedPrompt = editedPrompts[prompt.nodeName]
        const currentPrompt = editedPrompt ?? prompt.systemPrompt
        const hasChanges = editedPrompt !== undefined && editedPrompt !== prompt.systemPrompt
        const tokenCount = estimateTokens(currentPrompt)

        return (
          <div
            key={prompt.id}
            className={clsx(
              'border rounded-lg overflow-hidden transition-colors',
              isExpanded ? 'border-copper/50 bg-surface-800' : 'border-surface-700 bg-surface-900'
            )}
          >
            {/* Header */}
            <button
              onClick={() => toggleExpand(prompt.nodeName)}
              className="w-full flex items-center justify-between p-3 text-left hover:bg-surface-800 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-steel">{prompt.nodeName}</span>
                <span
                  className={clsx(
                    'px-2 py-0.5 text-xs rounded border',
                    CATEGORY_COLORS[prompt.category]
                  )}
                >
                  {prompt.category}
                </span>
                {prompt.stage && (
                  <span className="px-2 py-0.5 text-xs rounded bg-surface-700 text-steel-dim">
                    {prompt.stage}
                  </span>
                )}
                {prompt.isActive ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-steel-dim" />
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-steel-dim">{tokenCount} tokens</span>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-steel-dim" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-steel-dim" />
                )}
              </div>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="p-4 border-t border-surface-700 space-y-4">
                <div>
                  <label className="block text-xs text-steel-dim mb-1">Display Name</label>
                  <p className="text-sm text-steel">{prompt.displayName}</p>
                </div>

                <div>
                  <label className="block text-xs text-steel-dim mb-1">Description</label>
                  <p className="text-sm text-steel">{prompt.description}</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-steel-dim">System Prompt</label>
                    {hasChanges && <span className="text-xs text-amber-400">Unsaved changes</span>}
                  </div>
                  <PromptEditor
                    value={currentPrompt}
                    onChange={(value) => handlePromptChange(prompt.nodeName, value)}
                    placeholder="Enter system prompt... (type @ for variables)"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-steel-dim">
                    Version {prompt.version} | Est. {tokenCount} tokens
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReset(prompt.nodeName, prompt.systemPrompt)}
                      disabled={!hasChanges}
                      className={clsx(
                        'flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors',
                        hasChanges
                          ? 'text-steel hover:bg-surface-700'
                          : 'text-steel-dim cursor-not-allowed'
                      )}
                    >
                      <RotateCcw className="w-4 h-4" />
                      Reset
                    </button>
                    <button
                      onClick={() => handleSave(prompt.nodeName)}
                      disabled={!hasChanges || updateMutation.isPending}
                      className={clsx(
                        'flex items-center gap-1 px-3 py-1.5 text-sm rounded transition-colors',
                        hasChanges
                          ? 'bg-copper text-surface-900 hover:bg-copper/90'
                          : 'bg-surface-700 text-steel-dim cursor-not-allowed'
                      )}
                    >
                      <Save className="w-4 h-4" />
                      {updateMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {prompts.length === 0 && (
        <p className="text-sm text-steel-dim py-4 text-center">
          No orchestrator prompts found. Run database migrations to seed default prompts.
        </p>
      )}
    </div>
  )
}
