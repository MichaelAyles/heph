import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../env.d'
import { __testables, getTrackedLoginUsers, maybeNotifyWatchedLogin } from './login-notifier'

describe('login-notifier', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('user matching', () => {
    it('returns default tracked users when env list is not set', () => {
      expect(getTrackedLoginUsers()).toEqual(['ycombinator', 'gemini3', 'mike'])
    })

    it('uses default watched users when env list is not set', () => {
      expect(__testables.shouldNotifyForUser('ycombinator')).toBe(true)
      expect(__testables.shouldNotifyForUser('gemini3')).toBe(true)
      expect(__testables.shouldNotifyForUser('mike')).toBe(true)
      expect(__testables.shouldNotifyForUser('randomuser')).toBe(false)
    })

    it('uses custom watched users from env var', () => {
      expect(__testables.shouldNotifyForUser('alpha', 'alpha,beta')).toBe(true)
      expect(__testables.shouldNotifyForUser('beta', 'alpha,beta')).toBe(true)
      expect(__testables.shouldNotifyForUser('ycombinator', 'alpha,beta')).toBe(false)
    })

    it('normalizes case and whitespace', () => {
      expect(__testables.shouldNotifyForUser('YCombinator', ' ycombinator , GEMINI3 ')).toBe(true)
      expect(__testables.shouldNotifyForUser('gemini3', ' ycombinator , GEMINI3 ')).toBe(true)
    })
  })

  describe('webhook behavior', () => {
    const baseEnv = {
      ENVIRONMENT: 'test',
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({}),
          }),
        }),
      },
    } as unknown as Env

    it('does nothing when webhook is not configured', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')

      await maybeNotifyWatchedLogin({
        env: baseEnv,
        username: 'ycombinator',
        loginMethod: 'password',
      })

      expect(fetchSpy).not.toHaveBeenCalled()
      expect(baseEnv.DB.prepare).toHaveBeenCalled()
    })

    it('does nothing for non-watched users', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      const env = { ...baseEnv, LOGIN_NOTIFY_WEBHOOK_URL: 'https://example.com/hook' } as Env

      await maybeNotifyWatchedLogin({
        env,
        username: 'randomuser',
        loginMethod: 'password',
      })

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('posts notification for watched users', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 200,
        })
      )
      const env = { ...baseEnv, LOGIN_NOTIFY_WEBHOOK_URL: 'https://example.com/hook' } as Env

      await maybeNotifyWatchedLogin({
        env,
        username: 'gemini3',
        loginMethod: 'oauth',
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/hook',
        expect.objectContaining({
          method: 'POST',
        })
      )
    })
  })
})
