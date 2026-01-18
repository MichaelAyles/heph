# 0026 - Stage Completion Summaries: Pipeline Coordination

**Date**: 2025-01-07
**Phase**: 4 of 5 - Pipeline Coordination

## The Problem

The orchestrator treated stages as isolated button presses. You'd complete the PCB stage, click to Enclosure, and have no idea what PCB artifacts were just created. Users needed to navigate back and forth to understand what they had.

## The Solution

**StageCompletionSummary** - a collapsible inline panel that appears at the top of each stage view, showing what the *previous* stage produced.

| Stage | Shows |
|-------|-------|
| PCB | Spec summary, blueprint, I/O count |
| Enclosure | PCB layout, board dimensions, block list |
| Firmware | Enclosure model, iteration count |
| Export | Firmware file list, line count |

## Key Design Decisions

### Non-Blocking by Default

The summary panel is **collapsed by default** and doesn't block navigation:

```tsx
<StageCompletionSummary
  stage="spec"
  spec={spec}
  projectId={project?.id || ''}
  isExpanded={false}  // Start collapsed
/>
```

Users can expand to see details, but they're never forced to acknowledge anything before proceeding.

### Inline Artifact Previews

Each summary includes actual artifact previews where possible:

```tsx
// For PCB stage showing spec summary
{preview.type === 'image' && preview.url && (
  <img src={preview.url} alt={preview.label} className="w-full h-full object-cover" />
)}

// For enclosure stage showing PCB
{preview.type === 'pcb3d' && blocks && spec.pcb?.placedBlocks && (
  <PCB3DViewer
    boardSize={spec.pcb?.boardSize}
    placedBlocks={spec.pcb.placedBlocks}
    blocks={blocks}
    className="w-full h-full"
  />
)}

// For firmware stage showing enclosure
{preview.type === 'stl' && preview.url && (
  <STLViewer
    src={preview.url}
    className="w-full h-full"
    color="#8B7355"
    showGrid={false}
    autoRotate={true}
  />
)}
```

### Dynamic Summary Generation

The `getStageSummary()` function extracts relevant info from each stage:

```typescript
case 'pcb': {
  const pcb = spec.pcb
  if (!pcb?.placedBlocks?.length) return null

  return {
    title: 'PCB Complete',
    subtitle: `${pcb.placedBlocks.length} blocks on ${pcb.boardSize?.width}×${pcb.boardSize?.height}mm board`,
    previews: [
      { type: 'kicanvas', label: 'Merged Schematic', content: pcb.schematicData },
      { type: 'pcb3d', label: '3D Layout' },
    ],
    stats: [
      { label: 'Blocks', value: pcb.placedBlocks.length },
      { label: 'Board Size', value: `${pcb.boardSize?.width}×${pcb.boardSize?.height}mm` },
      { label: 'Nets', value: pcb.netList?.length ?? 0 },
    ],
    items: pcb.placedBlocks.map(b => b.blockSlug),
  }
}
```

### Quick Navigation

The summary header includes a "Continue to X" button:

```tsx
{nextStage && (
  <button
    onClick={(e) => {
      e.stopPropagation()
      navigate(`/project/${projectId}/${nextStage}`)
    }}
    className="text-xs text-copper hover:text-copper-light flex items-center gap-1"
  >
    Continue to {getStageLabel(nextStage)}
    <ArrowRight className="w-3 h-3" />
  </button>
)}
```

## Integration Pattern

Each stage view conditionally renders the summary:

```tsx
// PCBStageView.tsx - shows spec summary
{spec?.stages?.spec?.status === 'complete' && spec?.finalSpec && (
  <div className="px-4 pt-4">
    <StageCompletionSummary stage="spec" spec={spec} projectId={project?.id || ''} />
  </div>
)}

// EnclosureStageView.tsx - shows PCB summary (needs blocks data)
const { data: blocksData } = useQuery({
  queryKey: ['blocks'],
  queryFn: async () => { /* ... */ },
  enabled: pcbComplete,
})

{spec?.stages?.pcb?.status === 'complete' && spec?.pcb && (
  <div className="px-4 pt-4">
    <StageCompletionSummary
      stage="pcb"
      spec={spec}
      projectId={project?.id || ''}
      blocks={blocksData?.blocks}
    />
  </div>
)}
```

## UI Styling

The summary uses emerald accents to indicate completion:

```tsx
<div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
  <div className="w-8 h-8 rounded-full bg-emerald-500/20">
    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
  </div>
</div>
```

This contrasts with copper (in-progress) and surface colors (pending).

## Files Changed

| File | Changes |
|------|---------|
| `StageCompletionSummary.tsx` | New 380-line component |
| `PCBStageView.tsx` | +import, +summary section |
| `EnclosureStageView.tsx` | +import, +blocks query, +summary |
| `FirmwareStageView.tsx` | +import, +spec variable, +summary |
| `ExportStageView.tsx` | +import, +spec variable, +summary |

## What's Next

**Phase 5**: Conversation Export - Add LLM chat history export to the Export stage, completing the pipeline coordination work.

## Artifacts

- Commit: `bda0dd3` - "Add stage completion summaries showing previous stage artifacts"
- Files changed: 6 (697 insertions)
- Tests: All 638 passing
