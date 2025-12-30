import { useState } from 'react'
import { Loader2, AlertCircle, LogIn } from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '@/stores/auth'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const login = useAuthStore((s) => s.login)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim() || isLoading) return

    setError(null)
    setIsLoading(true)

    const result = await login(username.trim(), password)

    if (!result.success) {
      setError(result.error || 'Login failed')
      setIsLoading(false)
    }
    // If successful, App.tsx will redirect to home
  }

  return (
    <div className="min-h-screen bg-ash flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="Phaestus" className="h-16 w-auto mb-4" />
          <h1 className="text-2xl font-semibold text-steel tracking-tight">PHAESTUS</h1>
          <p className="text-sm text-steel-dim mt-1">Forged Intelligence</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-mono text-steel-dim mb-2 tracking-wide">
              USERNAME
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              autoFocus
              className="w-full px-4 py-3 bg-surface-800 border border-surface-600 text-steel placeholder-steel-dim focus:outline-none focus:border-copper"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-steel-dim mb-2 tracking-wide">
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              className="w-full px-4 py-3 bg-surface-800 border border-surface-600 text-steel placeholder-steel-dim focus:outline-none focus:border-copper"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={!username.trim() || !password.trim() || isLoading}
            className={clsx(
              'w-full flex items-center justify-center gap-2 px-6 py-3 font-semibold transition-all mt-6',
              username.trim() && password.trim() && !isLoading
                ? 'bg-copper-gradient text-ash'
                : 'bg-surface-700 text-steel-dim cursor-not-allowed'
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
                Authenticating...
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" strokeWidth={1.5} />
                Sign In
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
