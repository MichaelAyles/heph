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
  'remote',
])

export type BlockCategory = z.infer<typeof BlockCategorySchema>

// =============================================================================
// Voltage and Electrical Characteristics
// =============================================================================

/**
 * Pin direction for DRC validation
 */
export const PinDirectionSchema = z.enum([
  'input', // Input only (e.g., ADC input)
  'output', // Output only (e.g., power supply output)
  'bidirectional', // GPIO, I2C, etc.
  'power', // Power rail (GND, 3V3, 5V0)
  'open-drain', // Requires external pull-up
])

export type PinDirection = z.infer<typeof PinDirectionSchema>

/**
 * Voltage limits for a signal connection
 * Used for DRC to prevent connecting 5V outputs to 3.3V-only inputs
 */
export const VoltageLimitsSchema = z.object({
  min: z.number().describe('Minimum voltage (usually 0)'),
  max: z.number().describe('Maximum voltage (e.g., 3.3, 5.0)'),
  nominal: z.number().optional().describe('Typical operating voltage'),
  fiveVoltTolerant: z.boolean().optional().describe('Can accept 5V input even if max is 3.3V'),
  direction: PinDirectionSchema,
})

export type VoltageLimits = z.infer<typeof VoltageLimitsSchema>

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
  voltage: VoltageLimitsSchema.optional().describe('Voltage limits for DRC validation'),
})

export type BusTap = z.infer<typeof BusTapSchema>

/**
 * Signals permanently connected to bus (no 0R isolation option)
 */
export const PermanentConnectionSchema = z.object({
  signal: BusSignalSchema,
  pin: z.string().describe('e.g., "U1 MTDI" or "U1.17"'),
  reason: z.string().optional().describe('e.g., "Always needed for SPI communication"'),
  voltage: VoltageLimitsSchema.describe('Voltage limits - REQUIRED for DRC'),
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
 * - If `master: true`, this block provides SPI (MCU) - csPin lists available CS outputs
 * - If `master: false` or undefined, this block is a SPI device and uses the specified csPin
 */
export const SpiDetailsSchema = z.object({
  master: z
    .boolean()
    .optional()
    .describe('True if this block provides SPI (MCU), false if it consumes SPI (device)'),
  csPin: z
    .enum(['SPI0_CS0', 'SPI0_CS1'])
    .optional()
    .describe('CS pin used by device, or available CS pins for master'),
  csPins: z
    .array(z.enum(['SPI0_CS0', 'SPI0_CS1']))
    .optional()
    .describe('Available CS pins (for master blocks)'),
})

/**
 * GPIO claims (prevents conflicts)
 */
export const GpioClaimsSchema = z.object({
  claims: z.array(z.enum(['GPIO0', 'GPIO1', 'GPIO2', 'GPIO3', 'GPIO4', 'GPIO5', 'GPIO6', 'GPIO7'])),
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
  signals: z
    .union([z.literal('ALL'), z.array(BusSignalSchema)])
    .describe('Which signals are routed through this column'),
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
 * Edge mount direction - blocks with connectors that must be at board edge
 */
export const EdgeMountSchema = z.enum(['north', 'south', 'east', 'west'])

export type EdgeMount = z.infer<typeof EdgeMountSchema>

/**
 * Physical properties for enclosure generation
 */
export const PhysicalPropertiesSchema = z.object({
  overhang: OverhangSchema.optional(),
  heightMm: z.number().positive().optional().describe('Total component height for clearance'),
  clearanceAboveMm: z
    .number()
    .nonnegative()
    .optional()
    .describe('Required clearance (e.g., PIR dome)'),
  edgeMount: EdgeMountSchema.optional().describe(
    'Edge this block must be placed at (for USB connectors, etc.)'
  ),
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
  nofit: z
    .boolean()
    .optional()
    .describe('True if component should not be populated (e.g., board interconnects)'),
})

export type BlockComponentDef = z.infer<typeof BlockComponentSchema>

// =============================================================================
// Wireless Capabilities
// =============================================================================

/**
 * Wireless protocol capabilities (primarily for MCU blocks)
 */
export const WirelessCapabilitySchema = z.enum([
  'wifi4', // 802.11n
  'wifi5', // 802.11ac
  'wifi6', // 802.11ax
  'ble4', // Bluetooth Low Energy 4.x
  'ble5', // Bluetooth Low Energy 5.x
  'zigbee', // Zigbee 3.0
  'thread', // Thread / Matter
  'lora', // LoRa
  'nfc', // NFC
  'uwb', // Ultra-Wideband
])

export type WirelessCapability = z.infer<typeof WirelessCapabilitySchema>

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
// Remote Block Schemas
// =============================================================================

/**
 * Cable connector types for remote blocks
 */
export const CableConnectorSchema = z.enum([
  'JST-PH-2',
  'JST-PH-3',
  'JST-PH-4',
  'JST-PH-5',
  'JST-PH-6',
  'FFC-6',
  'FFC-10',
  'FFC-14',
  'FFC-20',
  'IDC-6',
  'IDC-10',
  'DUPONT-4',
  'DUPONT-6',
  'QWIIC',
  'STEMMA-QT',
])

export type CableConnector = z.infer<typeof CableConnectorSchema>

/**
 * I2C address configuration via resistors
 * Allows specifying which resistors to fit/nofit to achieve different I2C addresses
 */
export const I2cAddressConfigSchema = z.object({
  address: z.number().int().min(0x08).max(0x77).describe('I2C address (7-bit, 0x08-0x77)'),
  resistors: z.array(
    z.object({
      reference: z.string().describe('Resistor reference, e.g., "R6"'),
      state: z.enum(['fit', 'nofit']).describe('Whether to populate the resistor'),
    })
  ),
  isDefault: z.boolean().optional().describe('True if this is the default configuration'),
})

export type I2cAddressConfig = z.infer<typeof I2cAddressConfigSchema>

/**
 * Remote block properties - for blocks that connect via cable
 */
export const RemoteBlockPropertiesSchema = z.object({
  matingConnectorSlug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .describe('Slug of the connector block this mates with on the main board'),
  cable: z.object({
    connectorType: CableConnectorSchema,
    pinCount: z.number().int().positive().describe('Number of pins in the cable'),
    pitch: z.string().optional().describe('Cable pitch, e.g., "0.5mm", "2.54mm"'),
    notes: z.string().optional().describe('Additional cable notes, e.g., "Type A FFC (contacts same side)"'),
  }),
  i2cAddressConfigs: z
    .array(I2cAddressConfigSchema)
    .optional()
    .describe('Available I2C address configurations'),
  boardDimensions: z
    .object({
      width: z.number().positive().describe('Board width in mm'),
      height: z.number().positive().describe('Board height in mm'),
    })
    .optional()
    .describe('Physical board dimensions (not grid-aligned)'),
})

export type RemoteBlockProperties = z.infer<typeof RemoteBlockPropertiesSchema>

// =============================================================================
// Complete Block Definition Schema
// =============================================================================

/**
 * Base block definition schema without refinement
 * This is used internally - use BlockDefinitionSchema for validation
 */
const BlockDefinitionBaseSchema = z.object({
  // Identity
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens only')
    .min(3)
    .max(50),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format (e.g., 1.0.0)'),
  category: BlockCategorySchema,
  description: z.string().min(10).max(4000),

  // Remote block flag - if true, this block connects via cable instead of bus
  isRemote: z.boolean().optional().default(false),

  // Remote block properties (required if isRemote is true)
  remote: RemoteBlockPropertiesSchema.optional(),

  // Physical grid size (required for non-remote blocks, absent for remote blocks)
  gridSize: z
    .tuple([z.number().int().positive(), z.number().int().positive()])
    .optional()
    .describe('[width, height] in grid units (12.7mm each)'),

  // Physical properties for enclosure generation
  physical: PhysicalPropertiesSchema.optional(),

  // Bus interface
  bus: BusInterfaceSchema,

  // Edge connections (required for non-remote blocks, absent for remote blocks)
  edges: EdgeConnectionsSchema.optional(),

  // Configurable options (jumpers, solder bridges)
  jumpers: z.array(JumperSchema).optional(),

  // Bill of materials
  components: z.array(BlockComponentSchema),

  // Wireless capabilities (for MCU blocks)
  wireless: z
    .array(WirelessCapabilitySchema)
    .optional()
    .describe('e.g., ["wifi6", "ble5", "thread", "zigbee"]'),

  // Firmware hints for code generation
  firmware: FirmwareHintsSchema.optional(),
})

/**
 * Complete block definition schema with conditional validation
 * - Remote blocks require: `isRemote: true`, `remote` property, NO gridSize/edges
 * - Non-remote blocks require: `gridSize`, `edges`
 */
export const BlockDefinitionSchema = BlockDefinitionBaseSchema.refine(
  (data) => {
    if (data.isRemote) {
      // Remote blocks must have remote properties
      return data.remote !== undefined
    } else {
      // Non-remote blocks must have gridSize and edges
      return data.gridSize !== undefined && data.edges !== undefined
    }
  },
  {
    message:
      'Remote blocks require "remote" property. Non-remote blocks require "gridSize" and "edges".',
    path: ['isRemote'],
  }
)

export type BlockDefinition = z.infer<typeof BlockDefinitionSchema>

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate that edge array lengths match grid width
 * Skipped for remote blocks which don't have edges/gridSize
 */
export function validateEdgeConnections(block: BlockDefinition): string[] {
  // Remote blocks don't have edges - skip validation
  if (block.isRemote) {
    return []
  }

  // Non-remote blocks must have gridSize and edges
  if (!block.gridSize || !block.edges) {
    return ['Non-remote blocks require gridSize and edges']
  }

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
 * Validate remote block properties
 */
export function validateRemoteBlock(block: BlockDefinition): string[] {
  if (!block.isRemote) {
    return []
  }

  const errors: string[] = []

  if (!block.remote) {
    errors.push('Remote blocks require "remote" property')
    return errors
  }

  // Validate mating connector slug format
  if (!block.remote.matingConnectorSlug) {
    errors.push('Remote blocks require matingConnectorSlug')
  }

  // Validate I2C address configs match declared addresses
  if (block.remote.i2cAddressConfigs && block.bus.i2c?.addresses) {
    const declaredAddresses = new Set(block.bus.i2c.addresses)
    for (const config of block.remote.i2cAddressConfigs) {
      if (!declaredAddresses.has(config.address)) {
        errors.push(
          `I2C address config 0x${config.address.toString(16)} not in declared addresses`
        )
      }
    }
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
    ...validateRemoteBlock(result.data),
  ]

  if (semanticErrors.length > 0) {
    return { success: false, errors: semanticErrors }
  }

  return { success: true, data: result.data }
}
