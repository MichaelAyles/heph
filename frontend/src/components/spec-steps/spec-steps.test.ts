import { describe, it, expect } from 'vitest'
import { STEPS } from './types'

describe('spec-steps types', () => {
  describe('STEPS constant', () => {
    it('should have 5 steps', () => {
      expect(STEPS).toHaveLength(5)
    })

    it('should have correct step ids in order', () => {
      expect(STEPS.map(s => s.id)).toEqual([
        'feasibility',
        'refine',
        'blueprints',
        'select',
        'finalize',
      ])
    })

    it('should have correct step names', () => {
      expect(STEPS.map(s => s.name)).toEqual([
        'Feasibility',
        'Refine',
        'Blueprints',
        'Select',
        'Finalize',
      ])
    })
  })
})

describe('StepIndicator', () => {
  // Integration tests would require react-testing-library setup
  // These are type/structure tests
  it('should export correct interface for StepIndicatorProps', () => {
    // Type check - if this compiles, the types are correct
    const props: import('./types').StepIndicatorProps = {
      currentStep: 0,
      status: 'analyzing',
    }
    expect(props.currentStep).toBe(0)
    expect(props.status).toBe('analyzing')
  })
})

describe('FeasibilityStepProps', () => {
  it('should have correct shape', () => {
    // Type validation
    const props: Partial<import('./types').FeasibilityStepProps> = {
      onComplete: () => {},
      onReject: () => {},
    }
    expect(props.onComplete).toBeDefined()
    expect(props.onReject).toBeDefined()
  })
})

describe('RefinementStepProps', () => {
  it('should have correct shape', () => {
    const props: Partial<import('./types').RefinementStepProps> = {
      onDecisions: () => {},
      onComplete: () => {},
    }
    expect(props.onDecisions).toBeDefined()
    expect(props.onComplete).toBeDefined()
  })
})

describe('BlueprintStepProps', () => {
  it('should have correct shape', () => {
    const props: Partial<import('./types').BlueprintStepProps> = {
      onComplete: () => {},
    }
    expect(props.onComplete).toBeDefined()
  })
})

describe('SelectionStepProps', () => {
  it('should have correct shape', () => {
    const props: Partial<import('./types').SelectionStepProps> = {
      blueprints: [{ url: 'test.png', prompt: 'test' }],
      onSelect: () => {},
      onRegenerate: async () => {},
    }
    expect(props.blueprints).toHaveLength(1)
    expect(props.onSelect).toBeDefined()
    expect(props.onRegenerate).toBeDefined()
  })
})

describe('FinalizationStepProps', () => {
  it('should have correct shape', () => {
    const props: Partial<import('./types').FinalizationStepProps> = {
      onComplete: () => {},
    }
    expect(props.onComplete).toBeDefined()
  })
})

describe('SuggestedRevisions', () => {
  it('should have correct shape', () => {
    const revisions: import('./types').SuggestedRevisions = {
      summary: 'Test summary',
      changes: ['Change 1', 'Change 2'],
      revisedDescription: 'Revised description',
    }
    expect(revisions.summary).toBe('Test summary')
    expect(revisions.changes).toHaveLength(2)
    expect(revisions.revisedDescription).toBe('Revised description')
  })
})
