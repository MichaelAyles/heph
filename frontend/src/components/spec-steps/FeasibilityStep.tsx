/**
 * FeasibilityStep - Analyzes project feasibility with available components
 *
 * Uses the LangGraph feasibility node via /api/langgraph/invoke/feasibility
 */

import { useState, useEffect } from 'react'
import { Loader2, XCircle } from 'lucide-react'
import { logger } from '../../lib/logger'
import { invokeLangGraphNode, BreakpointCancelledError } from '../../services/langgraph/invoke'
import type { SuggestedRevisions } from './types'
import type { Project, ProjectSpec, FeasibilityAnalysis, OpenQuestion } from '../../db/schema'

interface FeasibilityStepProps {
  project: Project
  spec: ProjectSpec
  onComplete: (feasibility: FeasibilityAnalysis, questions: OpenQuestion[]) => void
  onReject: (reason: string, suggestedRevisions?: SuggestedRevisions) => void
  onCancel?: () => void
}

interface FeasibilityResponse {
  output: {
    manufacturable: boolean
    rejectionReason?: string | null
    overallScore?: number
    communication?: { type: string; confidence: number; notes: string }
    processing?: { level: string; confidence: number; notes: string }
    power?: { options: string[]; confidence: number; notes: string }
    inputs?: { items: string[]; confidence?: number; notes?: string }
    outputs?: { items: string[]; confidence?: number; notes?: string }
    openQuestions?: Array<{
      id: string
      question: string
      options?: string[]
      category?: string
      impact?: string
    }>
    suggestedRevisions?: {
      summary: string
      changes: string[]
      revisedDescription: string
    } | null
  }
  nodeId: string
  debug: {
    nodeName: string
    durationMs: number
    model: string
  }
}

export function FeasibilityStep({
  project,
  spec,
  onComplete,
  onReject,
  onCancel,
}: FeasibilityStepProps) {
  const [status, setStatus] = useState('Analyzing your project...')
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [cancelled, setCancelled] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (spec.feasibility) return // Already done
    if (isRunning) return
    if (cancelled) return // Don't retry if cancelled

    setIsRunning(true)
    setError(null)

    const runAnalysis = async () => {
      try {
        setStatus('Checking feasibility with available components...')

        // All context comes from projectState via @variables in the system prompt
        // No need to pass data explicitly - the invoke handler fetches it
        const data = await invokeLangGraphNode({
          nodeName: 'feasibility',
          input: {}, // Empty - context comes from @variables
          projectId: project.id,
        })

        const result = data.output as FeasibilityResponse['output']

        if (!result.manufacturable) {
          onReject(
            result.rejectionReason || 'Project is not manufacturable',
            result.suggestedRevisions ?? undefined // Convert null to undefined
          )
          return
        }

        // Store the complete LLM response for downstream use via @feasibilityAnalysis
        const feasibility: FeasibilityAnalysis = {
          communication: result.communication ?? { type: 'unknown', confidence: 0, notes: '' },
          processing: result.processing ?? { level: 'unknown', confidence: 0, notes: '' },
          power: result.power ?? { options: [], confidence: 0, notes: '' },
          inputs: {
            items: result.inputs?.items ?? [],
            confidence: result.inputs?.confidence,
            notes: result.inputs?.notes,
          },
          outputs: {
            items: result.outputs?.items ?? [],
            confidence: result.outputs?.confidence,
            notes: result.outputs?.notes,
          },
          overallScore: result.overallScore ?? 0,
          manufacturable: result.manufacturable,
          rejectionReason: result.rejectionReason ?? undefined,
          suggestedRevisions: result.suggestedRevisions ?? undefined,
          openQuestions: result.openQuestions,
        }

        const questions: OpenQuestion[] = (result.openQuestions || []).map((q) => ({
          id: q.id,
          question: q.question,
          options: q.options || [],
        }))
        onComplete(feasibility, questions)
      } catch (err) {
        if (err instanceof BreakpointCancelledError) {
          setCancelled(true)
          setIsRunning(false)
          onCancel?.()
          return
        }
        setError('Failed to analyze feasibility. Please try again.')
        logger.error('project', 'Feasibility analysis failed', { error: err })
        setIsRunning(false)
      }
    }

    runAnalysis()
  }, [project.id, spec, isRunning, onComplete, onReject, retryCount])
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
          <span className="font-semibold">Analysis Failed</span>
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
        <span className="text-xs font-mono tracking-wide">ANALYZING FEASIBILITY...</span>
      </div>
      <p className="text-steel-dim text-sm">{status}</p>
    </div>
  )
}
