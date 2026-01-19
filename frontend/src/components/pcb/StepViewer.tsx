/**
 * STEP File Viewer Component
 *
 * Displays a 3D visualization of a STEP/STP CAD file with per-mesh colors.
 * Uses React Three Fiber and occt-import-js for parsing.
 */

import { Suspense, useState, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Html, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'
import { Loader2, RotateCcw, Maximize2, Minimize2 } from 'lucide-react'
import { clsx } from 'clsx'

// Dynamically import OCCT to avoid loading WASM on every page
let occtPromise: Promise<typeof import('occt-import-js')> | null = null
function getOcct() {
  if (!occtPromise) {
    occtPromise = import('occt-import-js')
  }
  return occtPromise
}

// Mesh with color data from STEP file
interface ColoredMesh {
  geometry: THREE.BufferGeometry
  color: string // hex color
}

// STEP model data with multiple colored meshes
interface StepModelData {
  meshes: ColoredMesh[]
  boundingBox: THREE.Box3
}

interface StepViewerProps {
  /** URL to the STEP file */
  url: string
  /** Optional class name */
  className?: string
}

/**
 * Convert OCCT color array to hex string
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Load STEP file and convert to colored meshes
 */
async function loadStepModel(url: string): Promise<StepModelData | null> {
  try {
    console.log('[StepViewer] Loading OCCT module...')
    const occtModule = await getOcct()
    console.log('[StepViewer] Initializing OCCT...')
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
    console.log('[StepViewer] OCCT initialized, fetching:', url)

    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) {
      console.warn('[StepViewer] Fetch failed:', response.status, response.statusText)
      return null
    }

    const buffer = await response.arrayBuffer()
    const fileBuffer = new Uint8Array(buffer)
    console.log('[StepViewer] File loaded, size:', fileBuffer.length, 'bytes, parsing...')

    const result = occt.ReadStepFile(fileBuffer, null)
    console.log('[StepViewer] Parse result:', { success: result.success, meshCount: result.meshes?.length })
    if (!result.success || result.meshes.length === 0) {
      console.warn('[StepViewer] OCCT parse failed or no meshes')
      return null
    }

    // Process each mesh with its color
    const coloredMeshes: ColoredMesh[] = []

    for (const mesh of result.meshes) {
      const geometry = new THREE.BufferGeometry()

      // Ensure arrays are typed arrays for Three.js
      const positions = mesh.attributes.position.array instanceof Float32Array
        ? mesh.attributes.position.array
        : new Float32Array(mesh.attributes.position.array)
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

      if (mesh.attributes.normal) {
        const normals = mesh.attributes.normal.array instanceof Float32Array
          ? mesh.attributes.normal.array
          : new Float32Array(mesh.attributes.normal.array)
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
      }

      if (mesh.index) {
        const indices = mesh.index.array instanceof Uint32Array
          ? mesh.index.array
          : new Uint32Array(mesh.index.array)
        geometry.setIndex(new THREE.BufferAttribute(indices, 1))
      }

      // Convert indexed to non-indexed for proper face rendering
      const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry

      // Compute normals if not present
      if (!nonIndexed.attributes.normal) {
        nonIndexed.computeVertexNormals()
      }

      // Extract color from mesh (OCCT provides RGB values 0-1)
      let color = '#808080' // Default gray
      if (mesh.color) {
        color = rgbToHex(mesh.color[0], mesh.color[1], mesh.color[2])
      }

      coloredMeshes.push({ geometry: nonIndexed, color })
    }

    // Apply transformations to all meshes
    // STEP files are typically Z-up, Three.js is Y-up
    const rotationMatrix = new THREE.Matrix4().makeRotationX(-Math.PI / 2)

    // Compute combined bounding box
    const combinedBox = new THREE.Box3()
    for (const { geometry } of coloredMeshes) {
      geometry.applyMatrix4(rotationMatrix)
      geometry.computeBoundingBox()
      if (geometry.boundingBox) {
        combinedBox.union(geometry.boundingBox)
      }
    }

    // Center horizontally (X and Z) but align by bottom surface (min Y)
    const centerX = (combinedBox.min.x + combinedBox.max.x) / 2
    const centerZ = (combinedBox.min.z + combinedBox.max.z) / 2
    const bottomY = combinedBox.min.y

    const translationMatrix = new THREE.Matrix4().makeTranslation(-centerX, -bottomY, -centerZ)

    // Apply translation and recompute bounding boxes
    const finalBox = new THREE.Box3()
    for (const { geometry } of coloredMeshes) {
      geometry.applyMatrix4(translationMatrix)
      geometry.computeBoundingBox()
      if (geometry.boundingBox) {
        finalBox.union(geometry.boundingBox)
      }
    }

    console.log('[StepViewer] Success! Meshes:', coloredMeshes.length)
    return { meshes: coloredMeshes, boundingBox: finalBox }
  } catch (error) {
    console.error('[StepViewer] Failed to load STEP file:', url, error)
    return null
  }
}

function StepModel({ modelData }: { modelData: StepModelData }) {
  return (
    <group>
      {modelData.meshes.map((mesh, i) => (
        <mesh key={i} geometry={mesh.geometry}>
          <meshStandardMaterial
            color={mesh.color}
            metalness={0.3}
            roughness={0.5}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

function Scene({ modelData, autoRotate }: { modelData: StepModelData; autoRotate: boolean }) {
  // Calculate camera distance based on model size
  const cameraDistance = useMemo(() => {
    const size = new THREE.Vector3()
    modelData.boundingBox.getSize(size)
    return Math.max(size.x, size.y, size.z) * 2.5
  }, [modelData])

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} />
      <directionalLight position={[-10, -10, -10]} intensity={0.3} />

      <StepModel modelData={modelData} />

      <PerspectiveCamera
        makeDefault
        position={[cameraDistance, cameraDistance * 0.8, cameraDistance]}
        fov={45}
      />
      <OrbitControls
        autoRotate={autoRotate}
        autoRotateSpeed={2}
        enableDamping
        dampingFactor={0.05}
      />
    </>
  )
}

function LoadingSpinner() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2 text-steel">
        <Loader2 className="w-8 h-8 animate-spin text-copper" />
        <span className="text-sm">Loading 3D model...</span>
      </div>
    </Html>
  )
}

export function StepViewer({ url, className }: StepViewerProps) {
  const [modelData, setModelData] = useState<StepModelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRotate, setAutoRotate] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLoading(true)
    setError(null)

    loadStepModel(url)
      .then((data) => {
        if (data) {
          setModelData(data)
        } else {
          setError('Failed to load 3D model')
        }
      })
      .catch(() => setError('Failed to load 3D model'))
      .finally(() => setLoading(false))
  }, [url])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return (
      <div className={clsx('flex items-center justify-center bg-surface-900', className)}>
        <div className="flex flex-col items-center gap-2 text-steel">
          <Loader2 className="w-8 h-8 animate-spin text-copper" />
          <span className="text-sm">Loading 3D model...</span>
        </div>
      </div>
    )
  }

  if (error || !modelData) {
    return (
      <div className={clsx('flex items-center justify-center bg-surface-900', className)}>
        <div className="text-center text-steel-dim">
          <p className="text-sm">{error || 'No 3D model available'}</p>
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
          onClick={() => setAutoRotate(!autoRotate)}
          className={clsx(
            'p-1.5 rounded transition-colors',
            autoRotate
              ? 'bg-copper text-surface-900'
              : 'bg-surface-800 text-steel hover:bg-surface-700'
          )}
          title={autoRotate ? 'Stop rotation' : 'Auto-rotate'}
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

      <Canvas gl={{ preserveDrawingBuffer: true, antialias: true }}>
        <Suspense fallback={<LoadingSpinner />}>
          <Scene modelData={modelData} autoRotate={autoRotate} />
        </Suspense>
      </Canvas>
    </div>
  )
}

export default StepViewer
