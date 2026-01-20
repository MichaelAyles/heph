# Blog 38: Real 3D PCB Preview - From Colored Boxes to STEP Models

**Date**: January 19, 2026

## The Problem: Placeholder Geometry

The PCB 3D viewer was rendering colored boxes. Not actual PCB models - just rectangles with category colors (indigo for MCU, red for power). It looked like a Minecraft build of a circuit board.

We had STEP files in R2 storage. The blocks had `files.stepModel` in their definitions. The viewer just wasn't using them.

![Before: Gray blocks and a floating green PCB](2026-01-19%2014_58_24-.png)

That green rectangle? A hardcoded "PCB substrate" that didn't align with anything. The gray blocks? STEP files loaded but merged into a single monochrome geometry.

## The Journey to Real Models

### Step 1: Actually Load the STEP Files

The WASM loader for OCCT (OpenCASCADE) was returning HTML 404s instead of the binary. The fix: copy `occt-import-js.wasm` to the public folder and configure `locateFile`:

```typescript
const occt = await (occtModule.default as any)({
  locateFile: (file: string) => {
    if (file.endsWith('.wasm')) {
      return '/occt-import-js.wasm'
    }
    return file
  },
})
```

### Step 2: Fix the Geometry Pipeline

OCCT returns regular JavaScript arrays. Three.js needs typed arrays:

```typescript
// Before: TypeError: array should be a Typed Array
geometry.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3)
)

// After: Convert to typed arrays
const positions =
  mesh.attributes.position.array instanceof Float32Array
    ? mesh.attributes.position.array
    : new Float32Array(mesh.attributes.position.array)
geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
```

Then the geometry was inside-out. Merging indexed geometries discards the index buffer, breaking face definitions:

```typescript
// Convert to non-indexed before merging
const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry
```

### Step 3: Coordinate System Conversion

STEP files are Z-up. Three.js is Y-up. A -90° rotation around X fixes it:

```typescript
geometry.rotateX(-Math.PI / 2)
```

### Step 4: Align by Bottom Surface

Each block has different component heights, but PCBs all have the same thickness. Centering blocks at their midpoint meant misaligned bases:

![Blocks at different heights after removing scaling](2026-01-19%2015_00_50-.png)

The fix: align by minimum Y (bottom surface) instead of centering:

```typescript
// Center horizontally (X and Z) but align by bottom surface (min Y)
const box = geometry.boundingBox!
const centerX = (box.min.x + box.max.x) / 2
const centerZ = (box.min.z + box.max.z) / 2
const bottomY = box.min.y

geometry.translate(-centerX, -bottomY, -centerZ)
```

### Step 5: Remove Redundant Elements

The STEP files already include their own PCB substrate. The hardcoded green `PCBBoard` component was redundant:

```typescript
// Deleted 50 lines of PCBBoard and GridLines components
// The STEP models have their own geometry
```

### Step 6: Stop Scaling

The viewer was scaling STEP models to fit within grid cells with margins. But STEP files are already designed at the correct size - 12.7mm per grid unit:

```typescript
// Before: Scaling to fit (caused gaps)
const uniformScale = Math.min(scaleX, scaleY, scaleZ)
return [uniformScale, uniformScale, uniformScale]

// After: No scaling needed
// STEP files are already designed at correct scale (12.7mm per grid unit)
// Just position at grid location
```

### Step 7: Per-Mesh Colors

The final piece: STEP files contain color data per mesh. We were merging everything into one gray geometry. The fix preserves individual meshes with their colors:

```typescript
interface ColoredMesh {
  geometry: THREE.BufferGeometry
  color: string // hex color from STEP file
}

// Extract color from OCCT result (RGB values 0-1)
let color = '#808080'
if (mesh.color) {
  color = rgbToHex(mesh.color[0], mesh.color[1], mesh.color[2])
}

// Render each mesh with its own material
{modelData.meshes.map((mesh, i) => (
  <mesh key={i} geometry={mesh.geometry}>
    <meshStandardMaterial color={mesh.color} metalness={0.3} roughness={0.5} />
  </mesh>
))}
```

## The Result

![Final: Colored STEP models with realistic PCB preview](2026-01-19%2015_13_41-.png)

Real PCB models with:

- Green FR4 substrate
- Silver metal shields and connectors
- Black IC packages
- Proper component placement
- Correct 12.7mm grid alignment
- Accurate board dimensions (25.4×50.8mm for a 2×4 board)

## What Changed

| Before                     | After                     |
| -------------------------- | ------------------------- |
| Colored boxes              | Actual STEP geometry      |
| Single gray material       | Per-mesh colors from file |
| Misaligned heights         | Bottom-surface alignment  |
| Scaled with gaps           | True 12.7mm grid size     |
| Redundant green board      | STEP includes substrate   |
| 50.8×76.2mm (default grid) | Actual board dimensions   |

## The Commits

```
Align PCB blocks by bottom surface for consistent Z-height
Remove redundant PCB substrate from 3D viewer
Remove scaling from STEP models - they're already correct size
Add category colors to STEP models
Render STEP models with per-mesh colors from file
Fix PCB board size display to show actual dimensions
```

The 3D viewer now shows what you're actually going to manufacture. Next: generating the merged KiCad schematic and PCB layout from these blocks.
