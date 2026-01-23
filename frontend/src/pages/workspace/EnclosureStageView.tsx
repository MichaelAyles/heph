/**
 * EnclosureStageView - Main enclosure design stage with generation, editing, and preview
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { useWorkspaceContext } from '@/components/workspace/WorkspaceLayout'
import { logger } from '@/lib/logger'
import { StageCompleteButton } from '@/components/workspace/StageCompleteButton'
import {
  renderOpenSCAD,
  createSTLBlobUrl,
  revokeSTLBlobUrl,
  preloadOpenSCAD,
} from '@/lib/openscadRenderer'
import {
  buildEnclosurePrompt,
  buildEnclosureInputFromSpec,
  buildEnclosureRegenerationPrompt,
  ENCLOSURE_VISION_SYSTEM_PROMPT,
  buildVisionEnclosurePrompt,
  buildFeatureList,
} from '@/prompts/enclosure'
import {
  OPENSCAD_VALIDATION_PROMPT,
  buildValidationPrompt,
  buildFixPrompt,
  parseValidationResponse,
  VISUAL_COMPARISON_PROMPT,
  parseVisualValidationResponse,
  type ValidationIssue,
  type VisualValidationResult,
} from '@/prompts/enclosure-validation'
import { llm, fetchImageAsBase64, getMimeTypeFromUrl } from '@/services/llm'
import type { ImageContent, TextContent } from '@/services/llm'
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

  // Helper to extract code from LLM response
  const extractCode = (content: string): string => {
    const codeMatch = content.match(/```(?:openscad)?\n([\s\S]*?)```/)
    return codeMatch ? codeMatch[1].trim() : content.trim()
  }

  // Validate OpenSCAD code and return issues
  const validateCode = useCallback(
    async (code: string): Promise<ValidationIssue[]> => {
      const pcbWidth = pcbArtifacts?.boardSize?.width ?? 50
      const pcbHeight = pcbArtifacts?.boardSize?.height ?? 40

      // Check for components
      const hasOled =
        finalSpec?.outputs?.some(
          (o) => o.type.toLowerCase().includes('oled') || o.type.toLowerCase().includes('display')
        ) ?? false
      const hasUsb = true // Always has USB-C
      const hasButtons =
        finalSpec?.inputs?.some((i) => i.type.toLowerCase().includes('button')) ?? false

      const validationPrompt = buildValidationPrompt(code, {
        pcbWidth,
        pcbHeight,
        hasOled,
        hasUsb,
        hasButtons,
      })

      const response = await llm.chat({
        messages: [
          { role: 'system', content: OPENSCAD_VALIDATION_PROMPT },
          { role: 'user', content: validationPrompt },
        ],
        temperature: 0.3,
        projectId: project?.id,
      })

      const result = parseValidationResponse(response.content)
      return result.issues
    },
    [pcbArtifacts, finalSpec, project?.id]
  )

  // Fix code based on validation issues
  const fixCode = useCallback(
    async (code: string, issues: ValidationIssue[]): Promise<string> => {
      const pcbWidth = pcbArtifacts?.boardSize?.width ?? 50
      const pcbHeight = pcbArtifacts?.boardSize?.height ?? 40

      const fixPrompt = buildFixPrompt(code, issues, { pcbWidth, pcbHeight })

      const response = await llm.chat({
        messages: [{ role: 'user', content: fixPrompt }],
        temperature: 0.5,
        projectId: project?.id,
      })

      return extractCode(response.content)
    },
    [pcbArtifacts, project?.id]
  )

  // Generate OpenSCAD code using LLM with validation loop
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
        // Vision-enabled generation: send blueprint image with prompt
        setValidationStatus('Analyzing blueprint image...')

        const blueprintBase64 = await fetchImageAsBase64(blueprintUrl)
        const mimeType = getMimeTypeFromUrl(blueprintUrl)

        // Build feature list from spec
        const features = buildFeatureList(finalSpec || {})
        const pcbWidth = pcbArtifacts.boardSize?.width ?? 50
        const pcbHeight = pcbArtifacts.boardSize?.height ?? 40

        const visionPrompt = buildVisionEnclosurePrompt({
          pcbWidth,
          pcbHeight,
          wallThickness: 2,
          features,
        })

        setValidationStatus('Generating enclosure from blueprint...')

        const response = await llm.chat({
          messages: [
            { role: 'system', content: ENCLOSURE_VISION_SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'image', mimeType, data: blueprintBase64 } as ImageContent,
                { type: 'text', text: visionPrompt } as TextContent,
              ],
            },
          ],
          temperature: 0.7,
          projectId: project.id,
        })

        code = extractCode(typeof response.content === 'string' ? response.content : '')
      } else {
        // Fallback: text-only generation
        const input = buildEnclosureInputFromSpec(
          project.name,
          spec?.description || '',
          pcbArtifacts,
          finalSpec || undefined
        )

        setValidationStatus('Generating enclosure design...')
        const prompt = buildEnclosurePrompt(input)

        const response = await llm.chat({
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          projectId: project.id,
        })

        code = extractCode(typeof response.content === 'string' ? response.content : '')
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

      logger.enclosure('Failed to generate enclosure', { error })
      setRenderError(error instanceof Error ? error.message : 'Failed to generate enclosure')
    } finally {
      if (!signal.aborted) {
        setIsGenerating(false)
      }
    }
  }, [project, spec, pcbArtifacts, finalSpec, saveEnclosureMutation, validateCode, fixCode])

  // Regenerate with feedback (includes validation loop)
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
      const input = buildEnclosureInputFromSpec(
        project.name,
        spec?.description || '',
        pcbArtifacts,
        finalSpec || undefined
      )

      // Step 1: Regenerate with feedback
      setValidationStatus('Regenerating with feedback...')
      const prompt = buildEnclosureRegenerationPrompt(openScadCode, feedback, input)

      const response = await llm.chat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        projectId: project.id,
      })

      let code = extractCode(response.content)

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

      logger.enclosure('Failed to regenerate enclosure', { error })
      setRenderError(error instanceof Error ? error.message : 'Failed to regenerate')
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

  // Perform visual validation by comparing render to blueprint
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
      const blueprintMimeType = getMimeTypeFromUrl(blueprintUrl)

      // Send both images to LLM for comparison
      const response = await llm.chat({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', mimeType: blueprintMimeType, data: blueprintBase64 } as ImageContent,
              { type: 'image', mimeType: 'image/png', data: renderBase64 } as ImageContent,
              { type: 'text', text: VISUAL_COMPARISON_PROMPT } as TextContent,
            ],
          },
        ],
        projectId: project?.id,
      })

      const result = parseVisualValidationResponse(
        typeof response.content === 'string' ? response.content : ''
      )
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
