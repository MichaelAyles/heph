# Blog 33: Formal PCB Block Specifications - Why Circuit Modules Need Schemas

**Date**: January 17, 2026

## The Problem with "Just Wire It Up"

When we started PHAESTUS, blocks were loose concepts. A sensor block had a schematic, a PCB layout, maybe some notes in a README. Combining them meant manually checking:

- Does this I2C sensor conflict with that OLED display?
- Will the power supply handle the motor driver's current draw?
- Which GPIO is the button using?

At 5 blocks, this was manageable. At 20 blocks, it was a spreadsheet nightmare. At the 50+ blocks we're targeting, it's untenable.

We needed machine-readable block definitions.

## The Block Specification

Every block now has a `block.json` that formally describes:

```json
{
  "slug": "sensor-bme280",
  "name": "BME280 Environmental Sensor",
  "version": "1.0.0",
  "category": "sensor",
  "gridSize": [1, 1],

  "bus": {
    "power": {
      "requires": [{ "rail": "3V3", "typicalMa": 1, "maxMa": 4 }]
    },
    "i2c": {
      "addresses": [118],
      "addressConfigurable": true
    }
  },

  "edges": {
    "north": [{ "connector": "J1", "signals": "ALL" }],
    "south": [{ "connector": "J2", "signals": "ALL" }]
  },

  "components": [{ "reference": "U1", "value": "BME280", "footprint": "LGA-8", "quantity": 1 }]
}
```

This isn't documentation. It's a contract.

## The 20-Pin Bus

Every block connects via standardized bus connectors on north and south edges:

```
Pin 1:  GND
Pin 2:  3V3
Pin 3:  I2C1_SDA
Pin 4:  I2C1_SCL
Pin 5-8: GPIO_0 through GPIO_3
Pin 9:  5V0
Pin 10-13: SPI (MOSI, MISO, SCK, CS0)
Pin 14-20: AUX_0 through AUX_6
```

A 1x1 block gets one connector per edge. A 2x2 block gets two. All connectors on a block are tied together - same signals everywhere.

![1x1 JST-PH Battery Connector - PCB Layout](2026-01-17%2019_54_45-1x1-jst-ph-battery-connector%20—%20PCB%20Editor.png)

This JST-PH battery connector block is 1x1 (12.7mm square). You can see the single 20-pin bus connector at the top edge, mounting holes in the corners, and the JST connector routing GND and VBAT to AUX pins.

![1x1 JST-PH Battery Connector - 3D View](2026-01-17%2019_54_58-3D%20Viewer.png)

The 3D view shows how compact a 1x1 block is - just enough room for a JST-PH connector and routing. One bus connector on the north edge passes all 20 signals through.

![2x2 ESP32-C6 MCU Block - PCB Layout](2026-01-17%2019_53_30-ESP32%20—%20PCB%20Editor.png)

The ESP32-C6 MCU block is 2x2 (25.4mm square). The PCB layout shows all the bus signal routing - GPIO_0 through GPIO_3, SPI signals, I2C, AUX channels, and power rails. Each labeled pad corresponds to a pin on the 20-pin bus connectors.

![2x2 ESP32-C6 MCU Block - 3D Top View](2026-01-17%2019_53_49-3D%20Viewer.png)

The 3D view shows the XIAO ESP32-C6 module with its USB-C port and antenna. The bus connectors line the edges - two on each side for this 2x2 block. Notice the RF antenna at the top - that's why this block has a 5mm north overhang declared in its `physical.overhang` property.

## Why Edge Connectors Matter

The grid constraint (12.7mm = 0.5") isn't arbitrary. It matches standard bus connector pitches. When you place a 1x1 block below a 2x2 block, the connectors physically align:

```
┌───────┬───────┐
│  MCU  │ (2x2) │
│  J4   │  J6   │
└───────┴───────┘
    ↓       ↓
┌───────┐
│Sensor │  (1x1)
│  J1   │
└───────┘
```

The MCU's J4 connector lines up with the sensor's J1. Same signals, physical connection. No routing needed.

![Bus Connector Underside - 20 Pins Per Connector](2026-01-17%2019_54_08-3D%20Viewer.png)

Looking at the underside of the ESP32 block, you can see the bus connector pins. Each connector has 20 pins carrying the full bus. When blocks stack, these pins mate with the connectors on the block below.

## 0R Resistor Taps

Here's where it gets interesting. Most bus signals pass through via 0R resistors:

```json
"taps": [
  {
    "signal": "3V3",
    "reference": "R2",
    "isolates": {
      "from": "U1.12 (ESP32 3V3 out)",
      "to": "BUS_3V3",
      "purpose": "Nofit to use external 3V3 regulator"
    }
  }
]
```

Each "tap" is a 0R resistor that can be removed ("nofit") to isolate that signal. The MCU block provides 3V3 to the bus via R2. If you need a beefier regulator, you nofit R2 and add a power block instead.

This is declarative hardware configuration. The LLM can reason about which taps to nofit based on the design requirements.

## Automated DRC

With formal definitions, Design Rule Checks become code:

```typescript
function checkI2cConflict(block1: BlockDefinition, block2: BlockDefinition): string[] {
  const errors: string[] = []

  const addresses1 = block1.bus.i2c?.addresses || []
  const addresses2 = block2.bus.i2c?.addresses || []

  const conflicts = addresses1.filter((a) => addresses2.includes(a))

  for (const addr of conflicts) {
    if (block1.bus.i2c?.addressConfigurable || block2.bus.i2c?.addressConfigurable) {
      errors.push(`I2C conflict at 0x${addr.toString(16)} - adjust jumpers to resolve`)
    } else {
      errors.push(`I2C conflict at 0x${addr.toString(16)} - cannot use both blocks`)
    }
  }

  return errors
}
```

The system checks:

- **I2C address conflicts** - Two BME280s at 0x76? Error. But if one has a configurable address, it's a warning with resolution steps.
- **GPIO conflicts** - Button block claiming GPIO_0 while the LED strip also uses it? Caught.
- **SPI chip select conflicts** - Two SPI devices on CS0? Flagged.
- **Power budget** - Adding a motor driver that needs 2A from a block that provides 500mA? Warning.

## The Schema

The full specification lives in `src/schemas/block.ts` using Zod for runtime validation:

```typescript
export const BlockDefinitionSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  category: BlockCategorySchema,
  description: z.string().min(10).max(500),

  gridSize: z.tuple([z.number().int().min(1), z.number().int().min(1)]),

  bus: BusSchema,
  edges: EdgeSchema,
  components: z.array(ComponentSchema),

  // Optional
  physical: PhysicalSchema.optional(),
  jumpers: z.array(JumperSchema).optional(),
  firmware: FirmwareSchema.optional(),
})
```

Any `block.json` that doesn't match gets rejected with specific error messages:

```
edges.north: Array must have exactly 2 elements (gridSize[0] = 2)
bus.i2c.addresses[0]: Must be between 8 and 119 (0x08-0x77)
```

## What This Enables

1. **Reliable Combinations**: The AI can suggest block combinations knowing they'll work together.

2. **Automatic BOM**: Components are embedded in the definition. Export to CSV is trivial.

3. **Firmware Hints**: The block knows it needs `Adafruit_BME280.h` and initializes at address 0x76. Code generation uses this.

4. **Enclosure Awareness**: Physical properties (overhang, height) feed into OpenSCAD generation.

5. **Versioning**: When we update a block's layout, the version number changes. Projects can pin to specific versions.

## The Admin Interface

Block management moved from "upload some files and hope" to a proper admin panel:

- List all blocks with validation status
- See which required files are missing
- Edit block.json with syntax highlighting
- Run DRC against existing blocks

The "validated" flag only goes green when:

- `block.json` passes schema validation
- Schematic file exists (`.kicad_sch`)
- PCB file exists (`.kicad_pcb`)
- STEP model exists (`.step`)

## Lessons Learned

1. **Schemas pay off immediately** - The first time DRC caught an I2C conflict, the schema work paid for itself.

2. **Physical constraints are data** - Putting overhang and height in the definition means the enclosure generator can account for it automatically.

3. **0R resistors are configuration** - Treating taps as declarative isolation points lets the AI reason about hardware configuration.

4. **Don't trust loose definitions** - "The sensor probably uses I2C" becomes "addresses: [118], addressConfigurable: true". Probably isn't good enough for automation.

## The Commit

```
Implement formal PCB block system with DRC validation

- Add Zod schema for block.json validation (BlockDefinitionSchema)
- Implement DRC checks: I2C conflicts, GPIO conflicts, SPI CS conflicts, power budget
- Add bus tap documentation (0R resistor isolation points)
- Create block-validator.ts for server-side validation
- Update admin blocks page with validation status
```

Next up: getting these blocks _into_ the system without hand-writing JSON.
