/**
 * FinalizationStep - Generates the final locked specification
 *
 * Uses the LangGraph finalization node via /api/langgraph/invoke/finalization
 */

import { useState, useEffect } from 'react'
import { Loader2, XCircle } from 'lucide-react'
import { logger } from '../../lib/logger'
import { invokeLangGraphNode, BreakpointCancelledError } from '../../services/langgraph/invoke'
import type { Project, ProjectSpec, FinalSpec } from '../../db/schema'

interface FinalizationStepProps {
  project: Project
  spec: ProjectSpec
  onComplete: (finalSpec: FinalSpec) => void
  onCancel?: () => void
}

interface FinalizationOutput {
  name: string
  summary: string
  pcbSize?: { width: number; height: number; unit: string }
  inputs?: Array<{ type: string; count: number; notes?: string }>
  outputs?: Array<{ type: string; count: number; notes?: string }>
  power?: { source: string; voltage: string; current: string; batteryLife?: string }
  communication?: { type: string; protocol?: string }
  enclosure?: { style: string; width: number; height: number; depth: number }
  estimatedBOM?: Array<{ item: string; quantity: number; unitCost: number }>
}

export function FinalizationStep({ project, spec, onComplete, onCancel }: FinalizationStepProps) {
  const [status, setStatus] = useState('Generating final specification...')
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [cancelled, setCancelled] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isRunning || spec.finalSpec) return
    if (cancelled) return // Don't retry if cancelled

    setIsRunning(true)
    setError(null)

    const runFinalization = async () => {
      try {
        setStatus('Creating comprehensive product specification...')

        // All context comes from projectState via @variables in the system prompt
        // No need to pass data explicitly - the invoke handler fetches it
        const data = await invokeLangGraphNode({
          nodeName: 'finalization',
          input: {}, // Empty - context comes from @variables
          projectId: project.id,
        })

        // Cast output to FinalSpec and add locked fields
        const result = data.output as unknown as FinalizationOutput as unknown as FinalSpec
        result.locked = true
        result.lockedAt = new Date().toISOString()

        // Add visualization URL from selected blueprint
        if (
          spec.selectedBlueprint !== null &&
          spec.blueprints &&
          spec.blueprints[spec.selectedBlueprint]?.url
        ) {
          result.visualizationUrl = spec.blueprints[spec.selectedBlueprint].url
        }

        onComplete(result)
      } catch (err) {
        if (err instanceof BreakpointCancelledError) {
          setCancelled(true)
          setIsRunning(false)
          onCancel?.()
          return
        }
        logger.error('project', 'Failed to generate final spec', { error: err })
        setError('Failed to generate specification. Please try again.')
        setIsRunning(false)
      }
    }

    runFinalization()
  }, [project.id, spec, isRunning, onComplete, retryCount])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleRetry = () => {
    setIsRunning(false)
    setRetryCount((c) => c + 1)
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 p-6">
        <div className="flex items-center gap-2 text-red-400 mb-2">
          <XCircle className="w-5 h-5" strokeWidth={1.5} />
          <span className="font-semibold">Generation Failed</span>
        </div>
        <p className="text-red-300 text-sm mb-4">{error}</p>
        <button
          onClick={handleRetry}
          className="px-4 py-2 bg-copper/20 text-copper border border-copper/30 hover:bg-copper/30 transition-colors text-sm"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="bg-surface-900 border border-surface-700 p-6">
      <div className="flex items-center gap-2 text-copper mb-4">
        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
        <span className="text-xs font-mono tracking-wide">GENERATING FINAL SPECIFICATION...</span>
      </div>
      <p className="text-steel-dim text-sm">{status}</p>
    </div>
  )
}
