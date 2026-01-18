# PCB Stage Foundation: KiCanvas Integration

**Date:** 2026-01-04

---

## The Goal

Build the foundation for the PCB stage: block manifest schema for KiCad file storage, admin upload endpoints, and KiCanvas integration for schematic viewing.

---

## The Problem

The PCB stage needs to:
1. Store KiCad files (schematics, PCB layouts, 3D models) for each block
2. Define how blocks connect via edge definitions for later merging
3. Display schematics interactively in the browser
4. Let users select and preview blocks before generating a merged schematic

---

## The Solution

### Extended Block Schema

Added three new fields to `pcb_blocks`:

| Field | Purpose |
|-------|---------|
| `edges` | Edge connection definitions for block merging |
| `files` | R2 file references (schematic, PCB, STEP, thumbnail) |
| `net_mappings` | Net name mappings for schematic merge |

```typescript
// Edge connection on one side of a block
interface EdgeConnection {
  net: string        // e.g., "GND", "I2C0_SDA"
  offsetMm: number   // Position along edge in mm
  layer: 'F.Cu' | 'B.Cu' | 'In1.Cu' | 'In2.Cu'
}

interface BlockEdges {
  north: EdgeConnection[]
  south: EdgeConnection[]
  east: EdgeConnection[]
  west: EdgeConnection[]
}

// File references in R2
interface BlockFiles {
  schematic: string   // "mcu-esp32c6.kicad_sch"
  pcb: string         // "mcu-esp32c6.kicad_pcb"
  stepModel?: string  // "mcu-esp32c6.step"
  thumbnail?: string  // "mcu-esp32c6.png"
}
```

### R2 Storage Structure

```
phaestus-assets/
└── blocks/
    ├── mcu-esp32c6/
    │   ├── mcu-esp32c6.kicad_sch
    │   ├── mcu-esp32c6.kicad_pcb
    │   ├── mcu-esp32c6.step
    │   └── mcu-esp32c6.png
    ├── sensor-bme280/
    │   └── ...
    └── ...
```

### KiCanvas Integration

KiCanvas is a browser-based KiCad viewer using WebGL. It's distributed as a web component:

```tsx
function KiCanvasViewer({ src, controls = 'basic' }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Load KiCanvas script dynamically
    const script = document.createElement('script')
    script.src = 'https://kicanvas.org/kicanvas/kicanvas.js'
    script.type = 'module'
    document.head.appendChild(script)

    // Create web component after script loads
    const embed = document.createElement('kicanvas-embed')
    embed.setAttribute('src', src)
    embed.setAttribute('controls', controls)
    containerRef.current?.appendChild(embed)
  }, [src, controls])

  return <div ref={containerRef} className="w-full h-full" />
}
```

Features:
- Lazy-loaded (~200KB) only when PCB stage is accessed
- Supports pan, zoom, component inspection
- Works with KiCad 6+ format files only

---

## Implementation

### Database Migration

```sql
-- migrations/0008_block_edges.sql
ALTER TABLE pcb_blocks ADD COLUMN edges TEXT DEFAULT '{}';
ALTER TABLE pcb_blocks ADD COLUMN files TEXT DEFAULT NULL;
ALTER TABLE pcb_blocks ADD COLUMN net_mappings TEXT DEFAULT NULL;
```

### Admin Upload Endpoint

```typescript
// POST /api/admin/blocks/upload
// Accepts multipart form data
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const formData = await context.request.formData()
  const slug = formData.get('slug')

  // Upload files to R2
  const schematicFile = formData.get('schematic')
  if (schematicFile) {
    await env.STORAGE.put(
      `blocks/${slug}/${slug}.kicad_sch`,
      await schematicFile.arrayBuffer()
    )
  }

  // Update database with file references and edge definitions
  await env.DB.prepare(`
    UPDATE pcb_blocks
    SET files = ?, edges = ?, net_mappings = ?
    WHERE slug = ?
  `).bind(filesJson, edgesJson, netMappingsJson, slug).run()

  return Response.json({ success: true })
}
```

### Block File Serving

```typescript
// GET /api/blocks/:slug/files/:filename
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { slug } = params
  const filename = params.path

  const object = await env.STORAGE.get(`blocks/${slug}/${filename}`)
  if (!object) {
    return Response.json({ error: 'File not found' }, { status: 404 })
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/x-kicad-schematic',
      'Cache-Control': 'public, max-age=3600'
    }
  })
}
```

### PCBStageView

The PCB stage now has three panels:

1. **Block Selector** (left sidebar) - Browse and select blocks by category
2. **Schematic Viewer** (main panel) - KiCanvas display of selected block or merged schematic
3. **Selected Blocks** (bottom) - List of placed blocks with grid positions

```tsx
function PCBStageView() {
  const [selectedBlocks, setSelectedBlocks] = useState<PlacedBlock[]>([])
  const [previewBlockSlug, setPreviewBlockSlug] = useState<string | null>(null)

  return (
    <div className="flex-1 flex min-h-0">
      {/* Left: Block selector */}
      <aside className="w-80 border-r">
        <BlockSelector
          selectedBlocks={selectedBlocks}
          onSelectBlock={handleSelectBlock}
        />
      </aside>

      {/* Main: Schematic viewer */}
      <main className="flex-1 p-4">
        <KiCanvasViewer
          src={previewBlockSlug
            ? `/api/blocks/${previewBlockSlug}/files/${previewBlockSlug}.kicad_sch`
            : pcbArtifacts?.schematicUrl
          }
          controls="basic"
        />

        {/* Selected blocks list */}
        <div className="flex flex-wrap gap-2">
          {selectedBlocks.map(block => (
            <BlockChip
              key={block.blockId}
              block={block}
              onPreview={() => setPreviewBlockSlug(block.blockSlug)}
              onRemove={() => handleRemoveBlock(block.blockId)}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
```

---

## Files Changed

```
frontend/
├── migrations/
│   └── 0008_block_edges.sql           # New: edge/files/netMappings columns
├── functions/api/
│   ├── admin/blocks/
│   │   └── upload.ts                  # New: admin block upload endpoint
│   ├── blocks/
│   │   ├── index.ts                   # Updated: include new fields
│   │   ├── [slug].ts                  # Updated: include new fields
│   │   └── [slug]/files/[[path]].ts   # New: serve block files from R2
├── src/
│   ├── db/schema.ts                   # Updated: BlockEdges, BlockFiles, NetMapping types
│   ├── db/schema.test.ts              # Updated: tests for new fields
│   ├── components/pcb/
│   │   ├── KiCanvasViewer.tsx         # New: KiCanvas wrapper component
│   │   └── BlockSelector.tsx          # New: block selection sidebar
│   └── pages/workspace/
│       └── PCBStageView.tsx           # Updated: full PCB stage UI
```

---

## Key Decisions

### Why Store Files in R2, Not the Database?

KiCad files can be large (100KB+ for complex schematics). R2 provides:
- Direct URL access for KiCanvas
- CDN caching
- No database bloat
- Cheaper storage for binary files

### Why Lazy-Load KiCanvas?

KiCanvas is ~200KB gzipped. Most users will never visit the PCB stage on their first session. Lazy-loading keeps initial bundle small.

### Why Edge Definitions for Merging?

Rather than autorouting between blocks (which fails unpredictably), we pre-define exactly where each block's signals appear on its edges. The merge algorithm can then:
1. Place blocks on the 12.7mm grid
2. Generate 1mm overlap traces between adjacent block edges
3. Merge net names based on edge connections

This makes PCB generation deterministic and fast.

### Why Not Use kicadts Yet?

The `kicadts` library for parsing/merging KiCad files will be added in Phase 4. This phase focuses on viewing individual blocks - the merge algorithm comes next.

---

## What's Next

1. **Phase 4: PCB Block Merging** - Integrate kicadts, implement block placement algorithm, generate merged schematics
2. **Create Initial Block Files** - Design and upload the ESP32-C6, BME280, and other core blocks as KiCad files
3. **3D Preview** - Add react-three-fiber STEP model viewer

---

## Summary

| Component | Purpose |
|-----------|---------|
| `edges` column | Define where block signals appear on edges |
| `files` column | Reference KiCad files in R2 |
| `/api/admin/blocks/upload` | Upload block files to R2 |
| `/api/blocks/:slug/files/*` | Serve block files from R2 |
| `KiCanvasViewer` | Display KiCad schematics in browser |
| `BlockSelector` | Browse and select blocks by category |
| `PCBStageView` | Full PCB stage UI with viewer and selector |

The PCB stage now has the foundation for block-based schematic editing. Users can browse blocks, preview their schematics, and select which ones to include in their design.
