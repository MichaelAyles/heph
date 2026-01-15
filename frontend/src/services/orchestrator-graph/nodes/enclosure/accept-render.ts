/**
 * Accept and Render Enclosure Node
 *
 * LangGraph node that accepts the enclosure and signals
 * that STL rendering can proceed.
 */

import {
  createHistoryItem,
  type OrchestratorState,
  type OrchestratorStateUpdate,
} from '../../state'

/**
 * Accept the enclosure and signal for STL rendering.
 *
 * The actual STL render happens in the frontend via OpenSCAD WASM.
 * This node just signals that the design is ready for rendering.
 *
 * @param state - Current orchestrator state
 * @returns State update signaling acceptance
 */
export async function acceptEnclosureNode(
  state: OrchestratorState
): Promise<OrchestratorStateUpdate> {
  const { enclosure, enclosureReview } = state

  if (!enclosure?.openScadCode) {
    return {
      error: 'No enclosure to accept',
      history: [
        createHistoryItem('error', 'enclosure', 'accept_enclosure', 'No enclosure available'),
      ],
    }
  }

  return {
    history: [
      createHistoryItem(
        'tool_result',
        'enclosure',
        'accept_enclosure',
        `Enclosure accepted with score ${enclosureReview?.score || 'N/A'}`,
        {
          accepted: true,
          score: enclosureReview?.score,
          codeLength: enclosure.openScadCode.length,
          message: 'STL render triggered for user preview',
        }
      ),
    ],
  }
}

/**
 * Check if enclosure has been accepted
 */
export function isEnclosureAccepted(state: OrchestratorState): boolean {
  // Enclosure is accepted if it exists and review passed (or no review needed)
  const { enclosure, enclosureReview } = state
  if (!enclosure?.openScadCode) return false

  // If there's a review, check if it passed
  if (enclosureReview) {
    return enclosureReview.score >= 85 || enclosureReview.verdict === 'accept'
  }

  // No review means it was accepted without one
  return true
}
