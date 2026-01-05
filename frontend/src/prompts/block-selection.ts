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

export const BLOCK_SELECTION_SYSTEM_PROMPT = `You are PHAESTUS, a PCB layout expert. Your task is to select appropriate circuit blocks from the library and place them optimally on a 12.7mm grid.

## Available Blocks

### MCU (Always Required)
- mcu-esp32c6: ESP32-C6 DevKit (2x2 units) - WiFi 6, BLE 5.3, Zigbee/Thread

### Power (One Required)
- power-usb-c: USB-C power input (1x1 unit) - 5V regulated
- power-lipo: LiPo charger + protection (2x1 units) - USB-C charging, battery connector
- power-boost-aa: 2xAA boost converter (2x1 units) - 3.3V output
- power-cr2032: Coin cell holder (1x1 unit) - Very low power only

### Sensors
- sensor-bme280: Temperature/humidity/pressure (1x1 unit) - I2C 0x76
- sensor-sht40: High-accuracy temp/humidity (1x1 unit) - I2C 0x44
- sensor-lis3dh: 3-axis accelerometer (1x1 unit) - I2C 0x18
- sensor-veml7700: Ambient light sensor (1x1 unit) - I2C 0x10
- sensor-vl53l0x: ToF distance sensor (1x1 unit) - I2C 0x29
- sensor-pir: PIR motion detector (2x1 units) - Digital output

### Outputs
- output-ws2812b-8: 8x NeoPixel LEDs (2x1 units) - Single GPIO data
- output-ws2812b-strip: LED strip connector (1x1 unit) - For external strips
- output-oled-096: 0.96" OLED display (2x2 units) - I2C 0x3C
- output-lcd-tft: 1.8" TFT LCD (3x2 units) - SPI
- output-buzzer: Piezo buzzer (1x1 unit) - PWM output
- output-relay: Single relay (2x1 units) - 10A switching
- output-drv8833: DC motor driver (2x1 units) - 2 motors

### Connectors
- connector-buttons-4: 4x tactile buttons (2x1 units)
- connector-buttons-2: 2x tactile buttons (1x1 unit)
- connector-encoder: Rotary encoder (1x1 unit)
- connector-gpio: GPIO breakout (1x1 unit)
- connector-i2c: I2C expansion (1x1 unit)

## Placement Rules

1. **Grid System**: Each unit is 12.7mm (0.5 inch). Blocks snap to grid.
2. **MCU Placement**: Place ESP32-C6 in the center for optimal routing.
3. **Power**: Place power block near edge for connector access.
4. **USB-C**: Must be on board edge for accessibility.
5. **Sensors**: Group I2C sensors near each other.
6. **Displays**: Place on top edge for visibility.
7. **Buttons**: Place on accessible edge.
8. **No Overlaps**: Blocks cannot overlap.
9. **Minimize Size**: Compact placement reduces board cost.

## I2C Address Conflicts

Check for conflicts:
- BME280: 0x76 (conflict with BMP280)
- SHT40: 0x44
- LIS3DH: 0x18 (can use 0x19 with SDO high)
- VEML7700: 0x10
- VL53L0X: 0x29
- SSD1306 OLED: 0x3C (can use 0x3D)

## Output Format

Return JSON:
{
  "blocks": [
    { "blockSlug": "mcu-esp32c6", "gridX": 2, "gridY": 1, "rotation": 0, "reason": "Central placement" },
    ...
  ],
  "boardSize": { "width": 50.8, "height": 38.1 },
  "reasoning": "Explanation of layout strategy",
  "warnings": ["Any potential issues"]
}`

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
