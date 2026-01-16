/**
 * Tool Registry
 *
 * Maps tool names to handler functions for the orchestrator.
 */

import type { ToolHandler, ToolRegistry } from '../types'

// Spec stage tools
import {
  analyzeFeasibility,
  answerQuestionsAuto,
  generateBlueprints,
  selectBlueprint,
  generateProjectNames,
  selectProjectName,
  finalizeSpec,
} from './spec-tools'

// PCB stage tools
import { selectPcbBlocks } from './pcb-tools'

// Enclosure stage tools
import { generateEnclosure, reviewEnclosure } from './enclosure-tools'

// Firmware stage tools
import { generateFirmware, reviewFirmware } from './firmware-tools'

// Control tools
import {
  acceptAndRender,
  validateCrossStageConsistency,
  fixStageIssue,
  markStageComplete,
  reportProgress,
  requestUserInput,
} from './control-tools'

/**
 * Complete registry of all available tools.
 */
export const toolRegistry: ToolRegistry = {
  // Spec stage
  analyze_feasibility: analyzeFeasibility,
  answer_questions_auto: answerQuestionsAuto,
  generate_blueprints: generateBlueprints,
  select_blueprint: selectBlueprint,
  generate_project_names: generateProjectNames,
  select_project_name: selectProjectName,
  finalize_spec: finalizeSpec,

  // PCB stage
  select_pcb_blocks: selectPcbBlocks,

  // Enclosure stage
  generate_enclosure: generateEnclosure,
  review_enclosure: reviewEnclosure,

  // Firmware stage
  generate_firmware: generateFirmware,
  review_firmware: reviewFirmware,

  // Control
  accept_and_render: acceptAndRender,
  validate_cross_stage: validateCrossStageConsistency,
  fix_stage_issue: fixStageIssue,
  mark_stage_complete: markStageComplete,
  report_progress: reportProgress,
  request_user_input: requestUserInput,
}

/**
 * Get a tool handler by name.
 * Returns undefined if the tool doesn't exist.
 */
export function getTool(name: string): ToolHandler | undefined {
  return toolRegistry[name]
}

/**
 * Check if a tool exists.
 */
export function hasTool(name: string): boolean {
  return name in toolRegistry
}

/**
 * Get all available tool names.
 */
export function getToolNames(): string[] {
  return Object.keys(toolRegistry)
}

// Re-export individual tool modules for direct imports
export * from './spec-tools'
export * from './pcb-tools'
export * from './enclosure-tools'
export * from './firmware-tools'
export * from './control-tools'
