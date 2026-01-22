/**
 * Centroid/Pick-and-Place Merge Service
 *
 * Merges component position files from multiple PCB blocks into a single
 * manufacturing-ready centroid file for SMT assembly.
 *
 * Features:
 * - Parses KiCad position file format (.pos or .csv)
 * - Offsets component positions by block grid placement
 * - Renames component references to avoid duplicates (synchronized with BOM)
 * - Supports both main board and remote boards
 * - Exports CSV compatible with JLCPCB/PCBWay
 */

import type { PlacedBlock, RemoteBoard, PanelConfiguration } from '../db/schema'

// =============================================================================
// Types
// =============================================================================

export interface CentroidEntry {
  reference: string
  value: string
  footprint: string
  posX: number // mm
  posY: number // mm
  rotation: number // degrees
  side: 'top' | 'bottom'
  boardName: string
}

export interface ParsedPositionFile {
  entries: CentroidEntry[]
  unit: 'mm' | 'mil' | 'inch'
}

export interface MergedCentroid {
  entries: CentroidEntry[]
  summary: {
    totalComponents: number
    topComponents: number
    bottomComponents: number
    boardBreakdown: Array<{
      boardName: string
      componentCount: number
    }>
  }
}

// =============================================================================
// Constants
// =============================================================================

const GRID_SIZE_MM = 12.7
// Vertical overlap for bus connector merging - blocks overlap by 1mm vertically
// Must match VERTICAL_OVERLAP_MM in gerber-merge.ts
const VERTICAL_OVERLAP_MM = 1.0

// =============================================================================
// Reference Prefixing (synchronized with BOM generator)
// =============================================================================

/**
 * Prefix reference designator with block slug for uniqueness
 * This MUST match the logic in bom-generator.ts for consistency
 * e.g., "R1" + "bme280-sensor" -> "BME280_SENSOR_R1"
 *
 * Uses full slug (converted to uppercase, hyphens to underscores) to avoid
 * prefix collisions between similar block names like bme280-sensor vs bme688-sensor
 */
export function prefixReference(ref: string, blockSlug: string): string {
  // Convert slug to uppercase and replace hyphens with underscores
  const prefix = blockSlug.toUpperCase().replace(/-/g, '_')
  return `${prefix}_${ref}`
}

// =============================================================================
// Position File Parsing
// =============================================================================

/**
 * Parse KiCad position file content
 *
 * KiCad format:
 * ### Footprint positions - created on ...
 * ### Printed by KiCad version ...
 * ## Unit = mm, Angle = deg.
 * ## Side : All
 * # Ref Val Package PosX PosY Rot Side
 * C1 100nF C_0402_1005Metric 1.500000 2.300000 90.000000 top
 */
export function parsePositionFile(content: string, boardName: string = 'Main'): ParsedPositionFile {
  const entries: CentroidEntry[] = []
  let unit: 'mm' | 'mil' | 'inch' = 'mm'

  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      // Check for unit specification
      if (trimmed.includes('Unit = mm')) unit = 'mm'
      else if (trimmed.includes('Unit = mil')) unit = 'mil'
      else if (trimmed.includes('Unit = inch')) unit = 'inch'
      continue
    }

    // Parse component line (space or tab separated)
    // Format: Ref Val Package PosX PosY Rot Side
    const parts = trimmed.split(/\s+/)
    if (parts.length >= 7) {
      const [ref, value, footprint, posXStr, posYStr, rotStr, sideStr] = parts

      // Skip header row if present
      if (ref === 'Ref' && value === 'Val') continue

      const posX = parseFloat(posXStr)
      const posY = parseFloat(posYStr)
      const rotation = parseFloat(rotStr)
      const side = sideStr.toLowerCase() === 'bottom' ? 'bottom' : 'top'

      if (!isNaN(posX) && !isNaN(posY) && !isNaN(rotation)) {
        entries.push({
          reference: ref,
          value,
          footprint,
          posX: convertToMM(posX, unit),
          posY: convertToMM(posY, unit),
          rotation,
          side,
          boardName,
        })
      }
    }
  }

  return { entries, unit }
}

/**
 * Convert position value to mm
 */
function convertToMM(value: number, unit: 'mm' | 'mil' | 'inch'): number {
  switch (unit) {
    case 'mil':
      return value * 0.0254
    case 'inch':
      return value * 25.4
    default:
      return value
  }
}

// =============================================================================
// Centroid Merging
// =============================================================================

/**
 * Merge centroid files from placed blocks on the main board
 */
export function mergeMainBoardCentroid(
  placedBlocks: PlacedBlock[],
  positionFiles: Map<string, string> // blockSlug -> position file content
): MergedCentroid {
  const entries: CentroidEntry[] = []

  for (const placedBlock of placedBlocks) {
    const posContent = positionFiles.get(placedBlock.blockSlug)
    if (!posContent) continue

    const parsed = parsePositionFile(posContent, 'Main')

    // Calculate offset based on grid position (Y uses reduced spacing for bus connector overlap)
    const offsetX = placedBlock.gridX * GRID_SIZE_MM
    const offsetY = placedBlock.gridY * (GRID_SIZE_MM - VERTICAL_OVERLAP_MM)

    for (const entry of parsed.entries) {
      entries.push({
        ...entry,
        reference: prefixReference(entry.reference, placedBlock.blockSlug),
        posX: entry.posX + offsetX,
        posY: entry.posY + offsetY,
      })
    }
  }

  return buildMergedCentroid(entries)
}

/**
 * Merge centroid files from a remote board
 */
export function mergeRemoteBoardCentroid(
  remoteBoard: RemoteBoard,
  positionFiles: Map<string, string>
): MergedCentroid {
  const entries: CentroidEntry[] = []

  for (const placedBlock of remoteBoard.placedBlocks) {
    const posContent = positionFiles.get(placedBlock.blockSlug)
    if (!posContent) continue

    const parsed = parsePositionFile(posContent, remoteBoard.name)

    // Calculate offset based on grid position within the remote board (Y uses reduced spacing for bus connector overlap)
    const offsetX = placedBlock.gridX * GRID_SIZE_MM
    const offsetY = placedBlock.gridY * (GRID_SIZE_MM - VERTICAL_OVERLAP_MM)

    for (const entry of parsed.entries) {
      entries.push({
        ...entry,
        reference: prefixReference(entry.reference, placedBlock.blockSlug),
        posX: entry.posX + offsetX,
        posY: entry.posY + offsetY,
        boardName: remoteBoard.name,
      })
    }
  }

  return buildMergedCentroid(entries)
}

/**
 * Merge all boards into a panelized centroid file
 */
export function mergePanelizedCentroid(
  mainBoardCentroid: MergedCentroid,
  remoteBoardCentroids: Array<{ board: RemoteBoard; centroid: MergedCentroid }>,
  panelConfig: PanelConfiguration
): MergedCentroid {
  const entries: CentroidEntry[] = []

  // Add main board entries offset by panel position
  const mainOffsetX = panelConfig.mainBoardPosition.x
  const mainOffsetY = panelConfig.mainBoardPosition.y

  for (const entry of mainBoardCentroid.entries) {
    entries.push({
      ...entry,
      posX: entry.posX + mainOffsetX,
      posY: entry.posY + mainOffsetY,
    })
  }

  // Add remote board entries offset by panel position
  for (const { board, centroid } of remoteBoardCentroids) {
    const position = panelConfig.remoteBoards.find((r) => r.remoteBoardId === board.id)
    if (!position) continue

    for (let copy = 0; copy < position.copies; copy++) {
      const copyOffsetX = copy * (board.boardSize.width + 5) // 5mm gap between copies

      for (const entry of centroid.entries) {
        entries.push({
          ...entry,
          // Add copy number to reference for multiple copies
          reference: position.copies > 1 ? `${entry.reference}_${copy + 1}` : entry.reference,
          posX: entry.posX + position.position.x + copyOffsetX,
          posY: entry.posY + position.position.y,
        })
      }
    }
  }

  return buildMergedCentroid(entries)
}

/**
 * Build merged centroid with summary statistics
 */
function buildMergedCentroid(entries: CentroidEntry[]): MergedCentroid {
  const boardCounts = new Map<string, number>()

  for (const entry of entries) {
    const count = boardCounts.get(entry.boardName) || 0
    boardCounts.set(entry.boardName, count + 1)
  }

  const boardBreakdown = Array.from(boardCounts.entries()).map(([boardName, componentCount]) => ({
    boardName,
    componentCount,
  }))

  return {
    entries,
    summary: {
      totalComponents: entries.length,
      topComponents: entries.filter((e) => e.side === 'top').length,
      bottomComponents: entries.filter((e) => e.side === 'bottom').length,
      boardBreakdown,
    },
  }
}

// =============================================================================
// CSV Export
// =============================================================================

/**
 * Convert merged centroid to CSV format (JLCPCB/PCBWay compatible)
 */
export function centroidToCSV(centroid: MergedCentroid): string {
  const headers = ['Designator', 'Val', 'Package', 'Mid X', 'Mid Y', 'Rotation', 'Layer']

  const rows = centroid.entries.map((entry) => [
    entry.reference,
    entry.value,
    entry.footprint,
    entry.posX.toFixed(4),
    entry.posY.toFixed(4),
    entry.rotation.toFixed(1),
    entry.side === 'top' ? 'top' : 'bottom',
  ])

  // Convert to CSV
  const csvContent = [headers.join(','), ...rows.map((row) => row.map(escapeCSVField).join(','))].join(
    '\n'
  )

  return csvContent
}

/**
 * Convert merged centroid to KiCad .pos format
 */
export function centroidToPos(centroid: MergedCentroid): string {
  const lines = [
    '### Footprint positions - Generated by PHAESTUS',
    '## Unit = mm, Angle = deg.',
    '## Side : All',
    '# Ref Val Package PosX PosY Rot Side',
  ]

  for (const entry of centroid.entries) {
    // Use 4 decimal places for consistency with CSV export and standard manufacturing tolerances
    lines.push(
      `${entry.reference} ${entry.value} ${entry.footprint} ${entry.posX.toFixed(4)} ${entry.posY.toFixed(4)} ${entry.rotation.toFixed(1)} ${entry.side}`
    )
  }

  return lines.join('\n')
}

/**
 * Escape a field for CSV output
 */
function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes(' ')) {
    return `"${field.replace(/"/g, '""')}"`
  }
  return field
}
