'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  ReactNode,
} from 'react'

export interface AuthUser {
  id: string
  name?: string
  fullName?: string
  email?: string
  role?: 'student' | 'instructor' | 'admin'
  avatarUrl?: string
  isActive?: boolean
}

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (user: AuthUser, accessToken: string, refreshToken: string) => void
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const AUTH_CHANGE_EVENT = 'auth-change'

/** Subscribe to every source that can change the stored session. */
function subscribeToAuth(callback: () => void) {
  window.addEventListener(AUTH_CHANGE_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

/**
 * Snapshot is a primitive string so `useSyncExternalStore` can compare it
 * safely and re-render synchronously right after hydration. Reads localStorage
 * directly, which removes the previous "checking permission" flash.
 */
function getAuthSnapshot(): string {
  try {
    const token = localStorage.getItem('accessToken')
    const rawUser = localStorage.getItem('currentUser')
    return `${token ? '1' : '0'}::${rawUser || ''}`
  } catch {
    return '0::'
  }
}

function getServerAuthSnapshot(): string {
  return '0::'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    subscribeToAuth,
    getAuthSnapshot,
    getServerAuthSnapshot
  )

  const user = useMemo<AuthUser | null>(() => {
    const rawUser = snapshot.slice(snapshot.indexOf('::') + 2)
    if (!rawUser) return null
    try {
      return JSON.parse(rawUser) as AuthUser
    } catch {
      return null
    }
  }, [snapshot])

  const login = useCallback(
    (userData: AuthUser, accessToken: string, refreshToken: string) => {
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', refreshToken)
      localStorage.setItem('currentUser', JSON.stringify(userData))
      window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
    },
    []
  )

  const logout = useCallback(async () => {
    // Thu hồi token phía server trước khi xóa phiên cục bộ, để token cũ
    // không còn dùng được đến khi hết hạn. Lỗi mạng không chặn đăng xuất.
    try {
      const { authApi } = await import('@/lib/api')
      await authApi.logout()
    } catch {
      /* bỏ qua: vẫn xóa phiên cục bộ bên dưới */
    }
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('currentUser')
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const { authApi } = await import('@/lib/api')
      const res = await authApi.getProfile()
      const userData = res.data?.data || res.data
      if (userData) {
        localStorage.setItem('currentUser', JSON.stringify(userData))
        window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
      }
    } catch {
      // Keep the existing user when the refresh request fails.
    }
  }, [])

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      // Session is read synchronously from localStorage, so there is no
      // asynchronous loading phase anymore.
      isLoading: false,
      isAuthenticated: !!user,
      login,
      logout,
      refreshUser,
    }),
    [user, login, logout, refreshUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
