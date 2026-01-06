import { useEffect, useCallback, useRef } from 'react'
import { Outlet, useParams, useLocation, Navigate, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceStageTabs } from './WorkspaceStageTabs'
import { OrchestratorSidebar } from './OrchestratorSidebar'
import { useWorkspaceStore, type WorkspaceStage } from '@/stores/workspace'
import { useOrchestratorStore } from '@/stores/orchestrator'
import type { Project, ProjectSpec } from '@/db/schema'

async function fetchProject(id: string): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`)
  if (!res.ok) throw new Error('Failed to fetch project')
  const data = await res.json()
  return data.project
}

export function WorkspaceLayout() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { setActiveStage, canNavigateTo, isSidebarCollapsed, toggleSidebar } = useWorkspaceStore()

  // Orchestrator state for auto-navigation
  const orchestratorStatus = useOrchestratorStore((s) => s.status)
  const orchestratorStage = useOrchestratorStore((s) => s.currentStage)
  const prevStageRef = useRef(orchestratorStage)

  const {
    data: project,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id!),
    enabled: !!id,
    refetchInterval: () => {
      // Refetch every 1s while orchestrator is running for live updates
      const isOrchestratorActive = ['running', 'validating', 'fixing'].includes(orchestratorStatus)
      if (isOrchestratorActive) return 1000
      return false
    },
  })

  // Handler for orchestrator spec updates
  // Fetches fresh data before merging to avoid race conditions
  const handleOrchestratorSpecUpdate = useCallback(
    async (specUpdate: Partial<ProjectSpec>) => {
      if (!id) return

      // Fetch current project to get fresh spec (avoid stale cache issues)
      const getRes = await fetch(`/api/projects/${id}`)
      if (!getRes.ok) {
        console.error('Failed to fetch project for spec update')
        return
      }
      const { project: freshProject } = await getRes.json()

      // Merge with fresh spec
      const mergedSpec = { ...freshProject?.spec, ...specUpdate }

      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: mergedSpec }),
      })
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['project', id] })
      } else {
        console.error('Failed to update spec:', await res.text())
      }
    },
    [id, queryClient]
  )

  // Extract current stage from path
  const pathSegments = location.pathname.split('/')
  const currentStage = pathSegments[pathSegments.length - 1] as WorkspaceStage

  // Update active stage when route changes
  useEffect(() => {
    if (currentStage && ['spec', 'pcb', 'enclosure', 'firmware', 'export'].includes(currentStage)) {
      setActiveStage(currentStage)
    }
  }, [currentStage, setActiveStage])

  // Auto-navigate when orchestrator advances to a new stage (visual feedback)
  useEffect(() => {
    const isRunning = orchestratorStatus === 'running' || orchestratorStatus === 'validating'
    const stageChanged = orchestratorStage !== prevStageRef.current

    if (isRunning && stageChanged && id) {
      // Navigate to the new stage
      navigate(`/project/${id}/${orchestratorStage}`)
      prevStageRef.current = orchestratorStage
    }
  }, [orchestratorStatus, orchestratorStage, id, navigate])

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
        {/* Main content area */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <Outlet context={{ project, isLoading }} />
        </div>
        {/* AI Assistant Sidebar */}
        <OrchestratorSidebar
          project={project || null}
          onSpecUpdate={handleOrchestratorSpecUpdate}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />
      </div>
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
