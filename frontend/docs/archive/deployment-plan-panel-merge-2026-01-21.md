# Deployment Plan: Panel Merge Fixes

**Date: January 21, 2026**

## Summary of Changes

### Files Modified

1. **`src/services/gerber-merge.ts`**
   - `findUnifiedBounds()` now uses edge cuts for alignment (copper fallback)
   - Added `VERTICAL_OVERLAP_MM = 1.0` for bus connector merging
   - Y offset calculation uses `(GRID_SIZE_MM - VERTICAL_OVERLAP_MM)` per row
   - Board height calculation accounts for overlap

2. **`src/services/panel-merge.ts`**
   - `calculatePanelLayout()` accepts actual gerber dimensions instead of hardcoded values
   - `generateVScoreLinesWithActualSizes()` limits top v-score to max-height boards only
   - `generateRoutedEdgesWithActualSizes()` routes tops of shorter boards
   - `mergeIntoPanelGerbers()` accepts optional pre-calculated sizes
   - Added `BoardWithGerbers` type for boards with actual dimensions

3. **`src/services/centroid-merge.ts`**
   - Added `VERTICAL_OVERLAP_MM = 1.0` to match gerber-merge.ts
   - Y offset calculation uses reduced spacing for bus connector overlap

4. **`src/services/pcb-grid.ts`**
   - Added `VERTICAL_OVERLAP_MM = 1.0` export
   - `calculateBoardSize()` height accounts for vertical overlap

5. **`src/services/remote-board.ts`**
   - Added grid sizing constants
   - Board size calculations account for vertical overlap

6. **`src/pages/workspace/ExportStageView.tsx`**
   - Updated to use new `calculatePanelLayout()` API with actual sizes

7. **`src/pages/workspace/PCBStageView.tsx`**
   - Updated to use new `calculatePanelLayout()` API with actual sizes

8. **`scripts/generate-test-manufacturing.ts`** (dev only)
   - Test script for local manufacturing file generation

### New Files

9. **`docs/gerber-panel-merging.md`**
   - Technical documentation of the panel merge system

## Pre-Deployment Checklist

### 1. Run CI Checks Locally

```bash
cd frontend
pnpm check  # typecheck && test:run && build
```

**Status: PASSED** (522 tests, all passing)

### 2. Verify Manufacturing Export Service

The `src/services/manufacturing-export.ts` uses the new API:

- [x] Parse actual dimensions from gerber edge cuts for remote boards
- [x] Pass actual dimensions to `calculatePanelLayout()`
- [x] Pass actual sizes map to `mergeIntoPanelGerbers()`

### 3. Test in Browser

- [ ] Create project with main board + remote board
- [ ] Go to PCB stage → Mfg view
- [ ] Configure taps (if applicable)
- [ ] Export manufacturing files
- [ ] Verify ZIP contains correct gerbers with aligned blocks

## Deployment Steps

### Step 1: Verify All Changes Complete

All changes have been made and CI passes:

- [x] 1mm vertical overlap implemented in gerber-merge.ts
- [x] Centroid and PCB grid updated with same overlap
- [x] Export/PCB views updated for new API
- [x] Tests updated to expect new dimensions
- [x] Documentation updated

### Step 2: Commit Changes

```bash
git add -A
git commit -m "Fix panel merge: edge cuts alignment, 1mm vertical overlap, mixed-height v-scoring"
```

### Step 3: Push to Main

```bash
git push origin main
```

GitHub Actions will automatically:

1. Run tests
2. Build the project
3. Deploy to Cloudflare Pages

### Step 4: Verify Production

1. Go to https://phaestus.app
2. Create or open a project with remote boards
3. Export manufacturing files
4. Download and verify with gerbv

## Rollback Plan

If issues are found in production:

```bash
git revert HEAD
git push origin main
```

## Testing Checklist

### Local Testing

- [x] Generate test manufacturing files with script
- [x] Verify blocks aligned in gerbv (bus connectors line up with 1mm overlap)
- [x] Verify v-scores only span max-height boards
- [x] Verify shorter boards have routed tops
- [x] Verify BOM has component-level entries
- [x] Verify centroid has panel coordinates

### Production Testing

- [ ] Export manufacturing files from PCB stage
- [ ] Download ZIP and extract
- [ ] Open gerbers in gerbv/tracespace
- [ ] Verify block alignment (1mm vertical overlap)
- [ ] Verify v-score/route positions
- [ ] Verify BOM and centroid files

## Technical Details: 1mm Vertical Overlap

Blocks are placed with a 1mm vertical overlap to ensure bus connector pads merge:

**Formula:**

- Y offset: `gridY * (12.7 - 1.0) = gridY * 11.7mm`
- Height: `maxY * 12.7 - (maxY - 1) * 1.0`

**Example (4 rows):**

- Without overlap: 4 × 12.7 = 50.8mm
- With overlap: 4 × 12.7 - 3 × 1.0 = 47.8mm

**Why?**

- Bus connectors have 1mm overlap at block boundaries
- Without this, pads would be 1mm apart and wouldn't connect
- The overlap ensures electrical continuity across block boundaries

## Notes

- The legacy `calculatePanelLayoutLegacy()` function is provided for backwards compatibility but should not be used for new code
- The `generateVScoreLines()` function is deprecated; use `generateVScoreLinesWithActualSizes()` instead
- Test script (`generate-test-manufacturing.ts`) is for development only and not deployed
- `VERTICAL_OVERLAP_MM` is defined in multiple files; keep them synchronized
