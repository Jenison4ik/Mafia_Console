import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { apiJson } from './api'

export type Me = {
  id: number
  username: string
  display_name: string
  is_staff: boolean
} | null

type AuthCtx = {
  me: Me
  loading: boolean
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthCtx | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const u = await apiJson<Me | null>('/auth/me/')
      setMe(u && u.id ? u : null)
    } catch {
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const v = useMemo(() => ({ me, loading, refresh }), [me, loading, refresh])
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth')
  return c
}
