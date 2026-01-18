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
import occtimportjs from 'occt-import-js'

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
    return geometryCache.get(url) || null
  }

  try {
    // Initialize the OCCT library
    const occt = await occtimportjs()

    // Fetch the STEP file
    const response = await fetch(url)
    if (!response.ok) {
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

      // Set vertices
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3)
      )

      // Set normals if available
      if (mesh.attributes.normal) {
        geometry.setAttribute(
          'normal',
          new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3)
        )
      }

      // Set indices if available
      if (mesh.index) {
        geometry.setIndex(new THREE.BufferAttribute(mesh.index.array, 1))
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

    // Center the geometry and get its bounding box for scaling
    mergedGeometry.computeBoundingBox()

    geometryCache.set(url, mergedGeometry)
    return mergedGeometry
  } catch (error) {
    console.warn('Failed to load STEP file:', url, error)
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
    const pos = geom.attributes.position
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    }

    const norm = geom.attributes.normal
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

  // Get STEP file URL if available
  const stepUrl = useMemo(() => {
    if (block.files?.stepModel) {
      return `/api/blocks/${block.slug}/files/${block.files.stepModel}`
    }
    return null
  }, [block.slug, block.files?.stepModel])

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

  // Scale and position for STEP geometry
  const stepScale = useMemo(() => {
    if (!geometry?.boundingBox) return [1, 1, 1]

    const box = geometry.boundingBox
    const size = new THREE.Vector3()
    box.getSize(size)

    // Scale to fit within the block's grid area
    // Leave 1mm margin on each side
    const targetWidth = width - 2
    const targetDepth = depth - 2
    const targetHeight = BLOCK_HEIGHT

    const scaleX = size.x > 0 ? targetWidth / size.x : 1
    const scaleY = size.y > 0 ? targetHeight / size.y : 1
    const scaleZ = size.z > 0 ? targetDepth / size.z : 1

    // Use uniform scale to maintain proportions
    const uniformScale = Math.min(scaleX, scaleY, scaleZ)

    return [uniformScale, uniformScale, uniformScale]
  }, [geometry, width, depth])

  // If we have loaded geometry, render it
  if (geometry && !stepFailed) {
    return (
      <group>
        <group
          ref={groupRef}
          position={[x, y + BLOCK_HEIGHT / 2, z]}
          scale={stepScale as [number, number, number]}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <mesh geometry={geometry}>
            <meshStandardMaterial
              color={hovered ? '#f97316' : '#e5e5e5'}
              metalness={0.3}
              roughness={0.5}
            />
          </mesh>
        </group>
        {/* Block label */}
        {hovered && (
          <Html position={[x, y + BLOCK_HEIGHT + 4, z]} center>
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
 * PCB board mesh component
 */
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

/**
 * Grid lines for visualizing placement
 */
function GridLines({ width, height }: { width: number; height: number }) {
  const gridWidth = Math.ceil(width / GRID_SIZE)
  const gridHeight = Math.ceil(height / GRID_SIZE)

  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = []

    // Vertical lines
    for (let i = 0; i <= gridWidth; i++) {
      const x = i * GRID_SIZE
      points.push(new THREE.Vector3(x, PCB_THICKNESS / 2 + 0.1, 0))
      points.push(new THREE.Vector3(x, PCB_THICKNESS / 2 + 0.1, height))
    }

    // Horizontal lines
    for (let j = 0; j <= gridHeight; j++) {
      const z = j * GRID_SIZE
      points.push(new THREE.Vector3(0, PCB_THICKNESS / 2 + 0.1, z))
      points.push(new THREE.Vector3(width, PCB_THICKNESS / 2 + 0.1, z))
    }

    const geom = new THREE.BufferGeometry()
    const positions = new Float32Array(points.flatMap((v) => [v.x, v.y, v.z]))
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geom
  }, [width, height, gridWidth, gridHeight])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#1a4d1a" opacity={0.5} transparent />
    </lineSegments>
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

      {/* PCB board */}
      <PCBBoard width={boardSize.width} height={boardSize.height} />

      {/* Grid lines */}
      <GridLines width={boardSize.width} height={boardSize.height} />

      {/* Placed blocks */}
      {placedBlocks.map((placed) => {
        const block = blocks.find((b) => b.id === placed.blockId)
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
      const block = blocks.find((b) => b.id === placed.blockId)
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
