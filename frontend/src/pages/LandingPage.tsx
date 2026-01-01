import { useState } from 'react'
import {
  Loader2,
  AlertCircle,
  LogIn,
  Cpu,
  Zap,
  Package,
  FileCode,
  Layers,
  Box,
  ArrowRight,
  ChevronRight,
  Mail,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '@/stores/auth'

export function LandingPage() {
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
  }

  return (
    <div className="min-h-screen bg-ash">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-ash/80 backdrop-blur-sm border-b border-surface-700">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Phaestus" className="h-8 w-auto" />
            <span className="text-lg font-semibold tracking-tight text-steel">PHAESTUS</span>
          </div>
          <a
            href="#login"
            className="px-4 py-2 bg-copper-gradient text-ash text-sm font-medium"
          >
            Sign In
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-copper/10 text-copper text-sm font-medium mb-8 border border-copper/20">
            <Zap className="w-4 h-4" strokeWidth={1.5} />
            <span className="font-mono text-xs tracking-wide">AI-POWERED HARDWARE DESIGN</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-steel mb-6 leading-tight tracking-tight">
            From Description to<br />
            <span className="text-copper">Manufacturable Hardware</span>
          </h1>

          <p className="text-xl text-steel-dim mb-10 max-w-2xl mx-auto leading-relaxed">
            PHAESTUS transforms your natural language specifications into complete hardware designs.
            Schematics. PCBs. Enclosures. Firmware. Ready to manufacture.
          </p>

          <div className="flex items-center justify-center gap-4">
            <a
              href="#login"
              className="inline-flex items-center gap-2 px-8 py-4 bg-copper-gradient text-ash font-semibold text-lg"
            >
              Get Started
              <ArrowRight className="w-5 h-5" strokeWidth={2} />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-8 py-4 bg-surface-800 hover:bg-surface-700 text-steel font-medium text-lg border border-surface-600 transition-colors"
            >
              See How It Works
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-surface-900 border-y border-surface-700">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-steel mb-4">Complete Hardware Outputs</h2>
            <p className="text-steel-dim max-w-2xl mx-auto">
              Everything you need to go from idea to production, generated automatically.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              icon={FileCode}
              title="KiCad Schematics"
              description="Professional circuit schematics with proper symbols, nets, and annotations. Ready for review and modification."
            />
            <FeatureCard
              icon={Layers}
              title="PCB Layouts"
              description="Gerber files for manufacturing. 12.7mm grid placement ensures reliable routing and assembly."
            />
            <FeatureCard
              icon={Box}
              title="3D Enclosures"
              description="OpenSCAD parametric designs. Export to STL for 3D printing or step for CNC machining."
            />
            <FeatureCard
              icon={Cpu}
              title="Firmware Scaffolding"
              description="ESP32 and STM32 starter code with pin definitions, peripheral initialization, and build configs."
            />
            <FeatureCard
              icon={Package}
              title="Bill of Materials"
              description="Complete BOM with part numbers, quantities, suppliers, and estimated costs."
            />
            <FeatureCard
              icon={Zap}
              title="Pre-validated Blocks"
              description="21 tested circuit modules. Proven designs assembled based on your requirements."
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-steel mb-4">How It Works</h2>
            <p className="text-steel-dim max-w-2xl mx-auto">
              Five steps from idea to manufacturable design.
            </p>
          </div>

          <div className="space-y-8">
            <ProcessStep
              number={1}
              title="Describe Your Project"
              description="Tell us what you want to build in plain English. 'A temperature monitoring device with WiFi and a display' is all you need."
            />
            <ProcessStep
              number={2}
              title="Feasibility Analysis"
              description="Our AI analyzes your requirements across communication, processing, power, and I/O categories. We identify what's buildable and what needs clarification."
            />
            <ProcessStep
              number={3}
              title="Refine Specifications"
              description="Answer targeted questions to lock down design decisions. Battery type, enclosure style, connectivity range - only what matters."
            />
            <ProcessStep
              number={4}
              title="Choose Your Design"
              description="Review 4 AI-generated product renders. Pick the one that matches your vision."
            />
            <ProcessStep
              number={5}
              title="Download Everything"
              description="Get your complete package: KiCad project, Gerbers, enclosure files, firmware starter, and documentation."
            />
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-20 px-6 bg-surface-900 border-y border-surface-700">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-steel mb-4">Built for Reliability</h2>
          <p className="text-steel-dim mb-12 max-w-2xl mx-auto">
            Powered by proven technologies and running on the edge for global performance.
          </p>

          <div className="flex flex-wrap justify-center gap-4">
            {['React', 'TypeScript', 'Cloudflare', 'D1 SQLite', 'R2 Storage', 'Gemini 3.0'].map((tech) => (
              <span
                key={tech}
                className="px-4 py-2 bg-surface-800 border border-surface-600 text-steel-dim font-mono text-sm"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Login Section */}
      <section id="login" className="py-20 px-6">
        <div className="max-w-sm mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-steel mb-2">Sign In</h2>
            <p className="text-steel-dim text-sm">Access your hardware projects</p>
          </div>

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
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-surface-700">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Phaestus" className="h-8 w-auto opacity-60" />
              <div>
                <span className="text-steel font-semibold">PHAESTUS</span>
                <p className="text-steel-dim text-sm">Forged Intelligence</p>
              </div>
            </div>

            <a
              href="mailto:contact@phaestus.app"
              className="inline-flex items-center gap-2 text-steel-dim hover:text-copper transition-colors"
            >
              <Mail className="w-4 h-4" strokeWidth={1.5} />
              contact@phaestus.app
            </a>
          </div>

          <div className="mt-8 pt-8 border-t border-surface-800 text-center">
            <p className="text-steel-dim text-sm">
              &copy; {new Date().getFullYear()} Phaestus. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  title: string
  description: string
}) {
  return (
    <div className="p-6 bg-surface-800 border border-surface-700">
      <div className="w-12 h-12 bg-copper/10 flex items-center justify-center mb-4 border border-copper/20">
        <Icon className="w-6 h-6 text-copper" strokeWidth={1.5} />
      </div>
      <h3 className="text-lg font-semibold text-steel mb-2">{title}</h3>
      <p className="text-sm text-steel-dim leading-relaxed">{description}</p>
    </div>
  )
}

function ProcessStep({
  number,
  title,
  description,
}: {
  number: number
  title: string
  description: string
}) {
  return (
    <div className="flex gap-6">
      <div className="flex-shrink-0 w-12 h-12 bg-copper-gradient flex items-center justify-center text-ash font-bold text-lg">
        {number}
      </div>
      <div className="flex-1 pt-1">
        <h3 className="text-lg font-semibold text-steel mb-2 flex items-center gap-2">
          {title}
          <ChevronRight className="w-4 h-4 text-copper" strokeWidth={2} />
        </h3>
        <p className="text-steel-dim leading-relaxed">{description}</p>
      </div>
    </div>
  )
}
