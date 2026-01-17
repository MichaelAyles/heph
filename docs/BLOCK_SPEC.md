# PCB Block Specification

This document defines the formal specification for PCB blocks in the PHAESTUS hardware design platform. Each block is a pre-validated circuit module that can be combined on a 12.7mm grid system.

## Overview

Blocks are the fundamental building units of PHAESTUS PCB designs. Each block:
- Occupies a fixed grid area (e.g., 2x2 = 25.4mm x 25.4mm)
- Connects via standardized 20-pin bus connectors on north/south edges
- Has a formal `block.json` definition for DRC (Design Rule Check) validation
- Includes all required source files for schematic/PCB merge

## Required Files

Each block must include these files in its directory:

```
blocks/{slug}/
├── {slug}.kicad_sch      # REQUIRED - KiCad 8 schematic source
├── {slug}.kicad_pcb      # REQUIRED - KiCad 8 PCB layout source
├── {slug}.step           # REQUIRED - 3D model for enclosure generation
├── block.json            # REQUIRED - Structured metadata (see schema below)
├── {slug}.png            # OPTIONAL - Thumbnail for UI (256x256 recommended)
└── README.md             # OPTIONAL - Auto-generated from block.json
```

### File Naming

- `{slug}` is the block's unique identifier in kebab-case
- Example: `mcu-esp32c6`, `sensor-bme280`, `power-lipo-charger`

### Files NOT Required

- **Gerbers** - Generated from merged PCB, not stored per-block
- **BOM CSV** - Embedded in `block.json` components array

## Block Categories

| Category | Description | Examples |
|----------|-------------|----------|
| `mcu` | Microcontroller modules | ESP32-C6, RP2040 |
| `power` | Power management | LiPo charger, buck converter |
| `sensor` | Input sensors | BME280, PIR, light sensor |
| `output` | Actuators/displays | LED driver, relay, OLED |
| `connector` | External interfaces | USB-C, screw terminals |
| `utility` | Support circuits | Level shifter, ESD protection |

## Bus Architecture

### Physical Layout

Blocks connect via 20-pin bus connectors on **north and south edges only**. The bus flows vertically through the PCB.

```
For 2x2 block:
        North Edge
    ┌───────┬───────┐
    │  J3   │  J5   │  (connectors tied together)
    │       │       │
    │       │       │
    │  J4   │  J6   │  (connectors tied together)
    └───────┴───────┘
        South Edge

For 1x1 block:
    ┌───────┐
    │  J1   │  North
    │       │
    │  J2   │  South
    └───────┘
```

**Rules:**
- Connectors per edge = grid width (a 3x2 block has 3 north and 3 south connectors)
- All connectors on a block are tied together (same 20 signals)
- Bus flows north↔south through blocks
- Adjacent blocks connect via matching edge connectors

### Bus Pinout (20 pins per connector)

| Pin | Signal | Description |
|-----|--------|-------------|
| 1 | GND | Ground |
| 2 | 3V3 | 3.3V power rail |
| 3 | I2C1_SDA | I2C data |
| 4 | I2C1_SCL | I2C clock |
| 5 | GPIO_0 | General purpose I/O |
| 6 | GPIO_1 | General purpose I/O |
| 7 | GPIO_2 | General purpose I/O |
| 8 | GPIO_3 | General purpose I/O |
| 9 | 5V0 | 5V power rail (VBUS) |
| 10 | SPI_MOSI | SPI data out |
| 11 | SPI_MISO | SPI data in |
| 12 | SPI_SCK | SPI clock |
| 13 | SPI_CS0 | SPI chip select |
| 14-20 | AUX_0 - AUX_6 | Auxiliary (flexible use) |

### Bus Signal Types

```typescript
type BusSignal =
  // Power
  | 'GND' | '3V3' | '5V0'
  // I2C
  | 'I2C1_SDA' | 'I2C1_SCL'
  // GPIO
  | 'GPIO_0' | 'GPIO_1' | 'GPIO_2' | 'GPIO_3'
  // SPI
  | 'SPI_MOSI' | 'SPI_MISO' | 'SPI_SCK' | 'SPI_CS0'
  // Auxiliary
  | 'AUX_0' | 'AUX_1' | 'AUX_2' | 'AUX_3' | 'AUX_4' | 'AUX_5' | 'AUX_6'
```

## block.json Schema

### Complete Interface

```typescript
interface BlockDefinition {
  // ─────────────────────────────────────────────────────────────────
  // Identity
  // ─────────────────────────────────────────────────────────────────
  slug: string            // Unique identifier (kebab-case, 3-50 chars)
  name: string            // Human-readable name
  version: string         // Semver format (e.g., "1.0.0")
  category: BlockCategory // mcu | power | sensor | output | connector | utility
  description: string     // 10-500 characters

  // ─────────────────────────────────────────────────────────────────
  // Physical Properties
  // ─────────────────────────────────────────────────────────────────
  gridSize: [number, number]  // [width, height] in grid units (12.7mm each)

  physical?: {
    overhang?: {              // mm beyond grid boundary
      north?: number
      south?: number
      east?: number
      west?: number
    }
    heightMm?: number         // Total component height
    clearanceAboveMm?: number // Required clearance (e.g., PIR dome)
  }

  // ─────────────────────────────────────────────────────────────────
  // Bus Interface
  // ─────────────────────────────────────────────────────────────────
  bus: {
    // 0R resistor taps - can be "nofit" to isolate sections
    taps?: BusTap[]

    // Permanent connections (no isolation option)
    permanent?: PermanentConnection[]

    // Power characteristics
    power?: {
      provides?: Array<{ rail: PowerRail; maxMa: number }>
      requires?: Array<{ rail: PowerRail; typicalMa: number; maxMa: number }>
    }

    // I2C usage
    i2c?: {
      addresses: number[]        // 7-bit addresses (0x08-0x77)
      addressConfigurable?: boolean
      providesPullups?: boolean
    }

    // SPI usage
    spi?: {
      csPin: 'SPI0_CS0' | 'SPI0_CS1'
    }

    // GPIO claims (prevents conflicts)
    gpio?: {
      claims: Array<'GPIO0' | 'GPIO1' | ... | 'GPIO7'>
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Edge Connections (NORTH/SOUTH only)
  // Array length must equal gridSize[0]
  // ─────────────────────────────────────────────────────────────────
  edges: {
    north: BusConnection[]
    south: BusConnection[]
  }

  // ─────────────────────────────────────────────────────────────────
  // Configuration (jumpers, solder bridges)
  // ─────────────────────────────────────────────────────────────────
  jumpers?: Jumper[]

  // ─────────────────────────────────────────────────────────────────
  // Bill of Materials
  // ─────────────────────────────────────────────────────────────────
  components: BlockComponent[]

  // ─────────────────────────────────────────────────────────────────
  // Firmware Hints (for code generation)
  // ─────────────────────────────────────────────────────────────────
  firmware?: {
    includes?: string[]               // e.g., ["Wire.h", "BME280.h"]
    defines?: Record<string, string>  // e.g., { "BME280_ADDR": "0x76" }
    initCode?: string                 // Setup snippet
    dependencies?: string[]           // PlatformIO library names
  }
}
```

### Sub-Types

```typescript
interface BusTap {
  signal: BusSignal
  reference: string     // 0R resistor reference (e.g., "R1")
  isolates: {
    from: string        // What gets disconnected (e.g., "U1.12")
    to: string          // Bus connection (e.g., "BUS_3V3")
    purpose: string     // Why you'd nofit this
  }
}

interface PermanentConnection {
  signal: BusSignal
  connectedTo: string   // e.g., "U1.17 (MTDI)"
  reason: string        // Why no isolation needed
}

interface BusConnection {
  connector?: string    // KiCad reference (e.g., "J3")
  signals: 'ALL' | BusSignal[]  // Which signals routed through
}

interface Jumper {
  id: string
  reference: string     // e.g., "JP1", "SB1"
  description: string
  options: Array<{ value: string; label: string; default?: boolean }>
  affects: {
    type: 'i2c_address' | 'power_rail' | 'gpio_routing' | 'interface_mode'
    details: Record<string, unknown>
  }
}

interface BlockComponent {
  reference: string     // C1, R1, U1
  value: string         // 100nF, 10k, ESP32-C6
  footprint: string     // 0402, 0603, QFN-48
  manufacturer?: string
  mpn?: string          // Manufacturer part number
  quantity: number
}

type PowerRail = 'V3V3' | 'VBUS' | 'VBAT' | '3V3' | '5V0'
```

## Example: ESP32-C6 MCU Block

```json
{
  "slug": "mcu-esp32c6",
  "name": "ESP32-C6 MCU",
  "version": "1.0.0",
  "category": "mcu",
  "description": "XIAO ESP32-C6 module with WiFi 6, BLE 5, Zigbee/Thread. Defines all bus signals.",

  "gridSize": [2, 2],

  "physical": {
    "overhang": { "north": 5.0 },
    "heightMm": 8.0
  },

  "bus": {
    "taps": [
      {
        "signal": "3V3",
        "reference": "R2",
        "isolates": {
          "from": "U1.12 (ESP32 3V3 out)",
          "to": "BUS_3V3",
          "purpose": "Nofit to use external 3V3 regulator for peripherals"
        }
      },
      {
        "signal": "5V0",
        "reference": "R9",
        "isolates": {
          "from": "U1.14 (ESP32 5V/VBUS)",
          "to": "BUS_5V0",
          "purpose": "Nofit to isolate USB PD or high-current 5V from ESP32"
        }
      },
      {
        "signal": "GPIO_0",
        "reference": "R12",
        "isolates": {
          "from": "U1.1 (GPIO0)",
          "to": "BUS_GPIO_0",
          "purpose": "Nofit to use GPIO_0 for high-current loads via AUX"
        }
      }
    ],
    "permanent": [
      {
        "signal": "SPI_CS0",
        "connectedTo": "U1.17 (MTDI)",
        "reason": "Direct SPI chip select - isolation not useful"
      }
    ],
    "power": {
      "provides": [
        { "rail": "3V3", "maxMa": 700 },
        { "rail": "5V0", "maxMa": 500 }
      ]
    }
  },

  "edges": {
    "north": [
      { "connector": "J3", "signals": "ALL" },
      { "connector": "J5", "signals": "ALL" }
    ],
    "south": [
      { "connector": "J4", "signals": "ALL" },
      { "connector": "J6", "signals": "ALL" }
    ]
  },

  "components": [
    { "reference": "U1", "value": "XIAO-ESP32-C6-SMD", "footprint": "XIAO-ESP32C6-SMD", "quantity": 1 },
    { "reference": "R1", "value": "0R", "footprint": "0402", "quantity": 1 },
    { "reference": "R2", "value": "0R", "footprint": "0402", "quantity": 1 },
    { "reference": "J3-J6", "value": "20-PIN-BUS", "footprint": "SAMTEC-TFM-110-02", "quantity": 4 }
  ],

  "firmware": {
    "includes": ["WiFi.h", "Wire.h", "SPI.h"],
    "defines": {
      "PIN_SDA": "22",
      "PIN_SCL": "23",
      "PIN_MOSI": "18",
      "PIN_MISO": "20",
      "PIN_SCK": "19"
    },
    "dependencies": []
  }
}
```

## Example: BME280 Sensor Block

```json
{
  "slug": "sensor-bme280",
  "name": "BME280 Environmental Sensor",
  "version": "1.0.0",
  "category": "sensor",
  "description": "Temperature, humidity, and pressure sensor with I2C interface.",

  "gridSize": [1, 1],

  "bus": {
    "taps": [
      {
        "signal": "I2C1_SDA",
        "reference": "R1",
        "isolates": {
          "from": "U1.4 (SDA)",
          "to": "BUS_I2C1_SDA",
          "purpose": "Nofit to remove sensor from I2C bus"
        }
      }
    ],
    "power": {
      "requires": [
        { "rail": "3V3", "typicalMa": 1, "maxMa": 4 }
      ]
    },
    "i2c": {
      "addresses": [0x76],
      "addressConfigurable": true,
      "providesPullups": false
    }
  },

  "edges": {
    "north": [{ "connector": "J1", "signals": "ALL" }],
    "south": [{ "connector": "J2", "signals": "ALL" }]
  },

  "jumpers": [
    {
      "id": "addr-select",
      "reference": "SB1",
      "description": "I2C address selection",
      "options": [
        { "value": "0x76", "label": "SDO to GND (0x76)", "default": true },
        { "value": "0x77", "label": "SDO to VDD (0x77)" }
      ],
      "affects": {
        "type": "i2c_address",
        "details": { "addresses": { "0x76": "SDO low", "0x77": "SDO high" } }
      }
    }
  ],

  "components": [
    { "reference": "U1", "value": "BME280", "footprint": "LGA-8", "manufacturer": "Bosch", "mpn": "BME280", "quantity": 1 },
    { "reference": "C1", "value": "100nF", "footprint": "0402", "quantity": 1 },
    { "reference": "R1", "value": "0R", "footprint": "0201", "quantity": 1 },
    { "reference": "R2", "value": "0R", "footprint": "0201", "quantity": 1 }
  ],

  "firmware": {
    "includes": ["Wire.h", "Adafruit_BME280.h"],
    "defines": { "BME280_ADDR": "0x76" },
    "initCode": "bme.begin(0x76);",
    "dependencies": ["adafruit/Adafruit BME280 Library"]
  }
}
```

## DRC (Design Rule Check) Validation

The system performs automatic compatibility checks when blocks are combined:

### I2C Address Conflicts

Detects when two blocks share the same I2C address. If either block has configurable addresses, a warning is shown with resolution steps.

### GPIO Conflicts

Detects when multiple blocks claim the same GPIO pin.

### SPI CS Conflicts

Detects when multiple SPI devices use the same chip select.

### Power Budget

- Calculates total power requirements vs provisions
- Warns when requirements exceed 80% of capacity
- Errors when no block provides a required rail

### Validation Rules

1. **Edge array length must match grid width**: A 2x2 block must have exactly 2 north and 2 south connections.

2. **I2C addresses must be valid**: Addresses 0x00-0x07 and 0x78-0x7F are reserved.

3. **MCU required**: Every design must include exactly one MCU block.

4. **Power source required**: At least one block must provide each required power rail.

## Creating a New Block

### Step 1: Design in KiCad 8

1. Create schematic with bus connector symbols
2. Route PCB on 12.7mm grid
3. Add 3D models for all components
4. Export STEP file for enclosure generation

### Step 2: Create block.json

1. Use the admin uploader or create manually
2. Reference the schema above
3. Include all bus taps (0R resistors)
4. Document power requirements

### Step 3: Validate

```bash
# Upload via admin panel (validates automatically)
# Or use the API:
curl -X POST /api/admin/blocks \
  -H "Content-Type: multipart/form-data" \
  -F "files=@mcu-esp32c6.kicad_sch" \
  -F "files=@mcu-esp32c6.kicad_pcb" \
  -F "files=@mcu-esp32c6.step" \
  -F "block.json=@block.json"
```

### Step 4: Test in Design

1. Add block to a test project
2. Verify schematic merge works
3. Check DRC passes with compatible blocks
4. Test firmware hints are correct

## TOKN Format (for LLM Block Generation)

When using LLM to generate `block.json` from KiCad files, the netlist is first converted to `.tokn` format for token efficiency:

```
# Compact netlist representation
NET GND U1.12 C1.2 J1.1 J2.1
NET VCC U1.14 C1.1 R1.1
NET SDA U1.3 R1.2->J1.3 J2.3
...
```

This format:
- Reduces tokens by ~80% vs raw KiCad S-expressions
- Highlights net connections clearly for LLM analysis
- Marks 0R resistors with `->` to show tap isolation points

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01 | Initial specification |
