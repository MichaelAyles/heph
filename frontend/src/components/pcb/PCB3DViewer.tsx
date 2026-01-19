/**
 * PCB 3D Viewer Component
 *
 * Displays a 3D visualization of the PCB with placed blocks.
 * Loads real STEP models when available, falls back to colored boxes.
 * Uses React Three Fiber for rendering with orbit controls.
 */

import { Suspense, useRef, useMemo, useState, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Box, Html, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { Loader2, Maximize2, Minimize2, RotateCcw } from 'lucide-react'
import { clsx } from 'clsx'
import type { PlacedBlock, PcbBlock, BlockCategory } from '@/db/schema'
// Dynamically import OCCT to avoid loading 1MB+ WASM on every page
let occtPromise: Promise<typeof import('occt-import-js')> | null = null
function getOcct() {
  if (!occtPromise) {
    occtPromise = import('occt-import-js')
  }
  return occtPromise
}

// Grid size in mm (standard 0.5" = 12.7mm)
const GRID_SIZE = 12.7

// PCB thickness in mm
const PCB_THICKNESS = 1.6

// Block height (component standoff) - used for fallback boxes
const BLOCK_HEIGHT = 8

// Category colors for blocks
const CATEGORY_COLORS: Record<BlockCategory, string> = {
  mcu: '#4f46e5',      // Indigo - ESP32/MCU
  power: '#dc2626',    // Red - Power management
  sensor: '#16a34a',   // Green - Sensors
  output: '#f59e0b',   // Amber - LEDs, displays
  connector: '#6b7280', // Gray - Connectors
  utility: '#8b5cf6',  // Purple - Utility
}

// Cache for loaded STEP geometries
const geometryCache = new Map<string, THREE.BufferGeometry | null>()

/** Clear the geometry cache - call after uploading new files */
export function clearGeometryCache() {
  geometryCache.clear()
}

interface PCB3DViewerProps {
  /** Board dimensions in mm */
  boardSize?: { width: number; height: number }
  /** Placed blocks with grid positions */
  placedBlocks: PlacedBlock[]
  /** Full block data for sizing */
  blocks: PcbBlock[]
  /** Custom class name */
  className?: string
  /** Auto-rotate the view */
  autoRotate?: boolean
}

interface BlockMeshProps {
  placed: PlacedBlock
  block: PcbBlock
}

/**
 * Load STEP file and convert to Three.js BufferGeometry
 */
async function loadStepGeometry(url: string): Promise<THREE.BufferGeometry | null> {
  // Check cache first
  if (geometryCache.has(url)) {
    const cached = geometryCache.get(url)
    console.log('[PCB3DViewer] Using cached geometry for:', url, cached ? 'found' : 'null')
    return cached || null
  }

  console.log('[PCB3DViewer] Loading STEP file:', url)

  try {
    // Initialize the OCCT library (dynamically loaded)
    const occtModule = await getOcct()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const occt = await (occtModule.default as any)({
      locateFile: (file: string) => {
        // WASM file is served from public folder
        if (file.endsWith('.wasm')) {
          return '/occt-import-js.wasm'
        }
        return file
      }
    })

    // Fetch the STEP file (no-store to avoid stale cached files)
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) {
      console.warn('[PCB3DViewer] STEP file fetch failed:', url, response.status, response.statusText)
      geometryCache.set(url, null)
      return null
    }

    const buffer = await response.arrayBuffer()
    const fileBuffer = new Uint8Array(buffer)

    // Parse the STEP file
    const result = occt.ReadStepFile(fileBuffer, null)

    if (!result.success || result.meshes.length === 0) {
      geometryCache.set(url, null)
      return null
    }

    // Combine all meshes into a single geometry
    const geometries: THREE.BufferGeometry[] = []

    for (const mesh of result.meshes) {
      const geometry = new THREE.BufferGeometry()

      // Ensure arrays are typed arrays for Three.js
      const positions = mesh.attributes.position.array instanceof Float32Array
        ? mesh.attributes.position.array
        : new Float32Array(mesh.attributes.position.array)
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

      // Set normals if available
      if (mesh.attributes.normal) {
        const normals = mesh.attributes.normal.array instanceof Float32Array
          ? mesh.attributes.normal.array
          : new Float32Array(mesh.attributes.normal.array)
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
      }

      // Set indices if available
      if (mesh.index) {
        const indices = mesh.index.array instanceof Uint32Array
          ? mesh.index.array
          : new Uint32Array(mesh.index.array)
        geometry.setIndex(new THREE.BufferAttribute(indices, 1))
      }

      geometries.push(geometry)
    }

    // Merge all geometries
    const mergedGeometry = geometries.length === 1
      ? geometries[0]
      : mergeGeometries(geometries)

    // Compute normals if not present
    if (!mergedGeometry.attributes.normal) {
      mergedGeometry.computeVertexNormals()
    }

    // STEP files are typically Z-up, Three.js is Y-up
    // Rotate -90 degrees around X axis to convert
    mergedGeometry.rotateX(-Math.PI / 2)

    // Compute bounding box after rotation
    mergedGeometry.computeBoundingBox()

    // Center horizontally (X and Z) but align by bottom surface (min Y)
    // All PCBs have the same thickness - components are only on top
    // So we align by the bottom to ensure consistent base plane
    const box = mergedGeometry.boundingBox!
    const centerX = (box.min.x + box.max.x) / 2
    const centerZ = (box.min.z + box.max.z) / 2
    const bottomY = box.min.y

    // Translate: center X/Z, move bottom to Y=0
    mergedGeometry.translate(-centerX, -bottomY, -centerZ)

    // Recompute bounding box after translation
    mergedGeometry.computeBoundingBox()

    console.log('[PCB3DViewer] STEP file loaded successfully:', url, 'vertices:', mergedGeometry.attributes.position.count)
    geometryCache.set(url, mergedGeometry)
    return mergedGeometry
  } catch (error) {
    console.warn('[PCB3DViewer] Failed to load STEP file:', url, error)
    geometryCache.set(url, null)
    return null
  }
}

/**
 * Merge multiple geometries into one
 */
function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry()

  // Collect all positions and normals
  const positions: number[] = []
  const normals: number[] = []

  for (const geom of geometries) {
    // Convert indexed geometry to non-indexed to preserve face definitions
    const nonIndexed = geom.index ? geom.toNonIndexed() : geom

    const pos = nonIndexed.attributes.position
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    }

    const norm = nonIndexed.attributes.normal
    if (norm) {
      for (let i = 0; i < norm.count; i++) {
        normals.push(norm.getX(i), norm.getY(i), norm.getZ(i))
      }
    }
  }

  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  if (normals.length > 0) {
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  }

  return merged
}

/**
 * Single block mesh component - loads STEP model if available, falls back to box
 */
function BlockMesh({ placed, block }: BlockMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const groupRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [loadingStep, setLoadingStep] = useState(false)
  const [stepFailed, setStepFailed] = useState(false)

  // Calculate block size in mm
  const width = block.widthUnits * GRID_SIZE
  const depth = block.heightUnits * GRID_SIZE

  // Calculate position (grid position * grid size, centered)
  const x = placed.gridX * GRID_SIZE + width / 2
  const z = placed.gridY * GRID_SIZE + depth / 2
  const y = PCB_THICKNESS / 2

  // Get category color
  const color = CATEGORY_COLORS[block.category] || '#6b7280'

  // Get STEP file URL - try explicit file, then conventional naming
  const stepUrl = useMemo(() => {
    const url = block.files?.stepModel
      ? `/api/blocks/${block.slug}/files/${block.files.stepModel}`
      : `/api/blocks/${block.slug}/files/${block.slug}.step`
    console.log('[PCB3DViewer] Block', block.slug, 'files:', block.files, '→ stepUrl:', url)
    return url
  }, [block.slug, block.files])

  // Load STEP geometry
  useEffect(() => {
    if (!stepUrl || stepFailed) return

    setLoadingStep(true)
    loadStepGeometry(stepUrl)
      .then((geom) => {
        if (geom) {
          setGeometry(geom)
        } else {
          setStepFailed(true)
        }
      })
      .finally(() => setLoadingStep(false))
  }, [stepUrl, stepFailed])

  // Pulse animation on hover
  useFrame(() => {
    const target = geometry ? groupRef.current : meshRef.current
    if (target && hovered) {
      target.scale.y = 1 + Math.sin(Date.now() * 0.005) * 0.05
    } else if (target) {
      target.scale.y = 1
    }
  })

  // If we have loaded geometry, render it
  // STEP files are already designed at correct scale (12.7mm per grid unit)
  // No scaling needed - just position at grid location
  if (geometry && !stepFailed) {
    const modelHeight = geometry.boundingBox?.max.y ?? BLOCK_HEIGHT
    return (
      <group>
        <group
          ref={groupRef}
          position={[x, 0, z]}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <mesh geometry={geometry}>
            <meshStandardMaterial
              color={hovered ? '#f97316' : color}
              metalness={0.3}
              roughness={0.5}
            />
          </mesh>
        </group>
        {/* Block label - position above geometry */}
        {hovered && (
          <Html position={[x, modelHeight + 4, z]} center>
            <div className="px-2 py-1 bg-surface-800 text-steel text-xs rounded shadow-lg whitespace-nowrap">
              {block.name}
            </div>
          </Html>
        )}
      </group>
    )
  }

  // Fallback to colored box
  return (
    <group>
      <Box
        ref={meshRef}
        args={[width - 1, BLOCK_HEIGHT, depth - 1]} // Slight gap between blocks
        position={[x, y + BLOCK_HEIGHT / 2, z]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          color={hovered ? '#f97316' : color}
          metalness={0.2}
          roughness={0.6}
        />
      </Box>
      {/* Loading indicator for STEP */}
      {loadingStep && (
        <Html position={[x, y + BLOCK_HEIGHT + 2, z]} center>
          <div className="text-xs text-steel-dim">Loading...</div>
        </Html>
      )}
      {/* Block label */}
      {hovered && !loadingStep && (
        <Html position={[x, y + BLOCK_HEIGHT + 4, z]} center>
          <div className="px-2 py-1 bg-surface-800 text-steel text-xs rounded shadow-lg whitespace-nowrap">
            {block.name}
          </div>
        </Html>
      )}
    </group>
  )
}

/**
 * Scene content
 */
function Scene({
  boardSize,
  placedBlocks,
  blocks,
  autoRotate,
}: {
  boardSize: { width: number; height: number }
  placedBlocks: PlacedBlock[]
  blocks: PcbBlock[]
  autoRotate: boolean
}) {
  const controlsRef = useRef<any>(null)

  // Center the camera on the board
  const target = useMemo(
    () => new THREE.Vector3(boardSize.width / 2, 0, boardSize.height / 2),
    [boardSize]
  )

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />
      <directionalLight position={[-10, 15, -10]} intensity={0.4} />

      {/* Placed blocks */}
      {placedBlocks.map((placed) => {
        const block = blocks.find((b) => b.slug === placed.blockSlug)
        if (!block) return null
        return <BlockMesh key={placed.blockId} placed={placed} block={block} />
      })}

      {/* Camera and controls */}
      <PerspectiveCamera
        makeDefault
        position={[boardSize.width * 1.5, boardSize.height * 1.2, boardSize.height * 1.5]}
        fov={45}
      />
      <OrbitControls
        ref={controlsRef}
        target={target}
        autoRotate={autoRotate}
        autoRotateSpeed={1}
        enableDamping
        dampingFactor={0.05}
        minDistance={20}
        maxDistance={300}
      />
    </>
  )
}

/**
 * Loading spinner
 */
function LoadingSpinner() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2 text-steel">
        <Loader2 className="w-8 h-8 animate-spin text-copper" />
        <span className="text-sm">Loading 3D view...</span>
      </div>
    </Html>
  )
}

/**
 * PCB 3D Viewer Component
 */
export function PCB3DViewer({
  boardSize,
  placedBlocks,
  blocks,
  className,
  autoRotate = false,
}: PCB3DViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [rotation, setRotation] = useState(autoRotate)

  // Calculate board size from blocks if not provided
  const calculatedBoardSize = useMemo(() => {
    if (boardSize) return boardSize

    // Calculate from placed blocks
    let maxX = 0
    let maxY = 0

    for (const placed of placedBlocks) {
      const block = blocks.find((b) => b.slug === placed.blockSlug)
      if (block) {
        const endX = (placed.gridX + block.widthUnits) * GRID_SIZE
        const endY = (placed.gridY + block.heightUnits) * GRID_SIZE
        maxX = Math.max(maxX, endX)
        maxY = Math.max(maxY, endY)
      }
    }

    // Minimum board size
    return {
      width: Math.max(maxX, GRID_SIZE * 2),
      height: Math.max(maxY, GRID_SIZE * 2),
    }
  }, [boardSize, placedBlocks, blocks])

  if (placedBlocks.length === 0) {
    return (
      <div className={clsx('flex items-center justify-center bg-surface-900', className)}>
        <div className="text-center text-steel-dim">
          <p className="text-sm">No blocks placed</p>
          <p className="text-xs mt-1">Select blocks to see 3D preview</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'relative bg-surface-900',
        isFullscreen && 'fixed inset-0 z-50',
        className
      )}
    >
      {/* Controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          onClick={() => setRotation(!rotation)}
          className={clsx(
            'p-1.5 rounded transition-colors',
            rotation
              ? 'bg-copper text-surface-900'
              : 'bg-surface-800 text-steel hover:bg-surface-700'
          )}
          title={rotation ? 'Stop rotation' : 'Auto-rotate'}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="p-1.5 bg-surface-800 text-steel rounded hover:bg-surface-700 transition-colors"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* 3D Canvas */}
      <Canvas shadows gl={{ preserveDrawingBuffer: true, antialias: true }}>
        <Suspense fallback={<LoadingSpinner />}>
          <Scene
            boardSize={calculatedBoardSize}
            placedBlocks={placedBlocks}
            blocks={blocks}
            autoRotate={rotation}
          />
        </Suspense>
      </Canvas>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 z-10 bg-surface-800/90 rounded p-2">
        <div className="text-xs text-steel-dim mb-1">Block Types</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
            <div key={cat} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs text-steel capitalize">{cat}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default PCB3DViewer
