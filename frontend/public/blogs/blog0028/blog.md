# 0028 - Orchestrator UX Polish: Always-Available AI Assistant

**Date**: 2025-01-07
**Phase**: Post-Pipeline Polish

## The Problems

The orchestrator was functional but rough around the edges:

1. **Dead ends** - Complete projects showed "Project not eligible for automation". Users couldn't ask questions about their finished designs.

2. **Context amnesia** - Pausing mid-design meant starting over. The AI forgot everything.

3. **Generic names** - Every project ended up as "SmartTemp Monitor" or "IoT Sensor Hub".

4. **Confusing buttons** - "Continue to Export" appeared on the Export page. "Start Design" shown when resuming.

5. **Invisible progress** - The projects list showed all stages as pending even when stages were complete.

## The Solutions

### Always-Available Chat

The orchestrator is now available for any project, anytime:

```typescript
// Before: Complex eligibility rules
const isEligible = project &&
  (project.status === 'draft' ||
   project.status === 'analyzing' ||
   // ... 6 more conditions

// After: Simple
const isEligible = !!project
```

For complete projects, the UI adapts:

```tsx
{isFullyComplete ? (
  <>
    <MessageSquare className="w-4 h-4" />
    Ask Question
  </>
) : (
  <>
    <Zap className="w-4 h-4" />
    Start Design
  </>
)}
```

### Breaking Change Warnings

When users request changes to earlier stages, the orchestrator warns about downstream effects:

```
## Breaking Changes Warning
When the user requests changes to an earlier stage while later stages are complete, WARN them:
- Spec changes → may break PCB, Enclosure, and Firmware
- PCB changes → may break Enclosure (dimensions) and Firmware (pins)
- Enclosure changes → may break Firmware (button positions)

Example: "Changing the PCB will invalidate your enclosure (wrong dimensions)
and firmware (wrong pins). I'll need to regenerate those stages. Proceed?"
```

The init prompt now includes stage completion status so the AI knows context:

```typescript
const stageStatus = spec?.stages ? {
  spec: spec.stages.spec?.status === 'complete',
  pcb: spec.stages.pcb?.status === 'complete',
  enclosure: spec.stages.enclosure?.status === 'complete',
  firmware: spec.stages.firmware?.status === 'complete',
  export: spec.stages.export?.status === 'complete',
} : undefined

buildOrchestratorInitPrompt(description, mode, stageStatus)
```

### Pause/Resume with Full Context

Orchestrator state now persists after every LLM call:

```typescript
interface PersistedOrchestratorState {
  conversationHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  iteration: number
  status: 'running' | 'paused' | 'completed' | 'error'
  currentStage: string
  updatedAt: string
}
```

On resume, the full conversation history is restored:

```typescript
if (isResuming && savedState) {
  this.conversationHistory = savedState.conversationHistory.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }))
  this.state.iterationCount = savedState.iteration
  this.state.currentStage = savedState.currentStage

  // Tell the LLM we're continuing
  this.conversationHistory.push({
    role: 'user',
    content: `[Resumed from iteration ${savedState.iteration}. Current stage: ${savedState.currentStage}. Continue where you left off.]`,
  })
}
```

The button updates accordingly:

```tsx
{canResume ? (
  <>
    <Play className="w-4 h-4" />
    Continue Design
  </>
) : ...}
```

### Creative Project Naming

Added a naming step after blueprint selection with 4 creative suggestions:

```typescript
{
  name: 'generate_project_names',
  description: 'Generate 4 creative name suggestions for the project.',
  parameters: { type: 'object', properties: {}, required: [] },
}
```

The naming prompt explicitly avoids generic patterns:

```
## Rules
- NO generic prefixes: "Smart", "IoT", "Connected", "Digital", "Auto"
- NO generic suffixes: "Hub", "Station", "System", "Device", "Unit"
- Keep names 1-2 words, max 15 characters

## Naming Styles
1. **Descriptive Compound** - AirPulse, LightSync, TempWatch
2. **Abstract/Evocative** - Zephyr, Nimbus, Helix
3. **Portmanteau** - Plantastic, Humidify, Sensify
4. **Short & Punchy** - Blink, Flux, Node
```

### Context-Aware Stage Summaries

The "Continue to X" button now hides when you're already there:

```tsx
// Added currentStage prop
interface StageCompletionSummaryProps {
  stage: WorkspaceStage
  currentStage?: WorkspaceStage  // New: where user currently is
  // ...
}

// Only show button if not already there
{nextStage && nextStage !== currentStage && (
  <button onClick={() => navigate(`/project/${projectId}/${nextStage}`)}>
    Continue to {getStageLabel(nextStage)}
  </button>
)}
```

### Manual Stage Completion

Users can now manually mark stages complete, useful for Design It mode:

```typescript
const handleMarkStageComplete = async (stageName: string) => {
  if (!onSpecUpdate || !spec?.stages) return

  const updatedStages = {
    spec: spec.stages.spec,
    pcb: spec.stages.pcb,
    enclosure: spec.stages.enclosure,
    firmware: spec.stages.firmware,
    export: spec.stages.export,
  }

  updatedStages[stageName] = {
    status: 'complete' as const,
    completedAt: new Date().toISOString(),
  }

  await onSpecUpdate({ stages: updatedStages })
}
```

A dropdown appears in the footer:

```tsx
{getIncompleteStages().length > 0 && (
  <div className="relative">
    <button onClick={() => setShowStageMenu(!showStageMenu)}>
      <Check className="w-3.5 h-3.5" />
      <ChevronDown className="w-3 h-3" />
    </button>
    {showStageMenu && (
      <div className="absolute bottom-full">
        {getIncompleteStages().map((stage) => (
          <button onClick={() => handleMarkStageComplete(stage)}>
            {stage}
          </button>
        ))}
      </div>
    )}
  </div>
)}
```

### Fixed Projects List Icons

Stage icons now correctly show completion by checking if later stages are done:

```typescript
const getStageState = (stageKey: string): 'complete' | 'current' | 'pending' => {
  // Check explicit status first
  if (stageStatus === 'complete') return 'complete'
  if (stageStatus === 'in_progress') return 'current'

  // Check if a later stage is complete → means this one must be too
  const stageOrder = ['spec', 'pcb', 'enclosure', 'firmware', 'export']
  const currentIndex = stageOrder.indexOf(stageKey)
  for (let i = currentIndex + 1; i < stageOrder.length; i++) {
    const laterStage = stages?.[stageOrder[i]]
    if (laterStage?.status === 'complete' || laterStage?.status === 'in_progress') {
      return 'complete'
    }
  }

  return 'pending'
}
```

Added tooltips for clarity:

```tsx
<div title={`${stageLabel}: ${statusLabels[state]}`}>
  {/* stage icon */}
</div>
```

## Summary of Changes

| Feature | Impact |
|---------|--------|
| Always-available chat | Users can ask questions about completed projects |
| Breaking change warnings | Prevents accidental cascade invalidation |
| Pause/resume | Mid-design breaks don't lose progress |
| Creative naming | No more "Smart Temp Monitor" everywhere |
| Context-aware buttons | No confusing "Continue to Export" on Export page |
| Manual stage completion | Design It mode users can progress manually |
| Fixed status icons | Projects list accurately shows progress |

## Artifacts

- Commits: `237ea20`, `81e63bf`, `2ad5241`, `23c888e`, `e378ed4`
- Files changed: 8
- New prompt file: `naming.ts` (66 lines)
- Tests: All passing
