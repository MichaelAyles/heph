/**
 * Tests for Firmware Generation Prompt
 */

import { describe, it, expect } from 'vitest'
import {
  buildFirmwarePrompt,
  buildFirmwareModificationPrompt,
  buildFirmwareInputFromSpec,
  type FirmwareInput,
  type PinAssignment,
  type SensorConfig,
  type OutputConfig,
  type FirmwareProject,
} from './firmware'

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createBaseInput = (): FirmwareInput => ({
  projectName: 'Test Project',
  projectDescription: 'A test firmware project',
  mcu: {
    type: 'ESP32-C6',
    clockSpeed: 160,
  },
  pins: [
    { name: 'I2C_SDA', gpio: 6, mode: 'OUTPUT', description: 'I2C Data', protocol: 'I2C' },
    { name: 'I2C_SCL', gpio: 7, mode: 'OUTPUT', description: 'I2C Clock', protocol: 'I2C' },
    { name: 'LED_BUILTIN', gpio: 8, mode: 'OUTPUT', description: 'Built-in LED' },
  ],
  protocols: [
    {
      type: 'I2C',
      pins: { sda: 6, scl: 7 },
      devices: ['BME280'],
    },
  ],
  power: {
    source: 'USB-C',
    batteryMonitoring: false,
    deepSleepEnabled: false,
  },
  features: ['Temperature monitoring', 'LED status'],
  sensors: [
    {
      type: 'Environmental',
      model: 'BME280',
      interface: 'I2C',
      address: 0x76,
      readings: ['temperature', 'humidity', 'pressure'],
    },
  ],
  outputs: [
    {
      type: 'WS2812B LEDs',
      model: 'WS2812B',
      interface: 'GPIO',
      pin: 10,
      count: 4,
    },
  ],
  preferences: {
    language: 'cpp',
    framework: 'arduino',
    useOTA: true,
    useWiFi: true,
    useBLE: false,
  },
})

// =============================================================================
// buildFirmwarePrompt Tests
// =============================================================================

describe('buildFirmwarePrompt', () => {
  it('includes project name and description', () => {
    const input = createBaseInput()
    const prompt = buildFirmwarePrompt(input)

    expect(prompt).toContain('**Project**: Test Project')
    expect(prompt).toContain('**Description**: A test firmware project')
  })

  it('includes MCU configuration', () => {
    const input = createBaseInput()
    const prompt = buildFirmwarePrompt(input)

    expect(prompt).toContain('Type: ESP32-C6')
    expect(prompt).toContain('Clock: 160MHz')
  })

  it('includes pin assignments', () => {
    const input = createBaseInput()
    const prompt = buildFirmwarePrompt(input)

    expect(prompt).toContain('GPIO6: I2C_SDA (OUTPUT) - I2C')
    expect(prompt).toContain('GPIO7: I2C_SCL (OUTPUT) - I2C')
    expect(prompt).toContain('GPIO8: LED_BUILTIN (OUTPUT)')
  })

  it('includes sensors with I2C addresses', () => {
    const input = createBaseInput()
    const prompt = buildFirmwarePrompt(input)

    expect(prompt).toContain('BME280 (Environmental) via I2C at 0x76')
    expect(prompt).toContain('Measures: temperature, humidity, pressure')
  })

  it('includes sensors without addresses', () => {
    const input = createBaseInput()
    input.sensors = [
      {
        type: 'Analog',
        model: 'Potentiometer',
        interface: 'ANALOG',
        pin: 1,
        readings: ['position'],
      },
    ]
    const prompt = buildFirmwarePrompt(input)

    expect(prompt).toContain('Potentiometer (Analog) via ANALOG')
    expect(prompt).toContain('Measures: position')
  })

  it('includes outputs with pin and count', () => {
    const input = createBaseInput()
    const prompt = buildFirmwarePrompt(input)

    expect(prompt).toContain('WS2812B LEDs (WS2812B) via GPIO on GPIO10 x4')
  })

  it('includes outputs without model', () => {
    const input = createBaseInput()
    input.outputs = [
      {
        type: 'Relay',
        interface: 'GPIO',
        pin: 15,
      },
    ]
    const prompt = buildFirmwarePrompt(input)

    expect(prompt).toContain('Relay via GPIO on GPIO15')
    expect(prompt).not.toContain('Relay (')
  })

  it('includes power configuration', () => {
    const input = createBaseInput()
    const prompt = buildFirmwarePrompt(input)

    expect(prompt).toContain('Source: USB-C')
    expect(prompt).toContain('Battery monitoring: No')
    expect(prompt).toContain('Deep sleep: Disabled')
  })

  it('includes battery monitoring when enabled', () => {
    const input = createBaseInput()
    input.power.batteryMonitoring = true
    input.power.deepSleepEnabled = true
    const prompt = buildFirmwarePrompt(input)

    expect(prompt).toContain('Battery monitoring: Yes')
    expect(prompt).toContain('Deep sleep: Enabled')
  })

  it('includes connectivity preferences', () => {
    const input = createBaseInput()
    const prompt = buildFirmwarePrompt(input)

    expect(prompt).toContain('WiFi: Enabled')
    expect(prompt).toContain('BLE: Disabled')
    expect(prompt).toContain('OTA updates: Enabled')
  })

  it('shows disabled connectivity when false', () => {
    const input = createBaseInput()
    input.preferences.useWiFi = false
    input.preferences.useBLE = true
    input.preferences.useOTA = false
    const prompt = buildFirmwarePrompt(input)

    expect(prompt).toContain('WiFi: Disabled')
    expect(prompt).toContain('BLE: Enabled')
    expect(prompt).toContain('OTA updates: Disabled')
  })

  it('includes requirements section', () => {
    const input = createBaseInput()
    const prompt = buildFirmwarePrompt(input)

    expect(prompt).toContain('Generate a complete PlatformIO project')
    expect(prompt).toContain('proper initialization for all sensors')
    expect(prompt).toContain('WiFi connection with reconnection logic')
    expect(prompt).toContain('OTA update support')
    expect(prompt).toContain('deep sleep support')
    expect(prompt).toContain('debug logging')
  })

  it('handles empty sensors array', () => {
    const input = createBaseInput()
    input.sensors = []
    const prompt = buildFirmwarePrompt(input)

    expect(prompt).toContain('### Sensors')
    // Should not crash
  })

  it('handles empty outputs array', () => {
    const input = createBaseInput()
    input.outputs = []
    const prompt = buildFirmwarePrompt(input)

    expect(prompt).toContain('### Outputs')
    // Should not crash
  })

  it('handles empty pins array', () => {
    const input = createBaseInput()
    input.pins = []
    const prompt = buildFirmwarePrompt(input)

    expect(prompt).toContain('### Pin Assignments')
    // Should not crash
  })

  it('handles all sensor interfaces', () => {
    const interfaces = ['I2C', 'SPI', 'ANALOG', 'DIGITAL'] as const
    for (const iface of interfaces) {
      const input = createBaseInput()
      input.sensors = [
        {
          type: 'Test',
          model: 'TestSensor',
          interface: iface,
          readings: ['value'],
        },
      ]
      const prompt = buildFirmwarePrompt(input)
      expect(prompt).toContain(`via ${iface}`)
    }
  })

  it('handles all output interfaces', () => {
    const interfaces = ['GPIO', 'PWM', 'I2C', 'SPI'] as const
    for (const iface of interfaces) {
      const input = createBaseInput()
      input.outputs = [
        {
          type: 'TestOutput',
          interface: iface,
        },
      ]
      const prompt = buildFirmwarePrompt(input)
      expect(prompt).toContain(`via ${iface}`)
    }
  })

  it('handles all pin modes', () => {
    const modes = ['INPUT', 'OUTPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN', 'ANALOG'] as const
    for (const mode of modes) {
      const input = createBaseInput()
      input.pins = [
        {
          name: 'TEST_PIN',
          gpio: 1,
          mode,
          description: 'Test',
        },
      ]
      const prompt = buildFirmwarePrompt(input)
      expect(prompt).toContain(`(${mode})`)
    }
  })
})

// =============================================================================
// buildFirmwareModificationPrompt Tests
// =============================================================================

describe('buildFirmwareModificationPrompt', () => {
  it('includes current files', () => {
    const files: FirmwareProject['files'] = [
      { path: 'src/main.cpp', content: 'void setup() {}', language: 'cpp' },
      { path: 'include/config.h', content: '#define PIN 5', language: 'h' },
    ]
    const prompt = buildFirmwareModificationPrompt(files, 'Add LED support', createBaseInput())

    expect(prompt).toContain('### src/main.cpp')
    expect(prompt).toContain('```cpp')
    expect(prompt).toContain('void setup() {}')
    expect(prompt).toContain('### include/config.h')
    expect(prompt).toContain('```h')
    expect(prompt).toContain('#define PIN 5')
  })

  it('includes user request', () => {
    const feedback = 'Please add support for MQTT publishing'
    const prompt = buildFirmwareModificationPrompt([], feedback, createBaseInput())

    expect(prompt).toContain('## User Request')
    expect(prompt).toContain('add support for MQTT publishing')
  })

  it('includes hardware context', () => {
    const input = createBaseInput()
    input.sensors = [
      { type: 'Environmental', model: 'BME280', interface: 'I2C', readings: [] },
      { type: 'Motion', model: 'LIS3DH', interface: 'I2C', readings: [] },
    ]
    input.outputs = [
      { type: 'WS2812B LEDs', interface: 'GPIO' },
      { type: 'OLED Display', interface: 'I2C' },
    ]

    const prompt = buildFirmwareModificationPrompt([], 'feedback', input)

    expect(prompt).toContain('Project: Test Project')
    expect(prompt).toContain('MCU: ESP32-C6')
    expect(prompt).toContain('Sensors: BME280, LIS3DH')
    expect(prompt).toContain('Outputs: WS2812B LEDs, OLED Display')
  })

  it('instructs to return changed files only', () => {
    const prompt = buildFirmwareModificationPrompt([], 'feedback', createBaseInput())

    expect(prompt).toContain('modify the firmware')
    expect(prompt).toContain("address the user's request")
    expect(prompt).toContain('Return the complete updated files as JSON')
    expect(prompt).toContain('Only include files that have changed')
  })

  it('handles empty files array', () => {
    const prompt = buildFirmwareModificationPrompt([], 'feedback', createBaseInput())

    expect(prompt).toContain('## Current Code')
    // Should not crash
  })
})

// =============================================================================
// buildFirmwareInputFromSpec Tests
// =============================================================================

describe('buildFirmwareInputFromSpec', () => {
  it('sets project name and description', () => {
    const result = buildFirmwareInputFromSpec('My Project', 'Description here', {})

    expect(result.projectName).toBe('My Project')
    expect(result.projectDescription).toBe('Description here')
  })

  it('sets default MCU configuration', () => {
    const result = buildFirmwareInputFromSpec('Test', 'Desc', {})

    expect(result.mcu.type).toBe('ESP32-C6')
    expect(result.mcu.clockSpeed).toBe(160)
  })

  it('sets default preferences', () => {
    const result = buildFirmwareInputFromSpec('Test', 'Desc', {})

    expect(result.preferences.language).toBe('cpp')
    expect(result.preferences.framework).toBe('arduino')
    expect(result.preferences.useOTA).toBe(true)
    expect(result.preferences.useWiFi).toBe(true)
    expect(result.preferences.useBLE).toBe(false)
  })

  it('adds BME280 for temperature outputs', () => {
    const finalSpec = {
      outputs: [{ type: 'Temperature sensor', count: 1 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const bme = result.sensors.find((s) => s.model === 'BME280')
    expect(bme).toBeDefined()
    expect(bme?.interface).toBe('I2C')
    expect(bme?.address).toBe(0x76)
    expect(bme?.readings).toContain('temperature')
  })

  it('adds BME280 for humidity outputs', () => {
    const finalSpec = {
      outputs: [{ type: 'Humidity monitor', count: 1 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const bme = result.sensors.find((s) => s.model === 'BME280')
    expect(bme).toBeDefined()
    expect(bme?.readings).toContain('humidity')
  })

  it('adds LIS3DH for accelerometer outputs', () => {
    const finalSpec = {
      outputs: [{ type: 'Accelerometer data', count: 1 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const lis = result.sensors.find((s) => s.model === 'LIS3DH')
    expect(lis).toBeDefined()
    expect(lis?.address).toBe(0x18)
  })

  it('adds LIS3DH for motion outputs', () => {
    const finalSpec = {
      outputs: [{ type: 'Motion detection', count: 1 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const lis = result.sensors.find((s) => s.model === 'LIS3DH')
    expect(lis).toBeDefined()
  })

  it('adds VEML7700 for light outputs', () => {
    const finalSpec = {
      outputs: [{ type: 'Light sensor', count: 1 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const veml = result.sensors.find((s) => s.model === 'VEML7700')
    expect(veml).toBeDefined()
    expect(veml?.address).toBe(0x10)
  })

  it('adds VEML7700 for ambient outputs', () => {
    const finalSpec = {
      outputs: [{ type: 'Ambient light level', count: 1 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const veml = result.sensors.find((s) => s.model === 'VEML7700')
    expect(veml).toBeDefined()
  })

  it('adds VL53L0X for distance outputs', () => {
    const finalSpec = {
      outputs: [{ type: 'Distance measurement', count: 1 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const vl = result.sensors.find((s) => s.model === 'VL53L0X')
    expect(vl).toBeDefined()
    expect(vl?.address).toBe(0x29)
  })

  it('adds VL53L0X for proximity outputs', () => {
    const finalSpec = {
      outputs: [{ type: 'Proximity sensor', count: 1 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const vl = result.sensors.find((s) => s.model === 'VL53L0X')
    expect(vl).toBeDefined()
  })

  it('adds WS2812B for LED outputs', () => {
    const finalSpec = {
      outputs: [{ type: 'WS2812B LEDs', count: 8 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const leds = result.outputs.find((o) => o.type === 'WS2812B LEDs')
    expect(leds).toBeDefined()
    expect(leds?.count).toBe(8)
    expect(leds?.interface).toBe('GPIO')
  })

  it('adds WS2812B for neopixel outputs', () => {
    const finalSpec = {
      outputs: [{ type: 'NeoPixel strip', count: 16 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const leds = result.outputs.find((o) => o.type === 'WS2812B LEDs')
    expect(leds).toBeDefined()
    expect(leds?.count).toBe(16)
  })

  it('adds OLED display for display outputs', () => {
    const finalSpec = {
      outputs: [{ type: 'OLED Display', count: 1 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const oled = result.outputs.find((o) => o.type === 'OLED Display')
    expect(oled).toBeDefined()
    expect(oled?.model).toBe('SSD1306')
    expect(oled?.interface).toBe('I2C')
  })

  it('adds buzzer for buzzer outputs', () => {
    const finalSpec = {
      outputs: [{ type: 'Buzzer', count: 1 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const buzzer = result.outputs.find((o) => o.type === 'Buzzer')
    expect(buzzer).toBeDefined()
    expect(buzzer?.interface).toBe('PWM')
  })

  it('adds buzzer for piezo outputs', () => {
    const finalSpec = {
      outputs: [{ type: 'Piezo speaker', count: 1 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const buzzer = result.outputs.find((o) => o.type === 'Buzzer')
    expect(buzzer).toBeDefined()
  })

  it('adds relay for relay outputs', () => {
    const finalSpec = {
      outputs: [{ type: 'Relay control', count: 2 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const relay = result.outputs.find((o) => o.type === 'Relay')
    expect(relay).toBeDefined()
    expect(relay?.count).toBe(2)
    expect(relay?.interface).toBe('GPIO')
  })

  it('adds button pins from inputs', () => {
    const finalSpec = {
      inputs: [{ type: 'Button', count: 3 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const buttons = result.pins.filter((p) => p.name.startsWith('BUTTON'))
    expect(buttons.length).toBe(3)
    expect(buttons[0].mode).toBe('INPUT_PULLUP')
    expect(buttons[0].name).toBe('BUTTON_1')
    expect(buttons[2].name).toBe('BUTTON_3')
  })

  it('adds I2C pins when I2C sensors are present', () => {
    const finalSpec = {
      outputs: [{ type: 'Temperature', count: 1 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const sda = result.pins.find((p) => p.name === 'I2C_SDA')
    const scl = result.pins.find((p) => p.name === 'I2C_SCL')

    expect(sda).toBeDefined()
    expect(sda?.gpio).toBe(6)
    expect(sda?.protocol).toBe('I2C')

    expect(scl).toBeDefined()
    expect(scl?.gpio).toBe(7)
  })

  it('adds I2C protocol when I2C sensors are present', () => {
    const finalSpec = {
      outputs: [{ type: 'Temperature', count: 1 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    expect(result.protocols.length).toBe(1)
    expect(result.protocols[0].type).toBe('I2C')
    expect(result.protocols[0].pins.sda).toBe(6)
    expect(result.protocols[0].pins.scl).toBe(7)
    expect(result.protocols[0].devices).toContain('BME280')
  })

  it('does not add I2C protocol when no I2C sensors', () => {
    const finalSpec = {
      outputs: [{ type: 'Relay', count: 1 }],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    expect(result.protocols.length).toBe(0)
  })

  it('always adds built-in LED pin', () => {
    const result = buildFirmwareInputFromSpec('Test', 'Desc', {})

    const led = result.pins.find((p) => p.name === 'LED_BUILTIN')
    expect(led).toBeDefined()
    expect(led?.gpio).toBe(8)
    expect(led?.mode).toBe('OUTPUT')
  })

  it('uses power source from spec', () => {
    const finalSpec = {
      power: { source: 'LiPo Battery' },
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    expect(result.power.source).toBe('LiPo Battery')
  })

  it('defaults to USB-C power source', () => {
    const result = buildFirmwareInputFromSpec('Test', 'Desc', {})

    expect(result.power.source).toBe('USB-C')
  })

  it('enables battery monitoring for battery power', () => {
    const finalSpec = {
      power: { source: 'LiPo Battery 3.7V' },
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    expect(result.power.batteryMonitoring).toBe(true)
  })

  it('enables deep sleep from features', () => {
    const finalSpec = {
      features: ['Low power mode with deep sleep'],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    expect(result.power.deepSleepEnabled).toBe(true)
  })

  it('passes through features array', () => {
    const finalSpec = {
      features: ['Feature 1', 'Feature 2'],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    expect(result.features).toEqual(['Feature 1', 'Feature 2'])
  })

  it('handles undefined finalSpec', () => {
    const result = buildFirmwareInputFromSpec('Test', 'Desc', undefined)

    expect(result.sensors).toEqual([])
    expect(result.outputs).toEqual([])
    expect(result.features).toEqual([])
  })

  it('handles empty finalSpec', () => {
    const result = buildFirmwareInputFromSpec('Test', 'Desc', {})

    expect(result.sensors).toEqual([])
    expect(result.outputs).toEqual([])
    expect(result.features).toEqual([])
  })

  it('combines multiple sensor types', () => {
    const finalSpec = {
      outputs: [
        { type: 'Temperature reading', count: 1 },
        { type: 'Light sensor', count: 1 },
        { type: 'Distance measurement', count: 1 },
      ],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    expect(result.sensors.length).toBe(3)
    expect(result.sensors.map((s) => s.model)).toContain('BME280')
    expect(result.sensors.map((s) => s.model)).toContain('VEML7700')
    expect(result.sensors.map((s) => s.model)).toContain('VL53L0X')
  })

  it('assigns unique GPIO pins to outputs', () => {
    const finalSpec = {
      outputs: [
        { type: 'WS2812B LEDs', count: 4 },
        { type: 'Buzzer', count: 1 },
        { type: 'Relay', count: 1 },
      ],
    }

    const result = buildFirmwareInputFromSpec('Test', 'Desc', finalSpec)

    const gpios = result.pins
      .filter((p) => !p.name.startsWith('I2C') && p.name !== 'LED_BUILTIN')
      .map((p) => p.gpio)

    // All GPIO pins should be unique
    const uniqueGpios = new Set(gpios)
    expect(uniqueGpios.size).toBe(gpios.length)
  })
})
