/**
 * Zod schemas for PCB block.json validation
 *
 * This schema defines the formal structure for PCB blocks, enabling
 * DRC (Design Rule Check) validation and automated block compatibility checking.
 *
 * @see docs/BLOCK_SPEC.md for comprehensive documentation
 */

import { z } from 'zod'

// =============================================================================
// Bus Signal Types
// =============================================================================

/**
 * Standard bus signals defined by the MCU block (ESP32-C6)
 * 20 signals per bus connector
 */
export const BusSignalSchema = z.enum([
  // Power (pins 1, 2, 9)
  'GND',
  '3V3',
  '5V0',
  // I2C (pins 3, 4)
  'I2C1_SDA',
  'I2C1_SCL',
  // GPIO (pins 5-8)
  'GPIO_0',
  'GPIO_1',
  'GPIO_2',
  'GPIO_3',
  // SPI (pins 10-13)
  'SPI_MOSI',
  'SPI_MISO',
  'SPI_SCK',
  'SPI_CS0',
  // Auxiliary (pins 14-20) - flexible use
  'AUX_0',
  'AUX_1',
  'AUX_2',
  'AUX_3',
  'AUX_4',
  'AUX_5',
  'AUX_6',
])

export type BusSignal = z.infer<typeof BusSignalSchema>

/**
 * Bus connector pinout (20 pins per connector)
 * This is the physical order of signals on each bus connector
 */
export const BUS_PINOUT: readonly BusSignal[] = [
  'GND', // Pin 1
  '3V3', // Pin 2
  'I2C1_SDA', // Pin 3
  'I2C1_SCL', // Pin 4
  'GPIO_0', // Pin 5
  'GPIO_1', // Pin 6
  'GPIO_2', // Pin 7
  'GPIO_3', // Pin 8
  '5V0', // Pin 9
  'SPI_MOSI', // Pin 10
  'SPI_MISO', // Pin 11
  'SPI_SCK', // Pin 12
  'SPI_CS0', // Pin 13
  'AUX_0', // Pin 14
  'AUX_1', // Pin 15
  'AUX_2', // Pin 16
  'AUX_3', // Pin 17
  'AUX_4', // Pin 18
  'AUX_5', // Pin 19
  'AUX_6', // Pin 20
] as const

// =============================================================================
// Block Categories
// =============================================================================

export const BlockCategorySchema = z.enum([
  'mcu',
  'power',
  'sensor',
  'output',
  'connector',
  'utility',
])

export type BlockCategory = z.infer<typeof BlockCategorySchema>

// =============================================================================
// Bus Interface Schemas
// =============================================================================

/**
 * 0R resistor tap - can be "nofit" to isolate bus sections
 */
export const BusTapSchema = z.object({
  signal: BusSignalSchema,
  reference: z.string().describe('0R resistor reference, e.g., "R1"'),
  isolates: z.object({
    from: z.string().describe('What gets disconnected when nofit, e.g., "U1.12" or "ESP32 3V3"'),
    to: z.string().describe('e.g., "BUS_3V3"'),
    purpose: z.string().describe('e.g., "Allows isolated 3V3 regulator for peripherals"'),
  }),
})

export type BusTap = z.infer<typeof BusTapSchema>

/**
 * Signals permanently connected to bus (no 0R isolation option)
 */
export const PermanentConnectionSchema = z.object({
  signal: BusSignalSchema,
  connectedTo: z.string().describe('e.g., "U1.17" (SPI_CS0 direct to ESP32)'),
  reason: z.string().describe('e.g., "Always needed for SPI communication"'),
})

export type PermanentConnection = z.infer<typeof PermanentConnectionSchema>

/**
 * Power rail provided by a block
 */
export const PowerProvidesSchema = z.object({
  rail: z.enum(['V3V3', 'VBUS', 'VBAT', '3V3', '5V0']),
  maxMa: z.number().int().positive(),
})

/**
 * Power rail required by a block
 */
export const PowerRequiresSchema = z.object({
  rail: z.enum(['V3V3', 'VBUS', '3V3', '5V0']),
  typicalMa: z.number().int().nonnegative(),
  maxMa: z.number().int().positive(),
})

/**
 * I2C interface details
 */
export const I2cDetailsSchema = z.object({
  addresses: z.array(z.number().int().min(0x00).max(0x7f)),
  addressConfigurable: z.boolean().optional(),
  providesPullups: z.boolean().optional(),
})

/**
 * SPI interface details
 */
export const SpiDetailsSchema = z.object({
  csPin: z.enum(['SPI0_CS0', 'SPI0_CS1']),
})

/**
 * GPIO claims (prevents conflicts)
 */
export const GpioClaimsSchema = z.object({
  claims: z.array(
    z.enum(['GPIO0', 'GPIO1', 'GPIO2', 'GPIO3', 'GPIO4', 'GPIO5', 'GPIO6', 'GPIO7'])
  ),
})

/**
 * Complete bus interface definition
 */
export const BusInterfaceSchema = z.object({
  // Isolatable connections (via 0R resistors - can nofit to disconnect)
  taps: z.array(BusTapSchema).optional().default([]),

  // Permanent connections (no isolation option - always connected to bus)
  permanent: z.array(PermanentConnectionSchema).optional().default([]),

  // Power characteristics
  power: z
    .object({
      provides: z.array(PowerProvidesSchema).optional(),
      requires: z.array(PowerRequiresSchema).optional(),
    })
    .optional(),

  // I2C usage
  i2c: I2cDetailsSchema.optional(),

  // SPI usage
  spi: SpiDetailsSchema.optional(),

  // GPIO claims (prevents conflicts)
  gpio: GpioClaimsSchema.optional(),
})

export type BusInterface = z.infer<typeof BusInterfaceSchema>

// =============================================================================
// Edge Connection Schemas
// =============================================================================

/**
 * Single edge column's bus connection
 * Represents what signals are available at one grid column's edge
 */
export const BusConnectionSchema = z.object({
  connector: z.string().optional().describe('e.g., "J3" - KiCad connector reference'),
  signals: z.union([
    z.literal('ALL'),
    z.array(BusSignalSchema),
  ]).describe('Which signals are routed through this column'),
})

export type BusConnection = z.infer<typeof BusConnectionSchema>

/**
 * Edge connections - NORTH/SOUTH ONLY
 * Array length = gridSize[0] (width in grid units)
 */
export const EdgeConnectionsSchema = z.object({
  north: z.array(BusConnectionSchema),
  south: z.array(BusConnectionSchema),
})

export type EdgeConnections = z.infer<typeof EdgeConnectionsSchema>

// =============================================================================
// Physical Properties
// =============================================================================

/**
 * Physical overhang beyond the grid boundary (e.g., USB-C connector)
 */
export const OverhangSchema = z.object({
  north: z.number().nonnegative().optional(),
  south: z.number().nonnegative().optional(),
  east: z.number().nonnegative().optional(),
  west: z.number().nonnegative().optional(),
})

/**
 * Physical properties for enclosure generation
 */
export const PhysicalPropertiesSchema = z.object({
  overhang: OverhangSchema.optional(),
  heightMm: z.number().positive().optional().describe('Total component height for clearance'),
  clearanceAboveMm: z.number().nonnegative().optional().describe('Required clearance (e.g., PIR dome)'),
})

export type PhysicalProperties = z.infer<typeof PhysicalPropertiesSchema>

// =============================================================================
// Jumper Configuration
// =============================================================================

export const JumperOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  default: z.boolean().optional(),
})

export const JumperAffectsSchema = z.object({
  type: z.enum(['i2c_address', 'power_rail', 'gpio_routing', 'interface_mode']),
  details: z.record(z.string(), z.unknown()),
})

export const JumperSchema = z.object({
  id: z.string(),
  reference: z.string().describe('e.g., "JP1" or "SB1"'),
  description: z.string(),
  options: z.array(JumperOptionSchema).min(2),
  affects: JumperAffectsSchema,
})

export type Jumper = z.infer<typeof JumperSchema>

// =============================================================================
// Bill of Materials
// =============================================================================

export const BlockComponentSchema = z.object({
  reference: z.string().describe('C1, R1, U1'),
  value: z.string().describe('100nF, 10k, ESP32-C6'),
  footprint: z.string().describe('0402, 0603, QFN-48'),
  manufacturer: z.string().optional(),
  mpn: z.string().optional().describe('Manufacturer part number'),
  quantity: z.number().int().positive(),
})

export type BlockComponentDef = z.infer<typeof BlockComponentSchema>

// =============================================================================
// Firmware Hints
// =============================================================================

export const FirmwareHintsSchema = z.object({
  includes: z.array(z.string()).optional().describe('e.g., ["Wire.h", "BME280.h"]'),
  defines: z.record(z.string(), z.string()).optional().describe('e.g., { "BME280_ADDR": "0x76" }'),
  initCode: z.string().optional().describe('Setup snippet'),
  dependencies: z.array(z.string()).optional().describe('PlatformIO library names'),
})

export type FirmwareHints = z.infer<typeof FirmwareHintsSchema>

// =============================================================================
// Complete Block Definition Schema
// =============================================================================

export const BlockDefinitionSchema = z.object({
  // Identity
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens only')
    .min(3)
    .max(50),
  name: z.string().min(1).max(100),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format (e.g., 1.0.0)'),
  category: BlockCategorySchema,
  description: z.string().min(10).max(500),

  // Physical grid size
  gridSize: z
    .tuple([z.number().int().positive(), z.number().int().positive()])
    .describe('[width, height] in grid units (12.7mm each)'),

  // Physical properties for enclosure generation
  physical: PhysicalPropertiesSchema.optional(),

  // Bus interface
  bus: BusInterfaceSchema,

  // Edge connections (north/south only, array length = gridSize[0])
  edges: EdgeConnectionsSchema,

  // Configurable options (jumpers, solder bridges)
  jumpers: z.array(JumperSchema).optional(),

  // Bill of materials
  components: z.array(BlockComponentSchema),

  // Firmware hints for code generation
  firmware: FirmwareHintsSchema.optional(),
})

export type BlockDefinition = z.infer<typeof BlockDefinitionSchema>

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate that edge array lengths match grid width
 */
export function validateEdgeConnections(block: BlockDefinition): string[] {
  const errors: string[] = []
  const expectedLength = block.gridSize[0]

  if (block.edges.north.length !== expectedLength) {
    errors.push(
      `North edge has ${block.edges.north.length} connections, expected ${expectedLength} (gridSize[0])`
    )
  }

  if (block.edges.south.length !== expectedLength) {
    errors.push(
      `South edge has ${block.edges.south.length} connections, expected ${expectedLength} (gridSize[0])`
    )
  }

  return errors
}

/**
 * Validate that I2C addresses are valid 7-bit addresses
 */
export function validateI2cAddresses(block: BlockDefinition): string[] {
  const errors: string[] = []

  if (block.bus.i2c?.addresses) {
    for (const addr of block.bus.i2c.addresses) {
      // Reserved addresses: 0x00-0x07 and 0x78-0x7F
      if (addr <= 0x07 || addr >= 0x78) {
        errors.push(`I2C address 0x${addr.toString(16)} is reserved`)
      }
    }
  }

  return errors
}

/**
 * Full block validation including schema and semantic checks
 */
export function validateBlockDefinition(
  data: unknown
): { success: true; data: BlockDefinition } | { success: false; errors: string[] } {
  // First validate against Zod schema
  const result = BlockDefinitionSchema.safeParse(data)

  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
    }
  }

  // Then run semantic validations
  const semanticErrors: string[] = [
    ...validateEdgeConnections(result.data),
    ...validateI2cAddresses(result.data),
  ]

  if (semanticErrors.length > 0) {
    return { success: false, errors: semanticErrors }
  }

  return { success: true, data: result.data }
}
