/**
 * SpecPage - Main specification pipeline orchestrator
 *
 * This page orchestrates the 5-step specification pipeline:
 * 1. Feasibility Analysis
 * 2. Refinement (Q&A)
 * 3. Blueprint Generation
 * 4. Blueprint Selection
 * 5. Finalization
 *
 * Individual step components are in @/components/spec-steps/
 */

import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Lock } from 'lucide-react'
import {
  StepIndicator,
  FeasibilityStep,
  FeasibilityResults,
  RejectionDisplay,
  RefinementStep,
  BlueprintStep,
  SelectionStep,
  FinalizationStep,
  type SuggestedRevisions,
} from '@/components/spec-steps'
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
// Step Calculation
// =============================================================================

function calculateCurrentStep(spec: ProjectSpec | null, projectStatus: string): number {
  if (!spec) return 0

  let step = 0

  // Step 0 → 1: Feasibility complete and not rejected
  if (spec.feasibility && projectStatus !== 'rejected') {
    step = 1
  }

  // Step 1 → 2: Generating blueprints or have decisions with no open questions
  if (
    projectStatus === 'generating' ||
    projectStatus === 'selecting' ||
    ((spec.decisions?.length ?? 0) > 0 && (spec.openQuestions?.length ?? 0) === 0)
  ) {
    step = 2
  }

  // Step 2 → 3: Have blueprints
  if ((spec.blueprints?.length ?? 0) > 0) {
    step = 3
  }

  // Step 3 → 4: Blueprint selected
  if (spec.selectedBlueprint !== null && spec.selectedBlueprint !== undefined) {
    step = 4
  }

  // Step 4 → 5: Final spec locked
  if (spec.finalSpec?.locked) {
    step = 5
  }

  return step
}

// =============================================================================
// Main Component
// =============================================================================

export function SpecPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [suggestedRevisions, setSuggestedRevisions] = useState<SuggestedRevisions | undefined>()

  // Fetch project data
  const {
    data: project,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id!),
    enabled: !!id,
  })

  // Mutation for updating project
  const updateMutation = useMutation({
    mutationFn: (updates: Partial<Project>) => updateProject(id!, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', id] })
    },
  })

  // Calculate current step
  const spec = project?.spec as ProjectSpec | null
  const currentStep = calculateCurrentStep(spec, project?.status ?? 'draft')

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  const handleFeasibilityComplete = (
    feasibility: FeasibilityAnalysis,
    questions: OpenQuestion[]
  ) => {
    if (!spec) return
    updateMutation.mutate({
      spec: { ...spec, feasibility, openQuestions: questions },
    })
  }

  const handleStartRefinement = () => {
    updateMutation.mutate({ status: 'refining' })
  }

  const handleReject = (reason: string, revisions?: SuggestedRevisions) => {
    if (!spec) return
    setSuggestedRevisions(revisions)
    updateMutation.mutate({
      status: 'rejected',
      spec: {
        ...spec,
        feasibility: {
          ...(spec.feasibility ?? {}),
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
    if (!spec) return
    const answeredIds = new Set(decisions.map((d) => d.questionId))
    const newQuestions = (spec.openQuestions || []).filter((q) => !answeredIds.has(q.id))

    updateMutation.mutate({
      spec: { ...spec, decisions, openQuestions: newQuestions },
    })
  }

  const handleRefinementComplete = useCallback(() => {
    updateMutation.mutate({ status: 'generating' })
  }, [updateMutation])

  const handleBlueprintsComplete = (blueprints: { url: string; prompt: string }[]) => {
    if (!spec) return
    updateMutation.mutate({
      status: 'selecting',
      spec: { ...spec, blueprints },
    })
  }

  const handleBlueprintSelect = (index: number) => {
    if (!spec) return
    updateMutation.mutate({
      status: 'finalizing',
      spec: { ...spec, selectedBlueprint: index },
    })
  }

  const handleBlueprintRegenerate = async (index: number, feedback: string) => {
    if (!spec) return
    const originalPrompt = spec.blueprints[index].prompt
    const newPrompt = `${originalPrompt} User feedback: ${feedback}`

    const newUrl = await generateImage(newPrompt)

    // Add regenerated image as a new entry, keep original
    const updatedBlueprints = [...spec.blueprints, { url: newUrl, prompt: newPrompt }]

    updateMutation.mutate({
      spec: { ...spec, blueprints: updatedBlueprints },
    })
  }

  const handleFinalizeComplete = (finalSpec: FinalSpec) => {
    if (!spec) return
    updateMutation.mutate({
      status: 'complete',
      name: finalSpec.name || project?.name || 'New Project',
      spec: { ...spec, finalSpec },
    })
    navigate(`/project/${id}/view`)
  }

  // ==========================================================================
  // Loading / Error States
  // ==========================================================================

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

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-8 border-b border-surface-700 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-base font-semibold text-steel tracking-tight">SPECIFICATION</h1>
          <span className="font-mono text-xs text-steel-dim">
            {project.name || id?.slice(0, 8)}
          </span>
        </div>
        {spec.finalSpec?.locked && (
          <div className="flex items-center gap-1 text-emerald-400 text-sm">
            <Lock className="w-4 h-4" strokeWidth={1.5} />
            Locked
          </div>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 min-h-0 p-8 overflow-auto">
        <div className="max-w-4xl mx-auto">
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
              blueprints={spec.blueprints.filter(
                (bp): bp is { url: string; prompt: string } => bp !== null
              )}
              onSelect={handleBlueprintSelect}
              onRegenerate={handleBlueprintRegenerate}
            />
          )}

          {/* Step 4: Finalization */}
          {currentStep === 4 && (
            <FinalizationStep project={project} spec={spec} onComplete={handleFinalizeComplete} />
          )}
        </div>
      </div>
    </div>
  )
}
