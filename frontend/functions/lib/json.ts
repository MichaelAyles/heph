/**
 * Safe JSON parsing utilities
 */

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
function findBalancedJson(content: string): string | null {
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
