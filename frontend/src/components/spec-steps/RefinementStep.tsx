/**
 * RefinementStep - Iterative Q&A to refine project specifications
 *
 * Uses the LangGraph refinement node via /api/langgraph/invoke/refinement
 */

import { useState, useCallback, useEffect } from 'react'
import { clsx } from 'clsx'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { logger } from '../../lib/logger'
import { invokeLangGraphNode, BreakpointCancelledError } from '../../services/langgraph/invoke'
import type { Project, ProjectSpec, Decision, OpenQuestion } from '../../db/schema'

interface RefinementStepProps {
  project: Project
  spec: ProjectSpec
  onDecisions: (decisions: Decision[]) => void
  onComplete: () => void
  onCancel?: () => void
}

interface RefinementResponse {
  output: {
    questions: Array<{
      id: string
      question: string
      options: string[]
      category?: string
    }>
    complete: boolean
    reasoning?: string
  }
  nodeId: string
  debug: {
    nodeName: string
    durationMs: number
    model: string
  }
}

const MAX_REFINEMENT_ROUNDS = 5

export function RefinementStep({
  project,
  spec,
  onDecisions,
  onComplete,
  onCancel,
}: RefinementStepProps) {
  const [pendingQuestions, setPendingQuestions] = useState<OpenQuestion[]>(spec.openQuestions)
  const [isChecking, setIsChecking] = useState(false)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({})
  const [otherMode, setOtherMode] = useState<Record<string, boolean>>({})
  const [otherText, setOtherText] = useState<Record<string, string>>({})
  const [allDecisions, setAllDecisions] = useState<Decision[]>(spec.decisions || [])
  const [cancelled, setCancelled] = useState(false)

  const checkForMoreQuestions = useCallback(
    async (currentDecisions: Decision[]) => {
      if (cancelled) return // Don't continue if cancelled
      if (!spec.feasibility) return

      if (currentDecisions.length >= MAX_REFINEMENT_ROUNDS * 2) {
        onComplete()
        return
      }

      setIsChecking(true)

      try {
        // All context comes from projectState via @variables in the system prompt
        // No need to pass data explicitly - the invoke handler fetches it
        const data = await invokeLangGraphNode({
          nodeName: 'refinement',
          input: {}, // Empty - context comes from @variables
          projectId: project.id,
        })

        const result = data.output as RefinementResponse['output']

        if (result.complete) {
          onComplete()
        } else if (result.questions && result.questions.length > 0) {
          setPendingQuestions(result.questions)
        } else {
          onComplete()
        }
      } catch (err) {
        if (err instanceof BreakpointCancelledError) {
          logger.info('project', 'Refinement cancelled at debug breakpoint')
          setCancelled(true)
          setIsChecking(false)
          onCancel?.()
          return
        }
        logger.error('project', 'Refinement request failed', { error: err })
        onComplete()
      } finally {
        setIsChecking(false)
      }
    },
    [project.id, spec.feasibility, spec.description, onComplete, onCancel, cancelled]
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

    const updatedDecisions = [...allDecisions, ...newDecisions]
    setAllDecisions(updatedDecisions)
    onDecisions(updatedDecisions)
    setPendingQuestions([])
    setSelectedAnswers({})
    checkForMoreQuestions(updatedDecisions)
  }

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

  const currentRound = Math.floor(allDecisions.length / 2) + 1
  const estimatedTotalRounds = 3
  const remainingRounds = Math.max(0, estimatedTotalRounds - currentRound + 1)

  return (
    <div className="space-y-4">
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
