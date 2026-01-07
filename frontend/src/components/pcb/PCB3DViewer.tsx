/**
 * PCB 3D Viewer Component
 *
 * Displays a 3D visualization of the PCB with placed blocks as colored boxes.
 * Uses React Three Fiber for rendering with orbit controls.
 */

import { Suspense, useRef, useMemo, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Box, Html, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { Loader2, Maximize2, Minimize2, RotateCcw } from 'lucide-react'
import { clsx } from 'clsx'
import type { PlacedBlock, PcbBlock, BlockCategory } from '@/db/schema'

// Grid size in mm (standard 0.5" = 12.7mm)
const GRID_SIZE = 12.7

// PCB thickness in mm
const PCB_THICKNESS = 1.6

// Block height (component standoff)
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
 * Single block mesh component
 */
function BlockMesh({ placed, block }: BlockMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  // Calculate block size in mm
  const width = block.widthUnits * GRID_SIZE
  const depth = block.heightUnits * GRID_SIZE

  // Calculate position (grid position * grid size, centered)
  const x = placed.gridX * GRID_SIZE + width / 2
  const z = placed.gridY * GRID_SIZE + depth / 2
  const y = PCB_THICKNESS / 2 + BLOCK_HEIGHT / 2

  // Get category color
  const color = CATEGORY_COLORS[block.category] || '#6b7280'

  // Pulse animation on hover
  useFrame(() => {
    if (meshRef.current && hovered) {
      meshRef.current.scale.y = 1 + Math.sin(Date.now() * 0.005) * 0.05
    } else if (meshRef.current) {
      meshRef.current.scale.y = 1
    }
  })

  return (
    <group>
      <Box
        ref={meshRef}
        args={[width - 1, BLOCK_HEIGHT, depth - 1]} // Slight gap between blocks
        position={[x, y, z]}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial
          color={hovered ? '#f97316' : color}
          metalness={0.2}
          roughness={0.6}
        />
      </Box>
      {/* Block label */}
      {hovered && (
        <Html position={[x, y + BLOCK_HEIGHT, z]} center>
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
