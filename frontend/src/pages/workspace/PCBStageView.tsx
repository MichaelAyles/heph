import { useState, useMemo, useCallback } from 'react'
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { Cpu, ArrowRight, Loader2, CheckCircle2, XCircle, Grid3X3, Eye, Wand2, Box, FileCode2 } from 'lucide-react'
import { clsx } from 'clsx'
import { useWorkspaceContext } from '@/components/workspace/WorkspaceLayout'
import { KiCanvasViewer } from '@/components/pcb/KiCanvasViewer'
import { BlockSelector } from '@/components/pcb/BlockSelector'
import { PCB3DViewer } from '@/components/pcb/PCB3DViewer'
import { StageCompletionSummary } from '@/components/workspace/StageCompletionSummary'
import { mergeBlockSchematics } from '@/services/pcb-merge'
import type { PcbBlock, PlacedBlock, PCBArtifacts, NetAssignment } from '@/db/schema'

type PCBStep = 'select_blocks' | 'generating' | 'preview'
type ViewMode = 'schematic' | '3d'

export function PCBStageView() {
  const { project } = useWorkspaceContext()
  const queryClient = useQueryClient()
  const [currentStep, setCurrentStep] = useState<PCBStep>('select_blocks')
  const [selectedBlocks, setSelectedBlocks] = useState<PlacedBlock[]>([])
  const [previewBlockSlug, setPreviewBlockSlug] = useState<string | null>(null)
  const [isMerging, setIsMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('schematic')

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

  // Initialize selected blocks from spec if available
  useMemo(() => {
    if (pcbArtifacts?.placedBlocks && selectedBlocks.length === 0) {
      setSelectedBlocks(pcbArtifacts.placedBlocks)
    }
  }, [pcbArtifacts?.placedBlocks])

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

  // Handle block selection
  const handleSelectBlock = (block: PcbBlock) => {
    // Auto-place on next available grid position
    const gridPositions = selectedBlocks.map((b) => `${b.gridX},${b.gridY}`)
    let gridX = 0
    let gridY = 0

    // Simple auto-placement: find first available position in a row
    while (gridPositions.includes(`${gridX},${gridY}`)) {
      gridX++
      if (gridX >= 4) {
        gridX = 0
        gridY++
      }
    }

    const newBlock: PlacedBlock = {
      blockId: block.id,
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

  // Handle block removal
  const handleRemoveBlock = (blockId: string) => {
    const updatedBlocks = selectedBlocks.filter((b) => b.blockId !== blockId)
    setSelectedBlocks(updatedBlocks)
    savePCBMutation.mutate({ placedBlocks: updatedBlocks })
  }

  // Handle preview of a single block's schematic
  const handlePreviewBlock = (blockSlug: string) => {
    setPreviewBlockSlug(blockSlug)
  }

  // Handle schematic merge - the critical integration!
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
        selectedBlocks.some((sb) => sb.blockId === b.id)
      )

      // Call the merge function
      const mergeResult = await mergeBlockSchematics(
        selectedBlocks,
        selectedBlockData,
        project.name
      )

      // Transform netList to match schema type
      const transformedNetList: NetAssignment[] = mergeResult.netList.map((n) => ({
        net: n.localNet, // Map localNet to net
        globalNet: n.globalNet,
        gpio: n.gpio,
      }))

      // Save merged schematic data to the project
      await savePCBMutation.mutateAsync({
        placedBlocks: selectedBlocks,
        schematicData: mergeResult.schematic,
        boardSize: { ...mergeResult.boardSize, unit: 'mm' as const },
        netList: transformedNetList,
        mergedAt: new Date().toISOString(),
      })

      setCurrentStep('preview')
    } catch (error) {
      console.error('Merge failed:', error)
      setMergeError(error instanceof Error ? error.message : 'Failed to merge schematics')
      setCurrentStep('select_blocks')
    } finally {
      setIsMerging(false)
    }
  }, [selectedBlocks, blocksData?.blocks, project?.name, savePCBMutation])

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
          <div className="flex items-center gap-2">
            {/* Step indicators */}
            <StepIndicator
              step={1}
              label="Select Blocks"
              active={currentStep === 'select_blocks'}
              complete={currentStep !== 'select_blocks'}
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
        </div>
      </div>

      {/* Previous stage summary - collapsed by default after initial view */}
      {spec?.stages?.spec?.status === 'complete' && spec?.finalSpec && (
        <div className="px-4 pt-4">
          <StageCompletionSummary
            stage="spec"
            spec={spec}
            projectId={project?.id || ''}
            isExpanded={false}
          />
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left sidebar: Block selector */}
        <aside className="w-80 border-r border-surface-700 flex flex-col min-h-0 overflow-hidden">
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
          {/* Schematic viewer */}
          <div className="flex-1 bg-surface-900 rounded-lg border border-surface-700 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-medium text-steel">
                  {previewBlockSlug
                    ? `Preview: ${previewBlockSlug}`
                    : viewMode === 'schematic'
                      ? 'Schematic'
                      : '3D Preview'}
                </h3>
                {pcbArtifacts?.boardSize && !previewBlockSlug && (
                  <span className="text-xs text-steel-dim px-2 py-1 bg-surface-800 rounded">
                    {pcbArtifacts.boardSize.width} × {pcbArtifacts.boardSize.height} mm
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* View mode toggle */}
                {selectedBlocks.length > 0 && !previewBlockSlug && (
                  <div className="flex items-center bg-surface-800 rounded p-0.5">
                    <button
                      onClick={() => setViewMode('schematic')}
                      className={clsx(
                        'px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors',
                        viewMode === 'schematic'
                          ? 'bg-copper text-surface-900'
                          : 'text-steel-dim hover:text-steel'
                      )}
                      title="View schematic"
                    >
                      <FileCode2 className="w-3 h-3" />
                      Schematic
                    </button>
                    <button
                      onClick={() => setViewMode('3d')}
                      className={clsx(
                        'px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors',
                        viewMode === '3d'
                          ? 'bg-copper text-surface-900'
                          : 'text-steel-dim hover:text-steel'
                      )}
                      title="View 3D preview"
                    >
                      <Box className="w-3 h-3" />
                      3D
                    </button>
                  </div>
                )}
                {previewBlockSlug && (
                  <button
                    onClick={() => setPreviewBlockSlug(null)}
                    className="text-xs text-copper hover:text-copper-light"
                  >
                    Clear Preview
                  </button>
                )}
                {pcbArtifacts?.schematicData && !previewBlockSlug && viewMode === 'schematic' && (
                  <button
                    onClick={handleMergeSchematic}
                    disabled={isMerging}
                    className="text-xs text-steel-dim hover:text-steel flex items-center gap-1"
                  >
                    <Wand2 className="w-3 h-3" />
                    Regenerate
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {previewBlockSlug ? (
                <KiCanvasViewer
                  src={`/api/blocks/${previewBlockSlug}/files/${previewBlockSlug}.kicad_sch`}
                  type="schematic"
                  controls="basic"
                  className="w-full h-full"
                />
              ) : viewMode === '3d' && selectedBlocks.length > 0 && blocksData?.blocks ? (
                <PCB3DViewer
                  boardSize={pcbArtifacts?.boardSize}
                  placedBlocks={selectedBlocks}
                  blocks={blocksData.blocks}
                  className="w-full h-full"
                />
              ) : pcbArtifacts?.schematicData ? (
                <KiCanvasViewer
                  src={`data:text/plain;base64,${btoa(pcbArtifacts.schematicData)}`}
                  type="schematic"
                  controls="basic"
                  className="w-full h-full"
                />
              ) : pcbArtifacts?.schematicUrl ? (
                <KiCanvasViewer
                  src={pcbArtifacts.schematicUrl}
                  type="schematic"
                  controls="basic"
                  className="w-full h-full"
                />
              ) : (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center">
                    <Grid3X3 className="w-12 h-12 text-surface-600 mx-auto mb-3" strokeWidth={1} />
                    <p className="text-steel-dim text-sm mb-2">
                      {selectedBlocks.length > 0
                        ? 'Ready to generate merged schematic'
                        : 'Select blocks to build your schematic'}
                    </p>
                    <p className="text-xs text-surface-500 mb-4">
                      {selectedBlocks.length} block{selectedBlocks.length !== 1 ? 's' : ''} selected
                    </p>
                    {selectedBlocks.length > 0 && (
                      <button
                        onClick={handleMergeSchematic}
                        disabled={isMerging || !blocksData?.blocks}
                        className={clsx(
                          'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
                          isMerging
                            ? 'bg-surface-700 text-steel-dim cursor-wait'
                            : 'bg-copper text-surface-900 hover:bg-copper-light'
                        )}
                      >
                        {isMerging ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-4 h-4" />
                            Generate Schematic
                          </>
                        )}
                      </button>
                    )}
                    {mergeError && (
                      <p className="text-red-400 text-xs mt-2">{mergeError}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Selected blocks grid */}
          {selectedBlocks.length > 0 && (
            <div className="bg-surface-900 rounded-lg border border-surface-700 p-4">
              <h3 className="text-sm font-medium text-steel mb-3">Selected Blocks</h3>
              <div className="flex flex-wrap gap-2">
                {selectedBlocks.map((placed) => (
                  <div
                    key={placed.blockId}
                    className="flex items-center gap-2 px-3 py-1.5 bg-surface-800 border border-surface-600 rounded"
                  >
                    <span className="text-sm text-steel">{placed.blockSlug}</span>
                    <span className="text-xs text-steel-dim">
                      ({placed.gridX},{placed.gridY})
                    </span>
                    <button
                      onClick={() => handlePreviewBlock(placed.blockSlug)}
                      className="text-copper hover:text-copper-light"
                      title="Preview schematic"
                    >
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
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

export default PCBStageView
