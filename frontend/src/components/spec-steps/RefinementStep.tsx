import { useState, useEffect, useCallback } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { clsx } from 'clsx'
import { llm } from '@/services/llm'
import { REFINEMENT_SYSTEM_PROMPT, buildRefinementPrompt } from '@/prompts/refinement'
import type { Decision, OpenQuestion } from '@/db/schema'
import type { RefinementStepProps } from './types'

const MAX_REFINEMENT_ROUNDS = 5

export function RefinementStep({ project, spec, onDecisions, onComplete }: RefinementStepProps) {
  const [pendingQuestions, setPendingQuestions] = useState<OpenQuestion[]>(spec.openQuestions)
  const [isChecking, setIsChecking] = useState(false)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({})
  const [otherMode, setOtherMode] = useState<Record<string, boolean>>({})
  const [otherText, setOtherText] = useState<Record<string, string>>({})
  // Track all decisions including ones just submitted (to avoid stale closure)
  const [allDecisions, setAllDecisions] = useState<Decision[]>(spec.decisions || [])

  // Check if we need more questions after answering
  const checkForMoreQuestions = useCallback(
    async (currentDecisions: Decision[]) => {
      if (!spec.feasibility) return

      // Force completion after max rounds (roughly 2 questions per round)
      if (currentDecisions.length >= MAX_REFINEMENT_ROUNDS * 2) {
        onComplete()
        return
      }

      setIsChecking(true)

      try {
        const response = await llm.chat({
          messages: [
            { role: 'system', content: REFINEMENT_SYSTEM_PROMPT },
            {
              role: 'user',
              content: buildRefinementPrompt(spec.description, spec.feasibility, currentDecisions),
            },
          ],
          temperature: 0.3,
          projectId: project.id,
        })

        const fullContent = response.content
        const jsonMatch = fullContent.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          onComplete()
          return
        }

        const result = JSON.parse(jsonMatch[0])

        if (result.complete) {
          onComplete()
        } else if (result.additionalQuestions?.length > 0) {
          setPendingQuestions(result.additionalQuestions)
        } else {
          onComplete()
        }
      } catch (err) {
        console.error('Failed to parse refinement response:', err)
        onComplete() // Proceed anyway
      } finally {
        setIsChecking(false)
      }
    },
    [project.id, spec.feasibility, spec.description, onComplete]
  )

  const handleAnswer = (questionId: string, _question: string, answer: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: answer }))
    setOtherMode((prev) => ({ ...prev, [questionId]: false }))
  }

  const handleOtherClick = (questionId: string) => {
    setOtherMode((prev) => ({ ...prev, [questionId]: true }))
    setSelectedAnswers((prev) => {
      const updated = { ...prev }
      delete updated[questionId]
      return updated
    })
  }

  const handleOtherTextChange = (questionId: string, text: string) => {
    setOtherText((prev) => ({ ...prev, [questionId]: text }))
    if (text.trim()) {
      setSelectedAnswers((prev) => ({ ...prev, [questionId]: text.trim() }))
    } else {
      setSelectedAnswers((prev) => {
        const updated = { ...prev }
        delete updated[questionId]
        return updated
      })
    }
  }

  const handleSubmitAnswers = () => {
    // Build new decisions from current answers
    const newDecisions: Decision[] = []
    Object.entries(selectedAnswers).forEach(([questionId, answer]) => {
      const question = pendingQuestions.find((q) => q.id === questionId)
      if (question) {
        const decision: Decision = {
          questionId,
          question: question.question,
          answer,
          timestamp: new Date().toISOString(),
        }
        newDecisions.push(decision)
      }
    })

    // Update local decisions state with ALL decisions
    const updatedDecisions = [...allDecisions, ...newDecisions]
    setAllDecisions(updatedDecisions)

    // Save all decisions at once (not one by one to avoid race conditions)
    onDecisions(updatedDecisions)

    // Clear pending and check for more with the FULL decision list
    setPendingQuestions([])
    setSelectedAnswers({})
    checkForMoreQuestions(updatedDecisions)
  }

  // If no pending questions on mount, check if we need more
  useEffect(() => {
    if (pendingQuestions.length === 0 && !isChecking) {
      checkForMoreQuestions(allDecisions)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isChecking) {
    return (
      <div className="bg-surface-900 border border-surface-700 p-6">
        <div className="flex items-center gap-2 text-copper">
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
          <span className="text-sm">Checking for additional questions...</span>
        </div>
      </div>
    )
  }

  if (pendingQuestions.length === 0) {
    return (
      <div className="bg-surface-900 border border-surface-700 p-6">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="w-5 h-5" strokeWidth={1.5} />
          <span>All specifications confirmed!</span>
        </div>
      </div>
    )
  }

  // Calculate round info (roughly 2 questions per round, ~3 rounds total)
  const currentRound = Math.floor(allDecisions.length / 2) + 1
  const estimatedTotalRounds = 3
  const remainingRounds = Math.max(0, estimatedTotalRounds - currentRound + 1)

  return (
    <div className="space-y-4">
      {/* Progress indicator */}
      <div className="bg-surface-800 border border-surface-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-steel-dim text-sm">
          <span className="font-mono">REFINEMENT</span>
          <span className="text-copper">Round {currentRound}</span>
          {allDecisions.length > 0 && (
            <span className="text-steel-dim">
              • {allDecisions.length} decision{allDecisions.length !== 1 ? 's' : ''} made
            </span>
          )}
        </div>
        <div className="text-xs text-steel-dim">
          {remainingRounds > 1
            ? `~${remainingRounds} rounds remaining`
            : remainingRounds === 1
              ? 'Final round'
              : 'Almost done'}
        </div>
      </div>

      {pendingQuestions.map((q) => (
        <div key={q.id} className="bg-surface-900 border border-surface-700 p-6">
          <h4 className="text-steel font-medium mb-4">{q.question}</h4>
          <div className="grid grid-cols-2 gap-3">
            {q.options.map((option) => (
              <button
                key={option}
                onClick={() => handleAnswer(q.id, q.question, option)}
                className={clsx(
                  'px-4 py-3 text-sm text-left border transition-colors',
                  selectedAnswers[q.id] === option && !otherMode[q.id]
                    ? 'bg-copper/20 border-copper text-copper'
                    : 'bg-surface-800 border-surface-600 text-steel hover:border-copper/50'
                )}
              >
                {option}
              </button>
            ))}
            <button
              onClick={() => handleOtherClick(q.id)}
              className={clsx(
                'px-4 py-3 text-sm text-left border transition-colors',
                otherMode[q.id]
                  ? 'bg-copper/20 border-copper text-copper'
                  : 'bg-surface-800 border-surface-600 text-steel hover:border-copper/50'
              )}
            >
              Other...
            </button>
          </div>
          {otherMode[q.id] && (
            <div className="mt-3">
              <input
                type="text"
                value={otherText[q.id] || ''}
                onChange={(e) => handleOtherTextChange(q.id, e.target.value)}
                placeholder="Enter your answer..."
                className="w-full px-4 py-3 bg-surface-800 border border-surface-600 text-steel placeholder-steel-dim text-sm focus:outline-none focus:border-copper"
                autoFocus
              />
            </div>
          )}
        </div>
      ))}

      {Object.keys(selectedAnswers).length === pendingQuestions.length && (
        <button
          onClick={handleSubmitAnswers}
          className="w-full py-3 bg-copper-gradient text-ash font-semibold hover:opacity-90 transition-opacity"
        >
          Continue
        </button>
      )}
    </div>
  )
}
