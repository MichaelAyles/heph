import { useState, useEffect } from 'react'
import { Loader2, XCircle } from 'lucide-react'
import { llm } from '@/services/llm'
import { FEASIBILITY_SYSTEM_PROMPT, buildFeasibilityPrompt } from '@/prompts/feasibility'
import type { FeasibilityAnalysis, OpenQuestion } from '@/db/schema'
import type { FeasibilityStepProps } from './types'

export function FeasibilityStep({ project, spec, onComplete, onReject }: FeasibilityStepProps) {
  const [status, setStatus] = useState('Analyzing your project...')
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (spec.feasibility) return // Already done
    if (isRunning) return

    setIsRunning(true)
    setError(null)

    const runAnalysis = async () => {
      try {
        setStatus('Checking feasibility with available components...')

        const response = await llm.chat({
          messages: [
            { role: 'system', content: FEASIBILITY_SYSTEM_PROMPT },
            { role: 'user', content: buildFeasibilityPrompt(spec.description) },
          ],
          temperature: 0.3,
          projectId: project.id,
        })

        const fullContent = response.content
        const jsonMatch = fullContent.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('No JSON in response')

        const result = JSON.parse(jsonMatch[0])

        if (!result.manufacturable) {
          onReject(
            result.rejectionReason || 'Project is not manufacturable',
            result.suggestedRevisions
          )
          return
        }

        const feasibility: FeasibilityAnalysis = {
          communication: result.communication,
          processing: result.processing,
          power: result.power,
          inputs: result.inputs,
          outputs: result.outputs,
          overallScore: result.overallScore,
          manufacturable: result.manufacturable,
          rejectionReason: result.rejectionReason,
        }

        const questions: OpenQuestion[] = result.openQuestions || []
        onComplete(feasibility, questions)
      } catch (err) {
        setError('Failed to analyze feasibility. Please try again.')
        console.error('Feasibility analysis error:', err)
        setIsRunning(false)
      }
    }

    runAnalysis()
  }, [project.id, spec, isRunning, onComplete, onReject, retryCount])

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
