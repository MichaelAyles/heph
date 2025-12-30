-- Heph PCB Block Library
-- 21 validated blocks based on the v2 continuous bus architecture

-- =============================================================================
-- MCU BLOCKS
-- =============================================================================

INSERT INTO pcb_blocks (id, slug, name, category, description, width_units, height_units, taps, i2c_addresses, spi_cs, power, components, is_validated) VALUES
('mcu-esp32c6', 'mcu-esp32c6', 'ESP32-C6 MCU', 'mcu',
 'ESP32-C6 SuperMini carrier. WiFi 6, BLE 5.3, Zigbee/Thread. Provides 3.3V to bus via onboard LDO.',
 2, 2,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"VBUS"},{"net":"I2C0_SDA"},{"net":"I2C0_SCL"},{"net":"I2C1_SDA"},{"net":"I2C1_SCL"},{"net":"SPI0_MOSI"},{"net":"SPI0_MISO"},{"net":"SPI0_SCK"},{"net":"SPI0_CS0"},{"net":"SPI0_CS1"},{"net":"UART0_TX"},{"net":"UART0_RX"},{"net":"UART1_TX"},{"net":"UART1_RX"},{"net":"GPIO0"},{"net":"GPIO1"},{"net":"GPIO2"},{"net":"GPIO3"},{"net":"GPIO4"},{"net":"GPIO5"},{"net":"GPIO6"},{"net":"GPIO7"}]',
 NULL, NULL,
 '{"current_max_ma": 500}',
 '[{"ref":"U1","value":"ESP32-C6-SuperMini","package":"Module"}]',
 1);

-- =============================================================================
-- POWER BLOCKS
-- =============================================================================

INSERT INTO pcb_blocks (id, slug, name, category, description, width_units, height_units, taps, i2c_addresses, spi_cs, power, components, is_validated) VALUES
('power-lipo', 'power-lipo', 'LiPo Battery', 'power',
 'Single-cell LiPo with TP4056 charger. Charges from VBUS, outputs V3V3 via LDO.',
 1, 2,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"VBUS"}]',
 NULL, NULL,
 '{"current_max_ma": -500}',
 '[{"ref":"U1","value":"TP4056","package":"SOP-8"},{"ref":"U2","value":"AMS1117-3.3","package":"SOT-223"},{"ref":"J1","value":"JST-PH-2","package":"S2B-PH"}]',
 1),

('power-buck', 'power-buck', 'Buck Converter', 'power',
 '7-24V barrel jack input. Dual output: V3V3 and VBUS (5V).',
 1, 2,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"VBUS"}]',
 NULL, NULL,
 '{"current_max_ma": -1000}',
 '[{"ref":"U1","value":"MP1584","package":"SOIC-8"},{"ref":"J1","value":"DC-005","package":"Barrel-5.5x2.1"}]',
 1),

('power-aa', 'power-aa', 'AA Battery Boost', 'power',
 '2xAA/AAA holder with boost converter to 3.3V.',
 1, 2,
 '[{"net":"GND"},{"net":"V3V3"}]',
 NULL, NULL,
 '{"current_max_ma": -300}',
 '[{"ref":"U1","value":"TPS61200","package":"QFN-10"},{"ref":"BT1","value":"2xAA","package":"Holder"}]',
 1);

-- =============================================================================
-- SENSOR BLOCKS
-- =============================================================================

INSERT INTO pcb_blocks (id, slug, name, category, description, width_units, height_units, taps, i2c_addresses, spi_cs, power, components, is_validated) VALUES
('sensor-bme280', 'sensor-bme280', 'BME280 Environment', 'sensor',
 'Temperature, humidity, and pressure sensor. I2C interface.',
 1, 1,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"I2C0_SDA"},{"net":"I2C0_SCL"}]',
 '["0x76","0x77"]', NULL,
 '{"current_max_ma": 1}',
 '[{"ref":"U1","value":"BME280","package":"LGA-8"},{"ref":"C1","value":"100nF","package":"0402"}]',
 1),

('sensor-sht40', 'sensor-sht40', 'SHT40 Temp/Humidity', 'sensor',
 'High-accuracy temperature and humidity sensor. I2C interface.',
 1, 1,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"I2C0_SDA"},{"net":"I2C0_SCL"}]',
 '["0x44","0x45"]', NULL,
 '{"current_max_ma": 1}',
 '[{"ref":"U1","value":"SHT40","package":"DFN-4"},{"ref":"C1","value":"100nF","package":"0402"}]',
 1),

('sensor-lis3dh', 'sensor-lis3dh', 'LIS3DH Accelerometer', 'sensor',
 '3-axis accelerometer with I2C or SPI interface.',
 1, 1,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"I2C0_SDA"},{"net":"I2C0_SCL"},{"net":"SPI0_MOSI"},{"net":"SPI0_MISO"},{"net":"SPI0_SCK"},{"net":"SPI0_CS0"}]',
 '["0x18","0x19"]', 'SPI0_CS0',
 '{"current_max_ma": 1}',
 '[{"ref":"U1","value":"LIS3DH","package":"LGA-16"},{"ref":"C1","value":"100nF","package":"0402"}]',
 1),

('sensor-veml7700', 'sensor-veml7700', 'VEML7700 Light', 'sensor',
 'High-accuracy ambient light sensor. I2C interface.',
 1, 1,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"I2C0_SDA"},{"net":"I2C0_SCL"}]',
 '["0x10"]', NULL,
 '{"current_max_ma": 1}',
 '[{"ref":"U1","value":"VEML7700","package":"QFN"},{"ref":"C1","value":"100nF","package":"0402"}]',
 1),

('sensor-vl53l0x', 'sensor-vl53l0x', 'VL53L0X Distance', 'sensor',
 'Time-of-flight distance sensor. Range up to 2m. I2C interface.',
 1, 2,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"I2C0_SDA"},{"net":"I2C0_SCL"}]',
 '["0x29"]', NULL,
 '{"current_max_ma": 20}',
 '[{"ref":"U1","value":"VL53L0X","package":"Module"},{"ref":"C1","value":"100nF","package":"0402"}]',
 1),

('sensor-pir', 'sensor-pir', 'PIR Motion', 'sensor',
 'Passive infrared motion detector. Digital GPIO output.',
 1, 1,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"GPIO0"}]',
 NULL, NULL,
 '{"current_max_ma": 1}',
 '[{"ref":"U1","value":"AM312","package":"Module"}]',
 1);

-- =============================================================================
-- OUTPUT BLOCKS
-- =============================================================================

INSERT INTO pcb_blocks (id, slug, name, category, description, width_units, height_units, taps, i2c_addresses, spi_cs, power, components, is_validated) VALUES
('output-led-ws2812', 'output-led-ws2812', 'WS2812B LED', 'output',
 'Addressable RGB LED connector. Single GPIO data line.',
 1, 1,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"GPIO0"}]',
 NULL, NULL,
 '{"current_max_ma": 60}',
 '[{"ref":"J1","value":"JST-SH-3","package":"JST-SH"}]',
 1),

('output-buzzer', 'output-buzzer', 'Piezo Buzzer', 'output',
 'Piezo buzzer with driver transistor. PWM input.',
 1, 1,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"GPIO0"}]',
 NULL, NULL,
 '{"current_max_ma": 30}',
 '[{"ref":"BZ1","value":"Piezo","package":"12mm"},{"ref":"Q1","value":"2N7002","package":"SOT-23"}]',
 1),

('output-relay', 'output-relay', 'Relay Module', 'output',
 'Single relay with flyback diode and indicator LED. GPIO control.',
 1, 2,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"GPIO0"}]',
 NULL, NULL,
 '{"current_max_ma": 80}',
 '[{"ref":"K1","value":"HK4100F","package":"SIP-4"},{"ref":"Q1","value":"2N7002","package":"SOT-23"},{"ref":"D1","value":"1N4148","package":"SOD-123"}]',
 1),

('output-motor', 'output-motor', 'Motor Driver', 'output',
 'DRV8833 dual H-bridge for DC motors or stepper. PWM control.',
 1, 2,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"GPIO0"},{"net":"GPIO1"},{"net":"GPIO2"},{"net":"GPIO3"}]',
 NULL, NULL,
 '{"current_max_ma": 1500}',
 '[{"ref":"U1","value":"DRV8833","package":"HTSSOP-16"}]',
 1);

-- =============================================================================
-- CONNECTOR BLOCKS
-- =============================================================================

INSERT INTO pcb_blocks (id, slug, name, category, description, width_units, height_units, taps, i2c_addresses, spi_cs, power, components, is_validated) VALUES
('conn-oled', 'conn-oled', 'OLED Connector', 'connector',
 '4-pin JST-SH for I2C OLED display. Connect to off-board 0.96" SSD1306.',
 1, 1,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"I2C0_SDA"},{"net":"I2C0_SCL"}]',
 NULL, NULL,
 '{"current_max_ma": 30}',
 '[{"ref":"J1","value":"JST-SH-4","package":"JST-SH"}]',
 1),

('conn-button', 'conn-button', 'Button Connector', 'connector',
 '6-pin JST-SH for up to 4 off-board buttons with common ground.',
 1, 1,
 '[{"net":"GND"},{"net":"GPIO0"},{"net":"GPIO1"},{"net":"GPIO2"},{"net":"GPIO3"}]',
 NULL, NULL,
 '{"current_max_ma": 1}',
 '[{"ref":"J1","value":"JST-SH-6","package":"JST-SH"}]',
 1),

('conn-encoder', 'conn-encoder', 'Encoder Connector', 'connector',
 '5-pin JST-SH for off-board rotary encoder with button.',
 1, 1,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"GPIO0"},{"net":"GPIO1"},{"net":"GPIO2"}]',
 NULL, NULL,
 '{"current_max_ma": 5}',
 '[{"ref":"J1","value":"JST-SH-5","package":"JST-SH"}]',
 1),

('conn-lcd', 'conn-lcd', 'LCD Connector', 'connector',
 '8-pin FFC connector for SPI display module.',
 1, 1,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"SPI0_MOSI"},{"net":"SPI0_SCK"},{"net":"SPI0_CS1"},{"net":"GPIO0"}]',
 NULL, 'SPI0_CS1',
 '{"current_max_ma": 50}',
 '[{"ref":"J1","value":"FFC-8","package":"FFC-0.5mm"}]',
 1);

-- =============================================================================
-- UTILITY BLOCKS
-- =============================================================================

INSERT INTO pcb_blocks (id, slug, name, category, description, width_units, height_units, taps, i2c_addresses, spi_cs, power, components, is_validated) VALUES
('util-corner-l', 'util-corner-l', 'Corner (Left)', 'utility',
 'Routes bus 90 degrees: left edge to bottom edge.',
 1, 1,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"I2C0_SDA"},{"net":"I2C0_SCL"},{"net":"SPI0_MOSI"},{"net":"SPI0_MISO"},{"net":"SPI0_SCK"},{"net":"SPI0_CS0"},{"net":"SPI0_CS1"}]',
 NULL, NULL,
 '{"current_max_ma": 0}',
 '[]',
 1),

('util-corner-r', 'util-corner-r', 'Corner (Right)', 'utility',
 'Routes bus 90 degrees: right edge to bottom edge.',
 1, 1,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"I2C0_SDA"},{"net":"I2C0_SCL"},{"net":"SPI0_MOSI"},{"net":"SPI0_MISO"},{"net":"SPI0_SCK"},{"net":"SPI0_CS0"},{"net":"SPI0_CS1"}]',
 NULL, NULL,
 '{"current_max_ma": 0}',
 '[]',
 1),

('util-header', 'util-header', 'Header Breakout', 'utility',
 'Terminates bus signals to standard 2.54mm header for debugging or expansion.',
 1, 2,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"I2C0_SDA"},{"net":"I2C0_SCL"},{"net":"SPI0_MOSI"},{"net":"SPI0_MISO"},{"net":"SPI0_SCK"},{"net":"SPI0_CS0"},{"net":"GPIO0"},{"net":"GPIO1"},{"net":"GPIO2"},{"net":"GPIO3"}]',
 NULL, NULL,
 '{"current_max_ma": 0}',
 '[{"ref":"J1","value":"Header-2x6","package":"2.54mm"}]',
 1),

('util-terminator', 'util-terminator', 'Bus Terminator', 'utility',
 'Optional termination block with test points and pull-ups.',
 1, 1,
 '[{"net":"GND"},{"net":"V3V3"},{"net":"I2C0_SDA"},{"net":"I2C0_SCL"}]',
 NULL, NULL,
 '{"current_max_ma": 0}',
 '[{"ref":"R1","value":"4.7k","package":"0402"},{"ref":"R2","value":"4.7k","package":"0402"}]',
 1);
