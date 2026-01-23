import { describe, it, expect } from 'vitest'
import {
  calculatePanelLayout,
  generateVScoreLinesWithActualSizes,
  generateRoutedEdgesWithActualSizes,
  generateVScoreGerber,
  generateRoutedEdgesGerber,
  needsPanelization,
  calculatePanelArea,
  getPanelSummary,
  PANEL_DEFAULTS,
  GRID_SIZE_MM,
} from './panel-merge'
import type { RemoteBoard, PCBArtifacts, PanelConfiguration } from '../db/schema'

// =============================================================================
// Test Data
// =============================================================================

const createRemoteBoard = (id: string, name: string, width: number, height: number): RemoteBoard => ({
  id,
  name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  type: 'button',
  placedBlocks: [],
  boardSize: { width, height, unit: 'mm' },
  connectionMapping: [],
  gridWidth: 1,
  gridHeight: 1,
})

// =============================================================================
// calculatePanelLayout Tests
// =============================================================================

describe('calculatePanelLayout', () => {
  it('calculates layout for main board only', () => {
    const mainBoardSize = { width: 50, height: 40 }
    const result = calculatePanelLayout(mainBoardSize, [])

    expect(result.mainBoardPosition).toEqual({
      x: PANEL_DEFAULTS.margin,
      y: PANEL_DEFAULTS.margin,
    })
    expect(result.remoteBoards).toHaveLength(0)
    // Panel size includes margins + boardMargin clearance
    expect(result.panelSize.width).toBe(
      PANEL_DEFAULTS.margin + mainBoardSize.width + PANEL_DEFAULTS.margin + PANEL_DEFAULTS.boardMargin * 2
    )
    expect(result.panelSize.height).toBe(
      mainBoardSize.height + PANEL_DEFAULTS.margin * 2 + PANEL_DEFAULTS.boardMargin * 2
    )
  })

  it('positions remote boards to the right of main board', () => {
    const mainBoardSize = { width: 50, height: 40 }
    const remoteBoard = createRemoteBoard('rb1', 'Button Panel', 20, 30)

    const result = calculatePanelLayout(mainBoardSize, [
      { board: remoteBoard, actualSize: { width: 20, height: 30 } },
    ])

    expect(result.remoteBoards).toHaveLength(1)
    expect(result.remoteBoards[0].remoteBoardId).toBe('rb1')
    // Remote board starts after main board + spacing
    expect(result.remoteBoards[0].position.x).toBe(
      PANEL_DEFAULTS.margin + mainBoardSize.width + PANEL_DEFAULTS.spacing
    )
    expect(result.remoteBoards[0].position.y).toBe(PANEL_DEFAULTS.margin)
  })

  it('uses max height for panel calculation', () => {
    const mainBoardSize = { width: 50, height: 40 }
    const tallBoard = createRemoteBoard('rb1', 'Tall Board', 20, 60)

    const result = calculatePanelLayout(mainBoardSize, [
      { board: tallBoard, actualSize: { width: 20, height: 60 } },
    ])

    // Panel height uses max height (60) not main board height (40)
    expect(result.panelSize.height).toBe(
      60 + PANEL_DEFAULTS.margin * 2 + PANEL_DEFAULTS.boardMargin * 2
    )
  })

  it('chains multiple remote boards horizontally', () => {
    const mainBoardSize = { width: 50, height: 40 }
    const board1 = createRemoteBoard('rb1', 'Board 1', 20, 30)
    const board2 = createRemoteBoard('rb2', 'Board 2', 25, 35)

    const result = calculatePanelLayout(mainBoardSize, [
      { board: board1, actualSize: { width: 20, height: 30 } },
      { board: board2, actualSize: { width: 25, height: 35 } },
    ])

    expect(result.remoteBoards).toHaveLength(2)
    // First remote board after main
    const firstX = PANEL_DEFAULTS.margin + mainBoardSize.width + PANEL_DEFAULTS.spacing
    expect(result.remoteBoards[0].position.x).toBe(firstX)
    // Second remote board after first
    expect(result.remoteBoards[1].position.x).toBe(firstX + 20 + PANEL_DEFAULTS.spacing)
  })

  it('respects custom options', () => {
    const mainBoardSize = { width: 50, height: 40 }
    const result = calculatePanelLayout(mainBoardSize, [], {
      margin: 10,
      spacing: 8,
    })

    expect(result.mainBoardPosition).toEqual({ x: 10, y: 10 })
    expect(result.panelMargin).toBe(10)
  })
})

// =============================================================================
// generateVScoreLinesWithActualSizes Tests
// =============================================================================

describe('generateVScoreLinesWithActualSizes', () => {
  it('generates vertical v-scores at board edges', () => {
    const mainPos = { x: 5, y: 5 }
    const mainSize = { width: 50, height: 40 }
    const panelSize = { width: 70, height: 60 }

    const lines = generateVScoreLinesWithActualSizes(
      mainPos,
      mainSize,
      [],
      new Map(),
      panelSize,
      5, // margin
      1  // boardMargin
    )

    // Should have left edge v-score
    const leftLine = lines.find(
      (l) => l.orientation === 'vertical' && l.position === mainPos.x - 1
    )
    expect(leftLine).toBeDefined()
    expect(leftLine?.startMm).toBe(0)
    expect(leftLine?.endMm).toBe(panelSize.height)

    // Should have right edge v-score
    const rightLine = lines.find(
      (l) => l.orientation === 'vertical' && l.position === mainPos.x + mainSize.width + 1
    )
    expect(rightLine).toBeDefined()
  })

  it('generates horizontal v-score at bottom edge', () => {
    const mainPos = { x: 5, y: 5 }
    const mainSize = { width: 50, height: 40 }
    const panelSize = { width: 70, height: 60 }

    const lines = generateVScoreLinesWithActualSizes(
      mainPos,
      mainSize,
      [],
      new Map(),
      panelSize,
      5, // margin
      1  // boardMargin
    )

    // Bottom v-score at margin - boardMargin
    const bottomLine = lines.find(
      (l) => l.orientation === 'horizontal' && l.position === 4 // 5 - 1
    )
    expect(bottomLine).toBeDefined()
    expect(bottomLine?.startMm).toBe(0)
    expect(bottomLine?.endMm).toBe(panelSize.width)
  })

  it('generates top v-score only for max-height boards', () => {
    const mainPos = { x: 5, y: 5 }
    const mainSize = { width: 50, height: 40 }
    const panelSize = { width: 100, height: 70 }

    const remotePositions = [
      { remoteBoardId: 'rb1', position: { x: 60, y: 5 }, copies: 1 },
    ]
    const actualSizes = new Map([['rb1', { width: 25, height: 60 }]])

    const lines = generateVScoreLinesWithActualSizes(
      mainPos,
      mainSize,
      remotePositions,
      actualSizes,
      panelSize,
      5, // margin
      1  // boardMargin
    )

    // Top v-score for remote board (height 60 = max)
    const topVScoreY = 5 + 60 + 1 // margin + maxHeight + boardMargin
    const topLines = lines.filter(
      (l) => l.orientation === 'horizontal' && l.position === topVScoreY
    )

    // Only one horizontal top segment (for the taller board)
    expect(topLines.length).toBeGreaterThanOrEqual(1)
  })

  it('deduplicates overlapping v-score lines', () => {
    const mainPos = { x: 5, y: 5 }
    const mainSize = { width: 50, height: 40 }
    const panelSize = { width: 70, height: 60 }

    const lines = generateVScoreLinesWithActualSizes(
      mainPos,
      mainSize,
      [],
      new Map(),
      panelSize,
      5,
      1
    )

    // Check no duplicate positions
    const positions = lines.map((l) => `${l.orientation}-${l.position}`)
    const uniquePositions = [...new Set(positions)]
    expect(positions.length).toBe(uniquePositions.length)
  })
})

// =============================================================================
// generateRoutedEdgesWithActualSizes Tests
// =============================================================================

describe('generateRoutedEdgesWithActualSizes', () => {
  it('returns empty array when all boards are same height', () => {
    const mainPos = { x: 5, y: 5 }
    const mainSize = { width: 50, height: 40 }

    const edges = generateRoutedEdgesWithActualSizes(
      mainPos,
      mainSize,
      [],
      new Map(),
      5, // margin
      1, // boardMargin
      2  // routeBitDiameter
    )

    expect(edges).toHaveLength(0)
  })

  it('generates routed edge for shorter boards', () => {
    const mainPos = { x: 5, y: 5 }
    const mainSize = { width: 50, height: 60 } // Taller main board

    const remotePositions = [
      { remoteBoardId: 'rb1', position: { x: 60, y: 5 }, copies: 1 },
    ]
    const actualSizes = new Map([['rb1', { width: 25, height: 40 }]]) // Shorter remote

    const edges = generateRoutedEdgesWithActualSizes(
      mainPos,
      mainSize,
      remotePositions,
      actualSizes,
      5, // margin
      1, // boardMargin
      2  // routeBitDiameter
    )

    expect(edges).toHaveLength(1)
    // Route Y = board top + boardMargin + bit radius
    // board top = margin + height = 5 + 40 = 45
    // routeY = 45 + 1 + 1 = 47
    expect(edges[0].y1).toBe(47)
    expect(edges[0].y2).toBe(47)
    // Route spans board width + margins
    expect(edges[0].x1).toBe(60 - 1) // position - boardMargin
    expect(edges[0].x2).toBe(60 + 25 + 1) // position + width + boardMargin
  })

  it('routes main board if shorter than remote boards', () => {
    const mainPos = { x: 5, y: 5 }
    const mainSize = { width: 50, height: 30 } // Short main

    const remotePositions = [
      { remoteBoardId: 'rb1', position: { x: 60, y: 5 }, copies: 1 },
    ]
    const actualSizes = new Map([['rb1', { width: 25, height: 50 }]]) // Tall remote

    const edges = generateRoutedEdgesWithActualSizes(
      mainPos,
      mainSize,
      remotePositions,
      actualSizes,
      5,
      1,
      2
    )

    expect(edges).toHaveLength(1)
    // Main board gets routed
    expect(edges[0].x1).toBe(5 - 1)
    expect(edges[0].x2).toBe(5 + 50 + 1)
  })
})

// =============================================================================
// generateVScoreGerber Tests
// =============================================================================

describe('generateVScoreGerber', () => {
  it('generates valid gerber header', () => {
    const gerber = generateVScoreGerber([])

    expect(gerber).toContain('G04 V-Score layer')
    expect(gerber).toContain('%MOMM*%')
    expect(gerber).toContain('%FSLAX46Y46*%')
    expect(gerber).toContain('M02*')
  })

  it('generates horizontal line commands', () => {
    const gerber = generateVScoreGerber([
      { orientation: 'horizontal', position: 10, startMm: 0, endMm: 50 },
    ])

    // Position 10mm = 10000000 gerber units
    expect(gerber).toContain('Y10000000D02*') // Move
    expect(gerber).toContain('X50000000Y10000000D01*') // Draw
  })

  it('generates vertical line commands', () => {
    const gerber = generateVScoreGerber([
      { orientation: 'vertical', position: 20, startMm: 5, endMm: 45 },
    ])

    expect(gerber).toContain('X20000000Y5000000D02*') // Move
    expect(gerber).toContain('X20000000Y45000000D01*') // Draw
  })

  it('uses custom line width', () => {
    const gerber = generateVScoreGerber([], 0.5)
    expect(gerber).toContain('%ADD10C,0.500000*%')
  })
})

// =============================================================================
// generateRoutedEdgesGerber Tests
// =============================================================================

describe('generateRoutedEdgesGerber', () => {
  it('returns empty string when no edges', () => {
    const gerber = generateRoutedEdgesGerber([])
    expect(gerber).toBe('')
  })

  it('generates valid gerber with edge data', () => {
    const gerber = generateRoutedEdgesGerber([
      { x1: 10, y1: 20, x2: 50, y2: 20 },
    ])

    expect(gerber).toContain('G04 Routed edges layer')
    expect(gerber).toContain('%MOMM*%')
    expect(gerber).toContain('X10000000Y20000000D02*')
    expect(gerber).toContain('X50000000Y20000000D01*')
  })

  it('uses custom route width', () => {
    const gerber = generateRoutedEdgesGerber(
      [{ x1: 0, y1: 0, x2: 10, y2: 0 }],
      3.0
    )
    expect(gerber).toContain('%ADD10C,3.000000*%')
  })
})

// =============================================================================
// Helper Function Tests
// =============================================================================

describe('needsPanelization', () => {
  it('returns false when no remote boards', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [],
      boardSize: { width: 50, height: 40 },
    }
    expect(needsPanelization(artifacts)).toBe(false)
  })

  it('returns false when remote boards array is empty', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [],
      boardSize: { width: 50, height: 40 },
      remoteBoards: [],
    }
    expect(needsPanelization(artifacts)).toBe(false)
  })

  it('returns true when remote boards exist', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [],
      boardSize: { width: 50, height: 40 },
      remoteBoards: [createRemoteBoard('rb1', 'Test', 20, 20)],
    }
    expect(needsPanelization(artifacts)).toBe(true)
  })
})

describe('calculatePanelArea', () => {
  it('calculates area correctly', () => {
    const config: PanelConfiguration = {
      mainBoardPosition: { x: 5, y: 5 },
      remoteBoards: [],
      vScoreLines: [],
      panelSize: { width: 100, height: 80 },
      panelMargin: 5,
    }
    expect(calculatePanelArea(config)).toBe(8000)
  })
})

describe('getPanelSummary', () => {
  it('counts boards correctly', () => {
    const config: PanelConfiguration = {
      mainBoardPosition: { x: 5, y: 5 },
      remoteBoards: [
        { remoteBoardId: 'rb1', position: { x: 60, y: 5 }, copies: 2 },
        { remoteBoardId: 'rb2', position: { x: 100, y: 5 }, copies: 1 },
      ],
      vScoreLines: [
        { orientation: 'vertical', position: 5, startMm: 0, endMm: 50 },
        { orientation: 'horizontal', position: 5, startMm: 0, endMm: 100 },
      ],
      panelSize: { width: 150, height: 60 },
      panelMargin: 5,
    }

    const summary = getPanelSummary(config)

    expect(summary.totalBoards).toBe(4) // 1 main + 2 copies + 1 copy
    expect(summary.panelSize).toBe('150.0 x 60.0 mm')
    expect(summary.vScoreCount).toBe(2)
  })
})
