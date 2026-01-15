/**
 * OpenSCAD WASM Renderer
 *
 * Uses the 2025 OpenSCAD WASM build with Manifold backend for fast rendering.
 * Loads from /openscad/openscad.js and /openscad/openscad.wasm
 */

// Emscripten module interface
interface EmscriptenFS {
  writeFile: (path: string, data: string | Uint8Array) => void
  readFile: (path: string, options?: { encoding?: string }) => Uint8Array | string
  unlink: (path: string) => void
  mkdir: (path: string) => void
}

interface OpenSCADModule {
  FS: EmscriptenFS
  callMain: (args: string[]) => number
}

interface RenderResult {
  stl: Uint8Array
  logs: string[]
  success: boolean
  error?: string
}

// Lazy-loaded module reference
let openscadModule: OpenSCADModule | null = null
let loadPromise: Promise<OpenSCADModule> | null = null

// Warnings to suppress (expected in WASM environment)
const SUPPRESSED_WARNINGS = [
  'Could not initialize localization',
  'Fontconfig error',
  "Can't get font",
  'WARNING:',
  'DEPRECATED:',
]

/**
 * Load the OpenSCAD WASM module from public folder
 * Uses the 2025 build with Manifold support
 */
async function loadOpenSCAD(): Promise<OpenSCADModule> {
  if (openscadModule) {
    return openscadModule
  }

  if (loadPromise) {
    return loadPromise
  }

  loadPromise = (async () => {
    // Temporarily suppress known WASM warnings during initialization
    const originalConsoleLog = console.log
    const originalConsoleError = console.error
    const originalConsoleWarn = console.warn

    const filterWarning = (args: unknown[]) => {
      const msg = args.join(' ')
      return SUPPRESSED_WARNINGS.some((w) => msg.includes(w))
    }

    console.log = (...args) => {
      if (!filterWarning(args)) originalConsoleLog(...args)
    }
    console.error = (...args) => {
      if (!filterWarning(args)) originalConsoleError(...args)
    }
    console.warn = (...args) => {
      if (!filterWarning(args)) originalConsoleWarn(...args)
    }

    try {
      // Load the OpenSCAD module from public folder
      // The module is an ES module that exports a factory function
      // Use dynamic string to avoid TypeScript static analysis issues
      const modulePath = '/openscad/openscad.js'
      const OpenSCADFactory = (await import(/* @vite-ignore */ modulePath)).default

      // Initialize with noInitialRun to prevent auto-execution
      const module: OpenSCADModule = await OpenSCADFactory({
        noInitialRun: true,
        print: (text: string) => {
          if (!filterWarning([text])) {
            console.log('[OpenSCAD]', text)
          }
        },
        printErr: (text: string) => {
          if (!filterWarning([text])) {
            console.error('[OpenSCAD]', text)
          }
        },
      })

      // Create locale directory (required by OpenSCAD)
      try {
        module.FS.mkdir('/locale')
      } catch {
        // Directory may already exist
      }

      openscadModule = module
      return openscadModule
    } finally {
      // Restore console after a short delay to catch startup warnings
      setTimeout(() => {
        console.log = originalConsoleLog
        console.error = originalConsoleError
        console.warn = originalConsoleWarn
      }, 1000)
    }
  })()

  return loadPromise
}

/**
 * Render OpenSCAD code to STL
 * Uses Manifold backend for dramatically faster rendering (~100x faster than CGAL)
 */
export async function renderOpenSCAD(code: string): Promise<RenderResult> {
  const logs: string[] = []

  // Suppress known WASM warnings during rendering
  const originalConsoleLog = console.log
  const originalConsoleError = console.error

  const filterWarning = (args: unknown[]) => {
    const msg = args.join(' ')
    return SUPPRESSED_WARNINGS.some((w) => msg.includes(w))
  }

  console.log = (...args) => {
    if (!filterWarning(args)) originalConsoleLog(...args)
  }
  console.error = (...args) => {
    if (!filterWarning(args)) originalConsoleError(...args)
  }

  try {
    const module = await loadOpenSCAD()

    // Write the OpenSCAD code to a virtual file
    module.FS.writeFile('/input.scad', code)

    // Run OpenSCAD with Manifold backend for much faster rendering
    // --backend=manifold uses the Manifold geometry kernel instead of CGAL
    // --export-format=binstl for binary STL (smaller, faster)
    const exitCode = module.callMain([
      '/input.scad',
      '-o',
      '/output.stl',
      '--backend=manifold',
      '--export-format=binstl',
    ])

    if (exitCode !== 0) {
      throw new Error(`OpenSCAD exited with code ${exitCode}`)
    }

    // Read the output STL file
    const stlData = module.FS.readFile('/output.stl')
    const stl =
      stlData instanceof Uint8Array ? stlData : new TextEncoder().encode(stlData as string)

    // Clean up virtual files
    try {
      module.FS.unlink('/input.scad')
      module.FS.unlink('/output.stl')
    } catch {
      // Ignore cleanup errors
    }

    return {
      stl,
      logs,
      success: true,
    }
  } catch (error) {
    return {
      stl: new Uint8Array(),
      logs,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  } finally {
    // Restore console
    console.log = originalConsoleLog
    console.error = originalConsoleError
  }
}

/**
 * Create a Blob URL from STL data for use in viewers
 */
export function createSTLBlobUrl(stlData: Uint8Array): string {
  // Create a new ArrayBuffer copy to avoid SharedArrayBuffer issues
  const buffer = new ArrayBuffer(stlData.byteLength)
  new Uint8Array(buffer).set(stlData)
  const blob = new Blob([buffer], { type: 'application/octet-stream' })
  return URL.createObjectURL(blob)
}

/**
 * Revoke a Blob URL when no longer needed
 */
export function revokeSTLBlobUrl(url: string): void {
  URL.revokeObjectURL(url)
}

/**
 * Check if OpenSCAD WASM is loaded
 */
export function isOpenSCADLoaded(): boolean {
  return openscadModule !== null
}

/**
 * Preload OpenSCAD WASM module
 * Call this when user navigates to enclosure stage to start loading
 */
export async function preloadOpenSCAD(): Promise<void> {
  await loadOpenSCAD()
}
