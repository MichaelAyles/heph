/**
 * TestRunner - Interactive graph testing interface
 *
 * Allows invoking the LangGraph and seeing debug output.
 */

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Play, Loader2, MessageSquare, ChevronDown, ChevronUp, Bug, Clock } from 'lucide-react'

interface DebugStep {
  node: string
  timestamp: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  durationMs: number
}

interface ChatResponse {
  response: string
  intent: string
  route: string | null
  projectId: string | null
  sessionId: string
  debug?: {
    startTime: string
    endTime: string
    totalDurationMs: number
    steps: DebugStep[]
  }
}

interface TestRunnerProps {
  onHighlightNode?: (nodeName: string | undefined) => void
}

export function TestRunner({ onHighlightNode }: TestRunnerProps) {
  const [message, setMessage] = useState('')
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID())
  const [showDebug, setShowDebug] = useState(true)
  const [results, setResults] = useState<ChatResponse[]>([])

  // Run graph mutation
  const runMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          sessionId,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to run graph')
      }
      return res.json() as Promise<ChatResponse>
    },
    onSuccess: (data) => {
      setResults((prev) => [...prev, data])
      setMessage('')

      // Highlight the last node that ran
      if (data.debug?.steps && data.debug.steps.length > 0) {
        const lastStep = data.debug.steps[data.debug.steps.length - 1]
        onHighlightNode?.(lastStep.node)
      }
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim()) {
      runMutation.mutate(message.trim())
    }
  }

  const handleClear = () => {
    setResults([])
    setSessionId(crypto.randomUUID())
    onHighlightNode?.(undefined)
  }

  return (
    <div className="space-y-4">
      {/* Input Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-steel-dim mb-1">Test Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter a test message... (e.g., 'I want to build a smart plant monitor')"
            className="w-full h-20 px-3 py-2 bg-surface-900 border border-surface-700 rounded text-sm text-steel resize-none focus:outline-none focus:border-copper"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-steel-dim">
            Session:{' '}
            <code className="bg-surface-700 px-1 rounded">{sessionId.substring(0, 8)}...</code>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 text-sm text-steel hover:bg-surface-700 rounded transition-colors"
            >
              Clear
            </button>
            <button
              type="submit"
              disabled={!message.trim() || runMutation.isPending}
              className="flex items-center gap-2 px-4 py-1.5 text-sm bg-copper text-surface-900 rounded hover:bg-copper/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {runMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Error Display */}
      {runMutation.isError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
          {runMutation.error.message}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-steel">Results ({results.length})</h4>
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="flex items-center gap-1 text-xs text-steel-dim hover:text-steel"
            >
              <Bug className="w-3 h-3" />
              {showDebug ? 'Hide Debug' : 'Show Debug'}
              {showDebug ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {results.map((result, index) => (
              <div
                key={index}
                className="border border-surface-700 rounded-lg overflow-hidden"
              >
                {/* Response */}
                <div className="p-3 bg-surface-800">
                  <div className="flex items-start gap-2">
                    <MessageSquare className="w-4 h-4 text-copper mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-steel whitespace-pre-wrap">{result.response}</p>
                    </div>
                  </div>
                </div>

                {/* Metadata */}
                <div className="px-3 py-2 bg-surface-900 border-t border-surface-700 flex flex-wrap gap-3 text-xs">
                  <span className="text-steel-dim">
                    Intent:{' '}
                    <span className="text-amber-400 font-medium">{result.intent}</span>
                  </span>
                  {result.route && (
                    <span className="text-steel-dim">
                      Route: <span className="text-blue-400 font-medium">{result.route}</span>
                    </span>
                  )}
                  {result.projectId && (
                    <span className="text-steel-dim">
                      Project:{' '}
                      <span className="text-emerald-400 font-mono">
                        {result.projectId.substring(0, 8)}
                      </span>
                    </span>
                  )}
                </div>

                {/* Debug Info */}
                {showDebug && result.debug && (
                  <div className="px-3 py-2 bg-surface-950 border-t border-surface-700">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-3 h-3 text-steel-dim" />
                      <span className="text-xs text-steel-dim">
                        Total: {result.debug.totalDurationMs}ms
                      </span>
                    </div>

                    <div className="space-y-1">
                      {result.debug.steps.map((step, stepIndex) => (
                        <div
                          key={stepIndex}
                          className="flex items-center gap-2 px-2 py-1 bg-surface-800 rounded text-xs"
                          onMouseEnter={() => onHighlightNode?.(step.node)}
                          onMouseLeave={() => onHighlightNode?.(undefined)}
                        >
                          <span className="text-copper font-mono">{step.node}</span>
                          <span className="text-steel-dim">→</span>
                          <span className="text-steel-dim truncate flex-1">
                            {JSON.stringify(step.output).substring(0, 50)}...
                          </span>
                          <span className="text-steel-dim">{step.durationMs}ms</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
