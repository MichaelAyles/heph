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
    nofit?: boolean     // True for components not to be populated (board interconnects)
  }>

  // Wireless capabilities (for MCU blocks)
  wireless?: Array<'wifi4' | 'wifi5' | 'wifi6' | 'ble4' | 'ble5' | 'zigbee' | 'thread' | 'lora' | 'nfc' | 'uwb'>

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
7. **nofit**: Mark components with \`nofit: true\` if they should NOT be populated:
   - Bus interconnects (footprint contains "ForgeLabs_Interconnect") are ALWAYS nofit
   - These are board-to-board connections, not actual components to solder

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

## Wireless Capabilities

For MCU blocks, include wireless protocols supported:
- ESP32-C6: ["wifi6", "ble5", "thread", "zigbee"]
- ESP32-S3: ["wifi4", "ble5"]
- nRF52840: ["ble5", "thread", "zigbee"]

## Power Rail Notes

Power rails (3V3, 5V0) can often be INPUT or OUTPUT depending on configuration:
- MCU with USB: 5V0 is OUTPUT (from USB), 3V3 is OUTPUT (from onboard regulator)
- MCU with external 5V: 5V0 is INPUT, 3V3 may be OUTPUT (MCU reg) or INPUT (external reg)
- The 0R taps control whether the MCU's rails connect to the bus

Include taps for power rails (3V3, 5V0) if they have 0R resistors for isolation.

## Common I2C Addresses (decimal)

- BME280/BMP280: 118 (0x76) or 119 (0x77)
- SHT40/SHT41: 68 (0x44)
- VEML7700: 16 (0x10)
- LIS3DH: 24 (0x18) or 25 (0x19)
- VL53L0X: 41 (0x29)
- OLED SSD1306: 60 (0x3C) or 61 (0x3D)

## Remote Blocks

Remote blocks are PCB modules that connect via cable instead of the bus connector system. They are used for:
- Button panels that need to be mounted on enclosure surface
- Display modules that need to be flush with enclosure front
- IO expanders for remote sensors
- USB/power connectors that need to be at enclosure edges

### Detecting Remote Blocks

A block is likely REMOTE if:
1. It has NO ForgeLabs_Interconnect footprints (the 20-pin bus connectors)
2. It HAS FFC, JST, IDC, or similar cable connectors
3. Its name/description suggests it's a "remote", "panel", or "breakout" module

### Remote Block Schema

Remote blocks use a different schema:
\`\`\`typescript
{
  // Same identity fields
  slug: string
  name: string
  version: string
  category: BlockCategory
  description: string  // Up to 4000 chars - be detailed about cable type, I2C config, etc.

  // MUST be true for remote blocks
  isRemote: true

  // Required for remote blocks
  remote: {
    matingConnectorSlug: string  // Slug of connector block on main board, e.g., "connector-io-1x1"
    cable: {
      connectorType: 'JST-PH-2' | 'JST-PH-3' | 'JST-PH-4' | 'JST-PH-5' | 'JST-PH-6' |
                     'FFC-6' | 'FFC-10' | 'FFC-14' | 'FFC-20' |
                     'IDC-6' | 'IDC-10' | 'DUPONT-4' | 'DUPONT-6' | 'QWIIC' | 'STEMMA-QT'
      pinCount: number
      pitch?: string        // e.g., "0.5mm", "2.54mm"
      notes?: string        // e.g., "Type A FFC (contacts same side)"
    }
    i2cAddressConfigs?: Array<{
      address: number       // 7-bit I2C address as decimal
      resistors: Array<{ reference: string, state: 'fit' | 'nofit' }>
      isDefault?: boolean
    }>
    boardDimensions?: { width: number, height: number }  // mm
  }

  // NO gridSize for remote blocks
  // NO edges for remote blocks

  // Same bus and components as regular blocks
  bus: BusInterface
  components: BlockComponent[]
}
\`\`\`

### Remote Block Description Requirements

For remote blocks, the description MUST include:
1. What the module does (e.g., "4-channel RGB IO panel")
2. Cable type and specs (e.g., "Connects via 6-pin 0.5mm FFC cable")
3. Required connector block (e.g., "Requires 1x1 IO Connector Block")
4. I2C address configuration (e.g., "I2C: 0x58 default, configurable via R6/R7")

Example description (for rich detail up to 4000 chars):
"4-channel RGB IO panel with AW9523B I2C LED driver and tactile switches. Connects via 6-pin 0.5mm FFC cable. Requires 1x1 IO Connector Block. I2C addresses: 0x58 (R6/R7 nofit, default), 0x59 (R7 fit), 0x5A (R6 fit), 0x5B (both fit)."

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
  toknData?: string,
  isRemote?: boolean
): string {
  const gridSize = calculateGridSize(extract.boardSize)
  const formattedExtract = formatExtractForLLM(extract)

  // Include actual board dimensions if available
  const boardDims = extract.boardSize
    ? `**Actual Board Size**: ${extract.boardSize.width}mm x ${extract.boardSize.height}mm`
    : '**Board Size**: Not detected from Edge.Cuts'

  // Use TOKN if available (has pin-level net connections), otherwise use simplified format
  const schematicData = toknData || formattedExtract

  // Detect if this is likely a remote block based on components
  const hasInterconnect = extract.components.some(
    (c) => c.footprint?.includes('ForgeLabs_Interconnect') || c.footprint?.includes('BUS_20')
  )
  const hasCableConnector = extract.components.some(
    (c) =>
      c.footprint?.toLowerCase().includes('ffc') ||
      c.footprint?.toLowerCase().includes('jst') ||
      c.footprint?.toLowerCase().includes('idc') ||
      c.value?.toLowerCase().includes('ffc') ||
      c.value?.toLowerCase().includes('conn')
  )
  const likelyRemote = isRemote || (!hasInterconnect && hasCableConnector)

  if (likelyRemote) {
    // Remote block prompt - no gridSize/edges
    const prompt = `Generate a block.json for this REMOTE block (off-grid, cable-connected module).

**Slug**: ${slug}
${suggestedCategory ? `**Suggested Category**: ${suggestedCategory}` : ''}
${boardDims}
**Block Type**: REMOTE (connects via cable, not bus connectors)

## Schematic Data (TOKN format)

\`\`\`
${schematicData}
\`\`\`

## Instructions for REMOTE Block

1. Analyze the components to determine the block's primary function
2. Identify the cable connector type (FFC, JST, IDC, etc.)
3. Determine the I2C addresses and how they can be configured via resistors
4. Trace nets to identify which resistors control I2C address selection
5. Generate a complete, valid remote block.json

## CRITICAL Requirements for REMOTE Blocks

- **isRemote**: MUST be \`true\`
- **remote.matingConnectorSlug**: Slug of connector block on main board (e.g., "connector-io-1x1")
- **remote.cable**: Identify connector type, pin count, pitch from schematic
- **remote.i2cAddressConfigs**: Document all I2C address options with resistor configurations
- **remote.boardDimensions**: Set to { width: ${extract.boardSize?.width || 'XX'}, height: ${extract.boardSize?.height || 'XX'} }
- **description**: MUST include cable type, required connector block, I2C address config (up to 4000 chars)
- **NO gridSize**: Remote blocks don't have gridSize
- **NO edges**: Remote blocks don't have edge connections
- **i2c.addresses**: Use decimal integers (e.g., 88 not "0x58")
- **components**: Include ALL components from the extracted data

Return ONLY the JSON object. No markdown, no explanation.`

    return prompt
  }

  // Standard grid block prompt
  const prompt = `Generate a block.json for this KiCad design.

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
  toknData?: string,
  isRemote?: boolean
): { role: 'system' | 'user'; content: string }[] {
  return [
    { role: 'system', content: buildBlockGenerationSystemPrompt() },
    {
      role: 'user',
      content: buildBlockGenerationUserPrompt(extract, slug, suggestedCategory, toknData, isRemote),
    },
  ]
}
