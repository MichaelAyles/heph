/**
 * Prompt Loader Service
 *
 * Loads orchestrator prompts from the database with caching.
 * Falls back to hardcoded prompts for backward compatibility.
 */

import type { EnhancedOrchestratorPrompt } from '../../schemas/orchestrator-node'

// Hardcoded fallback prompts (imported for backward compatibility)
import { ORCHESTRATOR_SYSTEM_PROMPT } from '../../prompts/orchestrator'
import { FEASIBILITY_SYSTEM_PROMPT } from '../../prompts/feasibility'

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

const CACHE_TTL_MS = 60 * 1000 // 60 seconds

interface CacheEntry {
  prompt: EnhancedOrchestratorPrompt
  fetchedAt: number
}

const promptCache = new Map<string, CacheEntry>()

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Load a prompt from the database by node name.
 * Uses a 60-second TTL cache to minimize API calls.
 *
 * @param nodeName - The unique node identifier (e.g., 'feasibility', 'enclosure')
 * @param forceRefresh - Skip cache and fetch fresh
 * @returns The prompt definition, or null if not found
 */
export async function loadPrompt(
  nodeName: string,
  forceRefresh = false
): Promise<EnhancedOrchestratorPrompt | null> {
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = promptCache.get(nodeName)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.prompt
    }
  }

  try {
    const response = await fetch(`/api/orchestrator/prompts/${nodeName}`)

    if (!response.ok) {
      if (response.status === 404) {
        // Prompt not found in DB, try fallback
        return getFallbackPrompt(nodeName)
      }
      console.error(`Failed to load prompt ${nodeName}: ${response.status}`)
      return getFallbackPrompt(nodeName)
    }

    const data = await response.json()
    const prompt = transformRowToEnhanced(data)

    // Cache the result
    promptCache.set(nodeName, {
      prompt,
      fetchedAt: Date.now(),
    })

    return prompt
  } catch (error) {
    console.error(`Error loading prompt ${nodeName}:`, error)
    return getFallbackPrompt(nodeName)
  }
}

/**
 * Load multiple prompts at once.
 * More efficient than loading individually when multiple are needed.
 *
 * @param nodeNames - Array of node names to load
 * @returns Map of node name to prompt (missing prompts omitted)
 */
export async function loadPrompts(
  nodeNames: string[]
): Promise<Map<string, EnhancedOrchestratorPrompt>> {
  const results = new Map<string, EnhancedOrchestratorPrompt>()
  const toFetch: string[] = []

  // Check cache for each
  for (const nodeName of nodeNames) {
    const cached = promptCache.get(nodeName)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      results.set(nodeName, cached.prompt)
    } else {
      toFetch.push(nodeName)
    }
  }

  // Fetch remaining in parallel
  if (toFetch.length > 0) {
    const fetchPromises = toFetch.map((name) => loadPrompt(name))
    const fetched = await Promise.all(fetchPromises)

    for (let i = 0; i < toFetch.length; i++) {
      const prompt = fetched[i]
      if (prompt) {
        results.set(toFetch[i], prompt)
      }
    }
  }

  return results
}

/**
 * Invalidate the cache for a specific prompt or all prompts.
 *
 * @param nodeName - Specific node to invalidate, or undefined for all
 */
export function invalidateCache(nodeName?: string): void {
  if (nodeName) {
    promptCache.delete(nodeName)
  } else {
    promptCache.clear()
  }
}

/**
 * Get cache status for debugging.
 */
export function getCacheStatus(): {
  size: number
  entries: Array<{ nodeName: string; age: number }>
} {
  const now = Date.now()
  const entries: Array<{ nodeName: string; age: number }> = []

  for (const [nodeName, entry] of promptCache) {
    entries.push({
      nodeName,
      age: Math.round((now - entry.fetchedAt) / 1000),
    })
  }

  return { size: promptCache.size, entries }
}

// =============================================================================
// TRANSFORM HELPERS
// =============================================================================

/**
 * Transform a database row to an EnhancedOrchestratorPrompt.
 */
function transformRowToEnhanced(row: Record<string, unknown>): EnhancedOrchestratorPrompt {
  return {
    id: String(row.id || ''),
    nodeName: String(row.node_name || row.nodeName || ''),
    displayName: String(row.display_name || row.displayName || ''),
    description: row.description as string | null,
    systemPrompt: String(row.system_prompt || row.systemPrompt || ''),
    category: (row.category || 'agent') as 'agent' | 'generator' | 'reviewer',
    stage: row.stage as 'spec' | 'pcb' | 'enclosure' | 'firmware' | null,
    isActive: row.is_active === 1 || row.isActive === true,
    tokenEstimate: typeof row.token_estimate === 'number' ? row.token_estimate : (row.tokenEstimate as number | null),
    version: typeof row.version === 'number' ? row.version : 1,
    contextTags: parseJsonField(row.context_tags || row.contextTags, []),
    createdAt: String(row.created_at || row.createdAt || new Date().toISOString()),
    updatedAt: String(row.updated_at || row.updatedAt || new Date().toISOString()),

    // Enhanced fields
    inputSchema: parseJsonField(row.input_schema || row.inputSchema, null),
    outputSchema: parseJsonField(row.output_schema || row.outputSchema, null),
    contextSelector: parseJsonField(row.context_selector || row.contextSelector, null),
    iterationConfig: parseJsonField(row.iteration_config || row.iterationConfig, null),
    userPromptTemplate: (row.user_prompt_template || row.userPromptTemplate) as string | null,
    outputFormat: (row.output_format || row.outputFormat || 'json') as 'json' | 'code' | 'text' | 'image_prompt',
  }
}

/**
 * Parse a JSON field that may be a string or already parsed.
 */
function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

// =============================================================================
// FALLBACK PROMPTS
// =============================================================================

/**
 * Hardcoded fallback prompts for backward compatibility.
 * Used when database prompts are unavailable.
 */
const FALLBACK_PROMPTS: Record<string, Partial<EnhancedOrchestratorPrompt>> = {
  orchestrator: {
    id: 'fallback-orchestrator',
    nodeName: 'orchestrator',
    displayName: 'Orchestrator Agent',
    systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
    category: 'agent',
    stage: null,
    contextSelector: ['*'],
    outputFormat: 'json',
  },
  feasibility: {
    id: 'fallback-feasibility',
    nodeName: 'feasibility',
    displayName: 'Feasibility Analyzer',
    systemPrompt: FEASIBILITY_SYSTEM_PROMPT,
    category: 'agent',
    stage: 'spec',
    contextSelector: ['description'],
    outputFormat: 'json',
  },
}

/**
 * Get a fallback prompt if the database is unavailable.
 */
function getFallbackPrompt(nodeName: string): EnhancedOrchestratorPrompt | null {
  const fallback = FALLBACK_PROMPTS[nodeName]
  if (!fallback) {
    return null
  }

  return {
    id: fallback.id || `fallback-${nodeName}`,
    nodeName,
    displayName: fallback.displayName || nodeName,
    description: null,
    systemPrompt: fallback.systemPrompt || '',
    category: fallback.category || 'agent',
    stage: fallback.stage || null,
    isActive: true,
    tokenEstimate: null,
    version: 1,
    contextTags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    inputSchema: fallback.inputSchema || null,
    outputSchema: fallback.outputSchema || null,
    contextSelector: fallback.contextSelector || null,
    iterationConfig: fallback.iterationConfig || null,
    userPromptTemplate: fallback.userPromptTemplate || null,
    outputFormat: fallback.outputFormat || 'json',
  }
}

// =============================================================================
// PRELOAD FUNCTION
// =============================================================================

/**
 * Preload commonly used prompts into cache.
 * Call this on app initialization to warm the cache.
 */
export async function preloadPrompts(): Promise<void> {
  const commonPrompts = [
    'orchestrator',
    'feasibility',
    'enclosure',
    'enclosure_vision',
    'firmware',
    'naming',
    'enclosure_review',
    'firmware_review',
  ]

  try {
    await loadPrompts(commonPrompts)
    console.log(`Preloaded ${promptCache.size} orchestrator prompts`)
  } catch (error) {
    console.error('Failed to preload prompts:', error)
  }
}
