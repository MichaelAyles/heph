/**
 * DebugBreakpointModal - Modal shown when execution pauses at a debug breakpoint
 *
 * Displays the system prompt and user context, allowing the user to inspect
 * what will be sent to the LLM before continuing or cancelling execution.
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  XCircle,
  ChevronDown,
  ChevronRight,
  Play,
  Square,
  Clock,
  Cpu,
  FileText,
  ExternalLink,
  Database,
} from 'lucide-react'
import { useDebugBreakpointStore } from '../../stores/debug-breakpoint'

export function DebugBreakpointModal() {
  const { pendingBreakpoint, resolveWith } = useDebugBreakpointStore()
  const [systemPromptExpanded, setSystemPromptExpanded] = useState(false)
  const [projectStateExpanded, setProjectStateExpanded] = useState(true)
  const [timeRemaining, setTimeRemaining] = useState<number>(0)

  // Calculate and update time remaining
  useEffect(() => {
    if (!pendingBreakpoint) return

    const updateTimer = () => {
      const expiry = new Date(pendingBreakpoint.expiresAt).getTime()
      const now = Date.now()
      const remaining = Math.max(0, Math.floor((expiry - now) / 1000))
      setTimeRemaining(remaining)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [pendingBreakpoint])

  // Auto-cancel when expired
  useEffect(() => {
    if (timeRemaining === 0 && pendingBreakpoint) {
      resolveWith('cancel')
    }
  }, [timeRemaining, pendingBreakpoint, resolveWith])

  if (!pendingBreakpoint) return null

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Parse the input to show structured project state
  const inputData = pendingBreakpoint.fullInput
  const inputKeys = Object.keys(inputData)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-surface-900 rounded-xl border border-amber-500/50 shadow-lg shadow-amber-500/10 w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <Cpu className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-steel">Debug Breakpoint</h3>
              <div className="flex items-center gap-2 text-sm text-steel-dim">
                <span>Node:</span>
                <span className="text-amber-400 font-mono">{pendingBreakpoint.nodeName}</span>
                <Link
                  to={`/admin/langgraph?node=${pendingBreakpoint.nodeName}`}
                  className="flex items-center gap-1 text-copper hover:text-copper-light transition-colors"
                  onClick={(e) => e.stopPropagation()}
                  target="_blank"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span className="text-xs">Edit Prompt</span>
                </Link>
              </div>
            </div>
          </div>
          <button
            onClick={() => resolveWith('cancel')}
            className="text-steel-dim hover:text-steel transition-colors"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Info Bar */}
        <div className="flex items-center gap-6 px-4 py-3 bg-surface-800/50 text-sm border-b border-surface-700">
          <div className="flex items-center gap-2 text-steel-dim">
            <FileText className="w-4 h-4" />
            <span>~{pendingBreakpoint.tokenEstimate.toLocaleString()} tokens</span>
          </div>
          {pendingBreakpoint.projectId && (
            <div className="flex items-center gap-2 text-steel-dim">
              <span>Project:</span>
              <Link
                to={`/project/${pendingBreakpoint.projectId}/spec`}
                className="font-mono text-copper hover:text-copper-light transition-colors"
                target="_blank"
              >
                {pendingBreakpoint.projectId.slice(0, 8)}...
              </Link>
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Clock
              className={`w-4 h-4 ${timeRemaining < 60 ? 'text-red-400' : 'text-steel-dim'}`}
            />
            <span className={`font-mono ${timeRemaining < 60 ? 'text-red-400' : 'text-steel-dim'}`}>
              {formatTime(timeRemaining)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* System Prompt Section */}
          <div className="border border-surface-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setSystemPromptExpanded(!systemPromptExpanded)}
              className="w-full flex items-center justify-between p-3 bg-surface-800 hover:bg-surface-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                {systemPromptExpanded ? (
                  <ChevronDown className="w-4 h-4 text-steel-dim" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-steel-dim" />
                )}
                <FileText className="w-4 h-4 text-steel-dim" />
                <span className="font-medium text-steel">System Prompt</span>
              </div>
              <span className="text-xs text-steel-dim">
                {pendingBreakpoint.systemPrompt.length.toLocaleString()} chars
              </span>
            </button>
            {systemPromptExpanded && (
              <div className="p-4 bg-surface-900/50">
                <pre className="text-sm text-steel-dim whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                  {pendingBreakpoint.systemPrompt}
                </pre>
              </div>
            )}
          </div>

          {/* Project State Section */}
          <div className="border border-surface-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setProjectStateExpanded(!projectStateExpanded)}
              className="w-full flex items-center justify-between p-3 bg-surface-800 hover:bg-surface-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                {projectStateExpanded ? (
                  <ChevronDown className="w-4 h-4 text-steel-dim" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-steel-dim" />
                )}
                <Database className="w-4 h-4 text-steel-dim" />
                <span className="font-medium text-steel">Project State (Input)</span>
              </div>
              <span className="text-xs text-steel-dim">{inputKeys.length} fields</span>
            </button>
            {projectStateExpanded && (
              <div className="p-4 bg-surface-900/50 space-y-3">
                {inputKeys.map((key) => {
                  const value = inputData[key]
                  const isObject = typeof value === 'object' && value !== null
                  const displayValue = isObject ? JSON.stringify(value, null, 2) : String(value)
                  const isLarge = displayValue.length > 200

                  return (
                    <div key={key} className="border border-surface-700 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-surface-800">
                        <span className="font-mono text-sm text-amber-400">{key}</span>
                        <span className="text-xs text-steel-dim">
                          {isObject
                            ? Array.isArray(value)
                              ? `array[${value.length}]`
                              : 'object'
                            : typeof value}
                        </span>
                      </div>
                      <div className="p-3 bg-surface-900/50">
                        <pre
                          className={`text-sm text-steel-dim whitespace-pre-wrap font-mono ${isLarge ? 'max-h-32 overflow-y-auto' : ''}`}
                        >
                          {displayValue}
                        </pre>
                      </div>
                    </div>
                  )
                })}
                {inputKeys.length === 0 && (
                  <p className="text-sm text-steel-dim italic">No input data</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-surface-700 bg-surface-800/50">
          <button
            onClick={() => resolveWith('cancel')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-surface-600 text-steel-dim hover:text-steel hover:border-surface-500 transition-colors"
          >
            <Square className="w-4 h-4" />
            Cancel Execution
          </button>
          <button
            onClick={() => resolveWith('continue')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors"
          >
            <Play className="w-4 h-4" />
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
