/**
 * Generate test manufacturing files locally
 *
 * Usage: pnpm tsx scripts/generate-test-manufacturing.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import JSZip from 'jszip'
import {
  mergeGerbers,
  parseBoardDimensionsFromEdgeCuts,
  type GerberBlock,
  type MergedGerbers,
} from '../src/services/gerber-merge'
import { calculatePanelLayout, mergeIntoPanelGerbers } from '../src/services/panel-merge'
import type { PlacedBlock, RemoteBoard, PanelConfiguration } from '../src/db/schema'
import {
  type JlcpcbComponent,
  type FootprintPattern,
  applyRotationOffset,
  getRotationOffset,
} from '../src/services/jlcpcb-components'

// =============================================================================
// Configuration - matching what the user had selected
// =============================================================================

const OUTPUT_DIR = 'test-output/test-project'
const PROJECT_SLUG = 'test-project'

// Main board blocks - vertical stack, 2 units wide, 4 units tall
// ESP32 (2x2) at top, battery+IO (1x1 each) below, USB-C (2x1) at bottom
const MAIN_BOARD_BLOCKS: PlacedBlock[] = [
  { blockId: 'esp32-1', blockSlug: 'esp32-c6-mcu', gridX: 0, gridY: 2, rotation: 0 }, // 2x2 at top (Y:2-3)
  { blockId: 'batt-1', blockSlug: '1x1-jst-ph-battery-connector', gridX: 0, gridY: 1, rotation: 0 }, // 1x1 left
  { blockId: 'io-1', blockSlug: '1x1-io-block', gridX: 1, gridY: 1, rotation: 0 }, // 1x1 right
  { blockId: 'usbc-1', blockSlug: '2x1-usbc-power', gridX: 0, gridY: 0, rotation: 0 }, // 2x1 at bottom
]

// Remote board
const REMOTE_BOARDS: RemoteBoard[] = [
  {
    id: 'remote-1',
    name: 'IO Expander',
    slug: 'remote-io',
    type: 'custom',
    placedBlocks: [
      { blockId: 'remote-io-1', blockSlug: 'remote-4ch-io-block', gridX: 0, gridY: 0, rotation: 0 },
    ],
    boardSize: { width: 12.7, height: 12.7, unit: 'mm' },
    connectionMapping: [],
    gridWidth: 1,
    gridHeight: 1,
  },
]

// =============================================================================
// Gerber Loading
// =============================================================================

interface BlockDefinitionComponent {
  reference: string
  value: string
  footprint: string
  manufacturer?: string
  mpn?: string
  lcscPartNumber?: string
}

interface BlockDefinition {
  components?: BlockDefinitionComponent[]
}

// Cache block definitions for BOM enrichment
const blockDefinitions = new Map<string, BlockDefinition>()

async function loadBlockGerbersFromApi(slug: string): Promise<MergedGerbers | null> {
  try {
    // Fetch from production API
    const res = await fetch(`https://phaestus.app/api/blocks/${slug}`)
    if (!res.ok) {
      console.log(`  Block ${slug}: API returned ${res.status}`)
      return null
    }

    const data = await res.json()
    const block = data.block // API returns { block: {...} }

    // Cache definition for BOM enrichment
    if (block?.definition) {
      blockDefinitions.set(slug, block.definition)
    }

    if (!block?.files?.gerbers) {
      console.log(`  Block ${slug}: No gerbers file reference`)
      return null
    }

    // Fetch the gerbers ZIP
    const gerbersRes = await fetch(
      `https://phaestus.app/api/blocks/${slug}/files/${block.files.gerbers}`
    )
    if (!gerbersRes.ok) {
      console.log(`  Block ${slug}: Gerbers fetch returned ${gerbersRes.status}`)
      return null
    }

    const blob = await gerbersRes.arrayBuffer()
    const zip = await JSZip.loadAsync(blob)

    const layers: Partial<MergedGerbers> = {}

    // Map file extensions/patterns to layer names
    const layerMappings: Array<{ patterns: string[]; key: keyof MergedGerbers }> = [
      { patterns: ['-f_cu', '.gtl', '-F_Cu'], key: 'topCopper' },
      { patterns: ['-b_cu', '.gbl', '-B_Cu'], key: 'bottomCopper' },
      { patterns: ['-in1_cu', '-In1_Cu', '.g1'], key: 'innerCopper1' },
      { patterns: ['-in2_cu', '-In2_Cu', '.g2'], key: 'innerCopper2' },
      { patterns: ['-f_mask', '.gts', '-F_Mask'], key: 'topMask' },
      { patterns: ['-b_mask', '.gbs', '-B_Mask'], key: 'bottomMask' },
      { patterns: ['-f_silkscreen', '.gto', '-F_Silkscreen', '-F_SilkS'], key: 'topSilk' },
      { patterns: ['-b_silkscreen', '.gbo', '-B_Silkscreen', '-B_SilkS'], key: 'bottomSilk' },
      { patterns: ['-edge_cuts', '.gm1', '-Edge_Cuts'], key: 'edgeCuts' },
      { patterns: ['.drl', '-drill', '-PTH', '-NPTH'], key: 'drill' },
    ]

    for (const [filename, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue
      const lowerFilename = filename.toLowerCase()

      for (const mapping of layerMappings) {
        if (mapping.patterns.some((p) => lowerFilename.includes(p.toLowerCase()))) {
          const content = await zipEntry.async('string')
          layers[mapping.key] = content
          break
        }
      }
    }

    console.log(`  Block ${slug}: Loaded ${Object.keys(layers).length} layers`)

    return {
      topCopper: layers.topCopper || '',
      bottomCopper: layers.bottomCopper || '',
      innerCopper1: layers.innerCopper1 || '',
      innerCopper2: layers.innerCopper2 || '',
      topMask: layers.topMask || '',
      bottomMask: layers.bottomMask || '',
      topSilk: layers.topSilk || '',
      bottomSilk: layers.bottomSilk || '',
      edgeCuts: layers.edgeCuts || '',
      drill: layers.drill || '',
    }
  } catch (error) {
    console.error(`  Block ${slug}: Error loading gerbers:`, error)
    return null
  }
}

async function loadPositionFileFromApi(slug: string): Promise<string | null> {
  try {
    const possibleNames = [`${slug}-pos.csv`, `${slug}-all-pos.csv`, `${slug}.pos`]

    for (const name of possibleNames) {
      const res = await fetch(`https://phaestus.app/api/blocks/${slug}/files/${name}`)
      if (res.ok) {
        const content = await res.text()
        console.log(`  Block ${slug}: Loaded position file ${name}`)
        return content
      }
    }

    console.log(`  Block ${slug}: No position file found`)
    return null
  } catch (error) {
    console.error(`  Block ${slug}: Error loading position file:`, error)
    return null
  }
}

// =============================================================================
// Position File Parsing
// =============================================================================

interface PositionEntry {
  ref: string
  val: string
  package: string
  posX: number
  posY: number
  rot: number
  side: string
}

function parsePositionFile(content: string): PositionEntry[] {
  const lines = content.trim().split('\n')
  if (lines.length < 2) return []

  const entries: PositionEntry[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Parse CSV with quoted fields
    const match = line.match(/"([^"]*)","([^"]*)","([^"]*)",([^,]*),([^,]*),([^,]*),(\w+)/)
    if (match) {
      entries.push({
        ref: match[1],
        val: match[2],
        package: match[3],
        posX: parseFloat(match[4]),
        posY: parseFloat(match[5]),
        rot: parseFloat(match[6]),
        side: match[7],
      })
    }
  }

  return entries
}

// =============================================================================
// BOM Generation (component-level)
// =============================================================================

interface BOMEntry {
  references: string[]
  value: string
  footprint: string
  quantity: number
  dnp: boolean
  manufacturer?: string
  mpn?: string
  lcscPartNumber?: string
}

function generateComponentBOM(
  positionFiles: Map<string, string>,
  placedBlocks: PlacedBlock[],
  boardPrefix: string
): { bom: Map<string, BOMEntry>; entries: PositionEntry[] } {
  const bomMap = new Map<string, BOMEntry>()
  const allEntries: PositionEntry[] = []

  for (const block of placedBlocks) {
    const posContent = positionFiles.get(block.blockSlug)
    if (!posContent) continue

    const entries = parsePositionFile(posContent)

    // Get block definition for LCSC lookup
    const definition = blockDefinitions.get(block.blockSlug)
    const componentMap = new Map<string, BlockDefinitionComponent>()
    if (definition?.components) {
      for (const comp of definition.components) {
        // Handle grouped references like "R1, R2, R3, R4"
        const refs = comp.reference.split(/,\s*/)
        for (const ref of refs) {
          componentMap.set(ref.trim(), comp)
        }
      }
    }

    for (const entry of entries) {
      // Create unique reference with board prefix and block ID
      const uniqueRef = `${boardPrefix}${block.blockId}_${entry.ref}`

      // Add to all entries for centroid
      allEntries.push({
        ...entry,
        ref: uniqueRef,
      })

      // Look up LCSC/MPN from definition
      const defComp = componentMap.get(entry.ref)

      // Aggregate BOM by value+package
      const bomKey = `${entry.val}|${entry.package}`
      const existing = bomMap.get(bomKey)

      if (existing) {
        existing.references.push(uniqueRef)
        existing.quantity++
        // Merge LCSC info if this entry has it and existing doesn't
        if (!existing.lcscPartNumber && defComp?.lcscPartNumber) {
          existing.lcscPartNumber = defComp.lcscPartNumber
          existing.manufacturer = defComp.manufacturer
          existing.mpn = defComp.mpn
        }
      } else {
        bomMap.set(bomKey, {
          references: [uniqueRef],
          value: entry.val,
          footprint: entry.package,
          quantity: 1,
          dnp: false,
          manufacturer: defComp?.manufacturer,
          mpn: defComp?.mpn,
          lcscPartNumber: defComp?.lcscPartNumber,
        })
      }
    }
  }

  return { bom: bomMap, entries: allEntries }
}

/**
 * Convert BOM to JLCPCB-compatible CSV format
 *
 * JLCPCB expects these columns:
 * - Comment (value/description)
 * - Designator (component references)
 * - Footprint (package)
 * - LCSC Part # (Cxxxxxx format)
 */
function bomToLCSCCSV(bomMap: Map<string, BOMEntry>): string {
  const headers = ['Comment', 'Designator', 'Footprint', 'LCSC Part #']

  // Filter out DNP entries and entries without LCSC numbers (they can't be ordered)
  const sortedEntries = Array.from(bomMap.values())
    .filter((entry) => !entry.dnp && entry.lcscPartNumber)
    .sort((a, b) => {
      const valCompare = a.value.localeCompare(b.value)
      if (valCompare !== 0) return valCompare
      return a.footprint.localeCompare(b.footprint)
    })

  const rows = sortedEntries.map((entry) => [
    // Comment: value (e.g., "100nF", "10k", "AW9523B")
    entry.value,
    // Designator: component references
    entry.references.sort().join(', '),
    // Footprint: package
    entry.footprint,
    // LCSC Part #
    entry.lcscPartNumber || '',
  ])

  // Escape fields for CSV
  const escapeField = (field: string): string => {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`
    }
    return field
  }

  return [headers.join(','), ...rows.map((row) => row.map(escapeField).join(','))].join('\n')
}

// =============================================================================
// Centroid Generation (component-level)
// =============================================================================

const GRID_SIZE_MM = 12.7

/**
 * Check if a component should be included in pick-and-place
 * - Must be top-side (JLCPCB only does single-sided assembly)
 * - Must have LCSC part number (nofit components excluded)
 */
function shouldIncludeInCentroid(entry: PositionEntry, blockSlug: string, ref: string): boolean {
  // Filter out bottom-side components
  if (entry.side.toLowerCase() === 'bottom') {
    return false
  }

  // Check if component has LCSC number in definition
  const definition = blockDefinitions.get(blockSlug)
  if (!definition?.components) {
    return true // No definition, include by default
  }

  // Find component in definition (handle grouped refs)
  for (const comp of definition.components) {
    const refs = comp.reference.split(/,\s*/)
    if (refs.some((r) => r.trim() === ref)) {
      // Found it - include only if it has LCSC number
      return !!comp.lcscPartNumber
    }
  }

  return true // Not found in definition, include by default
}

function generateComponentCentroid(
  positionFiles: Map<string, string>,
  blockDimensions: Map<string, { width: number; height: number; minX: number; minY: number }>,
  mainBoardBlocks: PlacedBlock[],
  remoteBoards: RemoteBoard[],
  panelConfig: PanelConfiguration,
  jlcpcbComponents: JlcpcbComponent[],
  footprintPatterns: FootprintPattern[]
): {
  csv: string
  stats: { total: number; included: number; filteredBottom: number; filteredNofit: number }
} {
  // JLCPCB CPL format: Designator, Mid X (with mm), Mid Y (with mm), Layer, Rotation
  const lines = ['Designator,Mid X,Mid Y,Layer,Rotation']
  let total = 0
  let included = 0
  let filteredBottom = 0
  let filteredNofit = 0

  // Helper to get LCSC part number from block definition
  const getLcscPartNumber = (blockSlug: string, ref: string): string | undefined => {
    const definition = blockDefinitions.get(blockSlug)
    if (!definition?.components) return undefined

    for (const comp of definition.components) {
      const refs = comp.reference.split(/,\s*/)
      if (refs.some((r) => r.trim() === ref)) {
        return comp.lcscPartNumber
      }
    }
    return undefined
  }

  // Process main board components
  for (const block of mainBoardBlocks) {
    const posContent = positionFiles.get(block.blockSlug)
    const dims = blockDimensions.get(block.blockSlug)
    if (!posContent || !dims) continue

    const entries = parsePositionFile(posContent)

    // Calculate block origin in panel coordinates
    // Block position: grid position * grid size + panel margin
    const blockOriginX = panelConfig.mainBoardPosition.x + block.gridX * GRID_SIZE_MM
    const blockOriginY = panelConfig.mainBoardPosition.y + block.gridY * GRID_SIZE_MM

    for (const entry of entries) {
      total++
      const uniqueRef = `M_${block.blockId}_${entry.ref}`

      // Filter check
      if (entry.side.toLowerCase() === 'bottom') {
        filteredBottom++
        continue
      }
      if (!shouldIncludeInCentroid(entry, block.blockSlug, entry.ref)) {
        filteredNofit++
        continue
      }

      included++

      // FIX: Use board edge cuts origin for normalization, not component bounding box
      const posX = blockOriginX + (entry.posX - dims.minX)
      const posY = blockOriginY + (entry.posY - dims.minY)

      // Apply JLCPCB rotation offset
      const lcscPartNumber = getLcscPartNumber(block.blockSlug, entry.ref)
      const rotationOffset = getRotationOffset(
        lcscPartNumber,
        entry.package,
        jlcpcbComponents,
        footprintPatterns
      )
      const adjustedRotation = applyRotationOffset(entry.rot, rotationOffset)

      // JLCPCB format: Designator, Mid X (mm), Mid Y (mm), Layer, Rotation
      const layer = entry.side.toLowerCase() === 'top' ? 'Top' : 'Bottom'
      lines.push(
        `${uniqueRef},${posX.toFixed(4)}mm,${posY.toFixed(4)}mm,${layer},${adjustedRotation.toFixed(0)}`
      )
    }
  }

  // Process remote board components
  for (const remoteBoardConfig of panelConfig.remoteBoards) {
    const remoteBoard = remoteBoards.find((r) => r.id === remoteBoardConfig.remoteBoardId)
    if (!remoteBoard) continue

    for (const block of remoteBoard.placedBlocks) {
      const posContent = positionFiles.get(block.blockSlug)
      const dims = blockDimensions.get(block.blockSlug)
      if (!posContent || !dims) continue

      const entries = parsePositionFile(posContent)

      // Block origin in panel coordinates
      const blockOriginX = remoteBoardConfig.position.x + block.gridX * GRID_SIZE_MM
      const blockOriginY = remoteBoardConfig.position.y + block.gridY * GRID_SIZE_MM

      for (const entry of entries) {
        total++
        const uniqueRef = `R_${remoteBoard.id}_${block.blockId}_${entry.ref}`

        // Filter check
        if (entry.side.toLowerCase() === 'bottom') {
          filteredBottom++
          continue
        }
        if (!shouldIncludeInCentroid(entry, block.blockSlug, entry.ref)) {
          filteredNofit++
          continue
        }

        included++

        // FIX: Use board edge cuts origin for normalization
        const posX = blockOriginX + (entry.posX - dims.minX)
        const posY = blockOriginY + (entry.posY - dims.minY)

        // Apply JLCPCB rotation offset
        const lcscPartNumber = getLcscPartNumber(block.blockSlug, entry.ref)
        const rotationOffset = getRotationOffset(
          lcscPartNumber,
          entry.package,
          jlcpcbComponents,
          footprintPatterns
        )
        const adjustedRotation = applyRotationOffset(entry.rot, rotationOffset)

        // JLCPCB format: Designator, Mid X (mm), Mid Y (mm), Layer, Rotation
        const layer = entry.side.toLowerCase() === 'top' ? 'Top' : 'Bottom'
        lines.push(
          `${uniqueRef},${posX.toFixed(4)}mm,${posY.toFixed(4)}mm,${layer},${adjustedRotation.toFixed(0)}`
        )
      }
    }
  }

  return {
    csv: lines.join('\n'),
    stats: { total, included, filteredBottom, filteredNofit },
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('=== Manufacturing File Generator ===\n')

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  fs.mkdirSync(path.join(OUTPUT_DIR, 'gerbers'), { recursive: true })

  // Collect unique block slugs
  const uniqueSlugs = new Set<string>()
  for (const placed of MAIN_BOARD_BLOCKS) {
    uniqueSlugs.add(placed.blockSlug)
  }
  for (const remote of REMOTE_BOARDS) {
    for (const placed of remote.placedBlocks) {
      uniqueSlugs.add(placed.blockSlug)
    }
  }

  console.log(`Loading gerbers for ${uniqueSlugs.size} unique blocks...`)

  // Load gerbers for all blocks
  const blockGerbers = new Map<string, MergedGerbers>()
  const positionFiles = new Map<string, string>()
  const blockDimensions = new Map<
    string,
    { width: number; height: number; minX: number; minY: number }
  >()

  for (const slug of uniqueSlugs) {
    console.log(`\nLoading ${slug}...`)
    const gerbers = await loadBlockGerbersFromApi(slug)
    if (gerbers) {
      blockGerbers.set(slug, gerbers)

      // Extract board dimensions from edge cuts for centroid normalization
      if (gerbers.edgeCuts) {
        const dims = parseBoardDimensionsFromEdgeCuts(gerbers.edgeCuts)
        blockDimensions.set(slug, dims)
        console.log(
          `  Board dims: ${dims.width.toFixed(2)} x ${dims.height.toFixed(2)} mm, origin (${dims.minX.toFixed(2)}, ${dims.minY.toFixed(2)})`
        )
      }
    }

    const posFile = await loadPositionFileFromApi(slug)
    if (posFile) {
      positionFiles.set(slug, posFile)
    }
  }

  console.log(`\nLoaded gerbers for ${blockGerbers.size}/${uniqueSlugs.size} blocks`)

  if (blockGerbers.size === 0) {
    console.error('No gerbers loaded! Cannot generate manufacturing files.')
    process.exit(1)
  }

  // ==========================================================================
  // Load JLCPCB component rotation data
  // ==========================================================================

  console.log('\nLoading JLCPCB rotation offsets...')
  let jlcpcbComponents: JlcpcbComponent[] = []
  let footprintPatterns: FootprintPattern[] = []

  try {
    // Try to fetch from production API (admin endpoints)
    const [componentsRes, patternsRes] = await Promise.all([
      fetch('https://phaestus.app/api/admin/components?limit=10000'),
      fetch('https://phaestus.app/api/admin/components/patterns'),
    ])

    if (componentsRes.ok) {
      const data = await componentsRes.json()
      jlcpcbComponents = data.components || []
      console.log(`  Loaded ${jlcpcbComponents.length} component rotation offsets`)
    } else {
      console.log(
        `  Warning: Could not fetch components (${componentsRes.status}), using empty list`
      )
    }

    if (patternsRes.ok) {
      const data = await patternsRes.json()
      footprintPatterns = data.patterns || []
      console.log(`  Loaded ${footprintPatterns.length} footprint patterns`)
    } else {
      console.log(`  Warning: Could not fetch patterns (${patternsRes.status}), using empty list`)
    }
  } catch (error) {
    console.log(`  Warning: Could not fetch rotation data: ${error}`)
    console.log('  Continuing without rotation corrections...')
  }

  // ==========================================================================
  // Merge main board gerbers
  // ==========================================================================

  console.log('\nMerging main board gerbers...')

  const mainBoardBlocks: GerberBlock[] = []
  for (const placed of MAIN_BOARD_BLOCKS) {
    const gerbers = blockGerbers.get(placed.blockSlug)
    if (!gerbers) {
      console.log(`  Skipping ${placed.blockSlug} - no gerbers`)
      continue
    }

    mainBoardBlocks.push({
      name: placed.blockSlug,
      gridX: placed.gridX,
      gridY: placed.gridY,
      layers: {
        topCopper: gerbers.topCopper,
        bottomCopper: gerbers.bottomCopper,
        innerCopper1: gerbers.innerCopper1,
        innerCopper2: gerbers.innerCopper2,
        topMask: gerbers.topMask,
        bottomMask: gerbers.bottomMask,
        topSilk: gerbers.topSilk,
        bottomSilk: gerbers.bottomSilk,
        edgeCuts: gerbers.edgeCuts,
        drill: gerbers.drill,
      },
    })
  }

  const mainBoardGerbers = mergeGerbers(mainBoardBlocks)
  console.log(`  Merged ${mainBoardBlocks.length} blocks into main board`)

  // Calculate main board dimensions
  const mainBoardDims = mainBoardGerbers.edgeCuts
    ? parseBoardDimensionsFromEdgeCuts(mainBoardGerbers.edgeCuts)
    : { width: 50.8, height: 12.7, minX: 0, minY: 0 } // 4 units x 1 unit default

  console.log(
    `  Main board size: ${mainBoardDims.width.toFixed(1)} x ${mainBoardDims.height.toFixed(1)} mm`
  )

  // ==========================================================================
  // Merge remote board gerbers
  // ==========================================================================

  console.log('\nMerging remote board gerbers...')

  const remoteBoardGerbers: Array<{
    board: RemoteBoard
    gerbers: MergedGerbers
    actualSize: { width: number; height: number }
  }> = []

  for (const remote of REMOTE_BOARDS) {
    const remoteBlocks: GerberBlock[] = []

    for (const placed of remote.placedBlocks) {
      const gerbers = blockGerbers.get(placed.blockSlug)
      if (!gerbers) {
        console.log(`  Skipping ${placed.blockSlug} - no gerbers`)
        continue
      }

      remoteBlocks.push({
        name: placed.blockSlug,
        gridX: placed.gridX,
        gridY: placed.gridY,
        layers: {
          topCopper: gerbers.topCopper,
          bottomCopper: gerbers.bottomCopper,
          innerCopper1: gerbers.innerCopper1,
          innerCopper2: gerbers.innerCopper2,
          topMask: gerbers.topMask,
          bottomMask: gerbers.bottomMask,
          topSilk: gerbers.topSilk,
          bottomSilk: gerbers.bottomSilk,
          edgeCuts: gerbers.edgeCuts,
          drill: gerbers.drill,
        },
      })
    }

    if (remoteBlocks.length > 0) {
      const gerbers = mergeGerbers(remoteBlocks)

      // Parse ACTUAL dimensions from merged gerber edge cuts
      const actualSize = gerbers.edgeCuts
        ? parseBoardDimensionsFromEdgeCuts(gerbers.edgeCuts)
        : { width: remote.boardSize.width, height: remote.boardSize.height, minX: 0, minY: 0 }

      remoteBoardGerbers.push({
        board: remote,
        gerbers,
        actualSize: { width: actualSize.width, height: actualSize.height },
      })
      console.log(`  Merged ${remoteBlocks.length} blocks into remote board: ${remote.name}`)
      console.log(
        `    Actual size from gerbers: ${actualSize.width.toFixed(1)} x ${actualSize.height.toFixed(1)} mm`
      )
    }
  }

  // ==========================================================================
  // Calculate panel layout and merge
  // ==========================================================================

  console.log('\nCalculating panel layout...')

  let panelGerbers: MergedGerbers & { vScore?: string; routedEdges?: string }
  let panelConfig: PanelConfiguration

  if (remoteBoardGerbers.length > 0) {
    // Multi-board panel - use ACTUAL gerber dimensions for layout calculation
    const remoteBoardsWithActualSizes = remoteBoardGerbers.map(({ board, actualSize }) => ({
      board,
      actualSize,
    }))

    panelConfig = calculatePanelLayout(
      { width: mainBoardDims.width, height: mainBoardDims.height },
      remoteBoardsWithActualSizes
    )

    console.log(
      `  Panel size: ${panelConfig.panelSize.width.toFixed(1)} x ${panelConfig.panelSize.height.toFixed(1)} mm`
    )
    console.log(
      `  Main board position: (${panelConfig.mainBoardPosition.x}, ${panelConfig.mainBoardPosition.y})`
    )
    console.log(`  V-score lines: ${panelConfig.vScoreLines.length}`)
    console.log(`  Routed edges: ${panelConfig.routedEdges?.length || 0}`)

    // Build actual sizes map for mergeIntoPanelGerbers
    const actualSizesMap = new Map<string, { width: number; height: number }>()
    for (const { board, actualSize } of remoteBoardGerbers) {
      actualSizesMap.set(board.id, actualSize)
    }

    // Use the proper panel merge function with actual sizes
    panelGerbers = await mergeIntoPanelGerbers(
      mainBoardGerbers,
      remoteBoardGerbers.map(({ board, gerbers }) => ({ board, gerbers })),
      panelConfig,
      actualSizesMap
    )
  } else {
    // Single board
    panelConfig = {
      mainBoardPosition: { x: 5, y: 5 },
      remoteBoards: [],
      vScoreLines: [],
      routedEdges: [],
      panelSize: {
        width: mainBoardDims.width + 12, // 5mm margin + 1mm board margin each side
        height: mainBoardDims.height + 12,
      },
      panelMargin: 5,
    }
    panelGerbers = mainBoardGerbers
  }

  // ==========================================================================
  // Write output files
  // ==========================================================================

  console.log('\nWriting output files...')

  // Gerber files
  const gerberDir = path.join(OUTPUT_DIR, 'gerbers')
  fs.writeFileSync(path.join(gerberDir, `${PROJECT_SLUG}-F_Cu.gtl`), panelGerbers.topCopper)
  fs.writeFileSync(path.join(gerberDir, `${PROJECT_SLUG}-B_Cu.gbl`), panelGerbers.bottomCopper)
  fs.writeFileSync(path.join(gerberDir, `${PROJECT_SLUG}-In1_Cu.g1`), panelGerbers.innerCopper1)
  fs.writeFileSync(path.join(gerberDir, `${PROJECT_SLUG}-In2_Cu.g2`), panelGerbers.innerCopper2)
  fs.writeFileSync(path.join(gerberDir, `${PROJECT_SLUG}-F_Mask.gts`), panelGerbers.topMask)
  fs.writeFileSync(path.join(gerberDir, `${PROJECT_SLUG}-B_Mask.gbs`), panelGerbers.bottomMask)
  fs.writeFileSync(path.join(gerberDir, `${PROJECT_SLUG}-F_SilkS.gto`), panelGerbers.topSilk)
  fs.writeFileSync(path.join(gerberDir, `${PROJECT_SLUG}-B_SilkS.gbo`), panelGerbers.bottomSilk)
  fs.writeFileSync(path.join(gerberDir, `${PROJECT_SLUG}-Edge_Cuts.gm1`), panelGerbers.edgeCuts)
  fs.writeFileSync(path.join(gerberDir, `${PROJECT_SLUG}.drl`), panelGerbers.drill)

  if (panelGerbers.vScore) {
    fs.writeFileSync(path.join(gerberDir, `${PROJECT_SLUG}-VScore.gbr`), panelGerbers.vScore)
    console.log('  Written: VScore.gbr')
  }

  if (panelGerbers.routedEdges) {
    fs.writeFileSync(
      path.join(gerberDir, `${PROJECT_SLUG}-RoutedEdges.gbr`),
      panelGerbers.routedEdges
    )
    console.log('  Written: RoutedEdges.gbr')
  }

  console.log('  Written: 10 gerber layer files')

  // BOM - component level
  const { bom: mainBOM } = generateComponentBOM(positionFiles, MAIN_BOARD_BLOCKS, 'M_')
  const { bom: remoteBOM } = generateComponentBOM(
    positionFiles,
    REMOTE_BOARDS.flatMap((r) =>
      r.placedBlocks.map((b) => ({ ...b, blockId: `${r.id}_${b.blockId}` }))
    ),
    'R_'
  )

  // Merge BOMs
  const combinedBOM = new Map<string, BOMEntry>()
  for (const [key, entry] of mainBOM) {
    combinedBOM.set(key, entry)
  }
  for (const [key, entry] of remoteBOM) {
    const existing = combinedBOM.get(key)
    if (existing) {
      existing.references.push(...entry.references)
      existing.quantity += entry.quantity
    } else {
      combinedBOM.set(key, entry)
    }
  }

  // JLCPCB-format BOM (Comment, Designator, Footprint, LCSC Part #)
  const bomCsv = bomToLCSCCSV(combinedBOM)
  fs.writeFileSync(path.join(OUTPUT_DIR, `${PROJECT_SLUG}-bom.csv`), bomCsv)
  console.log(`  Written: bom.csv (JLCPCB format, ${combinedBOM.size} unique parts)`)

  // Centroid - component level with panel coordinates (filtered for assembly)
  const centroidResult = generateComponentCentroid(
    positionFiles,
    blockDimensions,
    MAIN_BOARD_BLOCKS,
    REMOTE_BOARDS,
    panelConfig,
    jlcpcbComponents,
    footprintPatterns
  )
  fs.writeFileSync(path.join(OUTPUT_DIR, `${PROJECT_SLUG}-centroid.csv`), centroidResult.csv)
  console.log(`  Written: centroid.csv (${centroidResult.stats.included} components for assembly)`)
  console.log(
    `    Filtered: ${centroidResult.stats.filteredBottom} bottom-side, ${centroidResult.stats.filteredNofit} nofit/no-LCSC`
  )

  // Panel config JSON
  fs.writeFileSync(
    path.join(OUTPUT_DIR, `${PROJECT_SLUG}-panel-config.json`),
    JSON.stringify(panelConfig, null, 2)
  )
  console.log('  Written: panel-config.json')

  // README
  const readme = `Manufacturing Package: ${PROJECT_SLUG}
Generated: ${new Date().toISOString()}

=== PANEL SUMMARY ===
Panel Size: ${panelConfig.panelSize.width.toFixed(1)} x ${panelConfig.panelSize.height.toFixed(1)} mm
Main Board: ${mainBoardDims.width.toFixed(1)} x ${mainBoardDims.height.toFixed(1)} mm at (${panelConfig.mainBoardPosition.x}, ${panelConfig.mainBoardPosition.y})
Remote Boards: ${REMOTE_BOARDS.length}
V-Score Lines: ${panelConfig.vScoreLines.length}
Routed Edges: ${panelConfig.routedEdges?.length || 0}

=== BLOCKS ===
Main Board:
${MAIN_BOARD_BLOCKS.map((b) => `  - ${b.blockSlug} at (${b.gridX}, ${b.gridY})`).join('\n')}

Remote Boards:
${REMOTE_BOARDS.map((r) => `  ${r.name}:\n${r.placedBlocks.map((b) => `    - ${b.blockSlug} at (${b.gridX}, ${b.gridY})`).join('\n')}`).join('\n')}

=== FILES ===
gerbers/
  ${PROJECT_SLUG}-F_Cu.gtl       - Top copper
  ${PROJECT_SLUG}-B_Cu.gbl       - Bottom copper
  ${PROJECT_SLUG}-In1_Cu.g1      - Inner layer 1
  ${PROJECT_SLUG}-In2_Cu.g2      - Inner layer 2
  ${PROJECT_SLUG}-F_Mask.gts     - Top solder mask
  ${PROJECT_SLUG}-B_Mask.gbs     - Bottom solder mask
  ${PROJECT_SLUG}-F_SilkS.gto    - Top silkscreen
  ${PROJECT_SLUG}-B_SilkS.gbo    - Bottom silkscreen
  ${PROJECT_SLUG}-Edge_Cuts.gm1  - Board outline
  ${PROJECT_SLUG}.drl            - Drill file
  ${PROJECT_SLUG}-VScore.gbr     - V-score lines
  ${PROJECT_SLUG}-RoutedEdges.gbr - Routed edges (if any)

${PROJECT_SLUG}-bom.csv        - Bill of Materials
${PROJECT_SLUG}-centroid.csv   - Pick and place file
${PROJECT_SLUG}-panel-config.json - Panel layout configuration

Generated by PHAESTUS
`
  fs.writeFileSync(path.join(OUTPUT_DIR, 'README.txt'), readme)
  console.log('  Written: README.txt')

  console.log(`\n=== Done! Output in ${OUTPUT_DIR} ===`)
}

main().catch(console.error)
