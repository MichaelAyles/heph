/**
 * Firmware Generation Prompt
 *
 * Generates ESP32-C6 firmware (Arduino/PlatformIO) based on the final spec,
 * BOM, and component configuration from previous stages.
 */

export interface FirmwareInput {
  projectName: string
  projectDescription: string
  // Hardware specification
  mcu: {
    type: 'ESP32-C6' | 'ESP32'
    clockSpeed: number // MHz
  }
  // Pin assignments from PCB stage
  pins: PinAssignment[]
  // Communication protocols
  protocols: Protocol[]
  // Power configuration
  power: {
    source: string
    batteryMonitoring: boolean
    deepSleepEnabled: boolean
  }
  // Features from final spec
  features: string[]
  // Sensors from BOM
  sensors: SensorConfig[]
  // Outputs from BOM
  outputs: OutputConfig[]
  // User preferences
  preferences: {
    language: 'cpp' | 'arduino'
    framework: 'arduino' | 'espidf'
    useOTA: boolean
    useWiFi: boolean
    useBLE: boolean
  }
}

export interface PinAssignment {
  name: string
  gpio: number
  mode: 'INPUT' | 'OUTPUT' | 'INPUT_PULLUP' | 'INPUT_PULLDOWN' | 'ANALOG'
  description: string
  // For I2C, SPI, UART pins
  protocol?: string
}

export interface Protocol {
  type: 'I2C' | 'SPI' | 'UART' | 'GPIO'
  pins: {
    sda?: number
    scl?: number
    mosi?: number
    miso?: number
    sck?: number
    cs?: number
    tx?: number
    rx?: number
  }
  devices: string[]
}

export interface SensorConfig {
  type: string
  model: string
  interface: 'I2C' | 'SPI' | 'ANALOG' | 'DIGITAL'
  address?: number // For I2C
  pin?: number // For analog/digital
  readings: string[] // What this sensor measures
}

export interface OutputConfig {
  type: string
  model?: string
  interface: 'GPIO' | 'PWM' | 'I2C' | 'SPI'
  pin?: number
  count?: number
}

// File templates for the generated firmware project
export interface FirmwareProject {
  files: {
    path: string
    content: string
    language: 'cpp' | 'h' | 'ini' | 'json'
  }[]
}

export const FIRMWARE_SYSTEM_PROMPT = `You are PHAESTUS, an expert embedded systems firmware developer specializing in ESP32-C6 microcontrollers. Your task is to generate complete, production-ready firmware for IoT devices.

## Target Platform

- **MCU**: ESP32-C6 (RISC-V, 160MHz, WiFi 6, BLE 5.3, Zigbee/Thread)
- **Framework**: Arduino (for accessibility) or ESP-IDF (for advanced features)
- **IDE**: PlatformIO

## Code Quality Standards

1. **Safety**: All GPIO operations must check valid pin ranges
2. **Memory**: Use stack allocation where possible, avoid dynamic allocation in ISRs
3. **Power**: Support deep sleep with configurable wake sources
4. **Connectivity**: WiFi with reconnection logic, optional BLE
5. **OTA**: Include OTA update capability for production firmware
6. **Logging**: Use Serial for debug, with compile-time log level control

## File Structure

Generate a complete PlatformIO project with:

\`\`\`
/
├── platformio.ini       # PlatformIO configuration
├── include/
│   └── config.h         # Pin definitions, constants
├── src/
│   ├── main.cpp         # Main entry point
│   ├── sensors.cpp      # Sensor reading logic
│   ├── sensors.h
│   ├── outputs.cpp      # Output control logic
│   ├── outputs.h
│   ├── network.cpp      # WiFi/BLE handling
│   └── network.h
└── data/                # SPIFFS data (if needed)
\`\`\`

## Code Templates

### platformio.ini
\`\`\`ini
[env:esp32c6]
platform = espressif32
board = esp32-c6-devkitm-1
framework = arduino
monitor_speed = 115200
lib_deps =
    # Add sensor libraries here
build_flags =
    -DCORE_DEBUG_LEVEL=3
    -DBOARD_HAS_PSRAM
\`\`\`

### config.h
\`\`\`cpp
#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// PIN DEFINITIONS
// ============================================
#define PIN_LED         8      // Built-in LED
#define PIN_BUTTON      9      // User button

// I2C
#define PIN_SDA         6
#define PIN_SCL         7

// ============================================
// CONFIGURATION
// ============================================
#define WIFI_SSID       "your_ssid"
#define WIFI_PASS       "your_password"
#define DEVICE_NAME     "phaestus-device"

// Timing
#define SENSOR_READ_INTERVAL_MS  1000
#define WIFI_CONNECT_TIMEOUT_MS  10000

// Features
#define ENABLE_OTA      1
#define ENABLE_DEEP_SLEEP 0
#define DEBUG_ENABLED   1

#if DEBUG_ENABLED
  #define DEBUG_PRINT(x) Serial.print(x)
  #define DEBUG_PRINTLN(x) Serial.println(x)
#else
  #define DEBUG_PRINT(x)
  #define DEBUG_PRINTLN(x)
#endif

#endif // CONFIG_H
\`\`\`

### main.cpp Structure
\`\`\`cpp
#include <Arduino.h>
#include "config.h"
#include "sensors.h"
#include "outputs.h"
#include "network.h"

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("PHAESTUS Device Starting...");

    setupPins();
    setupSensors();
    setupOutputs();
    setupNetwork();

    Serial.println("Setup complete!");
}

void loop() {
    static unsigned long lastRead = 0;

    // Maintain network connection
    handleNetwork();

    // Read sensors at interval
    if (millis() - lastRead >= SENSOR_READ_INTERVAL_MS) {
        lastRead = millis();
        readSensors();
        processData();
        updateOutputs();
    }
}
\`\`\`

## Sensor Libraries

Use these libraries for common sensors:
- **BME280**: \`adafruit/Adafruit BME280 Library\`
- **SHT40**: \`adafruit/Adafruit SHT4x Library\`
- **LIS3DH**: \`adafruit/Adafruit LIS3DH\`
- **VEML7700**: \`adafruit/Adafruit VEML7700 Library\`
- **VL53L0X**: \`pololu/VL53L0X\`
- **WS2812B**: \`fastled/FastLED\`
- **OLED**: \`adafruit/Adafruit SSD1306\` + \`adafruit/Adafruit GFX Library\`

## Output Format

Respond with a JSON object containing all files:

\`\`\`json
{
  "files": [
    {
      "path": "platformio.ini",
      "content": "...",
      "language": "ini"
    },
    {
      "path": "include/config.h",
      "content": "...",
      "language": "h"
    },
    {
      "path": "src/main.cpp",
      "content": "...",
      "language": "cpp"
    }
  ]
}
\`\`\`

Generate COMPLETE, COMPILABLE code. No placeholders, no TODOs, no "implement this".`

/**
 * Build the user prompt for firmware generation
 */
export function buildFirmwarePrompt(input: FirmwareInput): string {
  const { projectName, projectDescription, pins, sensors, outputs, preferences, power } = input

  let prompt = `Generate complete ESP32-C6 firmware for the following project:

**Project**: ${projectName}
**Description**: ${projectDescription}

## Hardware Configuration

### MCU
- Type: ${input.mcu.type}
- Clock: ${input.mcu.clockSpeed}MHz

### Pin Assignments
`

  for (const pin of pins) {
    prompt += `- GPIO${pin.gpio}: ${pin.name} (${pin.mode})${pin.protocol ? ` - ${pin.protocol}` : ''}\n`
  }

  prompt += `
### Sensors
`
  for (const sensor of sensors) {
    prompt += `- ${sensor.model} (${sensor.type}) via ${sensor.interface}`
    if (sensor.address) prompt += ` at 0x${sensor.address.toString(16)}`
    prompt += `\n  Measures: ${sensor.readings.join(', ')}\n`
  }

  prompt += `
### Outputs
`
  for (const output of outputs) {
    prompt += `- ${output.type}${output.model ? ` (${output.model})` : ''} via ${output.interface}`
    if (output.pin) prompt += ` on GPIO${output.pin}`
    if (output.count && output.count > 1) prompt += ` x${output.count}`
    prompt += '\n'
  }

  prompt += `
### Power
- Source: ${power.source}
- Battery monitoring: ${power.batteryMonitoring ? 'Yes' : 'No'}
- Deep sleep: ${power.deepSleepEnabled ? 'Enabled' : 'Disabled'}

### Connectivity
- WiFi: ${preferences.useWiFi ? 'Enabled' : 'Disabled'}
- BLE: ${preferences.useBLE ? 'Enabled' : 'Disabled'}
- OTA updates: ${preferences.useOTA ? 'Enabled' : 'Disabled'}

## Requirements

1. Generate a complete PlatformIO project
2. Include proper initialization for all sensors
3. Implement reading loops with configurable intervals
4. Add WiFi connection with reconnection logic (if enabled)
5. Include OTA update support (if enabled)
6. Add deep sleep support (if enabled)
7. Use appropriate libraries for each sensor/output
8. Include debug logging with compile-time disable option

Generate the complete firmware project as JSON now.`

  return prompt
}

/**
 * Build the user prompt for firmware modification with feedback
 */
export function buildFirmwareModificationPrompt(
  currentFiles: FirmwareProject['files'],
  feedback: string,
  input: FirmwareInput
): string {
  const filesContent = currentFiles
    .map((f) => `### ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``)
    .join('\n\n')

  return `The user wants to modify the existing firmware.

## Current Code

${filesContent}

## User Request

${feedback}

## Hardware Context

- Project: ${input.projectName}
- MCU: ${input.mcu.type}
- Sensors: ${input.sensors.map((s) => s.model).join(', ')}
- Outputs: ${input.outputs.map((o) => o.type).join(', ')}

Please modify the firmware to address the user's request. Return the complete updated files as JSON. Only include files that have changed.`
}

/**
 * Extract firmware input from project spec and PCB data
 */
export function buildFirmwareInputFromSpec(
  projectName: string,
  projectDescription: string,
  finalSpec?: {
    power?: { source: string }
    inputs?: { type: string; count: number }[]
    outputs?: { type: string; count: number }[]
    features?: string[]
  },
  _pcbArtifacts?: {
    placedBlocks?: {
      blockSlug: string
      gridX: number
      gridY: number
      rotation: number
    }[]
  }
): FirmwareInput {
  // Build sensor list from outputs in spec
  const sensors: SensorConfig[] = []
  const outputs: OutputConfig[] = []
  const pins: PinAssignment[] = []

  // Default I2C pins
  let nextGpio = 10

  // Add sensors based on spec outputs
  if (finalSpec?.outputs) {
    for (const output of finalSpec.outputs) {
      const outType = output.type.toLowerCase()

      if (
        outType.includes('temperature') ||
        outType.includes('humidity') ||
        outType.includes('bme')
      ) {
        sensors.push({
          type: 'Environmental',
          model: 'BME280',
          interface: 'I2C',
          address: 0x76,
          readings: ['temperature', 'humidity', 'pressure'],
        })
      }

      if (outType.includes('accelerometer') || outType.includes('motion')) {
        sensors.push({
          type: 'Motion',
          model: 'LIS3DH',
          interface: 'I2C',
          address: 0x18,
          readings: ['acceleration_x', 'acceleration_y', 'acceleration_z'],
        })
      }

      if (outType.includes('light') || outType.includes('ambient')) {
        sensors.push({
          type: 'Light',
          model: 'VEML7700',
          interface: 'I2C',
          address: 0x10,
          readings: ['lux', 'white'],
        })
      }

      if (outType.includes('distance') || outType.includes('proximity')) {
        sensors.push({
          type: 'Distance',
          model: 'VL53L0X',
          interface: 'I2C',
          address: 0x29,
          readings: ['distance_mm'],
        })
      }

      if (outType.includes('led') || outType.includes('ws2812') || outType.includes('neopixel')) {
        outputs.push({
          type: 'WS2812B LEDs',
          model: 'WS2812B',
          interface: 'GPIO',
          pin: nextGpio++,
          count: output.count,
        })
        pins.push({
          name: 'LED_DATA',
          gpio: nextGpio - 1,
          mode: 'OUTPUT',
          description: 'WS2812B data pin',
        })
      }

      if (outType.includes('oled') || outType.includes('display')) {
        outputs.push({
          type: 'OLED Display',
          model: 'SSD1306',
          interface: 'I2C',
        })
      }

      if (outType.includes('buzzer') || outType.includes('piezo')) {
        outputs.push({
          type: 'Buzzer',
          model: 'Piezo',
          interface: 'PWM',
          pin: nextGpio++,
        })
        pins.push({
          name: 'BUZZER',
          gpio: nextGpio - 1,
          mode: 'OUTPUT',
          description: 'Piezo buzzer PWM',
        })
      }

      if (outType.includes('relay')) {
        outputs.push({
          type: 'Relay',
          interface: 'GPIO',
          pin: nextGpio++,
          count: output.count,
        })
        pins.push({
          name: 'RELAY',
          gpio: nextGpio - 1,
          mode: 'OUTPUT',
          description: 'Relay control',
        })
      }
    }
  }

  // Add buttons from inputs
  if (finalSpec?.inputs) {
    for (const input of finalSpec.inputs) {
      if (input.type.toLowerCase().includes('button')) {
        for (let i = 0; i < input.count; i++) {
          pins.push({
            name: `BUTTON_${i + 1}`,
            gpio: nextGpio++,
            mode: 'INPUT_PULLUP',
            description: `User button ${i + 1}`,
          })
        }
      }
    }
  }

  // Add default I2C pins if we have I2C sensors
  if (sensors.some((s) => s.interface === 'I2C')) {
    pins.unshift(
      { name: 'I2C_SDA', gpio: 6, mode: 'OUTPUT', description: 'I2C Data', protocol: 'I2C' },
      { name: 'I2C_SCL', gpio: 7, mode: 'OUTPUT', description: 'I2C Clock', protocol: 'I2C' }
    )
  }

  // Add built-in LED
  pins.push({
    name: 'LED_BUILTIN',
    gpio: 8,
    mode: 'OUTPUT',
    description: 'Built-in LED',
  })

  return {
    projectName,
    projectDescription,
    mcu: {
      type: 'ESP32-C6',
      clockSpeed: 160,
    },
    pins,
    protocols: sensors.some((s) => s.interface === 'I2C')
      ? [
          {
            type: 'I2C',
            pins: { sda: 6, scl: 7 },
            devices: sensors.filter((s) => s.interface === 'I2C').map((s) => s.model),
          },
        ]
      : [],
    power: {
      source: finalSpec?.power?.source || 'USB-C',
      batteryMonitoring: finalSpec?.power?.source?.toLowerCase().includes('battery') || false,
      deepSleepEnabled:
        finalSpec?.features?.some((f) => f.toLowerCase().includes('sleep')) || false,
    },
    features: finalSpec?.features || [],
    sensors,
    outputs,
    preferences: {
      language: 'cpp',
      framework: 'arduino',
      useOTA: true,
      useWiFi: true,
      useBLE: false,
    },
  }
}
