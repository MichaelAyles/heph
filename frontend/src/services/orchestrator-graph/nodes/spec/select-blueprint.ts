/**
 * Select Blueprint Node
 *
 * LangGraph node that handles blueprint selection.
 * In VIBE_IT mode, auto-selects the first blueprint.
 */

import { createHistoryItem, type OrchestratorState, type OrchestratorStateUpdate } from '../../state'

/**
 * Select a blueprint by index.
 *
 * @param state - Current orchestrator state
 * @param index - Blueprint index to select (0-3)
 * @param reasoning - Optional reasoning for selection
 * @returns State update with selected blueprint
 */
export function selectBlueprintNode(
  state: OrchestratorState,
  index?: number,
  reasoning?: string
): OrchestratorStateUpdate {
  const { blueprints, mode } = state

  if (!blueprints || blueprints.length === 0) {
    return {
      error: 'No blueprints available to select',
      history: [
        createHistoryItem('error', 'spec', 'select_blueprint', 'No blueprints available'),
      ],
    }
  }

  // Auto-select first blueprint in VIBE_IT mode if no index provided
  const selectedIndex = index ?? (mode === 'vibe_it' ? 0 : 0)

  if (selectedIndex < 0 || selectedIndex >= blueprints.length) {
    return {
      error: `Invalid blueprint index: ${selectedIndex}`,
      history: [
        createHistoryItem('error', 'spec', 'select_blueprint', `Invalid index: ${selectedIndex}`),
      ],
    }
  }

  const finalReasoning =
    reasoning ||
    (mode === 'vibe_it'
      ? 'Auto-selected first blueprint (VIBE IT mode)'
      : 'Selected blueprint')

  return {
    selectedBlueprint: selectedIndex,
    history: [
      createHistoryItem(
        'tool_result',
        'spec',
        'select_blueprint',
        `Selected blueprint ${selectedIndex + 1}`,
        { selectedIndex, reasoning: finalReasoning }
      ),
    ],
  }
}

/**
 * Auto-select blueprint in VIBE_IT mode
 */
export async function selectBlueprintAutoNode(
  state: OrchestratorState
): Promise<OrchestratorStateUpdate> {
  return selectBlueprintNode(state)
}

/**
 * Check if a blueprint has been selected
 */
export function hasBlueprintSelected(state: OrchestratorState): boolean {
  return state.selectedBlueprint !== null
}
