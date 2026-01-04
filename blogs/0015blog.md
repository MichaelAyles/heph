# PCB Block Merging: kicadts Integration

**Date:** 2026-01-04

---

## The Goal

Implement the core algorithms for merging multiple KiCad block schematics into a single unified design. This includes auto-placement of blocks on the grid and generating interconnect wires between adjacent blocks.

---

## The Problem

When users select multiple circuit blocks (MCU, sensors, power, etc.), we need to:
1. Load each block's KiCad schematic file from R2
2. Transform component positions based on grid placement
3. Merge all symbols and wires into a single schematic
4. Generate bus interconnect wires where blocks touch
5. Build a unified net list for firmware pin assignment

---

## The Solution

### kicadts Library

We're using [kicadts](https://github.com/tscircuit/kicadts), a TypeScript library for reading, editing, and generating KiCad S-expression files. Key features:

- Parse existing `.kicad_sch` files into typed objects
- Manipulate symbols, wires, and properties programmatically
- Generate valid KiCad S-expression output with `getString()`
- Zero runtime dependencies - works in browser

```typescript
import { parseKicadSch, KicadSch, Wire, Pts, Xy } from 'kicadts'

// Parse an existing schematic
const schematic = parseKicadSch(schematicText)

// Modify components
for (const symbol of schematic.symbols) {
  symbol.at.x += offsetX
  symbol.at.y += offsetY
}

// Generate output
const output = schematic.getString()
```

### Merge Algorithm

```
┌─────────────────────────────────────────────────────────────┐
│  1. Load block schematics from R2 via fetch()               │
│  2. Build global net list from all block taps               │
│  3. For each placed block:                                  │
│     - Parse schematic with parseKicadSch()                  │
│     - Transform positions by grid offset (12.7mm units)     │
│     - Add symbols and wires to merged schematic             │
│  4. Generate interconnect wires between adjacent blocks     │
│  5. Output merged KiCad S-expression                        │
└─────────────────────────────────────────────────────────────┘
```

### Position Transformation

Each block is placed on a 12.7mm (0.5") grid. When merging:

```typescript
const GRID_UNIT_MM = 12.7

function calculateBlockOffset(gridX: number, gridY: number) {
  return {
    x: gridX * GRID_UNIT_MM,
    y: gridY * GRID_UNIT_MM,
  }
}

// Transform symbol positions
for (const symbol of blockSchematic.symbols) {
  symbol.at.x += offset.x
  symbol.at.y += offset.y
}
```

### Edge Interconnect Wires

Blocks connect via overlapping edges. For each pair of adjacent blocks:

```typescript
// Check east-west connections
for (const eastConn of block.edges.east) {
  const westEdges = neighbor.edges.west
  const match = westEdges.find(w => w.net === eastConn.net)

  if (match) {
    // Create 1mm overlap wire
    wires.push(new Wire({
      points: new Pts([
        new Xy(block.rightEdge - 1, eastConn.offsetMm),
        new Xy(neighbor.leftEdge + 1, match.offsetMm)
      ])
    }))
  }
}
```

### Auto-Placement Algorithm

For AI-suggested layouts, blocks are placed using a bin-packing approach:

```typescript
function autoPlaceBlocks(blocks: PcbBlock[]): PlacedBlock[] {
  // Sort by size (larger blocks first)
  const sorted = blocks.sort((a, b) =>
    (b.widthUnits * b.heightUnits) - (a.widthUnits * a.heightUnits)
  )

  // MCU always at origin
  const mcuIndex = sorted.findIndex(b => b.category === 'mcu')
  if (mcuIndex >= 0) {
    sorted.unshift(sorted.splice(mcuIndex, 1)[0])
  }

  // Place each block at first available grid position
  const gridOccupied = new Set<string>()

  for (const block of sorted) {
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        if (canPlaceAt(x, y, block, gridOccupied)) {
          markOccupied(x, y, block, gridOccupied)
          placed.push({ blockId: block.id, gridX: x, gridY: y })
          break
        }
      }
    }
  }

  return placed
}
```

### Block Suggestion from Spec

The system can suggest blocks based on the project's final specification:

```typescript
function suggestBlocksForSpec(finalSpec, availableBlocks) {
  const suggested = []

  // Always need MCU
  suggested.push(blocks.find(b => b.category === 'mcu'))

  // Power based on spec
  if (spec.power.source.includes('lipo')) {
    suggested.push(blocks.find(b => b.slug === 'power-lipo'))
  }

  // Sensors based on inputs
  for (const input of spec.inputs) {
    if (input.type.includes('temperature')) {
      suggested.push(blocks.find(b => b.slug === 'sensor-bme280'))
    }
    // ... etc
  }

  return suggested
}
```

---

## Implementation

### PCB Merge Service

```typescript
// src/services/pcb-merge.ts
export async function mergeBlockSchematics(
  placedBlocks: PlacedBlock[],
  blockData: PcbBlock[],
  projectName: string
): Promise<MergeResult> {
  // Build global net list
  const globalNets = buildGlobalNetList(blockData)

  // Load and parse all blocks
  const loadedBlocks = []
  for (const placed of placedBlocks) {
    const text = await fetch(`/api/blocks/${placed.blockSlug}/files/${placed.blockSlug}.kicad_sch`)
    const schematic = parseKicadSch(await text.text())
    loadedBlocks.push({ placed, schematic, offset: calculateBlockOffset(placed.gridX, placed.gridY) })
  }

  // Create merged schematic
  const merged = new KicadSch({
    version: 20240101,
    generator: 'phaestus',
    titleBlock: new TitleBlock({ title: projectName }),
    symbols: [],
    wires: []
  })

  // Merge symbols with position offsets
  for (const loaded of loadedBlocks) {
    for (const symbol of loaded.schematic.symbols) {
      symbol.at.x += loaded.offset.x
      symbol.at.y += loaded.offset.y
      merged.symbols.push(symbol)
    }
  }

  // Generate interconnect wires
  const interconnects = generateInterconnectWires(loadedBlocks)
  merged.wires.push(...interconnects)

  return {
    schematic: merged.getString(),
    boardSize: calculateBoardSize(placedBlocks),
    netList: buildNetAssignments(globalNets)
  }
}
```

---

## Files Changed

```
frontend/
├── package.json                        # Added kicadts dependency
└── src/
    └── services/
        └── pcb-merge.ts                # New: merge algorithm implementation
```

---

## Key Decisions

### Why kicadts Over Manual Parsing?

KiCad S-expression format is complex with deeply nested structures. kicadts:
- Handles all KiCad 6+ format variations
- Provides typed classes for every element
- Ensures output is format-compatible
- Has no runtime dependencies (browser-safe)

### Why 12.7mm Grid?

12.7mm = 0.5" = half-inch grid. This is:
- Standard for through-hole components
- Allows 2.54mm (0.1") pin headers to align
- Compatible with most breadboard prototyping
- Gives enough space for SMD components with clearance

### Why 1mm Edge Overlap?

The 1mm copper overlap at block edges:
- Ensures electrical continuity between blocks
- Is manufacturable by all PCB fabs
- Provides mechanical tolerance for alignment
- Matches standard KiCad DRC clearance rules

### Why Client-Side Merging?

Running the merge in the browser rather than on Cloudflare Workers:
- No file system needed (use fetch instead)
- Instant preview without API round-trip
- kicadts is ~50KB, reasonable bundle size
- Can still save merged result to R2 for export

---

## What's Next

1. **3D Preview** - Add react-three-fiber STEP model viewer for PCB visualization
2. **Phase 5: Enclosure Generation** - OpenSCAD code generation with LLM
3. **Gerber Export** - Generate manufacturing files from merged PCB

---

## Summary

| Component | Purpose |
|-----------|---------|
| `kicadts` | Parse and generate KiCad S-expression files |
| `mergeBlockSchematics()` | Combine multiple block schematics |
| `autoPlaceBlocks()` | Bin-pack blocks on the grid |
| `suggestBlocksForSpec()` | AI-suggested block selection |
| `generateInterconnectWires()` | Create bus connections at edges |

The PCB stage can now load individual block schematics, merge them with proper positioning, and generate interconnect wires for the bus architecture. The foundation is complete for full schematic generation.
