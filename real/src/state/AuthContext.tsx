import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, getToken, setToken } from '../lib/api'
import type { Company, User } from '../lib/types'

interface AuthContextValue {
  user: User | null
  company: Company | null
  status: 'loading' | 'authenticated' | 'anonymous'
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null, company: null, status: 'loading',
  login: async () => {}, logout: async () => {}, refresh: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [status, setStatus] = useState<AuthContextValue['status']>('loading')

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      setCompany(null)
      setStatus('anonymous')
      return
    }
    try {
      const data = await api.get<{ user: User; company: Company }>('/auth/me')
      setUser(data.user)
      setCompany(data.company)
      setStatus('authenticated')
    } catch {
      setToken(null)
      setUser(null)
      setCompany(null)
      setStatus('anonymous')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ token: string; user: User; company: Company }>('/auth/login', { email, password })
    setToken(data.token)
    setUser(data.user)
    setCompany(data.company)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout') } catch { /* session already gone */ }
    setToken(null)
    setUser(null)
    setCompany(null)
    setStatus('anonymous')
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, company, status, login, logout, refresh }),
    [user, company, status, login, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
