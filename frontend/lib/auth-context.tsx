'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const stored = localStorage.getItem('currentUser')
        const token = localStorage.getItem('accessToken')
        if (stored && token) {
          const parsed = JSON.parse(stored)
          setUser(parsed)
        }
      } catch {
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }
    loadUser()

    const handleAuthChange = () => {
      const stored = localStorage.getItem('currentUser')
      const token = localStorage.getItem('accessToken')
      if (stored && token) {
        try {
          setUser(JSON.parse(stored))
        } catch {
          setUser(null)
        }
      } else {
        setUser(null)
      }
    }

    window.addEventListener('auth-change', handleAuthChange)
    window.addEventListener('storage', handleAuthChange)

    return () => {
      window.removeEventListener('auth-change', handleAuthChange)
      window.removeEventListener('storage', handleAuthChange)
    }
  }, [])

  const login = (userData: AuthUser, accessToken: string, refreshToken: string) => {
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    localStorage.setItem('currentUser', JSON.stringify(userData))
    setUser(userData)
    window.dispatchEvent(new Event('auth-change'))
  }

  const logout = () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('currentUser')
    setUser(null)
    window.dispatchEvent(new Event('auth-change'))
  }

  const refreshUser = async () => {
    try {
      const { authApi } = await import('@/lib/api')
      const res = await authApi.getProfile()
      const userData = res.data?.data || res.data
      if (userData) {
        localStorage.setItem('currentUser', JSON.stringify(userData))
        setUser(userData)
      }
    } catch {
      // Keep existing user if refresh fails
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}