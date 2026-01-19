# Blog 40: Gerber Merging - Why We Gave Up on KiCad Native Files

**Date: January 19, 2026**

PHAESTUS merges pre-validated circuit blocks into complete PCBs. For months, we tried to do this at the KiCad level - parsing `.kicad_pcb` files, transforming S-expressions, reconciling net names. It was a nightmare. Today we threw it all out and switched to Gerber merging. Here's why.

## The KiCad Approach: Death by a Thousand Cuts

KiCad's native file format is S-expressions - deeply nested, context-dependent, and full of implicit assumptions:

```lisp
(segment (start 107.95 71.12) (end 108.585 71.755)
  (width 0.2) (layer "F.Cu") (net 15) (uuid "abc123"))
```

To merge two KiCad PCBs, you need to:

1. **Parse S-expressions** - Handle nested structures, quoted strings, escape sequences
2. **Remap net IDs** - Net 15 in block A might conflict with net 15 in block B
3. **Reconcile net names** - "GND" in block A must connect to "GND" in block B
4. **Transform coordinates** - Offset everything by grid position
5. **Handle footprint libraries** - References might point to different library versions
6. **Merge design rules** - Track widths, clearances, layer stackups
7. **Preserve UUIDs** - KiCad uses UUIDs for change tracking

We got maybe 70% of the way there. The remaining 30% was edge cases that kept breaking: zone fills with complex polygons, embedded footprints, bus aliases, hierarchical sheet references. Each fix broke something else.

## The Realization: We Don't Need Editable Output

The turning point was asking: **what do users actually need?**

They need manufacturing files. Gerbers. Drill files. That's it.

Nobody is going to open our merged PCB in KiCad and route new traces. The blocks are pre-validated. The bus connections are guaranteed by interface type-checking. The merged output goes straight to a fab house.

## Gerbers: Dumb Files Are Good Files

Gerber files are beautifully simple. They're basically vector graphics:

```
G04 Block: ESP32*
D10*
X8955000Y7284504D03*
X8955000Y5284504D03*
```

- **No net information** - Just copper shapes. No electrical context to reconcile.
- **No hierarchy** - Flat list of drawing commands.
- **Simple coordinates** - X, Y, and a draw/flash command.
- **Aperture definitions** - Like pen sizes. Easy to renumber.

To merge Gerbers, we just:

1. Parse coordinates and apertures from each block
2. Find the bounding box to normalize to origin
3. Offset coordinates by grid position
4. Renumber apertures to avoid collisions
5. Concatenate

That's it. ~400 lines of TypeScript vs thousands for the KiCad approach.

## The Gotchas We Hit

It wasn't completely smooth. Three issues bit us:

### 1. Layer Misalignment

![Misaligned layers showing striped effect](2026-01-19%2022_30_56-_remote-4ch-io-block%20%5Bremote-4ch-io-block%5D%20—%20Schematic%20Editor.png)

Each layer was finding its own bounding box independently. The top copper might have min coordinates at (107mm, -77mm) while the silkscreen had (109mm, -75mm). After normalizing each to origin separately, layers were offset from each other.

**Fix**: Calculate unified bounds across ALL layers of each block first, then use that single origin for every layer.

### 2. Empty Layers Corrupting Bounds

One block's bottom silkscreen was empty - no coordinates at all. Our bounds function returned (0, 0) as a fallback, which then became the global minimum, preventing any normalization.

**Fix**: Skip layers that have no coordinate commands when calculating unified bounds.

### 3. Inner Copper Layers

We initially only exported F.Cu and B.Cu. The blocks were 4-layer boards with In1.Cu and In2.Cu that we completely missed.

**Fix**: Export all copper layers from KiCad CLI:
```bash
kicad-cli pcb export gerbers --layers "F.Cu,In1.Cu,In2.Cu,B.Cu,..."
```

## The Final Result

![Properly merged PCB in tracespace](2026-01-19%2023_16_42-_remote-4ch-io-block%20%5Bremote-4ch-io-block%5D%20—%20Schematic%20Editor.png)

Two blocks - a battery connector and an ESP32 module - merged into a single 4-layer board with:
- Unified coordinate system (normalized to origin)
- Vertical stacking (bus connectors aligned)
- Uniform 1mm margin board outline
- All 10 layers merged (4 copper + 2 mask + 2 silk + drill + outline)

## Tradeoffs

**What we lose:**
- No editable KiCad output (can't tweak the merged design)
- No DRC on the merged board (trust the pre-validated blocks)
- No net names in output (pure geometry)

**What we gain:**
- Simple, maintainable code
- 100% reliable merging (no edge cases)
- Direct path to manufacturing
- Fast iteration on the merge algorithm

## The Lesson

Sometimes the "right" approach (native file formats, full fidelity) is the enemy of shipping. Gerbers are a decades-old lowest-common-denominator format, and that's exactly why they work. Every PCB tool can read them. Every fab house accepts them. They're dumb, flat, and predictable.

For PHAESTUS, where blocks are pre-validated and the output goes straight to manufacturing, Gerber merging is the right level of abstraction. We're not building a PCB editor - we're building a hardware compiler. And compilers output object code, not source.
