/**
 * PCB Block Merge Service
 *
 * Handles merging multiple KiCad block schematics into a single design.
 * Uses kicadts for parsing and generating KiCad S-expression files.
 */

import {
  parseKicadSch,
  KicadSch,
  SchematicSymbol,
  Wire,
  Pts,
  Xy,
  Property,
  TitleBlock,
  Paper,
} from 'kicadts'
import type { PlacedBlock, PcbBlock, BlockEdges, NetMapping } from '@/db/schema'

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
 * Fetch a block's schematic file from the API
 */
async function fetchBlockSchematic(slug: string): Promise<string> {
  const response = await fetch(`/api/blocks/${slug}/files/${slug}.kicad_sch`)
  if (!response.ok) {
    throw new Error(`Failed to fetch schematic for block ${slug}: ${response.statusText}`)
  }
  return response.text()
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
function buildGlobalNetList(
  blocks: PcbBlock[],
  placedBlocks: PlacedBlock[]
): Map<string, { id: number; name: string }> {
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
  // Create a map for quick block lookup
  const blockMap = new Map(blockData.map((b) => [b.id, b]))

  // Build global net list
  const globalNets = buildGlobalNetList(blockData, placedBlocks)
  const netAssignments: NetAssignment[] = []

  // Calculate board bounds
  let maxX = 0
  let maxY = 0

  for (const placed of placedBlocks) {
    const block = blockMap.get(placed.blockId)
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
    const block = blockMap.get(placed.blockId)
    if (!block || !block.files?.schematic) {
      console.warn(`Block ${placed.blockSlug} has no schematic file, skipping`)
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
      console.error(`Failed to load schematic for ${placed.blockSlug}:`, error)
    }
  }

  // Create merged schematic
  const mergedSchematic = new KicadSch({
    version: 20240101,
    generator: 'phaestus',
    titleBlock: new TitleBlock({
      title: projectName,
      company: 'PHAESTUS Generated',
    }),
    paper: new Paper({ size: 'A4' }),
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
      const points = wire.points
      if (points) {
        const xys = points.xys || []
        for (const xy of xys) {
          if (xy.x !== undefined) xy.x += loaded.offsetX
          if (xy.y !== undefined) xy.y += loaded.offsetY
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
  blockMap: Map<string, PcbBlock>,
  globalNets: Map<string, { id: number; name: string }>
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

    if (inputType.includes('temperature') || inputType.includes('humidity') || inputType.includes('pressure')) {
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

    if (outputType.includes('led') || outputType.includes('neopixel') || outputType.includes('ws2812')) {
      outputBlock = availableBlocks.find((b) => b.slug === 'output-led-ws2812')
    } else if (outputType.includes('buzzer') || outputType.includes('sound') || outputType.includes('beep')) {
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
