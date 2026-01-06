/**
 * Orchestrator Sidebar
 *
 * Persistent right sidebar for the workspace that shows the AI orchestrator.
 * Displays the trigger when idle, progress when running, and history when complete.
 */

import { useState, useEffect, useRef } from 'react'
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Wrench,
  Brain,
  MessageSquare,
  Zap,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useOrchestratorStore } from '@/stores/orchestrator'
import { useAuthStore } from '@/stores/auth'
import type { Project, ProjectSpec, PcbBlock } from '@/db/schema'
import type {
  OrchestratorHistoryItem,
  OrchestratorStage,
  OrchestratorStatus,
} from '@/services/orchestrator'

// =============================================================================
// TYPES
// =============================================================================

interface OrchestratorSidebarProps {
  project: Project | null
  blocks?: PcbBlock[]
  onSpecUpdate?: (spec: Partial<ProjectSpec>) => Promise<void>
  isCollapsed: boolean
  onToggleCollapse: () => void
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function OrchestratorSidebar({
  project,
  blocks,
  onSpecUpdate,
  isCollapsed,
  onToggleCollapse,
}: OrchestratorSidebarProps) {
  const { user } = useAuthStore()
  const {
    status,
    currentStage,
    currentAction,
    history,
    error,
    iterationCount,
    showThinking,
    toggleThinking,
    startOrchestrator,
    stopOrchestrator,
    resetOrchestrator,
  } = useOrchestratorStore()

  const historyEndRef = useRef<HTMLDivElement>(null)

  const controlMode = user?.controlMode || 'fix_it'
  const spec = project?.spec as ProjectSpec | null

  // Auto-scroll to bottom when history updates
  useEffect(() => {
    if (historyEndRef.current && !isCollapsed) {
      historyEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [history, isCollapsed])

  // Filter thinking items unless showThinking is enabled
  const filteredHistory = showThinking
    ? history
    : history.filter((item) => item.type !== 'thinking')

  // Check if project is eligible for orchestration
  const isEligible =
    project &&
    (project.status === 'draft' ||
      project.status === 'analyzing' ||
      (project.status === 'complete' && !spec?.stages?.export?.completedAt))

  const isRunning = status === 'running'
  const isIdle = status === 'idle'
  const canStart = isIdle && isEligible && controlMode !== 'design_it'

  // Mode configuration
  const modeConfig = {
    vibe_it: {
      icon: Zap,
      label: 'Vibe It',
      description: 'Fully autonomous design',
      color: 'copper',
    },
    fix_it: {
      icon: Wrench,
      label: 'Fix It',
      description: 'AI handles details',
      color: 'blue',
    },
    design_it: {
      icon: MessageSquare,
      label: 'Design It',
      description: 'Full manual control',
      color: 'purple',
    },
  }

  const config = modeConfig[controlMode as keyof typeof modeConfig] || modeConfig.fix_it
  const ModeIcon = config.icon

  const handleStart = () => {
    if (!project || !canStart) return
    startOrchestrator(
      project.id,
      controlMode as 'vibe_it' | 'fix_it' | 'design_it',
      spec?.description || project.description || '',
      spec || undefined,
      blocks,
      onSpecUpdate
    )
  }

  // Collapsed view - just a toggle button
  if (isCollapsed) {
    return (
      <div className="w-12 bg-surface-900 border-l border-surface-700 flex flex-col items-center py-4">
        <button
          onClick={onToggleCollapse}
          className="p-2 text-steel-dim hover:text-copper hover:bg-surface-800 rounded-lg transition-colors"
          title="Expand AI Assistant"
        >
          <PanelRightOpen className="w-5 h-5" />
        </button>

        {/* Status indicator when collapsed */}
        {!isIdle && (
          <div className="mt-4">
            {isRunning ? (
              <Loader2 className="w-5 h-5 text-copper animate-spin" />
            ) : status === 'complete' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : status === 'error' ? (
              <XCircle className="w-5 h-5 text-red-400" />
            ) : (
              <Pause className="w-5 h-5 text-amber-400" />
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="w-80 bg-surface-900 border-l border-surface-700 flex flex-col min-h-0">
      {/* Header */}
      <div className="p-3 border-b border-surface-700 bg-surface-800/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-copper" />
          <span className="font-medium text-steel flex-1">AI Assistant</span>
          <StatusBadge status={status} />
          <button
            onClick={onToggleCollapse}
            className="p-1.5 text-steel-dim hover:text-steel hover:bg-surface-700 rounded transition-colors"
            title="Collapse"
          >
            <PanelRightClose className="w-4 h-4" />
          </button>
        </div>

        {/* Mode and Stage */}
        <div className="flex items-center gap-2 mt-2 text-xs">
          <span
            className={clsx(
              'flex items-center gap-1 px-1.5 py-0.5 rounded',
              config.color === 'copper' && 'bg-copper/10 text-copper',
              config.color === 'blue' && 'bg-blue-500/10 text-blue-400',
              config.color === 'purple' && 'bg-purple-500/10 text-purple-400'
            )}
          >
            <ModeIcon className="w-3 h-3" />
            {config.label}
          </span>
          {!isIdle && (
            <>
              <span className="text-steel-dim">•</span>
              <StageBadge stage={currentStage} />
              {iterationCount > 0 && (
                <>
                  <span className="text-steel-dim">•</span>
                  <span className="text-steel-dim">#{iterationCount}</span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {/* Idle state - show start button */}
        {isIdle && (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
            <div
              className={clsx(
                'w-16 h-16 rounded-full flex items-center justify-center mb-4',
                config.color === 'copper' && 'bg-copper/10',
                config.color === 'blue' && 'bg-blue-500/10',
                config.color === 'purple' && 'bg-purple-500/10'
              )}
            >
              <Sparkles
                className={clsx(
                  'w-8 h-8',
                  config.color === 'copper' && 'text-copper',
                  config.color === 'blue' && 'text-blue-400',
                  config.color === 'purple' && 'text-purple-400'
                )}
              />
            </div>

            <h3 className="text-lg font-semibold text-steel mb-2">PHAESTUS AI</h3>
            <p className="text-sm text-steel-dim mb-6">{config.description}</p>

            {canStart ? (
              <button
                onClick={handleStart}
                className={clsx(
                  'flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all hover:scale-[1.02]',
                  config.color === 'copper' && 'bg-copper text-surface-900 hover:bg-copper-light',
                  config.color === 'blue' &&
                    'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30',
                  config.color === 'purple' &&
                    'bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30'
                )}
              >
                <Zap className="w-4 h-4" />
                Start Design
              </button>
            ) : controlMode === 'design_it' ? (
              <p className="text-xs text-steel-dim">
                Manual mode - use the workspace tools directly
              </p>
            ) : !isEligible ? (
              <p className="text-xs text-steel-dim">Project not eligible for automation</p>
            ) : null}
          </div>
        )}

        {/* Active state - show history */}
        {!isIdle && (
          <>
            {/* Current action */}
            {currentAction && (
              <div className="p-3 bg-surface-800 border-b border-surface-700 flex-shrink-0">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-copper flex-shrink-0" />
                  <span className="text-steel truncate">{currentAction}</span>
                </div>
              </div>
            )}

            {/* Error display */}
            {error && (
              <div className="p-3 bg-red-500/10 border-b border-red-500/20 flex-shrink-0">
                <div className="flex items-start gap-2 text-sm">
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <span className="text-red-300">{error}</span>
                </div>
              </div>
            )}

            {/* History list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredHistory.length === 0 ? (
                <div className="text-center text-steel-dim text-sm py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-copper" />
                  Starting orchestration...
                </div>
              ) : (
                filteredHistory.map((item) => <HistoryItem key={item.id} item={item} />)
              )}
              <div ref={historyEndRef} />
            </div>

            {/* Thinking toggle */}
            <div className="px-3 py-2 border-t border-surface-700 flex-shrink-0">
              <button
                onClick={toggleThinking}
                className={clsx(
                  'flex items-center gap-1.5 text-xs transition-colors',
                  showThinking ? 'text-copper' : 'text-steel-dim hover:text-steel'
                )}
              >
                <Brain className="w-3.5 h-3.5" />
                {showThinking ? 'Showing thinking' : 'Show thinking'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Controls footer */}
      <div className="p-3 border-t border-surface-700 bg-surface-800/50 flex-shrink-0">
        {isRunning ? (
          <button
            onClick={stopOrchestrator}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded-lg transition-colors"
          >
            <Pause className="w-4 h-4" />
            Pause
          </button>
        ) : status === 'paused' ? (
          <div className="flex gap-2">
            <button
              onClick={() => {
                /* Resume would go here */
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-copper/20 text-copper hover:bg-copper/30 rounded-lg transition-colors"
            >
              <Play className="w-4 h-4" />
              Resume
            </button>
            <button
              onClick={resetOrchestrator}
              className="px-4 py-2 text-sm bg-surface-700 text-steel-dim hover:text-steel hover:bg-surface-600 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        ) : (status === 'complete' || status === 'error') && history.length > 0 ? (
          <div className="flex gap-2">
            <button
              onClick={resetOrchestrator}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-surface-700 text-steel-dim hover:text-steel hover:bg-surface-600 rounded-lg transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Start New
            </button>
          </div>
        ) : isIdle ? (
          <div className="text-xs text-center text-steel-dim">
            {filteredHistory.length > 0
              ? `${filteredHistory.length} actions completed`
              : 'Ready to assist'}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function StatusBadge({ status }: { status: OrchestratorStatus }) {
  const config: Record<OrchestratorStatus, { label: string; className: string }> = {
    idle: { label: 'Ready', className: 'bg-surface-700 text-steel-dim' },
    running: { label: 'Running', className: 'bg-emerald-500/20 text-emerald-400' },
    paused: { label: 'Paused', className: 'bg-amber-500/20 text-amber-400' },
    validating: { label: 'Checking', className: 'bg-blue-500/20 text-blue-400' },
    fixing: { label: 'Fixing', className: 'bg-orange-500/20 text-orange-400' },
    complete: { label: 'Done', className: 'bg-copper/20 text-copper' },
    error: { label: 'Error', className: 'bg-red-500/20 text-red-400' },
  }

  const { label, className } = config[status]

  return <span className={`px-2 py-0.5 text-xs rounded-full ${className}`}>{label}</span>
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
    <span className="px-1.5 py-0.5 bg-surface-700 text-steel-dim rounded text-xs">
      {labels[stage]}
    </span>
  )
}

function HistoryItem({ item }: { item: OrchestratorHistoryItem }) {
  const [isExpanded, setIsExpanded] = useState(false)

  const iconConfig: Record<string, { icon: React.ReactNode; color: string }> = {
    tool_call: { icon: <Wrench className="w-3.5 h-3.5" />, color: 'text-blue-400' },
    tool_result: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'text-emerald-400' },
    validation: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'text-cyan-400' },
    error: { icon: <XCircle className="w-3.5 h-3.5" />, color: 'text-red-400' },
    fix: { icon: <RefreshCw className="w-3.5 h-3.5" />, color: 'text-amber-400' },
    progress: { icon: <ChevronRight className="w-3.5 h-3.5" />, color: 'text-steel-dim' },
    thinking: { icon: <Brain className="w-3.5 h-3.5" />, color: 'text-purple-400' },
  }

  const { icon, color } = iconConfig[item.type] || iconConfig.progress

  return (
    <div
      className={clsx(
        'text-xs cursor-pointer rounded p-2 transition-colors',
        item.type === 'thinking' ? 'bg-purple-500/5' : 'hover:bg-surface-800/50',
        item.type === 'error' && 'bg-red-500/5'
      )}
      onClick={() => item.details && setIsExpanded(!isExpanded)}
    >
      <div className="flex items-start gap-2">
        <span className={`${color} mt-0.5 flex-shrink-0`}>{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-steel leading-relaxed">{item.action}</div>
          {item.result && (
            <div className="text-steel-dim mt-0.5 truncate">{item.result}</div>
          )}
        </div>
        <span className="text-steel-dim/50 text-[10px] flex-shrink-0">{formatTime(item.timestamp)}</span>
      </div>

      {isExpanded && item.details && (
        <div className="mt-2 p-2 bg-surface-800 rounded text-[10px] font-mono text-steel-dim overflow-auto max-h-24">
          <pre className="whitespace-pre-wrap">{JSON.stringify(item.details, null, 2)}</pre>
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
    hour12: false,
  })
}
