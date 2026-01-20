/**
 * Tests for PCB Grid Placement Engine
 */

import { describe, it, expect } from 'vitest'
import {
  createGridState,
  canPlaceBlock,
  placeBlock,
  removeBlock,
  checkColumnContinuity,
  validateBusContinuity,
  suggestPassthroughPlacements,
  calculatePowerBudget,
  checkI2cConflicts,
  checkGpioConflicts,
  checkSpiConflicts,
  validateGrid,
  calculateBoardSize,
  findAvailablePosition,
  toPlacedBlocks,
  fromPlacedBlocks,
  expandGridToFit,
  getEffectiveSize,
  getEdgeMount,
  GRID_UNIT_MM,
} from './pcb-grid'
import type { BlockDefinition } from '../schemas/block'

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createMockBlock = (overrides: Partial<BlockDefinition> = {}): BlockDefinition => ({
  slug: 'test-block',
  name: 'Test Block',
  version: '1.0.0',
  category: 'sensor',
  description: 'A test block for unit testing',
  gridSize: [1, 1],
  bus: {
    taps: [],
    permanent: [],
  },
  edges: {
    north: [{ signals: 'ALL' }],
    south: [{ signals: 'ALL' }],
  },
  components: [],
  ...overrides,
})

const createMcuBlock = (): BlockDefinition =>
  createMockBlock({
    slug: 'esp32-c6-mcu',
    name: 'ESP32-C6 MCU',
    category: 'mcu',
    gridSize: [2, 2],
    bus: {
      power: {
        provides: [{ rail: '3V3', maxMa: 500 }],
      },
    },
    edges: {
      north: [{ signals: 'ALL' }, { signals: 'ALL' }],
      south: [{ signals: 'ALL' }, { signals: 'ALL' }],
    },
  })

const createUsbcPowerBlock = (): BlockDefinition =>
  createMockBlock({
    slug: '2x1-usbc-power',
    name: 'USB-C Power',
    category: 'power',
    gridSize: [2, 1],
    physical: {
      overhang: { south: 10 },
      edgeMount: 'south',
    },
    bus: {
      power: {
        provides: [{ rail: '5V0', maxMa: 3000 }],
      },
    },
    edges: {
      north: [{ signals: 'ALL' }, { signals: 'ALL' }],
      south: [{ signals: 'ALL' }, { signals: 'ALL' }],
    },
  })

const createIoBlock = (): BlockDefinition =>
  createMockBlock({
    slug: '1x1-io-block',
    name: 'IO Block',
    category: 'connector',
    gridSize: [1, 1],
    bus: {
      power: {
        requires: [{ rail: '3V3', typicalMa: 5, maxMa: 10 }],
      },
      gpio: {
        claims: ['GPIO0', 'GPIO1'],
      },
    },
  })

const _createPassthroughBlock = (): BlockDefinition =>
  createMockBlock({
    slug: '1x1-passthrough',
    name: 'Passthrough',
    category: 'utility',
    gridSize: [1, 1],
  })

const createI2cSensorBlock = (addr: number): BlockDefinition =>
  createMockBlock({
    slug: `sensor-${addr.toString(16)}`,
    name: `I2C Sensor 0x${addr.toString(16)}`,
    category: 'sensor',
    gridSize: [1, 1],
    bus: {
      i2c: {
        addresses: [addr],
      },
      power: {
        requires: [{ rail: '3V3', typicalMa: 2, maxMa: 5 }],
      },
    },
  })

const createSpiSensorBlock = (csPin: 'SPI0_CS0' | 'SPI0_CS1'): BlockDefinition =>
  createMockBlock({
    slug: `sensor-spi-${csPin}`,
    name: `SPI Sensor ${csPin}`,
    category: 'sensor',
    gridSize: [1, 1],
    bus: {
      spi: { csPin },
      power: {
        requires: [{ rail: '3V3', typicalMa: 10, maxMa: 20 }],
      },
    },
  })

// =============================================================================
// createGridState Tests
// =============================================================================

describe('createGridState', () => {
  it('creates grid with correct dimensions', () => {
    const grid = createGridState(4, 5)

    expect(grid.width).toBe(4)
    expect(grid.height).toBe(5)
  })

  it('initializes all cells as empty', () => {
    const grid = createGridState(3, 3)

    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        const cell = grid.cells.get(`${x},${y}`)
        expect(cell?.blockId).toBeNull()
        expect(cell?.isOrigin).toBe(false)
        expect(cell?.columnBusActive).toBe(false)
      }
    }
  })

  it('initializes with empty placed blocks array', () => {
    const grid = createGridState(2, 2)

    expect(grid.placedBlocks).toEqual([])
  })

  it('creates correct number of cells', () => {
    const grid = createGridState(4, 3)

    expect(grid.cells.size).toBe(12)
  })
})

// =============================================================================
// getEffectiveSize Tests
// =============================================================================

describe('getEffectiveSize', () => {
  it('returns original size for 0 rotation', () => {
    const block = createMockBlock({ gridSize: [2, 3] })
    const [width, height] = getEffectiveSize(block, 0)

    expect(width).toBe(2)
    expect(height).toBe(3)
  })

  it('returns original size for 180 rotation', () => {
    const block = createMockBlock({ gridSize: [2, 3] })
    const [width, height] = getEffectiveSize(block, 180)

    expect(width).toBe(2)
    expect(height).toBe(3)
  })

  it('swaps dimensions for 90 rotation', () => {
    const block = createMockBlock({ gridSize: [2, 3] })
    const [width, height] = getEffectiveSize(block, 90)

    expect(width).toBe(3)
    expect(height).toBe(2)
  })

  it('swaps dimensions for 270 rotation', () => {
    const block = createMockBlock({ gridSize: [2, 3] })
    const [width, height] = getEffectiveSize(block, 270)

    expect(width).toBe(3)
    expect(height).toBe(2)
  })
})

// =============================================================================
// getEdgeMount Tests
// =============================================================================

describe('getEdgeMount', () => {
  it('returns null for block without physical properties', () => {
    const block = createMockBlock()

    expect(getEdgeMount(block)).toBeNull()
  })

  it('returns explicit edgeMount from physical properties', () => {
    const block = createMockBlock({
      physical: { edgeMount: 'south' },
    })

    expect(getEdgeMount(block)).toBe('south')
  })

  it('infers edge mount from large overhang', () => {
    const block = createMockBlock({
      physical: { overhang: { south: 10 } },
    })

    expect(getEdgeMount(block)).toBe('south')
  })

  it('returns null for small overhang', () => {
    const block = createMockBlock({
      physical: { overhang: { south: 3 } },
    })

    expect(getEdgeMount(block)).toBeNull()
  })

  it('prefers explicit edgeMount over inferred', () => {
    const block = createMockBlock({
      physical: {
        edgeMount: 'north',
        overhang: { south: 10 },
      },
    })

    expect(getEdgeMount(block)).toBe('north')
  })
})

// =============================================================================
// canPlaceBlock Tests
// =============================================================================

describe('canPlaceBlock', () => {
  it('allows placement in empty grid', () => {
    const grid = createGridState(4, 4)
    const block = createMockBlock()

    const result = canPlaceBlock(grid, block, 0, 0)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects placement outside grid bounds (negative)', () => {
    const grid = createGridState(4, 4)
    const block = createMockBlock()

    const result = canPlaceBlock(grid, block, -1, 0)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Position (-1,0) is out of bounds')
  })

  it('rejects placement that extends beyond right edge', () => {
    const grid = createGridState(4, 4)
    const block = createMockBlock({ gridSize: [2, 1] })

    const result = canPlaceBlock(grid, block, 3, 0)

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('extends beyond grid right edge')
  })

  it('rejects placement that extends beyond bottom edge', () => {
    const grid = createGridState(4, 4)
    const block = createMockBlock({ gridSize: [1, 2] })

    const result = canPlaceBlock(grid, block, 0, 3)

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('extends beyond grid bottom edge')
  })

  it('rejects placement over occupied cell', () => {
    let grid = createGridState(4, 4)
    const block1 = createMockBlock({ slug: 'block-1' })
    const block2 = createMockBlock({ slug: 'block-2' })

    grid = placeBlock(grid, block1, 1, 1)
    const result = canPlaceBlock(grid, block2, 1, 1)

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('is already occupied')
  })

  it('enforces south edge mount constraint', () => {
    const grid = createGridState(4, 4)
    const block = createUsbcPowerBlock()

    // Try to place away from south edge
    const result = canPlaceBlock(grid, block, 0, 0)

    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('must be placed at south edge')
  })

  it('allows south edge mount at correct position', () => {
    const grid = createGridState(4, 4)
    const block = createUsbcPowerBlock()

    // Place at south edge (row 3 for a 1-height block in 4-row grid)
    const result = canPlaceBlock(grid, block, 0, 3)

    expect(result.valid).toBe(true)
  })

  it('considers rotation when checking bounds', () => {
    const grid = createGridState(4, 4)
    const block = createMockBlock({ gridSize: [3, 1] })

    // At 90 rotation, a 3x1 becomes 1x3
    const result = canPlaceBlock(grid, block, 0, 2, 90)

    expect(result.valid).toBe(false) // 0 + 3 = 3 > 4 rows
  })
})

// =============================================================================
// placeBlock Tests
// =============================================================================

describe('placeBlock', () => {
  it('places block and marks cells as occupied', () => {
    const grid = createGridState(4, 4)
    const block = createMcuBlock() // 2x2

    const newGrid = placeBlock(grid, block, 0, 0)

    expect(newGrid.cells.get('0,0')?.blockId).not.toBeNull()
    expect(newGrid.cells.get('1,0')?.blockId).not.toBeNull()
    expect(newGrid.cells.get('0,1')?.blockId).not.toBeNull()
    expect(newGrid.cells.get('1,1')?.blockId).not.toBeNull()
  })

  it('marks only origin cell as origin', () => {
    const grid = createGridState(4, 4)
    const block = createMcuBlock() // 2x2

    const newGrid = placeBlock(grid, block, 0, 0)

    expect(newGrid.cells.get('0,0')?.isOrigin).toBe(true)
    expect(newGrid.cells.get('1,0')?.isOrigin).toBe(false)
    expect(newGrid.cells.get('0,1')?.isOrigin).toBe(false)
    expect(newGrid.cells.get('1,1')?.isOrigin).toBe(false)
  })

  it('adds block to placedBlocks array', () => {
    const grid = createGridState(4, 4)
    const block = createMockBlock()

    const newGrid = placeBlock(grid, block, 1, 1)

    expect(newGrid.placedBlocks).toHaveLength(1)
    expect(newGrid.placedBlocks[0].block).toBe(block)
    expect(newGrid.placedBlocks[0].placement.gridX).toBe(1)
    expect(newGrid.placedBlocks[0].placement.gridY).toBe(1)
  })

  it('throws on invalid placement', () => {
    const grid = createGridState(4, 4)
    const block = createMockBlock({ gridSize: [5, 1] })

    expect(() => placeBlock(grid, block, 0, 0)).toThrow('Cannot place block')
  })

  it('does not mutate original grid', () => {
    const grid = createGridState(4, 4)
    const block = createMockBlock()

    const newGrid = placeBlock(grid, block, 0, 0)

    expect(grid.cells.get('0,0')?.blockId).toBeNull()
    expect(newGrid.cells.get('0,0')?.blockId).not.toBeNull()
  })

  it('sets column bus as active for occupied cells', () => {
    const grid = createGridState(4, 4)
    const block = createMockBlock()

    const newGrid = placeBlock(grid, block, 0, 0)

    expect(newGrid.cells.get('0,0')?.columnBusActive).toBe(true)
  })
})

// =============================================================================
// removeBlock Tests
// =============================================================================

describe('removeBlock', () => {
  it('removes block and clears cells', () => {
    let grid = createGridState(4, 4)
    const block = createMcuBlock() // 2x2
    grid = placeBlock(grid, block, 0, 0)

    const blockId = grid.placedBlocks[0].placement.blockId
    const newGrid = removeBlock(grid, blockId)

    expect(newGrid.cells.get('0,0')?.blockId).toBeNull()
    expect(newGrid.cells.get('1,0')?.blockId).toBeNull()
    expect(newGrid.cells.get('0,1')?.blockId).toBeNull()
    expect(newGrid.cells.get('1,1')?.blockId).toBeNull()
  })

  it('removes block from placedBlocks array', () => {
    let grid = createGridState(4, 4)
    const block = createMockBlock()
    grid = placeBlock(grid, block, 0, 0)

    const blockId = grid.placedBlocks[0].placement.blockId
    const newGrid = removeBlock(grid, blockId)

    expect(newGrid.placedBlocks).toHaveLength(0)
  })

  it('returns same grid if block not found', () => {
    const grid = createGridState(4, 4)

    const newGrid = removeBlock(grid, 'nonexistent-id')

    expect(newGrid).toBe(grid)
  })

  it('does not affect other blocks', () => {
    let grid = createGridState(4, 4)
    const block1 = createMockBlock({ slug: 'block-1' })
    const block2 = createMockBlock({ slug: 'block-2' })
    grid = placeBlock(grid, block1, 0, 0)
    grid = placeBlock(grid, block2, 2, 0)

    const blockId = grid.placedBlocks[0].placement.blockId
    const newGrid = removeBlock(grid, blockId)

    expect(newGrid.placedBlocks).toHaveLength(1)
    expect(newGrid.placedBlocks[0].block.slug).toBe('block-2')
    expect(newGrid.cells.get('2,0')?.blockId).not.toBeNull()
  })
})

// =============================================================================
// checkColumnContinuity Tests
// =============================================================================

describe('checkColumnContinuity', () => {
  it('returns continuous for fully filled column', () => {
    let grid = createGridState(2, 4)
    // Fill column 0 completely
    for (let y = 0; y < 4; y++) {
      const block = createMockBlock({ slug: `block-${y}` })
      grid = placeBlock(grid, block, 0, y)
    }

    const result = checkColumnContinuity(grid, 0)

    expect(result.continuous).toBe(true)
    expect(result.gaps).toHaveLength(0)
  })

  it('returns continuous for single isolated block', () => {
    let grid = createGridState(4, 6)
    // Just one block in the middle - nothing to connect to
    grid = placeBlock(grid, createMockBlock({ slug: 'lonely-block' }), 1, 2)

    const result = checkColumnContinuity(grid, 1)

    // Single block has nothing to connect to, so it's continuous
    expect(result.continuous).toBe(true)
    expect(result.gaps).toHaveLength(0)
  })

  it('detects single-row gap', () => {
    let grid = createGridState(2, 4)
    // Fill column 0 except row 2
    grid = placeBlock(grid, createMockBlock({ slug: 'block-0' }), 0, 0)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-1' }), 0, 1)
    // Skip row 2
    grid = placeBlock(grid, createMockBlock({ slug: 'block-3' }), 0, 3)

    const result = checkColumnContinuity(grid, 0)

    expect(result.continuous).toBe(false)
    expect(result.gaps).toHaveLength(1)
    expect(result.gaps[0]).toEqual({ startRow: 2, endRow: 2 })
  })

  it('detects multi-row gap', () => {
    let grid = createGridState(2, 6)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-0' }), 0, 0)
    // Gap at rows 1-3
    grid = placeBlock(grid, createMockBlock({ slug: 'block-4' }), 0, 4)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-5' }), 0, 5)

    const result = checkColumnContinuity(grid, 0)

    expect(result.continuous).toBe(false)
    expect(result.gaps).toHaveLength(1)
    expect(result.gaps[0]).toEqual({ startRow: 1, endRow: 3 })
  })

  it('detects multiple gaps', () => {
    let grid = createGridState(2, 6)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-0' }), 0, 0)
    // Gap at row 1
    grid = placeBlock(grid, createMockBlock({ slug: 'block-2' }), 0, 2)
    // Gap at row 3
    grid = placeBlock(grid, createMockBlock({ slug: 'block-4' }), 0, 4)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-5' }), 0, 5)

    const result = checkColumnContinuity(grid, 0)

    expect(result.continuous).toBe(false)
    expect(result.gaps).toHaveLength(2)
  })

  it('ignores gap at start of column (no block to connect to)', () => {
    let grid = createGridState(2, 4)
    // Gap at row 0, but nothing above to connect to
    grid = placeBlock(grid, createMockBlock({ slug: 'block-1' }), 0, 1)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-2' }), 0, 2)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-3' }), 0, 3)

    const result = checkColumnContinuity(grid, 0)

    // Should be continuous - gap at top doesn't disconnect anything
    expect(result.continuous).toBe(true)
    expect(result.gaps).toHaveLength(0)
  })

  it('ignores gap at end of column (no block to connect to)', () => {
    let grid = createGridState(2, 4)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-0' }), 0, 0)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-1' }), 0, 1)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-2' }), 0, 2)
    // Gap at row 3, but nothing below to connect to

    const result = checkColumnContinuity(grid, 0)

    // Should be continuous - gap at bottom doesn't disconnect anything
    expect(result.continuous).toBe(true)
    expect(result.gaps).toHaveLength(0)
  })
})

// =============================================================================
// validateBusContinuity Tests
// =============================================================================

describe('validateBusContinuity', () => {
  it('returns valid for empty grid', () => {
    const grid = createGridState(4, 4)

    const result = validateBusContinuity(grid)

    // Empty grid has no columns with blocks, so no continuity check needed
    expect(result.valid).toBe(true)
  })

  it('returns valid for complete column coverage', () => {
    let grid = createGridState(2, 3)
    // Fill both columns completely
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 3; y++) {
        grid = placeBlock(grid, createMockBlock({ slug: `block-${x}-${y}` }), x, y)
      }
    }

    const result = validateBusContinuity(grid)

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns invalid when column has gap', () => {
    let grid = createGridState(2, 3)
    // Column 0: fill all
    grid = placeBlock(grid, createMockBlock({ slug: 'block-0-0' }), 0, 0)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-0-1' }), 0, 1)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-0-2' }), 0, 2)
    // Column 1: gap at row 1
    grid = placeBlock(grid, createMockBlock({ slug: 'block-1-0' }), 1, 0)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-1-2' }), 1, 2)

    const result = validateBusContinuity(grid)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Bus discontinuity in column 1 at row 1')
  })

  it('identifies all columns with gaps', () => {
    let grid = createGridState(3, 3)
    // Column 0: gap
    grid = placeBlock(grid, createMockBlock({ slug: 'block-0-0' }), 0, 0)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-0-2' }), 0, 2)
    // Column 1: filled
    grid = placeBlock(grid, createMockBlock({ slug: 'block-1-0' }), 1, 0)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-1-1' }), 1, 1)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-1-2' }), 1, 2)
    // Column 2: gap
    grid = placeBlock(grid, createMockBlock({ slug: 'block-2-0' }), 2, 0)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-2-2' }), 2, 2)

    const result = validateBusContinuity(grid)

    expect(result.columnGaps.has(0)).toBe(true)
    expect(result.columnGaps.has(1)).toBe(false)
    expect(result.columnGaps.has(2)).toBe(true)
  })
})

// =============================================================================
// suggestPassthroughPlacements Tests
// =============================================================================

describe('suggestPassthroughPlacements', () => {
  it('returns empty array when no gaps', () => {
    let grid = createGridState(2, 2)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-0-0' }), 0, 0)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-0-1' }), 0, 1)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-1-0' }), 1, 0)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-1-1' }), 1, 1)

    const suggestions = suggestPassthroughPlacements(grid)

    expect(suggestions).toHaveLength(0)
  })

  it('suggests passthrough for each gap cell', () => {
    let grid = createGridState(2, 4)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-0' }), 0, 0)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-3' }), 0, 3)
    // Gap at rows 1 and 2 in column 0

    const suggestions = suggestPassthroughPlacements(grid)

    expect(suggestions).toHaveLength(2)
    expect(suggestions.some((s) => s.gridX === 0 && s.gridY === 1)).toBe(true)
    expect(suggestions.some((s) => s.gridX === 0 && s.gridY === 2)).toBe(true)
    expect(suggestions.every((s) => s.type === 'add_passthrough')).toBe(true)
    expect(suggestions.every((s) => s.blockSlug === '1x1-passthrough')).toBe(true)
  })

  it('suggests passthroughs for multiple columns', () => {
    let grid = createGridState(2, 3)
    // Both columns have gap at row 1
    grid = placeBlock(grid, createMockBlock({ slug: 'block-0-0' }), 0, 0)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-0-2' }), 0, 2)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-1-0' }), 1, 0)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-1-2' }), 1, 2)

    const suggestions = suggestPassthroughPlacements(grid)

    expect(suggestions).toHaveLength(2)
    expect(suggestions.some((s) => s.gridX === 0 && s.gridY === 1)).toBe(true)
    expect(suggestions.some((s) => s.gridX === 1 && s.gridY === 1)).toBe(true)
  })
})

// =============================================================================
// calculatePowerBudget Tests
// =============================================================================

describe('calculatePowerBudget', () => {
  it('aggregates power provisions', () => {
    const blocks = [
      createMcuBlock(), // Provides 3V3@500mA
      createUsbcPowerBlock(), // Provides 5V0@3000mA
    ]

    const budget = calculatePowerBudget(blocks)

    expect(budget.provides['3V3']).toBe(500)
    expect(budget.provides['5V0']).toBe(3000)
  })

  it('aggregates power requirements', () => {
    const blocks = [
      createIoBlock(), // Requires 3V3@10mA max
      createI2cSensorBlock(0x76), // Requires 3V3@5mA max
    ]

    const budget = calculatePowerBudget(blocks)

    expect(budget.requires['3V3'].max).toBe(15)
    expect(budget.requires['3V3'].typical).toBe(7)
  })

  it('warns when power budget exceeded', () => {
    const hungryBlock = createMockBlock({
      bus: {
        power: {
          requires: [{ rail: '3V3', typicalMa: 400, maxMa: 600 }],
        },
      },
    })

    const budget = calculatePowerBudget([createMcuBlock(), hungryBlock])

    expect(budget.errors.some((e) => e.includes('3V3 rail budget exceeded'))).toBe(true)
  })

  it('warns when no provider for required rail', () => {
    const blocks = [createI2cSensorBlock(0x76)] // Requires 3V3 but no provider

    const budget = calculatePowerBudget(blocks)

    expect(budget.errors.some((e) => e.includes('No block provides 3V3'))).toBe(true)
  })

  it('warns when power near capacity', () => {
    const block1 = createMockBlock({
      bus: {
        power: {
          requires: [{ rail: '3V3', typicalMa: 450, maxMa: 480 }], // 90% typical
        },
      },
    })

    const budget = calculatePowerBudget([createMcuBlock(), block1])

    expect(budget.warnings.some((w) => w.includes('near capacity'))).toBe(true)
  })

  it('calculates margin percentages', () => {
    const blocks = [
      createMcuBlock(), // Provides 3V3@500mA
      createIoBlock(), // Requires 3V3@10mA max
    ]

    const budget = calculatePowerBudget(blocks)

    expect(budget.marginPercent['3V3']).toBe(98) // (500-10)/500*100
  })
})

// =============================================================================
// Interface Conflict Tests
// =============================================================================

describe('checkI2cConflicts', () => {
  it('returns empty for no conflicts', () => {
    const blocks = [createI2cSensorBlock(0x76), createI2cSensorBlock(0x48)]

    const errors = checkI2cConflicts(blocks)

    expect(errors).toHaveLength(0)
  })

  it('detects I2C address conflict', () => {
    const blocks = [createI2cSensorBlock(0x76), createI2cSensorBlock(0x76)]

    const errors = checkI2cConflicts(blocks)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('I2C address conflict at 0x76')
  })

  it('reports all conflicting blocks', () => {
    const blocks = [
      createMockBlock({
        slug: 'sensor-a',
        name: 'Sensor A',
        bus: { i2c: { addresses: [0x76] } },
      }),
      createMockBlock({
        slug: 'sensor-b',
        name: 'Sensor B',
        bus: { i2c: { addresses: [0x76] } },
      }),
    ]

    const errors = checkI2cConflicts(blocks)

    expect(errors[0]).toContain('Sensor A')
    expect(errors[0]).toContain('Sensor B')
  })
})

describe('checkGpioConflicts', () => {
  it('returns empty for no conflicts', () => {
    const block1 = createMockBlock({
      bus: { gpio: { claims: ['GPIO0'] } },
    })
    const block2 = createMockBlock({
      bus: { gpio: { claims: ['GPIO1'] } },
    })

    const errors = checkGpioConflicts([block1, block2])

    expect(errors).toHaveLength(0)
  })

  it('detects GPIO conflict', () => {
    const block1 = createMockBlock({
      slug: 'block-a',
      name: 'Block A',
      bus: { gpio: { claims: ['GPIO0', 'GPIO1'] } },
    })
    const block2 = createMockBlock({
      slug: 'block-b',
      name: 'Block B',
      bus: { gpio: { claims: ['GPIO1', 'GPIO2'] } },
    })

    const errors = checkGpioConflicts([block1, block2])

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('GPIO1')
    expect(errors[0]).toContain('Block A')
    expect(errors[0]).toContain('Block B')
  })
})

describe('checkSpiConflicts', () => {
  it('returns empty for no conflicts', () => {
    const blocks = [createSpiSensorBlock('SPI0_CS0'), createSpiSensorBlock('SPI0_CS1')]

    const errors = checkSpiConflicts(blocks)

    expect(errors).toHaveLength(0)
  })

  it('detects SPI CS conflict', () => {
    const blocks = [createSpiSensorBlock('SPI0_CS0'), createSpiSensorBlock('SPI0_CS0')]

    const errors = checkSpiConflicts(blocks)

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('SPI chip select conflict')
    expect(errors[0]).toContain('SPI0_CS0')
  })
})

// =============================================================================
// validateGrid Tests
// =============================================================================

describe('validateGrid', () => {
  it('returns valid for empty grid', () => {
    const grid = createGridState(4, 4)

    const result = validateGrid(grid)

    expect(result.valid).toBe(true)
  })

  it('requires MCU block', () => {
    let grid = createGridState(4, 4)
    grid = placeBlock(grid, createIoBlock(), 0, 0)

    const result = validateGrid(grid)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('No MCU block placed. An MCU is required to define the bus.')
  })

  it('combines all validation errors', () => {
    let grid = createGridState(2, 3)
    // Place MCU (2x2) at origin
    grid = placeBlock(grid, createMcuBlock(), 0, 0)
    // Place two sensors with same I2C address
    const sensor1 = createI2cSensorBlock(0x76)
    const sensor2 = { ...createI2cSensorBlock(0x76), slug: 'sensor-76-2', name: 'Sensor 2' }
    grid = placeBlock(grid, sensor1, 0, 2)
    grid = placeBlock(grid, sensor2, 1, 2)

    const result = validateGrid(grid)

    expect(result.errors.some((e) => e.includes('I2C address conflict'))).toBe(true)
  })

  it('provides suggested fixes for bus gaps', () => {
    let grid = createGridState(2, 4)
    grid = placeBlock(grid, createMcuBlock(), 0, 0) // Covers (0,0), (1,0), (0,1), (1,1)
    // Gap at rows 2
    grid = placeBlock(grid, createMockBlock({ slug: 'block-0-3' }), 0, 3)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-1-3' }), 1, 3)

    const result = validateGrid(grid)

    expect(result.suggestedFixes.length).toBeGreaterThan(0)
    expect(result.suggestedFixes.some((f) => f.type === 'add_passthrough')).toBe(true)
  })
})

// =============================================================================
// calculateBoardSize Tests
// =============================================================================

describe('calculateBoardSize', () => {
  it('returns zero for empty grid', () => {
    const grid = createGridState(4, 4)

    const size = calculateBoardSize(grid)

    expect(size.width).toBe(0)
    expect(size.height).toBe(0)
  })

  it('calculates size from placed blocks', () => {
    let grid = createGridState(10, 10)
    grid = placeBlock(grid, createMcuBlock(), 1, 1) // 2x2 at (1,1) -> ends at (3,3)
    grid = placeBlock(grid, createMockBlock(), 4, 0) // 1x1 at (4,0) -> ends at (5,1)

    const size = calculateBoardSize(grid)

    expect(size.width).toBe(5)
    expect(size.height).toBe(3)
  })

  it('calculates mm dimensions', () => {
    let grid = createGridState(10, 10)
    grid = placeBlock(grid, createMcuBlock(), 0, 0) // 2x2

    const size = calculateBoardSize(grid)

    expect(size.widthMm).toBe(2 * GRID_UNIT_MM)
    expect(size.heightMm).toBe(2 * GRID_UNIT_MM)
  })
})

// =============================================================================
// findAvailablePosition Tests
// =============================================================================

describe('findAvailablePosition', () => {
  it('finds position in empty grid', () => {
    const grid = createGridState(4, 4)
    const block = createMockBlock()

    const pos = findAvailablePosition(grid, block)

    expect(pos).toEqual({ x: 0, y: 0 })
  })

  it('finds next available position', () => {
    let grid = createGridState(4, 4)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-1' }), 0, 0)

    const pos = findAvailablePosition(grid, createMockBlock())

    expect(pos?.x).not.toBe(0)
    expect(pos?.y).toBe(0) // Should be in same row if space available
  })

  it('returns null if no space', () => {
    let grid = createGridState(2, 2)
    grid = placeBlock(grid, createMcuBlock(), 0, 0) // Fills entire 2x2 grid

    const pos = findAvailablePosition(grid, createMockBlock())

    expect(pos).toBeNull()
  })

  it('respects edge mount constraints', () => {
    const grid = createGridState(4, 4)
    const block = createUsbcPowerBlock() // Must be at south edge

    const pos = findAvailablePosition(grid, block)

    expect(pos?.y).toBe(3) // South edge of 4-row grid
  })
})

// =============================================================================
// toPlacedBlocks / fromPlacedBlocks Tests
// =============================================================================

describe('toPlacedBlocks', () => {
  it('extracts placement data from grid', () => {
    let grid = createGridState(4, 4)
    grid = placeBlock(grid, createMockBlock({ slug: 'block-a' }), 1, 2)

    const placements = toPlacedBlocks(grid)

    expect(placements).toHaveLength(1)
    expect(placements[0].blockSlug).toBe('block-a')
    expect(placements[0].gridX).toBe(1)
    expect(placements[0].gridY).toBe(2)
  })
})

describe('fromPlacedBlocks', () => {
  it('reconstructs grid from placements', () => {
    const blockDefs = new Map<string, BlockDefinition>([
      ['mcu', createMcuBlock()],
      ['io', createIoBlock()],
    ])

    const placements = [
      { blockId: 'id-1', blockSlug: 'mcu', gridX: 0, gridY: 0, rotation: 0 as const },
      { blockId: 'id-2', blockSlug: 'io', gridX: 2, gridY: 0, rotation: 0 as const },
    ]

    const grid = fromPlacedBlocks(placements, blockDefs, 4, 4)

    expect(grid.placedBlocks).toHaveLength(2)
    expect(grid.cells.get('0,0')?.blockId).toBe('id-1')
    expect(grid.cells.get('2,0')?.blockId).toBe('id-2')
  })

  it('skips blocks not found in definitions', () => {
    const blockDefs = new Map<string, BlockDefinition>()

    const placements = [
      { blockId: 'id-1', blockSlug: 'unknown', gridX: 0, gridY: 0, rotation: 0 as const },
    ]

    const grid = fromPlacedBlocks(placements, blockDefs, 4, 4)

    expect(grid.placedBlocks).toHaveLength(0)
  })
})

// =============================================================================
// expandGridToFit Tests
// =============================================================================

describe('expandGridToFit', () => {
  it('returns same grid if block fits', () => {
    const grid = createGridState(4, 4)
    const block = createMockBlock()

    const newGrid = expandGridToFit(grid, block, 0, 0)

    expect(newGrid).toBe(grid)
  })

  it('expands grid horizontally', () => {
    const grid = createGridState(2, 2)
    const block = createMockBlock({ gridSize: [2, 1] })

    const newGrid = expandGridToFit(grid, block, 2, 0)

    expect(newGrid.width).toBe(4)
    expect(newGrid.height).toBe(2)
  })

  it('expands grid vertically', () => {
    const grid = createGridState(2, 2)
    const block = createMockBlock({ gridSize: [1, 2] })

    const newGrid = expandGridToFit(grid, block, 0, 2)

    expect(newGrid.width).toBe(2)
    expect(newGrid.height).toBe(4)
  })

  it('preserves existing blocks', () => {
    let grid = createGridState(2, 2)
    grid = placeBlock(grid, createMockBlock({ slug: 'existing' }), 0, 0)

    const newGrid = expandGridToFit(grid, createMockBlock(), 3, 0)

    expect(newGrid.placedBlocks).toHaveLength(1)
    expect(newGrid.cells.get('0,0')?.blockId).not.toBeNull()
  })
})
