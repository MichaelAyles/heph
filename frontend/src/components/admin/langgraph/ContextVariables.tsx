/**
 * ContextVariables - View and test available template variables
 *
 * Shows all available @variables with their current values,
 * with a project selector for project-specific variables.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  FolderOpen,
  Loader2,
  AlertCircle,
  RefreshCw,
  Image,
} from 'lucide-react'
import { clsx } from 'clsx'

interface Project {
  id: string
  name: string
  status: string
  createdAt: string
}

interface Variable {
  name: string
  description: string
  value: unknown
  type: 'string' | 'object' | 'array'
  requiresProject: boolean
  tokenEstimate: number
  imageUrl?: string
}

interface ContextResponse {
  context: {
    availableBlocks: Array<{
      slug: string
      name: string
      category: string
      description: string
      interfaces: string[]
    }>
    projectState?: {
      status: string
      spec: Record<string, unknown> | null
    }
  }
  variables: Variable[]
  projectId: string | null
}

export function ContextVariables() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [expandedVars, setExpandedVars] = useState<Set<string>>(new Set())
  const [copiedVar, setCopiedVar] = useState<string | null>(null)

  // Fetch projects for selector
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['admin-projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects?limit=50')
      if (!res.ok) throw new Error('Failed to fetch projects')
      return res.json() as Promise<{ projects: Project[] }>
    },
  })

  // Fetch context variables
  const {
    data: contextData,
    isLoading: contextLoading,
    refetch: refetchContext,
  } = useQuery({
    queryKey: ['admin-langgraph-context', selectedProjectId],
    queryFn: async () => {
      const url = selectedProjectId
        ? `/api/admin/langgraph/context?projectId=${selectedProjectId}`
        : '/api/admin/langgraph/context'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch context')
      return res.json() as Promise<ContextResponse>
    },
  })

  const toggleExpand = (varName: string) => {
    setExpandedVars((prev) => {
      const next = new Set(prev)
      if (next.has(varName)) {
        next.delete(varName)
      } else {
        next.add(varName)
      }
      return next
    })
  }

  const copyToClipboard = async (text: string, varName: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedVar(varName)
    setTimeout(() => setCopiedVar(null), 2000)
  }

  const formatValue = (value: unknown, type: string): string => {
    if (value === null || value === undefined) return '(not available)'
    if (type === 'string') return String(value)
    if (type === 'array' && Array.isArray(value)) {
      if (value.length === 0) return '(empty list)'
      return value
        .map((item) => `- ${typeof item === 'object' ? JSON.stringify(item) : item}`)
        .join('\n')
    }
    return JSON.stringify(value, null, 2)
  }

  const selectedProject = projectsData?.projects.find((p) => p.id === selectedProjectId)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-steel">Template Variables</h2>
          <p className="text-xs text-steel-dim mt-1">
            View and test available @variables for system prompts. Select a project to see
            project-specific values.
          </p>
        </div>
        <button
          onClick={() => refetchContext()}
          className="flex items-center gap-1 px-2 py-1 rounded bg-surface-700 text-steel-dim hover:text-steel hover:bg-surface-600 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          <span className="text-xs">Refresh</span>
        </button>
      </div>

      {/* Project Selector */}
      <div className="bg-surface-800 border border-surface-700 rounded-lg p-4">
        <label className="block text-xs font-medium text-steel-dim mb-2">
          <FolderOpen className="w-3 h-3 inline mr-1" />
          Project Context
        </label>
        <select
          value={selectedProjectId || ''}
          onChange={(e) => setSelectedProjectId(e.target.value || null)}
          className="w-full bg-surface-900 border border-surface-600 rounded px-3 py-2 text-sm text-steel focus:outline-none focus:border-copper"
          disabled={projectsLoading}
        >
          <option value="">No project (global variables only)</option>
          {projectsData?.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name} ({project.status})
            </option>
          ))}
        </select>
        {selectedProject && (
          <div className="mt-2 text-xs text-steel-dim">
            Status: <span className="text-copper">{selectedProject.status}</span>
          </div>
        )}
      </div>

      {/* Variables List */}
      {contextLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-steel-dim" />
        </div>
      ) : contextData?.variables ? (
        <div className="space-y-2">
          {contextData.variables.map((variable) => {
            const isExpanded = expandedVars.has(variable.name)
            const hasValue = variable.value !== null && variable.value !== undefined
            const formattedValue = formatValue(variable.value, variable.type)
            const isLongValue = formattedValue.length > 100 || formattedValue.includes('\n')

            return (
              <div
                key={variable.name}
                className={clsx(
                  'border rounded-lg overflow-hidden',
                  hasValue ? 'border-surface-700' : 'border-surface-700/50'
                )}
              >
                {/* Variable Header */}
                <div
                  className={clsx(
                    'flex items-center justify-between px-3 py-2',
                    hasValue ? 'bg-surface-800' : 'bg-surface-800/50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {isLongValue && hasValue ? (
                      <button
                        onClick={() => toggleExpand(variable.name)}
                        className="text-steel-dim hover:text-steel"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                    ) : (
                      <div className="w-4" />
                    )}
                    <code
                      className={clsx(
                        'text-sm font-mono',
                        hasValue ? 'text-emerald-400' : 'text-steel-dim'
                      )}
                    >
                      {variable.name}
                    </code>
                    {variable.requiresProject && !selectedProjectId && (
                      <span className="text-xs text-amber-400/70 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        requires project
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-steel-dim">{variable.type}</span>
                    <span className="text-xs text-copper">~{variable.tokenEstimate} tokens</span>
                    {variable.imageUrl && (
                      <span className="text-xs text-purple-400 flex items-center gap-1">
                        <Image className="w-3 h-3" />
                        image
                      </span>
                    )}
                    {hasValue && (
                      <button
                        onClick={() => copyToClipboard(variable.name, variable.name)}
                        className="p-1 rounded hover:bg-surface-700 text-steel-dim hover:text-steel transition-colors"
                        title="Copy variable name"
                      >
                        {copiedVar === variable.name ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Variable Description */}
                <div className="px-3 py-1 text-xs text-steel-dim border-b border-surface-700/50">
                  {variable.description}
                </div>

                {/* Variable Value */}
                {(isExpanded || !isLongValue) && (
                  <div className="p-3 bg-surface-900/50">
                    {/* Image Preview for @image: variables */}
                    {variable.imageUrl && (
                      <div className="mb-3">
                        <img
                          src={variable.imageUrl}
                          alt={`Preview for ${variable.name}`}
                          className="max-w-48 max-h-48 rounded border border-surface-700 object-contain bg-surface-800"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      </div>
                    )}
                    {hasValue ? (
                      <pre
                        className={clsx(
                          'text-xs font-mono whitespace-pre-wrap text-steel-dim',
                          isLongValue && 'max-h-64 overflow-y-auto'
                        )}
                      >
                        {formattedValue}
                      </pre>
                    ) : (
                      <span className="text-xs text-steel-dim italic">(not available)</span>
                    )}
                  </div>
                )}

                {/* Collapsed indicator */}
                {!isExpanded && isLongValue && hasValue && (
                  <button
                    onClick={() => toggleExpand(variable.name)}
                    className="w-full px-3 py-1 text-xs text-steel-dim hover:text-steel hover:bg-surface-800/50 text-left"
                  >
                    Click to expand ({formattedValue.split('\n').length} lines)
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-steel-dim">No variables available</div>
      )}

      {/* Usage Hint */}
      <div className="bg-surface-800/50 border border-surface-700 rounded-lg p-4">
        <h3 className="text-xs font-medium text-steel mb-2">Usage</h3>
        <p className="text-xs text-steel-dim">
          Use these variables in system prompts by including them directly, e.g.:
        </p>
        <pre className="mt-2 p-2 bg-surface-900 rounded text-xs font-mono text-emerald-400">
          {`## Available Hardware
@availableBlocks

## Project Description
@feasibility.suggestedRevisions.revisedDescription`}
        </pre>
        <p className="text-xs text-steel-dim mt-2">
          Variables are expanded at invocation time with the actual values.
        </p>
      </div>
    </div>
  )
}
