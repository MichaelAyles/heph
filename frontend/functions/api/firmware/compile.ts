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
    return Response.json(
      { error: 'Firmware compilation service not configured' },
      { status: 503 }
    )
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
    const hasMain = body.files.some(
      (f) => f.path === 'src/main.cpp' || f.path === 'main.cpp'
    )
    if (!hasMain) {
      return Response.json(
        { error: 'Missing src/main.cpp or main.cpp' },
        { status: 400 }
      )
    }

    await logger.info('firmware', `Compiling firmware with ${body.files.length} files`, {
      board: body.board || 'esp32-c6-devkitc-1',
      fileCount: body.files.length,
    })

    const startTime = Date.now()

    // Call PlatformIO service
    const serviceHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
    if (env.INTERNAL_SERVICE_TOKEN) {
      serviceHeaders.Authorization = `Bearer ${env.INTERNAL_SERVICE_TOKEN}`
    }

    const response = await fetch(`${serviceUrl}/compile`, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({
        files: body.files,
        board: body.board || 'esp32-c6-devkitc-1',
        framework: body.framework || 'arduino',
      }),
    })

    const result = (await response.json()) as CompileResponse
    const duration = Date.now() - startTime

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

    if (error instanceof Error && error.message.includes('fetch')) {
      return Response.json(
        { error: 'Firmware compilation service unavailable' },
        { status: 503 }
      )
    }

    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}
