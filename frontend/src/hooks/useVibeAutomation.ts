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
  const runRef = useRef(run)
  const onErrorRef = useRef(onError)

  // Keep latest callbacks without retriggering/aborting active automations on every render.
  useEffect(() => {
    runRef.current = run
    onErrorRef.current = onError
  }, [onError, run])

  useEffect(() => {
    if (!enabled) return
    if (startedKeysRef.current.has(key)) return

    startedKeysRef.current.add(key)

    const controller = new AbortController()
    void runRef.current(controller.signal).catch((error) => {
      logger.warn('orchestrator', 'Vibe automation task failed', {
        key,
        error: error instanceof Error ? error.message : String(error),
      })
      onErrorRef.current?.(error)
      startedKeysRef.current.delete(key)
    })

    return () => {
      controller.abort()
    }
  }, [enabled, key])
}
