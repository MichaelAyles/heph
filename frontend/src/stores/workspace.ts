/**
 * Workspace Store
 * Manages workspace UI state including active stage and navigation
 */

import { create } from 'zustand'
import type { ProjectSpec, StageStatus } from '@/db/schema'

export type WorkspaceStage = 'spec' | 'pcb' | 'enclosure' | 'firmware' | 'export' | 'files'

export const STAGE_ORDER: WorkspaceStage[] = ['spec', 'pcb', 'enclosure', 'firmware', 'export', 'files']

export const STAGE_LABELS: Record<WorkspaceStage, string> = {
  spec: 'Spec',
  pcb: 'PCB',
  enclosure: 'Enclosure',
  firmware: 'Firmware',
  export: 'Export',
  files: 'Files',
}

interface WorkspaceState {
  // Current active stage (derived from route)
  activeStage: WorkspaceStage

  // Split pane positions per stage (percentage)
  splitPanePositions: Record<WorkspaceStage, number>

  // Sidebar state
  isSidebarCollapsed: boolean

  // Actions
  setActiveStage: (stage: WorkspaceStage) => void
  setSplitPanePosition: (stage: WorkspaceStage, position: number) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  canNavigateTo: (stage: WorkspaceStage, spec: ProjectSpec | null) => boolean
  getStageStatus: (stage: WorkspaceStage, spec: ProjectSpec | null) => StageStatus
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeStage: 'spec',

  splitPanePositions: {
    spec: 50,
    pcb: 50,
    enclosure: 50,
    firmware: 30, // File tree narrower
    export: 50,
    files: 25, // File tree sidebar
  },

  isSidebarCollapsed: false,

  setActiveStage: (stage) => set({ activeStage: stage }),

  setSplitPanePosition: (stage, position) =>
    set((state) => ({
      splitPanePositions: {
        ...state.splitPanePositions,
        [stage]: position,
      },
    })),

  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

  setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),

  canNavigateTo: (stage, spec) => {
    if (!spec) return stage === 'spec'

    const stages = spec.stages
    if (!stages) return stage === 'spec'

    // Can always go to spec
    if (stage === 'spec') return true

    // Files view is always available if there's a spec
    if (stage === 'files') return true

    // Check if previous stage is complete
    const stageIndex = STAGE_ORDER.indexOf(stage)
    for (let i = 0; i < stageIndex; i++) {
      const prevStage = STAGE_ORDER[i]
      // Skip 'files' as it's not a pipeline stage
      if (prevStage === 'files') continue
      if (stages[prevStage as keyof typeof stages]?.status !== 'complete') {
        return false
      }
    }

    return true
  },

  getStageStatus: (stage, spec) => {
    if (!spec?.stages) return 'pending'
    // Files doesn't have a status - it's always available
    if (stage === 'files') return 'pending'
    return spec.stages[stage as keyof typeof spec.stages]?.status ?? 'pending'
  },
}))
