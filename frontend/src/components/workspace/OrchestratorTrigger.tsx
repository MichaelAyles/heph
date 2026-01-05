/**
 * Orchestrator Trigger Component
 *
 * Displays a button to start the orchestrator in the current mode.
 * Shows in the workspace when user is in Vibe It mode and project is eligible.
 */

import { useState } from 'react'
import { Zap, Wrench, MessageSquare, Sparkles } from 'lucide-react'
import { clsx } from 'clsx'
import { useOrchestratorStore } from '@/stores/orchestrator'
import { useAuthStore } from '@/stores/auth'
import type { Project, ProjectSpec, PcbBlock } from '@/db/schema'

interface OrchestratorTriggerProps {
  project: Project
  blocks?: PcbBlock[]
  onSpecUpdate?: (spec: Partial<ProjectSpec>) => Promise<void>
  className?: string
}

export function OrchestratorTrigger({
  project,
  blocks,
  onSpecUpdate,
  className,
}: OrchestratorTriggerProps) {
  const { user } = useAuthStore()
  const { status, startOrchestrator } = useOrchestratorStore()
  const [isHovered, setIsHovered] = useState(false)

  const controlMode = user?.controlMode || 'fix_it'

  // Mode configuration
  const modeConfig = {
    vibe_it: {
      icon: Zap,
      label: 'Vibe It',
      description: 'Let PHAESTUS design everything autonomously',
      color: 'copper',
      buttonClass: 'bg-copper-gradient text-ash',
    },
    fix_it: {
      icon: Wrench,
      label: 'Fix It',
      description: 'PHAESTUS handles details, you make key decisions',
      color: 'blue',
      buttonClass: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    },
    design_it: {
      icon: MessageSquare,
      label: 'Design It',
      description: 'Full control over every design decision',
      color: 'purple',
      buttonClass: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    },
  }

  const config = modeConfig[controlMode as keyof typeof modeConfig] || modeConfig.fix_it
  const Icon = config.icon

  // Check if project is eligible for orchestration
  const spec = project.spec as ProjectSpec | null
  const isEligible =
    project.status === 'draft' ||
    project.status === 'analyzing' ||
    (project.status === 'complete' && !spec?.stages?.export?.completedAt)

  // Check visibility conditions
  const isActive = status === 'running' || status === 'complete'
  const isDesignItMode = controlMode === 'design_it'

  // Don't show if already running, complete, in design it mode, or not eligible
  if (isActive || isDesignItMode || !isEligible) {
    return null
  }

  // At this point, status is not 'running' or 'complete' (we returned above)
  // So we can safely assume the button is not disabled

  const handleStart = () => {
    const mode =
      controlMode === 'vibe_it' ? 'vibe_it' : controlMode === 'fix_it' ? 'fix_it' : 'design_it'
    startOrchestrator(
      project.id,
      mode,
      spec?.description || project.description || '',
      spec || undefined,
      blocks,
      onSpecUpdate
    )
  }

  return (
    <div
      className={clsx('bg-surface-900 border border-surface-700 p-4 rounded-lg', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start gap-4">
        <div
          className={clsx(
            'p-3 rounded-lg',
            config.color === 'copper' && 'bg-copper/10',
            config.color === 'blue' && 'bg-blue-500/10',
            config.color === 'purple' && 'bg-purple-500/10'
          )}
        >
          <Sparkles
            className={clsx(
              'w-6 h-6',
              config.color === 'copper' && 'text-copper',
              config.color === 'blue' && 'text-blue-400',
              config.color === 'purple' && 'text-purple-400'
            )}
          />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-steel">Autonomous Design</span>
            <span
              className={clsx(
                'px-1.5 py-0.5 text-xs rounded',
                config.color === 'copper' && 'bg-copper/20 text-copper',
                config.color === 'blue' && 'bg-blue-500/20 text-blue-400',
                config.color === 'purple' && 'bg-purple-500/20 text-purple-400'
              )}
            >
              <Icon className="w-3 h-3 inline mr-1" />
              {config.label}
            </span>
          </div>

          <p className="text-sm text-steel-dim mb-3">{config.description}</p>

          <button
            onClick={handleStart}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 font-medium transition-all',
              config.buttonClass,
              isHovered && 'scale-[1.02]'
            )}
          >
            <Zap className="w-4 h-4" />
            Start Autonomous Design
          </button>
        </div>
      </div>

      {controlMode === 'vibe_it' && (
        <div className="mt-4 pt-4 border-t border-surface-700">
          <div className="text-xs text-steel-dim">
            <span className="text-copper font-medium">Vibe It Mode:</span> PHAESTUS will complete
            the entire design pipeline without stopping for input. You can pause at any time.
          </div>
        </div>
      )}
    </div>
  )
}
