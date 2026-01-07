/**
 * Cross-Stage Validation Logic
 *
 * Validates consistency between stages in the hardware design pipeline.
 * This is the key differentiator for the orchestrator - catching mismatches
 * between PCB, enclosure, and firmware and triggering self-correction.
 */

import type { ProjectSpec, PCBArtifacts, EnclosureArtifacts, FirmwareArtifacts } from '@/db/schema'

// =============================================================================
// TYPES
// =============================================================================

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
  suggestions: ValidationSuggestion[]
}

export interface ValidationIssue {
  id: string
  severity: 'error' | 'warning' | 'info'
  stage: 'spec' | 'pcb' | 'enclosure' | 'firmware'
  message: string
  details?: string
}

export interface ValidationSuggestion {
  issueId: string
  stage: 'spec' | 'pcb' | 'enclosure' | 'firmware'
  action: string
  autoFixable: boolean
}

export type ValidationCheckType =
  | 'pcb_fits_enclosure'
  | 'firmware_matches_pcb'
  | 'spec_satisfied'
  | 'all'

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Main validation entry point
 */
export function validateCrossStage(
  spec: ProjectSpec,
  checkType: ValidationCheckType
): ValidationResult {
  const issues: ValidationIssue[] = []
  const suggestions: ValidationSuggestion[] = []

  if (checkType === 'all' || checkType === 'spec_satisfied') {
    const specResults = validateSpecSatisfied(spec)
    issues.push(...specResults.issues)
    suggestions.push(...specResults.suggestions)
  }

  if (checkType === 'all' || checkType === 'pcb_fits_enclosure') {
    const pcbEnclosureResults = validatePcbFitsEnclosure(spec.pcb, spec.enclosure)
    issues.push(...pcbEnclosureResults.issues)
    suggestions.push(...pcbEnclosureResults.suggestions)
  }

  if (checkType === 'all' || checkType === 'firmware_matches_pcb') {
    const firmwarePcbResults = validateFirmwareMatchesPcb(spec.pcb, spec.firmware)
    issues.push(...firmwarePcbResults.issues)
    suggestions.push(...firmwarePcbResults.suggestions)
  }

  return {
    valid: issues.filter((i) => i.severity === 'error').length === 0,
    issues,
    suggestions,
  }
}

/**
 * Validate that the final spec requirements are satisfied by PCB blocks
 */
export function validateSpecSatisfied(spec: ProjectSpec): ValidationResult {
  const issues: ValidationIssue[] = []
  const suggestions: ValidationSuggestion[] = []

  if (!spec.finalSpec || !spec.pcb?.placedBlocks) {
    return { valid: true, issues, suggestions }
  }

  const finalSpec = spec.finalSpec
  const placedBlocks = spec.pcb.placedBlocks

  // Check that required sensors are present
  for (const output of finalSpec.outputs) {
    if (!output.type) continue
    const outputType = output.type.toLowerCase()

    // Map output types to required blocks
    const requiredBlockPatterns: Record<string, string[]> = {
      temperature: ['bme280', 'sht40'],
      humidity: ['bme280', 'sht40'],
      pressure: ['bme280'],
      acceleration: ['lis3dh'],
      motion: ['lis3dh', 'pir'],
      light: ['veml7700'],
      distance: ['vl53l0x'],
      led: ['ws2812b', 'output-led'],
      display: ['oled', 'lcd'],
      buzzer: ['buzzer'],
      relay: ['relay'],
    }

    for (const [type, patterns] of Object.entries(requiredBlockPatterns)) {
      if (outputType.includes(type)) {
        const hasBlock = placedBlocks.some((b) =>
          patterns.some((p) => b.blockSlug.toLowerCase().includes(p))
        )

        if (!hasBlock) {
          const issueId = `missing_block_${type}`
          issues.push({
            id: issueId,
            severity: 'error',
            stage: 'pcb',
            message: `Missing PCB block for ${output.type}`,
            details: `Spec requires ${output.type} but no matching block (${patterns.join(' or ')}) is placed`,
          })
          suggestions.push({
            issueId,
            stage: 'pcb',
            action: `Add a ${patterns[0]} block to satisfy ${output.type} requirement`,
            autoFixable: true,
          })
        }
      }
    }
  }

  // Check power block matches spec
  const powerSource = finalSpec.power?.source?.toLowerCase() ?? ''
  const hasPowerBlock = placedBlocks.some((b) => {
    const slug = b.blockSlug.toLowerCase()
    if (powerSource.includes('usb')) return slug.includes('usb')
    if (powerSource.includes('battery') || powerSource.includes('lipo'))
      return slug.includes('lipo') || slug.includes('battery')
    if (powerSource.includes('aa') || powerSource.includes('aaa'))
      return slug.includes('boost') || slug.includes('battery')
    return slug.includes('power')
  })

  if (!hasPowerBlock) {
    const issueId = 'missing_power_block'
    issues.push({
      id: issueId,
      severity: 'error',
      stage: 'pcb',
      message: `Missing power block for ${finalSpec.power.source}`,
      details: `Spec requires ${finalSpec.power.source} but no matching power block is placed`,
    })
    suggestions.push({
      issueId,
      stage: 'pcb',
      action: `Add a power block matching ${finalSpec.power.source}`,
      autoFixable: true,
    })
  }

  return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues, suggestions }
}

/**
 * Validate PCB fits within enclosure dimensions
 */
export function validatePcbFitsEnclosure(
  pcb: PCBArtifacts | undefined,
  enclosure: EnclosureArtifacts | undefined
): ValidationResult {
  const issues: ValidationIssue[] = []
  const suggestions: ValidationSuggestion[] = []

  if (!pcb?.boardSize || !enclosure?.openScadCode) {
    return { valid: true, issues, suggestions }
  }

  // Parse enclosure dimensions from OpenSCAD code
  const enclosureDims = parseEnclosureDimensions(enclosure.openScadCode)

  if (!enclosureDims) {
    issues.push({
      id: 'enclosure_parse_error',
      severity: 'warning',
      stage: 'enclosure',
      message: 'Could not parse enclosure dimensions',
      details: 'Unable to extract dimensions from OpenSCAD code for validation',
    })
    return { valid: true, issues, suggestions }
  }

  const pcbDims = pcb.boardSize
  const CLEARANCE_MM = 2 // Minimum clearance on each side

  // Check width
  if (enclosureDims.innerWidth < pcbDims.width + CLEARANCE_MM * 2) {
    const issueId = 'enclosure_too_narrow'
    issues.push({
      id: issueId,
      severity: 'error',
      stage: 'enclosure',
      message: `Enclosure too narrow for PCB`,
      details: `Enclosure inner width (${enclosureDims.innerWidth}mm) < PCB width (${pcbDims.width}mm) + ${CLEARANCE_MM * 2}mm clearance`,
    })
    suggestions.push({
      issueId,
      stage: 'enclosure',
      action: `Increase enclosure width to at least ${pcbDims.width + CLEARANCE_MM * 2 + 2}mm`,
      autoFixable: true,
    })
  }

  // Check height (depth in enclosure terms)
  if (enclosureDims.innerHeight < pcbDims.height + CLEARANCE_MM * 2) {
    const issueId = 'enclosure_too_short'
    issues.push({
      id: issueId,
      severity: 'error',
      stage: 'enclosure',
      message: `Enclosure too short for PCB`,
      details: `Enclosure inner height (${enclosureDims.innerHeight}mm) < PCB height (${pcbDims.height}mm) + ${CLEARANCE_MM * 2}mm clearance`,
    })
    suggestions.push({
      issueId,
      stage: 'enclosure',
      action: `Increase enclosure height to at least ${pcbDims.height + CLEARANCE_MM * 2 + 2}mm`,
      autoFixable: true,
    })
  }

  return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues, suggestions }
}

/**
 * Validate firmware references correct GPIO pins from PCB
 */
export function validateFirmwareMatchesPcb(
  pcb: PCBArtifacts | undefined,
  firmware: FirmwareArtifacts | undefined
): ValidationResult {
  const issues: ValidationIssue[] = []
  const suggestions: ValidationSuggestion[] = []

  if (!pcb?.netList || !firmware?.files) {
    return { valid: true, issues, suggestions }
  }

  // Combine all firmware code
  const firmwareCode = firmware.files.map((f) => f.content).join('\n')

  // Check each PCB net has corresponding GPIO in firmware
  for (const net of pcb.netList) {
    if (net.gpio) {
      const gpioNum = net.gpio.replace(/[^0-9]/g, '')

      // Look for pin definition patterns
      const patterns = [
        `GPIO${gpioNum}`,
        `PIN_${net.net.toUpperCase()}`,
        `#define.*${gpioNum}`,
        `const.*=.*${gpioNum}`,
        `gpio_num_t.*${gpioNum}`,
      ]

      const hasDefinition = patterns.some((pattern) => new RegExp(pattern, 'i').test(firmwareCode))

      if (!hasDefinition) {
        const issueId = `missing_gpio_${net.net}`
        issues.push({
          id: issueId,
          severity: 'error',
          stage: 'firmware',
          message: `Firmware missing GPIO for ${net.net}`,
          details: `PCB assigns ${net.gpio} to ${net.net} but firmware doesn't define this pin`,
        })
        suggestions.push({
          issueId,
          stage: 'firmware',
          action: `Add pin definition: #define PIN_${net.net.toUpperCase()} ${gpioNum}`,
          autoFixable: true,
        })
      }
    }
  }

  // Check I2C addresses if applicable
  const i2cPattern = /0x[0-9a-fA-F]{2}/g
  const firmwareI2CAddresses: string[] = Array.from(firmwareCode.match(i2cPattern) || [])

  // Check for common I2C devices that might be missing
  const placedBlocks = pcb.placedBlocks || []
  const i2cDevices: Record<string, string> = {
    bme280: '0x76',
    sht40: '0x44',
    lis3dh: '0x18',
    veml7700: '0x10',
    vl53l0x: '0x29',
    ssd1306: '0x3C',
  }

  for (const block of placedBlocks) {
    const slug = block.blockSlug.toLowerCase()
    for (const [device, address] of Object.entries(i2cDevices)) {
      if (slug.includes(device)) {
        if (
          !firmwareI2CAddresses.includes(address.toLowerCase()) &&
          !firmwareI2CAddresses.includes(address.toUpperCase())
        ) {
          issues.push({
            id: `missing_i2c_${device}`,
            severity: 'warning',
            stage: 'firmware',
            message: `Firmware may be missing I2C address for ${device}`,
            details: `Expected I2C address ${address} for ${device} not found in firmware`,
          })
        }
      }
    }
  }

  return { valid: issues.filter((i) => i.severity === 'error').length === 0, issues, suggestions }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

interface EnclosureDimensions {
  innerWidth: number
  innerHeight: number
  innerDepth: number
  wallThickness: number
}

/**
 * Parse dimensions from OpenSCAD code
 */
export function parseEnclosureDimensions(openScadCode: string): EnclosureDimensions | null {
  try {
    // Look for common variable patterns in OpenSCAD
    const patterns = {
      pcbWidth: /pcb_width\s*=\s*(\d+(?:\.\d+)?)/,
      pcbHeight: /pcb_height\s*=\s*(\d+(?:\.\d+)?)/,
      wallThickness: /wall(?:_thickness)?\s*=\s*(\d+(?:\.\d+)?)/,
      innerWidth: /inner_width\s*=\s*(\d+(?:\.\d+)?)/,
      innerHeight: /inner_height\s*=\s*(\d+(?:\.\d+)?)/,
      innerDepth: /inner_depth\s*=\s*(\d+(?:\.\d+)?)/,
      caseWidth: /case_width\s*=\s*(\d+(?:\.\d+)?)/,
      caseHeight: /case_height\s*=\s*(\d+(?:\.\d+)?)/,
    }

    const values: Record<string, number> = {}

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = openScadCode.match(pattern)
      if (match) {
        values[key] = parseFloat(match[1])
      }
    }

    // Try to calculate inner dimensions
    const wallThickness = values.wallThickness || 2

    let innerWidth: number
    let innerHeight: number

    if (values.innerWidth) {
      innerWidth = values.innerWidth
    } else if (values.pcbWidth) {
      innerWidth = values.pcbWidth + 1 // PCB clearance
    } else if (values.caseWidth) {
      innerWidth = values.caseWidth - wallThickness * 2
    } else {
      return null
    }

    if (values.innerHeight) {
      innerHeight = values.innerHeight
    } else if (values.pcbHeight) {
      innerHeight = values.pcbHeight + 1
    } else if (values.caseHeight) {
      innerHeight = values.caseHeight - wallThickness * 2
    } else {
      return null
    }

    const innerDepth = values.innerDepth || 20 // Default depth

    return { innerWidth, innerHeight, innerDepth, wallThickness }
  } catch {
    return null
  }
}

/**
 * Generate a validation report for logging/debugging
 */
export function generateValidationReport(result: ValidationResult): string {
  const lines: string[] = ['=== Cross-Stage Validation Report ===', '']

  if (result.valid) {
    lines.push('Status: PASSED')
  } else {
    lines.push('Status: FAILED')
  }

  lines.push('')

  if (result.issues.length === 0) {
    lines.push('No issues found.')
  } else {
    lines.push(`Found ${result.issues.length} issue(s):`)
    lines.push('')

    for (const issue of result.issues) {
      lines.push(`[${issue.severity.toUpperCase()}] ${issue.stage}: ${issue.message}`)
      if (issue.details) {
        lines.push(`  Details: ${issue.details}`)
      }
    }
  }

  if (result.suggestions.length > 0) {
    lines.push('')
    lines.push('Suggestions:')
    for (const suggestion of result.suggestions) {
      lines.push(
        `  - ${suggestion.stage}: ${suggestion.action}${suggestion.autoFixable ? ' (auto-fixable)' : ''}`
      )
    }
  }

  return lines.join('\n')
}
