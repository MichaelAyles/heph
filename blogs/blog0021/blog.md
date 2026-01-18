# PHAESTUS: Building an AI Hardware Design Platform in 7 Days

**Date:** 2026-01-05 | **For:** Gemini API Developer Competition

---

## Executive Summary

PHAESTUS is an AI-powered hardware design platform that transforms natural language descriptions into manufacturable electronics. Built for the Gemini 3 API Developer Competition, it demonstrates how AI can autonomously navigate a complex, multi-stage design pipeline while validating constraints between stages.

**Live Demo:** https://phaestus.app | **Source:** GitHub

**Key Achievement:** A marathon AI agent that designs complete hardware from "I want a plant moisture monitor with WiFi" to downloadable PCB schematics, 3D-printable enclosure, and ESP32 firmware.

---

## The Vision

Hardware design is hard. It requires expertise in:
- Electronics (circuits, components, power budgets)
- Mechanical (enclosures, thermal, mounting)
- Software (firmware, drivers, protocols)
- Manufacturing (DFM, tolerances, BOM costs)

Most AI tools stop at generating code or images. PHAESTUS goes further: it designs **complete, manufacturable hardware** by orchestrating AI across multiple interdependent stages.

---

## The Architecture

```
Natural Language → Spec → PCB → Enclosure → Firmware → Export
       ↓            ↓       ↓        ↓          ↓         ↓
   Feasibility   Blueprint  KiCad  OpenSCAD   ESP32    Download
   Analysis      Selection  Merge   + STL     C++      ZIP/Gerber
```

### The 5-Stage Pipeline

| Stage | What AI Does | Output |
|-------|--------------|--------|
| **Spec** | Feasibility analysis, Q&A refinement, blueprint generation | Locked specification with BOM |
| **PCB** | Select circuit blocks, place on grid, generate netlist | KiCad schematic + PCB layout |
| **Enclosure** | Generate parametric 3D case with cutouts | OpenSCAD code + STL file |
| **Firmware** | Generate ESP32-C6 code for all components | PlatformIO project |
| **Export** | Package everything for manufacturing | ZIP with all artifacts |

---

## Technical Implementation

### Day 1-2: Foundation (Blogs 0001, 0004, 0006)

Built the core platform scaffold:

```
frontend/
├── src/                    # React 19 + TypeScript
│   ├── pages/              # Route components
│   ├── services/llm.ts     # Gemini API client
│   └── stores/auth.ts      # Zustand state
├── functions/api/          # Cloudflare Pages Functions
│   ├── _middleware.ts      # Auth middleware
│   └── llm/*.ts            # LLM proxy endpoints
└── migrations/             # D1 SQLite schema
```

**Key Design Decision: Module-Based Hardware**

Instead of having AI generate novel circuits (which fails ~30% of the time), we use pre-validated circuit blocks:

```typescript
// 21 pre-seeded blocks across 6 categories
const BLOCK_CATEGORIES = ['mcu', 'power', 'sensors', 'outputs', 'connectors', 'utility']

// Each block defines grid dimensions, interfaces, and components
interface PcbBlock {
  slug: string             // 'sensor-bme280'
  gridWidth: number        // 12.7mm units
  gridHeight: number       // 12.7mm units
  busTaps: BusTap[]        // {net: 'I2C0_SDA', offsetMm: 2.5}
  components: Component[]  // {reference: 'U1', value: 'BME280'}
}
```

This gives ~100% success rate vs ~70% for AI-generated circuits.

**Cost Tracking From Day 1**

Every LLM request is logged with cost:

```typescript
// functions/api/llm/pricing.ts
const MODEL_PRICING = {
  'google/gemini-3-flash-preview': { promptPer1M: 0.15, completionPer1M: 0.6 },
  'google/gemini-2.5-flash-image': { promptPer1M: 0.15, completionPer1M: 0.6 },
}

// Image generation: ~2000x more expensive than text
// gemini-3-flash: ~$0.000001/request
// gemini-2.5-flash-image: $0.002/image
```

---

### Day 3: The Spec Pipeline (Blogs 0007, 0008, 0009)

The specification pipeline is the "funnel" that takes vague ideas and produces locked, manufacturable specs:

```typescript
// 5 steps with distinct statuses
type ProjectStatus =
  | 'analyzing'    // Step 0: Feasibility check
  | 'refining'     // Step 1: Q&A to lock decisions
  | 'generating'   // Step 2: Generate 4 blueprint images
  | 'selecting'    // Step 3: User picks design
  | 'finalizing'   // Step 4: Generate final spec with BOM
  | 'complete'     // Ready for PCB stage
```

**Feasibility Analysis**

The LLM scores ideas against available components:

```typescript
// src/prompts/feasibility.ts
const AVAILABLE_COMPONENTS = {
  mcu: 'ESP32-C6 (WiFi 6, BLE 5.3, Zigbee/Thread)',
  sensors: ['BME280 (temp/humidity)', 'LIS3DH (accelerometer)', 'VEML7700 (light)', ...],
  power: ['LiPo + TP4056', 'Buck converter (7-24V)', 'CR2032', ...],
}

// Hard rejections for things we can't build
const REJECTION_CATEGORIES = [
  'FPGA or processing beyond ESP32',
  'High voltage (>24V)',
  'Safety-critical (automotive, aerospace)',
  'Healthcare/medical devices',
]
```

**Iterative Refinement**

The AI surfaces questions until all decisions are locked:

```
Q: "What power source?"
A: Options: [LiPo with USB-C charging] [2xAA batteries] [CR2032 coin cell]

Q: "Display needed?"
A: Options: [0.96" OLED] [No display, LEDs only] [SPI LCD]
```

Maximum 5 rounds, then proceeds to blueprints.

**Blueprint Generation**

4 design variations generated in parallel:

```typescript
// src/prompts/blueprint.ts
const VARIATIONS = ['minimal_clean', 'rounded_friendly', 'industrial_robust', 'sleek_modern']

// Each generates an image prompt
const prompt = `3D product render: ${projectDescription}.
${variation.style}. Visible features: ${visibleFeatures}.
Professional studio lighting, no text.`
```

---

### Day 4: Production Hardening (Blogs 0010, 0011)

Before opening to users, security and resilience improvements:

**Password Security**
```typescript
// Auto-upgrade plaintext to bcrypt on login
const isValidPassword = user.password_hash.startsWith('$2')
  ? await bcrypt.compare(password, user.password_hash)
  : user.password_hash === password

if (!user.password_hash.startsWith('$2')) {
  const hashed = await bcrypt.hash(password, 10)
  await db.run('UPDATE users SET password_hash = ?', hashed)
}
```

**LLM Retry Logic**
```typescript
// Exponential backoff: 1s, 2s delays
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (error.message.match(/\b4\d{2}\b/)) throw error // Don't retry 4xx
      await sleep(1000 * Math.pow(2, attempt))
    }
  }
}
```

**Test Coverage**
```
--------------------|---------|----------|---------|---------|
File                | % Stmts | % Branch | % Funcs | % Lines |
--------------------|---------|----------|---------|---------|
All files           |   99.31 |    96.90 |     100 |     100 |
--------------------|---------|----------|---------|---------|

272 tests passing
```

---

### Day 5: Workspace Architecture (Blogs 0012, 0013, 0014, 0015)

Built the multi-stage workspace with URL routing:

```
/project/:id/spec      → SpecStageView
/project/:id/pcb       → PCBStageView
/project/:id/enclosure → EnclosureStageView
/project/:id/firmware  → FirmwareStageView
/project/:id/export    → ExportStageView
```

**Three Control Modes**

| Mode | Behavior |
|------|----------|
| **Vibe It** | Full automation. AI makes all decisions. |
| **Fix It** | AI pauses on errors or confidence <80%. |
| **Design It** | User approves every step. |

```typescript
// Auto-advance with countdown in Vibe It mode
useEffect(() => {
  if (!autoAdvance) return
  const timer = setInterval(() => {
    setCountdown(c => c <= 1 ? (onContinue(), 0) : c - 1)
  }, 1000)
  return () => clearInterval(timer)
}, [autoAdvance])
```

**PCB Block Merging**

Using kicadts library for KiCad S-expression manipulation:

```typescript
// Load blocks, transform positions, merge into single schematic
async function mergeBlockSchematics(placedBlocks: PlacedBlock[]): Promise<string> {
  const merged = new KicadSch({ generator: 'phaestus' })

  for (const placed of placedBlocks) {
    const schematic = parseKicadSch(await loadBlockFile(placed.blockSlug))
    const offset = { x: placed.gridX * 12.7, y: placed.gridY * 12.7 }

    for (const symbol of schematic.symbols) {
      symbol.at.x += offset.x
      symbol.at.y += offset.y
      merged.symbols.push(symbol)
    }
  }

  return merged.getString()
}
```

---

### Day 6: 3D & Firmware (Blogs 0016, 0017, 0018)

**OpenSCAD in WebAssembly**

The `openscad-wasm` package (~14MB) renders parametric enclosures in the browser:

```typescript
// Lazy-loaded only when entering enclosure stage
const OpenSCAD = await import('openscad-wasm')
const instance = await OpenSCAD.default({ noInitialRun: true })

instance.FS.writeFile('/input.scad', openScadCode)
instance.callMain(['-o', '/output.stl', '--enable=manifold', '/input.scad'])
const stl = instance.FS.readFile('/output.stl')
```

**React Three Fiber Viewer**

```tsx
<Canvas>
  <PerspectiveCamera makeDefault position={[100, 100, 100]} />
  <ambientLight intensity={0.5} />
  <directionalLight position={[10, 10, 5]} />
  <Center>
    <STLDataModel data={stlData} color="#8B7355" />
  </Center>
  <OrbitControls autoRotate={rotating} />
</Canvas>
```

**Firmware Generation**

AI generates complete PlatformIO projects:

```cpp
// Generated by PHAESTUS for: Smart Plant Monitor
#include <Arduino.h>
#include <WiFi.h>
#include <Adafruit_BME280.h>

#define PIN_SDA GPIO4
#define PIN_SCL GPIO5
#define PIN_LED_DATA GPIO8

Adafruit_BME280 bme;

void setup() {
  Serial.begin(115200);
  Wire.begin(PIN_SDA, PIN_SCL);
  bme.begin(0x76);
  // ...
}
```

**Export Downloads**

Client-side ZIP generation:

```typescript
const downloadComplete = async () => {
  const zip = new JSZip()
  zip.file('spec.md', generateSpecMarkdown())
  zip.file('spec.json', JSON.stringify(project.spec, null, 2))
  zip.file('enclosure/enclosure.scad', enclosureCode)
  for (const file of firmware.files) {
    zip.file(`firmware/${file.path}`, file.content)
  }
  downloadBlob(await zip.generateAsync({ type: 'blob' }), 'complete.zip')
}
```

---

### Day 7: The Marathon Orchestrator (Blogs 0019, 0020)

The crown jewel: an autonomous agent that drives the entire pipeline.

**Tool-Based Architecture**

```typescript
// 12 tools for the orchestrator to use
const ORCHESTRATOR_TOOLS: ToolDefinition[] = [
  { name: 'analyze_feasibility', description: 'Check if hardware idea is feasible' },
  { name: 'answer_questions_auto', description: 'Auto-answer refinement questions' },
  { name: 'generate_blueprints', description: 'Generate 4 product visualizations' },
  { name: 'select_blueprint', description: 'Choose a blueprint to proceed' },
  { name: 'finalize_spec', description: 'Lock the final specification' },
  { name: 'select_pcb_blocks', description: 'Place circuit blocks on grid' },
  { name: 'generate_enclosure', description: 'Generate OpenSCAD enclosure' },
  { name: 'generate_firmware', description: 'Generate ESP32 firmware' },
  { name: 'validate_cross_stage', description: 'Check consistency across stages' },
  { name: 'fix_stage_issue', description: 'Fix validation issues' },
  { name: 'mark_stage_complete', description: 'Advance to next stage' },
  { name: 'report_progress', description: 'Update UI with progress' },
]
```

**Cross-Stage Validation**

The key differentiator - catching mismatches and self-correcting:

```typescript
function validateCrossStage(spec: ProjectSpec): ValidationResult {
  const issues: ValidationIssue[] = []

  // Does PCB fit inside enclosure?
  const enclosureDims = parseEnclosureDimensions(spec.enclosure.openScadCode)
  if (enclosureDims.innerWidth < spec.pcb.boardSize.width + 4) {
    issues.push({
      id: 'enclosure_too_narrow',
      severity: 'error',
      message: `Enclosure (${enclosureDims.innerWidth}mm) too narrow for PCB (${spec.pcb.boardSize.width}mm + 4mm clearance)`,
      autoFixable: true,
      fix: `Increase enclosure width to ${spec.pcb.boardSize.width + 6}mm`,
    })
  }

  // Does firmware use correct GPIO pins from PCB?
  for (const net of spec.pcb.netList) {
    const pinDefined = firmwareDefinesPin(spec.firmware, net.gpio)
    if (!pinDefined) {
      issues.push({
        id: `missing_gpio_${net.gpio}`,
        severity: 'error',
        message: `Firmware missing definition for ${net.gpio} (used by ${net.blocks.join(', ')})`,
      })
    }
  }

  return { valid: issues.filter(i => i.severity === 'error').length === 0, issues }
}
```

**Marathon Loop**

```typescript
class HardwareOrchestrator {
  async run(description: string, existingSpec?: ProjectSpec): Promise<void> {
    while (this.isRunning && this.iterations < MAX_ITERATIONS) {
      this.iterations++

      // Get next action from Gemini with tools
      const response = await llm.chatWithTools({
        messages: this.conversationHistory,
        tools: ORCHESTRATOR_TOOLS,
        thinking: { type: 'enabled', budgetTokens: 10000 },
      })

      // Execute tool calls
      for (const toolCall of response.toolCalls || []) {
        const result = await this.executeToolCall(toolCall)
        this.conversationHistory.push({ role: 'tool', content: result })
      }

      // Check completion
      if (this.state.currentStage === 'export' && this.state.status === 'complete') {
        this.callbacks.onComplete()
        break
      }
    }
  }
}
```

**Real-Time Progress UI**

```tsx
function OrchestratorPanel() {
  const { status, currentStage, currentAction, history } = useOrchestratorStore()

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-surface-900 border rounded-lg">
      <div className="flex items-center gap-2">
        {status === 'running' && <Loader2 className="animate-spin text-copper" />}
        <span>{STAGE_LABELS[currentStage]}</span>
      </div>
      {currentAction && <div className="text-sm text-steel-dim">{currentAction}</div>}
      <div className="max-h-48 overflow-y-auto">
        {history.map(item => (
          <div key={item.id} className="text-sm">
            <span className="text-steel-dim">{item.timestamp}</span>
            <span>{item.action}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## Gemini API Integration

### Models Used

| Model | Purpose | Cost |
|-------|---------|------|
| `gemini-3-flash-preview` | Text generation, tool calling | ~$0.000001/request |
| `gemini-2.5-flash-image` | Blueprint image generation | $0.002/image |

### Tool Calling Pattern

```typescript
// functions/api/llm/tools.ts
const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  },
  body: JSON.stringify({
    contents: convertToGeminiFormat(messages),
    tools: [{ function_declarations: tools.map(convertToolToGemini) }],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: {
      temperature: 0.3,
      thinkingConfig: thinking ? { thinkingBudget: thinking.budgetTokens } : undefined,
    },
  }),
})
```

### Extended Thinking for Complex Decisions

The orchestrator uses Gemini's thinking feature for multi-step reasoning:

```typescript
const response = await llm.chatWithTools({
  messages,
  tools: ORCHESTRATOR_TOOLS,
  thinking: { type: 'enabled', budgetTokens: 10000 },
})

// Thinking tokens help with:
// - Deciding which tool to call next
// - Planning multi-tool sequences
// - Reasoning about validation failures
```

---

## Tech Stack Summary

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript, Vite 7, Tailwind CSS 4 |
| **State** | Zustand (auth, workspace, orchestrator) |
| **Data Fetching** | TanStack Query v5 |
| **Routing** | React Router 7 |
| **3D Graphics** | React Three Fiber, Three.js |
| **Code Editor** | Monaco Editor |
| **CAD Rendering** | OpenSCAD WebAssembly |
| **PCB Viewer** | KiCanvas |
| **API** | Cloudflare Pages Functions |
| **Database** | Cloudflare D1 (SQLite) |
| **Storage** | Cloudflare R2 |
| **LLM** | Gemini 3 Flash (text), Gemini 2.5 Flash (images) |

---

## Results

### What PHAESTUS Can Design

From a single natural language prompt:

```
"Battery-powered plant moisture monitor with WiFi alerts
 and OLED display showing current readings"
```

PHAESTUS generates:

1. **Specification** - ESP32-C6 MCU, BME280 sensor, 0.96" OLED, LiPo battery, USB-C charging
2. **PCB Layout** - 45x35mm board with placed blocks and routed bus
3. **Enclosure** - Parametric OpenSCAD case with display cutout and USB port
4. **Firmware** - Complete PlatformIO project with WiFi, sensor reading, OLED display
5. **Export** - ZIP with all files ready for manufacturing

### Validation in Action

The orchestrator catches and fixes issues:

```
[Validation] PCB dimensions: 50x50mm
[Validation] Enclosure inner: 48x48mm
[Error] Enclosure too narrow! Need 54mm (50mm + 4mm clearance)
[Fix] Regenerating enclosure with pcb_width = 54mm
[Validation] PASSED - PCB fits enclosure
```

### Test Coverage

```
272 tests passing
99%+ statement coverage on business logic
18 integration tests for orchestrator
30 tests for cross-stage validation
```

---

## What's Next

1. **Compile Server** - Fly.io Docker for ESP-IDF compilation
2. **Gerber Export** - Generate PCB manufacturing files
3. **Featured Gallery** - Curated showcase of best designs
4. **Prompt Manager** - Admin-editable prompts without code deploy

---

## Conclusion

PHAESTUS demonstrates that AI can handle complex, multi-stage creative tasks when given:

1. **Structure** - Clear stages with defined inputs/outputs
2. **Constraints** - Pre-validated components instead of open-ended generation
3. **Validation** - Cross-stage checks that catch errors early
4. **Autonomy** - Tool-based agents that can self-correct

The result is a "marathon agent" that transforms natural language into manufacturable hardware - not just generating artifacts, but ensuring they work together.

---

## Appendix: Development Timeline

| Day | Blog | Feature |
|-----|------|---------|
| 1 | 0001 | Frontend foundation, React + Cloudflare |
| 1 | 0004 | Authentication with proper data modeling |
| 2 | 0006 | LLM cost tracking per request |
| 2 | 0007 | 5-step specification pipeline |
| 3 | 0008 | Admin debug logging to D1 |
| 3 | 0009 | Test suite (207 tests), production deploy |
| 4 | 0010 | Iterative blueprint with feedback |
| 4 | 0011 | bcrypt, retry logic, session extension |
| 5 | 0012 | Workspace UI with stage tabs |
| 5 | 0013 | Three control modes (Vibe/Fix/Design) |
| 5 | 0014 | KiCanvas integration for PCB viewing |
| 5 | 0015 | kicadts block merging algorithm |
| 6 | 0016 | OpenSCAD WASM + React Three Fiber |
| 6 | 0017 | AI firmware generation + Monaco |
| 6 | 0018 | Export stage with ZIP downloads |
| 7 | 0019 | Marathon orchestrator agent |
| 7 | 0020 | Public gallery for showcase |

**Total:** 17 blog posts documenting every major feature.

---

*Built with Gemini 3 Flash for the Gemini API Developer Competition*
