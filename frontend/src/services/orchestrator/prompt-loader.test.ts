/**
 * Tests for prompt-loader.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { loadPrompt, loadPrompts, invalidateCache, getCacheStatus, preloadPrompts } from './prompt-loader'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

const mockPromptRow = {
  id: 'test-1',
  node_name: 'feasibility',
  display_name: 'Feasibility Analyzer',
  description: 'Analyzes feasibility',
  system_prompt: 'You are a feasibility analyzer...',
  category: 'agent',
  stage: 'spec',
  is_active: 1,
  token_estimate: 500,
  version: 1,
  context_tags: '["spec", "analysis"]',
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  input_schema: '{"type": "object"}',
  output_schema: '{"type": "object"}',
  context_selector: '["description"]',
  iteration_config: '{"maxAttempts": 3}',
  user_prompt_template: 'Analyze: {{description}}',
  output_format: 'json',
}

describe('prompt-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateCache() // Clear cache before each test
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('loadPrompt', () => {
    it('fetches prompt from API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPromptRow),
      })

      const prompt = await loadPrompt('feasibility')

      expect(mockFetch).toHaveBeenCalledWith('/api/orchestrator/prompts/feasibility')
      expect(prompt).toBeDefined()
      expect(prompt?.nodeName).toBe('feasibility')
      expect(prompt?.displayName).toBe('Feasibility Analyzer')
    })

    it('transforms row fields correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPromptRow),
      })

      const prompt = await loadPrompt('feasibility')

      expect(prompt?.contextTags).toEqual(['spec', 'analysis'])
      expect(prompt?.inputSchema).toEqual({ type: 'object' })
      expect(prompt?.outputSchema).toEqual({ type: 'object' })
      expect(prompt?.contextSelector).toEqual(['description'])
      expect(prompt?.iterationConfig).toEqual({ maxAttempts: 3 })
      expect(prompt?.userPromptTemplate).toBe('Analyze: {{description}}')
      expect(prompt?.outputFormat).toBe('json')
    })

    it('returns cached prompt on second call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPromptRow),
      })

      await loadPrompt('feasibility')
      await loadPrompt('feasibility')

      expect(mockFetch).toHaveBeenCalledTimes(1) // Only fetched once
    })

    it('bypasses cache with forceRefresh', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPromptRow),
      })

      await loadPrompt('feasibility')
      await loadPrompt('feasibility', true)

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('returns fallback for orchestrator prompt on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const prompt = await loadPrompt('orchestrator')

      expect(prompt).toBeDefined()
      expect(prompt?.nodeName).toBe('orchestrator')
      expect(prompt?.id).toBe('fallback-orchestrator')
    })

    it('returns fallback for feasibility prompt on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const prompt = await loadPrompt('feasibility')

      expect(prompt).toBeDefined()
      expect(prompt?.nodeName).toBe('feasibility')
      expect(prompt?.id).toBe('fallback-feasibility')
    })

    it('returns null for unknown prompt on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const prompt = await loadPrompt('unknown-prompt')

      expect(prompt).toBeNull()
    })

    it('handles fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const prompt = await loadPrompt('orchestrator')

      // Should fall back to hardcoded prompt
      expect(prompt).toBeDefined()
      expect(prompt?.id).toBe('fallback-orchestrator')
    })
  })

  describe('loadPrompts', () => {
    it('loads multiple prompts in parallel', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPromptRow),
      })

      const prompts = await loadPrompts(['feasibility', 'enclosure', 'firmware'])

      expect(prompts.size).toBe(3)
      expect(prompts.has('feasibility')).toBe(true)
    })

    it('uses cache for already-loaded prompts', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPromptRow),
      })

      // Load feasibility first
      await loadPrompt('feasibility')

      // Then load multiple including feasibility
      await loadPrompts(['feasibility', 'enclosure'])

      // Should only fetch enclosure (feasibility was cached)
      expect(mockFetch).toHaveBeenCalledTimes(2) // 1 for initial + 1 for enclosure
    })

    it('omits prompts that fail to load without fallback', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPromptRow),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        })

      const prompts = await loadPrompts(['feasibility', 'unknown-no-fallback'])

      // feasibility loaded, unknown-no-fallback has no fallback so returns null (omitted)
      expect(prompts.size).toBe(1)
      expect(prompts.has('feasibility')).toBe(true)
      expect(prompts.has('unknown-no-fallback')).toBe(false)
    })
  })

  describe('cache management', () => {
    it('invalidates specific prompt from cache', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPromptRow),
      })

      await loadPrompt('feasibility')
      invalidateCache('feasibility')
      await loadPrompt('feasibility')

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('invalidates entire cache', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPromptRow),
      })

      await loadPrompt('feasibility')
      await loadPrompt('enclosure')

      const statusBefore = getCacheStatus()
      expect(statusBefore.size).toBe(2)

      invalidateCache()

      const statusAfter = getCacheStatus()
      expect(statusAfter.size).toBe(0)
    })

    it('returns cache status correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPromptRow),
      })

      await loadPrompt('feasibility')
      await loadPrompt('enclosure')

      const status = getCacheStatus()

      expect(status.size).toBe(2)
      expect(status.entries.some((e) => e.nodeName === 'feasibility')).toBe(true)
      expect(status.entries.some((e) => e.nodeName === 'enclosure')).toBe(true)
    })
  })

  describe('preloadPrompts', () => {
    it('preloads common prompts', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPromptRow),
      })

      // Spy on console.log to verify preload message
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await preloadPrompts()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Preloaded'))
    })

    it('handles preload errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Should not throw
      await preloadPrompts()

      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })
})
