import { NavLink, useParams } from 'react-router-dom'
import { FileText, Cpu, Box, Code, Download, Check, AlertCircle, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import type { ProjectSpec, StageStatus } from '@/db/schema'
import { STAGE_ORDER, STAGE_LABELS, type WorkspaceStage } from '@/stores/workspace'

interface WorkspaceStageTabsProps {
  spec: ProjectSpec | null
  canNavigateTo: (stage: WorkspaceStage, spec: ProjectSpec | null) => boolean
}

const STAGE_ICONS: Record<WorkspaceStage, typeof FileText> = {
  spec: FileText,
  pcb: Cpu,
  enclosure: Box,
  firmware: Code,
  export: Download,
}

export function WorkspaceStageTabs({ spec, canNavigateTo }: WorkspaceStageTabsProps) {
  const { id } = useParams<{ id: string }>()

  return (
    <nav className="border-b border-surface-700 bg-surface-900">
      <div className="flex">
        {STAGE_ORDER.map((stage) => {
          const Icon = STAGE_ICONS[stage]
          const canNavigate = canNavigateTo(stage, spec)
          const status = spec?.stages?.[stage]?.status ?? 'pending'

          return (
            <NavLink
              key={stage}
              to={`/project/${id}/${stage}`}
              className={({ isActive }) =>
                clsx(
                  'relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
                  'border-b-2 -mb-[2px]',
                  isActive
                    ? 'border-copper text-copper bg-copper/5'
                    : canNavigate
                      ? 'border-transparent text-steel-dim hover:text-steel hover:bg-surface-800'
                      : 'border-transparent text-surface-500 cursor-not-allowed pointer-events-none'
                )
              }
              onClick={(e) => {
                if (!canNavigate) {
                  e.preventDefault()
                }
              }}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              {STAGE_LABELS[stage]}
              <StageStatusIndicator status={status} />
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

function StageStatusIndicator({ status }: { status: StageStatus }) {
  switch (status) {
    case 'complete':
      return (
        <Check className="w-3.5 h-3.5 text-green-400" strokeWidth={2} />
      )
    case 'in_progress':
      return (
        <Loader2 className="w-3.5 h-3.5 text-copper animate-spin" strokeWidth={2} />
      )
    case 'error':
      return (
        <AlertCircle className="w-3.5 h-3.5 text-red-400" strokeWidth={2} />
      )
    default:
      return null
  }
}
