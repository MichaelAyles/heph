# PCB Block Design Checklist

## Design Order

The blocks must be designed in dependency order. Templates define the grid system, the MCU defines all bus signals, then other blocks tap into those signals.

## Directory Structure

Each block gets its own directory:
```
kicad_seed_data/
├── templates/
│   ├── 1x1/
│   │   ├── 1x1_template.kicad_pro
│   │   ├── 1x1_template.kicad_sch
│   │   ├── 1x1_template.kicad_pcb
│   │   ├── 1x1_template.png          (3D render)
│   │   └── README.md
│   ├── 1x2/
│   └── 2x2/
├── mcu-esp32c6/
│   ├── mcu-esp32c6.kicad_pro
│   ├── mcu-esp32c6.kicad_sch
│   ├── mcu-esp32c6.kicad_pcb
│   ├── mcu-esp32c6.png
│   └── README.md
├── power-lipo/
│   └── ...
└── DESIGN_CHECKLIST.md
```

---

## Phase 1: Templates (Foundation)

These define the grid system: board outline, mounting holes, bus trace positions.

### 1x1 Template (12.7mm × 12.7mm)
- [ ] Board outline with corner radii
- [ ] Mounting hole positions (if any)
- [ ] Bus trace entry/exit positions on all 4 edges
- [ ] Ground pour zones
- [ ] Design rules (trace width, clearance, via size)
- [ ] README.md with grid specs

### 1x2 Template (12.7mm × 25.4mm)
- [ ] Board outline (extends 1x1 vertically)
- [ ] Bus trace continuity through both grid units
- [ ] README.md

### 2x2 Template (25.4mm × 25.4mm)
- [ ] Board outline (2 units in each dimension)
- [ ] Bus trace routing for larger footprints
- [ ] README.md

---

## Phase 2: MCU Block (Defines Bus Signals)

The MCU is the source of all bus signals. Design this first to establish the complete bus definition.

### mcu-esp32c6 (2x2)
- [ ] ESP32-C6 SuperMini module footprint
- [ ] USB-C connector (note: overhang dimensions in README)
- [ ] All bus signal 0R tap resistors:
  - [ ] GND
  - [ ] V3V3 (3.3V output from onboard LDO)
  - [ ] VBUS (5V USB power passthrough)
  - [ ] I2C0_SDA, I2C0_SCL
  - [ ] I2C1_SDA, I2C1_SCL
  - [ ] SPI0_MOSI, SPI0_MISO, SPI0_SCK, SPI0_CS0, SPI0_CS1
  - [ ] UART0_TX, UART0_RX
  - [ ] UART1_TX, UART1_RX
  - [ ] GPIO0-GPIO7
- [ ] Programming/reset buttons
- [ ] Status LED
- [ ] Decoupling capacitors
- [ ] README.md with:
  - [ ] USB-C overhang dimensions
  - [ ] Button accessibility notes
  - [ ] LED position

---

## Phase 3: Utility Blocks

These handle bus routing without adding components.

### util-corner-l (1x1)
- [ ] Bus routes 90° from left edge to bottom edge
- [ ] All passthrough signals with 0R taps
- [ ] README.md

### util-corner-r (1x1)
- [ ] Bus routes 90° from right edge to bottom edge
- [ ] All passthrough signals with 0R taps
- [ ] README.md

### util-header (1x2)
- [ ] 2x6 2.54mm header footprint
- [ ] Bus signals broken out to header pins
- [ ] Silkscreen pin labels
- [ ] README.md with pinout diagram

### util-terminator (1x1)
- [ ] Test points for key signals
- [ ] I2C pull-up resistors (4.7k)
- [ ] README.md

---

## Phase 4: Power Blocks

These source power to the bus.

### power-lipo (1x2)
- [ ] TP4056 charger IC
- [ ] AMS1117-3.3 LDO
- [ ] JST-PH-2 battery connector
- [ ] Charge status LEDs
- [ ] Taps: GND, V3V3, VBUS
- [ ] README.md with:
  - [ ] Battery connector position/overhang
  - [ ] LED positions

### power-buck (1x2)
- [ ] MP1584 buck converter
- [ ] DC-005 barrel jack (5.5×2.1mm)
- [ ] Dual output: 5V (VBUS) and 3.3V (V3V3)
- [ ] Taps: GND, V3V3, VBUS
- [ ] README.md with:
  - [ ] Barrel jack overhang dimensions
  - [ ] Input voltage range

### power-aa (1x2)
- [ ] TPS61200 boost converter
- [ ] Battery holder connector pads
- [ ] Taps: GND, V3V3
- [ ] README.md with:
  - [ ] External battery holder connection points

---

## Phase 5: Connector Blocks

Wire-to-board connections for off-board UI elements.

### conn-oled (1x1)
- [ ] JST-SH-4 connector
- [ ] Taps: GND, V3V3, I2C0_SDA, I2C0_SCL
- [ ] README.md with connector position

### conn-button (1x1)
- [ ] JST-SH-6 connector
- [ ] Taps: GND, GPIO0-GPIO3
- [ ] Internal pull-up resistors (optional)
- [ ] README.md with pinout

### conn-encoder (1x1)
- [ ] JST-SH-5 connector
- [ ] Taps: GND, V3V3, GPIO0-GPIO2
- [ ] README.md with encoder wiring diagram

### conn-lcd (1x1)
- [ ] FFC-8 0.5mm connector
- [ ] Taps: GND, V3V3, SPI0_MOSI, SPI0_SCK, SPI0_CS1, GPIO0
- [ ] README.md with:
  - [ ] FFC orientation (contacts up/down)
  - [ ] Compatible display modules

---

## Phase 6: Sensor Blocks

### sensor-bme280 (1x1)
- [ ] BME280 LGA-8 footprint
- [ ] Decoupling capacitor
- [ ] I2C address selection (SDO to GND or V3V3)
- [ ] Taps: GND, V3V3, I2C0_SDA, I2C0_SCL
- [ ] README.md with address config

### sensor-sht40 (1x1)
- [ ] SHT40 DFN-4 footprint
- [ ] Decoupling capacitor
- [ ] Taps: GND, V3V3, I2C0_SDA, I2C0_SCL
- [ ] README.md

### sensor-lis3dh (1x1)
- [ ] LIS3DH LGA-16 footprint
- [ ] I2C/SPI mode selection jumper
- [ ] Taps: GND, V3V3, I2C0_SDA, I2C0_SCL, SPI0_MOSI, SPI0_MISO, SPI0_SCK, SPI0_CS0
- [ ] README.md with interface mode selection

### sensor-veml7700 (1x1)
- [ ] VEML7700 QFN footprint
- [ ] Light aperture in silkscreen
- [ ] Taps: GND, V3V3, I2C0_SDA, I2C0_SCL
- [ ] README.md with mounting notes (keep clear of obstructions)

### sensor-vl53l0x (1x2)
- [ ] VL53L0X module footprint
- [ ] Taps: GND, V3V3, I2C0_SDA, I2C0_SCL
- [ ] README.md with:
  - [ ] Optical path clearance requirements
  - [ ] Module overhang if any

### sensor-pir (1x1)
- [ ] AM312 module pads
- [ ] Taps: GND, V3V3, GPIO0
- [ ] README.md with:
  - [ ] Sensor dome clearance

---

## Phase 7: Output Blocks

### output-led-ws2812 (1x1)
- [ ] JST-SH-3 connector
- [ ] Taps: GND, V3V3, GPIO0
- [ ] README.md with LED strip wiring

### output-buzzer (1x1)
- [ ] 12mm piezo buzzer pad
- [ ] 2N7002 driver transistor
- [ ] Flyback diode
- [ ] Taps: GND, V3V3, GPIO0
- [ ] README.md with:
  - [ ] Buzzer height

### output-relay (1x2)
- [ ] HK4100F relay footprint
- [ ] 2N7002 driver transistor
- [ ] 1N4148 flyback diode
- [ ] Indicator LED
- [ ] Screw terminal for load (note overhang)
- [ ] Taps: GND, V3V3, GPIO0
- [ ] README.md with:
  - [ ] Terminal overhang
  - [ ] Max load current/voltage

### output-motor (1x2)
- [ ] DRV8833 HTSSOP-16 footprint
- [ ] Decoupling capacitors
- [ ] Motor terminal connectors
- [ ] Taps: GND, V3V3, GPIO0-GPIO3
- [ ] README.md with:
  - [ ] Motor wiring diagram
  - [ ] Current limits

---

## README.md Template

Each block's README.md should include:

```markdown
# {Block Name}

## Description
{Brief description of what this block does}

## Size
{width}x{height} grid units ({width*12.7}mm × {height*12.7}mm)

## Physical Notes
- **Overhang**: {e.g., "USB-C connector extends 5mm beyond top edge, centered"}
- **Height**: {e.g., "12mm total height including buzzer dome"}
- **Clearance**: {e.g., "Requires 30mm clear above for PIR sensor dome"}

## Bus Connections
| Signal | 0R Tap | Notes |
|--------|--------|-------|
| GND    | R1     | Ground |
| V3V3   | R2     | 3.3V power |
| ...    | ...    | ... |

## I2C Address
{If applicable: addresses and how to select}

## BOM
| Ref | Value | Package | Notes |
|-----|-------|---------|-------|
| U1  | BME280 | LGA-8 | |
| C1  | 100nF | 0402 | Decoupling |

## 3D Model
![3D Render](block-name.png)
```

---

## Progress Summary

| Phase | Blocks | Status |
|-------|--------|--------|
| 1. Templates | 3 | Not started |
| 2. MCU | 1 | Not started |
| 3. Utility | 4 | Not started |
| 4. Power | 3 | Not started |
| 5. Connectors | 4 | Not started |
| 6. Sensors | 6 | Not started |
| 7. Outputs | 4 | Not started |
| **Total** | **25** | **0/25 complete** |
