import { useEffect } from 'react'
import { Outlet, useParams, useLocation, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceStageTabs } from './WorkspaceStageTabs'
import { OrchestratorPanel } from './OrchestratorPanel'
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
    refetchInterval: (query) => {
      // Refetch every 2s while project is in an active state
      const status = query.state.data?.status
      const activeStatuses = ['analyzing', 'refining', 'generating', 'finalizing']
      return status && activeStatuses.includes(status) ? 2000 : false
    },
  })

  // Extract current stage from path
  const pathSegments = location.pathname.split('/')
  const currentStage = pathSegments[pathSegments.length - 1] as WorkspaceStage

  // Update active stage when route changes
  useEffect(() => {
    if (currentStage && ['spec', 'pcb', 'enclosure', 'firmware', 'export'].includes(currentStage)) {
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
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <Outlet context={{ project, isLoading }} />
      </div>
      <OrchestratorPanel />
    </div>
  )
}

// Hook to access workspace context in child routes
import { useOutletContext } from 'react-router-dom'

interface WorkspaceContext {
  project: Project | null
  isLoading: boolean
}

export function useWorkspaceContext() {
  return useOutletContext<WorkspaceContext>()
}
