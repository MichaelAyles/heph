/**
 * Select Name Node
 *
 * LangGraph node that handles project name selection.
 */

import { createHistoryItem, type OrchestratorState, type OrchestratorStateUpdate } from '../../state'

/**
 * Select a project name by index or provide a custom name.
 *
 * @param state - Current orchestrator state
 * @param index - Optional index of generated name to select (0-3)
 * @param customName - Optional custom name to use instead
 * @param reasoning - Optional reasoning for selection
 * @returns State update with selected name
 */
export function selectNameNode(
  state: OrchestratorState,
  index?: number,
  customName?: string,
  reasoning?: string
): OrchestratorStateUpdate {
  const { generatedNames, mode } = state

  // Custom name takes precedence
  if (customName) {
    return {
      selectedName: customName,
      history: [
        createHistoryItem(
          'tool_result',
          'spec',
          'select_name',
          `Selected custom name: ${customName}`,
          { customName, reasoning: reasoning || 'Custom name provided' }
        ),
      ],
    }
  }

  // Validate index
  if (generatedNames.length === 0) {
    return {
      error: 'No generated names available to select',
      history: [
        createHistoryItem('error', 'spec', 'select_name', 'No names available'),
      ],
    }
  }

  // Auto-select first name in VIBE_IT mode if no index provided
  const selectedIndex = index ?? (mode === 'vibe_it' ? 0 : 0)

  if (selectedIndex < 0 || selectedIndex >= generatedNames.length) {
    return {
      error: `Invalid name index: ${selectedIndex}`,
      history: [
        createHistoryItem('error', 'spec', 'select_name', `Invalid index: ${selectedIndex}`),
      ],
    }
  }

  const selectedName = generatedNames[selectedIndex].name
  const finalReasoning =
    reasoning ||
    generatedNames[selectedIndex].reasoning ||
    (mode === 'vibe_it' ? 'Auto-selected first name (VIBE IT mode)' : 'Selected name')

  return {
    selectedName,
    history: [
      createHistoryItem(
        'tool_result',
        'spec',
        'select_name',
        `Selected name: ${selectedName}`,
        { selectedIndex, selectedName, reasoning: finalReasoning }
      ),
    ],
  }
}

/**
 * Auto-select name in VIBE_IT mode
 */
export async function selectNameAutoNode(
  state: OrchestratorState
): Promise<OrchestratorStateUpdate> {
  return selectNameNode(state)
}

/**
 * Check if a name has been selected
 */
export function hasNameSelected(state: OrchestratorState): boolean {
  return state.selectedName !== null
}
