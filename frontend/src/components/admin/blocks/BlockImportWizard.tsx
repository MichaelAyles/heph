/**
 * Block Import Wizard
 *
 * Multi-step wizard for creating new PCB blocks from KiCad files.
 * Uses LLM to generate block.json from extracted schematic/PCB data.
 */

import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Loader2,
  Upload,
  FileCode,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  X,
  Cpu,
  Zap,
  Radio,
  Settings,
  Cable,
  Box,
  Eye,
  FileText,
  List,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { BlockCategory } from '@/schemas/block'

interface BlockImportWizardProps {
  onClose: () => void
  onSuccess: (slug: string) => void
}

interface GenerateResponse {
  success: boolean
  blockJson: unknown
  blockJsonString: string
  isValid: boolean
  validationErrors: string[]
  extract: {
    components: Array<{
      reference: string
      value: string
      footprint: string
    }>
    nets: string[]
    boardSize?: { width: number; height: number }
    suggestedGridSize: [number, number]
    busSignals: string[]
    i2cSignals: string[]
    spiSignals: string[]
    gpioSignals: string[]
    powerRails: string[]
  }
  tokn?: string
  rawLlmResponse?: string
}

type LeftPanelTab = 'extract' | 'tokn' | 'preview'

type WizardStep = 'upload' | 'generating' | 'review' | 'saving'

const CATEGORY_OPTIONS: { value: BlockCategory; label: string; icon: typeof Cpu }[] = [
  { value: 'mcu', label: 'MCU', icon: Cpu },
  { value: 'power', label: 'Power', icon: Zap },
  { value: 'sensor', label: 'Sensor', icon: Radio },
  { value: 'output', label: 'Output', icon: Settings },
  { value: 'connector', label: 'Connector', icon: Cable },
  { value: 'utility', label: 'Utility', icon: Box },
]

export function BlockImportWizard({ onClose, onSuccess }: BlockImportWizardProps) {
  const [step, setStep] = useState<WizardStep>('upload')
  const [slug, setSlug] = useState('')
  const [category, setCategory] = useState<BlockCategory | ''>('')
  const [schematicFile, setSchematicFile] = useState<File | null>(null)
  const [pcbFile, setPcbFile] = useState<File | null>(null)
  const [pcbContent, setPcbContent] = useState<string | null>(null)
  const [stepFile, setStepFile] = useState<File | null>(null)
  const [generateResult, setGenerateResult] = useState<GenerateResponse | null>(null)
  const [editedJson, setEditedJson] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [leftPanelTab, setLeftPanelTab] = useState<LeftPanelTab>('extract')

  // Generate block.json from KiCad files
  const generateMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData()
      formData.append('slug', slug)
      if (schematicFile) formData.append('schematic', schematicFile)
      if (pcbFile) formData.append('pcb', pcbFile)
      if (category) formData.append('category', category)

      const res = await fetch('/api/admin/blocks/generate', {
        method: 'POST',
        body: formData,
      })

      const result = await res.json()

      if (!res.ok) {
        const errorMsg = result.details
          ? `${result.error}: ${result.details}`
          : result.error || 'Generation failed'
        throw new Error(errorMsg)
      }

      return result as GenerateResponse
    },
    onSuccess: (data) => {
      setGenerateResult(data)
      setEditedJson(data.blockJsonString)
      setStep('review')
    },
    onError: () => {
      setStep('upload')
    },
  })

  // Save block to database
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Validate JSON first
      let definition: unknown
      try {
        definition = JSON.parse(editedJson)
      } catch {
        throw new Error('Invalid JSON syntax')
      }

      // Create block
      const res = await fetch('/api/admin/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ definition }),
      })

      const result = await res.json()

      if (!res.ok) {
        if (result.errors) {
          throw new Error(`Validation errors:\n${result.errors.join('\n')}`)
        }
        throw new Error(result.error || 'Failed to save block')
      }

      // Now upload the KiCad files
      if (schematicFile || pcbFile || stepFile) {
        const uploadFormData = new FormData()
        uploadFormData.append('slug', slug)
        if (schematicFile) uploadFormData.append('schematic', schematicFile)
        if (pcbFile) uploadFormData.append('pcb', pcbFile)
        if (stepFile) uploadFormData.append('step', stepFile)
        uploadFormData.append('blockJson', editedJson)

        const uploadRes = await fetch('/api/admin/blocks/upload', {
          method: 'POST',
          body: uploadFormData,
        })

        if (!uploadRes.ok) {
          const uploadResult = await uploadRes.json()
          console.warn('File upload warning:', uploadResult.error)
        }
      }

      return result
    },
    onSuccess: () => {
      onSuccess(slug)
    },
  })

  const handleGenerate = useCallback(() => {
    if (!schematicFile || !slug) return
    setStep('generating')
    generateMutation.mutate()
  }, [schematicFile, slug, generateMutation])

  const handleSave = useCallback(() => {
    setJsonError(null)
    try {
      JSON.parse(editedJson)
    } catch {
      setJsonError('Invalid JSON syntax')
      return
    }
    setStep('saving')
    saveMutation.mutate()
  }, [editedJson, saveMutation])

  const handleSchematicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSchematicFile(file)
      // Auto-suggest slug from filename
      if (!slug) {
        const suggestedSlug = file.name
          .replace('.kicad_sch', '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
        setSlug(suggestedSlug)
      }
    }
  }

  const handlePcbChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPcbFile(file)
      // Read content for KiCanvas preview
      const content = await file.text()
      setPcbContent(content)
    }
  }

  const isValidSlug = /^[a-z0-9-]+$/.test(slug) && slug.length >= 3 && slug.length <= 50
  const canGenerate = schematicFile && isValidSlug

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-surface-900 border border-surface-700 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-surface-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-medium text-steel">Import Block from KiCad</h2>
            <div className="flex items-center gap-1 text-xs text-steel-dim">
              <span
                className={clsx(
                  'px-2 py-0.5',
                  step === 'upload' ? 'bg-copper text-ash' : 'bg-surface-800'
                )}
              >
                1. Upload
              </span>
              <ArrowRight className="w-3 h-3" />
              <span
                className={clsx(
                  'px-2 py-0.5',
                  step === 'generating' ? 'bg-copper text-ash' : 'bg-surface-800'
                )}
              >
                2. Generate
              </span>
              <ArrowRight className="w-3 h-3" />
              <span
                className={clsx(
                  'px-2 py-0.5',
                  step === 'review' || step === 'saving' ? 'bg-copper text-ash' : 'bg-surface-800'
                )}
              >
                3. Review & Save
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-steel-dim hover:text-steel p-1">
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="p-6 space-y-6">
              <div className="text-sm text-steel-dim">
                Upload your KiCad schematic and PCB files. The system will analyze them and generate
                a block.json definition using AI.
              </div>

              {/* Slug input */}
              <div>
                <label className="block text-sm font-medium text-steel mb-2">Block Slug *</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  placeholder="sensor-bme280"
                  className={clsx(
                    'w-full px-3 py-2 bg-surface-800 border text-steel text-sm',
                    'focus:outline-none focus:border-copper',
                    slug && !isValidSlug ? 'border-red-500' : 'border-surface-700'
                  )}
                />
                {slug && !isValidSlug && (
                  <p className="mt-1 text-xs text-red-400">
                    3-50 lowercase letters, numbers, and hyphens only
                  </p>
                )}
              </div>

              {/* Category selector */}
              <div>
                <label className="block text-sm font-medium text-steel mb-2">
                  Category (optional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS.map((opt) => {
                    const Icon = opt.icon
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setCategory(category === opt.value ? '' : opt.value)}
                        className={clsx(
                          'flex items-center gap-2 px-3 py-1.5 text-sm transition-colors',
                          category === opt.value
                            ? 'bg-copper text-ash'
                            : 'bg-surface-800 text-steel-dim hover:text-steel'
                        )}
                      >
                        <Icon className="w-4 h-4" strokeWidth={1.5} />
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* File uploads */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-steel mb-2">
                    Schematic File *
                  </label>
                  <div
                    className={clsx(
                      'border-2 border-dashed p-4 text-center transition-colors',
                      schematicFile
                        ? 'border-emerald-500/50 bg-emerald-500/10'
                        : 'border-surface-700 hover:border-surface-600'
                    )}
                  >
                    <input
                      type="file"
                      accept=".kicad_sch"
                      onChange={handleSchematicChange}
                      className="hidden"
                      id="schematic-upload"
                    />
                    <label htmlFor="schematic-upload" className="cursor-pointer">
                      {schematicFile ? (
                        <div className="flex flex-col items-center gap-2">
                          <FileCode className="w-8 h-8 text-emerald-400" strokeWidth={1.5} />
                          <span className="text-sm text-steel">{schematicFile.name}</span>
                          <span className="text-xs text-steel-dim">Click to change</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Upload className="w-8 h-8 text-steel-dim" strokeWidth={1.5} />
                          <span className="text-sm text-steel-dim">.kicad_sch file</span>
                          <span className="text-xs text-steel-dim">Click to upload</span>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-steel mb-2">
                    PCB Layout (optional)
                  </label>
                  <div
                    className={clsx(
                      'border-2 border-dashed p-4 text-center transition-colors',
                      pcbFile
                        ? 'border-emerald-500/50 bg-emerald-500/10'
                        : 'border-surface-700 hover:border-surface-600'
                    )}
                  >
                    <input
                      type="file"
                      accept=".kicad_pcb"
                      onChange={handlePcbChange}
                      className="hidden"
                      id="pcb-upload"
                    />
                    <label htmlFor="pcb-upload" className="cursor-pointer">
                      {pcbFile ? (
                        <div className="flex flex-col items-center gap-2">
                          <FileCode className="w-8 h-8 text-emerald-400" strokeWidth={1.5} />
                          <span className="text-sm text-steel">{pcbFile.name}</span>
                          <span className="text-xs text-steel-dim">Click to change</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Upload className="w-8 h-8 text-steel-dim" strokeWidth={1.5} />
                          <span className="text-sm text-steel-dim">.kicad_pcb file</span>
                          <span className="text-xs text-steel-dim">Improves accuracy</span>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              </div>

              {/* STEP file upload */}
              <div>
                <label className="block text-sm font-medium text-steel mb-2">
                  3D Model (optional)
                </label>
                <div
                  className={clsx(
                    'border-2 border-dashed p-4 text-center transition-colors',
                    stepFile
                      ? 'border-emerald-500/50 bg-emerald-500/10'
                      : 'border-surface-700 hover:border-surface-600'
                  )}
                >
                  <input
                    type="file"
                    accept=".step,.stp"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) setStepFile(file)
                    }}
                    className="hidden"
                    id="step-upload"
                  />
                  <label htmlFor="step-upload" className="cursor-pointer">
                    {stepFile ? (
                      <div className="flex flex-col items-center gap-2">
                        <Box className="w-8 h-8 text-emerald-400" strokeWidth={1.5} />
                        <span className="text-sm text-steel">{stepFile.name}</span>
                        <span className="text-xs text-steel-dim">Click to change</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Box className="w-8 h-8 text-steel-dim" strokeWidth={1.5} />
                        <span className="text-sm text-steel-dim">.step/.stp file</span>
                        <span className="text-xs text-steel-dim">Export from KiCad: File &gt; Export &gt; STEP</span>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {generateMutation.error && (
                <div className="p-3 bg-red-500/20 border border-red-500/30 text-red-400 text-sm">
                  {generateMutation.error instanceof Error
                    ? generateMutation.error.message
                    : 'Generation failed'}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Generating */}
          {step === 'generating' && (
            <div className="p-6 flex flex-col items-center justify-center min-h-[300px] gap-4">
              <Loader2 className="w-12 h-12 text-copper animate-spin" strokeWidth={1.5} />
              <div className="text-steel text-lg">Analyzing KiCad files...</div>
              <div className="text-steel-dim text-sm">
                Extracting components and nets, generating block.json
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {(step === 'review' || step === 'saving') && generateResult && (
            <div className="flex h-[500px]">
              {/* Left: Tabs and content */}
              <div className="w-1/3 border-r border-surface-700 flex flex-col">
                {/* Tab bar */}
                <div className="flex border-b border-surface-700">
                  <button
                    onClick={() => setLeftPanelTab('extract')}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-2 text-xs transition-colors',
                      leftPanelTab === 'extract'
                        ? 'bg-surface-800 text-copper border-b-2 border-copper'
                        : 'text-steel-dim hover:text-steel'
                    )}
                  >
                    <List className="w-3.5 h-3.5" strokeWidth={1.5} />
                    Extract
                  </button>
                  <button
                    onClick={() => setLeftPanelTab('tokn')}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-2 text-xs transition-colors',
                      leftPanelTab === 'tokn'
                        ? 'bg-surface-800 text-copper border-b-2 border-copper'
                        : 'text-steel-dim hover:text-steel'
                    )}
                  >
                    <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />
                    TOKN
                  </button>
                  {pcbContent && (
                    <button
                      onClick={() => setLeftPanelTab('preview')}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-2 text-xs transition-colors',
                        leftPanelTab === 'preview'
                          ? 'bg-surface-800 text-copper border-b-2 border-copper'
                          : 'text-steel-dim hover:text-steel'
                      )}
                    >
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                      Preview
                    </button>
                  )}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-auto p-4">
                  {/* Extract tab */}
                  {leftPanelTab === 'extract' && (
                    <>
                      {/* Validation status */}
                      <div className="mb-4">
                        {generateResult.isValid ? (
                          <div className="flex items-center gap-2 text-sm text-emerald-400">
                            <CheckCircle className="w-4 h-4" strokeWidth={1.5} />
                            Schema valid
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-amber-400">
                              <AlertTriangle className="w-4 h-4" strokeWidth={1.5} />
                              Validation issues
                            </div>
                            <ul className="text-xs text-red-400 ml-6 list-disc">
                              {generateResult.validationErrors.map((err, i) => (
                                <li key={i}>{err}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Board size */}
                      {generateResult.extract.boardSize && (
                        <div className="mb-3">
                          <div className="text-xs text-steel-dim mb-1">Board Size</div>
                          <div className="text-sm text-steel">
                            {generateResult.extract.boardSize.width}mm ×{' '}
                            {generateResult.extract.boardSize.height}mm
                          </div>
                          <div className="text-xs text-steel-dim">
                            Grid: {generateResult.extract.suggestedGridSize[0]}×
                            {generateResult.extract.suggestedGridSize[1]}
                          </div>
                        </div>
                      )}

                      {/* Bus signals */}
                      {generateResult.extract.busSignals.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-steel-dim mb-1">Bus Signals</div>
                          <div className="flex flex-wrap gap-1">
                            {generateResult.extract.busSignals.map((sig) => (
                              <span key={sig} className="px-1.5 py-0.5 text-xs bg-copper/20 text-copper">
                                {sig}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Components */}
                      <div className="mb-3">
                        <div className="text-xs text-steel-dim mb-1">
                          Components ({generateResult.extract.components.length})
                        </div>
                        <div className="space-y-1 max-h-40 overflow-auto">
                          {generateResult.extract.components.map((c, i) => (
                            <div key={i} className="text-xs text-steel">
                              <span className="text-copper">{c.reference}</span>: {c.value}
                              {c.footprint && (
                                <span className="text-steel-dim"> ({c.footprint})</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Nets */}
                      {generateResult.extract.nets.length > 0 && (
                        <div>
                          <div className="text-xs text-steel-dim mb-1">
                            Nets ({generateResult.extract.nets.length})
                          </div>
                          <div className="text-xs text-steel-dim max-h-24 overflow-auto">
                            {generateResult.extract.nets.join(', ')}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* TOKN tab */}
                  {leftPanelTab === 'tokn' && (
                    <div className="h-full">
                      {generateResult.tokn ? (
                        <pre className="text-xs text-steel font-mono whitespace-pre-wrap overflow-auto h-full">
                          {generateResult.tokn}
                        </pre>
                      ) : (
                        <div className="text-steel-dim text-sm">No TOKN output available</div>
                      )}
                    </div>
                  )}

                  {/* Preview tab - KiCanvas */}
                  {leftPanelTab === 'preview' && pcbContent && (
                    <div className="h-full flex flex-col">
                      <div className="text-xs text-steel-dim mb-2">
                        PCB Preview via KiCanvas
                      </div>
                      <div className="flex-1 bg-white rounded overflow-hidden">
                        <kicanvas-embed
                          src={`data:application/x-kicad-pcb;base64,${btoa(pcbContent)}`}
                          controls="full"
                          theme="kicad"
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: JSON editor */}
              <div className="flex-1 flex flex-col">
                <div className="p-2 border-b border-surface-700 flex items-center justify-between">
                  <span className="text-sm text-steel">block.json</span>
                  {jsonError && <span className="text-xs text-red-400">{jsonError}</span>}
                </div>
                <textarea
                  value={editedJson}
                  onChange={(e) => {
                    setEditedJson(e.target.value)
                    setJsonError(null)
                  }}
                  className="flex-1 p-4 bg-surface-800 text-steel font-mono text-xs resize-none focus:outline-none"
                  spellCheck={false}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-700 flex justify-between">
          <div>
            {step === 'review' && (
              <button
                onClick={() => setStep('upload')}
                className="flex items-center gap-2 px-4 py-2 text-steel-dim hover:text-steel text-sm"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
                Back
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-steel-dim hover:text-steel text-sm"
            >
              Cancel
            </button>

            {step === 'upload' && (
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="flex items-center gap-2 px-4 py-2 bg-copper text-ash text-sm font-medium hover:bg-copper/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate
                <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}

            {step === 'review' && (
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-copper text-ash text-sm font-medium hover:bg-copper/90 transition-colors disabled:opacity-50"
              >
                {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Block
              </button>
            )}

            {step === 'saving' && (
              <button
                disabled
                className="flex items-center gap-2 px-4 py-2 bg-copper text-ash text-sm font-medium opacity-50"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </button>
            )}
          </div>
        </div>

        {/* Save error */}
        {saveMutation.error && (
          <div className="p-3 mx-4 mb-4 bg-red-500/20 border border-red-500/30 text-red-400 text-sm whitespace-pre-wrap">
            {saveMutation.error instanceof Error ? saveMutation.error.message : 'Save failed'}
          </div>
        )}
      </div>
    </div>
  )
}
