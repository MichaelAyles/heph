/**
 * Answer Questions Node
 *
 * LangGraph node that auto-answers open questions in VIBE_IT mode
 * or prompts user for answers in other modes.
 */

import { createHistoryItem, type OrchestratorState, type OrchestratorStateUpdate } from '../../state'
import type { Decision } from '@/db/schema'

/**
 * Auto-answer open questions by selecting the first option for each.
 * This is the behavior in VIBE_IT mode where the AI makes all decisions.
 *
 * @param state - Current orchestrator state
 * @returns State update with decisions
 */
export async function answerQuestionsAutoNode(
  state: OrchestratorState
): Promise<OrchestratorStateUpdate> {
  const { openQuestions, mode } = state

  if (!openQuestions || openQuestions.length === 0) {
    return {
      history: [
        createHistoryItem('tool_result', 'spec', 'answer_questions', 'No questions to answer'),
      ],
    }
  }

  // In non-vibe_it modes, we might want to wait for user input
  // For now, we auto-answer in all modes (can be refined later)
  const decisions: Decision[] = openQuestions.map((q) => ({
    questionId: q.id,
    question: q.question,
    answer: q.options[0], // Pick first option
    timestamp: new Date().toISOString(),
  }))

  const reasoning =
    mode === 'vibe_it'
      ? 'Auto-selected first option for all questions (VIBE IT mode)'
      : 'Selected default options - user can override in refinement'

  return {
    decisions,
    openQuestions: [], // Clear answered questions
    history: [
      createHistoryItem(
        'tool_result',
        'spec',
        'answer_questions',
        `Answered ${decisions.length} questions`,
        {
          answeredCount: decisions.length,
          mode,
          reasoning,
        }
      ),
    ],
  }
}

/**
 * Answer specific questions by ID with provided answers.
 * Used when user provides custom answers.
 *
 * @param state - Current orchestrator state
 * @param questionAnswers - Map of question IDs to answers
 * @returns State update with decisions
 */
export function answerSpecificQuestions(
  state: OrchestratorState,
  questionAnswers: Record<string, string>
): OrchestratorStateUpdate {
  const { openQuestions } = state

  if (!openQuestions || openQuestions.length === 0) {
    return {
      history: [
        createHistoryItem('tool_result', 'spec', 'answer_questions', 'No questions to answer'),
      ],
    }
  }

  const decisions: Decision[] = []
  const remainingQuestions = []

  for (const q of openQuestions) {
    if (questionAnswers[q.id]) {
      decisions.push({
        questionId: q.id,
        question: q.question,
        answer: questionAnswers[q.id],
        timestamp: new Date().toISOString(),
      })
    } else {
      remainingQuestions.push(q)
    }
  }

  return {
    decisions,
    openQuestions: remainingQuestions,
    history: [
      createHistoryItem(
        'tool_result',
        'spec',
        'answer_questions',
        `Answered ${decisions.length} questions, ${remainingQuestions.length} remaining`,
        { answeredCount: decisions.length, remainingCount: remainingQuestions.length }
      ),
    ],
  }
}

/**
 * Check if all questions have been answered
 */
export function allQuestionsAnswered(state: OrchestratorState): boolean {
  return state.openQuestions.length === 0
}
