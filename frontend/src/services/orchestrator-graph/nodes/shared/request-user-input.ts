/**
 * Request User Input Node
 *
 * LangGraph node that pauses execution to request user input.
 * In VIBE_IT mode, auto-selects the first option.
 */

import {
  createHistoryItem,
  type OrchestratorState,
  type OrchestratorStateUpdate,
} from '../../state'

/**
 * Request for user input
 */
export interface UserInputRequest {
  question: string
  options?: string[]
  context: string
  stage: string
}

/**
 * Request user input for a decision.
 *
 * In VIBE_IT mode, auto-selects the first option if available.
 * Otherwise, pauses execution and waits for user response.
 *
 * @param state - Current orchestrator state
 * @param question - The question to ask
 * @param options - Optional list of options
 * @param context - Context for the question
 * @returns State update with request or auto-answer
 */
export async function requestUserInputNode(
  state: OrchestratorState,
  question: string,
  options?: string[],
  context?: string
): Promise<OrchestratorStateUpdate> {
  const { mode, currentStage } = state

  // In VIBE_IT mode, auto-select first option
  if (mode === 'vibe_it' && options && options.length > 0) {
    return {
      history: [
        createHistoryItem(
          'tool_result',
          currentStage,
          'request_user_input',
          `Auto-selected: ${options[0]} (VIBE IT mode)`,
          {
            question,
            answer: options[0],
            autoSelected: true,
          }
        ),
      ],
    }
  }

  // For other modes, this would pause and wait for input
  // The graph would need to be configured with interrupt_before or similar
  return {
    history: [
      createHistoryItem(
        'progress',
        currentStage,
        'request_user_input',
        `User input requested: ${question}`,
        {
          question,
          options,
          context: context || 'No additional context',
          waitingForInput: true,
        }
      ),
    ],
  }
}

/**
 * Process user's response to an input request.
 *
 * @param state - Current orchestrator state
 * @param answer - User's answer
 * @returns State update with processed answer
 */
export function processUserInput(
  state: OrchestratorState,
  answer: string
): OrchestratorStateUpdate {
  const { currentStage } = state

  return {
    history: [
      createHistoryItem(
        'tool_result',
        currentStage,
        'user_input_received',
        `User provided: ${answer}`,
        { answer, userProvided: true }
      ),
    ],
  }
}
