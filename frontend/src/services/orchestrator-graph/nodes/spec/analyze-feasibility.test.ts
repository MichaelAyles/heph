/**
 * Tests for Analyze Feasibility Node
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeFeasibilityNode, isFeasibilityRejected, hasOpenQuestions } from './analyze-feasibility'
import type { OrchestratorState } from '../../state'

// Mock the llmAdapter
vi.mock('../../llm-wrapper', () => ({
  llmAdapter: {
    chat: vi.fn(),
    parseJson: vi.fn(),
  },
  createChatRequest: vi.fn((system, user, opts) => ({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    ...opts,
  })),
}))

// Mock prompts
vi.mock('@/prompts/feasibility', () => ({
  FEASIBILITY_SYSTEM_PROMPT: 'mock system prompt',
  buildFeasibilityPrompt: vi.fn((desc) => `Analyze: ${desc}`),
}))

const createMockState = (overrides: Partial<OrchestratorState> = {}): OrchestratorState => ({
  projectId: 'test-project',
  mode: 'vibe_it',
  currentStage: 'spec',
  description: 'A temperature sensor with WiFi',
  availableBlocks: [],
  feasibility: null,
  openQuestions: [],
  decisions: [],
  blueprints: [],
  selectedBlueprint: null,
  generatedNames: [],
  selectedName: null,
  finalSpec: null,
  pcb: null,
  enclosure: null,
  enclosureReview: null,
  enclosureAttempts: 0,
  firmware: null,
  firmwareReview: null,
  firmwareAttempts: 0,
  completedStages: new Set(),
  stages: {
    spec: { status: 'in_progress' },
    pcb: { status: 'pending' },
    enclosure: { status: 'pending' },
    firmware: { status: 'pending' },
    export: { status: 'pending' },
  },
  history: [],
  error: null,
  iterationCount: 0,
  startedAt: null,
  completedAt: null,
  ...overrides,
})

describe('analyzeFeasibilityNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return error if no description provided', async () => {
    const state = createMockState({ description: '' })
    const result = await analyzeFeasibilityNode(state)

    expect(result.error).toContain('No description provided')
    expect(result.history).toHaveLength(1)
    expect(result.history?.[0].type).toBe('error')
  })

  it('should parse successful feasibility response', async () => {
    const { llmAdapter } = await import('../../llm-wrapper')
    const mockFeasibility = {
      manufacturable: true,
      overallScore: 85,
      openQuestions: [
        { id: 'power', question: 'Power source?', options: ['USB', 'Battery'] },
      ],
    }

    vi.mocked(llmAdapter.chat).mockResolvedValue({ content: 'json response' })
    vi.mocked(llmAdapter.parseJson).mockReturnValue(mockFeasibility)

    const state = createMockState()
    const result = await analyzeFeasibilityNode(state)

    expect(result.error).toBeUndefined()
    expect(result.feasibility).toEqual(mockFeasibility)
    expect(result.openQuestions).toHaveLength(1)
    expect(result.history?.[0].type).toBe('tool_result')
  })

  it('should handle rejection', async () => {
    const { llmAdapter } = await import('../../llm-wrapper')
    const mockFeasibility = {
      manufacturable: false,
      overallScore: 20,
      rejectionReason: 'Requires FPGA',
    }

    vi.mocked(llmAdapter.chat).mockResolvedValue({ content: 'json response' })
    vi.mocked(llmAdapter.parseJson).mockReturnValue(mockFeasibility)

    const state = createMockState()
    const result = await analyzeFeasibilityNode(state)

    expect(result.feasibility?.manufacturable).toBe(false)
    expect(result.error).toContain('FPGA')
  })

  it('should handle parse failure', async () => {
    const { llmAdapter } = await import('../../llm-wrapper')
    vi.mocked(llmAdapter.chat).mockResolvedValue({ content: 'invalid response' })
    vi.mocked(llmAdapter.parseJson).mockReturnValue(null)

    const state = createMockState()
    const result = await analyzeFeasibilityNode(state)

    expect(result.error).toContain('Failed to parse')
  })
})

describe('isFeasibilityRejected', () => {
  it('should return true for rejected feasibility', () => {
    const state = createMockState({
      feasibility: { manufacturable: false } as any,
    })
    expect(isFeasibilityRejected(state)).toBe(true)
  })

  it('should return false for accepted feasibility', () => {
    const state = createMockState({
      feasibility: { manufacturable: true } as any,
    })
    expect(isFeasibilityRejected(state)).toBe(false)
  })

  it('should return false for null feasibility', () => {
    const state = createMockState({ feasibility: null })
    expect(isFeasibilityRejected(state)).toBe(false)
  })
})

describe('hasOpenQuestions', () => {
  it('should return true when there are open questions', () => {
    const state = createMockState({
      openQuestions: [{ id: 'q1', question: 'Test?', options: ['A', 'B'] }],
    })
    expect(hasOpenQuestions(state)).toBe(true)
  })

  it('should return false when no open questions', () => {
    const state = createMockState({ openQuestions: [] })
    expect(hasOpenQuestions(state)).toBe(false)
  })
})
