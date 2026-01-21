/**
 * Manufacturing Export Service
 *
 * Generates manufacturing-ready files (Gerbers, BOM, Centroid) packaged into a ZIP.
 * Ties together gerber-merge, bom-generator, and centroid-merge services.
 *
 * Output includes:
 * - Panel gerbers (all 10 layers)
 * - V-score gerber for board separation
 * - Routed edges gerber for mixed-height boards
 * - BOM CSV with nofit marking
 * - Centroid CSV for pick-and-place
 * - Tap configuration JSON for reference
 */

import JSZip from 'jszip'
import type {
  PCBArtifacts,
  RemoteBoard,
  PcbBlock,
  ResistorTapState,
  PanelConfiguration,
} from '../db/schema'
import type { MergedGerbers, GerberBlock } from './gerber-merge'
import { mergeGerbers, parseBoardDimensionsFromEdgeCuts } from './gerber-merge'
import {
  calculatePanelLayout,
  mergeIntoPanelGerbers,
} from './panel-merge'
import { generateManufacturingBOM, bomToCSV } from './bom-generator'
import {
  mergeMainBoardCentroid,
  mergeRemoteBoardCentroid,
  mergePanelizedCentroid,
  centroidToCSV,
  type MergedCentroid,
} from './centroid-merge'
import { logger } from '../lib/logger'

// =============================================================================
// Types
// =============================================================================

export interface ManufacturingPackageOptions {
  projectSlug: string
  pcbArtifacts: PCBArtifacts
  blocks: PcbBlock[]
  tapStates?: ResistorTapState[]
}

export interface ManufacturingPackageResult {
  blob: Blob
  filename: string
  summary: ManufacturingSummary
}

export interface ManufacturingSummary {
  totalBoards: number
  panelSize: { width: number; height: number }
  layerCount: number
  componentCount: number
  nofitCount: number
  hasVScore: boolean
  hasRoutedEdges: boolean
}

export interface BlockGerbers {
  slug: string
  gerbers: MergedGerbers
  positionFile?: string
}

// =============================================================================
// Gerber Loading
// =============================================================================

/**
 * Load gerber files for a block from the API
 */
export async function loadBlockGerbers(
  slug: string,
  gerbersFilename: string
): Promise<MergedGerbers | null> {
  try {
    const res = await fetch(`/api/blocks/${slug}/files/${gerbersFilename}`)
    if (!res.ok) return null

    const blob = await res.blob()
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

    // Ensure all layers have at least empty strings
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
    logger.error('pcb', 'Failed to load block gerbers', { slug, error })
    return null
  }
}

/**
 * Load position file for a block from the API
 */
export async function loadBlockPositionFile(slug: string): Promise<string | null> {
  try {
    // Try different possible position file names
    const possibleNames = [`${slug}-pos.csv`, `${slug}-all-pos.csv`, `${slug}.pos`]

    for (const name of possibleNames) {
      const res = await fetch(`/api/blocks/${slug}/files/${name}`)
      if (res.ok) {
        return await res.text()
      }
    }

    return null
  } catch (error) {
    logger.error('pcb', 'Failed to load position file', { slug, error })
    return null
  }
}

// =============================================================================
// Main Export Function
// =============================================================================

/**
 * Generate complete manufacturing package as ZIP
 */
export async function generateManufacturingPackage(
  options: ManufacturingPackageOptions
): Promise<ManufacturingPackageResult> {
  const { projectSlug, pcbArtifacts, blocks, tapStates } = options

  const zip = new JSZip()
  const summary: ManufacturingSummary = {
    totalBoards: 1,
    panelSize: { width: 0, height: 0 },
    layerCount: 10,
    componentCount: 0,
    nofitCount: 0,
    hasVScore: false,
    hasRoutedEdges: false,
  }

  // Update tap states in artifacts for BOM generation
  const artifactsWithTaps: PCBArtifacts = {
    ...pcbArtifacts,
    resistorTapStates: tapStates || pcbArtifacts.resistorTapStates,
  }

  // ==========================================================================
  // 1. Load gerbers and position files for all placed blocks
  // ==========================================================================

  const blockGerbers = new Map<string, MergedGerbers>()
  const positionFiles = new Map<string, string>()

  // Get unique block slugs
  const uniqueSlugs = new Set<string>()
  for (const placed of pcbArtifacts.placedBlocks) {
    uniqueSlugs.add(placed.blockSlug)
  }
  for (const remote of pcbArtifacts.remoteBoards || []) {
    for (const placed of remote.placedBlocks) {
      uniqueSlugs.add(placed.blockSlug)
    }
  }

  // Load gerbers and position files
  for (const slug of uniqueSlugs) {
    const block = blocks.find((b) => b.slug === slug)
    if (!block?.files?.gerbers) continue

    const gerbers = await loadBlockGerbers(slug, block.files.gerbers)
    if (gerbers) {
      blockGerbers.set(slug, gerbers)
    }

    const posFile = await loadBlockPositionFile(slug)
    if (posFile) {
      positionFiles.set(slug, posFile)
    }
  }

  // ==========================================================================
  // 2. Merge gerbers for main board
  // ==========================================================================

  const mainBoardBlocks: GerberBlock[] = []
  for (const placed of pcbArtifacts.placedBlocks) {
    const gerbers = blockGerbers.get(placed.blockSlug)
    if (!gerbers) continue

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

  // Calculate main board size from edge cuts
  const mainBoardDims = mainBoardGerbers.edgeCuts
    ? parseBoardDimensionsFromEdgeCuts(mainBoardGerbers.edgeCuts)
    : { width: 0, height: 0, minX: 0, minY: 0 }

  // ==========================================================================
  // 3. Merge gerbers for remote boards (if any)
  // ==========================================================================

  const remoteBoards = pcbArtifacts.remoteBoards || []
  const remoteBoardGerbers: Array<{ board: RemoteBoard; gerbers: MergedGerbers }> = []

  for (const remote of remoteBoards) {
    const remoteBlocks: GerberBlock[] = []

    for (const placed of remote.placedBlocks) {
      const gerbers = blockGerbers.get(placed.blockSlug)
      if (!gerbers) continue

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
      remoteBoardGerbers.push({ board: remote, gerbers })
    }
  }

  // ==========================================================================
  // 4. Calculate panel layout and merge into panel
  // ==========================================================================

  let panelGerbers: MergedGerbers & { vScore?: string; routedEdges?: string }
  let panelConfig: PanelConfiguration | null = null

  if (remoteBoardGerbers.length > 0) {
    // Multi-board panel - use the proper mergeIntoPanelGerbers function
    panelConfig = calculatePanelLayout(
      { width: mainBoardDims.width, height: mainBoardDims.height },
      remoteBoards
    )

    // Use the proper panel merge function from panel-merge.ts
    const panelResult = await mergeIntoPanelGerbers(
      mainBoardGerbers,
      remoteBoardGerbers,
      panelConfig
    )

    panelGerbers = panelResult

    summary.panelSize = panelConfig.panelSize
    summary.totalBoards = 1 + remoteBoards.length
    summary.hasVScore = panelConfig.vScoreLines.length > 0
    summary.hasRoutedEdges = (panelConfig.routedEdges?.length ?? 0) > 0
  } else {
    // Single board (no panel)
    panelGerbers = mainBoardGerbers
    summary.panelSize = { width: mainBoardDims.width, height: mainBoardDims.height }
  }

  // ==========================================================================
  // 5. Generate BOM with nofit marking
  // ==========================================================================

  const bom = generateManufacturingBOM(artifactsWithTaps, blocks)
  const bomCSV = bomToCSV(bom)

  summary.componentCount = bom.summary.totalParts
  summary.nofitCount = bom.summary.nofitParts

  // ==========================================================================
  // 6. Generate centroid files
  // ==========================================================================

  // Main board centroid
  const mainCentroid = mergeMainBoardCentroid(pcbArtifacts.placedBlocks, positionFiles)

  // Remote board centroids
  const remoteCentroids: Array<{ board: RemoteBoard; centroid: MergedCentroid }> = []
  for (const remote of remoteBoards) {
    const centroid = mergeRemoteBoardCentroid(remote, positionFiles)
    remoteCentroids.push({ board: remote, centroid })
  }

  // Merge into panel centroid if needed
  let finalCentroid: MergedCentroid
  if (panelConfig && remoteCentroids.length > 0) {
    finalCentroid = mergePanelizedCentroid(mainCentroid, remoteCentroids, panelConfig)
  } else {
    finalCentroid = mainCentroid
  }

  // Filter out nofit components from centroid
  const tapStatesForFilter = tapStates || pcbArtifacts.resistorTapStates || []
  finalCentroid = filterNofitFromCentroid(finalCentroid, tapStatesForFilter)

  const centroidCSV = centroidToCSV(finalCentroid)

  // ==========================================================================
  // 7. Package everything into ZIP
  // ==========================================================================

  // Add gerber files
  const gerberFolder = zip.folder('gerbers')
  if (gerberFolder) {
    gerberFolder.file(`${projectSlug}-F_Cu.gtl`, panelGerbers.topCopper)
    gerberFolder.file(`${projectSlug}-B_Cu.gbl`, panelGerbers.bottomCopper)
    gerberFolder.file(`${projectSlug}-In1_Cu.g1`, panelGerbers.innerCopper1)
    gerberFolder.file(`${projectSlug}-In2_Cu.g2`, panelGerbers.innerCopper2)
    gerberFolder.file(`${projectSlug}-F_Mask.gts`, panelGerbers.topMask)
    gerberFolder.file(`${projectSlug}-B_Mask.gbs`, panelGerbers.bottomMask)
    gerberFolder.file(`${projectSlug}-F_SilkS.gto`, panelGerbers.topSilk)
    gerberFolder.file(`${projectSlug}-B_SilkS.gbo`, panelGerbers.bottomSilk)
    gerberFolder.file(`${projectSlug}-Edge_Cuts.gm1`, panelGerbers.edgeCuts)
    gerberFolder.file(`${projectSlug}.drl`, panelGerbers.drill)

    // Add v-score and routed edges if present (from panel merge)
    if (panelGerbers.vScore) {
      gerberFolder.file(`${projectSlug}-VScore.gbr`, panelGerbers.vScore)
    }
    if (panelGerbers.routedEdges) {
      gerberFolder.file(`${projectSlug}-RoutedEdges.gbr`, panelGerbers.routedEdges)
    }
  }

  // Add BOM
  zip.file(`${projectSlug}-bom.csv`, bomCSV)

  // Add centroid
  zip.file(`${projectSlug}-centroid.csv`, centroidCSV)

  // Add tap configuration JSON for reference
  if (tapStates && tapStates.length > 0) {
    const tapConfig = {
      projectSlug,
      generatedAt: new Date().toISOString(),
      configurations: tapStates,
    }
    zip.file(`${projectSlug}-tap-config.json`, JSON.stringify(tapConfig, null, 2))
  }

  // Add README
  const readme = generateManufacturingReadme(projectSlug, summary, panelConfig)
  zip.file('README.txt', readme)

  // Generate ZIP blob
  const blob = await zip.generateAsync({ type: 'blob' })
  const filename = `${projectSlug}-manufacturing.zip`

  return { blob, filename, summary }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate panel outline gerber
 */
function generatePanelOutlineGerber(panelSize: { width: number; height: number }): string {
  const w = Math.round(panelSize.width * 1000000)
  const h = Math.round(panelSize.height * 1000000)

  return [
    'G04 Panel outline - Generated by PHAESTUS*',
    '%MOMM*%',
    '%FSLAX46Y46*%',
    '%LPD*%',
    '%ADD10C,0.150000*%',
    'D10*',
    'G01*',
    'X0Y0D02*',
    `X${w}Y0D01*`,
    `X${w}Y${h}D01*`,
    `X0Y${h}D01*`,
    'X0Y0D01*',
    'M02*',
  ].join('\n')
}

/**
 * Filter nofit components from centroid
 * Components marked as nofit in resistorTapStates should not be placed
 */
function filterNofitFromCentroid(
  centroid: MergedCentroid,
  tapStates: ResistorTapState[]
): MergedCentroid {
  // Build a set of nofit references (prefixed)
  const nofitRefs = new Set<string>()
  for (const state of tapStates) {
    if (!state.populated) {
      // The centroid reference will be prefixed like "BME_R3"
      // We need to match based on the original reference
      nofitRefs.add(state.reference)
    }
  }

  // Filter entries
  const filteredEntries = centroid.entries.filter((entry) => {
    // Extract the original reference from the prefixed version
    // Format: PREFIX_REF -> REF
    const parts = entry.reference.split('_')
    const originalRef = parts.length > 1 ? parts.slice(1).join('_') : entry.reference

    return !nofitRefs.has(originalRef)
  })

  // Recalculate summary
  const boardCounts = new Map<string, number>()
  for (const entry of filteredEntries) {
    const count = boardCounts.get(entry.boardName) || 0
    boardCounts.set(entry.boardName, count + 1)
  }

  return {
    entries: filteredEntries,
    summary: {
      totalComponents: filteredEntries.length,
      topComponents: filteredEntries.filter((e) => e.side === 'top').length,
      bottomComponents: filteredEntries.filter((e) => e.side === 'bottom').length,
      boardBreakdown: Array.from(boardCounts.entries()).map(([boardName, componentCount]) => ({
        boardName,
        componentCount,
      })),
    },
  }
}

/**
 * Generate README for manufacturing package
 */
function generateManufacturingReadme(
  projectSlug: string,
  summary: ManufacturingSummary,
  panelConfig: PanelConfiguration | null
): string {
  const lines = [
    `Manufacturing Package: ${projectSlug}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    '=== SUMMARY ===',
    `Panel Size: ${summary.panelSize.width.toFixed(1)} x ${summary.panelSize.height.toFixed(1)} mm`,
    `Total Boards: ${summary.totalBoards}`,
    `Component Count: ${summary.componentCount}`,
    `No-Fit (DNP) Count: ${summary.nofitCount}`,
    '',
    '=== FILES ===',
    'gerbers/',
    `  ${projectSlug}-F_Cu.gtl       - Top copper`,
    `  ${projectSlug}-B_Cu.gbl       - Bottom copper`,
    `  ${projectSlug}-In1_Cu.g1      - Inner layer 1`,
    `  ${projectSlug}-In2_Cu.g2      - Inner layer 2`,
    `  ${projectSlug}-F_Mask.gts     - Top solder mask`,
    `  ${projectSlug}-B_Mask.gbs     - Bottom solder mask`,
    `  ${projectSlug}-F_SilkS.gto    - Top silkscreen`,
    `  ${projectSlug}-B_SilkS.gbo    - Bottom silkscreen`,
    `  ${projectSlug}-Edge_Cuts.gm1  - Board outline`,
    `  ${projectSlug}.drl            - Drill file`,
  ]

  if (summary.hasVScore) {
    lines.push(`  ${projectSlug}-VScore.gbr     - V-score lines for board separation`)
  }

  if (summary.hasRoutedEdges) {
    lines.push(`  ${projectSlug}-RoutedEdges.gbr - Routed edges (for mixed-height boards)`)
  }

  lines.push('')
  lines.push(`${projectSlug}-bom.csv        - Bill of Materials`)
  lines.push(`${projectSlug}-centroid.csv   - Pick and place file`)
  lines.push(`${projectSlug}-tap-config.json - 0R resistor configuration`)
  lines.push('')

  if (panelConfig && summary.hasVScore) {
    lines.push('=== PANELIZATION ===')
    lines.push(`V-Score Lines: ${panelConfig.vScoreLines.length}`)
    if (panelConfig.routedEdges.length > 0) {
      lines.push(`Routed Edges: ${panelConfig.routedEdges.length} (for boards shorter than tallest)`)
    }
    lines.push('')
    lines.push('Board separation method:')
    lines.push('- V-score lines can be snapped after assembly')
    lines.push('- Routed edges require no additional processing')
    lines.push('')
  }

  lines.push('=== NOTES ===')
  lines.push('- BOM includes DNP (Do Not Place) column for nofit components')
  lines.push('- Centroid file excludes nofit components')
  lines.push('- All dimensions in millimeters')
  lines.push('')
  lines.push('Generated by PHAESTUS - https://phaestus.app')

  return lines.join('\n')
}

// =============================================================================
// Export Single Functions for Testing
// =============================================================================

export { filterNofitFromCentroid, generateManufacturingReadme, generatePanelOutlineGerber }
