/**
 * Admin Orchestrator Page
 *
 * Three-panel layout for editing orchestrator prompts, viewing the flow graph,
 * and configuring hooks.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, AlertCircle, GitBranch, Settings } from 'lucide-react'
import { clsx } from 'clsx'
import type { OrchestratorPrompt, OrchestratorEdge } from '@/db/schema'
import {
  PromptList,
  PromptEditor,
  FlowVisualization,
  HookConfiguration,
} from '@/components/admin/orchestrator'

type ViewMode = 'editor' | 'flow'

async function fetchPrompts(): Promise<{ prompts: OrchestratorPrompt[] }> {
  const response = await fetch('/api/admin/orchestrator/prompts')
  if (!response.ok) throw new Error('Failed to fetch prompts')
  return response.json()
}

async function fetchEdges(): Promise<{ edges: OrchestratorEdge[] }> {
  const response = await fetch('/api/admin/orchestrator/edges')
  if (!response.ok) throw new Error('Failed to fetch edges')
  return response.json()
}

export function AdminOrchestratorPage() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('editor')

  const promptsQuery = useQuery({
    queryKey: ['orchestrator-prompts'],
    queryFn: fetchPrompts,
  })

  const edgesQuery = useQuery({
    queryKey: ['orchestrator-edges'],
    queryFn: fetchEdges,
  })

  const prompts = promptsQuery.data?.prompts || []
  const edges = edgesQuery.data?.edges || []
  const selectedPrompt = prompts.find((p) => p.nodeName === selectedNode) || null

  const isLoading = promptsQuery.isLoading || edgesQuery.isLoading
  const error = promptsQuery.error || edgesQuery.error

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
            {error instanceof Error ? error.message : 'Failed to load orchestrator data'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-8 border-b border-surface-700">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold text-steel tracking-tight">
            ORCHESTRATOR EDITOR
          </h1>
          <span className="text-xs text-steel-dim font-mono">
            {prompts.length} prompts, {edges.length} edges
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('editor')}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 text-sm transition-colors',
              viewMode === 'editor'
                ? 'bg-copper/20 text-copper'
                : 'text-steel-dim hover:text-steel hover:bg-surface-700'
            )}
          >
            <Settings className="w-4 h-4" strokeWidth={1.5} />
            Editor
          </button>
          <button
            onClick={() => setViewMode('flow')}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 text-sm transition-colors',
              viewMode === 'flow'
                ? 'bg-copper/20 text-copper'
                : 'text-steel-dim hover:text-steel hover:bg-surface-700'
            )}
          >
            <GitBranch className="w-4 h-4" strokeWidth={1.5} />
            Flow
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Prompt list */}
        <div className="w-64 border-r border-surface-700 flex-shrink-0">
          <PromptList
            prompts={prompts}
            selectedNode={selectedNode}
            onSelect={setSelectedNode}
          />
        </div>

        {/* Center - Editor or Flow visualization */}
        <div className="flex-1 flex flex-col min-w-0">
          {viewMode === 'editor' ? (
            <PromptEditor
              prompt={selectedPrompt}
              onSave={() => promptsQuery.refetch()}
            />
          ) : (
            <FlowVisualization
              prompts={prompts}
              edges={edges}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
            />
          )}
        </div>

        {/* Right sidebar - Hooks configuration */}
        <div className="w-72 border-l border-surface-700 flex-shrink-0">
          <HookConfiguration nodeName={selectedNode} />
        </div>
      </div>
    </div>
  )
}
