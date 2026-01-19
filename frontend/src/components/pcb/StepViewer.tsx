/**
 * STEP File Viewer Component
 *
 * Displays a 3D visualization of a STEP/STP CAD file.
 * Uses React Three Fiber and occt-import-js for parsing.
 */

import { Suspense, useState, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Html, PerspectiveCamera, Center } from '@react-three/drei'
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

interface StepViewerProps {
  /** URL to the STEP file */
  url: string
  /** Optional class name */
  className?: string
}

/**
 * Load STEP file and convert to Three.js BufferGeometry
 */
async function loadStepGeometry(url: string): Promise<THREE.BufferGeometry | null> {
  try {
    console.log('[StepViewer] Loading OCCT module...')
    const occtModule = await getOcct()
    console.log('[StepViewer] Initializing OCCT...')
    const occt = await occtModule.default()
    console.log('[StepViewer] OCCT initialized, fetching:', url)

    const response = await fetch(url)
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

    // Combine all meshes into geometries
    const geometries: THREE.BufferGeometry[] = []

    for (const mesh of result.meshes) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3)
      )
      if (mesh.attributes.normal) {
        geometry.setAttribute(
          'normal',
          new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3)
        )
      }
      if (mesh.index) {
        geometry.setIndex(new THREE.BufferAttribute(mesh.index.array, 1))
      }
      geometries.push(geometry)
    }

    // Merge geometries
    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries)

    if (!merged.attributes.normal) {
      merged.computeVertexNormals()
    }
    merged.computeBoundingBox()
    merged.center()

    console.log('[StepViewer] Success! Vertices:', merged.attributes.position.count)
    return merged
  } catch (error) {
    console.error('[StepViewer] Failed to load STEP file:', url, error)
    return null
  }
}

function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry()
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

function StepModel({ geometry }: { geometry: THREE.BufferGeometry }) {
  return (
    <Center>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#e5e5e5"
          metalness={0.3}
          roughness={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
    </Center>
  )
}

function Scene({ geometry, autoRotate }: { geometry: THREE.BufferGeometry; autoRotate: boolean }) {
  // Calculate camera distance based on geometry size
  const cameraDistance = useMemo(() => {
    if (!geometry.boundingBox) return 100
    const size = new THREE.Vector3()
    geometry.boundingBox.getSize(size)
    return Math.max(size.x, size.y, size.z) * 2.5
  }, [geometry])

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} />
      <directionalLight position={[-10, -10, -10]} intensity={0.3} />

      <StepModel geometry={geometry} />

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
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRotate, setAutoRotate] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)

    loadStepGeometry(url)
      .then((geom) => {
        if (geom) {
          setGeometry(geom)
        } else {
          setError('Failed to load 3D model')
        }
      })
      .catch(() => setError('Failed to load 3D model'))
      .finally(() => setLoading(false))
  }, [url])

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

  if (error || !geometry) {
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
          <Scene geometry={geometry} autoRotate={autoRotate} />
        </Suspense>
      </Canvas>
    </div>
  )
}

export default StepViewer
