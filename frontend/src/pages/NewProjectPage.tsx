import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, Loader2, ArrowRight, Terminal } from 'lucide-react'
import { clsx } from 'clsx'

const EXAMPLE_PROMPTS = [
  'Battery-powered plant moisture monitor with WiFi alerts',
  'Smart doorbell with motion detection and OLED display',
  'Temperature logger with SD card storage and USB-C charging',
  'Desk air quality monitor with CO2 and particulate sensors',
]

export function NewProjectPage() {
  const navigate = useNavigate()
  const [description, setDescription] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim() || isAnalyzing) return

    setIsAnalyzing(true)

    // TODO: Call LLM to analyze requirements
    // For now, simulate a delay and navigate
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Create project and navigate
    const projectId = crypto.randomUUID()
    navigate(`/project/${projectId}`, { state: { description } })
  }

  const handleExampleClick = (example: string) => {
    setDescription(example)
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="h-14 flex items-center px-8 border-b border-surface-700">
        <h1 className="text-base font-semibold text-steel tracking-tight">NEW PROJECT</h1>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-steel mb-3 tracking-tight">
              Specify your hardware.
            </h2>
            <p className="text-steel-dim">
              Describe the device. Be specific about sensors, connectivity, and power requirements.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="I need a device that..."
                rows={5}
                className={clsx(
                  'w-full px-4 py-3 bg-surface-800 border text-steel placeholder-steel-dim',
                  'resize-none focus:outline-none',
                  'border-surface-600 focus:border-copper'
                )}
                disabled={isAnalyzing}
              />
              <div className="absolute bottom-3 right-3 text-xs text-steel-dim font-mono">
                {description.length}
              </div>
            </div>

            <button
              type="submit"
              disabled={!description.trim() || isAnalyzing}
              className={clsx(
                'w-full flex items-center justify-center gap-2 px-6 py-3 font-semibold transition-all',
                description.trim() && !isAnalyzing
                  ? 'bg-copper-gradient text-ash'
                  : 'bg-surface-700 text-steel-dim cursor-not-allowed'
              )}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
                  Forging...
                </>
              ) : (
                <>
                  <Flame className="w-5 h-5" strokeWidth={1.5} />
                  Forge Design
                  <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </>
              )}
            </button>
          </form>

          {/* Example prompts */}
          <div className="mt-8">
            <div className="flex items-center gap-2 text-sm text-steel-dim mb-3">
              <Terminal className="w-4 h-4" strokeWidth={1.5} />
              <span className="font-mono text-xs">EXAMPLES</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((example) => (
                <button
                  key={example}
                  onClick={() => handleExampleClick(example)}
                  className="px-3 py-1.5 bg-surface-800 text-sm text-steel-dim hover:text-steel hover:bg-surface-700 transition-colors border border-surface-700"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
