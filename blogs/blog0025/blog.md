# 0025 - Project File Manager: Unified Artifact Browsing

**Date**: 2025-01-07
**Phase**: 3 of 5 - Pipeline Coordination

## The Problem

Each stage in PHAESTUS generates artifacts - specs become markdown, PCB blocks become KiCad schematics, enclosures become STL files, firmware becomes code. But there was no unified way to browse everything a project had produced. Users had to click through each stage to see what was there.

## The Solution

A new **Files** tab that presents all project artifacts as a virtual file tree:

```
project/
├── spec/
│   ├── spec.md              (final spec as markdown)
│   ├── feasibility.json
│   └── blueprint.png        (selected blueprint)
├── pcb/
│   ├── schematic.kicad_sch  (merged schematic)
│   └── bom.csv              (bill of materials)
├── enclosure/
│   ├── enclosure.scad       (OpenSCAD source)
│   └── enclosure.stl        (renderable STL)
├── firmware/
│   └── [platformio files]   (full project structure)
└── chats/
    └── [coming in Phase 5]
```

## Implementation Highlights

### Virtual File Tree

The file tree is generated dynamically from `ProjectSpec` rather than stored. This means it always reflects the current state:

```typescript
function buildProjectTree(spec: ProjectSpec): ProjectFileNode[] {
  const tree: ProjectFileNode[] = []

  // Spec folder - always present
  tree.push({
    name: 'spec',
    type: 'folder',
    children: [
      spec.finalSpec && {
        name: 'spec.md',
        type: 'file',
        previewType: 'markdown',
        content: generateSpecMarkdown(spec.finalSpec)
      },
      // ... other spec files
    ].filter(Boolean)
  })

  // PCB folder - only if artifacts exist
  if (spec.pcb) { ... }

  // Enclosure folder - only if artifacts exist
  if (spec.enclosure) { ... }

  // etc.
}
```

### Multi-Format Preview

The preview panel intelligently switches viewers based on file type:

| Extension | Preview Type | Component |
|-----------|--------------|-----------|
| `.kicad_sch` | KiCanvas | Interactive schematic viewer |
| `.stl` | STLViewer | 3D model with orbit controls |
| `.png`, `.jpg` | Image | Standard img tag |
| `.scad`, `.json`, `.csv` | Code | Syntax-highlighted block |
| `.md` | Markdown | Formatted prose |

The KiCanvas integration uses data URLs for inline content:
```typescript
const dataUrl = `data:text/plain;base64,${btoa(content)}`
<KiCanvasViewer url={dataUrl} />
```

### Smart Actions

Each file gets contextual actions:
- **Copy** - One-click clipboard copy for text content
- **Download** - Browser download with proper MIME type
- **Open in Viewer** - Deep link to full-screen preview (future)

## Files Stage Behavior

The Files tab is special - it's not part of the pipeline progression:

```typescript
// In workspace.ts
canNavigateTo: (stage, spec) => {
  // Files view is always available if there's a spec
  if (stage === 'files') return true
  // ... normal pipeline logic for other stages
}

getStageStatus: (stage, spec) => {
  // Files doesn't have a status - it's always available
  if (stage === 'files') return 'pending'
  // ...
}
```

And in the tab bar, we skip the status indicator entirely:
```tsx
{stage !== 'files' && <StageStatusIndicator status={status} />}
```

## Technical Details

### New Files

- `ProjectFileManager.tsx` - 480 lines, file tree + preview panel
- `FilesStageView.tsx` - Thin wrapper for workspace context
- Updated `workspace.ts` - Added 'files' to stage types
- Updated `WorkspaceStageTabs.tsx` - Added Files icon

### File Size

No real increase in bundle size - we're reusing existing viewers (KiCanvas, STLViewer) and the file tree component is lightweight.

## What's Next

**Phase 4**: Stage Completion Summaries - Show inline previews of what each stage produced before proceeding to the next.

**Phase 5**: Conversation Export - Add the `chats/` folder with LLM conversation history as markdown.

## Artifacts

- Commit: `4214156` - "Add Project File Manager for unified artifact viewing"
- Files changed: 9 (1097 insertions)
- Tests: All 638 passing
