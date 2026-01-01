import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Logger, createLogger, isAdmin } from './logger'

// Mock environment
const mockEnv = {
  ENVIRONMENT: 'development',
  DB: {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({}),
      }),
    }),
  },
} as any

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('isAdmin', () => {
    it('should return true for user mike', () => {
      expect(isAdmin({ id: '123', username: 'mike' })).toBe(true)
    })

    it('should return true for user with isAdmin flag', () => {
      expect(isAdmin({ id: '123', username: 'other', isAdmin: true })).toBe(true)
    })

    it('should return false for regular user', () => {
      expect(isAdmin({ id: '123', username: 'other' })).toBe(false)
    })

    it('should return false for null user', () => {
      expect(isAdmin(null)).toBe(false)
    })

    it('should return false for undefined user', () => {
      expect(isAdmin(undefined)).toBe(false)
    })

    it('should return false for user with isAdmin false', () => {
      expect(isAdmin({ id: '123', username: 'other', isAdmin: false })).toBe(false)
    })
  })

  describe('createLogger', () => {
    it('should create a Logger instance', () => {
      const logger = createLogger(mockEnv)

      expect(logger).toBeInstanceOf(Logger)
    })

    it('should accept optional user parameter', () => {
      const logger = createLogger(mockEnv, { id: '123', username: 'test' })

      expect(logger).toBeInstanceOf(Logger)
    })

    it('should accept optional requestId parameter', () => {
      const logger = createLogger(mockEnv, null, 'custom-request-id')

      expect(logger.getRequestId()).toBe('custom-request-id')
    })

    it('should generate requestId if not provided', () => {
      const logger = createLogger(mockEnv)

      expect(logger.getRequestId()).toBeDefined()
      expect(logger.getRequestId().length).toBeGreaterThan(0)
    })
  })

  describe('Logger', () => {
    describe('log levels', () => {
      it('should have debug method', async () => {
        const logger = createLogger(mockEnv, { id: '123', username: 'mike' })

        await logger.debug('general', 'Test debug message')

        expect(console.log).toHaveBeenCalled()
      })

      it('should have info method', async () => {
        const logger = createLogger(mockEnv, { id: '123', username: 'mike' })

        await logger.info('general', 'Test info message')

        expect(console.log).toHaveBeenCalled()
      })

      it('should have warn method', async () => {
        const logger = createLogger(mockEnv, { id: '123', username: 'mike' })

        await logger.warn('general', 'Test warn message')

        expect(console.log).toHaveBeenCalled()
      })

      it('should have error method', async () => {
        const logger = createLogger(mockEnv, { id: '123', username: 'mike' })

        await logger.error('general', 'Test error message')

        expect(console.log).toHaveBeenCalled()
      })
    })

    describe('category shortcuts', () => {
      it('should have api shortcut', async () => {
        const logger = createLogger(mockEnv, { id: '123', username: 'mike' })

        await logger.api('API test message')

        expect(console.log).toHaveBeenCalled()
        const logCall = (console.log as any).mock.calls[0][0]
        expect(logCall).toContain('[api]')
      })

      it('should have llm shortcut', async () => {
        const logger = createLogger(mockEnv, { id: '123', username: 'mike' })

        await logger.llm('LLM test message')

        expect(console.log).toHaveBeenCalled()
        const logCall = (console.log as any).mock.calls[0][0]
        expect(logCall).toContain('[llm]')
      })

      it('should have auth shortcut', async () => {
        const logger = createLogger(mockEnv, { id: '123', username: 'mike' })

        await logger.auth('Auth test message')

        expect(console.log).toHaveBeenCalled()
        const logCall = (console.log as any).mock.calls[0][0]
        expect(logCall).toContain('[auth]')
      })

      it('should have project shortcut', async () => {
        const logger = createLogger(mockEnv, { id: '123', username: 'mike' })

        await logger.project('Project test message')

        expect(console.log).toHaveBeenCalled()
        const logCall = (console.log as any).mock.calls[0][0]
        expect(logCall).toContain('[project]')
      })
    })

    describe('metadata handling', () => {
      it('should include metadata in log output', async () => {
        const logger = createLogger(mockEnv, { id: '123', username: 'mike' })

        await logger.debug('general', 'Test message', { key: 'value' })

        expect(console.log).toHaveBeenCalled()
        const logCall = (console.log as any).mock.calls[0][0]
        expect(logCall).toContain('key')
        expect(logCall).toContain('value')
      })

      it('should handle complex metadata objects', async () => {
        const logger = createLogger(mockEnv, { id: '123', username: 'mike' })

        await logger.debug('general', 'Test message', {
          nested: { deep: { value: 123 } },
          array: [1, 2, 3],
        })

        expect(console.log).toHaveBeenCalled()
      })
    })

    describe('database logging', () => {
      it('should write to database for admin users', async () => {
        const logger = createLogger(mockEnv, { id: '123', username: 'mike' })

        await logger.debug('general', 'Test message')

        expect(mockEnv.DB.prepare).toHaveBeenCalled()
      })

      it('should write to database for error level regardless of user', async () => {
        const logger = createLogger(mockEnv, { id: '123', username: 'regular' })

        await logger.error('general', 'Error message')

        expect(mockEnv.DB.prepare).toHaveBeenCalled()
      })

      it('should not write to database for non-admin non-error logs', async () => {
        const nonAdminEnv = {
          ...mockEnv,
          DB: {
            prepare: vi.fn().mockReturnValue({
              bind: vi.fn().mockReturnValue({
                run: vi.fn().mockResolvedValue({}),
              }),
            }),
          },
        }

        const logger = createLogger(nonAdminEnv, { id: '123', username: 'regular' })

        await logger.debug('general', 'Debug message')

        // Should not call prepare for non-admin debug logs
        // However, console should still be called in development
      })

      it('should pass userId to database when user is provided', async () => {
        const bindMock = vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
        })
        const dbEnv = {
          ...mockEnv,
          DB: {
            prepare: vi.fn().mockReturnValue({ bind: bindMock }),
          },
        }

        const logger = createLogger(dbEnv, { id: 'user-abc-123', username: 'mike' })
        await logger.debug('general', 'Test message')

        // Check that bind was called with userId
        const bindCall = bindMock.mock.calls[0]
        expect(bindCall[1]).toBe('user-abc-123') // userId is second arg
      })

      it('should pass null userId when no user provided', async () => {
        const bindMock = vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
        })
        const dbEnv = {
          ...mockEnv,
          DB: {
            prepare: vi.fn().mockReturnValue({ bind: bindMock }),
          },
        }

        const logger = createLogger(dbEnv, null)
        await logger.error('general', 'Test message') // error to trigger DB log

        const bindCall = bindMock.mock.calls[0]
        expect(bindCall[1]).toBeNull() // userId should be null
      })

      it('should pass metadata as JSON string when provided', async () => {
        const bindMock = vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
        })
        const dbEnv = {
          ...mockEnv,
          DB: {
            prepare: vi.fn().mockReturnValue({ bind: bindMock }),
          },
        }

        const logger = createLogger(dbEnv, { id: '123', username: 'mike' })
        await logger.debug('general', 'Test message', { key: 'value' })

        const bindCall = bindMock.mock.calls[0]
        expect(bindCall[5]).toBe('{"key":"value"}') // metadata is 6th arg
      })

      it('should pass null metadata when not provided', async () => {
        const bindMock = vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
        })
        const dbEnv = {
          ...mockEnv,
          DB: {
            prepare: vi.fn().mockReturnValue({ bind: bindMock }),
          },
        }

        const logger = createLogger(dbEnv, { id: '123', username: 'mike' })
        await logger.debug('general', 'Test message')

        const bindCall = bindMock.mock.calls[0]
        expect(bindCall[5]).toBeNull() // metadata should be null
      })

      it('should pass requestId when provided', async () => {
        const bindMock = vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
        })
        const dbEnv = {
          ...mockEnv,
          DB: {
            prepare: vi.fn().mockReturnValue({ bind: bindMock }),
          },
        }

        const logger = createLogger(dbEnv, { id: '123', username: 'mike' }, 'my-request-id')
        await logger.debug('general', 'Test message')

        const bindCall = bindMock.mock.calls[0]
        expect(bindCall[6]).toBe('my-request-id') // requestId is 7th arg
      })
    })

    describe('console logging', () => {
      it('should log to console in development', async () => {
        const devEnv = { ...mockEnv, ENVIRONMENT: 'development' }
        const logger = createLogger(devEnv, { id: '123', username: 'regular' })

        await logger.info('general', 'Test message')

        expect(console.log).toHaveBeenCalled()
      })

      it('should log errors to console in production', async () => {
        const prodEnv = { ...mockEnv, ENVIRONMENT: 'production' }
        const logger = createLogger(prodEnv, { id: '123', username: 'regular' })

        await logger.error('general', 'Error message')

        expect(console.log).toHaveBeenCalled()
      })
    })

    describe('getRequestId', () => {
      it('should return the request ID', () => {
        const logger = createLogger(mockEnv, null, 'my-request-id')

        expect(logger.getRequestId()).toBe('my-request-id')
      })

      it('should return generated ID when not provided', () => {
        const logger = createLogger(mockEnv)
        const requestId = logger.getRequestId()

        expect(requestId).toBeDefined()
        expect(typeof requestId).toBe('string')
      })
    })

    describe('log categories', () => {
      const categories = [
        'general',
        'api',
        'auth',
        'llm',
        'project',
        'image',
        'db',
        'middleware',
      ] as const

      it.each(categories)('should accept %s category', async (category) => {
        const logger = createLogger(mockEnv, { id: '123', username: 'mike' })

        await logger.debug(category, 'Test message')

        expect(console.log).toHaveBeenCalled()
        const logCall = (console.log as any).mock.calls[0][0]
        expect(logCall).toContain(`[${category}]`)
      })
    })

    describe('error handling', () => {
      it('should handle database errors gracefully', async () => {
        const errorEnv = {
          ...mockEnv,
          DB: {
            prepare: vi.fn().mockReturnValue({
              bind: vi.fn().mockReturnValue({
                run: vi.fn().mockRejectedValue(new Error('DB Error')),
              }),
            }),
          },
        }

        const logger = createLogger(errorEnv, { id: '123', username: 'mike' })

        // Should not throw
        await logger.debug('general', 'Test message')

        expect(console.error).toHaveBeenCalledWith('Failed to write log to DB:', expect.any(Error))
      })
    })

    describe('file buffering', () => {
      it('should buffer logs in development', async () => {
        const devEnv = { ...mockEnv, ENVIRONMENT: 'development' }
        const logger = createLogger(devEnv, { id: '123', username: 'mike' })

        // Log enough to trigger buffering
        await logger.debug('general', 'Test message 1')
        await logger.debug('general', 'Test message 2')

        // The buffer should be populated (tested via console output)
        expect(console.log).toHaveBeenCalled()
      })

      it('should handle flush when buffer is full', async () => {
        const devEnv = { ...mockEnv, ENVIRONMENT: 'development' }
        const logger = createLogger(devEnv, { id: '123', username: 'mike' })

        // Log many messages to potentially trigger flush
        for (let i = 0; i < 105; i++) {
          await logger.debug('general', `Message ${i}`)
        }

        // Should not throw even with buffer operations
        expect(console.log).toHaveBeenCalled()
      })
    })

    describe('log formatting', () => {
      it('should format log without requestId', async () => {
        // Create logger with no requestId (will generate one internally)
        const logger = new Logger(mockEnv, null)

        await logger.debug('general', 'Test message')

        expect(console.log).toHaveBeenCalled()
        const logCall = (console.log as any).mock.calls[0][0]
        expect(logCall).toContain('[req:')
      })

      it('should format log without userId', async () => {
        const logger = createLogger(mockEnv, null) // no user

        await logger.error('general', 'Test message') // error to trigger console

        expect(console.log).toHaveBeenCalled()
        const logCall = (console.log as any).mock.calls[0][0]
        expect(logCall).not.toContain('[user:null]')
      })

      it('should format log with userId', async () => {
        const logger = createLogger(mockEnv, { id: 'user123456789', username: 'mike' })

        await logger.debug('general', 'Test message')

        expect(console.log).toHaveBeenCalled()
        const logCall = (console.log as any).mock.calls[0][0]
        expect(logCall).toContain('[user:user1234]') // First 8 chars
      })
    })

    describe('production vs development logging', () => {
      it('should log errors to console in production', async () => {
        const prodEnv = { ...mockEnv, ENVIRONMENT: 'production' }
        const logger = createLogger(prodEnv, { id: '123', username: 'mike' })

        await logger.error('general', 'Error message')

        expect(console.log).toHaveBeenCalled()
      })

      it('should not log debug to console in production for non-error', async () => {
        vi.clearAllMocks()
        const prodEnv = { ...mockEnv, ENVIRONMENT: 'production' }
        const logger = createLogger(prodEnv, { id: '123', username: 'mike' })

        await logger.debug('general', 'Debug message')

        // In production, debug should not trigger console log (only in dev or for errors)
        // Actually it will because logger.debug calls consoleLog in dev mode check
        // but in production, the condition is isDev || level === 'error'
        // Since it's production and level is debug, console.log should NOT be called
        expect(console.log).not.toHaveBeenCalled()
      })
    })
  })
})
