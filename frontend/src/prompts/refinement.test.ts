import { describe, it, expect } from 'vitest'
import { REFINEMENT_SYSTEM_PROMPT, buildRefinementPrompt } from './refinement'

describe('refinement prompt', () => {
  describe('REFINEMENT_SYSTEM_PROMPT', () => {
    it('should introduce PHAESTUS', () => {
      expect(REFINEMENT_SYSTEM_PROMPT).toContain('PHAESTUS')
    })

    it('should contain question categories', () => {
      expect(REFINEMENT_SYSTEM_PROMPT).toContain('Power')
      expect(REFINEMENT_SYSTEM_PROMPT).toContain('Form Factor')
      expect(REFINEMENT_SYSTEM_PROMPT).toContain('Interface')
      expect(REFINEMENT_SYSTEM_PROMPT).toContain('Connectivity')
      expect(REFINEMENT_SYSTEM_PROMPT).toContain('Environment')
    })

    it('should contain JSON output format instructions', () => {
      expect(REFINEMENT_SYSTEM_PROMPT).toContain('JSON')
      expect(REFINEMENT_SYSTEM_PROMPT).toContain('complete')
      expect(REFINEMENT_SYSTEM_PROMPT).toContain('additionalQuestions')
    })

    it('should mention maximum 3 questions guideline', () => {
      expect(REFINEMENT_SYSTEM_PROMPT).toContain('Maximum 3 questions')
    })

    it('should describe both complete and incomplete states', () => {
      expect(REFINEMENT_SYSTEM_PROMPT).toContain('"complete": false')
      expect(REFINEMENT_SYSTEM_PROMPT).toContain('"complete": true')
    })
  })

  describe('buildRefinementPrompt', () => {
    const description = 'A smart plant monitor'
    const feasibility = {
      overallScore: 85,
      manufacturable: true,
      inputs: { items: ['temperature'] },
      outputs: { items: ['LED'] },
    }

    it('should include description', () => {
      const prompt = buildRefinementPrompt(description, feasibility, [])

      expect(prompt).toContain(description)
    })

    it('should include feasibility as JSON', () => {
      const prompt = buildRefinementPrompt(description, feasibility, [])

      expect(prompt).toContain('"overallScore": 85')
      expect(prompt).toContain('"manufacturable": true')
    })

    it('should include decisions when provided', () => {
      const decisions = [
        { question: 'What power source?', answer: 'LiPo battery' },
        { question: 'What size?', answer: 'Compact' },
      ]

      const prompt = buildRefinementPrompt(description, feasibility, decisions)

      expect(prompt).toContain('User Decisions Made')
      expect(prompt).toContain('What power source?')
      expect(prompt).toContain('LiPo battery')
      expect(prompt).toContain('What size?')
      expect(prompt).toContain('Compact')
    })

    it('should not include decisions section when empty', () => {
      const prompt = buildRefinementPrompt(description, feasibility, [])

      expect(prompt).not.toContain('User Decisions Made')
    })

    it('should format decisions as bullet points', () => {
      const decisions = [{ question: 'Q1', answer: 'A1' }]

      const prompt = buildRefinementPrompt(description, feasibility, decisions)

      expect(prompt).toContain('- Q1: A1')
    })

    it('should ask for JSON response', () => {
      const prompt = buildRefinementPrompt(description, feasibility, [])

      expect(prompt).toContain('Respond with JSON only')
    })

    it('should handle complex feasibility object', () => {
      const complexFeasibility = {
        communication: { type: 'WiFi', confidence: 90, notes: 'test' },
        processing: { level: 'low', confidence: 95, notes: 'test' },
        power: { options: ['LiPo', 'USB'], confidence: 85, notes: 'test' },
        nested: { deep: { value: 123 } },
      }

      const prompt = buildRefinementPrompt(description, complexFeasibility, [])

      expect(prompt).toContain('"communication"')
      expect(prompt).toContain('"WiFi"')
    })
  })
})
