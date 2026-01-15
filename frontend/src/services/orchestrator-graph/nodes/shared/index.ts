/**
 * Shared Nodes
 *
 * Re-exports all shared nodes for the LangGraph orchestrator.
 */

export {
  markCompleteNode,
  markSpecComplete,
  markPcbComplete,
  markEnclosureComplete,
  markFirmwareComplete,
  markExportComplete,
  isComplete,
  isStageComplete,
} from './mark-complete'

export {
  requestUserInputNode,
  processUserInput,
  type UserInputRequest,
} from './request-user-input'

export {
  validateCrossStageNode,
  quickValidate,
  pcbFitsEnclosure,
  firmwareMatchesPcb,
  specSatisfied,
  allValidationsPass,
  type ValidationCheckType,
} from './validation'
