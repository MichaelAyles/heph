import { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Play,
  Square,
  Loader2,
  Check,
  X,
  Workflow,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react'
import { clsx } from 'clsx'

interface StateEvent {
  id: number
  timestamp: string
  type: 'state' | 'spec' | 'complete' | 'error'
  node?: string
  data: unknown
}

type OrchestratorMode = 'vibe_it' | 'fix_it' | 'design_it'

const TEST_DESCRIPTIONS = [
  'A WiFi-enabled temperature and humidity sensor for my greenhouse',
  'A motion-activated LED light strip controller',
  'A battery-powered air quality monitor with OLED display',
]

export function AdminOrchestratorPage() {
  // Feature flag state (persisted to localStorage)
  const [useLangGraph, setUseLangGraph] = useState(() => {
    return localStorage.getItem('USE_LANGGRAPH_ORCHESTRATOR') === 'true'
  })

  // Test configuration
  const [description, setDescription] = useState(TEST_DESCRIPTIONS[0])
  const [mode, setMode] = useState<OrchestratorMode>('vibe_it')
  const [projectId] = useState(() => `test-${Date.now()}`)

  // Test state
  const [isRunning, setIsRunning] = useState(false)
  const [events, setEvents] = useState<StateEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const eventIdRef = useRef(0)

  const toggleFeatureFlag = useCallback(() => {
    const newValue = !useLangGraph
    setUseLangGraph(newValue)
    localStorage.setItem('USE_LANGGRAPH_ORCHESTRATOR', String(newValue))
  }, [useLangGraph])

  const clearEvents = useCallback(() => {
    setEvents([])
    setError(null)
    eventIdRef.current = 0
  }, [])

  const runTest = useCallback(async () => {
    if (isRunning) return

    setIsRunning(true)
    setError(null)
    clearEvents()

    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch('/api/orchestrator/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          mode,
          description,
          availableBlocks: [],
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      // Read SSE stream
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        let currentEventType: string | null = null
        let currentData: string | null = null

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6)
          } else if (line === '' && currentEventType && currentData) {
            // End of event
            try {
              const parsed = JSON.parse(currentData)
              const event: StateEvent = {
                id: eventIdRef.current++,
                timestamp: new Date().toISOString(),
                type: currentEventType as StateEvent['type'],
                node: parsed.node,
                data: parsed,
              }
              setEvents((prev) => [...prev, event])

              if (currentEventType === 'error') {
                setError(parsed.error)
              }
            } catch {
              console.error('Failed to parse event data:', currentData)
            }
            currentEventType = null
            currentData = null
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setEvents((prev) => [
          ...prev,
          {
            id: eventIdRef.current++,
            timestamp: new Date().toISOString(),
            type: 'error',
            data: { error: 'Test stopped by user' },
          },
        ])
      } else {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        setEvents((prev) => [
          ...prev,
          {
            id: eventIdRef.current++,
            timestamp: new Date().toISOString(),
            type: 'error',
            data: { error: message },
          },
        ])
      }
    } finally {
      setIsRunning(false)
      abortControllerRef.current = null
    }
  }, [isRunning, projectId, mode, description, clearEvents])

  const stopTest = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  return (
    <div className="min-h-screen bg-ash">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-8 border-b border-surface-700">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 hover:bg-surface-800 transition-colors">
            <ArrowLeft className="w-5 h-5 text-steel-dim" strokeWidth={1.5} />
          </Link>
          <h1 className="text-base font-semibold text-steel tracking-tight">
            LANGGRAPH ORCHESTRATOR
          </h1>
        </div>
      </header>

      {/* Content */}
      <div className="p-8 overflow-auto">
        <div className="max-w-4xl space-y-8">
          {/* Feature Flag Toggle */}
          <section className="p-4 bg-surface-800 border border-surface-700">
            <h3 className="text-sm font-mono text-steel-dim mb-4 tracking-wide flex items-center gap-2">
              <Workflow className="w-4 h-4 text-copper" strokeWidth={1.5} />
              FEATURE FLAG
            </h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-steel mb-1">USE_LANGGRAPH_ORCHESTRATOR</p>
                <p className="text-xs text-steel-dim">
                  When enabled, the orchestrator store will use the LangGraph backend instead of the
                  legacy marathon agent.
                </p>
              </div>
              <button
                onClick={toggleFeatureFlag}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 transition-all',
                  useLangGraph
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-surface-700 text-steel-dim border border-surface-600'
                )}
              >
                {useLangGraph ? (
                  <>
                    <ToggleRight className="w-5 h-5" strokeWidth={1.5} />
                    Enabled
                  </>
                ) : (
                  <>
                    <ToggleLeft className="w-5 h-5" strokeWidth={1.5} />
                    Disabled
                  </>
                )}
              </button>
            </div>
            {useLangGraph && (
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
                Note: Frontend integration is not yet complete. The flag is set but the store will
                fall back to the legacy orchestrator until the API streaming client is implemented.
              </div>
            )}
          </section>

          {/* Test Configuration */}
          <section className="p-4 bg-surface-800 border border-surface-700">
            <h3 className="text-sm font-mono text-steel-dim mb-4 tracking-wide flex items-center gap-2">
              <Play className="w-4 h-4 text-copper" strokeWidth={1.5} />
              TEST ORCHESTRATOR
            </h3>

            {/* Description */}
            <div className="mb-4">
              <label className="block text-sm text-steel-dim mb-2">Project Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isRunning}
                rows={3}
                className="w-full px-3 py-2 bg-surface-900 border border-surface-600 text-steel text-sm focus:border-copper focus:outline-none disabled:opacity-50"
                placeholder="Describe your hardware project..."
              />
              <div className="flex gap-2 mt-2">
                {TEST_DESCRIPTIONS.map((desc, i) => (
                  <button
                    key={i}
                    onClick={() => setDescription(desc)}
                    disabled={isRunning}
                    className="text-xs text-steel-dim hover:text-copper transition-colors disabled:opacity-50"
                  >
                    Example {i + 1}
                  </button>
                ))}
              </div>
            </div>

            {/* Mode */}
            <div className="mb-4">
              <label className="block text-sm text-steel-dim mb-2">Mode</label>
              <div className="flex gap-2">
                {(['vibe_it', 'fix_it', 'design_it'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    disabled={isRunning}
                    className={clsx(
                      'px-3 py-1.5 text-sm font-mono transition-all disabled:opacity-50',
                      mode === m
                        ? 'bg-copper/20 text-copper border border-copper'
                        : 'bg-surface-700 text-steel-dim border border-surface-600 hover:border-surface-500'
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={runTest}
                disabled={isRunning || !description.trim()}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 font-medium transition-all',
                  isRunning
                    ? 'bg-surface-700 text-steel-dim cursor-wait'
                    : 'bg-copper-gradient text-ash hover:opacity-90'
                )}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" strokeWidth={1.5} />
                    Run Test
                  </>
                )}
              </button>
              {isRunning && (
                <button
                  onClick={stopTest}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 font-medium transition-all hover:bg-red-500/30"
                >
                  <Square className="w-4 h-4" strokeWidth={1.5} />
                  Stop
                </button>
              )}
              {events.length > 0 && !isRunning && (
                <button
                  onClick={clearEvents}
                  className="flex items-center gap-2 px-4 py-2 bg-surface-700 text-steel-dim border border-surface-600 font-medium transition-all hover:text-steel"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                  Clear
                </button>
              )}
            </div>
          </section>

          {/* Event Stream */}
          {events.length > 0 && (
            <section className="p-4 bg-surface-800 border border-surface-700">
              <h3 className="text-sm font-mono text-steel-dim mb-4 tracking-wide flex items-center gap-2">
                <Workflow className="w-4 h-4 text-copper" strokeWidth={1.5} />
                EVENT STREAM ({events.length} events)
              </h3>

              <div className="space-y-2 max-h-96 overflow-y-auto font-mono text-xs">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className={clsx(
                      'p-3 border',
                      event.type === 'error'
                        ? 'bg-red-500/10 border-red-500/30'
                        : event.type === 'complete'
                          ? 'bg-emerald-500/10 border-emerald-500/30'
                          : event.type === 'spec'
                            ? 'bg-blue-500/10 border-blue-500/30'
                            : 'bg-surface-900 border-surface-600'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {event.type === 'error' ? (
                        <X className="w-3 h-3 text-red-400" strokeWidth={2} />
                      ) : event.type === 'complete' ? (
                        <Check className="w-3 h-3 text-emerald-400" strokeWidth={2} />
                      ) : (
                        <div className="w-3 h-3 rounded-full bg-copper" />
                      )}
                      <span
                        className={clsx(
                          'font-semibold',
                          event.type === 'error'
                            ? 'text-red-400'
                            : event.type === 'complete'
                              ? 'text-emerald-400'
                              : event.type === 'spec'
                                ? 'text-blue-400'
                                : 'text-copper'
                        )}
                      >
                        {event.type.toUpperCase()}
                        {event.node && ` → ${event.node}`}
                      </span>
                      <span className="text-steel-dim ml-auto">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="text-steel-dim overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="mt-4 pt-4 border-t border-surface-600 flex gap-4 text-xs">
                <span className="text-steel-dim">
                  State events:{' '}
                  <span className="text-copper">
                    {events.filter((e) => e.type === 'state').length}
                  </span>
                </span>
                <span className="text-steel-dim">
                  Spec updates:{' '}
                  <span className="text-blue-400">
                    {events.filter((e) => e.type === 'spec').length}
                  </span>
                </span>
                <span className="text-steel-dim">
                  Errors:{' '}
                  <span className="text-red-400">
                    {events.filter((e) => e.type === 'error').length}
                  </span>
                </span>
                {events.some((e) => e.type === 'complete') && (
                  <span className="text-emerald-400">Completed</span>
                )}
              </div>
            </section>
          )}

          {/* Error Display */}
          {error && !events.some((e) => e.type === 'error') && (
            <section className="p-4 bg-red-500/10 border border-red-500/30">
              <h3 className="text-sm font-mono text-red-400 mb-2 tracking-wide flex items-center gap-2">
                <X className="w-4 h-4" strokeWidth={1.5} />
                ERROR
              </h3>
              <p className="text-red-400 text-sm">{error}</p>
            </section>
          )}

          {/* Architecture Info */}
          <section className="p-4 bg-surface-800 border border-surface-700">
            <h3 className="text-sm font-mono text-steel-dim mb-4 tracking-wide">ARCHITECTURE</h3>
            <div className="text-sm text-steel-dim space-y-2">
              <p>
                The LangGraph orchestrator runs server-side on Cloudflare Workers with{' '}
                <code className="text-copper">nodejs_compat</code> enabled.
              </p>
              <p>Graph topology:</p>
              <pre className="p-3 bg-surface-900 border border-surface-600 text-xs overflow-x-auto">
                {`START → analyzeFeasibility → [rejected?] → END
                      ↓
  answerQuestions → generateBlueprints → selectBlueprint →
  generateNames → selectName → finalizeSpec → markSpecComplete
                      ↓
  selectBlocks → validatePcb → markPcbComplete
                      ↓
  [ENCLOSURE LOOP] generate → review → decide → [accept | retry]
                      ↓
  [FIRMWARE LOOP] generate → review → decide → [accept | retry]
                      ↓
  markExportComplete → END`}
              </pre>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
