import { describe, it, expect } from 'vitest'
import { buildBlueprintPrompts, buildSingleBlueprintPrompt } from './blueprint'

describe('blueprint prompt', () => {
  describe('buildBlueprintPrompts', () => {
    const basicDescription = 'A smart plant monitor'
    const basicDecisions = [
      { question: 'What enclosure style?', answer: 'Compact handheld' },
      { question: 'What power source?', answer: 'LiPo battery' },
    ]
    const basicFeasibility = {
      inputs: { items: ['Temperature sensor', 'Humidity sensor'] },
      outputs: { items: ['Status LED', 'OLED display'] },
      power: { options: ['LiPo battery', 'USB power'] },
    }

    it('should return 4 variations', () => {
      const prompts = buildBlueprintPrompts(basicDescription, basicDecisions, basicFeasibility)

      expect(prompts).toHaveLength(4)
    })

    it('should include description in all prompts', () => {
      const prompts = buildBlueprintPrompts(basicDescription, basicDecisions, basicFeasibility)

      prompts.forEach((prompt) => {
        expect(prompt.toLowerCase()).toContain('smart plant monitor')
      })
    })

    it('should include features from feasibility inputs', () => {
      const prompts = buildBlueprintPrompts(basicDescription, basicDecisions, basicFeasibility)

      prompts.forEach((prompt) => {
        expect(prompt.toLowerCase()).toContain('temperature sensor')
        expect(prompt.toLowerCase()).toContain('humidity sensor')
      })
    })

    it('should include features from feasibility outputs', () => {
      const prompts = buildBlueprintPrompts(basicDescription, basicDecisions, basicFeasibility)

      prompts.forEach((prompt) => {
        expect(prompt.toLowerCase()).toContain('status led')
        expect(prompt.toLowerCase()).toContain('oled display')
      })
    })

    it('should use enclosure decision if provided', () => {
      const prompts = buildBlueprintPrompts(basicDescription, basicDecisions, basicFeasibility)

      prompts.forEach((prompt) => {
        expect(prompt.toLowerCase()).toContain('compact handheld')
      })
    })

    it('should use default enclosure if no decision provided', () => {
      const prompts = buildBlueprintPrompts(basicDescription, [], basicFeasibility)

      prompts.forEach((prompt) => {
        expect(prompt.toLowerCase()).toContain('compact handheld device')
      })
    })

    it('should have distinct styles for each variation', () => {
      const prompts = buildBlueprintPrompts(basicDescription, basicDecisions, basicFeasibility)

      expect(prompts[0]).toContain('minimal')
      expect(prompts[1]).toContain('Rounded corners')
      expect(prompts[2]).toContain('Industrial')
      expect(prompts[3]).toContain('Sleek modern')
    })

    it('should include "No text or labels" in all prompts', () => {
      const prompts = buildBlueprintPrompts(basicDescription, basicDecisions, basicFeasibility)

      prompts.forEach((prompt) => {
        expect(prompt).toContain('No text or labels')
      })
    })

    it('should handle empty feasibility inputs/outputs', () => {
      const emptyFeasibility = {
        inputs: { items: [] },
        outputs: { items: [] },
        power: { options: [] },
      }

      const prompts = buildBlueprintPrompts(basicDescription, [], emptyFeasibility)

      expect(prompts).toHaveLength(4)
    })

    it('should handle missing feasibility properties', () => {
      const prompts = buildBlueprintPrompts(basicDescription, [], {})

      expect(prompts).toHaveLength(4)
    })

    it('should find form factor question in various phrasings', () => {
      const decisions = [{ question: 'What form factor do you want?', answer: 'Wall-mounted' }]

      const prompts = buildBlueprintPrompts(basicDescription, decisions, {})

      prompts.forEach((prompt) => {
        expect(prompt.toLowerCase()).toContain('wall-mounted')
      })
    })

    it('should find style question in various phrasings', () => {
      const decisions = [{ question: 'What style of device?', answer: 'Desktop stand' }]

      const prompts = buildBlueprintPrompts(basicDescription, decisions, {})

      prompts.forEach((prompt) => {
        expect(prompt.toLowerCase()).toContain('desktop stand')
      })
    })
  })

  describe('buildSingleBlueprintPrompt', () => {
    const description = 'A temperature logger'
    const features = ['temperature sensor', 'SD card', 'battery']

    it('should include description', () => {
      const prompt = buildSingleBlueprintPrompt(description, 'minimal', features)

      expect(prompt).toContain(description)
    })

    it('should include all features', () => {
      const prompt = buildSingleBlueprintPrompt(description, 'minimal', features)

      features.forEach((feature) => {
        expect(prompt).toContain(feature)
      })
    })

    it('should apply minimal style', () => {
      const prompt = buildSingleBlueprintPrompt(description, 'minimal', features)

      expect(prompt).toContain('Clean minimal design')
      expect(prompt).toContain('white background')
    })

    it('should apply rounded style', () => {
      const prompt = buildSingleBlueprintPrompt(description, 'rounded', features)

      expect(prompt).toContain('Rounded corners')
      expect(prompt).toContain('friendly approachable')
    })

    it('should apply industrial style', () => {
      const prompt = buildSingleBlueprintPrompt(description, 'industrial', features)

      expect(prompt).toContain('Industrial design')
      expect(prompt).toContain('mounting points')
    })

    it('should apply sleek style', () => {
      const prompt = buildSingleBlueprintPrompt(description, 'sleek', features)

      expect(prompt).toContain('Sleek modern')
      expect(prompt).toContain('dark background')
    })

    it('should include "No text or labels"', () => {
      const prompt = buildSingleBlueprintPrompt(description, 'minimal', features)

      expect(prompt).toContain('No text or labels')
    })

    it('should handle empty features array', () => {
      const prompt = buildSingleBlueprintPrompt(description, 'minimal', [])

      expect(prompt).toContain(description)
      expect(prompt).toContain('Features:')
    })
  })
})
