import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Loader2,
  Plus,
  Cpu,
  Zap,
  Radio,
  Settings,
  Cable,
  Box,
  CheckCircle,
  AlertTriangle,
  Upload,
  Trash2,
  Edit,
  FileJson,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { BlockCategory } from '@/schemas/block'

interface BlockSummary {
  id: string
  slug: string
  name: string
  category: string
  description: string
  widthUnits: number
  heightUnits: number
  isValidated: boolean
  isActive: boolean
  hasDefinition: boolean
  hasFiles: boolean
  version: string | null
  createdAt: string | null
  updatedAt: string | null
  fileStatus: {
    required: string[]
    present: string[]
    missing: string[]
  }
}

type CategoryFilter = 'all' | BlockCategory

const CATEGORY_ICONS: Record<BlockCategory, typeof Cpu> = {
  mcu: Cpu,
  power: Zap,
  sensor: Radio,
  output: Settings,
  connector: Cable,
  utility: Box,
}

const CATEGORY_LABELS: Record<BlockCategory, string> = {
  mcu: 'MCU',
  power: 'Power',
  sensor: 'Sensor',
  output: 'Output',
  connector: 'Connector',
  utility: 'Utility',
}

export function AdminBlocksPage() {
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [selectedBlock, setSelectedBlock] = useState<BlockSummary | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isUploaderOpen, setIsUploaderOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-blocks', filter],
    queryFn: async () => {
      const params = filter !== 'all' ? `?category=${filter}` : ''
      const res = await fetch(`/api/admin/blocks${params}`)
      if (!res.ok) throw new Error('Failed to fetch blocks')
      return res.json() as Promise<{ blocks: BlockSummary[] }>
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (slug: string) => {
      const res = await fetch(`/api/admin/blocks/${slug}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete block')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blocks'] })
      setSelectedBlock(null)
    },
  })

  const blocks = data?.blocks || []

  const categories: CategoryFilter[] = ['all', 'mcu', 'power', 'sensor', 'output', 'connector', 'utility']

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
              <h1 className="text-2xl font-semibold text-steel">PCB Block Library</h1>
              <p className="text-steel-dim text-sm">Manage hardware blocks with formal definitions</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSelectedBlock(null)
                setIsEditorOpen(true)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-copper text-ash text-sm font-medium hover:bg-copper/90 transition-colors"
            >
              <Plus className="w-4 h-4" strokeWidth={1.5} />
              New Block
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {categories.map((cat) => {
            const Icon = cat === 'all' ? Box : CATEGORY_ICONS[cat as BlockCategory]
            const label = cat === 'all' ? 'All' : CATEGORY_LABELS[cat as BlockCategory]
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
                  filter === cat
                    ? 'bg-copper text-ash'
                    : 'bg-surface-800 text-steel-dim hover:text-steel'
                )}
              >
                <Icon className="w-4 h-4" strokeWidth={1.5} />
                {label}
              </button>
            )
          })}
        </div>

        {/* Blocks Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-copper animate-spin" strokeWidth={1.5} />
          </div>
        ) : blocks.length === 0 ? (
          <div className="text-center py-12 text-steel-dim">
            No blocks found. Create a new block to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {blocks.map((block) => {
              const CategoryIcon = CATEGORY_ICONS[block.category as BlockCategory] || Box
              const isComplete = block.hasDefinition && block.fileStatus.missing.length === 0

              return (
                <div
                  key={block.id}
                  className={clsx(
                    'p-4 bg-surface-900 border border-surface-700 hover:border-surface-600 transition-colors cursor-pointer',
                    selectedBlock?.id === block.id && 'border-copper'
                  )}
                  onClick={() => setSelectedBlock(block)}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CategoryIcon className="w-5 h-5 text-copper" strokeWidth={1.5} />
                      <div>
                        <h3 className="font-medium text-steel">{block.name}</h3>
                        <p className="text-xs text-steel-dim">{block.slug}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {isComplete ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400" strokeWidth={1.5} />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-400" strokeWidth={1.5} />
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-steel-dim mb-3 line-clamp-2">{block.description}</p>

                  {/* Grid size */}
                  <div className="flex items-center gap-4 text-xs text-steel-dim mb-2">
                    <span>
                      {block.widthUnits}x{block.heightUnits} grid
                    </span>
                    <span>{block.widthUnits * 12.7}mm x {block.heightUnits * 12.7}mm</span>
                  </div>

                  {/* Status badges */}
                  <div className="flex flex-wrap gap-1">
                    {block.hasDefinition ? (
                      <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400">
                        <FileJson className="w-3 h-3 inline mr-1" />
                        definition
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400">
                        no definition
                      </span>
                    )}
                    {block.fileStatus.missing.length === 0 ? (
                      <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400">
                        files complete
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400">
                        {block.fileStatus.missing.length} files missing
                      </span>
                    )}
                    {block.isValidated ? (
                      <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400">
                        validated
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-surface-700 text-steel-dim">
                        unvalidated
                      </span>
                    )}
                  </div>

                  {/* Version */}
                  {block.version && (
                    <p className="text-xs text-steel-dim mt-2">v{block.version}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Selected Block Actions */}
        {selectedBlock && (
          <div className="fixed bottom-0 left-0 right-0 bg-surface-900 border-t border-surface-700 p-4">
            <div className="max-w-6xl mx-auto flex items-center justify-between">
              <div>
                <h3 className="font-medium text-steel">{selectedBlock.name}</h3>
                <p className="text-sm text-steel-dim">{selectedBlock.slug}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsUploaderOpen(true)
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-surface-800 text-steel text-sm font-medium hover:bg-surface-700 transition-colors"
                >
                  <Upload className="w-4 h-4" strokeWidth={1.5} />
                  Upload Files
                </button>
                <button
                  onClick={() => {
                    setIsEditorOpen(true)
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-surface-800 text-steel text-sm font-medium hover:bg-surface-700 transition-colors"
                >
                  <Edit className="w-4 h-4" strokeWidth={1.5} />
                  Edit Definition
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete block "${selectedBlock.name}"? This cannot be undone.`)) {
                      deleteMutation.mutate(selectedBlock.slug)
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                  Delete
                </button>
                <button
                  onClick={() => setSelectedBlock(null)}
                  className="px-4 py-2 text-steel-dim text-sm hover:text-steel transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Editor Modal */}
        {isEditorOpen && (
          <BlockEditorModal
            block={selectedBlock}
            onClose={() => {
              setIsEditorOpen(false)
              queryClient.invalidateQueries({ queryKey: ['admin-blocks'] })
            }}
          />
        )}

        {/* Uploader Modal */}
        {isUploaderOpen && selectedBlock && (
          <BlockUploaderModal
            block={selectedBlock}
            onClose={() => {
              setIsUploaderOpen(false)
              queryClient.invalidateQueries({ queryKey: ['admin-blocks'] })
            }}
          />
        )}
      </div>
    </div>
  )
}

// Block Editor Modal Component
function BlockEditorModal({
  block,
  onClose,
}: {
  block: BlockSummary | null
  onClose: () => void
}) {
  const [jsonContent, setJsonContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Load existing definition if editing
  useState(() => {
    if (block) {
      fetch(`/api/admin/blocks/${block.slug}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.block?.definition) {
            setJsonContent(JSON.stringify(data.block.definition, null, 2))
          }
        })
    }
  })

  const handleSave = async () => {
    setError(null)
    setIsLoading(true)

    try {
      let definition: unknown
      try {
        definition = JSON.parse(jsonContent)
      } catch {
        setError('Invalid JSON syntax')
        setIsLoading(false)
        return
      }

      const url = block ? `/api/admin/blocks/${block.slug}` : '/api/admin/blocks'
      const method = block ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition }),
      })

      const result = await res.json()

      if (!res.ok) {
        if (result.errors) {
          setError(`Validation errors:\n${result.errors.join('\n')}`)
        } else {
          setError(result.error || 'Failed to save block')
        }
        return
      }

      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-surface-900 border border-surface-700 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-surface-700 flex items-center justify-between">
          <h2 className="text-lg font-medium text-steel">
            {block ? `Edit ${block.name}` : 'Create New Block'}
          </h2>
          <button onClick={onClose} className="text-steel-dim hover:text-steel">
            &times;
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-auto p-4">
          <p className="text-sm text-steel-dim mb-4">
            Enter the block.json definition. See{' '}
            <a
              href="https://github.com/your-repo/docs/BLOCK_SPEC.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-copper hover:underline"
            >
              BLOCK_SPEC.md
            </a>{' '}
            for schema documentation.
          </p>

          <textarea
            value={jsonContent}
            onChange={(e) => setJsonContent(e.target.value)}
            placeholder={`{
  "slug": "sensor-bme280",
  "name": "BME280 Environmental Sensor",
  "version": "1.0.0",
  "category": "sensor",
  "description": "Temperature, humidity, and pressure sensor with I2C interface.",
  "gridSize": [1, 1],
  "bus": {
    "power": {
      "requires": [{ "rail": "3V3", "typicalMa": 1, "maxMa": 4 }]
    },
    "i2c": {
      "addresses": [118]
    }
  },
  "edges": {
    "north": [{ "signals": "ALL" }],
    "south": [{ "signals": "ALL" }]
  },
  "components": [
    { "reference": "U1", "value": "BME280", "footprint": "LGA-8", "quantity": 1 }
  ]
}`}
            className="w-full h-96 p-4 bg-surface-800 border border-surface-700 text-steel font-mono text-sm resize-none focus:outline-none focus:border-copper"
          />

          {error && (
            <div className="mt-4 p-3 bg-red-500/20 border border-red-500/30 text-red-400 text-sm whitespace-pre-wrap">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-steel-dim hover:text-steel text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading || !jsonContent.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-copper text-ash text-sm font-medium hover:bg-copper/90 transition-colors disabled:opacity-50"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {block ? 'Update' : 'Create'} Block
          </button>
        </div>
      </div>
    </div>
  )
}

// Block Uploader Modal Component
function BlockUploaderModal({
  block,
  onClose,
}: {
  block: BlockSummary
  onClose: () => void
}) {
  const [files, setFiles] = useState<{
    schematic?: File
    pcb?: File
    step?: File
    thumbnail?: File
    blockJson?: string
  }>({})
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{
    success: boolean
    message: string
    fileStatus?: { missing: string[] }
  } | null>(null)

  const handleUpload = async () => {
    setError(null)
    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('slug', block.slug)

      if (files.schematic) formData.append('schematic', files.schematic)
      if (files.pcb) formData.append('pcb', files.pcb)
      if (files.step) formData.append('step', files.step)
      if (files.thumbnail) formData.append('thumbnail', files.thumbnail)
      if (files.blockJson) formData.append('blockJson', files.blockJson)

      const res = await fetch('/api/admin/blocks/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await res.json()

      if (!res.ok) {
        if (result.errors) {
          setError(`Validation errors:\n${result.errors.join('\n')}`)
        } else {
          setError(result.error || 'Upload failed')
        }
        return
      }

      setUploadResult(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileChange = (type: keyof typeof files) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (type === 'blockJson') {
        // Read as text for block.json
        const reader = new FileReader()
        reader.onload = (event) => {
          setFiles((prev) => ({ ...prev, blockJson: event.target?.result as string }))
        }
        reader.readAsText(file)
      } else {
        setFiles((prev) => ({ ...prev, [type]: file }))
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-surface-900 border border-surface-700 w-full max-w-lg">
        {/* Header */}
        <div className="p-4 border-b border-surface-700 flex items-center justify-between">
          <h2 className="text-lg font-medium text-steel">Upload Files for {block.name}</h2>
          <button onClick={onClose} className="text-steel-dim hover:text-steel">
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Missing files warning */}
          {block.fileStatus.missing.length > 0 && (
            <div className="p-3 bg-amber-500/20 border border-amber-500/30 text-amber-400 text-sm">
              Missing files: {block.fileStatus.missing.join(', ')}
            </div>
          )}

          {/* File inputs */}
          <div className="space-y-3">
            <FileInput
              label="Schematic (.kicad_sch)"
              accept=".kicad_sch"
              required={block.fileStatus.missing.includes(`${block.slug}.kicad_sch`)}
              onChange={handleFileChange('schematic')}
            />
            <FileInput
              label="PCB Layout (.kicad_pcb)"
              accept=".kicad_pcb"
              required={block.fileStatus.missing.includes(`${block.slug}.kicad_pcb`)}
              onChange={handleFileChange('pcb')}
            />
            <FileInput
              label="3D Model (.step)"
              accept=".step,.stp"
              required={block.fileStatus.missing.includes(`${block.slug}.step`)}
              onChange={handleFileChange('step')}
            />
            <FileInput
              label="Block Definition (block.json)"
              accept=".json"
              required={block.fileStatus.missing.includes('block.json')}
              onChange={handleFileChange('blockJson')}
            />
            <FileInput
              label="Thumbnail (.png)"
              accept=".png"
              onChange={handleFileChange('thumbnail')}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 text-red-400 text-sm whitespace-pre-wrap">
              {error}
            </div>
          )}

          {uploadResult && (
            <div
              className={clsx(
                'p-3 border text-sm',
                uploadResult.success
                  ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/20 border-red-500/30 text-red-400'
              )}
            >
              {uploadResult.message}
              {uploadResult.fileStatus?.missing?.length === 0 && (
                <p className="mt-1">All required files are now present!</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-steel-dim hover:text-steel text-sm transition-colors"
          >
            {uploadResult?.success ? 'Done' : 'Cancel'}
          </button>
          {!uploadResult?.success && (
            <button
              onClick={handleUpload}
              disabled={isUploading || Object.keys(files).length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-copper text-ash text-sm font-medium hover:bg-copper/90 transition-colors disabled:opacity-50"
            >
              {isUploading && <Loader2 className="w-4 h-4 animate-spin" />}
              Upload
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// File Input Component
function FileInput({
  label,
  accept,
  required,
  onChange,
}: {
  label: string
  accept: string
  required?: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-steel mb-1">
        {label}
        {required && <span className="text-amber-400 ml-1">*</span>}
      </label>
      <input
        type="file"
        accept={accept}
        onChange={onChange}
        className="w-full text-sm text-steel-dim file:mr-4 file:py-2 file:px-4 file:border-0 file:bg-surface-800 file:text-steel file:cursor-pointer hover:file:bg-surface-700"
      />
    </div>
  )
}
