import { describe, it, expect } from 'vitest'
import { convertToGeminiFormat, estimateTokenCount } from './gemini'

describe('gemini utilities', () => {
  describe('convertToGeminiFormat', () => {
    it('should convert user messages', () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }]
      const result = convertToGeminiFormat(messages)

      expect(result).toEqual([{ role: 'user', parts: [{ text: 'Hello' }] }])
    })

    it('should convert assistant messages to model role', () => {
      const messages = [{ role: 'assistant' as const, content: 'Hi there!' }]
      const result = convertToGeminiFormat(messages)

      expect(result).toEqual([{ role: 'model', parts: [{ text: 'Hi there!' }] }])
    })

    it('should convert system messages to user+model pair', () => {
      const messages = [{ role: 'system' as const, content: 'You are helpful' }]
      const result = convertToGeminiFormat(messages)

      expect(result).toEqual([
        { role: 'user', parts: [{ text: 'You are helpful' }] },
        { role: 'model', parts: [{ text: 'Understood.' }] },
      ])
    })

    it('should handle mixed message types', () => {
      const messages = [
        { role: 'system' as const, content: 'Be helpful' },
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi!' },
        { role: 'user' as const, content: 'How are you?' },
      ]
      const result = convertToGeminiFormat(messages)

      expect(result).toEqual([
        { role: 'user', parts: [{ text: 'Be helpful' }] },
        { role: 'model', parts: [{ text: 'Understood.' }] },
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi!' }] },
        { role: 'user', parts: [{ text: 'How are you?' }] },
      ])
    })

    it('should handle empty messages array', () => {
      const result = convertToGeminiFormat([])
      expect(result).toEqual([])
    })

    it('should handle multiple system messages', () => {
      const messages = [
        { role: 'system' as const, content: 'First instruction' },
        { role: 'system' as const, content: 'Second instruction' },
      ]
      const result = convertToGeminiFormat(messages)

      // Each system message gets prepended, so order is reversed
      expect(result.length).toBe(4)
      expect(result[0].role).toBe('user')
      expect(result[1].role).toBe('model')
    })
  })

  describe('estimateTokenCount', () => {
    it('should estimate tokens at ~4 chars per token', () => {
      expect(estimateTokenCount('abcd')).toBe(1)
      expect(estimateTokenCount('abcdefgh')).toBe(2)
      expect(estimateTokenCount('a')).toBe(1) // rounds up
    })

    it('should handle empty string', () => {
      expect(estimateTokenCount('')).toBe(0)
    })

    it('should handle long strings', () => {
      const text = 'a'.repeat(1000)
      expect(estimateTokenCount(text)).toBe(250)
    })

    it('should round up partial tokens', () => {
      expect(estimateTokenCount('abc')).toBe(1) // 3/4 = 0.75, rounds up to 1
      expect(estimateTokenCount('abcde')).toBe(2) // 5/4 = 1.25, rounds up to 2
    })
  })
})
