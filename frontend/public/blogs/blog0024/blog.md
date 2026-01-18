# Building a 3D PCB Previewer: Colored Boxes on a Green Board

**Date:** January 7, 2026

The enclosure stage needs to know what the PCB looks like to generate accurate enclosures. But more importantly, users need to understand their design spatially before committing. Today I built a 3D PCB viewer that shows placed blocks as colored boxes on a green PCB board.

## The Goal

Show a 3D preview of the PCB layout so users can:
1. Verify block placement makes sense
2. Estimate board size visually
3. Provide input to enclosure generation

For the hackathon, placeholder boxes are fine. STEP models can come later.

## Component Structure

### Grid-Based Layout

PHAESTUS uses a 12.7mm (0.5") grid system. Blocks occupy one or more grid cells based on their size:

```typescript
const GRID_SIZE = 12.7  // mm
const PCB_THICKNESS = 1.6  // mm
const BLOCK_HEIGHT = 8  // mm (component standoff)
```

### Category Colors

Each block category gets a distinct color:

```typescript
const CATEGORY_COLORS: Record<BlockCategory, string> = {
  mcu: '#4f46e5',      // Indigo - ESP32/MCU
  power: '#dc2626',    // Red - Power management
  sensor: '#16a34a',   // Green - Sensors
  output: '#f59e0b',   // Amber - LEDs, displays
  connector: '#6b7280', // Gray - Connectors
  utility: '#8b5cf6',  // Purple - Utility
}
```

### The BlockMesh Component

Each placed block becomes a 3D box:

```tsx
function BlockMesh({ placed, block }: BlockMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  // Calculate size from block's grid units
  const width = block.widthUnits * GRID_SIZE
  const depth = block.heightUnits * GRID_SIZE

  // Position from grid coordinates
  const x = placed.gridX * GRID_SIZE + width / 2
  const z = placed.gridY * GRID_SIZE + depth / 2
  const y = PCB_THICKNESS / 2 + BLOCK_HEIGHT / 2

  const color = CATEGORY_COLORS[block.category]

  // Pulse animation on hover
  useFrame(() => {
    if (meshRef.current && hovered) {
      meshRef.current.scale.y = 1 + Math.sin(Date.now() * 0.005) * 0.05
    }
  })

  return (
    <group>
      <Box
        ref={meshRef}
        args={[width - 1, BLOCK_HEIGHT, depth - 1]} // 1mm gap
        position={[x, y, z]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial color={hovered ? '#f97316' : color} />
      </Box>
      {hovered && (
        <Html position={[x, y + BLOCK_HEIGHT, z]} center>
          <div className="tooltip">{block.name}</div>
        </Html>
      )}
    </group>
  )
}
```

### The PCB Board

Simple green rectangle:

```tsx
function PCBBoard({ width, height }: { width: number; height: number }) {
  return (
    <Box
      args={[width, PCB_THICKNESS, height]}
      position={[width / 2, 0, height / 2]}
    >
      <meshStandardMaterial
        color="#2d5a27" // Classic PCB green
        metalness={0.1}
        roughness={0.8}
      />
    </Box>
  )
}
```

### Grid Lines

Visualize the placement grid using THREE.BufferGeometry:

```tsx
function GridLines({ width, height }: { width: number; height: number }) {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = []

    // Generate grid intersections
    for (let i = 0; i <= gridWidth; i++) {
      points.push(new THREE.Vector3(i * GRID_SIZE, 0.1, 0))
      points.push(new THREE.Vector3(i * GRID_SIZE, 0.1, height))
    }
    // ... horizontal lines too

    const geom = new THREE.BufferGeometry()
    const positions = new Float32Array(points.flatMap(v => [v.x, v.y, v.z]))
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geom
  }, [width, height])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#1a4d1a" opacity={0.5} transparent />
    </lineSegments>
  )
}
```

## Integration with PCBStageView

Added a view mode toggle in the header:

```tsx
const [viewMode, setViewMode] = useState<'schematic' | '3d'>('schematic')

// Toggle buttons
<div className="flex items-center bg-surface-800 rounded p-0.5">
  <button
    onClick={() => setViewMode('schematic')}
    className={viewMode === 'schematic' ? 'active' : ''}
  >
    <FileCode2 /> Schematic
  </button>
  <button
    onClick={() => setViewMode('3d')}
    className={viewMode === '3d' ? 'active' : ''}
  >
    <Box /> 3D
  </button>
</div>

// Content area
{viewMode === '3d' && selectedBlocks.length > 0 ? (
  <PCB3DViewer
    boardSize={pcbArtifacts?.boardSize}
    placedBlocks={selectedBlocks}
    blocks={blocksData.blocks}
  />
) : (
  <KiCanvasViewer ... />
)}
```

## Features

The viewer includes:
- **Orbit controls** - rotate, zoom, pan
- **Auto-rotate toggle** - spin slowly for presentation
- **Fullscreen mode** - expand for detailed inspection
- **Legend** - color key for block categories
- **Hover labels** - show block name on hover
- **Pulse animation** - subtle feedback on hover

## Calculating Board Size

If no explicit board size is provided, calculate from blocks:

```typescript
const calculatedBoardSize = useMemo(() => {
  if (boardSize) return boardSize

  let maxX = 0, maxY = 0
  for (const placed of placedBlocks) {
    const block = blocks.find(b => b.id === placed.blockId)
    if (block) {
      maxX = Math.max(maxX, (placed.gridX + block.widthUnits) * GRID_SIZE)
      maxY = Math.max(maxY, (placed.gridY + block.heightUnits) * GRID_SIZE)
    }
  }

  return { width: Math.max(maxX, GRID_SIZE * 2), height: Math.max(maxY, GRID_SIZE * 2) }
}, [boardSize, placedBlocks, blocks])
```

## Result

Users can now toggle between schematic view and 3D preview:
- **Schematic**: Technical KiCad schematic for circuit review
- **3D Preview**: Spatial visualization for layout understanding

The 3D view makes it obvious if blocks are clustered weirdly or if the board is unexpectedly large.

## Future Enhancements

For production, I'd add:
1. STEP model loading for accurate block shapes
2. Silkscreen layer overlay
3. Copper trace visualization
4. Component height mapping for enclosure generation

But colored boxes get the point across for the hackathon.

## Stats

- **New component**: 290 lines
- **Integration**: ~50 lines added to PCBStageView
- **Dependencies**: React Three Fiber + Drei (already installed)
- **Build**: No bundle size increase (Three.js already included)
