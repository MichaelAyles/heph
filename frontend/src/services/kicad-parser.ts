/**
 * KiCad File Parser Service
 *
 * Extracts component and net information from KiCad schematic and PCB files
 * for LLM-assisted block.json generation.
 *
 * Uses kicadts for parsing KiCad S-expression files.
 */

import { parseKicadSch, parseKicadPcb } from 'kicadts'
// Note: Using relative import because this file is imported by functions code
import type { BusSignal } from '../schemas/block'

// All valid bus signals that can be detected from net names
const BUS_SIGNAL_PATTERNS: { pattern: RegExp; signal: BusSignal }[] = [
  // Power
  { pattern: /^GND$/i, signal: 'GND' },
  { pattern: /^3V3(_.*)?$/i, signal: '3V3' },
  { pattern: /^V?3V3$/i, signal: '3V3' },
  { pattern: /^5V0$/i, signal: '5V0' },
  { pattern: /^V?5V$/i, signal: '5V0' },
  { pattern: /^VBUS$/i, signal: '5V0' },
  // I2C
  { pattern: /^I2C\d*_?SDA$/i, signal: 'I2C1_SDA' },
  { pattern: /^SDA\d*$/i, signal: 'I2C1_SDA' },
  { pattern: /^I2C\d*_?SCL$/i, signal: 'I2C1_SCL' },
  { pattern: /^SCL\d*$/i, signal: 'I2C1_SCL' },
  // GPIO
  { pattern: /^GPIO_?0$/i, signal: 'GPIO_0' },
  { pattern: /^GPIO_?1$/i, signal: 'GPIO_1' },
  { pattern: /^GPIO_?2$/i, signal: 'GPIO_2' },
  { pattern: /^GPIO_?3$/i, signal: 'GPIO_3' },
  // SPI
  { pattern: /^SPI_?MOSI$/i, signal: 'SPI_MOSI' },
  { pattern: /^MOSI$/i, signal: 'SPI_MOSI' },
  { pattern: /^SPI_?MISO$/i, signal: 'SPI_MISO' },
  { pattern: /^MISO$/i, signal: 'SPI_MISO' },
  { pattern: /^SPI_?S?CK$/i, signal: 'SPI_SCK' },
  { pattern: /^S?CLK$/i, signal: 'SPI_SCK' },
  { pattern: /^SPI_?CS\d?$/i, signal: 'SPI_CS0' },
  { pattern: /^CS$/i, signal: 'SPI_CS0' },
  // AUX
  { pattern: /^AUX_?0$/i, signal: 'AUX_0' },
  { pattern: /^AUX_?1$/i, signal: 'AUX_1' },
  { pattern: /^AUX_?2$/i, signal: 'AUX_2' },
  { pattern: /^AUX_?3$/i, signal: 'AUX_3' },
  { pattern: /^AUX_?4$/i, signal: 'AUX_4' },
  { pattern: /^AUX_?5$/i, signal: 'AUX_5' },
  { pattern: /^AUX_?6$/i, signal: 'AUX_6' },
]

/**
 * Extracted component from KiCad schematic
 */
export interface ExtractedComponent {
  reference: string // U1, R1, C1
  value: string // ESP32-C6, 10k, 100nF
  footprint: string // QFN-48, 0402, 0603
  libraryId?: string // Library reference
}

/**
 * Compact extraction from KiCad files for LLM processing
 */
export interface KicadExtract {
  // From schematic
  components: ExtractedComponent[]

  // From PCB
  nets: string[]
  boardSize?: {
    width: number // mm
    height: number // mm
  }

  // Inferred from net names
  busSignals: BusSignal[]
  i2cSignals: string[]
  spiSignals: string[]
  gpioSignals: string[]
  powerRails: string[]
  auxSignals: string[]

  // Raw data for debugging
  projectName?: string
}

/**
 * Extract a property value from a KiCad symbol
 */
function getSymbolProperty(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  symbol: any,
  propertyName: string
): string | undefined {
  if (!symbol.properties) return undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prop = symbol.properties.find((p: any) => p.key === propertyName)
  return prop?.value
}

/**
 * Parse KiCad schematic and extract components
 */
export function parseKicadSchematic(content: string): Partial<KicadExtract> {
  const sch = parseKicadSch(content)
  const components: ExtractedComponent[] = []

  // Extract components from symbols
  const symbols = sch.symbols || []
  for (const symbol of symbols) {
    const reference = getSymbolProperty(symbol, 'Reference') || ''
    const value = getSymbolProperty(symbol, 'Value') || ''
    const footprint = getSymbolProperty(symbol, 'Footprint') || ''

    // Skip power symbols and test points
    if (reference.startsWith('#') || reference.startsWith('TP')) {
      continue
    }

    // Skip symbols without a valid reference
    if (!reference || reference === '?') {
      continue
    }

    components.push({
      reference,
      value,
      footprint: footprint.split(':').pop() || footprint, // Remove library prefix
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      libraryId: (symbol as any).libId,
    })
  }

  // Extract project name from title block if available
  let projectName: string | undefined
  if (sch.titleBlock?.title) {
    projectName = sch.titleBlock.title
  }

  return {
    components,
    projectName,
  }
}

/**
 * Parse KiCad PCB and extract nets and board info
 */
export function parseKicadPcbFile(content: string): Partial<KicadExtract> {
  const pcb = parseKicadPcb(content)

  // Extract all net names
  const nets: string[] = []
  const pcbNets = pcb.nets || []
  for (const net of pcbNets) {
    const netName = net.name
    if (netName && netName !== '' && !netName.startsWith('unconnected-')) {
      nets.push(netName)
    }
  }

  // Try to extract board dimensions from Edge.Cuts layer
  // This is a simplified approach - proper extraction would analyze the edge cuts graphics
  let boardSize: KicadExtract['boardSize'] | undefined

  // Look for gr_rect or gr_line on Edge.Cuts layer
  // For now, we'll use the footprint positions to estimate bounds
  const footprints = pcb.footprints || []
  if (footprints.length > 0) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity

    for (const fp of footprints) {
      // Access position via type assertion as kicadts types may not fully expose all properties
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const at = (fp as any).at
      if (at) {
        const x = typeof at.x === 'number' ? at.x : 0
        const y = typeof at.y === 'number' ? at.y : 0
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }

    if (minX !== Infinity) {
      // Add margin for component sizes (rough estimate)
      const margin = 5
      boardSize = {
        width: Math.round((maxX - minX + margin * 2) * 10) / 10,
        height: Math.round((maxY - minY + margin * 2) * 10) / 10,
      }
    }
  }

  return {
    nets,
    boardSize,
  }
}

/**
 * Classify a net name into bus signal category
 */
function classifyNet(netName: string): {
  busSignal?: BusSignal
  category: 'i2c' | 'spi' | 'gpio' | 'power' | 'aux' | 'other'
} {
  // Check against known bus signal patterns
  for (const { pattern, signal } of BUS_SIGNAL_PATTERNS) {
    if (pattern.test(netName)) {
      let category: 'i2c' | 'spi' | 'gpio' | 'power' | 'aux' | 'other' = 'other'
      if (signal.startsWith('I2C')) category = 'i2c'
      else if (signal.startsWith('SPI')) category = 'spi'
      else if (signal.startsWith('GPIO')) category = 'gpio'
      else if (['GND', '3V3', '5V0'].includes(signal)) category = 'power'
      else if (signal.startsWith('AUX')) category = 'aux'

      return { busSignal: signal, category }
    }
  }

  // Infer category from patterns even if not exact bus signal match
  const lower = netName.toLowerCase()
  if (lower.includes('sda') || lower.includes('scl') || lower.includes('i2c')) {
    return { category: 'i2c' }
  }
  if (
    lower.includes('mosi') ||
    lower.includes('miso') ||
    lower.includes('sck') ||
    lower.includes('spi') ||
    lower.includes('cs')
  ) {
    return { category: 'spi' }
  }
  if (lower.includes('gpio')) {
    return { category: 'gpio' }
  }
  if (
    lower.includes('gnd') ||
    lower.includes('vcc') ||
    lower.includes('vdd') ||
    lower.includes('3v3') ||
    lower.includes('5v') ||
    lower.includes('pwr') ||
    lower.includes('bat')
  ) {
    return { category: 'power' }
  }
  if (lower.includes('aux')) {
    return { category: 'aux' }
  }

  return { category: 'other' }
}

/**
 * Merge schematic and PCB extracts, inferring bus signals
 */
export function mergeExtracts(
  schExtract: Partial<KicadExtract>,
  pcbExtract: Partial<KicadExtract>
): KicadExtract {
  const nets = pcbExtract.nets || []

  // Classify nets and build signal lists
  const busSignals = new Set<BusSignal>()
  const i2cSignals: string[] = []
  const spiSignals: string[] = []
  const gpioSignals: string[] = []
  const powerRails: string[] = []
  const auxSignals: string[] = []

  for (const net of nets) {
    const { busSignal, category } = classifyNet(net)

    if (busSignal) {
      busSignals.add(busSignal)
    }

    switch (category) {
      case 'i2c':
        if (!i2cSignals.includes(net)) i2cSignals.push(net)
        break
      case 'spi':
        if (!spiSignals.includes(net)) spiSignals.push(net)
        break
      case 'gpio':
        if (!gpioSignals.includes(net)) gpioSignals.push(net)
        break
      case 'power':
        if (!powerRails.includes(net)) powerRails.push(net)
        break
      case 'aux':
        if (!auxSignals.includes(net)) auxSignals.push(net)
        break
    }
  }

  return {
    components: schExtract.components || [],
    nets,
    boardSize: pcbExtract.boardSize,
    busSignals: Array.from(busSignals),
    i2cSignals,
    spiSignals,
    gpioSignals,
    powerRails,
    auxSignals,
    projectName: schExtract.projectName,
  }
}

/**
 * Parse both schematic and PCB files and return merged extract
 */
export function parseKicadFiles(
  schematicContent: string,
  pcbContent?: string
): KicadExtract {
  const schExtract = parseKicadSchematic(schematicContent)
  const pcbExtract = pcbContent ? parseKicadPcbFile(pcbContent) : {}
  return mergeExtracts(schExtract, pcbExtract)
}

/**
 * Calculate suggested grid size from board dimensions
 * Grid unit is 12.7mm (0.5")
 */
export function calculateGridSize(boardSize?: {
  width: number
  height: number
}): [number, number] {
  if (!boardSize) {
    return [1, 1] // Default to 1x1
  }

  const GRID_UNIT_MM = 12.7
  const width = Math.max(1, Math.ceil(boardSize.width / GRID_UNIT_MM))
  const height = Math.max(1, Math.ceil(boardSize.height / GRID_UNIT_MM))

  return [width, height]
}

/**
 * Format the extract as a compact string for LLM context
 * Reduces tokens while preserving essential information
 */
export function formatExtractForLLM(extract: KicadExtract): string {
  const lines: string[] = []

  // Components
  if (extract.components.length > 0) {
    lines.push('## Components')
    for (const c of extract.components) {
      lines.push(`- ${c.reference}: ${c.value} (${c.footprint})`)
    }
    lines.push('')
  }

  // Board size
  if (extract.boardSize) {
    lines.push(`## Board Size`)
    lines.push(`${extract.boardSize.width}mm x ${extract.boardSize.height}mm`)
    const gridSize = calculateGridSize(extract.boardSize)
    lines.push(`Suggested grid: ${gridSize[0]}x${gridSize[1]}`)
    lines.push('')
  }

  // Nets
  if (extract.nets.length > 0) {
    lines.push('## Nets')
    lines.push(extract.nets.join(', '))
    lines.push('')
  }

  // Classified signals
  if (extract.busSignals.length > 0) {
    lines.push('## Bus Signals Detected')
    lines.push(extract.busSignals.join(', '))
    lines.push('')
  }

  if (extract.powerRails.length > 0) {
    lines.push('### Power Rails')
    lines.push(extract.powerRails.join(', '))
  }

  if (extract.i2cSignals.length > 0) {
    lines.push('### I2C Signals')
    lines.push(extract.i2cSignals.join(', '))
  }

  if (extract.spiSignals.length > 0) {
    lines.push('### SPI Signals')
    lines.push(extract.spiSignals.join(', '))
  }

  if (extract.gpioSignals.length > 0) {
    lines.push('### GPIO Signals')
    lines.push(extract.gpioSignals.join(', '))
  }

  if (extract.auxSignals.length > 0) {
    lines.push('### AUX Signals')
    lines.push(extract.auxSignals.join(', '))
  }

  return lines.join('\n')
}
