/**
 * BOM Generator Service
 *
 * Aggregates components across all PCB blocks (main board and remote boards)
 * and generates manufacturing-ready BOM files.
 *
 * Features:
 * - Component deduplication by value/footprint
 * - Nofit marking for isolated 0R taps
 * - CSV export compatible with JLCPCB/PCBWay
 * - Separate BOMs per board with totals
 */

import type {
  PCBArtifacts,
  PlacedBlock,
  ResistorTapState,
  PcbBlock,
} from '../db/schema'
import type { BlockComponentDef } from '../schemas/block'
import { prefixReference } from './centroid-merge'

// =============================================================================
// Types
// =============================================================================

export interface BOMEntry {
  lineNumber: number
  references: string[] // ["R1", "R2", "R3"]
  value: string
  footprint: string
  quantity: number
  manufacturer: string | null
  mpn: string | null
  nofit: boolean
  nofitReason?: string
  boardName: string // "Main" or remote board name
}

export interface ManufacturingBOM {
  entries: BOMEntry[]
  summary: {
    totalParts: number
    uniqueParts: number
    nofitParts: number
    boardBreakdown: Array<{
      boardName: string
      totalParts: number
      uniqueParts: number
    }>
  }
}

interface ComponentKey {
  value: string
  footprint: string
  boardName: string
  nofit: boolean
}

// =============================================================================
// BOM Generation
// =============================================================================

/**
 * Generate manufacturing BOM from PCB artifacts
 */
export function generateManufacturingBOM(
  pcbArtifacts: PCBArtifacts,
  blocks: PcbBlock[]
): ManufacturingBOM {
  const entries: BOMEntry[] = []
  const resistorTapStates = pcbArtifacts.resistorTapStates || []

  // Process main board
  const mainBoardComponents = collectComponentsFromPlacedBlocks(
    pcbArtifacts.placedBlocks,
    blocks,
    'Main',
    resistorTapStates
  )

  // Process remote boards
  const remoteBoardComponents: Map<string, BOMEntry>[] = []
  for (const remoteBoard of pcbArtifacts.remoteBoards || []) {
    const components = collectComponentsFromPlacedBlocks(
      remoteBoard.placedBlocks,
      blocks,
      remoteBoard.name,
      resistorTapStates
    )
    remoteBoardComponents.push(components)
  }

  // Merge all components into entries
  let lineNumber = 1

  // Add main board entries
  for (const [, entry] of mainBoardComponents) {
    entries.push({ ...entry, lineNumber: lineNumber++ })
  }

  // Add remote board entries
  for (const boardComponents of remoteBoardComponents) {
    for (const [, entry] of boardComponents) {
      entries.push({ ...entry, lineNumber: lineNumber++ })
    }
  }

  // Calculate summary
  const boardBreakdown: ManufacturingBOM['summary']['boardBreakdown'] = []

  // Main board stats
  const mainBoardEntries = entries.filter((e) => e.boardName === 'Main')
  boardBreakdown.push({
    boardName: 'Main',
    totalParts: mainBoardEntries.reduce((sum, e) => sum + e.quantity, 0),
    uniqueParts: mainBoardEntries.length,
  })

  // Remote board stats
  for (const remoteBoard of pcbArtifacts.remoteBoards || []) {
    const boardEntries = entries.filter((e) => e.boardName === remoteBoard.name)
    boardBreakdown.push({
      boardName: remoteBoard.name,
      totalParts: boardEntries.reduce((sum, e) => sum + e.quantity, 0),
      uniqueParts: boardEntries.length,
    })
  }

  return {
    entries,
    summary: {
      totalParts: entries.reduce((sum, e) => sum + e.quantity, 0),
      uniqueParts: entries.length,
      nofitParts: entries.filter((e) => e.nofit).reduce((sum, e) => sum + e.quantity, 0),
      boardBreakdown,
    },
  }
}

/**
 * Collect components from placed blocks, aggregating by value+footprint
 */
function collectComponentsFromPlacedBlocks(
  placedBlocks: PlacedBlock[],
  blocks: PcbBlock[],
  boardName: string,
  resistorTapStates: ResistorTapState[]
): Map<string, BOMEntry> {
  const componentMap = new Map<string, BOMEntry>()

  for (const placedBlock of placedBlocks) {
    const block = blocks.find((b) => b.slug === placedBlock.blockSlug)
    if (!block) continue

    // Get components from block definition (preferred) or legacy components
    const components = block.definition?.components || convertLegacyComponents(block)

    for (const component of components) {
      // Check if this is a nofit component (0R tap that should be isolated)
      const tapState = resistorTapStates.find(
        (t) => t.blockSlug === placedBlock.blockSlug && t.reference === component.reference
      )

      const isNofit = tapState ? !tapState.populated : component.nofit === true

      const key = makeComponentKey({
        value: component.value,
        footprint: component.footprint,
        boardName,
        nofit: isNofit,
      })

      const existing = componentMap.get(key)
      if (existing) {
        // Aggregate: add reference and increment quantity
        existing.references.push(prefixReference(component.reference, placedBlock.blockSlug))
        existing.quantity += component.quantity || 1
      } else {
        // New entry
        componentMap.set(key, {
          lineNumber: 0, // Will be set later
          references: [prefixReference(component.reference, placedBlock.blockSlug)],
          value: component.value,
          footprint: component.footprint,
          quantity: component.quantity || 1,
          manufacturer: component.manufacturer || null,
          mpn: component.mpn || null,
          nofit: isNofit,
          nofitReason: tapState?.reason,
          boardName,
        })
      }
    }
  }

  return componentMap
}

/**
 * Convert legacy block components to BlockComponentDef format
 */
function convertLegacyComponents(block: PcbBlock): BlockComponentDef[] {
  return (block.components || []).map((c) => ({
    reference: c.ref,
    value: c.value,
    footprint: c.package,
    quantity: 1,
    nofit: false,
  }))
}

/**
 * Create a unique key for component aggregation
 */
function makeComponentKey(key: ComponentKey): string {
  return `${key.boardName}|${key.value}|${key.footprint}|${key.nofit}`
}

// Note: prefixReference is imported from centroid-merge.ts to keep
// BOM and pick-and-place reference naming synchronized

// =============================================================================
// CSV Export
// =============================================================================

/**
 * Convert BOM to CSV format (JLCPCB/PCBWay compatible)
 */
export function bomToCSV(bom: ManufacturingBOM): string {
  const headers = [
    'Line',
    'Designator',
    'Value',
    'Footprint',
    'Quantity',
    'Manufacturer',
    'MPN',
    'Board',
    'NoFit',
    'NoFit Reason',
  ]

  const rows = bom.entries.map((entry) => [
    entry.lineNumber.toString(),
    entry.references.join(', '),
    entry.value,
    entry.footprint,
    entry.quantity.toString(),
    entry.manufacturer || '',
    entry.mpn || '',
    entry.boardName,
    entry.nofit ? 'DNP' : '',
    entry.nofitReason || '',
  ])

  // Add summary rows
  rows.push([]) // Empty row
  rows.push(['Summary'])
  rows.push(['Total Parts', bom.summary.totalParts.toString()])
  rows.push(['Unique Parts', bom.summary.uniqueParts.toString()])
  rows.push(['NoFit Parts', bom.summary.nofitParts.toString()])

  if (bom.summary.boardBreakdown.length > 1) {
    rows.push([])
    rows.push(['Per Board Breakdown'])
    for (const board of bom.summary.boardBreakdown) {
      rows.push([board.boardName, board.totalParts.toString(), 'parts', board.uniqueParts.toString(), 'unique'])
    }
  }

  // Convert to CSV
  const csvContent = [
    headers.map(escapeCSVField).join(','),
    ...rows.map((row) => row.map(escapeCSVField).join(',')),
  ].join('\n')

  return csvContent
}

/**
 * Escape a field for CSV output
 */
function escapeCSVField(field: string | number | undefined): string {
  const str = String(field ?? '')
  // Escape if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

// =============================================================================
// Aggregated BOM (combine all boards into single BOM)
// =============================================================================

/**
 * Generate aggregated BOM that combines all boards
 * Useful for ordering components for multiple boards at once
 */
export function generateAggregatedBOM(
  pcbArtifacts: PCBArtifacts,
  blocks: PcbBlock[],
  multiplier: number = 1
): ManufacturingBOM {
  const baseBOM = generateManufacturingBOM(pcbArtifacts, blocks)

  // Combine entries by value+footprint+nofit across all boards
  const aggregatedMap = new Map<string, BOMEntry>()

  for (const entry of baseBOM.entries) {
    const key = `${entry.value}|${entry.footprint}|${entry.nofit}`
    const existing = aggregatedMap.get(key)

    if (existing) {
      existing.references.push(...entry.references)
      existing.quantity += entry.quantity * multiplier
      // Keep track of boards
      if (!existing.boardName.includes(entry.boardName)) {
        existing.boardName = `${existing.boardName}, ${entry.boardName}`
      }
    } else {
      aggregatedMap.set(key, {
        ...entry,
        quantity: entry.quantity * multiplier,
        references: [...entry.references],
      })
    }
  }

  // Renumber entries
  const entries = Array.from(aggregatedMap.values()).map((entry, i) => ({
    ...entry,
    lineNumber: i + 1,
  }))

  return {
    entries,
    summary: {
      totalParts: entries.reduce((sum, e) => sum + e.quantity, 0),
      uniqueParts: entries.length,
      nofitParts: entries.filter((e) => e.nofit).reduce((sum, e) => sum + e.quantity, 0),
      boardBreakdown: baseBOM.summary.boardBreakdown,
    },
  }
}
