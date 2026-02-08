/**
 * Firmware Stage View
 *
 * AI-powered firmware generation with Monaco editor and cloud compilation via PlatformIO service.
 *
 * Uses LangGraph nodes via /api/langgraph/invoke/* for all LLM calls:
 * - firmware_generate: Generate firmware from spec
 * - firmware_modify: Modify firmware with chat
 */

import { useState, useCallback, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import JSZip from 'jszip'
import { useNavigate } from 'react-router-dom'
import { useWorkspaceContext } from '@/components/workspace/WorkspaceLayout'
import { logger } from '@/lib/logger'
import { invokeLangGraphNode, BreakpointCancelledError } from '@/services/langgraph/invoke'
import { useAuthStore } from '@/stores/auth'
import { runOrchestratorNode } from '@/services/langgraph/orchestrator-runner'
import { useVibeAutomation } from '@/hooks/useVibeAutomation'
import type { FirmwareProject } from '@/prompts/firmware'
import {
  BuildPanel,
  EditorPanel,
  FileTreePanel,
  FirmwareHeader,
  FlashModal,
  FooterActions,
  NotReadyState,
  type CompileResult,
  type FileNode,
  type UploadedBinary,
  STARTER_TEMPLATE,
  flattenFiles,
  buildFileTree,
  findNode,
  updateFileContent as updateFileContentInTree,
  getFilesForSave,
  generateReadme,
} from '@/components/firmware'
import { isWebSerialSupported } from '@/services/webserial-flash'

// =============================================================================
// LangGraph API Response Types
// =============================================================================

interface FirmwareGenerateResponse {
  output: {
    files: Array<{
      path: string
      content: string
      language?: string
      type?: 'cpp' | 'h' | 'ini' | 'json'
    }>
    dependencies?: string[]
    notes?: string
  }
  nodeId: string
}

interface FirmwareModifyResponse {
  output: {
    files: Array<{
      path: string
      content: string
      language?: string
      type?: 'cpp' | 'h' | 'ini' | 'json'
    }>
    changesApplied: string[]
    notes?: string
  }
  nodeId: string
}

export function FirmwareStageView() {
  const { project } = useWorkspaceContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const controlMode = user?.controlMode || 'fix_it'
  const isVibeMode = controlMode === 'vibe_it'

  // File tree state
  const [fileTree, setFileTree] = useState<FileNode[]>(STARTER_TEMPLATE)
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['include', 'src']))

  // Editor state
  const [editorContent, setEditorContent] = useState<string>('')
  const [isDirty, setIsDirty] = useState(false)

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)

  // Chat state for modifications
  const [showChat, setShowChat] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [isModifying, setIsModifying] = useState(false)

  // Upload state
  const [uploadedBinary, setUploadedBinary] = useState<UploadedBinary | null>(null)

  // Compile state
  const [isCompiling, setIsCompiling] = useState(false)
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null)
  const [selectedBoard, setSelectedBoard] = useState('esp32-c6-devkitc-1')
  const [showVibePostCompileSplash, setShowVibePostCompileSplash] = useState(false)

  // Flash state
  const [showFlashModal, setShowFlashModal] = useState(false)
  const [isFlashing, setIsFlashing] = useState(false)
  const webSerialSupported = isWebSerialSupported()

  const spec = project?.spec
  const enclosureComplete = spec?.stages?.enclosure?.status === 'complete'

  const invokeFirmwareNode = useCallback(
    async (nodeName: string, input: Record<string, unknown>) => {
      if (isVibeMode) {
        return runOrchestratorNode({
          nodeName,
          input,
          projectId: project?.id,
        })
      }

      return invokeLangGraphNode({
        nodeName,
        input,
        projectId: project?.id,
      })
    },
    [isVibeMode, project?.id]
  )

  // Load saved firmware from project spec
  useEffect(() => {
    if (project?.spec?.firmware?.files && project.spec.firmware.files.length > 0) {
      const savedFiles = project.spec.firmware.files.map((f) => ({
        ...f,
        language: f.language as 'cpp' | 'h' | 'ini' | 'json',
      }))
      const tree = buildFileTree(savedFiles)
      setFileTree(tree)
    }
  }, [project?.spec?.firmware?.files])

  // Select first file when tree changes
  useEffect(() => {
    if (!selectedFile && fileTree.length > 0) {
      const firstFile = flattenFiles(fileTree).find(
        (f) => f.path.endsWith('.cpp') || f.path.endsWith('.h')
      )
      if (firstFile) {
        const node = findNode(fileTree, firstFile.path)
        if (node) {
          setSelectedFile(node)
          setEditorContent(node.content || '')
        }
      }
    }
  }, [fileTree, selectedFile])

  // Save firmware to project
  const saveMutation = useMutation({
    mutationFn: async (files: FirmwareProject['files']) => {
      const spec = project?.spec || {
        description: '',
        feasibility: null,
        openQuestions: [],
        decisions: [],
        blueprints: [],
        selectedBlueprint: null,
        finalSpec: null,
      }

      // Convert files to match FirmwareFile schema (cpp | c | h | json)
      const firmwareFiles = files.map((f) => ({
        path: f.path,
        content: f.content,
        language: f.language === 'ini' ? 'json' : f.language, // Map ini to json for storage
      }))

      // Update firmware artifacts
      spec.firmware = {
        files: firmwareFiles as {
          path: string
          content: string
          language: 'cpp' | 'c' | 'h' | 'json'
        }[],
        buildStatus: 'pending',
      }

      // Update stage status
      spec.stages = spec.stages || {
        spec: { status: 'complete' },
        pcb: { status: 'complete' },
        enclosure: { status: 'complete' },
        firmware: { status: 'pending' },
        export: { status: 'pending' },
      }
      spec.stages.firmware = {
        status: 'complete',
        completedAt: new Date().toISOString(),
      }

      const response = await fetch(`/api/projects/${project?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec }),
      })

      if (!response.ok) throw new Error('Failed to save firmware')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project?.id] })
    },
  })

  const completeFirmwareStage = useCallback(async () => {
    if (!project?.id || !project.spec) return false

    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spec: {
          ...project.spec,
          stages: {
            ...project.spec.stages,
            firmware: {
              status: 'complete',
              completedAt: new Date().toISOString(),
            },
          },
        },
      }),
    })

    if (!res.ok) return false

    queryClient.invalidateQueries({ queryKey: ['project', project.id] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    return true
  }, [project?.id, project?.spec, queryClient])

  const handleSelectFile = useCallback(
    async (node: FileNode) => {
      // Save current file first if dirty
      if (selectedFile && isDirty && editorContent !== selectedFile.content) {
        // Update local state
        setFileTree((prev) => updateFileContentInTree(prev, selectedFile.path, editorContent))

        // Save to server with updated content
        const filesToSave = getFilesForSave(fileTree, selectedFile.path, editorContent)
        try {
          await saveMutation.mutateAsync(filesToSave)
        } catch (err) {
          logger.firmware('Failed to auto-save firmware', { error: err })
          // Continue with file switch even if save failed - data is in local state
        }
      }

      setSelectedFile(node)
      setEditorContent(node.content || '')
      setIsDirty(false)
    },
    [selectedFile, editorContent, isDirty, fileTree, saveMutation]
  )

  const handleToggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setEditorContent(value)
      setIsDirty(true)
    }
  }, [])

  // Generate firmware using LangGraph firmware_generate node
  const handleGenerate = async () => {
    if (!project) return

    setIsGenerating(true)
    setGenerationError(null)

    try {
      // Empty input - all context from @variables
      // Uses @projectName, @description, @finalSpec, @pcb.placedBlocks, @pcb.netList in system prompt
      const genData = await invokeFirmwareNode('firmware_generate', {})

      const result = genData.output as FirmwareGenerateResponse['output']

      if (!result.files || result.files.length === 0) {
        throw new Error('No files generated')
      }

      // Transform to FirmwareProject format
      const firmwareFiles: FirmwareProject['files'] = result.files.map((f) => ({
        path: f.path,
        content: f.content,
        language: (f.language || f.type || 'cpp') as 'cpp' | 'h' | 'ini' | 'json',
      }))

      const tree = buildFileTree(firmwareFiles)
      setFileTree(tree)
      setSelectedFile(null) // Reset selection
      setIsDirty(false)

      // Save to project
      await saveMutation.mutateAsync(firmwareFiles)
    } catch (error) {
      if (error instanceof BreakpointCancelledError) {
        setGenerationError('Generation cancelled at debug breakpoint')
      } else {
        logger.firmware('Firmware generation failed', { error })
        setGenerationError(error instanceof Error ? error.message : 'Generation failed')
      }
    } finally {
      setIsGenerating(false)
    }
  }

  const applyFirmwareModification = useCallback(
    async (request: string): Promise<boolean> => {
      if (!project || !request.trim()) return false

      const currentFiles: FirmwareProject['files'] = flattenFiles(fileTree).map((f) => ({
        path: f.path,
        content: f.content,
        language: (f.path.endsWith('.h') ? 'h' : f.path.endsWith('.ini') ? 'ini' : 'cpp') as
          | 'cpp'
          | 'h'
          | 'ini'
          | 'json',
      }))

      // Only runtime inputs - files and modification request
      // Project context accessed via @finalSpec, @pcb.netList in system prompt
      const modifyData = await invokeFirmwareNode('firmware_modify', {
        currentFiles,
        request,
      })

      const result = modifyData.output as FirmwareModifyResponse['output']
      if (!result.files || result.files.length === 0) {
        throw new Error('No files in response')
      }

      // Merge updated files with existing
      const updatedTree = [...fileTree]
      for (const file of result.files) {
        const existingNode = findNode(updatedTree, file.path)
        if (existingNode) {
          existingNode.content = file.content
        }
      }
      setFileTree([...updatedTree])

      // Update selected file content if it was modified
      if (selectedFile) {
        const updated = result.files.find((f) => f.path === selectedFile.path)
        if (updated) {
          setEditorContent(updated.content)
        }
      }

      // Save to project
      const allFiles: FirmwareProject['files'] = flattenFiles(updatedTree).map((f) => ({
        path: f.path,
        content: f.content,
        language: (f.path.endsWith('.h') ? 'h' : f.path.endsWith('.ini') ? 'ini' : 'cpp') as
          | 'cpp'
          | 'h'
          | 'ini'
          | 'json',
      }))
      await saveMutation.mutateAsync(allFiles)
      setIsDirty(false)
      return true
    },
    [fileTree, invokeFirmwareNode, project, saveMutation, selectedFile]
  )

  // Modify firmware using LangGraph firmware_modify node
  const handleModify = async () => {
    if (!project || !chatInput.trim()) return

    setIsModifying(true)
    setGenerationError(null)

    try {
      const modified = await applyFirmwareModification(chatInput)
      if (modified) {
        setChatInput('')
        setShowChat(false)
      }
    } catch (error) {
      logger.firmware('Firmware modification failed', { error })
      setGenerationError(error instanceof Error ? error.message : 'Modification failed')
    } finally {
      setIsModifying(false)
    }
  }

  // Download as ZIP
  const handleDownloadSource = async () => {
    // Save current editor changes first
    if (selectedFile && editorContent !== selectedFile.content) {
      setFileTree((prev) => updateFileContentInTree(prev, selectedFile.path, editorContent))
    }

    const zip = new JSZip()
    const files = flattenFiles(fileTree)

    for (const file of files) {
      zip.file(file.path, file.content)
    }

    // Add README with build instructions
    zip.file('README.md', generateReadme(project?.name || 'PHAESTUS'))

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project?.name?.toLowerCase().replace(/\s+/g, '-') || 'phaestus'}-firmware.zip`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Handle binary upload
  const handleUploadBinary = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const validExtensions = ['.bin', '.hex', '.elf']
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
    if (!validExtensions.includes(extension)) {
      setGenerationError('Please upload a .bin, .hex, or .elf file')
      return
    }

    setUploadedBinary({ name: file.name, size: file.size })
    setGenerationError(null)

    // In a real implementation, we'd upload this to R2 for distribution
    // For now, just acknowledge the upload
  }

  const runCompile = useCallback(async (): Promise<CompileResult> => {
    // Gather all files from the file tree
    const files = flattenFiles(fileTree).map((f) => ({
      path: f.path,
      content: f.content,
    }))

    // Include current editor content if it has unsaved changes
    if (selectedFile && editorContent !== selectedFile.content) {
      const existingIndex = files.findIndex((f) => f.path === selectedFile.path)
      if (existingIndex >= 0) {
        files[existingIndex].content = editorContent
      }
    }

    logger.firmware('Starting compilation', { board: selectedBoard, fileCount: files.length })

    const response = await fetch('/api/firmware/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files,
        board: selectedBoard,
        framework: 'arduino',
      }),
    })

    return (await response.json()) as CompileResult
  }, [editorContent, fileTree, selectedBoard, selectedFile])

  // Compile firmware via PlatformIO service
  const handleCompile = useCallback(async (): Promise<CompileResult> => {
    setIsCompiling(true)
    setCompileResult(null)
    setGenerationError(null)

    try {
      const result = await runCompile()
      setCompileResult(result)

      if (result.success && result.firmware) {
        logger.firmware('Compilation succeeded', {
          firmwareSize: result.firmwareSize,
          duration: result.duration,
        })
      } else {
        logger.firmware('Compilation failed', { error: result.error })
      }

      return result
    } catch (error) {
      logger.firmware('Compile request failed', { error })
      const failedResult: CompileResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to connect to compile service',
        buildOutput: '',
      }
      setCompileResult(failedResult)
      return failedResult
    } finally {
      setIsCompiling(false)
    }
  }, [runCompile])

  // Download compiled binary
  const handleDownloadBinary = () => {
    if (!compileResult?.firmware) return

    // Decode base64 firmware to binary
    const binaryStr = atob(compileResult.firmware)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }

    const blob = new Blob([bytes], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project?.name?.toLowerCase().replace(/\s+/g, '-') || 'firmware'}.bin`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Open flash modal
  const handleFlashToDevice = () => {
    if (!compileResult?.firmware) return
    setShowFlashModal(true)
  }

  const handleContinueToExport = useCallback(async () => {
    if (!project?.id) return
    setShowVibePostCompileSplash(false)
    const completed = await completeFirmwareStage()
    if (completed) {
      navigate(`/project/${project.id}/export`)
    }
  }, [completeFirmwareStage, navigate, project?.id])

  // Vibe mode: auto-generate, auto-compile, auto-fix compile failures, then advance.
  useVibeAutomation({
    enabled: isVibeMode && enclosureComplete && !!project?.id,
    key: `firmware:${project?.id}`,
    run: async (signal) => {
      if (!project?.id) return

      const hasGeneratedFirmware = (project.spec?.firmware?.files?.length || 0) > 0
      if (!hasGeneratedFirmware) {
        await handleGenerate()
        if (signal.aborted) return
      }

      let result = await handleCompile()
      let attempts = 0

      while (!result.success && attempts < 3 && !signal.aborted) {
        attempts++
        const compileErrorContext = [
          'Fix all compilation errors in the firmware.',
          `Attempt: ${attempts}`,
          `Compiler error: ${result.error || 'Unknown error'}`,
          `Build output:\n${result.buildOutput || 'No build output available'}`,
        ].join('\n\n')

        setIsModifying(true)
        try {
          const modified = await applyFirmwareModification(compileErrorContext)
          if (!modified) break
        } finally {
          setIsModifying(false)
        }

        result = await handleCompile()
      }

      if (!result.success || signal.aborted) {
        return
      }
      setShowVibePostCompileSplash(true)
    },
    onError: (error) => {
      logger.firmware('Vibe firmware automation failed', { error })
    },
  })

  if (!enclosureComplete) {
    return <NotReadyState />
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <FirmwareHeader
        spec={spec || null}
        projectId={project?.id || ''}
        uploadedBinary={uploadedBinary}
        isGenerating={isGenerating}
        generationError={generationError}
        showChat={showChat}
        chatInput={chatInput}
        isModifying={isModifying}
        hasFirmwareFiles={!!spec?.firmware?.files?.length}
        onGenerate={handleGenerate}
        onToggleChat={() => setShowChat(!showChat)}
        onChatInputChange={setChatInput}
        onModify={handleModify}
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['project', project?.id] })
          queryClient.invalidateQueries({ queryKey: ['projects'] })
          if (isVibeMode && project?.id) {
            navigate(`/project/${project.id}/export`)
          }
        }}
      />

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* File tree */}
        <FileTreePanel
          fileTree={fileTree}
          selectedPath={selectedFile?.path || null}
          expandedFolders={expandedFolders}
          onSelectFile={handleSelectFile}
          onToggleFolder={handleToggleFolder}
        />

        {/* Editor */}
        <EditorPanel
          selectedFile={selectedFile}
          editorContent={editorContent}
          onEditorChange={handleEditorChange}
        />
      </div>

      {/* Build panel */}
      <BuildPanel
        isCompiling={isCompiling}
        compileResult={compileResult}
        onDownloadBinary={handleDownloadBinary}
        onRetry={handleCompile}
        onFlashToDevice={handleFlashToDevice}
        isFlashing={isFlashing}
        isWebSerialSupported={webSerialSupported}
      />

      {/* Flash modal */}
      {compileResult?.firmware && (
        <FlashModal
          isOpen={showFlashModal}
          onClose={() => {
            setShowFlashModal(false)
            setIsFlashing(false)
          }}
          firmwareBase64={compileResult.firmware}
          firmwareSize={compileResult.firmwareSize || 0}
          projectName={project?.name || 'PHAESTUS Firmware'}
        />
      )}

      {/* Footer actions */}
      <FooterActions
        onDownloadSource={handleDownloadSource}
        onUploadBinary={handleUploadBinary}
        onCompile={handleCompile}
        isCompiling={isCompiling}
        selectedBoard={selectedBoard}
        onBoardChange={setSelectedBoard}
      />

      {showVibePostCompileSplash && compileResult?.success && compileResult.firmware && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border border-emerald-500/30 bg-surface-900 shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-semibold text-steel">Firmware compiled successfully</h3>
            <p className="text-sm text-steel-dim">
              You can flash this build now if your hardware is connected, or continue to the
              manufacturing export page.
            </p>
            <p className="text-xs text-surface-400">
              Return to this page and press{' '}
              <span className="font-medium text-copper">Flash to device</span> when you have the
              hardware.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => {
                  setShowVibePostCompileSplash(false)
                  handleFlashToDevice()
                }}
                className="px-3 py-2 rounded bg-copper/20 text-copper hover:bg-copper/30 transition-colors text-sm"
              >
                Flash To Device
              </button>
              <button
                onClick={() => void handleContinueToExport()}
                className="px-3 py-2 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors text-sm"
              >
                Go To Export
              </button>
              <button
                onClick={() => setShowVibePostCompileSplash(false)}
                className="px-3 py-2 rounded bg-surface-700 text-steel-dim hover:text-steel hover:bg-surface-600 transition-colors text-sm"
              >
                Stay Here
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
