import { useState, useMemo } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { Cpu, ArrowRight, Loader2, CheckCircle2, XCircle, Grid3X3, Eye } from 'lucide-react'
import { clsx } from 'clsx'
import { useWorkspaceContext } from '@/components/workspace/WorkspaceLayout'
import { KiCanvasViewer } from '@/components/pcb/KiCanvasViewer'
import { BlockSelector } from '@/components/pcb/BlockSelector'
import type { PcbBlock, PlacedBlock } from '@/db/schema'

type PCBStep = 'select_blocks' | 'generating' | 'preview'

export function PCBStageView() {
  const { project } = useWorkspaceContext()
  const queryClient = useQueryClient()
  const [currentStep] = useState<PCBStep>('select_blocks')
  const [selectedBlocks, setSelectedBlocks] = useState<PlacedBlock[]>([])
  const [previewBlockSlug, setPreviewBlockSlug] = useState<string | null>(null)

  const specComplete = project?.status === 'complete'
  const spec = project?.spec

  // Get existing PCB data from spec
  const pcbArtifacts = spec?.pcb
  const hasExistingPCB = !!pcbArtifacts?.schematicUrl

  // Initialize selected blocks from spec if available
  useMemo(() => {
    if (pcbArtifacts?.placedBlocks && selectedBlocks.length === 0) {
      setSelectedBlocks(pcbArtifacts.placedBlocks)
    }
  }, [pcbArtifacts?.placedBlocks])

  // Mutation to save PCB data
  const savePCBMutation = useMutation({
    mutationFn: async (pcbData: { placedBlocks: PlacedBlock[] }) => {
      const res = await fetch(`/api/projects/${project?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spec: {
            ...spec,
            pcb: {
              ...spec?.pcb,
              placedBlocks: pcbData.placedBlocks,
            },
            stages: {
              ...spec?.stages,
              pcb: { status: 'in_progress' },
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

      {/* Main content area */}
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar: Block selector */}
        <aside className="w-80 border-r border-surface-700 flex flex-col min-h-0">
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
              <h3 className="text-sm font-medium text-steel">
                {previewBlockSlug ? `Preview: ${previewBlockSlug}` : 'Schematic'}
              </h3>
              {previewBlockSlug && (
                <button
                  onClick={() => setPreviewBlockSlug(null)}
                  className="text-xs text-copper hover:text-copper-light"
                >
                  Clear Preview
                </button>
              )}
            </div>
            <div className="flex-1 min-h-0">
              {previewBlockSlug ? (
                <KiCanvasViewer
                  src={`/api/blocks/${previewBlockSlug}/files/${previewBlockSlug}.kicad_sch`}
                  type="schematic"
                  controls="basic"
                  className="w-full h-full"
                />
              ) : hasExistingPCB && pcbArtifacts?.schematicUrl ? (
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
                      Select blocks to build your schematic
                    </p>
                    <p className="text-xs text-surface-500">
                      {selectedBlocks.length} block{selectedBlocks.length !== 1 ? 's' : ''} selected
                    </p>
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
