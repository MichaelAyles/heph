/**
 * ExecutionTimeline - Horizontal timeline for scrubbing through execution
 *
 * Features:
 * - Horizontal scrubber showing execution progress
 * - Clickable step markers
 * - Duration breakdown per step
 * - Color-coded by event type
 */

import { useMemo, useCallback, useRef, useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Play, Pause, SkipForward, SkipBack, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import type { ExecutionEvent, TimelineStep } from '../../../services/langgraph/execution-tracer'
import { eventsToTimeline } from '../../../services/langgraph/execution-tracer'

// =============================================================================
// Types
// =============================================================================

export interface ExecutionTimelineProps {
  /** Execution events */
  events: ExecutionEvent[]
  /** Current step index */
  currentStep: number
  /** Callback when step changes */
  onStepChange: (step: number) => void
  /** Whether playback is active */
  isPlaying?: boolean
  /** Callback to toggle playback */
  onPlayPause?: () => void
  /** Total duration in ms */
  totalDuration?: number
}

// =============================================================================
// Helper Components
// =============================================================================

interface StepMarkerProps {
  step: TimelineStep
  isActive: boolean
  isCurrent: boolean
  position: number
  onClick: () => void
}

function StepMarker({ step, isActive, isCurrent, position, onClick }: StepMarkerProps) {
  // Color based on event type
  const getColor = () => {
    switch (step.type) {
      case 'graph_start':
        return 'bg-indigo-500'
      case 'graph_end':
        return step.label === 'Complete' ? 'bg-emerald-500' : 'bg-red-500'
      case 'node_enter':
        return 'bg-blue-400'
      case 'node_exit':
        return 'bg-blue-600'
      case 'edge_taken':
        return 'bg-amber-500'
      case 'error':
        return 'bg-red-500'
      default:
        return 'bg-surface-500'
    }
  }

  return (
    <button
      onClick={onClick}
      className={clsx(
        'absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all duration-200',
        getColor(),
        isCurrent && 'ring-2 ring-copper ring-offset-2 ring-offset-surface-800 scale-125',
        isActive && 'opacity-100',
        !isActive && !isCurrent && 'opacity-50 hover:opacity-75'
      )}
      style={{ left: `${position}%` }}
      title={step.label}
    />
  )
}

// =============================================================================
// Component
// =============================================================================

export function ExecutionTimeline({
  events,
  currentStep,
  onStepChange,
  isPlaying = false,
  onPlayPause,
  totalDuration,
}: ExecutionTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Convert events to timeline steps
  const steps = useMemo(() => eventsToTimeline(events), [events])

  // Calculate total duration from events if not provided
  const calculatedDuration = useMemo(() => {
    if (totalDuration) return totalDuration
    if (events.length < 2) return 0
    return events[events.length - 1].timestamp - events[0].timestamp
  }, [events, totalDuration])

  // Get position for a step (percentage along the track)
  const getStepPosition = useCallback(
    (step: TimelineStep) => {
      if (events.length < 2) return 50
      const startTime = events[0].timestamp
      const elapsed = step.timestamp - startTime
      return (elapsed / calculatedDuration) * 100
    },
    [events, calculatedDuration]
  )

  // Get current progress as percentage
  const currentProgress = useMemo(() => {
    if (currentStep < 0 || currentStep >= steps.length) return 0
    return getStepPosition(steps[currentStep])
  }, [currentStep, steps, getStepPosition])

  // Handle click on track to jump to position
  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (!trackRef.current || steps.length === 0) return

      const rect = trackRef.current.getBoundingClientRect()
      const clickPosition = (e.clientX - rect.left) / rect.width

      // Find the closest step
      let closestStep = 0
      let closestDistance = Infinity

      for (let i = 0; i < steps.length; i++) {
        const stepPosition = getStepPosition(steps[i]) / 100
        const distance = Math.abs(clickPosition - stepPosition)
        if (distance < closestDistance) {
          closestDistance = distance
          closestStep = i
        }
      }

      onStepChange(closestStep)
    },
    [steps, getStepPosition, onStepChange]
  )

  // Handle drag
  const handleMouseDown = useCallback(() => {
    setIsDragging(true)
  }, [])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !trackRef.current || steps.length === 0) return

      const rect = trackRef.current.getBoundingClientRect()
      const clickPosition = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))

      // Find the closest step
      let closestStep = 0
      let closestDistance = Infinity

      for (let i = 0; i < steps.length; i++) {
        const stepPosition = getStepPosition(steps[i]) / 100
        const distance = Math.abs(clickPosition - stepPosition)
        if (distance < closestDistance) {
          closestDistance = distance
          closestStep = i
        }
      }

      onStepChange(closestStep)
    },
    [isDragging, steps, getStepPosition, onStepChange]
  )

  // Add/remove global mouse event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Navigation functions
  const goToPrev = useCallback(() => {
    if (currentStep > 0) {
      onStepChange(currentStep - 1)
    }
  }, [currentStep, onStepChange])

  const goToNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      onStepChange(currentStep + 1)
    }
  }, [currentStep, steps.length, onStepChange])

  const goToStart = useCallback(() => {
    onStepChange(0)
  }, [onStepChange])

  const goToEnd = useCallback(() => {
    onStepChange(steps.length - 1)
  }, [steps.length, onStepChange])

  // Get current step info
  const currentStepInfo = steps[currentStep]

  if (events.length === 0) {
    return (
      <div className="bg-surface-800 rounded-lg p-4 text-center text-steel-dim text-sm">
        No execution events to display
      </div>
    )
  }

  return (
    <div className="bg-surface-800 rounded-lg p-4 space-y-3">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={goToStart}
            disabled={currentStep === 0}
            className="p-1.5 rounded hover:bg-surface-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Go to start"
          >
            <SkipBack className="w-4 h-4 text-steel" />
          </button>
          <button
            onClick={goToPrev}
            disabled={currentStep === 0}
            className="p-1.5 rounded hover:bg-surface-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous step"
          >
            <ChevronLeft className="w-4 h-4 text-steel" />
          </button>
          {onPlayPause && (
            <button
              onClick={onPlayPause}
              className="p-1.5 rounded bg-copper/20 hover:bg-copper/30"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 text-copper" />
              ) : (
                <Play className="w-4 h-4 text-copper" />
              )}
            </button>
          )}
          <button
            onClick={goToNext}
            disabled={currentStep === steps.length - 1}
            className="p-1.5 rounded hover:bg-surface-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next step"
          >
            <ChevronRight className="w-4 h-4 text-steel" />
          </button>
          <button
            onClick={goToEnd}
            disabled={currentStep === steps.length - 1}
            className="p-1.5 rounded hover:bg-surface-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Go to end"
          >
            <SkipForward className="w-4 h-4 text-steel" />
          </button>
        </div>

        <div className="flex items-center gap-4 text-xs text-steel-dim">
          <span>
            Step {currentStep + 1} / {steps.length}
          </span>
          {calculatedDuration > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {calculatedDuration}ms
            </span>
          )}
        </div>
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        className="relative h-8 bg-surface-900 rounded-full cursor-pointer"
        onClick={handleTrackClick}
        onMouseDown={handleMouseDown}
      >
        {/* Progress bar */}
        <div
          className="absolute top-0 left-0 h-full bg-copper/20 rounded-full transition-all duration-150"
          style={{ width: `${currentProgress}%` }}
        />

        {/* Step markers */}
        {steps.map((step, index) => (
          <StepMarker
            key={index}
            step={step}
            isActive={index <= currentStep}
            isCurrent={index === currentStep}
            position={getStepPosition(step)}
            onClick={() => onStepChange(index)}
          />
        ))}

        {/* Playhead */}
        <div
          className="absolute top-0 w-0.5 h-full bg-copper shadow-lg shadow-copper/50 transition-all duration-150"
          style={{ left: `${currentProgress}%` }}
        />
      </div>

      {/* Current step info */}
      {currentStepInfo && (
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                'px-2 py-0.5 rounded font-medium',
                currentStepInfo.type === 'graph_start' && 'bg-indigo-500/20 text-indigo-400',
                currentStepInfo.type === 'graph_end' && (currentStepInfo.label === 'Complete' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'),
                currentStepInfo.type === 'node_enter' && 'bg-blue-500/20 text-blue-400',
                currentStepInfo.type === 'node_exit' && 'bg-blue-600/20 text-blue-300',
                currentStepInfo.type === 'edge_taken' && 'bg-amber-500/20 text-amber-400',
                currentStepInfo.type === 'error' && 'bg-red-500/20 text-red-400'
              )}
            >
              {currentStepInfo.type.replace('_', ' ')}
            </span>
            <span className="text-steel">{currentStepInfo.label}</span>
          </div>
          {currentStepInfo.durationMs !== undefined && (
            <span className="text-steel-dim font-mono">{currentStepInfo.durationMs}ms</span>
          )}
        </div>
      )}

      {/* Step legend */}
      <div className="flex flex-wrap gap-3 text-[10px] text-steel-dim pt-2 border-t border-surface-700">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-indigo-500" />
          Start
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-400" />
          Node Enter
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-600" />
          Node Exit
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          Edge
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          Complete
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          Error
        </div>
      </div>
    </div>
  )
}
