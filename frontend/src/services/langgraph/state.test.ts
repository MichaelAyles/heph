/**
 * LangGraph State Tests
 */

import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  stateToProjectSpec,
  createHistoryItem,
  generateHistoryId,
  requiresUserInput,
  type OrchestratorState,
} from './state'
import type { ProjectSpec, PcbBlock } from '../../db/schema'

describe('createInitialState', () => {
  const mockBlocks: PcbBlock[] = [
    {
      id: '1',
      slug: 'mcu-esp32c6',
      name: 'ESP32-C6',
      category: 'mcu',
      description: 'Main MCU',
      widthUnits: 2,
      heightUnits: 2,
      taps: [],
      i2cAddresses: null,
      spiCs: null,
      power: { currentMaxMa: 500 },
      components: [],
      isValidated: true,
      isActive: true,
    },
  ]

  it('creates state with required fields', () => {
    const state = createInitialState('proj-123', 'user-456', 'fix_it', null, mockBlocks)

    expect(state.projectId).toBe('proj-123')
    expect(state.userId).toBe('user-456')
    expect(state.mode).toBe('fix_it')
    expect(state.availableBlocks).toHaveLength(1)
    expect(state.status).toBe('idle')
    expect(state.currentStage).toBe('spec')
  })

  it('restores state from existing spec', () => {
    const existingSpec: ProjectSpec = {
      description: 'Test device',
      feasibility: {
        communication: { type: 'WiFi', confidence: 90, notes: '' },
        processing: { level: 'low', confidence: 90, notes: '' },
        power: { options: ['LiPo'], confidence: 90, notes: '' },
        inputs: { items: ['sensor'], confidence: 90 },
        outputs: { items: ['LED'], confidence: 90 },
        overallScore: 90,
        manufacturable: true,
      },
      openQuestions: [],
      decisions: [
        { questionId: 'q1', question: 'Power?', answer: 'LiPo', timestamp: '2024-01-01' },
      ],
      blueprints: [{ url: '/img.png', prompt: 'test' }],
      selectedBlueprint: 0,
      finalSpec: null,
    }

    const state = createInitialState('proj-123', 'user-456', 'vibe_it', existingSpec, [])

    expect(state.description).toBe('Test device')
    expect(state.feasibility).toBeTruthy()
    expect(state.decisions).toHaveLength(1)
    expect(state.blueprints).toHaveLength(1)
    expect(state.selectedBlueprint).toBe(0)
  })

  it('determines current stage from spec progress', () => {
    // Empty spec -> spec stage
    const emptyState = createInitialState('p1', 'u1', 'fix_it', null, [])
    expect(emptyState.currentStage).toBe('spec')

    // With final spec -> pcb stage
    const withFinalSpec = createInitialState(
      'p1',
      'u1',
      'fix_it',
      {
        description: 'test',
        feasibility: null,
        openQuestions: [],
        decisions: [],
        blueprints: [],
        selectedBlueprint: null,
        finalSpec: {
          name: 'Test',
          summary: '',
          pcbSize: { width: 50, height: 50, unit: 'mm' },
          inputs: [],
          outputs: [],
          power: { source: 'LiPo', voltage: '3.7V', current: '100mA' },
          communication: { type: 'WiFi', protocol: 'MQTT' },
          enclosure: { style: 'box', width: 60, height: 60, depth: 30 },
          estimatedBOM: [],
          locked: true,
          lockedAt: '2024-01-01',
        },
      },
      []
    )
    expect(withFinalSpec.currentStage).toBe('pcb')
  })
})

describe('stateToProjectSpec', () => {
  it('converts state to project spec', () => {
    const state: OrchestratorState = {
      projectId: 'proj-123',
      userId: 'user-456',
      mode: 'fix_it',
      availableBlocks: [],
      description: 'A smart widget',
      feasibility: {
        communication: { type: 'WiFi', confidence: 90, notes: '' },
        processing: { level: 'low', confidence: 90, notes: '' },
        power: { options: ['LiPo'], confidence: 90, notes: '' },
        inputs: { items: ['sensor'], confidence: 90 },
        outputs: { items: ['LED'], confidence: 90 },
        overallScore: 90,
        manufacturable: true,
      },
      openQuestions: [],
      decisions: [
        { questionId: 'q1', question: 'Power?', answer: 'LiPo', timestamp: '2024-01-01' },
      ],
      refinementRound: 1,
      blueprints: [{ url: '/img.png', prompt: 'test' }],
      selectedBlueprint: 0,
      generatedNames: [],
      selectedName: 'SmartWidget',
      finalSpec: null,
      suggestedBlocks: [],
      placedBlocks: [],
      gridSize: null,
      schematicData: null,
      pcbData: null,
      enclosureCode: null,
      enclosureReview: null,
      enclosureIterations: [],
      stlUrl: null,
      firmwareFiles: [],
      firmwareReview: null,
      firmwareIterations: 0,
      currentStage: 'spec',
      currentNode: null,
      status: 'running',
      error: null,
      userInputRequest: null,
      userInputResponse: null,
      history: [],
      iterationCount: 5,
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: null,
    }

    const spec = stateToProjectSpec(state)

    expect(spec.description).toBe('A smart widget')
    expect(spec.feasibility).toBeTruthy()
    expect(spec.decisions).toHaveLength(1)
    expect(spec.blueprints).toHaveLength(1)
    expect(spec.selectedBlueprint).toBe(0)
    expect(spec.orchestratorState?.iteration).toBe(5)
    expect(spec.orchestratorState?.status).toBe('running')
  })

  it('includes PCB artifacts when present', () => {
    const state = createInitialState('p1', 'u1', 'fix_it', null, [])
    state.placedBlocks = [
      { blockId: 'mcu', blockSlug: 'mcu-esp32c6', gridX: 0, gridY: 0, rotation: 0 },
    ]
    state.schematicData = '(kicad_sch ...)'
    state.gridSize = { width: 50, height: 50 }

    const spec = stateToProjectSpec(state)

    expect(spec.pcb).toBeTruthy()
    expect(spec.pcb?.placedBlocks).toHaveLength(1)
    expect(spec.pcb?.schematicData).toBe('(kicad_sch ...)')
    expect(spec.pcb?.boardSize?.width).toBe(50)
  })

  it('includes enclosure artifacts when present', () => {
    const state = createInitialState('p1', 'u1', 'fix_it', null, [])
    state.enclosureCode = '// OpenSCAD code'
    state.stlUrl = '/enclosure.stl'
    state.enclosureIterations = [
      { feedback: 'Initial', openScadCode: '// code', timestamp: '2024-01-01' },
    ]

    const spec = stateToProjectSpec(state)

    expect(spec.enclosure).toBeTruthy()
    expect(spec.enclosure?.openScadCode).toBe('// OpenSCAD code')
    expect(spec.enclosure?.stlUrl).toBe('/enclosure.stl')
    expect(spec.enclosure?.iterations).toHaveLength(1)
  })

  it('includes firmware artifacts when present', () => {
    const state = createInitialState('p1', 'u1', 'fix_it', null, [])
    state.firmwareFiles = [{ path: 'src/main.cpp', content: 'void setup() {}', language: 'cpp' }]

    const spec = stateToProjectSpec(state)

    expect(spec.firmware).toBeTruthy()
    expect(spec.firmware?.files).toHaveLength(1)
  })
})

describe('createHistoryItem', () => {
  it('creates history item with required fields', () => {
    const item = createHistoryItem('testNode', 'node_enter')

    expect(item.nodeId).toBe('testNode')
    expect(item.type).toBe('node_enter')
    expect(item.id).toMatch(/^hist_/)
    expect(item.timestamp).toBeTruthy()
  })

  it('includes optional data', () => {
    const item = createHistoryItem('testNode', 'llm_call', {
      model: 'gemini-flash',
      tokens: 100,
    })

    expect(item.data).toEqual({ model: 'gemini-flash', tokens: 100 })
  })
})

describe('generateHistoryId', () => {
  it('generates unique IDs', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(generateHistoryId())
    }
    expect(ids.size).toBe(100)
  })

  it('starts with hist_ prefix', () => {
    const id = generateHistoryId()
    expect(id).toMatch(/^hist_\d+_[a-z0-9]+$/)
  })
})

describe('requiresUserInput', () => {
  it('returns false for vibe_it mode', () => {
    expect(requiresUserInput('vibe_it', 'collectAnswers')).toBe(false)
    expect(requiresUserInput('vibe_it', 'selectBlueprint')).toBe(false)
    expect(requiresUserInput('vibe_it', 'selectName')).toBe(false)
  })

  it('returns true for fix_it mode on user input nodes', () => {
    expect(requiresUserInput('fix_it', 'collectAnswer')).toBe(true)
    expect(requiresUserInput('fix_it', 'selectBlueprint')).toBe(true)
    expect(requiresUserInput('fix_it', 'selectName')).toBe(true)
  })

  it('returns false for fix_it mode on auto nodes', () => {
    expect(requiresUserInput('fix_it', 'analyzeFeasibility')).toBe(false)
    expect(requiresUserInput('fix_it', 'generateBlueprints')).toBe(false)
  })

  it('returns true for design_it mode on review nodes', () => {
    expect(requiresUserInput('design_it', 'reviewEnclosure')).toBe(true)
    expect(requiresUserInput('design_it', 'reviewFirmware')).toBe(true)
  })
})
