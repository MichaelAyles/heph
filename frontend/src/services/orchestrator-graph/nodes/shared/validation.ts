/**
 * Validation Node
 *
 * LangGraph node that validates cross-stage consistency.
 */

import {
  createHistoryItem,
  stateToProjectSpec,
  type OrchestratorState,
  type OrchestratorStateUpdate,
} from '../../state'
import {
  validateCrossStage,
  type ValidationResult,
} from '@/prompts/validation'
import type { ProjectSpec } from '@/db/schema'

/**
 * Validation check types
 */
export type ValidationCheckType =
  | 'pcb_fits_enclosure'
  | 'firmware_matches_pcb'
  | 'spec_satisfied'
  | 'all'

/**
 * Run cross-stage validation.
 *
 * @param state - Current orchestrator state
 * @param checkType - Type of validation to run
 * @returns State update with validation results
 */
export async function validateCrossStageNode(
  state: OrchestratorState,
  checkType: ValidationCheckType = 'all'
): Promise<OrchestratorStateUpdate> {
  const { currentStage, description } = state

  // Convert state to ProjectSpec for validation, ensuring required fields
  const partialSpec = stateToProjectSpec(state)
  const spec: ProjectSpec = {
    description: description || '',
    feasibility: partialSpec.feasibility ?? null,
    openQuestions: partialSpec.openQuestions ?? [],
    decisions: partialSpec.decisions ?? [],
    blueprints: partialSpec.blueprints ?? [],
    selectedBlueprint: partialSpec.selectedBlueprint ?? null,
    finalSpec: partialSpec.finalSpec ?? null,
    stages: partialSpec.stages,
    pcb: partialSpec.pcb,
    enclosure: partialSpec.enclosure,
    firmware: partialSpec.firmware,
  }

  // Run validation
  const result = validateCrossStage(spec, checkType)

  return {
    history: [
      createHistoryItem(
        'validation',
        currentStage,
        `validate_${checkType}`,
        result.valid ? 'Validation passed' : `Validation failed: ${result.issues.length} issues`,
        {
          valid: result.valid,
          issueCount: result.issues.length,
          issues: result.issues.map((i) => ({
            severity: i.severity,
            stage: i.stage,
            message: i.message,
          })),
          suggestions: result.suggestions.map((s) => ({
            stage: s.stage,
            action: s.action,
            autoFixable: s.autoFixable,
          })),
        }
      ),
    ],
  }
}

/**
 * Quick validation that returns the result directly.
 * Useful for conditional routing.
 */
export function quickValidate(state: OrchestratorState, checkType: ValidationCheckType = 'all'): ValidationResult {
  const partialSpec = stateToProjectSpec(state)
  const spec: ProjectSpec = {
    description: state.description || '',
    feasibility: partialSpec.feasibility ?? null,
    openQuestions: partialSpec.openQuestions ?? [],
    decisions: partialSpec.decisions ?? [],
    blueprints: partialSpec.blueprints ?? [],
    selectedBlueprint: partialSpec.selectedBlueprint ?? null,
    finalSpec: partialSpec.finalSpec ?? null,
    stages: partialSpec.stages,
    pcb: partialSpec.pcb,
    enclosure: partialSpec.enclosure,
    firmware: partialSpec.firmware,
  }
  return validateCrossStage(spec, checkType)
}

/**
 * Check if PCB fits enclosure
 */
export function pcbFitsEnclosure(state: OrchestratorState): boolean {
  return quickValidate(state, 'pcb_fits_enclosure').valid
}

/**
 * Check if firmware matches PCB
 */
export function firmwareMatchesPcb(state: OrchestratorState): boolean {
  return quickValidate(state, 'firmware_matches_pcb').valid
}

/**
 * Check if spec requirements are satisfied
 */
export function specSatisfied(state: OrchestratorState): boolean {
  return quickValidate(state, 'spec_satisfied').valid
}

/**
 * Check if all validations pass
 */
export function allValidationsPass(state: OrchestratorState): boolean {
  return quickValidate(state, 'all').valid
}
