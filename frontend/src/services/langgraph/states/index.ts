/**
 * LangGraph States
 *
 * Exports all state schemas for the subgraph architecture.
 * Each stage has its own state that extends the parent orchestrator state.
 */

// =============================================================================
// Orchestrator (Parent) State
// =============================================================================

export {
  OrchestratorStateSchema,
  StageSchema,
  StageStatusSchema,
  ProjectSummarySchema,
  DebugStepSchema,
  DebugInfoSchema,
  createDebugStep,
  createInitialDebugInfo,
  getNextStage,
  isStageComplete,
  updateStageStatus,
} from './orchestrator'

export type {
  OrchestratorState,
  OrchestratorStateUpdate,
  Stage,
  StageStatus,
  ProjectSummary,
  DebugStep,
  DebugInfo,
} from './orchestrator'

// =============================================================================
// Spec Stage State
// =============================================================================

export {
  SpecStateSchema,
  FeasibilityAnalysisSchema,
  OpenQuestionSchema,
  DecisionSchema,
  BlueprintSchema,
  FinalSpecSchema,
  SpecNodeSchema,
  SpecRouteSchema,
  createSpecDebugStep,
  didFeasibilityPass,
  isRefinementComplete,
  areBlueprintsReady,
  isBlueprintSelected,
  getSelectedBlueprint,
  decisionsToAnswerMap,
} from './spec'

export type {
  SpecState,
  SpecStateUpdate,
  FeasibilityAnalysis,
  OpenQuestion,
  Decision,
  Blueprint,
  FinalSpec,
  SpecNode,
  SpecRoute,
} from './spec'

// =============================================================================
// PCB Stage State
// =============================================================================

export {
  PCBStateSchema,
  BlockSummarySchema,
  PlacedBlockSchema,
  RemoteBoardSchema,
  ConnectionMappingSchema,
  ResistorTapStateSchema,
  DesignJustificationSchema,
  PCBNodeSchema,
  PCBRouteSchema,
  createPCBDebugStep,
  calculateBoardSize,
  isPositionOccupied,
  findI2CConflicts,
  isPCBDesignValid,
} from './pcb'

export type {
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
} from './pcb'

// =============================================================================
// Enclosure Stage State
// =============================================================================

export {
  EnclosureStateSchema,
  EnclosureIterationSchema,
  EnclosureDimensionsSchema,
  EnclosureFeatureSchema,
  EnclosureStyleSchema,
  EnclosureNodeSchema,
  EnclosureRouteSchema,
  createEnclosureDebugStep,
  calculateEnclosureDimensions,
  isOpenSCADValid,
  isReviewComplete as isEnclosureReviewComplete,
  addIteration,
  getLatestOpenSCAD,
} from './enclosure'

export type {
  EnclosureState,
  EnclosureStateUpdate,
  EnclosureIteration,
  EnclosureDimensions,
  EnclosureFeature,
  EnclosureStyle,
  EnclosureNode,
  EnclosureRoute,
} from './enclosure'

// =============================================================================
// Firmware Stage State
// =============================================================================

export {
  FirmwareStateSchema,
  FirmwareFileSchema,
  ComponentPinMappingSchema,
  I2CDeviceSchema,
  SPIDeviceSchema,
  FirmwareReviewIssueSchema,
  BuildStatusSchema,
  FirmwareNodeSchema,
  FirmwareRouteSchema,
  createFirmwareDebugStep,
  getFileByPath,
  upsertFile,
  hasCriticalIssues,
  getUsedI2CAddresses,
  findI2CAddressConflicts as findFirmwareI2CConflicts,
  isReviewComplete,
  generatePlatformioIni,
  isFirmwareValid,
} from './firmware'

export type {
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
} from './firmware'

// =============================================================================
// Export Stage State
// =============================================================================

export {
  ExportStateSchema,
  GerberLayerSchema,
  MergedGerberArtifactsSchema,
  PanelGerberArtifactsSchema,
  BOMEntrySchema,
  CentroidEntrySchema,
  ExportArtifactSchema,
  ExportNodeSchema,
  ExportRouteSchema,
  createExportDebugStep,
  calculateBOMCost,
  countUniqueParts,
  countTotalComponents,
  generateLCSCBOM,
  isExportComplete,
  getArtifactByType,
  upsertArtifact,
} from './export'

export type {
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
} from './export'
