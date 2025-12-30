import { Outlet, Link, useLocation } from 'react-router-dom'
import { Home, PlusCircle, Settings, Layers } from 'lucide-react'
import { clsx } from 'clsx'

const navigation = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'New Project', href: '/new', icon: PlusCircle },
  { name: 'Block Library', href: '/blocks', icon: Layers },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Layout() {
  const location = useLocation()

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
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-surface-700">
          <p className="text-xs text-steel-dim font-mono">
            Gemini 3.0 Flash
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-screen bg-ash">
        <Outlet />
      </main>
    </div>
  )
}
