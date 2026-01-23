/**
 * ChatDebugPanel Component
 *
 * Displays debug information about the chat pipeline execution.
 * Shows execution trace, system prompt, LLM calls, and timing.
 */

import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  FileText,
  GitBranch,
  Shield,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import type { DebugInfo, DebugStep } from '../../types/debug'

interface ChatDebugPanelProps {
  debugInfo: DebugInfo | null
  onClose: () => void
}

interface CollapsibleSectionProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  badge?: string
}

function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
  badge,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border border-zinc-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-zinc-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-400" />
        )}
        {icon}
        <span className="text-sm font-medium text-zinc-200">{title}</span>
        {badge && (
          <span className="ml-auto px-2 py-0.5 bg-zinc-600 text-zinc-300 text-xs rounded">
            {badge}
          </span>
        )}
      </button>
      {isOpen && <div className="p-3 bg-zinc-900">{children}</div>}
    </div>
  )
}

function StepCard({ step, index }: { step: DebugStep; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false)

  const hasInput = step.input !== undefined && step.input !== null
  const hasOutput = step.output !== undefined && step.output !== null
  const hasData = hasInput || hasOutput

  const nodeLabels: Record<string, string> = {
    init: 'Initialize',
    hard_rejection_check: 'Hard Rejection Check',
    hard_rejection_node: 'Hard Rejection',
    system_prompt_loaded: 'System Prompt Loaded',
    capability_assess: 'Capability Assessment',
    reject_node: 'Reject',
    clarify_node: 'Clarify',
    proceed_node: 'Proceed',
    error: 'Error',
    clarify_node_fallback: 'Clarify (Fallback)',
  }

  const nodeColors: Record<string, string> = {
    init: 'bg-blue-500/20 text-blue-400',
    hard_rejection_check: 'bg-yellow-500/20 text-yellow-400',
    hard_rejection_node: 'bg-red-500/20 text-red-400',
    system_prompt_loaded: 'bg-purple-500/20 text-purple-400',
    capability_assess: 'bg-cyan-500/20 text-cyan-400',
    reject_node: 'bg-red-500/20 text-red-400',
    clarify_node: 'bg-amber-500/20 text-amber-400',
    proceed_node: 'bg-green-500/20 text-green-400',
    error: 'bg-red-500/20 text-red-400',
  }

  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-zinc-500 text-xs font-mono w-4">{index + 1}</span>
      <div className="flex-1">
        <button
          onClick={() => hasData && setIsExpanded(!isExpanded)}
          disabled={!hasData}
          className={clsx(
            'flex items-center gap-2 text-left',
            hasData && 'hover:text-zinc-200 cursor-pointer'
          )}
        >
          <span
            className={clsx(
              'px-2 py-0.5 rounded text-xs font-medium',
              nodeColors[step.node] || 'bg-zinc-600 text-zinc-300'
            )}
          >
            {nodeLabels[step.node] || step.node}
          </span>
          {step.duration !== undefined && (
            <span className="text-zinc-500 text-xs">{step.duration}ms</span>
          )}
          {hasData && (
            <ChevronRight
              className={clsx(
                'w-3 h-3 text-zinc-500 transition-transform',
                isExpanded && 'rotate-90'
              )}
            />
          )}
        </button>
        {isExpanded && hasData && (
          <div className="mt-2 ml-2 p-2 bg-zinc-800 rounded text-xs font-mono overflow-x-auto">
            {hasInput && (
              <div className="mb-2">
                <span className="text-zinc-500">Input: </span>
                <pre className="text-zinc-300 whitespace-pre-wrap">
                  {JSON.stringify(step.input, null, 2)}
                </pre>
              </div>
            )}
            {hasOutput && (
              <div>
                <span className="text-zinc-500">Output: </span>
                <pre className="text-zinc-300 whitespace-pre-wrap">
                  {JSON.stringify(step.output, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function ChatDebugPanel({ debugInfo, onClose }: ChatDebugPanelProps) {
  const formattedDuration = useMemo(() => {
    if (!debugInfo?.totalDuration) return null
    if (debugInfo.totalDuration < 1000) {
      return `${debugInfo.totalDuration}ms`
    }
    return `${(debugInfo.totalDuration / 1000).toFixed(2)}s`
  }, [debugInfo?.totalDuration])

  if (!debugInfo) {
    return (
      <div className="h-full flex flex-col bg-zinc-900 border-l border-zinc-700">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200">Debug Panel</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-zinc-500 text-sm text-center">
            Send a message to see debug information
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-zinc-900 border-l border-zinc-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-200">Debug Panel</h2>
          {formattedDuration && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-400">
              <Clock className="w-3 h-3" />
              {formattedDuration}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-zinc-800 rounded transition-colors"
        >
          <X className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Execution Trace */}
        <CollapsibleSection
          title="Execution Trace"
          icon={<GitBranch className="w-4 h-4 text-zinc-400" />}
          defaultOpen={true}
          badge={`${debugInfo.steps.length} steps`}
        >
          <div className="space-y-1">
            {debugInfo.steps.map((step, index) => (
              <StepCard key={index} step={step} index={index} />
            ))}
          </div>
        </CollapsibleSection>

        {/* Hard Rejection */}
        <CollapsibleSection
          title="Hard Rejection Check"
          icon={<Shield className="w-4 h-4 text-zinc-400" />}
          badge={
            debugInfo.hardRejectionMatched
              ? 'Matched'
              : `${debugInfo.hardRejectionCriteriaCount} criteria`
          }
        >
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Criteria checked:</span>
              <span className="text-zinc-200">{debugInfo.hardRejectionCriteriaCount}</span>
            </div>
            {debugInfo.hardRejectionMatched ? (
              <div className="p-2 bg-red-500/10 border border-red-500/30 rounded">
                <span className="text-red-400 font-mono text-xs">
                  Matched: {debugInfo.hardRejectionMatched}
                </span>
              </div>
            ) : (
              <div className="text-zinc-500 text-xs">No patterns matched</div>
            )}
          </div>
        </CollapsibleSection>

        {/* System Prompt */}
        <CollapsibleSection
          title="System Prompt"
          icon={<FileText className="w-4 h-4 text-zinc-400" />}
          badge={debugInfo.systemPromptName || 'None'}
        >
          {debugInfo.systemPromptContent ? (
            <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap bg-zinc-800 p-2 rounded max-h-48 overflow-y-auto">
              {debugInfo.systemPromptContent}
            </pre>
          ) : (
            <div className="text-zinc-500 text-xs">No system prompt loaded</div>
          )}
        </CollapsibleSection>

        {/* LLM Call */}
        <CollapsibleSection
          title="LLM Call"
          icon={<Cpu className="w-4 h-4 text-zinc-400" />}
          badge={debugInfo.llmPrompt ? 'Called' : 'Not called'}
        >
          {debugInfo.llmPrompt ? (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Prompt sent:</div>
                <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap bg-zinc-800 p-2 rounded max-h-48 overflow-y-auto">
                  {debugInfo.llmPrompt}
                </pre>
              </div>
              {debugInfo.llmRawResponse && (
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Raw response:</div>
                  <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap bg-zinc-800 p-2 rounded max-h-48 overflow-y-auto">
                    {debugInfo.llmRawResponse}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="text-zinc-500 text-xs">
              LLM was not called (possibly hard rejected before LLM call)
            </div>
          )}
        </CollapsibleSection>

        {/* Timing */}
        <CollapsibleSection
          title="Timing"
          icon={<Clock className="w-4 h-4 text-zinc-400" />}
          badge={formattedDuration || 'N/A'}
        >
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Start:</span>
              <span className="text-zinc-200 font-mono text-xs">
                {new Date(debugInfo.startTime).toLocaleTimeString()}
              </span>
            </div>
            {debugInfo.endTime && (
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">End:</span>
                <span className="text-zinc-200 font-mono text-xs">
                  {new Date(debugInfo.endTime).toLocaleTimeString()}
                </span>
              </div>
            )}
            {debugInfo.totalDuration && (
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Total duration:</span>
                <span className="text-zinc-200 font-mono text-xs">
                  {debugInfo.totalDuration}ms
                </span>
              </div>
            )}
          </div>
        </CollapsibleSection>
      </div>
    </div>
  )
}
