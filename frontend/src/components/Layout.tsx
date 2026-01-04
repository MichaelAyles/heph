import { Outlet, Link, useLocation } from 'react-router-dom'
import { Home, FolderOpen, PlusCircle, Settings, Layers, LogOut, User, ScrollText, Zap, Shield, Pencil } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore, type ControlMode } from '@/stores/auth'

const MODE_CONFIG: Record<ControlMode, { icon: typeof Zap; label: string; color: string }> = {
  vibe_it: { icon: Zap, label: 'Vibe It', color: 'text-emerald-400' },
  fix_it: { icon: Shield, label: 'Fix It', color: 'text-copper' },
  design_it: { icon: Pencil, label: 'Design It', color: 'text-blue-400' },
}

const navigation = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Projects', href: '/projects', icon: FolderOpen },
  { name: 'New Project', href: '/new', icon: PlusCircle },
  { name: 'Block Library', href: '/blocks', icon: Layers },
  { name: 'Settings', href: '/settings', icon: Settings },
]

const adminNavigation = [
  { name: 'Logs', href: '/admin/logs', icon: ScrollText },
]

export function Layout() {
  const location = useLocation()
  const { user, logout } = useAuthStore()

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-surface-900 border-r border-surface-700 flex flex-col">
        {/* Logo */}
        <Link to="/" className="h-16 flex items-center gap-3 px-5 border-b border-surface-700 hover:bg-surface-800 transition-colors">
          <img src="/logo.png" alt="Phaestus" className="h-8 w-auto object-contain" />
          <span className="text-xl font-semibold tracking-tight text-steel">PHAESTUS</span>
        </Link>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
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
        <div className="p-4 border-t border-surface-700 space-y-3">
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

          <div className="flex items-center justify-between">
            <p className="text-xs text-steel-dim font-mono">
              Gemini 3.0 Flash
            </p>
            <button
              onClick={logout}
              className="p-1.5 text-steel-dim hover:text-steel hover:bg-surface-800 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-screen bg-ash">
        <Outlet />
      </main>
    </div>
  )
}
