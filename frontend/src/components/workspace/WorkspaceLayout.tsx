import { useEffect } from 'react'
import { Outlet, useParams, useLocation, Navigate, useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceStageTabs } from './WorkspaceStageTabs'
import { useWorkspaceStore, type WorkspaceStage } from '@/stores/workspace'
import type { Project } from '@/db/schema'

async function fetchProject(id: string): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`)
  if (!res.ok) throw new Error('Failed to fetch project')
  const data = await res.json()
  return data.project
}

export function WorkspaceLayout() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const { setActiveStage, canNavigateTo } = useWorkspaceStore()

  const {
    data: project,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id!),
    enabled: !!id,
  })

  // Extract current stage from path
  const pathSegments = location.pathname.split('/')
  const currentStage = pathSegments[pathSegments.length - 1] as WorkspaceStage

  // Update active stage when route changes
  useEffect(() => {
    if (currentStage && ['spec', 'pcb', 'enclosure', 'firmware', 'export', 'files'].includes(currentStage)) {
      setActiveStage(currentStage)
    }
  }, [currentStage, setActiveStage])

  // Redirect /project/:id to /project/:id/spec
  if (location.pathname === `/project/${id}`) {
    return <Navigate to={`/project/${id}/spec`} replace />
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-2">Failed to load project</p>
          <p className="text-steel-dim text-sm">{(error as Error).message}</p>
        </div>
      </div>
    )
  }

  if (isLoading && !project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-copper animate-spin" strokeWidth={1.5} />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <WorkspaceHeader project={project || null} isLoading={isLoading} />
      <WorkspaceStageTabs spec={project?.spec || null} canNavigateTo={canNavigateTo} />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <Outlet context={{ project, isLoading }} />
        </div>
      </div>
    </div>
  )
}

// Hook to access workspace context in child routes
interface WorkspaceContext {
  project: Project | null
  isLoading: boolean
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspaceContext() {
  return useOutletContext<WorkspaceContext>()
}
