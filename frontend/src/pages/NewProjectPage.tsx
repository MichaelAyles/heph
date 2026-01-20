import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, Loader2, ArrowRight, Terminal, AlertCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { logger } from '@/lib/logger'

const MAX_DESCRIPTION_LENGTH = 2000

const EXAMPLE_PROMPTS = [
  // #1 - Presentation remote (uses what we have: ESP32-C6, buttons, LEDs, XIAO with battery charging)
  'Wireless presentation clicker using BLE HID. Three buttons for next slide, previous, and blank screen. RGB LED to show connection status. Rechargeable via USB-C. Should pair directly with my laptop like a normal bluetooth remote.',

  // #2 - Soil moisture monitor (needs: BME280, soil probe, OLED - we don't have these yet)
  'Garden moisture sensor that texts me when plants need water. ESP32-C6 with WiFi, BME280 for temp and humidity, capacitive soil probe, small OLED to show readings. Battery powered with USB-C charging. Needs to survive outdoors.',

  // #3 - Smart doorbell (needs: PIR, OLED, piezo, WS2812B strip)
  'Motion doorbell that pings my phone. PIR sensor to detect someone approaching, little OLED showing how many visitors today, piezo for the chime sound, RGB LED ring for status. Runs on 5V USB-C. Goes outside so needs weatherproofing.',

  // #4 - Environment logger (needs: BME280, VEML7700, LCD)
  'Portable weather station I can leave places. BME280 for the usual temp/humidity/pressure, light sensor too. LCD screen showing live readings, button to flip between different views. Battery with USB charging, uploads data over WiFi.',

  // #5 - Air quality display (needs: BME280, VEML7700, LCD, WS2812B strip)
  'Desktop air quality thing for my office. Shows temperature, humidity, pressure, light levels on a little LCD. LED strip that changes color based on conditions. USB powered, pushes data to Home Assistant.',

  // #6 - USB power meter (needs: current sensing, LCD, passthrough USB-C hardware)
  'Inline USB-C power monitor. Shows volts, amps, watts, total energy used on a small screen. Logs everything to the cloud. Sits between charger and device without adding much bulk.',
]

export function NewProjectPage() {
  const navigate = useNavigate()
  const [description, setDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim() || isCreating) return

    setIsCreating(true)
    setError(null)

    try {
      // Create project with initial spec structure
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Project',
          description: description.trim(),
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create project')
      }

      const { project } = await response.json()

      // Initialize spec with the new pipeline structure
      await fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'analyzing',
          spec: {
            description: description.trim(),
            feasibility: null,
            openQuestions: [],
            decisions: [],
            blueprints: [],
            selectedBlueprint: null,
            finalSpec: null,
          },
        }),
      })

      // Navigate to spec development page
      navigate(`/project/${project.id}`)
    } catch (err) {
      logger.project('Project creation failed', { error: err })
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setIsCreating(false)
    }
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
              Describe your hardware.
            </h2>
            <p className="text-steel-dim">
              Tell us what you want to build. Be specific about sensors, connectivity, and power
              requirements.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm mb-6">
              <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
                placeholder="I need a device that..."
                rows={5}
                maxLength={MAX_DESCRIPTION_LENGTH}
                className={clsx(
                  'w-full px-4 py-3 bg-surface-800 border text-steel placeholder-steel-dim',
                  'resize-none focus:outline-none',
                  'border-surface-600 focus:border-copper'
                )}
                disabled={isCreating}
              />
              <div
                className={clsx(
                  'absolute bottom-3 right-3 text-xs font-mono',
                  description.length >= MAX_DESCRIPTION_LENGTH ? 'text-red-400' : 'text-steel-dim'
                )}
              >
                {description.length}/{MAX_DESCRIPTION_LENGTH}
              </div>
            </div>

            <button
              type="submit"
              disabled={!description.trim() || isCreating}
              className={clsx(
                'w-full flex items-center justify-center gap-2 px-6 py-3 font-semibold transition-all',
                description.trim() && !isCreating
                  ? 'bg-copper-gradient text-ash'
                  : 'bg-surface-700 text-steel-dim cursor-not-allowed'
              )}
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
                  Creating...
                </>
              ) : (
                <>
                  <Flame className="w-5 h-5" strokeWidth={1.5} />
                  Start Design
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
                  disabled={isCreating}
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
