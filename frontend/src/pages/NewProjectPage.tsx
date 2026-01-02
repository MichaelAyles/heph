import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, Loader2, ArrowRight, Terminal, AlertCircle } from 'lucide-react'
import { clsx } from 'clsx'

const EXAMPLE_PROMPTS = [
  'Battery-powered capacitive soil moisture monitor with ESP32, 2.4GHz WiFi, push notifications via MQTT, 18650 LiPo cell with solar charging, IP65 outdoor enclosure, 6-month battery life target',
  'Video doorbell with ESP32-CAM, PIR motion trigger, 1.3" OLED status display, 2-way audio via I2S microphone and speaker, 5V USB-C power, weatherproof housing with 170° wide-angle lens',
  'Multi-channel temperature logger with 4x thermocouple inputs (K-type), microSD card storage in CSV format, USB-C charging for 2000mAh LiPo, 2.4" TFT display with real-time graphing, configurable sample rates from 1s to 1hr',
  'Desktop air quality monitor with SCD41 CO2 sensor, PMS5003 particulate sensor (PM2.5/PM10), BME280 for temperature/humidity, 2.8" color LCD dashboard, ESP32 with WiFi for Home Assistant integration, USB-C powered',
  'USB-C rechargeable wireless presentation clicker with nRF52840 BLE, 400mAh LiPo battery, laser pointer, page up/down buttons, gyro-based air mouse mode, USB-A dongle receiver, 20-meter range, 40-hour battery life',
  'USB-C power monitor with bidirectional current sensing (0-5A), voltage measurement (5-20V), INA226 precision ADC, 1.8" TFT LCD showing watts/amp-hours, ESP32 with WiFi and Zigbee (CC2530), data logging to cloud via MQTT, inline passthrough design',
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
                onChange={(e) => setDescription(e.target.value)}
                placeholder="I need a device that..."
                rows={5}
                className={clsx(
                  'w-full px-4 py-3 bg-surface-800 border text-steel placeholder-steel-dim',
                  'resize-none focus:outline-none',
                  'border-surface-600 focus:border-copper'
                )}
                disabled={isCreating}
              />
              <div className="absolute bottom-3 right-3 text-xs text-steel-dim font-mono">
                {description.length}
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
