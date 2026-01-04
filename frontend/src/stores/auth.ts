/**
 * Auth Store
 * Manages user authentication state
 */

import { create } from 'zustand'

export type ControlMode = 'vibe_it' | 'fix_it' | 'design_it'

export interface AuthUser {
  id: string
  username: string
  displayName: string | null
  isAdmin: boolean
  controlMode: ControlMode
}

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean

  // Actions
  checkAuth: () => Promise<void>
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  updateControlMode: (mode: ControlMode) => Promise<{ success: boolean; error?: string }>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  checkAuth: async () => {
    try {
      const res = await fetch('/api/auth/me')
      const data = await res.json()

      if (data.user) {
        set({ user: data.user, isAuthenticated: true, isLoading: false })
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false })
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  login: async (username: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()

      if (res.ok && data.user) {
        set({ user: data.user, isAuthenticated: true })
        return { success: true }
      }

      return { success: false, error: data.error || 'Login failed' }
    } catch (error) {
      console.error('Login failed:', error)
      return { success: false, error: 'Network error' }
    }
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      console.error('Logout failed:', error)
    } finally {
      set({ user: null, isAuthenticated: false })
    }
  },

  updateControlMode: async (mode: ControlMode) => {
    try {
      const res = await fetch('/api/users/me/mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ controlMode: mode }),
      })

      if (res.ok) {
        set((state) => ({
          user: state.user ? { ...state.user, controlMode: mode } : null,
        }))
        return { success: true }
      }

      const data = await res.json()
      return { success: false, error: data.error || 'Failed to update mode' }
    } catch (error) {
      console.error('Update control mode failed:', error)
      return { success: false, error: 'Network error' }
    }
  },
}))
