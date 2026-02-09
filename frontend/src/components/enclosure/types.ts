/**
 * Shared types for enclosure stage components
 */

import type { STLViewerRef } from './STLViewer'
import type { ValidationIssue } from '@/prompts/enclosure-validation'

export type EnclosureStep = 'generate' | 'edit' | 'preview'

export const MAX_VALIDATION_ITERATIONS = 3

// Re-export from prompts for convenience
export type { ValidationIssue } from '@/prompts/enclosure-validation'
export type { VisualValidationResult } from '@/prompts/enclosure-validation'

export interface EnclosureGenerationState {
  isGenerating: boolean
  validationStatus: string | null
  validationIteration: number
  validationIssues: ValidationIssue[]
  renderError: string | null
  wasmLoaded: boolean
}

export interface EditorPanelProps {
  openScadCode: string
  onCodeChange: (code: string) => void
  feedback: string
  onFeedbackChange: (feedback: string) => void
  isGenerating: boolean
  isRendering: boolean
  isValidating: boolean
  validationStatus: string | null
  validationIteration: number
  validationIssues: ValidationIssue[]
  debugMode: boolean
  onRender: () => void
  onFastRender: () => void
  onRegenerate: () => void
  onDownloadSource: () => void
  onRunValidation: () => void
}

export interface PreviewPanelProps {
  stlBlobUrl: string | null
  stlData: Uint8Array | null
  stlViewerRef: React.RefObject<STLViewerRef | null>
  isRendering: boolean
  renderError: string | null
  hasBlueprint: boolean
  isVisualValidating: boolean
  onDownload: () => void
  onPerformVisualValidation: () => void
}

export interface GenerateStepProps {
  pcbWidth: number
  pcbHeight: number
  wasmLoaded: boolean
  isGenerating: boolean
  validationStatus: string | null
  validationIteration: number
  validationIssues: ValidationIssue[]
  renderError: string | null
  onGenerate: () => void
}

export interface NotReadyStateProps {
  title?: string
  description?: string
}
