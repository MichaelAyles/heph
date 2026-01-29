/**
 * DebugBreakpointModal - Modal shown when execution pauses at a debug breakpoint
 *
 * Displays the system prompt and user context, allowing the user to inspect
 * what will be sent to the LLM before continuing or cancelling execution.
 */

import { useState, useEffect } from 'react'
import {
  XCircle,
  ChevronDown,
  ChevronRight,
  Play,
  Square,
  Clock,
  Cpu,
  FileText,
} from 'lucide-react'
import { useDebugBreakpointStore } from '../../stores/debug-breakpoint'

export function DebugBreakpointModal() {
  const { pendingBreakpoint, resolveWith } = useDebugBreakpointStore()
  const [systemPromptExpanded, setSystemPromptExpanded] = useState(false)
  const [userContextExpanded, setUserContextExpanded] = useState(true)
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-surface-900 rounded-xl border border-amber-500/50 shadow-lg shadow-amber-500/10 w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <Cpu className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-steel">Debug Breakpoint</h3>
              <p className="text-sm text-steel-dim">
                Node: <span className="text-amber-400 font-mono">{pendingBreakpoint.nodeName}</span>
              </p>
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
              <span className="font-mono text-steel">
                {pendingBreakpoint.projectId.slice(0, 8)}...
              </span>
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

          {/* User Context Section */}
          <div className="border border-surface-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setUserContextExpanded(!userContextExpanded)}
              className="w-full flex items-center justify-between p-3 bg-surface-800 hover:bg-surface-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                {userContextExpanded ? (
                  <ChevronDown className="w-4 h-4 text-steel-dim" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-steel-dim" />
                )}
                <span className="font-medium text-steel">User Context (Input)</span>
              </div>
              <span className="text-xs text-steel-dim">
                {pendingBreakpoint.userContext.length.toLocaleString()} chars
              </span>
            </button>
            {userContextExpanded && (
              <div className="p-4 bg-surface-900/50">
                <pre className="text-sm text-steel-dim whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
                  {pendingBreakpoint.userContext}
                </pre>
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
