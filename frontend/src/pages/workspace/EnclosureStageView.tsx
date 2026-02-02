/**
 * EnclosureStageView - Main enclosure design stage with generation, editing, and preview
 *
 * Uses LangGraph nodes via /api/langgraph/invoke/* for all LLM calls:
 * - enclosure_validation: Validate OpenSCAD code
 * - enclosure_fix: Auto-fix validation issues
 * - enclosure_vision: Generate from blueprint image
 * - enclosure_text: Generate from text description
 * - enclosure_regenerate: Regenerate with feedback
 * - enclosure_visual_compare: Compare render to blueprint
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { useWorkspaceContext } from '@/components/workspace/WorkspaceLayout'
import { logger } from '@/lib/logger'
import { invokeLangGraphNode, BreakpointCancelledError } from '@/services/langgraph/invoke'
import { StageCompleteButton } from '@/components/workspace/StageCompleteButton'
import {
  renderOpenSCAD,
  createSTLBlobUrl,
  revokeSTLBlobUrl,
  preloadOpenSCAD,
} from '@/lib/openscadRenderer'
import type { ValidationIssue, VisualValidationResult } from '@/prompts/enclosure-validation'
import { fetchImageAsBase64 } from '@/services/llm'
import type { STLViewerRef } from '@/components/enclosure/STLViewer'
import {
  ComparisonModal,
  EditorPanel,
  EnclosureStepIndicator,
  GenerateStep,
  NotReadyState,
  PreviewPanel,
  type EnclosureStep,
  MAX_VALIDATION_ITERATIONS,
} from '@/components/enclosure'

// =============================================================================
// LangGraph API Response Types
// =============================================================================

interface EnclosureValidationResponse {
  output: {
    isValid: boolean
    issues: ValidationIssue[]
    summary: string
  }
  nodeId: string
}

interface EnclosureFixResponse {
  output: {
    fixedCode: string
    changesApplied: string[]
    remainingIssues: string[]
  }
  nodeId: string
}

interface EnclosureVisionResponse {
  output: {
    openScadCode: string
    designNotes?: string
    estimatedDimensions?: { width: number; height: number; depth: number }
  }
  nodeId: string
}

interface EnclosureTextResponse {
  output: {
    openScadCode: string
    designNotes?: string
    estimatedDimensions?: { width: number; height: number; depth: number }
  }
  nodeId: string
}

interface EnclosureRegenerateResponse {
  output: {
    openScadCode: string
    changesApplied: string[]
    designNotes?: string
  }
  nodeId: string
}

interface EnclosureVisualCompareResponse {
  output: {
    overallScore: number
    scores: {
      formFactor: number
      featurePlacement: number
      visualStyle: number
      assembly: number
    }
    matches: boolean
    issues: Array<{
      category: string
      description: string
    }>
    fixInstructions: string
  }
  nodeId: string
}

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

  // Validation state
  const [validationStatus, setValidationStatus] = useState<string | null>(null)
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([])
  const [validationIteration, setValidationIteration] = useState(0)

  // Visual validation state
  const [showComparison, setShowComparison] = useState(false)
  const [renderScreenshot, setRenderScreenshot] = useState<string | null>(null)
  const [visualValidationResult, setVisualValidationResult] =
    useState<VisualValidationResult | null>(null)
  const [isVisualValidating, setIsVisualValidating] = useState(false)

  // AbortController for cancelling in-flight operations
  const abortControllerRef = useRef<AbortController | null>(null)

  // STL Viewer ref for screenshots
  const stlViewerRef = useRef<STLViewerRef>(null)

  const spec = project?.spec
  const pcbComplete = spec?.stages?.pcb?.status === 'complete'
  const pcbArtifacts = spec?.pcb
  const finalSpec = spec?.finalSpec
  const existingEnclosure = spec?.enclosure

  // Preload OpenSCAD WASM when entering this stage
  useEffect(() => {
    preloadOpenSCAD()
      .then(() => setWasmLoaded(true))
      .catch((err) => {
        logger.enclosure('Failed to preload OpenSCAD', { error: err })
        setRenderError('Failed to load OpenSCAD. Rendering will not be available.')
      })
  }, [])

  // Cleanup AbortController on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
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
        method: 'PUT',
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

  // Validate OpenSCAD code and return issues using LangGraph node
  const validateCode = useCallback(
    async (code: string): Promise<ValidationIssue[]> => {
      // Only runtime input - code being validated
      // PCB dimensions and features are now accessed via @pcb.boardSize and @finalSpec in system prompt
      const data = await invokeLangGraphNode({
        nodeName: 'enclosure_validation',
        input: {
          openScadCode: code,
        },
        projectId: project?.id,
      })

      return (data.output as EnclosureValidationResponse['output']).issues
    },
    [project?.id]
  )

  // Fix code based on validation issues using LangGraph node
  const fixCode = useCallback(
    async (code: string, issues: ValidationIssue[]): Promise<string> => {
      // Runtime inputs only - code and issues
      // PCB dimensions are now accessed via @pcb.boardSize in system prompt
      const data = await invokeLangGraphNode({
        nodeName: 'enclosure_fix',
        input: {
          openScadCode: code,
          issues,
        },
        projectId: project?.id,
      })

      return (data.output as EnclosureFixResponse['output']).fixedCode
    },
    [project?.id]
  )

  // Generate OpenSCAD code using LangGraph nodes with validation loop
  const handleGenerate = useCallback(async () => {
    if (!project || !pcbArtifacts) return

    // Cancel any in-flight operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    setIsGenerating(true)
    setRenderError(null)
    setValidationStatus(null)
    setValidationIssues([])
    setValidationIteration(0)

    try {
      // Check if we have a blueprint image to use for vision-enabled generation
      const blueprintIndex = spec?.selectedBlueprint ?? 0
      const blueprintUrl = spec?.blueprints?.[blueprintIndex]?.url
      const hasBlueprint = !!blueprintUrl

      let code: string

      if (hasBlueprint) {
        // Vision-enabled generation using enclosure_vision node
        setValidationStatus('Generating enclosure from blueprint...')

        // Empty input - blueprint image comes from @image:visualization.selected
        // PCB dimensions and features are accessed via @pcb.boardSize and @finalSpec in system prompt
        const visionData = await invokeLangGraphNode({
          nodeName: 'enclosure_vision',
          input: {},
          projectId: project.id,
        })

        code = (visionData.output as EnclosureVisionResponse['output']).openScadCode
      } else {
        // Fallback: text-only generation using enclosure_text node
        setValidationStatus('Generating enclosure design...')

        // Empty input - all context from @variables
        // Uses @projectName, @description, @pcb.boardSize, @finalSpec in system prompt
        const textData = await invokeLangGraphNode({
          nodeName: 'enclosure_text',
          input: {},
          projectId: project.id,
        })

        code = (textData.output as EnclosureTextResponse['output']).openScadCode
      }

      // Step 2: Validation loop
      for (let iteration = 1; iteration <= MAX_VALIDATION_ITERATIONS; iteration++) {
        setValidationIteration(iteration)
        setValidationStatus(
          `Validating design (iteration ${iteration}/${MAX_VALIDATION_ITERATIONS})...`
        )

        const issues = await validateCode(code)
        const criticalIssues = issues.filter((i) => i.severity === 'critical')
        const warningIssues = issues.filter((i) => i.severity === 'warning')

        setValidationIssues(issues)

        // If no critical issues, we're done
        if (criticalIssues.length === 0) {
          if (warningIssues.length > 0 && iteration < MAX_VALIDATION_ITERATIONS) {
            // Try to fix warnings on the last iteration
            setValidationStatus(`Fixing ${warningIssues.length} warnings...`)
            code = await fixCode(code, warningIssues)
          }
          break
        }

        // Fix critical issues
        setValidationStatus(`Fixing ${criticalIssues.length} critical issues...`)
        code = await fixCode(code, criticalIssues)
      }

      // Check if aborted before updating state
      if (signal.aborted) return

      setValidationStatus('Generation complete!')
      setOpenScadCode(code)
      setCurrentStep('edit')
      saveEnclosureMutation.mutate({ openScadCode: code })

      // Clear status after a moment (with cleanup)
      const timeoutId = setTimeout(() => setValidationStatus(null), 3000)
      // Clean up timeout if component unmounts
      signal.addEventListener('abort', () => clearTimeout(timeoutId))
    } catch (error) {
      // Don't show error if operation was aborted
      if (signal.aborted) return

      if (error instanceof BreakpointCancelledError) {
        setRenderError('Generation cancelled at debug breakpoint')
      } else {
        logger.enclosure('Failed to generate enclosure', { error })
        setRenderError(error instanceof Error ? error.message : 'Failed to generate enclosure')
      }
    } finally {
      if (!signal.aborted) {
        setIsGenerating(false)
      }
    }
  }, [project, spec, pcbArtifacts, finalSpec, saveEnclosureMutation, validateCode, fixCode])

  // Regenerate with feedback using LangGraph node (includes validation loop)
  const handleRegenerate = useCallback(async () => {
    if (!project || !pcbArtifacts || !feedback.trim()) return

    // Cancel any in-flight operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    setIsGenerating(true)
    setRenderError(null)
    setValidationStatus(null)
    setValidationIssues([])
    setValidationIteration(0)

    try {
      // Step 1: Regenerate with feedback using enclosure_regenerate node
      setValidationStatus('Regenerating with feedback...')

      // Only runtime inputs - current code and feedback
      // Project context accessed via @projectName, @description, @pcb.boardSize, @finalSpec in system prompt
      const regenData = await invokeLangGraphNode({
        nodeName: 'enclosure_regenerate',
        input: {
          currentCode: openScadCode,
          feedback,
        },
        projectId: project.id,
      })

      let code = (regenData.output as EnclosureRegenerateResponse['output']).openScadCode

      // Step 2: Validation loop
      for (let iteration = 1; iteration <= MAX_VALIDATION_ITERATIONS; iteration++) {
        setValidationIteration(iteration)
        setValidationStatus(
          `Validating regenerated design (iteration ${iteration}/${MAX_VALIDATION_ITERATIONS})...`
        )

        const issues = await validateCode(code)
        const criticalIssues = issues.filter((i) => i.severity === 'critical')
        const warningIssues = issues.filter((i) => i.severity === 'warning')

        setValidationIssues(issues)

        // If no critical issues, we're done
        if (criticalIssues.length === 0) {
          if (warningIssues.length > 0 && iteration < MAX_VALIDATION_ITERATIONS) {
            setValidationStatus(`Fixing ${warningIssues.length} warnings...`)
            code = await fixCode(code, warningIssues)
          }
          break
        }

        // Fix critical issues
        setValidationStatus(`Fixing ${criticalIssues.length} critical issues...`)
        code = await fixCode(code, criticalIssues)
      }

      // Check if aborted before updating state
      if (signal.aborted) return

      setValidationStatus('Regeneration complete!')
      setOpenScadCode(code)
      setFeedback('')
      saveEnclosureMutation.mutate({ openScadCode: code })

      // Clear status after a moment (with cleanup)
      const timeoutId = setTimeout(() => setValidationStatus(null), 3000)
      signal.addEventListener('abort', () => clearTimeout(timeoutId))
    } catch (error) {
      // Don't show error if operation was aborted
      if (signal.aborted) return

      if (error instanceof BreakpointCancelledError) {
        setRenderError('Regeneration cancelled at debug breakpoint')
      } else {
        logger.enclosure('Failed to regenerate enclosure', { error })
        setRenderError(error instanceof Error ? error.message : 'Failed to regenerate')
      }
    } finally {
      if (!signal.aborted) {
        setIsGenerating(false)
      }
    }
  }, [
    project,
    spec,
    pcbArtifacts,
    finalSpec,
    openScadCode,
    feedback,
    saveEnclosureMutation,
    validateCode,
    fixCode,
  ])

  // Perform visual validation by comparing render to blueprint using LangGraph node
  const performVisualValidation = useCallback(async () => {
    const blueprintIndex = spec?.selectedBlueprint ?? 0
    const blueprintUrl = spec?.blueprints?.[blueprintIndex]?.url

    if (!blueprintUrl || !stlViewerRef.current) {
      logger.warn('enclosure', 'Cannot perform visual validation: missing blueprint or viewer ref')
      return
    }

    setIsVisualValidating(true)
    setVisualValidationResult(null)

    try {
      // Wait a moment for the render to settle
      await new Promise((r) => setTimeout(r, 500))

      // Take screenshot of the rendered model
      const renderBase64 = await stlViewerRef.current.takeScreenshot()
      if (!renderBase64) {
        throw new Error('Failed to capture render screenshot')
      }
      setRenderScreenshot(renderBase64)

      // Fetch blueprint as base64
      const blueprintBase64 = await fetchImageAsBase64(blueprintUrl)

      // Send both images to LangGraph enclosure_visual_compare node
      const compareData = await invokeLangGraphNode({
        nodeName: 'enclosure_visual_compare',
        input: {
          blueprintImage: `data:image/png;base64,${blueprintBase64}`,
          stlScreenshot: `data:image/png;base64,${renderBase64}`,
          designIntent: spec?.description,
        },
        projectId: project?.id,
      })

      const data = { output: compareData.output as EnclosureVisualCompareResponse['output'] }

      // Transform to VisualValidationResult format
      // Cast issues to the expected type with proper category union
      const result: VisualValidationResult = {
        overallScore: data.output.overallScore,
        scores: data.output.scores,
        matches: data.output.matches,
        issues: data.output.issues.map((issue) => ({
          category: issue.category as
            | 'formFactor'
            | 'featurePlacement'
            | 'visualStyle'
            | 'assembly',
          description: issue.description,
        })),
        fixInstructions: data.output.fixInstructions,
      }

      setVisualValidationResult(result)
      setShowComparison(true)
    } catch (error) {
      logger.enclosure('Visual validation failed', { error })
      setRenderError(error instanceof Error ? error.message : 'Visual validation failed')
    } finally {
      setIsVisualValidating(false)
    }
  }, [spec, project?.id])

  // Handle accepting the current design
  const handleAcceptDesign = useCallback(() => {
    setShowComparison(false)
    setVisualValidationResult(null)
    // Design is already saved, just close comparison
  }, [])

  // Handle regenerating with visual validation feedback
  const handleRegenerateFromComparison = useCallback((feedbackFromValidation: string) => {
    setShowComparison(false)
    setFeedback(feedbackFromValidation)
    // User can then click "Regenerate" with the pre-filled feedback
  }, [])

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
      logger.enclosure('Failed to render STL', { error })
      setRenderError(error instanceof Error ? error.message : 'Failed to render STL')
    } finally {
      setIsRendering(false)
    }
  }, [openScadCode, stlBlobUrl])

  // Download STL file
  const handleDownload = useCallback(() => {
    if (!stlData) return

    // Create a regular ArrayBuffer copy to avoid SharedArrayBuffer issues
    const buffer = new ArrayBuffer(stlData.byteLength)
    new Uint8Array(buffer).set(stlData)
    const blob = new Blob([buffer], { type: 'application/octet-stream' })
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

  // Blueprint info
  const blueprintIndex = spec?.selectedBlueprint ?? 0
  const blueprintUrl = spec?.blueprints?.[blueprintIndex]?.url

  if (!pcbComplete) {
    return <NotReadyState />
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-surface-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-steel mb-1">Enclosure Design</h2>
            <p className="text-steel-dim text-sm">
              AI-generated parametric enclosure with 3D preview
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {/* Step indicators */}
              <EnclosureStepIndicator
                step={1}
                label="Generate"
                active={currentStep === 'generate'}
                complete={currentStep !== 'generate'}
              />
              <ArrowRight className="w-4 h-4 text-surface-600" />
              <EnclosureStepIndicator
                step={2}
                label="Edit"
                active={currentStep === 'edit'}
                complete={currentStep === 'preview'}
              />
              <ArrowRight className="w-4 h-4 text-surface-600" />
              <EnclosureStepIndicator
                step={3}
                label="Preview"
                active={currentStep === 'preview'}
                complete={false}
              />
            </div>
            {/* User mark complete button */}
            <StageCompleteButton
              stage="enclosure"
              spec={spec || null}
              projectId={project?.id || ''}
              canComplete={!!spec?.enclosure?.openScadCode}
              onComplete={() => {
                queryClient.invalidateQueries({ queryKey: ['project', project?.id] })
                queryClient.invalidateQueries({ queryKey: ['projects'] })
              }}
            />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {currentStep === 'generate' ? (
          <GenerateStep
            pcbWidth={pcbArtifacts?.boardSize?.width ?? 50}
            pcbHeight={pcbArtifacts?.boardSize?.height ?? 40}
            wasmLoaded={wasmLoaded}
            isGenerating={isGenerating}
            validationStatus={validationStatus}
            validationIteration={validationIteration}
            validationIssues={validationIssues}
            renderError={renderError}
            onGenerate={handleGenerate}
          />
        ) : (
          <div className="flex-1 grid grid-cols-2 gap-4 p-4 min-h-0 overflow-hidden">
            {/* Left: OpenSCAD Editor */}
            <EditorPanel
              openScadCode={openScadCode}
              onCodeChange={setOpenScadCode}
              feedback={feedback}
              onFeedbackChange={setFeedback}
              isGenerating={isGenerating}
              isRendering={isRendering}
              validationStatus={validationStatus}
              validationIteration={validationIteration}
              onRender={handleRender}
              onRegenerate={handleRegenerate}
              onDownloadSource={handleDownloadSource}
            />

            {/* Right: 3D Preview */}
            <PreviewPanel
              stlBlobUrl={stlBlobUrl}
              stlData={stlData}
              stlViewerRef={stlViewerRef}
              isRendering={isRendering}
              renderError={renderError}
              hasBlueprint={!!blueprintUrl}
              isVisualValidating={isVisualValidating}
              onDownload={handleDownload}
              onPerformVisualValidation={performVisualValidation}
            />
          </div>
        )}

        {/* Comparison Modal */}
        {showComparison && blueprintUrl && (
          <ComparisonModal
            blueprintUrl={blueprintUrl}
            renderScreenshot={renderScreenshot}
            validationResult={visualValidationResult}
            isValidating={isVisualValidating}
            onClose={() => setShowComparison(false)}
            onAccept={handleAcceptDesign}
            onRegenerate={handleRegenerateFromComparison}
          />
        )}
      </div>
    </div>
  )
}

export default EnclosureStageView
