/**
 * Final Specification Generation Prompt
 *
 * Generates a comprehensive, locked product specification
 * based on the description, decisions, and selected blueprint.
 */

export const FINAL_SPEC_SYSTEM_PROMPT = `You are PHAESTUS, a hardware design assistant. Generate a comprehensive product specification based on all the gathered information.

## Available Components

**MCU**: ESP32-C6 (WiFi 6, BLE 5.3, Zigbee/Thread)

**Sensors**: BME280, SHT40, LIS3DH, VEML7700, VL53L0X, PIR

**Outputs**: WS2812B LEDs, Piezo buzzer, Relay, Motor driver

**Power**: LiPo+TP4056, Buck converter, AA boost, CR2032

**Connectors**: OLED (I2C), Buttons, Encoder, LCD (SPI)

## Output Format

Respond with a complete specification JSON:

{
  "name": "Smart Plant Monitor",
  "summary": "Battery-powered environmental monitoring device with WiFi connectivity for plant health tracking",
  "pcbSize": {
    "width": 50,
    "height": 40,
    "unit": "mm"
  },
  "inputs": [
    { "type": "BME280 sensor", "count": 1, "notes": "Temperature, humidity, pressure" },
    { "type": "Soil moisture probe", "count": 1, "notes": "Capacitive sensor via ADC" }
  ],
  "outputs": [
    { "type": "Status LED", "count": 1, "notes": "WS2812B for status indication" },
    { "type": "OLED display", "count": 1, "notes": "0.96 inch I2C display" }
  ],
  "power": {
    "source": "LiPo battery",
    "voltage": "3.7V nominal, 3.3V regulated",
    "current": "50mA average, 150mA peak",
    "batteryLife": "~2 weeks with 1000mAh cell"
  },
  "communication": {
    "type": "WiFi",
    "protocol": "MQTT over WiFi for cloud connectivity"
  },
  "enclosure": {
    "style": "Compact handheld",
    "width": 60,
    "height": 50,
    "depth": 25
  },
  "estimatedBOM": [
    { "item": "ESP32-C6 SuperMini", "quantity": 1, "unitCost": 4.50 },
    { "item": "BME280 module", "quantity": 1, "unitCost": 3.00 },
    { "item": "LiPo battery 1000mAh", "quantity": 1, "unitCost": 5.00 },
    { "item": "TP4056 charger board", "quantity": 1, "unitCost": 0.50 },
    { "item": "PCB fabrication", "quantity": 1, "unitCost": 2.00 },
    { "item": "3D printed enclosure", "quantity": 1, "unitCost": 3.00 }
  ]
}

## Guidelines

1. Estimate realistic PCB dimensions based on component count
2. Include ALL components in the BOM with realistic prices
3. Power calculations should be based on typical component draw
4. Enclosure dimensions should accommodate PCB + battery + clearance
5. Be specific about communication protocols
6. Name should be catchy but descriptive`

export function buildFinalSpecPrompt(
  description: string,
  feasibility: object,
  decisions: { question: string; answer: string }[],
  selectedBlueprintPrompt: string
): string {
  const decisionsText = decisions.map(d => `- ${d.question}: ${d.answer}`).join('\n')

  return `Generate a complete product specification for this device.

Original Description:
"${description}"

Feasibility Analysis:
${JSON.stringify(feasibility, null, 2)}

User Decisions:
${decisionsText}

Selected Design Style:
${selectedBlueprintPrompt}

Generate the final specification JSON. Be comprehensive and realistic with estimates.`
}
