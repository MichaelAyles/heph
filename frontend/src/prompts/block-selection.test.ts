/**
 * Tests for Block Selection Prompt
 */

import { describe, it, expect } from 'vitest'
import {
  buildBlockSelectionPrompt,
  autoSelectBlocks,
  validateBlockSelection,
  type BlockPlacement,
  type BlockSelectionResult,
} from './block-selection'
import type { FinalSpec, PcbBlock } from '@/db/schema'

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createBaseFinalSpec = (): FinalSpec => ({
  name: 'Test Project',
  summary: 'A test project for testing',
  power: {
    source: 'USB-C',
    voltage: '5V',
    current: '500mA',
  },
  pcbSize: {
    width: 50,
    height: 40,
    unit: 'mm',
  },
  inputs: [],
  outputs: [],
  communication: {
    type: 'WiFi',
    protocol: 'HTTP',
  },
  enclosure: {
    style: 'box',
    width: 60,
    height: 50,
    depth: 25,
  },
  estimatedBOM: [],
  locked: true,
  lockedAt: new Date().toISOString(),
})

const createMockBlock = (overrides: Partial<PcbBlock> = {}): PcbBlock => ({
  id: 'test-block',
  slug: 'test-block',
  name: 'Test Block',
  category: 'sensor',
  description: 'A test block',
  widthUnits: 1,
  heightUnits: 1,
  taps: [],
  i2cAddresses: null,
  spiCs: null,
  power: { currentMaxMa: 10 },
  components: [],
  isValidated: true,
  edges: undefined,
  files: undefined,
  netMappings: undefined,
  ...overrides,
})

const createBlockLibrary = (): PcbBlock[] => [
  createMockBlock({
    id: 'mcu-esp32c6',
    slug: 'mcu-esp32c6',
    name: 'ESP32-C6',
    category: 'mcu',
    widthUnits: 2,
    heightUnits: 2,
  }),
  createMockBlock({
    id: 'power-usb-c',
    slug: 'power-usb-c',
    name: 'USB-C Power',
    category: 'power',
    widthUnits: 1,
    heightUnits: 1,
  }),
  createMockBlock({
    id: 'power-lipo',
    slug: 'power-lipo',
    name: 'LiPo Charger',
    category: 'power',
    widthUnits: 2,
    heightUnits: 1,
  }),
  createMockBlock({
    id: 'power-boost-aa',
    slug: 'power-boost-aa',
    name: 'AA Boost',
    category: 'power',
    widthUnits: 2,
    heightUnits: 1,
  }),
  createMockBlock({
    id: 'power-cr2032',
    slug: 'power-cr2032',
    name: 'CR2032 Holder',
    category: 'power',
    widthUnits: 1,
    heightUnits: 1,
  }),
  createMockBlock({
    id: 'sensor-bme280',
    slug: 'sensor-bme280',
    name: 'BME280',
    category: 'sensor',
    widthUnits: 1,
    heightUnits: 1,
  }),
  createMockBlock({
    id: 'sensor-sht40',
    slug: 'sensor-sht40',
    name: 'SHT40',
    category: 'sensor',
    widthUnits: 1,
    heightUnits: 1,
  }),
  createMockBlock({
    id: 'sensor-lis3dh',
    slug: 'sensor-lis3dh',
    name: 'LIS3DH',
    category: 'sensor',
    widthUnits: 1,
    heightUnits: 1,
  }),
  createMockBlock({
    id: 'sensor-veml7700',
    slug: 'sensor-veml7700',
    name: 'VEML7700',
    category: 'sensor',
    widthUnits: 1,
    heightUnits: 1,
  }),
  createMockBlock({
    id: 'sensor-vl53l0x',
    slug: 'sensor-vl53l0x',
    name: 'VL53L0X',
    category: 'sensor',
    widthUnits: 1,
    heightUnits: 1,
  }),
  createMockBlock({
    id: 'sensor-pir',
    slug: 'sensor-pir',
    name: 'PIR Sensor',
    category: 'sensor',
    widthUnits: 2,
    heightUnits: 1,
  }),
  createMockBlock({
    id: 'output-ws2812b-8',
    slug: 'output-ws2812b-8',
    name: 'WS2812B 8x',
    category: 'output',
    widthUnits: 2,
    heightUnits: 1,
  }),
  createMockBlock({
    id: 'output-oled-096',
    slug: 'output-oled-096',
    name: 'OLED 0.96"',
    category: 'output',
    widthUnits: 2,
    heightUnits: 2,
  }),
  createMockBlock({
    id: 'output-buzzer',
    slug: 'output-buzzer',
    name: 'Buzzer',
    category: 'output',
    widthUnits: 1,
    heightUnits: 1,
  }),
  createMockBlock({
    id: 'output-relay',
    slug: 'output-relay',
    name: 'Relay',
    category: 'output',
    widthUnits: 2,
    heightUnits: 1,
  }),
  createMockBlock({
    id: 'output-drv8833',
    slug: 'output-drv8833',
    name: 'Motor Driver',
    category: 'output',
    widthUnits: 2,
    heightUnits: 1,
  }),
  createMockBlock({
    id: 'connector-buttons-2',
    slug: 'connector-buttons-2',
    name: '2 Buttons',
    category: 'connector',
    widthUnits: 1,
    heightUnits: 1,
  }),
  createMockBlock({
    id: 'connector-buttons-4',
    slug: 'connector-buttons-4',
    name: '4 Buttons',
    category: 'connector',
    widthUnits: 2,
    heightUnits: 1,
  }),
  createMockBlock({
    id: 'connector-encoder',
    slug: 'connector-encoder',
    name: 'Rotary Encoder',
    category: 'connector',
    widthUnits: 1,
    heightUnits: 1,
  }),
]

// =============================================================================
// buildBlockSelectionPrompt Tests
// =============================================================================

describe('buildBlockSelectionPrompt', () => {
  it('includes project name and summary', () => {
    const spec = createBaseFinalSpec()
    const prompt = buildBlockSelectionPrompt(spec)

    expect(prompt).toContain('Project: Test Project')
    expect(prompt).toContain('A test project for testing')
  })

  it('includes power specifications', () => {
    const spec = createBaseFinalSpec()
    spec.power = {
      source: 'LiPo Battery',
      voltage: '3.7V',
      current: '200mA',
      batteryLife: '24 hours',
    }
    const prompt = buildBlockSelectionPrompt(spec)

    expect(prompt).toContain('Source: LiPo Battery')
    expect(prompt).toContain('Voltage: 3.7V')
    expect(prompt).toContain('Current: 200mA')
    expect(prompt).toContain('Battery life target: 24 hours')
  })

  it('includes inputs with counts and notes', () => {
    const spec = createBaseFinalSpec()
    spec.inputs = [
      { type: 'Button', count: 2, notes: 'Navigation' },
      { type: 'Rotary Encoder', count: 1, notes: '' },
    ]
    const prompt = buildBlockSelectionPrompt(spec)

    expect(prompt).toContain('Button x2 (Navigation)')
    expect(prompt).toContain('Rotary Encoder x1')
  })

  it('includes outputs with counts and notes', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [
      { type: 'WS2812B LEDs', count: 8, notes: 'Status display' },
      { type: 'Buzzer', count: 1, notes: '' },
    ]
    const prompt = buildBlockSelectionPrompt(spec)

    expect(prompt).toContain('WS2812B LEDs x8 (Status display)')
    expect(prompt).toContain('Buzzer x1')
  })

  it('includes communication type and protocol', () => {
    const spec = createBaseFinalSpec()
    spec.communication = {
      type: 'BLE',
      protocol: 'GATT',
    }
    const prompt = buildBlockSelectionPrompt(spec)

    expect(prompt).toContain('Type: BLE')
    expect(prompt).toContain('Protocol: GATT')
  })

  it('includes target PCB size', () => {
    const spec = createBaseFinalSpec()
    spec.pcbSize = {
      width: 75,
      height: 55,
      unit: 'mm',
    }
    const prompt = buildBlockSelectionPrompt(spec)

    expect(prompt).toContain('75 x 55 mm')
  })

  it('requests JSON output', () => {
    const spec = createBaseFinalSpec()
    const prompt = buildBlockSelectionPrompt(spec)

    expect(prompt).toContain('Return JSON')
  })
})

// =============================================================================
// autoSelectBlocks Tests
// =============================================================================

describe('autoSelectBlocks', () => {
  it('always includes MCU block', () => {
    const spec = createBaseFinalSpec()
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('mcu'))).toBe(true)
  })

  it('warns if MCU block not found', () => {
    const spec = createBaseFinalSpec()
    const blocks = createBlockLibrary().filter((b) => !b.slug.includes('mcu'))

    const result = autoSelectBlocks(spec, blocks)

    expect(result.warnings).toContain('ESP32-C6 MCU block not found')
  })

  it('selects USB power for USB source', () => {
    const spec = createBaseFinalSpec()
    spec.power.source = 'USB-C'
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('power-usb'))).toBe(true)
  })

  it('selects LiPo power for battery source', () => {
    const spec = createBaseFinalSpec()
    spec.power.source = 'LiPo Battery'
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('power-lipo'))).toBe(true)
  })

  it('selects LiPo power for lithium source', () => {
    const spec = createBaseFinalSpec()
    spec.power.source = 'Lithium cell'
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('power-lipo'))).toBe(true)
  })

  it('selects AA boost for AA batteries', () => {
    const spec = createBaseFinalSpec()
    spec.power.source = '2xAA batteries'
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('power-boost'))).toBe(true)
  })

  it('selects CR2032 for coin cell', () => {
    const spec = createBaseFinalSpec()
    spec.power.source = 'CR2032 coin cell'
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('power-cr2032'))).toBe(true)
  })

  it('defaults to USB power for unknown source', () => {
    const spec = createBaseFinalSpec()
    spec.power.source = 'some unknown power'
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('power-usb'))).toBe(true)
  })

  it('adds BME280 for temperature output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Temperature reading', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('sensor-bme280'))).toBe(true)
  })

  it('adds BME280 for humidity output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Humidity sensor', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('sensor-bme280'))).toBe(true)
  })

  it('adds BME280 for environmental output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Environmental monitoring', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('sensor-bme280'))).toBe(true)
  })

  it('adds LIS3DH for acceleration output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Acceleration data', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('sensor-lis3dh'))).toBe(true)
  })

  it('adds LIS3DH for motion output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Motion detection', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('sensor-lis3dh'))).toBe(true)
  })

  it('adds LIS3DH for tilt output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Tilt sensing', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('sensor-lis3dh'))).toBe(true)
  })

  it('adds VEML7700 for light output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Light level', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('sensor-veml7700'))).toBe(true)
  })

  it('adds VEML7700 for ambient output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Ambient brightness', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('sensor-veml7700'))).toBe(true)
  })

  it('adds VEML7700 for lux output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Lux measurement', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('sensor-veml7700'))).toBe(true)
  })

  it('adds VL53L0X for distance output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Distance measurement', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('sensor-vl53l0x'))).toBe(true)
  })

  it('adds VL53L0X for proximity output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Proximity detection', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('sensor-vl53l0x'))).toBe(true)
  })

  it('adds VL53L0X for range output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Range finder', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('sensor-vl53l0x'))).toBe(true)
  })

  it('adds PIR for PIR output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'PIR sensor', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('sensor-pir'))).toBe(true)
  })

  it('adds PIR for presence output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Presence detection', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('sensor-pir'))).toBe(true)
  })

  it('adds WS2812B for LED output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Status LEDs', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('output-ws2812b'))).toBe(true)
  })

  it('adds WS2812B for neopixel output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'NeoPixel strip', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('output-ws2812b'))).toBe(true)
  })

  it('adds OLED for display output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Info display', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('output-oled'))).toBe(true)
  })

  it('adds OLED for screen output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Small screen', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('output-oled'))).toBe(true)
  })

  it('adds buzzer for buzzer output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Buzzer', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('output-buzzer'))).toBe(true)
  })

  it('adds buzzer for sound output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Sound alert', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('output-buzzer'))).toBe(true)
  })

  it('adds buzzer for beep output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Beep indicator', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('output-buzzer'))).toBe(true)
  })

  it('adds relay for relay output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Relay control', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('output-relay'))).toBe(true)
  })

  it('adds relay for switch output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Power switch', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('output-relay'))).toBe(true)
  })

  it('adds motor driver for motor output', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'DC Motor', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('output-drv8833'))).toBe(true)
  })

  it('adds 2-button connector for 1-2 buttons', () => {
    const spec = createBaseFinalSpec()
    spec.inputs = [{ type: 'Button', count: 2, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('connector-buttons-2'))).toBe(true)
  })

  it('adds 4-button connector for 3+ buttons', () => {
    const spec = createBaseFinalSpec()
    spec.inputs = [{ type: 'Button', count: 4, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('connector-buttons-4'))).toBe(true)
  })

  it('adds encoder for encoder input', () => {
    const spec = createBaseFinalSpec()
    spec.inputs = [{ type: 'Rotary encoder', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('connector-encoder'))).toBe(true)
  })

  it('adds encoder for dial input', () => {
    const spec = createBaseFinalSpec()
    spec.inputs = [{ type: 'Volume dial', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('connector-encoder'))).toBe(true)
  })

  it('adds encoder for knob input', () => {
    const spec = createBaseFinalSpec()
    spec.inputs = [{ type: 'Control knob', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.blocks.some((b) => b.blockSlug.includes('connector-encoder'))).toBe(true)
  })

  it('calculates minimum board size', () => {
    const spec = createBaseFinalSpec()
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    // Minimum 4x3 grid units = ~50.8 x ~38.1 mm (account for floating point)
    expect(result.boardSize.width).toBeGreaterThanOrEqual(50)
    expect(result.boardSize.height).toBeGreaterThanOrEqual(38)
  })

  it('provides placement reasoning', () => {
    const spec = createBaseFinalSpec()
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    expect(result.reasoning).toContain('Auto-selected')
    expect(result.reasoning).toContain('blocks')
  })

  it('assigns valid grid positions', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [
      { type: 'Temperature', count: 1, notes: '' },
      { type: 'LED', count: 1, notes: '' },
    ]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    for (const block of result.blocks) {
      expect(block.gridX).toBeGreaterThanOrEqual(0)
      expect(block.gridY).toBeGreaterThanOrEqual(0)
      expect(block.rotation).toBe(0)
    }
  })

  it('provides reason for each block', () => {
    const spec = createBaseFinalSpec()
    spec.outputs = [{ type: 'Temperature', count: 1, notes: '' }]
    const blocks = createBlockLibrary()

    const result = autoSelectBlocks(spec, blocks)

    for (const block of result.blocks) {
      expect(block.reason).toBeTruthy()
    }
  })

  it('handles empty blocks array', () => {
    const spec = createBaseFinalSpec()

    const result = autoSelectBlocks(spec, [])

    expect(result.blocks.length).toBe(0)
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// validateBlockSelection Tests
// =============================================================================

describe('validateBlockSelection', () => {
  it('returns valid for complete selection', () => {
    const selection: BlockSelectionResult = {
      blocks: [
        { blockSlug: 'mcu-esp32c6', gridX: 0, gridY: 0, rotation: 0, reason: 'MCU' },
        { blockSlug: 'power-usb-c', gridX: 2, gridY: 0, rotation: 0, reason: 'Power' },
      ],
      boardSize: { width: 50.8, height: 38.1 },
      reasoning: 'Test',
      warnings: [],
    }
    const spec = createBaseFinalSpec()

    const result = validateBlockSelection(selection, spec)

    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  it('detects missing MCU', () => {
    const selection: BlockSelectionResult = {
      blocks: [{ blockSlug: 'power-usb-c', gridX: 0, gridY: 0, rotation: 0, reason: 'Power' }],
      boardSize: { width: 50.8, height: 38.1 },
      reasoning: 'Test',
      warnings: [],
    }
    const spec = createBaseFinalSpec()

    const result = validateBlockSelection(selection, spec)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing MCU block')
  })

  it('detects missing power block', () => {
    const selection: BlockSelectionResult = {
      blocks: [{ blockSlug: 'mcu-esp32c6', gridX: 0, gridY: 0, rotation: 0, reason: 'MCU' }],
      boardSize: { width: 50.8, height: 38.1 },
      reasoning: 'Test',
      warnings: [],
    }
    const spec = createBaseFinalSpec()

    const result = validateBlockSelection(selection, spec)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing power block')
  })

  it('detects overlapping blocks at same position', () => {
    const selection: BlockSelectionResult = {
      blocks: [
        { blockSlug: 'mcu-esp32c6', gridX: 0, gridY: 0, rotation: 0, reason: 'MCU' },
        { blockSlug: 'power-usb-c', gridX: 0, gridY: 0, rotation: 0, reason: 'Power' },
      ],
      boardSize: { width: 50.8, height: 38.1 },
      reasoning: 'Test',
      warnings: [],
    }
    const spec = createBaseFinalSpec()

    const result = validateBlockSelection(selection, spec)

    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('overlap'))).toBe(true)
  })

  it('allows blocks at different positions', () => {
    const selection: BlockSelectionResult = {
      blocks: [
        { blockSlug: 'mcu-esp32c6', gridX: 0, gridY: 0, rotation: 0, reason: 'MCU' },
        { blockSlug: 'power-usb-c', gridX: 3, gridY: 0, rotation: 0, reason: 'Power' },
        { blockSlug: 'sensor-bme280', gridX: 4, gridY: 0, rotation: 0, reason: 'Sensor' },
      ],
      boardSize: { width: 63.5, height: 38.1 },
      reasoning: 'Test',
      warnings: [],
    }
    const spec = createBaseFinalSpec()

    const result = validateBlockSelection(selection, spec)

    expect(result.valid).toBe(true)
  })

  it('handles empty blocks array', () => {
    const selection: BlockSelectionResult = {
      blocks: [],
      boardSize: { width: 50.8, height: 38.1 },
      reasoning: 'Empty',
      warnings: [],
    }
    const spec = createBaseFinalSpec()

    const result = validateBlockSelection(selection, spec)

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing MCU block')
    expect(result.errors).toContain('Missing power block')
  })
})
