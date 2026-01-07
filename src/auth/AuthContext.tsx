import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authValid, clearAuthToken, fetchWhoami } from '../api'

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated'

export type UserProfile = {
  name: string
  displayName: string
}

type AuthContextValue = {
  status: AuthStatus
  user: UserProfile | null
  setAuthenticated: () => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [user, setUser] = useState<UserProfile | null>(null)

  const refreshUser = useCallback(async () => {
    try {
      const profile = await fetchWhoami()
      setUser(profile)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      try {
        await authValid()
        if (!cancelled) {
          setStatus('authenticated')
          await refreshUser()
        }
      } catch {
        if (!cancelled) {
          setStatus('unauthenticated')
          setUser(null)
        }
      }
    }

    check()

    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(
    () => ({
      status,
      user,
      setAuthenticated: async () => {
        setStatus('authenticated')
        await refreshUser()
      },
      signOut: () => {
        clearAuthToken()
        setStatus('unauthenticated')
        setUser(null)
      },
    }),
    [status, user, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
