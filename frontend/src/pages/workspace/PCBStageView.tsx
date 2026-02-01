import { useState, useMemo, useCallback, useEffect } from 'react'
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import JSZip from 'jszip'
import {
  Cpu,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Grid3X3,
  Sparkles,
  Layers,
  Cable,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useWorkspaceContext } from '../../components/workspace/WorkspaceLayout'
import { invokeLangGraphNode, BreakpointCancelledError } from '../../services/langgraph/invoke'
import { BlockSelector } from '../../components/pcb/BlockSelector'
import { PCB3DViewer } from '../../components/pcb/PCB3DViewer'
import { GridEditor } from '../../components/pcb/GridEditor'
import { BusConnectionDiagram } from '../../components/pcb/BusConnectionDiagram'
import { GerberViewer } from '../../components/pcb/GerberViewer'
import { RemoteTypeBlocksPreview } from '../../components/pcb/RemoteTypeBlocksPreview'
import { StageCompleteButton } from '../../components/workspace/StageCompleteButton'
import { PCBViewerToolbar, type ViewMode } from '../../components/pcb/PCBViewerToolbar'
import { SelectedBlocksBar } from '../../components/pcb/SelectedBlocksBar'
import { ManufacturingExportPanel } from '../../components/pcb/ManufacturingExportPanel'
import { mergeBlockSchematics, mergeBlockPCBs } from '../../services/pcb-merge'
import { mergeGerbers, type GerberBlock, type MergedGerbers } from '../../services/gerber-merge'
import { generatePCBDocument } from '../../services/pcb-document'
import {
  toBlockCatalogEntry,
  validatePCBSuggestion,
  type BlockCatalogEntry,
  type PCBSuggestionResponse,
} from '../../prompts/pcb-selection'
import { validateGrid, fromPlacedBlocks, calculateBoardSize } from '../../services/pcb-grid'
import { logger } from '../../lib/logger'
import type {
  PcbBlock,
  PlacedBlock,
  PCBArtifacts,
  NetAssignment,
  ResistorTapState,
} from '../../db/schema'
import type { BlockDefinition } from '../../schemas/block'

type PCBStep = 'select_blocks' | 'generating' | 'preview'

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
  const [configuredTapStates, setConfiguredTapStates] = useState<ResistorTapState[]>([])
  // Selected board for gerbers/3D view: null = main board, '__remote_type__' = cable-connected blocks
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)

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

  // Initialize tap states from spec if available
  useMemo(() => {
    if (pcbArtifacts?.resistorTapStates && configuredTapStates.length === 0) {
      setConfiguredTapStates(pcbArtifacts.resistorTapStates)
    }
  }, [pcbArtifacts?.resistorTapStates])

  // Separate main grid blocks from remote-type blocks (isRemote: true)
  const { mainGridBlocks, remoteTypeBlocks } = useMemo(() => {
    const main: PlacedBlock[] = []
    const remote: PlacedBlock[] = []

    for (const block of selectedBlocks) {
      const def = blockDefinitions.get(block.blockSlug)
      if (!def) continue
      if (def.isRemote || !def.gridSize) {
        remote.push(block)
      } else {
        main.push(block)
      }
    }

    return { mainGridBlocks: main, remoteTypeBlocks: remote }
  }, [selectedBlocks, blockDefinitions])

  // Special board ID for remote-type blocks
  const REMOTE_TYPE_BOARD_ID = '__remote_type__'

  // Get blocks for currently selected board (main or remote-type)
  const viewingBlocks = useMemo(() => {
    if (selectedBoardId === REMOTE_TYPE_BOARD_ID) {
      // Remote-type blocks (cable-connected)
      return remoteTypeBlocks
    }
    // Main board - only grid blocks
    return mainGridBlocks
  }, [selectedBoardId, mainGridBlocks, remoteTypeBlocks])

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

  // Load and merge gerber files for the selected board
  const loadGerbers = useCallback(async () => {
    if (viewingBlocks.length === 0 || !blocksData?.blocks) {
      setGerberLayers({})
      return
    }

    setIsLoadingGerbers(true)
    const layers: Record<string, string> = {}

    try {
      // Build GerberBlock array for merging
      const gerberBlocks: GerberBlock[] = []
      const missingGerbers: string[] = []

      for (const placement of viewingBlocks) {
        const block = blocksData.blocks.find((b) => b.slug === placement.blockSlug)
        if (!block?.files?.gerbers) {
          missingGerbers.push(placement.blockSlug)
          logger.warn('pcb', `Block ${placement.blockSlug} missing gerbers file reference`)
          continue
        }

        // Fetch the gerber ZIP
        const url = `/api/blocks/${block.slug}/files/${block.files.gerbers}`
        logger.info('pcb', `Fetching gerbers from ${url}`)
        const res = await fetch(url)
        if (!res.ok) {
          logger.warn('pcb', `Failed to fetch gerbers: ${res.status} ${res.statusText}`)
          continue
        }

        // Extract gerbers from the ZIP
        const blob = await res.blob()
        logger.info('pcb', `Got gerber ZIP blob: ${blob.size} bytes, type: ${blob.type}`)
        const zip = await JSZip.loadAsync(blob)

        // Log all files in the ZIP
        const zipFiles = Object.keys(zip.files)
        logger.info('pcb', `ZIP contains ${zipFiles.length} files:`, { files: zipFiles })

        // Map file extensions/patterns to layer properties
        const blockLayers: GerberBlock['layers'] = {}
        const layerMappings = [
          { patterns: ['-f_cu', '.gtl', '-F_Cu'], prop: 'topCopper' as const },
          { patterns: ['-b_cu', '.gbl', '-B_Cu'], prop: 'bottomCopper' as const },
          { patterns: ['-in1_cu', '-In1_Cu', '.g1'], prop: 'innerCopper1' as const },
          { patterns: ['-in2_cu', '-In2_Cu', '.g2'], prop: 'innerCopper2' as const },
          { patterns: ['-f_mask', '.gts', '-F_Mask'], prop: 'topMask' as const },
          { patterns: ['-b_mask', '.gbs', '-B_Mask'], prop: 'bottomMask' as const },
          {
            patterns: ['-f_silkscreen', '.gto', '-F_Silkscreen', '-F_SilkS'],
            prop: 'topSilk' as const,
          },
          {
            patterns: ['-b_silkscreen', '.gbo', '-B_Silkscreen', '-B_SilkS'],
            prop: 'bottomSilk' as const,
          },
          { patterns: ['-edge_cuts', '.gm1', '-Edge_Cuts'], prop: 'edgeCuts' as const },
          { patterns: ['.drl', 'drill'], prop: 'drill' as const },
        ]

        // Extract each file from the ZIP
        for (const [filename, zipEntry] of Object.entries(zip.files)) {
          if (zipEntry.dir) continue
          const lowerFilename = filename.toLowerCase()

          // Find matching layer
          let matched = false
          for (const mapping of layerMappings) {
            if (mapping.patterns.some((p) => lowerFilename.includes(p.toLowerCase()))) {
              const content = await zipEntry.async('string')
              blockLayers[mapping.prop] = content
              logger.info('pcb', `Matched ${filename} to ${mapping.prop} (${content.length} chars)`)
              matched = true
              break
            }
          }
          if (!matched) {
            logger.warn('pcb', `No layer match for file: ${filename}`)
          }
        }

        logger.info('pcb', `Block ${block.slug} has layers:`, { layers: Object.keys(blockLayers) })

        gerberBlocks.push({
          name: block.slug,
          gridX: placement.gridX,
          gridY: placement.gridY,
          layers: blockLayers,
        })
      }

      // Log any missing gerbers
      if (missingGerbers.length > 0) {
        logger.warn('pcb', 'Some blocks missing gerber files', { missing: missingGerbers })
      }

      if (gerberBlocks.length > 0) {
        // Merge all gerbers into unified layers
        const merged: MergedGerbers = mergeGerbers(gerberBlocks)

        // Log merged layer sizes for debugging
        logger.info('pcb', 'Merged gerber layers:', {
          topCopper: merged.topCopper?.length ?? 0,
          bottomCopper: merged.bottomCopper?.length ?? 0,
          innerCopper1: merged.innerCopper1?.length ?? 0,
          innerCopper2: merged.innerCopper2?.length ?? 0,
          topMask: merged.topMask?.length ?? 0,
          bottomMask: merged.bottomMask?.length ?? 0,
          topSilk: merged.topSilk?.length ?? 0,
          bottomSilk: merged.bottomSilk?.length ?? 0,
          edgeCuts: merged.edgeCuts?.length ?? 0,
          drill: merged.drill?.length ?? 0,
        })

        // Log preview of merged content to debug parsing issues
        if (merged.topCopper) {
          logger.info('pcb', 'Merged topCopper preview:', {
            first500: merged.topCopper.substring(0, 500),
            last200: merged.topCopper.substring(merged.topCopper.length - 200),
          })
        }

        // Convert merged gerbers to the format GerberViewer expects
        // Only add non-empty layers to avoid parse errors
        if (merged.topCopper) layers['merged-F.Cu'] = merged.topCopper
        if (merged.bottomCopper) layers['merged-B.Cu'] = merged.bottomCopper
        if (merged.innerCopper1) layers['merged-In1.Cu'] = merged.innerCopper1
        if (merged.innerCopper2) layers['merged-In2.Cu'] = merged.innerCopper2
        if (merged.topMask) layers['merged-F.Mask'] = merged.topMask
        if (merged.bottomMask) layers['merged-B.Mask'] = merged.bottomMask
        if (merged.topSilk) layers['merged-F.SilkS'] = merged.topSilk
        if (merged.bottomSilk) layers['merged-B.SilkS'] = merged.bottomSilk
        if (merged.edgeCuts) layers['merged-Edge.Cuts'] = merged.edgeCuts
        if (merged.drill) layers['merged-Drill'] = merged.drill
      } else if (missingGerbers.length > 0) {
        // All blocks are missing gerbers - show meaningful error
        setMergeError(`No gerber files found for: ${missingGerbers.join(', ')}`)
      }

      setGerberLayers(layers)
    } catch (error) {
      logger.error('pcb', 'Failed to load gerbers', { error })
      setMergeError(error instanceof Error ? error.message : 'Failed to load gerbers')
    } finally {
      setIsLoadingGerbers(false)
    }
  }, [viewingBlocks, blocksData?.blocks])

  // Auto-reload gerbers when board selection changes (in gerbers view mode)
  useEffect(() => {
    if (viewMode === 'gerbers' && viewingBlocks.length > 0 && blocksData?.blocks) {
      loadGerbers()
    }
  }, [selectedBoardId, viewMode]) // Intentionally exclude loadGerbers to avoid infinite loop

  // Handle AI suggestion
  const handleAiSuggest = useCallback(async () => {
    if (!blocksData?.blocks || !spec?.finalSpec) return

    setIsAiSuggesting(true)
    try {
      // Build catalog entries for validation
      const catalogEntries: BlockCatalogEntry[] = blocksData.blocks
        .filter((b) => b.definition)
        .map((b) => toBlockCatalogEntry(b.definition!))

      // Call LangGraph block_selection node
      // Context (projectName, description, finalSpec, availableBlocks) comes from @variables
      const data = await invokeLangGraphNode({
        nodeName: 'block_selection',
        input: {}, // Empty - context comes from @variables
        projectId: project?.id,
      })

      const suggestion = data.output as unknown as PCBSuggestionResponse

      if (!suggestion) {
        throw new Error('Failed to get block selection output')
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
      const newBlocks: PlacedBlock[] = suggestion.blocks.map(
        (b: { slug: string; gridX: number; gridY: number; rotation: 0 | 180 }, idx: number) => ({
          blockId: `${b.slug}-${Date.now()}-${idx}`,
          blockSlug: b.slug,
          gridX: b.gridX,
          gridY: b.gridY,
          rotation: b.rotation,
        })
      )

      setSelectedBlocks(newBlocks)
      savePCBMutation.mutate({ placedBlocks: newBlocks })
    } catch (error) {
      if (error instanceof BreakpointCancelledError) {
        setMergeError('AI suggestion cancelled at debug breakpoint')
      } else {
        logger.error('pcb', 'AI suggestion failed', { error })
        setMergeError(error instanceof Error ? error.message : 'AI suggestion failed')
      }
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
      // =========================================================================
      // 1. Process MAIN BOARD
      // =========================================================================

      // Separate blocks into main grid and remote-type
      const mainBoardBlocks = selectedBlocks.filter((b) => {
        const def = blockDefinitions.get(b.blockSlug)
        return def && !def.isRemote && def.gridSize
      })

      const remoteTypeBlocksList = selectedBlocks.filter((b) => {
        const def = blockDefinitions.get(b.blockSlug)
        return def && (def.isRemote || !def.gridSize)
      })

      const mainBlockData = blocksData.blocks.filter((b) =>
        mainBoardBlocks.some((sb) => sb.blockSlug === b.slug)
      )

      // Merge main board schematic
      const schematicResult = await mergeBlockSchematics(
        mainBoardBlocks,
        mainBlockData,
        project.name
      )

      // Merge main board PCB layout
      let pcbData: string | undefined
      let pcbMergeError: string | undefined
      try {
        const blocksWithPcb = mainBlockData.filter((b) => b.files?.pcb)
        const blocksWithoutPcb = mainBlockData.filter((b) => !b.files?.pcb)

        if (blocksWithoutPcb.length > 0) {
          logger.warn('pcb', 'Some main board blocks missing PCB files', {
            missing: blocksWithoutPcb.map((b) => b.slug),
          })
        }

        if (blocksWithPcb.length === 0) {
          pcbMergeError = `No PCB files available. Missing: ${blocksWithoutPcb.map((b) => b.slug).join(', ')}`
        } else {
          const pcbResult = await mergeBlockPCBs(mainBoardBlocks, mainBlockData, project.name)
          pcbData = pcbResult.pcb
        }
      } catch (pcbError) {
        const errorMsg = pcbError instanceof Error ? pcbError.message : 'PCB merge failed'
        pcbMergeError = errorMsg
        logger.warn('pcb', 'Main board PCB merge failed', { error: pcbError })
      }

      if (pcbMergeError) {
        logger.info('pcb', 'Main board PCB merge unavailable', { reason: pcbMergeError })
      }

      // Transform netList to match schema type
      const transformedNetList: NetAssignment[] = schematicResult.netList.map((n) => ({
        net: n.localNet,
        globalNet: n.globalNet,
        gpio: n.gpio,
      }))

      // =========================================================================
      // 2. Process REMOTE-TYPE BLOCKS (cable-connected)
      // =========================================================================

      let remoteTypeSchematicData: string | undefined
      let remoteTypePcbData: string | undefined

      if (remoteTypeBlocksList.length > 0) {
        const remoteBlockData = blocksData.blocks.filter((b) =>
          remoteTypeBlocksList.some((rb) => rb.blockSlug === b.slug)
        )

        try {
          const remoteSchematicResult = await mergeBlockSchematics(
            remoteTypeBlocksList,
            remoteBlockData,
            `${project.name}-remote`
          )
          remoteTypeSchematicData = remoteSchematicResult.schematic
        } catch (err) {
          logger.warn('pcb', 'Remote-type blocks schematic merge failed', { error: err })
        }

        try {
          const blocksWithPcb = remoteBlockData.filter((b) => b.files?.pcb)
          if (blocksWithPcb.length > 0) {
            const remotePcbResult = await mergeBlockPCBs(
              remoteTypeBlocksList,
              remoteBlockData,
              `${project.name}-remote`
            )
            remoteTypePcbData = remotePcbResult.pcb
          }
        } catch (err) {
          logger.warn('pcb', 'Remote-type blocks PCB merge failed', { error: err })
        }
      }

      // =========================================================================
      // 3. Save everything to the project
      // =========================================================================

      await savePCBMutation.mutateAsync({
        placedBlocks: selectedBlocks,
        schematicData: schematicResult.schematic,
        pcbData,
        boardSize: { ...schematicResult.boardSize, unit: 'mm' as const },
        netList: transformedNetList,
        mergedAt: new Date().toISOString(),
        // Store remote-type data in a simple format
        remoteTypeSchematicData,
        remoteTypePcbData,
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
  }, [
    selectedBlocks,
    blocksData?.blocks,
    blockDefinitions,
    project?.name,
    savePCBMutation,
    loadGerbers,
  ])

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

  // Handle tap states change from manufacturing panel
  const handleTapStatesChange = useCallback(
    (tapStates: ResistorTapState[]) => {
      setConfiguredTapStates(tapStates)
      savePCBMutation.mutate({
        placedBlocks: selectedBlocks,
        resistorTapStates: tapStates,
      })
    },
    [selectedBlocks, savePCBMutation]
  )

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
            className="flex-1 min-h-0"
          />
        </aside>

        {/* Main panel */}
        <main className="flex-1 flex flex-col min-h-0 p-4 gap-4">
          {/* View mode toolbar */}
          <PCBViewerToolbar
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onLoadGerbers={loadGerbers}
            selectedBlocksCount={selectedBlocks.length}
            hasSchematicData={!!pcbArtifacts?.schematicData}
            boardSize={boardSize}
            validationResult={validationResult}
            documentOutput={documentOutput}
            onDownloadDocs={handleDownloadDocs}
            onGenerate={handleMergeSchematic}
            isMerging={isMerging}
            hasExistingSchematic={!!pcbArtifacts?.schematicData}
          />

          {/* Main viewer area */}
          <div className="flex-1 bg-surface-900 rounded-lg border border-surface-700 flex flex-col min-h-0 overflow-hidden">
            {/* View content */}
            <div className="flex-1 min-h-0 overflow-auto">
              {viewMode === 'grid' ? (
                <div className="p-4 flex gap-6 justify-center items-start">
                  {/* Main board grid */}
                  <div className="flex flex-col">
                    <div className="mb-2 text-xs font-medium text-steel-dim uppercase tracking-wider">
                      Main Board
                    </div>
                    <GridEditor
                      placedBlocks={selectedBlocks}
                      blockDefinitions={blockDefinitions}
                      onBlocksChange={handleBlocksChange}
                      gridWidth={gridWidth}
                      gridHeight={gridHeight}
                      disabled={currentStep === 'generating'}
                    />
                  </div>

                  {/* Side panel for off-grid items */}
                  <div className="flex flex-col gap-4 flex-shrink-0 min-w-[200px] max-w-[280px]">
                    {/* Remote-type blocks (cable-connected) */}
                    <RemoteTypeBlocksPreview
                      placedBlocks={selectedBlocks}
                      blockDefinitions={blockDefinitions}
                    />
                  </div>
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
                <div className="flex flex-col h-full">
                  {/* Board selector */}
                  <BoardSelector
                    selectedBoardId={selectedBoardId}
                    onSelectBoard={setSelectedBoardId}
                    remoteTypeBlockCount={remoteTypeBlocks.length}
                    remoteTypeBoardId={REMOTE_TYPE_BOARD_ID}
                    onLoadGerbers={loadGerbers}
                  />
                  {/* Gerber viewer */}
                  <div className="flex-1 min-h-0">
                    {isLoadingGerbers ? (
                      <div className="flex-1 flex items-center justify-center h-full">
                        <Loader2 className="w-8 h-8 text-copper animate-spin" />
                      </div>
                    ) : Object.keys(gerberLayers).length > 0 ? (
                      <GerberViewer layers={gerberLayers} className="w-full h-full" />
                    ) : (
                      <div className="flex-1 flex items-center justify-center h-full">
                        <div className="text-center">
                          <Layers
                            className="w-12 h-12 text-surface-600 mx-auto mb-3"
                            strokeWidth={1}
                          />
                          <p className="text-steel-dim text-sm mb-2">No Gerber files available</p>
                          {mergeError ? (
                            <p className="text-xs text-red-400 mb-2">{mergeError}</p>
                          ) : (
                            <p className="text-xs text-surface-500">
                              Click "Load Gerbers" to view merged board gerbers
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : viewMode === '3d' && blocksData?.blocks ? (
                <div className="flex flex-col h-full">
                  {/* Board selector */}
                  <BoardSelector
                    selectedBoardId={selectedBoardId}
                    onSelectBoard={setSelectedBoardId}
                    remoteTypeBlockCount={remoteTypeBlocks.length}
                    remoteTypeBoardId={REMOTE_TYPE_BOARD_ID}
                  />
                  {/* 3D viewer */}
                  <div className="flex-1 min-h-0">
                    {viewingBlocks.length > 0 ? (
                      <PCB3DViewer
                        boardSize={pcbArtifacts?.boardSize}
                        placedBlocks={viewingBlocks}
                        blocks={blocksData.blocks}
                        className="w-full h-full"
                      />
                    ) : (
                      <div className="flex-1 flex items-center justify-center h-full">
                        <div className="text-center">
                          <Cpu
                            className="w-12 h-12 text-surface-600 mx-auto mb-3"
                            strokeWidth={1}
                          />
                          <p className="text-steel-dim text-sm mb-2">No blocks on this board</p>
                          <p className="text-xs text-surface-500">
                            {selectedBoardId === REMOTE_TYPE_BOARD_ID
                              ? 'Cable-connected blocks will be shown here'
                              : 'Select blocks from the catalog'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
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
              ) : viewMode === 'mfg' && project && blocksData?.blocks ? (
                <ManufacturingExportPanel
                  project={{ id: project.id, name: project.name, description: project.description }}
                  spec={spec}
                  selectedBlocks={selectedBlocks}
                  blockDefinitions={blockDefinitions}
                  blocks={blocksData.blocks}
                  pcbArtifacts={pcbArtifacts}
                  boardSize={
                    boardSize ? { widthMm: boardSize.widthMm, heightMm: boardSize.heightMm } : null
                  }
                  initialTapStates={configuredTapStates}
                  onTapStatesChange={handleTapStatesChange}
                />
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

          {/* Selected blocks bar */}
          <SelectedBlocksBar
            selectedBlocks={selectedBlocks}
            onRemoveBlock={handleRemoveBlock}
            summary={documentOutput?.summary}
          />
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

// =============================================================================
// Board Selector - Switch between main board and cable-connected blocks
// =============================================================================

interface BoardSelectorProps {
  selectedBoardId: string | null
  onSelectBoard: (boardId: string | null) => void
  remoteTypeBlockCount?: number
  remoteTypeBoardId?: string
  onLoadGerbers?: () => void
}

function BoardSelector({
  selectedBoardId,
  onSelectBoard,
  remoteTypeBlockCount = 0,
  remoteTypeBoardId = '__remote_type__',
  onLoadGerbers,
}: BoardSelectorProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-700 bg-surface-800/50">
      <span className="text-xs text-steel-dim uppercase tracking-wider mr-2">Board:</span>
      <div className="flex items-center gap-1">
        {/* Main board button */}
        <button
          onClick={() => onSelectBoard(null)}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
            selectedBoardId === null
              ? 'bg-copper/20 text-copper border border-copper/40'
              : 'bg-surface-700 text-steel-dim hover:text-steel hover:bg-surface-600'
          )}
        >
          <Grid3X3 className="w-3.5 h-3.5" />
          Main Board
        </button>

        {/* Remote-type blocks (cable-connected) */}
        {remoteTypeBlockCount > 0 && (
          <button
            onClick={() => onSelectBoard(remoteTypeBoardId)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
              selectedBoardId === remoteTypeBoardId
                ? 'bg-pink-500/20 text-pink-400 border border-pink-500/40'
                : 'bg-surface-700 text-steel-dim hover:text-steel hover:bg-surface-600'
            )}
          >
            <Cable className="w-3.5 h-3.5" />
            Cable-Connected ({remoteTypeBlockCount})
          </button>
        )}
      </div>

      {/* Load gerbers button (only shown when provided) */}
      {onLoadGerbers && (
        <button
          onClick={onLoadGerbers}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-copper/20 text-copper hover:bg-copper/30 transition-colors"
        >
          <Layers className="w-3.5 h-3.5" />
          Load Gerbers
        </button>
      )}
    </div>
  )
}

export default PCBStageView
