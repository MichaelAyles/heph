import { describe, it, expect } from 'vitest'
import { FEASIBILITY_SYSTEM_PROMPT, buildFeasibilityPrompt } from './feasibility'

describe('feasibility prompt', () => {
  describe('FEASIBILITY_SYSTEM_PROMPT', () => {
    it('should contain available components', () => {
      expect(FEASIBILITY_SYSTEM_PROMPT).toContain('ESP32-C6')
      expect(FEASIBILITY_SYSTEM_PROMPT).toContain('BME280')
      expect(FEASIBILITY_SYSTEM_PROMPT).toContain('WS2812B')
    })

    it('should contain hard rejection criteria', () => {
      expect(FEASIBILITY_SYSTEM_PROMPT).toContain('FPGA')
      expect(FEASIBILITY_SYSTEM_PROMPT).toContain('High voltage')
      expect(FEASIBILITY_SYSTEM_PROMPT).toContain('Healthcare')
    })

    it('should contain output format instructions', () => {
      expect(FEASIBILITY_SYSTEM_PROMPT).toContain('JSON')
      expect(FEASIBILITY_SYSTEM_PROMPT).toContain('overallScore')
      expect(FEASIBILITY_SYSTEM_PROMPT).toContain('manufacturable')
    })

    it('should contain confidence scoring guidelines', () => {
      expect(FEASIBILITY_SYSTEM_PROMPT).toContain('90-100')
      expect(FEASIBILITY_SYSTEM_PROMPT).toContain('70-89')
      expect(FEASIBILITY_SYSTEM_PROMPT).toContain('50-69')
    })
  })

  describe('buildFeasibilityPrompt', () => {
    it('should include the product description', () => {
      const description = 'A smart plant monitor with WiFi'
      const result = buildFeasibilityPrompt(description)

      expect(result).toContain(description)
    })

    it('should wrap description in quotes', () => {
      const description = 'A temperature sensor'
      const result = buildFeasibilityPrompt(description)

      expect(result).toContain(`"${description}"`)
    })

    it('should ask for JSON response', () => {
      const result = buildFeasibilityPrompt('any description')

      expect(result).toContain('Respond with JSON only')
    })

    it('should mention feasibility analysis', () => {
      const result = buildFeasibilityPrompt('any description')

      expect(result).toContain('feasibility')
    })

    it('should handle empty description', () => {
      const result = buildFeasibilityPrompt('')

      expect(result).toContain('""')
    })

    it('should handle description with special characters', () => {
      const description = 'A device with "quotes" and \\ backslashes'
      const result = buildFeasibilityPrompt(description)

      expect(result).toContain(description)
    })
  })
})
