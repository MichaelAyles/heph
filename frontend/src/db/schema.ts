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
  | 'draft'        // Just created
  | 'analyzing'    // Running feasibility
  | 'rejected'     // Failed feasibility
  | 'refining'     // User answering questions
  | 'generating'   // Creating blueprint images
  | 'selecting'    // User picking blueprint
  | 'finalizing'   // Generating final spec
  | 'complete'     // Spec locked

// =============================================================================
// PROJECT SPEC - New Pipeline
// =============================================================================

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
