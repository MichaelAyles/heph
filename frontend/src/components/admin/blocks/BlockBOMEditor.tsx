/**
 * Block BOM Editor
 *
 * Table editor for block components with LCSC part number input.
 * Allows adding MPN, manufacturer, and LCSC part numbers for ordering.
 */

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save, X, Plus, Trash2, Upload, ExternalLink } from 'lucide-react'
import { clsx } from 'clsx'
import type { BlockDefinition, BlockComponentDef } from '../../../schemas/block'

interface BlockBOMEditorProps {
  slug: string
  onClose: () => void
}

interface BlockDetailResponse {
  block: {
    slug: string
    name: string
    definition: BlockDefinition | null
    components: Array<{ ref: string; value: string; package: string }>
    files: Record<string, string>
  }
}

export function BlockBOMEditor({ slug, onClose }: BlockBOMEditorProps) {
  const queryClient = useQueryClient()
  const [components, setComponents] = useState<BlockComponentDef[]>([])
  const [hasChanges, setHasChanges] = useState(false)
  const [stepFile, setStepFile] = useState<File | null>(null)

  // Fetch block details
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-block-detail', slug],
    queryFn: async () => {
      const res = await fetch(`/api/admin/blocks/${slug}`)
      if (!res.ok) throw new Error('Failed to fetch block')
      return res.json() as Promise<BlockDetailResponse>
    },
  })

  // Initialize components from definition or legacy format
  useEffect(() => {
    if (data?.block) {
      if (data.block.definition?.components) {
        setComponents(data.block.definition.components)
      } else if (data.block.components) {
        // Convert legacy format to new format
        setComponents(
          data.block.components.map((c) => ({
            reference: c.ref,
            value: c.value,
            footprint: c.package,
            quantity: 1,
          }))
        )
      }
    }
  }, [data])

  // Update component mutation
  const updateMutation = useMutation({
    mutationFn: async (updatedComponents: BlockComponentDef[]) => {
      if (!data?.block.definition) {
        throw new Error('Block has no definition to update')
      }

      const updatedDefinition: BlockDefinition = {
        ...data.block.definition,
        components: updatedComponents,
      }

      const res = await fetch(`/api/admin/blocks/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition: updatedDefinition }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update block')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-block-detail', slug] })
      queryClient.invalidateQueries({ queryKey: ['admin-blocks'] })
      setHasChanges(false)
    },
  })

  // Upload STEP file mutation
  const uploadStepMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('slug', slug)
      formData.append('step', file)

      const res = await fetch('/api/admin/blocks/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to upload STEP file')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-block-detail', slug] })
      queryClient.invalidateQueries({ queryKey: ['admin-blocks'] })
      setStepFile(null)
    },
  })

  const updateComponent = (index: number, field: keyof BlockComponentDef, value: string | number) => {
    setComponents((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
    setHasChanges(true)
  }

  const addComponent = () => {
    setComponents((prev) => [
      ...prev,
      {
        reference: `C${prev.length + 1}`,
        value: '',
        footprint: '',
        quantity: 1,
      },
    ])
    setHasChanges(true)
  }

  const removeComponent = (index: number) => {
    setComponents((prev) => prev.filter((_, i) => i !== index))
    setHasChanges(true)
  }

  const handleSave = () => {
    updateMutation.mutate(components)
  }

  const handleStepUpload = () => {
    if (stepFile) {
      uploadStepMutation.mutate(stepFile)
    }
  }

  const hasStep = data?.block?.files?.stepModel

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-surface-900 border border-surface-700 p-8">
          <Loader2 className="w-8 h-8 text-copper animate-spin" />
        </div>
      </div>
    )
  }

  if (error || !data?.block) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-surface-900 border border-surface-700 p-8">
          <p className="text-red-400">Failed to load block</p>
          <button onClick={onClose} className="mt-4 text-steel-dim hover:text-steel">
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-auto">
      <div className="bg-surface-900 border border-surface-700 w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-surface-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-medium text-steel">Edit BOM: {data.block.name}</h2>
            <p className="text-xs text-steel-dim mt-1">
              {components.length} components | {slug}
            </p>
          </div>
          <button onClick={onClose} className="text-steel-dim hover:text-steel p-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP File Section */}
        <div className="p-4 border-b border-surface-700 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-steel">STEP 3D Model</h3>
              {hasStep ? (
                <p className="text-xs text-emerald-400 mt-1">
                  Uploaded: {data.block.files.stepModel}
                </p>
              ) : (
                <p className="text-xs text-amber-400 mt-1">Missing - required for enclosure design</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".step,.stp"
                onChange={(e) => setStepFile(e.target.files?.[0] || null)}
                className="text-sm text-steel-dim file:mr-2 file:py-1 file:px-3 file:border-0 file:bg-surface-800 file:text-steel file:text-xs file:cursor-pointer hover:file:bg-surface-700"
              />
              {stepFile && (
                <button
                  onClick={handleStepUpload}
                  disabled={uploadStepMutation.isPending}
                  className="flex items-center gap-1 px-3 py-1 bg-copper text-ash text-xs font-medium hover:bg-copper/90 disabled:opacity-50"
                >
                  {uploadStepMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Upload className="w-3 h-3" />
                  )}
                  Upload
                </button>
              )}
            </div>
          </div>
          {uploadStepMutation.isSuccess && (
            <p className="text-xs text-emerald-400 mt-2">STEP file uploaded successfully!</p>
          )}
          {uploadStepMutation.isError && (
            <p className="text-xs text-red-400 mt-2">
              {uploadStepMutation.error instanceof Error
                ? uploadStepMutation.error.message
                : 'Upload failed'}
            </p>
          )}
        </div>

        {/* BOM Table */}
        <div className="flex-1 overflow-auto p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-800 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-steel-dim font-medium">Ref</th>
                  <th className="px-3 py-2 text-left text-steel-dim font-medium">Value</th>
                  <th className="px-3 py-2 text-left text-steel-dim font-medium">Footprint</th>
                  <th className="px-3 py-2 text-left text-steel-dim font-medium">Qty</th>
                  <th className="px-3 py-2 text-left text-steel-dim font-medium">Manufacturer</th>
                  <th className="px-3 py-2 text-left text-steel-dim font-medium">MPN</th>
                  <th className="px-3 py-2 text-left text-steel-dim font-medium">
                    LCSC Part #
                    <a
                      href="https://www.lcsc.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-copper hover:text-copper-light"
                    >
                      <ExternalLink className="w-3 h-3 inline" />
                    </a>
                  </th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {components.map((component, index) => (
                  <tr key={index} className="border-b border-surface-700 hover:bg-surface-800/50">
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={component.reference}
                        onChange={(e) => updateComponent(index, 'reference', e.target.value)}
                        className="w-16 px-2 py-1 bg-surface-800 border border-surface-600 text-steel text-xs focus:outline-none focus:border-copper"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={component.value}
                        onChange={(e) => updateComponent(index, 'value', e.target.value)}
                        className="w-24 px-2 py-1 bg-surface-800 border border-surface-600 text-steel text-xs focus:outline-none focus:border-copper"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={component.footprint}
                        onChange={(e) => updateComponent(index, 'footprint', e.target.value)}
                        className="w-32 px-2 py-1 bg-surface-800 border border-surface-600 text-steel text-xs focus:outline-none focus:border-copper"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="1"
                        value={component.quantity}
                        onChange={(e) =>
                          updateComponent(index, 'quantity', parseInt(e.target.value) || 1)
                        }
                        className="w-12 px-2 py-1 bg-surface-800 border border-surface-600 text-steel text-xs focus:outline-none focus:border-copper"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={component.manufacturer || ''}
                        onChange={(e) => updateComponent(index, 'manufacturer', e.target.value)}
                        placeholder="e.g., Yageo"
                        className="w-24 px-2 py-1 bg-surface-800 border border-surface-600 text-steel text-xs focus:outline-none focus:border-copper placeholder:text-surface-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={component.mpn || ''}
                        onChange={(e) => updateComponent(index, 'mpn', e.target.value)}
                        placeholder="e.g., RC0402FR-0710KL"
                        className="w-32 px-2 py-1 bg-surface-800 border border-surface-600 text-steel text-xs focus:outline-none focus:border-copper placeholder:text-surface-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={component.lcscPartNumber || ''}
                        onChange={(e) => updateComponent(index, 'lcscPartNumber', e.target.value)}
                        placeholder="C######"
                        className={clsx(
                          'w-24 px-2 py-1 bg-surface-800 border text-xs focus:outline-none focus:border-copper placeholder:text-surface-500',
                          component.lcscPartNumber
                            ? 'border-emerald-500/50 text-emerald-400'
                            : 'border-surface-600 text-steel'
                        )}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeComponent(index)}
                        className="p-1 text-red-400/50 hover:text-red-400 transition-colors"
                        title="Remove component"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add component button */}
          <button
            onClick={addComponent}
            className="mt-4 flex items-center gap-2 px-3 py-2 text-xs text-steel-dim hover:text-steel bg-surface-800 hover:bg-surface-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Component
          </button>

          {/* Summary */}
          <div className="mt-6 p-4 bg-surface-800 border border-surface-700">
            <h4 className="text-sm font-medium text-steel mb-2">Summary</h4>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-steel-dim">Total Components:</span>
                <span className="ml-2 text-steel">{components.length}</span>
              </div>
              <div>
                <span className="text-steel-dim">With LCSC Part #:</span>
                <span
                  className={clsx(
                    'ml-2',
                    components.filter((c) => c.lcscPartNumber).length === components.length
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  )}
                >
                  {components.filter((c) => c.lcscPartNumber).length}/{components.length}
                </span>
              </div>
              <div>
                <span className="text-steel-dim">With MPN:</span>
                <span
                  className={clsx(
                    'ml-2',
                    components.filter((c) => c.mpn).length === components.length
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  )}
                >
                  {components.filter((c) => c.mpn).length}/{components.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-700 flex items-center justify-between flex-shrink-0">
          <div>
            {hasChanges && <span className="text-xs text-amber-400">Unsaved changes</span>}
            {updateMutation.isSuccess && (
              <span className="text-xs text-emerald-400">Saved successfully!</span>
            )}
            {updateMutation.isError && (
              <span className="text-xs text-red-400">
                {updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : 'Save failed'}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-steel-dim hover:text-steel text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || updateMutation.isPending || !data.block.definition}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
                hasChanges && data.block.definition
                  ? 'bg-copper text-ash hover:bg-copper/90'
                  : 'bg-surface-700 text-surface-500 cursor-not-allowed'
              )}
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
