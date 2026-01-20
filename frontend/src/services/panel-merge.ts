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
  RemoteBoard,
  PCBArtifacts,
} from '../db/schema'
import {
  mergeGerbers,
  type GerberBlock,
  type MergedGerbers,
} from './gerber-merge'

// =============================================================================
// Constants
// =============================================================================

export const PANEL_DEFAULTS = {
  margin: 5, // mm from panel edge
  spacing: 2, // mm between boards
  railWidth: 5, // mm for edge rails
  vScoreWidth: 0.3, // mm v-score line width
} as const

export const GRID_SIZE_MM = 12.7

// =============================================================================
// Panel Layout Calculation
// =============================================================================

/**
 * Calculate panel layout for main board and remote boards
 */
export function calculatePanelLayout(
  mainBoardSize: { width: number; height: number },
  remoteBoards: RemoteBoard[],
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

  for (const remoteBoard of remoteBoards) {
    const boardWidth = remoteBoard.boardSize.width
    const boardHeight = remoteBoard.boardSize.height

    remoteBoardPositions.push({
      remoteBoardId: remoteBoard.id,
      position: {
        x: currentX,
        y: config.margin,
      },
      copies: 1,
    })

    currentX += boardWidth + config.spacing
    maxHeight = Math.max(maxHeight, boardHeight)
  }

  // Calculate total panel size
  const panelWidth = currentX - config.spacing + config.margin
  const panelHeight = maxHeight + config.margin * 2

  // Generate v-score lines
  const vScoreLines = generateVScoreLines(
    mainBoardPosition,
    mainBoardSize,
    remoteBoardPositions,
    remoteBoards,
    { width: panelWidth, height: panelHeight },
    config.margin
  )

  return {
    mainBoardPosition,
    remoteBoards: remoteBoardPositions,
    vScoreLines,
    panelSize: { width: panelWidth, height: panelHeight },
    panelMargin: config.margin,
  }
}

/**
 * Generate v-score lines for panel separation
 */
export function generateVScoreLines(
  mainBoardPosition: { x: number; y: number },
  mainBoardSize: { width: number; height: number },
  remoteBoardPositions: PanelConfiguration['remoteBoards'],
  remoteBoards: RemoteBoard[],
  panelSize: { width: number; height: number },
  _margin: number
): VScoreLine[] {
  const lines: VScoreLine[] = []

  // Main board left edge
  lines.push({
    orientation: 'vertical',
    position: mainBoardPosition.x,
    startMm: 0,
    endMm: panelSize.height,
  })

  // Main board right edge
  lines.push({
    orientation: 'vertical',
    position: mainBoardPosition.x + mainBoardSize.width,
    startMm: 0,
    endMm: panelSize.height,
  })

  // Main board top edge
  lines.push({
    orientation: 'horizontal',
    position: mainBoardPosition.y,
    startMm: mainBoardPosition.x,
    endMm: mainBoardPosition.x + mainBoardSize.width,
  })

  // Main board bottom edge
  lines.push({
    orientation: 'horizontal',
    position: mainBoardPosition.y + mainBoardSize.height,
    startMm: mainBoardPosition.x,
    endMm: mainBoardPosition.x + mainBoardSize.width,
  })

  // Remote board edges
  for (let i = 0; i < remoteBoardPositions.length; i++) {
    const pos = remoteBoardPositions[i]
    const board = remoteBoards.find((b) => b.id === pos.remoteBoardId)
    if (!board) continue

    const { width, height } = board.boardSize

    // Left edge
    lines.push({
      orientation: 'vertical',
      position: pos.position.x,
      startMm: 0,
      endMm: panelSize.height,
    })

    // Right edge
    lines.push({
      orientation: 'vertical',
      position: pos.position.x + width,
      startMm: 0,
      endMm: panelSize.height,
    })

    // Top edge
    lines.push({
      orientation: 'horizontal',
      position: pos.position.y,
      startMm: pos.position.x,
      endMm: pos.position.x + width,
    })

    // Bottom edge
    lines.push({
      orientation: 'horizontal',
      position: pos.position.y + height,
      startMm: pos.position.x,
      endMm: pos.position.x + width,
    })
  }

  // Deduplicate lines at same position
  return deduplicateVScoreLines(lines)
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

// =============================================================================
// Panel Gerber Merging
// =============================================================================

/**
 * Merge main board and remote board gerbers into panelized output
 */
export async function mergeIntoPanelGerbers(
  mainBoardGerbers: MergedGerbers,
  remoteBoardGerbers: Array<{ board: RemoteBoard; gerbers: MergedGerbers }>,
  panelConfig: PanelConfiguration
): Promise<MergedGerbers & { vScore: string }> {
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

  // Generate panel outline (edge cuts)
  const { gerber: panelOutline } = generatePanelOutline(panelConfig.panelSize)

  return {
    ...merged,
    edgeCuts: panelOutline, // Replace edge cuts with panel outline
    vScore,
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
