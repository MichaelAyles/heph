/**
 * Client-side Logger Utility
 *
 * Structured logging for frontend code with consistent formatting.
 * Mirrors the server-side logger API for consistency.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogCategory =
  | 'general'
  | 'api'
  | 'auth'
  | 'llm'
  | 'project'
  | 'image'
  | 'ui'
  | 'orchestrator'
  | 'pcb'
  | 'enclosure'
  | 'firmware'
  | 'export'

interface LogOptions {
  error?: unknown
  [key: string]: unknown
}

/**
 * Format error for logging
 */
function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/**
 * Format metadata for logging
 */
function formatMetadata(metadata?: LogOptions): string {
  if (!metadata) return ''
  const { error, ...rest } = metadata
  const parts: string[] = []
  if (error) {
    parts.push(`error="${formatError(error)}"`)
  }
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) {
      parts.push(`${key}=${JSON.stringify(value)}`)
    }
  }
  return parts.length > 0 ? ` ${parts.join(' ')}` : ''
}

/**
 * Get timestamp in ISO format
 */
function getTimestamp(): string {
  return new Date().toISOString()
}

/**
 * Log to console with appropriate method
 */
function consoleLog(level: LogLevel, message: string): void {
  switch (level) {
    case 'debug':
      console.debug(message)
      break
    case 'info':
      console.info(message)
      break
    case 'warn':
      console.warn(message)
      break
    case 'error':
      console.error(message)
      break
  }
}

/**
 * Main logging function
 */
function log(level: LogLevel, category: LogCategory, message: string, metadata?: LogOptions): void {
  const timestamp = getTimestamp()
  const formatted = `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}${formatMetadata(metadata)}`
  consoleLog(level, formatted)
}

/**
 * Client-side logger with category-specific methods
 */
export const logger = {
  debug(category: LogCategory, message: string, metadata?: LogOptions) {
    log('debug', category, message, metadata)
  },

  info(category: LogCategory, message: string, metadata?: LogOptions) {
    log('info', category, message, metadata)
  },

  warn(category: LogCategory, message: string, metadata?: LogOptions) {
    log('warn', category, message, metadata)
  },

  error(category: LogCategory, message: string, metadata?: LogOptions) {
    log('error', category, message, metadata)
  },

  // Quick category-specific error methods
  api(message: string, metadata?: LogOptions) {
    log('error', 'api', message, metadata)
  },

  auth(message: string, metadata?: LogOptions) {
    log('error', 'auth', message, metadata)
  },

  ui(message: string, metadata?: LogOptions) {
    log('error', 'ui', message, metadata)
  },

  project(message: string, metadata?: LogOptions) {
    log('error', 'project', message, metadata)
  },

  orchestrator(message: string, metadata?: LogOptions) {
    log('error', 'orchestrator', message, metadata)
  },

  pcb(message: string, metadata?: LogOptions) {
    log('error', 'pcb', message, metadata)
  },

  enclosure(message: string, metadata?: LogOptions) {
    log('error', 'enclosure', message, metadata)
  },

  firmware(message: string, metadata?: LogOptions) {
    log('error', 'firmware', message, metadata)
  },

  export(message: string, metadata?: LogOptions) {
    log('error', 'export', message, metadata)
  },
}

export default logger
