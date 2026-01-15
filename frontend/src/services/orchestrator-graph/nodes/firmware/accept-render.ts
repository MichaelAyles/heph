/**
 * Accept Firmware Node
 *
 * LangGraph node that accepts the firmware and signals completion.
 */

import {
  createHistoryItem,
  type OrchestratorState,
  type OrchestratorStateUpdate,
} from '../../state'

/**
 * Accept the firmware and signal for user review.
 *
 * The actual build happens in the frontend or CI.
 * This node just signals that the code is ready for review.
 *
 * @param state - Current orchestrator state
 * @returns State update signaling acceptance
 */
export async function acceptFirmwareNode(
  state: OrchestratorState
): Promise<OrchestratorStateUpdate> {
  const { firmware, firmwareReview } = state

  if (!firmware?.files || firmware.files.length === 0) {
    return {
      error: 'No firmware to accept',
      history: [
        createHistoryItem('error', 'firmware', 'accept_firmware', 'No firmware available'),
      ],
    }
  }

  return {
    history: [
      createHistoryItem(
        'tool_result',
        'firmware',
        'accept_firmware',
        `Firmware accepted with score ${firmwareReview?.score || 'N/A'}`,
        {
          accepted: true,
          score: firmwareReview?.score,
          fileCount: firmware.files.length,
          message: 'Code ready for user review',
        }
      ),
    ],
  }
}

/**
 * Check if firmware has been accepted
 */
export function isFirmwareAccepted(state: OrchestratorState): boolean {
  // Firmware is accepted if it exists and review passed (or no review needed)
  const { firmware, firmwareReview } = state
  if (!firmware?.files || firmware.files.length === 0) return false

  // If there's a review, check if it passed
  if (firmwareReview) {
    return firmwareReview.score >= 85 || firmwareReview.verdict === 'accept'
  }

  // No review means it was accepted without one
  return true
}
