/**
 * Block DRC (Design Rule Check) Validation Service
 *
 * Client-side DRC validation for PCB block combinations.
 * Checks for conflicts, power budgets, and compatibility before assembly.
 */

import type { BlockDefinition } from '@/schemas/block'

// =============================================================================
// Types
// =============================================================================

export interface DRCResult {
  valid: boolean
  errors: DRCError[]
  warnings: DRCWarning[]
}

export interface DRCError {
  code: DRCErrorCode
  message: string
  blocks: string[] // Slugs of involved blocks
  details?: Record<string, unknown>
}

export interface DRCWarning {
  code: DRCWarningCode
  message: string
  blocks: string[] // Slugs of involved blocks
  details?: Record<string, unknown>
}

export type DRCErrorCode =
  | 'I2C_ADDRESS_CONFLICT'
  | 'GPIO_CONFLICT'
  | 'SPI_CS_CONFLICT'
  | 'NO_MCU'
  | 'MULTIPLE_MCU'
  | 'MISSING_POWER_RAIL'
  | 'POWER_BUDGET_EXCEEDED'

export type DRCWarningCode =
  | 'POWER_NEAR_CAPACITY'
  | 'MULTIPLE_POWER_PROVIDERS'
  | 'I2C_ADDRESS_CONFLICT_CONFIGURABLE'
  | 'NO_I2C_PULLUPS'

export interface PowerBudget {
  provides: Record<string, number>
  requires: Record<string, { typical: number; max: number }>
}

// =============================================================================
// Main DRC Validation
// =============================================================================

/**
 * Run all DRC checks on a set of blocks
 */
export function validateBlockCombination(blocks: BlockDefinition[]): DRCResult {
  const errors: DRCError[] = []
  const warnings: DRCWarning[] = []

  if (blocks.length === 0) {
    return { valid: true, errors, warnings }
  }

  // Check for MCU
  const mcuBlocks = blocks.filter((b) => b.category === 'mcu')
  if (mcuBlocks.length === 0) {
    errors.push({
      code: 'NO_MCU',
      message: 'No MCU block selected. An MCU block is required to define the bus.',
      blocks: [],
    })
  } else if (mcuBlocks.length > 1) {
    errors.push({
      code: 'MULTIPLE_MCU',
      message: `Multiple MCU blocks selected: ${mcuBlocks.map((b) => b.name).join(', ')}. Only one MCU is allowed.`,
      blocks: mcuBlocks.map((b) => b.slug),
    })
  }

  // Check pairwise conflicts
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      // I2C conflicts
      const i2cErrors = checkI2cConflict(blocks[i], blocks[j])
      errors.push(...i2cErrors.errors)
      warnings.push(...i2cErrors.warnings)

      // GPIO conflicts
      errors.push(...checkGpioConflict(blocks[i], blocks[j]))

      // SPI CS conflicts
      errors.push(...checkSpiConflict(blocks[i], blocks[j]))
    }
  }

  // Power budget analysis
  const powerResult = analyzePowerBudget(blocks)
  errors.push(...powerResult.errors)
  warnings.push(...powerResult.warnings)

  // I2C pullup check
  const pullupWarning = checkI2cPullups(blocks)
  if (pullupWarning) {
    warnings.push(pullupWarning)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// =============================================================================
// Individual Checks
// =============================================================================

/**
 * Check for I2C address conflicts between two blocks
 */
function checkI2cConflict(
  block1: BlockDefinition,
  block2: BlockDefinition
): { errors: DRCError[]; warnings: DRCWarning[] } {
  const errors: DRCError[] = []
  const warnings: DRCWarning[] = []

  const addr1 = block1.bus.i2c?.addresses || []
  const addr2 = block2.bus.i2c?.addresses || []

  if (addr1.length === 0 || addr2.length === 0) {
    return { errors, warnings }
  }

  const overlap = addr1.filter((addr) => addr2.includes(addr))

  for (const addr of overlap) {
    const addrHex = `0x${addr.toString(16).padStart(2, '0')}`
    const isConfigurable =
      block1.bus.i2c?.addressConfigurable || block2.bus.i2c?.addressConfigurable

    if (isConfigurable) {
      warnings.push({
        code: 'I2C_ADDRESS_CONFLICT_CONFIGURABLE',
        message: `I2C address conflict at ${addrHex} between ${block1.name} and ${block2.name}. ` +
          `One or both blocks have configurable addresses - adjust jumpers to resolve.`,
        blocks: [block1.slug, block2.slug],
        details: { address: addr, addressHex: addrHex },
      })
    } else {
      errors.push({
        code: 'I2C_ADDRESS_CONFLICT',
        message: `I2C address conflict at ${addrHex} between ${block1.name} and ${block2.name}. ` +
          `These blocks cannot be used together.`,
        blocks: [block1.slug, block2.slug],
        details: { address: addr, addressHex: addrHex },
      })
    }
  }

  return { errors, warnings }
}

/**
 * Check for GPIO claim conflicts between two blocks
 */
function checkGpioConflict(
  block1: BlockDefinition,
  block2: BlockDefinition
): DRCError[] {
  const errors: DRCError[] = []

  const gpio1 = block1.bus.gpio?.claims || []
  const gpio2 = block2.bus.gpio?.claims || []

  if (gpio1.length === 0 || gpio2.length === 0) {
    return errors
  }

  const overlap = gpio1.filter((gpio) => gpio2.includes(gpio))

  for (const gpio of overlap) {
    errors.push({
      code: 'GPIO_CONFLICT',
      message: `GPIO conflict: ${gpio} claimed by both ${block1.name} and ${block2.name}`,
      blocks: [block1.slug, block2.slug],
      details: { gpio },
    })
  }

  return errors
}

/**
 * Check for SPI chip select conflicts between two blocks
 */
function checkSpiConflict(
  block1: BlockDefinition,
  block2: BlockDefinition
): DRCError[] {
  const errors: DRCError[] = []

  const cs1 = block1.bus.spi?.csPin
  const cs2 = block2.bus.spi?.csPin

  if (!cs1 || !cs2) {
    return errors
  }

  if (cs1 === cs2) {
    errors.push({
      code: 'SPI_CS_CONFLICT',
      message: `SPI chip select conflict: ${cs1} used by both ${block1.name} and ${block2.name}`,
      blocks: [block1.slug, block2.slug],
      details: { csPin: cs1 },
    })
  }

  return errors
}

/**
 * Analyze power budget for a set of blocks
 */
function analyzePowerBudget(blocks: BlockDefinition[]): {
  errors: DRCError[]
  warnings: DRCWarning[]
  budget: PowerBudget
} {
  const errors: DRCError[] = []
  const warnings: DRCWarning[] = []
  const provides: Record<string, number> = {}
  const requires: Record<string, { typical: number; max: number }> = {}
  const providers: Record<string, string[]> = {}

  for (const block of blocks) {
    // Aggregate provides
    if (block.bus.power?.provides) {
      for (const p of block.bus.power.provides) {
        const rail = normalizeRail(p.rail)
        if (provides[rail]) {
          // Track multiple providers
          if (!providers[rail]) providers[rail] = []
          providers[rail].push(block.name)
          // Take the max capacity
          provides[rail] = Math.max(provides[rail], p.maxMa)
        } else {
          provides[rail] = p.maxMa
          providers[rail] = [block.name]
        }
      }
    }

    // Aggregate requires
    if (block.bus.power?.requires) {
      for (const r of block.bus.power.requires) {
        const rail = normalizeRail(r.rail)
        if (!requires[rail]) {
          requires[rail] = { typical: 0, max: 0 }
        }
        requires[rail].typical += r.typicalMa
        requires[rail].max += r.maxMa
      }
    }
  }

  // Warn about multiple providers
  for (const [rail, providerList] of Object.entries(providers)) {
    if (providerList.length > 1) {
      warnings.push({
        code: 'MULTIPLE_POWER_PROVIDERS',
        message: `Multiple blocks provide ${rail} rail: ${providerList.join(', ')}. ` +
          `Ensure power sources don't conflict (e.g., via isolation taps).`,
        blocks: blocks
          .filter((b) => b.bus.power?.provides?.some((p) => normalizeRail(p.rail) === rail))
          .map((b) => b.slug),
        details: { rail, providers: providerList },
      })
    }
  }

  // Check requirements vs provisions
  for (const [rail, req] of Object.entries(requires)) {
    const available = provides[rail] || 0

    if (available === 0) {
      errors.push({
        code: 'MISSING_POWER_RAIL',
        message: `No block provides ${rail} rail, but ${req.max}mA max is required`,
        blocks: blocks
          .filter((b) => b.bus.power?.requires?.some((r) => normalizeRail(r.rail) === rail))
          .map((b) => b.slug),
        details: { rail, requiredMax: req.max },
      })
    } else if (req.max > available) {
      errors.push({
        code: 'POWER_BUDGET_EXCEEDED',
        message: `${rail} rail budget exceeded: ${req.max}mA required, ${available}mA available`,
        blocks: blocks.map((b) => b.slug),
        details: { rail, required: req.max, available },
      })
    } else if (req.typical > available * 0.8) {
      warnings.push({
        code: 'POWER_NEAR_CAPACITY',
        message: `${rail} rail near capacity: ${req.typical}mA typical usage, ${available}mA available (${Math.round((req.typical / available) * 100)}% utilization)`,
        blocks: blocks.map((b) => b.slug),
        details: { rail, typical: req.typical, available, utilization: req.typical / available },
      })
    }
  }

  return {
    errors,
    warnings,
    budget: { provides, requires },
  }
}

/**
 * Check if any block provides I2C pullups
 */
function checkI2cPullups(blocks: BlockDefinition[]): DRCWarning | null {
  const hasI2cDevice = blocks.some((b) => b.bus.i2c?.addresses?.length)
  const hasPullups = blocks.some((b) => b.bus.i2c?.providesPullups)

  if (hasI2cDevice && !hasPullups) {
    return {
      code: 'NO_I2C_PULLUPS',
      message: 'No block provides I2C pullup resistors. External pullups may be required.',
      blocks: blocks.filter((b) => b.bus.i2c?.addresses?.length).map((b) => b.slug),
    }
  }

  return null
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Normalize power rail names to consistent format
 */
function normalizeRail(rail: string): string {
  const normalized = rail.toUpperCase()
  if (normalized === 'V3V3' || normalized === '3V3') return '3V3'
  if (normalized === 'VBUS' || normalized === '5V0') return '5V0'
  if (normalized === 'VBAT') return 'VBAT'
  return normalized
}

/**
 * Get a human-readable summary of DRC results
 */
export function formatDRCResult(result: DRCResult): string {
  const lines: string[] = []

  if (result.valid) {
    lines.push('DRC: PASSED')
  } else {
    lines.push('DRC: FAILED')
  }

  if (result.errors.length > 0) {
    lines.push('')
    lines.push(`Errors (${result.errors.length}):`)
    for (const error of result.errors) {
      lines.push(`  - [${error.code}] ${error.message}`)
    }
  }

  if (result.warnings.length > 0) {
    lines.push('')
    lines.push(`Warnings (${result.warnings.length}):`)
    for (const warning of result.warnings) {
      lines.push(`  - [${warning.code}] ${warning.message}`)
    }
  }

  return lines.join('\n')
}

/**
 * Quick check if blocks are compatible (errors only, no warnings)
 */
export function areBlocksCompatible(blocks: BlockDefinition[]): boolean {
  return validateBlockCombination(blocks).valid
}

/**
 * Calculate total power requirements for a set of blocks
 */
export function calculateTotalPower(blocks: BlockDefinition[]): PowerBudget {
  return analyzePowerBudget(blocks).budget
}

/**
 * Find blocks that conflict with a given block
 */
export function findConflictingBlocks(
  newBlock: BlockDefinition,
  existingBlocks: BlockDefinition[]
): { slug: string; reason: string }[] {
  const conflicts: { slug: string; reason: string }[] = []

  for (const existing of existingBlocks) {
    // Check I2C
    const i2cResult = checkI2cConflict(newBlock, existing)
    if (i2cResult.errors.length > 0) {
      conflicts.push({
        slug: existing.slug,
        reason: i2cResult.errors[0].message,
      })
      continue
    }

    // Check GPIO
    const gpioErrors = checkGpioConflict(newBlock, existing)
    if (gpioErrors.length > 0) {
      conflicts.push({
        slug: existing.slug,
        reason: gpioErrors[0].message,
      })
      continue
    }

    // Check SPI
    const spiErrors = checkSpiConflict(newBlock, existing)
    if (spiErrors.length > 0) {
      conflicts.push({
        slug: existing.slug,
        reason: spiErrors[0].message,
      })
    }
  }

  return conflicts
}
