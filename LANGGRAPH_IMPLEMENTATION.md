# LangGraph Implementation Plan

This document outlines the migration strategy for moving all 14 LLM calls to LangGraph as **standalone, independently-invocable nodes**. Each node appears in the debugger with full controls, but nodes are NOT chained together yet.

## Goals

1. **All LLM calls through LangGraph** - Every LLM interaction routes through a LangGraph node
2. **Debugger visibility** - All calls appear in `/admin/langgraph` with execution traces
3. **Standalone nodes** - Each node works independently (no automatic chaining)
4. **Same controls** - Temperature, model selection, prompt editing via admin UI

## Implementation Checklist

### Phase 1: Infrastructure
- [x] Create `src/services/langgraph/nodes/` directory
- [x] Define base node interface and registry in `nodes/registry.ts`
- [x] Create `langgraph_executions` D1 table (migration 0030)
- [x] Create `/api/langgraph/invoke/[nodeName].ts` endpoint
- [x] Create `/api/langgraph/nodes.ts` list endpoint
- [x] Create `/api/langgraph/executions.ts` history endpoint
- [ ] Add orchestrator_prompts entries for missing nodes

### Phase 2: Migrate Nodes (in order of complexity)
- [x] `admin_test` - Simplest, good for testing
- [x] `feasibility` - Text in, JSON out
- [x] `refinement` - Text in, JSON out
- [x] `finalization` - Text in, JSON out
- [x] `enclosure_text` - Text in, code out
- [x] `enclosure_validation` - Code in, JSON out
- [x] `enclosure_fix` - Code in, code out
- [x] `firmware_generate` - Text in, multi-file out
- [x] `firmware_modify` - Code + text in, multi-file out
- [x] `blueprint` - Text in, image out (different API)
- [x] `enclosure_vision` - Image + text in, code out (multimodal)
- [x] `enclosure_regenerate` - Code + text in, code out
- [x] `enclosure_visual_compare` - 2 images in, JSON out (multimodal)
- [ ] `export_bom` - TBD (not implemented, may not be needed)

### Phase 3: UI Integration
- [x] Update AdminLangGraphPage to show node registry (Nodes tab)
- [x] Add "Invoke Node" UI for manual testing
- [x] Show execution history per node
- [x] Display debug info (prompts, responses, timing)

### Phase 4: Component Migration
- [x] FeasibilityStep uses `/api/langgraph/invoke/feasibility`
- [x] RefinementStep uses `/api/langgraph/invoke/refinement`
- [x] BlueprintStep uses `/api/langgraph/invoke/blueprint`
- [x] FinalizationStep uses `/api/langgraph/invoke/finalization`
- [x] EnclosureStageView uses enclosure nodes
- [x] FirmwareStageView uses firmware nodes
- [x] AdminLLMsPage uses `/api/langgraph/invoke/admin_test`

## Current State Inventory

### All 14 LLM Call Sites

| # | Component | File:Line | Node Name | Type |
|---|-----------|-----------|-----------|------|
| 1 | FeasibilityStep | `spec-steps/FeasibilityStep.tsx:39` | `feasibility` | chat |
| 2 | RefinementStep | `spec-steps/RefinementStep.tsx:44` | `refinement` | chat |
| 3 | BlueprintStep | `spec-steps/BlueprintStep.tsx:56` | `blueprint` | image (x8) |
| 4 | FinalizationStep | `spec-steps/FinalizationStep.tsx:39` | `finalization` | chat |
| 5 | EnclosureStageView | `workspace/EnclosureStageView.tsx:191` | `enclosure_validation` | chat |
| 6 | EnclosureStageView | `workspace/EnclosureStageView.tsx:214` | `enclosure_fix` | chat |
| 7 | EnclosureStageView | `workspace/EnclosureStageView.tsx:271` | `enclosure_vision` | chat (multimodal) |
| 8 | EnclosureStageView | `workspace/EnclosureStageView.tsx:299` | `enclosure_text` | chat |
| 9 | EnclosureStageView | `workspace/EnclosureStageView.tsx:390` | `enclosure_regenerate` | chat |
| 10 | EnclosureStageView | `workspace/EnclosureStageView.tsx:488` | `enclosure_visual_compare` | chat (multimodal) |
| 11 | FirmwareStageView | `workspace/FirmwareStageView.tsx:217` | `firmware_generate` | chat |
| 12 | FirmwareStageView | `workspace/FirmwareStageView.tsx:276` | `firmware_modify` | chat |
| 13 | AdminLLMsPage | `AdminLLMsPage.tsx:134` | `admin_test` | chat |
| 14 | ManufacturingExportPanel | TBD | `export_bom` | chat (if exists) |

---

## Architecture: Standalone Nodes

### Key Principle: No Chaining Yet

Each LangGraph node is:
- **Independently invocable** via API
- **Self-contained** - receives all needed input, returns result
- **Debuggable** - full trace in admin UI
- **Configurable** - prompt/temp/model editable

```
┌─────────────────────────────────────────────────────────────┐
│                    LangGraph Node Registry                   │
├─────────────────────────────────────────────────────────────┤
│  feasibility          refinement           blueprint         │
│  finalization         enclosure_validation enclosure_fix     │
│  enclosure_vision     enclosure_text       enclosure_regen   │
│  enclosure_visual     firmware_generate    firmware_modify   │
│  admin_test           export_bom                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              POST /api/langgraph/invoke/:node               │
│                                                              │
│  Request:  { input: {...}, threadId?, config? }             │
│  Response: { output: {...}, debug: {...}, nodeId }          │
└─────────────────────────────────────────────────────────────┘
```

### Node Schema

Each node follows a standard interface:

```typescript
interface LangGraphNode {
  name: string                    // e.g., "feasibility"
  type: 'chat' | 'image'          // LLM call type
  multimodal: boolean             // Accepts images?

  // From orchestrator_prompts table
  systemPrompt: string
  temperature: number
  model?: string                  // Override default model

  // Input/output schemas (Zod)
  inputSchema: ZodSchema
  outputSchema: ZodSchema

  // The actual node function
  invoke: (input: Input, config: Config) => Promise<Output>
}
```

---

## Node Definitions

### 1. feasibility

**Purpose**: Analyze if a project can be built with available components

```typescript
// Input
interface FeasibilityInput {
  description: string           // User's project description
  availableBlocks?: string[]    // Optional: filter by available blocks
}

// Output
interface FeasibilityOutput {
  canBuild: boolean
  overallScore: number          // 0-100
  communication: { type: string; confidence: number; notes: string }
  processing: { level: string; confidence: number; notes: string }
  power: { options: string[]; confidence: number; notes: string }
  inputs: { items: string[]; confidence: number }
  outputs: { items: string[]; confidence: number }
  concerns: string[]
  suggestions: string[]
}
```

**Current**: `src/prompts/feasibility.ts` → `FEASIBILITY_SYSTEM_PROMPT`

---

### 2. refinement

**Purpose**: Generate clarifying questions based on feasibility analysis

```typescript
// Input
interface RefinementInput {
  description: string
  feasibility: FeasibilityOutput
  previousDecisions: Decision[]   // Already answered questions
  round: number                   // Current Q&A round (1-5)
}

// Output
interface RefinementOutput {
  questions: Array<{
    id: string
    question: string
    options: string[]
    category: string              // enclosure, power, features, etc.
  }>
  complete: boolean               // No more questions needed
  reasoning: string
}
```

**Current**: `src/prompts/refinement.ts` → `REFINEMENT_SYSTEM_PROMPT`

---

### 3. blueprint

**Purpose**: Generate product visualization images

```typescript
// Input
interface BlueprintInput {
  description: string
  decisions: Decision[]
  feasibility: FeasibilityOutput
  style: 'render' | 'photo'       // 3D render or product photo style
  variation: number               // 1-4
}

// Output
interface BlueprintOutput {
  imageUrl: string
  prompt: string                  // The prompt used
  style: string
}
```

**Current**: `src/prompts/blueprint.ts` → `buildBlueprintPrompts()`
**Note**: This is an image generation node, calls `/api/llm/image`

---

### 4. finalization

**Purpose**: Generate locked final specification with BOM

```typescript
// Input
interface FinalizationInput {
  description: string
  feasibility: FeasibilityOutput
  decisions: Decision[]
  selectedBlueprint: { url: string; prompt: string }
}

// Output
interface FinalizationOutput {
  name: string
  summary: string
  pcbSize: { width: number; height: number; unit: 'mm' }
  inputs: Array<{ type: string; count: number; notes: string }>
  outputs: Array<{ type: string; count: number; notes: string }>
  power: { source: string; voltage: string; current: string; batteryLife: string }
  communication: { type: string; protocol: string }
  enclosure: { style: string; width: number; height: number; depth: number }
  estimatedBOM: Array<{ item: string; quantity: number; unitCost: number }>
}
```

**Current**: `src/prompts/finalSpec.ts` → `FINAL_SPEC_SYSTEM_PROMPT`

---

### 5. enclosure_validation

**Purpose**: Validate OpenSCAD code for syntax and design constraints

```typescript
// Input
interface EnclosureValidationInput {
  openScadCode: string
  pcbDimensions: { width: number; height: number; thickness: number }
  requirements: string[]          // e.g., "must have USB port cutout"
}

// Output
interface EnclosureValidationOutput {
  valid: boolean
  issues: Array<{
    severity: 'critical' | 'warning'
    message: string
    line?: number
    suggestion: string
  }>
}
```

**Current**: `src/prompts/enclosure-validation.ts` → `OPENSCAD_VALIDATION_PROMPT`

---

### 6. enclosure_fix

**Purpose**: Auto-fix validation issues in OpenSCAD code

```typescript
// Input
interface EnclosureFixInput {
  openScadCode: string
  issues: EnclosureValidationOutput['issues']
  pcbDimensions: { width: number; height: number; thickness: number }
}

// Output
interface EnclosureFixOutput {
  fixedCode: string
  changesApplied: string[]
  remainingIssues: string[]
}
```

**Current**: `src/prompts/enclosure-validation.ts` → `buildFixPrompt()`

---

### 7. enclosure_vision

**Purpose**: Generate OpenSCAD from blueprint image (multimodal)

```typescript
// Input
interface EnclosureVisionInput {
  blueprintImage: string          // Base64 or URL
  pcbDimensions: { width: number; height: number; thickness: number }
  features: string[]              // Extracted features from spec
  style: string                   // e.g., "minimal", "industrial"
}

// Output
interface EnclosureVisionOutput {
  openScadCode: string
  designNotes: string
  estimatedDimensions: { width: number; height: number; depth: number }
}
```

**Current**: `src/prompts/enclosure.ts` → `ENCLOSURE_VISION_SYSTEM_PROMPT`
**Note**: Multimodal - accepts image input

---

### 8. enclosure_text

**Purpose**: Generate OpenSCAD from text description (fallback)

```typescript
// Input
interface EnclosureTextInput {
  description: string
  pcbDimensions: { width: number; height: number; thickness: number }
  features: string[]
  style: string
}

// Output
interface EnclosureTextOutput {
  openScadCode: string
  designNotes: string
  estimatedDimensions: { width: number; height: number; depth: number }
}
```

**Current**: `src/prompts/enclosure.ts` → `buildEnclosurePrompt()`

---

### 9. enclosure_regenerate

**Purpose**: Regenerate OpenSCAD based on user feedback

```typescript
// Input
interface EnclosureRegenerateInput {
  currentCode: string
  feedback: string                // User's change request
  pcbDimensions: { width: number; height: number; thickness: number }
  previousIterations: number
}

// Output
interface EnclosureRegenerateOutput {
  openScadCode: string
  changesApplied: string[]
  designNotes: string
}
```

**Current**: `src/prompts/enclosure.ts` → `buildEnclosureRegenerationPrompt()`

---

### 10. enclosure_visual_compare

**Purpose**: Compare blueprint to rendered STL (multimodal)

```typescript
// Input
interface EnclosureVisualCompareInput {
  blueprintImage: string          // Base64 or URL
  stlScreenshot: string           // Base64 or URL
  designIntent: string            // What it should look like
}

// Output
interface EnclosureVisualCompareOutput {
  matchScore: number              // 0-100
  discrepancies: string[]
  suggestions: string[]
  approved: boolean
}
```

**Current**: Inline `VISUAL_COMPARISON_PROMPT`
**Note**: Multimodal - accepts two images

---

### 11. firmware_generate

**Purpose**: Generate ESP32-C6 firmware code

```typescript
// Input
interface FirmwareGenerateInput {
  projectName: string
  description: string
  finalSpec: FinalizationOutput
  selectedBlocks: string[]        // Block slugs used in PCB
  i2cAddresses: Record<string, number>
}

// Output
interface FirmwareGenerateOutput {
  files: Array<{
    path: string
    content: string
    type: 'cpp' | 'h' | 'ini' | 'json'
  }>
  dependencies: string[]
  notes: string
}
```

**Current**: `src/prompts/firmware.ts` → `FIRMWARE_SYSTEM_PROMPT`

---

### 12. firmware_modify

**Purpose**: Modify firmware based on chat input

```typescript
// Input
interface FirmwareModifyInput {
  currentFiles: FirmwareGenerateOutput['files']
  request: string                 // User's modification request
  context: string                 // Project context
}

// Output
interface FirmwareModifyOutput {
  files: Array<{
    path: string
    content: string
    type: 'cpp' | 'h' | 'ini' | 'json'
  }>
  changesApplied: string[]
  notes: string
}
```

**Current**: `src/prompts/firmware.ts` → `buildFirmwareModificationPrompt()`

---

### 13. admin_test

**Purpose**: Test LLM connectivity (admin utility)

```typescript
// Input
interface AdminTestInput {
  prompt?: string                 // Default: "Say exactly 'Hello World'"
  model?: string                  // Test specific model
}

// Output
interface AdminTestOutput {
  response: string
  model: string
  latencyMs: number
  tokensUsed: number
}
```

**Current**: Inline test prompt in AdminLLMsPage

---

### 14. export_bom (TBD)

**Purpose**: Generate/enhance BOM for manufacturing

```typescript
// Input
interface ExportBomInput {
  blocks: string[]
  quantities: Record<string, number>
  format: 'standard' | 'lcsc'
}

// Output
interface ExportBomOutput {
  bom: Array<{
    item: string
    quantity: number
    mpn?: string
    lcscPart?: string
    unitCost?: number
  }>
}
```

---

## API Design

### Invoke Node

```
POST /api/langgraph/invoke/:nodeName
```

**Request**:
```typescript
{
  input: NodeInput,               // Node-specific input
  threadId?: string,              // For checkpointing (optional)
  config?: {
    temperature?: number,         // Override default
    model?: string,               // Override default
    maxTokens?: number
  }
}
```

**Response**:
```typescript
{
  output: NodeOutput,             // Node-specific output
  nodeId: string,                 // Execution ID
  debug: {
    nodeName: string,
    startTime: string,
    endTime: string,
    durationMs: number,
    promptTokens: number,
    completionTokens: number,
    model: string,
    temperature: number,
    systemPrompt: string,         // The prompt used
    userPrompt: string,           // The user message
    rawResponse: string           // Raw LLM response
  }
}
```

### List Available Nodes

```
GET /api/langgraph/nodes
```

**Response**:
```typescript
{
  nodes: Array<{
    name: string,
    type: 'chat' | 'image',
    multimodal: boolean,
    description: string,
    inputSchema: JSONSchema,
    outputSchema: JSONSchema
  }>
}
```

### Get Node Execution History

```
GET /api/langgraph/history/:nodeName?limit=50
```

**Response**:
```typescript
{
  executions: Array<{
    nodeId: string,
    threadId?: string,
    timestamp: string,
    durationMs: number,
    success: boolean,
    input: object,
    output: object
  }>
}
```

---

## Implementation Order

### Step 1: Infrastructure

1. Create `src/services/langgraph/nodes/` directory structure
2. Define base node interface and registry
3. Create `/api/langgraph/invoke/:nodeName` endpoint
4. Add debug logging to D1 `langgraph_executions` table

### Step 2: Migrate Nodes (One at a Time)

For each node:
1. Create node file in `src/services/langgraph/nodes/{name}.ts`
2. Define input/output Zod schemas
3. Implement invoke function with LLM call
4. Add to node registry
5. Update UI component to use new API
6. Test in debugger

**Recommended order** (simplest → most complex):
1. `admin_test` - Simplest, good for testing infrastructure
2. `feasibility` - Text in, JSON out
3. `refinement` - Text in, JSON out
4. `finalization` - Text in, JSON out
5. `enclosure_text` - Text in, code out
6. `enclosure_validation` - Code in, JSON out
7. `enclosure_fix` - Code in, code out
8. `firmware_generate` - Text in, multi-file out
9. `firmware_modify` - Code + text in, multi-file out
10. `blueprint` - Text in, image out (different API)
11. `enclosure_vision` - Image + text in, code out (multimodal)
12. `enclosure_regenerate` - Code + text in, code out
13. `enclosure_visual_compare` - 2 images in, JSON out (multimodal)
14. `export_bom` - TBD

### Step 3: Debugger Integration

1. Update `/admin/langgraph` to show node registry
2. Add "Invoke Node" UI for manual testing
3. Show execution history per node
4. Display debug info (prompts, responses, timing)

---

## Database Changes

### New Table: `langgraph_executions`

```sql
CREATE TABLE langgraph_executions (
  id TEXT PRIMARY KEY,
  node_name TEXT NOT NULL,
  thread_id TEXT,
  project_id TEXT,
  user_id TEXT,

  -- Timing
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,

  -- Input/Output
  input_json TEXT NOT NULL,
  output_json TEXT,
  error TEXT,

  -- Debug
  model TEXT,
  temperature REAL,
  system_prompt TEXT,
  user_prompt TEXT,
  raw_response TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost_usd REAL,

  -- Indexes
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_executions_node ON langgraph_executions(node_name);
CREATE INDEX idx_executions_thread ON langgraph_executions(thread_id);
CREATE INDEX idx_executions_time ON langgraph_executions(started_at DESC);
```

### Update: `orchestrator_prompts`

Add entries for all 14 nodes (some already exist):

| node_name | category | stage | exists? |
|-----------|----------|-------|---------|
| feasibility | agent | spec | yes |
| refinement | generator | spec | no |
| blueprint | generator | spec | no |
| finalization | generator | spec | no |
| enclosure_validation | validator | enclosure | no |
| enclosure_fix | generator | enclosure | no |
| enclosure_vision | generator | enclosure | yes |
| enclosure_text | generator | enclosure | yes (as enclosure) |
| enclosure_regenerate | generator | enclosure | no |
| enclosure_visual_compare | validator | enclosure | no |
| firmware_generate | generator | firmware | yes (as firmware) |
| firmware_modify | generator | firmware | no |
| admin_test | utility | admin | no |
| export_bom | generator | export | no |

---

## Success Criteria

1. All 14 LLM calls route through `/api/langgraph/invoke/:nodeName`
2. Every execution logged to `langgraph_executions` table
3. Admin can view all executions in `/admin/langgraph`
4. Admin can manually invoke any node with custom input
5. Admin can edit prompts/temperature per node
6. No regression in user-facing functionality
7. Each node works independently (no dependencies on other nodes)

---

## Future: Chaining Nodes

Once all nodes work independently, we can add:
- Conditional edges between nodes
- Automatic pipeline execution
- Checkpoint/resume across nodes
- Parallel node execution (e.g., 8 blueprint images)

But that's Phase 2. First, get each node working standalone.
