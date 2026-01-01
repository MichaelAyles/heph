import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Layout } from '@/components/Layout'
import { HomePage } from '@/pages/HomePage'
import { NewProjectPage } from '@/pages/NewProjectPage'
import { SpecPage } from '@/pages/SpecPage'
import { SpecViewerPage } from '@/pages/SpecViewerPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { BlocksPage } from '@/pages/BlocksPage'
import { AdminLogsPage } from '@/pages/AdminLogsPage'
import { LoginPage } from '@/pages/LoginPage'
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
        <Route path="new" element={<NewProjectPage />} />
        <Route path="project/:id" element={<SpecPage />} />
        <Route path="project/:id/view" element={<SpecViewerPage />} />
        <Route path="blocks" element={<BlocksPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="admin/logs" element={<AdminLogsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function AppContent() {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-ash flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-copper animate-spin" strokeWidth={1.5} />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return <AuthenticatedApp />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
