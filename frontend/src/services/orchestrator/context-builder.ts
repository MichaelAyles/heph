/**
 * Context Builder for Orchestrator Prompts
 *
 * Builds context objects from ProjectSpec based on selector patterns.
 * Supports field selection, exclusion, array extraction, and nested paths.
 */

import type { ProjectSpec } from '../../db/schema'
import type { ContextSelector } from '../../schemas/orchestrator-node'

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Build a context object from a ProjectSpec based on selector patterns.
 *
 * @param spec - The full project spec
 * @param selector - Array of selector patterns
 * @param maxTokens - Optional limit on estimated tokens (rough: 4 chars = 1 token)
 * @returns Context object with selected fields
 *
 * @example
 * // Select all fields
 * buildContextFromSelector(spec, ['*'])
 *
 * @example
 * // Select specific fields
 * buildContextFromSelector(spec, ['description', 'feasibility'])
 *
 * @example
 * // Nested field access
 * buildContextFromSelector(spec, ['finalSpec.pcbSize.width', 'finalSpec.name'])
 *
 * @example
 * // Array extraction with wildcard
 * buildContextFromSelector(spec, ['decisions[*].answer'])
 *
 * @example
 * // Array element by index
 * buildContextFromSelector(spec, ['blueprints[selectedBlueprint]'])
 *
 * @example
 * // Exclude fields
 * buildContextFromSelector(spec, ['*', '!orchestratorState', '!stages'])
 */
export function buildContextFromSelector(
  spec: ProjectSpec | null,
  selector: ContextSelector,
  maxTokens?: number
): Record<string, unknown> {
  if (!spec) {
    return {}
  }

  // Handle empty selector - return empty context
  if (!selector || selector.length === 0) {
    return {}
  }

  // Parse selector into include and exclude patterns
  const includes: string[] = []
  const excludes: string[] = []

  for (const pattern of selector) {
    if (pattern.startsWith('!')) {
      excludes.push(pattern.slice(1))
    } else {
      includes.push(pattern)
    }
  }

  // Build the context
  let context: Record<string, unknown>

  // Check for wildcard - start with all fields
  if (includes.includes('*')) {
    context = deepClone(spec as unknown as Record<string, unknown>) as Record<string, unknown>
  } else {
    context = {}
    for (const pattern of includes) {
      extractAndSet(spec as unknown as Record<string, unknown>, pattern, context)
    }
  }

  // Apply exclusions
  for (const pattern of excludes) {
    deleteByPath(context, pattern)
  }

  // Apply token limit if specified
  if (maxTokens && maxTokens > 0) {
    context = truncateToTokenLimit(context, maxTokens)
  }

  return context
}

// =============================================================================
// PATH EXTRACTION HELPERS
// =============================================================================

/**
 * Extract a value from source using a path pattern and set it in target.
 *
 * Supports:
 * - Simple paths: "description", "feasibility.overallScore"
 * - Array wildcards: "decisions[*].answer" -> extracts all answers
 * - Dynamic index: "blueprints[selectedBlueprint]" -> uses spec.selectedBlueprint as index
 */
function extractAndSet(
  source: Record<string, unknown>,
  pattern: string,
  target: Record<string, unknown>
): void {
  // Check for array patterns
  const arrayMatch = pattern.match(/^([^[]+)\[([^\]]+)\](.*)$/)

  if (arrayMatch) {
    const [, arrayPath, indexPattern, remainder] = arrayMatch
    const array = getByPath(source, arrayPath)

    if (!Array.isArray(array)) {
      return
    }

    if (indexPattern === '*') {
      // Wildcard: extract from all elements
      if (remainder) {
        // Extract specific field from each element
        const fieldPath = remainder.startsWith('.') ? remainder.slice(1) : remainder
        const extracted = array
          .map((item) => (typeof item === 'object' && item !== null ? getByPath(item as Record<string, unknown>, fieldPath) : undefined))
          .filter((v) => v !== undefined)
        setByPath(target, `${arrayPath}_extracted`, extracted)
      } else {
        // Return the whole array
        setByPath(target, arrayPath, array)
      }
    } else {
      // Dynamic index - look up the index value from source
      const indexValue = getByPath(source, indexPattern)
      if (typeof indexValue === 'number' && indexValue >= 0 && indexValue < array.length) {
        const element = array[indexValue]
        if (remainder) {
          const fieldPath = remainder.startsWith('.') ? remainder.slice(1) : remainder
          if (typeof element === 'object' && element !== null) {
            const value = getByPath(element as Record<string, unknown>, fieldPath)
            setByPath(target, `${arrayPath}_selected`, value)
          }
        } else {
          setByPath(target, `${arrayPath}_selected`, element)
        }
      }
    }
  } else {
    // Simple path extraction
    const value = getByPath(source, pattern)
    if (value !== undefined) {
      setByPath(target, pattern, value)
    }
  }
}

/**
 * Get a value from an object by dot-separated path.
 */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    if (typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/**
 * Set a value in an object by dot-separated path, creating intermediate objects as needed.
 */
function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let current = obj

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {}
    }
    current = current[part] as Record<string, unknown>
  }

  current[parts[parts.length - 1]] = deepClone(value)
}

/**
 * Delete a property from an object by dot-separated path.
 */
function deleteByPath(obj: Record<string, unknown>, path: string): void {
  const parts = path.split('.')
  let current = obj

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      return // Path doesn't exist, nothing to delete
    }
    current = current[part] as Record<string, unknown>
  }

  delete current[parts[parts.length - 1]]
}

// =============================================================================
// UTILITY HELPERS
// =============================================================================

/**
 * Deep clone an object (simple JSON-based approach).
 */
function deepClone<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj
  }
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Estimate token count for an object (rough: 4 chars = 1 token).
 */
function estimateTokens(obj: unknown): number {
  const str = JSON.stringify(obj)
  return Math.ceil(str.length / 4)
}

/**
 * Truncate context to fit within a token limit.
 * Progressively removes large fields until under limit.
 */
function truncateToTokenLimit(
  context: Record<string, unknown>,
  maxTokens: number
): Record<string, unknown> {
  let current = deepClone(context)
  let tokens = estimateTokens(current)

  // If already under limit, return as-is
  if (tokens <= maxTokens) {
    return current
  }

  // Find and sort fields by size (largest first)
  const fieldSizes: Array<{ key: string; tokens: number }> = []
  for (const [key, value] of Object.entries(current)) {
    fieldSizes.push({ key, tokens: estimateTokens(value) })
  }
  fieldSizes.sort((a, b) => b.tokens - a.tokens)

  // Progressively remove/truncate large fields
  for (const { key } of fieldSizes) {
    if (tokens <= maxTokens) {
      break
    }

    const value = current[key]

    // Try truncation first for strings and arrays
    if (typeof value === 'string' && value.length > 200) {
      current[key] = value.slice(0, 200) + '... [truncated]'
    } else if (Array.isArray(value) && value.length > 5) {
      current[key] = value.slice(0, 5)
      ;(current as Record<string, unknown>)[`${key}_truncated`] = true
    } else if (typeof value === 'object' && value !== null) {
      // For objects, try removing nested large fields
      const nested = truncateToTokenLimit(
        value as Record<string, unknown>,
        Math.floor(maxTokens / 3)
      )
      current[key] = nested
    }

    tokens = estimateTokens(current)

    // If still over, remove the field entirely
    if (tokens > maxTokens) {
      delete current[key]
      tokens = estimateTokens(current)
    }
  }

  return current
}

// =============================================================================
// TEMPLATE RENDERING
// =============================================================================

/**
 * Render a user prompt template with context values.
 *
 * Supports Handlebars-like syntax:
 * - {{variable}} - Simple substitution
 * - {{nested.path}} - Nested access
 * - {{#if condition}}...{{/if}} - Conditional
 * - {{#each array}}...{{/each}} - Iteration
 *
 * @param template - The template string
 * @param context - Values to substitute
 * @returns Rendered string
 */
export function renderPromptTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  if (!template) {
    return ''
  }

  let result = template

  // Handle {{#each}} blocks first
  result = result.replace(
    /\{\{#each\s+(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_, path, innerTemplate) => {
      const array = getByPath(context, path)
      if (!Array.isArray(array)) {
        return ''
      }
      return array
        .map((item) => {
          // Replace {{this}} and {{this.field}} within the loop
          let itemResult = innerTemplate
          if (typeof item === 'object' && item !== null) {
            // Replace {{this.field}} patterns
            itemResult = itemResult.replace(/\{\{this\.(\w+(?:\.\w+)*)\}\}/g, (_: string, field: string) => {
              const value = getByPath(item as Record<string, unknown>, field)
              return value !== undefined ? String(value) : ''
            })
            // Replace {{this}} with JSON of the whole object
            itemResult = itemResult.replace(/\{\{this\}\}/g, JSON.stringify(item))
          } else {
            itemResult = itemResult.replace(/\{\{this\}\}/g, String(item))
          }
          return itemResult
        })
        .join('')
    }
  )

  // Handle {{#if}} blocks
  result = result.replace(
    /\{\{#if\s+(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, path, innerContent) => {
      const value = getByPath(context, path)
      // Truthy check: exists and not empty
      if (value && (typeof value !== 'object' || Object.keys(value as object).length > 0)) {
        // Recursively render the inner content
        return renderPromptTemplate(innerContent, context)
      }
      return ''
    }
  )

  // Handle simple {{variable}} substitutions
  result = result.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    const value = getByPath(context, path)
    if (value === undefined || value === null) {
      return ''
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2)
    }
    return String(value)
  })

  return result
}
