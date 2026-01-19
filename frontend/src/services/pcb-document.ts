/**
 * PCB Documentation Generator
 *
 * Generates comprehensive markdown documentation for a PCB design including:
 * - Board overview and dimensions
 * - Block layout table
 * - Bus connection summary
 * - Power budget analysis
 * - Interface summary (I2C, SPI, GPIO)
 * - File manifest
 */

import type { BlockDefinition } from '../schemas/block'
import type { PlacedBlock, FinalSpec } from '../db/schema'
import {
  calculateBoardSize,
  calculatePowerBudget,
  checkI2cConflicts,
  checkGpioConflicts,
  checkSpiConflicts,
  fromPlacedBlocks,
  validateBusContinuity,
  GRID_UNIT_MM,
  type PowerBudget,
} from './pcb-grid'

// =============================================================================
// Types
// =============================================================================

export interface PCBDocumentInput {
  projectName: string
  projectDescription?: string
  finalSpec?: FinalSpec | null
  placedBlocks: PlacedBlock[]
  blockDefinitions: Map<string, BlockDefinition>
  gridWidth: number
  gridHeight: number
  schematicFilename?: string
  pcbLayoutFilename?: string
  stepAssemblyFilename?: string
}

export interface PCBDocumentOutput {
  markdown: string
  summary: {
    boardWidthMm: number
    boardHeightMm: number
    blockCount: number
    totalGridUnits: number
    powerBudget: PowerBudget
    i2cDevices: Array<{ address: number; blockName: string }>
    spiDevices: Array<{ csPin: string; blockName: string }>
    gpioUsage: Array<{ gpio: string; blockName: string }>
    validationErrors: string[]
    validationWarnings: string[]
  }
}

// =============================================================================
// Main Generator
// =============================================================================

/**
 * Generate comprehensive PCB documentation
 */
export function generatePCBDocument(input: PCBDocumentInput): PCBDocumentOutput {
  const { placedBlocks, blockDefinitions, gridWidth, gridHeight } = input

  // Build grid state for validation
  const gridState = fromPlacedBlocks(placedBlocks, blockDefinitions, gridWidth, gridHeight)
  const boardSize = calculateBoardSize(gridState)
  const blocks = placedBlocks
    .map((p) => blockDefinitions.get(p.blockSlug))
    .filter((b): b is BlockDefinition => b !== undefined)

  // Calculate metrics
  const powerBudget = calculatePowerBudget(blocks)
  const busContinuity = validateBusContinuity(gridState)

  // Collect interfaces
  const i2cDevices: Array<{ address: number; blockName: string }> = []
  const spiDevices: Array<{ csPin: string; blockName: string }> = []
  const gpioUsage: Array<{ gpio: string; blockName: string }> = []

  for (const block of blocks) {
    if (block.bus.i2c?.addresses) {
      for (const addr of block.bus.i2c.addresses) {
        i2cDevices.push({ address: addr, blockName: block.name })
      }
    }
    if (block.bus.spi?.csPin) {
      spiDevices.push({ csPin: block.bus.spi.csPin, blockName: block.name })
    }
    if (block.bus.gpio?.claims) {
      for (const gpio of block.bus.gpio.claims) {
        gpioUsage.push({ gpio, blockName: block.name })
      }
    }
  }

  // Collect validation issues
  const validationErrors: string[] = [
    ...busContinuity.errors,
    ...powerBudget.errors,
    ...checkI2cConflicts(blocks),
    ...checkGpioConflicts(blocks),
    ...checkSpiConflicts(blocks),
  ]

  const validationWarnings: string[] = [...powerBudget.warnings]

  // Generate markdown
  const markdown = generateMarkdown({
    ...input,
    boardSize,
    blocks,
    powerBudget,
    i2cDevices,
    spiDevices,
    gpioUsage,
    validationErrors,
    validationWarnings,
  })

  return {
    markdown,
    summary: {
      boardWidthMm: boardSize.widthMm,
      boardHeightMm: boardSize.heightMm,
      blockCount: placedBlocks.length,
      totalGridUnits: boardSize.width * boardSize.height,
      powerBudget,
      i2cDevices,
      spiDevices,
      gpioUsage,
      validationErrors,
      validationWarnings,
    },
  }
}

// =============================================================================
// Markdown Generation
// =============================================================================

interface MarkdownInput extends PCBDocumentInput {
  boardSize: { width: number; height: number; widthMm: number; heightMm: number }
  blocks: BlockDefinition[]
  powerBudget: PowerBudget
  i2cDevices: Array<{ address: number; blockName: string }>
  spiDevices: Array<{ csPin: string; blockName: string }>
  gpioUsage: Array<{ gpio: string; blockName: string }>
  validationErrors: string[]
  validationWarnings: string[]
}

function generateMarkdown(input: MarkdownInput): string {
  const lines: string[] = []

  // Title
  lines.push(`# PCB Design: ${input.projectName}`)
  lines.push('')

  // Description
  if (input.projectDescription || input.finalSpec?.summary) {
    lines.push(input.projectDescription || input.finalSpec?.summary || '')
    lines.push('')
  }

  // Overview section
  lines.push('## Overview')
  lines.push('')
  lines.push(`| Property | Value |`)
  lines.push(`|----------|-------|`)
  lines.push(`| Board size | ${input.boardSize.widthMm.toFixed(1)}mm × ${input.boardSize.heightMm.toFixed(1)}mm |`)
  lines.push(`| Grid units | ${input.boardSize.width} × ${input.boardSize.height} |`)
  lines.push(`| Grid pitch | ${GRID_UNIT_MM}mm (0.5") |`)
  lines.push(`| Total blocks | ${input.placedBlocks.length} |`)
  lines.push(`| Generated | ${new Date().toISOString().split('T')[0]} |`)
  lines.push('')

  // Block Layout section
  lines.push('## Block Layout')
  lines.push('')
  lines.push('| Position | Block | Size | Category | Purpose |')
  lines.push('|----------|-------|------|----------|---------|')

  // Sort blocks by position for display
  const sortedPlacements = [...input.placedBlocks].sort((a, b) => {
    if (a.gridY !== b.gridY) return a.gridY - b.gridY
    return a.gridX - b.gridX
  })

  for (const placement of sortedPlacements) {
    const block = input.blockDefinitions.get(placement.blockSlug)
    if (block) {
      lines.push(
        `| (${placement.gridX},${placement.gridY}) | ${block.name} | ${block.gridSize[0]}×${block.gridSize[1]} | ${block.category} | ${truncate(block.description, 40)} |`
      )
    }
  }
  lines.push('')

  // ASCII Grid Representation
  lines.push('### Grid Layout')
  lines.push('')
  lines.push('```')
  lines.push(generateAsciiGrid(input))
  lines.push('```')
  lines.push('')

  // Bus Connections section
  lines.push('## Bus Connections')
  lines.push('')
  lines.push('| Block | Provides | Requires | Bus Signals Used |')
  lines.push('|-------|----------|----------|------------------|')

  for (const block of input.blocks) {
    const provides = block.bus.power?.provides?.map((p) => `${p.rail}@${p.maxMa}mA`).join(', ') || '-'
    const requires = block.bus.power?.requires?.map((r) => `${r.rail}@${r.maxMa}mA`).join(', ') || '-'

    const signals: string[] = []
    if (block.bus.i2c?.addresses) {
      signals.push(`I2C: ${block.bus.i2c.addresses.map((a) => `0x${a.toString(16)}`).join(',')}`)
    }
    if (block.bus.spi?.csPin) {
      signals.push(`SPI: ${block.bus.spi.csPin}`)
    }
    if (block.bus.gpio?.claims) {
      signals.push(`GPIO: ${block.bus.gpio.claims.join(',')}`)
    }

    lines.push(`| ${block.name} | ${provides} | ${requires} | ${signals.join('; ') || '-'} |`)
  }
  lines.push('')

  // Power Budget section
  lines.push('## Power Budget')
  lines.push('')

  const rails = Object.keys(input.powerBudget.provides).concat(
    Object.keys(input.powerBudget.requires)
  )
  const uniqueRails = [...new Set(rails)]

  if (uniqueRails.length > 0) {
    lines.push('| Rail | Provided | Required (max) | Margin |')
    lines.push('|------|----------|----------------|--------|')

    for (const rail of uniqueRails) {
      const provided = input.powerBudget.provides[rail] || 0
      const required = input.powerBudget.requires[rail]?.max || 0
      const margin = input.powerBudget.marginPercent[rail]
      const marginStr = margin !== undefined ? `${Math.round(margin)}%` : '-'
      const status = margin !== undefined && margin < 0 ? ' **EXCEEDED**' : ''

      lines.push(`| ${rail} | ${provided}mA | ${required}mA | ${marginStr}${status} |`)
    }
    lines.push('')
  }

  // Interface Summary section
  lines.push('## Interface Summary')
  lines.push('')

  // I2C devices
  if (input.i2cDevices.length > 0) {
    lines.push('### I2C Devices')
    lines.push('')
    lines.push('| Address | Device |')
    lines.push('|---------|--------|')
    for (const dev of input.i2cDevices) {
      lines.push(`| 0x${dev.address.toString(16).padStart(2, '0')} | ${dev.blockName} |`)
    }
    lines.push('')
  } else {
    lines.push('- **I2C devices**: none')
    lines.push('')
  }

  // SPI devices
  if (input.spiDevices.length > 0) {
    lines.push('### SPI Devices')
    lines.push('')
    lines.push('| Chip Select | Device |')
    lines.push('|-------------|--------|')
    for (const dev of input.spiDevices) {
      lines.push(`| ${dev.csPin} | ${dev.blockName} |`)
    }
    lines.push('')
  } else {
    lines.push('- **SPI devices**: none')
    lines.push('')
  }

  // GPIO usage
  if (input.gpioUsage.length > 0) {
    lines.push('### GPIO Usage')
    lines.push('')
    lines.push('| GPIO | Used By |')
    lines.push('|------|---------|')
    for (const usage of input.gpioUsage) {
      lines.push(`| ${usage.gpio} | ${usage.blockName} |`)
    }
    lines.push('')
  } else {
    lines.push('- **GPIO usage**: none assigned')
    lines.push('')
  }

  // Validation section
  if (input.validationErrors.length > 0 || input.validationWarnings.length > 0) {
    lines.push('## Validation')
    lines.push('')

    if (input.validationErrors.length > 0) {
      lines.push('### Errors')
      lines.push('')
      for (const error of input.validationErrors) {
        lines.push(`- ❌ ${error}`)
      }
      lines.push('')
    }

    if (input.validationWarnings.length > 0) {
      lines.push('### Warnings')
      lines.push('')
      for (const warning of input.validationWarnings) {
        lines.push(`- ⚠️ ${warning}`)
      }
      lines.push('')
    }
  } else {
    lines.push('## Validation')
    lines.push('')
    lines.push('✅ All checks passed - bus continuity and power budget OK')
    lines.push('')
  }

  // Files section
  lines.push('## Files')
  lines.push('')
  lines.push('| File | Description |')
  lines.push('|------|-------------|')
  if (input.schematicFilename) {
    lines.push(`| \`${input.schematicFilename}\` | KiCad schematic |`)
  }
  if (input.pcbLayoutFilename) {
    lines.push(`| \`${input.pcbLayoutFilename}\` | KiCad PCB layout |`)
  }
  if (input.stepAssemblyFilename) {
    lines.push(`| \`${input.stepAssemblyFilename}\` | 3D STEP assembly |`)
  }
  lines.push('')

  // Footer
  lines.push('---')
  lines.push('')
  lines.push('*Generated by PHAESTUS PCB Generator*')

  return lines.join('\n')
}

// =============================================================================
// Helper Functions
// =============================================================================

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 3) + '...'
}

function generateAsciiGrid(input: MarkdownInput): string {
  const { boardSize, placedBlocks, blockDefinitions } = input

  if (placedBlocks.length === 0) {
    return '(empty grid)'
  }

  // Create a 2D array for the grid
  const grid: string[][] = []
  for (let y = 0; y < boardSize.height; y++) {
    grid[y] = []
    for (let x = 0; x < boardSize.width; x++) {
      grid[y][x] = '    '
    }
  }

  // Place blocks in the grid
  for (const placement of placedBlocks) {
    const block = blockDefinitions.get(placement.blockSlug)
    if (!block) continue

    const [width, height] = block.gridSize
    const label = block.slug.slice(0, 4).toUpperCase()

    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const x = placement.gridX + dx
        const y = placement.gridY + dy
        if (y < boardSize.height && x < boardSize.width) {
          if (dx === 0 && dy === 0) {
            grid[y][x] = label
          } else {
            grid[y][x] = ' .. '
          }
        }
      }
    }
  }

  // Render as ASCII
  const lines: string[] = []

  // Column headers
  let header = '    '
  for (let x = 0; x < boardSize.width; x++) {
    header += ` Col${x}`
  }
  lines.push(header)

  // Top border
  let topBorder = '   +'
  for (let x = 0; x < boardSize.width; x++) {
    topBorder += '-----+'
  }
  lines.push(topBorder)

  // Rows
  for (let y = 0; y < boardSize.height; y++) {
    let row = `R${y} |`
    for (let x = 0; x < boardSize.width; x++) {
      row += ` ${grid[y][x]}|`
    }
    lines.push(row)

    // Row separator
    let separator = '   +'
    for (let x = 0; x < boardSize.width; x++) {
      separator += '-----+'
    }
    lines.push(separator)
  }

  return lines.join('\n')
}

/**
 * Generate a simple text summary (for quick display)
 */
export function generatePCBSummaryText(input: PCBDocumentInput): string {
  const doc = generatePCBDocument(input)
  const { summary } = doc

  const lines = [
    `Board: ${summary.boardWidthMm.toFixed(1)}×${summary.boardHeightMm.toFixed(1)}mm`,
    `Blocks: ${summary.blockCount}`,
    `I2C: ${summary.i2cDevices.length} device(s)`,
    `SPI: ${summary.spiDevices.length} device(s)`,
    `GPIO: ${summary.gpioUsage.length} pin(s)`,
  ]

  if (summary.validationErrors.length > 0) {
    lines.push(`Errors: ${summary.validationErrors.length}`)
  }
  if (summary.validationWarnings.length > 0) {
    lines.push(`Warnings: ${summary.validationWarnings.length}`)
  }

  return lines.join(' | ')
}
