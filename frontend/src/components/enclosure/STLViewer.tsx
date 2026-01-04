/**
 * STL Viewer Component
 *
 * Uses React Three Fiber to display STL models with orbit controls.
 * Supports both URL-based and inline data loading.
 */

import { Suspense, useRef, useEffect, useState } from 'react'
import { Canvas, useThree, useLoader, useFrame } from '@react-three/fiber'
import { OrbitControls, Center, Html, PerspectiveCamera } from '@react-three/drei'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import * as THREE from 'three'
import { Loader2, Maximize2, Minimize2, RotateCcw } from 'lucide-react'
import { clsx } from 'clsx'

interface STLViewerProps {
  /** URL to the STL file */
  src?: string
  /** Inline STL data as Uint8Array */
  data?: Uint8Array
  /** Custom class name */
  className?: string
  /** Model color */
  color?: string
  /** Show grid */
  showGrid?: boolean
  /** Auto-rotate */
  autoRotate?: boolean
  /** Callback when loading completes */
  onLoad?: () => void
  /** Callback on error */
  onError?: (error: Error) => void
}

interface STLModelProps {
  url: string
  color: string
  onLoad?: () => void
}

function STLModel({ url, color, onLoad }: STLModelProps) {
  const geometry = useLoader(STLLoader, url)
  const meshRef = useRef<THREE.Mesh>(null)

  useEffect(() => {
    if (geometry && meshRef.current) {
      // Center the geometry
      geometry.computeBoundingBox()
      const box = geometry.boundingBox
      if (box) {
        const center = new THREE.Vector3()
        box.getCenter(center)
        geometry.translate(-center.x, -center.y, -center.z)
      }
      onLoad?.()
    }
  }, [geometry, onLoad])

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color={color}
        metalness={0.3}
        roughness={0.5}
        flatShading={false}
      />
    </mesh>
  )
}

interface STLDataModelProps {
  data: Uint8Array
  color: string
  onLoad?: () => void
}

function STLDataModel({ data, color, onLoad }: STLDataModelProps) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const meshRef = useRef<THREE.Mesh>(null)

  useEffect(() => {
    const loader = new STLLoader()
    // Create a regular ArrayBuffer copy to avoid SharedArrayBuffer issues
    const buffer = new ArrayBuffer(data.byteLength)
    new Uint8Array(buffer).set(data)
    const geom = loader.parse(buffer)

    // Center the geometry
    geom.computeBoundingBox()
    const box = geom.boundingBox
    if (box) {
      const center = new THREE.Vector3()
      box.getCenter(center)
      geom.translate(-center.x, -center.y, -center.z)
    }

    setGeometry(geom)
    onLoad?.()
  }, [data, onLoad])

  if (!geometry) return null

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        color={color}
        metalness={0.3}
        roughness={0.5}
        flatShading={false}
      />
    </mesh>
  )
}

function AutoRotate({ enabled }: { enabled: boolean }) {
  const { camera } = useThree()

  useFrame((_, delta) => {
    if (enabled) {
      camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), delta * 0.5)
      camera.lookAt(0, 0, 0)
    }
  })

  return null
}

function LoadingFallback() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2 text-steel">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-sm">Loading model...</span>
      </div>
    </Html>
  )
}

export function STLViewer({
  src,
  data,
  className,
  color = '#888888',
  showGrid = true,
  autoRotate = false,
  onLoad,
  onError,
}: STLViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [rotating, setRotating] = useState(autoRotate)
  const containerRef = useRef<HTMLDivElement>(null)

  const toggleFullscreen = () => {
    if (!containerRef.current) return

    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Future: Could use error boundary to capture STL loading errors
  // and call onError?.(error) to propagate them
  void onError // Acknowledge the prop

  if (!src && !data) {
    return (
      <div className={clsx('flex items-center justify-center bg-surface-900', className)}>
        <p className="text-steel-dim text-sm">No model to display</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={clsx(
        'relative bg-gradient-to-b from-surface-800 to-surface-900',
        isFullscreen && 'fixed inset-0 z-50',
        className
      )}
    >
      {/* Toolbar */}
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          onClick={() => setRotating(!rotating)}
          className={clsx(
            'p-1.5 rounded bg-surface-700/80 hover:bg-surface-600/80 transition-colors',
            rotating && 'text-copper'
          )}
          title={rotating ? 'Stop rotation' : 'Auto-rotate'}
        >
          <RotateCcw className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded bg-surface-700/80 hover:bg-surface-600/80 transition-colors"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4" strokeWidth={1.5} />
          ) : (
            <Maximize2 className="w-4 h-4" strokeWidth={1.5} />
          )}
        </button>
      </div>

      <Canvas>
        <PerspectiveCamera makeDefault position={[100, 100, 100]} fov={50} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <directionalLight position={[-10, -10, -5]} intensity={0.3} />

        <Suspense fallback={<LoadingFallback />}>
          <Center>
            {src ? (
              <STLModel url={src} color={color} onLoad={onLoad} />
            ) : data ? (
              <STLDataModel data={data} color={color} onLoad={onLoad} />
            ) : null}
          </Center>
        </Suspense>

        {showGrid && (
          <gridHelper args={[200, 20, '#444444', '#333333']} position={[0, -50, 0]} />
        )}

        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          autoRotate={rotating}
          autoRotateSpeed={2}
        />
        <AutoRotate enabled={rotating} />
      </Canvas>

      {/* Instructions overlay */}
      <div className="absolute bottom-2 left-2 text-xs text-steel-dim opacity-60">
        Drag to rotate • Scroll to zoom • Right-click to pan
      </div>
    </div>
  )
}

export default STLViewer
