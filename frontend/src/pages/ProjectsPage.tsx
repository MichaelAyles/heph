import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Loader2,
  AlertCircle,
  FolderOpen,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  PlusCircle
} from 'lucide-react'
import { clsx } from 'clsx'

interface Project {
  id: string
  name: string
  description: string
  status: string
  createdAt: string
  updatedAt: string
}

interface ProjectsResponse {
  projects: Project[]
  total: number
  limit: number
  offset: number
}

async function fetchProjects(): Promise<ProjectsResponse> {
  const response = await fetch('/api/projects')
  if (!response.ok) throw new Error('Failed to fetch projects')
  return response.json()
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="w-4 h-4 text-emerald-400" strokeWidth={1.5} />
    case 'error':
    case 'rejected':
      return <XCircle className="w-4 h-4 text-red-400" strokeWidth={1.5} />
    default:
      return <Clock className="w-4 h-4 text-copper" strokeWidth={1.5} />
  }
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    analyzing: 'Analyzing',
    refining: 'Refining',
    generating: 'Generating',
    selecting: 'Selecting',
    finalizing: 'Finalizing',
    complete: 'Complete',
    rejected: 'Rejected',
    error: 'Error',
  }
  return labels[status] || status
}

function getProjectLink(project: Project): string {
  if (project.status === 'complete') {
    return `/project/${project.id}/view`
  }
  return `/project/${project.id}`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function ProjectsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  })

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-copper animate-spin" strokeWidth={1.5} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" strokeWidth={1.5} />
          <p className="text-red-400">Failed to load projects</p>
        </div>
      </div>
    )
  }

  const projects = data?.projects || []

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-8 border-b border-surface-700">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold text-steel tracking-tight">PROJECTS</h1>
          <span className="text-xs text-steel-dim font-mono">
            {data?.total || 0} total
          </span>
        </div>
        <Link
          to="/new"
          className="flex items-center gap-2 px-4 py-2 bg-copper-gradient text-ash font-medium"
        >
          <PlusCircle className="w-4 h-4" strokeWidth={1.5} />
          New Project
        </Link>
      </header>

      {/* Content */}
      <div className="flex-1 p-8 overflow-auto">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FolderOpen className="w-16 h-16 text-surface-600 mb-4" strokeWidth={1} />
            <h2 className="text-xl font-semibold text-steel mb-2">No projects yet</h2>
            <p className="text-steel-dim mb-6">Create your first hardware project to get started.</p>
            <Link
              to="/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-copper-gradient text-ash font-semibold"
            >
              <PlusCircle className="w-5 h-5" strokeWidth={1.5} />
              New Project
            </Link>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={getProjectLink(project)}
                className="block bg-surface-900 border border-surface-700 p-4 hover:border-copper/50 transition-colors group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base font-semibold text-steel truncate">
                        {project.name || 'Untitled Project'}
                      </h3>
                      <div className={clsx(
                        'flex items-center gap-1.5 px-2 py-0.5 text-xs font-mono',
                        project.status === 'complete' && 'bg-emerald-500/10 text-emerald-400',
                        project.status === 'rejected' && 'bg-red-500/10 text-red-400',
                        project.status === 'error' && 'bg-red-500/10 text-red-400',
                        !['complete', 'rejected', 'error'].includes(project.status) && 'bg-copper/10 text-copper'
                      )}>
                        {getStatusIcon(project.status)}
                        {getStatusLabel(project.status)}
                      </div>
                    </div>
                    <p className="text-sm text-steel-dim line-clamp-2 mb-2">
                      {project.description}
                    </p>
                    <div className="text-xs text-steel-dim font-mono">
                      Updated {formatDate(project.updatedAt)}
                    </div>
                  </div>
                  <ArrowRight
                    className="w-5 h-5 text-surface-600 group-hover:text-copper transition-colors flex-shrink-0 mt-1"
                    strokeWidth={1.5}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
