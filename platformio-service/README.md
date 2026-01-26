# PlatformIO Compile Service

Microservice that compiles ESP32 firmware using PlatformIO.

## Endpoints

### `GET /health`
Health check endpoint.

### `POST /compile`
Compile firmware from JSON payload.

**Request:**
```json
{
  "files": [
    { "path": "platformio.ini", "content": "..." },
    { "path": "src/main.cpp", "content": "..." }
  ],
  "board": "esp32-c6-devkitc-1",
  "framework": "arduino"
}
```

**Response (success):**
```json
{
  "success": true,
  "firmware": "<base64-encoded-bin>",
  "firmwareSize": 123456,
  "buildOutput": "...",
  "duration": 45000
}
```

**Response (error):**
```json
{
  "success": false,
  "error": "Compilation failed",
  "buildOutput": "..."
}
```

### `GET /boards`
List supported boards.

## Supported Boards

- `esp32-c6-devkitc-1` - ESP32-C6 DevKit (default)
- `seeed_xiao_esp32c6` - Seeed XIAO ESP32-C6
- `esp32dev` - Generic ESP32
- `esp32-s3-devkitc-1` - ESP32-S3 DevKit

## Local Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run with Docker (recommended)
docker-compose up -d

# Service available at http://localhost:3002
```

## Railway Deployment

1. Connect this directory to Railway
2. Railway will auto-detect the Dockerfile
3. Set `PLATFORMIO_SERVICE_URL` secret in your frontend deployment

## Testing

```bash
curl -X POST http://localhost:3002/compile \
  -H "Content-Type: application/json" \
  -d '{
    "files": [
      {
        "path": "src/main.cpp",
        "content": "#include <Arduino.h>\nvoid setup() { Serial.begin(115200); }\nvoid loop() { Serial.println(\"Hello\"); delay(1000); }"
      }
    ],
    "board": "esp32-c6-devkitc-1"
  }'
```

## Notes

- First compile may take longer as PlatformIO downloads dependencies
- Timeout is 5 minutes per compilation
- Max file size is 10MB total
- Docker image is ~2GB due to ESP32 toolchain
