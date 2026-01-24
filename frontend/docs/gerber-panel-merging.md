# Gerber Panel Merging System

**Date: January 21, 2026**

This document details the gerber panel merging system for PHAESTUS manufacturing output, including the key fixes that enable reliable multi-board panelization.

## Overview

The panel merge system combines a main board with remote boards (button panels, displays, etc.) into a single manufacturing panel. This enables:

- Single fab order for all boards
- Single assembly run
- Shared fiducials and test points
- Lower total cost

## Key Components

### 1. Gerber Merge (`src/services/gerber-merge.ts`)

Merges individual block gerbers into a single board by:

- Normalizing each block to a common origin
- Offsetting blocks based on grid position (12.7mm grid)
- Combining all layers (copper, silk, mask, drill)

**Critical Fix: Edge Cuts for Alignment**

Blocks must be aligned using **edge cuts** (board outline), not copper or silkscreen bounds:

```typescript
function findUnifiedBounds(block: GerberBlock): { minX: number; minY: number } {
  // Prefer edge cuts - defines the physical board boundary on the grid
  const edgeCuts = block.layers.edgeCuts
  if (edgeCuts) {
    const bounds = findGerberBounds(edgeCuts)
    // ... use edge cuts bounds
  }
  // Fallback to copper only if no edge cuts
}
```

**Why edge cuts?**

- Edge cuts define the physical board boundary on the 12.7mm grid
- All KiCad blocks are designed with edge cuts at grid boundaries
- Copper content can vary in position within the board
- Silkscreen can overhang board edges (labels, logos)

Using copper or silkscreen for alignment causes blocks to be offset, breaking bus connector alignment.

### 2. Panel Merge (`src/services/panel-merge.ts`)

Calculates panel layout and generates separation lines:

**Key Functions:**

- `calculatePanelLayout()` - Positions boards with proper spacing
- `generateVScoreLinesWithActualSizes()` - Creates v-score lines for separation
- `generateRoutedEdgesWithActualSizes()` - Creates routed edges for mixed-height boards
- `mergeIntoPanelGerbers()` - Combines all gerbers into panel output

**Critical Fix: Actual Gerber Dimensions**

Board sizes must be parsed from actual gerber edge cuts, not hardcoded values:

```typescript
const remoteBoardsWithActualSizes = remoteBoardGerbers.map(({ board, actualSize }) => ({
  board,
  actualSize, // Parsed from gerber edge cuts
}))

panelConfig = calculatePanelLayout(
  { width: mainBoardDims.width, height: mainBoardDims.height },
  remoteBoardsWithActualSizes
)
```

**Critical Fix: Mixed-Height V-Scoring**

For panels with boards of different heights:

- Bottom v-score spans full panel width (all boards share bottom edge)
- Top v-score only spans boards at maximum height
- Shorter boards get routed top edges instead of v-scored

```typescript
// Generate top v-score segments only for boards at max height
for (const region of regions) {
  if (Math.abs(region.height - maxHeight) < 0.1) {
    lines.push({
      orientation: 'horizontal',
      position: topVScoreY,
      startMm: region.leftVScore, // Only spans this board's width
      endMm: region.rightVScore,
    })
  }
  // Shorter boards get routed tops (handled separately)
}
```

### 3. Vertical Overlap for Bus Connector Merging

Blocks are placed with a 1mm vertical overlap to ensure bus connector pads merge perfectly:

```typescript
// In gerber-merge.ts
const GRID_SIZE_MM = 12.7
const VERTICAL_OVERLAP_MM = 1.0

// Y offset uses reduced spacing for bus connector overlap
const gridOffsetY = gridY * (GRID_SIZE_MM - VERTICAL_OVERLAP_MM)
```

**Why 1mm overlap?**

- Bus connectors on adjacent blocks have 1mm overlapping copper pads
- Without overlap, pads would be 1mm apart and wouldn't connect
- The overlap ensures electrical continuity across block boundaries

**Height calculation with overlap:**

- Formula: `height = maxY * GRID_SIZE_MM - (maxY - 1) * VERTICAL_OVERLAP_MM`
- Example: 4 rows → `4 × 12.7 - 3 × 1 = 50.8 - 3 = 47.8mm`

### 4. Panel Layout Rules

**Spacing:**

- Panel margin: 5mm from panel edge to board
- Board spacing: 4mm between boards (for routing clearance)
- Board margin: 1mm from v-score/route to board copper

**V-Score Placement:**

- Vertical v-scores: At each board's left and right edges (±1mm offset)
- Horizontal bottom: Full panel width, 1mm below board bottoms
- Horizontal top: Only for boards at max height, spans board width only

**Routing:**

- Used for top edges of boards shorter than the tallest
- 2mm routing bit diameter
- Route center = board_top + boardMargin + bitRadius

## Output Files

The panel merge generates:

| File                | Description                |
| ------------------- | -------------------------- |
| `*-F_Cu.gtl`        | Top copper                 |
| `*-B_Cu.gbl`        | Bottom copper              |
| `*-In1_Cu.g1`       | Inner layer 1              |
| `*-In2_Cu.g2`       | Inner layer 2              |
| `*-F_Mask.gts`      | Top solder mask            |
| `*-B_Mask.gbs`      | Bottom solder mask         |
| `*-F_SilkS.gto`     | Top silkscreen             |
| `*-B_SilkS.gbo`     | Bottom silkscreen          |
| `*-Edge_Cuts.gm1`   | Panel outline              |
| `*.drl`             | Drill file                 |
| `*-VScore.gbr`      | V-score lines              |
| `*-RoutedEdges.gbr` | Routed cuts (mixed-height) |
| `*-bom.csv`         | Bill of materials          |
| `*-centroid.csv`    | Pick-and-place coordinates |

## Testing

Use the test script to generate manufacturing files locally:

```bash
cd frontend
pnpm tsx scripts/generate-test-manufacturing.ts
```

Output goes to `test-output/test-project/`. View with gerbv:

```bash
./gerbv/gerbv.exe test-output/test-project/gerbers/*.gtl test-output/test-project/gerbers/*.gbl ...
```

## Common Issues

### Blocks Not Aligned (Bus Connectors Offset)

**Cause:** Using copper or silkscreen bounds instead of edge cuts for alignment.

**Fix:** Ensure `findUnifiedBounds()` uses edge cuts layer.

### V-Score Extends Over Shorter Board

**Cause:** Top horizontal v-score spans full panel width.

**Fix:** Top v-score should only span boards at maximum height. Shorter boards get routed tops.

### Board Size Mismatch

**Cause:** Using hardcoded `RemoteBoard.boardSize` instead of actual gerber dimensions.

**Fix:** Parse actual dimensions from merged gerber edge cuts using `parseBoardDimensionsFromEdgeCuts()`.

## Files Modified

| File                                      | Changes                                                         |
| ----------------------------------------- | --------------------------------------------------------------- |
| `src/services/gerber-merge.ts`            | Edge cuts alignment, copper-only fallback, 1mm vertical overlap |
| `src/services/panel-merge.ts`             | Actual sizes API, mixed-height v-scoring                        |
| `src/services/centroid-merge.ts`          | 1mm vertical overlap for component positioning                  |
| `src/services/pcb-grid.ts`                | 1mm vertical overlap for board size calculation                 |
| `src/services/remote-board.ts`            | 1mm vertical overlap for remote board sizing                    |
| `src/pages/workspace/ExportStageView.tsx` | Updated to use new calculatePanelLayout API                     |
| `src/pages/workspace/PCBStageView.tsx`    | Updated to use new calculatePanelLayout API                     |
| `scripts/generate-test-manufacturing.ts`  | Test script for local generation                                |
