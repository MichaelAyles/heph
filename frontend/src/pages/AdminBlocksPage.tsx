import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload,
  Package,
  Trash2,
  Download,
  FileArchive,
  Cpu,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  FileCode,
  CircuitBoard,
  Box,
  Layers,
  FileJson,
  Image,
  XCircle,
} from 'lucide-react'
import clsx from 'clsx'

interface Block {
  id: number
  slug: string
  name: string
  description: string | null
  category: string
  files: {
    schematic?: string
    pcb?: string
    stepModel?: string
    gerbers?: string
    thumbnail?: string
  }
  definition?: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface ValidationResult {
  valid: boolean
  files: {
    schematic: string | null
    pcb: string | null
    step: string | null
    gerbers: string[]
    definition: string | null
    thumbnail: string | null
  }
  missing: string[]
}

interface ImportResult {
  success: boolean
  slug: string
  name: string
  isNew: boolean
  uploadedFiles: Record<string, string>
  gerberCount: number
  message: string
}

const FILE_REQUIREMENTS = [
  { key: 'schematic', label: 'Schematic', icon: FileCode, required: true },
  { key: 'pcb', label: 'PCB', icon: CircuitBoard, required: true },
  { key: 'gerbers', label: 'Gerbers', icon: Layers, required: true },
  { key: 'step', label: 'STEP', icon: Box, required: true },
  { key: 'definition', label: 'block.json', icon: FileJson, required: true },
  { key: 'thumbnail', label: 'Thumbnail', icon: Image, required: false },
] as const

export function AdminBlocksPage() {
  const queryClient = useQueryClient()
  const [dragOver, setDragOver] = useState(false)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importStatus, setImportStatus] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  // Fetch blocks
  const { data: blocks, isLoading } = useQuery<Block[]>({
    queryKey: ['admin-blocks'],
    queryFn: async () => {
      const res = await fetch('/api/blocks')
      if (!res.ok) throw new Error('Failed to fetch blocks')
      return res.json()
    },
  })

  // Validate mutation
  const validateMutation = useMutation({
    mutationFn: async (file: File): Promise<{ validation: ValidationResult }> => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('validate', 'true')

      const res = await fetch('/api/admin/blocks/import', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Validation failed')
      }

      return res.json()
    },
    onSuccess: (result, file) => {
      setValidation(result.validation)
      setSelectedFile(file)
    },
    onError: (error: Error) => {
      setImportStatus({ type: 'error', message: error.message })
      setTimeout(() => setImportStatus(null), 5000)
    },
  })

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (file: File): Promise<ImportResult> => {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/admin/blocks/import', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Import failed')
      }

      return res.json()
    },
    onSuccess: (result) => {
      setImportStatus({ type: 'success', message: result.message })
      setValidation(null)
      setSelectedFile(null)
      queryClient.invalidateQueries({ queryKey: ['admin-blocks'] })
      setTimeout(() => setImportStatus(null), 5000)
    },
    onError: (error: Error) => {
      setImportStatus({ type: 'error', message: error.message })
      setTimeout(() => setImportStatus(null), 5000)
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (slug: string) => {
      const res = await fetch(`/api/admin/blocks/${slug}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Delete failed')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-blocks'] })
    },
  })

  // Handle file drop/select - validate first
  const handleFile = useCallback(
    (file: File) => {
      if (file && file.name.endsWith('.zip')) {
        validateMutation.mutate(file)
      } else {
        setImportStatus({ type: 'error', message: 'Please select a ZIP file' })
        setTimeout(() => setImportStatus(null), 3000)
      }
    },
    [validateMutation]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      e.target.value = ''
    },
    [handleFile]
  )

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleImport = () => {
    if (selectedFile && validation?.valid) {
      importMutation.mutate(selectedFile)
    }
  }

  const handleCancel = () => {
    setValidation(null)
    setSelectedFile(null)
  }

  const getFileStatus = (key: string): 'present' | 'missing' | null => {
    if (!validation) return null
    const files = validation.files as Record<string, unknown>
    if (key === 'gerbers') {
      return (files.gerbers as string[])?.length > 0 ? 'present' : 'missing'
    }
    return files[key] ? 'present' : 'missing'
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-medium text-white">PCB Blocks</h1>
          <p className="text-white/50 mt-1">
            Import and manage circuit block modules
          </p>
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-blocks'] })}
          className="flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:text-white transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Import Zone */}
      <div className="bg-charcoal border border-white/10 rounded-lg p-6 mb-8">
        <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Import Block
        </h2>

        {!validation ? (
          // Drop zone
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={clsx(
              'border-2 border-dashed rounded-lg p-8 transition-all text-center',
              dragOver
                ? 'border-copper bg-copper/10'
                : 'border-white/20 hover:border-white/40',
              validateMutation.isPending && 'opacity-50 pointer-events-none'
            )}
          >
            <input
              type="file"
              accept=".zip"
              onChange={handleFileInput}
              className="hidden"
              id="block-import"
            />
            <label
              htmlFor="block-import"
              className="cursor-pointer flex flex-col items-center gap-4"
            >
              {validateMutation.isPending ? (
                <>
                  <Loader2 className="w-12 h-12 text-copper animate-spin" />
                  <div className="text-white">Validating ZIP contents...</div>
                </>
              ) : (
                <>
                  <FileArchive className="w-12 h-12 text-white/40" />
                  <div>
                    <div className="text-white font-medium">
                      Drop ZIP file here or click to upload
                    </div>
                    <div className="text-white/50 text-sm mt-1">
                      Required: .kicad_sch, .kicad_pcb, .step, gerbers/, block.json
                    </div>
                  </div>
                </>
              )}
            </label>
          </div>
        ) : (
          // Validation result
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileArchive className="w-5 h-5 text-copper" />
                <span className="text-white font-medium">{selectedFile?.name}</span>
              </div>
              <button
                onClick={handleCancel}
                className="text-white/50 hover:text-white text-sm"
              >
                Cancel
              </button>
            </div>

            {/* File validation grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {FILE_REQUIREMENTS.map(({ key, label, icon: Icon, required }) => {
                const status = getFileStatus(key)
                const isPresent = status === 'present'
                const isMissing = status === 'missing' && required

                return (
                  <div
                    key={key}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-2 rounded-lg border',
                      isPresent
                        ? 'bg-green-500/10 border-green-500/30'
                        : isMissing
                          ? 'bg-red-500/10 border-red-500/30'
                          : 'bg-white/5 border-white/10'
                    )}
                  >
                    <Icon
                      className={clsx(
                        'w-4 h-4',
                        isPresent ? 'text-green-400' : isMissing ? 'text-red-400' : 'text-white/40'
                      )}
                    />
                    <span
                      className={clsx(
                        'text-sm',
                        isPresent ? 'text-green-300' : isMissing ? 'text-red-300' : 'text-white/50'
                      )}
                    >
                      {label}
                    </span>
                    {isPresent ? (
                      <CheckCircle className="w-4 h-4 text-green-400 ml-auto" />
                    ) : isMissing ? (
                      <XCircle className="w-4 h-4 text-red-400 ml-auto" />
                    ) : (
                      <span className="text-xs text-white/30 ml-auto">optional</span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Gerber count */}
            {validation.files.gerbers.length > 0 && (
              <div className="text-sm text-white/50">
                {validation.files.gerbers.length} gerber files detected
              </div>
            )}

            {/* Import button */}
            <div className="flex items-center gap-4 pt-2">
              {validation.valid ? (
                <button
                  onClick={handleImport}
                  disabled={importMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-copper hover:bg-copper/90 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Import Block
                    </>
                  )}
                </button>
              ) : (
                <div className="flex items-center gap-2 text-red-400">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">
                    Missing: {validation.missing.join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status Message */}
      {importStatus && (
        <div
          className={clsx(
            'flex items-center gap-3 px-4 py-3 rounded-lg mb-6',
            importStatus.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30'
              : 'bg-red-500/10 border border-red-500/30'
          )}
        >
          {importStatus.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-400" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400" />
          )}
          <span
            className={
              importStatus.type === 'success' ? 'text-green-300' : 'text-red-300'
            }
          >
            {importStatus.message}
          </span>
        </div>
      )}

      {/* Export Script Info */}
      <div className="bg-charcoal border border-white/10 rounded-lg p-4 mb-8">
        <div className="flex items-start gap-3">
          <Upload className="w-5 h-5 text-copper mt-0.5" />
          <div>
            <div className="text-white font-medium">Export from KiCad</div>
            <div className="text-white/50 text-sm mt-1">
              Use the export script to create a block ZIP from a KiCad project:
            </div>
            <pre className="bg-black/30 rounded px-3 py-2 mt-2 text-sm text-copper font-mono">
              cd frontend && pnpm export-block ../path/to/kicad-project
            </pre>
            <div className="text-white/40 text-xs mt-2">
              Note: You'll need to manually create block.json with the block definition
            </div>
          </div>
        </div>
      </div>

      {/* Blocks List */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-white flex items-center gap-2">
          <Package className="w-5 h-5" />
          Imported Blocks ({blocks?.length || 0})
        </h2>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-copper animate-spin" />
          </div>
        ) : blocks?.length === 0 ? (
          <div className="text-center py-12 text-white/50">
            No blocks imported yet. Drop a ZIP above to get started.
          </div>
        ) : (
          <div className="grid gap-4">
            {blocks?.map((block) => (
              <div
                key={block.id}
                className="bg-charcoal border border-white/10 rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded bg-copper/20 flex items-center justify-center">
                      <Cpu className="w-5 h-5 text-copper" />
                    </div>
                    <div>
                      <h3 className="text-white font-medium">{block.name}</h3>
                      <div className="text-white/50 text-sm">{block.slug}</div>
                      {block.description && (
                        <p className="text-white/60 text-sm mt-1">
                          {block.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Delete block "${block.name}"?`)) {
                        deleteMutation.mutate(block.slug)
                      }
                    }}
                    className="p-2 text-white/50 hover:text-red-400 transition-colors"
                    title="Delete block"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Files Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                  <FileItem
                    label="Schematic"
                    icon={FileCode}
                    file={block.files.schematic}
                    slug={block.slug}
                    color="blue"
                  />
                  <FileItem
                    label="PCB"
                    icon={CircuitBoard}
                    file={block.files.pcb}
                    slug={block.slug}
                    color="green"
                  />
                  <FileItem
                    label="STEP"
                    icon={Box}
                    file={block.files.stepModel}
                    slug={block.slug}
                    color="purple"
                  />
                  <FileItem
                    label="Gerbers"
                    icon={Layers}
                    file={block.files.gerbers}
                    slug={block.slug}
                    color="orange"
                  />
                  <FileItem
                    label="Definition"
                    icon={FileJson}
                    file={block.definition ? 'block.json' : undefined}
                    slug={block.slug}
                    color="cyan"
                    isDefinition
                  />
                  <FileItem
                    label="Thumbnail"
                    icon={Image}
                    file={block.files.thumbnail}
                    slug={block.slug}
                    color="pink"
                    optional
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Color mappings for file items
const FILE_COLORS = {
  blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-300', icon: 'text-blue-400' },
  green: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-300', icon: 'text-green-400' },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-300', icon: 'text-purple-400' },
  orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-300', icon: 'text-orange-400' },
  cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-300', icon: 'text-cyan-400' },
  pink: { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-300', icon: 'text-pink-400' },
} as const

interface FileItemProps {
  label: string
  icon: React.ComponentType<{ className?: string }>
  file: string | undefined
  slug: string
  color: keyof typeof FILE_COLORS
  optional?: boolean
  isDefinition?: boolean
}

function FileItem({ label, icon: Icon, file, slug, color, optional, isDefinition }: FileItemProps) {
  const hasFile = !!file
  const colors = FILE_COLORS[color]

  if (!hasFile) {
    return (
      <div
        className={clsx(
          'flex items-center gap-2 px-3 py-2 rounded border',
          optional ? 'bg-white/5 border-white/10' : 'bg-red-500/5 border-red-500/20'
        )}
      >
        <Icon className={optional ? 'w-4 h-4 text-white/30' : 'w-4 h-4 text-red-400/50'} />
        <div className="flex-1 min-w-0">
          <span className={clsx('text-xs', optional ? 'text-white/30' : 'text-red-400/70')}>
            {label}
          </span>
        </div>
        {optional ? (
          <span className="text-[10px] text-white/20">optional</span>
        ) : (
          <XCircle className="w-3 h-3 text-red-400/50" />
        )}
      </div>
    )
  }

  // For definition, we don't have a download link
  if (isDefinition) {
    return (
      <div className={clsx('flex items-center gap-2 px-3 py-2 rounded border', colors.bg, colors.border)}>
        <Icon className={clsx('w-4 h-4', colors.icon)} />
        <span className={clsx('text-xs flex-1', colors.text)}>{label}</span>
        <CheckCircle className={clsx('w-3 h-3', colors.icon)} />
      </div>
    )
  }

  return (
    <a
      href={`/api/blocks/${slug}/files/${file}`}
      download
      className={clsx(
        'flex items-center gap-2 px-3 py-2 rounded border transition-colors hover:opacity-80',
        colors.bg,
        colors.border
      )}
      title={`Download ${file}`}
    >
      <Icon className={clsx('w-4 h-4', colors.icon)} />
      <span className={clsx('text-xs flex-1 truncate', colors.text)}>{label}</span>
      <Download className={clsx('w-3 h-3', colors.icon)} />
    </a>
  )
}
