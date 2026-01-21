/**
 * Panel Merge Service
 *
 * Handles panelization of main board with remote boards for manufacturing.
 * Generates v-score lines for separating boards after assembly.
 *
 * Features:
 * - Calculate optimal panel layout
 * - Generate v-score lines at board edges
 * - Merge gerbers into panelized output
 */

import type {
  PanelConfiguration,
  VScoreLine,
  RoutedEdge,
  RemoteBoard,
  PCBArtifacts,
} from '../db/schema'
import {
  mergeGerbers,
  parseBoardDimensionsFromEdgeCuts,
  type GerberBlock,
  type MergedGerbers,
} from './gerber-merge'

// =============================================================================
// Types
// =============================================================================

export interface BoardWithGerbers {
  board: RemoteBoard
  gerbers: MergedGerbers
  /** Actual dimensions parsed from gerber edge cuts */
  actualSize: { width: number; height: number }
}

// =============================================================================
// Constants
// =============================================================================

export const PANEL_DEFAULTS = {
  margin: 5, // mm from panel edge to board
  spacing: 4, // mm between boards (must accommodate boardMargin*2 + routeBitDiameter for routing clearance)
  railWidth: 5, // mm for edge rails
  vScoreWidth: 0.3, // mm v-score line width
  boardMargin: 1, // mm between v-score/route and board copper
  routeBitDiameter: 2, // mm routing bit diameter
} as const

export const GRID_SIZE_MM = 12.7

// =============================================================================
// Panel Layout Calculation
// =============================================================================

/**
 * Calculate panel layout for main board and remote boards
 *
 * @param mainBoardSize - Actual dimensions of the main board (from gerber edge cuts)
 * @param remoteBoardsWithSizes - Remote boards with their actual gerber dimensions
 * @param options - Panel configuration options
 */
export function calculatePanelLayout(
  mainBoardSize: { width: number; height: number },
  remoteBoardsWithSizes: Array<{ board: RemoteBoard; actualSize: { width: number; height: number } }>,
  options: Partial<typeof PANEL_DEFAULTS> = {}
): PanelConfiguration {
  const config = { ...PANEL_DEFAULTS, ...options }

  // Calculate main board position (starts after margin)
  const mainBoardPosition = {
    x: config.margin,
    y: config.margin,
  }

  // Track current X position for placing remote boards
  let currentX = config.margin + mainBoardSize.width + config.spacing

  // Position remote boards to the right of main board
  const remoteBoardPositions: PanelConfiguration['remoteBoards'] = []
  let maxHeight = mainBoardSize.height

  // Build a map of actual sizes for v-score calculation
  const actualSizes = new Map<string, { width: number; height: number }>()

  for (const { board, actualSize } of remoteBoardsWithSizes) {
    // Use ACTUAL gerber dimensions, not the RemoteBoard.boardSize property
    const boardWidth = actualSize.width
    const boardHeight = actualSize.height

    actualSizes.set(board.id, actualSize)

    remoteBoardPositions.push({
      remoteBoardId: board.id,
      position: {
        x: currentX,
        y: config.margin,
      },
      copies: 1,
    })

    currentX += boardWidth + config.spacing
    maxHeight = Math.max(maxHeight, boardHeight)
  }

  // Calculate total panel size (includes boardMargin for v-score clearance)
  const panelWidth = currentX - config.spacing + config.margin + config.boardMargin * 2
  const panelHeight = maxHeight + config.margin * 2 + config.boardMargin * 2

  // Generate v-score lines using actual sizes
  const vScoreLines = generateVScoreLinesWithActualSizes(
    mainBoardPosition,
    mainBoardSize,
    remoteBoardPositions,
    actualSizes,
    { width: panelWidth, height: panelHeight },
    config.margin,
    config.boardMargin
  )

  // Generate routed edges (for boards shorter than the tallest)
  const routedEdges = generateRoutedEdgesWithActualSizes(
    mainBoardPosition,
    mainBoardSize,
    remoteBoardPositions,
    actualSizes,
    config.margin,
    config.boardMargin,
    config.routeBitDiameter
  )

  return {
    mainBoardPosition,
    remoteBoards: remoteBoardPositions,
    vScoreLines,
    routedEdges,
    panelSize: { width: panelWidth, height: panelHeight },
    panelMargin: config.margin,
  }
}

/**
 * Legacy calculatePanelLayout that uses RemoteBoard.boardSize
 * @deprecated Use calculatePanelLayout with actual gerber sizes instead
 */
export function calculatePanelLayoutLegacy(
  mainBoardSize: { width: number; height: number },
  remoteBoards: RemoteBoard[],
  options: Partial<typeof PANEL_DEFAULTS> = {}
): PanelConfiguration {
  // Convert to new format using boardSize property
  const remoteBoardsWithSizes = remoteBoards.map(board => ({
    board,
    actualSize: { width: board.boardSize.width, height: board.boardSize.height }
  }))
  return calculatePanelLayout(mainBoardSize, remoteBoardsWithSizes, options)
}

/**
 * Generate v-score lines for panel separation using actual gerber-derived sizes
 *
 * V-scores are placed boardMargin (1mm) OUTSIDE the board edge, so:
 * v-score | 1mm gap | board copper | 1mm gap | v-score
 *
 * Strategy:
 * - All vertical edges: v-score at board_edge ± boardMargin
 * - Bottom edges: v-score at bottom - boardMargin
 * - Top edges of shorter boards: routed (can't v-score partial width)
 * - Top edge of tallest board(s): v-score at top + boardMargin
 */
export function generateVScoreLinesWithActualSizes(
  mainBoardPosition: { x: number; y: number },
  mainBoardSize: { width: number; height: number },
  remoteBoardPositions: PanelConfiguration['remoteBoards'],
  actualSizes: Map<string, { width: number; height: number }>,
  panelSize: { width: number; height: number },
  margin: number,
  boardMargin: number = PANEL_DEFAULTS.boardMargin
): VScoreLine[] {
  const lines: VScoreLine[] = []

  // Collect all actual heights and board info for top v-score calculation
  const allHeights = [mainBoardSize.height]
  for (const pos of remoteBoardPositions) {
    const size = actualSizes.get(pos.remoteBoardId)
    if (size) allHeights.push(size.height)
  }
  const maxHeight = Math.max(...allHeights)

  // V-score positions
  const bottomVScoreY = margin - boardMargin
  const topVScoreY = margin + maxHeight + boardMargin

  // Main board left edge
  lines.push({
    orientation: 'vertical',
    position: mainBoardPosition.x - boardMargin,
    startMm: 0,
    endMm: panelSize.height,
  })

  // Main board right edge
  lines.push({
    orientation: 'vertical',
    position: mainBoardPosition.x + mainBoardSize.width + boardMargin,
    startMm: 0,
    endMm: panelSize.height,
  })

  // Bottom edge (all boards share this - spans full width)
  lines.push({
    orientation: 'horizontal',
    position: bottomVScoreY,
    startMm: 0,
    endMm: panelSize.width,
  })

  // Top edge v-scores - ONLY span across boards at max height
  // We need to calculate which horizontal segments get v-scored vs routed
  // Build a list of board regions with their heights
  interface BoardRegion {
    leftVScore: number  // left v-score position
    rightVScore: number // right v-score position
    height: number
  }

  const regions: BoardRegion[] = []

  // Main board region
  regions.push({
    leftVScore: mainBoardPosition.x - boardMargin,
    rightVScore: mainBoardPosition.x + mainBoardSize.width + boardMargin,
    height: mainBoardSize.height,
  })

  // Remote board regions
  for (const pos of remoteBoardPositions) {
    const size = actualSizes.get(pos.remoteBoardId)
    if (!size) continue

    regions.push({
      leftVScore: pos.position.x - boardMargin,
      rightVScore: pos.position.x + size.width + boardMargin,
      height: size.height,
    })

    // Left edge v-score
    lines.push({
      orientation: 'vertical',
      position: pos.position.x - boardMargin,
      startMm: 0,
      endMm: panelSize.height,
    })

    // Right edge v-score
    lines.push({
      orientation: 'vertical',
      position: pos.position.x + size.width + boardMargin,
      startMm: 0,
      endMm: panelSize.height,
    })
  }

  // Sort regions by left position
  regions.sort((a, b) => a.leftVScore - b.leftVScore)

  // Generate top v-score segments only for boards at max height
  // Each segment runs from left panel edge (or previous board's right v-score) to board's right v-score
  for (const region of regions) {
    if (Math.abs(region.height - maxHeight) < 0.1) {
      // This board is at max height - v-score its top
      // The v-score runs from left panel edge to this board's right v-score
      // (or could be segmented if there are gaps, but typically v-scores run full width)
      // For simplicity and manufacturing, we create a segment for each max-height board
      lines.push({
        orientation: 'horizontal',
        position: topVScoreY,
        startMm: region.leftVScore,
        endMm: region.rightVScore,
      })
    }
    // Boards shorter than max height get routed tops (handled in generateRoutedEdges)
  }

  return deduplicateVScoreLines(lines)
}

/**
 * Generate routed edges using actual gerber-derived sizes
 */
export function generateRoutedEdgesWithActualSizes(
  mainBoardPosition: { x: number; y: number },
  mainBoardSize: { width: number; height: number },
  remoteBoardPositions: PanelConfiguration['remoteBoards'],
  actualSizes: Map<string, { width: number; height: number }>,
  margin: number,
  boardMargin: number = PANEL_DEFAULTS.boardMargin,
  routeBitDiameter: number = PANEL_DEFAULTS.routeBitDiameter
): RoutedEdge[] {
  const edges: RoutedEdge[] = []
  const bitRadius = routeBitDiameter / 2

  // Collect all actual heights
  const allHeights = [mainBoardSize.height]
  for (const pos of remoteBoardPositions) {
    const size = actualSizes.get(pos.remoteBoardId)
    if (size) allHeights.push(size.height)
  }
  const maxHeight = Math.max(...allHeights)

  // Check main board
  if (mainBoardSize.height < maxHeight - 0.1) {
    const boardTop = margin + mainBoardSize.height
    const routeY = boardTop + boardMargin + bitRadius
    edges.push({
      x1: mainBoardPosition.x - boardMargin,
      y1: routeY,
      x2: mainBoardPosition.x + mainBoardSize.width + boardMargin,
      y2: routeY,
    })
  }

  // Check remote boards - use ACTUAL sizes
  for (const pos of remoteBoardPositions) {
    const size = actualSizes.get(pos.remoteBoardId)
    if (!size) continue

    const { width, height } = size

    if (height < maxHeight - 0.1) {
      const boardTop = margin + height
      const routeY = boardTop + boardMargin + bitRadius
      edges.push({
        x1: pos.position.x - boardMargin,
        y1: routeY,
        x2: pos.position.x + width + boardMargin,
        y2: routeY,
      })
    }
  }

  return edges
}

/**
 * Generate v-score lines for panel separation
 * @deprecated Use generateVScoreLinesWithActualSizes instead
 */
export function generateVScoreLines(
  mainBoardPosition: { x: number; y: number },
  mainBoardSize: { width: number; height: number },
  remoteBoardPositions: PanelConfiguration['remoteBoards'],
  remoteBoards: RemoteBoard[],
  panelSize: { width: number; height: number },
  margin: number,
  boardMargin: number = PANEL_DEFAULTS.boardMargin
): VScoreLine[] {
  // Convert to actualSizes map
  const actualSizes = new Map<string, { width: number; height: number }>()
  for (const board of remoteBoards) {
    actualSizes.set(board.id, { width: board.boardSize.width, height: board.boardSize.height })
  }
  return generateVScoreLinesWithActualSizes(
    mainBoardPosition,
    mainBoardSize,
    remoteBoardPositions,
    actualSizes,
    panelSize,
    margin,
    boardMargin
  )
}

/**
 * Generate routed edges for boards that don't align with v-scores
 * These are the top edges of boards shorter than the tallest board
 *
 * Route position accounts for:
 * - boardMargin: 1mm gap between board copper and cut line
 * - bitRadius: route line is bit CENTER, so offset by half bit diameter
 *
 * Layout: board_top | 1mm gap | route_cut_starts_here
 * Route center = board_top + boardMargin + bitRadius
 */
export function generateRoutedEdges(
  mainBoardPosition: { x: number; y: number },
  mainBoardSize: { width: number; height: number },
  remoteBoardPositions: PanelConfiguration['remoteBoards'],
  remoteBoards: RemoteBoard[],
  margin: number,
  boardMargin: number = PANEL_DEFAULTS.boardMargin,
  routeBitDiameter: number = PANEL_DEFAULTS.routeBitDiameter
): RoutedEdge[] {
  const edges: RoutedEdge[] = []
  const bitRadius = routeBitDiameter / 2

  // Find max height
  const allHeights = [
    mainBoardSize.height,
    ...remoteBoards.map((b) => b.boardSize.height),
  ]
  const maxHeight = Math.max(...allHeights)

  // Check main board - if shorter than max, route its top edge
  // Boards are bottom-aligned at y=margin, so top edge is at y = margin + height
  // Route is ABOVE the board (toward higher Y values)
  if (mainBoardSize.height < maxHeight - 0.1) {
    const boardTop = margin + mainBoardSize.height
    // Route center: board_top + boardMargin + bitRadius
    // This places the bit's inner edge at boardMargin above the board top
    const routeY = boardTop + boardMargin + bitRadius
    edges.push({
      x1: mainBoardPosition.x - boardMargin,
      y1: routeY,
      x2: mainBoardPosition.x + mainBoardSize.width + boardMargin,
      y2: routeY,
    })
  }

  // Check remote boards
  for (let i = 0; i < remoteBoardPositions.length; i++) {
    const pos = remoteBoardPositions[i]
    const board = remoteBoards.find((b) => b.id === pos.remoteBoardId)
    if (!board) continue

    const { width, height } = board.boardSize

    if (height < maxHeight - 0.1) {
      // This board is shorter, route its top edge
      const boardTop = margin + height
      // Route center: board_top + boardMargin + bitRadius
      const routeY = boardTop + boardMargin + bitRadius
      edges.push({
        x1: pos.position.x - boardMargin,
        y1: routeY,
        x2: pos.position.x + width + boardMargin,
        y2: routeY,
      })
    }
  }

  return edges
}

/**
 * Remove duplicate v-score lines
 */
function deduplicateVScoreLines(lines: VScoreLine[]): VScoreLine[] {
  const seen = new Map<string, VScoreLine>()

  for (const line of lines) {
    const key = `${line.orientation}-${line.position.toFixed(2)}`
    const existing = seen.get(key)

    if (existing) {
      // Merge overlapping lines
      existing.startMm = Math.min(existing.startMm, line.startMm)
      existing.endMm = Math.max(existing.endMm, line.endMm)
    } else {
      seen.set(key, { ...line })
    }
  }

  return Array.from(seen.values())
}

// =============================================================================
// V-Score Gerber Generation
// =============================================================================

/**
 * Generate v-score layer as Gerber content
 */
export function generateVScoreGerber(
  vScoreLines: VScoreLine[],
  lineWidth: number = PANEL_DEFAULTS.vScoreWidth
): string {
  const header = [
    'G04 V-Score layer - Generated by PHAESTUS*',
    '%MOMM*%',
    '%FSLAX46Y46*%',
    '%LPD*%',
    `%ADD10C,${lineWidth.toFixed(6)}*%`, // Circular aperture for line width
    'D10*',
    'G01*', // Linear interpolation mode
  ]

  const draws: string[] = []

  for (const line of vScoreLines) {
    if (line.orientation === 'horizontal') {
      // Horizontal line: move to start, draw to end
      const y = Math.round(line.position * 1000000)
      const x1 = Math.round(line.startMm * 1000000)
      const x2 = Math.round(line.endMm * 1000000)
      draws.push(`X${x1}Y${y}D02*`) // Move to start
      draws.push(`X${x2}Y${y}D01*`) // Draw to end
    } else {
      // Vertical line: move to start, draw to end
      const x = Math.round(line.position * 1000000)
      const y1 = Math.round(line.startMm * 1000000)
      const y2 = Math.round(line.endMm * 1000000)
      draws.push(`X${x}Y${y1}D02*`) // Move to start
      draws.push(`X${x}Y${y2}D01*`) // Draw to end
    }
  }

  return [...header, ...draws, 'M02*'].join('\n')
}

/**
 * Generate routed edges layer as Gerber content
 * These are milled/routed cuts for edges that can't be v-scored
 * (typically top edges of shorter boards in a mixed-height panel)
 */
export function generateRoutedEdgesGerber(
  routedEdges: RoutedEdge[],
  routeWidth: number = 2.0 // 2mm routing bit is common
): string {
  if (routedEdges.length === 0) {
    return ''
  }

  const header = [
    'G04 Routed edges layer - Generated by PHAESTUS*',
    'G04 These edges require routing (milling) instead of v-scoring*',
    '%MOMM*%',
    '%FSLAX46Y46*%',
    '%LPD*%',
    `%ADD10C,${routeWidth.toFixed(6)}*%`, // Route width
    'D10*',
    'G01*', // Linear interpolation mode
  ]

  const draws: string[] = []

  for (const edge of routedEdges) {
    const x1 = Math.round(edge.x1 * 1000000)
    const y1 = Math.round(edge.y1 * 1000000)
    const x2 = Math.round(edge.x2 * 1000000)
    const y2 = Math.round(edge.y2 * 1000000)
    draws.push(`X${x1}Y${y1}D02*`) // Move to start
    draws.push(`X${x2}Y${y2}D01*`) // Draw to end
  }

  return [...header, ...draws, 'M02*'].join('\n')
}

// =============================================================================
// Panel Gerber Merging
// =============================================================================

/**
 * Merge main board and remote board gerbers into panelized output
 *
 * This function parses actual board dimensions from gerber edge cuts
 * and uses them for accurate panel assembly.
 */
export async function mergeIntoPanelGerbers(
  mainBoardGerbers: MergedGerbers,
  remoteBoardGerbers: Array<{ board: RemoteBoard; gerbers: MergedGerbers }>,
  panelConfig: PanelConfiguration,
  /** Optional: pre-calculated actual sizes. If not provided, will be parsed from gerbers */
  actualRemoteSizes?: Map<string, { width: number; height: number }>
): Promise<MergedGerbers & { vScore: string; routedEdges: string }> {
  // Build actual sizes map from gerbers if not provided
  const remoteSizes = actualRemoteSizes ?? new Map<string, { width: number; height: number }>()

  if (!actualRemoteSizes) {
    for (const { board, gerbers } of remoteBoardGerbers) {
      if (gerbers.edgeCuts) {
        const dims = parseBoardDimensionsFromEdgeCuts(gerbers.edgeCuts)
        remoteSizes.set(board.id, { width: dims.width, height: dims.height })
      }
    }
  }
  // Build GerberBlock array for unified merge
  const gerberBlocks: GerberBlock[] = []

  // Add main board at its panel position
  // Convert mm position to grid units
  const mainGridX = panelConfig.mainBoardPosition.x / GRID_SIZE_MM
  const mainGridY = panelConfig.mainBoardPosition.y / GRID_SIZE_MM

  gerberBlocks.push({
    name: 'main-board',
    gridX: mainGridX,
    gridY: mainGridY,
    layers: {
      topCopper: mainBoardGerbers.topCopper,
      innerCopper1: mainBoardGerbers.innerCopper1,
      innerCopper2: mainBoardGerbers.innerCopper2,
      bottomCopper: mainBoardGerbers.bottomCopper,
      topSilk: mainBoardGerbers.topSilk,
      bottomSilk: mainBoardGerbers.bottomSilk,
      topMask: mainBoardGerbers.topMask,
      bottomMask: mainBoardGerbers.bottomMask,
      edgeCuts: mainBoardGerbers.edgeCuts,
      drill: mainBoardGerbers.drill,
    },
  })

  // Add remote boards at their panel positions
  for (const { board, gerbers } of remoteBoardGerbers) {
    const position = panelConfig.remoteBoards.find((r) => r.remoteBoardId === board.id)
    if (!position) continue

    const gridX = position.position.x / GRID_SIZE_MM
    const gridY = position.position.y / GRID_SIZE_MM

    for (let copy = 0; copy < position.copies; copy++) {
      gerberBlocks.push({
        name: `${board.slug}-${copy}`,
        gridX: gridX + copy * (board.boardSize.width / GRID_SIZE_MM + 0.5),
        gridY,
        layers: {
          topCopper: gerbers.topCopper,
          innerCopper1: gerbers.innerCopper1,
          innerCopper2: gerbers.innerCopper2,
          bottomCopper: gerbers.bottomCopper,
          topSilk: gerbers.topSilk,
          bottomSilk: gerbers.bottomSilk,
          topMask: gerbers.topMask,
          bottomMask: gerbers.bottomMask,
          edgeCuts: gerbers.edgeCuts,
          drill: gerbers.drill,
        },
      })
    }
  }

  // Merge all gerbers
  const merged = mergeGerbers(gerberBlocks)

  // Generate v-score layer
  const vScore = generateVScoreGerber(panelConfig.vScoreLines)

  // Generate routed edges layer (for boards shorter than the tallest)
  const routedEdges = generateRoutedEdgesGerber(panelConfig.routedEdges ?? [])

  // Generate panel outline (edge cuts)
  const { gerber: panelOutline } = generatePanelOutline(panelConfig.panelSize)

  return {
    ...merged,
    edgeCuts: panelOutline, // Replace edge cuts with panel outline
    vScore,
    routedEdges,
  }
}

/**
 * Generate panel outline gerber
 */
function generatePanelOutline(
  panelSize: { width: number; height: number }
): { width: number; height: number; gerber: string } {
  const w = Math.round(panelSize.width * 1000000)
  const h = Math.round(panelSize.height * 1000000)

  const gerber = [
    'G04 Panel outline - Generated by PHAESTUS*',
    '%MOMM*%',
    '%FSLAX46Y46*%',
    '%LPD*%',
    '%ADD10C,0.150000*%', // 0.15mm line width
    'D10*',
    'G01*',
    'X0Y0D02*',
    `X${w}Y0D01*`,
    `X${w}Y${h}D01*`,
    `X0Y${h}D01*`,
    'X0Y0D01*',
    'M02*',
  ].join('\n')

  return { width: panelSize.width, height: panelSize.height, gerber }
}

// =============================================================================
// Export Helpers
// =============================================================================

/**
 * Check if panelization is needed (has remote boards)
 */
export function needsPanelization(pcbArtifacts: PCBArtifacts): boolean {
  return (pcbArtifacts.remoteBoards?.length ?? 0) > 0
}

/**
 * Calculate total panel area
 */
export function calculatePanelArea(config: PanelConfiguration): number {
  return config.panelSize.width * config.panelSize.height
}

/**
 * Get panel summary for display
 */
export function getPanelSummary(config: PanelConfiguration): {
  totalBoards: number
  panelSize: string
  vScoreCount: number
} {
  const totalBoards =
    1 + config.remoteBoards.reduce((sum, rb) => sum + rb.copies, 0)

  return {
    totalBoards,
    panelSize: `${config.panelSize.width.toFixed(1)} x ${config.panelSize.height.toFixed(1)} mm`,
    vScoreCount: config.vScoreLines.length,
  }
}
