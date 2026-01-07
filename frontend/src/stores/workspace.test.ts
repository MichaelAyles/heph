/**
 * Tests for Workspace Store
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  useWorkspaceStore,
  STAGE_ORDER,
  STAGE_LABELS,
  type WorkspaceStage,
} from './workspace'
import type { ProjectSpec } from '@/db/schema'

// Reset store before each test
beforeEach(() => {
  useWorkspaceStore.setState({
    activeStage: 'spec',
    splitPanePositions: {
      spec: 50,
      pcb: 50,
      enclosure: 50,
      firmware: 30,
      export: 50,
    },
  })
})

// =============================================================================
// STAGE_ORDER and STAGE_LABELS Tests
// =============================================================================

describe('STAGE_ORDER', () => {
  it('contains all 6 stages in correct order', () => {
    expect(STAGE_ORDER).toEqual(['spec', 'pcb', 'enclosure', 'firmware', 'export', 'files'])
  })

  it('has 6 stages', () => {
    expect(STAGE_ORDER.length).toBe(6)
  })

  it('starts with spec', () => {
    expect(STAGE_ORDER[0]).toBe('spec')
  })

  it('ends with files', () => {
    expect(STAGE_ORDER[STAGE_ORDER.length - 1]).toBe('files')
  })
})

describe('STAGE_LABELS', () => {
  it('has labels for all stages', () => {
    for (const stage of STAGE_ORDER) {
      expect(STAGE_LABELS[stage]).toBeDefined()
      expect(typeof STAGE_LABELS[stage]).toBe('string')
    }
  })

  it('has correct label for spec', () => {
    expect(STAGE_LABELS.spec).toBe('Spec')
  })

  it('has correct label for pcb', () => {
    expect(STAGE_LABELS.pcb).toBe('PCB')
  })

  it('has correct label for enclosure', () => {
    expect(STAGE_LABELS.enclosure).toBe('Enclosure')
  })

  it('has correct label for firmware', () => {
    expect(STAGE_LABELS.firmware).toBe('Firmware')
  })

  it('has correct label for export', () => {
    expect(STAGE_LABELS.export).toBe('Export')
  })
})

// =============================================================================
// useWorkspaceStore State Tests
// =============================================================================

describe('useWorkspaceStore initial state', () => {
  it('starts with spec as active stage', () => {
    const { activeStage } = useWorkspaceStore.getState()
    expect(activeStage).toBe('spec')
  })

  it('has default split pane positions', () => {
    const { splitPanePositions } = useWorkspaceStore.getState()
    expect(splitPanePositions.spec).toBe(50)
    expect(splitPanePositions.pcb).toBe(50)
    expect(splitPanePositions.enclosure).toBe(50)
    expect(splitPanePositions.firmware).toBe(30) // Narrower for file tree
    expect(splitPanePositions.export).toBe(50)
  })
})

// =============================================================================
// setActiveStage Tests
// =============================================================================

describe('setActiveStage', () => {
  it('updates active stage to pcb', () => {
    const { setActiveStage } = useWorkspaceStore.getState()

    setActiveStage('pcb')

    expect(useWorkspaceStore.getState().activeStage).toBe('pcb')
  })

  it('updates active stage to enclosure', () => {
    const { setActiveStage } = useWorkspaceStore.getState()

    setActiveStage('enclosure')

    expect(useWorkspaceStore.getState().activeStage).toBe('enclosure')
  })

  it('updates active stage to firmware', () => {
    const { setActiveStage } = useWorkspaceStore.getState()

    setActiveStage('firmware')

    expect(useWorkspaceStore.getState().activeStage).toBe('firmware')
  })

  it('updates active stage to export', () => {
    const { setActiveStage } = useWorkspaceStore.getState()

    setActiveStage('export')

    expect(useWorkspaceStore.getState().activeStage).toBe('export')
  })

  it('can switch back to spec', () => {
    const { setActiveStage } = useWorkspaceStore.getState()

    setActiveStage('firmware')
    setActiveStage('spec')

    expect(useWorkspaceStore.getState().activeStage).toBe('spec')
  })
})

// =============================================================================
// setSplitPanePosition Tests
// =============================================================================

describe('setSplitPanePosition', () => {
  it('updates position for spec stage', () => {
    const { setSplitPanePosition } = useWorkspaceStore.getState()

    setSplitPanePosition('spec', 70)

    expect(useWorkspaceStore.getState().splitPanePositions.spec).toBe(70)
  })

  it('updates position for pcb stage', () => {
    const { setSplitPanePosition } = useWorkspaceStore.getState()

    setSplitPanePosition('pcb', 25)

    expect(useWorkspaceStore.getState().splitPanePositions.pcb).toBe(25)
  })

  it('preserves other stage positions', () => {
    const { setSplitPanePosition } = useWorkspaceStore.getState()

    setSplitPanePosition('pcb', 75)

    const positions = useWorkspaceStore.getState().splitPanePositions
    expect(positions.spec).toBe(50) // Unchanged
    expect(positions.pcb).toBe(75) // Changed
    expect(positions.enclosure).toBe(50) // Unchanged
    expect(positions.firmware).toBe(30) // Unchanged
    expect(positions.export).toBe(50) // Unchanged
  })

  it('allows position of 0', () => {
    const { setSplitPanePosition } = useWorkspaceStore.getState()

    setSplitPanePosition('enclosure', 0)

    expect(useWorkspaceStore.getState().splitPanePositions.enclosure).toBe(0)
  })

  it('allows position of 100', () => {
    const { setSplitPanePosition } = useWorkspaceStore.getState()

    setSplitPanePosition('firmware', 100)

    expect(useWorkspaceStore.getState().splitPanePositions.firmware).toBe(100)
  })
})

// =============================================================================
// canNavigateTo Tests
// =============================================================================

describe('canNavigateTo', () => {
  const createSpec = (stageStatuses: Record<WorkspaceStage, string>): ProjectSpec => ({
    description: 'Test',
    feasibility: null,
    openQuestions: [],
    decisions: [],
    blueprints: [],
    selectedBlueprint: null,
    finalSpec: null,
    stages: {
      spec: { status: stageStatuses.spec as 'pending' | 'in_progress' | 'complete' },
      pcb: { status: stageStatuses.pcb as 'pending' | 'in_progress' | 'complete' },
      enclosure: { status: stageStatuses.enclosure as 'pending' | 'in_progress' | 'complete' },
      firmware: { status: stageStatuses.firmware as 'pending' | 'in_progress' | 'complete' },
      export: { status: stageStatuses.export as 'pending' | 'in_progress' | 'complete' },
    },
  })

  it('returns true for spec with null spec', () => {
    const { canNavigateTo } = useWorkspaceStore.getState()

    expect(canNavigateTo('spec', null)).toBe(true)
  })

  it('returns false for non-spec stages with null spec', () => {
    const { canNavigateTo } = useWorkspaceStore.getState()

    expect(canNavigateTo('pcb', null)).toBe(false)
    expect(canNavigateTo('enclosure', null)).toBe(false)
    expect(canNavigateTo('firmware', null)).toBe(false)
    expect(canNavigateTo('export', null)).toBe(false)
  })

  it('returns true for spec when spec is complete', () => {
    const { canNavigateTo } = useWorkspaceStore.getState()
    const spec = createSpec({
      spec: 'complete',
      pcb: 'pending',
      enclosure: 'pending',
      firmware: 'pending',
      export: 'pending',
    })

    expect(canNavigateTo('spec', spec)).toBe(true)
  })

  it('returns true for pcb when spec is complete', () => {
    const { canNavigateTo } = useWorkspaceStore.getState()
    const spec = createSpec({
      spec: 'complete',
      pcb: 'pending',
      enclosure: 'pending',
      firmware: 'pending',
      export: 'pending',
    })

    expect(canNavigateTo('pcb', spec)).toBe(true)
  })

  it('returns false for pcb when spec is pending', () => {
    const { canNavigateTo } = useWorkspaceStore.getState()
    const spec = createSpec({
      spec: 'pending',
      pcb: 'pending',
      enclosure: 'pending',
      firmware: 'pending',
      export: 'pending',
    })

    expect(canNavigateTo('pcb', spec)).toBe(false)
  })

  it('returns false for pcb when spec is in_progress', () => {
    const { canNavigateTo } = useWorkspaceStore.getState()
    const spec = createSpec({
      spec: 'in_progress',
      pcb: 'pending',
      enclosure: 'pending',
      firmware: 'pending',
      export: 'pending',
    })

    expect(canNavigateTo('pcb', spec)).toBe(false)
  })

  it('returns true for enclosure when spec and pcb are complete', () => {
    const { canNavigateTo } = useWorkspaceStore.getState()
    const spec = createSpec({
      spec: 'complete',
      pcb: 'complete',
      enclosure: 'pending',
      firmware: 'pending',
      export: 'pending',
    })

    expect(canNavigateTo('enclosure', spec)).toBe(true)
  })

  it('returns false for enclosure when pcb is not complete', () => {
    const { canNavigateTo } = useWorkspaceStore.getState()
    const spec = createSpec({
      spec: 'complete',
      pcb: 'in_progress',
      enclosure: 'pending',
      firmware: 'pending',
      export: 'pending',
    })

    expect(canNavigateTo('enclosure', spec)).toBe(false)
  })

  it('returns true for firmware when spec, pcb, enclosure are complete', () => {
    const { canNavigateTo } = useWorkspaceStore.getState()
    const spec = createSpec({
      spec: 'complete',
      pcb: 'complete',
      enclosure: 'complete',
      firmware: 'pending',
      export: 'pending',
    })

    expect(canNavigateTo('firmware', spec)).toBe(true)
  })

  it('returns false for firmware when enclosure is not complete', () => {
    const { canNavigateTo } = useWorkspaceStore.getState()
    const spec = createSpec({
      spec: 'complete',
      pcb: 'complete',
      enclosure: 'in_progress',
      firmware: 'pending',
      export: 'pending',
    })

    expect(canNavigateTo('firmware', spec)).toBe(false)
  })

  it('returns true for export when all prior stages complete', () => {
    const { canNavigateTo } = useWorkspaceStore.getState()
    const spec = createSpec({
      spec: 'complete',
      pcb: 'complete',
      enclosure: 'complete',
      firmware: 'complete',
      export: 'pending',
    })

    expect(canNavigateTo('export', spec)).toBe(true)
  })

  it('returns false for export when firmware is not complete', () => {
    const { canNavigateTo } = useWorkspaceStore.getState()
    const spec = createSpec({
      spec: 'complete',
      pcb: 'complete',
      enclosure: 'complete',
      firmware: 'in_progress',
      export: 'pending',
    })

    expect(canNavigateTo('export', spec)).toBe(false)
  })

  it('returns true for spec with missing stages object', () => {
    const { canNavigateTo } = useWorkspaceStore.getState()
    const spec: ProjectSpec = {
      description: 'Test',
      feasibility: null,
      openQuestions: [],
      decisions: [],
      blueprints: [],
      selectedBlueprint: null,
      finalSpec: null,
      // stages is undefined
    }

    expect(canNavigateTo('spec', spec)).toBe(true)
  })

  it('returns false for non-spec with missing stages object', () => {
    const { canNavigateTo } = useWorkspaceStore.getState()
    const spec: ProjectSpec = {
      description: 'Test',
      feasibility: null,
      openQuestions: [],
      decisions: [],
      blueprints: [],
      selectedBlueprint: null,
      finalSpec: null,
    }

    expect(canNavigateTo('pcb', spec)).toBe(false)
  })
})

// =============================================================================
// getStageStatus Tests
// =============================================================================

describe('getStageStatus', () => {
  const createSpec = (stageStatuses: Partial<Record<WorkspaceStage, string>>): ProjectSpec => ({
    description: 'Test',
    feasibility: null,
    openQuestions: [],
    decisions: [],
    blueprints: [],
    selectedBlueprint: null,
    finalSpec: null,
    stages: {
      spec: { status: (stageStatuses.spec as 'pending' | 'in_progress' | 'complete') ?? 'pending' },
      pcb: { status: (stageStatuses.pcb as 'pending' | 'in_progress' | 'complete') ?? 'pending' },
      enclosure: { status: (stageStatuses.enclosure as 'pending' | 'in_progress' | 'complete') ?? 'pending' },
      firmware: { status: (stageStatuses.firmware as 'pending' | 'in_progress' | 'complete') ?? 'pending' },
      export: { status: (stageStatuses.export as 'pending' | 'in_progress' | 'complete') ?? 'pending' },
    },
  })

  it('returns pending for null spec', () => {
    const { getStageStatus } = useWorkspaceStore.getState()

    expect(getStageStatus('spec', null)).toBe('pending')
    expect(getStageStatus('pcb', null)).toBe('pending')
  })

  it('returns pending for missing stages object', () => {
    const { getStageStatus } = useWorkspaceStore.getState()
    const spec: ProjectSpec = {
      description: 'Test',
      feasibility: null,
      openQuestions: [],
      decisions: [],
      blueprints: [],
      selectedBlueprint: null,
      finalSpec: null,
    }

    expect(getStageStatus('spec', spec)).toBe('pending')
  })

  it('returns complete for complete stage', () => {
    const { getStageStatus } = useWorkspaceStore.getState()
    const spec = createSpec({ spec: 'complete' })

    expect(getStageStatus('spec', spec)).toBe('complete')
  })

  it('returns in_progress for in_progress stage', () => {
    const { getStageStatus } = useWorkspaceStore.getState()
    const spec = createSpec({ pcb: 'in_progress' })

    expect(getStageStatus('pcb', spec)).toBe('in_progress')
  })

  it('returns pending for pending stage', () => {
    const { getStageStatus } = useWorkspaceStore.getState()
    const spec = createSpec({ firmware: 'pending' })

    expect(getStageStatus('firmware', spec)).toBe('pending')
  })

  it('returns status for each stage', () => {
    const { getStageStatus } = useWorkspaceStore.getState()
    const spec = createSpec({
      spec: 'complete',
      pcb: 'complete',
      enclosure: 'in_progress',
      firmware: 'pending',
      export: 'pending',
    })

    expect(getStageStatus('spec', spec)).toBe('complete')
    expect(getStageStatus('pcb', spec)).toBe('complete')
    expect(getStageStatus('enclosure', spec)).toBe('in_progress')
    expect(getStageStatus('firmware', spec)).toBe('pending')
    expect(getStageStatus('export', spec)).toBe('pending')
  })
})
