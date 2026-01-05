# The PHAESTUS Orchestrator: Marathon AI for Hardware Design

**Date:** 2026-01-05

---

## The Goal

Implement an autonomous "marathon agent" orchestrator that drives hardware design from natural language description through to manufacturable output, with minimal user intervention in "Vibe It" mode.

---

## The Problem

Hardware design pipelines have multiple interdependent stages:

1. **Spec** - Analyze feasibility, refine requirements, generate blueprints
2. **PCB** - Select circuit blocks, place on grid, generate schematic
3. **Enclosure** - Generate parametric 3D case with cutouts
4. **Firmware** - Generate ESP32-C6 code for all components
5. **Export** - Package everything for manufacturing

Each stage's output affects downstream stages. A bad PCB layout breaks enclosure fit. Wrong GPIO assignments break firmware. Previously, users had to manually orchestrate this flow.

---

## The Solution

### Marathon Agent Pattern

The orchestrator runs autonomously across all stages, making decisions and self-correcting when validation fails:

```typescript
// src/services/orchestrator.ts
export class HardwareOrchestrator {
  async run(description: string, existingSpec?: ProjectSpec): Promise<void> {
    while (this.isRunning) {
      // Run one iteration
      const response = await llm.chatWithTools({
        messages: this.conversationHistory,
        tools: ORCHESTRATOR_TOOLS,
        thinking: { type: 'enabled', budgetTokens: 10000 },
      })

      // Execute tool calls
      for (const toolCall of response.toolCalls || []) {
        await this.executeToolCall(toolCall)
      }

      // Check for completion
      if (this.state.currentStage === 'export' &&
          this.state.status === 'complete') {
        break
      }
    }
  }
}
```

### Tool-Based Architecture

The orchestrator has 12 tools to perform actions:

```typescript
// src/prompts/orchestrator.ts
export const ORCHESTRATOR_TOOLS: ToolDefinition[] = [
  { name: 'analyze_feasibility', description: 'Check if hardware idea is feasible...' },
  { name: 'answer_questions_auto', description: 'Auto-answer questions in Vibe It mode...' },
  { name: 'generate_blueprints', description: 'Generate 4 product visualizations...' },
  { name: 'select_blueprint', description: 'Choose a blueprint to proceed with...' },
  { name: 'finalize_spec', description: 'Lock the final specification...' },
  { name: 'select_pcb_blocks', description: 'Place circuit blocks on PCB grid...' },
  { name: 'generate_enclosure', description: 'Generate OpenSCAD enclosure code...' },
  { name: 'generate_firmware', description: 'Generate ESP32-C6 firmware...' },
  { name: 'validate_cross_stage', description: 'Validate consistency across stages...' },
  { name: 'fix_stage_issue', description: 'Fix validation issues...' },
  { name: 'mark_stage_complete', description: 'Advance to next stage...' },
  { name: 'report_progress', description: 'Update UI with progress...' },
]
```

### Cross-Stage Validation

The key differentiator - catching mismatches between stages and self-correcting:

```typescript
// src/prompts/validation.ts
export function validateCrossStage(
  spec: ProjectSpec,
  checkType: ValidationCheckType
): ValidationResult {
  const issues: ValidationIssue[] = []

  // Check PCB fits inside enclosure
  if (checkType === 'all' || checkType === 'pcb_fits_enclosure') {
    const pcbEnclosureResults = validatePcbFitsEnclosure(spec.pcb, spec.enclosure)
    issues.push(...pcbEnclosureResults.issues)
  }

  // Check firmware uses correct GPIO pins from PCB
  if (checkType === 'all' || checkType === 'firmware_matches_pcb') {
    const firmwarePcbResults = validateFirmwareMatchesPcb(spec.pcb, spec.firmware)
    issues.push(...firmwarePcbResults.issues)
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues,
    suggestions,
  }
}
```

Example validation: Enclosure dimensions vs PCB:

```typescript
function validatePcbFitsEnclosure(pcb, enclosure): ValidationResult {
  const enclosureDims = parseEnclosureDimensions(enclosure.openScadCode)
  const CLEARANCE_MM = 2

  if (enclosureDims.innerWidth < pcb.boardSize.width + CLEARANCE_MM * 2) {
    issues.push({
      id: 'enclosure_too_narrow',
      severity: 'error',
      stage: 'enclosure',
      message: `Enclosure too narrow for PCB`,
      details: `Inner width ${enclosureDims.innerWidth}mm < PCB ${pcb.boardSize.width}mm + clearance`,
    })
    suggestions.push({
      issueId: 'enclosure_too_narrow',
      stage: 'enclosure',
      action: `Increase width to ${pcb.boardSize.width + CLEARANCE_MM * 2 + 2}mm`,
      autoFixable: true,
    })
  }
}
```

### Three Control Modes

```typescript
// User preferences control orchestrator behavior
type OrchestratorMode = 'vibe_it' | 'fix_it' | 'design_it'

// VIBE IT: Fully autonomous
// "Make all decisions using sensible defaults. Do not ask for user input."

// FIX IT: Semi-autonomous
// "Handle technical details automatically. Ask for major decisions."

// DESIGN IT: User controls
// "Guide user through each decision. Wait for input before proceeding."
```

### Zustand Store for Reactive UI

```typescript
// src/stores/orchestrator.ts
export const useOrchestratorStore = create<OrchestratorStoreState>((set, get) => ({
  orchestrator: null,
  status: 'idle',
  mode: 'vibe_it',
  currentStage: 'spec',
  currentAction: null,
  history: [],
  error: null,
  iterationCount: 0,

  startOrchestrator: (projectId, mode, description, existingSpec, blocks, onSpecUpdate) => {
    const callbacks: OrchestratorCallbacks = {
      onStateChange: (state) => set({ ...state }),
      onSpecUpdate: async (spec) => onSpecUpdate?.(spec),
      onComplete: () => set({ status: 'complete' }),
      onError: (error) => set({ status: 'error', error: error.message }),
    }

    const orchestrator = createOrchestrator(projectId, mode, callbacks)
    set({ orchestrator, mode, status: 'running' })
    orchestrator.run(description, existingSpec, blocks)
  },
}))
```

### Real-Time Progress Panel

```tsx
// src/components/workspace/OrchestratorPanel.tsx
export function OrchestratorPanel() {
  const { status, currentStage, currentAction, history } = useOrchestratorStore()

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-surface-900 border rounded-lg">
      {/* Status header */}
      <div className="flex items-center gap-2">
        {status === 'running' && <Loader2 className="animate-spin text-copper" />}
        <span>{STAGE_LABELS[currentStage]}</span>
      </div>

      {/* Current action */}
      {currentAction && (
        <div className="text-sm text-steel-dim">{currentAction}</div>
      )}

      {/* Activity history */}
      <div className="max-h-48 overflow-y-auto">
        {history.map((item) => (
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

### Auto-Trigger in Stage Views

When in Vibe It mode, the orchestrator can be started from any stage:

```tsx
// src/pages/workspace/SpecStageView.tsx
{currentStep === 0 && project.status !== 'rejected' && (
  <OrchestratorTrigger
    project={project}
    onSpecUpdate={handleOrchestratorSpecUpdate}
  />
)}
```

---

## Architecture

```
                     ┌─────────────────────────────────┐
                     │     HardwareOrchestrator        │
                     │  ┌───────────────────────────┐  │
                     │  │   Conversation History    │  │
                     │  └───────────────────────────┘  │
                     │              │                  │
                     │              ▼                  │
                     │  ┌───────────────────────────┐  │
                     │  │   LLM (Gemini 3 Flash)    │  │
                     │  │   with Tool Calling       │  │
                     │  └───────────────────────────┘  │
                     │              │                  │
                     │              ▼                  │
                     │  ┌───────────────────────────┐  │
                     │  │   Tool Execution          │  │
                     │  │   ├─ analyze_feasibility  │  │
                     │  │   ├─ select_pcb_blocks    │  │
                     │  │   ├─ generate_enclosure   │  │
                     │  │   ├─ validate_cross_stage │  │
                     │  │   └─ ...                  │  │
                     │  └───────────────────────────┘  │
                     │              │                  │
                     │              ▼                  │
                     │  ┌───────────────────────────┐  │
                     │  │   State Callbacks         │  │
                     │  │   → Zustand Store         │  │
                     │  │   → UI Updates            │  │
                     │  └───────────────────────────┘  │
                     └─────────────────────────────────┘
```

---

## Key Decisions

### Why Tool Calling Instead of Structured Output?

- **Flexibility**: Agent can choose which action to take
- **Composability**: Tools are independent, reusable units
- **Self-correction**: Agent can call `fix_stage_issue` when validation fails
- **Progress tracking**: Each tool call is a discrete event to display

### Why Gemini 3 Flash with Thinking?

- **Speed**: Flash is 10x faster than Opus for iteration loops
- **Cost**: ~$0.001/request vs ~$0.015 for larger models
- **Thinking tokens**: Enable reasoning without long prompts
- **Tool calling**: Native support for function calling

### Why Cross-Stage Validation?

Hardware design has physical constraints:
- PCB must fit inside enclosure (with clearance)
- Firmware GPIO pins must match PCB net assignments
- I2C addresses must match placed sensor blocks
- Power requirements must match selected power block

Validating after each stage prevents cascading failures.

---

## Files Changed

```
frontend/
├── functions/api/llm/
│   └── tools.ts                 # NEW: Tool calling API endpoint
├── src/
│   ├── services/
│   │   ├── llm.ts               # MOD: Added chatWithTools method
│   │   └── orchestrator.ts      # NEW: Marathon orchestrator class
│   ├── prompts/
│   │   ├── orchestrator.ts      # NEW: System prompt + tool definitions
│   │   ├── validation.ts        # NEW: Cross-stage validation logic
│   │   └── block-selection.ts   # NEW: Auto block selection
│   ├── stores/
│   │   └── orchestrator.ts      # NEW: Zustand state management
│   ├── components/workspace/
│   │   ├── OrchestratorPanel.tsx   # NEW: Progress UI panel
│   │   ├── OrchestratorTrigger.tsx # NEW: Start button component
│   │   └── WorkspaceLayout.tsx     # MOD: Added panel
│   └── pages/workspace/
│       ├── SpecStageView.tsx       # MOD: Added trigger
│       └── PCBStageView.tsx        # MOD: Added trigger
```

---

## What's Next

1. **Public Gallery** - Read-only access to completed projects
2. **Prompt Manager** - DB-stored, editable prompts from settings
3. **Test Coverage** - 95%+ coverage for orchestrator
4. **Compile Server** - Fly.io Docker for ESP-IDF builds

---

## Summary

| Component | Purpose |
|-----------|---------|
| `HardwareOrchestrator` | Marathon agent class with tool execution |
| `ORCHESTRATOR_TOOLS` | 12 tools for all pipeline actions |
| `validateCrossStage` | Catch mismatches between stages |
| `useOrchestratorStore` | Reactive state for UI |
| `OrchestratorPanel` | Real-time progress display |
| `OrchestratorTrigger` | Mode-aware start button |

The PHAESTUS Orchestrator transforms hardware design from a manual, error-prone process into an autonomous pipeline that validates itself. In "Vibe It" mode, users describe what they want and get a complete, validated design package.
