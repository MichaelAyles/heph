/**
 * Firmware Stage State Schema
 *
 * State for the firmware development stage subgraph. Handles component analysis,
 * code generation, and review loops.
 */

import { StateSchema, MessagesValue, ReducedValue } from '@langchain/langgraph'
import { z } from 'zod'
import {
  StageSchema,
  StageStatusSchema,
  ProjectSummarySchema,
  DebugInfoSchema,
  createDebugStep as baseCreateDebugStep,
  createInitialDebugInfo,
  type DebugStep,
  type DebugInfo,
} from './orchestrator'

// =============================================================================
// Firmware-Specific Schemas
// =============================================================================

export const FirmwareFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  language: z.enum(['cpp', 'c', 'h', 'json']),
})

export type FirmwareFile = z.infer<typeof FirmwareFileSchema>

export const ComponentPinMappingSchema = z.object({
  component: z.string(),
  pin: z.string(),
  gpio: z.string(),
  function: z.string(),
})

export type ComponentPinMapping = z.infer<typeof ComponentPinMappingSchema>

export const I2CDeviceSchema = z.object({
  name: z.string(),
  address: z.string(),
  blockSlug: z.string(),
  sdaPin: z.string().optional(),
  sclPin: z.string().optional(),
})

export type I2CDevice = z.infer<typeof I2CDeviceSchema>

export const SPIDeviceSchema = z.object({
  name: z.string(),
  csPin: z.string(),
  blockSlug: z.string(),
})

export type SPIDevice = z.infer<typeof SPIDeviceSchema>

export const FirmwareReviewIssueSchema = z.object({
  severity: z.enum(['error', 'warning', 'suggestion']),
  file: z.string(),
  line: z.number().optional(),
  message: z.string(),
  suggestion: z.string().optional(),
})

export type FirmwareReviewIssue = z.infer<typeof FirmwareReviewIssueSchema>

export const BuildStatusSchema = z.enum(['pending', 'building', 'success', 'failed'])

export type BuildStatus = z.infer<typeof BuildStatusSchema>

export const FirmwareNodeSchema = z.enum(['component_analysis', 'code_generation', 'review_loop'])

export type FirmwareNode = z.infer<typeof FirmwareNodeSchema>

export const FirmwareRouteSchema = z.enum([
  'analyze_components',
  'generate_code',
  'review',
  'regenerate',
  'complete',
])

export type FirmwareRoute = z.infer<typeof FirmwareRouteSchema>

// =============================================================================
// Firmware State Schema
// =============================================================================

/**
 * Firmware Stage State
 *
 * Contains all fields needed for firmware development:
 * - Component and pin analysis from PCB
 * - Code generation state
 * - Review feedback loops
 * - Build status
 */
export const FirmwareStateSchema = new StateSchema({
  // Inherited from parent
  messages: MessagesValue,
  userRequest: z.string().default(''),
  userFeedback: z.string().nullable().default(null),
  currentStage: StageSchema.default('firmware'),
  stageStatus: z.record(StageSchema, StageStatusSchema).default({
    router: 'complete',
    spec: 'complete',
    pcb: 'complete',
    enclosure: 'complete',
    firmware: 'in_progress',
    export: 'pending',
  }),
  projectId: z.string().nullable().default(null),
  sessionId: z.string().default(''),
  userProjects: z.array(ProjectSummarySchema).default([]),
  error: z.string().nullable().default(null),
  debug: new ReducedValue(DebugInfoSchema, {
    reducer: (current, update) => ({
      ...current,
      ...update,
      steps: [...(current.steps || []), ...(update.steps || [])],
    }),
  }),

  // Firmware-specific fields
  files: z.array(FirmwareFileSchema).default([]),
  pinMappings: z.array(ComponentPinMappingSchema).default([]),
  i2cDevices: z.array(I2CDeviceSchema).default([]),
  spiDevices: z.array(SPIDeviceSchema).default([]),

  // Review state
  reviewIssues: z.array(FirmwareReviewIssueSchema).default([]),
  reviewRound: z.number().default(0),
  maxReviewRounds: z.number().default(3),
  reviewFeedback: z.array(z.string()).default([]),
  validated: z.boolean().default(false),

  // Build state
  buildStatus: BuildStatusSchema.default('pending'),
  buildLog: z.string().default(''),
  binaryUrl: z.string().nullable().default(null),

  // Framework configuration
  framework: z.enum(['arduino', 'platformio', 'esp-idf']).default('platformio'),
  targetMcu: z.string().default('esp32c6'),

  // Internal routing
  firmwareRoute: FirmwareRouteSchema.nullable().default(null),
})

// Type helpers
export type FirmwareState = typeof FirmwareStateSchema.State
export type FirmwareStateUpdate = typeof FirmwareStateSchema.Update

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a debug step for firmware stage
 */
export function createFirmwareDebugStep(
  node: FirmwareNode,
  input?: unknown,
  output?: unknown,
  durationMs?: number
): DebugStep {
  return baseCreateDebugStep(node, input, output, durationMs, 'firmware')
}

/**
 * Get a file by path
 */
export function getFileByPath(files: FirmwareFile[], path: string): FirmwareFile | undefined {
  return files.find((f) => f.path === path)
}

/**
 * Update or add a file
 */
export function upsertFile(files: FirmwareFile[], file: FirmwareFile): FirmwareFile[] {
  const index = files.findIndex((f) => f.path === file.path)
  if (index >= 0) {
    return [...files.slice(0, index), file, ...files.slice(index + 1)]
  }
  return [...files, file]
}

/**
 * Check if firmware has critical review issues
 */
export function hasCriticalIssues(issues: FirmwareReviewIssue[]): boolean {
  return issues.some((i) => i.severity === 'error')
}

/**
 * Get all I2C addresses in use
 */
export function getUsedI2CAddresses(devices: I2CDevice[]): string[] {
  return devices.map((d) => d.address)
}

/**
 * Check for I2C address conflicts
 */
export function findI2CAddressConflicts(
  devices: I2CDevice[]
): { device1: string; device2: string; address: string }[] {
  const conflicts: { device1: string; device2: string; address: string }[] = []
  const addressMap = new Map<string, string>()

  for (const device of devices) {
    const existing = addressMap.get(device.address)
    if (existing) {
      conflicts.push({
        device1: existing,
        device2: device.name,
        address: device.address,
      })
    } else {
      addressMap.set(device.address, device.name)
    }
  }

  return conflicts
}

/**
 * Check if review is complete
 */
export function isReviewComplete(state: FirmwareState): boolean {
  return (
    state.reviewRound >= state.maxReviewRounds ||
    (state.validated && !hasCriticalIssues(state.reviewIssues))
  )
}

/**
 * Generate default platformio.ini content
 */
export function generatePlatformioIni(targetMcu: string = 'esp32c6'): string {
  return `; PlatformIO Project Configuration File
;
; Generated by PHAESTUS

[env:${targetMcu}]
platform = espressif32
board = esp32-c6-devkitc-1
framework = arduino
monitor_speed = 115200
lib_deps =
    Wire
    SPI
`
}

/**
 * Check if firmware is valid for compilation
 */
export function isFirmwareValid(state: FirmwareState): boolean {
  // Must have main.cpp or main.c
  const hasMain = state.files.some((f) => f.path === 'src/main.cpp' || f.path === 'src/main.c')
  if (!hasMain) return false

  // Must have no critical issues
  if (hasCriticalIssues(state.reviewIssues)) return false

  return true
}

// Re-export shared types and functions
export { createInitialDebugInfo }
export type { DebugStep, DebugInfo }
