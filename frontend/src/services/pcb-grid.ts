/**
 * PCB Grid Placement Engine
 *
 * Handles block placement on the 12.7mm grid with bus continuity validation.
 * The bus runs north→south per column, and each column must have unbroken
 * block coverage for signals to propagate.
 */

import type { BlockDefinition } from '../schemas/block'
import type { PlacedBlock } from '../db/schema'

// Grid unit size in mm (0.5" = 12.7mm)
export const GRID_UNIT_MM = 12.7

// =============================================================================
// Types
// =============================================================================

export interface CellState {
  blockId: string | null
  isOrigin: boolean // True for top-left cell of multi-unit block
  columnBusActive: boolean
}

export interface PlacedBlockWithMeta {
  placement: PlacedBlock
  block: BlockDefinition
  validationErrors: string[]
  validationWarnings: string[]
}

export interface GridState {
  width: number // Total columns
  height: number // Total rows
  cells: Map<string, CellState> // "x,y" → state
  placedBlocks: PlacedBlockWithMeta[]
}

export interface PlacementResult {
  valid: boolean
  errors: string[] // "Bus discontinuity in column 1 at row 2"
  warnings: string[] // "Power budget at 85%"
  suggestedFixes: SuggestedFix[]
}

export interface SuggestedFix {
  type: 'add_passthrough' | 'move_block' | 'rotate_block'
  description: string
  gridX: number
  gridY: number
  blockSlug?: string
}

export interface PowerBudget {
  provides: Record<string, number>
  requires: Record<string, { typical: number; max: number }>
  warnings: string[]
  errors: string[]
  marginPercent: Record<string, number>
}

export type EdgeMount = 'north' | 'south' | 'east' | 'west' | null

// =============================================================================
// Grid State Management
// =============================================================================

/**
 * Create an empty grid state
 */
export function createGridState(width: number, height: number): GridState {
  const cells = new Map<string, CellState>()

  // Initialize all cells as empty with bus inactive
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      cells.set(`${x},${y}`, {
        blockId: null,
        isOrigin: false,
        columnBusActive: false,
      })
    }
  }

  return {
    width,
    height,
    cells,
    placedBlocks: [],
  }
}

/**
 * Get the cell key for a position
 */
function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

/**
 * Get cell state, returning undefined if out of bounds
 */
function getCell(grid: GridState, x: number, y: number): CellState | undefined {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) {
    return undefined
  }
  return grid.cells.get(cellKey(x, y))
}

// =============================================================================
// Block Placement
// =============================================================================

/**
 * Get the effective size of a block based on rotation
 * Rotation 0 and 180 keep original dimensions, 90 and 270 swap them
 */
export function getEffectiveSize(
  block: BlockDefinition,
  rotation: 0 | 90 | 180 | 270
): [number, number] {
  const [width, height] = block.gridSize
  if (rotation === 90 || rotation === 270) {
    return [height, width]
  }
  return [width, height]
}

/**
 * Get the edge mount requirement for a block
 */
export function getEdgeMount(block: BlockDefinition): EdgeMount {
  // First check for explicit edgeMount in physical properties
  const physical = block.physical
  if (physical?.edgeMount) {
    return physical.edgeMount
  }

  // Fallback: infer from overhang if no explicit edgeMount
  if (!physical?.overhang) return null

  const overhang = physical.overhang

  // Determine edge mount based on overhang (larger overhang = connector side)
  const overhangs = [
    { edge: 'north' as EdgeMount, value: overhang.north ?? 0 },
    { edge: 'south' as EdgeMount, value: overhang.south ?? 0 },
    { edge: 'east' as EdgeMount, value: overhang.east ?? 0 },
    { edge: 'west' as EdgeMount, value: overhang.west ?? 0 },
  ]

  const maxOverhang = overhangs.reduce((max, curr) =>
    curr.value > max.value ? curr : max
  )

  // Only consider it edge-mounted if overhang is significant (> 5mm)
  return maxOverhang.value > 5 ? maxOverhang.edge : null
}

/**
 * Check if a block can be placed at the given position
 */
export function canPlaceBlock(
  grid: GridState,
  block: BlockDefinition,
  x: number,
  y: number,
  rotation: 0 | 90 | 180 | 270 = 0
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const [width, height] = getEffectiveSize(block, rotation)

  // Check bounds
  if (x < 0 || y < 0) {
    errors.push(`Position (${x},${y}) is out of bounds`)
  }
  if (x + width > grid.width) {
    errors.push(`Block extends beyond grid right edge (needs ${x + width}, grid is ${grid.width})`)
  }
  if (y + height > grid.height) {
    errors.push(`Block extends beyond grid bottom edge (needs ${y + height}, grid is ${grid.height})`)
  }

  // Check for overlaps
  for (let dx = 0; dx < width; dx++) {
    for (let dy = 0; dy < height; dy++) {
      const cell = getCell(grid, x + dx, y + dy)
      if (cell?.blockId) {
        errors.push(`Cell (${x + dx},${y + dy}) is already occupied`)
      }
    }
  }

  // Check edge mount constraints
  const edgeMount = getEdgeMount(block)
  if (edgeMount) {
    switch (edgeMount) {
      case 'north':
        if (y !== 0) {
          errors.push(`${block.name} must be placed at north edge (row 0)`)
        }
        break
      case 'south':
        if (y + height !== grid.height) {
          errors.push(`${block.name} must be placed at south edge (row ${grid.height - height})`)
        }
        break
      case 'east':
        if (x + width !== grid.width) {
          errors.push(`${block.name} must be placed at east edge`)
        }
        break
      case 'west':
        if (x !== 0) {
          errors.push(`${block.name} must be placed at west edge (column 0)`)
        }
        break
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Place a block on the grid
 */
export function placeBlock(
  grid: GridState,
  block: BlockDefinition,
  x: number,
  y: number,
  rotation: 0 | 90 | 180 | 270 = 0
): GridState {
  const canPlace = canPlaceBlock(grid, block, x, y, rotation)
  if (!canPlace.valid) {
    throw new Error(`Cannot place block: ${canPlace.errors.join(', ')}`)
  }

  const [width, height] = getEffectiveSize(block, rotation)
  const newCells = new Map(grid.cells)
  const blockId = `${block.slug}-${Date.now()}`

  // Mark all cells as occupied
  for (let dx = 0; dx < width; dx++) {
    for (let dy = 0; dy < height; dy++) {
      newCells.set(cellKey(x + dx, y + dy), {
        blockId,
        isOrigin: dx === 0 && dy === 0,
        columnBusActive: true, // Block provides bus connectivity
      })
    }
  }

  const placement: PlacedBlock = {
    blockId,
    blockSlug: block.slug,
    gridX: x,
    gridY: y,
    rotation,
  }

  const placedBlockMeta: PlacedBlockWithMeta = {
    placement,
    block,
    validationErrors: [],
    validationWarnings: [],
  }

  return {
    ...grid,
    cells: newCells,
    placedBlocks: [...grid.placedBlocks, placedBlockMeta],
  }
}

/**
 * Remove a block from the grid
 */
export function removeBlock(grid: GridState, blockId: string): GridState {
  const blockMeta = grid.placedBlocks.find((b) => b.placement.blockId === blockId)
  if (!blockMeta) {
    return grid
  }

  const [width, height] = getEffectiveSize(blockMeta.block, blockMeta.placement.rotation)
  const { gridX, gridY } = blockMeta.placement
  const newCells = new Map(grid.cells)

  // Clear all cells this block occupied
  for (let dx = 0; dx < width; dx++) {
    for (let dy = 0; dy < height; dy++) {
      newCells.set(cellKey(gridX + dx, gridY + dy), {
        blockId: null,
        isOrigin: false,
        columnBusActive: false,
      })
    }
  }

  return {
    ...grid,
    cells: newCells,
    placedBlocks: grid.placedBlocks.filter((b) => b.placement.blockId !== blockId),
  }
}

// =============================================================================
// Bus Continuity Validation
// =============================================================================

/**
 * Check if a column has continuous bus coverage from top to bottom
 */
export function checkColumnContinuity(grid: GridState, column: number): {
  continuous: boolean
  gaps: Array<{ startRow: number; endRow: number }>
} {
  const gaps: Array<{ startRow: number; endRow: number }> = []
  let inGap = false
  let gapStart = 0

  for (let row = 0; row < grid.height; row++) {
    const cell = getCell(grid, column, row)
    const hasBlock = cell?.blockId !== null

    if (!hasBlock && !inGap) {
      // Starting a gap
      inGap = true
      gapStart = row
    } else if (hasBlock && inGap) {
      // Ending a gap
      inGap = false
      gaps.push({ startRow: gapStart, endRow: row - 1 })
    }
  }

  // Check if gap extends to bottom
  if (inGap) {
    gaps.push({ startRow: gapStart, endRow: grid.height - 1 })
  }

  return {
    continuous: gaps.length === 0,
    gaps,
  }
}

/**
 * Validate bus continuity for the entire grid
 */
export function validateBusContinuity(grid: GridState): {
  valid: boolean
  errors: string[]
  columnGaps: Map<number, Array<{ startRow: number; endRow: number }>>
} {
  const errors: string[] = []
  const columnGaps = new Map<number, Array<{ startRow: number; endRow: number }>>()

  // Determine which columns need to be checked
  // A column needs continuity if it has any blocks in it
  const columnsWithBlocks = new Set<number>()
  for (const blockMeta of grid.placedBlocks) {
    const { gridX } = blockMeta.placement
    const [width] = getEffectiveSize(blockMeta.block, blockMeta.placement.rotation)
    for (let dx = 0; dx < width; dx++) {
      columnsWithBlocks.add(gridX + dx)
    }
  }

  // Check each column that has blocks
  for (const column of columnsWithBlocks) {
    const result = checkColumnContinuity(grid, column)
    if (!result.continuous) {
      columnGaps.set(column, result.gaps)
      for (const gap of result.gaps) {
        if (gap.startRow === gap.endRow) {
          errors.push(`Bus discontinuity in column ${column} at row ${gap.startRow}`)
        } else {
          errors.push(`Bus discontinuity in column ${column} from row ${gap.startRow} to ${gap.endRow}`)
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    columnGaps,
  }
}

/**
 * Suggest passthrough placements to fix bus continuity issues
 */
export function suggestPassthroughPlacements(grid: GridState): SuggestedFix[] {
  const suggestions: SuggestedFix[] = []
  const continuityResult = validateBusContinuity(grid)

  for (const [column, gaps] of continuityResult.columnGaps) {
    for (const gap of gaps) {
      // For each gap row, suggest a passthrough
      for (let row = gap.startRow; row <= gap.endRow; row++) {
        const cell = getCell(grid, column, row)
        if (!cell?.blockId) {
          suggestions.push({
            type: 'add_passthrough',
            description: `Add passthrough block at (${column}, ${row}) to maintain bus continuity`,
            gridX: column,
            gridY: row,
            blockSlug: '1x1-passthrough',
          })
        }
      }
    }
  }

  return suggestions
}

// =============================================================================
// Power Budget Validation
// =============================================================================

/**
 * Calculate the power budget for all placed blocks
 */
export function calculatePowerBudget(blocks: BlockDefinition[]): PowerBudget {
  const provides: Record<string, number> = {}
  const requires: Record<string, { typical: number; max: number }> = {}
  const warnings: string[] = []
  const errors: string[] = []
  const marginPercent: Record<string, number> = {}

  for (const block of blocks) {
    // Aggregate power provisions
    if (block.bus.power?.provides) {
      for (const p of block.bus.power.provides) {
        const rail = p.rail
        if (provides[rail]) {
          // Multiple providers - take the max
          warnings.push(
            `Multiple blocks provide ${rail}: ${block.name}. Ensure power sources don't conflict.`
          )
          provides[rail] = Math.max(provides[rail], p.maxMa)
        } else {
          provides[rail] = p.maxMa
        }
      }
    }

    // Aggregate power requirements
    if (block.bus.power?.requires) {
      for (const r of block.bus.power.requires) {
        const rail = r.rail
        if (!requires[rail]) {
          requires[rail] = { typical: 0, max: 0 }
        }
        requires[rail].typical += r.typicalMa
        requires[rail].max += r.maxMa
      }
    }
  }

  // Check if requirements exceed provisions
  for (const [rail, req] of Object.entries(requires)) {
    const available = provides[rail] || 0
    if (available === 0) {
      errors.push(`No block provides ${rail} rail, but ${req.max}mA max required`)
      marginPercent[rail] = -100
    } else if (req.max > available) {
      errors.push(
        `${rail} rail budget exceeded: ${req.max}mA required, ${available}mA available`
      )
      marginPercent[rail] = ((available - req.max) / available) * 100
    } else {
      marginPercent[rail] = ((available - req.max) / available) * 100
      if (req.typical > available * 0.8) {
        warnings.push(
          `${rail} rail near capacity: ${req.typical}mA typical usage, ${available}mA available (${marginPercent[rail].toFixed(0)}% margin)`
        )
      }
    }
  }

  return { provides, requires, warnings, errors, marginPercent }
}

/**
 * Validate power budget for placed blocks
 */
export function validatePowerBudget(grid: GridState): PowerBudget {
  const blocks = grid.placedBlocks.map((b) => b.block)
  return calculatePowerBudget(blocks)
}

// =============================================================================
// Interface Conflict Detection
// =============================================================================

/**
 * Check for I2C address conflicts
 */
export function checkI2cConflicts(blocks: BlockDefinition[]): string[] {
  const errors: string[] = []
  const addressMap = new Map<number, string[]>()

  for (const block of blocks) {
    if (block.bus.i2c?.addresses) {
      for (const addr of block.bus.i2c.addresses) {
        const existing = addressMap.get(addr) || []
        existing.push(block.name)
        addressMap.set(addr, existing)
      }
    }
  }

  for (const [addr, blockNames] of addressMap) {
    if (blockNames.length > 1) {
      const hex = `0x${addr.toString(16).padStart(2, '0')}`
      errors.push(`I2C address conflict at ${hex}: ${blockNames.join(', ')}`)
    }
  }

  return errors
}

/**
 * Check for GPIO claim conflicts
 */
export function checkGpioConflicts(blocks: BlockDefinition[]): string[] {
  const errors: string[] = []
  const gpioMap = new Map<string, string[]>()

  for (const block of blocks) {
    if (block.bus.gpio?.claims) {
      for (const gpio of block.bus.gpio.claims) {
        const existing = gpioMap.get(gpio) || []
        existing.push(block.name)
        gpioMap.set(gpio, existing)
      }
    }
  }

  for (const [gpio, blockNames] of gpioMap) {
    if (blockNames.length > 1) {
      errors.push(`GPIO conflict: ${gpio} claimed by ${blockNames.join(', ')}`)
    }
  }

  return errors
}

/**
 * Check for SPI chip select conflicts
 */
export function checkSpiConflicts(blocks: BlockDefinition[]): string[] {
  const errors: string[] = []
  const csMap = new Map<string, string[]>()

  for (const block of blocks) {
    if (block.bus.spi?.csPin) {
      const cs = block.bus.spi.csPin
      const existing = csMap.get(cs) || []
      existing.push(block.name)
      csMap.set(cs, existing)
    }
  }

  for (const [cs, blockNames] of csMap) {
    if (blockNames.length > 1) {
      errors.push(`SPI chip select conflict: ${cs} used by ${blockNames.join(', ')}`)
    }
  }

  return errors
}

// =============================================================================
// Full Grid Validation
// =============================================================================

/**
 * Perform full validation of the grid state
 */
export function validateGrid(grid: GridState): PlacementResult {
  const errors: string[] = []
  const warnings: string[] = []
  const suggestedFixes: SuggestedFix[] = []

  // Skip validation if no blocks placed
  if (grid.placedBlocks.length === 0) {
    return { valid: true, errors: [], warnings: [], suggestedFixes: [] }
  }

  // Check for MCU
  const hasMcu = grid.placedBlocks.some((b) => b.block.category === 'mcu')
  if (!hasMcu) {
    errors.push('No MCU block placed. An MCU is required to define the bus.')
  }

  // Check bus continuity
  const busContinuity = validateBusContinuity(grid)
  errors.push(...busContinuity.errors)

  // Suggest passthroughs for gaps
  if (!busContinuity.valid) {
    suggestedFixes.push(...suggestPassthroughPlacements(grid))
  }

  // Check power budget
  const powerBudget = validatePowerBudget(grid)
  errors.push(...powerBudget.errors)
  warnings.push(...powerBudget.warnings)

  // Check interface conflicts
  const blocks = grid.placedBlocks.map((b) => b.block)
  errors.push(...checkI2cConflicts(blocks))
  errors.push(...checkGpioConflicts(blocks))
  errors.push(...checkSpiConflicts(blocks))

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestedFixes,
  }
}

// =============================================================================
// Grid Utilities
// =============================================================================

/**
 * Calculate the minimum board size to fit all placed blocks
 */
export function calculateBoardSize(grid: GridState): { width: number; height: number; widthMm: number; heightMm: number } {
  if (grid.placedBlocks.length === 0) {
    return { width: 0, height: 0, widthMm: 0, heightMm: 0 }
  }

  let maxX = 0
  let maxY = 0

  for (const blockMeta of grid.placedBlocks) {
    const { gridX, gridY } = blockMeta.placement
    const [width, height] = getEffectiveSize(blockMeta.block, blockMeta.placement.rotation)
    maxX = Math.max(maxX, gridX + width)
    maxY = Math.max(maxY, gridY + height)
  }

  return {
    width: maxX,
    height: maxY,
    widthMm: maxX * GRID_UNIT_MM,
    heightMm: maxY * GRID_UNIT_MM,
  }
}

/**
 * Find the first available position for a block
 */
export function findAvailablePosition(
  grid: GridState,
  block: BlockDefinition,
  rotation: 0 | 90 | 180 | 270 = 0
): { x: number; y: number } | null {
  const [width, height] = getEffectiveSize(block, rotation)
  const edgeMount = getEdgeMount(block)

  // For edge-mounted blocks, search only along that edge
  if (edgeMount === 'south') {
    const y = grid.height - height
    for (let x = 0; x <= grid.width - width; x++) {
      if (canPlaceBlock(grid, block, x, y, rotation).valid) {
        return { x, y }
      }
    }
    return null
  }

  if (edgeMount === 'north') {
    for (let x = 0; x <= grid.width - width; x++) {
      if (canPlaceBlock(grid, block, x, 0, rotation).valid) {
        return { x, y: 0 }
      }
    }
    return null
  }

  // For non-edge blocks, search from top-left
  for (let y = 0; y <= grid.height - height; y++) {
    for (let x = 0; x <= grid.width - width; x++) {
      if (canPlaceBlock(grid, block, x, y, rotation).valid) {
        return { x, y }
      }
    }
  }

  return null
}

/**
 * Convert grid state to array of PlacedBlocks for persistence
 */
export function toPlacedBlocks(grid: GridState): PlacedBlock[] {
  return grid.placedBlocks.map((b) => b.placement)
}

/**
 * Restore grid state from placed blocks and block definitions
 */
export function fromPlacedBlocks(
  placedBlocks: PlacedBlock[],
  blockDefinitions: Map<string, BlockDefinition>,
  gridWidth: number,
  gridHeight: number
): GridState {
  let grid = createGridState(gridWidth, gridHeight)

  for (const placement of placedBlocks) {
    const block = blockDefinitions.get(placement.blockSlug)
    if (block) {
      // Re-create with the same ID
      const [width, height] = getEffectiveSize(block, placement.rotation)
      const newCells = new Map(grid.cells)

      // Mark all cells as occupied
      for (let dx = 0; dx < width; dx++) {
        for (let dy = 0; dy < height; dy++) {
          newCells.set(cellKey(placement.gridX + dx, placement.gridY + dy), {
            blockId: placement.blockId,
            isOrigin: dx === 0 && dy === 0,
            columnBusActive: true,
          })
        }
      }

      const placedBlockMeta: PlacedBlockWithMeta = {
        placement,
        block,
        validationErrors: [],
        validationWarnings: [],
      }

      grid = {
        ...grid,
        cells: newCells,
        placedBlocks: [...grid.placedBlocks, placedBlockMeta],
      }
    }
  }

  return grid
}

/**
 * Auto-expand grid to fit a block if needed
 */
export function expandGridToFit(
  grid: GridState,
  block: BlockDefinition,
  x: number,
  y: number,
  rotation: 0 | 90 | 180 | 270 = 0
): GridState {
  const [width, height] = getEffectiveSize(block, rotation)
  const requiredWidth = Math.max(grid.width, x + width)
  const requiredHeight = Math.max(grid.height, y + height)

  if (requiredWidth <= grid.width && requiredHeight <= grid.height) {
    return grid
  }

  // Create expanded grid
  const newGrid = createGridState(requiredWidth, requiredHeight)

  // Copy existing cells
  for (const [key, cell] of grid.cells) {
    newGrid.cells.set(key, cell)
  }

  // Copy existing blocks
  newGrid.placedBlocks = [...grid.placedBlocks]

  return newGrid
}
