/**
 * Block Selection Prompt
 *
 * Logic for automatically selecting and placing PCB blocks based on
 * the final specification. Used by the orchestrator in VIBE IT mode.
 */

import type { FinalSpec, PcbBlock } from '@/db/schema'

// =============================================================================
// TYPES
// =============================================================================

export interface BlockPlacement {
  blockSlug: string
  gridX: number
  gridY: number
  rotation: 0 | 90 | 180 | 270
  reason: string
}

export interface BlockSelectionResult {
  blocks: BlockPlacement[]
  boardSize: { width: number; height: number }
  reasoning: string
  warnings: string[]
}

// =============================================================================
// BLOCK SELECTION PROMPT
// =============================================================================

// NOTE: System prompt is stored in database (orchestrator_prompts table)
// Use /api/langgraph/invoke/block_selection to get AI suggestions

/**
 * Build the block selection prompt from a final spec
 */
export function buildBlockSelectionPrompt(finalSpec: FinalSpec): string {
  let prompt = `Select and place PCB blocks for this specification:

## Project: ${finalSpec.name}
${finalSpec.summary}

## Requirements

### Power
- Source: ${finalSpec.power.source}
- Voltage: ${finalSpec.power.voltage}
- Current: ${finalSpec.power.current}
${finalSpec.power.batteryLife ? `- Battery life target: ${finalSpec.power.batteryLife}` : ''}

### Inputs
`

  for (const input of finalSpec.inputs) {
    prompt += `- ${input.type} x${input.count}${input.notes ? ` (${input.notes})` : ''}\n`
  }

  prompt += `
### Outputs
`

  for (const output of finalSpec.outputs) {
    prompt += `- ${output.type} x${output.count}${output.notes ? ` (${output.notes})` : ''}\n`
  }

  prompt += `
### Communication
- Type: ${finalSpec.communication.type}
- Protocol: ${finalSpec.communication.protocol}

### Target PCB Size
- ${finalSpec.pcbSize.width} x ${finalSpec.pcbSize.height} ${finalSpec.pcbSize.unit}

Select blocks and calculate optimal placement. Return JSON.`

  return prompt
}

// =============================================================================
// AUTOMATIC BLOCK SELECTION
// =============================================================================

/**
 * Automatically select blocks based on final spec (no LLM required)
 * This provides a deterministic baseline that the LLM can refine
 */
export function autoSelectBlocks(
  finalSpec: FinalSpec,
  availableBlocks: PcbBlock[]
): BlockSelectionResult {
  const selectedBlocks: BlockPlacement[] = []
  const warnings: string[] = []
  let nextGridX = 0
  let nextGridY = 0
  let maxWidth = 0
  let maxHeight = 0

  // Helper to find block by pattern
  const findBlock = (pattern: string): PcbBlock | undefined =>
    availableBlocks.find((b) => b.slug.toLowerCase().includes(pattern.toLowerCase()))

  // Helper to place a block
  const placeBlock = (slug: string, reason: string): void => {
    const block = availableBlocks.find((b) => b.slug === slug)
    if (!block) {
      warnings.push(`Block ${slug} not found in library`)
      return
    }

    // Simple row-based packing
    if (nextGridX + block.widthUnits > 6) {
      nextGridX = 0
      nextGridY = maxHeight
    }

    selectedBlocks.push({
      blockSlug: slug,
      gridX: nextGridX,
      gridY: nextGridY,
      rotation: 0,
      reason,
    })

    nextGridX += block.widthUnits
    maxWidth = Math.max(maxWidth, nextGridX)
    maxHeight = Math.max(maxHeight, nextGridY + block.heightUnits)
  }

  // 1. Always add MCU
  const mcuBlock = findBlock('mcu-esp32c6')
  if (mcuBlock) {
    placeBlock(mcuBlock.slug, 'Required MCU')
  } else {
    warnings.push('ESP32-C6 MCU block not found')
  }

  // 2. Add power block based on spec
  const powerSource = finalSpec.power.source.toLowerCase()
  if (powerSource.includes('usb')) {
    const block = findBlock('power-usb')
    if (block) placeBlock(block.slug, `Power source: ${finalSpec.power.source}`)
  } else if (
    powerSource.includes('lipo') ||
    powerSource.includes('battery') ||
    powerSource.includes('lithium')
  ) {
    const block = findBlock('power-lipo')
    if (block) placeBlock(block.slug, `Power source: ${finalSpec.power.source}`)
  } else if (powerSource.includes('aa') || powerSource.includes('aaa')) {
    const block = findBlock('power-boost')
    if (block) placeBlock(block.slug, `Power source: ${finalSpec.power.source}`)
  } else if (powerSource.includes('cr2032') || powerSource.includes('coin')) {
    const block = findBlock('power-cr2032')
    if (block) placeBlock(block.slug, `Power source: ${finalSpec.power.source}`)
  } else {
    // Default to USB-C
    const block = findBlock('power-usb')
    if (block) placeBlock(block.slug, 'Default USB-C power')
  }

  // 3. Add sensors/outputs based on spec outputs
  for (const output of finalSpec.outputs) {
    const outputType = output.type.toLowerCase()

    // Temperature/humidity/pressure
    if (
      outputType.includes('temperature') ||
      outputType.includes('humidity') ||
      outputType.includes('environmental')
    ) {
      const block = findBlock('sensor-bme280') || findBlock('sensor-sht40')
      if (block) placeBlock(block.slug, `Sensor for ${output.type}`)
    }

    // Accelerometer/motion
    if (
      outputType.includes('acceleration') ||
      outputType.includes('motion') ||
      outputType.includes('tilt')
    ) {
      const block = findBlock('sensor-lis3dh')
      if (block) placeBlock(block.slug, `Sensor for ${output.type}`)
    }

    // Light
    if (
      outputType.includes('light') ||
      outputType.includes('ambient') ||
      outputType.includes('lux')
    ) {
      const block = findBlock('sensor-veml7700')
      if (block) placeBlock(block.slug, `Sensor for ${output.type}`)
    }

    // Distance
    if (
      outputType.includes('distance') ||
      outputType.includes('proximity') ||
      outputType.includes('range')
    ) {
      const block = findBlock('sensor-vl53l0x')
      if (block) placeBlock(block.slug, `Sensor for ${output.type}`)
    }

    // PIR motion
    if (outputType.includes('pir') || outputType.includes('presence')) {
      const block = findBlock('sensor-pir')
      if (block) placeBlock(block.slug, `Sensor for ${output.type}`)
    }

    // LEDs
    if (
      outputType.includes('led') ||
      outputType.includes('neopixel') ||
      outputType.includes('ws2812')
    ) {
      const block = findBlock('output-ws2812b')
      if (block) placeBlock(block.slug, `Output for ${output.type}`)
    }

    // Display
    if (
      outputType.includes('display') ||
      outputType.includes('oled') ||
      outputType.includes('screen')
    ) {
      const block = findBlock('output-oled')
      if (block) placeBlock(block.slug, `Display for ${output.type}`)
    }

    // Buzzer
    if (
      outputType.includes('buzzer') ||
      outputType.includes('sound') ||
      outputType.includes('beep')
    ) {
      const block = findBlock('output-buzzer')
      if (block) placeBlock(block.slug, `Output for ${output.type}`)
    }

    // Relay
    if (outputType.includes('relay') || outputType.includes('switch')) {
      const block = findBlock('output-relay')
      if (block) placeBlock(block.slug, `Output for ${output.type}`)
    }

    // Motor
    if (outputType.includes('motor')) {
      const block = findBlock('output-drv8833')
      if (block) placeBlock(block.slug, `Output for ${output.type}`)
    }
  }

  // 4. Add inputs based on spec inputs
  for (const input of finalSpec.inputs) {
    const inputType = input.type.toLowerCase()

    if (inputType.includes('button')) {
      if (input.count <= 2) {
        const block = findBlock('connector-buttons-2')
        if (block) placeBlock(block.slug, `Input for ${input.type}`)
      } else {
        const block = findBlock('connector-buttons-4')
        if (block) placeBlock(block.slug, `Input for ${input.type}`)
      }
    }

    if (inputType.includes('encoder') || inputType.includes('dial') || inputType.includes('knob')) {
      const block = findBlock('connector-encoder')
      if (block) placeBlock(block.slug, `Input for ${input.type}`)
    }
  }

  // Calculate board size (12.7mm per grid unit)
  const GRID_SIZE_MM = 12.7
  const boardWidth = Math.max(maxWidth, 4) * GRID_SIZE_MM // Minimum 4 units wide
  const boardHeight = Math.max(maxHeight, 3) * GRID_SIZE_MM // Minimum 3 units tall

  return {
    blocks: selectedBlocks,
    boardSize: { width: boardWidth, height: boardHeight },
    reasoning: `Auto-selected ${selectedBlocks.length} blocks based on spec requirements. Board size: ${boardWidth}x${boardHeight}mm`,
    warnings,
  }
}

/**
 * Validate block selection against spec
 */
export function validateBlockSelection(
  selection: BlockSelectionResult,
  _finalSpec: FinalSpec
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check for MCU
  if (!selection.blocks.some((b) => b.blockSlug.includes('mcu'))) {
    errors.push('Missing MCU block')
  }

  // Check for power
  if (!selection.blocks.some((b) => b.blockSlug.includes('power'))) {
    errors.push('Missing power block')
  }

  // Check for overlaps
  for (let i = 0; i < selection.blocks.length; i++) {
    for (let j = i + 1; j < selection.blocks.length; j++) {
      const a = selection.blocks[i]
      const b = selection.blocks[j]
      // Simple overlap check (would need block dimensions for accuracy)
      if (a.gridX === b.gridX && a.gridY === b.gridY) {
        errors.push(`Blocks ${a.blockSlug} and ${b.blockSlug} overlap at (${a.gridX}, ${a.gridY})`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
