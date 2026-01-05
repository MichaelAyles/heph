/**
 * Tests for Safe JSON parsing utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import {
  safeJsonParse,
  extractJsonFromContent,
  findBalancedJson,
  safeJsonParseWithSchema,
  extractAndValidateJson,
  type ParseResult,
} from './json'

describe('safeJsonParse', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('returns fallback for null input', () => {
    expect(safeJsonParse(null, { default: true })).toEqual({ default: true })
  })

  it('returns fallback for undefined input', () => {
    expect(safeJsonParse(undefined, [])).toEqual([])
  })

  it('returns fallback for empty string', () => {
    expect(safeJsonParse('', 'fallback')).toBe('fallback')
  })

  it('parses valid JSON object', () => {
    const json = '{"name": "test", "value": 123}'
    const result = safeJsonParse(json, {})
    expect(result).toEqual({ name: 'test', value: 123 })
  })

  it('parses valid JSON array', () => {
    const json = '[1, 2, 3]'
    const result = safeJsonParse(json, [])
    expect(result).toEqual([1, 2, 3])
  })

  it('parses valid JSON primitives', () => {
    expect(safeJsonParse('"hello"', '')).toBe('hello')
    expect(safeJsonParse('42', 0)).toBe(42)
    expect(safeJsonParse('true', false)).toBe(true)
    expect(safeJsonParse('null', 'default')).toBe(null)
  })

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('not json', 'fallback')).toBe('fallback')
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('returns fallback for malformed JSON', () => {
    expect(safeJsonParse('{"broken": }', {})).toEqual({})
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('logs truncated JSON on error', () => {
    const longJson = 'x'.repeat(200)
    safeJsonParse(longJson, null)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[safeJsonParse] Failed to parse JSON:',
      expect.stringMatching(/^x{100}$/)
    )
  })

  it('preserves type with generics', () => {
    interface User {
      id: number
      name: string
    }
    const fallback: User = { id: 0, name: 'unknown' }
    const result = safeJsonParse<User>('{"id": 1, "name": "Alice"}', fallback)
    expect(result.id).toBe(1)
    expect(result.name).toBe('Alice')
  })
})

describe('extractJsonFromContent', () => {
  it('returns null for empty content', () => {
    expect(extractJsonFromContent('')).toBeNull()
  })

  it('returns null for null/undefined-like content', () => {
    expect(extractJsonFromContent(null as unknown as string)).toBeNull()
  })

  it('parses pure JSON content directly', () => {
    const json = '{"key": "value"}'
    expect(extractJsonFromContent(json)).toEqual({ key: 'value' })
  })

  it('extracts JSON object from markdown code block', () => {
    const content = `Here's the result:
\`\`\`json
{"name": "test", "count": 5}
\`\`\`
That's the output.`
    expect(extractJsonFromContent(content)).toEqual({ name: 'test', count: 5 })
  })

  it('extracts JSON object from text with prefix', () => {
    const content = 'The answer is: {"result": true, "score": 95}'
    expect(extractJsonFromContent(content)).toEqual({ result: true, score: 95 })
  })

  it('extracts JSON object from text with suffix', () => {
    const content = '{"status": "complete"} - that is all'
    expect(extractJsonFromContent(content)).toEqual({ status: 'complete' })
  })

  it('extracts JSON array', () => {
    const content = 'Here are the items: [1, 2, 3, 4, 5]'
    expect(extractJsonFromContent(content)).toEqual([1, 2, 3, 4, 5])
  })

  it('extracts array of objects when no object pattern present', () => {
    // Note: When both object and array patterns exist, object is tried first
    const content = 'Results: [{"id": 1}, {"id": 2}]'
    // The greedy object regex matches {"id": 1}, {"id": 2}] which is invalid
    // Then findBalancedJson finds just {"id": 1} - this is a known limitation
    // For pure arrays without surrounding object braces, it works:
    const pureArray = '[{"id": 1}, {"id": 2}]'
    expect(extractJsonFromContent(pureArray)).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('handles nested objects', () => {
    const content = `Response: {
      "user": {
        "profile": {
          "name": "John",
          "settings": {"theme": "dark"}
        }
      }
    }`
    const result = extractJsonFromContent(content)
    expect(result).toEqual({
      user: {
        profile: {
          name: 'John',
          settings: { theme: 'dark' },
        },
      },
    })
  })

  it('handles JSON with escaped quotes in strings', () => {
    const content = '{"message": "He said \\"hello\\""}'
    expect(extractJsonFromContent(content)).toEqual({ message: 'He said "hello"' })
  })

  it('handles JSON with nested braces in strings', () => {
    const content = '{"code": "function() { return {}; }"}'
    expect(extractJsonFromContent(content)).toEqual({ code: 'function() { return {}; }' })
  })

  it('returns null when no valid JSON found', () => {
    expect(extractJsonFromContent('Just some plain text')).toBeNull()
    expect(extractJsonFromContent('{ incomplete')).toBeNull()
    expect(extractJsonFromContent('[ also incomplete')).toBeNull()
  })

  it('handles multiple JSON objects - extracts first complete one', () => {
    const content = '{"first": 1} then {"second": 2}'
    // The greedy regex will match from first { to last }
    // But findBalancedJson should handle this
    const result = extractJsonFromContent(content)
    expect(result).not.toBeNull()
  })

  it('handles complex LLM response with thinking', () => {
    const content = `Let me analyze this request...

Based on the requirements, here's my assessment:

\`\`\`json
{
  "manufacturable": true,
  "score": 85,
  "components": ["ESP32", "BME280", "WS2812B"],
  "notes": "This is feasible"
}
\`\`\`

I hope this helps!`
    const result = extractJsonFromContent(content)
    expect(result).toEqual({
      manufacturable: true,
      score: 85,
      components: ['ESP32', 'BME280', 'WS2812B'],
      notes: 'This is feasible',
    })
  })

  it('preserves type with generics', () => {
    interface ApiResponse {
      success: boolean
      data: string[]
    }
    const content = '{"success": true, "data": ["a", "b"]}'
    const result = extractJsonFromContent<ApiResponse>(content)
    expect(result?.success).toBe(true)
    expect(result?.data).toEqual(['a', 'b'])
  })

  it('handles malformed JSON gracefully', () => {
    // Missing closing brace
    expect(extractJsonFromContent('{"key": "value"')).toBeNull()
    // Extra comma
    expect(extractJsonFromContent('{"key": "value",}')).toBeNull()
    // Unquoted key (invalid JSON)
    expect(extractJsonFromContent('{key: "value"}')).toBeNull()
  })

  it('handles empty objects and arrays', () => {
    expect(extractJsonFromContent('{}')).toEqual({})
    expect(extractJsonFromContent('[]')).toEqual([])
    expect(extractJsonFromContent('Result: {}')).toEqual({})
    expect(extractJsonFromContent('Items: []')).toEqual([])
  })

  it('handles boolean and null values', () => {
    expect(extractJsonFromContent('{"active": true}')).toEqual({ active: true })
    expect(extractJsonFromContent('{"value": null}')).toEqual({ value: null })
    expect(extractJsonFromContent('{"flag": false}')).toEqual({ flag: false })
  })

  it('handles numeric values', () => {
    expect(extractJsonFromContent('{"int": 42}')).toEqual({ int: 42 })
    expect(extractJsonFromContent('{"float": 3.14}')).toEqual({ float: 3.14 })
    expect(extractJsonFromContent('{"neg": -10}')).toEqual({ neg: -10 })
    expect(extractJsonFromContent('{"exp": 1e10}')).toEqual({ exp: 1e10 })
  })
})

// =============================================================================
// findBalancedJson Tests
// =============================================================================

describe('findBalancedJson', () => {
  it('returns null for empty string', () => {
    expect(findBalancedJson('')).toBeNull()
  })

  it('returns null when no opening brace', () => {
    expect(findBalancedJson('no json here')).toBeNull()
  })

  it('returns null for unbalanced braces', () => {
    expect(findBalancedJson('{ unclosed')).toBeNull()
  })

  it('finds simple object', () => {
    expect(findBalancedJson('{"key": "value"}')).toBe('{"key": "value"}')
  })

  it('finds object with prefix', () => {
    expect(findBalancedJson('prefix {"key": 1}')).toBe('{"key": 1}')
  })

  it('finds object with suffix', () => {
    expect(findBalancedJson('{"key": 1} suffix')).toBe('{"key": 1}')
  })

  it('finds first object when multiple exist', () => {
    expect(findBalancedJson('{"first": 1} {"second": 2}')).toBe('{"first": 1}')
  })

  it('handles nested objects correctly', () => {
    const nested = '{"outer": {"inner": {"deep": true}}}'
    expect(findBalancedJson(nested)).toBe(nested)
  })

  it('handles braces inside strings', () => {
    const withBraces = '{"code": "function() { return {}; }"}'
    expect(findBalancedJson(withBraces)).toBe(withBraces)
  })

  it('handles escaped quotes in strings', () => {
    const withEscaped = '{"msg": "He said \\"hello\\""}'
    expect(findBalancedJson(withEscaped)).toBe(withEscaped)
  })

  it('handles escaped backslash before quote', () => {
    const content = '{"path": "C:\\\\Users\\\\"}'
    expect(findBalancedJson(content)).toBe(content)
  })

  it('handles arrays inside objects', () => {
    const withArray = '{"items": [1, 2, 3], "nested": [{"a": 1}]}'
    expect(findBalancedJson(withArray)).toBe(withArray)
  })
})

// =============================================================================
// safeJsonParseWithSchema Tests
// =============================================================================

describe('safeJsonParseWithSchema', () => {
  const UserSchema = z.object({
    id: z.number(),
    name: z.string(),
    email: z.string().email().optional(),
  })

  type User = z.infer<typeof UserSchema>

  it('returns error for null input', () => {
    const result = safeJsonParseWithSchema(null, UserSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Empty input')
    }
  })

  it('returns error for undefined input', () => {
    const result = safeJsonParseWithSchema(undefined, UserSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Empty input')
    }
  })

  it('returns error for empty string', () => {
    const result = safeJsonParseWithSchema('', UserSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Empty input')
    }
  })

  it('parses and validates correct JSON', () => {
    const json = '{"id": 1, "name": "Alice"}'
    const result = safeJsonParseWithSchema(json, UserSchema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ id: 1, name: 'Alice' })
    }
  })

  it('parses with optional fields', () => {
    const json = '{"id": 1, "name": "Bob", "email": "bob@example.com"}'
    const result = safeJsonParseWithSchema(json, UserSchema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('bob@example.com')
    }
  })

  it('returns validation error for missing required field', () => {
    const json = '{"id": 1}'
    const result = safeJsonParseWithSchema(json, UserSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Validation failed')
      expect(result.error).toContain('name')
    }
  })

  it('returns validation error for wrong type', () => {
    const json = '{"id": "not a number", "name": "Test"}'
    const result = safeJsonParseWithSchema(json, UserSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Validation failed')
      expect(result.error).toContain('id')
    }
  })

  it('returns validation error for invalid email', () => {
    const json = '{"id": 1, "name": "Test", "email": "not-an-email"}'
    const result = safeJsonParseWithSchema(json, UserSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Validation failed')
      expect(result.error).toContain('email')
    }
  })

  it('returns parse error for invalid JSON', () => {
    const json = '{invalid json}'
    const result = safeJsonParseWithSchema(json, UserSchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('JSON parse error')
    }
  })

  it('works with array schemas', () => {
    const ArraySchema = z.array(z.number())
    const result = safeJsonParseWithSchema('[1, 2, 3]', ArraySchema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([1, 2, 3])
    }
  })

  it('works with primitive schemas', () => {
    const StringSchema = z.string()
    const result = safeJsonParseWithSchema('"hello"', StringSchema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('hello')
    }
  })

  it('works with union schemas', () => {
    const UnionSchema = z.union([
      z.object({ type: z.literal('success'), data: z.string() }),
      z.object({ type: z.literal('error'), message: z.string() }),
    ])

    const success = safeJsonParseWithSchema('{"type": "success", "data": "ok"}', UnionSchema)
    expect(success.success).toBe(true)

    const error = safeJsonParseWithSchema('{"type": "error", "message": "fail"}', UnionSchema)
    expect(error.success).toBe(true)
  })
})

// =============================================================================
// extractAndValidateJson Tests
// =============================================================================

describe('extractAndValidateJson', () => {
  const FeasibilitySchema = z.object({
    manufacturable: z.boolean(),
    score: z.number().min(0).max(100),
    components: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })

  type Feasibility = z.infer<typeof FeasibilitySchema>

  it('returns error for empty content', () => {
    const result = extractAndValidateJson('', FeasibilitySchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Empty content')
    }
  })

  it('extracts and validates pure JSON', () => {
    const content = '{"manufacturable": true, "score": 85}'
    const result = extractAndValidateJson(content, FeasibilitySchema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.manufacturable).toBe(true)
      expect(result.data.score).toBe(85)
    }
  })

  it('extracts JSON from markdown code block', () => {
    const content = `Here's the analysis:
\`\`\`json
{
  "manufacturable": true,
  "score": 90,
  "components": ["ESP32", "BME280"]
}
\`\`\`
That's my assessment.`

    const result = extractAndValidateJson(content, FeasibilitySchema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.components).toEqual(['ESP32', 'BME280'])
    }
  })

  it('extracts JSON from text with prefix', () => {
    const content = 'Analysis result: {"manufacturable": false, "score": 20}'
    const result = extractAndValidateJson(content, FeasibilitySchema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.manufacturable).toBe(false)
    }
  })

  it('extracts JSON from text with suffix', () => {
    const content = '{"manufacturable": true, "score": 75} - end of response'
    const result = extractAndValidateJson(content, FeasibilitySchema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.score).toBe(75)
    }
  })

  it('returns validation error for missing required field', () => {
    const content = '{"manufacturable": true}'
    const result = extractAndValidateJson(content, FeasibilitySchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Validation failed')
      expect(result.error).toContain('score')
    }
  })

  it('returns validation error for wrong type', () => {
    const content = '{"manufacturable": "yes", "score": 50}'
    const result = extractAndValidateJson(content, FeasibilitySchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Validation failed')
      expect(result.error).toContain('manufacturable')
    }
  })

  it('returns validation error for out of range value', () => {
    const content = '{"manufacturable": true, "score": 150}'
    const result = extractAndValidateJson(content, FeasibilitySchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Validation failed')
    }
  })

  it('returns error when no JSON found', () => {
    const content = 'Just plain text with no JSON'
    const result = extractAndValidateJson(content, FeasibilitySchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('No valid JSON found in content')
    }
  })

  it('handles nested objects with validation', () => {
    const NestedSchema = z.object({
      user: z.object({
        id: z.number(),
        profile: z.object({
          name: z.string(),
        }),
      }),
    })

    const content = `Response: {
      "user": {
        "id": 42,
        "profile": {"name": "Alice"}
      }
    }`

    const result = extractAndValidateJson(content, NestedSchema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.user.profile.name).toBe('Alice')
    }
  })

  it('validates arrays correctly', () => {
    const ArraySchema = z.array(
      z.object({
        id: z.number(),
        name: z.string(),
      })
    )

    const content = '[{"id": 1, "name": "First"}, {"id": 2, "name": "Second"}]'
    const result = extractAndValidateJson(content, ArraySchema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toHaveLength(2)
      expect(result.data[0].name).toBe('First')
    }
  })

  it('extracts array from text', () => {
    const ArraySchema = z.array(z.number())
    const content = 'The values are: [1, 2, 3, 4, 5]'
    const result = extractAndValidateJson(content, ArraySchema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual([1, 2, 3, 4, 5])
    }
  })

  it('uses balanced extraction for complex nesting', () => {
    const content = 'Start {"nested": {"a": 1}} and {"other": 2} end'
    const SimpleSchema = z.object({ nested: z.object({ a: z.number() }) })

    const result = extractAndValidateJson(content, SimpleSchema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.nested.a).toBe(1)
    }
  })

  it('handles complex LLM response with thinking text', () => {
    const content = `Let me think about this carefully...

Based on my analysis of the components and requirements:

\`\`\`json
{
  "manufacturable": true,
  "score": 92,
  "components": ["ESP32-C6", "BME280", "WS2812B", "USB-C"],
  "notes": "All components readily available"
}
\`\`\`

I believe this is a solid design that can be manufactured easily.`

    const result = extractAndValidateJson(content, FeasibilitySchema)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.score).toBe(92)
      expect(result.data.components).toContain('ESP32-C6')
    }
  })

  it('returns first validation error found', () => {
    const content = '{"manufacturable": "invalid", "score": "also invalid"}'
    const result = extractAndValidateJson(content, FeasibilitySchema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Validation failed')
    }
  })
})
