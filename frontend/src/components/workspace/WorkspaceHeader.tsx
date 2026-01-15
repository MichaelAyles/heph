import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import type { Project } from '@/db/schema'

interface WorkspaceHeaderProps {
  project: Project | null
  isLoading: boolean
}

export function WorkspaceHeader({ project, isLoading }: WorkspaceHeaderProps) {
  if (isLoading) {
    return (
      <header className="h-14 border-b border-surface-700 bg-surface-900 flex items-center px-4 gap-4">
        <Loader2 className="w-5 h-5 text-steel-dim animate-spin" />
      </header>
    )
  }

  return (
    <header className="h-14 border-b border-surface-700 bg-surface-900 flex items-center px-4 gap-4">
      <Link
        to="/projects"
        className="p-1.5 -ml-1.5 text-steel-dim hover:text-steel hover:bg-surface-800 transition-colors rounded"
      >
        <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
      </Link>

      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold text-steel truncate">
          {project?.spec?.finalSpec?.name || project?.name || 'Project'}
        </h1>
      </div>

      {project && (
        <div className="flex items-center gap-2">
          <StatusBadge status={project.status} />
        </div>
      )}
    </header>
  )
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'bg-surface-700 text-steel-dim' },
    analyzing: { label: 'Analyzing', className: 'bg-amber-500/20 text-amber-400' },
    rejected: { label: 'Rejected', className: 'bg-red-500/20 text-red-400' },
    refining: { label: 'Refining', className: 'bg-blue-500/20 text-blue-400' },
    generating: { label: 'Generating', className: 'bg-purple-500/20 text-purple-400' },
    selecting: { label: 'Selecting', className: 'bg-indigo-500/20 text-indigo-400' },
    finalizing: { label: 'Finalizing', className: 'bg-cyan-500/20 text-cyan-400' },
    complete: { label: 'Complete', className: 'bg-green-500/20 text-green-400' },
  }

  const config = statusConfig[status] || statusConfig.draft

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${config.className}`}>
      {config.label}
    </span>
  )
}
