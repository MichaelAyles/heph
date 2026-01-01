import { describe, it, expect } from 'vitest'
import { REQUIREMENTS_SYSTEM_PROMPT, buildRequirementsPrompt } from './requirements'

describe('requirements prompt', () => {
  describe('REQUIREMENTS_SYSTEM_PROMPT', () => {
    it('should introduce PHAESTUS', () => {
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('PHAESTUS')
    })

    it('should list available MCU', () => {
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('ESP32-C6')
    })

    it('should list available sensors', () => {
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('BME280')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('SHT40')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('LIS3DH')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('VEML7700')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('VL53L0X')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('PIR')
    })

    it('should list available outputs', () => {
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('WS2812B')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('piezo')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('relay')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('motor driver')
    })

    it('should contain output format instructions', () => {
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('JSON')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('requirements')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('suggestedName')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('summary')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('clarifications')
    })

    it('should list requirement categories', () => {
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('power')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('connectivity')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('sensors')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('outputs')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('interface')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('environment')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('mechanical')
    })

    it('should list priority levels', () => {
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('critical')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('high')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('medium')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('low')
    })

    it('should contain guidelines', () => {
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('Extract ALL requirements')
      expect(REQUIREMENTS_SYSTEM_PROMPT).toContain('Infer reasonable requirements')
    })
  })

  describe('buildRequirementsPrompt', () => {
    it('should include the product description', () => {
      const description = 'A smart irrigation controller'
      const result = buildRequirementsPrompt(description)

      expect(result).toContain(description)
    })

    it('should wrap description in quotes', () => {
      const description = 'A weather station'
      const result = buildRequirementsPrompt(description)

      expect(result).toContain(`"${description}"`)
    })

    it('should ask for JSON response only', () => {
      const result = buildRequirementsPrompt('any description')

      expect(result).toContain('JSON object only')
      expect(result).toContain('no additional text')
    })

    it('should mention extract requirements', () => {
      const result = buildRequirementsPrompt('any description')

      expect(result).toContain('Extract requirements')
    })

    it('should handle empty description', () => {
      const result = buildRequirementsPrompt('')

      expect(result).toContain('""')
    })

    it('should handle multiline description', () => {
      const description = 'Line 1\nLine 2\nLine 3'
      const result = buildRequirementsPrompt(description)

      expect(result).toContain(description)
    })
  })
})
