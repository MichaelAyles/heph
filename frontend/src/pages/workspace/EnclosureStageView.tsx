import { useState, useEffect, useCallback } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import {
  Box,
  ArrowRight,
  Loader2,
  Play,
  Download,
  RefreshCw,
  Wand2,
  MessageSquare,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import Editor from '@monaco-editor/react'
import { useWorkspaceContext } from '@/components/workspace/WorkspaceLayout'
import { STLViewer } from '@/components/enclosure/STLViewer'
import { renderOpenSCAD, createSTLBlobUrl, revokeSTLBlobUrl, preloadOpenSCAD } from '@/lib/openscadRenderer'
import {
  buildEnclosurePrompt,
  buildEnclosureInputFromSpec,
  buildEnclosureRegenerationPrompt,
} from '@/prompts/enclosure'
import { llm } from '@/services/llm'

type EnclosureStep = 'generate' | 'edit' | 'preview'

export function EnclosureStageView() {
  const { project } = useWorkspaceContext()
  const queryClient = useQueryClient()

  // UI state
  const [currentStep, setCurrentStep] = useState<EnclosureStep>('generate')
  const [openScadCode, setOpenScadCode] = useState<string>('')
  const [stlBlobUrl, setStlBlobUrl] = useState<string | null>(null)
  const [stlData, setStlData] = useState<Uint8Array | null>(null)
  const [feedback, setFeedback] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRendering, setIsRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [wasmLoaded, setWasmLoaded] = useState(false)

  const spec = project?.spec
  const pcbComplete = spec?.stages?.pcb?.status === 'complete'
  const pcbArtifacts = spec?.pcb
  const finalSpec = spec?.finalSpec
  const existingEnclosure = spec?.enclosure

  // Preload OpenSCAD WASM when entering this stage
  useEffect(() => {
    preloadOpenSCAD()
      .then(() => setWasmLoaded(true))
      .catch((err) => console.error('Failed to preload OpenSCAD:', err))
  }, [])

  // Initialize from existing enclosure data
  useEffect(() => {
    if (existingEnclosure?.openScadCode && !openScadCode) {
      setOpenScadCode(existingEnclosure.openScadCode)
      setCurrentStep('edit')
    }
  }, [existingEnclosure, openScadCode])

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (stlBlobUrl) {
        revokeSTLBlobUrl(stlBlobUrl)
      }
    }
  }, [stlBlobUrl])

  // Mutation to save enclosure data
  const saveEnclosureMutation = useMutation({
    mutationFn: async (data: { openScadCode: string; stlUrl?: string }) => {
      const res = await fetch(`/api/projects/${project?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spec: {
            ...spec,
            enclosure: {
              ...spec?.enclosure,
              openScadCode: data.openScadCode,
              stlUrl: data.stlUrl,
              iterations: [
                ...(spec?.enclosure?.iterations || []),
                {
                  feedback: feedback || 'Initial generation',
                  openScadCode: data.openScadCode,
                  stlUrl: data.stlUrl,
                  timestamp: new Date().toISOString(),
                },
              ],
            },
            stages: {
              ...spec?.stages,
              enclosure: { status: 'in_progress' },
            },
          },
        }),
      })
      if (!res.ok) throw new Error('Failed to save enclosure data')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project?.id] })
    },
  })

  // Generate OpenSCAD code using LLM
  const handleGenerate = useCallback(async () => {
    if (!project || !pcbArtifacts) return

    setIsGenerating(true)
    setRenderError(null)

    try {
      const input = buildEnclosureInputFromSpec(
        project.name,
        spec?.description || '',
        pcbArtifacts,
        finalSpec || undefined
      )

      const prompt = buildEnclosurePrompt(input)

      const response = await llm.chat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        projectId: project.id,
      })

      // Extract OpenSCAD code from response
      let code = response.content

      // If wrapped in markdown code block, extract it
      const codeMatch = code.match(/```(?:openscad)?\n([\s\S]*?)```/)
      if (codeMatch) {
        code = codeMatch[1]
      }

      setOpenScadCode(code.trim())
      setCurrentStep('edit')
      saveEnclosureMutation.mutate({ openScadCode: code.trim() })
    } catch (error) {
      console.error('Failed to generate enclosure:', error)
      setRenderError(error instanceof Error ? error.message : 'Failed to generate enclosure')
    } finally {
      setIsGenerating(false)
    }
  }, [project, spec, pcbArtifacts, finalSpec, saveEnclosureMutation])

  // Regenerate with feedback
  const handleRegenerate = useCallback(async () => {
    if (!project || !pcbArtifacts || !feedback.trim()) return

    setIsGenerating(true)
    setRenderError(null)

    try {
      const input = buildEnclosureInputFromSpec(
        project.name,
        spec?.description || '',
        pcbArtifacts,
        finalSpec || undefined
      )

      const prompt = buildEnclosureRegenerationPrompt(openScadCode, feedback, input)

      const response = await llm.chat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        projectId: project.id,
      })

      let code = response.content
      const codeMatch = code.match(/```(?:openscad)?\n([\s\S]*?)```/)
      if (codeMatch) {
        code = codeMatch[1]
      }

      setOpenScadCode(code.trim())
      setFeedback('')
      saveEnclosureMutation.mutate({ openScadCode: code.trim() })
    } catch (error) {
      console.error('Failed to regenerate enclosure:', error)
      setRenderError(error instanceof Error ? error.message : 'Failed to regenerate')
    } finally {
      setIsGenerating(false)
    }
  }, [project, spec, pcbArtifacts, finalSpec, openScadCode, feedback, saveEnclosureMutation])

  // Render OpenSCAD to STL
  const handleRender = useCallback(async () => {
    if (!openScadCode) return

    setIsRendering(true)
    setRenderError(null)

    // Cleanup old blob URL
    if (stlBlobUrl) {
      revokeSTLBlobUrl(stlBlobUrl)
      setStlBlobUrl(null)
    }

    try {
      const result = await renderOpenSCAD(openScadCode)

      if (!result.success) {
        throw new Error(result.error || 'Render failed')
      }

      setStlData(result.stl)
      const blobUrl = createSTLBlobUrl(result.stl)
      setStlBlobUrl(blobUrl)
      setCurrentStep('preview')
    } catch (error) {
      console.error('Failed to render STL:', error)
      setRenderError(error instanceof Error ? error.message : 'Failed to render STL')
    } finally {
      setIsRendering(false)
    }
  }, [openScadCode, stlBlobUrl])

  // Download STL file
  const handleDownload = useCallback(() => {
    if (!stlData) return

    const blob = new Blob([stlData], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project?.name || 'enclosure'}.stl`
    a.click()
    URL.revokeObjectURL(url)
  }, [stlData, project?.name])

  // Download OpenSCAD source
  const handleDownloadSource = useCallback(() => {
    if (!openScadCode) return

    const blob = new Blob([openScadCode], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project?.name || 'enclosure'}.scad`
    a.click()
    URL.revokeObjectURL(url)
  }, [openScadCode, project?.name])

  if (!pcbComplete) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4">
            <Box className="w-8 h-8 text-surface-500" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold text-steel mb-2">Enclosure Design</h2>
          <p className="text-steel-dim mb-4">
            Complete the PCB stage first. The enclosure will be generated based on your board
            dimensions and component placement.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-surface-500">
            <span>Design PCB</span>
            <ArrowRight className="w-4 h-4" />
            <span>Generate Enclosure</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-surface-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-steel mb-1">Enclosure Design</h2>
            <p className="text-steel-dim text-sm">AI-generated parametric enclosure with 3D preview</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Step indicators */}
            <StepIndicator
              step={1}
              label="Generate"
              active={currentStep === 'generate'}
              complete={currentStep !== 'generate'}
            />
            <ArrowRight className="w-4 h-4 text-surface-600" />
            <StepIndicator
              step={2}
              label="Edit"
              active={currentStep === 'edit'}
              complete={currentStep === 'preview'}
            />
            <ArrowRight className="w-4 h-4 text-surface-600" />
            <StepIndicator step={3} label="Preview" active={currentStep === 'preview'} complete={false} />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {currentStep === 'generate' ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 rounded-full bg-copper/10 flex items-center justify-center mx-auto mb-4">
                <Wand2 className="w-8 h-8 text-copper" strokeWidth={1.5} />
              </div>
              <h3 className="text-lg font-semibold text-steel mb-2">Generate Enclosure</h3>
              <p className="text-steel-dim mb-6">
                The AI will generate a parametric OpenSCAD enclosure based on your PCB dimensions (
                {pcbArtifacts?.boardSize?.width ?? 50}mm x {pcbArtifacts?.boardSize?.height ?? 40}mm) and
                component placement.
              </p>

              {!wasmLoaded && (
                <p className="text-xs text-surface-500 mb-4">
                  <Loader2 className="w-3 h-3 inline-block animate-spin mr-1" />
                  Loading OpenSCAD engine...
                </p>
              )}

              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={clsx(
                  'px-6 py-3 rounded-lg font-medium transition-all',
                  isGenerating
                    ? 'bg-surface-700 text-steel-dim cursor-not-allowed'
                    : 'bg-copper text-surface-900 hover:bg-copper-light'
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 inline-block animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 inline-block mr-2" />
                    Generate Enclosure
                  </>
                )}
              </button>

              {renderError && (
                <p className="mt-4 text-red-400 text-sm">
                  <XCircle className="w-4 h-4 inline-block mr-1" />
                  {renderError}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-2 gap-4 p-4 min-h-0">
            {/* Left: OpenSCAD Editor */}
            <div className="bg-surface-900 rounded-lg border border-surface-700 flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between">
                <h3 className="text-sm font-medium text-steel">OpenSCAD Code</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadSource}
                    className="text-xs text-copper hover:text-copper-light flex items-center gap-1"
                    title="Download OpenSCAD source"
                  >
                    <Download className="w-3.5 h-3.5" />
                    .scad
                  </button>
                  <button
                    onClick={handleRender}
                    disabled={isRendering || !openScadCode}
                    className={clsx(
                      'px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1.5 transition-colors',
                      isRendering || !openScadCode
                        ? 'bg-surface-700 text-steel-dim cursor-not-allowed'
                        : 'bg-copper text-surface-900 hover:bg-copper-light'
                    )}
                  >
                    {isRendering ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Rendering...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        Render
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <Editor
                  height="100%"
                  language="c"
                  theme="vs-dark"
                  value={openScadCode}
                  onChange={(value) => setOpenScadCode(value || '')}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                  }}
                />
              </div>
              {/* Feedback input */}
              <div className="px-4 py-3 border-t border-surface-700">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
                    <input
                      type="text"
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="Describe changes (e.g., 'make the corners more rounded')"
                      className="w-full pl-10 pr-4 py-2 bg-surface-800 border border-surface-600 rounded text-sm text-steel placeholder:text-surface-500 focus:outline-none focus:border-copper"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && feedback.trim()) {
                          handleRegenerate()
                        }
                      }}
                    />
                  </div>
                  <button
                    onClick={handleRegenerate}
                    disabled={isGenerating || !feedback.trim()}
                    className={clsx(
                      'px-3 py-2 rounded text-sm font-medium flex items-center gap-1.5 transition-colors',
                      isGenerating || !feedback.trim()
                        ? 'bg-surface-700 text-steel-dim cursor-not-allowed'
                        : 'bg-surface-700 text-steel hover:bg-surface-600'
                    )}
                  >
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Regenerate
                  </button>
                </div>
              </div>
            </div>

            {/* Right: 3D Preview */}
            <div className="bg-surface-900 rounded-lg border border-surface-700 flex flex-col min-h-0">
              <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between">
                <h3 className="text-sm font-medium text-steel">3D Preview</h3>
                {stlData && (
                  <button
                    onClick={handleDownload}
                    className="text-xs text-copper hover:text-copper-light flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download STL
                  </button>
                )}
              </div>
              <div className="flex-1 min-h-0">
                {stlBlobUrl || stlData ? (
                  <STLViewer
                    src={stlBlobUrl || undefined}
                    data={stlData || undefined}
                    className="w-full h-full"
                    color="#8B7355"
                    showGrid={true}
                    autoRotate={false}
                  />
                ) : (
                  <div className="flex-1 flex items-center justify-center h-full">
                    <div className="text-center">
                      <Box className="w-12 h-12 text-surface-600 mx-auto mb-3" strokeWidth={1} />
                      <p className="text-steel-dim text-sm mb-2">
                        {isRendering ? 'Rendering...' : 'Click "Render" to generate 3D preview'}
                      </p>
                      {renderError && (
                        <p className="text-red-400 text-xs mt-2">
                          <XCircle className="w-3 h-3 inline-block mr-1" />
                          {renderError}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface StepIndicatorProps {
  step: number
  label: string
  active: boolean
  complete: boolean
}

function StepIndicator({ step, label, active, complete }: StepIndicatorProps) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm',
        active && 'bg-copper/20 text-copper',
        complete && 'bg-emerald-500/20 text-emerald-400',
        !active && !complete && 'text-steel-dim'
      )}
    >
      {complete ? (
        <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />
      ) : active ? (
        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
      ) : (
        <span className="w-4 h-4 flex items-center justify-center text-xs">{step}</span>
      )}
      <span>{label}</span>
    </div>
  )
}

export default EnclosureStageView
