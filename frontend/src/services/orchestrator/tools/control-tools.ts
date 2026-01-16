/**
 * Control Tools
 *
 * Tools for validation, fixes, stage completion, progress reporting, and user input.
 */

import {
  validateCrossStage,
  generateValidationReport,
} from '@/prompts/validation'
import type { OrchestratorContext, OrchestratorStage, ToolResult } from '../types'

// Import sibling tools for fix operations
import { generateEnclosure } from './enclosure-tools'
import { generateFirmware } from './firmware-tools'
import { selectPcbBlocks } from './pcb-tools'

/**
 * Accept artifact and trigger render/preview
 */
export async function acceptAndRender(
  ctx: OrchestratorContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const stage = args.stage as string

  if (stage === 'enclosure') {
    // Trigger STL render for user preview
    ctx.addHistoryItem({
      type: 'progress',
      stage: 'enclosure',
      action: 'Enclosure accepted - rendering STL preview for user',
    })

    // The actual render happens in the frontend via OpenSCAD WASM
    // We just signal that it's ready
    return {
      success: true,
      stage: 'enclosure',
      message: 'Enclosure accepted. STL render triggered for user preview.',
      nextStep: 'mark_stage_complete("enclosure")',
    }
  } else if (stage === 'firmware') {
    ctx.addHistoryItem({
      type: 'progress',
      stage: 'firmware',
      action: 'Firmware accepted - ready for user review',
    })

    return {
      success: true,
      stage: 'firmware',
      message: 'Firmware accepted. Code ready for user review.',
      nextStep: 'mark_stage_complete("firmware")',
    }
  }

  return { error: `Unknown stage for accept_and_render: ${stage}` }
}

/**
 * Validate cross-stage consistency
 */
export async function validateCrossStageConsistency(
  ctx: OrchestratorContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const checkType = args.check_type as string

  if (!ctx.currentSpec) {
    return { error: 'No spec to validate' }
  }

  ctx.updateState({ status: 'validating' })

  const result = validateCrossStage(
    ctx.currentSpec,
    checkType as 'pcb_fits_enclosure' | 'firmware_matches_pcb' | 'spec_satisfied' | 'all'
  )

  ctx.updateState({
    validationResult: result,
    status: result.valid ? 'running' : 'fixing',
  })

  ctx.addHistoryItem({
    type: 'validation',
    stage: ctx.getCurrentStage(),
    action: `Validation (${checkType})`,
    result: result.valid ? 'PASSED' : `FAILED: ${result.issues.length} issues`,
    details: { issueCount: result.issues.length, issues: result.issues.map((i) => i.message) },
  })

  return {
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
    report: generateValidationReport(result),
  }
}

/**
 * Fix a stage issue
 */
export async function fixStageIssue(
  ctx: OrchestratorContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const stage = args.stage as string
  const issue = args.issue as string
  const fix = args.fix as string

  ctx.addHistoryItem({
    type: 'fix',
    stage: stage as OrchestratorStage,
    action: `Fixing: ${issue}`,
    result: fix,
  })

  // Re-run the appropriate stage generation
  switch (stage) {
    case 'enclosure':
      return generateEnclosure(ctx, { style: 'rounded_box' })
    case 'firmware':
      return generateFirmware(ctx, { enable_wifi: true, enable_ble: false, enable_ota: true, enable_deep_sleep: false })
    case 'pcb':
      return selectPcbBlocks(ctx, { blocks: [], reasoning: fix })
    default:
      return { success: true, message: `Issue noted: ${fix}` }
  }
}

/**
 * Mark a stage as complete
 */
export async function markStageComplete(
  ctx: OrchestratorContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const stage = args.stage as string

  if (ctx.currentSpec?.stages) {
    const stageKey = stage as keyof typeof ctx.currentSpec.stages
    ctx.currentSpec.stages[stageKey] = {
      status: 'complete',
      completedAt: new Date().toISOString(),
    }

    // Advance to next stage
    const stageOrder: OrchestratorStage[] = ['spec', 'pcb', 'enclosure', 'firmware', 'export']
    const currentIndex = stageOrder.indexOf(stage as OrchestratorStage)
    if (currentIndex < stageOrder.length - 1) {
      const nextStage = stageOrder[currentIndex + 1]
      ctx.currentSpec.stages[nextStage] = { status: 'in_progress' }
      ctx.updateState({ currentStage: nextStage })
    }

    ctx.updateSpec(ctx.currentSpec)
    await ctx.setSpec({ stages: ctx.currentSpec.stages })
  }

  return { success: true, stage, status: 'complete' }
}

/**
 * Report progress to user
 */
export async function reportProgress(
  ctx: OrchestratorContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const message = args.message as string
  const stage = args.stage as string
  const percentage = args.percentage as number | undefined

  ctx.addHistoryItem({
    type: 'progress',
    stage: stage as OrchestratorStage,
    action: message,
    details: percentage !== undefined ? { percentage } : undefined,
  })

  ctx.updateState({
    currentStage: stage as OrchestratorStage,
    currentAction: message,
  })

  return { success: true }
}

/**
 * Request user input
 */
export async function requestUserInput(
  ctx: OrchestratorContext,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const question = args.question as string
  const options = args.options as string[] | undefined
  // context arg is unused but kept for API compatibility

  if (!ctx.callbacks.onUserInputRequired) {
    // In VIBE IT mode, pick first option
    if (ctx.mode === 'vibe_it' && options && options.length > 0) {
      return { answer: options[0], autoSelected: true }
    }
    return { error: 'User input not available in this mode' }
  }

  const answer = await ctx.callbacks.onUserInputRequired(question, options)
  return { answer, userProvided: true }
}
