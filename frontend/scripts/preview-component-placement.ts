/**
 * Component Placement Preview - Renders gerbers with component position markers
 *
 * Creates an SVG overlay showing component centroids (X markers) on top of
 * the gerber edge cuts and silkscreen, for validating position file accuracy.
 *
 * Usage: pnpm tsx scripts/preview-component-placement.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import JSZip from 'jszip'
import { parseBoardDimensionsFromEdgeCuts, type MergedGerbers } from '../src/services/gerber-merge'
import type { PlacedBlock, RemoteBoard, PanelConfiguration } from '../src/db/schema'
import {
  type JlcpcbComponent,
  type FootprintPattern,
  getRotationOffset,
  applyRotationOffset,
} from '../src/services/jlcpcb-components'

// =============================================================================
// Configuration - same as test manufacturing script
// =============================================================================

const OUTPUT_DIR = 'test-output/preview'

// Main board blocks
const MAIN_BOARD_BLOCKS: PlacedBlock[] = [
  { blockId: 'esp32-1', blockSlug: 'esp32-c6-mcu', gridX: 0, gridY: 2, rotation: 0 },
  { blockId: 'batt-1', blockSlug: '1x1-jst-ph-battery-connector', gridX: 0, gridY: 1, rotation: 0 },
  { blockId: 'io-1', blockSlug: '1x1-io-block', gridX: 1, gridY: 1, rotation: 0 },
  { blockId: 'usbc-1', blockSlug: '2x1-usbc-power', gridX: 0, gridY: 0, rotation: 0 },
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

const GRID_SIZE_MM = 12.7
const VERTICAL_OVERLAP_MM = 1.0

// =============================================================================
// Gerber/Position Loading (reused from generate-test-manufacturing.ts)
// =============================================================================

interface BlockDefinitionComponent {
  reference: string
  value: string
  footprint: string
  lcscPartNumber?: string
}

interface BlockDefinition {
  components?: BlockDefinitionComponent[]
}

const blockDefinitions = new Map<string, BlockDefinition>()

async function loadBlockGerbersFromApi(slug: string): Promise<MergedGerbers | null> {
  try {
    const res = await fetch(`https://phaestus.app/api/blocks/${slug}`)
    if (!res.ok) return null

    const data = await res.json()
    const block = data.block

    if (block?.definition) {
      blockDefinitions.set(slug, block.definition)
    }

    if (!block?.files?.gerbers) return null

    const gerbersRes = await fetch(`https://phaestus.app/api/blocks/${slug}/files/${block.files.gerbers}`)
    if (!gerbersRes.ok) return null

    const blob = await gerbersRes.arrayBuffer()
    const zip = await JSZip.loadAsync(blob)

    const layers: Partial<MergedGerbers> = {}
    const layerMappings: Array<{ patterns: string[]; key: keyof MergedGerbers }> = [
      { patterns: ['-f_cu', '.gtl', '-F_Cu'], key: 'topCopper' },
      { patterns: ['-b_cu', '.gbl', '-B_Cu'], key: 'bottomCopper' },
      { patterns: ['-f_mask', '.gts', '-F_Mask'], key: 'topMask' },
      { patterns: ['-f_silkscreen', '.gto', '-F_Silkscreen', '-F_SilkS'], key: 'topSilk' },
      { patterns: ['-b_silkscreen', '.gbo', '-B_Silkscreen', '-B_SilkS'], key: 'bottomSilk' },
      { patterns: ['-edge_cuts', '.gm1', '-Edge_Cuts'], key: 'edgeCuts' },
    ]

    for (const [filename, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue
      const lowerFilename = filename.toLowerCase()

      for (const mapping of layerMappings) {
        if (mapping.patterns.some((p) => lowerFilename.includes(p.toLowerCase()))) {
          layers[mapping.key] = await zipEntry.async('string')
          break
        }
      }
    }

    return {
      topCopper: layers.topCopper || '',
      bottomCopper: layers.bottomCopper || '',
      innerCopper1: '',
      innerCopper2: '',
      topMask: layers.topMask || '',
      bottomMask: '',
      topSilk: layers.topSilk || '',
      bottomSilk: layers.bottomSilk || '',
      edgeCuts: layers.edgeCuts || '',
      drill: '',
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
      if (res.ok) return await res.text()
    }
    return null
  } catch {
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
// Gerber to SVG Conversion
// =============================================================================

interface GerberCoord {
  x: number
  y: number
  command: 'move' | 'line' | 'flash'
}

function parseGerberCoords(content: string): GerberCoord[] {
  const coords: GerberCoord[] = []

  // Parse coordinate commands: X{num}Y{num}D{01|02|03}*
  // D01 = interpolate (draw line), D02 = move, D03 = flash
  const coordRegex = /X(-?\d+)Y(-?\d+)D0([123])\*/g
  let match

  while ((match = coordRegex.exec(content)) !== null) {
    // Gerber uses 6 decimal places (divide by 1,000,000 to get mm)
    const x = parseInt(match[1]) / 1000000
    const y = parseInt(match[2]) / 1000000
    const dCode = match[3]

    coords.push({
      x,
      y,
      command: dCode === '1' ? 'line' : dCode === '2' ? 'move' : 'flash'
    })
  }

  return coords
}

function gerberCoordsToSvgPath(coords: GerberCoord[], offsetX: number, offsetY: number, scale: number): string {
  if (coords.length === 0) return ''

  const parts: string[] = []

  for (const coord of coords) {
    const x = (coord.x + offsetX) * scale
    const y = (coord.y + offsetY) * scale

    if (coord.command === 'move') {
      parts.push(`M ${x.toFixed(2)} ${y.toFixed(2)}`)
    } else if (coord.command === 'line') {
      parts.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`)
    }
    // Skip flash commands for outline rendering
  }

  return parts.join(' ')
}

interface GerberPad {
  x: number
  y: number
}

function extractGerberPads(content: string): GerberPad[] {
  const pads: GerberPad[] = []

  // Parse flash commands (D03) which represent pads
  const coordRegex = /X(-?\d+)Y(-?\d+)D03\*/g
  let match

  while ((match = coordRegex.exec(content)) !== null) {
    const x = parseInt(match[1]) / 1000000
    const y = parseInt(match[2]) / 1000000
    pads.push({ x, y })
  }

  return pads
}

function padsToSvgCircles(pads: GerberPad[], offsetX: number, offsetY: number, scale: number, radius: number = 0.3): string {
  return pads.map(pad => {
    const x = (pad.x + offsetX) * scale
    const y = (pad.y + offsetY) * scale
    const r = radius * scale
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}"/>`
  }).join('\n      ')
}

// =============================================================================
// SVG Generation
// =============================================================================

interface ComponentMarker {
  ref: string
  x: number // in mm, panel coordinates
  y: number
  rot: number
  side: string
  blockSlug: string
  hasLcsc: boolean
}

function generateSvg(
  panelWidth: number,
  panelHeight: number,
  edgeCutsPaths: Array<{ path: string; color: string }>,
  silkPaths: Array<{ path: string }>,
  copperPadsSvg: string[],
  copperTraces: Array<{ path: string }>,
  components: ComponentMarker[],
  scale: number = 10 // pixels per mm
): string {
  const svgWidth = panelWidth * scale + 100 // margin for labels
  const svgHeight = panelHeight * scale + 100
  const margin = 50

  // SVG Y is inverted (0 at top), so we flip
  const flipY = (y: number) => panelHeight * scale - y

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <defs>
    <style>
      .edge-cuts { fill: none; stroke: #333; stroke-width: 0.5; }
      .silk { fill: none; stroke: #888; stroke-width: 0.3; }
      .copper-pad { fill: #b87333; fill-opacity: 0.7; stroke: none; }
      .copper-trace { fill: none; stroke: #b87333; stroke-width: 0.8; stroke-opacity: 0.5; }
      .component-marker { stroke-width: 1.5; }
      .component-marker.top { stroke: #ff0000; }
      .component-marker.bottom { stroke: #0000ff; }
      .component-marker.no-lcsc { stroke: #999; stroke-dasharray: 2,2; }
      .component-label { font-family: monospace; font-size: 6px; fill: #333; }
      .grid-line { stroke: #eee; stroke-width: 0.5; }
      .axis-label { font-family: monospace; font-size: 8px; fill: #666; }
      .legend { font-family: sans-serif; font-size: 10px; }
    </style>
  </defs>

  <!-- Background -->
  <rect width="${svgWidth}" height="${svgHeight}" fill="#f5f5f5"/>

  <!-- Grid lines -->
  <g class="grid">
`

  // Grid lines every 12.7mm
  for (let x = 0; x <= panelWidth; x += GRID_SIZE_MM) {
    const px = margin + x * scale
    svg += `    <line x1="${px}" y1="${margin}" x2="${px}" y2="${margin + panelHeight * scale}" class="grid-line"/>\n`
  }
  for (let y = 0; y <= panelHeight; y += GRID_SIZE_MM) {
    const py = margin + flipY(y * scale)
    svg += `    <line x1="${margin}" y1="${py}" x2="${margin + panelWidth * scale}" y2="${py}" class="grid-line"/>\n`
  }
  svg += `  </g>\n`

  // Axis labels
  svg += `  <g class="axis-labels">\n`
  for (let x = 0; x <= panelWidth; x += GRID_SIZE_MM) {
    const px = margin + x * scale
    svg += `    <text x="${px}" y="${margin - 5}" class="axis-label" text-anchor="middle">${x.toFixed(1)}</text>\n`
  }
  for (let y = 0; y <= panelHeight; y += GRID_SIZE_MM) {
    const py = margin + flipY(y * scale)
    svg += `    <text x="${margin - 5}" y="${py + 3}" class="axis-label" text-anchor="end">${y.toFixed(1)}</text>\n`
  }
  svg += `  </g>\n`

  // Transform group for board content (apply margin and Y flip)
  svg += `  <g transform="translate(${margin}, ${margin + panelHeight * scale}) scale(1, -1)">\n`

  // Copper traces (underneath pads)
  svg += `    <!-- Copper Traces -->\n`
  for (const { path } of copperTraces) {
    if (path) {
      svg += `    <path d="${path}" class="copper-trace"/>\n`
    }
  }

  // Copper pads (show footprints)
  svg += `    <!-- Copper Pads -->\n`
  svg += `    <g class="copper-pad">\n`
  for (const padsSvg of copperPadsSvg) {
    if (padsSvg) {
      svg += `      ${padsSvg}\n`
    }
  }
  svg += `    </g>\n`

  // Silkscreen paths (light gray)
  svg += `    <!-- Silkscreen -->\n`
  for (const { path } of silkPaths) {
    if (path) {
      svg += `    <path d="${path}" class="silk"/>\n`
    }
  }

  // Edge cuts (board outlines)
  svg += `    <!-- Edge Cuts -->\n`
  for (const { path, color } of edgeCutsPaths) {
    if (path) {
      svg += `    <path d="${path}" class="edge-cuts" stroke="${color}"/>\n`
    }
  }

  // Component markers (X marks)
  svg += `    <!-- Component Markers -->\n`
  for (const comp of components) {
    const x = comp.x * scale
    const y = comp.y * scale
    const size = 1.5 * scale // 1.5mm marker size

    // Rotation indicator line
    const rotRad = (comp.rot * Math.PI) / 180
    const lineLen = size * 0.8
    const lineX = Math.cos(rotRad) * lineLen
    const lineY = Math.sin(rotRad) * lineLen

    const sideClass = comp.side.toLowerCase() === 'top' ? 'top' : 'bottom'
    const lcscClass = comp.hasLcsc ? '' : ' no-lcsc'

    svg += `    <g class="component-marker ${sideClass}${lcscClass}" data-ref="${comp.ref}" data-block="${comp.blockSlug}">\n`
    svg += `      <!-- X marker -->\n`
    svg += `      <line x1="${x - size/2}" y1="${y - size/2}" x2="${x + size/2}" y2="${y + size/2}"/>\n`
    svg += `      <line x1="${x - size/2}" y1="${y + size/2}" x2="${x + size/2}" y2="${y - size/2}"/>\n`
    svg += `      <!-- Rotation indicator -->\n`
    svg += `      <line x1="${x}" y1="${y}" x2="${x + lineX}" y2="${y + lineY}" stroke-width="1"/>\n`
    svg += `    </g>\n`
  }

  svg += `  </g>\n`

  // Component labels (not flipped)
  svg += `  <g class="labels">\n`
  for (const comp of components) {
    const x = margin + comp.x * scale
    const y = margin + flipY(comp.y * scale)
    svg += `    <text x="${x + 8}" y="${y + 3}" class="component-label">${comp.ref}</text>\n`
  }
  svg += `  </g>\n`

  // Legend
  svg += `  <g class="legend" transform="translate(${svgWidth - 200}, 20)">\n`
  svg += `    <text x="0" y="0" font-weight="bold">Component Placement Preview</text>\n`
  svg += `    <line x1="0" y1="15" x2="20" y2="25" stroke="#ff0000" stroke-width="2"/>\n`
  svg += `    <line x1="20" y1="15" x2="0" y2="25" stroke="#ff0000" stroke-width="2"/>\n`
  svg += `    <text x="25" y="22">Top side (${components.filter(c => c.side.toLowerCase() === 'top').length})</text>\n`
  svg += `    <line x1="0" y1="35" x2="20" y2="45" stroke="#0000ff" stroke-width="2"/>\n`
  svg += `    <line x1="20" y1="35" x2="0" y2="45" stroke="#0000ff" stroke-width="2"/>\n`
  svg += `    <text x="25" y="42">Bottom side (${components.filter(c => c.side.toLowerCase() === 'bottom').length})</text>\n`
  svg += `    <line x1="0" y1="55" x2="20" y2="65" stroke="#999" stroke-width="2" stroke-dasharray="2,2"/>\n`
  svg += `    <line x1="20" y1="55" x2="0" y2="65" stroke="#999" stroke-width="2" stroke-dasharray="2,2"/>\n`
  svg += `    <text x="25" y="62">No LCSC (${components.filter(c => !c.hasLcsc).length})</text>\n`
  svg += `    <text x="0" y="85" font-size="8px">Scale: ${scale}px/mm | Grid: ${GRID_SIZE_MM}mm</text>\n`
  svg += `  </g>\n`

  svg += `</svg>`

  return svg
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('=== Component Placement Preview Generator ===\n')

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })

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

  console.log(`Loading data for ${uniqueSlugs.size} unique blocks...`)

  // Load gerbers and position files
  const blockGerbers = new Map<string, MergedGerbers>()
  const positionFiles = new Map<string, string>()
  const blockDimensions = new Map<string, { width: number; height: number; minX: number; minY: number }>()

  for (const slug of uniqueSlugs) {
    console.log(`  Loading ${slug}...`)
    const gerbers = await loadBlockGerbersFromApi(slug)
    if (gerbers) {
      blockGerbers.set(slug, gerbers)

      // Parse board dimensions from edge cuts
      if (gerbers.edgeCuts) {
        const dims = parseBoardDimensionsFromEdgeCuts(gerbers.edgeCuts)
        blockDimensions.set(slug, dims)
        console.log(`    Edge cuts: ${dims.width.toFixed(2)} x ${dims.height.toFixed(2)} mm, origin (${dims.minX.toFixed(2)}, ${dims.minY.toFixed(2)})`)
      }
    }

    const posFile = await loadPositionFileFromApi(slug)
    if (posFile) {
      positionFiles.set(slug, posFile)
      const entries = parsePositionFile(posFile)
      console.log(`    Position file: ${entries.length} components`)
    }
  }

  // Load JLCPCB rotation offsets
  console.log('\nLoading JLCPCB rotation offsets...')
  let jlcpcbComponents: JlcpcbComponent[] = []
  let footprintPatterns: FootprintPattern[] = []

  try {
    const [componentsRes, patternsRes] = await Promise.all([
      fetch('https://phaestus.app/api/admin/components?limit=10000'),
      fetch('https://phaestus.app/api/admin/components/patterns'),
    ])

    if (componentsRes.ok) {
      const data = await componentsRes.json()
      jlcpcbComponents = data.components || []
      console.log(`  Loaded ${jlcpcbComponents.length} component rotation offsets`)
    }

    if (patternsRes.ok) {
      const data = await patternsRes.json()
      footprintPatterns = data.patterns || []
      console.log(`  Loaded ${footprintPatterns.length} footprint patterns`)
    }
  } catch (error) {
    console.log(`  Warning: Could not fetch rotation data: ${error}`)
  }

  // Calculate panel layout
  const mainBoardMaxX = Math.max(...MAIN_BOARD_BLOCKS.map(b => b.gridX)) + 2 // Assuming max 2-wide blocks
  const mainBoardMaxY = Math.max(...MAIN_BOARD_BLOCKS.map(b => b.gridY)) + 2 // Assuming max 2-tall blocks

  const panelMargin = 5
  const mainBoardWidth = mainBoardMaxX * GRID_SIZE_MM
  const mainBoardHeight = mainBoardMaxY * GRID_SIZE_MM - (mainBoardMaxY - 1) * VERTICAL_OVERLAP_MM

  // Remote boards positioned to the right of main board
  let remoteBoardsWidth = 0
  let remoteBoardsMaxHeight = 0
  for (const remote of REMOTE_BOARDS) {
    const remoteWidth = remote.gridWidth * GRID_SIZE_MM
    const remoteHeight = remote.gridHeight * GRID_SIZE_MM
    remoteBoardsWidth += remoteWidth + 5 // 5mm gap
    remoteBoardsMaxHeight = Math.max(remoteBoardsMaxHeight, remoteHeight)
  }

  const panelWidth = mainBoardWidth + remoteBoardsWidth + panelMargin * 2
  const panelHeight = Math.max(mainBoardHeight, remoteBoardsMaxHeight) + panelMargin * 2

  const panelConfig: PanelConfiguration = {
    mainBoardPosition: { x: panelMargin, y: panelMargin },
    remoteBoards: [],
    vScoreLines: [],
    panelSize: { width: panelWidth, height: panelHeight },
    panelMargin,
  }

  // Position remote boards
  let remoteBoardX = panelMargin + mainBoardWidth + 5
  for (const remote of REMOTE_BOARDS) {
    panelConfig.remoteBoards.push({
      remoteBoardId: remote.id,
      position: { x: remoteBoardX, y: panelMargin },
      copies: 1,
    })
    remoteBoardX += remote.gridWidth * GRID_SIZE_MM + 5
  }

  console.log(`\nPanel size: ${panelWidth.toFixed(1)} x ${panelHeight.toFixed(1)} mm`)

  // Collect edge cuts paths
  const edgeCutsPaths: Array<{ path: string; color: string }> = []
  const silkPaths: Array<{ path: string }> = []
  const copperPadsSvg: string[] = []
  const copperTraces: Array<{ path: string }> = []

  // Process main board blocks
  for (const block of MAIN_BOARD_BLOCKS) {
    const gerbers = blockGerbers.get(block.blockSlug)
    const dims = blockDimensions.get(block.blockSlug)
    if (!gerbers || !dims) continue

    // Block position in panel coordinates
    const blockX = panelConfig.mainBoardPosition.x + block.gridX * GRID_SIZE_MM
    const blockY = panelConfig.mainBoardPosition.y + block.gridY * (GRID_SIZE_MM - VERTICAL_OVERLAP_MM)

    // Parse and offset edge cuts
    const edgeCoords = parseGerberCoords(gerbers.edgeCuts)
    const edgePath = gerberCoordsToSvgPath(edgeCoords, blockX - dims.minX, blockY - dims.minY, 10)
    edgeCutsPaths.push({ path: edgePath, color: '#333' })

    // Parse silkscreen
    if (gerbers.topSilk) {
      const silkCoords = parseGerberCoords(gerbers.topSilk)
      const silkPath = gerberCoordsToSvgPath(silkCoords, blockX - dims.minX, blockY - dims.minY, 10)
      silkPaths.push({ path: silkPath })
    }

    // Parse top copper - pads and traces
    if (gerbers.topCopper) {
      const pads = extractGerberPads(gerbers.topCopper)
      const padsSvg = padsToSvgCircles(pads, blockX - dims.minX, blockY - dims.minY, 10, 0.25)
      copperPadsSvg.push(padsSvg)

      const copperCoords = parseGerberCoords(gerbers.topCopper)
      const copperPath = gerberCoordsToSvgPath(copperCoords, blockX - dims.minX, blockY - dims.minY, 10)
      copperTraces.push({ path: copperPath })
    }
  }

  // Process remote boards
  for (const remoteBoardConfig of panelConfig.remoteBoards) {
    const remoteBoard = REMOTE_BOARDS.find(r => r.id === remoteBoardConfig.remoteBoardId)
    if (!remoteBoard) continue

    for (const block of remoteBoard.placedBlocks) {
      const gerbers = blockGerbers.get(block.blockSlug)
      const dims = blockDimensions.get(block.blockSlug)
      if (!gerbers || !dims) continue

      const blockX = remoteBoardConfig.position.x + block.gridX * GRID_SIZE_MM
      const blockY = remoteBoardConfig.position.y + block.gridY * GRID_SIZE_MM

      const edgeCoords = parseGerberCoords(gerbers.edgeCuts)
      const edgePath = gerberCoordsToSvgPath(edgeCoords, blockX - dims.minX, blockY - dims.minY, 10)
      edgeCutsPaths.push({ path: edgePath, color: '#0066cc' })

      if (gerbers.topSilk) {
        const silkCoords = parseGerberCoords(gerbers.topSilk)
        const silkPath = gerberCoordsToSvgPath(silkCoords, blockX - dims.minX, blockY - dims.minY, 10)
        silkPaths.push({ path: silkPath })
      }

      // Parse top copper for remote boards
      if (gerbers.topCopper) {
        const pads = extractGerberPads(gerbers.topCopper)
        const padsSvg = padsToSvgCircles(pads, blockX - dims.minX, blockY - dims.minY, 10, 0.25)
        copperPadsSvg.push(padsSvg)

        const copperCoords = parseGerberCoords(gerbers.topCopper)
        const copperPath = gerberCoordsToSvgPath(copperCoords, blockX - dims.minX, blockY - dims.minY, 10)
        copperTraces.push({ path: copperPath })
      }
    }
  }

  // Collect component markers
  const components: ComponentMarker[] = []

  // Main board components
  for (const block of MAIN_BOARD_BLOCKS) {
    const posContent = positionFiles.get(block.blockSlug)
    const dims = blockDimensions.get(block.blockSlug)
    if (!posContent || !dims) continue

    const entries = parsePositionFile(posContent)
    const definition = blockDefinitions.get(block.blockSlug)

    // Block position in panel coordinates
    const blockX = panelConfig.mainBoardPosition.x + block.gridX * GRID_SIZE_MM
    const blockY = panelConfig.mainBoardPosition.y + block.gridY * (GRID_SIZE_MM - VERTICAL_OVERLAP_MM)

    // FIX: Use board edge cuts origin for normalization, not component bounding box
    for (const entry of entries) {
      const uniqueRef = `M_${block.blockId}_${entry.ref}`

      // Check LCSC status and get part number for rotation offset
      let hasLcsc = false
      let lcscPartNumber: string | undefined
      if (definition?.components) {
        for (const comp of definition.components) {
          const refs = comp.reference.split(/,\s*/)
          if (refs.some(r => r.trim() === entry.ref)) {
            hasLcsc = !!comp.lcscPartNumber
            lcscPartNumber = comp.lcscPartNumber
            break
          }
        }
      }

      // FIXED: Normalize to board edge cuts origin
      const posX = blockX + (entry.posX - dims.minX)
      const posY = blockY + (entry.posY - dims.minY)

      // Apply JLCPCB rotation offset
      const rotationOffset = getRotationOffset(lcscPartNumber, entry.package, jlcpcbComponents, footprintPatterns)
      const adjustedRotation = applyRotationOffset(entry.rot, rotationOffset)

      components.push({
        ref: uniqueRef,
        x: posX,
        y: posY,
        rot: adjustedRotation,
        side: entry.side,
        blockSlug: block.blockSlug,
        hasLcsc,
      })
    }
  }

  // Remote board components
  for (const remoteBoardConfig of panelConfig.remoteBoards) {
    const remoteBoard = REMOTE_BOARDS.find(r => r.id === remoteBoardConfig.remoteBoardId)
    if (!remoteBoard) continue

    for (const block of remoteBoard.placedBlocks) {
      const posContent = positionFiles.get(block.blockSlug)
      const dims = blockDimensions.get(block.blockSlug)
      if (!posContent || !dims) continue

      const entries = parsePositionFile(posContent)
      const definition = blockDefinitions.get(block.blockSlug)

      const blockX = remoteBoardConfig.position.x + block.gridX * GRID_SIZE_MM
      const blockY = remoteBoardConfig.position.y + block.gridY * GRID_SIZE_MM

      // FIX: Use board edge cuts origin for normalization
      for (const entry of entries) {
        const uniqueRef = `R_${remoteBoard.id}_${block.blockId}_${entry.ref}`

        let hasLcsc = false
        let lcscPartNumber: string | undefined
        if (definition?.components) {
          for (const comp of definition.components) {
            const refs = comp.reference.split(/,\s*/)
            if (refs.some(r => r.trim() === entry.ref)) {
              hasLcsc = !!comp.lcscPartNumber
              lcscPartNumber = comp.lcscPartNumber
              break
            }
          }
        }

        // FIXED: Normalize to board edge cuts origin
        const posX = blockX + (entry.posX - dims.minX)
        const posY = blockY + (entry.posY - dims.minY)

        // Apply JLCPCB rotation offset
        const rotationOffset = getRotationOffset(lcscPartNumber, entry.package, jlcpcbComponents, footprintPatterns)
        const adjustedRotation = applyRotationOffset(entry.rot, rotationOffset)

        components.push({
          ref: uniqueRef,
          x: posX,
          y: posY,
          rot: adjustedRotation,
          side: entry.side,
          blockSlug: block.blockSlug,
          hasLcsc,
        })
      }
    }
  }

  console.log(`\nCollected ${components.length} component markers`)
  console.log(`  Top side: ${components.filter(c => c.side.toLowerCase() === 'top').length}`)
  console.log(`  Bottom side: ${components.filter(c => c.side.toLowerCase() === 'bottom').length}`)
  console.log(`  With LCSC: ${components.filter(c => c.hasLcsc).length}`)

  // Generate SVG
  const svg = generateSvg(panelWidth, panelHeight, edgeCutsPaths, silkPaths, copperPadsSvg, copperTraces, components)

  // Write SVG
  const svgPath = path.join(OUTPUT_DIR, 'component-placement.svg')
  fs.writeFileSync(svgPath, svg)
  console.log(`\nWritten: ${svgPath}`)

  // Generate HTML wrapper for easy viewing
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Component Placement Preview</title>
  <style>
    body { margin: 0; padding: 20px; font-family: sans-serif; background: #e0e0e0; }
    h1 { margin: 0 0 10px 0; }
    .info { margin-bottom: 20px; background: #fff; padding: 15px; border-radius: 4px; }
    .info table { border-collapse: collapse; }
    .info td { padding: 2px 10px; }
    .svg-container { background: #fff; display: inline-block; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .debug-section { margin-top: 20px; background: #fff; padding: 15px; border-radius: 4px; }
    .debug-section h3 { margin: 0 0 10px 0; }
    .component-list { font-family: monospace; font-size: 11px; max-height: 400px; overflow-y: auto; }
    .component-list table { border-collapse: collapse; width: 100%; }
    .component-list th, .component-list td { border: 1px solid #ddd; padding: 4px 8px; text-align: left; }
    .component-list tr:hover { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>Component Placement Preview</h1>
  <div class="info">
    <table>
      <tr><td><b>Panel Size:</b></td><td>${panelWidth.toFixed(1)} x ${panelHeight.toFixed(1)} mm</td></tr>
      <tr><td><b>Main Board:</b></td><td>${MAIN_BOARD_BLOCKS.length} blocks</td></tr>
      <tr><td><b>Remote Boards:</b></td><td>${REMOTE_BOARDS.length}</td></tr>
      <tr><td><b>Total Components:</b></td><td>${components.length}</td></tr>
      <tr><td><b>Generated:</b></td><td>${new Date().toISOString()}</td></tr>
    </table>
  </div>

  <div class="svg-container">
    ${svg}
  </div>

  <div class="debug-section">
    <h3>Component Details (for debugging)</h3>
    <div class="component-list">
      <table>
        <thead>
          <tr><th>Reference</th><th>Block</th><th>X (mm)</th><th>Y (mm)</th><th>Rot</th><th>Side</th><th>LCSC</th></tr>
        </thead>
        <tbody>
          ${components.map(c => `
            <tr>
              <td>${c.ref}</td>
              <td>${c.blockSlug}</td>
              <td>${c.x.toFixed(3)}</td>
              <td>${c.y.toFixed(3)}</td>
              <td>${c.rot}°</td>
              <td>${c.side}</td>
              <td>${c.hasLcsc ? '✓' : '✗'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <div class="debug-section">
    <h3>Block Dimensions (from edge cuts)</h3>
    <div class="component-list">
      <table>
        <thead>
          <tr><th>Block</th><th>Width (mm)</th><th>Height (mm)</th><th>MinX</th><th>MinY</th></tr>
        </thead>
        <tbody>
          ${Array.from(blockDimensions.entries()).map(([slug, dims]) => `
            <tr>
              <td>${slug}</td>
              <td>${dims.width.toFixed(3)}</td>
              <td>${dims.height.toFixed(3)}</td>
              <td>${dims.minX.toFixed(3)}</td>
              <td>${dims.minY.toFixed(3)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`

  const htmlPath = path.join(OUTPUT_DIR, 'component-placement.html')
  fs.writeFileSync(htmlPath, html)
  console.log(`Written: ${htmlPath}`)

  console.log(`\n=== Done! Open ${htmlPath} in browser ===`)
}

main().catch(console.error)
