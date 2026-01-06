/**
 * Tests for OpenSCAD Enclosure Validation Prompt
 */

import { describe, it, expect } from 'vitest'
import {
  OPENSCAD_VALIDATION_PROMPT,
  buildValidationPrompt,
  buildFixPrompt,
  parseValidationResponse,
  type ValidationIssue,
} from './enclosure-validation'

// =============================================================================
// OPENSCAD_VALIDATION_PROMPT Tests
// =============================================================================

describe('OPENSCAD_VALIDATION_PROMPT', () => {
  it('includes critical issue categories', () => {
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('Geometry Problems')
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('Printability Issues')
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('Assembly Problems')
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('Functional Issues')
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('Code Quality Issues')
  })

  it('includes specific geometry checks', () => {
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('Floating geometry')
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('center=true')
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('Negative coordinates')
  })

  it('includes printability checks', () => {
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('Overhangs')
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('Thin walls')
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('Small holes')
  })

  it('warns about text() function', () => {
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('text()')
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('WebAssembly')
  })

  it('specifies JSON output format', () => {
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('isValid')
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('issues')
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('severity')
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('category')
    expect(OPENSCAD_VALIDATION_PROMPT).toContain('fix')
  })
})

// =============================================================================
// buildValidationPrompt Tests
// =============================================================================

describe('buildValidationPrompt', () => {
  const baseContext = {
    pcbWidth: 50,
    pcbHeight: 40,
    hasOled: false,
    hasUsb: true,
    hasButtons: false,
  }

  const sampleCode = `
// Test OpenSCAD code
module test_box() {
  cube([10, 10, 10]);
}
test_box();
`

  it('includes PCB dimensions in context', () => {
    const prompt = buildValidationPrompt(sampleCode, baseContext)

    expect(prompt).toContain('PCB Size: 50mm x 40mm')
  })

  it('lists components when present', () => {
    const contextWithComponents = {
      ...baseContext,
      hasOled: true,
      hasButtons: true,
    }
    const prompt = buildValidationPrompt(sampleCode, contextWithComponents)

    expect(prompt).toContain('USB-C port')
    expect(prompt).toContain('OLED display')
    expect(prompt).toContain('Buttons')
  })

  it('handles no additional components', () => {
    const minimalContext = {
      pcbWidth: 60,
      pcbHeight: 45,
      hasOled: false,
      hasUsb: false,
      hasButtons: false,
    }
    const prompt = buildValidationPrompt(sampleCode, minimalContext)

    expect(prompt).toContain('None specified')
  })

  it('includes the OpenSCAD code', () => {
    const prompt = buildValidationPrompt(sampleCode, baseContext)

    expect(prompt).toContain('```openscad')
    expect(prompt).toContain('module test_box()')
    expect(prompt).toContain('cube([10, 10, 10])')
  })

  it('asks for JSON validation result', () => {
    const prompt = buildValidationPrompt(sampleCode, baseContext)

    expect(prompt).toContain('JSON validation result')
  })
})

// =============================================================================
// buildFixPrompt Tests
// =============================================================================

describe('buildFixPrompt', () => {
  const sampleCode = `
// Broken OpenSCAD
module broken() {
  translate([0, 0, -5])
  cube([10, 10, 10]);
}
`

  const sampleIssues: ValidationIssue[] = [
    {
      severity: 'critical',
      category: 'geometry',
      description: 'Part extends below z=0',
      location: 'broken() module',
      fix: 'Move cube up by 5mm',
    },
    {
      severity: 'warning',
      category: 'printability',
      description: 'No $fn specified',
      fix: 'Add $fn = 64 at top of file',
    },
  ]

  it('includes original code', () => {
    const prompt = buildFixPrompt(sampleCode, sampleIssues, { pcbWidth: 50, pcbHeight: 40 })

    expect(prompt).toContain('```openscad')
    expect(prompt).toContain('module broken()')
  })

  it('lists all issues with severity', () => {
    const prompt = buildFixPrompt(sampleCode, sampleIssues, { pcbWidth: 50, pcbHeight: 40 })

    expect(prompt).toContain('[CRITICAL]')
    expect(prompt).toContain('[WARNING]')
    expect(prompt).toContain('Part extends below z=0')
    expect(prompt).toContain('No $fn specified')
  })

  it('includes fix suggestions', () => {
    const prompt = buildFixPrompt(sampleCode, sampleIssues, { pcbWidth: 50, pcbHeight: 40 })

    expect(prompt).toContain('Move cube up by 5mm')
    expect(prompt).toContain('Add $fn = 64')
  })

  it('includes location when available', () => {
    const prompt = buildFixPrompt(sampleCode, sampleIssues, { pcbWidth: 50, pcbHeight: 40 })

    expect(prompt).toContain('Location: broken() module')
    expect(prompt).toContain('Location: N/A') // For issue without location
  })

  it('includes PCB dimensions', () => {
    const prompt = buildFixPrompt(sampleCode, sampleIssues, { pcbWidth: 75, pcbHeight: 55 })

    expect(prompt).toContain('PCB Size: 75mm x 55mm')
  })

  it('includes requirements about text() function', () => {
    const prompt = buildFixPrompt(sampleCode, sampleIssues, { pcbWidth: 50, pcbHeight: 40 })

    expect(prompt).toContain('Do NOT use text() function')
  })

  it('requests only corrected code', () => {
    const prompt = buildFixPrompt(sampleCode, sampleIssues, { pcbWidth: 50, pcbHeight: 40 })

    expect(prompt).toContain('Return ONLY the corrected OpenSCAD code')
    expect(prompt).toContain('no explanations')
  })
})

// =============================================================================
// parseValidationResponse Tests
// =============================================================================

describe('parseValidationResponse', () => {
  it('parses valid JSON response', () => {
    const response = `Here is the validation:
\`\`\`json
{
  "isValid": true,
  "issues": [],
  "summary": "No issues found"
}
\`\`\``

    const result = parseValidationResponse(response)

    expect(result.isValid).toBe(true)
    expect(result.issues).toHaveLength(0)
    expect(result.summary).toBe('No issues found')
  })

  it('parses response with issues', () => {
    const response = `{
  "isValid": false,
  "issues": [
    {
      "severity": "critical",
      "category": "geometry",
      "description": "Floating geometry detected",
      "location": "top_case()",
      "fix": "Add overlap to union"
    },
    {
      "severity": "warning",
      "category": "printability",
      "description": "Thin wall detected",
      "fix": "Increase wall thickness to 2mm"
    }
  ],
  "summary": "2 issues found"
}`

    const result = parseValidationResponse(response)

    expect(result.isValid).toBe(false)
    expect(result.issues).toHaveLength(2)
    expect(result.issues[0].severity).toBe('critical')
    expect(result.issues[0].category).toBe('geometry')
    expect(result.issues[1].severity).toBe('warning')
  })

  it('extracts JSON from surrounding text', () => {
    const response = `I've analyzed the code and here are my findings:

{"isValid": false, "issues": [{"severity": "critical", "category": "code", "description": "Using text()", "fix": "Remove text() calls"}], "summary": "1 issue"}

Let me know if you need more details.`

    const result = parseValidationResponse(response)

    expect(result.isValid).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].description).toBe('Using text()')
  })

  it('handles missing isValid field', () => {
    const response = `{
  "issues": [{"severity": "critical", "category": "geometry", "description": "Issue", "fix": "Fix it"}],
  "summary": "Has issues"
}`

    const result = parseValidationResponse(response)

    // Should infer isValid based on issues length
    expect(result.isValid).toBe(false)
  })

  it('handles empty response', () => {
    const result = parseValidationResponse('')

    expect(result.isValid).toBe(true)
    expect(result.issues).toHaveLength(0)
    expect(result.summary).toBe('Could not parse validation response')
  })

  it('handles malformed JSON', () => {
    // Note: needs both braces for regex to match, then JSON.parse will fail
    const response = `{not: valid json}`

    const result = parseValidationResponse(response)

    expect(result.isValid).toBe(true)
    expect(result.issues).toHaveLength(0)
    expect(result.summary).toBe('Validation parsing failed')
  })

  it('handles JSON without closing brace', () => {
    // Missing closing brace - regex won't match at all
    const response = `{incomplete json`

    const result = parseValidationResponse(response)

    expect(result.isValid).toBe(true)
    expect(result.issues).toHaveLength(0)
    expect(result.summary).toBe('Could not parse validation response')
  })

  it('filters out invalid issues', () => {
    const response = `{
  "isValid": false,
  "issues": [
    {"severity": "critical", "description": "Valid issue", "fix": "Fix it"},
    {"invalid": "issue"},
    null,
    {"severity": "warning", "description": "Another valid", "fix": "Do this"}
  ],
  "summary": "Mixed issues"
}`

    const result = parseValidationResponse(response)

    // Should only include valid issues (2 out of 4)
    expect(result.issues).toHaveLength(2)
    expect(result.issues[0].description).toBe('Valid issue')
    expect(result.issues[1].description).toBe('Another valid')
  })

  it('handles missing issues array', () => {
    const response = `{"isValid": true, "summary": "All good"}`

    const result = parseValidationResponse(response)

    expect(result.isValid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('preserves optional location field', () => {
    const response = `{
  "isValid": false,
  "issues": [
    {"severity": "critical", "category": "assembly", "description": "Issue with location", "location": "bottom_case()", "fix": "Fix"},
    {"severity": "warning", "category": "code", "description": "Issue without location", "fix": "Fix"}
  ],
  "summary": "Test"
}`

    const result = parseValidationResponse(response)

    expect(result.issues[0].location).toBe('bottom_case()')
    expect(result.issues[1].location).toBeUndefined()
  })
})
