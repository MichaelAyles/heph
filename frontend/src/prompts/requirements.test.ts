import { describe, it, expect } from 'vitest'
import { buildRequirementsPrompt } from './requirements'

// NOTE: REQUIREMENTS_SYSTEM_PROMPT has been moved to database (orchestrator_prompts table)
// System prompt tests should be performed against the database content, not hardcoded values

describe('requirements prompt', () => {
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
