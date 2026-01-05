import { Link } from 'react-router-dom'
import { PlusCircle, Cpu, Zap, Package, ArrowRight } from 'lucide-react'

export function HomePage() {
  return (
    <div className="flex-1 flex flex-col">
      {/* Hero Section */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-copper/10 text-copper text-sm font-medium mb-8 border border-copper/20">
            <Zap className="w-4 h-4" strokeWidth={1.5} />
            <span className="font-mono text-xs tracking-wide">GEMINI 3.0 FLASH</span>
          </div>

          <h1 className="text-5xl font-bold text-steel mb-6 leading-tight tracking-tight">
            Describe. Forge. Build.
          </h1>

          <p className="text-lg text-steel-dim mb-8 max-w-2xl mx-auto leading-relaxed">
            PHAESTUS transforms specifications into manufacturable hardware. Schematics. PCBs.
            Enclosures. Firmware. Complete.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Link
              to="/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-copper-gradient text-ash font-semibold transition-all"
            >
              <PlusCircle className="w-5 h-5" strokeWidth={1.5} />
              New Project
            </Link>
            <Link
              to="/blocks"
              className="inline-flex items-center gap-2 px-6 py-3 bg-surface-800 hover:bg-surface-700 text-steel font-medium transition-colors border border-surface-600"
            >
              Block Library
              <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="border-t border-surface-700 bg-surface-900 p-8">
        <div className="max-w-5xl mx-auto grid grid-cols-3 gap-6">
          <FeatureCard
            icon={Cpu}
            title="Pre-validated Blocks"
            description="21 circuit modules. Tested. Proven. AI selects and assembles based on requirements."
          />
          <FeatureCard
            icon={Package}
            title="Complete Outputs"
            description="KiCad schematics. Gerber files. 3D-printable enclosures. Firmware scaffolding."
          />
          <FeatureCard
            icon={Zap}
            title="Deterministic Layout"
            description="12.7mm grid placement. No autorouting failures. Guaranteed success."
          />
        </div>
      </div>
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
      <div className="w-10 h-10 bg-copper/10 flex items-center justify-center mb-4 border border-copper/20">
        <Icon className="w-5 h-5 text-copper" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-steel mb-2">{title}</h3>
      <p className="text-sm text-steel-dim leading-relaxed">{description}</p>
    </div>
  )
}
