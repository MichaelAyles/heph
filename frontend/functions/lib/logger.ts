/**
 * Debug Logger Utility
 *
 * Comprehensive logging for admin users (mike)
 * - Writes to console
 * - Stores in database
 * - Only for admin users in production
 */

import type { Env } from '../env'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogCategory =
  | 'general'
  | 'api'
  | 'auth'
  | 'llm'
  | 'project'
  | 'image'
  | 'db'
  | 'middleware'

interface LogEntry {
  level: LogLevel
  category: LogCategory
  message: string
  metadata?: Record<string, unknown>
  requestId?: string
  userId?: string
}

interface User {
  id: string
  username: string
  isAdmin?: boolean
}

// In-memory buffer for file logging (written periodically)
let logBuffer: string[] = []
let lastFlush = Date.now()

/**
 * Check if user is admin
 */
export function isAdmin(user: User | null | undefined): boolean {
  if (!user) return false
  return user.username === 'mike' || user.isAdmin === true
}

/**
 * Format log entry for console/file
 */
function formatLogEntry(entry: LogEntry & { timestamp: string }): string {
  const { timestamp, level, category, message, metadata, requestId, userId } = entry
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${category}]`
  const reqInfo = requestId ? ` [req:${requestId.slice(0, 8)}]` : ''
  const userInfo = userId ? ` [user:${userId.slice(0, 8)}]` : ''
  const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : ''
  return `${prefix}${reqInfo}${userInfo} ${message}${metaStr}`
}

/**
 * Write to console with color
 */
function consoleLog(level: LogLevel, formatted: string): void {
  const colors = {
    debug: '\x1b[36m', // cyan
    info: '\x1b[32m', // green
    warn: '\x1b[33m', // yellow
    error: '\x1b[31m', // red
  }
  const reset = '\x1b[0m'
  console.log(`${colors[level]}${formatted}${reset}`)
}

/**
 * Store log in database
 */
async function dbLog(env: Env, entry: LogEntry): Promise<void> {
  try {
    const id = crypto.randomUUID().replace(/-/g, '')
    await env.DB.prepare(
      `INSERT INTO debug_logs (id, user_id, level, category, message, metadata, request_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        id,
        entry.userId || null,
        entry.level,
        entry.category,
        entry.message,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.requestId || null
      )
      .run()
  } catch (err) {
    console.error('Failed to write log to DB:', err)
  }
}

/**
 * Main logger class
 */
export class Logger {
  private env: Env
  private user: User | null
  private requestId: string
  private isAdminUser: boolean

  constructor(env: Env, user: User | null = null, requestId?: string) {
    this.env = env
    this.user = user
    this.requestId = requestId || crypto.randomUUID().replace(/-/g, '')
    this.isAdminUser = isAdmin(user)
  }

  private async log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const entry: LogEntry = {
      level,
      category,
      message,
      metadata,
      requestId: this.requestId,
      userId: this.user?.id,
    }

    const timestamp = new Date().toISOString()
    const formatted = formatLogEntry({ ...entry, timestamp })

    // Always console log in development
    const isDev = this.env.ENVIRONMENT === 'development'
    if (isDev || level === 'error') {
      consoleLog(level, formatted)
    }

    // Only DB log for admin users (to save space)
    if (this.isAdminUser || level === 'error') {
      await dbLog(this.env, entry)
    }

    // Buffer for file (development only)
    if (isDev) {
      logBuffer.push(formatted)
      // Flush every 5 seconds or 100 entries
      if (Date.now() - lastFlush > 5000 || logBuffer.length > 100) {
        this.flushToFile()
      }
    }
  }

  private flushToFile(): void {
    if (logBuffer.length === 0) return
    try {
      const logPath = '/tmp/phaestus-debug.log'
      const content = logBuffer.join('\n') + '\n'
      // In Cloudflare Workers, we can't write to files
      // This is a no-op in production but useful concept for local dev
      logBuffer = []
      lastFlush = Date.now()
    } catch {
      // Ignore file write errors
    }
  }

  // Convenience methods
  debug(category: LogCategory, message: string, metadata?: Record<string, unknown>) {
    return this.log('debug', category, message, metadata)
  }

  info(category: LogCategory, message: string, metadata?: Record<string, unknown>) {
    return this.log('info', category, message, metadata)
  }

  warn(category: LogCategory, message: string, metadata?: Record<string, unknown>) {
    return this.log('warn', category, message, metadata)
  }

  error(category: LogCategory, message: string, metadata?: Record<string, unknown>) {
    return this.log('error', category, message, metadata)
  }

  // Quick category-specific methods
  api(message: string, metadata?: Record<string, unknown>) {
    return this.info('api', message, metadata)
  }

  llm(message: string, metadata?: Record<string, unknown>) {
    return this.info('llm', message, metadata)
  }

  auth(message: string, metadata?: Record<string, unknown>) {
    return this.info('auth', message, metadata)
  }

  project(message: string, metadata?: Record<string, unknown>) {
    return this.info('project', message, metadata)
  }

  // Get request ID for response headers
  getRequestId(): string {
    return this.requestId
  }
}

/**
 * Create a logger instance for a request
 */
export function createLogger(env: Env, user: User | null = null, requestId?: string): Logger {
  return new Logger(env, user, requestId)
}
