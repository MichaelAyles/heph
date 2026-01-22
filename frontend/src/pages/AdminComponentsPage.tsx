import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Loader2,
  Plus,
  Search,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Package,
  FileCode2,
  X,
  Check,
} from 'lucide-react'
import { clsx } from 'clsx'
import {
  fetchComponents,
  fetchPatterns,
  createComponent,
  updateComponent,
  deleteComponent,
  createPattern,
  updatePattern,
  deletePattern,
  type JlcpcbComponent,
  type FootprintPattern,
} from '@/services/jlcpcb-components'

// =============================================================================
// Main Page Component
// =============================================================================

export function AdminComponentsPage() {
  const [search, setSearch] = useState('')
  const [showPatterns, setShowPatterns] = useState(false)
  const [isAddComponentOpen, setIsAddComponentOpen] = useState(false)
  const [isAddPatternOpen, setIsAddPatternOpen] = useState(false)
  const [editingComponent, setEditingComponent] = useState<string | null>(null)
  const [editingPattern, setEditingPattern] = useState<number | null>(null)
  const queryClient = useQueryClient()

  // Fetch components
  const { data: componentsData, isLoading: componentsLoading } = useQuery({
    queryKey: ['jlcpcb-components', search],
    queryFn: () => fetchComponents({ search, limit: 100 }),
  })

  // Fetch patterns
  const { data: patternsData, isLoading: patternsLoading } = useQuery({
    queryKey: ['jlcpcb-patterns'],
    queryFn: fetchPatterns,
  })

  // Delete component mutation
  const deleteComponentMutation = useMutation({
    mutationFn: deleteComponent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jlcpcb-components'] })
    },
  })

  // Delete pattern mutation
  const deletePatternMutation = useMutation({
    mutationFn: deletePattern,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jlcpcb-patterns'] })
    },
  })

  const components = componentsData?.components ?? []
  const patterns = patternsData?.patterns ?? []

  return (
    <div className="min-h-screen bg-ash p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/" className="p-2 hover:bg-surface-800 transition-colors">
              <ArrowLeft className="w-5 h-5 text-steel-dim" strokeWidth={1.5} />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-steel">JLCPCB Components</h1>
              <p className="text-steel-dim text-sm">Manage rotation offsets for pick-and-place assembly</p>
            </div>
          </div>
          <button
            onClick={() => setIsAddComponentOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-copper text-ash text-sm font-medium hover:bg-copper/90 transition-colors"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            Add Component
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-steel-dim" strokeWidth={1.5} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by LCSC part number, description, or footprint..."
            className="w-full pl-10 pr-4 py-2 bg-surface-800 border border-surface-700 text-steel placeholder:text-steel-dim focus:outline-none focus:border-copper"
          />
        </div>

        {/* Components Table */}
        <div className="bg-surface-900 border border-surface-700 mb-8">
          <div className="p-4 border-b border-surface-700 flex items-center justify-between">
            <h2 className="text-lg font-medium text-steel flex items-center gap-2">
              <Package className="w-5 h-5 text-copper" strokeWidth={1.5} />
              Components by LCSC Part Number
            </h2>
            <span className="text-sm text-steel-dim">{componentsData?.total ?? 0} total</span>
          </div>

          {componentsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-copper animate-spin" strokeWidth={1.5} />
            </div>
          ) : components.length === 0 ? (
            <div className="text-center py-12 text-steel-dim">
              {search ? 'No components match your search.' : 'No components yet. Add one to get started.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-700 text-left text-sm text-steel-dim">
                    <th className="px-4 py-3 font-medium">LCSC Part #</th>
                    <th className="px-4 py-3 font-medium">MPN</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Footprint</th>
                    <th className="px-4 py-3 font-medium text-center">Rotation</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map((component) => (
                    <ComponentRow
                      key={component.lcscPartNumber}
                      component={component}
                      isEditing={editingComponent === component.lcscPartNumber}
                      onEdit={() => setEditingComponent(component.lcscPartNumber)}
                      onCancelEdit={() => setEditingComponent(null)}
                      onDelete={() => {
                        if (confirm(`Delete component ${component.lcscPartNumber}?`)) {
                          deleteComponentMutation.mutate(component.lcscPartNumber)
                        }
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footprint Patterns Section */}
        <div className="bg-surface-900 border border-surface-700">
          <button
            onClick={() => setShowPatterns(!showPatterns)}
            className="w-full p-4 flex items-center justify-between hover:bg-surface-800 transition-colors"
          >
            <h2 className="text-lg font-medium text-steel flex items-center gap-2">
              <FileCode2 className="w-5 h-5 text-copper" strokeWidth={1.5} />
              Footprint Patterns (Fallback Rules)
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-steel-dim">{patterns.length} patterns</span>
              {showPatterns ? (
                <ChevronUp className="w-5 h-5 text-steel-dim" strokeWidth={1.5} />
              ) : (
                <ChevronDown className="w-5 h-5 text-steel-dim" strokeWidth={1.5} />
              )}
            </div>
          </button>

          {showPatterns && (
            <div className="border-t border-surface-700">
              <div className="p-4 border-b border-surface-700 flex items-center justify-between">
                <p className="text-sm text-steel-dim">
                  Patterns are matched when a component's LCSC part number is not found. Higher priority = matched first.
                </p>
                <button
                  onClick={() => setIsAddPatternOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-surface-700 text-steel text-sm hover:bg-surface-600 transition-colors"
                >
                  <Plus className="w-4 h-4" strokeWidth={1.5} />
                  Add Pattern
                </button>
              </div>

              {patternsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-copper animate-spin" strokeWidth={1.5} />
                </div>
              ) : patterns.length === 0 ? (
                <div className="text-center py-12 text-steel-dim">No patterns yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-surface-700 text-left text-sm text-steel-dim">
                        <th className="px-4 py-3 font-medium">Pattern (Regex)</th>
                        <th className="px-4 py-3 font-medium text-center">Priority</th>
                        <th className="px-4 py-3 font-medium text-center">Rotation</th>
                        <th className="px-4 py-3 font-medium">Comment</th>
                        <th className="px-4 py-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patterns.map((pattern) => (
                        <PatternRow
                          key={pattern.id}
                          pattern={pattern}
                          isEditing={editingPattern === pattern.id}
                          onEdit={() => setEditingPattern(pattern.id)}
                          onCancelEdit={() => setEditingPattern(null)}
                          onDelete={() => {
                            if (confirm(`Delete pattern "${pattern.pattern}"?`)) {
                              deletePatternMutation.mutate(pattern.id)
                            }
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Add Component Modal */}
        {isAddComponentOpen && (
          <AddComponentModal
            onClose={() => setIsAddComponentOpen(false)}
            onSuccess={() => {
              setIsAddComponentOpen(false)
              queryClient.invalidateQueries({ queryKey: ['jlcpcb-components'] })
            }}
          />
        )}

        {/* Add Pattern Modal */}
        {isAddPatternOpen && (
          <AddPatternModal
            onClose={() => setIsAddPatternOpen(false)}
            onSuccess={() => {
              setIsAddPatternOpen(false)
              queryClient.invalidateQueries({ queryKey: ['jlcpcb-patterns'] })
            }}
          />
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Component Row with Inline Editing
// =============================================================================

function ComponentRow({
  component,
  isEditing,
  onEdit,
  onCancelEdit,
  onDelete,
}: {
  component: JlcpcbComponent
  isEditing: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
}) {
  const [rotationOffset, setRotationOffset] = useState(component.rotationOffset)
  const [description, setDescription] = useState(component.description ?? '')
  const [footprint, setFootprint] = useState(component.footprint ?? '')
  const [mpn, setMpn] = useState(component.manufacturerPartNumber ?? '')
  const queryClient = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: (updates: Parameters<typeof updateComponent>[1]) =>
      updateComponent(component.lcscPartNumber, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jlcpcb-components'] })
      onCancelEdit()
    },
  })

  const handleSave = () => {
    updateMutation.mutate({
      rotationOffset,
      description: description || null,
      footprint: footprint || null,
      manufacturerPartNumber: mpn || null,
    })
  }

  if (isEditing) {
    return (
      <tr className="border-b border-surface-700 bg-surface-800">
        <td className="px-4 py-3">
          <span className="font-mono text-copper">{component.lcscPartNumber}</span>
        </td>
        <td className="px-4 py-3">
          <input
            type="text"
            value={mpn}
            onChange={(e) => setMpn(e.target.value)}
            className="w-full px-2 py-1 bg-surface-700 border border-surface-600 text-steel text-sm focus:outline-none focus:border-copper"
            placeholder="MPN"
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-2 py-1 bg-surface-700 border border-surface-600 text-steel text-sm focus:outline-none focus:border-copper"
            placeholder="Description"
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="text"
            value={footprint}
            onChange={(e) => setFootprint(e.target.value)}
            className="w-full px-2 py-1 bg-surface-700 border border-surface-600 text-steel text-sm focus:outline-none focus:border-copper"
            placeholder="Footprint"
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="number"
            value={rotationOffset}
            onChange={(e) => setRotationOffset(parseInt(e.target.value, 10) || 0)}
            className="w-20 px-2 py-1 bg-surface-700 border border-surface-600 text-steel text-sm text-center focus:outline-none focus:border-copper"
          />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="p-1.5 text-emerald-400 hover:bg-surface-700 transition-colors"
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <Check className="w-4 h-4" strokeWidth={1.5} />
              )}
            </button>
            <button
              onClick={onCancelEdit}
              className="p-1.5 text-steel-dim hover:text-steel hover:bg-surface-700 transition-colors"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-surface-700 hover:bg-surface-800/50 transition-colors">
      <td className="px-4 py-3">
        <span className="font-mono text-copper">{component.lcscPartNumber}</span>
      </td>
      <td className="px-4 py-3 text-steel-dim text-sm">{component.manufacturerPartNumber || '-'}</td>
      <td className="px-4 py-3 text-steel text-sm max-w-xs truncate">{component.description || '-'}</td>
      <td className="px-4 py-3 text-steel-dim text-sm font-mono">{component.footprint || '-'}</td>
      <td className="px-4 py-3 text-center">
        <span
          className={clsx(
            'inline-flex items-center gap-1 px-2 py-0.5 text-sm font-mono',
            component.rotationOffset === 0
              ? 'bg-surface-700 text-steel-dim'
              : component.rotationOffset > 0
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-amber-500/20 text-amber-400'
          )}
        >
          <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
          {component.rotationOffset > 0 ? '+' : ''}
          {component.rotationOffset}°
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onEdit}
            className="p-1.5 text-steel-dim hover:text-steel hover:bg-surface-700 transition-colors"
          >
            <Edit2 className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-steel-dim hover:text-red-400 hover:bg-surface-700 transition-colors"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// =============================================================================
// Pattern Row with Inline Editing
// =============================================================================

function PatternRow({
  pattern,
  isEditing,
  onEdit,
  onCancelEdit,
  onDelete,
}: {
  pattern: FootprintPattern
  isEditing: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
}) {
  const [patternValue, setPatternValue] = useState(pattern.pattern)
  const [priority, setPriority] = useState(pattern.priority)
  const [rotationOffset, setRotationOffset] = useState(pattern.rotationOffset)
  const [comment, setComment] = useState(pattern.comment ?? '')
  const queryClient = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: (updates: Parameters<typeof updatePattern>[1]) => updatePattern(pattern.id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jlcpcb-patterns'] })
      onCancelEdit()
    },
  })

  const handleSave = () => {
    updateMutation.mutate({
      pattern: patternValue,
      priority,
      rotationOffset,
      comment: comment || null,
    })
  }

  if (isEditing) {
    return (
      <tr className="border-b border-surface-700 bg-surface-800">
        <td className="px-4 py-3">
          <input
            type="text"
            value={patternValue}
            onChange={(e) => setPatternValue(e.target.value)}
            className="w-full px-2 py-1 bg-surface-700 border border-surface-600 text-steel text-sm font-mono focus:outline-none focus:border-copper"
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
            className="w-16 px-2 py-1 bg-surface-700 border border-surface-600 text-steel text-sm text-center focus:outline-none focus:border-copper"
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="number"
            value={rotationOffset}
            onChange={(e) => setRotationOffset(parseInt(e.target.value, 10) || 0)}
            className="w-20 px-2 py-1 bg-surface-700 border border-surface-600 text-steel text-sm text-center focus:outline-none focus:border-copper"
          />
        </td>
        <td className="px-4 py-3">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full px-2 py-1 bg-surface-700 border border-surface-600 text-steel text-sm focus:outline-none focus:border-copper"
            placeholder="Comment"
          />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="p-1.5 text-emerald-400 hover:bg-surface-700 transition-colors"
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <Check className="w-4 h-4" strokeWidth={1.5} />
              )}
            </button>
            <button
              onClick={onCancelEdit}
              className="p-1.5 text-steel-dim hover:text-steel hover:bg-surface-700 transition-colors"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-surface-700 hover:bg-surface-800/50 transition-colors">
      <td className="px-4 py-3">
        <code className="text-copper bg-surface-800 px-2 py-0.5">{pattern.pattern}</code>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-steel-dim">{pattern.priority}</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span
          className={clsx(
            'inline-flex items-center gap-1 px-2 py-0.5 text-sm font-mono',
            pattern.rotationOffset === 0
              ? 'bg-surface-700 text-steel-dim'
              : pattern.rotationOffset > 0
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-amber-500/20 text-amber-400'
          )}
        >
          <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
          {pattern.rotationOffset > 0 ? '+' : ''}
          {pattern.rotationOffset}°
        </span>
      </td>
      <td className="px-4 py-3 text-steel-dim text-sm">{pattern.comment || '-'}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onEdit}
            className="p-1.5 text-steel-dim hover:text-steel hover:bg-surface-700 transition-colors"
          >
            <Edit2 className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-steel-dim hover:text-red-400 hover:bg-surface-700 transition-colors"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// =============================================================================
// Add Component Modal
// =============================================================================

function AddComponentModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [lcsc, setLcsc] = useState('')
  const [mpn, setMpn] = useState('')
  const [description, setDescription] = useState('')
  const [footprint, setFootprint] = useState('')
  const [rotationOffset, setRotationOffset] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: createComponent,
    onSuccess: onSuccess,
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create component'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!lcsc.match(/^C\d+$/)) {
      setError('LCSC part number must start with C followed by numbers (e.g., C295747)')
      return
    }

    createMutation.mutate({
      lcscPartNumber: lcsc,
      manufacturerPartNumber: mpn || undefined,
      description: description || undefined,
      footprint: footprint || undefined,
      rotationOffset,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-surface-900 border border-surface-700 w-full max-w-md">
        <div className="p-4 border-b border-surface-700 flex items-center justify-between">
          <h2 className="text-lg font-medium text-steel">Add Component</h2>
          <button onClick={onClose} className="text-steel-dim hover:text-steel">
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-steel-dim mb-1">
              LCSC Part Number <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={lcsc}
              onChange={(e) => setLcsc(e.target.value.toUpperCase())}
              placeholder="C295747"
              className="w-full px-3 py-2 bg-surface-800 border border-surface-700 text-steel placeholder:text-steel-dim focus:outline-none focus:border-copper"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-steel-dim mb-1">Manufacturer Part Number</label>
            <input
              type="text"
              value={mpn}
              onChange={(e) => setMpn(e.target.value)}
              placeholder="S2B-PH-SM4-TB"
              className="w-full px-3 py-2 bg-surface-800 border border-surface-700 text-steel placeholder:text-steel-dim focus:outline-none focus:border-copper"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-steel-dim mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="2-pin JST-PH battery connector"
              className="w-full px-3 py-2 bg-surface-800 border border-surface-700 text-steel placeholder:text-steel-dim focus:outline-none focus:border-copper"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-steel-dim mb-1">Footprint</label>
            <input
              type="text"
              value={footprint}
              onChange={(e) => setFootprint(e.target.value)}
              placeholder="JST_PH_S2B-PH-SM4-TB"
              className="w-full px-3 py-2 bg-surface-800 border border-surface-700 text-steel placeholder:text-steel-dim focus:outline-none focus:border-copper"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-steel-dim mb-1">Rotation Offset (degrees)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={rotationOffset}
                onChange={(e) => setRotationOffset(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-700 text-steel focus:outline-none focus:border-copper"
              />
              <div className="flex gap-1">
                {[-180, -90, 0, 90, 180].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setRotationOffset(val)}
                    className={clsx(
                      'px-2 py-1 text-xs',
                      rotationOffset === val
                        ? 'bg-copper text-ash'
                        : 'bg-surface-700 text-steel-dim hover:text-steel'
                    )}
                  >
                    {val > 0 ? '+' : ''}
                    {val}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-steel-dim mt-1">
              Positive = counter-clockwise, Negative = clockwise
            </p>
          </div>

          {error && <div className="p-3 bg-red-500/20 border border-red-500/30 text-red-400 text-sm">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-steel-dim hover:text-steel text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-copper text-ash text-sm font-medium hover:bg-copper/90 transition-colors disabled:opacity-50"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Component
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// =============================================================================
// Add Pattern Modal
// =============================================================================

function AddPatternModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [pattern, setPattern] = useState('')
  const [priority, setPriority] = useState(50)
  const [rotationOffset, setRotationOffset] = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: createPattern,
    onSuccess: onSuccess,
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create pattern'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate regex
    try {
      new RegExp(pattern, 'i')
    } catch {
      setError('Invalid regex pattern')
      return
    }

    createMutation.mutate({
      pattern,
      priority,
      rotationOffset,
      comment: comment || undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-surface-900 border border-surface-700 w-full max-w-md">
        <div className="p-4 border-b border-surface-700 flex items-center justify-between">
          <h2 className="text-lg font-medium text-steel">Add Footprint Pattern</h2>
          <button onClick={onClose} className="text-steel-dim hover:text-steel">
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-steel-dim mb-1">
              Pattern (Regex) <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="JST.*PH"
              className="w-full px-3 py-2 bg-surface-800 border border-surface-700 text-steel font-mono placeholder:text-steel-dim focus:outline-none focus:border-copper"
              required
            />
            <p className="text-xs text-steel-dim mt-1">Case-insensitive regex to match footprint names</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-steel-dim mb-1">Priority</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 bg-surface-800 border border-surface-700 text-steel focus:outline-none focus:border-copper"
            />
            <p className="text-xs text-steel-dim mt-1">Higher priority patterns are matched first (0-100 typical)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-steel-dim mb-1">Rotation Offset (degrees)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={rotationOffset}
                onChange={(e) => setRotationOffset(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 bg-surface-800 border border-surface-700 text-steel focus:outline-none focus:border-copper"
              />
              <div className="flex gap-1">
                {[-180, -90, 0, 90, 180].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setRotationOffset(val)}
                    className={clsx(
                      'px-2 py-1 text-xs',
                      rotationOffset === val
                        ? 'bg-copper text-ash'
                        : 'bg-surface-700 text-steel-dim hover:text-steel'
                    )}
                  >
                    {val > 0 ? '+' : ''}
                    {val}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-steel-dim mb-1">Comment</label>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="JST-PH connectors"
              className="w-full px-3 py-2 bg-surface-800 border border-surface-700 text-steel placeholder:text-steel-dim focus:outline-none focus:border-copper"
            />
          </div>

          {error && <div className="p-3 bg-red-500/20 border border-red-500/30 text-red-400 text-sm">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-steel-dim hover:text-steel text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-copper text-ash text-sm font-medium hover:bg-copper/90 transition-colors disabled:opacity-50"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Pattern
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
