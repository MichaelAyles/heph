import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { llm } from '@/services/llm'
import { FEASIBILITY_SYSTEM_PROMPT, buildFeasibilityPrompt } from '@/prompts/feasibility'
import { REFINEMENT_SYSTEM_PROMPT, buildRefinementPrompt } from '@/prompts/refinement'
import { buildBlueprintPrompts } from '@/prompts/blueprint'
import { FINAL_SPEC_SYSTEM_PROMPT, buildFinalSpecPrompt } from '@/prompts/finalSpec'
import type { Project, ProjectSpec, FeasibilityAnalysis, Decision, OpenQuestion, FinalSpec } from '@/db/schema'

// =============================================================================
// API Functions
// =============================================================================

async function fetchProject(id: string): Promise<Project> {
  const response = await fetch(`/api/projects/${id}`)
  if (!response.ok) throw new Error('Failed to fetch project')
  const data = await response.json()
  return data.project
}

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

interface FeasibilityStepProps {
  project: Project
  spec: ProjectSpec
  onComplete: (feasibility: FeasibilityAnalysis, questions: OpenQuestion[]) => void
  onReject: (reason: string) => void
}

function FeasibilityStep({ project, spec, onComplete, onReject }: FeasibilityStepProps) {
  const [status, setStatus] = useState('Analyzing your project...')
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (spec.feasibility) return // Already done
    if (isRunning) return

    setIsRunning(true)

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
          onReject(result.rejectionReason || 'Project is not manufacturable')
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
  }, [project.id, spec, isRunning, onComplete, onReject])

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 p-6">
        <div className="flex items-center gap-2 text-red-400 mb-2">
          <XCircle className="w-5 h-5" strokeWidth={1.5} />
          <span className="font-semibold">Analysis Failed</span>
        </div>
        <p className="text-red-300 text-sm">{error}</p>
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
}

function FeasibilityResults({ feasibility, onContinue }: FeasibilityResultsProps) {
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
                feasibility.overallScore >= 60 && feasibility.overallScore < 80 && 'text-yellow-400',
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
                {'type' in data ? data.type : 'level' in data ? data.level : data.options?.join(', ')}
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
          Continue to Refinement
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
}

function RejectionDisplay({ reason }: RejectionDisplayProps) {
  const navigate = useNavigate()

  const handleRequestFeature = () => {
    const subject = encodeURIComponent('Component Request - PHAESTUS')
    const body = encodeURIComponent(`Hi,\n\nI'd like to request support for a component that isn't currently available.\n\nRejection reason:\n${reason}\n\nThank you!`)
    window.open(`mailto:contact@phaestus.app?subject=${subject}&body=${body}`, '_blank')
  }

  return (
    <div className="bg-red-500/10 border border-red-500/30 p-6">
      <div className="flex items-center gap-2 text-red-400 mb-4">
        <AlertTriangle className="w-6 h-6" strokeWidth={1.5} />
        <span className="text-lg font-semibold">Project Cannot Be Built</span>
      </div>
      <p className="text-steel mb-6">{reason}</p>
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
  // Track all decisions including ones just submitted (to avoid stale closure)
  const [allDecisions, setAllDecisions] = useState<Decision[]>(spec.decisions || [])

  // Check if we need more questions after answering
  const checkForMoreQuestions = useCallback(async (currentDecisions: Decision[]) => {
    if (!spec.feasibility) return

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
      onComplete() // Proceed anyway
    } finally {
      setIsChecking(false)
    }
  }, [project.id, spec.feasibility, spec.description, onComplete])

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
            <span className="text-steel-dim">• {allDecisions.length} decision{allDecisions.length !== 1 ? 's' : ''} made</span>
          )}
        </div>
        <div className="text-xs text-steel-dim">
          {remainingRounds > 1 ? `~${remainingRounds} rounds remaining` : remainingRounds === 1 ? 'Final round' : 'Almost done'}
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

function BlueprintStep({ project: _project, spec, onComplete }: BlueprintStepProps) {
  const [generating, setGenerating] = useState<boolean[]>([true, true, true, true])
  const [blueprints, setBlueprints] = useState<({ url: string; prompt: string } | null)[]>([null, null, null, null])
  const [errors, setErrors] = useState<string[]>([])
  const [hasStarted, setHasStarted] = useState(false)
  const [hasCompleted, setHasCompleted] = useState(false)

  useEffect(() => {
    if (hasStarted) return // Already started generation

    setHasStarted(true)

    const prompts = buildBlueprintPrompts(
      spec.description,
      spec.decisions || [],
      spec.feasibility || {}
    )

    // Generate all 4 images in parallel
    prompts.forEach((prompt, index) => {
      generateImage(prompt)
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

  // Check if all done
  useEffect(() => {
    if (hasCompleted) return

    const allDone = generating.every((g) => !g)
    const validBlueprints = blueprints.filter((b): b is { url: string; prompt: string } => b !== null)

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
        <span className="text-sm font-mono">
          GENERATING BLUEPRINTS... ({4 - activeCount}/4)
        </span>
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
      setSelected(null) // Reset to show new image in grid
    } finally {
      setIsRegenerating(false)
    }
  }

  // If a design is selected, show the detail view
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

  // Grid view of all designs
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

  useEffect(() => {
    if (isRunning || spec.finalSpec) return

    setIsRunning(true)

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
  }, [project.id, spec, isRunning, onComplete])

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 p-6">
        <div className="flex items-center gap-2 text-red-400 mb-2">
          <XCircle className="w-5 h-5" strokeWidth={1.5} />
          <span className="font-semibold">Generation Failed</span>
        </div>
        <p className="text-red-300 text-sm">{error}</p>
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
// Main SpecPage Component
// =============================================================================

export function SpecPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id!),
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Project>) => updateProject(id!, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] })
    },
  })

  // Determine current step based on project state
  const spec = project?.spec as ProjectSpec | null
  let currentStep = 0
  if (spec?.feasibility && project?.status !== 'rejected') currentStep = 1
  // Step 2 if we're generating OR if we have decisions and no open questions
  if (project?.status === 'generating' || project?.status === 'selecting' ||
      ((spec?.decisions?.length ?? 0) > 0 && (spec?.openQuestions?.length ?? 0) === 0)) currentStep = 2
  if ((spec?.blueprints?.length ?? 0) > 0) currentStep = 3
  if (spec?.selectedBlueprint !== null && spec?.selectedBlueprint !== undefined) currentStep = 4
  if (spec?.finalSpec?.locked) currentStep = 5

  // Handlers
  const handleFeasibilityComplete = (feasibility: FeasibilityAnalysis, questions: OpenQuestion[]) => {
    // Keep status as 'analyzing' - will change to 'refining' when user clicks Continue
    updateMutation.mutate({
      spec: { ...spec!, feasibility, openQuestions: questions },
    })
  }

  const handleStartRefinement = () => {
    updateMutation.mutate({ status: 'refining' })
  }

  const handleReject = (reason: string) => {
    updateMutation.mutate({
      status: 'rejected',
      spec: { ...spec!, feasibility: { ...spec!.feasibility!, rejectionReason: reason, manufacturable: false } as FeasibilityAnalysis },
    })
  }

  const handleDecisions = (decisions: Decision[]) => {
    // Get the question IDs that have been answered
    const answeredIds = new Set(decisions.map(d => d.questionId))
    const newQuestions = (spec?.openQuestions || []).filter((q) => !answeredIds.has(q.id))

    updateMutation.mutate({
      spec: { ...spec!, decisions, openQuestions: newQuestions },
    })
  }

  const handleRefinementComplete = useCallback(() => {
    updateMutation.mutate({ status: 'generating' })
  }, [updateMutation])

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

    // Update the blueprints array with the regenerated image
    const updatedBlueprints = [...spec!.blueprints]
    updatedBlueprints[index] = { url: newUrl, prompt: newPrompt }

    updateMutation.mutate({
      spec: { ...spec!, blueprints: updatedBlueprints },
    })
  }

  const handleFinalizeComplete = (finalSpec: FinalSpec) => {
    updateMutation.mutate({
      status: 'complete',
      name: finalSpec.name || project?.name || 'New Project',
      spec: { ...spec!, finalSpec },
    })
    navigate(`/project/${id}/view`)
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-copper animate-spin" strokeWidth={1.5} />
      </div>
    )
  }

  if (error || !project || !spec) {
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
          <span className="font-mono text-xs text-steel-dim">{project.name || id?.slice(0, 8)}</span>
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
            <RejectionDisplay reason={spec.feasibility?.rejectionReason || 'Project rejected'} />
          )}

          {/* Show feasibility results before refinement */}
          {currentStep >= 1 && spec.feasibility && project.status === 'analyzing' && currentStep < 2 && (
            <FeasibilityResults
              feasibility={spec.feasibility}
              onContinue={handleStartRefinement}
            />
          )}

          {/* Step 1: Refinement */}
          {currentStep === 1 && project.status === 'refining' && (
            <RefinementStep
              project={project}
              spec={spec}
              onDecisions={handleDecisions}
              onComplete={handleRefinementComplete}
            />
          )}

          {/* Step 2: Blueprint Generation */}
          {currentStep === 2 && project.status === 'generating' && (
            <BlueprintStep
              project={project}
              spec={spec}
              onComplete={handleBlueprintsComplete}
            />
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
            <FinalizationStep
              project={project}
              spec={spec}
              onComplete={handleFinalizeComplete}
            />
          )}
        </div>
      </div>
    </div>
  )
}
