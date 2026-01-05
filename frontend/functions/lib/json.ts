/**
 * Safe JSON parsing utilities with Zod schema validation
 */

import { z } from 'zod'

/**
 * Result type for validated JSON parsing
 */
export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/**
 * Safely parse JSON with a fallback value
 * @param json - JSON string to parse (can be null/undefined)
 * @param fallback - Value to return if parsing fails
 * @returns Parsed value or fallback
 */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    console.error('[safeJsonParse] Failed to parse JSON:', json.slice(0, 100))
    return fallback
  }
}

/**
 * Extract and parse JSON from LLM response content
 * Handles cases where JSON is embedded in markdown or other text
 * @param content - Raw content that may contain JSON
 * @returns Parsed object or null if no valid JSON found
 */
export function extractJsonFromContent<T = Record<string, unknown>>(
  content: string
): T | null {
  if (!content) return null

  // Try direct parse first (content is pure JSON)
  try {
    return JSON.parse(content) as T
  } catch {
    // Continue to extraction
  }

  // Try to extract JSON object from content
  // Match from first { to last } - greedy but usually works for single objects
  const objectMatch = content.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]) as T
    } catch {
      // Try to find a balanced JSON object
      const balanced = findBalancedJson(content)
      if (balanced) {
        try {
          return JSON.parse(balanced) as T
        } catch {
          // Fall through
        }
      }
    }
  }

  // Try to extract JSON array
  const arrayMatch = content.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]) as T
    } catch {
      // Fall through
    }
  }

  return null
}

/**
 * Find a balanced JSON object in a string
 * Handles nested braces correctly
 */
export function findBalancedJson(content: string): string | null {
  const start = content.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < content.length; i++) {
    const char = content[i]

    if (escape) {
      escape = false
      continue
    }

    if (char === '\\' && inString) {
      escape = true
      continue
    }

    if (char === '"' && !escape) {
      inString = !inString
      continue
    }

    if (!inString) {
      if (char === '{') depth++
      else if (char === '}') {
        depth--
        if (depth === 0) {
          return content.slice(start, i + 1)
        }
      }
    }
  }

  return null
}

/**
 * Format Zod validation errors into a readable string
 */
function formatZodError(error: z.ZodError): string {
  return error.issues.map((e) => `${e.path.join('.') || 'root'}: ${e.message}`).join(', ')
}

/**
 * Parse JSON with Zod schema validation
 * @param json - JSON string to parse
 * @param schema - Zod schema to validate against
 * @returns ParseResult with validated data or error message
 */
export function safeJsonParseWithSchema<T>(
  json: string | null | undefined,
  schema: z.ZodSchema<T>
): ParseResult<T> {
  if (!json) {
    return { success: false, error: 'Empty input' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown parse error'
    return { success: false, error: `JSON parse error: ${message}` }
  }

  const result = schema.safeParse(parsed)
  if (result.success) {
    return { success: true, data: result.data }
  }

  const errorMessage = formatZodError(result.error)
  return { success: false, error: `Validation failed: ${errorMessage}` }
}

/**
 * Extract JSON from LLM response and validate with Zod schema
 * Combines extraction with schema validation for type-safe parsing
 * @param content - Raw content that may contain JSON
 * @param schema - Zod schema to validate against
 * @returns ParseResult with validated data or error message
 */
export function extractAndValidateJson<T>(
  content: string,
  schema: z.ZodSchema<T>
): ParseResult<T> {
  if (!content) {
    return { success: false, error: 'Empty content' }
  }

  // Track the last validation error in case we parse valid JSON but fail validation
  let lastValidationError: string | null = null

  // Try direct parse first
  try {
    const parsed = JSON.parse(content)
    const result = schema.safeParse(parsed)
    if (result.success) {
      return { success: true, data: result.data }
    }
    // Store validation error - we parsed JSON successfully but validation failed
    lastValidationError = formatZodError(result.error)
  } catch {
    // Continue to extraction
  }

  // Try to extract JSON object
  const objectMatch = content.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    // Try the greedy match first
    try {
      const parsed = JSON.parse(objectMatch[0])
      const result = schema.safeParse(parsed)
      if (result.success) {
        return { success: true, data: result.data }
      }
      // Store validation error
      lastValidationError = formatZodError(result.error)
    } catch {
      // Try balanced extraction
    }

    // Try balanced JSON extraction
    const balanced = findBalancedJson(content)
    if (balanced) {
      try {
        const parsed = JSON.parse(balanced)
        const result = schema.safeParse(parsed)
        if (result.success) {
          return { success: true, data: result.data }
        }
        // Store validation error
        lastValidationError = formatZodError(result.error)
      } catch {
        // Fall through
      }
    }
  }

  // Try to extract JSON array
  const arrayMatch = content.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0])
      const result = schema.safeParse(parsed)
      if (result.success) {
        return { success: true, data: result.data }
      }
      // Store validation error
      lastValidationError = formatZodError(result.error)
    } catch {
      // Fall through
    }
  }

  // Return validation error if we found JSON but it didn't validate
  if (lastValidationError) {
    return { success: false, error: `Validation failed: ${lastValidationError}` }
  }

  return { success: false, error: 'No valid JSON found in content' }
}
