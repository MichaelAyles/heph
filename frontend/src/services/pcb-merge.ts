/**
 * PCB Block Merge Service
 *
 * Handles merging multiple KiCad block schematics into a single design.
 * Uses kicadts for parsing and generating KiCad S-expression files.
 */

import {
  parseKicadSch,
  parseKicadPcb,
  KicadSch,
  KicadPcb,
  SchematicSymbol,
  Wire,
  Pts,
  Xy,
  Property,
  TitleBlock,
  Paper,
  Footprint,
  Segment,
  Via,
  GrLine,
  PcbNet,
} from 'kicadts'
import type { PlacedBlock, PcbBlock } from '@/db/schema'
import { logger } from '@/lib/logger'

// Grid unit size in mm (0.5" = 12.7mm)
const GRID_UNIT_MM = 12.7

// Edge overlap for bus connections in mm
const EDGE_OVERLAP_MM = 1.0

export interface MergeResult {
  schematic: string // KiCad schematic S-expression
  pcb?: string // KiCad PCB S-expression
  netList: NetAssignment[]
  boardSize: { width: number; height: number }
}

export interface NetAssignment {
  localNet: string
  globalNet: string
  blockSlug: string
  gpio?: string
}

interface LoadedBlock {
  block: PcbBlock
  placed: PlacedBlock
  schematic: KicadSch
  offsetX: number
  offsetY: number
}

/**
 * Preprocess KiCad content to handle tokens not supported by kicadts
 * The kicadts library doesn't support some newer KiCad 8 tokens like 'hide'
 */
function preprocessKicadContent(content: string): string {
  // Remove standalone 'hide' tokens (used for hidden properties/pins)
  // Match 'hide' preceded by whitespace and followed by whitespace or ')'
  let processed = content.replace(/(\s)hide(\s|\))/g, '$1$2')

  // Remove 'unlocked' token (another KiCad 8 addition)
  processed = processed.replace(/(\s)unlocked(\s|\))/g, '$1$2')

  // Handle (hide yes) or (hide no) patterns
  processed = processed.replace(/\(hide\s+(yes|no)\)/g, '')

  return processed
}

/**
 * Fetch a block's schematic file from the API
 */
async function fetchBlockSchematic(slug: string): Promise<string> {
  const response = await fetch(`/api/blocks/${slug}/files/${slug}.kicad_sch`)
  if (!response.ok) {
    throw new Error(`Failed to fetch schematic for block ${slug}: ${response.statusText}`)
  }
  const text = await response.text()
  return preprocessKicadContent(text)
}

/**
 * Calculate the position offset for a block based on its grid position
 */
function calculateBlockOffset(gridX: number, gridY: number): { x: number; y: number } {
  return {
    x: gridX * GRID_UNIT_MM,
    y: gridY * GRID_UNIT_MM,
  }
}

/**
 * Transform a symbol's position by the block offset
 */
function transformSymbolPosition(
  symbol: SchematicSymbol,
  offsetX: number,
  offsetY: number
): SchematicSymbol {
  // Clone the symbol and update its position
  const at = symbol.at
  if (at) {
    // Access the underlying position values
    const x = typeof at.x === 'number' ? at.x : 0
    const y = typeof at.y === 'number' ? at.y : 0
    at.x = x + offsetX
    at.y = y + offsetY
  }
  return symbol
}

/**
 * Build the global net list from all blocks
 */
function buildGlobalNetList(blocks: PcbBlock[]): Map<string, { id: number; name: string }> {
  const nets = new Map<string, { id: number; name: string }>()
  let netId = 1

  // Standard global nets
  const standardNets = ['GND', 'V3V3', 'VBUS']
  standardNets.forEach((net) => {
    nets.set(net, { id: netId++, name: net })
  })

  // Add nets from all blocks
  for (const block of blocks) {
    for (const tap of block.taps) {
      if (!nets.has(tap.net)) {
        nets.set(tap.net, { id: netId++, name: tap.net })
      }
    }
  }

  return nets
}

/**
 * Merge multiple block schematics into a single schematic
 */
export async function mergeBlockSchematics(
  placedBlocks: PlacedBlock[],
  blockData: PcbBlock[],
  projectName: string
): Promise<MergeResult> {
  // Create a map for quick block lookup by slug
  const blockMap = new Map(blockData.map((b) => [b.slug, b]))

  // Build global net list
  const globalNets = buildGlobalNetList(blockData)
  const netAssignments: NetAssignment[] = []

  // Calculate board bounds
  let maxX = 0
  let maxY = 0

  for (const placed of placedBlocks) {
    const block = blockMap.get(placed.blockSlug)
    if (block) {
      const endX = (placed.gridX + block.widthUnits) * GRID_UNIT_MM
      const endY = (placed.gridY + block.heightUnits) * GRID_UNIT_MM
      maxX = Math.max(maxX, endX)
      maxY = Math.max(maxY, endY)
    }
  }

  // Load and parse all block schematics
  const loadedBlocks: LoadedBlock[] = []

  for (const placed of placedBlocks) {
    const block = blockMap.get(placed.blockSlug)
    if (!block || !block.files?.schematic) {
      logger.warn('pcb', `Block ${placed.blockSlug} has no schematic file, skipping`)
      continue
    }

    try {
      const schematicText = await fetchBlockSchematic(placed.blockSlug)
      const schematic = parseKicadSch(schematicText)
      const offset = calculateBlockOffset(placed.gridX, placed.gridY)

      loadedBlocks.push({
        block,
        placed,
        schematic,
        offsetX: offset.x,
        offsetY: offset.y,
      })

      // Record net assignments
      for (const tap of block.taps) {
        const globalNet = globalNets.get(tap.net)
        if (globalNet) {
          netAssignments.push({
            localNet: tap.net,
            globalNet: globalNet.name,
            blockSlug: block.slug,
          })
        }
      }
    } catch (error) {
      logger.error('pcb', `Failed to load schematic for ${placed.blockSlug}`, { error })
    }
  }

  // Create paper with size A4
  const paper = new Paper()
  paper.size = 'A4'

  // Create title block
  const titleBlock = new TitleBlock({
    title: projectName,
    company: 'PHAESTUS Generated',
  })

  // Create merged schematic
  const mergedSchematic = new KicadSch({
    version: 20240101,
    generator: 'phaestus',
    titleBlock,
    paper,
    properties: [new Property({ key: 'Sheetfile', value: `${projectName}.kicad_sch` })],
    symbols: [],
    wires: [],
  })

  // Merge symbols from all blocks with position offsets
  for (const loaded of loadedBlocks) {
    const symbols = loaded.schematic.symbols || []
    for (const symbol of symbols) {
      const transformed = transformSymbolPosition(symbol, loaded.offsetX, loaded.offsetY)
      mergedSchematic.symbols?.push(transformed)
    }

    // Merge wires with position offsets
    const wires = loaded.schematic.wires || []
    for (const wire of wires) {
      // Transform wire points
      const pts = wire.points
      if (pts) {
        for (const point of pts.points || []) {
          // Only Xy has x/y; skip PtsArc for now
          if ('x' in point && 'y' in point) {
            point.x += loaded.offsetX
            point.y += loaded.offsetY
          }
        }
      }
      mergedSchematic.wires?.push(wire)
    }
  }

  // Generate bus interconnect wires between adjacent blocks
  const interconnectWires = generateInterconnectWires(loadedBlocks, blockMap, globalNets)
  for (const wire of interconnectWires) {
    mergedSchematic.wires?.push(wire)
  }

  return {
    schematic: mergedSchematic.getString(),
    netList: netAssignments,
    boardSize: {
      width: maxX,
      height: maxY,
    },
  }
}

/**
 * Generate wires to connect adjacent blocks via their bus edges
 */
function generateInterconnectWires(
  loadedBlocks: LoadedBlock[],
  _blockMap: Map<string, PcbBlock>,
  _globalNets: Map<string, { id: number; name: string }>
): Wire[] {
  const wires: Wire[] = []

  // Build a grid map of block positions
  const gridMap = new Map<string, LoadedBlock>()
  for (const loaded of loadedBlocks) {
    // Map all grid cells this block occupies
    for (let dx = 0; dx < loaded.block.widthUnits; dx++) {
      for (let dy = 0; dy < loaded.block.heightUnits; dy++) {
        const key = `${loaded.placed.gridX + dx},${loaded.placed.gridY + dy}`
        gridMap.set(key, loaded)
      }
    }
  }

  // Check each block for adjacent blocks and create connecting wires
  for (const loaded of loadedBlocks) {
    const { block, placed, offsetX, offsetY } = loaded
    const edges = block.edges

    if (!edges) continue

    // Check east edge connections
    const eastNeighborKey = `${placed.gridX + block.widthUnits},${placed.gridY}`
    const eastNeighbor = gridMap.get(eastNeighborKey)

    if (eastNeighbor && eastNeighbor !== loaded) {
      // Create connection wires for matching nets on east-west edges
      for (const eastConn of edges.east || []) {
        const westEdges = eastNeighbor.block.edges?.west || []
        const matchingWest = westEdges.find((w) => w.net === eastConn.net)

        if (matchingWest) {
          // Create a short wire connecting the two edges
          const x1 = offsetX + block.widthUnits * GRID_UNIT_MM - EDGE_OVERLAP_MM
          const y1 = offsetY + eastConn.offsetMm
          const x2 = eastNeighbor.offsetX + EDGE_OVERLAP_MM
          const y2 = eastNeighbor.offsetY + matchingWest.offsetMm

          wires.push(
            new Wire({
              points: new Pts([new Xy(x1, y1), new Xy(x2, y2)]),
            })
          )
        }
      }
    }

    // Check south edge connections
    const southNeighborKey = `${placed.gridX},${placed.gridY + block.heightUnits}`
    const southNeighbor = gridMap.get(southNeighborKey)

    if (southNeighbor && southNeighbor !== loaded) {
      // Create connection wires for matching nets on south-north edges
      for (const southConn of edges.south || []) {
        const northEdges = southNeighbor.block.edges?.north || []
        const matchingNorth = northEdges.find((n) => n.net === southConn.net)

        if (matchingNorth) {
          const x1 = offsetX + southConn.offsetMm
          const y1 = offsetY + block.heightUnits * GRID_UNIT_MM - EDGE_OVERLAP_MM
          const x2 = southNeighbor.offsetX + matchingNorth.offsetMm
          const y2 = southNeighbor.offsetY + EDGE_OVERLAP_MM

          wires.push(
            new Wire({
              points: new Pts([new Xy(x1, y1), new Xy(x2, y2)]),
            })
          )
        }
      }
    }
  }

  return wires
}

/**
 * Auto-select blocks based on the project's final spec requirements
 */
export function suggestBlocksForSpec(
  finalSpec: {
    inputs: { type: string }[]
    outputs: { type: string }[]
    communication: { type: string }
    power: { source: string }
  },
  availableBlocks: PcbBlock[]
): PcbBlock[] {
  const suggested: PcbBlock[] = []

  // Always need an MCU
  const mcu = availableBlocks.find((b) => b.category === 'mcu')
  if (mcu) suggested.push(mcu)

  // Select power block based on spec
  const powerSource = finalSpec.power.source.toLowerCase()
  let powerBlock: PcbBlock | undefined
  if (powerSource.includes('lipo') || powerSource.includes('battery')) {
    powerBlock = availableBlocks.find((b) => b.slug === 'power-lipo')
  } else if (powerSource.includes('usb')) {
    // USB power comes from MCU, no separate block needed
  } else if (powerSource.includes('dc') || powerSource.includes('barrel')) {
    powerBlock = availableBlocks.find((b) => b.slug === 'power-buck')
  }
  if (powerBlock) suggested.push(powerBlock)

  // Select sensor blocks based on inputs
  for (const input of finalSpec.inputs) {
    const inputType = input.type.toLowerCase()
    let sensorBlock: PcbBlock | undefined

    if (
      inputType.includes('temperature') ||
      inputType.includes('humidity') ||
      inputType.includes('pressure')
    ) {
      sensorBlock = availableBlocks.find((b) => b.slug === 'sensor-bme280')
    } else if (inputType.includes('motion') || inputType.includes('pir')) {
      sensorBlock = availableBlocks.find((b) => b.slug === 'sensor-pir')
    } else if (inputType.includes('light') || inputType.includes('ambient')) {
      sensorBlock = availableBlocks.find((b) => b.slug === 'sensor-veml7700')
    } else if (inputType.includes('accelerometer') || inputType.includes('accel')) {
      sensorBlock = availableBlocks.find((b) => b.slug === 'sensor-lis3dh')
    } else if (inputType.includes('distance') || inputType.includes('range')) {
      sensorBlock = availableBlocks.find((b) => b.slug === 'sensor-vl53l0x')
    } else if (inputType.includes('button')) {
      sensorBlock = availableBlocks.find((b) => b.slug === 'conn-button')
    } else if (inputType.includes('encoder') || inputType.includes('rotary')) {
      sensorBlock = availableBlocks.find((b) => b.slug === 'conn-encoder')
    }

    if (sensorBlock && !suggested.includes(sensorBlock)) {
      suggested.push(sensorBlock)
    }
  }

  // Select output blocks
  for (const output of finalSpec.outputs) {
    const outputType = output.type.toLowerCase()
    let outputBlock: PcbBlock | undefined

    if (
      outputType.includes('led') ||
      outputType.includes('neopixel') ||
      outputType.includes('ws2812')
    ) {
      outputBlock = availableBlocks.find((b) => b.slug === 'output-led-ws2812')
    } else if (
      outputType.includes('buzzer') ||
      outputType.includes('sound') ||
      outputType.includes('beep')
    ) {
      outputBlock = availableBlocks.find((b) => b.slug === 'output-buzzer')
    } else if (outputType.includes('relay')) {
      outputBlock = availableBlocks.find((b) => b.slug === 'output-relay')
    } else if (outputType.includes('motor')) {
      outputBlock = availableBlocks.find((b) => b.slug === 'output-motor')
    } else if (outputType.includes('oled') || outputType.includes('display')) {
      outputBlock = availableBlocks.find((b) => b.slug === 'conn-oled')
    } else if (outputType.includes('lcd')) {
      outputBlock = availableBlocks.find((b) => b.slug === 'conn-lcd')
    }

    if (outputBlock && !suggested.includes(outputBlock)) {
      suggested.push(outputBlock)
    }
  }

  return suggested
}

/**
 * Auto-place blocks on the grid in a compact arrangement
 */
export function autoPlaceBlocks(blocks: PcbBlock[]): PlacedBlock[] {
  const placed: PlacedBlock[] = []
  const gridOccupied = new Set<string>()

  // Sort blocks by size (larger first) for better packing
  const sorted = [...blocks].sort((a, b) => {
    const areaA = a.widthUnits * a.heightUnits
    const areaB = b.widthUnits * b.heightUnits
    return areaB - areaA
  })

  // Place MCU first at origin
  const mcuIndex = sorted.findIndex((b) => b.category === 'mcu')
  if (mcuIndex >= 0) {
    const mcu = sorted.splice(mcuIndex, 1)[0]
    sorted.unshift(mcu)
  }

  for (const block of sorted) {
    // Find first available position
    let foundPosition = false
    for (let y = 0; y < 10 && !foundPosition; y++) {
      for (let x = 0; x < 10 && !foundPosition; x++) {
        // Check if this position is available for the block
        let available = true
        for (let dx = 0; dx < block.widthUnits && available; dx++) {
          for (let dy = 0; dy < block.heightUnits && available; dy++) {
            if (gridOccupied.has(`${x + dx},${y + dy}`)) {
              available = false
            }
          }
        }

        if (available) {
          // Mark cells as occupied
          for (let dx = 0; dx < block.widthUnits; dx++) {
            for (let dy = 0; dy < block.heightUnits; dy++) {
              gridOccupied.add(`${x + dx},${y + dy}`)
            }
          }

          placed.push({
            blockId: block.id,
            blockSlug: block.slug,
            gridX: x,
            gridY: y,
            rotation: 0,
          })

          foundPosition = true
        }
      }
    }
  }

  return placed
}

// =============================================================================
// PCB File Merging
// =============================================================================

interface LoadedPcbBlock {
  block: PcbBlock
  placed: PlacedBlock
  pcb: KicadPcb
  offsetX: number
  offsetY: number
}

/**
 * Fetch a block's PCB file from the API
 */
async function fetchBlockPcb(slug: string): Promise<string> {
  const response = await fetch(`/api/blocks/${slug}/files/${slug}.kicad_pcb`)
  if (!response.ok) {
    throw new Error(`Failed to fetch PCB for block ${slug}: ${response.statusText}`)
  }
  const text = await response.text()
  return preprocessKicadContent(text)
}

/**
 * Net mapping result with both ID and name
 */
interface NetMappingResult {
  globalNets: Map<string, number>       // globalNetName -> globalNetId
  netMapping: Map<string, number>       // "blockSlug:localNetName" -> globalNetId
  netNameMapping: Map<string, string>   // "blockSlug:localNetName" -> globalNetName
}

/**
 * Build global net list from all blocks for PCB merging
 * Returns maps for both ID and name lookups
 */
function buildPcbNetMapping(loadedBlocks: LoadedPcbBlock[]): NetMappingResult {
  const globalNets = new Map<string, number>()       // globalNetName -> globalNetId
  const netMapping = new Map<string, number>()       // "blockSlug:localNetName" -> globalNetId
  const netNameMapping = new Map<string, string>()   // "blockSlug:localNetName" -> globalNetName
  let nextNetId = 1

  // Standard bus signals that should be shared across all blocks
  const busSignals = [
    'GND', 'V3V3', '3V3', 'VBUS', '5V0',
    'I2C0_SDA', 'I2C0_SCL', 'I2C1_SDA', 'I2C1_SCL',
    'SPI0_MOSI', 'SPI0_MISO', 'SPI0_SCK', 'SPI0_CS',
    'GPIO_0', 'GPIO_1', 'GPIO_2', 'GPIO_3', 'GPIO_4', 'GPIO_5', 'GPIO_6', 'GPIO_7',
    'AUX_0', 'AUX_1', 'AUX_2', 'AUX_3', 'AUX_4',
  ]

  // Reserve net 0 for unconnected
  globalNets.set('', 0)

  // Pre-assign bus signals
  for (const signal of busSignals) {
    globalNets.set(signal, nextNetId++)
  }

  // Process all blocks and map their local nets to global nets
  for (const loaded of loadedBlocks) {
    const nets = loaded.pcb.nets || []
    for (const net of nets) {
      const netName = net.name || ''
      const localKey = `${loaded.block.slug}:${netName}`

      if (netName === '') {
        // Unconnected net
        netMapping.set(localKey, 0)
        netNameMapping.set(localKey, '')
      } else if (globalNets.has(netName)) {
        // Bus signal - use existing global ID and name
        netMapping.set(localKey, globalNets.get(netName)!)
        netNameMapping.set(localKey, netName)
      } else {
        // Block-local signal - create new global ID with block prefix
        const globalName = `${loaded.block.slug}_${netName}`
        if (!globalNets.has(globalName)) {
          globalNets.set(globalName, nextNetId++)
        }
        netMapping.set(localKey, globalNets.get(globalName)!)
        netNameMapping.set(localKey, globalName)
      }
    }
  }

  return { globalNets, netMapping, netNameMapping }
}

/**
 * Get the global net ID and name for a local net in a block
 */
function getGlobalNet(
  blockSlug: string,
  localNetId: number,
  localNets: PcbNet[],
  netMapping: Map<string, number>,
  netNameMapping: Map<string, string>
): { id: number; name: string } {
  const localNet = localNets.find(n => n.id === localNetId)
  const localNetName = localNet?.name || ''
  const key = `${blockSlug}:${localNetName}`
  return {
    id: netMapping.get(key) ?? 0,
    name: netNameMapping.get(key) ?? '',
  }
}

/**
 * Transform footprint position by offset
 */
function transformFootprint(
  footprint: Footprint,
  offsetX: number,
  offsetY: number,
  blockSlug: string,
  localNets: PcbNet[],
  netMapping: Map<string, number>,
  netNameMapping: Map<string, string>
): Footprint {
  // Update position
  const pos = footprint.position
  if (pos && 'x' in pos && 'y' in pos) {
    const x = typeof pos.x === 'number' ? pos.x : 0
    const y = typeof pos.y === 'number' ? pos.y : 0
    pos.x = x + offsetX
    pos.y = y + offsetY
  }

  // Update reference designator to be unique
  const refProp = footprint.properties?.find(p => p.key === 'Reference')
  if (refProp && refProp.value) {
    refProp.value = `${refProp.value}_${blockSlug}`
  }

  // Remap pad nets - use global net ID AND name
  if (footprint.fpPads) {
    for (const pad of footprint.fpPads) {
      if (pad.net) {
        const localNetId = pad.net.id ?? 0
        const globalNet = getGlobalNet(blockSlug, localNetId, localNets, netMapping, netNameMapping)
        pad.net.id = globalNet.id
        pad.net.name = globalNet.name
      }
    }
  }

  // Filter out silkscreen graphics from footprint
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fpAny = footprint as any

  // Helper to check if a layer is silkscreen
  const isSilkscreen = (layer: { names?: string[] } | undefined) =>
    layer?.names?.some(n => n === 'F.SilkS' || n === 'B.SilkS') ?? false

  // Filter fp_lines
  if (fpAny._fpLines) {
    fpAny._fpLines = fpAny._fpLines.filter((el: { layer?: { names?: string[] } }) => !isSilkscreen(el.layer))
  }
  // Filter fp_texts
  if (fpAny._fpTexts) {
    fpAny._fpTexts = fpAny._fpTexts.filter((el: { layer?: { names?: string[] } }) => !isSilkscreen(el.layer))
  }
  // Filter fp_circles
  if (fpAny._fpCircles) {
    fpAny._fpCircles = fpAny._fpCircles.filter((el: { layer?: { names?: string[] } }) => !isSilkscreen(el.layer))
  }
  // Filter fp_arcs
  if (fpAny._fpArcs) {
    fpAny._fpArcs = fpAny._fpArcs.filter((el: { layer?: { names?: string[] } }) => !isSilkscreen(el.layer))
  }
  // Filter fp_rects
  if (fpAny._fpRects) {
    fpAny._fpRects = fpAny._fpRects.filter((el: { layer?: { names?: string[] } }) => !isSilkscreen(el.layer))
  }
  // Filter fp_polys
  if (fpAny._fpPolys) {
    fpAny._fpPolys = fpAny._fpPolys.filter((el: { layer?: { names?: string[] } }) => !isSilkscreen(el.layer))
  }

  return footprint
}

/**
 * Transform segment (trace) position by offset
 */
function transformSegment(
  segment: Segment,
  offsetX: number,
  offsetY: number,
  blockSlug: string,
  localNets: PcbNet[],
  netMapping: Map<string, number>,
  netNameMapping: Map<string, string>
): Segment {
  if (segment.start) {
    const x = typeof segment.start.x === 'number' ? segment.start.x : 0
    const y = typeof segment.start.y === 'number' ? segment.start.y : 0
    segment.start.x = x + offsetX
    segment.start.y = y + offsetY
  }
  if (segment.end) {
    const x = typeof segment.end.x === 'number' ? segment.end.x : 0
    const y = typeof segment.end.y === 'number' ? segment.end.y : 0
    segment.end.x = x + offsetX
    segment.end.y = y + offsetY
  }

  // Remap net - use global net ID AND name
  if (segment.net) {
    const localNetId = segment.net.id ?? 0
    const globalNet = getGlobalNet(blockSlug, localNetId, localNets, netMapping, netNameMapping)
    segment.net.id = globalNet.id
    // Segments also have net name in some versions
    if ('name' in segment.net) {
      (segment.net as { id?: number; name?: string }).name = globalNet.name
    }
  }

  return segment
}

/**
 * Transform via position by offset
 */
function transformVia(
  via: Via,
  offsetX: number,
  offsetY: number,
  blockSlug: string,
  localNets: PcbNet[],
  netMapping: Map<string, number>,
  netNameMapping: Map<string, string>
): Via {
  if (via.at) {
    const x = typeof via.at.x === 'number' ? via.at.x : 0
    const y = typeof via.at.y === 'number' ? via.at.y : 0
    via.at.x = x + offsetX
    via.at.y = y + offsetY
  }

  // Remap net - use global net ID AND name
  if (via.net) {
    const localNetId = via.net.id ?? 0
    const globalNet = getGlobalNet(blockSlug, localNetId, localNets, netMapping, netNameMapping)
    via.net.id = globalNet.id
    // Vias also have net name in some versions
    if ('name' in via.net) {
      (via.net as { id?: number; name?: string }).name = globalNet.name
    }
  }

  return via
}

/**
 * Transform graphic line position by offset
 */
function transformGrLine(line: GrLine, offsetX: number, offsetY: number): GrLine {
  if (line.start) {
    const x = typeof line.start.x === 'number' ? line.start.x : 0
    const y = typeof line.start.y === 'number' ? line.start.y : 0
    line.start.x = x + offsetX
    line.start.y = y + offsetY
  }
  if (line.end) {
    const x = typeof line.end.x === 'number' ? line.end.x : 0
    const y = typeof line.end.y === 'number' ? line.end.y : 0
    line.end.x = x + offsetX
    line.end.y = y + offsetY
  }
  return line
}

/**
 * Generate board outline for merged PCB
 */
function generateBoardOutline(
  boardWidth: number,
  boardHeight: number
): GrLine[] {
  const lines: GrLine[] = []
  const layer = 'Edge.Cuts'

  // Top edge
  lines.push(new GrLine({
    start: new Xy(0, 0),
    end: new Xy(boardWidth, 0),
    layer,
  }))

  // Right edge
  lines.push(new GrLine({
    start: new Xy(boardWidth, 0),
    end: new Xy(boardWidth, boardHeight),
    layer,
  }))

  // Bottom edge
  lines.push(new GrLine({
    start: new Xy(boardWidth, boardHeight),
    end: new Xy(0, boardHeight),
    layer,
  }))

  // Left edge
  lines.push(new GrLine({
    start: new Xy(0, boardHeight),
    end: new Xy(0, 0),
    layer,
  }))

  return lines
}

/**
 * Generate GND copper pour zones for top and bottom copper layers
 */
function generateGndZones(boardWidth: number, boardHeight: number, gndNetId: number): string {
  const uuid1 = crypto.randomUUID()
  const uuid2 = crypto.randomUUID()

  // Small margin inside board edge
  const margin = 0.2
  const x0 = margin
  const y0 = margin
  const x1 = boardWidth - margin
  const y1 = boardHeight - margin

  // Zone for front copper
  const frontZone = `  (zone (net ${gndNetId}) (net_name "GND") (layer "F.Cu") (uuid "${uuid1}")
    (hatch edge 0.5)
    (connect_pads (clearance 0.3))
    (min_thickness 0.2)
    (filled_areas_thickness no)
    (fill yes (thermal_gap 0.3) (thermal_bridge_width 0.5))
    (polygon
      (pts
        (xy ${x0} ${y0})
        (xy ${x1} ${y0})
        (xy ${x1} ${y1})
        (xy ${x0} ${y1})
      )
    )
  )`

  // Zone for back copper
  const backZone = `  (zone (net ${gndNetId}) (net_name "GND") (layer "B.Cu") (uuid "${uuid2}")
    (hatch edge 0.5)
    (connect_pads (clearance 0.3))
    (min_thickness 0.2)
    (filled_areas_thickness no)
    (fill yes (thermal_gap 0.3) (thermal_bridge_width 0.5))
    (polygon
      (pts
        (xy ${x0} ${y0})
        (xy ${x1} ${y0})
        (xy ${x1} ${y1})
        (xy ${x0} ${y1})
      )
    )
  )`

  return frontZone + '\n' + backZone
}

export interface PcbMergeResult {
  pcb: string // KiCad PCB S-expression
  boardSize: { width: number; height: number }
  blockCount: number
}

/**
 * Merge multiple block PCB files into a single PCB
 */
export async function mergeBlockPCBs(
  placedBlocks: PlacedBlock[],
  blockData: PcbBlock[],
  _projectName: string
): Promise<PcbMergeResult> {
  // Create a map for quick block lookup by slug
  const blockMap = new Map(blockData.map((b) => [b.slug, b]))

  // Calculate board bounds
  let maxX = 0
  let maxY = 0

  for (const placed of placedBlocks) {
    const block = blockMap.get(placed.blockSlug)
    if (block) {
      const endX = (placed.gridX + block.widthUnits) * GRID_UNIT_MM
      const endY = (placed.gridY + block.heightUnits) * GRID_UNIT_MM
      maxX = Math.max(maxX, endX)
      maxY = Math.max(maxY, endY)
    }
  }

  // Load and parse all block PCBs
  const loadedBlocks: LoadedPcbBlock[] = []

  for (const placed of placedBlocks) {
    const block = blockMap.get(placed.blockSlug)
    if (!block || !block.files?.pcb) {
      logger.warn('pcb', `Block ${placed.blockSlug} has no PCB file, skipping`)
      continue
    }

    try {
      const pcbText = await fetchBlockPcb(placed.blockSlug)
      logger.info('pcb', `Fetched PCB for ${placed.blockSlug}`, { length: pcbText.length })
      const pcb = parseKicadPcb(pcbText)
      logger.info('pcb', `Parsed PCB for ${placed.blockSlug}`, {
        footprints: pcb.footprints?.length,
        nets: pcb.nets?.length,
        segments: pcb.segments?.length
      })
      const offset = calculateBlockOffset(placed.gridX, placed.gridY)

      loadedBlocks.push({
        block,
        placed,
        pcb,
        offsetX: offset.x,
        offsetY: offset.y,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      logger.error('pcb', `Failed to load PCB for ${placed.blockSlug}`, {
        error: errorMsg,
        stack: errorStack
      })
      // Re-throw to propagate the error
      throw new Error(`Failed to load PCB for ${placed.blockSlug}: ${errorMsg}`)
    }
  }

  if (loadedBlocks.length === 0) {
    throw new Error('No valid PCB blocks to merge')
  }

  // Build global net mapping
  const { globalNets, netMapping, netNameMapping } = buildPcbNetMapping(loadedBlocks)

  // Create merged PCB using first block as template for layers/setup
  const templatePcb = loadedBlocks[0].pcb

  const mergedPcb = new KicadPcb({
    version: 20241229,
    generator: 'phaestus',
  })

  // Use 'any' to access internal kicadts properties (getString() uses _sx* and _* arrays)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pcbAny = mergedPcb as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const templateAny = templatePcb as any

  // Copy layers from template
  if (templateAny._sxLayers) {
    pcbAny._sxLayers = templateAny._sxLayers
  }

  // Copy setup from template
  if (templateAny._sxSetup) {
    pcbAny._sxSetup = templateAny._sxSetup
  }

  // Copy general settings from template
  if (templateAny._sxGeneral) {
    pcbAny._sxGeneral = templateAny._sxGeneral
  }

  // Build global net list - use internal _nets array
  pcbAny._nets = []
  for (const [name, id] of globalNets) {
    pcbAny._nets.push(new PcbNet(id, name))
  }

  // Merge footprints from all blocks - use internal _footprints array
  pcbAny._footprints = []
  for (const loaded of loadedBlocks) {
    const footprints = loaded.pcb.footprints || []
    const localNets = loaded.pcb.nets || []

    for (const footprint of footprints) {
      const transformed = transformFootprint(
        footprint,
        loaded.offsetX,
        loaded.offsetY,
        loaded.block.slug,
        localNets,
        netMapping,
        netNameMapping
      )
      pcbAny._footprints.push(transformed)
    }
  }

  // Merge segments (traces) from all blocks - use internal _segments array
  pcbAny._segments = []
  for (const loaded of loadedBlocks) {
    const segments = loaded.pcb.segments || []
    const localNets = loaded.pcb.nets || []

    for (const segment of segments) {
      const transformed = transformSegment(
        segment,
        loaded.offsetX,
        loaded.offsetY,
        loaded.block.slug,
        localNets,
        netMapping,
        netNameMapping
      )
      pcbAny._segments.push(transformed)
    }
  }

  // Merge vias from all blocks - use internal _vias array
  pcbAny._vias = []
  for (const loaded of loadedBlocks) {
    const vias = loaded.pcb.vias || []
    const localNets = loaded.pcb.nets || []

    for (const via of vias) {
      const transformed = transformVia(
        via,
        loaded.offsetX,
        loaded.offsetY,
        loaded.block.slug,
        localNets,
        netMapping,
        netNameMapping
      )
      pcbAny._vias.push(transformed)
    }
  }

  // Merge graphic lines (except edge cuts and silkscreen - we'll regenerate outline)
  pcbAny._grLines = []
  for (const loaded of loadedBlocks) {
    const graphicLines = loaded.pcb.graphicLines || []

    for (const line of graphicLines) {
      // Skip edge cuts - we'll generate a unified board outline
      if (line.layer?.names?.includes('Edge.Cuts')) continue
      // Skip silkscreen layers
      if (line.layer?.names?.includes('F.SilkS') || line.layer?.names?.includes('B.SilkS')) continue

      const transformed = transformGrLine(line, loaded.offsetX, loaded.offsetY)
      pcbAny._grLines.push(transformed)
    }
  }

  // Generate unified board outline
  const boardOutline = generateBoardOutline(maxX, maxY)
  for (const line of boardOutline) {
    pcbAny._grLines.push(line)
  }

  // Helper to check if layer is silkscreen
  const isSilkscreen = (layer: { names?: string[] } | undefined) =>
    layer?.names?.some(n => n === 'F.SilkS' || n === 'B.SilkS') ?? false

  // Filter other graphic elements from silkscreen
  // Note: kicadts stores these in internal _gr* arrays
  if (pcbAny._grTexts) {
    pcbAny._grTexts = pcbAny._grTexts.filter((el: { layer?: { names?: string[] } }) => !isSilkscreen(el.layer))
  }
  if (pcbAny._grArcs) {
    pcbAny._grArcs = pcbAny._grArcs.filter((el: { layer?: { names?: string[] } }) => !isSilkscreen(el.layer))
  }
  if (pcbAny._grCircles) {
    pcbAny._grCircles = pcbAny._grCircles.filter((el: { layer?: { names?: string[] } }) => !isSilkscreen(el.layer))
  }
  if (pcbAny._grRects) {
    pcbAny._grRects = pcbAny._grRects.filter((el: { layer?: { names?: string[] } }) => !isSilkscreen(el.layer))
  }
  if (pcbAny._grPolys) {
    pcbAny._grPolys = pcbAny._grPolys.filter((el: { layer?: { names?: string[] } }) => !isSilkscreen(el.layer))
  }

  // Get base PCB output
  let pcbOutput = mergedPcb.getString()

  // Get GND net ID
  const gndNetId = globalNets.get('GND') ?? 1

  // Generate GND copper pour zones for top and bottom layers
  const gndZones = generateGndZones(maxX, maxY, gndNetId)

  // Insert zones before the closing parenthesis
  const lastParen = pcbOutput.lastIndexOf(')')
  if (lastParen !== -1) {
    pcbOutput = pcbOutput.substring(0, lastParen) + '\n' + gndZones + '\n)'
  }
  logger.info('pcb', 'Merged PCB output', {
    length: pcbOutput.length,
    startsWith: pcbOutput.substring(0, 200),
    footprintCount: pcbAny._footprints?.length ?? 0,
    segmentCount: pcbAny._segments?.length ?? 0,
    netCount: pcbAny._nets?.length ?? 0,
  })

  return {
    pcb: pcbOutput,
    boardSize: { width: maxX, height: maxY },
    blockCount: loadedBlocks.length,
  }
}
