/**
 * Block Generation Prompt
 *
 * LLM prompt for generating block.json metadata from extracted KiCad data.
 */

// Note: Using relative imports because this file is imported by functions code,
// and wrangler doesn't resolve @/ aliases
import type { KicadExtract } from '../services/kicad-parser'
import { formatExtractForLLM, calculateGridSize } from '../services/kicad-parser'
import { BUS_PINOUT, type BlockCategory } from '../schemas/block'

/**
 * Build the system prompt for block.json generation
 */
export function buildBlockGenerationSystemPrompt(): string {
  return `You are a PCB block metadata generator for PHAESTUS, a hardware design platform.

Your task is to generate a complete block.json definition from extracted KiCad schematic/PCB data.

## Block System Overview

PHAESTUS uses pre-validated circuit blocks that connect via standardized 20-pin bus connectors. Each block:
- Occupies a fixed grid area (12.7mm per unit)
- Connects via bus connectors on north/south edges only
- Has a formal block.json definition for DRC validation

## Bus Pinout (20 pins per connector)

${BUS_PINOUT.map((sig, i) => `Pin ${i + 1}: ${sig}`).join('\n')}

## Categories

Choose ONE category based on the primary function:
- mcu: Microcontroller modules (ESP32, RP2040)
- power: Power management (LiPo charger, buck converter)
- sensor: Input sensors (BME280, PIR, light sensor)
- output: Actuators/displays (LED driver, relay, OLED)
- connector: External interfaces (USB-C, screw terminals)
- utility: Support circuits (level shifter, ESD protection)

## Block.json Schema

\`\`\`typescript
interface BlockDefinition {
  // Identity (REQUIRED)
  slug: string            // Unique ID, kebab-case, 3-50 chars (e.g., "sensor-bme280")
  name: string            // Human-readable name
  version: string         // Semver format (e.g., "1.0.0")
  category: BlockCategory // mcu | power | sensor | output | connector | utility
  description: string     // 10-500 characters

  // Physical (REQUIRED)
  gridSize: [number, number]  // [width, height] in grid units (12.7mm each)

  // Bus Interface (REQUIRED)
  bus: {
    // 0R resistor taps - signals that can be isolated by removing the resistor
    taps?: Array<{
      signal: BusSignal      // Which bus signal
      reference: string      // Resistor reference (e.g., "R1")
      isolates: {
        from: string         // What gets disconnected (e.g., "U1.12")
        to: string           // Bus connection (e.g., "BUS_3V3")
        purpose: string      // Why you'd nofit this
      }
    }>

    // Power characteristics
    power?: {
      provides?: Array<{ rail: '3V3' | '5V0' | 'VBAT'; maxMa: number }>
      requires?: Array<{ rail: '3V3' | '5V0'; typicalMa: number; maxMa: number }>
    }

    // I2C usage (if present)
    i2c?: {
      addresses: number[]           // 7-bit addresses (0x08-0x77, as decimals)
      addressConfigurable?: boolean
      providesPullups?: boolean
    }

    // SPI usage (if present)
    spi?: {
      csPin: 'SPI0_CS0' | 'SPI0_CS1'
    }
  }

  // Edge Connections (REQUIRED)
  edges: {
    north: BusConnection[]  // Array length = gridSize[0]
    south: BusConnection[]  // Array length = gridSize[0]
  }

  // Bill of Materials (REQUIRED)
  components: Array<{
    reference: string   // C1, R1, U1
    value: string       // 100nF, 10k, ESP32-C6
    footprint: string   // 0402, 0603, QFN-48
    quantity: number
  }>

  // Optional
  physical?: {
    overhang?: { north?: number; south?: number; east?: number; west?: number }
    heightMm?: number
  }

  firmware?: {
    includes?: string[]
    defines?: Record<string, string>
    initCode?: string
    dependencies?: string[]
  }
}

interface BusConnection {
  connector?: string    // KiCad reference (e.g., "J3")
  signals: 'ALL' | BusSignal[]
}
\`\`\`

## Rules

1. **slug**: Use provided slug or infer from component (e.g., "sensor-bme280", "mcu-esp32c6")
2. **gridSize**: Calculate from board dimensions, round UP to grid units (12.7mm each)
3. **edges**: Array lengths MUST equal gridSize[0] (width)
4. **i2c.addresses**: Use decimal numbers (e.g., 118 for 0x76), NOT hex strings
5. **taps**: Identify 0R resistors that connect signals to the bus
6. **components**: Group identical components (e.g., 4x bus connectors as quantity: 4)

## Common I2C Addresses (decimal)

- BME280/BMP280: 118 (0x76) or 119 (0x77)
- SHT40/SHT41: 68 (0x44)
- VEML7700: 16 (0x10)
- LIS3DH: 24 (0x18) or 25 (0x19)
- VL53L0X: 41 (0x29)
- OLED SSD1306: 60 (0x3C) or 61 (0x3D)

## Output Format

Return ONLY valid JSON. No markdown, no explanation, no code fences.`
}

/**
 * Build the user prompt with extracted KiCad data
 */
export function buildBlockGenerationUserPrompt(
  extract: KicadExtract,
  slug: string,
  suggestedCategory?: BlockCategory
): string {
  const gridSize = calculateGridSize(extract.boardSize)
  const formattedExtract = formatExtractForLLM(extract)

  let prompt = `Generate a block.json for this KiCad design.

**Slug**: ${slug}
${suggestedCategory ? `**Suggested Category**: ${suggestedCategory}` : ''}
**Suggested Grid Size**: ${gridSize[0]}x${gridSize[1]} (${gridSize[0] * 12.7}mm x ${gridSize[1] * 12.7}mm)

## Extracted KiCad Data

${formattedExtract}

## Instructions

1. Analyze the components to determine the block's primary function
2. Identify any 0R resistors that act as bus taps
3. Detect I2C/SPI usage from the nets
4. Generate a complete, valid block.json

Remember:
- edges.north and edges.south arrays must each have exactly ${gridSize[0]} element(s)
- Use "ALL" for signals if all 20 bus pins are connected
- I2C addresses must be decimal integers (not hex strings)
- Include ALL components from the extracted data

Return ONLY the JSON object.`

  return prompt
}

/**
 * Build messages array for LLM chat
 */
export function buildBlockGenerationMessages(
  extract: KicadExtract,
  slug: string,
  suggestedCategory?: BlockCategory
): { role: 'system' | 'user'; content: string }[] {
  return [
    { role: 'system', content: buildBlockGenerationSystemPrompt() },
    { role: 'user', content: buildBlockGenerationUserPrompt(extract, slug, suggestedCategory) },
  ]
}
