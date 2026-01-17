import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Layout } from '@/components/Layout'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { HomePage } from '@/pages/HomePage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { NewProjectPage } from '@/pages/NewProjectPage'
import { SpecViewerPage } from '@/pages/SpecViewerPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { BlocksPage } from '@/pages/BlocksPage'
import { AdminLogsPage } from '@/pages/AdminLogsPage'
import { AdminUsersPage } from '@/pages/AdminUsersPage'
import { AdminLLMsPage } from '@/pages/AdminLLMsPage'
import { AdminOrchestratorPage } from '@/pages/AdminOrchestratorPage'
import { AdminBlocksPage } from '@/pages/AdminBlocksPage'
import { LandingPage } from '@/pages/LandingPage'
import { GalleryPage } from '@/pages/GalleryPage'
import { GalleryDetailPage } from '@/pages/GalleryDetailPage'
import {
  SpecStageView,
  PCBStageView,
  EnclosureStageView,
  FirmwareStageView,
  ExportStageView,
  FilesStageView,
} from '@/pages/workspace'
import { useAuthStore } from '@/stores/auth'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

function AuthenticatedApp() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="new" element={<NewProjectPage />} />
        {/* Workspace routes with stage tabs */}
        <Route path="project/:id" element={<WorkspaceLayout />}>
          <Route index element={<Navigate to="spec" replace />} />
          <Route path="spec" element={<SpecStageView />} />
          <Route path="pcb" element={<PCBStageView />} />
          <Route path="enclosure" element={<EnclosureStageView />} />
          <Route path="firmware" element={<FirmwareStageView />} />
          <Route path="export" element={<ExportStageView />} />
          <Route path="files" element={<FilesStageView />} />
        </Route>
        <Route path="project/:id/view" element={<SpecViewerPage />} />
        <Route path="blocks" element={<BlocksPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="admin/logs" element={<AdminLogsPage />} />
        <Route path="admin/users" element={<AdminUsersPage />} />
        <Route path="admin/blocks" element={<AdminBlocksPage />} />
        <Route path="admin/llms" element={<AdminLLMsPage />} />
        <Route path="admin/orchestrator" element={<AdminOrchestratorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function AppContent() {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Public routes that don't require authentication
  const isPublicRoute = location.pathname.startsWith('/gallery')

  if (isLoading && !isPublicRoute) {
    return (
      <div className="min-h-screen bg-ash flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-copper animate-spin" strokeWidth={1.5} />
      </div>
    )
  }

  // Handle public routes (gallery) regardless of auth state
  if (isPublicRoute) {
    return (
      <Routes>
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/gallery/:id" element={<GalleryDetailPage />} />
      </Routes>
    )
  }

  if (!isAuthenticated) {
    return <LandingPage />
  }

  return <AuthenticatedApp />
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
