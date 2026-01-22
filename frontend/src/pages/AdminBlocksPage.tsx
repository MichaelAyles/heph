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
  Trash2,
  FileJson,
  FileCode,
  Eye,
  X,
  Unplug,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { BlockCategory } from '@/schemas/block'
import type { PcbBlock } from '@/db/schema'
import { BlockImportWizard } from '@/components/admin/blocks/BlockImportWizard'
import { BlockViewer } from '@/components/blocks'

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
  bomStatus: {
    uniquePartTypes: number
    withLcsc: number
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
  remote: Unplug,
}

const CATEGORY_LABELS: Record<BlockCategory, string> = {
  mcu: 'MCU',
  power: 'Power',
  sensor: 'Sensor',
  output: 'Output',
  connector: 'Connector',
  utility: 'Utility',
  remote: 'Remote',
}

export function AdminBlocksPage() {
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [selectedBlock, setSelectedBlock] = useState<BlockSummary | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false)
  const [isViewerOpen, setIsViewerOpen] = useState(false)
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

  const categories: CategoryFilter[] = ['all', 'mcu', 'power', 'sensor', 'output', 'connector', 'utility', 'remote']

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
              onClick={() => setIsImportWizardOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-copper text-ash text-sm font-medium hover:bg-copper/90 transition-colors"
            >
              <FileCode className="w-4 h-4" strokeWidth={1.5} />
              Import from KiCad
            </button>
            <button
              onClick={() => {
                setSelectedBlock(null)
                setIsEditorOpen(true)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-surface-800 text-steel text-sm font-medium hover:bg-surface-700 transition-colors"
            >
              <Plus className="w-4 h-4" strokeWidth={1.5} />
              Manual JSON
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
                  key={block.slug}
                  className={clsx(
                    'p-4 bg-surface-900 border border-surface-700 hover:border-surface-600 transition-colors cursor-pointer',
                    selectedBlock?.slug === block.slug && 'border-copper'
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
                    {/* Show file count as x/5 */}
                    {(() => {
                      const total = block.fileStatus.required.length
                      const present = block.fileStatus.present.length
                      return present === total ? (
                        <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400">
                          {present}/{total} files
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400">
                          {present}/{total} files
                        </span>
                      )
                    })()}
                    {/* BOM/LCSC status */}
                    {block.bomStatus.uniquePartTypes > 0 && (
                      block.bomStatus.withLcsc === block.bomStatus.uniquePartTypes ? (
                        <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400">
                          {block.bomStatus.withLcsc}/{block.bomStatus.uniquePartTypes} LCSC
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400">
                          {block.bomStatus.withLcsc}/{block.bomStatus.uniquePartTypes} LCSC
                        </span>
                      )
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
                  onClick={() => setIsViewerOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-copper text-ash text-sm font-medium hover:bg-copper/90 transition-colors"
                >
                  <Eye className="w-4 h-4" strokeWidth={1.5} />
                  View & Edit
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

        {/* Editor Modal (for creating new blocks) */}
        {isEditorOpen && (
          <BlockEditorModal
            block={selectedBlock}
            onClose={() => {
              setIsEditorOpen(false)
              queryClient.invalidateQueries({ queryKey: ['admin-blocks'] })
            }}
          />
        )}

        {/* Import Wizard */}
        {isImportWizardOpen && (
          <BlockImportWizard
            onClose={() => setIsImportWizardOpen(false)}
            onSuccess={() => {
              setIsImportWizardOpen(false)
              queryClient.invalidateQueries({ queryKey: ['admin-blocks'] })
            }}
          />
        )}

        {/* Block Viewer Modal */}
        {isViewerOpen && selectedBlock && (
          <BlockViewerModal
            slug={selectedBlock.slug}
            onClose={() => {
              setIsViewerOpen(false)
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

// Block Viewer Modal Component
function BlockViewerModal({
  slug,
  onClose,
}: {
  slug: string
  onClose: () => void
}) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-block', slug],
    queryFn: async () => {
      const res = await fetch(`/api/admin/blocks/${slug}`)
      if (!res.ok) throw new Error('Failed to fetch block')
      return res.json() as Promise<{ block: PcbBlock }>
    },
  })

  return (
    <div className={clsx(
      'fixed inset-0 bg-black/70 flex items-center justify-center z-50',
      !isFullscreen && 'p-4'
    )}>
      <div className={clsx(
        'bg-surface-900 border border-surface-700 overflow-hidden flex flex-col',
        isFullscreen
          ? 'w-full h-full rounded-none'
          : 'w-full max-w-5xl max-h-[90vh] rounded-lg'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-700 shrink-0">
          <h2 className="text-lg font-medium text-white">
            {data?.block?.name || 'Block Details'}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-steel-dim hover:text-white transition-colors rounded-lg hover:bg-surface-700"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-5 h-5" strokeWidth={1.5} />
              ) : (
                <Maximize2 className="w-5 h-5" strokeWidth={1.5} />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-steel-dim hover:text-white transition-colors rounded-lg hover:bg-surface-700"
            >
              <X className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-copper animate-spin" strokeWidth={1.5} />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-400">
              Failed to load block details
            </div>
          ) : data?.block ? (
            <BlockViewer
              block={data.block}
              editable={true}
              className="rounded-none border-0"
            />
          ) : (
            <div className="p-8 text-center text-steel-dim">
              Block not found
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
