import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  AlertCircle,
  FolderOpen,
  CheckCircle2,
  XCircle,
  ArrowRight,
  PlusCircle,
  Trash2,
  Wrench,
  FileText,
  Cpu,
  Box,
  Code,
  Package,
} from 'lucide-react'
import { clsx } from 'clsx'

interface StageStatus {
  status: 'pending' | 'in_progress' | 'complete'
  completedAt?: string
}

interface ProjectSpec {
  stages?: {
    spec?: StageStatus
    pcb?: StageStatus
    enclosure?: StageStatus
    firmware?: StageStatus
    export?: StageStatus
  }
}

interface Project {
  id: string
  name: string
  description: string
  status: string
  spec?: ProjectSpec
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

async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error('Failed to delete project')
}

const STAGES = [
  { key: 'spec', label: 'Spec', icon: FileText },
  { key: 'pcb', label: 'PCB', icon: Cpu },
  { key: 'enclosure', label: 'Enclosure', icon: Box },
  { key: 'firmware', label: 'Firmware', icon: Code },
  { key: 'export', label: 'Export', icon: Package },
] as const

function StageProgressIndicator({ project }: { project: Project }) {
  const stages = project.spec?.stages

  // Determine stage status based on project status and stage data
  const getStageState = (stageKey: string): 'complete' | 'current' | 'pending' => {
    const stageStatus = stages?.[stageKey as keyof typeof stages]?.status

    if (stageStatus === 'complete') return 'complete'
    if (stageStatus === 'in_progress') return 'current'

    // For spec stage, check project status
    if (stageKey === 'spec') {
      if (project.status === 'complete') return 'complete'
      if (['analyzing', 'refining', 'generating', 'selecting', 'finalizing'].includes(project.status)) {
        return 'current'
      }
      if (project.status === 'draft') return 'current'
    }

    return 'pending'
  }

  // Find the current active stage for display
  const getCurrentStageLabel = (): string => {
    if (project.status === 'rejected') return 'Rejected'
    if (project.status === 'error') return 'Error'

    for (const stage of STAGES) {
      const state = getStageState(stage.key)
      if (state === 'current') {
        // Add more detail for spec stage
        if (stage.key === 'spec') {
          const specLabels: Record<string, string> = {
            draft: 'Starting',
            analyzing: 'Analyzing',
            refining: 'Refining',
            generating: 'Generating',
            selecting: 'Selecting',
            finalizing: 'Finalizing',
          }
          return specLabels[project.status] || stage.label
        }
        return stage.label
      }
    }

    // All complete
    return 'Complete'
  }

  const isRejected = project.status === 'rejected'
  const isError = project.status === 'error'

  return (
    <div className="flex items-center gap-1">
      {STAGES.map((stage, index) => {
        const state = getStageState(stage.key)
        const Icon = stage.icon

        return (
          <div key={stage.key} className="flex items-center">
            <div
              className={clsx(
                'w-6 h-6 rounded-full flex items-center justify-center transition-colors',
                state === 'complete' && 'bg-emerald-500/20',
                state === 'current' && !isRejected && !isError && 'bg-copper/20',
                state === 'current' && isRejected && 'bg-red-500/20',
                state === 'current' && isError && 'bg-red-500/20',
                state === 'pending' && 'bg-surface-700'
              )}
              title={stage.label}
            >
              {state === 'complete' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2} />
              ) : state === 'current' && (isRejected || isError) ? (
                <XCircle className="w-3.5 h-3.5 text-red-400" strokeWidth={2} />
              ) : (
                <Icon
                  className={clsx(
                    'w-3.5 h-3.5',
                    state === 'current' && 'text-copper',
                    state === 'pending' && 'text-surface-500'
                  )}
                  strokeWidth={1.5}
                />
              )}
            </div>
            {index < STAGES.length - 1 && (
              <div
                className={clsx(
                  'w-2 h-0.5 mx-0.5',
                  state === 'complete' ? 'bg-emerald-500/40' : 'bg-surface-700'
                )}
              />
            )}
          </div>
        )
      })}
      <span
        className={clsx(
          'ml-2 text-xs font-medium',
          isRejected && 'text-red-400',
          isError && 'text-red-400',
          !isRejected && !isError && getCurrentStageLabel() === 'Complete' && 'text-emerald-400',
          !isRejected && !isError && getCurrentStageLabel() !== 'Complete' && 'text-copper'
        )}
      >
        {getCurrentStageLabel()}
      </span>
    </div>
  )
}

function getProjectLink(project: Project): string {
  // Default to workspace for all projects
  return `/project/${project.id}/spec`
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
  const queryClient = useQueryClient()
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setDeleteConfirm(null)
    },
  })

  const handleDeleteClick = (e: React.MouseEvent, projectId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDeleteConfirm(projectId)
  }

  const handleConfirmDelete = (projectId: string) => {
    deleteMutation.mutate(projectId)
  }

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
          <span className="text-xs text-steel-dim font-mono">{data?.total || 0} total</span>
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
            <p className="text-steel-dim mb-6">
              Create your first hardware project to get started.
            </p>
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
              <div key={project.id} className="relative">
                {deleteConfirm === project.id ? (
                  <div className="bg-red-500/10 border border-red-500/30 p-4">
                    <p className="text-steel mb-3">
                      Delete "{project.name || 'Untitled Project'}"?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConfirmDelete(project.id)}
                        disabled={deleteMutation.isPending}
                        className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors text-sm"
                      >
                        {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-4 py-2 bg-surface-700 text-steel hover:bg-surface-600 transition-colors text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <Link
                    to={getProjectLink(project)}
                    className="block bg-surface-900 border border-surface-700 p-4 hover:border-copper/50 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-base font-semibold text-steel truncate">
                            {project.name || 'Untitled Project'}
                          </h3>
                        </div>
                        <div className="mb-2">
                          <StageProgressIndicator project={project} />
                        </div>
                        <p className="text-sm text-steel-dim line-clamp-2 mb-2">
                          {project.description}
                        </p>
                        <div className="text-xs text-steel-dim font-mono">
                          Updated {formatDate(project.updatedAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                        <button
                          onClick={(e) => handleDeleteClick(e, project.id)}
                          className="p-1.5 text-surface-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete project"
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                        <div className="flex items-center gap-1 px-2 py-1 bg-copper/10 text-copper text-xs font-medium rounded">
                          <Wrench className="w-3 h-3" strokeWidth={1.5} />
                          Workbench
                        </div>
                        <ArrowRight
                          className="w-5 h-5 text-surface-600 group-hover:text-copper transition-colors"
                          strokeWidth={1.5}
                        />
                      </div>
                    </div>
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
