/**
 * Stage Completion Summary Component
 * Shows a collapsible inline panel summarizing artifacts from completed stages.
 * Non-blocking: users can proceed without acknowledging.
 */

import { useState, useEffect } from 'react'
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  FileText,
  Cpu,
  Box,
  Code,
  ArrowRight,
  ExternalLink,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { ProjectSpec, PcbBlock } from '@/db/schema'
import type { WorkspaceStage } from '@/stores/workspace'
import { KiCanvasViewer } from '@/components/pcb/KiCanvasViewer'
import { STLViewer } from '@/components/enclosure/STLViewer'
import { PCB3DViewer } from '@/components/pcb/PCB3DViewer'

interface StageCompletionSummaryProps {
  stage: WorkspaceStage
  spec: ProjectSpec
  projectId: string
  blocks?: PcbBlock[]
  isExpanded?: boolean
  onToggle?: (expanded: boolean) => void
}

export function StageCompletionSummary({
  stage,
  spec,
  projectId,
  blocks,
  isExpanded: controlledExpanded,
  onToggle,
}: StageCompletionSummaryProps) {
  const navigate = useNavigate()
  const [internalExpanded, setInternalExpanded] = useState(true)

  // Use controlled or internal state
  const isExpanded = controlledExpanded ?? internalExpanded
  const setExpanded = (value: boolean) => {
    if (onToggle) {
      onToggle(value)
    } else {
      setInternalExpanded(value)
    }
  }

  // Get the summary content based on stage
  const summary = getStageSummary(stage, spec, blocks)

  if (!summary) return null

  const Icon = getStageIcon(stage)
  const nextStage = getNextStage(stage)

  return (
    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-emerald-500/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" strokeWidth={2} />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-medium text-steel flex items-center gap-2">
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              {summary.title}
            </h3>
            <p className="text-xs text-steel-dim">{summary.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {nextStage && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/project/${projectId}/${nextStage}`)
              }}
              className="text-xs text-copper hover:text-copper-light flex items-center gap-1 px-2 py-1 rounded hover:bg-surface-800"
            >
              Continue to {getStageLabel(nextStage)}
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-steel-dim" />
          ) : (
            <ChevronRight className="w-4 h-4 text-steel-dim" />
          )}
        </div>
      </button>

      {/* Collapsible content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-emerald-500/10">
          <div className="pt-4 space-y-4">
            {/* Artifact previews */}
            {summary.previews.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {summary.previews.map((preview, i) => (
                  <div
                    key={i}
                    className="bg-surface-800 rounded-lg border border-surface-700 overflow-hidden"
                  >
                    <div className="h-32 relative">
                      {preview.type === 'kicanvas' && preview.content && (
                        <KiCanvasViewer
                          src={`data:text/plain;base64,${btoa(preview.content)}`}
                          type="schematic"
                          controls="none"
                          className="w-full h-full"
                        />
                      )}
                      {preview.type === 'pcb3d' && blocks && spec.pcb?.placedBlocks && (
                        <PCB3DViewer
                          boardSize={spec.pcb?.boardSize}
                          placedBlocks={spec.pcb.placedBlocks}
                          blocks={blocks}
                          className="w-full h-full"
                        />
                      )}
                      {preview.type === 'stl' && preview.url && (
                        <STLViewer
                          src={preview.url}
                          className="w-full h-full"
                          color="#8B7355"
                          showGrid={false}
                          autoRotate={true}
                        />
                      )}
                      {preview.type === 'image' && preview.url && (
                        <img
                          src={preview.url}
                          alt={preview.label}
                          className="w-full h-full object-cover"
                        />
                      )}
                      {preview.type === 'markdown' && (
                        <div className="p-2 text-xs text-steel-dim overflow-hidden h-full">
                          <pre className="whitespace-pre-wrap line-clamp-6">
                            {preview.content?.slice(0, 500)}
                          </pre>
                        </div>
                      )}
                    </div>
                    <div className="px-3 py-2 border-t border-surface-700 flex items-center justify-between">
                      <span className="text-xs text-steel-dim">{preview.label}</span>
                      {preview.action && (
                        <button
                          onClick={preview.action}
                          className="text-xs text-copper hover:text-copper-light flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          View
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Stats/metadata */}
            {summary.stats.length > 0 && (
              <div className="flex flex-wrap gap-4">
                {summary.stats.map((stat, i) => (
                  <div key={i} className="text-center">
                    <div className="text-lg font-semibold text-steel">{stat.value}</div>
                    <div className="text-xs text-steel-dim">{stat.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Item lists */}
            {summary.items.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {summary.items.map((item, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 bg-surface-800 border border-surface-700 rounded text-xs text-steel"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface StageSummary {
  title: string
  subtitle: string
  previews: Array<{
    type: 'kicanvas' | 'pcb3d' | 'stl' | 'image' | 'markdown' | 'code'
    label: string
    url?: string
    content?: string
    action?: () => void
  }>
  stats: Array<{ label: string; value: string | number }>
  items: string[]
}

function getStageSummary(
  stage: WorkspaceStage,
  spec: ProjectSpec,
  blocks?: PcbBlock[]
): StageSummary | null {
  const stageStatus = spec.stages?.[stage as keyof NonNullable<typeof spec.stages>]?.status

  if (stageStatus !== 'complete') return null

  switch (stage) {
    case 'spec': {
      const fs = spec.finalSpec
      if (!fs) return null

      const blueprintUrl =
        spec.selectedBlueprint !== null ? spec.blueprints?.[spec.selectedBlueprint]?.url : undefined

      return {
        title: 'Spec Complete',
        subtitle: fs.name || 'Hardware specification ready',
        previews: blueprintUrl
          ? [{ type: 'image', label: 'Selected Blueprint', url: blueprintUrl }]
          : [],
        stats: [
          { label: 'Inputs', value: fs.inputs?.length ?? 0 },
          { label: 'Outputs', value: fs.outputs?.length ?? 0 },
          { label: 'Power', value: fs.power?.source || 'N/A' },
        ],
        items: [
          ...(fs.inputs?.map((i) => i.type) ?? []),
          ...(fs.outputs?.map((o) => o.type) ?? []),
        ],
      }
    }

    case 'pcb': {
      const pcb = spec.pcb
      if (!pcb?.placedBlocks?.length) return null

      const previews: StageSummary['previews'] = []

      if (pcb.schematicData) {
        previews.push({
          type: 'kicanvas',
          label: 'Merged Schematic',
          content: pcb.schematicData,
        })
      }

      if (blocks && pcb.placedBlocks.length > 0) {
        previews.push({
          type: 'pcb3d',
          label: '3D Layout',
        })
      }

      return {
        title: 'PCB Complete',
        subtitle: `${pcb.placedBlocks.length} blocks on ${pcb.boardSize?.width ?? '?'}×${pcb.boardSize?.height ?? '?'}mm board`,
        previews,
        stats: [
          { label: 'Blocks', value: pcb.placedBlocks.length },
          {
            label: 'Board Size',
            value: `${pcb.boardSize?.width ?? '?'}×${pcb.boardSize?.height ?? '?'}mm`,
          },
          { label: 'Nets', value: pcb.netList?.length ?? 0 },
        ],
        items: pcb.placedBlocks.map((b) => b.blockSlug),
      }
    }

    case 'enclosure': {
      const enc = spec.enclosure
      if (!enc?.openScadCode) return null

      const previews: StageSummary['previews'] = []

      // Show STL if we have a URL (not blob)
      if (enc.stlUrl && !enc.stlUrl.startsWith('blob:')) {
        previews.push({
          type: 'stl',
          label: 'Enclosure Model',
          url: enc.stlUrl,
        })
      }

      // Show blueprint comparison if available
      const blueprintUrl =
        spec.selectedBlueprint !== null ? spec.blueprints?.[spec.selectedBlueprint]?.url : undefined
      if (blueprintUrl) {
        previews.push({
          type: 'image',
          label: 'Reference Blueprint',
          url: blueprintUrl,
        })
      }

      return {
        title: 'Enclosure Complete',
        subtitle: 'Parametric OpenSCAD enclosure ready',
        previews,
        stats: [
          { label: 'Iterations', value: enc.iterations?.length ?? 1 },
          { label: 'Code Lines', value: enc.openScadCode.split('\n').length },
        ],
        items: [],
      }
    }

    case 'firmware': {
      const fw = spec.firmware
      if (!fw?.files?.length) return null

      const mainFile = fw.files.find(
        (f) => f.path.includes('main.cpp') || f.path.includes('main.c')
      )

      return {
        title: 'Firmware Complete',
        subtitle: `${fw.files.length} files in PlatformIO project`,
        previews: mainFile
          ? [
              {
                type: 'code',
                label: 'main.cpp',
                content: mainFile.content,
              },
            ]
          : [],
        stats: [
          { label: 'Files', value: fw.files.length },
          {
            label: 'Total Lines',
            value: fw.files.reduce((sum, f) => sum + f.content.split('\n').length, 0),
          },
        ],
        items: fw.files.slice(0, 5).map((f) => f.path.split('/').pop() || f.path),
      }
    }

    default:
      return null
  }
}

function getStageIcon(stage: WorkspaceStage) {
  switch (stage) {
    case 'spec':
      return FileText
    case 'pcb':
      return Cpu
    case 'enclosure':
      return Box
    case 'firmware':
      return Code
    default:
      return FileText
  }
}

function getNextStage(stage: WorkspaceStage): WorkspaceStage | null {
  const order: WorkspaceStage[] = ['spec', 'pcb', 'enclosure', 'firmware', 'export']
  const idx = order.indexOf(stage)
  if (idx === -1 || idx >= order.length - 1) return null
  return order[idx + 1]
}

function getStageLabel(stage: WorkspaceStage): string {
  const labels: Record<WorkspaceStage, string> = {
    spec: 'Spec',
    pcb: 'PCB',
    enclosure: 'Enclosure',
    firmware: 'Firmware',
    export: 'Export',
    files: 'Files',
  }
  return labels[stage]
}

/**
 * Hook to track stage completion and auto-expand summaries
 */
export function useStageCompletionTracking(spec: ProjectSpec | null) {
  const [expandedStages, setExpandedStages] = useState<Set<WorkspaceStage>>(new Set())
  const [lastCompletedStage, setLastCompletedStage] = useState<WorkspaceStage | null>(null)

  useEffect(() => {
    if (!spec?.stages) return

    // Check each stage for newly completed status
    const stages: WorkspaceStage[] = ['spec', 'pcb', 'enclosure', 'firmware']
    for (const stage of stages) {
      const status = spec.stages[stage as keyof NonNullable<typeof spec.stages>]?.status
      if (status === 'complete' && !expandedStages.has(stage)) {
        setExpandedStages((prev) => new Set([...prev, stage]))
        setLastCompletedStage(stage)
      }
    }
  }, [spec?.stages])

  const isExpanded = (stage: WorkspaceStage) => expandedStages.has(stage)

  const setExpanded = (stage: WorkspaceStage, expanded: boolean) => {
    setExpandedStages((prev) => {
      const next = new Set(prev)
      if (expanded) {
        next.add(stage)
      } else {
        next.delete(stage)
      }
      return next
    })
  }

  return { isExpanded, setExpanded, lastCompletedStage }
}

/**
 * Mini summary for the stage tabs header area
 */
export function MiniStageSummary({
  stage,
  spec,
}: {
  stage: WorkspaceStage
  spec: ProjectSpec | null
}) {
  if (!spec) return null

  const stageStatus = spec.stages?.[stage as keyof NonNullable<typeof spec.stages>]?.status
  if (stageStatus !== 'complete') return null

  let summary: string | null = null

  switch (stage) {
    case 'spec':
      summary = spec.finalSpec?.name || 'Spec ready'
      break
    case 'pcb':
      if (spec.pcb?.placedBlocks?.length) {
        summary = `${spec.pcb.placedBlocks.length} blocks`
      }
      break
    case 'enclosure':
      if (spec.enclosure?.openScadCode) {
        summary = 'Model ready'
      }
      break
    case 'firmware':
      if (spec.firmware?.files?.length) {
        summary = `${spec.firmware.files.length} files`
      }
      break
  }

  if (!summary) return null

  return (
    <span
      className="text-xs text-emerald-400/70 truncate max-w-[80px]"
      title={summary}
    >
      {summary}
    </span>
  )
}

export default StageCompletionSummary
