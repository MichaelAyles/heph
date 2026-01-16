/**
 * PromptEditor Component
 *
 * Monaco-based editor for editing orchestrator system prompts.
 */

import { useState, useEffect, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Save, RotateCcw, AlertCircle, Check, Hash, FileText } from 'lucide-react'
import type { OrchestratorPrompt } from '@/db/schema'
import { hasHardcodedDefault } from '@/services/prompt-loader'

interface PromptEditorProps {
  prompt: OrchestratorPrompt | null
  onSave?: () => void
}

async function updatePrompt(
  nodeName: string,
  data: { systemPrompt: string; displayName?: string; description?: string }
): Promise<{ version: number }> {
  const response = await fetch(`/api/admin/orchestrator/prompts/${nodeName}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update prompt')
  }
  return response.json()
}

async function resetPrompt(nodeName: string): Promise<{ version: number }> {
  const response = await fetch(`/api/admin/orchestrator/prompts/${nodeName}/reset`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to reset prompt')
  }
  return response.json()
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4)
}

export function PromptEditor({ prompt, onSave }: PromptEditorProps) {
  const [content, setContent] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const queryClient = useQueryClient()

  // Reset state when prompt changes
  useEffect(() => {
    if (prompt) {
      setContent(prompt.systemPrompt)
      setDisplayName(prompt.displayName)
      setDescription(prompt.description || '')
      setIsDirty(false)
    }
  }, [prompt])

  const saveMutation = useMutation({
    mutationFn: () =>
      updatePrompt(prompt!.nodeName, {
        systemPrompt: content,
        displayName,
        description: description || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestrator-prompts'] })
      setIsDirty(false)
      onSave?.()
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => resetPrompt(prompt!.nodeName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orchestrator-prompts'] })
      setIsDirty(false)
      onSave?.()
    },
  })

  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    setIsDirty(true)
  }, [])

  const handleSave = useCallback(() => {
    if (!prompt || !isDirty) return
    saveMutation.mutate()
  }, [prompt, isDirty, saveMutation])

  const handleReset = useCallback(() => {
    if (!prompt) return
    if (!confirm('Reset this prompt to its default? Your changes will be lost.')) return
    resetMutation.mutate()
  }, [prompt, resetMutation])

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  if (!prompt) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-900">
        <div className="text-center text-steel-dim">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" strokeWidth={1} />
          <p>Select a prompt to edit</p>
        </div>
      </div>
    )
  }

  const tokenCount = estimateTokens(content)
  const canReset = hasHardcodedDefault(prompt.nodeName)

  return (
    <div className="flex-1 flex flex-col bg-surface-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between">
        <div>
          <input
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value)
              setIsDirty(true)
            }}
            className="text-lg font-semibold text-steel bg-transparent border-none outline-none w-full"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              setIsDirty(true)
            }}
            placeholder="Description..."
            className="text-xs text-steel-dim bg-transparent border-none outline-none w-full mt-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-steel-dim font-mono">
            <Hash className="w-3 h-3" />
            <span>v{prompt.version}</span>
          </div>
          {canReset && (
            <button
              onClick={handleReset}
              disabled={resetMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-steel-dim hover:text-steel hover:bg-surface-700 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors',
              isDirty
                ? 'bg-copper text-white hover:bg-copper/80'
                : 'text-steel-dim bg-surface-700 cursor-not-allowed'
            )}
          >
            {saveMutation.isPending ? (
              <span className="animate-pulse">Saving...</span>
            ) : (
              <>
                <Save className="w-4 h-4" strokeWidth={1.5} />
                Save
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="px-4 py-2 border-b border-surface-700 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <span className="text-steel-dim">
            Category:{' '}
            <span className="text-steel font-medium capitalize">{prompt.category}</span>
          </span>
          {prompt.stage && (
            <span className="text-steel-dim">
              Stage: <span className="text-steel font-medium capitalize">{prompt.stage}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-steel-dim font-mono">~{tokenCount} tokens</span>
          {isDirty && <span className="text-yellow-400">Unsaved changes</span>}
          {saveMutation.isSuccess && !isDirty && (
            <span className="text-green-400 flex items-center gap-1">
              <Check className="w-3 h-3" />
              Saved
            </span>
          )}
        </div>
      </div>

      {/* Error display */}
      {(saveMutation.isError || resetMutation.isError) && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" strokeWidth={1.5} />
          {saveMutation.error?.message || resetMutation.error?.message}
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <textarea
          value={content}
          onChange={handleContentChange}
          className="w-full h-full p-4 bg-surface-900 text-steel font-mono text-sm resize-none outline-none border-none"
          placeholder="Enter system prompt..."
          spellCheck={false}
        />
      </div>
    </div>
  )
}
