import { Outlet, Link, useLocation, useParams } from 'react-router-dom'
import {
  Home,
  FolderOpen,
  PlusCircle,
  Settings,
  Layers,
  LogOut,
  User,
  Users,
  ScrollText,
  Cpu,
  Zap,
  Shield,
  Pencil,
  Wrench,
  MessageSquare,
  FileText,
  SlidersHorizontal,
  Network,
  Monitor,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore, type ControlMode } from '@/stores/auth'

const MODE_CONFIG: Record<ControlMode, { icon: typeof Zap; label: string; color: string }> = {
  vibe_it: { icon: Zap, label: 'Vibe It', color: 'text-emerald-400' },
  fix_it: { icon: Shield, label: 'Fix It', color: 'text-copper' },
  design_it: { icon: Pencil, label: 'Design It', color: 'text-blue-400' },
}

const navigation = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'Projects', href: '/projects', icon: FolderOpen },
  { name: 'New Project', href: '/new', icon: PlusCircle },
  { name: 'Block Library', href: '/blocks', icon: Layers },
  { name: 'Settings', href: '/settings', icon: Settings },
]

const adminNavigation = [
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Blocks', href: '/admin/blocks', icon: Layers },
  { name: 'LLMs', href: '/admin/llms', icon: Cpu },
  { name: 'Prompts', href: '/admin/system-prompts', icon: SlidersHorizontal },
  { name: 'LangGraph', href: '/admin/langgraph', icon: Network },
  { name: 'Blog', href: '/admin/blog', icon: FileText },
  { name: 'Logs', href: '/admin/logs', icon: ScrollText },
]

export function Layout() {
  const location = useLocation()
  const params = useParams()
  const { user, logout } = useAuthStore()

  // Extract project ID from URL if we're viewing a project
  const projectIdFromPath = location.pathname.match(/\/project\/([^/]+)/)?.[1]
  const projectId = params.id || projectIdFromPath

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Mobile Warning - shown on small screens */}
      <div className="md:hidden flex flex-col items-center justify-center h-full w-full p-8 text-center bg-ash">
        <img src="/logo.png" alt="Phaestus" className="h-12 w-auto object-contain mb-6" />
        <Monitor className="w-16 h-16 text-copper mb-4" />
        <h2 className="text-lg font-semibold text-steel mb-2">Desktop Required</h2>
        <p className="text-sm text-steel-dim max-w-xs mb-6">
          PHAESTUS is a hardware design platform that requires a larger screen. Please use a desktop
          or tablet in landscape mode.
        </p>
        <button
          onClick={logout}
          className="flex items-center gap-2 px-4 py-2 text-sm text-steel-dim hover:text-steel bg-surface-800 hover:bg-surface-700 rounded transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>

      {/* Desktop Layout - hidden on small screens */}
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 bg-surface-900 border-r border-surface-700 flex-col flex-shrink-0">
        {/* Logo */}
        <Link
          to="/"
          className="h-16 flex items-center gap-3 px-5 border-b border-surface-700 hover:bg-surface-800 transition-colors"
        >
          <img src="/logo.png" alt="Phaestus" className="h-8 w-auto object-contain" />
          <span className="text-xl font-semibold tracking-tight text-steel">PHAESTUS</span>
        </Link>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto min-h-0">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.name}
                to={item.href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-copper/10 text-copper border-l-2 border-copper'
                    : 'text-steel-dim hover:text-steel hover:bg-surface-800'
                )}
              >
                <item.icon className="w-5 h-5" strokeWidth={1.5} />
                {item.name}
              </Link>
            )
          })}

          {/* Workbench Link - shown when viewing a project */}
          {projectId && (
            <>
              <div className="pt-4 pb-2">
                <span className="px-3 text-xs font-mono text-steel-dim tracking-wide">
                  CURRENT PROJECT
                </span>
              </div>
              <Link
                to={`/project/${projectId}/spec`}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors',
                  location.pathname.startsWith(`/project/${projectId}`) &&
                    !location.pathname.endsWith('/view')
                    ? 'bg-copper/10 text-copper border-l-2 border-copper'
                    : 'text-steel-dim hover:text-steel hover:bg-surface-800'
                )}
              >
                <Wrench className="w-5 h-5" strokeWidth={1.5} />
                Workbench
              </Link>
            </>
          )}

          {/* Admin Navigation */}
          {user?.isAdmin && (
            <>
              <div className="pt-4 pb-2">
                <span className="px-3 text-xs font-mono text-steel-dim tracking-wide">ADMIN</span>
              </div>
              {adminNavigation.map((item) => {
                const isActive = location.pathname === item.href
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-copper/10 text-copper border-l-2 border-copper'
                        : 'text-steel-dim hover:text-steel hover:bg-surface-800'
                    )}
                  >
                    <item.icon className="w-5 h-5" strokeWidth={1.5} />
                    {item.name}
                  </Link>
                )
              })}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-surface-700 space-y-3 flex-shrink-0">
          {/* User */}
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-steel-dim" strokeWidth={1.5} />
            <span className="text-steel truncate">{user?.displayName || user?.username}</span>
          </div>

          {/* Control Mode Indicator */}
          {user?.controlMode && (
            <Link
              to="/settings"
              className="flex items-center gap-2 px-2 py-1.5 bg-surface-800 hover:bg-surface-700 rounded transition-colors"
              title="Click to change control mode"
            >
              {(() => {
                const mode = MODE_CONFIG[user.controlMode]
                const ModeIcon = mode.icon
                return (
                  <>
                    <ModeIcon className={clsx('w-4 h-4', mode.color)} strokeWidth={1.5} />
                    <span className={clsx('text-xs font-medium', mode.color)}>{mode.label}</span>
                  </>
                )
              })()}
            </Link>
          )}

          <button
            onClick={logout}
            className="flex items-center gap-2 p-1.5 text-steel-dim hover:text-steel hover:bg-surface-800 transition-colors w-full"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-xs">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="hidden md:flex flex-1 flex-col min-h-0 bg-ash overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
