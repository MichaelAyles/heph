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
      reference: string      // Resistor reference (e.g., "R3")
      isolates: {
        from: string         // What gets disconnected (e.g., "U1 GPIO22_D4_SDA")
        to: string           // Bus connection (e.g., "BUS_I2C1_SDA")
        purpose: string      // Why you'd nofit this
      }
      voltage: {             // REQUIRED - voltage limits for DRC
        min: number          // Usually 0
        max: number          // e.g., 3.3 for ESP32, 5.0 for 5V-tolerant
        direction: 'input' | 'output' | 'bidirectional' | 'power' | 'open-drain'
        fiveVoltTolerant?: boolean  // Can accept 5V even if max is 3.3
      }
    }>

    // Permanent connections - signals hardwired to bus (no isolation option)
    permanent?: Array<{
      signal: BusSignal      // Which bus signal
      pin: string            // e.g., "U1 MTDI" or "U1.17"
      reason?: string        // Why it's hardwired
      voltage: {             // REQUIRED - voltage limits for DRC
        min: number
        max: number
        direction: 'input' | 'output' | 'bidirectional' | 'power' | 'open-drain'
        fiveVoltTolerant?: boolean
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

## CRITICAL - How to Identify Bus Taps

Bus taps are 0R resistors that sit between a bus signal and a component (usually an MCU). You MUST trace the nets to find the correct resistor. Follow these steps EXACTLY:

### Step-by-step tap tracing:

1. **Find the bus signal net** - Look in the nets section for bus signals like I2C1_SDA, GPIO_0, etc.
   Example: \`I2C1_SDA,"J3.3,J4.3,J5.3,J6.3,R3.1"\`

2. **Identify which resistor pin is in that net** - The net shows R3.1 is connected to I2C1_SDA
   So the tap resistor is **R3** (not R1, not R2 - specifically R3 because R3.1 is in the net)

3. **Find what the OTHER pin connects to** - Search for a net containing R3.2
   Example: \`N13,"R3.2,U1.5"\` - R3.2 connects to U1 pin 5

4. **Look up the pin name** - Check the pins section for U1 pin 5
   Example: \`5,GPIO22_D4_SDA\`

5. **Create the tap entry**:
   - signal: "I2C1_SDA" (the bus signal name)
   - reference: "R3" (the resistor you found in step 2)
   - from: "U1 GPIO22_D4_SDA" (component + pin name from step 4)

### Example trace for I2C1_SDA:
- Net: \`I2C1_SDA,"J3.3,J4.3,J5.3,J6.3,R3.1"\` → resistor is R3
- Net: \`N13,"R3.2,U1.5"\` → R3 connects to U1 pin 5
- Pin: \`5,GPIO22_D4_SDA\` → pin 5 is GPIO22_D4_SDA
- Result: signal=I2C1_SDA, reference=R3, from="U1 GPIO22_D4_SDA"

### WRONG approach (DO NOT DO THIS):
- Do NOT guess resistors based on sequential numbering (R1, R2, R3...)
- Do NOT match resistors to signals by name similarity
- Do NOT invent connections - ONLY use what's in the nets data

### Tap format (with voltage limits):
\`\`\`json
{
  "signal": "I2C1_SDA",
  "reference": "R3",
  "isolates": {
    "from": "U1 GPIO22_D4_SDA",
    "to": "BUS_I2C1_SDA",
    "purpose": "Isolate I2C data line from MCU"
  },
  "voltage": {
    "min": 0,
    "max": 3.3,
    "direction": "bidirectional"
  }
}
\`\`\`

## Permanent Connections (Hardwired)

Some signals are directly connected to the bus without a 0R resistor (can't be isolated).
Trace the nets to find signals where a bus signal connects DIRECTLY to a component pin.

Example: If net shows \`SPI_CS0,"J3.13,J4.13,J5.13,J6.13,U1.17"\` with NO resistor, it's permanent:
\`\`\`json
{
  "signal": "SPI_CS0",
  "pin": "U1 MTDI",
  "reason": "Directly connected for SPI chip select",
  "voltage": {
    "min": 0,
    "max": 3.3,
    "direction": "bidirectional"
  }
}
\`\`\`

## Voltage Limits Reference

For ESP32-C6 (XIAO module):
- All GPIO pins: min=0, max=3.3, direction=bidirectional (NOT 5V tolerant!)
- 3V3 rail: min=3.0, max=3.6, direction=power
- 5V rail: min=4.5, max=5.5, direction=power
- GND: min=0, max=0, direction=power

For sensors (e.g., BME280):
- I2C pins: typically min=0, max=3.3, direction=bidirectional
- Check datasheet for 5V tolerance

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
  suggestedCategory?: BlockCategory,
  toknData?: string
): string {
  const gridSize = calculateGridSize(extract.boardSize)
  const formattedExtract = formatExtractForLLM(extract)

  // Include actual board dimensions if available
  const boardDims = extract.boardSize
    ? `**Actual Board Size**: ${extract.boardSize.width}mm x ${extract.boardSize.height}mm`
    : '**Board Size**: Not detected from Edge.Cuts'

  // Use TOKN if available (has pin-level net connections), otherwise use simplified format
  const schematicData = toknData || formattedExtract

  let prompt = `Generate a block.json for this KiCad design.

**Slug**: ${slug}
${suggestedCategory ? `**Suggested Category**: ${suggestedCategory}` : ''}
${boardDims}
**Grid Size**: ${gridSize[0]}x${gridSize[1]} units (${(gridSize[0] * 12.7).toFixed(1)}mm x ${(gridSize[1] * 12.7).toFixed(1)}mm coverage)

## Schematic Data (TOKN format)

\`\`\`
${schematicData}
\`\`\`

## Instructions

1. Analyze the components to determine the block's primary function
2. **TRACE THE NETS** to identify bus taps - follow the step-by-step process in the system prompt
3. **IDENTIFY PERMANENT CONNECTIONS** - bus signals connected directly to components (no 0R resistor)
4. **ADD VOLTAGE LIMITS** to ALL taps and permanent connections
5. Detect I2C/SPI usage from the nets
6. Generate a complete, valid block.json

## CRITICAL Requirements

- **gridSize**: Use EXACTLY [${gridSize[0]}, ${gridSize[1]}] as calculated from board dimensions
- **edges.north**: Array must have EXACTLY ${gridSize[0]} element(s)
- **edges.south**: Array must have EXACTLY ${gridSize[0]} element(s)
- **i2c.addresses**: Use decimal integers (e.g., 118 not "0x76")
- **taps**: MUST trace nets to find correct resistor - do NOT guess!
- **taps.voltage**: REQUIRED for every tap - include min, max, and direction
- **permanent**: Include ALL bus signals that connect directly to component pins without a 0R resistor
- **permanent.voltage**: REQUIRED for every permanent connection
- **components**: Include ALL components from the extracted data

Return ONLY the JSON object. No markdown, no explanation.`

  return prompt
}

/**
 * Build messages array for LLM chat
 */
export function buildBlockGenerationMessages(
  extract: KicadExtract,
  slug: string,
  suggestedCategory?: BlockCategory,
  toknData?: string
): { role: 'system' | 'user'; content: string }[] {
  return [
    { role: 'system', content: buildBlockGenerationSystemPrompt() },
    { role: 'user', content: buildBlockGenerationUserPrompt(extract, slug, suggestedCategory, toknData) },
  ]
}
