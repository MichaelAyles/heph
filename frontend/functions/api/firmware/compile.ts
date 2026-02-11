/**
 * POST /api/firmware/compile
 *
 * Compiles ESP32 firmware via the PlatformIO microservice.
 * Accepts project files and returns compiled .bin firmware.
 */

import type { Env, AuthenticatedRequest } from '../_middleware'
import { createLogger } from '../../lib/logger'

interface CompileRequest {
  files: Array<{ path: string; content: string }>
  board?: string
  framework?: string
}

interface CompileResponse {
  success: boolean
  firmware?: string // base64
  firmwareSize?: number
  buildOutput?: string
  error?: string
  duration?: number
}

export const onRequestPost: PagesFunction<Env, '', AuthenticatedRequest> = async (context) => {
  const { env, request } = context
  const { user, requestId } = context.data
  const logger = await createLogger(env, user || null, requestId)

  if (!user) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  // Check if PlatformIO service is configured
  const serviceUrl = env.PLATFORMIO_SERVICE_URL
  if (!serviceUrl) {
    await logger.warn('firmware', 'PlatformIO service not configured')
    return Response.json({ error: 'Firmware compilation service not configured' }, { status: 503 })
  }

  try {
    const body = (await request.json()) as CompileRequest

    if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
      return Response.json(
        { error: 'No files provided. Expected { files: [{ path, content }] }' },
        { status: 400 }
      )
    }

    // Validate at least main.cpp exists
    const hasMain = body.files.some((f) => f.path === 'src/main.cpp' || f.path === 'main.cpp')
    if (!hasMain) {
      return Response.json({ error: 'Missing src/main.cpp or main.cpp' }, { status: 400 })
    }

    await logger.info('firmware', `Compiling firmware with ${body.files.length} files`, {
      board: body.board || 'esp32-c6-devkitc-1',
      fileCount: body.files.length,
    })

    const startTime = Date.now()

    // Call PlatformIO service with timeout
    const serviceHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
    if (env.INTERNAL_SERVICE_TOKEN) {
      serviceHeaders.Authorization = `Bearer ${env.INTERNAL_SERVICE_TOKEN}`
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 90_000) // 90s timeout (under Cloudflare's 100s limit)

    let response: Response
    try {
      response = await fetch(`${serviceUrl}/compile`, {
        method: 'POST',
        headers: serviceHeaders,
        signal: controller.signal,
        body: JSON.stringify({
          files: body.files,
          board: body.board || 'esp32-c6-devkitc-1',
          framework: body.framework || 'arduino',
        }),
      })
    } catch (fetchError) {
      clearTimeout(timeout)
      const duration = Date.now() - startTime
      const isTimeout = fetchError instanceof DOMException && fetchError.name === 'AbortError'
      const message = isTimeout
        ? 'Compilation timed out (90s). The service may be waking up — try again in a moment.'
        : 'Firmware compilation service unavailable'

      await logger.warn('firmware', message, { duration })
      return Response.json({ success: false, error: message, duration }, { status: 504 })
    }
    clearTimeout(timeout)

    const duration = Date.now() - startTime

    // Handle non-JSON responses (502 text, HTML error pages, etc.)
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      const text = await response.text()
      await logger.warn('firmware', 'Non-JSON response from PlatformIO service', {
        status: response.status,
        contentType,
        body: text.slice(0, 500),
        duration,
      })
      const message =
        response.status === 502
          ? 'Compilation service is starting up — try again in 30 seconds.'
          : `Compilation service returned an error (HTTP ${response.status})`
      return Response.json({ success: false, error: message, duration }, { status: 502 })
    }

    const result = (await response.json()) as CompileResponse

    if (!response.ok || !result.success) {
      await logger.warn('firmware', 'Compilation failed', {
        error: result.error,
        duration,
      })
      return Response.json(
        {
          success: false,
          error: result.error || 'Compilation failed',
          buildOutput: result.buildOutput,
          duration,
        },
        { status: 400 }
      )
    }

    await logger.info('firmware', 'Compilation succeeded', {
      firmwareSize: result.firmwareSize,
      duration,
    })

    return Response.json({
      success: true,
      firmware: result.firmware,
      firmwareSize: result.firmwareSize,
      buildOutput: result.buildOutput,
      duration,
    })
  } catch (error) {
    await logger.error('firmware', 'Compile request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      },
      { status: 500 }
    )
  }
}
