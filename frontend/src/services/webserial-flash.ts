/**
 * WebSerial Flashing Service
 *
 * Wraps esptool-js to provide browser-based firmware flashing for ESP32-C6.
 * Uses the WebSerial API (Chrome/Edge 89+).
 */

import { ESPLoader, Transport, type LoaderOptions, type FlashOptions } from 'esptool-js'

interface WebSerialPortFilter {
  usbVendorId: number
}

interface WebSerialPort {
  [key: string]: unknown
}

interface WebSerialLikeNavigator extends Navigator {
  serial: {
    requestPort: (options: { filters: WebSerialPortFilter[] }) => Promise<WebSerialPort>
  }
}

// USB Vendor IDs for common ESP32 USB-to-serial chips
const ESP32_USB_FILTERS: WebSerialPortFilter[] = [
  { usbVendorId: 0x10c4 }, // Silicon Labs CP210x
  { usbVendorId: 0x1a86 }, // CH340/CH341
  { usbVendorId: 0x303a }, // Espressif native USB (ESP32-S2/S3/C3/C6)
  { usbVendorId: 0x0403 }, // FTDI
]

// Flash address for ESP32-C6 bootloader firmware
const ESP32_C6_APP_OFFSET = 0x0

export interface FlashProgress {
  stage: 'connecting' | 'erasing' | 'flashing' | 'verifying' | 'complete' | 'error'
  progress: number // 0-100
  message: string
}

export interface FlashTerminalOutput {
  type: 'info' | 'error' | 'success'
  message: string
  timestamp: Date
}

export type ProgressCallback = (progress: FlashProgress) => void
export type TerminalCallback = (output: FlashTerminalOutput) => void

/**
 * Check if WebSerial API is supported in this browser
 */
export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

/**
 * Convert Uint8Array to base64 string
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * WebSerial flash service for ESP32 devices
 */
export class WebSerialFlashService {
  private port: WebSerialPort | null = null
  private transport: Transport | null = null
  private esploader: ESPLoader | null = null
  private isConnected = false
  private onProgress: ProgressCallback | null = null
  private onTerminal: TerminalCallback | null = null

  /**
   * Set callback for progress updates
   */
  setProgressCallback(callback: ProgressCallback) {
    this.onProgress = callback
  }

  /**
   * Set callback for terminal output
   */
  setTerminalCallback(callback: TerminalCallback) {
    this.onTerminal = callback
  }

  private emitProgress(progress: FlashProgress) {
    this.onProgress?.(progress)
  }

  private emitTerminal(type: FlashTerminalOutput['type'], message: string) {
    this.onTerminal?.({
      type,
      message,
      timestamp: new Date(),
    })
  }

  /**
   * Request a serial port from the user and connect to the ESP32
   */
  async connect(): Promise<{ success: boolean; chip?: string; error?: string }> {
    if (!isWebSerialSupported()) {
      return { success: false, error: 'WebSerial API is not supported in this browser' }
    }

    try {
      this.emitProgress({ stage: 'connecting', progress: 0, message: 'Requesting serial port...' })
      this.emitTerminal('info', 'Requesting serial port access...')

      // Request port with ESP32 USB vendor ID filters
      const webSerialNavigator = navigator as WebSerialLikeNavigator
      this.port = await webSerialNavigator.serial.requestPort({ filters: ESP32_USB_FILTERS })

      this.emitTerminal('info', 'Serial port selected')
      this.emitProgress({ stage: 'connecting', progress: 20, message: 'Opening port...' })

      // Create transport wrapper
      this.transport = new Transport(this.port, true)

      this.emitProgress({
        stage: 'connecting',
        progress: 40,
        message: 'Initializing ESP loader...',
      })

      // Create terminal interface for esptool-js
      const terminal = {
        clean: () => {
          // Optional: clear terminal
        },
        writeLine: (data: string) => {
          this.emitTerminal('info', data)
        },
        write: (data: string) => {
          // For incremental writes, buffer or emit as line
          if (data.trim()) {
            this.emitTerminal('info', data.trim())
          }
        },
      }

      // Initialize ESPLoader
      const loaderOptions: LoaderOptions = {
        transport: this.transport,
        baudrate: 115200,
        romBaudrate: 115200,
        terminal,
        debugLogging: false,
      }

      this.esploader = new ESPLoader(loaderOptions)

      this.emitProgress({
        stage: 'connecting',
        progress: 60,
        message: 'Connecting to ESP32 (hold BOOT button if needed)...',
      })
      this.emitTerminal('info', 'Connecting to ESP32... If no response, hold BOOT and press EN/RST')

      // Connect and detect chip
      const chip = await this.esploader.main()

      this.isConnected = true
      this.emitProgress({ stage: 'connecting', progress: 100, message: `Connected to ${chip}` })
      this.emitTerminal('success', `Connected to ${chip}`)

      return { success: true, chip }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect'
      this.emitProgress({ stage: 'error', progress: 0, message })
      this.emitTerminal('error', `Connection failed: ${message}`)
      await this.disconnect()
      return { success: false, error: message }
    }
  }

  /**
   * Flash firmware binary to the connected ESP32
   * @param firmware - Firmware as Uint8Array (will be converted to base64 for esptool-js)
   */
  async flash(firmware: Uint8Array): Promise<{ success: boolean; error?: string }> {
    if (!this.isConnected || !this.esploader) {
      return { success: false, error: 'Not connected to device' }
    }

    try {
      this.emitProgress({ stage: 'erasing', progress: 0, message: 'Preparing to flash...' })
      this.emitTerminal('info', `Firmware size: ${(firmware.length / 1024).toFixed(1)} KB`)

      // Convert firmware to base64 string (esptool-js expects string data)
      const firmwareBase64 = uint8ArrayToBase64(firmware)

      // Prepare file array for flashing
      const fileArray = [
        {
          data: firmwareBase64,
          address: ESP32_C6_APP_OFFSET,
        },
      ]

      this.emitProgress({ stage: 'flashing', progress: 0, message: 'Starting flash...' })
      this.emitTerminal('info', 'Starting flash process...')

      // Flash options
      const flashOptions: FlashOptions = {
        fileArray,
        flashSize: 'keep',
        flashMode: 'keep',
        flashFreq: 'keep',
        eraseAll: false,
        compress: true,
        reportProgress: (_fileIndex: number, written: number, total: number) => {
          const percent = Math.round((written / total) * 100)
          this.emitProgress({
            stage: 'flashing',
            progress: percent,
            message: `Flashing: ${percent}% (${(written / 1024).toFixed(0)}/${(total / 1024).toFixed(0)} KB)`,
          })
        },
        calculateMD5Hash: (image: string): string => {
          // Simple hash for verification display (actual verification done by esptool)
          let hash = 0
          for (let i = 0; i < image.length; i++) {
            hash = (hash << 5) - hash + image.charCodeAt(i)
            hash = hash & hash
          }
          return Math.abs(hash).toString(16).padStart(8, '0')
        },
      }

      // Write firmware
      await this.esploader.writeFlash(flashOptions)

      this.emitProgress({ stage: 'verifying', progress: 100, message: 'Verifying...' })
      this.emitTerminal('info', 'Flash complete, finalizing...')

      // Reset device to run new firmware
      await this.esploader.after()

      this.emitProgress({ stage: 'complete', progress: 100, message: 'Flash successful!' })
      this.emitTerminal('success', 'Firmware flashed successfully! Device is restarting...')

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Flash failed'
      this.emitProgress({ stage: 'error', progress: 0, message })
      this.emitTerminal('error', `Flash failed: ${message}`)
      return { success: false, error: message }
    }
  }

  /**
   * Disconnect from the serial port
   */
  async disconnect(): Promise<void> {
    try {
      if (this.transport) {
        await this.transport.disconnect()
      }
    } catch {
      // Ignore disconnect errors
    }

    this.transport = null
    this.esploader = null
    this.port = null
    this.isConnected = false
    this.emitTerminal('info', 'Disconnected from device')
  }

  /**
   * Check if currently connected to a device
   */
  getIsConnected(): boolean {
    return this.isConnected
  }
}

// Singleton instance for convenience
let flashServiceInstance: WebSerialFlashService | null = null

export function getFlashService(): WebSerialFlashService {
  if (!flashServiceInstance) {
    flashServiceInstance = new WebSerialFlashService()
  }
  return flashServiceInstance
}
