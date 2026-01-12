/**
 * Shared types for spec step components
 */

import type {
  Project,
  ProjectSpec,
  FeasibilityAnalysis,
  Decision,
  OpenQuestion,
  FinalSpec,
} from '@/db/schema'

export interface SuggestedRevisions {
  summary: string
  changes: string[]
  revisedDescription: string
}

export interface FeasibilityStepProps {
  project: Project
  spec: ProjectSpec
  onComplete: (feasibility: FeasibilityAnalysis, questions: OpenQuestion[]) => void
  onReject: (reason: string, suggestedRevisions?: SuggestedRevisions) => void
}

export interface FeasibilityResultsProps {
  feasibility: FeasibilityAnalysis
  onContinue: () => void
}

export interface RejectionDisplayProps {
  reason: string
  suggestedRevisions?: SuggestedRevisions
  onAcceptRevision?: (revisedDescription: string) => void
}

export interface RefinementStepProps {
  project: Project
  spec: ProjectSpec
  onDecisions: (decisions: Decision[]) => void
  onComplete: () => void
}

export interface BlueprintStepProps {
  project: Project
  spec: ProjectSpec
  onComplete: (blueprints: { url: string; prompt: string }[]) => void
}

export interface SelectionStepProps {
  blueprints: { url: string; prompt: string }[]
  onSelect: (index: number) => void
  onRegenerate: (index: number, feedback: string) => Promise<void>
}

export interface FinalizationStepProps {
  project: Project
  spec: ProjectSpec
  onComplete: (finalSpec: FinalSpec) => void
}

export interface StepIndicatorProps {
  currentStep: number
  status: string
}

// Step definitions
export const STEPS = [
  { id: 'feasibility', name: 'Feasibility' },
  { id: 'refine', name: 'Refine' },
  { id: 'blueprints', name: 'Blueprints' },
  { id: 'select', name: 'Select' },
  { id: 'finalize', name: 'Finalize' },
] as const
