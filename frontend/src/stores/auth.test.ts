import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAuthStore } from './auth'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('auth store', () => {
  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({
      user: null,
      isLoading: true,
      isAuthenticated: false,
    })
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('should have null user initially', () => {
      const state = useAuthStore.getState()

      expect(state.user).toBeNull()
    })

    it('should be loading initially', () => {
      const state = useAuthStore.getState()

      expect(state.isLoading).toBe(true)
    })

    it('should not be authenticated initially', () => {
      const state = useAuthStore.getState()

      expect(state.isAuthenticated).toBe(false)
    })
  })

  describe('checkAuth', () => {
    it('should set user when authenticated', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        displayName: 'Test User',
        isAdmin: false,
        controlMode: 'fix_it',
      }

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ user: mockUser }),
      })

      await useAuthStore.getState().checkAuth()

      const state = useAuthStore.getState()
      expect(state.user).toEqual(mockUser)
      expect(state.isAuthenticated).toBe(true)
      expect(state.isLoading).toBe(false)
    })

    it('should clear user when not authenticated', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ user: null }),
      })

      await useAuthStore.getState().checkAuth()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(false)
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await useAuthStore.getState().checkAuth()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(false)
      expect(console.error).toHaveBeenCalled()
    })

    it('should call /api/auth/me endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ user: null }),
      })

      await useAuthStore.getState().checkAuth()

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/me')
    })
  })

  describe('login', () => {
    it('should return success and set user on successful login', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        displayName: 'Test User',
        isAdmin: false,
        controlMode: 'fix_it',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: mockUser }),
      })

      const result = await useAuthStore.getState().login('testuser', 'password')

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()

      const state = useAuthStore.getState()
      expect(state.user).toEqual(mockUser)
      expect(state.isAuthenticated).toBe(true)
    })

    it('should return error on failed login', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid credentials' }),
      })

      const result = await useAuthStore.getState().login('testuser', 'wrongpassword')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid credentials')

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
    })

    it('should return default error message when none provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      })

      const result = await useAuthStore.getState().login('testuser', 'password')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Login failed')
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await useAuthStore.getState().login('testuser', 'password')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
      expect(console.error).toHaveBeenCalled()
    })

    it('should call /api/auth/login with correct parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: '1', username: 'test', displayName: null, isAdmin: false, controlMode: 'fix_it' } }),
      })

      await useAuthStore.getState().login('testuser', 'mypassword')

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'mypassword' }),
      })
    })

    it('should not set user when response is ok but no user returned', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })

      const result = await useAuthStore.getState().login('testuser', 'password')

      expect(result.success).toBe(false)
    })
  })

  describe('logout', () => {
    beforeEach(() => {
      // Set authenticated state
      useAuthStore.setState({
        user: { id: '123', username: 'test', displayName: 'Test', isAdmin: false, controlMode: 'fix_it' },
        isAuthenticated: true,
        isLoading: false,
      })
    })

    it('should clear user and set isAuthenticated to false', async () => {
      mockFetch.mockResolvedValueOnce({})

      await useAuthStore.getState().logout()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
    })

    it('should still clear state even on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await useAuthStore.getState().logout()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
      expect(console.error).toHaveBeenCalled()
    })

    it('should call /api/auth/logout endpoint', async () => {
      mockFetch.mockResolvedValueOnce({})

      await useAuthStore.getState().logout()

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    })
  })

  describe('AuthUser interface', () => {
    it('should accept user with displayName null', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        displayName: null,
        isAdmin: false,
        controlMode: 'fix_it',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: mockUser }),
      })

      await useAuthStore.getState().login('testuser', 'password')

      const state = useAuthStore.getState()
      expect(state.user?.displayName).toBeNull()
    })

    it('should accept user with displayName string', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        displayName: 'Test User',
        isAdmin: false,
        controlMode: 'fix_it',
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: mockUser }),
      })

      await useAuthStore.getState().login('testuser', 'password')

      const state = useAuthStore.getState()
      expect(state.user?.displayName).toBe('Test User')
    })
  })

  describe('updateControlMode', () => {
    beforeEach(() => {
      // Set authenticated state
      useAuthStore.setState({
        user: { id: '123', username: 'test', displayName: 'Test', isAdmin: false, controlMode: 'fix_it' },
        isAuthenticated: true,
        isLoading: false,
      })
    })

    it('should update control mode on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, controlMode: 'vibe_it' }),
      })

      const result = await useAuthStore.getState().updateControlMode('vibe_it')

      expect(result.success).toBe(true)
      const state = useAuthStore.getState()
      expect(state.user?.controlMode).toBe('vibe_it')
    })

    it('should return error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid mode' }),
      })

      const result = await useAuthStore.getState().updateControlMode('vibe_it')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid mode')
      // Mode should not have changed
      const state = useAuthStore.getState()
      expect(state.user?.controlMode).toBe('fix_it')
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await useAuthStore.getState().updateControlMode('vibe_it')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
      expect(console.error).toHaveBeenCalled()
    })

    it('should call /api/users/me/mode with correct parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, controlMode: 'design_it' }),
      })

      await useAuthStore.getState().updateControlMode('design_it')

      expect(mockFetch).toHaveBeenCalledWith('/api/users/me/mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ controlMode: 'design_it' }),
      })
    })
  })
})
