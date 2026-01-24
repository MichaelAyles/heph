/**
 * PCB Stage State Schema
 *
 * State for the PCB design stage subgraph. Handles block selection,
 * placement optimization, and bus routing.
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
// PCB-Specific Schemas
// =============================================================================

export const BlockSummarySchema = z.object({
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  widthUnits: z.number().default(1),
  heightUnits: z.number().default(1),
  i2cAddresses: z.array(z.string()).nullable().default(null),
})

export type BlockSummary = z.infer<typeof BlockSummarySchema>

export const PlacedBlockSchema = z.object({
  blockId: z.string(),
  blockSlug: z.string(),
  gridX: z.number(),
  gridY: z.number(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
})

export type PlacedBlock = z.infer<typeof PlacedBlockSchema>

export const ConnectionMappingSchema = z.object({
  remoteSignal: z.string(),
  mainSignal: z.string(),
  connectorType: z.string(),
})

export type ConnectionMapping = z.infer<typeof ConnectionMappingSchema>

export const RemoteBoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  type: z.enum(['button', 'display', 'connector', 'custom']),
  placedBlocks: z.array(PlacedBlockSchema),
  boardSize: z.object({
    width: z.number(),
    height: z.number(),
    unit: z.literal('mm'),
  }),
  connectionMapping: z.array(ConnectionMappingSchema),
  gridWidth: z.number(),
  gridHeight: z.number(),
})

export type RemoteBoard = z.infer<typeof RemoteBoardSchema>

export const ResistorTapStateSchema = z.object({
  blockSlug: z.string(),
  reference: z.string(),
  signal: z.string(),
  populated: z.boolean(),
  reason: z.string(),
  isolates: z.object({
    from: z.string(),
    to: z.string(),
  }),
})

export type ResistorTapState = z.infer<typeof ResistorTapStateSchema>

export const DesignJustificationSchema = z.object({
  blockSlug: z.string(),
  blockName: z.string(),
  reason: z.string(),
})

export type DesignJustification = z.infer<typeof DesignJustificationSchema>

export const PCBNodeSchema = z.enum(['block_selection', 'placement_optimization', 'bus_routing'])

export type PCBNode = z.infer<typeof PCBNodeSchema>

export const PCBRouteSchema = z.enum([
  'select_blocks',
  'optimize_placement',
  'route_buses',
  'complete',
])

export type PCBRoute = z.infer<typeof PCBRouteSchema>

// =============================================================================
// PCB State Schema
// =============================================================================

/**
 * PCB Stage State
 *
 * Contains all fields needed for PCB design:
 * - Available blocks from database
 * - Placed blocks with grid positions
 * - Remote boards for off-grid components
 * - Resistor tap states for bus isolation
 */
export const PCBStateSchema = new StateSchema({
  // Inherited from parent
  messages: MessagesValue,
  userRequest: z.string().default(''),
  userFeedback: z.string().nullable().default(null),
  currentStage: StageSchema.default('pcb'),
  stageStatus: z.record(StageSchema, StageStatusSchema).default({
    router: 'complete',
    spec: 'complete',
    pcb: 'in_progress',
    enclosure: 'pending',
    firmware: 'pending',
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

  // PCB-specific fields
  availableBlocks: z.array(BlockSummarySchema).default([]),
  placedBlocks: z.array(PlacedBlockSchema).default([]),
  remoteBoards: z.array(RemoteBoardSchema).default([]),
  resistorTapStates: z.array(ResistorTapStateSchema).default([]),
  designJustifications: z.array(DesignJustificationSchema).default([]),

  // Board dimensions (calculated from placements)
  boardSize: z
    .object({
      width: z.number(),
      height: z.number(),
      unit: z.literal('mm'),
    })
    .nullable()
    .default(null),

  // Grid dimensions in units (12.7mm per unit)
  gridWidth: z.number().default(0),
  gridHeight: z.number().default(0),

  // Internal routing
  pcbRoute: PCBRouteSchema.nullable().default(null),
})

// Type helpers
export type PCBState = typeof PCBStateSchema.State
export type PCBStateUpdate = typeof PCBStateSchema.Update

// =============================================================================
// Helper Functions
// =============================================================================

const GRID_SIZE_MM = 12.7

/**
 * Create a debug step for PCB stage
 */
export function createPCBDebugStep(
  node: PCBNode,
  input?: unknown,
  output?: unknown,
  durationMs?: number
): DebugStep {
  return baseCreateDebugStep(node, input, output, durationMs, 'pcb')
}

/**
 * Calculate board dimensions from placed blocks
 */
export function calculateBoardSize(
  placedBlocks: PlacedBlock[],
  blockSizes: Map<string, { width: number; height: number }>
): { width: number; height: number; gridWidth: number; gridHeight: number } {
  if (placedBlocks.length === 0) {
    return { width: 0, height: 0, gridWidth: 0, gridHeight: 0 }
  }

  let maxX = 0
  let maxY = 0

  for (const block of placedBlocks) {
    const size = blockSizes.get(block.blockSlug) ?? { width: 1, height: 1 }
    const rotation = block.rotation

    // Swap dimensions for 90/270 degree rotations
    const effectiveWidth = rotation === 90 || rotation === 270 ? size.height : size.width
    const effectiveHeight = rotation === 90 || rotation === 270 ? size.width : size.height

    maxX = Math.max(maxX, block.gridX + effectiveWidth)
    maxY = Math.max(maxY, block.gridY + effectiveHeight)
  }

  return {
    width: maxX * GRID_SIZE_MM,
    height: maxY * GRID_SIZE_MM,
    gridWidth: maxX,
    gridHeight: maxY,
  }
}

/**
 * Check if a grid position is occupied
 */
export function isPositionOccupied(
  placedBlocks: PlacedBlock[],
  blockSizes: Map<string, { width: number; height: number }>,
  gridX: number,
  gridY: number
): boolean {
  for (const block of placedBlocks) {
    const size = blockSizes.get(block.blockSlug) ?? { width: 1, height: 1 }
    const rotation = block.rotation

    const effectiveWidth = rotation === 90 || rotation === 270 ? size.height : size.width
    const effectiveHeight = rotation === 90 || rotation === 270 ? size.width : size.height

    if (
      gridX >= block.gridX &&
      gridX < block.gridX + effectiveWidth &&
      gridY >= block.gridY &&
      gridY < block.gridY + effectiveHeight
    ) {
      return true
    }
  }
  return false
}

/**
 * Check for I2C address conflicts
 */
export function findI2CConflicts(
  placedBlocks: PlacedBlock[],
  blockAddresses: Map<string, string[]>
): { block1: string; block2: string; address: string }[] {
  const conflicts: { block1: string; block2: string; address: string }[] = []
  const usedAddresses = new Map<string, string>()

  for (const block of placedBlocks) {
    const addresses = blockAddresses.get(block.blockSlug) ?? []
    for (const address of addresses) {
      const existing = usedAddresses.get(address)
      if (existing && existing !== block.blockSlug) {
        conflicts.push({
          block1: existing,
          block2: block.blockSlug,
          address,
        })
      } else {
        usedAddresses.set(address, block.blockSlug)
      }
    }
  }

  return conflicts
}

/**
 * Check if PCB design is valid
 */
export function isPCBDesignValid(state: PCBState): boolean {
  // Must have at least one block
  if (state.placedBlocks.length === 0) return false

  // Must have an MCU
  const hasMCU = state.placedBlocks.some((b) =>
    state.availableBlocks.find((ab) => ab.slug === b.blockSlug && ab.category === 'mcu')
  )
  if (!hasMCU) return false

  return true
}

// Re-export shared types and functions
export { createInitialDebugInfo }
export type { DebugStep, DebugInfo }
