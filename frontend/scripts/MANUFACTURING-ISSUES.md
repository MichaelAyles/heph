# Manufacturing Script Issues

## Current Problems (2026-01-22)

### 1. Component Placement Offsets Are Wrong

**Main Board:**

- Components are offset to top-right of where they should be
- Likely cause: Coordinate normalization is using min bounds of components, not board origin
- The position files have absolute coordinates from KiCad, we normalize to (0,0) based on component bounds, but should normalize based on board edge cuts origin

**Remote Board:**

- Components placed down and left of correct position
- Same root cause - coordinate system mismatch

### 2. Rotation Issues

**FIXED (2026-01-22)**: Created systematic rotation offset system.

**Root cause:** KiCad and JLCPCB use different rotation conventions. Each component/footprint may need a specific offset.

**Solution:** `src/config/jlcpcb-rotation-offsets.ts` - a lookup table that:

1. First checks LCSC part number (most specific)
2. Falls back to footprint pattern matching
3. Returns offset to add to KiCad rotation

**Offsets configured:**

- JST-PH connectors (C295747): +180°
- TPS259541DSGR eFuse (C2155673): -90°
- AW9523B I2C expander (C148077): -90°
- LTST-C19HE1WT LEDs (C427425): -90°

**To add new offsets:** Edit `src/config/jlcpcb-rotation-offsets.ts`:

- Add LCSC part number to `LCSC_ROTATION_OFFSETS` for specific parts
- Add footprint regex to `FOOTPRINT_ROTATION_OFFSETS` for generic patterns

**Original issue:**
~~Battery Connector (JST-PH): Rotation is wrong~~
~~KiCad rotation may need adjustment for JLCPCB's coordinate system~~
~~JLCPCB uses different rotation convention than KiCad~~

### 3. Coordinate System Mismatch

KiCad position files use:

- Origin at top-left or custom origin
- Y increases downward (screen coordinates)

JLCPCB expects:

- Origin at bottom-left (board corner)
- Y increases upward (cartesian coordinates)

**We may need to:**

1. Parse board edge cuts to find actual board origin
2. Flip Y coordinates (boardHeight - posY)
3. Adjust rotations (+180° or similar)

---

## Tomorrow's Tasks

### 1. Fix Centroid Generation

- [x] Load board outline from edge cuts gerber
- [x] Calculate proper board origin (bottom-left corner)
- [ ] Transform coordinates: flip Y axis
- [ ] Verify rotation convention matches JLCPCB

**FIXED (2026-01-22)**: Component placement now uses board edge cuts origin (`dims.minX`, `dims.minY`) from `parseBoardDimensionsFromEdgeCuts()` instead of component bounding box. Fixed in both:

- `scripts/preview-component-placement.ts`
- `scripts/generate-test-manufacturing.ts`

### 2. Find New MCU

- Current: ESP32-C6 SuperMini (XIAO form factor)
- Need: Alternative MCU module
- Reason: TBD

### 3. Replace 0201 with 0402 Resistors

- Current: Many 0R resistors are 0201 (0.6mm x 0.3mm)
- Target: 0402 (1.0mm x 0.5mm)
- Reason: Cheaper assembly at JLCPCB (0201 has surcharge)
- Blocks affected:
  - esp32-c6-mcu
  - 1x1-io-block
  - remote-4ch-io-block

---

## Coordinate Transform Notes

```
KiCad pos file:
  posX, posY (origin at board origin, Y down)

Board dimensions from edge cuts:
  width, height, minX, minY

Transform to JLCPCB (origin bottom-left, Y up):
  jlcX = posX - minX + panelOffsetX
  jlcY = (height - (posY - minY)) + panelOffsetY

Rotation:
  May need: jlcRot = (360 - kicadRot) % 360
  Or component-specific adjustments
```

## Bug Location

**File:** `frontend/scripts/generate-test-manufacturing.ts`

**Problem code (lines 436-444, 486-492):**

```typescript
// WRONG: Normalizing to component bounding box
const allX = entries.map((e) => e.posX)
const allY = entries.map((e) => e.posY)
const minX = Math.min(...allX)
const minY = Math.min(...allY)

const posX = blockOriginX + (entry.posX - minX)
const posY = blockOriginY + (entry.posY - minY)
```

**Fix approach:**

1. Load each block's edge cuts gerber to get board origin (minX, minY) and dimensions
2. Use `parseBoardDimensionsFromEdgeCuts()` from gerber-merge.ts (already imported)
3. Replace component-based normalization with board-based:

```typescript
// CORRECT: Normalize to board origin, flip Y
const boardDims = parseBoardDimensionsFromEdgeCuts(blockEdgeCuts)
const posX = blockOriginX + (entry.posX - boardDims.minX)
const posY = blockOriginY + (boardDims.height - (entry.posY - boardDims.minY))
```

**Data needed:**

- Need to load edge cuts for each block (already have gerbers loaded)
- Store board dimensions per block slug in a Map

## Test Approach

1. Export single block (e.g., USB-C) with known component positions
2. Upload to JLCPCB preview
3. Compare visual placement with KiCad
4. Adjust transform until they match
5. Apply fix to all blocks
