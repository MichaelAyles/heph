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

    it('should include visible features from feasibility outputs', () => {
      const prompts = buildBlueprintPrompts(basicDescription, basicDecisions, basicFeasibility)

      // Should include visible elements like LEDs and displays
      prompts.forEach((prompt) => {
        expect(prompt.toLowerCase()).toContain('status led')
        expect(prompt.toLowerCase()).toContain('oled display')
      })
    })

    it('should include USB charging port when battery powered', () => {
      const prompts = buildBlueprintPrompts(basicDescription, basicDecisions, basicFeasibility)

      prompts.forEach((prompt) => {
        expect(prompt.toLowerCase()).toContain('usb-c charging port')
      })
    })

    it('should use enclosure decision if provided', () => {
      const prompts = buildBlueprintPrompts(basicDescription, basicDecisions, basicFeasibility)

      prompts.forEach((prompt) => {
        expect(prompt.toLowerCase()).toContain('compact handheld')
      })
    })

    it('should work without enclosure decision', () => {
      const prompts = buildBlueprintPrompts(basicDescription, [], basicFeasibility)

      // Should still generate valid prompts
      expect(prompts).toHaveLength(4)
      prompts.forEach((prompt) => {
        expect(prompt.toLowerCase()).toContain('smart plant monitor')
      })
    })

    it('should have distinct styles for each variation', () => {
      const prompts = buildBlueprintPrompts(basicDescription, basicDecisions, basicFeasibility)

      expect(prompts[0].toLowerCase()).toContain('minimal')
      expect(prompts[1].toLowerCase()).toContain('friendly')
      expect(prompts[2].toLowerCase()).toContain('rugged')
      expect(prompts[3].toLowerCase()).toContain('premium')
    })

    it('should include "No text" in all prompts', () => {
      const prompts = buildBlueprintPrompts(basicDescription, basicDecisions, basicFeasibility)

      prompts.forEach((prompt) => {
        expect(prompt).toContain('No text')
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

    it('should find housing question phrasing', () => {
      const decisions = [{ question: 'What housing style?', answer: 'Weatherproof box' }]

      const prompts = buildBlueprintPrompts(basicDescription, decisions, {})

      prompts.forEach((prompt) => {
        expect(prompt.toLowerCase()).toContain('weatherproof box')
      })
    })

    it('should include display decision in visual features', () => {
      const decisions = [{ question: 'What display type?', answer: 'E-ink screen' }]

      const prompts = buildBlueprintPrompts(basicDescription, decisions, {})

      prompts.forEach((prompt) => {
        expect(prompt.toLowerCase()).toContain('e-ink screen')
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
