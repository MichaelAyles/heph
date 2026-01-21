/**
 * Database Schema Types
 *
 * These types mirror the D1 SQLite schema.
 * snake_case in DB, camelCase in TypeScript.
 */

// =============================================================================
// USERS & AUTH
// =============================================================================

export interface User {
  id: string
  username: string
  displayName: string | null
  createdAt: string
  lastLoginAt: string | null
}

export interface Session {
  id: string
  userId: string
  expiresAt: string
  createdAt: string
}

// =============================================================================
// PROJECTS
// =============================================================================

export interface Project {
  id: string
  userId: string
  name: string
  description: string | null
  status: ProjectStatus
  spec: ProjectSpec | null
  createdAt: string
  updatedAt: string
}

export type ProjectStatus =
  | 'draft' // Just created
  | 'analyzing' // Running feasibility
  | 'rejected' // Failed feasibility
  | 'refining' // User answering questions
  | 'generating' // Creating blueprint images
  | 'selecting' // User picking blueprint
  | 'finalizing' // Generating final spec
  | 'complete' // Spec locked

// =============================================================================
// PROJECT SPEC - New Pipeline
// =============================================================================

export type StageStatus = 'pending' | 'in_progress' | 'complete' | 'error'

export interface StageState {
  status: StageStatus
  completedAt?: string
  error?: string
}

export interface ProjectStages {
  spec: StageState
  pcb: StageState
  enclosure: StageState
  firmware: StageState
  export: StageState
}

export interface ProjectSpec {
  // Original user input
  description: string

  // Step 1: Feasibility analysis
  feasibility: FeasibilityAnalysis | null

  // Step 2: User decisions
  openQuestions: OpenQuestion[]
  decisions: Decision[]

  // Step 3-4: Blueprints
  blueprints: Blueprint[]
  selectedBlueprint: number | null // index into blueprints array

  // Step 5: Final locked spec
  finalSpec: FinalSpec | null

  // Pipeline stage tracking
  stages?: ProjectStages

  // PCB artifacts
  pcb?: PCBArtifacts

  // Enclosure artifacts
  enclosure?: EnclosureArtifacts

  // Firmware artifacts
  firmware?: FirmwareArtifacts

  // Orchestrator state for resume capability
  orchestratorState?: PersistedOrchestratorState
}

// =============================================================================
// ORCHESTRATOR STATE (for resume capability)
// =============================================================================

export interface PersistedOrchestratorState {
  // Conversation history with the LLM
  conversationHistory: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>
  // Current iteration count
  iteration: number
  // Whether orchestration is paused or completed
  status: 'running' | 'paused' | 'completed' | 'error'
  // Current stage when paused
  currentStage: string
  // Last updated timestamp
  updatedAt: string
}

// =============================================================================
// PCB ARTIFACTS
// =============================================================================

export interface PCBArtifacts {
  // Selected blocks with grid positions
  placedBlocks: PlacedBlock[]
  // Inline KiCad schematic content (for local preview)
  schematicData?: string
  // Inline KiCad PCB content (for local preview)
  pcbData?: string
  // Merged schematic URL (R2)
  schematicUrl?: string
  // Merged PCB layout URL (R2)
  pcbLayoutUrl?: string
  // Board dimensions
  boardSize?: { width: number; height: number; unit: 'mm' }
  // Net list for firmware mapping
  netList?: NetAssignment[]
  // Timestamp of last merge
  mergedAt?: string
  // Remote boards (off-grid boards like button panels, displays)
  remoteBoards?: RemoteBoard[]
  // Panel configuration for manufacturing
  panelConfig?: PanelConfiguration
  // Design justifications for each block selection
  designJustifications?: DesignJustification[]
  // Resistor tap states (0R nofit decisions)
  resistorTapStates?: ResistorTapState[]
  // Merged gerber files (for manufacturing export)
  mergedGerbers?: MergedGerberArtifacts
  // Panelized gerber files (with v-score)
  panelGerbers?: PanelGerberArtifacts
  // Board outline info from content-based calculation
  boardOutline?: { width: number; height: number; marginMm: number }
}

// =============================================================================
// REMOTE BOARDS & PANELIZATION
// =============================================================================

export type RemoteBoardType = 'button' | 'display' | 'connector' | 'custom'

export interface RemoteBoard {
  id: string
  name: string // "Button Panel"
  slug: string // "button-panel"
  type: RemoteBoardType
  placedBlocks: PlacedBlock[] // Blocks on this remote board
  boardSize: { width: number; height: number; unit: 'mm' }
  connectionMapping: ConnectionMapping[]
  gridWidth: number
  gridHeight: number
}

export interface ConnectionMapping {
  remoteSignal: string // Signal on remote board
  mainSignal: string // Corresponding signal on main board
  connectorType: string // "JST-PH-4", "FFC-10"
}

export interface PanelConfiguration {
  mainBoardPosition: { x: number; y: number }
  remoteBoards: Array<{
    remoteBoardId: string
    position: { x: number; y: number }
    copies: number
  }>
  vScoreLines: VScoreLine[]
  routedEdges: RoutedEdge[]
  panelSize: { width: number; height: number }
  panelMargin: number // Default 5mm
}

export interface VScoreLine {
  orientation: 'horizontal' | 'vertical'
  position: number // mm from panel origin
  startMm: number
  endMm: number
}

export interface RoutedEdge {
  x1: number
  y1: number
  x2: number
  y2: number
}

// =============================================================================
// MERGED GERBER ARTIFACTS
// =============================================================================

export interface MergedGerberArtifacts {
  topCopper: string
  innerCopper1: string
  innerCopper2: string
  bottomCopper: string
  topSilk: string
  bottomSilk: string
  topMask: string
  bottomMask: string
  edgeCuts: string
  drill: string
}

export interface PanelGerberArtifacts extends MergedGerberArtifacts {
  vScore: string
  routedEdges: string // Gerber for milled edges (shorter boards' top edges)
}

// =============================================================================
// DESIGN DOCUMENT TYPES
// =============================================================================

export interface DesignJustification {
  blockSlug: string
  blockName: string
  reason: string
}

export interface ResistorTapState {
  blockSlug: string
  reference: string // "R3"
  signal: string // "I2C1_SDA"
  populated: boolean // false = no-fit
  reason: string
  isolates: { from: string; to: string }
}

export interface PlacedBlock {
  blockId: string
  blockSlug: string
  gridX: number
  gridY: number
  rotation: 0 | 90 | 180 | 270
}

export interface NetAssignment {
  net: string
  globalNet: string
  gpio?: string
}

// =============================================================================
// ENCLOSURE ARTIFACTS
// =============================================================================

export interface EnclosureArtifacts {
  // OpenSCAD source code
  openScadCode?: string
  // Generated STL URL (R2)
  stlUrl?: string
  // User feedback iterations
  iterations: EnclosureIteration[]
}

export interface EnclosureIteration {
  feedback: string
  openScadCode: string
  stlUrl?: string
  timestamp: string
}

// =============================================================================
// FIRMWARE ARTIFACTS
// =============================================================================

export interface FirmwareArtifacts {
  // Source files
  files: FirmwareFile[]
  // Compiled binary URL (R2)
  binaryUrl?: string
  // Build log
  buildLog?: string
  // Build status
  buildStatus?: 'pending' | 'building' | 'success' | 'failed'
}

export interface FirmwareFile {
  path: string
  content: string
  language: 'cpp' | 'c' | 'h' | 'json'
}

export interface FeasibilityAnalysis {
  communication: { type: string; confidence: number; notes: string }
  processing: { level: string; confidence: number; notes: string }
  power: { options: string[]; confidence: number; notes: string }
  inputs: { items: string[]; confidence: number }
  outputs: { items: string[]; confidence: number }
  overallScore: number // 0-100
  manufacturable: boolean
  rejectionReason?: string
}

export interface OpenQuestion {
  id: string
  question: string
  options: string[]
}

export interface Decision {
  questionId: string
  question: string
  answer: string
  timestamp: string
}

export interface Blueprint {
  url: string
  prompt: string
}

export interface FinalSpec {
  name: string
  summary: string
  pcbSize: { width: number; height: number; unit: 'mm' }
  inputs: { type: string; count: number; notes: string }[]
  outputs: { type: string; count: number; notes: string }[]
  power: { source: string; voltage: string; current: string; batteryLife?: string }
  communication: { type: string; protocol: string }
  enclosure: { style: string; width: number; height: number; depth: number }
  estimatedBOM: { item: string; quantity: number; unitCost: number }[]
  locked: boolean
  lockedAt: string
}

// =============================================================================
// LEGACY TYPES (kept for backwards compatibility during migration)
// =============================================================================

export interface LegacyRequirement {
  id: string
  text: string
  category: RequirementCategory
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'pending' | 'satisfied' | 'blocked'
}

export type RequirementCategory =
  | 'power'
  | 'connectivity'
  | 'sensors'
  | 'outputs'
  | 'interface'
  | 'environment'
  | 'mechanical'
  | 'other'

export interface SelectedBlock {
  blockId: string
  quantity: number
  position?: { x: number; y: number } // grid position
  config?: Record<string, unknown>
}

// =============================================================================
// PCB BLOCKS
// =============================================================================

export interface PcbBlock {
  id: string
  slug: string
  name: string
  category: BlockCategory
  description: string
  widthUnits: number
  heightUnits: number
  taps: BusTap[]
  i2cAddresses: string[] | null
  spiCs: string | null
  power: { currentMaxMa: number }
  components: BlockComponent[]
  isValidated: boolean
  isActive: boolean
  // New fields for PCB merging
  edges?: BlockEdges
  files?: BlockFiles
  netMappings?: Record<string, NetMapping>
  // New formal definition (block.json schema)
  definition?: import('@/schemas/block').BlockDefinition
  version?: string
  createdAt?: string
  updatedAt?: string
}

export type BlockCategory = 'mcu' | 'power' | 'sensor' | 'output' | 'connector' | 'utility'

export interface BusTap {
  net: string
}

export interface BlockComponent {
  ref: string
  value: string
  package: string
  note?: string
}

// Edge connection definitions for block merging
export interface EdgeConnection {
  net: string
  offsetMm: number
  layer: 'F.Cu' | 'B.Cu' | 'In1.Cu' | 'In2.Cu'
}

export interface BlockEdges {
  north: EdgeConnection[]
  south: EdgeConnection[]
  east: EdgeConnection[]
  west: EdgeConnection[]
}

// File references in R2 storage
export interface BlockFiles {
  schematic: string // e.g., "mcu-esp32c6.kicad_sch"
  pcb: string // e.g., "mcu-esp32c6.kicad_pcb"
  stepModel?: string // e.g., "mcu-esp32c6.step"
  thumbnail?: string // e.g., "mcu-esp32c6.png"
  blockJson?: string // e.g., "block.json"
  gerbers?: string // e.g., "gerbers.zip" - ZIP file containing Gerber files
}

// Net mapping for schematic merge
export interface NetMapping {
  globalNet: string
  padRefs: string[]
}

// =============================================================================
// CONVERSATIONS
// =============================================================================

export interface Conversation {
  id: string
  projectId: string
  messages: ConversationMessage[]
  createdAt: string
  updatedAt: string
}

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  metadata?: Record<string, unknown>
}

// =============================================================================
// SETTINGS
// =============================================================================

export interface SystemSettings {
  id: number
  llmProvider: 'openrouter' | 'gemini'
  defaultModel: string
  openRouterApiKey: string | null
  geminiApiKey: string | null
  updatedAt: string
}

// =============================================================================
// SYSTEM PROMPTS (LangGraph Architecture)
// =============================================================================

export interface SystemPrompt {
  id: number
  name: string
  description: string | null
  capabilityAssessmentBase: string
  designConstraints: string | null
  cadCapability: string | null
  firmwareCapability: string | null
  isActive: boolean
  version: number
  createdAt: string
  updatedAt: string
}

export interface SystemPromptRow {
  id: number
  name: string
  description: string | null
  capability_assessment_base: string
  design_constraints: string | null
  cad_capability: string | null
  firmware_capability: string | null
  is_active: number
  version: number
  created_at: string
  updated_at: string
}

export type HardRejectionCategory = 'safety' | 'capability' | 'legal'

export interface HardRejectionCriteria {
  id: number
  pattern: string
  reason: string
  category: HardRejectionCategory
  isActive: boolean
  createdAt: string
}

export interface HardRejectionCriteriaRow {
  id: number
  pattern: string
  reason: string
  category: string
  is_active: number
  created_at: string
}

// =============================================================================
// CAPABILITY ASSESSMENT (LangGraph State)
// =============================================================================

export interface CapabilityAssessment {
  canBuild: boolean
  confidence: number
  reasoning: string
  missingCapabilities: string[]
  suggestedAlternatives: string[]
}

export type ChatRoute = 'REJECT' | 'CLARIFY' | 'PROCEED' | null

// =============================================================================
// DB Row Types (snake_case from SQLite)
// =============================================================================

export interface UserRow {
  id: string
  username: string
  password_hash: string
  display_name: string | null
  created_at: string
  last_login_at: string | null
}

export interface SessionRow {
  id: string
  user_id: string
  expires_at: string
  created_at: string
}

export interface ProjectRow {
  id: string
  user_id: string
  name: string
  description: string | null
  status: string
  spec: string | null // JSON string
  created_at: string
  updated_at: string
}

export interface PcbBlockRow {
  id: string
  slug: string
  name: string
  category: string
  description: string | null
  width_units: number
  height_units: number
  taps: string // JSON string
  i2c_addresses: string | null // JSON string
  spi_cs: string | null
  power: string | null // JSON string
  components: string | null // JSON string
  is_validated: number // 0 or 1
  is_active: number
  // Fields for PCB merging
  edges: string | null // JSON string
  files: string | null // JSON string
  net_mappings: string | null // JSON string
  // New formal definition (block.json schema)
  definition: string | null // JSON string
  version: string | null
  created_at: string | null
  updated_at: string | null
}

export interface ConversationRow {
  id: string
  project_id: string
  messages: string // JSON string
  created_at: string
  updated_at: string
}

export interface SettingsRow {
  id: number
  llm_provider: string
  default_model: string
  openrouter_api_key: string | null
  gemini_api_key: string | null
  updated_at: string
}

// =============================================================================
// Transform Functions
// =============================================================================

export function userFromRow(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  }
}

export function sessionFromRow(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }
}

export function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    status: row.status as ProjectStatus,
    spec: row.spec ? JSON.parse(row.spec) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function blockFromRow(row: PcbBlockRow): PcbBlock {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category as BlockCategory,
    description: row.description || '',
    widthUnits: row.width_units,
    heightUnits: row.height_units,
    taps: JSON.parse(row.taps || '[]'),
    i2cAddresses: row.i2c_addresses ? JSON.parse(row.i2c_addresses) : null,
    spiCs: row.spi_cs,
    power: row.power ? JSON.parse(row.power) : { currentMaxMa: 0 },
    components: row.components ? JSON.parse(row.components) : [],
    isValidated: row.is_validated === 1,
    isActive: row.is_active === 1,
    // Fields for PCB merging
    edges: row.edges ? JSON.parse(row.edges) : undefined,
    files: row.files ? JSON.parse(row.files) : undefined,
    netMappings: row.net_mappings ? JSON.parse(row.net_mappings) : undefined,
    // New formal definition (block.json schema)
    definition: row.definition ? JSON.parse(row.definition) : undefined,
    version: row.version ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  }
}

export function settingsFromRow(row: SettingsRow): SystemSettings {
  return {
    id: row.id,
    llmProvider: row.llm_provider as 'openrouter' | 'gemini',
    defaultModel: row.default_model,
    openRouterApiKey: row.openrouter_api_key,
    geminiApiKey: row.gemini_api_key,
    updatedAt: row.updated_at,
  }
}

export function systemPromptFromRow(row: SystemPromptRow): SystemPrompt {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    capabilityAssessmentBase: row.capability_assessment_base,
    designConstraints: row.design_constraints,
    cadCapability: row.cad_capability,
    firmwareCapability: row.firmware_capability,
    isActive: row.is_active === 1,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function hardRejectionCriteriaFromRow(row: HardRejectionCriteriaRow): HardRejectionCriteria {
  return {
    id: row.id,
    pattern: row.pattern,
    reason: row.reason,
    category: row.category as HardRejectionCategory,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  }
}

// =============================================================================
// ORCHESTRATOR PROMPTS
// =============================================================================

export type OrchestratorPromptCategory = 'agent' | 'generator' | 'reviewer'
export type OrchestratorStageType = 'spec' | 'pcb' | 'enclosure' | 'firmware' | null
export type OrchestratorOutputFormat = 'json' | 'code' | 'text' | 'image_prompt'

export interface OrchestratorPrompt {
  id: string
  nodeName: string
  displayName: string
  description: string | null
  systemPrompt: string
  category: OrchestratorPromptCategory
  stage: OrchestratorStageType
  isActive: boolean
  tokenEstimate: number | null
  version: number
  contextTags: string[]
  createdAt: string
  updatedAt: string
  // Enhanced fields (migration 0019)
  inputSchema: Record<string, unknown> | null
  outputSchema: Record<string, unknown> | null
  contextSelector: string[] | null
  iterationConfig: IterationConfig | null
  userPromptTemplate: string | null
  outputFormat: OrchestratorOutputFormat
}

export interface IterationConfig {
  maxAttempts: number
  exitCondition?: string
  exitThreshold?: number
}

export interface OrchestratorPromptRow {
  id: string
  node_name: string
  display_name: string
  description: string | null
  system_prompt: string
  category: string
  stage: string | null
  is_active: number
  token_estimate: number | null
  version: number
  context_tags: string | null
  created_at: string
  updated_at: string
  // Enhanced fields (migration 0019)
  input_schema: string | null
  output_schema: string | null
  context_selector: string | null
  iteration_config: string | null
  user_prompt_template: string | null
  output_format: string | null
}

export function promptFromRow(row: OrchestratorPromptRow): OrchestratorPrompt {
  return {
    id: row.id,
    nodeName: row.node_name,
    displayName: row.display_name,
    description: row.description,
    systemPrompt: row.system_prompt,
    category: row.category as OrchestratorPromptCategory,
    stage: row.stage as OrchestratorStageType,
    isActive: row.is_active === 1,
    tokenEstimate: row.token_estimate,
    version: row.version,
    contextTags: row.context_tags ? JSON.parse(row.context_tags) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Enhanced fields
    inputSchema: row.input_schema ? JSON.parse(row.input_schema) : null,
    outputSchema: row.output_schema ? JSON.parse(row.output_schema) : null,
    contextSelector: row.context_selector ? JSON.parse(row.context_selector) : null,
    iterationConfig: row.iteration_config ? JSON.parse(row.iteration_config) : null,
    userPromptTemplate: row.user_prompt_template,
    outputFormat: (row.output_format || 'json') as OrchestratorOutputFormat,
  }
}

// =============================================================================
// ORCHESTRATOR EDGES
// =============================================================================

export type OrchestratorEdgeType = 'flow' | 'conditional' | 'loop'

export interface OrchestratorEdge {
  id: string
  fromNode: string
  toNode: string
  condition: Record<string, unknown> | null
  edgeType: OrchestratorEdgeType
  priority: number
  description: string | null
  isActive: boolean
  maxLoops: number | null // migration 0020
  createdAt: string
  updatedAt: string
}

export interface OrchestratorEdgeRow {
  id: string
  from_node: string
  to_node: string
  condition: string | null
  edge_type: string
  priority: number
  description: string | null
  is_active: number
  max_loops: number | null // migration 0020
  created_at: string
  updated_at: string
}

export function edgeFromRow(row: OrchestratorEdgeRow): OrchestratorEdge {
  return {
    id: row.id,
    fromNode: row.from_node,
    toNode: row.to_node,
    condition: row.condition ? JSON.parse(row.condition) : null,
    edgeType: row.edge_type as OrchestratorEdgeType,
    priority: row.priority,
    description: row.description,
    isActive: row.is_active === 1,
    maxLoops: row.max_loops,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// =============================================================================
// ORCHESTRATOR HOOKS
// =============================================================================

export type OrchestratorHookType = 'on_enter' | 'on_exit' | 'on_result' | 'on_error'

export interface OrchestratorHook {
  id: string
  nodeName: string
  hookType: OrchestratorHookType
  hookFunction: string
  hookConfig: Record<string, unknown> | null
  priority: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface OrchestratorHookRow {
  id: string
  node_name: string
  hook_type: string
  hook_function: string
  hook_config: string | null
  priority: number
  is_active: number
  created_at: string
  updated_at: string
}

export function hookFromRow(row: OrchestratorHookRow): OrchestratorHook {
  return {
    id: row.id,
    nodeName: row.node_name,
    hookType: row.hook_type as OrchestratorHookType,
    hookFunction: row.hook_function,
    hookConfig: row.hook_config ? JSON.parse(row.hook_config) : null,
    priority: row.priority,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
