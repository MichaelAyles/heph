/**
 * Mark Complete Node
 *
 * LangGraph node that marks a stage as complete and advances to the next.
 */

import {
  createHistoryItem,
  type OrchestratorState,
  type OrchestratorStateUpdate,
  type OrchestratorStage,
  type StageState,
} from '../../state'

const STAGE_ORDER: OrchestratorStage[] = ['spec', 'pcb', 'enclosure', 'firmware', 'export']

/**
 * Mark a stage as complete and advance to the next stage.
 *
 * @param state - Current orchestrator state
 * @param stage - The stage to mark complete
 * @returns State update with stage completion
 */
export async function markCompleteNode(
  state: OrchestratorState,
  stage: OrchestratorStage
): Promise<OrchestratorStateUpdate> {
  const { stages, completedStages } = state

  // Create new stage state
  const completedStage: StageState = {
    status: 'complete',
    completedAt: new Date().toISOString(),
  }

  // Determine next stage
  const currentIndex = STAGE_ORDER.indexOf(stage)
  const nextStage = currentIndex < STAGE_ORDER.length - 1
    ? STAGE_ORDER[currentIndex + 1]
    : stage // Stay on export if it's the last stage

  // Update next stage to in_progress (if not export)
  const nextStageState: StageState = stage === 'export'
    ? { status: 'complete', completedAt: new Date().toISOString() }
    : { status: 'in_progress' }

  // Build new stages object
  const newStages: Record<OrchestratorStage, StageState> = {
    ...stages,
    [stage]: completedStage,
    [nextStage]: nextStageState,
  }

  // Add to completed stages set
  const newCompletedStages = new Set(completedStages)
  newCompletedStages.add(stage)

  return {
    stages: newStages,
    completedStages: newCompletedStages,
    currentStage: nextStage,
    history: [
      createHistoryItem(
        'tool_result',
        stage,
        'mark_complete',
        `Stage ${stage} complete, advancing to ${nextStage}`,
        { completedStage: stage, nextStage }
      ),
    ],
  }
}

/**
 * Mark spec stage complete
 */
export function markSpecComplete(state: OrchestratorState): Promise<OrchestratorStateUpdate> {
  return markCompleteNode(state, 'spec')
}

/**
 * Mark PCB stage complete
 */
export function markPcbComplete(state: OrchestratorState): Promise<OrchestratorStateUpdate> {
  return markCompleteNode(state, 'pcb')
}

/**
 * Mark enclosure stage complete
 */
export function markEnclosureComplete(state: OrchestratorState): Promise<OrchestratorStateUpdate> {
  return markCompleteNode(state, 'enclosure')
}

/**
 * Mark firmware stage complete
 */
export function markFirmwareComplete(state: OrchestratorState): Promise<OrchestratorStateUpdate> {
  return markCompleteNode(state, 'firmware')
}

/**
 * Mark export stage complete (final stage)
 */
export function markExportComplete(state: OrchestratorState): Promise<OrchestratorStateUpdate> {
  return markCompleteNode(state, 'export')
}

/**
 * Check if all stages are complete
 */
export function isComplete(state: OrchestratorState): boolean {
  return state.stages.export?.status === 'complete'
}

/**
 * Check if a specific stage is complete
 */
export function isStageComplete(state: OrchestratorState, stage: OrchestratorStage): boolean {
  return state.stages[stage]?.status === 'complete'
}
