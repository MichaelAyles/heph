/**
 * PromptEditor Component
 *
 * Monaco-based editor for editing orchestrator system prompts.
 * Supports enhanced fields: input/output schemas, context selectors, iteration config, and user prompt templates.
 */

import { useState, useEffect, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  Save,
  RotateCcw,
  AlertCircle,
  Check,
  Hash,
  FileText,
  Settings2,
  Code,
  List,
  RefreshCw,
  FileCode,
  Play,
} from 'lucide-react'
import type { OrchestratorPrompt } from '@/db/schema'
import { hasHardcodedDefault } from '@/services/prompt-loader'
import { NodeTestRunner } from './NodeTestRunner'

interface PromptEditorProps {
  prompt: OrchestratorPrompt | null
  onSave?: () => void
}

type EditorTab = 'system' | 'user' | 'input' | 'output' | 'context' | 'iteration'

async function updatePrompt(
  nodeName: string,
  data: Partial<OrchestratorPrompt>
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

function safeJsonStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return ''
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return ''
  }
}

export function PromptEditor({ prompt, onSave }: PromptEditorProps) {
  const [activeTab, setActiveTab] = useState<EditorTab>('system')
  const [isDirty, setIsDirty] = useState(false)
  const [showTestRunner, setShowTestRunner] = useState(false)
  const queryClient = useQueryClient()

  // Form state
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [userPromptTemplate, setUserPromptTemplate] = useState('')
  const [inputSchema, setInputSchema] = useState('')
  const [outputSchema, setOutputSchema] = useState('')
  const [contextSelector, setContextSelector] = useState('')
  const [iterationConfig, setIterationConfig] = useState('')
  const [outputFormat, setOutputFormat] = useState<'json' | 'code' | 'text' | 'image_prompt'>('json')

  // Reset state when prompt changes - syncing external prop to internal state is valid
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (prompt) {
      setDisplayName(prompt.displayName)
      setDescription(prompt.description || '')
      setSystemPrompt(prompt.systemPrompt)
      setUserPromptTemplate(prompt.userPromptTemplate || '')
      setInputSchema(safeJsonStringify(prompt.inputSchema))
      setOutputSchema(safeJsonStringify(prompt.outputSchema))
      setContextSelector(prompt.contextSelector ? JSON.stringify(prompt.contextSelector, null, 2) : '[]')
      setIterationConfig(safeJsonStringify(prompt.iterationConfig))
      setOutputFormat(prompt.outputFormat || 'json')
      setIsDirty(false)
    }
  }, [prompt])
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: () => {
      const data: Partial<OrchestratorPrompt> = {
        displayName,
        description: description || undefined,
        systemPrompt,
        userPromptTemplate: userPromptTemplate || undefined,
        outputFormat,
      }

      // Parse JSON fields if valid
      if (inputSchema.trim()) {
        try {
          data.inputSchema = JSON.parse(inputSchema)
        } catch {
          throw new Error('Invalid JSON in Input Schema')
        }
      } else {
        data.inputSchema = null
      }

      if (outputSchema.trim()) {
        try {
          data.outputSchema = JSON.parse(outputSchema)
        } catch {
          throw new Error('Invalid JSON in Output Schema')
        }
      } else {
        data.outputSchema = null
      }

      if (contextSelector.trim()) {
        try {
          data.contextSelector = JSON.parse(contextSelector)
        } catch {
          throw new Error('Invalid JSON in Context Selector')
        }
      } else {
        data.contextSelector = null
      }

      if (iterationConfig.trim()) {
        try {
          data.iterationConfig = JSON.parse(iterationConfig)
        } catch {
          throw new Error('Invalid JSON in Iteration Config')
        }
      } else {
        data.iterationConfig = null
      }

      return updatePrompt(prompt!.nodeName, data)
    },
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

  // Mark dirty on any field change
  const markDirty = useCallback(() => setIsDirty(true), [])

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

  const tokenCount = estimateTokens(systemPrompt)
  const canReset = hasHardcodedDefault(prompt.nodeName)

  const tabs: { id: EditorTab; label: string; icon: React.ReactNode }[] = [
    { id: 'system', label: 'System', icon: <FileText className="w-4 h-4" /> },
    { id: 'user', label: 'User Template', icon: <FileCode className="w-4 h-4" /> },
    { id: 'input', label: 'Input Schema', icon: <Code className="w-4 h-4" /> },
    { id: 'output', label: 'Output Schema', icon: <Code className="w-4 h-4" /> },
    { id: 'context', label: 'Context', icon: <List className="w-4 h-4" /> },
    { id: 'iteration', label: 'Iteration', icon: <RefreshCw className="w-4 h-4" /> },
  ]

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
              markDirty()
            }}
            className="text-lg font-semibold text-steel bg-transparent border-none outline-none w-full"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              markDirty()
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
            onClick={() => setShowTestRunner(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-steel-dim hover:text-steel hover:bg-surface-700 transition-colors"
          >
            <Play className="w-4 h-4" strokeWidth={1.5} />
            Test
          </button>
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

      {/* Tab bar */}
      <div className="px-4 border-b border-surface-700 flex items-center gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-copper text-copper'
                : 'border-transparent text-steel-dim hover:text-steel'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs text-steel-dim py-2">
          <Settings2 className="w-3 h-3" />
          <select
            value={outputFormat}
            onChange={(e) => {
              setOutputFormat(e.target.value as typeof outputFormat)
              markDirty()
            }}
            className="bg-surface-800 border border-surface-600 rounded px-2 py-1 text-steel text-xs"
          >
            <option value="json">JSON</option>
            <option value="code">Code</option>
            <option value="text">Text</option>
            <option value="image_prompt">Image Prompt</option>
          </select>
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

      {/* Editor content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'system' && (
          <textarea
            value={systemPrompt}
            onChange={(e) => {
              setSystemPrompt(e.target.value)
              markDirty()
            }}
            className="w-full h-full p-4 bg-surface-900 text-steel font-mono text-sm resize-none outline-none border-none"
            placeholder="Enter system prompt..."
            spellCheck={false}
          />
        )}

        {activeTab === 'user' && (
          <div className="h-full flex flex-col">
            <div className="px-4 py-2 text-xs text-steel-dim bg-surface-800 border-b border-surface-700">
              User prompt template with {'{{variable}}'} placeholders. Supports:
              {'{{#if condition}}...{{/if}}'} and {'{{#each array}}...{{/each}}'}
            </div>
            <textarea
              value={userPromptTemplate}
              onChange={(e) => {
                setUserPromptTemplate(e.target.value)
                markDirty()
              }}
              className="flex-1 w-full p-4 bg-surface-900 text-steel font-mono text-sm resize-none outline-none border-none"
              placeholder="User prompt template with {{variable}} placeholders..."
              spellCheck={false}
            />
          </div>
        )}

        {activeTab === 'input' && (
          <div className="h-full flex flex-col">
            <div className="px-4 py-2 text-xs text-steel-dim bg-surface-800 border-b border-surface-700">
              JSON Schema for validating input to this prompt. Used for type checking and documentation.
            </div>
            <textarea
              value={inputSchema}
              onChange={(e) => {
                setInputSchema(e.target.value)
                markDirty()
              }}
              className="flex-1 w-full p-4 bg-surface-900 text-steel font-mono text-sm resize-none outline-none border-none"
              placeholder='{"type": "object", "properties": {...}, "required": [...]}'
              spellCheck={false}
            />
          </div>
        )}

        {activeTab === 'output' && (
          <div className="h-full flex flex-col">
            <div className="px-4 py-2 text-xs text-steel-dim bg-surface-800 border-b border-surface-700">
              JSON Schema for validating LLM output. Used for runtime validation.
            </div>
            <textarea
              value={outputSchema}
              onChange={(e) => {
                setOutputSchema(e.target.value)
                markDirty()
              }}
              className="flex-1 w-full p-4 bg-surface-900 text-steel font-mono text-sm resize-none outline-none border-none"
              placeholder='{"type": "object", "properties": {...}, "required": [...]}'
              spellCheck={false}
            />
          </div>
        )}

        {activeTab === 'context' && (
          <div className="h-full flex flex-col">
            <div className="px-4 py-2 text-xs text-steel-dim bg-surface-800 border-b border-surface-700">
              Context selector patterns. Examples: ["*"], ["description", "feasibility"],
              ["decisions[*].answer"], ["!orchestratorState"]
            </div>
            <textarea
              value={contextSelector}
              onChange={(e) => {
                setContextSelector(e.target.value)
                markDirty()
              }}
              className="flex-1 w-full p-4 bg-surface-900 text-steel font-mono text-sm resize-none outline-none border-none"
              placeholder='["description", "feasibility", "decisions"]'
              spellCheck={false}
            />
          </div>
        )}

        {activeTab === 'iteration' && (
          <div className="h-full flex flex-col">
            <div className="px-4 py-2 text-xs text-steel-dim bg-surface-800 border-b border-surface-700">
              Iteration configuration for generate→review→fix loops. Set maxAttempts and exit conditions.
            </div>
            <textarea
              value={iterationConfig}
              onChange={(e) => {
                setIterationConfig(e.target.value)
                markDirty()
              }}
              className="flex-1 w-full p-4 bg-surface-900 text-steel font-mono text-sm resize-none outline-none border-none"
              placeholder='{"maxAttempts": 3, "exitCondition": "score >= 85", "exitThreshold": 85}'
              spellCheck={false}
            />
          </div>
        )}
      </div>

      {/* Test Runner Modal */}
      {showTestRunner && prompt && (
        <NodeTestRunner prompt={prompt} onClose={() => setShowTestRunner(false)} />
      )}
    </div>
  )
}
