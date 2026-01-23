/**
 * SpecStageView - Orchestrates the specification pipeline
 *
 * Steps:
 * 0. Feasibility - Analyze project with available components
 * 1. Refinement - Iterative Q&A to lock down decisions
 * 2. Blueprints - Generate 8 product renders in parallel
 * 3. Selection - User picks design, can regenerate with feedback
 * 4. Finalization - LLM generates locked spec with BOM
 * 5. Complete - Final spec displayed
 */

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Lock } from 'lucide-react'
import { useWorkspaceContext } from '../../components/workspace/WorkspaceLayout'
import { useAuthStore } from '../../stores/auth'
import {
  StepIndicator,
  FeasibilityStep,
  FeasibilityResults,
  RejectionDisplay,
  RefinementStep,
  BlueprintStep,
  SelectionStep,
  FinalizationStep,
  FinalSpecDisplay,
  generateImage,
  type SuggestedRevisions,
} from '../../components/spec-steps'
import type {
  Project,
  ProjectSpec,
  FeasibilityAnalysis,
  Decision,
  OpenQuestion,
  FinalSpec,
} from '../../db/schema'

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

// =============================================================================
// Main Component
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

  // =============================================================================
  // Handlers
  // =============================================================================

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

  // =============================================================================
  // Render
  // =============================================================================

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
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <header className="h-14 flex items-center justify-between px-8 border-b border-surface-700 flex-shrink-0">
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

          {/* Step 5: Complete - Show full spec for review */}
          {currentStep === 5 && spec.finalSpec && (
            <FinalSpecDisplay
              finalSpec={spec.finalSpec}
              blueprintUrl={
                spec.selectedBlueprint !== null && spec.selectedBlueprint !== undefined
                  ? spec.blueprints?.[spec.selectedBlueprint]?.url
                  : undefined
              }
              onContinue={() => navigate(`/project/${project.id}/pcb`)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
