import { describe, it, expect } from 'vitest'
import { calculateCost, calculateImageCost } from './pricing'

describe('pricing module', () => {
  describe('calculateCost', () => {
    describe('exact model matching', () => {
      it('should calculate cost for google/gemini-2.0-flash-001', () => {
        // 1M prompt tokens at $0.1/1M + 1M completion tokens at $0.4/1M = $0.5
        const cost = calculateCost('google/gemini-2.0-flash-001', 1_000_000, 1_000_000)

        expect(cost).toBeCloseTo(0.5)
      })

      it('should calculate cost for anthropic/claude-3-haiku', () => {
        // 1M prompt at $0.25/1M + 1M completion at $1.25/1M = $1.5
        const cost = calculateCost('anthropic/claude-3-haiku', 1_000_000, 1_000_000)

        expect(cost).toBeCloseTo(1.5)
      })

      it('should calculate cost for anthropic/claude-3-opus', () => {
        // 1M prompt at $15/1M + 1M completion at $75/1M = $90
        const cost = calculateCost('anthropic/claude-3-opus', 1_000_000, 1_000_000)

        expect(cost).toBeCloseTo(90)
      })

      it('should calculate cost for openai/gpt-4o', () => {
        // 1M prompt at $2.5/1M + 1M completion at $10/1M = $12.5
        const cost = calculateCost('openai/gpt-4o', 1_000_000, 1_000_000)

        expect(cost).toBeCloseTo(12.5)
      })

      it('should calculate cost for openai/gpt-4o-mini', () => {
        // 1M prompt at $0.15/1M + 1M completion at $0.6/1M = $0.75
        const cost = calculateCost('openai/gpt-4o-mini', 1_000_000, 1_000_000)

        expect(cost).toBeCloseTo(0.75)
      })
    })

    describe('versioned model matching (with suffix)', () => {
      it('should match model with :free suffix', () => {
        const cost = calculateCost('google/gemini-2.0-flash-001:free', 1_000_000, 1_000_000)

        expect(cost).toBeCloseTo(0.5)
      })

      it('should match model with :beta suffix', () => {
        const cost = calculateCost('google/gemini-2.0-flash:beta', 1_000_000, 1_000_000)

        expect(cost).toBeCloseTo(0.5)
      })
    })

    describe('vendor prefix fallback', () => {
      it('should fallback to vendor pricing for unknown Google model', () => {
        // Should use some Google model pricing
        const cost = calculateCost('google/unknown-model', 1_000_000, 1_000_000)

        // Should be > 0 since it matches google/ prefix
        expect(cost).toBeGreaterThan(0)
      })

      it('should fallback to vendor pricing for unknown Anthropic model', () => {
        const cost = calculateCost('anthropic/unknown-model', 1_000_000, 1_000_000)

        expect(cost).toBeGreaterThan(0)
      })

      it('should fallback to vendor pricing for unknown OpenAI model', () => {
        const cost = calculateCost('openai/unknown-model', 1_000_000, 1_000_000)

        expect(cost).toBeGreaterThan(0)
      })
    })

    describe('default fallback', () => {
      it('should use default pricing for completely unknown model', () => {
        // Default is $0.5/1M prompt + $1.5/1M completion = $2
        const cost = calculateCost('unknown-vendor/unknown-model', 1_000_000, 1_000_000)

        expect(cost).toBeCloseTo(2)
      })
    })

    describe('token calculations', () => {
      it('should calculate correctly for small token counts', () => {
        // 1000 prompt tokens at $0.1/1M + 1000 completion at $0.4/1M
        // = $0.0001 + $0.0004 = $0.0005
        const cost = calculateCost('google/gemini-2.0-flash-001', 1000, 1000)

        expect(cost).toBeCloseTo(0.0005)
      })

      it('should handle zero tokens', () => {
        const cost = calculateCost('google/gemini-2.0-flash-001', 0, 0)

        expect(cost).toBe(0)
      })

      it('should handle only prompt tokens', () => {
        const cost = calculateCost('google/gemini-2.0-flash-001', 1_000_000, 0)

        expect(cost).toBeCloseTo(0.1)
      })

      it('should handle only completion tokens', () => {
        const cost = calculateCost('google/gemini-2.0-flash-001', 0, 1_000_000)

        expect(cost).toBeCloseTo(0.4)
      })

      it('should calculate typical usage correctly', () => {
        // 2000 prompt tokens + 500 completion tokens
        // = (2000/1M * 0.1) + (500/1M * 0.4)
        // = 0.0002 + 0.0002 = 0.0004
        const cost = calculateCost('google/gemini-2.0-flash-001', 2000, 500)

        expect(cost).toBeCloseTo(0.0004)
      })
    })

    describe('all known models', () => {
      const knownModels = [
        'google/gemini-2.0-flash-001',
        'google/gemini-2.0-flash',
        'google/gemini-2.5-flash-preview',
        'google/gemini-3-flash-preview',
        'google/gemini-2.5-flash-image',
        'google/gemini-pro',
        'google/gemini-pro-1.5',
        'anthropic/claude-3-haiku',
        'anthropic/claude-3-sonnet',
        'anthropic/claude-3-opus',
        'anthropic/claude-3.5-sonnet',
        'openai/gpt-4o',
        'openai/gpt-4o-mini',
        'openai/gpt-4-turbo',
      ]

      it.each(knownModels)('should calculate cost for %s', (model) => {
        const cost = calculateCost(model, 1_000_000, 1_000_000)

        expect(cost).toBeGreaterThan(0)
        expect(cost).toBeLessThan(200) // Sanity check - no model should cost > $200 per 1M tokens
      })
    })
  })

  describe('calculateImageCost', () => {
    it('should return $0.002 for Gemini image models', () => {
      expect(calculateImageCost('google/gemini-2.5-flash-image')).toBe(0.002)
      expect(calculateImageCost('gemini-pro-vision')).toBe(0.002)
      expect(calculateImageCost('something-gemini-something')).toBe(0.002)
    })

    it('should return $0.04 for DALL-E 3', () => {
      expect(calculateImageCost('openai/dall-e-3')).toBe(0.04)
      expect(calculateImageCost('dall-e-3-hd')).toBe(0.04)
    })

    it('should return $0.02 for DALL-E 2', () => {
      expect(calculateImageCost('openai/dall-e-2')).toBe(0.02)
      expect(calculateImageCost('dall-e-2-512')).toBe(0.02)
    })

    it('should return $0.002 for Stable Diffusion', () => {
      expect(calculateImageCost('stable-diffusion-xl')).toBe(0.002)
      expect(calculateImageCost('stability/stable-diffusion-3')).toBe(0.002)
    })

    it('should return $0.01 for unknown image models', () => {
      expect(calculateImageCost('unknown-model')).toBe(0.01)
      expect(calculateImageCost('midjourney')).toBe(0.01)
    })

    it('should be case-sensitive in matching', () => {
      // Should still match because includes is case-sensitive
      // but the actual string contains lowercase
      expect(calculateImageCost('GEMINI-PRO')).toBe(0.01) // Uppercase won't match
    })
  })
})
