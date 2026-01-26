/**
 * GET /api/firmware/boards
 *
 * Returns list of supported boards for firmware compilation.
 */

import type { Env, AuthenticatedRequest } from '../_middleware'

export const onRequestGet: PagesFunction<Env, '', AuthenticatedRequest> = async (context) => {
  const { user } = context.data

  if (!user) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  // Check if PlatformIO service is configured
  const serviceUrl = context.env.PLATFORMIO_SERVICE_URL
  const serviceAvailable = !!serviceUrl

  return Response.json({
    serviceAvailable,
    boards: [
      {
        id: 'esp32-c6-devkitc-1',
        name: 'ESP32-C6 DevKit',
        description: 'ESP32-C6 development board (recommended)',
        features: ['WiFi 6', 'BLE 5.3', 'Zigbee/Thread', 'RISC-V'],
        default: true,
      },
      {
        id: 'seeed_xiao_esp32c6',
        name: 'Seeed XIAO ESP32-C6',
        description: 'Compact ESP32-C6 board (21x17.5mm)',
        features: ['WiFi 6', 'BLE 5.3', 'Compact'],
        default: false,
      },
      {
        id: 'esp32dev',
        name: 'ESP32 Dev Module',
        description: 'Generic ESP32 board',
        features: ['WiFi', 'BLE 4.2', 'Dual-core'],
        default: false,
      },
      {
        id: 'esp32-s3-devkitc-1',
        name: 'ESP32-S3 DevKit',
        description: 'ESP32-S3 development board',
        features: ['WiFi', 'BLE 5.0', 'USB OTG', 'AI acceleration'],
        default: false,
      },
    ],
    defaultBoard: 'esp32-c6-devkitc-1',
    defaultFramework: 'arduino',
  })
}
