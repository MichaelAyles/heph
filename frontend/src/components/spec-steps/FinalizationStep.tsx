import { useState, useEffect } from 'react'
import { Loader2, XCircle } from 'lucide-react'
import { llm } from '@/services/llm'
import { FINAL_SPEC_SYSTEM_PROMPT, buildFinalSpecPrompt } from '@/prompts/finalSpec'
import type { FinalSpec } from '@/db/schema'
import type { FinalizationStepProps } from './types'

export function FinalizationStep({ project, spec, onComplete }: FinalizationStepProps) {
  const [status, setStatus] = useState('Generating final specification...')
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (isRunning || spec.finalSpec) return

    setIsRunning(true)
    setError(null)

    const runFinalization = async () => {
      try {
        setStatus('Creating comprehensive product specification...')

        const selectedPrompt =
          spec.selectedBlueprint !== null ? spec.blueprints[spec.selectedBlueprint]?.prompt : ''

        const response = await llm.chat({
          messages: [
            { role: 'system', content: FINAL_SPEC_SYSTEM_PROMPT },
            {
              role: 'user',
              content: buildFinalSpecPrompt(
                spec.description,
                spec.feasibility || {},
                spec.decisions,
                selectedPrompt
              ),
            },
          ],
          temperature: 0.3,
          projectId: project.id,
        })

        const fullContent = response.content
        const jsonMatch = fullContent.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('No JSON in response')

        const result = JSON.parse(jsonMatch[0]) as FinalSpec
        result.locked = true
        result.lockedAt = new Date().toISOString()
        onComplete(result)
      } catch (err) {
        console.error('Failed to generate final spec:', err)
        setError('Failed to generate specification. Please try again.')
        setIsRunning(false)
      }
    }

    runFinalization()
  }, [project.id, spec, isRunning, onComplete, retryCount])

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
