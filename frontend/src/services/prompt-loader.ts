/**
 * Prompt Loader Service
 *
 * Loads orchestrator prompts from the database with fallback to hardcoded defaults.
 * This enables runtime editing of prompts via the admin UI while ensuring
 * backward compatibility during migration.
 */

import {
  ORCHESTRATOR_SYSTEM_PROMPT,
} from '@/prompts/orchestrator'
import {
  FEASIBILITY_SYSTEM_PROMPT,
} from '@/prompts/feasibility'
import {
  ENCLOSURE_SYSTEM_PROMPT,
  ENCLOSURE_VISION_SYSTEM_PROMPT,
} from '@/prompts/enclosure'
import {
  FIRMWARE_SYSTEM_PROMPT,
} from '@/prompts/firmware'
import {
  ENCLOSURE_REVIEW_PROMPT,
  FIRMWARE_REVIEW_PROMPT,
} from '@/prompts/review'
import {
  NAMING_SYSTEM_PROMPT,
} from '@/prompts/naming'

// Hardcoded fallback prompts
const HARDCODED_PROMPTS: Record<string, string> = {
  orchestrator: ORCHESTRATOR_SYSTEM_PROMPT,
  feasibility: FEASIBILITY_SYSTEM_PROMPT,
  enclosure: ENCLOSURE_SYSTEM_PROMPT,
  enclosure_vision: ENCLOSURE_VISION_SYSTEM_PROMPT,
  firmware: FIRMWARE_SYSTEM_PROMPT,
  naming: NAMING_SYSTEM_PROMPT,
  enclosure_review: ENCLOSURE_REVIEW_PROMPT,
  firmware_review: FIRMWARE_REVIEW_PROMPT,
}

// Cache for loaded prompts (session-scoped)
const promptCache = new Map<string, { prompt: string; source: 'database' | 'hardcoded'; loadedAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Load a prompt by node name.
 * Tries database first, falls back to hardcoded defaults.
 */
export async function loadPrompt(nodeName: string): Promise<string> {
  // Check cache first
  const cached = promptCache.get(nodeName)
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.prompt
  }

  try {
    const response = await fetch(`/api/orchestrator/prompts/${nodeName}`)
    if (response.ok) {
      const data = await response.json() as { systemPrompt: string; source: 'database' | 'hardcoded' }
      promptCache.set(nodeName, {
        prompt: data.systemPrompt,
        source: data.source,
        loadedAt: Date.now(),
      })
      return data.systemPrompt
    }
  } catch (error) {
    console.warn(`Failed to load prompt from API for ${nodeName}:`, error)
  }

  // Fall back to hardcoded
  const hardcoded = HARDCODED_PROMPTS[nodeName]
  if (hardcoded) {
    promptCache.set(nodeName, {
      prompt: hardcoded,
      source: 'hardcoded',
      loadedAt: Date.now(),
    })
    return hardcoded
  }

  throw new Error(`No prompt found for node: ${nodeName}`)
}

/**
 * Get the hardcoded default for a prompt.
 * Used for reset functionality in the admin UI.
 */
export function getHardcodedPrompt(nodeName: string): string | undefined {
  return HARDCODED_PROMPTS[nodeName]
}

/**
 * Check if a node has a hardcoded default available.
 */
export function hasHardcodedDefault(nodeName: string): boolean {
  return nodeName in HARDCODED_PROMPTS
}

/**
 * Clear the prompt cache (e.g., after editing a prompt).
 */
export function clearPromptCache(nodeName?: string): void {
  if (nodeName) {
    promptCache.delete(nodeName)
  } else {
    promptCache.clear()
  }
}

/**
 * Preload all prompts into cache.
 * Useful for initializing the orchestrator.
 */
export async function preloadPrompts(): Promise<void> {
  const nodeNames = Object.keys(HARDCODED_PROMPTS)
  await Promise.all(nodeNames.map(loadPrompt))
}

/**
 * Get all available node names.
 */
export function getAvailableNodes(): string[] {
  return Object.keys(HARDCODED_PROMPTS)
}
