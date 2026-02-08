import { useEffect, useRef } from 'react'
import { logger } from '@/lib/logger'

interface UseVibeAutomationParams {
  enabled: boolean
  key: string
  run: (signal: AbortSignal) => Promise<void>
  onError?: (error: unknown) => void
}

/**
 * Runs a vibe automation task once per `key` while enabled.
 * Centralizes once-only orchestration behavior used across workspace stages.
 */
export function useVibeAutomation({ enabled, key, run, onError }: UseVibeAutomationParams) {
  const startedKeysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!enabled) return
    if (startedKeysRef.current.has(key)) return

    startedKeysRef.current.add(key)

    const controller = new AbortController()
    void run(controller.signal).catch((error) => {
      logger.warn('orchestrator', 'Vibe automation task failed', {
        key,
        error: error instanceof Error ? error.message : String(error),
      })
      onError?.(error)
      startedKeysRef.current.delete(key)
    })

    return () => {
      controller.abort()
    }
  }, [enabled, key, onError, run])
}
