# Blog 34: LLM-Assisted Block Import - From KiCad Files to block.json

**Date**: January 17, 2026

## The Manual JSON Problem

In Blog 33, we introduced formal block specifications. Great for DRC validation. Terrible for actually creating blocks.

A typical `block.json` is 80-150 lines. You need to:
- List every component with reference, value, and footprint
- Identify which nets are bus signals (GND, 3V3, I2C1_SDA...)
- Document every 0R resistor tap and what it isolates
- Calculate grid size from board dimensions
- Know the I2C addresses of your sensors

For someone with a working KiCad design, this is transcription work. The information exists in the schematic and PCB files - it just needs to be extracted and structured.

## The Solution: Parse, Extract, Generate

![ESP32 PCB in KiCad Editor](0034-images/2026-01-17%2019_53_30-ESP32%20—%20PCB%20Editor.png)

This is what we're starting with - a KiCad PCB with labeled nets (GPIO_0, SPI_CS0, AUX_2, 3V3_C6...) and component placements. All this information is machine-readable in the `.kicad_sch` and `.kicad_pcb` files.

```
┌─────────────────┐
│  .kicad_sch     │ ──→ Extract components, values, footprints
│  .kicad_pcb     │ ──→ Extract nets, board size, positions
└─────────────────┘
         │
         ↓
┌─────────────────┐
│  KiCad Extract  │ ──→ Components, nets, bus signals detected
└─────────────────┘
         │
         ↓
┌─────────────────┐
│     LLM         │ ──→ Generate structured block.json
└─────────────────┘
         │
         ↓
┌─────────────────┐
│  Zod Validation │ ──→ Validate against schema, show errors
└─────────────────┘
         │
         ↓
┌─────────────────┐
│   User Review   │ ──→ Edit JSON, fix issues, save
└─────────────────┘
```

The user uploads KiCad files, the system extracts what it can, the LLM fills in the semantic gaps, and the user reviews before saving.

## Parsing KiCad Files

We already had `kicadts` in our dependencies (for schematic merging). It parses the S-expression format:

```typescript
import { parseKicadSch, parseKicadPcb } from 'kicadts'

const sch = parseKicadSch(schematicContent)
const pcb = parseKicadPcb(pcbContent)
```

From the schematic, we extract components:

```typescript
const components: ExtractedComponent[] = []

for (const symbol of sch.symbols || []) {
  const reference = getSymbolProperty(symbol, 'Reference')
  const value = getSymbolProperty(symbol, 'Value')
  const footprint = getSymbolProperty(symbol, 'Footprint')

  // Skip power symbols and test points
  if (reference.startsWith('#') || reference.startsWith('TP')) continue

  components.push({ reference, value, footprint })
}
```

From the PCB, we extract nets:

```typescript
const nets: string[] = []
for (const net of pcb.nets || []) {
  if (net.name && !net.name.startsWith('unconnected-')) {
    nets.push(net.name)
  }
}
```

## Classifying Bus Signals

Not all nets are bus signals. `GND` is. `Net-(R1-Pad2)` isn't. We use pattern matching:

```typescript
const BUS_SIGNAL_PATTERNS = [
  { pattern: /^GND$/i, signal: 'GND' },
  { pattern: /^3V3(_.*)?$/i, signal: '3V3' },
  { pattern: /^I2C\d*_?SDA$/i, signal: 'I2C1_SDA' },
  { pattern: /^SDA\d*$/i, signal: 'I2C1_SDA' },
  { pattern: /^GPIO_?\d$/i, signal: 'GPIO_0' }, // Needs number extraction
  { pattern: /^SPI_?MOSI$/i, signal: 'SPI_MOSI' },
  // ... more patterns
]

function classifyNet(netName: string): BusSignal | undefined {
  for (const { pattern, signal } of BUS_SIGNAL_PATTERNS) {
    if (pattern.test(netName)) return signal
  }
  return undefined
}
```

A typical ESP32 block's nets become:

```
Detected Bus Signals: GND, 3V3, 5V0, I2C1_SDA, I2C1_SCL,
GPIO_0, GPIO_1, GPIO_2, GPIO_3, SPI_MOSI, SPI_MISO, SPI_SCK,
SPI_CS0, AUX_0, AUX_1, AUX_2, AUX_3, AUX_4, AUX_5, AUX_6
```

## The LLM Prompt

The system prompt teaches the LLM about our block schema:

```typescript
export function buildBlockGenerationSystemPrompt(): string {
  return `You are a PCB block metadata generator for PHAESTUS.

## Bus Pinout (20 pins per connector)
${BUS_PINOUT.map((sig, i) => `Pin ${i + 1}: ${sig}`).join('\n')}

## Categories
- mcu: Microcontroller modules
- power: Power management
- sensor: Input sensors
- output: Actuators/displays
- connector: External interfaces
- utility: Support circuits

## block.json Schema
[... full schema documentation ...]

## Rules
1. edges.north and edges.south arrays MUST have length = gridSize[0]
2. i2c.addresses use decimal numbers, not hex strings
3. Identify 0R resistors as bus taps
4. Group identical components by quantity

Return ONLY valid JSON.`
}
```

The user prompt includes the extracted data:

```typescript
export function buildBlockGenerationUserPrompt(extract: KicadExtract, slug: string) {
  return `Generate a block.json for this KiCad design.

**Slug**: ${slug}
**Suggested Grid Size**: ${gridSize[0]}x${gridSize[1]}

## Extracted KiCad Data

### Components
- U1: ESP32-C6 (QFN-48)
- R1: 0R (0402)
- R2: 0R (0402)
- C1: 100nF (0402)
- J1-J4: 20-PIN-BUS (SAMTEC-TFM-110-02)

### Nets
GND, 3V3, 5V0, I2C1_SDA, I2C1_SCL, GPIO_0, GPIO_1, ...

### Bus Signals Detected
GND, 3V3, 5V0, I2C1_SDA, I2C1_SCL, GPIO_0, GPIO_1, GPIO_2, GPIO_3...

Return ONLY the JSON object.`
}
```

## The Import Wizard UI

The admin panel now has "Import from KiCad" as the primary action.

**Step 1: Upload** - Users upload their `.kicad_sch` (required) and `.kicad_pcb` (optional, improves accuracy), enter a slug, and optionally select a category.

**Step 2: Generate** - The system shows "Analyzing KiCad files..." while parsing and calling the LLM.

**Step 3: Review** - The left panel shows extracted data:
- Validation status (green checkmark or amber warning)
- Board size and suggested grid
- Detected bus signals
- Component list
- Net list

The right panel has the generated JSON in an editor. Users can fix validation errors before saving.

## Validation Feedback

The generated JSON is validated against the Zod schema immediately:

```typescript
const validationResult = parseBlockJson(JSON.stringify(generatedBlock))

return {
  blockJson: generatedBlock,
  isValid: validationResult.success,
  validationErrors: validationResult.success ? [] : validationResult.errors,
}
```

Common LLM mistakes get caught:
- `edges.north` has wrong array length
- I2C addresses as hex strings instead of decimals
- Missing required fields
- Invalid bus signal names

The user sees specific errors: `"edges.north: Array must have exactly 2 elements"` and can fix them in the editor.

## The API Endpoint

```typescript
// POST /api/admin/blocks/generate
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const formData = await context.request.formData()

  const slug = formData.get('slug') as string
  const schematicFile = formData.get('schematic') as File
  const pcbFile = formData.get('pcb') as File | null

  // Parse KiCad files
  const schematicContent = await schematicFile.text()
  const pcbContent = pcbFile ? await pcbFile.text() : undefined
  const extract = parseKicadFiles(schematicContent, pcbContent)

  // Build LLM prompt and call
  const messages = buildBlockGenerationMessages(extract, slug)
  const llmResponse = await callLLM(env, messages)

  // Extract and validate JSON
  const jsonString = extractJsonFromResponse(llmResponse)
  const generatedBlock = JSON.parse(jsonString)
  const validationResult = parseBlockJson(JSON.stringify(generatedBlock))

  return Response.json({
    blockJson: generatedBlock,
    isValid: validationResult.success,
    validationErrors: validationResult.success ? [] : validationResult.errors,
    extract: { components, nets, boardSize, busSignals },
  })
}
```

## A CI Lesson

First deploy failed. The error:

```
Could not resolve "@/services/kicad-parser"
```

TypeScript passed. Vite build passed. But wrangler (which bundles the Cloudflare Functions separately) doesn't resolve `@/` path aliases.

The fix: files imported by functions code must use relative imports.

```typescript
// Before (broken in wrangler)
import { parseKicadFiles } from '@/services/kicad-parser'

// After (works everywhere)
import { parseKicadFiles } from '../services/kicad-parser'
```

We added this to CLAUDE.md as a pre-commit checklist item. `pnpm typecheck` isn't enough - you need `pnpm check` which includes the build step.

## Results

Creating a new block went from:
1. Open KiCad project
2. Manually transcribe 50+ component references
3. Identify which nets are bus signals
4. Figure out 0R resistor tap purposes
5. Calculate grid size
6. Write JSON by hand
7. Fix validation errors
8. Upload files

To:
1. Upload `.kicad_sch` and `.kicad_pcb`
2. Enter slug
3. Review generated JSON
4. Fix any LLM mistakes
5. Save

The LLM gets it ~80% right on the first try. The remaining 20% is usually edge array lengths or I2C address formatting - easy fixes in the editor.

## What the LLM Can't Do

Some things still need human judgment:

1. **Tap purposes**: The LLM sees a 0R resistor connecting U1.12 to BUS_3V3. It doesn't know *why* you'd want to isolate that. The generated "purpose" field is often generic.

2. **Power budgets**: The LLM can see that U1 is an ESP32, but doesn't know the actual current draw without a datasheet lookup.

3. **Jumper semantics**: Solder bridges and jumpers need human documentation of what they do.

4. **Physical properties**: Overhang, height, clearance - not extractable from KiCad files without 3D model analysis.

The wizard generates a solid starting point. Human expertise fills in the semantic gaps.

## The Commits

```
Add LLM-assisted block import from KiCad files

- src/services/kicad-parser.ts: Parse .kicad_sch/.kicad_pcb, extract
  components/nets, classify bus signals
- src/prompts/block-generation.ts: LLM prompt for generating block.json
- functions/api/admin/blocks/generate.ts: API endpoint for the flow
- src/components/admin/blocks/BlockImportWizard.tsx: 3-step wizard UI

Admin Blocks page now shows "Import from KiCad" as primary action.
```

```
Fix wrangler build: use relative imports for functions-imported files

Wrangler doesn't resolve @/ path aliases. Changed to relative imports
in files imported by functions code.
```

The full flow - from KiCad design to validated block in the database - now takes under a minute instead of an hour.

![The Result: ESP32-C6 Block Ready for Use](0034-images/2026-01-17%2019_53_49-3D%20Viewer.png)

And this is what you get - a fully documented block with formal bus interface definitions, power budgets, and component BOMs. Ready to be combined with other blocks in the PHAESTUS grid system.
