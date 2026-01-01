import { describe, it, expect } from 'vitest'
import { FINAL_SPEC_SYSTEM_PROMPT, buildFinalSpecPrompt } from './finalSpec'

describe('finalSpec prompt', () => {
  describe('FINAL_SPEC_SYSTEM_PROMPT', () => {
    it('should introduce PHAESTUS', () => {
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('PHAESTUS')
    })

    it('should list available components', () => {
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('ESP32-C6')
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('BME280')
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('WS2812B')
    })

    it('should describe output format', () => {
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('JSON')
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('name')
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('summary')
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('pcbSize')
    })

    it('should include BOM in output format', () => {
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('estimatedBOM')
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('unitCost')
    })

    it('should include enclosure specs', () => {
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('enclosure')
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('width')
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('height')
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('depth')
    })

    it('should include power specifications', () => {
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('power')
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('voltage')
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('current')
    })

    it('should contain guidelines', () => {
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('realistic PCB dimensions')
      expect(FINAL_SPEC_SYSTEM_PROMPT).toContain('ALL components in the BOM')
    })
  })

  describe('buildFinalSpecPrompt', () => {
    const description = 'A smart plant monitor'
    const feasibility = {
      overallScore: 85,
      manufacturable: true,
      inputs: { items: ['temperature sensor'] },
      outputs: { items: ['LED'] },
    }
    const decisions = [
      { question: 'What power source?', answer: 'LiPo battery' },
      { question: 'What enclosure?', answer: 'Compact handheld' },
    ]
    const blueprintPrompt = 'Sleek modern design with temperature sensor'

    it('should include original description', () => {
      const prompt = buildFinalSpecPrompt(description, feasibility, decisions, blueprintPrompt)

      expect(prompt).toContain('Original Description')
      expect(prompt).toContain(description)
    })

    it('should include feasibility as JSON', () => {
      const prompt = buildFinalSpecPrompt(description, feasibility, decisions, blueprintPrompt)

      expect(prompt).toContain('Feasibility Analysis')
      expect(prompt).toContain('"overallScore": 85')
    })

    it('should include user decisions', () => {
      const prompt = buildFinalSpecPrompt(description, feasibility, decisions, blueprintPrompt)

      expect(prompt).toContain('User Decisions')
      expect(prompt).toContain('What power source?')
      expect(prompt).toContain('LiPo battery')
    })

    it('should format decisions as bullet points', () => {
      const prompt = buildFinalSpecPrompt(description, feasibility, decisions, blueprintPrompt)

      expect(prompt).toContain('- What power source?: LiPo battery')
      expect(prompt).toContain('- What enclosure?: Compact handheld')
    })

    it('should include selected blueprint prompt', () => {
      const prompt = buildFinalSpecPrompt(description, feasibility, decisions, blueprintPrompt)

      expect(prompt).toContain('Selected Design Style')
      expect(prompt).toContain(blueprintPrompt)
    })

    it('should request final specification', () => {
      const prompt = buildFinalSpecPrompt(description, feasibility, decisions, blueprintPrompt)

      expect(prompt).toContain('Generate a complete product specification')
    })

    it('should ask for comprehensive and realistic estimates', () => {
      const prompt = buildFinalSpecPrompt(description, feasibility, decisions, blueprintPrompt)

      expect(prompt).toContain('comprehensive')
      expect(prompt).toContain('realistic')
    })

    it('should handle empty decisions', () => {
      const prompt = buildFinalSpecPrompt(description, feasibility, [], blueprintPrompt)

      expect(prompt).toContain('User Decisions')
    })

    it('should handle complex feasibility object', () => {
      const complexFeasibility = {
        communication: { type: 'WiFi + BLE', confidence: 95 },
        processing: { level: 'medium', confidence: 88 },
        power: { options: ['LiPo', 'USB', 'CR2032'] },
        nested: { value: [1, 2, 3] },
      }

      const prompt = buildFinalSpecPrompt(
        description,
        complexFeasibility,
        decisions,
        blueprintPrompt
      )

      expect(prompt).toContain('"communication"')
      expect(prompt).toContain('WiFi + BLE')
    })
  })
})
