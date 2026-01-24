/**
 * LangGraph Module
 *
 * PHAESTUS hardware design assistant powered by LangGraph.
 *
 * Architecture:
 * - Orchestrator graph coordinates 5 stage subgraphs
 * - Each stage has isolated state with shared parent fields
 * - D1-backed checkpointing for pause/resume capability
 *
 * Usage:
 * ```typescript
 * import { runOrchestratorGraph } from '@/services/langgraph'
 *
 * const result = await runOrchestratorGraph('I want to build a plant monitor', {
 *   threadId: 'session-123',
 * })
 *
 * console.log(result.response)      // Assistant's response
 * console.log(result.currentStage)  // 'spec' | 'pcb' | 'enclosure' | 'firmware' | 'export'
 * console.log(result.complete)      // true when all stages done
 * ```
 */

// =============================================================================
// New Subgraph Architecture
// =============================================================================

// Orchestrator Graph (main entry point)
export {
  runOrchestratorGraph,
  buildOrchestratorGraph,
  compiledOrchestratorGraph,
  ALL_NODES,
} from './graphs'

export type { OrchestratorConfig, OrchestratorResult } from './graphs'

// Stage Subgraphs
export {
  createSpecGraph,
  compileSpecGraph,
  SPEC_NODES,
  createPCBGraph,
  compilePCBGraph,
  PCB_NODES,
  createEnclosureGraph,
  compileEnclosureGraph,
  ENCLOSURE_NODES,
  createFirmwareGraph,
  compileFirmwareGraph,
  FIRMWARE_NODES,
  createExportGraph,
  compileExportGraph,
  EXPORT_NODES,
} from './graphs'

export type {
  SpecNodeName,
  PCBNodeName,
  EnclosureNodeName,
  FirmwareNodeName,
  ExportNodeName,
} from './graphs'

// =============================================================================
// State Schemas
// =============================================================================

// Parent State
export {
  OrchestratorStateSchema,
  StageSchema,
  StageStatusSchema,
  createDebugStep,
  createInitialDebugInfo,
  getNextStage,
  isStageComplete,
  updateStageStatus,
} from './states'

export type {
  OrchestratorState,
  OrchestratorStateUpdate,
  Stage,
  StageStatus,
  DebugStep,
  DebugInfo,
} from './states'

// Stage-Specific States
export {
  // Spec
  SpecStateSchema,
  FeasibilityAnalysisSchema,
  createSpecDebugStep,
  didFeasibilityPass,
  isRefinementComplete,
  areBlueprintsReady,
  isBlueprintSelected,
  getSelectedBlueprint,
  decisionsToAnswerMap,
  // PCB
  PCBStateSchema,
  BlockSummarySchema,
  PlacedBlockSchema,
  createPCBDebugStep,
  calculateBoardSize,
  isPositionOccupied,
  findI2CConflicts,
  isPCBDesignValid,
  // Enclosure
  EnclosureStateSchema,
  createEnclosureDebugStep,
  calculateEnclosureDimensions,
  isOpenSCADValid,
  isEnclosureReviewComplete,
  addIteration,
  getLatestOpenSCAD,
  // Firmware
  FirmwareStateSchema,
  createFirmwareDebugStep,
  getFileByPath,
  upsertFile,
  hasCriticalIssues,
  isReviewComplete as isFirmwareReviewComplete,
  generatePlatformioIni,
  isFirmwareValid,
  // Export
  ExportStateSchema,
  createExportDebugStep,
  calculateBOMCost,
  countUniqueParts,
  countTotalComponents,
  generateLCSCBOM,
  isExportComplete,
  getArtifactByType,
  upsertArtifact,
} from './states'

export type {
  // Spec
  SpecState,
  SpecStateUpdate,
  FeasibilityAnalysis,
  OpenQuestion,
  Decision,
  Blueprint,
  FinalSpec,
  SpecNode,
  SpecRoute,
  // PCB
  PCBState,
  PCBStateUpdate,
  BlockSummary,
  PlacedBlock,
  RemoteBoard,
  ConnectionMapping,
  ResistorTapState,
  DesignJustification,
  PCBNode,
  PCBRoute,
  // Enclosure
  EnclosureState,
  EnclosureStateUpdate,
  EnclosureIteration,
  EnclosureDimensions,
  EnclosureFeature,
  EnclosureStyle,
  EnclosureNode,
  EnclosureRoute,
  // Firmware
  FirmwareState,
  FirmwareStateUpdate,
  FirmwareFile,
  ComponentPinMapping,
  I2CDevice,
  SPIDevice,
  FirmwareReviewIssue,
  BuildStatus,
  FirmwareNode,
  FirmwareRoute,
  // Export
  ExportState,
  ExportStateUpdate,
  GerberLayer,
  MergedGerberArtifacts,
  PanelGerberArtifacts,
  BOMEntry,
  CentroidEntry,
  ExportArtifact,
  ExportNode,
  ExportRoute,
} from './states'

// =============================================================================
// Checkpointer
// =============================================================================

export { D1Checkpointer, createD1Checkpointer } from './checkpointer'
export type { D1CheckpointerConfig, CheckpointKey } from './checkpointer'

// =============================================================================
// Execution Tracer
// =============================================================================

export {
  // Schemas
  ExecutionEventSchema,
  GraphStartEventSchema,
  NodeEnterEventSchema,
  NodeExitEventSchema,
  EdgeTakenEventSchema,
  GraphEndEventSchema,
  ErrorEventSchema,
  SubgraphEnterEventSchema,
  SubgraphExitEventSchema,
  // Factory functions
  createGraphStartEvent,
  createNodeEnterEvent,
  createNodeExitEvent,
  createEdgeTakenEvent,
  createGraphEndEvent,
  createErrorEvent,
  createSubgraphEnterEvent,
  createSubgraphExitEvent,
  // Timeline helpers
  eventsToTimeline,
  getNodeStatesAtStep,
  getActiveEdgesAtStep,
  getSubgraphStatesAtStep,
  getActiveSubgraphAtStep,
  // Stats helpers
  calculateNodeStats,
  calculateSubgraphStats,
  filterEventsBySubgraph,
} from './execution-tracer'

export type {
  ExecutionEvent,
  GraphStartEvent,
  NodeEnterEvent,
  NodeExitEvent,
  EdgeTakenEvent,
  GraphEndEvent,
  ErrorEvent,
  SubgraphEnterEvent,
  SubgraphExitEvent,
  ExecutionRun,
  NodeStatus,
  NodeState,
  EdgeState,
  SubgraphStatus,
  SubgraphState,
  TimelineStep,
} from './execution-tracer'

// =============================================================================
// Legacy Exports (for backward compatibility)
// =============================================================================

// Re-export the old graph runner for backward compatibility
// TODO: Remove in next major version
export { runGraph, buildGraph, compiledGraph } from './graph'
export type { GraphConfig, GraphResult } from './graph'

// Re-export legacy state schema
export {
  PhaestusStateSchema,
  getMessageContent,
  // Legacy schemas (now in states/)
  ProjectSummarySchema as LegacyProjectSummarySchema,
  DebugStepSchema as LegacyDebugStepSchema,
  DebugInfoSchema as LegacyDebugInfoSchema,
} from './state'

export type {
  PhaestusState,
  PhaestusStateUpdate,
  // Legacy types
  ProjectSummary as LegacyProjectSummary,
  UserIntent,
} from './state'
