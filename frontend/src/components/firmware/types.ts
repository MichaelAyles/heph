/**
 * Shared types for firmware stage components
 */

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileNode[]
  content?: string
  language?: string
}

export interface UploadedBinary {
  name: string
  size: number
}

// Default starter template when no firmware has been generated yet
export const STARTER_TEMPLATE: FileNode[] = [
  {
    name: 'platformio.ini',
    path: 'platformio.ini',
    type: 'file',
    language: 'ini',
    content: `; PlatformIO Project Configuration
; PHAESTUS Generated - Customize and compile locally

[env:esp32c6]
platform = espressif32
board = esp32-c6-devkitm-1
framework = arduino
monitor_speed = 115200

; Uncomment to add libraries
; lib_deps =
;     adafruit/Adafruit BME280 Library
;     fastled/FastLED

build_flags =
    -DCORE_DEBUG_LEVEL=3
`,
  },
  {
    name: 'include',
    path: 'include',
    type: 'folder',
    children: [
      {
        name: 'config.h',
        path: 'include/config.h',
        type: 'file',
        language: 'cpp',
        content: `#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// PIN DEFINITIONS
// ============================================
#define PIN_LED         8      // Built-in LED
#define PIN_BUTTON      9      // User button (optional)

// I2C Bus
#define PIN_SDA         6
#define PIN_SCL         7

// ============================================
// CONFIGURATION
// ============================================
#define WIFI_SSID       "your_ssid"
#define WIFI_PASS       "your_password"
#define DEVICE_NAME     "phaestus-device"

// Timing
#define LOOP_INTERVAL_MS  1000

// Debug
#define DEBUG_ENABLED   1

#if DEBUG_ENABLED
  #define DEBUG_PRINT(x) Serial.print(x)
  #define DEBUG_PRINTLN(x) Serial.println(x)
#else
  #define DEBUG_PRINT(x)
  #define DEBUG_PRINTLN(x)
#endif

#endif // CONFIG_H
`,
      },
    ],
  },
  {
    name: 'src',
    path: 'src',
    type: 'folder',
    children: [
      {
        name: 'main.cpp',
        path: 'src/main.cpp',
        type: 'file',
        language: 'cpp',
        content: `/**
 * PHAESTUS Generated Firmware
 * Target: ESP32-C6
 * Framework: Arduino
 */

#include <Arduino.h>
#include "config.h"

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("=================================");
    Serial.println("PHAESTUS Device Starting...");
    Serial.println("=================================");

    // Initialize LED
    pinMode(PIN_LED, OUTPUT);
    digitalWrite(PIN_LED, LOW);

    Serial.println("Setup complete!");
}

void loop() {
    static unsigned long lastBlink = 0;
    static bool ledState = false;

    // Blink LED every second
    if (millis() - lastBlink >= LOOP_INTERVAL_MS) {
        lastBlink = millis();
        ledState = !ledState;
        digitalWrite(PIN_LED, ledState);
        DEBUG_PRINTLN(ledState ? "LED ON" : "LED OFF");
    }
}
`,
      },
    ],
  },
]
