/**
 * Enclosure components for enclosure stage
 */

export { ComparisonModal } from './ComparisonModal'
export { EditorPanel } from './EditorPanel'
export { EnclosureComparison } from './EnclosureComparison'
export { EnclosureStepIndicator } from './EnclosureStepIndicator'
export { GenerateStep } from './GenerateStep'
export { NotReadyState } from './NotReadyState'
export { PreviewPanel } from './PreviewPanel'
export { STLViewer } from './STLViewer'

export type {
  EnclosureStep,
  EnclosureGenerationState,
  EditorPanelProps,
  PreviewPanelProps,
  GenerateStepProps,
  NotReadyStateProps,
  ValidationIssue,
  VisualValidationResult,
} from './types'

export { MAX_VALIDATION_ITERATIONS } from './types'
