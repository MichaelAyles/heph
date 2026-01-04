# Workspace UI Architecture: Multi-Stage Hardware Design

**Date:** 2026-01-04

---

## The Goal

Transform PHAESTUS from a spec-generation tool into a complete hardware development workspace. Users will navigate through 5 distinct stages: Spec, PCB, Enclosure, Firmware, and Export. This post covers the workspace UI shell implementation.

---

## The Problem

The original SpecPage handled everything in one monolithic component. As we add PCB design, enclosure generation, and firmware development, we need:

- A persistent workspace layout with stage navigation
- URL-based routing for each stage (`/project/:id/spec`, `/project/:id/pcb`, etc.)
- Stage status tracking to show progress and gate navigation
- Shared project context across all stage views

---

## The Solution

### Route Structure

```
/project/:id          → redirect to /project/:id/spec
/project/:id/spec     → SpecStageView (spec generation pipeline)
/project/:id/pcb      → PCBStageView (KiCanvas + 3D preview)
/project/:id/enclosure → EnclosureStageView (OpenSCAD + STL viewer)
/project/:id/firmware → FirmwareStageView (Monaco + compile)
/project/:id/export   → ExportStageView (download artifacts)
```

### Component Hierarchy

```
Layout.tsx (sidebar navigation)
└── WorkspaceLayout.tsx (wraps all project views)
    ├── WorkspaceHeader.tsx (project name, back button, status)
    ├── WorkspaceStageTabs.tsx (Spec | PCB | Enclosure | Firmware | Export)
    └── <Outlet> for stage views
        ├── SpecStageView.tsx (refactored from SpecPage)
        ├── PCBStageView.tsx
        ├── EnclosureStageView.tsx
        ├── FirmwareStageView.tsx
        └── ExportStageView.tsx
```

---

## Implementation

### WorkspaceLayout

The workspace layout fetches the project once and provides context to all child routes:

```typescript
// src/components/workspace/WorkspaceLayout.tsx
export function WorkspaceLayout() {
  const { id } = useParams<{ id: string }>()
  const { setActiveStage, canNavigateTo } = useWorkspaceStore()

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      // Refetch every 2s while project is in an active state
      const status = query.state.data?.status
      const activeStatuses = ['analyzing', 'refining', 'generating', 'finalizing']
      return status && activeStatuses.includes(status) ? 2000 : false
    },
  })

  // Redirect /project/:id to /project/:id/spec
  if (location.pathname === `/project/${id}`) {
    return <Navigate to={`/project/${id}/spec`} replace />
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <WorkspaceHeader project={project || null} isLoading={isLoading} />
      <WorkspaceStageTabs spec={project?.spec || null} canNavigateTo={canNavigateTo} />
      <div className="flex-1 min-h-0 overflow-auto">
        <Outlet context={{ project, isLoading }} />
      </div>
    </div>
  )
}

// Hook to access workspace context in child routes
export function useWorkspaceContext() {
  return useOutletContext<WorkspaceContext>()
}
```

### Stage Tabs with Navigation Gating

Users can only navigate to stages that have their prerequisites complete:

```typescript
// src/components/workspace/WorkspaceStageTabs.tsx
const STAGE_ICONS: Record<WorkspaceStage, typeof FileText> = {
  spec: FileText,
  pcb: Cpu,
  enclosure: Box,
  firmware: Code,
  export: Download,
}

export function WorkspaceStageTabs({ spec, canNavigateTo }: WorkspaceStageTabsProps) {
  const { id } = useParams<{ id: string }>()

  return (
    <nav className="border-b border-surface-700 bg-surface-900">
      <div className="flex">
        {STAGE_ORDER.map((stage) => {
          const Icon = STAGE_ICONS[stage]
          const canNavigate = canNavigateTo(stage, spec)
          const status = spec?.stages?.[stage]?.status ?? 'pending'

          return (
            <NavLink
              key={stage}
              to={`/project/${id}/${stage}`}
              className={({ isActive }) =>
                clsx(
                  'relative flex items-center gap-2 px-4 py-3 text-sm font-medium',
                  isActive ? 'border-copper text-copper' : canNavigate
                    ? 'text-steel-dim hover:text-steel'
                    : 'text-surface-500 cursor-not-allowed pointer-events-none'
                )
              }
            >
              <Icon className="w-4 h-4" />
              {STAGE_LABELS[stage]}
              <StageStatusIndicator status={status} />
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
```

### Workspace Store

Zustand store manages active stage and navigation logic:

```typescript
// src/stores/workspace.ts
export type WorkspaceStage = 'spec' | 'pcb' | 'enclosure' | 'firmware' | 'export'
export const STAGE_ORDER: WorkspaceStage[] = ['spec', 'pcb', 'enclosure', 'firmware', 'export']

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  activeStage: 'spec',
  splitPanePositions: { spec: 50, pcb: 50, enclosure: 50, firmware: 30, export: 50 },

  canNavigateTo: (stage, spec) => {
    if (!spec) return stage === 'spec'
    if (stage === 'spec') return true

    // Check if all previous stages are complete
    const stageIndex = STAGE_ORDER.indexOf(stage)
    for (let i = 0; i < stageIndex; i++) {
      const prevStage = STAGE_ORDER[i]
      if (spec.stages?.[prevStage]?.status !== 'complete') {
        return false
      }
    }
    return true
  },
}))
```

### Stage Status Tracking

Extended ProjectSpec to track stage status:

```typescript
// src/db/schema.ts
export type StageStatus = 'pending' | 'in_progress' | 'complete' | 'error'

export interface StageState {
  status: StageStatus
  completedAt?: string
  error?: string
}

export interface ProjectStages {
  spec: StageState
  pcb: StageState
  enclosure: StageState
  firmware: StageState
  export: StageState
}

export interface ProjectSpec {
  // ... existing fields
  stages?: ProjectStages
  pcb?: PCBArtifacts
  enclosure?: EnclosureArtifacts
  firmware?: FirmwareArtifacts
}
```

### App Router Configuration

Nested routes under WorkspaceLayout:

```typescript
// src/App.tsx
function AuthenticatedApp() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="new" element={<NewProjectPage />} />
        {/* Workspace routes with stage tabs */}
        <Route path="project/:id" element={<WorkspaceLayout />}>
          <Route index element={<Navigate to="spec" replace />} />
          <Route path="spec" element={<SpecStageView />} />
          <Route path="pcb" element={<PCBStageView />} />
          <Route path="enclosure" element={<EnclosureStageView />} />
          <Route path="firmware" element={<FirmwareStageView />} />
          <Route path="export" element={<ExportStageView />} />
        </Route>
        <Route path="project/:id/view" element={<SpecViewerPage />} />
        {/* ... other routes */}
      </Route>
    </Routes>
  )
}
```

---

## Stage View Architecture

Each stage view follows a consistent pattern:

1. **Check prerequisite status** - Show "complete previous stage" message if blocked
2. **Load stage-specific data** from project spec
3. **Render stage UI** - Split pane with editor/preview
4. **Update stage status** on completion

Example placeholder for PCB stage:

```typescript
// src/pages/workspace/PCBStageView.tsx
export function PCBStageView() {
  const { project } = useWorkspaceContext()
  const specComplete = project?.status === 'complete'

  if (!specComplete) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Cpu className="w-8 h-8 text-surface-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-steel mb-2">PCB Design</h2>
          <p className="text-steel-dim">
            Complete the spec stage first to begin PCB design.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 grid grid-cols-2 gap-6 p-6">
      {/* Left: Schematic viewer */}
      <div className="bg-surface-900 rounded-lg border border-surface-700">
        KiCanvas viewer will be integrated here
      </div>
      {/* Right: 3D Preview */}
      <div className="bg-surface-900 rounded-lg border border-surface-700">
        3D PCB preview will be rendered here
      </div>
    </div>
  )
}
```

---

## Files Changed

```
frontend/
├── src/
│   ├── App.tsx                      # Nested workspace routes
│   ├── components/workspace/
│   │   ├── WorkspaceLayout.tsx      # Workspace shell with context
│   │   ├── WorkspaceHeader.tsx      # Project header bar
│   │   └── WorkspaceStageTabs.tsx   # Stage navigation tabs
│   ├── pages/workspace/
│   │   ├── index.ts                 # Exports all stage views
│   │   ├── SpecStageView.tsx        # Refactored spec pipeline
│   │   ├── PCBStageView.tsx         # PCB design placeholder
│   │   ├── EnclosureStageView.tsx   # Enclosure design placeholder
│   │   ├── FirmwareStageView.tsx    # Firmware editor placeholder
│   │   └── ExportStageView.tsx      # Export download cards
│   ├── stores/workspace.ts          # Workspace UI state
│   └── db/schema.ts                 # Stage status types
```

---

## Key Decisions

### Why Nested Routes?

React Router's nested routes with `<Outlet>` provide:
- Shared layout (header + tabs) without re-rendering
- URL-based navigation history
- Easy deep linking to any stage

### Why Zustand for Workspace State?

- Lightweight (1KB) vs. Redux
- No boilerplate - just hooks
- Persisted split pane positions across stages

### Why Context Over Props Drilling?

The `useWorkspaceContext()` hook gives any stage view access to:
- Current project data
- Loading state
- Avoids passing project through every component

---

## What's Next

1. **Phase 2: User Control Modes** - Add "Vibe it", "Fix it", "Design it" modes
2. **Phase 3: PCB Stage** - KiCanvas integration and block placement
3. **Phase 4: Enclosure Stage** - OpenSCAD generation and STL preview
4. **Phase 5: Firmware Stage** - Monaco editor and compile server

---

## Summary

| Component | Purpose |
|-----------|---------|
| WorkspaceLayout | Wraps all stage views with header + tabs |
| WorkspaceStageTabs | Navigation between 5 pipeline stages |
| WorkspaceHeader | Project name, back button, status badge |
| useWorkspaceStore | Stage navigation state and gating logic |
| SpecStageView | Refactored spec generation pipeline |
| Stage placeholders | PCB, Enclosure, Firmware, Export views |

The workspace UI shell is complete. Users can now navigate between stages with clear visual feedback on progress. Next up: user control modes for different levels of automation.
