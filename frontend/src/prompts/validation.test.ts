/**
 * Tests for Cross-Stage Validation Logic
 */

import { describe, it, expect } from 'vitest'
import {
  validateCrossStage,
  validateSpecSatisfied,
  validatePcbFitsEnclosure,
  validateFirmwareMatchesPcb,
  parseEnclosureDimensions,
  generateValidationReport,
} from './validation'
import type { ProjectSpec, PCBArtifacts, EnclosureArtifacts, FirmwareArtifacts } from '@/db/schema'

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createBaseSpec = (): ProjectSpec => ({
  description: 'Test project',
  openQuestions: [],
  decisions: [],
  blueprints: [],
  selectedBlueprint: null,
  finalSpec: null,
  feasibility: null,
  pcb: null,
  enclosure: null,
  firmware: null,
  stages: {
    spec: { status: 'complete' },
    pcb: { status: 'pending' },
    enclosure: { status: 'pending' },
    firmware: { status: 'pending' },
    export: { status: 'pending' },
  },
})

const createFinalSpec = () => ({
  name: 'Test Device',
  summary: 'A test device',
  pcbSize: { width: 50, height: 50 },
  power: { source: 'USB-C', voltage: '5V' },
  outputs: [
    { type: 'Temperature', description: 'Read ambient temperature' },
    { type: 'LED', description: 'Status indicator' },
  ],
  inputs: [{ type: 'Button', description: 'User input' }],
  estimatedBOM: [],
  locked: true,
  lockedAt: new Date().toISOString(),
})

const createPcbArtifacts = (): PCBArtifacts => ({
  placedBlocks: [
    { blockId: '1', blockSlug: 'bme280', gridX: 0, gridY: 0, rotation: 0 },
    { blockId: '2', blockSlug: 'ws2812b-output', gridX: 1, gridY: 0, rotation: 0 },
    { blockId: '3', blockSlug: 'usb-c-power', gridX: 2, gridY: 0, rotation: 0 },
  ],
  boardSize: { width: 50, height: 50 },
  netList: [
    { net: 'SDA', gpio: 'GPIO4', blocks: ['bme280'] },
    { net: 'SCL', gpio: 'GPIO5', blocks: ['bme280'] },
    { net: 'LED_DATA', gpio: 'GPIO8', blocks: ['ws2812b-output'] },
  ],
})

const createEnclosureArtifacts = (): EnclosureArtifacts => ({
  openScadCode: `
    // Enclosure for test device
    pcb_width = 55;
    pcb_height = 55;
    wall = 2;
    inner_depth = 20;
  `,
  style: 'box',
  iterations: [],
})

const createFirmwareArtifacts = (): FirmwareArtifacts => ({
  files: [
    {
      path: 'src/main.cpp',
      content: `
        #include <Arduino.h>
        #define PIN_SDA GPIO4
        #define PIN_SCL GPIO5
        #define PIN_LED_DATA GPIO8
        #define BME280_ADDR 0x76
        void setup() {}
        void loop() {}
      `,
    },
  ],
  language: 'cpp',
  framework: 'platformio',
})

// =============================================================================
// validateCrossStage Tests
// =============================================================================

describe('validateCrossStage', () => {
  it('returns valid for empty spec', () => {
    const spec = createBaseSpec()
    const result = validateCrossStage(spec, 'all')

    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('validates all checks when type is all', () => {
    const spec = createBaseSpec()
    spec.finalSpec = createFinalSpec()
    spec.pcb = createPcbArtifacts()
    spec.enclosure = createEnclosureArtifacts()
    spec.firmware = createFirmwareArtifacts()

    const result = validateCrossStage(spec, 'all')

    expect(result.valid).toBe(true)
  })

  it('only validates spec_satisfied when specified', () => {
    const spec = createBaseSpec()
    spec.finalSpec = createFinalSpec()
    spec.pcb = createPcbArtifacts()

    // Remove BME280 block - should cause spec_satisfied to fail
    spec.pcb.placedBlocks = spec.pcb.placedBlocks?.filter((b) => b.blockSlug !== 'bme280')

    const result = validateCrossStage(spec, 'spec_satisfied')

    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.id.includes('temperature'))).toBe(true)
  })
})

// =============================================================================
// validateSpecSatisfied Tests
// =============================================================================

describe('validateSpecSatisfied', () => {
  it('returns valid when no finalSpec', () => {
    const spec = createBaseSpec()
    const result = validateSpecSatisfied(spec)

    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('returns valid when no PCB blocks', () => {
    const spec = createBaseSpec()
    spec.finalSpec = createFinalSpec()

    const result = validateSpecSatisfied(spec)

    expect(result.valid).toBe(true)
  })

  it('detects missing temperature sensor block', () => {
    const spec = createBaseSpec()
    spec.finalSpec = createFinalSpec()
    spec.pcb = createPcbArtifacts()

    // Remove BME280
    spec.pcb.placedBlocks = spec.pcb.placedBlocks?.filter((b) => b.blockSlug !== 'bme280')

    const result = validateSpecSatisfied(spec)

    expect(result.valid).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].severity).toBe('error')
    expect(result.issues[0].message).toContain('Temperature')
  })

  it('detects missing LED block', () => {
    const spec = createBaseSpec()
    spec.finalSpec = createFinalSpec()
    spec.pcb = createPcbArtifacts()

    // Remove LED block
    spec.pcb.placedBlocks = spec.pcb.placedBlocks?.filter((b) => !b.blockSlug.includes('ws2812'))

    const result = validateSpecSatisfied(spec)

    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.message.includes('LED'))).toBe(true)
  })

  it('detects missing power block', () => {
    const spec = createBaseSpec()
    spec.finalSpec = createFinalSpec()
    spec.pcb = createPcbArtifacts()

    // Remove USB-C power block
    spec.pcb.placedBlocks = spec.pcb.placedBlocks?.filter((b) => !b.blockSlug.includes('usb'))

    const result = validateSpecSatisfied(spec)

    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.id === 'missing_power_block')).toBe(true)
  })

  it('provides suggestions for missing blocks', () => {
    const spec = createBaseSpec()
    spec.finalSpec = createFinalSpec()
    spec.pcb = createPcbArtifacts()
    spec.pcb.placedBlocks = [] // No blocks at all

    const result = validateSpecSatisfied(spec)

    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions.every((s) => s.autoFixable)).toBe(true)
  })
})

// =============================================================================
// validatePcbFitsEnclosure Tests
// =============================================================================

describe('validatePcbFitsEnclosure', () => {
  it('returns valid when no PCB artifacts', () => {
    const result = validatePcbFitsEnclosure(undefined, createEnclosureArtifacts())

    expect(result.valid).toBe(true)
  })

  it('returns valid when no enclosure artifacts', () => {
    const result = validatePcbFitsEnclosure(createPcbArtifacts(), undefined)

    expect(result.valid).toBe(true)
  })

  it('returns valid when PCB fits in enclosure', () => {
    const pcb = createPcbArtifacts()
    const enclosure = createEnclosureArtifacts()

    const result = validatePcbFitsEnclosure(pcb, enclosure)

    expect(result.valid).toBe(true)
  })

  it('detects enclosure too narrow', () => {
    const pcb = createPcbArtifacts()
    const enclosure: EnclosureArtifacts = {
      openScadCode: `
        pcb_width = 40;  // Too narrow for 50mm PCB
        pcb_height = 60;
        wall = 2;
      `,
      style: 'box',
      iterations: [],
    }

    const result = validatePcbFitsEnclosure(pcb, enclosure)

    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.id === 'enclosure_too_narrow')).toBe(true)
  })

  it('detects enclosure too short', () => {
    const pcb = createPcbArtifacts()
    const enclosure: EnclosureArtifacts = {
      openScadCode: `
        pcb_width = 60;
        pcb_height = 40;  // Too short for 50mm PCB
        wall = 2;
      `,
      style: 'box',
      iterations: [],
    }

    const result = validatePcbFitsEnclosure(pcb, enclosure)

    expect(result.valid).toBe(false)
    expect(result.issues.some((i) => i.id === 'enclosure_too_short')).toBe(true)
  })

  it('provides fix suggestions for dimension issues', () => {
    const pcb = createPcbArtifacts()
    const enclosure: EnclosureArtifacts = {
      openScadCode: `
        pcb_width = 40;
        pcb_height = 40;
        wall = 2;
      `,
      style: 'box',
      iterations: [],
    }

    const result = validatePcbFitsEnclosure(pcb, enclosure)

    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions.every((s) => s.stage === 'enclosure')).toBe(true)
  })
})

// =============================================================================
// validateFirmwareMatchesPcb Tests
// =============================================================================

describe('validateFirmwareMatchesPcb', () => {
  it('returns valid when no PCB artifacts', () => {
    const result = validateFirmwareMatchesPcb(undefined, createFirmwareArtifacts())

    expect(result.valid).toBe(true)
  })

  it('returns valid when no firmware artifacts', () => {
    const result = validateFirmwareMatchesPcb(createPcbArtifacts(), undefined)

    expect(result.valid).toBe(true)
  })

  it('returns valid when firmware defines all GPIO pins', () => {
    const pcb = createPcbArtifacts()
    const firmware = createFirmwareArtifacts()

    const result = validateFirmwareMatchesPcb(pcb, firmware)

    expect(result.valid).toBe(true)
  })

  it('handles firmware with all required definitions', () => {
    const pcb = createPcbArtifacts()
    const firmware = createFirmwareArtifacts()

    const result = validateFirmwareMatchesPcb(pcb, firmware)

    // Firmware with complete definitions should pass or only have warnings
    const errors = result.issues.filter((i) => i.severity === 'error')
    expect(errors.length).toBe(0)
  })

  it('handles empty firmware files', () => {
    const pcb = createPcbArtifacts()
    const firmware: FirmwareArtifacts = {
      files: [],
      language: 'cpp',
      framework: 'platformio',
    }

    const result = validateFirmwareMatchesPcb(pcb, firmware)

    // Empty firmware should generate issues for missing GPIO definitions
    expect(result.issues.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// parseEnclosureDimensions Tests
// =============================================================================

describe('parseEnclosureDimensions', () => {
  it('parses pcb_width and pcb_height', () => {
    const code = `
      pcb_width = 50;
      pcb_height = 60;
      wall = 2;
    `
    const dims = parseEnclosureDimensions(code)

    expect(dims).not.toBeNull()
    expect(dims?.innerWidth).toBe(51) // pcb_width + 1
    expect(dims?.innerHeight).toBe(61) // pcb_height + 1
    expect(dims?.wallThickness).toBe(2)
  })

  it('parses inner_width and inner_height directly', () => {
    const code = `
      inner_width = 55;
      inner_height = 65;
      wall_thickness = 3;
    `
    const dims = parseEnclosureDimensions(code)

    expect(dims).not.toBeNull()
    expect(dims?.innerWidth).toBe(55)
    expect(dims?.innerHeight).toBe(65)
    expect(dims?.wallThickness).toBe(3)
  })

  it('calculates from case dimensions', () => {
    const code = `
      case_width = 60;
      case_height = 70;
      wall = 2;
    `
    const dims = parseEnclosureDimensions(code)

    expect(dims).not.toBeNull()
    expect(dims?.innerWidth).toBe(56) // 60 - 2*2
    expect(dims?.innerHeight).toBe(66) // 70 - 2*2
  })

  it('returns null for unparseable code', () => {
    const code = `
      // No dimension variables
      module box() {
        cube([10, 10, 10]);
      }
    `
    const dims = parseEnclosureDimensions(code)

    expect(dims).toBeNull()
  })

  it('uses default wall thickness', () => {
    const code = `
      pcb_width = 50;
      pcb_height = 60;
    `
    const dims = parseEnclosureDimensions(code)

    expect(dims?.wallThickness).toBe(2) // Default
  })

  it('parses decimal values', () => {
    const code = `
      pcb_width = 50.5;
      pcb_height = 60.25;
    `
    const dims = parseEnclosureDimensions(code)

    expect(dims?.innerWidth).toBeCloseTo(51.5)
    expect(dims?.innerHeight).toBeCloseTo(61.25)
  })
})

// =============================================================================
// generateValidationReport Tests
// =============================================================================

describe('generateValidationReport', () => {
  it('generates PASSED status for valid result', () => {
    const result = {
      valid: true,
      issues: [],
      suggestions: [],
    }

    const report = generateValidationReport(result)

    expect(report).toContain('PASSED')
    expect(report).toContain('No issues found')
  })

  it('generates FAILED status for invalid result', () => {
    const result = {
      valid: false,
      issues: [
        {
          id: 'test_error',
          severity: 'error' as const,
          stage: 'pcb' as const,
          message: 'Test error',
          details: 'Test details',
        },
      ],
      suggestions: [],
    }

    const report = generateValidationReport(result)

    expect(report).toContain('FAILED')
    expect(report).toContain('[ERROR]')
    expect(report).toContain('Test error')
    expect(report).toContain('Test details')
  })

  it('includes suggestions in report', () => {
    const result = {
      valid: false,
      issues: [
        {
          id: 'test_error',
          severity: 'error' as const,
          stage: 'pcb' as const,
          message: 'Test error',
        },
      ],
      suggestions: [
        {
          issueId: 'test_error',
          stage: 'pcb' as const,
          action: 'Fix the error',
          autoFixable: true,
        },
      ],
    }

    const report = generateValidationReport(result)

    expect(report).toContain('Suggestions')
    expect(report).toContain('Fix the error')
    expect(report).toContain('auto-fixable')
  })

  it('shows issue count', () => {
    const result = {
      valid: false,
      issues: [
        { id: '1', severity: 'error' as const, stage: 'pcb' as const, message: 'Error 1' },
        { id: '2', severity: 'warning' as const, stage: 'pcb' as const, message: 'Warning 1' },
      ],
      suggestions: [],
    }

    const report = generateValidationReport(result)

    expect(report).toContain('2 issue(s)')
  })
})
