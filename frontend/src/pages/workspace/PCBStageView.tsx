import { useState, useMemo, useCallback } from 'react'
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Cpu,
  ArrowRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Grid3X3,
  Wand2,
  Box,
  Download,
  FileText,
  Sparkles,
  LayoutGrid,
  Network,
  Layers,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useWorkspaceContext } from '../../components/workspace/WorkspaceLayout'
import { BlockSelector } from '../../components/pcb/BlockSelector'
import { PCB3DViewer } from '../../components/pcb/PCB3DViewer'
import { GridEditor } from '../../components/pcb/GridEditor'
import { BusConnectionDiagram } from '../../components/pcb/BusConnectionDiagram'
import { GerberViewer } from '../../components/pcb/GerberViewer'
import { StageCompleteButton } from '../../components/workspace/StageCompleteButton'
import { mergeBlockSchematics, mergeBlockPCBs } from '../../services/pcb-merge'
import { generatePCBDocument } from '../../services/pcb-document'
import {
  buildPCBSelectionMessages,
  toBlockCatalogEntry,
  parsePCBSuggestionResponse,
  validatePCBSuggestion,
} from '../../prompts/pcb-selection'
import { validateGrid, fromPlacedBlocks, calculateBoardSize } from '../../services/pcb-grid'
import { logger } from '../../lib/logger'
import type { PcbBlock, PlacedBlock, PCBArtifacts, NetAssignment } from '../../db/schema'
import type { BlockDefinition } from '../../schemas/block'

type PCBStep = 'select_blocks' | 'generating' | 'preview'
type ViewMode = 'grid' | 'bus' | 'gerbers' | '3d' | 'docs'

export function PCBStageView() {
  const { project } = useWorkspaceContext()
  const queryClient = useQueryClient()
  const [currentStep, setCurrentStep] = useState<PCBStep>('select_blocks')
  const [selectedBlocks, setSelectedBlocks] = useState<PlacedBlock[]>([])
  const [isMerging, setIsMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [isAiSuggesting, setIsAiSuggesting] = useState(false)
  const [gridWidth, setGridWidth] = useState(4)
  const [gridHeight, setGridHeight] = useState(6)
  const [gerberLayers, setGerberLayers] = useState<Record<string, string>>({})
  const [isLoadingGerbers, setIsLoadingGerbers] = useState(false)

  const specComplete = project?.status === 'complete'
  const spec = project?.spec

  // Get existing PCB data from spec
  const pcbArtifacts = spec?.pcb

  // Fetch all available blocks for merging
  const { data: blocksData } = useQuery({
    queryKey: ['blocks'],
    queryFn: async () => {
      const res = await fetch('/api/blocks')
      if (!res.ok) throw new Error('Failed to fetch blocks')
      return res.json() as Promise<{ blocks: PcbBlock[] }>
    },
  })

  // Build block definitions map
  const blockDefinitions = useMemo(() => {
    const map = new Map<string, BlockDefinition>()
    if (blocksData?.blocks) {
      for (const block of blocksData.blocks) {
        if (block.definition) {
          map.set(block.slug, block.definition)
        }
      }
    }
    return map
  }, [blocksData?.blocks])

  // Initialize selected blocks from spec if available
  useMemo(() => {
    if (pcbArtifacts?.placedBlocks && selectedBlocks.length === 0) {
      setSelectedBlocks(pcbArtifacts.placedBlocks)
    }
  }, [pcbArtifacts?.placedBlocks])

  // Validate current placement and calculate board size
  const { validationResult, boardSize } = useMemo(() => {
    if (selectedBlocks.length === 0) return { validationResult: null, boardSize: null }
    const gridState = fromPlacedBlocks(selectedBlocks, blockDefinitions, gridWidth, gridHeight)
    return {
      validationResult: validateGrid(gridState),
      boardSize: calculateBoardSize(gridState),
    }
  }, [selectedBlocks, blockDefinitions, gridWidth, gridHeight])

  // Generate documentation
  const documentOutput = useMemo(() => {
    if (selectedBlocks.length === 0 || !project?.name) return null
    return generatePCBDocument({
      projectName: project.name,
      projectDescription: project.description || undefined,
      finalSpec: spec?.finalSpec,
      placedBlocks: selectedBlocks,
      blockDefinitions,
      gridWidth,
      gridHeight,
      schematicFilename: `${project.name.toLowerCase().replace(/\s+/g, '-')}.kicad_sch`,
    })
  }, [
    selectedBlocks,
    project?.name,
    project?.description,
    spec?.finalSpec,
    blockDefinitions,
    gridWidth,
    gridHeight,
  ])

  // Mutation to save PCB data
  const savePCBMutation = useMutation({
    mutationFn: async (pcbData: Partial<PCBArtifacts> & { placedBlocks: PlacedBlock[] }) => {
      const res = await fetch(`/api/projects/${project?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spec: {
            ...spec,
            pcb: {
              ...spec?.pcb,
              ...pcbData,
            },
            stages: {
              ...spec?.stages,
              pcb: { status: pcbData.schematicData ? 'complete' : 'in_progress' },
            },
          },
        }),
      })
      if (!res.ok) throw new Error('Failed to save PCB data')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project?.id] })
    },
  })

  // Handle block selection from sidebar
  const handleSelectBlock = (block: PcbBlock) => {
    // Auto-place on next available grid position
    const gridPositions = selectedBlocks.map((b) => `${b.gridX},${b.gridY}`)
    let gridX = 0
    let gridY = 0

    // Simple auto-placement: find first available position in a row
    while (gridPositions.includes(`${gridX},${gridY}`)) {
      gridX++
      if (gridX >= gridWidth) {
        gridX = 0
        gridY++
      }
    }

    const newBlock: PlacedBlock = {
      blockId: `${block.id}-${Date.now()}`,
      blockSlug: block.slug,
      gridX,
      gridY,
      rotation: 0,
    }

    const updatedBlocks = [...selectedBlocks, newBlock]
    setSelectedBlocks(updatedBlocks)

    // Save to server
    savePCBMutation.mutate({ placedBlocks: updatedBlocks })
  }

  // Handle blocks change from GridEditor
  const handleBlocksChange = useCallback(
    (blocks: PlacedBlock[]) => {
      setSelectedBlocks(blocks)
      savePCBMutation.mutate({ placedBlocks: blocks })
    },
    [savePCBMutation]
  )

  // Handle block removal
  const handleRemoveBlock = (blockId: string) => {
    const updatedBlocks = selectedBlocks.filter((b) => b.blockId !== blockId)
    setSelectedBlocks(updatedBlocks)
    savePCBMutation.mutate({ placedBlocks: updatedBlocks })
  }

  // Load gerber files for selected blocks
  const loadGerbers = useCallback(async () => {
    if (selectedBlocks.length === 0 || !blocksData?.blocks) {
      setGerberLayers({})
      return
    }

    setIsLoadingGerbers(true)
    const layers: Record<string, string> = {}

    try {
      // Get unique block slugs
      const uniqueSlugs = [...new Set(selectedBlocks.map((b) => b.blockSlug))]

      for (const slug of uniqueSlugs) {
        const block = blocksData.blocks.find((b) => b.slug === slug)
        if (!block?.files?.gerbers) continue

        // Fetch the gerber ZIP
        const res = await fetch(`/api/blocks/${slug}/files/${block.files.gerbers}`)
        if (!res.ok) continue

        // The gerbers are stored as a ZIP, we need to extract them
        // For now, fetch individual layer files if they exist
        const gerberFiles = [
          { name: `${slug}-F_Cu.gtl`, layer: `${slug}-F.Cu` },
          { name: `${slug}-B_Cu.gbl`, layer: `${slug}-B.Cu` },
          { name: `${slug}-In1_Cu.g2`, layer: `${slug}-In1.Cu` },
          { name: `${slug}-In2_Cu.g3`, layer: `${slug}-In2.Cu` },
          { name: `${slug}-F_Mask.gts`, layer: `${slug}-F.Mask` },
          { name: `${slug}-B_Mask.gbs`, layer: `${slug}-B.Mask` },
          { name: `${slug}-F_Silkscreen.gto`, layer: `${slug}-F.SilkS` },
          { name: `${slug}-B_Silkscreen.gbo`, layer: `${slug}-B.SilkS` },
          { name: `${slug}-Edge_Cuts.gm1`, layer: `${slug}-Edge.Cuts` },
        ]

        // Try to load individual gerber files
        for (const gf of gerberFiles) {
          try {
            const gRes = await fetch(`/api/blocks/${slug}/files/gerbers/${gf.name}`)
            if (gRes.ok) {
              const content = await gRes.text()
              layers[gf.layer] = content
            }
          } catch {
            // Skip files that don't exist
          }
        }
      }

      setGerberLayers(layers)
    } catch (error) {
      logger.error('pcb', 'Failed to load gerbers', { error })
    } finally {
      setIsLoadingGerbers(false)
    }
  }, [selectedBlocks, blocksData?.blocks])

  // Handle AI suggestion
  const handleAiSuggest = useCallback(async () => {
    if (!blocksData?.blocks || !spec?.finalSpec) return

    setIsAiSuggesting(true)
    try {
      // Build catalog entries
      const catalogEntries = blocksData.blocks
        .filter((b) => b.definition)
        .map((b) => toBlockCatalogEntry(b.definition!))

      // Build messages
      const messages = buildPCBSelectionMessages({
        projectName: project?.name || 'Untitled',
        description: spec.finalSpec.summary || project?.description || '',
        finalSpec: spec.finalSpec,
        availableBlocks: catalogEntries,
      })

      // Call LLM
      const res = await fetch('/api/llm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          temperature: 0.3,
          projectId: project?.id,
        }),
      })

      if (!res.ok) throw new Error('Failed to get AI suggestion')

      const data = await res.json()
      const suggestion = parsePCBSuggestionResponse(data.content)

      if (!suggestion) {
        throw new Error('Failed to parse AI suggestion')
      }

      // Validate suggestion
      const validation = validatePCBSuggestion(suggestion, catalogEntries)
      if (!validation.valid) {
        logger.warn('pcb', 'AI suggestion has validation issues', { errors: validation.errors })
      }

      // Update grid size
      setGridWidth(Math.max(2, suggestion.boardSize.width))
      setGridHeight(Math.max(4, suggestion.boardSize.height))

      // Convert to PlacedBlock format
      const newBlocks: PlacedBlock[] = suggestion.blocks.map((b, idx) => ({
        blockId: `${b.slug}-${Date.now()}-${idx}`,
        blockSlug: b.slug,
        gridX: b.gridX,
        gridY: b.gridY,
        rotation: b.rotation,
      }))

      setSelectedBlocks(newBlocks)
      savePCBMutation.mutate({ placedBlocks: newBlocks })
    } catch (error) {
      logger.error('pcb', 'AI suggestion failed', { error })
      setMergeError(error instanceof Error ? error.message : 'AI suggestion failed')
    } finally {
      setIsAiSuggesting(false)
    }
  }, [blocksData?.blocks, spec?.finalSpec, project, savePCBMutation])

  // Handle schematic and PCB merge - the critical integration!
  const handleMergeSchematic = useCallback(async () => {
    if (selectedBlocks.length === 0) return
    if (!blocksData?.blocks) return
    if (!project?.name) return

    setIsMerging(true)
    setMergeError(null)
    setCurrentStep('generating')

    try {
      // Filter to get only the blocks that are selected
      const selectedBlockData = blocksData.blocks.filter((b) =>
        selectedBlocks.some((sb) => sb.blockSlug === b.slug)
      )

      // Merge schematic
      const schematicResult = await mergeBlockSchematics(
        selectedBlocks,
        selectedBlockData,
        project.name
      )

      // Merge PCB layout
      let pcbData: string | undefined
      let pcbMergeError: string | undefined
      try {
        // Check which blocks have PCB files before attempting merge
        const blocksWithPcb = selectedBlockData.filter((b) => b.files?.pcb)
        const blocksWithoutPcb = selectedBlockData.filter((b) => !b.files?.pcb)

        if (blocksWithoutPcb.length > 0) {
          logger.warn('pcb', 'Some blocks missing PCB files', {
            missing: blocksWithoutPcb.map((b) => b.slug),
          })
        }

        if (blocksWithPcb.length === 0) {
          pcbMergeError = `No PCB files available. Missing: ${blocksWithoutPcb.map((b) => b.slug).join(', ')}`
        } else {
          const pcbResult = await mergeBlockPCBs(selectedBlocks, selectedBlockData, project.name)
          pcbData = pcbResult.pcb
        }
      } catch (pcbError) {
        const errorMsg = pcbError instanceof Error ? pcbError.message : 'PCB merge failed'
        pcbMergeError = errorMsg
        logger.warn('pcb', 'PCB merge failed', { error: pcbError })
      }

      // Log PCB merge error if there was one
      if (pcbMergeError) {
        logger.info('pcb', 'PCB merge unavailable', { reason: pcbMergeError })
      }

      // Transform netList to match schema type
      const transformedNetList: NetAssignment[] = schematicResult.netList.map((n) => ({
        net: n.localNet,
        globalNet: n.globalNet,
        gpio: n.gpio,
      }))

      // Save merged schematic and PCB data to the project
      await savePCBMutation.mutateAsync({
        placedBlocks: selectedBlocks,
        schematicData: schematicResult.schematic,
        pcbData,
        boardSize: { ...schematicResult.boardSize, unit: 'mm' as const },
        netList: transformedNetList,
        mergedAt: new Date().toISOString(),
      })

      setCurrentStep('preview')
      setViewMode('gerbers')
      // Load gerber files for display
      loadGerbers()
    } catch (error) {
      logger.error('pcb', 'Merge failed', { error })
      setMergeError(error instanceof Error ? error.message : 'Failed to merge schematics')
      setCurrentStep('select_blocks')
    } finally {
      setIsMerging(false)
    }
  }, [selectedBlocks, blocksData?.blocks, project?.name, savePCBMutation])

  // Handle documentation download
  const handleDownloadDocs = useCallback(() => {
    if (!documentOutput || !project?.name) return

    const blob = new Blob([documentOutput.markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '-')}-pcb-design.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [documentOutput, project?.name])

  // Update currentStep based on existing data
  useMemo(() => {
    if (pcbArtifacts?.schematicData && currentStep === 'select_blocks') {
      setCurrentStep('preview')
    }
  }, [pcbArtifacts?.schematicData])

  if (!specComplete) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4">
            <Cpu className="w-8 h-8 text-surface-500" strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-semibold text-steel mb-2">PCB Design</h2>
          <p className="text-steel-dim mb-4">
            Complete the spec stage first to begin PCB design. The AI will select circuit blocks and
            create your schematic automatically.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-surface-500">
            <span>Complete Spec</span>
            <ArrowRight className="w-4 h-4" />
            <span>Design PCB</span>
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
            <h2 className="text-xl font-semibold text-steel mb-1">PCB Design</h2>
            <p className="text-steel-dim text-sm">
              Select and place circuit blocks to build your schematic
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Step indicators */}
            <div className="flex items-center gap-2">
              <StepIndicator
                step={1}
                label="Select Blocks"
                active={currentStep === 'select_blocks'}
                complete={currentStep !== 'select_blocks'}
                onClick={() => setCurrentStep('select_blocks')}
                canClick={currentStep !== 'select_blocks' && currentStep !== 'generating'}
              />
              <ArrowRight className="w-4 h-4 text-surface-600" />
              <StepIndicator
                step={2}
                label="Generate"
                active={currentStep === 'generating'}
                complete={currentStep === 'preview'}
              />
              <ArrowRight className="w-4 h-4 text-surface-600" />
              <StepIndicator
                step={3}
                label="Preview"
                active={currentStep === 'preview'}
                complete={false}
              />
            </div>
            {/* User mark complete button */}
            <StageCompleteButton
              stage="pcb"
              spec={spec || null}
              projectId={project?.id || ''}
              canComplete={!!pcbArtifacts?.schematicData && selectedBlocks.length > 0}
              onComplete={() => {
                queryClient.invalidateQueries({ queryKey: ['project', project?.id] })
                queryClient.invalidateQueries({ queryKey: ['projects'] })
              }}
            />
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left sidebar: Block selector */}
        <aside className="w-80 border-r border-surface-700 flex flex-col min-h-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-surface-700 flex items-center justify-between bg-surface-800/50">
            <span className="text-xs font-medium text-steel-dim uppercase tracking-wider">
              Block Catalog
            </span>
            <button
              onClick={handleAiSuggest}
              disabled={isAiSuggesting || !spec?.finalSpec}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                isAiSuggesting
                  ? 'bg-surface-700 text-steel-dim cursor-wait'
                  : 'bg-copper/20 text-copper hover:bg-copper/30'
              )}
              title="Let AI suggest blocks based on your spec"
            >
              {isAiSuggesting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              AI Suggest
            </button>
          </div>
          <BlockSelector
            selectedBlocks={selectedBlocks}
            onSelectBlock={handleSelectBlock}
            onRemoveBlock={handleRemoveBlock}
            disabled={currentStep === 'generating'}
            className="flex-1"
          />
        </aside>

        {/* Main panel */}
        <main className="flex-1 flex flex-col min-h-0 p-4 gap-4">
          {/* View mode toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 bg-surface-800 rounded p-0.5">
              <ViewModeButton
                mode="grid"
                currentMode={viewMode}
                onClick={() => setViewMode('grid')}
                icon={LayoutGrid}
                label="Grid"
              />
              <ViewModeButton
                mode="bus"
                currentMode={viewMode}
                onClick={() => setViewMode('bus')}
                icon={Network}
                label="Bus"
              />
              <ViewModeButton
                mode="gerbers"
                currentMode={viewMode}
                onClick={() => {
                  setViewMode('gerbers')
                  loadGerbers()
                }}
                icon={Layers}
                label="Gerbers"
                disabled={selectedBlocks.length === 0}
              />
              <ViewModeButton
                mode="3d"
                currentMode={viewMode}
                onClick={() => setViewMode('3d')}
                icon={Box}
                label="3D"
                disabled={selectedBlocks.length === 0}
              />
              <ViewModeButton
                mode="docs"
                currentMode={viewMode}
                onClick={() => setViewMode('docs')}
                icon={FileText}
                label="Docs"
                disabled={selectedBlocks.length === 0}
              />
            </div>

            <div className="flex items-center gap-2">
              {/* Board size info */}
              {boardSize && boardSize.width > 0 && (
                <span className="text-xs text-steel-dim px-2 py-1 bg-surface-800 rounded font-mono">
                  {boardSize.widthMm.toFixed(1)}×{boardSize.heightMm.toFixed(1)}mm (
                  {boardSize.width}×{boardSize.height} units)
                </span>
              )}

              {/* Validation status */}
              {validationResult && (
                <div
                  className={clsx(
                    'flex items-center gap-1 px-2 py-1 rounded text-xs',
                    validationResult.valid
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-red-500/10 text-red-400'
                  )}
                >
                  {validationResult.valid ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" />
                      Valid
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3" />
                      {validationResult.errors.length} error(s)
                    </>
                  )}
                </div>
              )}

              {/* Download buttons */}
              {documentOutput && viewMode === 'docs' && (
                <button
                  onClick={handleDownloadDocs}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-surface-700 hover:bg-surface-600 text-steel rounded transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Download MD
                </button>
              )}
              {/* Generate button - always visible when blocks are selected */}
              {selectedBlocks.length > 0 && (
                <button
                  onClick={handleMergeSchematic}
                  disabled={isMerging || !validationResult?.valid}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors',
                    isMerging
                      ? 'bg-surface-700 text-steel-dim cursor-wait'
                      : validationResult?.valid
                        ? 'bg-copper text-surface-900 hover:bg-copper-light'
                        : 'bg-surface-700 text-steel-dim cursor-not-allowed'
                  )}
                >
                  {isMerging ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : pcbArtifacts?.schematicData ? (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Regenerate
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Generate
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Main viewer area */}
          <div className="flex-1 bg-surface-900 rounded-lg border border-surface-700 flex flex-col min-h-0 overflow-hidden">
            {/* View content */}
            <div className="flex-1 min-h-0 overflow-auto">
              {viewMode === 'grid' ? (
                <div className="p-4 flex justify-center">
                  <GridEditor
                    placedBlocks={selectedBlocks}
                    blockDefinitions={blockDefinitions}
                    onBlocksChange={handleBlocksChange}
                    gridWidth={gridWidth}
                    gridHeight={gridHeight}
                    disabled={currentStep === 'generating'}
                  />
                </div>
              ) : viewMode === 'bus' ? (
                <div className="p-4">
                  <BusConnectionDiagram
                    placedBlocks={selectedBlocks}
                    blockDefinitions={blockDefinitions}
                    variant="diagram"
                  />
                </div>
              ) : viewMode === 'gerbers' ? (
                isLoadingGerbers ? (
                  <div className="flex-1 flex items-center justify-center h-full">
                    <Loader2 className="w-8 h-8 text-copper animate-spin" />
                  </div>
                ) : Object.keys(gerberLayers).length > 0 ? (
                  <GerberViewer layers={gerberLayers} className="w-full h-full" />
                ) : (
                  <div className="flex-1 flex items-center justify-center h-full">
                    <div className="text-center">
                      <Layers className="w-12 h-12 text-surface-600 mx-auto mb-3" strokeWidth={1} />
                      <p className="text-steel-dim text-sm mb-2">No Gerber files available</p>
                      <p className="text-xs text-surface-500">
                        Generate the design first or ensure blocks have Gerber files
                      </p>
                    </div>
                  </div>
                )
              ) : viewMode === '3d' && selectedBlocks.length > 0 && blocksData?.blocks ? (
                <PCB3DViewer
                  boardSize={pcbArtifacts?.boardSize}
                  placedBlocks={selectedBlocks}
                  blocks={blocksData.blocks}
                  className="w-full h-full"
                />
              ) : viewMode === 'docs' && documentOutput ? (
                <div className="p-6 max-w-4xl mx-auto overflow-auto">
                  <article
                    className="prose prose-invert prose-sm max-w-none
                      prose-headings:text-steel prose-headings:font-semibold
                      prose-h1:text-2xl prose-h1:border-b prose-h1:border-surface-700 prose-h1:pb-2
                      prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4
                      prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
                      prose-p:text-steel-dim prose-p:leading-relaxed
                      prose-a:text-copper prose-a:no-underline hover:prose-a:underline
                      prose-strong:text-steel prose-strong:font-semibold
                      prose-code:text-copper prose-code:bg-surface-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                      prose-pre:bg-surface-800 prose-pre:border prose-pre:border-surface-700
                      prose-table:border-collapse prose-table:w-full
                      prose-th:bg-surface-800 prose-th:text-steel prose-th:text-left prose-th:px-3 prose-th:py-2 prose-th:border prose-th:border-surface-700 prose-th:text-sm
                      prose-td:text-steel-dim prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-surface-700 prose-td:text-sm
                      prose-ul:text-steel-dim prose-ol:text-steel-dim
                      prose-li:marker:text-copper
                      prose-hr:border-surface-700"
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {documentOutput.markdown}
                    </ReactMarkdown>
                  </article>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center">
                    <Grid3X3 className="w-12 h-12 text-surface-600 mx-auto mb-3" strokeWidth={1} />
                    <p className="text-steel-dim text-sm mb-2">
                      {selectedBlocks.length > 0
                        ? 'Select a view mode above'
                        : 'Select blocks to build your schematic'}
                    </p>
                    <p className="text-xs text-surface-500 mb-4">
                      {selectedBlocks.length} block{selectedBlocks.length !== 1 ? 's' : ''} selected
                    </p>
                    {mergeError && <p className="text-red-400 text-xs mt-2">{mergeError}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Selected blocks chips */}
          {selectedBlocks.length > 0 && (
            <div className="bg-surface-900 rounded-lg border border-surface-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-steel">Selected Blocks</h3>
                {documentOutput?.summary && (
                  <span className="text-xs text-steel-dim">
                    {documentOutput.summary.blockCount} blocks •{' '}
                    {documentOutput.summary.i2cDevices.length} I2C •{' '}
                    {documentOutput.summary.spiDevices.length} SPI •{' '}
                    {documentOutput.summary.gpioUsage.length} GPIO
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedBlocks.map((placed) => (
                  <div
                    key={placed.blockId}
                    className="flex items-center gap-2 px-3 py-1.5 bg-surface-800 border border-surface-600 rounded"
                  >
                    <span className="text-sm text-steel">{placed.blockSlug}</span>
                    <span className="text-xs text-steel-dim font-mono">
                      ({placed.gridX},{placed.gridY})
                    </span>
                    <button
                      onClick={() => handleRemoveBlock(placed.blockId)}
                      className="text-red-400 hover:text-red-300"
                      title="Remove block"
                    >
                      <XCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

// =============================================================================
// Sub-components
// =============================================================================

interface StepIndicatorProps {
  step: number
  label: string
  active: boolean
  complete: boolean
  onClick?: () => void
  canClick?: boolean
}

function StepIndicator({ step, label, active, complete, onClick, canClick }: StepIndicatorProps) {
  const isClickable = canClick && onClick && !active

  return (
    <button
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      className={clsx(
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors',
        active && 'bg-copper/20 text-copper',
        complete && 'bg-emerald-500/20 text-emerald-400',
        !active && !complete && 'text-steel-dim',
        isClickable && 'cursor-pointer hover:bg-surface-700',
        !isClickable && 'cursor-default'
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
    </button>
  )
}

interface ViewModeButtonProps {
  mode: ViewMode
  currentMode: ViewMode
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  label: string
  disabled?: boolean
  disabledReason?: string | null
}

function ViewModeButton({
  mode,
  currentMode,
  onClick,
  icon: Icon,
  label,
  disabled,
  disabledReason,
}: ViewModeButtonProps) {
  const isActive = mode === currentMode
  const title = disabled && disabledReason ? `${label}: ${disabledReason}` : label

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors',
        isActive ? 'bg-copper text-surface-900' : 'text-steel-dim hover:text-steel',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      title={title}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  )
}

export default PCBStageView
