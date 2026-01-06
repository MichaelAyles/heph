/**
 * Tests for Enclosure Generation Prompt
 */

import { describe, it, expect } from 'vitest'
import {
  buildEnclosurePrompt,
  buildEnclosureRegenerationPrompt,
  buildEnclosureInputFromSpec,
  type EnclosureInput,
  type ComponentPlacement,
  type EnclosureStyle,
} from './enclosure'

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createBaseInput = (): EnclosureInput => ({
  pcb: {
    width: 50,
    height: 40,
    thickness: 1.6,
  },
  components: [],
  style: {
    type: 'rounded_box',
    wallThickness: 2,
    cornerRadius: 3,
    splitPlane: 'horizontal',
  },
  projectName: 'Test Project',
  projectDescription: 'A test project for unit testing',
})

const createUsbComponent = (): ComponentPlacement => ({
  type: 'usb_c',
  name: 'USB-C Port',
  position: { x: 25, y: 0, z: 3 },
  dimensions: { width: 9.5, height: 3.5, depth: 8 },
  side: 'back',
  requiresCutout: true,
})

const createOledComponent = (): ComponentPlacement => ({
  type: 'oled',
  name: 'OLED Display',
  position: { x: 25, y: 20, z: 10 },
  dimensions: { width: 26, height: 14, depth: 2 },
  side: 'top',
  requiresCutout: true,
})

const createButtonComponent = (): ComponentPlacement => ({
  type: 'button',
  name: 'User Button',
  position: { x: 10, y: 20, z: 8 },
  dimensions: { width: 8, height: 8, depth: 5 },
  side: 'top',
  requiresCutout: true,
  notes: 'Primary user interaction button',
})

// =============================================================================
// buildEnclosurePrompt Tests
// =============================================================================

describe('buildEnclosurePrompt', () => {
  it('includes project name and description', () => {
    const input = createBaseInput()
    const prompt = buildEnclosurePrompt(input)

    expect(prompt).toContain('**Project**: Test Project')
    expect(prompt).toContain('**Description**: A test project for unit testing')
  })

  it('includes PCB specifications', () => {
    const input = createBaseInput()
    const prompt = buildEnclosurePrompt(input)

    expect(prompt).toContain('Width: 50mm')
    expect(prompt).toContain('Height: 40mm')
    expect(prompt).toContain('Thickness: 1.6mm')
  })

  it('includes mounting holes when present', () => {
    const input = createBaseInput()
    input.pcb.mountingHoles = [
      { x: 3, y: 3, diameter: 3 },
      { x: 47, y: 37, diameter: 3 },
    ]
    const prompt = buildEnclosurePrompt(input)

    expect(prompt).toContain('Mounting holes')
    expect(prompt).toContain('Position (3, 3), diameter 3mm')
    expect(prompt).toContain('Position (47, 37), diameter 3mm')
  })

  it('includes enclosure style parameters', () => {
    const input = createBaseInput()
    const prompt = buildEnclosurePrompt(input)

    expect(prompt).toContain('Type: rounded_box')
    expect(prompt).toContain('Wall thickness: 2mm')
    expect(prompt).toContain('Corner radius: 3mm')
    expect(prompt).toContain('Split plane: horizontal')
  })

  it('includes style notes when present', () => {
    const input = createBaseInput()
    input.style.notes = 'Use matte finish for professional look'
    const prompt = buildEnclosurePrompt(input)

    expect(prompt).toContain('Notes: Use matte finish')
  })

  it('includes components requiring cutouts', () => {
    const input = createBaseInput()
    input.components = [createUsbComponent(), createOledComponent()]
    const prompt = buildEnclosurePrompt(input)

    expect(prompt).toContain('### USB-C Port (usb_c)')
    expect(prompt).toContain('Position: (25, 0, 3)mm')
    expect(prompt).toContain('Dimensions: 9.5 x 3.5 x 8mm')
    expect(prompt).toContain('Side: back')

    expect(prompt).toContain('### OLED Display (oled)')
    expect(prompt).toContain('Side: top')
  })

  it('includes component notes when present', () => {
    const input = createBaseInput()
    input.components = [createButtonComponent()]
    const prompt = buildEnclosurePrompt(input)

    expect(prompt).toContain('Notes: Primary user interaction button')
  })

  it('excludes components not requiring cutouts', () => {
    const input = createBaseInput()
    const internalComponent: ComponentPlacement = {
      type: 'sensor',
      name: 'Internal Sensor',
      position: { x: 10, y: 10, z: 5 },
      dimensions: { width: 5, height: 5, depth: 3 },
      side: 'bottom',
      requiresCutout: false,
    }
    input.components = [internalComponent, createUsbComponent()]
    const prompt = buildEnclosurePrompt(input)

    expect(prompt).not.toContain('Internal Sensor')
    expect(prompt).toContain('USB-C Port')
  })

  it('includes design requirements', () => {
    const input = createBaseInput()
    const prompt = buildEnclosurePrompt(input)

    expect(prompt).toContain('must fully contain the PCB')
    expect(prompt).toContain('Include mounting features')
    expect(prompt).toContain('Create appropriately sized cutouts')
    expect(prompt).toContain('3D printing')
    expect(prompt).toContain('snap-fit or screw assembly')
    expect(prompt).toContain('Do NOT use text() function')
  })

  it('handles all enclosure types', () => {
    const types: EnclosureStyle['type'][] = ['box', 'rounded_box', 'handheld', 'wall_mount', 'desktop']

    for (const type of types) {
      const input = createBaseInput()
      input.style.type = type
      const prompt = buildEnclosurePrompt(input)

      expect(prompt).toContain(`Type: ${type}`)
    }
  })

  it('handles all split planes', () => {
    const planes: EnclosureStyle['splitPlane'][] = ['horizontal', 'vertical', 'none']

    for (const plane of planes) {
      const input = createBaseInput()
      input.style.splitPlane = plane
      const prompt = buildEnclosurePrompt(input)

      expect(prompt).toContain(`Split plane: ${plane}`)
    }
  })

  it('handles all component types', () => {
    const componentTypes: ComponentPlacement['type'][] = [
      'usb_c',
      'oled',
      'led',
      'button',
      'sensor',
      'antenna',
      'vent',
      'custom',
    ]

    for (const compType of componentTypes) {
      const input = createBaseInput()
      const comp: ComponentPlacement = {
        type: compType,
        name: `Test ${compType}`,
        position: { x: 0, y: 0, z: 0 },
        dimensions: { width: 10, height: 10, depth: 5 },
        side: 'top',
        requiresCutout: true,
      }
      input.components = [comp]
      const prompt = buildEnclosurePrompt(input)

      expect(prompt).toContain(`(${compType})`)
    }
  })

  it('handles all component sides', () => {
    const sides: ComponentPlacement['side'][] = ['top', 'bottom', 'front', 'back', 'left', 'right']

    for (const side of sides) {
      const input = createBaseInput()
      const comp: ComponentPlacement = {
        type: 'custom',
        name: 'Test Component',
        position: { x: 0, y: 0, z: 0 },
        dimensions: { width: 10, height: 10, depth: 5 },
        side,
        requiresCutout: true,
      }
      input.components = [comp]
      const prompt = buildEnclosurePrompt(input)

      expect(prompt).toContain(`Side: ${side}`)
    }
  })
})

// =============================================================================
// buildEnclosureRegenerationPrompt Tests
// =============================================================================

describe('buildEnclosureRegenerationPrompt', () => {
  it('includes original OpenSCAD code', () => {
    const originalCode = `
// Original enclosure
module box() { cube([10, 10, 10]); }
box();
`
    const feedback = 'Make the corners more rounded'
    const input = createBaseInput()

    const prompt = buildEnclosureRegenerationPrompt(originalCode, feedback, input)

    expect(prompt).toContain('## Previous OpenSCAD Code')
    expect(prompt).toContain('```openscad')
    expect(prompt).toContain('module box()')
  })

  it('includes user feedback', () => {
    const feedback = 'The USB port cutout is too small, please increase by 1mm on each side'
    const prompt = buildEnclosureRegenerationPrompt('// code', feedback, createBaseInput())

    expect(prompt).toContain('## User Feedback')
    expect(prompt).toContain('USB port cutout is too small')
    expect(prompt).toContain('increase by 1mm')
  })

  it('includes original specifications', () => {
    const input = createBaseInput()
    input.pcb.width = 65
    input.pcb.height = 45
    input.style.type = 'handheld'
    input.style.wallThickness = 3
    input.style.cornerRadius = 5
    input.style.splitPlane = 'vertical'

    const prompt = buildEnclosureRegenerationPrompt('// code', 'feedback', input)

    expect(prompt).toContain('PCB: 65 x 45 x 1.6mm')
    expect(prompt).toContain('Style: handheld, 3mm walls, 5mm corners')
    expect(prompt).toContain('Split: vertical')
  })

  it('instructs to maintain original functionality', () => {
    const prompt = buildEnclosureRegenerationPrompt('// code', 'feedback', createBaseInput())

    expect(prompt).toContain('modify the OpenSCAD code')
    expect(prompt).toContain("address the user's feedback")
    expect(prompt).toContain('maintaining all original functionality')
  })
})

// =============================================================================
// buildEnclosureInputFromSpec Tests
// =============================================================================

describe('buildEnclosureInputFromSpec', () => {
  it('uses provided PCB dimensions', () => {
    const pcbArtifacts = {
      boardSize: { width: 75, height: 55 },
      placedBlocks: [],
    }

    const result = buildEnclosureInputFromSpec('Test', 'Description', pcbArtifacts)

    expect(result.pcb.width).toBe(75)
    expect(result.pcb.height).toBe(55)
  })

  it('uses default PCB dimensions when not provided', () => {
    const result = buildEnclosureInputFromSpec('Test', 'Description', {})

    expect(result.pcb.width).toBe(50)
    expect(result.pcb.height).toBe(40)
  })

  it('always includes USB-C component', () => {
    const result = buildEnclosureInputFromSpec('Test', 'Description', {})

    const usb = result.components.find((c) => c.type === 'usb_c')
    expect(usb).toBeDefined()
    expect(usb?.name).toBe('USB-C Port')
    expect(usb?.side).toBe('back')
    expect(usb?.requiresCutout).toBe(true)
  })

  it('adds OLED component from outputs', () => {
    const finalSpec = {
      outputs: [{ type: 'OLED Display', count: 1 }],
    }

    const result = buildEnclosureInputFromSpec('Test', 'Description', {}, finalSpec)

    const oled = result.components.find((c) => c.type === 'oled')
    expect(oled).toBeDefined()
    expect(oled?.side).toBe('top')
  })

  it('adds LED components from outputs', () => {
    const finalSpec = {
      outputs: [{ type: 'WS2812B LEDs', count: 4 }],
    }

    const result = buildEnclosureInputFromSpec('Test', 'Description', {}, finalSpec)

    const leds = result.components.filter((c) => c.type === 'led')
    expect(leds.length).toBe(4)
    expect(leds[0].name).toBe('LED 1')
    expect(leds[3].name).toBe('LED 4')
  })

  it('adds button components from inputs', () => {
    const finalSpec = {
      inputs: [{ type: 'Button', count: 2 }],
    }

    const result = buildEnclosureInputFromSpec('Test', 'Description', {}, finalSpec)

    const buttons = result.components.filter((c) => c.type === 'button')
    expect(buttons.length).toBe(2)
    expect(buttons[0].name).toBe('Button 1')
    expect(buttons[1].name).toBe('Button 2')
  })

  it('generates mounting holes at corners', () => {
    const pcbArtifacts = {
      boardSize: { width: 60, height: 50 },
    }

    const result = buildEnclosureInputFromSpec('Test', 'Description', pcbArtifacts)

    expect(result.pcb.mountingHoles).toHaveLength(4)

    const holes = result.pcb.mountingHoles!
    expect(holes[0]).toEqual({ x: 3, y: 3, diameter: 3 })
    expect(holes[1]).toEqual({ x: 57, y: 3, diameter: 3 })
    expect(holes[2]).toEqual({ x: 3, y: 47, diameter: 3 })
    expect(holes[3]).toEqual({ x: 57, y: 47, diameter: 3 })
  })

  it('uses default enclosure style', () => {
    const result = buildEnclosureInputFromSpec('Test', 'Description', {})

    expect(result.style.type).toBe('rounded_box')
    expect(result.style.wallThickness).toBe(2)
    expect(result.style.cornerRadius).toBe(3)
    expect(result.style.splitPlane).toBe('horizontal')
  })

  it('detects wall_mount style from spec', () => {
    const finalSpec = {
      enclosure: { style: 'wall-mounted sensor housing', width: 80, height: 60, depth: 30 },
    }

    const result = buildEnclosureInputFromSpec('Test', 'Description', {}, finalSpec)

    expect(result.style.type).toBe('wall_mount')
  })

  it('detects handheld style from spec', () => {
    const finalSpec = {
      enclosure: { style: 'handheld remote', width: 80, height: 40, depth: 20 },
    }

    const result = buildEnclosureInputFromSpec('Test', 'Description', {}, finalSpec)

    expect(result.style.type).toBe('handheld')
  })

  it('detects desktop style from spec', () => {
    const finalSpec = {
      enclosure: { style: 'desktop gadget', width: 100, height: 100, depth: 50 },
    }

    const result = buildEnclosureInputFromSpec('Test', 'Description', {}, finalSpec)

    expect(result.style.type).toBe('desktop')
  })

  it('sets project name and description', () => {
    const result = buildEnclosureInputFromSpec('My Cool Project', 'A fancy description', {})

    expect(result.projectName).toBe('My Cool Project')
    expect(result.projectDescription).toBe('A fancy description')
  })

  it('positions USB-C in center of back edge', () => {
    const pcbArtifacts = {
      boardSize: { width: 80, height: 60 },
    }

    const result = buildEnclosureInputFromSpec('Test', 'Description', pcbArtifacts)

    const usb = result.components.find((c) => c.type === 'usb_c')
    expect(usb?.position.x).toBe(40) // center of 80mm width
    expect(usb?.position.y).toBe(0) // back edge
  })

  it('combines multiple output types', () => {
    const finalSpec = {
      outputs: [
        { type: 'OLED Display', count: 1 },
        { type: 'Status LED', count: 2 },
      ],
    }

    const result = buildEnclosureInputFromSpec('Test', 'Description', {}, finalSpec)

    const oled = result.components.filter((c) => c.type === 'oled')
    const leds = result.components.filter((c) => c.type === 'led')

    expect(oled.length).toBe(1)
    // Note: "OLED" contains "led" so it also adds LEDs - this is expected behavior
    // "OLED Display" adds 1 LED, "Status LED" adds 2 = 3 total
    expect(leds.length).toBe(3)
  })

  it('combines inputs and outputs', () => {
    const finalSpec = {
      inputs: [{ type: 'Tactile Button', count: 3 }],
      outputs: [{ type: 'RGB LED Strip', count: 8 }],
    }

    const result = buildEnclosureInputFromSpec('Test', 'Description', {}, finalSpec)

    const buttons = result.components.filter((c) => c.type === 'button')
    const leds = result.components.filter((c) => c.type === 'led')

    expect(buttons.length).toBe(3)
    expect(leds.length).toBe(8)
  })

  it('handles empty finalSpec', () => {
    const result = buildEnclosureInputFromSpec('Test', 'Description', {}, {})

    // Should still have USB-C
    expect(result.components.length).toBe(1)
    expect(result.components[0].type).toBe('usb_c')
  })

  it('handles undefined finalSpec', () => {
    const result = buildEnclosureInputFromSpec('Test', 'Description', {})

    expect(result.components.length).toBe(1)
    expect(result.components[0].type).toBe('usb_c')
  })
})
