import { describe, it, expect } from 'vitest'
import {
  generateManufacturingBOM,
  generateAggregatedBOM,
  bomToCSV,
  bomToLCSCCSV,
  type ManufacturingBOM,
} from './bom-generator'
import type { PCBArtifacts, PcbBlock, PlacedBlock, ResistorTapState } from '../db/schema'

// =============================================================================
// Test Data
// =============================================================================

const createBlock = (slug: string, components: PcbBlock['definition']['components']): PcbBlock => ({
  id: 1,
  slug,
  name: slug,
  description: 'Test block',
  category: 'sensor',
  version: 1,
  definition: {
    metadata: {
      name: slug,
      version: '1.0.0',
      category: 'sensor',
      description: 'Test block',
      gridWidth: 1,
      gridHeight: 1,
    },
    electrical: {
      interfaces: [],
      busTaps: [],
      power: { voltage: 3.3, maxCurrentMa: 10 },
    },
    physical: {},
    files: { schematic: 'test.kicad_sch', pcb: 'test.kicad_pcb' },
    components,
  },
  components: [],
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
})

const sampleBlock = createBlock('bme280-sensor', [
  {
    reference: 'R1',
    value: '10k',
    footprint: 'R_0402_1005Metric',
    quantity: 1,
    manufacturer: 'Yageo',
    mpn: 'RC0402FR-0710KL',
    lcscPartNumber: 'C25744',
  },
  {
    reference: 'R2',
    value: '10k',
    footprint: 'R_0402_1005Metric',
    quantity: 1,
    manufacturer: 'Yageo',
    mpn: 'RC0402FR-0710KL',
    lcscPartNumber: 'C25744',
  },
  {
    reference: 'C1',
    value: '100nF',
    footprint: 'C_0402_1005Metric',
    quantity: 1,
    mpn: 'GRM155R71C104KA88D',
  },
  {
    reference: 'R0',
    value: '0R',
    footprint: 'R_0402_1005Metric',
    quantity: 1,
    nofit: true, // Default nofit
  },
])

const relayBlock = createBlock('relay-module', [
  {
    reference: 'K1',
    value: 'G5V-1',
    footprint: 'Relay_DPDT',
    quantity: 1,
    manufacturer: 'Omron',
    mpn: 'G5V-1-DC5',
  },
  {
    reference: 'D1',
    value: '1N4148',
    footprint: 'D_SOD-323',
    quantity: 1,
    mpn: '1N4148W',
  },
])

// =============================================================================
// generateManufacturingBOM Tests
// =============================================================================

describe('generateManufacturingBOM', () => {
  it('generates BOM from placed blocks', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [{ blockSlug: 'bme280-sensor', gridX: 0, gridY: 0, rotation: 0 }],
      boardSize: { width: 50, height: 40 },
    }

    const bom = generateManufacturingBOM(artifacts, [sampleBlock])

    expect(bom.entries.length).toBeGreaterThan(0)
    expect(bom.summary.totalParts).toBeGreaterThan(0)
  })

  it('aggregates identical components', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [{ blockSlug: 'bme280-sensor', gridX: 0, gridY: 0, rotation: 0 }],
      boardSize: { width: 50, height: 40 },
    }

    const bom = generateManufacturingBOM(artifacts, [sampleBlock])

    // R1 and R2 should be aggregated (same value+footprint)
    const resistorEntry = bom.entries.find(
      (e) => e.value === '10k' && e.footprint === 'R_0402_1005Metric' && !e.nofit
    )
    expect(resistorEntry).toBeDefined()
    expect(resistorEntry?.quantity).toBe(2)
    expect(resistorEntry?.references).toContain('BME280_SENSOR_R1')
    expect(resistorEntry?.references).toContain('BME280_SENSOR_R2')
  })

  it('prefixes references with block slug', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [{ blockSlug: 'bme280-sensor', gridX: 0, gridY: 0, rotation: 0 }],
      boardSize: { width: 50, height: 40 },
    }

    const bom = generateManufacturingBOM(artifacts, [sampleBlock])

    // All references should be prefixed
    for (const entry of bom.entries) {
      for (const ref of entry.references) {
        expect(ref).toMatch(/^BME280_SENSOR_/)
      }
    }
  })

  it('marks nofit components from block definition', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [{ blockSlug: 'bme280-sensor', gridX: 0, gridY: 0, rotation: 0 }],
      boardSize: { width: 50, height: 40 },
    }

    const bom = generateManufacturingBOM(artifacts, [sampleBlock])

    const nofitEntry = bom.entries.find((e) => e.value === '0R')
    expect(nofitEntry?.nofit).toBe(true)
  })

  it('respects resistor tap states', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [{ blockSlug: 'bme280-sensor', gridX: 0, gridY: 0, rotation: 0 }],
      boardSize: { width: 50, height: 40 },
      resistorTapStates: [
        { blockSlug: 'bme280-sensor', reference: 'R0', populated: true, reason: 'Bus connected' },
      ],
    }

    const bom = generateManufacturingBOM(artifacts, [sampleBlock])

    // R0 should NOT be nofit because tap state says populated=true
    const r0Entry = bom.entries.find((e) => e.value === '0R')
    expect(r0Entry?.nofit).toBe(false)
  })

  it('marks unpopulated tap resistors as nofit', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [{ blockSlug: 'bme280-sensor', gridX: 0, gridY: 0, rotation: 0 }],
      boardSize: { width: 50, height: 40 },
      resistorTapStates: [
        { blockSlug: 'bme280-sensor', reference: 'R1', populated: false, reason: 'Isolated' },
      ],
    }

    const bom = generateManufacturingBOM(artifacts, [sampleBlock])

    // Find the nofit 10k resistor entry
    const nofitEntry = bom.entries.find(
      (e) => e.value === '10k' && e.nofit === true
    )
    expect(nofitEntry).toBeDefined()
    expect(nofitEntry?.nofitReason).toBe('Isolated')
  })

  it('processes multiple blocks', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [
        { blockSlug: 'bme280-sensor', gridX: 0, gridY: 0, rotation: 0 },
        { blockSlug: 'relay-module', gridX: 1, gridY: 0, rotation: 0 },
      ],
      boardSize: { width: 50, height: 40 },
    }

    const bom = generateManufacturingBOM(artifacts, [sampleBlock, relayBlock])

    // Should have components from both blocks
    expect(bom.entries.some((e) => e.references.some((r) => r.startsWith('BME280')))).toBe(true)
    expect(bom.entries.some((e) => e.references.some((r) => r.startsWith('RELAY')))).toBe(true)
  })

  it('processes remote boards', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [{ blockSlug: 'bme280-sensor', gridX: 0, gridY: 0, rotation: 0 }],
      boardSize: { width: 50, height: 40 },
      remoteBoards: [
        {
          id: 'rb1',
          name: 'Button Panel',
          slug: 'button-panel',
          type: 'button',
          placedBlocks: [{ blockSlug: 'relay-module', gridX: 0, gridY: 0, rotation: 0 }],
          boardSize: { width: 20, height: 20, unit: 'mm' },
          connectionMapping: [],
          gridWidth: 1,
          gridHeight: 1,
        },
      ],
    }

    const bom = generateManufacturingBOM(artifacts, [sampleBlock, relayBlock])

    // Should have entries for both boards
    expect(bom.entries.some((e) => e.boardName === 'Main')).toBe(true)
    expect(bom.entries.some((e) => e.boardName === 'Button Panel')).toBe(true)

    // Summary should include both boards
    expect(bom.summary.boardBreakdown).toHaveLength(2)
  })

  it('calculates summary statistics', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [{ blockSlug: 'bme280-sensor', gridX: 0, gridY: 0, rotation: 0 }],
      boardSize: { width: 50, height: 40 },
    }

    const bom = generateManufacturingBOM(artifacts, [sampleBlock])

    expect(bom.summary.totalParts).toBe(4) // R1, R2, C1, R0
    expect(bom.summary.uniqueParts).toBe(3) // 10k (x2), 100nF, 0R
    expect(bom.summary.nofitParts).toBe(1) // R0 is nofit
  })

  it('includes manufacturer data', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [{ blockSlug: 'bme280-sensor', gridX: 0, gridY: 0, rotation: 0 }],
      boardSize: { width: 50, height: 40 },
    }

    const bom = generateManufacturingBOM(artifacts, [sampleBlock])

    const resistorEntry = bom.entries.find((e) => e.value === '10k' && !e.nofit)
    expect(resistorEntry?.manufacturer).toBe('Yageo')
    expect(resistorEntry?.mpn).toBe('RC0402FR-0710KL')
    expect(resistorEntry?.lcscPartNumber).toBe('C25744')
  })

  it('handles blocks without position file', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [
        { blockSlug: 'bme280-sensor', gridX: 0, gridY: 0, rotation: 0 },
        { blockSlug: 'missing-block', gridX: 1, gridY: 0, rotation: 0 },
      ],
      boardSize: { width: 50, height: 40 },
    }

    const bom = generateManufacturingBOM(artifacts, [sampleBlock])

    // Should still have entries from the valid block
    expect(bom.entries.length).toBeGreaterThan(0)
    expect(bom.entries.some((e) => e.references.some((r) => r.startsWith('BME280')))).toBe(true)
  })
})

// =============================================================================
// generateAggregatedBOM Tests
// =============================================================================

describe('generateAggregatedBOM', () => {
  it('combines entries across all boards', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [{ blockSlug: 'bme280-sensor', gridX: 0, gridY: 0, rotation: 0 }],
      boardSize: { width: 50, height: 40 },
      remoteBoards: [
        {
          id: 'rb1',
          name: 'Remote',
          slug: 'remote',
          type: 'custom',
          placedBlocks: [{ blockSlug: 'bme280-sensor', gridX: 0, gridY: 0, rotation: 0 }],
          boardSize: { width: 20, height: 20, unit: 'mm' },
          connectionMapping: [],
          gridWidth: 1,
          gridHeight: 1,
        },
      ],
    }

    const bom = generateAggregatedBOM(artifacts, [sampleBlock])

    // 10k resistors from both boards should be combined
    const resistorEntry = bom.entries.find((e) => e.value === '10k' && !e.nofit)
    expect(resistorEntry?.quantity).toBe(4) // 2 per board × 2 boards
    expect(resistorEntry?.boardName).toContain('Main')
    expect(resistorEntry?.boardName).toContain('Remote')
  })

  it('applies multiplier to quantities', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [{ blockSlug: 'bme280-sensor', gridX: 0, gridY: 0, rotation: 0 }],
      boardSize: { width: 50, height: 40 },
    }

    const bom = generateAggregatedBOM(artifacts, [sampleBlock], 5)

    const resistorEntry = bom.entries.find((e) => e.value === '10k' && !e.nofit)
    expect(resistorEntry?.quantity).toBe(10) // 2 × 5
  })

  it('renumbers line entries', () => {
    const artifacts: PCBArtifacts = {
      placedBlocks: [{ blockSlug: 'bme280-sensor', gridX: 0, gridY: 0, rotation: 0 }],
      boardSize: { width: 50, height: 40 },
    }

    const bom = generateAggregatedBOM(artifacts, [sampleBlock])

    // Line numbers should be sequential starting from 1
    const lineNumbers = bom.entries.map((e) => e.lineNumber)
    expect(lineNumbers).toEqual([1, 2, 3]) // 3 unique parts
  })
})

// =============================================================================
// bomToCSV Tests
// =============================================================================

describe('bomToCSV', () => {
  it('generates correct CSV headers', () => {
    const bom: ManufacturingBOM = {
      entries: [],
      summary: {
        totalParts: 0,
        uniqueParts: 0,
        nofitParts: 0,
        boardBreakdown: [],
      },
    }

    const csv = bomToCSV(bom)

    expect(csv).toContain('Line,Designator,Value,Footprint,Quantity,Manufacturer,MPN,Board,NoFit,NoFit Reason')
  })

  it('formats entries correctly', () => {
    const bom: ManufacturingBOM = {
      entries: [
        {
          lineNumber: 1,
          references: ['R1', 'R2'],
          value: '10k',
          footprint: 'R_0402',
          quantity: 2,
          manufacturer: 'Yageo',
          mpn: 'RC0402FR-0710KL',
          lcscPartNumber: 'C25744',
          nofit: false,
          boardName: 'Main',
        },
      ],
      summary: {
        totalParts: 2,
        uniqueParts: 1,
        nofitParts: 0,
        boardBreakdown: [{ boardName: 'Main', totalParts: 2, uniqueParts: 1 }],
      },
    }

    const csv = bomToCSV(bom)

    expect(csv).toContain('1,"R1, R2",10k,R_0402,2,Yageo,RC0402FR-0710KL,Main,,')
  })

  it('marks nofit entries as DNP', () => {
    const bom: ManufacturingBOM = {
      entries: [
        {
          lineNumber: 1,
          references: ['R0'],
          value: '0R',
          footprint: 'R_0402',
          quantity: 1,
          manufacturer: null,
          mpn: null,
          lcscPartNumber: null,
          nofit: true,
          nofitReason: 'Bus isolated',
          boardName: 'Main',
        },
      ],
      summary: {
        totalParts: 1,
        uniqueParts: 1,
        nofitParts: 1,
        boardBreakdown: [],
      },
    }

    const csv = bomToCSV(bom)

    expect(csv).toContain('DNP')
    expect(csv).toContain('Bus isolated')
  })

  it('includes summary section', () => {
    const bom: ManufacturingBOM = {
      entries: [],
      summary: {
        totalParts: 10,
        uniqueParts: 5,
        nofitParts: 2,
        boardBreakdown: [],
      },
    }

    const csv = bomToCSV(bom)

    expect(csv).toContain('Summary')
    expect(csv).toContain('Total Parts,10')
    expect(csv).toContain('Unique Parts,5')
    expect(csv).toContain('NoFit Parts,2')
  })

  it('includes per-board breakdown for multiple boards', () => {
    const bom: ManufacturingBOM = {
      entries: [],
      summary: {
        totalParts: 10,
        uniqueParts: 5,
        nofitParts: 0,
        boardBreakdown: [
          { boardName: 'Main', totalParts: 6, uniqueParts: 3 },
          { boardName: 'Remote', totalParts: 4, uniqueParts: 2 },
        ],
      },
    }

    const csv = bomToCSV(bom)

    expect(csv).toContain('Per Board Breakdown')
    expect(csv).toContain('Main,6,parts,3,unique')
    expect(csv).toContain('Remote,4,parts,2,unique')
  })
})

// =============================================================================
// bomToLCSCCSV Tests
// =============================================================================

describe('bomToLCSCCSV', () => {
  it('generates LCSC-compatible headers', () => {
    const bom: ManufacturingBOM = {
      entries: [],
      summary: {
        totalParts: 0,
        uniqueParts: 0,
        nofitParts: 0,
        boardBreakdown: [],
      },
    }

    const csv = bomToLCSCCSV(bom)

    expect(csv).toContain('Quantity,Manufacture Part Number,Manufacturer,Description,LCSC Part Number,Package,Customer Part Number')
  })

  it('excludes nofit entries', () => {
    const bom: ManufacturingBOM = {
      entries: [
        {
          lineNumber: 1,
          references: ['R1'],
          value: '10k',
          footprint: 'R_0402',
          quantity: 1,
          manufacturer: 'Yageo',
          mpn: 'RC0402FR-0710KL',
          lcscPartNumber: 'C25744',
          nofit: false,
          boardName: 'Main',
        },
        {
          lineNumber: 2,
          references: ['R0'],
          value: '0R',
          footprint: 'R_0402',
          quantity: 1,
          manufacturer: null,
          mpn: null,
          lcscPartNumber: null,
          nofit: true,
          boardName: 'Main',
        },
      ],
      summary: {
        totalParts: 2,
        uniqueParts: 2,
        nofitParts: 1,
        boardBreakdown: [],
      },
    }

    const csv = bomToLCSCCSV(bom)

    expect(csv).toContain('10k')
    expect(csv).not.toContain('0R')
  })

  it('uses MPN for part matching', () => {
    const bom: ManufacturingBOM = {
      entries: [
        {
          lineNumber: 1,
          references: ['R1'],
          value: '10k',
          footprint: 'R_0402',
          quantity: 2,
          manufacturer: 'Yageo',
          mpn: 'RC0402FR-0710KL',
          lcscPartNumber: 'C25744',
          nofit: false,
          boardName: 'Main',
        },
      ],
      summary: {
        totalParts: 2,
        uniqueParts: 1,
        nofitParts: 0,
        boardBreakdown: [],
      },
    }

    const csv = bomToLCSCCSV(bom)

    // Should use MPN, not value
    expect(csv).toContain('RC0402FR-0710KL')
  })

  it('falls back to value when MPN is missing', () => {
    const bom: ManufacturingBOM = {
      entries: [
        {
          lineNumber: 1,
          references: ['C1'],
          value: '100nF',
          footprint: 'C_0402',
          quantity: 1,
          manufacturer: null,
          mpn: null,
          lcscPartNumber: null,
          nofit: false,
          boardName: 'Main',
        },
      ],
      summary: {
        totalParts: 1,
        uniqueParts: 1,
        nofitParts: 0,
        boardBreakdown: [],
      },
    }

    const csv = bomToLCSCCSV(bom)

    // Should use value as MPN fallback
    const lines = csv.split('\n')
    expect(lines[1]).toContain('100nF')
  })

  it('includes LCSC part number when available', () => {
    const bom: ManufacturingBOM = {
      entries: [
        {
          lineNumber: 1,
          references: ['R1'],
          value: '10k',
          footprint: 'R_0402',
          quantity: 1,
          manufacturer: 'Yageo',
          mpn: 'RC0402FR-0710KL',
          lcscPartNumber: 'C25744',
          nofit: false,
          boardName: 'Main',
        },
      ],
      summary: {
        totalParts: 1,
        uniqueParts: 1,
        nofitParts: 0,
        boardBreakdown: [],
      },
    }

    const csv = bomToLCSCCSV(bom)

    expect(csv).toContain('C25744')
  })

  it('includes designators as customer part number', () => {
    const bom: ManufacturingBOM = {
      entries: [
        {
          lineNumber: 1,
          references: ['R1', 'R2', 'R3'],
          value: '10k',
          footprint: 'R_0402',
          quantity: 3,
          manufacturer: null,
          mpn: '10KOHM',
          lcscPartNumber: null,
          nofit: false,
          boardName: 'Main',
        },
      ],
      summary: {
        totalParts: 3,
        uniqueParts: 1,
        nofitParts: 0,
        boardBreakdown: [],
      },
    }

    const csv = bomToLCSCCSV(bom)

    expect(csv).toContain('"R1, R2, R3"')
  })

  it('does not include summary (LCSC format is data only)', () => {
    const bom: ManufacturingBOM = {
      entries: [],
      summary: {
        totalParts: 10,
        uniqueParts: 5,
        nofitParts: 2,
        boardBreakdown: [],
      },
    }

    const csv = bomToLCSCCSV(bom)

    expect(csv).not.toContain('Summary')
    expect(csv).not.toContain('Total Parts')
  })
})
