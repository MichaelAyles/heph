import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Loader2,
  CheckCircle2,
  Circle,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Zap,
  Image,
  FileCheck,
  Lock,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useWorkspaceContext } from '@/components/workspace/WorkspaceLayout'
import { useAuthStore } from '@/stores/auth'
import { OrchestratorTrigger } from '@/components/workspace/OrchestratorTrigger'
import { llm } from '@/services/llm'
import { FEASIBILITY_SYSTEM_PROMPT, buildFeasibilityPrompt } from '@/prompts/feasibility'
import { REFINEMENT_SYSTEM_PROMPT, buildRefinementPrompt } from '@/prompts/refinement'
import { buildBlueprintPrompts } from '@/prompts/blueprint'
import { FINAL_SPEC_SYSTEM_PROMPT, buildFinalSpecPrompt } from '@/prompts/finalSpec'
import type {
  Project,
  ProjectSpec,
  FeasibilityAnalysis,
  Decision,
  OpenQuestion,
  FinalSpec,
} from '@/db/schema'

// =============================================================================
// API Functions
// =============================================================================

async function updateProject(id: string, updates: Partial<Project>): Promise<Project> {
  const response = await fetch(`/api/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!response.ok) throw new Error('Failed to update project')
  const data = await response.json()
  return data.project
}

async function generateImage(prompt: string): Promise<string> {
  const response = await fetch('/api/llm/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!response.ok) throw new Error('Image generation failed')
  const data = await response.json()
  if (!data.imageUrl) throw new Error('No image returned')
  return data.imageUrl
}

// =============================================================================
// Step Components
// =============================================================================

const STEPS = [
  { id: 'feasibility', name: 'Feasibility', icon: Zap },
  { id: 'refine', name: 'Refine', icon: CheckCircle2 },
  { id: 'blueprints', name: 'Blueprints', icon: Image },
  { id: 'select', name: 'Select', icon: CheckCircle2 },
  { id: 'finalize', name: 'Finalize', icon: FileCheck },
]

interface StepIndicatorProps {
  currentStep: number
  status: string
}

function StepIndicator({ currentStep, status }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((step, index) => {
        const isComplete = index < currentStep
        const isCurrent = index === currentStep

        return (
          <div key={step.id} className="flex items-center">
            <div
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 text-sm font-medium',
                isComplete && 'text-emerald-400',
                isCurrent && 'text-copper bg-copper/10 border border-copper/30',
                !isComplete && !isCurrent && 'text-steel-dim'
              )}
            >
              {isComplete ? (
                <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />
              ) : isCurrent ? (
                status === 'rejected' ? (
                  <XCircle className="w-4 h-4 text-red-400" strokeWidth={1.5} />
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                )
              ) : (
                <Circle className="w-4 h-4" strokeWidth={1.5} />
              )}
              {step.name}
            </div>
            {index < STEPS.length - 1 && (
              <ChevronRight className="w-4 h-4 text-surface-600 mx-1" strokeWidth={1.5} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// =============================================================================
// Feasibility Step
// =============================================================================

interface SuggestedRevisions {
  summary: string
  changes: string[]
  revisedDescription: string
}

interface FeasibilityStepProps {
  project: Project
  spec: ProjectSpec
  onComplete: (feasibility: FeasibilityAnalysis, questions: OpenQuestion[]) => void
  onReject: (reason: string, suggestedRevisions?: SuggestedRevisions) => void
}

function FeasibilityStep({ project, spec, onComplete, onReject }: FeasibilityStepProps) {
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
        console.error(err)
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

// =============================================================================
// Feasibility Results Display
// =============================================================================

interface FeasibilityResultsProps {
  feasibility: FeasibilityAnalysis
  onContinue: () => void
  autoAdvance?: boolean
}

function FeasibilityResults({
  feasibility,
  onContinue,
  autoAdvance = false,
}: FeasibilityResultsProps) {
  const [countdown, setCountdown] = useState(3)

  // Auto-advance in Vibe It mode (high scores) or Fix It mode (very high scores)
  useEffect(() => {
    if (!autoAdvance) return

    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer)
          onContinue()
          return 0
        }
        return c - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [autoAdvance, onContinue])

  const categories = [
    { key: 'communication', label: 'Communication', data: feasibility.communication },
    { key: 'processing', label: 'Processing', data: feasibility.processing },
    { key: 'power', label: 'Power', data: feasibility.power },
  ]

  return (
    <div className="space-y-6">
      <div className="bg-surface-900 border border-surface-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-steel">Feasibility Analysis</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-steel-dim">Score:</span>
            <span
              className={clsx(
                'text-xl font-bold',
                feasibility.overallScore >= 80 && 'text-emerald-400',
                feasibility.overallScore >= 60 &&
                  feasibility.overallScore < 80 &&
                  'text-yellow-400',
                feasibility.overallScore < 60 && 'text-red-400'
              )}
            >
              {feasibility.overallScore}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {categories.map(({ key, label, data }) => (
            <div key={key} className="bg-surface-800 border border-surface-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-steel">{label}</span>
                <span className="text-xs text-steel-dim">{data.confidence}%</span>
              </div>
              <p className="text-sm text-copper mb-1">
                {'type' in data
                  ? data.type
                  : 'level' in data
                    ? data.level
                    : data.options?.join(', ')}
              </p>
              <p className="text-xs text-steel-dim">{data.notes}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-surface-800 border border-surface-700 p-4">
            <span className="text-sm font-medium text-steel block mb-2">Inputs</span>
            <ul className="text-sm text-steel-dim space-y-1">
              {feasibility.inputs.items.map((item, i) => (
                <li key={i}>• {item}</li>
              ))}
            </ul>
          </div>
          <div className="bg-surface-800 border border-surface-700 p-4">
            <span className="text-sm font-medium text-steel block mb-2">Outputs</span>
            <ul className="text-sm text-steel-dim space-y-1">
              {feasibility.outputs.items.map((item, i) => (
                <li key={i}>• {item}</li>
              ))}
            </ul>
          </div>
        </div>

        <button
          onClick={onContinue}
          className="w-full py-3 bg-copper-gradient text-ash font-semibold hover:opacity-90 transition-opacity"
        >
          {autoAdvance
            ? `Continuing in ${countdown}s... (click to proceed now)`
            : 'Continue to Refinement'}
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// Rejection Display
// =============================================================================

interface RejectionDisplayProps {
  reason: string
  suggestedRevisions?: SuggestedRevisions
  onAcceptRevision?: (revisedDescription: string) => void
}

function RejectionDisplay({ reason, suggestedRevisions, onAcceptRevision }: RejectionDisplayProps) {
  const navigate = useNavigate()

  const handleRequestFeature = () => {
    const subject = encodeURIComponent('Component Request - PHAESTUS')
    const body = encodeURIComponent(
      `Hi,\n\nI'd like to request support for a component that isn't currently available.\n\nRejection reason:\n${reason}\n\nThank you!`
    )
    window.open(`mailto:contact@phaestus.app?subject=${subject}&body=${body}`, '_blank')
  }

  return (
    <div className="space-y-4">
      <div className="bg-red-500/10 border border-red-500/30 p-6">
        <div className="flex items-center gap-2 text-red-400 mb-4">
          <AlertTriangle className="w-6 h-6" strokeWidth={1.5} />
          <span className="text-lg font-semibold">Project Cannot Be Built As Specified</span>
        </div>
        <p className="text-steel mb-4">{reason}</p>

        {suggestedRevisions && (
          <div className="bg-surface-800 border border-surface-600 p-4 mb-4">
            <h4 className="text-copper font-medium mb-2">{suggestedRevisions.summary}</h4>
            <ul className="text-steel-dim text-sm space-y-1 mb-4">
              {suggestedRevisions.changes.map((change, i) => (
                <li key={i}>• {change}</li>
              ))}
            </ul>
            <div className="bg-surface-900 border border-surface-700 p-3 mb-4">
              <span className="text-xs text-steel-dim font-mono block mb-1">
                REVISED SPECIFICATION
              </span>
              <p className="text-steel text-sm">{suggestedRevisions.revisedDescription}</p>
            </div>
            {onAcceptRevision && (
              <button
                onClick={() => onAcceptRevision(suggestedRevisions.revisedDescription)}
                className="w-full py-3 bg-copper-gradient text-ash font-semibold hover:opacity-90 transition-opacity"
              >
                Use Revised Specification
              </button>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => navigate('/new')}
            className="px-6 py-2 bg-surface-700 text-steel hover:bg-surface-600 transition-colors"
          >
            Start New Project
          </button>
          <button
            onClick={handleRequestFeature}
            className="px-6 py-2 bg-copper/20 text-copper border border-copper/30 hover:bg-copper/30 transition-colors"
          >
            Request Component
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Refinement Step
// =============================================================================

interface RefinementStepProps {
  project: Project
  spec: ProjectSpec
  onDecisions: (decisions: Decision[]) => void
  onComplete: () => void
}

function RefinementStep({ project, spec, onDecisions, onComplete }: RefinementStepProps) {
  const [pendingQuestions, setPendingQuestions] = useState<OpenQuestion[]>(spec.openQuestions)
  const [isChecking, setIsChecking] = useState(false)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({})
  const [otherMode, setOtherMode] = useState<Record<string, boolean>>({})
  const [otherText, setOtherText] = useState<Record<string, string>>({})
  const [allDecisions, setAllDecisions] = useState<Decision[]>(spec.decisions || [])

  const MAX_REFINEMENT_ROUNDS = 5

  const checkForMoreQuestions = useCallback(
    async (currentDecisions: Decision[]) => {
      if (!spec.feasibility) return

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
        console.error('Failed to parse refinement response', err)
        onComplete()
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

// =============================================================================
// Blueprint Generation Step
// =============================================================================

interface BlueprintStepProps {
  project: Project
  spec: ProjectSpec
  onComplete: (blueprints: { url: string; prompt: string }[]) => void
}

const IMAGE_TIMEOUT_MS = 60000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

function BlueprintStep({ project: _project, spec, onComplete }: BlueprintStepProps) {
  const [generating, setGenerating] = useState<boolean[]>([true, true, true, true])
  const [blueprints, setBlueprints] = useState<({ url: string; prompt: string } | null)[]>([
    null,
    null,
    null,
    null,
  ])
  const [errors, setErrors] = useState<string[]>([])
  const [hasStarted, setHasStarted] = useState(false)
  const [hasCompleted, setHasCompleted] = useState(false)

  useEffect(() => {
    if (hasStarted) return

    setHasStarted(true)

    const prompts = buildBlueprintPrompts(
      spec.description,
      spec.decisions || [],
      spec.feasibility || {}
    )

    prompts.forEach((prompt, index) => {
      withTimeout(generateImage(prompt), IMAGE_TIMEOUT_MS, 'Image generation timed out after 60s')
        .then((url) => {
          setBlueprints((prev) => {
            const updated = [...prev]
            updated[index] = { url, prompt }
            return updated
          })
          setGenerating((prev) => {
            const updated = [...prev]
            updated[index] = false
            return updated
          })
        })
        .catch((err) => {
          setErrors((prev) => [...prev, `Image ${index + 1}: ${err.message}`])
          setGenerating((prev) => {
            const updated = [...prev]
            updated[index] = false
            return updated
          })
        })
    })
  }, [hasStarted, spec.description, spec.decisions, spec.feasibility])

  useEffect(() => {
    if (hasCompleted) return

    const allDone = generating.every((g) => !g)
    const validBlueprints = blueprints.filter(
      (b): b is { url: string; prompt: string } => b !== null
    )

    if (allDone && validBlueprints.length > 0) {
      setHasCompleted(true)
      onComplete(validBlueprints)
    }
  }, [generating, blueprints, onComplete, hasCompleted])

  const activeCount = generating.filter(Boolean).length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-copper mb-4">
        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
        <span className="text-sm font-mono">GENERATING BLUEPRINTS... ({4 - activeCount}/4)</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="aspect-square bg-surface-800 border border-surface-700 flex items-center justify-center"
          >
            {generating[index] ? (
              <Loader2 className="w-8 h-8 text-copper animate-spin" strokeWidth={1.5} />
            ) : blueprints[index] ? (
              <img
                src={blueprints[index].url}
                alt={`Blueprint ${index + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <XCircle className="w-8 h-8 text-red-400" strokeWidth={1.5} />
            )}
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <div className="text-red-400 text-sm">
          {errors.map((err, i) => (
            <p key={i}>{err}</p>
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Blueprint Selection Step
// =============================================================================

interface SelectionStepProps {
  blueprints: { url: string; prompt: string }[]
  onSelect: (index: number) => void
  onRegenerate: (index: number, feedback: string) => Promise<void>
}

function SelectionStep({ blueprints, onSelect, onRegenerate }: SelectionStepProps) {
  const [selected, setSelected] = useState<number | null>(null)
  const [feedback, setFeedback] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)

  const handleRegenerate = async () => {
    if (selected === null || !feedback.trim()) return

    setIsRegenerating(true)
    try {
      await onRegenerate(selected, feedback.trim())
      setFeedback('')
      setSelected(null)
    } finally {
      setIsRegenerating(false)
    }
  }

  if (selected !== null) {
    const bp = blueprints[selected]

    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelected(null)}
          className="text-steel-dim hover:text-steel text-sm flex items-center gap-1"
        >
          ← Back to all designs
        </button>

        <div className="bg-surface-900 border border-surface-700 p-4">
          <img
            src={bp.url}
            alt={`Design ${selected + 1}`}
            className="w-full max-h-96 object-contain mb-4"
          />

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-steel-dim mb-2 tracking-wide">
                WANT TO CHANGE ANYTHING?
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="e.g., Make it more rounded, add a visible antenna, change to blue color..."
                className="w-full px-4 py-3 bg-surface-800 border border-surface-600 text-steel placeholder-steel-dim text-sm focus:outline-none focus:border-copper resize-none"
                rows={3}
                disabled={isRegenerating}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRegenerate}
                disabled={!feedback.trim() || isRegenerating}
                className={clsx(
                  'flex-1 py-3 font-medium transition-all flex items-center justify-center gap-2',
                  feedback.trim() && !isRegenerating
                    ? 'bg-surface-700 text-steel hover:bg-surface-600'
                    : 'bg-surface-800 text-steel-dim cursor-not-allowed'
                )}
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                    Regenerating...
                  </>
                ) : (
                  'Regenerate with Changes'
                )}
              </button>

              <button
                onClick={() => onSelect(selected)}
                disabled={isRegenerating}
                className="flex-1 py-3 bg-copper-gradient text-ash font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                I'm Happy - Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-steel mb-4">Click a design to review or customize it:</p>

      <div className="grid grid-cols-2 gap-4">
        {blueprints.map((bp, index) => (
          <button
            key={index}
            onClick={() => setSelected(index)}
            className="aspect-square border-2 border-surface-600 hover:border-copper/50 transition-all overflow-hidden"
          >
            <img src={bp.url} alt={`Design ${index + 1}`} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// Finalization Step
// =============================================================================

interface FinalizationStepProps {
  project: Project
  spec: ProjectSpec
  onComplete: (finalSpec: FinalSpec) => void
}

function FinalizationStep({ project, spec, onComplete }: FinalizationStepProps) {
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
        console.error('Failed to generate final spec', err)
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

// =============================================================================
// Main SpecStageView Component
// =============================================================================

export function SpecStageView() {
  const { project, isLoading } = useWorkspaceContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [suggestedRevisions, setSuggestedRevisions] = useState<SuggestedRevisions | undefined>()

  // Get control mode from user settings
  const controlMode = user?.controlMode || 'fix_it'

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Project>) => updateProject(project!.id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', project?.id] })
    },
  })

  // Determine current step based on project state
  const spec = project?.spec as ProjectSpec | null
  let currentStep = 0
  if (spec?.feasibility && project?.status !== 'rejected') currentStep = 1
  if (
    project?.status === 'generating' ||
    project?.status === 'selecting' ||
    ((spec?.decisions?.length ?? 0) > 0 && (spec?.openQuestions?.length ?? 0) === 0)
  )
    currentStep = 2
  if ((spec?.blueprints?.length ?? 0) > 0) currentStep = 3
  if (spec?.selectedBlueprint !== null && spec?.selectedBlueprint !== undefined) currentStep = 4
  if (spec?.finalSpec?.locked) currentStep = 5

  // Handlers
  const handleFeasibilityComplete = (
    feasibility: FeasibilityAnalysis,
    questions: OpenQuestion[]
  ) => {
    updateMutation.mutate({
      spec: { ...spec!, feasibility, openQuestions: questions },
    })
  }

  const handleStartRefinement = () => {
    updateMutation.mutate({ status: 'refining' })
  }

  const handleReject = (reason: string, revisions?: SuggestedRevisions) => {
    setSuggestedRevisions(revisions)
    updateMutation.mutate({
      status: 'rejected',
      spec: {
        ...spec!,
        feasibility: {
          ...spec!.feasibility!,
          rejectionReason: reason,
          manufacturable: false,
        } as FeasibilityAnalysis,
      },
    })
  }

  const handleAcceptRevision = (revisedDescription: string) => {
    setSuggestedRevisions(undefined)
    updateMutation.mutate({
      status: 'analyzing',
      spec: {
        description: revisedDescription,
        feasibility: null,
        openQuestions: [],
        decisions: [],
        blueprints: [],
        selectedBlueprint: null,
        finalSpec: null,
      },
    })
  }

  const handleDecisions = (decisions: Decision[]) => {
    const answeredIds = new Set(decisions.map((d) => d.questionId))
    const newQuestions = (spec?.openQuestions || []).filter((q) => !answeredIds.has(q.id))

    updateMutation.mutate({
      spec: { ...spec!, decisions, openQuestions: newQuestions },
    })
  }

  const handleRefinementComplete = useCallback(() => {
    updateMutation.mutate({ status: 'generating' })
  }, [updateMutation])

  // Handler for orchestrator spec updates
  const handleOrchestratorSpecUpdate = useCallback(
    async (specUpdate: Partial<ProjectSpec>) => {
      await updateMutation.mutateAsync({
        spec: { ...spec!, ...specUpdate },
      })
    },
    [spec, updateMutation]
  )

  const handleBlueprintsComplete = (blueprints: { url: string; prompt: string }[]) => {
    updateMutation.mutate({
      status: 'selecting',
      spec: { ...spec!, blueprints },
    })
  }

  const handleBlueprintSelect = (index: number) => {
    updateMutation.mutate({
      status: 'finalizing',
      spec: { ...spec!, selectedBlueprint: index },
    })
  }

  const handleBlueprintRegenerate = async (index: number, feedback: string) => {
    const originalPrompt = spec!.blueprints[index].prompt
    const newPrompt = `${originalPrompt} User feedback: ${feedback}`

    const newUrl = await generateImage(newPrompt)

    const updatedBlueprints = [...spec!.blueprints, { url: newUrl, prompt: newPrompt }]

    updateMutation.mutate({
      spec: { ...spec!, blueprints: updatedBlueprints },
    })
  }

  const handleFinalizeComplete = (finalSpec: FinalSpec) => {
    // Update spec stage status to complete
    const defaultStage = { status: 'pending' as const }
    const updatedStages = {
      spec: { status: 'complete' as const, completedAt: new Date().toISOString() },
      pcb: spec?.stages?.pcb || defaultStage,
      enclosure: spec?.stages?.enclosure || defaultStage,
      firmware: spec?.stages?.firmware || defaultStage,
      export: spec?.stages?.export || defaultStage,
    }

    updateMutation.mutate({
      status: 'complete',
      name: finalSpec.name || project?.name || 'New Project',
      spec: { ...spec!, finalSpec, stages: updatedStages },
    })

    // Navigate to PCB stage since spec is complete
    navigate(`/project/${project?.id}/pcb`)
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-copper animate-spin" strokeWidth={1.5} />
      </div>
    )
  }

  if (!project || !spec) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-red-400">Failed to load project</div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="h-14 flex items-center justify-between px-8 border-b border-surface-700">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold text-steel tracking-tight">SPECIFICATION</h1>
          <span className="font-mono text-xs text-steel-dim">
            {project.name || project.id.slice(0, 8)}
          </span>
        </div>
        {spec.finalSpec?.locked && (
          <div className="flex items-center gap-1 text-emerald-400 text-sm">
            <Lock className="w-4 h-4" strokeWidth={1.5} />
            Locked
          </div>
        )}
      </header>

      <div className="flex-1 p-8 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <StepIndicator currentStep={currentStep} status={project.status} />

          {/* Orchestrator Trigger - Show in Vibe It / Fix It mode */}
          {currentStep === 0 && project.status !== 'rejected' && (
            <div className="mb-6">
              <OrchestratorTrigger project={project} onSpecUpdate={handleOrchestratorSpecUpdate} />
            </div>
          )}

          {/* Step 0: Feasibility */}
          {currentStep === 0 && project.status !== 'rejected' && (
            <FeasibilityStep
              project={project}
              spec={spec}
              onComplete={handleFeasibilityComplete}
              onReject={handleReject}
            />
          )}

          {/* Rejection */}
          {project.status === 'rejected' && (
            <RejectionDisplay
              reason={spec.feasibility?.rejectionReason || 'Project rejected'}
              suggestedRevisions={suggestedRevisions}
              onAcceptRevision={handleAcceptRevision}
            />
          )}

          {/* Show feasibility results before refinement */}
          {currentStep >= 1 &&
            spec.feasibility &&
            project.status === 'analyzing' &&
            currentStep < 2 && (
              <FeasibilityResults
                feasibility={spec.feasibility}
                onContinue={handleStartRefinement}
                autoAdvance={
                  // Vibe It: always auto-advance
                  controlMode === 'vibe_it' ||
                  // Fix It: auto-advance if score >= 80 (high confidence)
                  (controlMode === 'fix_it' && spec.feasibility.overallScore >= 80)
                  // Design It: never auto-advance (require explicit click)
                }
              />
            )}

          {/* Step 1: Refinement */}
          {currentStep === 1 && project.status !== 'analyzing' && (
            <RefinementStep
              project={project}
              spec={spec}
              onDecisions={handleDecisions}
              onComplete={handleRefinementComplete}
            />
          )}

          {/* Step 2: Blueprint Generation */}
          {currentStep === 2 && (
            <BlueprintStep project={project} spec={spec} onComplete={handleBlueprintsComplete} />
          )}

          {/* Step 3: Blueprint Selection */}
          {currentStep === 3 && (
            <SelectionStep
              blueprints={spec.blueprints}
              onSelect={handleBlueprintSelect}
              onRegenerate={handleBlueprintRegenerate}
            />
          )}

          {/* Step 4: Finalization */}
          {currentStep === 4 && (
            <FinalizationStep project={project} spec={spec} onComplete={handleFinalizeComplete} />
          )}

          {/* Step 5: Complete - Show summary */}
          {currentStep === 5 && spec.finalSpec && (
            <div className="bg-surface-900 border border-surface-700 p-6">
              <div className="flex items-center gap-2 text-emerald-400 mb-4">
                <CheckCircle2 className="w-5 h-5" strokeWidth={1.5} />
                <span className="font-semibold">Specification Complete</span>
              </div>
              <p className="text-steel-dim text-sm mb-4">
                Your hardware specification has been finalized. Continue to the PCB stage to design
                your circuit board.
              </p>
              <button
                onClick={() => navigate(`/project/${project.id}/pcb`)}
                className="px-6 py-2 bg-copper-gradient text-ash font-semibold hover:opacity-90 transition-opacity"
              >
                Continue to PCB Design
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
