# User Control Modes: Three Levels of AI Automation

**Date:** 2026-01-04

---

## The Goal

Not every user wants the same level of AI automation. Some prefer to "vibe it" and let AI handle everything, while others want to approve every decision. This post covers implementing three control modes: Vibe It, Fix It, and Design It.

---

## The Problem

The original spec pipeline ran fully automatically - users watched as the AI made decisions. This worked for demos but raised concerns:

1. **Power users** felt out of control - they wanted to review decisions
2. **New users** felt overwhelmed - they wanted more automation
3. **Expert users** needed pause points to validate AI choices

---

## The Solution

### Three Control Modes

| Mode | Icon | Behavior |
|------|------|----------|
| **Vibe It** | Zap | Full automation. AI proceeds without pausing. |
| **Fix It** | Shield | Balanced. AI pauses on errors or low confidence (<80%). |
| **Design It** | Pencil | Full control. User approves every step. |

### User Experience

- Mode selection in Settings page with clear descriptions
- Mode indicator in sidebar footer (clickable to change)
- Mode-aware step transitions in the spec pipeline

---

## Implementation

### Database Migration

```sql
-- migrations/0007_control_modes.sql
ALTER TABLE users ADD COLUMN control_mode TEXT DEFAULT 'fix_it'
  CHECK (control_mode IN ('vibe_it', 'fix_it', 'design_it'));

-- Track when a project is paused
ALTER TABLE projects ADD COLUMN pause_reason TEXT;
ALTER TABLE projects ADD COLUMN pause_data TEXT;
```

### Auth Store Updates

Extended `AuthUser` to include control mode:

```typescript
// src/stores/auth.ts
export type ControlMode = 'vibe_it' | 'fix_it' | 'design_it'

export interface AuthUser {
  id: string
  username: string
  displayName: string | null
  isAdmin: boolean
  controlMode: ControlMode
}

// New action to update mode
updateControlMode: async (mode: ControlMode) => {
  const res = await fetch('/api/users/me/mode', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ controlMode: mode }),
  })

  if (res.ok) {
    set((state) => ({
      user: state.user ? { ...state.user, controlMode: mode } : null,
    }))
    return { success: true }
  }
  // ...error handling
}
```

### API Endpoint

```typescript
// functions/api/users/me/mode.ts
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { env } = context as { env: AuthenticatedEnv }
  const userId = env.user?.id

  const body = await context.request.json()
  const { controlMode } = body

  if (!['vibe_it', 'fix_it', 'design_it'].includes(controlMode)) {
    return Response.json({ error: 'Invalid control mode' }, { status: 400 })
  }

  await env.DB.prepare('UPDATE users SET control_mode = ? WHERE id = ?')
    .bind(controlMode, userId)
    .run()

  return Response.json({ success: true, controlMode })
}
```

### Settings Page UI

```tsx
// src/pages/SettingsPage.tsx
<section>
  <h2 className="text-sm font-mono text-steel-dim">CONTROL MODE</h2>
  <p className="text-sm text-steel-dim mb-4">
    Choose how much control you want over the design process.
  </p>
  <div className="grid grid-cols-3 gap-4">
    <ControlModeCard
      icon={Zap}
      name="Vibe It"
      description="Full automation. AI makes decisions and proceeds automatically."
      selected={user?.controlMode === 'vibe_it'}
      onClick={() => handleModeChange('vibe_it')}
    />
    <ControlModeCard
      icon={Shield}
      name="Fix It"
      description="Balanced. AI proceeds but pauses on errors or low confidence."
      selected={user?.controlMode === 'fix_it'}
      onClick={() => handleModeChange('fix_it')}
    />
    <ControlModeCard
      icon={Pencil}
      name="Design It"
      description="Full control. Approve every decision before AI proceeds."
      selected={user?.controlMode === 'design_it'}
      onClick={() => handleModeChange('design_it')}
    />
  </div>
</section>
```

### Sidebar Mode Indicator

```tsx
// src/components/Layout.tsx
const MODE_CONFIG: Record<ControlMode, { icon; label; color }> = {
  vibe_it: { icon: Zap, label: 'Vibe It', color: 'text-emerald-400' },
  fix_it: { icon: Shield, label: 'Fix It', color: 'text-copper' },
  design_it: { icon: Pencil, label: 'Design It', color: 'text-blue-400' },
}

// In footer
{user?.controlMode && (
  <Link to="/settings" className="flex items-center gap-2 px-2 py-1.5 bg-surface-800">
    <ModeIcon className={mode.color} />
    <span className={mode.color}>{mode.label}</span>
  </Link>
)}
```

### Mode-Aware Step Transitions

The FeasibilityResults component now supports auto-advance:

```tsx
// src/pages/workspace/SpecStageView.tsx
function FeasibilityResults({ feasibility, onContinue, autoAdvance = false }) {
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    if (!autoAdvance) return

    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer)
          onContinue()
          return 0
        }
        return c - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [autoAdvance, onContinue])

  return (
    // ... feasibility display
    <button onClick={onContinue}>
      {autoAdvance
        ? `Continuing in ${countdown}s... (click to proceed now)`
        : 'Continue to Refinement'}
    </button>
  )
}

// In SpecStageView:
<FeasibilityResults
  feasibility={spec.feasibility}
  onContinue={handleStartRefinement}
  autoAdvance={
    controlMode === 'vibe_it' ||
    (controlMode === 'fix_it' && spec.feasibility.overallScore >= 80)
  }
/>
```

---

## Files Changed

```
frontend/
├── migrations/
│   └── 0007_control_modes.sql       # Database migration
├── functions/api/
│   ├── auth/me.ts                   # Include controlMode in response
│   └── users/me/mode.ts             # New endpoint for updating mode
├── src/
│   ├── stores/auth.ts               # ControlMode type + updateControlMode
│   ├── stores/auth.test.ts          # Updated tests for new properties
│   ├── components/Layout.tsx        # Mode indicator in sidebar
│   ├── pages/SettingsPage.tsx       # Mode selection cards
│   └── pages/workspace/
│       └── SpecStageView.tsx        # Mode-aware auto-advance
```

---

## Key Decisions

### Why Store Mode on User, Not Project?

Mode is a user preference, not a project setting. Users expect consistent behavior across all projects. Storing on user also simplifies the UI - no per-project mode selection needed.

### Why Default to "Fix It"?

It's the balanced option:
- More comfortable for new users than "Vibe It" (some guardrails)
- Less tedious than "Design It" (doesn't require clicking through everything)
- Pauses on low confidence gives users a safety net

### Why Auto-Advance with Countdown?

Rather than silently proceeding, the countdown:
- Gives users time to notice and intervene
- Makes automation visible (not sneaky)
- Still allows immediate proceed with a click

### Why 80% Threshold for Fix It Auto-Advance?

Based on feasibility scoring:
- 80%+ = "great fit" for our component library
- 60-80% = "might need adjustments"
- <60% = "significant constraints"

Pausing at <80% gives users a chance to review potential issues.

---

## What's Next

1. **Phase 3: PCB Stage** - Block placement and KiCanvas integration
2. **Phase 4: Enclosure Stage** - OpenSCAD generation
3. **Phase 5: Firmware Stage** - Monaco editor and compile

The control modes will affect all stages - "Vibe It" will auto-accept AI suggestions while "Design It" will require approval at each step.

---

## Summary

| Component | Purpose |
|-----------|---------|
| `control_mode` column | Store user preference in database |
| `/api/users/me/mode` | Endpoint to update mode |
| ControlModeCard | Settings page mode selection |
| Sidebar indicator | Show current mode, link to settings |
| autoAdvance prop | Enable countdown + auto-proceed |

Users now have control over their automation level. The system respects their preferences without requiring configuration at every step.
