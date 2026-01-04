/**
 * Workspace Store
 * Manages workspace UI state including active stage and navigation
 */

import { create } from 'zustand'
import type { ProjectSpec, StageStatus } from '@/db/schema'

export type WorkspaceStage = 'spec' | 'pcb' | 'enclosure' | 'firmware' | 'export'

export const STAGE_ORDER: WorkspaceStage[] = ['spec', 'pcb', 'enclosure', 'firmware', 'export']

export const STAGE_LABELS: Record<WorkspaceStage, string> = {
  spec: 'Spec',
  pcb: 'PCB',
  enclosure: 'Enclosure',
  firmware: 'Firmware',
  export: 'Export',
}

interface WorkspaceState {
  // Current active stage (derived from route)
  activeStage: WorkspaceStage

  // Split pane positions per stage (percentage)
  splitPanePositions: Record<WorkspaceStage, number>

  // Actions
  setActiveStage: (stage: WorkspaceStage) => void
  setSplitPanePosition: (stage: WorkspaceStage, position: number) => void
  canNavigateTo: (stage: WorkspaceStage, spec: ProjectSpec | null) => boolean
  getStageStatus: (stage: WorkspaceStage, spec: ProjectSpec | null) => StageStatus
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  activeStage: 'spec',

  splitPanePositions: {
    spec: 50,
    pcb: 50,
    enclosure: 50,
    firmware: 30, // File tree narrower
    export: 50,
  },

  setActiveStage: (stage) => set({ activeStage: stage }),

  setSplitPanePosition: (stage, position) =>
    set((state) => ({
      splitPanePositions: {
        ...state.splitPanePositions,
        [stage]: position,
      },
    })),

  canNavigateTo: (stage, spec) => {
    if (!spec) return stage === 'spec'

    const stages = spec.stages
    if (!stages) return stage === 'spec'

    // Can always go to spec
    if (stage === 'spec') return true

    // Check if previous stage is complete
    const stageIndex = STAGE_ORDER.indexOf(stage)
    for (let i = 0; i < stageIndex; i++) {
      const prevStage = STAGE_ORDER[i]
      if (stages[prevStage]?.status !== 'complete') {
        return false
      }
    }

    return true
  },

  getStageStatus: (stage, spec) => {
    if (!spec?.stages) return 'pending'
    return spec.stages[stage]?.status ?? 'pending'
  },
}))
