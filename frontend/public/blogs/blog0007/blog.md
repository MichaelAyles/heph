# Product Specification Pipeline: From Idea to Locked Spec

**Date:** 2025-12-31

---

## The Problem

The original flow jumped straight from "describe your hardware" to "here's your PCB layout". This caused problems:

- Users got designs for impossible projects (self-driving cars, medical devices)
- No feedback loop to refine requirements
- Power source, enclosure style, and other decisions were guessed
- No visual preview before committing to a design

## The Solution

A 5-step specification pipeline that narrows ideas down to manufacturable specs within system capabilities:

```
Text Input → Feasibility → Refinement → Blueprints → Selection → Locked Spec
```

---

## The Pipeline

### Step 1: Feasibility Analysis

LLM analyzes the user's description and scores confidence across categories:

- **Communication** - WiFi, BLE, Zigbee (ESP32-C6 capabilities)
- **Processing** - Is the ESP32 enough?
- **Power** - Battery options
- **Inputs/Outputs** - Sensors and actuators available

Hard rejections for:
- FPGA or processing beyond ESP32
- High voltage (>24V)
- Safety-critical systems (automotive, aerospace)
- Healthcare/medical devices (liability)

### Step 2: Iterative Refinement

Surfaces open questions until all decisions are locked:

- "What power source? LiPo with USB-C / 2xAA / CR2032"
- "Enclosure style? Compact handheld / Desktop / Wall-mounted"
- "Display needed? OLED / LCD / LEDs only"

Loops until complete.

### Step 3: Blueprint Generation

Generates 4 product renders in parallel:
- Minimal/clean design
- Rounded/friendly design
- Industrial/robust design
- Sleek/modern design

Uses the image model configured in `.dev.vars`.

### Step 4: User Selection

User picks their favorite design. This choice informs the final spec.

### Step 5: Final Specification

LLM generates comprehensive locked spec including:
- PCB dimensions
- Complete I/O list
- Power budget with battery life estimates
- Enclosure dimensions
- Bill of Materials with costs

Once locked, the spec cannot be edited.

---

## Implementation

### New Prompts

```
src/prompts/
├── feasibility.ts    # Categories, scores, rejection logic
├── refinement.ts     # Follow-up question generation
├── blueprint.ts      # Image prompt builder (4 variations)
└── finalSpec.ts      # Complete spec with BOM
```

Each prompt is a separate file for easy editing and version control.

### Updated Schema

```typescript
export type ProjectStatus =
  | 'draft'        // Just created
  | 'analyzing'    // Running feasibility
  | 'rejected'     // Failed feasibility
  | 'refining'     // User answering questions
  | 'generating'   // Creating blueprint images
  | 'selecting'    // User picking blueprint
  | 'finalizing'   // Generating final spec
  | 'complete'     // Spec locked

export interface ProjectSpec {
  description: string
  feasibility: FeasibilityAnalysis | null
  openQuestions: OpenQuestion[]
  decisions: Decision[]
  blueprints: Blueprint[]
  selectedBlueprint: number | null
  finalSpec: FinalSpec | null
}
```

### New Pages

**SpecPage.tsx** - Multi-step wizard with:
- Step indicator showing progress
- Streaming LLM output display
- Question/answer UI
- Image gallery with selection
- Final spec preview

**SpecViewerPage.tsx** - Read-only locked spec view with:
- Summary and blueprint image
- Dimensions, power, communication details
- BOM table with cost totals
- Decision history

---

## Files Changed

```
src/prompts/
├── feasibility.ts     # NEW
├── refinement.ts      # NEW
├── blueprint.ts       # NEW
└── finalSpec.ts       # NEW

src/pages/
├── SpecPage.tsx       # NEW - replaces ProjectPage
├── SpecViewerPage.tsx # NEW
└── NewProjectPage.tsx # Simplified

src/db/schema.ts       # Updated types
src/App.tsx            # Updated routes

DELETED:
└── src/pages/ProjectPage.tsx
```

---

## Example Flow

User enters: "Battery-powered plant moisture monitor with WiFi alerts"

**Feasibility Result:**
- Communication: WiFi ✓ (ESP32-C6 native)
- Processing: Low ✓ (sensor polling)
- Power: LiPo/AA/CR2032 options
- Inputs: Moisture sensor, temp/humidity
- Outputs: Status LED, optional display
- Score: 92%

**Refinement Questions:**
- Power source → User picks "LiPo with USB-C"
- Display needed → User picks "Yes, small OLED"
- Enclosure → User picks "Compact handheld"

**Blueprints:** 4 renders generated, user picks sleek design

**Final Spec:**
- PCB: 45×35mm
- Power: 3.7V LiPo, ~2 weeks battery life
- BOM: ~$18 estimated

**Result:** Locked spec ready for next phase (block selection, PCB generation)

---

## Next Steps

1. Wire up block selection using locked spec
2. Generate actual KiCad schematics
3. Create OpenSCAD enclosure from selected blueprint
4. Firmware scaffolding based on I/O spec
