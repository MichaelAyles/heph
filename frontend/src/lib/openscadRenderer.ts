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
  backendUsed?: 'manifold' | 'cgal'
}

interface RenderOptions {
  forceBackend?: 'manifold' | 'cgal'
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

function chooseBackendOrder(
  code: string,
  forceBackend?: 'manifold' | 'cgal'
): Array<'manifold' | 'cgal'> {
  if (forceBackend === 'manifold') return ['manifold']
  if (forceBackend === 'cgal') return ['cgal']
  void code
  // Robust default: try CGAL first, then Manifold as fallback.
  return ['cgal', 'manifold']
}

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
      // noExitRuntime prevents the runtime from shutting down after callMain,
      // which is required for calling callMain multiple times (re-rendering)
      const module: OpenSCADModule = await OpenSCADFactory({
        noInitialRun: true,
        noExitRuntime: true,
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
export async function renderOpenSCAD(
  code: string,
  options: RenderOptions = {}
): Promise<RenderResult> {
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

    // Clean up any stale output from a previous render to prevent
    // reading old data if this render fails
    try {
      module.FS.unlink('/output.stl')
    } catch {
      // File may not exist
    }

    // Write the OpenSCAD code to a virtual file
    module.FS.writeFile('/input.scad', code)

    const backends = chooseBackendOrder(code, options.forceBackend)
    let stl: Uint8Array | null = null
    let backendUsed: 'manifold' | 'cgal' | undefined
    const errors: string[] = []

    for (const backend of backends) {
      try {
        try {
          module.FS.unlink('/output.stl')
        } catch {
          // File may not exist from prior attempt
        }

        const exitCode = module.callMain([
          '/input.scad',
          '-o',
          '/output.stl',
          `--backend=${backend}`,
          '--export-format=binstl',
        ])

        if (exitCode !== 0) {
          errors.push(`${backend}: OpenSCAD exited with code ${exitCode}`)
          continue
        }

        const stlData = module.FS.readFile('/output.stl')
        const output =
          stlData instanceof Uint8Array ? stlData : new TextEncoder().encode(stlData as string)

        if (output.byteLength === 0) {
          errors.push(`${backend}: Empty STL output`)
          continue
        }

        stl = output
        backendUsed = backend
        break
      } catch (error) {
        errors.push(`${backend}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (!stl || !backendUsed) {
      throw new Error(
        errors.length > 0 ? `All OpenSCAD backends failed: ${errors.join(' | ')}` : 'Render failed'
      )
    }

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
      backendUsed,
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
