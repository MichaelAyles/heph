# Blog 44: Cloud Firmware Compilation - PlatformIO on Railway

**Date: 2026-01-26**

Until today, PHAESTUS could generate ESP32 firmware code but users had to compile it themselves. Download the ZIP, install PlatformIO, run `pio run`, flash the board. Not exactly the seamless hardware design experience we're going for.

Now there's a "Compile Firmware" button that does it all in the cloud.

## The Architecture

We already had a pattern from our KiCad service: a Docker container on Railway that accepts files via HTTP and returns generated artifacts. The firmware compiler follows the same approach:

```
Frontend → /api/firmware/compile → Railway PlatformIO Service → firmware.bin
```

The service is straightforward:
- Express server accepting JSON with source files
- Creates temporary PlatformIO project
- Runs `pio run`
- Returns base64-encoded firmware binary

## The ESP32-C6 Problem

Our target board is the ESP32-C6 - it has WiFi 6, BLE 5.3, and Zigbee/Thread support. Perfect for IoT hardware projects. One problem: Arduino framework support for C6 is complicated.

The official PlatformIO espressif32 platform (even version 6.12.0) ships with Arduino-ESP32 v2.0.17, which doesn't support the C6. When you try to compile:

```
Error: This board doesn't support arduino framework!
```

The fix required using the [pioarduino](https://github.com/pioarduino/platform-espressif32) community fork, which packages Arduino-ESP32 v3.x with full C6 support:

```ini
; For ESP32-C6 boards
platform = https://github.com/pioarduino/platform-espressif32/releases/download/51.03.07/platform-espressif32.zip

; For ESP32/S3 boards (stable official platform)
platform = espressif32@6.5.0
```

The compiler auto-selects the right platform based on the target board.

## Build Times

First compile on a cold container takes longer because PlatformIO downloads dependencies. Subsequent builds are faster:

| Scenario | Time |
|----------|------|
| First build (cold) | ~80-120s |
| Rebuild (warm) | ~20-40s |
| With libraries (FastLED, etc.) | +10-30s |

The Docker image pre-installs both platform versions (~1GB of toolchains) to minimize cold start dependency downloads.

## The UI

The firmware stage now has:

1. **Board selector** - Choose ESP32-C6, ESP32-S3, or generic ESP32
2. **Compile button** - Sends current editor content to the service
3. **Build output panel** - Shows PlatformIO output in real-time
4. **Download button** - Get the compiled `.bin` file

The build panel shows success/failure status, compilation duration, and firmware size. On failure, you see the full error output to debug the issue.

## What's Next

The compiled firmware still needs to be flashed manually via USB. Browser-based flashing via WebSerial is technically possible (ESP Web Tools does it), but that's a future enhancement.

For now, users can:
1. Design their hardware in PHAESTUS
2. Generate firmware with AI
3. Edit in the Monaco editor
4. Compile in the cloud
5. Download the `.bin`
6. Flash with `esptool.py` or PlatformIO

One less tool to install locally.

## Technical Details

**Service Stack:**
- Python 3.11 + Node.js 20
- PlatformIO Core
- Pioarduino platform (ESP32-C6)
- Espressif32 6.5.0 (ESP32/S3)

**Deployment:**
- Railway.app (auto-scales, Docker-based)
- ~2GB Docker image
- 5 minute compile timeout

**API:**
- `POST /compile` - Compile firmware from source files
- `GET /boards` - List supported boards
- `GET /health` - Health check

The source lives in `platformio-service/` and deploys independently from the main frontend.
