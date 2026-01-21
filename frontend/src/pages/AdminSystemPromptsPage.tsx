/**
 * AdminSystemPromptsPage
 *
 * Admin UI for managing system prompts and hard rejection criteria.
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
// Components
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
    cadCapability: prompt.cadCapability ?? '',
    firmwareCapability: prompt.firmwareCapability ?? '',
  })

  const hasChanges =
    formData.name !== prompt.name ||
    formData.description !== (prompt.description ?? '') ||
    formData.capabilityAssessmentBase !== prompt.capabilityAssessmentBase ||
    formData.designConstraints !== (prompt.designConstraints ?? '') ||
    formData.cadCapability !== (prompt.cadCapability ?? '') ||
    formData.firmwareCapability !== (prompt.firmwareCapability ?? '')

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4"
      >
        <div className="flex items-center gap-3">
          {prompt.isActive ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <div className="h-5 w-5 rounded-full border border-zinc-600" />
          )}
          <div className="text-left">
            <div className="font-medium text-zinc-100">{prompt.name}</div>
            <div className="text-sm text-zinc-500">
              v{prompt.version} • {prompt.isActive ? 'Active' : 'Inactive'}
            </div>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-zinc-500" />
        ) : (
          <ChevronDown className="h-5 w-5 text-zinc-500" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-zinc-700 p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Description
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
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
              className="w-full rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Design Constraints
            </label>
            <textarea
              value={formData.designConstraints}
              onChange={(e) =>
                setFormData({ ...formData, designConstraints: e.target.value })
              }
              rows={4}
              className="w-full rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 font-mono"
            />
          </div>

          <div className="flex justify-between pt-2">
            {!prompt.isActive && (
              <button
                onClick={() => onSave({ isActive: true })}
                disabled={isSaving}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
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
                  cadCapability: formData.cadCapability || null,
                  firmwareCapability: formData.firmwareCapability || null,
                })
              }
              disabled={!hasChanges || isSaving}
              className="ml-auto flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
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

function CriteriaRow({
  criterion,
  onUpdate,
  onDelete,
}: {
  criterion: HardRejectionCriteria
  onUpdate: (data: Partial<HardRejectionCriteria>) => void
  onDelete: () => void
}) {
  const categoryColors = {
    safety: 'bg-red-500/20 text-red-400',
    capability: 'bg-yellow-500/20 text-yellow-400',
    legal: 'bg-purple-500/20 text-purple-400',
  }

  return (
    <tr className="border-b border-zinc-700">
      <td className="px-4 py-3">
        <code className="text-sm text-zinc-300 bg-zinc-700 px-2 py-1 rounded">
          {criterion.pattern}
        </code>
      </td>
      <td className="px-4 py-3 text-sm text-zinc-300">{criterion.reason}</td>
      <td className="px-4 py-3">
        <span
          className={clsx(
            'inline-block rounded px-2 py-0.5 text-xs font-medium',
            categoryColors[criterion.category]
          )}
        >
          {criterion.category}
        </span>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onUpdate({ isActive: !criterion.isActive })}
          className={clsx(
            'rounded px-2 py-1 text-xs',
            criterion.isActive
              ? 'bg-green-500/20 text-green-400'
              : 'bg-zinc-600 text-zinc-400'
          )}
        >
          {criterion.isActive ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td className="px-4 py-3">
        <button
          onClick={onDelete}
          className="p-1 text-zinc-500 hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  )
}

// =============================================================================
// Main Page
// =============================================================================

export function AdminSystemPromptsPage() {
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
  const { data: promptsData, isLoading: promptsLoading } = useQuery({
    queryKey: ['admin-system-prompts'],
    queryFn: fetchPrompts,
  })

  const { data: criteriaData, isLoading: criteriaLoading } = useQuery({
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

  const isLoading = promptsLoading || criteriaLoading

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-100 mb-6">
        System Prompts & Rejection Criteria
      </h1>

      {isLoading ? (
        <div className="text-zinc-500">Loading...</div>
      ) : (
        <div className="space-y-8">
          {/* System Prompts */}
          <section>
            <h2 className="text-lg font-semibold text-zinc-200 mb-4">
              System Prompts
            </h2>
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
            </div>
          </section>

          {/* Hard Rejection Criteria */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zinc-200">
                Hard Rejection Criteria
              </h2>
              <button
                onClick={() => setShowNewCriterion(!showNewCriterion)}
                className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
              >
                <Plus className="h-4 w-4" />
                Add Criterion
              </button>
            </div>

            {/* New criterion form */}
            {showNewCriterion && (
              <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-800 p-4">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">
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
                      className="w-full rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">
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
                      placeholder="Harmful device designs are prohibited"
                      className="w-full rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">
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
                      className="w-full rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-zinc-100"
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
                    className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200"
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
                    disabled={!newCriterion.pattern || !newCriterion.reason}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
                  >
                    Create
                  </button>
                </div>
              </div>
            )}

            {/* Criteria table */}
            <div className="rounded-lg border border-zinc-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-zinc-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">
                      Pattern
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">
                      Reason
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">
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
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
