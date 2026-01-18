# Export Stage: Download Your Complete Hardware Design

**Date:** 2026-01-04

---

## The Goal

Implement a fully functional Export stage that lets users download all their project artifacts: specifications, OpenSCAD enclosure files, firmware source code, and a complete project package.

---

## The Problem

After completing all design stages, users need to:
1. Download specification documents for manufacturing quotes
2. Export OpenSCAD files to render STL for 3D printing
3. Get firmware source ready for PlatformIO compilation
4. Have a single "download everything" option

---

## The Solution

### Export Cards with Real Downloads

Each export type now has functional download buttons that generate ZIP files on-the-fly:

```tsx
// src/pages/workspace/ExportStageView.tsx
const exportItems: ExportItem[] = [
  {
    id: 'spec',
    title: 'Specification',
    description: 'Complete project specification with requirements and BOM',
    filename: 'spec.md',
    ready: !!project?.spec?.finalSpec,
    onDownload: downloadSpec,
  },
  {
    id: 'enclosure',
    title: 'Enclosure Files',
    description: 'OpenSCAD source for 3D printable enclosure',
    filename: 'enclosure.zip',
    ready: !!project?.spec?.enclosure?.openScadCode,
    onDownload: downloadEnclosure,
  },
  // ...
]
```

### Specification Export

Generates a comprehensive Markdown document:

```typescript
const downloadSpec = async () => {
  const content = `# ${project.name} Specification

## Final Specification
### ${spec.finalSpec.name}
${spec.finalSpec.summary}

### PCB Size
- Width: ${spec.finalSpec.pcbSize.width}mm
- Height: ${spec.finalSpec.pcbSize.height}mm

### Bill of Materials
| Item | Quantity | Unit Cost |
|------|----------|-----------|
${spec.finalSpec.estimatedBOM.map(b =>
  `| ${b.item} | ${b.quantity} | $${b.unitCost.toFixed(2)} |`
).join('\n')}

**Total:** $${totalCost.toFixed(2)}
`

  downloadBlob(new Blob([content]), 'spec.md')
}
```

### Enclosure Export

Creates a ZIP with OpenSCAD source and iteration history:

```typescript
const downloadEnclosure = async () => {
  const zip = new JSZip()

  // Main enclosure file
  zip.file('enclosure.scad', project.spec.enclosure.openScadCode)

  // Version history from iterations
  for (const iter of project.spec.enclosure.iterations) {
    zip.file(`iterations/v${i}_${date}.scad`, iter.openScadCode)
    zip.file(`iterations/v${i}_feedback.txt`, iter.feedback)
  }

  // Usage instructions
  zip.file('README.md', ENCLOSURE_README)

  downloadBlob(await zip.generateAsync({ type: 'blob' }), 'enclosure.zip')
}
```

### Complete Package

Downloads everything in one ZIP:

```typescript
const downloadComplete = async () => {
  const zip = new JSZip()

  // Spec (markdown + JSON)
  zip.file('spec.md', generateSpecMarkdown())
  zip.file('spec.json', JSON.stringify(project.spec, null, 2))

  // Enclosure
  zip.file('enclosure/enclosure.scad', enclosureCode)

  // Firmware
  for (const file of project.spec.firmware.files) {
    zip.file(`firmware/${file.path}`, file.content)
  }

  // Master README
  zip.file('README.md', MASTER_README)

  downloadBlob(await zip.generateAsync({ type: 'blob' }), 'complete.zip')
}
```

### Download State Management

Visual feedback during download:

```tsx
const [downloading, setDownloading] = useState<string | null>(null)
const [downloaded, setDownloaded] = useState<Set<string>>(new Set())

// Button shows: Download → Preparing... → Downloaded
<button className={clsx(
  isDownloaded
    ? 'bg-emerald-500/20 text-emerald-400'
    : 'bg-copper text-ash'
)}>
  {isDownloading ? <Loader2 className="animate-spin" /> : null}
  {isDownloaded ? 'Downloaded' : filename}
</button>
```

### Manufacturing Resources

Links to popular PCB manufacturers:

```tsx
<div className="grid grid-cols-2 gap-3">
  <a href="https://jlcpcb.com" target="_blank">
    <Cpu className="text-steel-dim" />
    <span>JLCPCB</span>
    <span className="text-steel-dim">PCB manufacturing</span>
    <ExternalLink className="text-surface-500" />
  </a>
  <a href="https://pcbway.com" target="_blank">
    ...
  </a>
</div>
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  ExportStageView                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Header: Export & Manufacture                                │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────┐  ┌────────────────┐                        │
│  │ Specification  │  │ Enclosure      │                        │
│  │ [spec.md]     │  │ [enclosure.zip]│                        │
│  └────────────────┘  └────────────────┘                        │
│  ┌────────────────┐  ┌────────────────┐                        │
│  │ Firmware       │  │ Complete       │                        │
│  │ [firmware.zip] │  │ [complete.zip] │                        │
│  └────────────────┘  └────────────────┘                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Manufacturing Resources: JLCPCB | PCBWay                   │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Decisions

### Why Client-Side ZIP Generation?

- **No server round-trip**: All data already in browser
- **Instant downloads**: No waiting for server processing
- **Works offline**: Once page loads, exports work without network
- **Small bundle impact**: JSZip is ~50KB gzipped

### Why Markdown for Spec?

- **Human readable**: Opens in any text editor
- **Git friendly**: Easy to track changes
- **Renders nicely**: GitHub/GitLab preview, easy PDF conversion
- **Includes tables**: BOM renders properly

### Why Include JSON Too?

- **Machine readable**: For automation and scripts
- **Complete data**: All project state preserved
- **Future reimport**: Could potentially restore project state

---

## Files Changed

```
frontend/src/pages/workspace/
└── ExportStageView.tsx    # Complete rewrite with real downloads
```

---

## What's Next

The PHAESTUS workspace pipeline is now feature-complete for the MVP:

1. **Spec Stage** - AI feasibility analysis, iterative Q&A, blueprint selection
2. **PCB Stage** - Block-based schematic layout with KiCanvas viewer
3. **Enclosure Stage** - OpenSCAD generation with 3D STL preview
4. **Firmware Stage** - AI code generation with Monaco editor
5. **Export Stage** - Download all artifacts for manufacturing

Future enhancements:
- Gerber generation from PCB layouts
- PDF export of specifications
- Cloud storage integration (R2)
- Compile server for firmware binaries

---

## Summary

| Feature | Implementation |
|---------|----------------|
| Spec download | Markdown with BOM, decisions, all specs |
| Enclosure download | ZIP with OpenSCAD + iteration history |
| Firmware download | ZIP with PlatformIO project structure |
| Complete package | All files in one ZIP with master README |
| Visual feedback | Loading spinner, success checkmark |
| Manufacturing links | JLCPCB, PCBWay |

The Export stage completes the hardware design pipeline, giving users everything they need to manufacture their AI-designed hardware.
