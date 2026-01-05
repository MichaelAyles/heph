/**
 * Orchestrator Panel
 *
 * Floating panel that shows the autonomous orchestrator's progress.
 * Displays current action, history, and controls for start/stop.
 */

import { useState } from 'react'
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  RotateCcw,
  Wrench,
  Brain,
  MessageSquare,
  Zap,
} from 'lucide-react'
import { useOrchestratorStore } from '@/stores/orchestrator'
import type {
  OrchestratorHistoryItem,
  OrchestratorStage,
  OrchestratorStatus,
} from '@/services/orchestrator'

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function OrchestratorPanel() {
  const {
    status,
    mode,
    currentStage,
    currentAction,
    history,
    error,
    iterationCount,
    isPanelExpanded,
    showThinking,
    togglePanel,
    toggleThinking,
    stopOrchestrator,
    resetOrchestrator,
  } = useOrchestratorStore()

  // Filter thinking items unless showThinking is enabled
  const filteredHistory = showThinking
    ? history
    : history.filter((item) => item.type !== 'thinking')

  // Only show panel when orchestrator is active or has history
  if (status === 'idle' && history.length === 0) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-surface-900 border border-surface-700 rounded-lg shadow-xl z-50 overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-surface-700 bg-surface-800/50">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-copper" />
          <span className="font-medium text-steel">PHAESTUS Orchestrator</span>
          <StatusBadge status={status} />
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={toggleThinking}
              className={`p-1.5 rounded hover:bg-surface-700 transition-colors ${showThinking ? 'text-copper' : 'text-steel-dim'}`}
              title={showThinking ? 'Hide thinking' : 'Show thinking'}
            >
              <Brain className="w-4 h-4" />
            </button>
            <button
              onClick={togglePanel}
              className="p-1.5 text-steel-dim hover:text-steel hover:bg-surface-700 rounded transition-colors"
            >
              {isPanelExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Mode and Stage */}
        <div className="flex items-center gap-2 mt-2 text-xs">
          <ModeBadge mode={mode} />
          <span className="text-steel-dim">•</span>
          <StageBadge stage={currentStage} />
          {iterationCount > 0 && (
            <>
              <span className="text-steel-dim">•</span>
              <span className="text-steel-dim">Iteration {iterationCount}</span>
            </>
          )}
        </div>
      </div>

      {/* Current action */}
      {currentAction && isPanelExpanded && (
        <div className="p-3 bg-surface-800 border-b border-surface-700">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-copper" />
            <span className="text-steel">{currentAction}</span>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && isPanelExpanded && (
        <div className="p-3 bg-red-500/10 border-b border-red-500/20">
          <div className="flex items-start gap-2 text-sm">
            <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <span className="text-red-300">{error}</span>
          </div>
        </div>
      )}

      {/* History */}
      {isPanelExpanded && filteredHistory.length > 0 && (
        <div className="max-h-64 overflow-auto p-3 space-y-2">
          {filteredHistory
            .slice(-20)
            .reverse()
            .map((item) => (
              <HistoryItem key={item.id} item={item} />
            ))}
        </div>
      )}

      {/* Controls */}
      {isPanelExpanded && (
        <div className="p-3 border-t border-surface-700 bg-surface-800/50 flex items-center gap-2">
          {status === 'running' ? (
            <button
              onClick={stopOrchestrator}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded transition-colors"
            >
              <Pause className="w-4 h-4" />
              Pause
            </button>
          ) : status === 'paused' ? (
            <button
              onClick={() => {
                /* Resume would go here */
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-copper/20 text-copper hover:bg-copper/30 rounded transition-colors"
            >
              <Play className="w-4 h-4" />
              Resume
            </button>
          ) : null}

          {(status === 'complete' || status === 'error' || status === 'paused') && (
            <button
              onClick={resetOrchestrator}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-surface-700 text-steel-dim hover:text-steel hover:bg-surface-600 rounded transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          )}

          <div className="ml-auto text-xs text-steel-dim">{filteredHistory.length} actions</div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function StatusBadge({ status }: { status: OrchestratorStatus }) {
  const config: Record<OrchestratorStatus, { label: string; className: string }> = {
    idle: { label: 'Idle', className: 'bg-surface-700 text-steel-dim' },
    running: { label: 'Running', className: 'bg-emerald-500/20 text-emerald-400' },
    paused: { label: 'Paused', className: 'bg-amber-500/20 text-amber-400' },
    validating: { label: 'Validating', className: 'bg-blue-500/20 text-blue-400' },
    fixing: { label: 'Fixing', className: 'bg-orange-500/20 text-orange-400' },
    complete: { label: 'Complete', className: 'bg-copper/20 text-copper' },
    error: { label: 'Error', className: 'bg-red-500/20 text-red-400' },
  }

  const { label, className } = config[status]

  return <span className={`ml-auto px-2 py-0.5 text-xs rounded-full ${className}`}>{label}</span>
}

function ModeBadge({ mode }: { mode: string }) {
  const config: Record<string, { label: string; icon: React.ReactNode }> = {
    vibe_it: { label: 'Vibe It', icon: <Zap className="w-3 h-3" /> },
    fix_it: { label: 'Fix It', icon: <Wrench className="w-3 h-3" /> },
    design_it: { label: 'Design It', icon: <MessageSquare className="w-3 h-3" /> },
  }

  const { label, icon } = config[mode] || config.vibe_it

  return (
    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-copper/10 text-copper rounded">
      {icon}
      {label}
    </span>
  )
}

function StageBadge({ stage }: { stage: OrchestratorStage }) {
  const labels: Record<OrchestratorStage, string> = {
    spec: 'Spec',
    pcb: 'PCB',
    enclosure: 'Enclosure',
    firmware: 'Firmware',
    export: 'Export',
  }

  return (
    <span className="px-1.5 py-0.5 bg-surface-700 text-steel-dim rounded">{labels[stage]}</span>
  )
}

function HistoryItem({ item }: { item: OrchestratorHistoryItem }) {
  const [isExpanded, setIsExpanded] = useState(false)

  const iconConfig: Record<string, { icon: React.ReactNode; color: string }> = {
    tool_call: { icon: <Wrench className="w-4 h-4" />, color: 'text-blue-400' },
    tool_result: { icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-400' },
    validation: { icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-cyan-400' },
    error: { icon: <XCircle className="w-4 h-4" />, color: 'text-red-400' },
    fix: { icon: <RefreshCw className="w-4 h-4" />, color: 'text-amber-400' },
    progress: { icon: <Loader2 className="w-4 h-4" />, color: 'text-steel-dim' },
    thinking: { icon: <Brain className="w-4 h-4" />, color: 'text-purple-400' },
  }

  const { icon, color } = iconConfig[item.type] || iconConfig.progress

  return (
    <div
      className="group text-sm cursor-pointer hover:bg-surface-800/50 rounded p-1 -m-1"
      onClick={() => item.details && setIsExpanded(!isExpanded)}
    >
      <div className="flex items-start gap-2">
        <span className={`${color} mt-0.5 flex-shrink-0`}>{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-steel truncate">{item.action}</span>
            <span className="text-steel-dim text-xs">{formatTime(item.timestamp)}</span>
          </div>
          {item.result && (
            <div className="text-steel-dim text-xs truncate mt-0.5">{item.result}</div>
          )}
        </div>
        {item.details && (
          <ChevronDown
            className={`w-4 h-4 text-steel-dim transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        )}
      </div>

      {isExpanded && item.details && (
        <div className="mt-2 ml-6 p-2 bg-surface-800 rounded text-xs font-mono text-steel-dim overflow-auto max-h-32">
          <pre>{JSON.stringify(item.details, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// HELPERS
// =============================================================================

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}
