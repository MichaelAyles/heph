/**
 * User-controlled "Mark as Complete" button for design stages.
 * Allows users to manually mark a stage as done when they're satisfied.
 */

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import type { WorkspaceStage } from '@/stores/workspace'
import type { ProjectSpec } from '@/db/schema'

interface StageCompleteButtonProps {
  stage: WorkspaceStage
  spec: ProjectSpec | null
  projectId: string
  /** Whether the stage has enough content to be marked complete */
  canComplete: boolean
  onComplete: () => void
  className?: string
}

export function StageCompleteButton({
  stage,
  spec,
  projectId,
  canComplete,
  onComplete,
  className,
}: StageCompleteButtonProps) {
  const [isMarking, setIsMarking] = useState(false)

  const stageStatus = spec?.stages?.[stage as keyof NonNullable<typeof spec.stages>]?.status
  const isComplete = stageStatus === 'complete'

  if (isComplete) {
    return (
      <div className={clsx('flex items-center gap-2 text-emerald-400 text-sm', className)}>
        <Check className="w-4 h-4" strokeWidth={2} />
        <span>Complete</span>
      </div>
    )
  }

  const handleMarkComplete = async () => {
    if (!canComplete || isMarking) return

    setIsMarking(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spec: {
            ...spec,
            stages: {
              ...spec?.stages,
              [stage]: {
                status: 'complete',
                completedAt: new Date().toISOString(),
              },
            },
          },
        }),
      })

      if (res.ok) {
        onComplete()
      }
    } finally {
      setIsMarking(false)
    }
  }

  return (
    <button
      onClick={handleMarkComplete}
      disabled={!canComplete || isMarking}
      className={clsx(
        'flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors',
        canComplete && !isMarking
          ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30'
          : 'bg-surface-700 text-surface-500 cursor-not-allowed',
        className
      )}
      title={canComplete ? 'Mark this stage as complete' : 'Add content before marking complete'}
    >
      {isMarking ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Saving...
        </>
      ) : (
        <>
          <Check className="w-4 h-4" strokeWidth={2} />
          Mark Complete
        </>
      )}
    </button>
  )
}
