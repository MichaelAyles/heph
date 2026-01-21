import { describe, it, expect } from 'vitest'
import { mergeGerbers, calculateBoardOutline, GerberBlock } from './gerber-merge'

// Sample Gerber content (simplified but valid)
const sampleTopCopper = `G04 Sample block*
%MOMM*%
%FSLAX46Y46*%
%LPD*%
%ADD10C,0.200000*%
%ADD11R,1.000000X1.000000*%
D10*
X1000000Y1000000D03*
X5000000Y1000000D01*
D11*
X3000000Y3000000D03*
M02*`

const sampleTopCopper2 = `G04 Second block*
%MOMM*%
%FSLAX46Y46*%
%LPD*%
%ADD10C,0.300000*%
%ADD12R,0.500000X0.500000*%
D10*
X2000000Y2000000D03*
D12*
X4000000Y4000000D03*
M02*`

const sampleDrill = `; Sample drill
M48
METRIC,TZ
FMAT,2
T1C0.8
T2C1.0
%
T1
X1000000Y1000000
X2000000Y2000000
T2
X3000000Y3000000
M30`

describe('gerber-merge', () => {
  it('merges two copper layers with coordinate offsets', () => {
    const blocks: GerberBlock[] = [
      {
        name: 'block1',
        gridX: 0,
        gridY: 0,
        layers: { topCopper: sampleTopCopper }
      },
      {
        name: 'block2',
        gridX: 1,
        gridY: 0,
        layers: { topCopper: sampleTopCopper2 }
      }
    ]

    const result = mergeGerbers(blocks)

    // Should have content
    expect(result.topCopper).toBeTruthy()
    expect(result.topCopper).toContain('Merged by PHAESTUS')

    // Should have apertures from both blocks (renumbered)
    expect(result.topCopper).toContain('%ADD10C,0.200000*%') // From block 1
    expect(result.topCopper).toContain('%ADD11R,1.000000X1.000000*%') // From block 1

    // Block 2 apertures should be renumbered (offset by ~12)
    expect(result.topCopper).toMatch(/%ADD\d+C,0.300000\*%/) // From block 2

    // Should have block comments
    expect(result.topCopper).toContain('Block: block1')
    expect(result.topCopper).toContain('Block: block2')

    // Block 2 coordinates should be offset by grid size (12.7mm = 12700000 units)
    // Original X2000000 + 12700000 = 14700000
    expect(result.topCopper).toContain('X14700000')
  })

  it('merges drill files with tool renumbering', () => {
    const blocks: GerberBlock[] = [
      {
        name: 'block1',
        gridX: 0,
        gridY: 0,
        layers: { drill: sampleDrill }
      },
      {
        name: 'block2',
        gridX: 1,
        gridY: 0,
        layers: { drill: sampleDrill }
      }
    ]

    const result = mergeGerbers(blocks)

    expect(result.drill).toBeTruthy()
    expect(result.drill).toContain('Merged by PHAESTUS')
    expect(result.drill).toContain('METRIC')

    // Should have tools from both blocks
    expect(result.drill).toContain('T1C0.8')
    expect(result.drill).toContain('T2C1.0')

    // Block 2 tools should be renumbered (offset by 3, so T1->T4, T2->T5)
    expect(result.drill).toContain('T4C0.8')
    expect(result.drill).toContain('T5C1.0')
  })

  it('calculates board outline correctly', () => {
    const blocks: GerberBlock[] = [
      { name: 'a', gridX: 0, gridY: 0, layers: {} },
      { name: 'b', gridX: 1, gridY: 0, layers: {} },
      { name: 'c', gridX: 0, gridY: 1, layers: {} },
    ]

    const outline = calculateBoardOutline(blocks)

    // 2 columns × 12.7mm = 25.4mm
    expect(outline.width).toBe(25.4)
    // 2 rows × 12.7mm - 1mm overlap = 24.4mm (vertical overlap for bus connector merging)
    expect(outline.height).toBe(24.4)

    // Should generate valid edge cuts
    expect(outline.gerber).toContain('G04 Board outline')
    expect(outline.gerber).toContain('X0Y0D02') // Start at origin
    expect(outline.gerber).toContain('X25400000Y0D01') // Right edge
  })

  it('handles missing layers gracefully', () => {
    const blocks: GerberBlock[] = [
      { name: 'a', gridX: 0, gridY: 0, layers: { topCopper: sampleTopCopper } },
      { name: 'b', gridX: 1, gridY: 0, layers: {} }, // No layers
    ]

    const result = mergeGerbers(blocks)

    // Should still produce output from block with data
    expect(result.topCopper).toBeTruthy()
    expect(result.topCopper).toContain('Block: a')
    expect(result.topCopper).not.toContain('Block: b')

    // Empty layers should be empty strings
    expect(result.bottomCopper).toBe('')
  })

  it('handles Y offset correctly', () => {
    const blocks: GerberBlock[] = [
      {
        name: 'block1',
        gridX: 0,
        gridY: 1, // Second row
        layers: { topCopper: sampleTopCopper }
      }
    ]

    const result = mergeGerbers(blocks)

    // Y coordinates are normalized to origin first, then offset by grid
    // Original minY=1000000, so Y1000000 becomes 0, then + (12.7 - 1.0)mm grid offset
    // 11.7mm = 11700000 gerber units (vertical overlap for bus connector merging)
    expect(result.topCopper).toContain('Y11700000')
  })
})
