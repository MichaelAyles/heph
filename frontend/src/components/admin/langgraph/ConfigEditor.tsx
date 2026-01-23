/**
 * ConfigEditor - Platform configuration for system prompts and rejection criteria
 *
 * Manages:
 * - System prompts (capability assessment base)
 * - Hard rejection criteria (regex patterns)
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Save,
  Trash2,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Shield,
  AlertTriangle,
  Scale,
} from 'lucide-react'
import { clsx } from 'clsx'

// =============================================================================
// Types
// =============================================================================

interface SystemPrompt {
  id: number
  name: string
  description: string | null
  capabilityAssessmentBase: string
  designConstraints: string | null
  cadCapability: string | null
  firmwareCapability: string | null
  isActive: boolean
  version: number
  createdAt: string
  updatedAt: string
}

interface HardRejectionCriteria {
  id: number
  pattern: string
  reason: string
  category: 'safety' | 'capability' | 'legal'
  isActive: boolean
  createdAt: string
}

// =============================================================================
// API Functions
// =============================================================================

async function fetchPrompts(): Promise<{ prompts: SystemPrompt[] }> {
  const res = await fetch('/api/admin/system-prompts')
  if (!res.ok) throw new Error('Failed to fetch prompts')
  return res.json()
}

async function updatePrompt(
  id: number,
  data: Partial<SystemPrompt>
): Promise<{ prompt: SystemPrompt }> {
  const res = await fetch(`/api/admin/system-prompts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update prompt')
  return res.json()
}

async function fetchCriteria(): Promise<{ criteria: HardRejectionCriteria[] }> {
  const res = await fetch('/api/admin/system-prompts/criteria')
  if (!res.ok) throw new Error('Failed to fetch criteria')
  return res.json()
}

async function createCriterion(
  data: Omit<HardRejectionCriteria, 'id' | 'createdAt'>
): Promise<{ criterion: HardRejectionCriteria }> {
  const res = await fetch('/api/admin/system-prompts/criteria', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create criterion')
  return res.json()
}

async function updateCriterion(
  id: number,
  data: Partial<HardRejectionCriteria>
): Promise<{ criterion: HardRejectionCriteria }> {
  const res = await fetch(`/api/admin/system-prompts/criteria/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update criterion')
  return res.json()
}

async function deleteCriterion(id: number): Promise<void> {
  const res = await fetch(`/api/admin/system-prompts/criteria/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete criterion')
}

// =============================================================================
// Sub-Components
// =============================================================================

function PromptEditor({
  prompt,
  onSave,
  isSaving,
}: {
  prompt: SystemPrompt
  onSave: (data: Partial<SystemPrompt>) => void
  isSaving: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(prompt.isActive)
  const [formData, setFormData] = useState({
    name: prompt.name,
    description: prompt.description ?? '',
    capabilityAssessmentBase: prompt.capabilityAssessmentBase,
    designConstraints: prompt.designConstraints ?? '',
  })

  const hasChanges =
    formData.name !== prompt.name ||
    formData.description !== (prompt.description ?? '') ||
    formData.capabilityAssessmentBase !== prompt.capabilityAssessmentBase ||
    formData.designConstraints !== (prompt.designConstraints ?? '')

  return (
    <div className="rounded-lg border border-surface-700 bg-surface-800">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4"
      >
        <div className="flex items-center gap-3">
          {prompt.isActive ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <div className="h-5 w-5 rounded-full border border-surface-600" />
          )}
          <div className="text-left">
            <div className="font-medium text-steel">{prompt.name}</div>
            <div className="text-sm text-steel-dim">
              v{prompt.version} {prompt.isActive ? '(Active)' : ''}
            </div>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-steel-dim" />
        ) : (
          <ChevronDown className="h-5 w-5 text-steel-dim" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-surface-700 p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-steel-dim mb-1">
              Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full rounded border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-steel focus:outline-none focus:border-copper"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-steel-dim mb-1">
              Capability Assessment Base
            </label>
            <textarea
              value={formData.capabilityAssessmentBase}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  capabilityAssessmentBase: e.target.value,
                })
              }
              rows={10}
              className="w-full rounded border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-steel font-mono focus:outline-none focus:border-copper"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-steel-dim mb-1">
              Design Constraints
            </label>
            <textarea
              value={formData.designConstraints}
              onChange={(e) =>
                setFormData({ ...formData, designConstraints: e.target.value })
              }
              rows={4}
              className="w-full rounded border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-steel font-mono focus:outline-none focus:border-copper"
            />
          </div>

          <div className="flex justify-between pt-2">
            {!prompt.isActive && (
              <button
                onClick={() => onSave({ isActive: true })}
                disabled={isSaving}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
              >
                Set as Active
              </button>
            )}
            <button
              onClick={() =>
                onSave({
                  name: formData.name,
                  description: formData.description || null,
                  capabilityAssessmentBase: formData.capabilityAssessmentBase,
                  designConstraints: formData.designConstraints || null,
                })
              }
              disabled={!hasChanges || isSaving}
              className="ml-auto flex items-center gap-2 rounded bg-copper px-4 py-2 text-sm font-medium text-surface-900 hover:bg-copper/90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save Changes
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const CATEGORY_CONFIG = {
  safety: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/20' },
  capability: { icon: Shield, color: 'text-amber-400', bg: 'bg-amber-500/20' },
  legal: { icon: Scale, color: 'text-purple-400', bg: 'bg-purple-500/20' },
}

function CriteriaRow({
  criterion,
  onUpdate,
  onDelete,
}: {
  criterion: HardRejectionCriteria
  onUpdate: (data: Partial<HardRejectionCriteria>) => void
  onDelete: () => void
}) {
  const config = CATEGORY_CONFIG[criterion.category]
  const Icon = config.icon

  return (
    <tr className="border-b border-surface-700 hover:bg-surface-800/50">
      <td className="px-4 py-3">
        <code className="text-sm text-steel bg-surface-700 px-2 py-1 rounded font-mono">
          {criterion.pattern}
        </code>
      </td>
      <td className="px-4 py-3 text-sm text-steel-dim">{criterion.reason}</td>
      <td className="px-4 py-3">
        <span
          className={clsx(
            'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium',
            config.bg,
            config.color
          )}
        >
          <Icon className="w-3 h-3" />
          {criterion.category}
        </span>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onUpdate({ isActive: !criterion.isActive })}
          className={clsx(
            'rounded px-2 py-1 text-xs transition-colors',
            criterion.isActive
              ? 'bg-green-500/20 text-green-400'
              : 'bg-surface-600 text-steel-dim'
          )}
        >
          {criterion.isActive ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={onDelete}
          className="p-1 text-steel-dim hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function ConfigEditor() {
  const queryClient = useQueryClient()
  const [showNewCriterion, setShowNewCriterion] = useState(false)
  const [newCriterion, setNewCriterion] = useState<{
    pattern: string
    reason: string
    category: 'safety' | 'capability' | 'legal'
  }>({
    pattern: '',
    reason: '',
    category: 'capability',
  })

  // Queries
  const { data: promptsData, isLoading: promptsLoading, error: promptsError } = useQuery({
    queryKey: ['admin-system-prompts'],
    queryFn: fetchPrompts,
  })

  const { data: criteriaData, isLoading: criteriaLoading, error: criteriaError } = useQuery({
    queryKey: ['admin-rejection-criteria'],
    queryFn: fetchCriteria,
  })

  // Mutations
  const updatePromptMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SystemPrompt> }) =>
      updatePrompt(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-system-prompts'] })
    },
  })

  const createCriterionMutation = useMutation({
    mutationFn: createCriterion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rejection-criteria'] })
      setShowNewCriterion(false)
      setNewCriterion({ pattern: '', reason: '', category: 'capability' })
    },
  })

  const updateCriterionMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number
      data: Partial<HardRejectionCriteria>
    }) => updateCriterion(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rejection-criteria'] })
    },
  })

  const deleteCriterionMutation = useMutation({
    mutationFn: deleteCriterion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rejection-criteria'] })
    },
  })

  if (promptsLoading || criteriaLoading) {
    return <div className="text-steel-dim text-sm">Loading configuration...</div>
  }

  if (promptsError || criteriaError) {
    return (
      <div className="text-red-400 text-sm">
        Failed to load configuration: {promptsError?.message || criteriaError?.message}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* System Prompts */}
      <section>
        <h3 className="text-sm font-medium text-steel mb-3">
          System Prompts
        </h3>
        <p className="text-xs text-steel-dim mb-4">
          Define what PHAESTUS can build. The active prompt is used for capability assessment.
        </p>
        <div className="space-y-3">
          {promptsData?.prompts.map((prompt) => (
            <PromptEditor
              key={prompt.id}
              prompt={prompt}
              onSave={(data) =>
                updatePromptMutation.mutate({ id: prompt.id, data })
              }
              isSaving={updatePromptMutation.isPending}
            />
          ))}
          {promptsData?.prompts.length === 0 && (
            <p className="text-sm text-steel-dim py-4 text-center">
              No system prompts defined.
            </p>
          )}
        </div>
      </section>

      {/* Hard Rejection Criteria */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-medium text-steel">
              Hard Rejection Criteria
            </h3>
            <p className="text-xs text-steel-dim mt-1">
              Regex patterns for instant rejection without LLM call.
            </p>
          </div>
          <button
            onClick={() => setShowNewCriterion(!showNewCriterion)}
            className={clsx(
              'flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors',
              showNewCriterion
                ? 'bg-surface-700 text-steel'
                : 'bg-copper text-surface-900 hover:bg-copper/90'
            )}
          >
            <Plus className="h-4 w-4" />
            {showNewCriterion ? 'Cancel' : 'Add Pattern'}
          </button>
        </div>

        {/* New criterion form */}
        {showNewCriterion && (
          <div className="mb-4 rounded-lg border border-surface-700 bg-surface-800 p-4">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-steel-dim mb-1">
                  Regex Pattern
                </label>
                <input
                  type="text"
                  value={newCriterion.pattern}
                  onChange={(e) =>
                    setNewCriterion({
                      ...newCriterion,
                      pattern: e.target.value,
                    })
                  }
                  placeholder="weapon|explosive"
                  className="w-full rounded border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-steel font-mono focus:outline-none focus:border-copper"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-steel-dim mb-1">
                  Reason
                </label>
                <input
                  type="text"
                  value={newCriterion.reason}
                  onChange={(e) =>
                    setNewCriterion({
                      ...newCriterion,
                      reason: e.target.value,
                    })
                  }
                  placeholder="Harmful devices are prohibited"
                  className="w-full rounded border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-steel focus:outline-none focus:border-copper"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-steel-dim mb-1">
                  Category
                </label>
                <select
                  value={newCriterion.category}
                  onChange={(e) =>
                    setNewCriterion({
                      ...newCriterion,
                      category: e.target.value as 'safety' | 'capability' | 'legal',
                    })
                  }
                  className="w-full rounded border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-steel focus:outline-none focus:border-copper"
                >
                  <option value="safety">Safety</option>
                  <option value="capability">Capability</option>
                  <option value="legal">Legal</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewCriterion(false)}
                className="rounded px-3 py-1.5 text-sm text-steel-dim hover:text-steel"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  createCriterionMutation.mutate({
                    ...newCriterion,
                    isActive: true,
                  })
                }
                disabled={!newCriterion.pattern || !newCriterion.reason || createCriterionMutation.isPending}
                className="rounded bg-copper px-3 py-1.5 text-sm font-medium text-surface-900 hover:bg-copper/90 disabled:opacity-50"
              >
                {createCriterionMutation.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        )}

        {/* Criteria table */}
        <div className="rounded-lg border border-surface-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-steel-dim">
                  Pattern
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-steel-dim">
                  Reason
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-steel-dim">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-steel-dim">
                  Status
                </th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {criteriaData?.criteria.map((criterion) => (
                <CriteriaRow
                  key={criterion.id}
                  criterion={criterion}
                  onUpdate={(data) =>
                    updateCriterionMutation.mutate({
                      id: criterion.id,
                      data,
                    })
                  }
                  onDelete={() =>
                    deleteCriterionMutation.mutate(criterion.id)
                  }
                />
              ))}
              {criteriaData?.criteria.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-steel-dim">
                    No rejection criteria defined.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
