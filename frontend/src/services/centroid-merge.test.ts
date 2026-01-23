import { describe, it, expect } from 'vitest'
import {
  prefixReference,
  parsePositionFile,
  mergeMainBoardCentroid,
  mergeRemoteBoardCentroid,
  mergePanelizedCentroid,
  centroidToCSV,
  centroidToPos,
  type CentroidEntry,
  type MergedCentroid,
} from './centroid-merge'
import type { PlacedBlock, RemoteBoard, PanelConfiguration } from '../db/schema'

// =============================================================================
// Test Data
// =============================================================================

const samplePositionFile = `### Footprint positions - created on 2024-01-15
### Printed by KiCad version 8.0.0
## Unit = mm, Angle = deg.
## Side : All
# Ref Val Package PosX PosY Rot Side
C1 100nF C_0402_1005Metric 1.500000 2.300000 90.000000 top
R1 10k R_0402_1005Metric 3.200000 1.100000 0.000000 top
U1 ESP32-C6 QFN-48 10.000000 15.000000 180.000000 top
D1 LED LED_0603 5.500000 8.200000 270.000000 bottom
`

const samplePositionFileMil = `### Test with mil units
## Unit = mil, Angle = deg.
## Side : All
# Ref Val Package PosX PosY Rot Side
R1 1k R_0402 100.000000 200.000000 0.000000 top
`

// =============================================================================
// prefixReference Tests
// =============================================================================

describe('prefixReference', () => {
  it('prefixes reference with uppercase slug', () => {
    expect(prefixReference('R1', 'bme280-sensor')).toBe('BME280_SENSOR_R1')
  })

  it('converts hyphens to underscores', () => {
    expect(prefixReference('C1', 'esp32-c6-module')).toBe('ESP32_C6_MODULE_C1')
  })

  it('handles simple slugs', () => {
    expect(prefixReference('U1', 'relay')).toBe('RELAY_U1')
  })

  it('preserves reference case', () => {
    expect(prefixReference('LED1', 'indicator')).toBe('INDICATOR_LED1')
  })
})

// =============================================================================
// parsePositionFile Tests
// =============================================================================

describe('parsePositionFile', () => {
  it('parses KiCad position file format', () => {
    const result = parsePositionFile(samplePositionFile, 'TestBoard')

    expect(result.unit).toBe('mm')
    expect(result.entries).toHaveLength(4)
  })

  it('extracts component data correctly', () => {
    const result = parsePositionFile(samplePositionFile, 'Main')
    const c1 = result.entries.find((e) => e.reference === 'C1')

    expect(c1).toBeDefined()
    expect(c1?.value).toBe('100nF')
    expect(c1?.footprint).toBe('C_0402_1005Metric')
    expect(c1?.posX).toBeCloseTo(1.5)
    expect(c1?.posY).toBeCloseTo(2.3)
    expect(c1?.rotation).toBe(90)
    expect(c1?.side).toBe('top')
    expect(c1?.boardName).toBe('Main')
  })

  it('handles bottom side components', () => {
    const result = parsePositionFile(samplePositionFile, 'Main')
    const d1 = result.entries.find((e) => e.reference === 'D1')

    expect(d1?.side).toBe('bottom')
  })

  it('converts mil units to mm', () => {
    const result = parsePositionFile(samplePositionFileMil, 'Main')

    expect(result.unit).toBe('mil')
    expect(result.entries).toHaveLength(1)
    // 100 mil = 2.54 mm
    expect(result.entries[0].posX).toBeCloseTo(2.54)
    // 200 mil = 5.08 mm
    expect(result.entries[0].posY).toBeCloseTo(5.08)
  })

  it('skips comment and header lines', () => {
    const result = parsePositionFile(samplePositionFile, 'Main')
    // Should not include header row or comment lines
    expect(result.entries.every((e) => e.reference !== 'Ref')).toBe(true)
    expect(result.entries.every((e) => e.reference !== '#')).toBe(true)
  })

  it('handles empty content', () => {
    const result = parsePositionFile('', 'Main')
    expect(result.entries).toHaveLength(0)
    expect(result.unit).toBe('mm')
  })

  it('uses provided board name', () => {
    const result = parsePositionFile(samplePositionFile, 'Button Panel')
    expect(result.entries.every((e) => e.boardName === 'Button Panel')).toBe(true)
  })
})

// =============================================================================
// mergeMainBoardCentroid Tests
// =============================================================================

describe('mergeMainBoardCentroid', () => {
  it('offsets components by grid position', () => {
    const placedBlocks: PlacedBlock[] = [
      { blockSlug: 'bme280', gridX: 1, gridY: 0, rotation: 0 },
    ]
    const positionFiles = new Map([['bme280', samplePositionFile]])

    const result = mergeMainBoardCentroid(placedBlocks, positionFiles)

    // gridX=1 means offset by 12.7mm
    const c1 = result.entries.find((e) => e.reference === 'BME280_C1')
    expect(c1).toBeDefined()
    expect(c1?.posX).toBeCloseTo(1.5 + 12.7)
    expect(c1?.posY).toBeCloseTo(2.3) // Y offset is 0
  })

  it('applies vertical offset with overlap adjustment', () => {
    const placedBlocks: PlacedBlock[] = [
      { blockSlug: 'bme280', gridX: 0, gridY: 1, rotation: 0 },
    ]
    const positionFiles = new Map([['bme280', samplePositionFile]])

    const result = mergeMainBoardCentroid(placedBlocks, positionFiles)

    // gridY=1 with 1mm overlap: 12.7 - 1.0 = 11.7mm offset
    const c1 = result.entries.find((e) => e.reference === 'BME280_C1')
    expect(c1?.posY).toBeCloseTo(2.3 + 11.7)
  })

  it('prefixes references with block slug', () => {
    const placedBlocks: PlacedBlock[] = [
      { blockSlug: 'relay-module', gridX: 0, gridY: 0, rotation: 0 },
    ]
    const positionFiles = new Map([['relay-module', samplePositionFile]])

    const result = mergeMainBoardCentroid(placedBlocks, positionFiles)

    expect(result.entries.some((e) => e.reference === 'RELAY_MODULE_R1')).toBe(true)
    expect(result.entries.some((e) => e.reference === 'RELAY_MODULE_U1')).toBe(true)
  })

  it('merges multiple blocks', () => {
    const placedBlocks: PlacedBlock[] = [
      { blockSlug: 'block1', gridX: 0, gridY: 0, rotation: 0 },
      { blockSlug: 'block2', gridX: 1, gridY: 0, rotation: 0 },
    ]
    const positionFiles = new Map([
      ['block1', samplePositionFile],
      ['block2', samplePositionFile],
    ])

    const result = mergeMainBoardCentroid(placedBlocks, positionFiles)

    // Should have entries from both blocks
    expect(result.entries.some((e) => e.reference === 'BLOCK1_R1')).toBe(true)
    expect(result.entries.some((e) => e.reference === 'BLOCK2_R1')).toBe(true)
  })

  it('calculates summary correctly', () => {
    const placedBlocks: PlacedBlock[] = [
      { blockSlug: 'bme280', gridX: 0, gridY: 0, rotation: 0 },
    ]
    const positionFiles = new Map([['bme280', samplePositionFile]])

    const result = mergeMainBoardCentroid(placedBlocks, positionFiles)

    expect(result.summary.totalComponents).toBe(4)
    expect(result.summary.topComponents).toBe(3)
    expect(result.summary.bottomComponents).toBe(1)
    expect(result.summary.boardBreakdown).toHaveLength(1)
    expect(result.summary.boardBreakdown[0].boardName).toBe('Main')
    expect(result.summary.boardBreakdown[0].componentCount).toBe(4)
  })

  it('skips blocks without position files', () => {
    const placedBlocks: PlacedBlock[] = [
      { blockSlug: 'has-file', gridX: 0, gridY: 0, rotation: 0 },
      { blockSlug: 'no-file', gridX: 1, gridY: 0, rotation: 0 },
    ]
    const positionFiles = new Map([['has-file', samplePositionFile]])

    const result = mergeMainBoardCentroid(placedBlocks, positionFiles)

    expect(result.entries.some((e) => e.reference.startsWith('HAS_FILE'))).toBe(true)
    expect(result.entries.some((e) => e.reference.startsWith('NO_FILE'))).toBe(false)
  })
})

// =============================================================================
// mergeRemoteBoardCentroid Tests
// =============================================================================

describe('mergeRemoteBoardCentroid', () => {
  it('uses remote board name for entries', () => {
    const remoteBoard: RemoteBoard = {
      id: 'rb1',
      name: 'Button Panel',
      slug: 'button-panel',
      type: 'button',
      placedBlocks: [{ blockSlug: 'button', gridX: 0, gridY: 0, rotation: 0 }],
      boardSize: { width: 20, height: 20, unit: 'mm' },
      connectionMapping: [],
      gridWidth: 1,
      gridHeight: 1,
    }
    const positionFiles = new Map([['button', samplePositionFile]])

    const result = mergeRemoteBoardCentroid(remoteBoard, positionFiles)

    expect(result.entries.every((e) => e.boardName === 'Button Panel')).toBe(true)
    expect(result.summary.boardBreakdown[0].boardName).toBe('Button Panel')
  })

  it('applies grid offsets within remote board', () => {
    const remoteBoard: RemoteBoard = {
      id: 'rb1',
      name: 'Test',
      slug: 'test',
      type: 'custom',
      placedBlocks: [{ blockSlug: 'block', gridX: 1, gridY: 1, rotation: 0 }],
      boardSize: { width: 30, height: 30, unit: 'mm' },
      connectionMapping: [],
      gridWidth: 2,
      gridHeight: 2,
    }
    const positionFiles = new Map([['block', samplePositionFile]])

    const result = mergeRemoteBoardCentroid(remoteBoard, positionFiles)

    const c1 = result.entries.find((e) => e.reference === 'BLOCK_C1')
    // gridX=1: +12.7, gridY=1: +11.7 (with overlap)
    expect(c1?.posX).toBeCloseTo(1.5 + 12.7)
    expect(c1?.posY).toBeCloseTo(2.3 + 11.7)
  })
})

// =============================================================================
// mergePanelizedCentroid Tests
// =============================================================================

describe('mergePanelizedCentroid', () => {
  const mainCentroid: MergedCentroid = {
    entries: [
      {
        reference: 'MAIN_R1',
        value: '10k',
        footprint: 'R_0402',
        posX: 5,
        posY: 10,
        rotation: 0,
        side: 'top',
        boardName: 'Main',
      },
    ],
    summary: {
      totalComponents: 1,
      topComponents: 1,
      bottomComponents: 0,
      boardBreakdown: [{ boardName: 'Main', componentCount: 1 }],
    },
  }

  const remoteBoard: RemoteBoard = {
    id: 'rb1',
    name: 'Remote',
    slug: 'remote',
    type: 'button',
    placedBlocks: [],
    boardSize: { width: 20, height: 20, unit: 'mm' },
    connectionMapping: [],
    gridWidth: 1,
    gridHeight: 1,
  }

  const remoteCentroid: MergedCentroid = {
    entries: [
      {
        reference: 'REMOTE_C1',
        value: '100nF',
        footprint: 'C_0402',
        posX: 2,
        posY: 3,
        rotation: 90,
        side: 'top',
        boardName: 'Remote',
      },
    ],
    summary: {
      totalComponents: 1,
      topComponents: 1,
      bottomComponents: 0,
      boardBreakdown: [{ boardName: 'Remote', componentCount: 1 }],
    },
  }

  it('offsets main board by panel position', () => {
    const panelConfig: PanelConfiguration = {
      mainBoardPosition: { x: 10, y: 15 },
      remoteBoards: [],
      vScoreLines: [],
      panelSize: { width: 100, height: 80 },
      panelMargin: 5,
    }

    const result = mergePanelizedCentroid(mainCentroid, [], panelConfig)

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].posX).toBe(5 + 10) // original + offset
    expect(result.entries[0].posY).toBe(10 + 15)
  })

  it('offsets remote boards by their panel positions', () => {
    const panelConfig: PanelConfiguration = {
      mainBoardPosition: { x: 5, y: 5 },
      remoteBoards: [
        { remoteBoardId: 'rb1', position: { x: 60, y: 5 }, copies: 1 },
      ],
      vScoreLines: [],
      panelSize: { width: 100, height: 80 },
      panelMargin: 5,
    }

    const result = mergePanelizedCentroid(
      mainCentroid,
      [{ board: remoteBoard, centroid: remoteCentroid }],
      panelConfig
    )

    const remoteEntry = result.entries.find((e) => e.reference === 'REMOTE_C1')
    expect(remoteEntry).toBeDefined()
    expect(remoteEntry?.posX).toBe(2 + 60) // original + panel offset
    expect(remoteEntry?.posY).toBe(3 + 5)
  })

  it('duplicates entries for multiple copies', () => {
    const panelConfig: PanelConfiguration = {
      mainBoardPosition: { x: 5, y: 5 },
      remoteBoards: [
        { remoteBoardId: 'rb1', position: { x: 60, y: 5 }, copies: 3 },
      ],
      vScoreLines: [],
      panelSize: { width: 200, height: 80 },
      panelMargin: 5,
    }

    const result = mergePanelizedCentroid(
      mainCentroid,
      [{ board: remoteBoard, centroid: remoteCentroid }],
      panelConfig
    )

    // 1 main + 3 copies of remote
    const remoteEntries = result.entries.filter((e) => e.reference.includes('REMOTE'))
    expect(remoteEntries).toHaveLength(3)

    // References should be suffixed with copy number
    expect(remoteEntries.some((e) => e.reference === 'REMOTE_C1_1')).toBe(true)
    expect(remoteEntries.some((e) => e.reference === 'REMOTE_C1_2')).toBe(true)
    expect(remoteEntries.some((e) => e.reference === 'REMOTE_C1_3')).toBe(true)
  })

  it('calculates combined summary', () => {
    const panelConfig: PanelConfiguration = {
      mainBoardPosition: { x: 5, y: 5 },
      remoteBoards: [
        { remoteBoardId: 'rb1', position: { x: 60, y: 5 }, copies: 1 },
      ],
      vScoreLines: [],
      panelSize: { width: 100, height: 80 },
      panelMargin: 5,
    }

    const result = mergePanelizedCentroid(
      mainCentroid,
      [{ board: remoteBoard, centroid: remoteCentroid }],
      panelConfig
    )

    expect(result.summary.totalComponents).toBe(2)
    expect(result.summary.topComponents).toBe(2)
  })
})

// =============================================================================
// centroidToCSV Tests
// =============================================================================

describe('centroidToCSV', () => {
  it('generates correct CSV headers', () => {
    const centroid: MergedCentroid = {
      entries: [],
      summary: {
        totalComponents: 0,
        topComponents: 0,
        bottomComponents: 0,
        boardBreakdown: [],
      },
    }

    const csv = centroidToCSV(centroid)

    expect(csv).toContain('Designator,Val,Package,Mid X,Mid Y,Rotation,Layer')
  })

  it('formats entries correctly', () => {
    const centroid: MergedCentroid = {
      entries: [
        {
          reference: 'R1',
          value: '10k',
          footprint: 'R_0402_1005Metric',
          posX: 1.5,
          posY: 2.3,
          rotation: 90,
          side: 'top',
          boardName: 'Main',
        },
      ],
      summary: {
        totalComponents: 1,
        topComponents: 1,
        bottomComponents: 0,
        boardBreakdown: [],
      },
    }

    const csv = centroidToCSV(centroid)

    expect(csv).toContain('R1,10k,R_0402_1005Metric,1.5000,2.3000,90.0,top')
  })

  it('escapes fields with special characters', () => {
    const centroid: MergedCentroid = {
      entries: [
        {
          reference: 'R1',
          value: '10k, 1%',
          footprint: 'Package',
          posX: 0,
          posY: 0,
          rotation: 0,
          side: 'top',
          boardName: 'Main',
        },
      ],
      summary: {
        totalComponents: 1,
        topComponents: 1,
        bottomComponents: 0,
        boardBreakdown: [],
      },
    }

    const csv = centroidToCSV(centroid)

    // Value with comma should be quoted
    expect(csv).toContain('"10k, 1%"')
  })
})

// =============================================================================
// centroidToPos Tests
// =============================================================================

describe('centroidToPos', () => {
  it('generates KiCad position file format', () => {
    const centroid: MergedCentroid = {
      entries: [
        {
          reference: 'R1',
          value: '10k',
          footprint: 'R_0402',
          posX: 1.5,
          posY: 2.3,
          rotation: 90,
          side: 'top',
          boardName: 'Main',
        },
      ],
      summary: {
        totalComponents: 1,
        topComponents: 1,
        bottomComponents: 0,
        boardBreakdown: [],
      },
    }

    const pos = centroidToPos(centroid)

    expect(pos).toContain('### Footprint positions - Generated by PHAESTUS')
    expect(pos).toContain('## Unit = mm, Angle = deg.')
    expect(pos).toContain('## Side : All')
    expect(pos).toContain('R1 10k R_0402 1.5000 2.3000 90.0 top')
  })

  it('includes all entries', () => {
    const centroid: MergedCentroid = {
      entries: [
        {
          reference: 'R1',
          value: '10k',
          footprint: 'R_0402',
          posX: 1,
          posY: 2,
          rotation: 0,
          side: 'top',
          boardName: 'Main',
        },
        {
          reference: 'C1',
          value: '100nF',
          footprint: 'C_0402',
          posX: 3,
          posY: 4,
          rotation: 180,
          side: 'bottom',
          boardName: 'Main',
        },
      ],
      summary: {
        totalComponents: 2,
        topComponents: 1,
        bottomComponents: 1,
        boardBreakdown: [],
      },
    }

    const pos = centroidToPos(centroid)

    expect(pos).toContain('R1 10k R_0402')
    expect(pos).toContain('C1 100nF C_0402')
    expect(pos).toContain('bottom')
  })
})
