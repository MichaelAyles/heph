/**
 * Database Schema Types
 *
 * These types mirror the D1 SQLite schema.
 * snake_case in DB, camelCase in TypeScript.
 */

// =============================================================================
// PROJECTS
// =============================================================================

export interface Project {
  id: string
  name: string
  description: string | null
  status: ProjectStatus
  spec: ProjectSpec | null
  createdAt: string
  updatedAt: string
}

export type ProjectStatus = 'draft' | 'analyzing' | 'designing' | 'complete' | 'error'

export interface ProjectSpec {
  description: string
  requirements: Requirement[]
  formFactor: FormFactor | null
  blocks: SelectedBlock[]
  decisions: Decision[]
}

export interface Requirement {
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

export interface FormFactor {
  type: 'handheld' | 'desktop' | 'wall-mount' | 'wearable' | 'enclosure-free'
  width: number // mm
  height: number // mm
  depth: number // mm
  apertures: Aperture[]
}

export interface Aperture {
  type: 'usb-c' | 'button' | 'led' | 'display' | 'sensor' | 'vent' | 'other'
  position: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back'
  width: number
  height: number
}

export interface SelectedBlock {
  blockId: string
  quantity: number
  position?: { x: number; y: number } // grid position
  config?: Record<string, unknown>
}

export interface Decision {
  id: string
  question: string
  answer: string
  rationale: string
  timestamp: string
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

export interface ProjectRow {
  id: string
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

export function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
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
