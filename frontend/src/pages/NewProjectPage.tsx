import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, Loader2, ArrowRight, Terminal, AlertCircle } from 'lucide-react'
import { clsx } from 'clsx'

const MAX_DESCRIPTION_LENGTH = 2000

const EXAMPLE_PROMPTS = [
  'Battery-powered soil moisture monitor with ESP32-C6 WiFi, BME280 for temperature/humidity, capacitive soil probe input, MQTT alerts to Home Assistant, LiPo battery with USB-C charging (TP4056), 0.96" OLED status display, IP65 weatherproof enclosure',
  'Smart motion-activated doorbell with ESP32-C6 WiFi, PIR motion sensor trigger, 0.96" OLED showing visitor count, piezo buzzer chime, WS2812B status ring, push notifications via MQTT, 5V USB-C powered, weatherproof enclosure',
  'Portable environment logger with ESP32-C6, BME280 (temp/humidity/pressure), VEML7700 ambient light sensor, SPI LCD display with live readings, LiPo battery with USB-C charging, button to cycle display modes, data upload via WiFi',
  'Desktop air quality station with ESP32-C6 WiFi, BME280 for temperature/humidity/pressure, VEML7700 light sensor, SPI LCD dashboard, WS2812B LED strip for visual alerts, USB-C powered, Home Assistant integration via MQTT',
  'USB-C rechargeable wireless presentation remote with ESP32-C6 BLE HID, LiPo battery with TP4056 charging, 3 tactile buttons (prev/next/blank screen), WS2812B status LED, direct BLE pairing with laptop, compact handheld enclosure',
  'USB-C inline power monitor with ESP32-C6 WiFi/Zigbee, voltage/current sensing via ADC, SPI LCD showing watts and amp-hours, data logging to cloud via MQTT, passthrough USB-C design, compact inline enclosure',
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
      console.error('Error:', err)
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
