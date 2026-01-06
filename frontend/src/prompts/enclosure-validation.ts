/**
 * OpenSCAD Enclosure Validation Prompt
 *
 * Used to analyze generated OpenSCAD code for common issues
 * and suggest fixes before rendering.
 */

export interface ValidationIssue {
  severity: 'critical' | 'warning' | 'suggestion'
  category: string
  description: string
  location?: string // e.g., "top_case() USB cutout"
  fix: string
}

export interface ValidationResult {
  isValid: boolean
  issues: ValidationIssue[]
  summary: string
}

export const OPENSCAD_VALIDATION_PROMPT = `You are an expert OpenSCAD code reviewer specializing in 3D printable enclosures for electronics. Analyze the provided OpenSCAD code for common issues.

## Critical Issues to Check

### 1. Geometry Problems
- **Floating geometry**: Parts created with union() that don't overlap (non-manifold)
- **Center=true misuse**: Cutouts using center=true that don't fully intersect walls
- **Negative coordinates**: Parts extending below z=0 that will be clipped
- **Missing overlaps**: difference() operations where the cutter doesn't extend past the target

### 2. Printability Issues
- **Overhangs >45°**: Features that require supports without being designed for them
- **Thin walls**: Walls less than 1.2mm that may not print reliably
- **Small holes**: Holes less than 2mm that may close up during printing
- **Sharp internal corners**: 90° corners that trap resin or cause stress concentrations

### 3. Assembly Problems
- **Inaccessible screws**: Screw bosses that can't be reached once assembled
- **Missing clearances**: Snap-fit or sliding parts without adequate tolerance (need 0.3-0.5mm)
- **No access points**: Sealed cases with no way to open them (missing thumb notches)
- **PCB can't be installed**: Component positions that block PCB insertion path

### 4. Functional Issues
- **USB cutout misaligned**: Position doesn't match actual USB-C connector location
- **Display window wrong size**: OLED window doesn't match display active area
- **Poor ventilation**: Heat-generating components (ESP32) in sealed enclosures
- **LED holes too small**: Light pipes that won't pass enough light

### 5. Code Quality Issues
- **Using text()**: text() function won't work in WebAssembly - no fonts available
- **Undefined variables**: References to variables not defined
- **Missing $fn**: Circles/cylinders without $fn will render poorly
- **Magic numbers**: Hardcoded values that should be parameters

## Output Format

Respond with a JSON object:
\`\`\`json
{
  "isValid": true/false,
  "issues": [
    {
      "severity": "critical|warning|suggestion",
      "category": "geometry|printability|assembly|functional|code",
      "description": "Clear description of the issue",
      "location": "module_name() or line reference",
      "fix": "Specific code change or approach to fix"
    }
  ],
  "summary": "Brief overall assessment"
}
\`\`\`

Be specific about fixes - include actual code snippets when helpful.
Only report real issues, not stylistic preferences.
Critical issues prevent the part from working at all.
Warnings may cause problems in some situations.
Suggestions improve quality but aren't required.`

/**
 * Build the validation prompt for a specific OpenSCAD code
 */
export function buildValidationPrompt(openScadCode: string, context: {
  pcbWidth: number
  pcbHeight: number
  hasOled: boolean
  hasUsb: boolean
  hasButtons: boolean
}): string {
  return `Analyze this OpenSCAD enclosure code for issues:

## Context
- PCB Size: ${context.pcbWidth}mm x ${context.pcbHeight}mm
- Components: ${[
    context.hasUsb && 'USB-C port',
    context.hasOled && 'OLED display',
    context.hasButtons && 'Buttons',
  ].filter(Boolean).join(', ') || 'None specified'}

## OpenSCAD Code

\`\`\`openscad
${openScadCode}
\`\`\`

Analyze this code and return a JSON validation result.`
}

/**
 * Build a fix prompt based on validation issues
 */
export function buildFixPrompt(
  originalCode: string,
  issues: ValidationIssue[],
  context: {
    pcbWidth: number
    pcbHeight: number
  }
): string {
  const issueList = issues
    .map((issue, i) => `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.category}: ${issue.description}
   Location: ${issue.location || 'N/A'}
   Fix: ${issue.fix}`)
    .join('\n\n')

  return `Fix the following issues in this OpenSCAD enclosure code:

## Issues Found

${issueList}

## Original Code

\`\`\`openscad
${originalCode}
\`\`\`

## Requirements
- PCB Size: ${context.pcbWidth}mm x ${context.pcbHeight}mm
- Fix all critical and warning issues
- Maintain the same overall design intent
- Do NOT use text() function - fonts are unavailable in WebAssembly
- Ensure proper tolerances (0.3-0.5mm for snap fits)
- Ensure all cutouts fully intersect walls

Return ONLY the corrected OpenSCAD code, no explanations.`
}

/**
 * Parse validation response from LLM
 */
export function parseValidationResponse(response: string): ValidationResult {
  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        isValid: true,
        issues: [],
        summary: 'Could not parse validation response',
      }
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Validate structure
    if (typeof parsed.isValid !== 'boolean') {
      parsed.isValid = (parsed.issues?.length || 0) === 0
    }

    if (!Array.isArray(parsed.issues)) {
      parsed.issues = []
    }

    // Filter to valid issues
    parsed.issues = parsed.issues.filter((issue: unknown) => {
      if (typeof issue !== 'object' || issue === null) return false
      const i = issue as Record<string, unknown>
      return (
        typeof i.severity === 'string' &&
        typeof i.description === 'string' &&
        typeof i.fix === 'string'
      )
    })

    return {
      isValid: parsed.isValid,
      issues: parsed.issues,
      summary: parsed.summary || '',
    }
  } catch {
    return {
      isValid: true,
      issues: [],
      summary: 'Validation parsing failed',
    }
  }
}
