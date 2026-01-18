/**
 * Tests for edge-engine.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { EdgeExecutionEngine, createEdgeEngine } from './edge-engine'
import type { EnhancedOrchestratorEdge } from '../../schemas/orchestrator-node'

const mockEdges: EnhancedOrchestratorEdge[] = [
  {
    id: 'e1',
    fromNode: 'start',
    toNode: 'spec',
    condition: null,
    edgeType: 'flow',
    priority: 10,
    description: 'Start to spec',
    isActive: true,
    maxLoops: null,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'e2',
    fromNode: 'spec',
    toNode: 'pcb',
    condition: { field: 'spec.status', operator: '==', value: 'complete' },
    edgeType: 'conditional',
    priority: 10,
    description: 'Spec to PCB when complete',
    isActive: true,
    maxLoops: null,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'e3',
    fromNode: 'spec',
    toNode: 'spec_review',
    condition: { field: 'spec.status', operator: '==', value: 'pending_review' },
    edgeType: 'conditional',
    priority: 5,
    description: 'Spec needs review',
    isActive: true,
    maxLoops: null,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'e4',
    fromNode: 'spec_review',
    toNode: 'spec',
    condition: { field: 'lastReview.verdict', operator: '==', value: 'needs_changes' },
    edgeType: 'loop',
    priority: 10,
    description: 'Loop back for fixes',
    isActive: true,
    maxLoops: 3,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'e5',
    fromNode: 'pcb',
    toNode: 'end',
    condition: null,
    edgeType: 'flow',
    priority: 10,
    description: 'PCB to end',
    isActive: true,
    maxLoops: null,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
]

describe('EdgeExecutionEngine', () => {
  let engine: EdgeExecutionEngine

  beforeEach(() => {
    engine = new EdgeExecutionEngine('start')
    engine.setEdges(mockEdges)
  })

  describe('initialization', () => {
    it('creates engine with default start node', () => {
      const e = createEdgeEngine()
      expect(e.getCurrentNode()).toBe('start')
    })

    it('creates engine with custom initial node', () => {
      const e = createEdgeEngine('spec')
      expect(e.getCurrentNode()).toBe('spec')
    })

    it('initializes state correctly', () => {
      const state = engine.getState()
      expect(state.currentNode).toBe('start')
      expect(state.visitedNodes.has('start')).toBe(true)
      expect(state.loopCounts.size).toBe(0)
      expect(state.history.length).toBe(0)
    })
  })

  describe('getNextNodes', () => {
    it('returns valid next nodes from start', () => {
      const nextNodes = engine.getNextNodes()
      expect(nextNodes).toEqual(['spec'])
    })

    it('returns conditional nodes when condition is met', () => {
      engine.resetTo('spec')
      engine.updateContext({ spec: { status: 'complete' } })

      const nextNodes = engine.getNextNodes()
      expect(nextNodes).toContain('pcb')
    })

    it('returns lower priority node when high priority condition not met', () => {
      engine.resetTo('spec')
      engine.updateContext({ spec: { status: 'pending_review' } })

      const nextNodes = engine.getNextNodes()
      expect(nextNodes).toContain('spec_review')
      expect(nextNodes).not.toContain('pcb')
    })

    it('sorts by priority (highest first)', () => {
      engine.resetTo('spec')
      engine.updateContext({ spec: { status: 'complete' } })

      const nextNodes = engine.getNextNodes()
      // pcb has priority 10, spec_review has priority 5
      expect(nextNodes[0]).toBe('pcb')
    })

    it('returns empty array when no valid transitions', () => {
      engine.resetTo('end')
      const nextNodes = engine.getNextNodes()
      expect(nextNodes).toEqual([])
    })
  })

  describe('getNextNode', () => {
    it('returns single best next node', () => {
      const nextNode = engine.getNextNode()
      expect(nextNode).toBe('spec')
    })

    it('returns null when no transitions available', () => {
      engine.resetTo('end')
      const nextNode = engine.getNextNode()
      expect(nextNode).toBeNull()
    })
  })

  describe('transitionTo', () => {
    it('transitions to valid next node', async () => {
      const success = await engine.transitionTo('spec')
      expect(success).toBe(true)
      expect(engine.getCurrentNode()).toBe('spec')
    })

    it('fails when no edge exists', async () => {
      const success = await engine.transitionTo('end')
      expect(success).toBe(false)
      expect(engine.getCurrentNode()).toBe('start')
    })

    it('adds node to visited set', async () => {
      await engine.transitionTo('spec')
      const state = engine.getState()
      expect(state.visitedNodes.has('spec')).toBe(true)
    })

    it('adds to history', async () => {
      await engine.transitionTo('spec')
      const state = engine.getState()
      expect(state.history.length).toBeGreaterThan(0)
      expect(state.history[state.history.length - 1].node).toBe('spec')
    })
  })

  describe('loop handling', () => {
    beforeEach(async () => {
      engine.resetTo('spec_review')
      engine.updateContext({ lastReview: { verdict: 'needs_changes' } })
    })

    it('increments loop count on loop edge', async () => {
      await engine.transitionTo('spec')
      expect(engine.getLoopCount('spec_review', 'spec')).toBe(1)
    })

    it('blocks transition when max loops reached', async () => {
      // Transition 3 times to hit the limit
      for (let i = 0; i < 3; i++) {
        await engine.transitionTo('spec')
        engine.resetTo('spec_review')
      }

      // 4th transition should not be available
      const nextNodes = engine.getNextNodes()
      expect(nextNodes).not.toContain('spec')
    })

    it('resets loop count correctly', async () => {
      await engine.transitionTo('spec')
      expect(engine.getLoopCount('spec_review', 'spec')).toBe(1)

      engine.resetLoopCount('spec_review', 'spec')
      expect(engine.getLoopCount('spec_review', 'spec')).toBe(0)
    })
  })

  describe('condition evaluation', () => {
    it('evaluates simple equality', () => {
      engine.updateContext({ status: 'complete' })
      const result = engine.evaluateCondition({
        field: 'status',
        operator: '==',
        value: 'complete',
      })
      expect(result).toBe(true)
    })

    it('evaluates inequality', () => {
      engine.updateContext({ status: 'pending' })
      const result = engine.evaluateCondition({
        field: 'status',
        operator: '!=',
        value: 'complete',
      })
      expect(result).toBe(true)
    })

    it('evaluates numeric comparisons', () => {
      engine.updateContext({ score: 85 })

      expect(engine.evaluateCondition({ field: 'score', operator: '>=', value: 80 })).toBe(true)
      expect(engine.evaluateCondition({ field: 'score', operator: '>', value: 84 })).toBe(true)
      expect(engine.evaluateCondition({ field: 'score', operator: '<=', value: 90 })).toBe(true)
      expect(engine.evaluateCondition({ field: 'score', operator: '<', value: 86 })).toBe(true)
    })

    it('evaluates contains for strings', () => {
      engine.updateContext({ message: 'Hello World' })
      const result = engine.evaluateCondition({
        field: 'message',
        operator: 'contains',
        value: 'World',
      })
      expect(result).toBe(true)
    })

    it('evaluates contains for arrays', () => {
      engine.updateContext({ tags: ['red', 'green', 'blue'] })
      const result = engine.evaluateCondition({
        field: 'tags',
        operator: 'contains',
        value: 'green',
      })
      expect(result).toBe(true)
    })

    it('evaluates notContains', () => {
      engine.updateContext({ message: 'Hello World' })
      const result = engine.evaluateCondition({
        field: 'message',
        operator: 'notContains',
        value: 'Goodbye',
      })
      expect(result).toBe(true)
    })

    it('evaluates nested paths', () => {
      engine.updateContext({ user: { profile: { name: 'Alice' } } })
      const result = engine.evaluateCondition({
        field: 'user.profile.name',
        operator: '==',
        value: 'Alice',
      })
      expect(result).toBe(true)
    })

    it('evaluates compound AND conditions', () => {
      engine.updateContext({ status: 'complete', score: 90 })
      const result = engine.evaluateCondition({
        all: [
          { field: 'status', operator: '==', value: 'complete' },
          { field: 'score', operator: '>=', value: 85 },
        ],
      })
      expect(result).toBe(true)
    })

    it('fails compound AND when one is false', () => {
      engine.updateContext({ status: 'complete', score: 70 })
      const result = engine.evaluateCondition({
        all: [
          { field: 'status', operator: '==', value: 'complete' },
          { field: 'score', operator: '>=', value: 85 },
        ],
      })
      expect(result).toBe(false)
    })

    it('evaluates compound OR conditions', () => {
      engine.updateContext({ status: 'pending', score: 90 })
      const result = engine.evaluateCondition({
        any: [
          { field: 'status', operator: '==', value: 'complete' },
          { field: 'score', operator: '>=', value: 85 },
        ],
      })
      expect(result).toBe(true)
    })

    it('returns true for condition without field/operator', () => {
      const result = engine.evaluateCondition({})
      expect(result).toBe(true)
    })

    it('handles unknown operator gracefully', () => {
      engine.updateContext({ value: 5 })
      const result = engine.evaluateCondition({
        field: 'value',
        operator: 'unknown' as '==',
        value: 5,
      })
      expect(result).toBe(false)
    })
  })

  describe('isComplete', () => {
    it('returns true when at end node', () => {
      engine.resetTo('end')
      expect(engine.isComplete()).toBe(true)
    })

    it('returns true when no next node available', () => {
      engine.resetTo('pcb')
      // pcb has an edge to end, so it's not complete
      expect(engine.isComplete()).toBe(false)

      // but end has no outgoing edges
      engine.resetTo('end')
      expect(engine.isComplete()).toBe(true)
    })

    it('returns false when transitions available', () => {
      expect(engine.isComplete()).toBe(false)
    })
  })

  describe('context management', () => {
    it('updates context correctly', () => {
      engine.updateContext({ mode: 'vibe_it', spec: { status: 'complete' } })
      const state = engine.getState()
      expect(state.context.mode).toBe('vibe_it')
      expect((state.context.spec as Record<string, unknown>).status).toBe('complete')
    })

    it('merges context updates', () => {
      engine.updateContext({ mode: 'vibe_it' })
      engine.updateContext({ spec: { status: 'complete' } })
      const state = engine.getState()
      expect(state.context.mode).toBe('vibe_it')
      expect(state.context.spec).toBeDefined()
    })
  })
})
