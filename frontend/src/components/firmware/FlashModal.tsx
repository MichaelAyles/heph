/**
 * FlashModal - WebSerial firmware flashing dialog
 *
 * Provides step-by-step UI for flashing firmware to ESP32-C6 via WebSerial.
 */

import { useState, useRef, useEffect } from 'react'
import { X, Usb, Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { clsx } from 'clsx'
import {
  isWebSerialSupported,
  getFlashService,
  type FlashProgress,
  type FlashTerminalOutput,
} from '@/services/webserial-flash'

interface FlashModalProps {
  isOpen: boolean
  onClose: () => void
  firmwareBase64: string
  firmwareSize: number
  projectName: string
}

type FlashState = 'idle' | 'connecting' | 'connected' | 'flashing' | 'success' | 'error'

export function FlashModal({
  isOpen,
  onClose,
  firmwareBase64,
  firmwareSize,
  projectName,
}: FlashModalProps) {
  const [flashState, setFlashState] = useState<FlashState>('idle')
  const [progress, setProgress] = useState<FlashProgress | null>(null)
  const [logs, setLogs] = useState<FlashTerminalOutput[]>([])
  const [chipName, setChipName] = useState<string>('')
  const [error, setError] = useState<string>('')
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Resetting modal state on open
      setFlashState('idle')
      setProgress(null)
      setLogs([])
      setChipName('')
      setError('')
    }
  }, [isOpen])

  // Cleanup on close
  useEffect(() => {
    if (!isOpen) {
      const service = getFlashService()
      service.disconnect()
    }
  }, [isOpen])

  const handleConnect = async () => {
    const service = getFlashService()

    // Set up callbacks
    service.setProgressCallback((p) => {
      setProgress(p)
      if (p.stage === 'error') {
        setError(p.message)
        setFlashState('error')
      }
    })

    service.setTerminalCallback((output) => {
      setLogs((prev) => [...prev, output])
    })

    setFlashState('connecting')
    setError('')

    const result = await service.connect()

    if (result.success) {
      setChipName(result.chip || 'ESP32')
      setFlashState('connected')
    } else {
      setError(result.error || 'Connection failed')
      setFlashState('error')
    }
  }

  const handleFlash = async () => {
    const service = getFlashService()

    setFlashState('flashing')
    setError('')

    // Decode base64 firmware to Uint8Array
    const binaryStr = atob(firmwareBase64)
    const firmware = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      firmware[i] = binaryStr.charCodeAt(i)
    }

    const result = await service.flash(firmware)

    if (result.success) {
      setFlashState('success')
    } else {
      setError(result.error || 'Flash failed')
      setFlashState('error')
    }
  }

  const handleDisconnect = async () => {
    const service = getFlashService()
    await service.disconnect()
    setFlashState('idle')
    setChipName('')
  }

  const handleClose = () => {
    handleDisconnect()
    onClose()
  }

  if (!isOpen) return null

  const isSupported = isWebSerialSupported()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-surface-900 border border-surface-700 rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700">
          <div className="flex items-center gap-2">
            <Usb className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-steel">Flash to Device</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-steel-dim hover:text-steel transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Browser compatibility warning */}
          {!isSupported && (
            <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-400">Browser Not Supported</p>
                <p className="text-sm text-steel-dim mt-1">
                  WebSerial requires Chrome or Edge 89+. Safari and Firefox do not support this
                  feature.
                </p>
              </div>
            </div>
          )}

          {/* Instructions */}
          {isSupported && flashState === 'idle' && (
            <div className="space-y-3">
              <p className="text-sm text-steel">
                Flash <span className="font-medium text-amber-400">{projectName}</span> firmware (
                {(firmwareSize / 1024).toFixed(1)} KB) to your ESP32-C6.
              </p>
              <div className="p-3 bg-surface-800 rounded-lg">
                <p className="text-sm font-medium text-steel mb-2">Before connecting:</p>
                <ol className="text-sm text-steel-dim space-y-1 list-decimal list-inside">
                  <li>Connect your ESP32-C6 via USB</li>
                  <li>If using a DevKit, you may need to hold the BOOT button</li>
                  <li>Click Connect and select your device</li>
                </ol>
              </div>
            </div>
          )}

          {/* Connected state */}
          {flashState === 'connected' && (
            <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-emerald-400">Connected to {chipName}</p>
                <p className="text-sm text-steel-dim">Ready to flash firmware</p>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {(flashState === 'connecting' || flashState === 'flashing') && progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-steel">{progress.message}</span>
                <span className="text-steel-dim">{progress.progress}%</span>
              </div>
              <div className="h-2 bg-surface-700 rounded-full overflow-hidden">
                <div
                  className={clsx(
                    'h-full transition-all duration-300',
                    flashState === 'connecting' ? 'bg-amber-500' : 'bg-emerald-500'
                  )}
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Success state */}
          {flashState === 'success' && (
            <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-emerald-400">Flash Complete!</p>
                <p className="text-sm text-steel-dim">
                  Your device is restarting with the new firmware
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {flashState === 'error' && error && (
            <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-400">Error</p>
                <p className="text-sm text-steel-dim mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Terminal logs */}
          {logs.length > 0 && (
            <div className="bg-surface-950 border border-surface-700 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-surface-700 bg-surface-800">
                <span className="text-xs font-medium text-steel-dim">Output</span>
              </div>
              <div className="h-32 overflow-y-auto p-2">
                {logs.map((log, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'text-xs font-mono',
                      log.type === 'error' && 'text-red-400',
                      log.type === 'success' && 'text-emerald-400',
                      log.type === 'info' && 'text-steel-dim'
                    )}
                  >
                    {log.message}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-surface-700">
          {flashState === 'idle' && isSupported && (
            <button
              onClick={handleConnect}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ash bg-amber-600 hover:bg-amber-500 rounded transition-colors"
            >
              <Usb className="w-4 h-4" />
              Connect
            </button>
          )}

          {flashState === 'connecting' && (
            <button
              disabled
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ash bg-amber-600/50 rounded cursor-not-allowed"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Connecting...
            </button>
          )}

          {flashState === 'connected' && (
            <>
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 text-sm font-medium text-steel bg-surface-800 hover:bg-surface-700 border border-surface-600 rounded transition-colors"
              >
                Disconnect
              </button>
              <button
                onClick={handleFlash}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ash bg-emerald-600 hover:bg-emerald-500 rounded transition-colors"
              >
                Flash Firmware
              </button>
            </>
          )}

          {flashState === 'flashing' && (
            <button
              disabled
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ash bg-emerald-600/50 rounded cursor-not-allowed"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Flashing...
            </button>
          )}

          {(flashState === 'success' || flashState === 'error') && (
            <>
              {flashState === 'error' && (
                <button
                  onClick={handleConnect}
                  className="px-4 py-2 text-sm font-medium text-steel bg-surface-800 hover:bg-surface-700 border border-surface-600 rounded transition-colors"
                >
                  Try Again
                </button>
              )}
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-ash bg-surface-700 hover:bg-surface-600 rounded transition-colors"
              >
                Close
              </button>
            </>
          )}

          {!isSupported && (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-ash bg-surface-700 hover:bg-surface-600 rounded transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
