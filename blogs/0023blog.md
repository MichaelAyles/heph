# Wiring Up the PCB Merge: From Orphaned Code to Working Feature

**Date:** January 7, 2026

Sometimes the most impactful fixes are the simplest: calling code that already exists. Today I discovered that `mergeBlockSchematics()` - a 485-line function for merging KiCad schematics - was sitting unused in the codebase. The PCB stage had beautiful block selection UI, but pressing buttons didn't actually produce a merged schematic.

## The Problem: Orphaned Integration Code

The PCB merge function was complete and tested. It could:
- Take an array of placed blocks with grid positions
- Merge their KiCad schematics into a single document
- Calculate board dimensions from the grid layout
- Generate a net list for firmware integration

But nothing called it. The PCBStageView allowed users to select blocks and even saved their positions to the project, but the "merge" step was completely missing.

## The Fix: Wiring Up the Pipeline

### Adding State and Queries

First, I needed to fetch the block library so we'd have access to the actual block data:

```typescript
const [isMerging, setIsMerging] = useState(false)
const [mergeError, setMergeError] = useState<string | null>(null)

const { data: blocksData } = useQuery({
  queryKey: ['blocks'],
  queryFn: async () => {
    const res = await fetch('/api/blocks')
    return res.json() as Promise<{ blocks: PcbBlock[] }>
  },
})
```

### The Merge Handler

This is the critical piece that was missing:

```typescript
const handleMergeSchematic = useCallback(async () => {
  if (selectedBlocks.length === 0) return
  if (!blocksData?.blocks) return

  setIsMerging(true)
  setCurrentStep('generating')

  try {
    const selectedBlockData = blocksData.blocks.filter((b) =>
      selectedBlocks.some((sb) => sb.blockId === b.id)
    )

    const mergeResult = await mergeBlockSchematics(
      selectedBlocks,
      selectedBlockData,
      project.name
    )

    await savePCBMutation.mutateAsync({
      placedBlocks: selectedBlocks,
      schematicData: mergeResult.schematic,
      boardSize: { ...mergeResult.boardSize, unit: 'mm' },
      netList: transformNetList(mergeResult.netList),
      mergedAt: new Date().toISOString(),
    })

    setCurrentStep('preview')
  } catch (error) {
    setMergeError(error.message)
    setCurrentStep('select_blocks')
  } finally {
    setIsMerging(false)
  }
}, [selectedBlocks, blocksData?.blocks])
```

### Displaying the Merged Schematic

KiCanvas accepts URLs, but we now have inline schematic data. The solution: data URLs.

```typescript
{pcbArtifacts?.schematicData ? (
  <KiCanvasViewer
    src={`data:text/plain;base64,${btoa(pcbArtifacts.schematicData)}`}
    type="schematic"
    controls="basic"
  />
) : (
  // Empty state with Generate button
)}
```

### UI Enhancements

Added:
- "Generate Schematic" button in empty state
- Board dimensions display in header (e.g., "76.2 × 50.8 mm")
- "Regenerate" button when schematic exists
- Error display for failed merges
- Step indicators reflecting generation state

## Schema Updates

Extended `PCBArtifacts` to store the new data:

```typescript
export interface PCBArtifacts {
  placedBlocks: PlacedBlock[]
  schematicData?: string    // NEW: Inline KiCad content
  schematicUrl?: string     // Existing: R2 URL
  boardSize?: { width: number; height: number; unit: 'mm' }
  netList?: NetAssignment[]
  mergedAt?: string         // NEW: Timestamp
}
```

## Type Compatibility Issue

The merge function's `NetAssignment` used `localNet`, but schema used `net`. Quick transform:

```typescript
const transformedNetList = mergeResult.netList.map((n) => ({
  net: n.localNet,  // Rename for schema compatibility
  globalNet: n.globalNet,
  gpio: n.gpio,
}))
```

## Collateral Fixes

While fixing the build, I also:
- Fixed `ToolParameter` type to support nested object schemas in array items
- Removed unused `handleRenderWithValidation` from EnclosureStageView

## Result

Users can now:
1. Select PCB blocks from the library
2. Click "Generate Schematic"
3. See the merged schematic instantly in KiCanvasViewer
4. View board dimensions
5. Regenerate if they change blocks

The pipeline finally flows through PCB generation instead of stopping at block selection.

## Stats

- **Lines changed**: 151 added, 34 removed
- **Tests**: 638 passing
- **Key insight**: The merge code was done, just never plugged in

This is a good reminder to periodically audit the codebase for orphaned functionality. Sometimes the hardest work is already done - it just needs to be connected.
