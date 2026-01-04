# Enclosure Generation: OpenSCAD + WebAssembly

**Date:** 2026-01-04

---

## The Goal

Implement AI-generated parametric enclosures using OpenSCAD, with browser-based rendering via WebAssembly and React Three Fiber 3D visualization.

---

## The Problem

When users complete their PCB design, they need an enclosure that:
1. Fits the PCB dimensions with proper clearance
2. Has cutouts for USB ports, displays, LEDs, and buttons
3. Is 3D-printable without supports
4. Can be iterated on with natural language feedback

---

## The Solution

### OpenSCAD Generation Prompt

A detailed system prompt teaches the LLM how to write valid OpenSCAD code:

```typescript
// src/prompts/enclosure.ts
export interface EnclosureInput {
  pcb: {
    width: number      // mm
    height: number     // mm
    thickness: number  // typically 1.6mm
    mountingHoles?: { x: number; y: number; diameter: number }[]
  }
  components: ComponentPlacement[]
  style: EnclosureStyle
  projectName: string
  projectDescription: string
}
```

The prompt includes:
- Standard cutout templates (USB-C, OLED, LED, buttons, vents)
- PCB mounting patterns (screw bosses, edge rails)
- Best practices for 3D printability
- Parametric variable definitions at the top

### OpenSCAD WebAssembly Renderer

The `openscad-wasm` package (~14MB) is lazy-loaded only when users enter the enclosure stage:

```typescript
// src/lib/openscadRenderer.ts
async function loadOpenSCAD(): Promise<OpenSCADModule> {
  if (openscadModule) return openscadModule

  // Dynamic import enables code splitting
  const OpenSCAD = await import('openscad-wasm')
  const instance = await OpenSCAD.default({
    noInitialRun: true,
    print: (text) => console.log('[OpenSCAD]', text),
  })

  openscadModule = instance
  return instance
}

export async function renderOpenSCAD(code: string): Promise<RenderResult> {
  const module = await loadOpenSCAD()

  // Write code to virtual filesystem
  module.FS.writeFile('/input.scad', code)

  // Run OpenSCAD with Manifold backend for speed
  const exitCode = module.callMain([
    '-o', '/output.stl',
    '--enable=manifold',
    '/input.scad',
  ])

  // Read output STL
  const stl = module.FS.readFile('/output.stl')
  return { stl, success: exitCode === 0 }
}
```

### React Three Fiber STL Viewer

The `STLViewer` component provides:
- Orbit controls for rotation/zoom/pan
- Grid overlay for scale reference
- Auto-rotate toggle
- Fullscreen mode
- Download buttons for STL and SCAD

```tsx
// src/components/enclosure/STLViewer.tsx
<Canvas>
  <PerspectiveCamera makeDefault position={[100, 100, 100]} />
  <ambientLight intensity={0.5} />
  <directionalLight position={[10, 10, 5]} />

  <Center>
    <STLDataModel data={stlData} color="#8B7355" />
  </Center>

  <gridHelper args={[200, 20]} position={[0, -50, 0]} />
  <OrbitControls autoRotate={rotating} />
</Canvas>
```

### Iteration Pattern

Users can provide natural language feedback to modify the design:

```
"make the corners more rounded"
"add ventilation slots on the bottom"
"increase wall thickness to 3mm"
```

The feedback is appended to the original code and spec, generating updated OpenSCAD.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  EnclosureStageView                                         │
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │ Generate Button │  │ Split Panel                      │  │
│  └────────┬────────┘  │ ┌─────────┐  ┌───────────────┐  │  │
│           │           │ │ Monaco  │  │ STLViewer     │  │  │
│           ▼           │ │ Editor  │  │ (R3F Canvas)  │  │  │
│  ┌─────────────────┐  │ │         │  │               │  │  │
│  │ LLM.chat()      │──│ │ .scad   │  │    [3D]       │  │  │
│  │ enclosure.ts    │  │ │ code    │  │   Preview     │  │  │
│  └─────────────────┘  │ └────┬────┘  └───────────────┘  │  │
│                       │      │                           │  │
│                       │      ▼                           │  │
│                       │ ┌─────────────────────────────┐  │  │
│                       │ │ renderOpenSCAD() → STL      │  │  │
│                       │ │ (openscad-wasm)             │  │  │
│                       │ └─────────────────────────────┘  │  │
│                       └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Dependencies

| Package | Size | Purpose |
|---------|------|---------|
| `openscad-wasm` | 14MB | OpenSCAD engine (lazy-loaded) |
| `@react-three/fiber` | - | React renderer for Three.js |
| `@react-three/drei` | - | Three.js helpers (OrbitControls, Center) |
| `three` | - | 3D graphics library |
| `@monaco-editor/react` | - | Code editor with syntax highlighting |

---

## Files Changed

```
frontend/
├── package.json                           # Added R3F, Monaco, openscad-wasm
└── src/
    ├── prompts/
    │   └── enclosure.ts                   # New: OpenSCAD generation prompt
    ├── lib/
    │   └── openscadRenderer.ts            # New: WASM wrapper
    ├── components/
    │   └── enclosure/
    │       └── STLViewer.tsx              # New: 3D preview component
    └── pages/workspace/
        └── EnclosureStageView.tsx         # Updated: full UI implementation
```

---

## Key Decisions

### Why OpenSCAD Over Direct STL Generation?

- **Parametric**: Users can tweak variables directly
- **Editable**: The code is human-readable and modifiable
- **Proven**: OpenSCAD is mature and widely used
- **LLM-friendly**: Code generation is more reliable than binary formats

### Why WebAssembly?

- **No server needed**: Runs entirely in the browser
- **Fast**: Manifold backend provides near-instant renders for simple models
- **Offline capable**: Once loaded, works without network

### Why Lazy Loading?

At 14MB, `openscad-wasm` would significantly impact initial page load. By lazy-loading only when users navigate to the enclosure stage:
- Initial bundle stays small (~400KB)
- Users who don't need enclosures never download it
- Preloading starts when entering the stage

### Why Monaco for Editing?

- Same editor as VS Code, familiar to developers
- Syntax highlighting for C-like languages (close enough for OpenSCAD)
- Line numbers, word wrap, automatic layout

---

## What's Next

1. **Phase 6: Firmware Compile Server** - Docker-based ESP32 compilation on Fly.io
2. **Phase 7: Firmware Frontend** - Monaco editor with file tree and compile output
3. **Upload STL to R2** - Persist generated enclosures for export

---

## Summary

| Component | Purpose |
|-----------|---------|
| `enclosure.ts` | Prompt templates for OpenSCAD generation |
| `openscadRenderer.ts` | WASM wrapper with lazy loading |
| `STLViewer.tsx` | React Three Fiber 3D preview |
| `EnclosureStageView.tsx` | Full enclosure workflow UI |

The enclosure stage now generates parametric OpenSCAD from PCB specs, renders to STL in the browser, and displays interactive 3D previews with iteration support.
