import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Api } from '../data/api'
import { currentRates } from '../data/api'
import { createDemoApi } from '../data/demoApi'
import { createSupabaseApi } from '../data/supabaseApi'
import type { BreakType, Business, PayRate, Position, Profile, Settings } from '../../shared/types'

export interface AppData {
  api: Api
  me: Profile | null
  business: Business | null
  settings: Settings | null
  profiles: Profile[]
  positions: Position[]
  breakTypes: BreakType[]
  payRates: PayRate[]
  rates: Map<string, number>
  isAdmin: boolean
  canSeePay: boolean
  loading: boolean
  refresh: () => Promise<void>
}

const Ctx = createContext<AppData | null>(null)

export const useApp = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside provider')
  return v
}

/** Remember demo mode for the tab; storage can be unavailable (private mode, embeds). */
function demoFlag(set?: boolean) {
  try {
    if (set === true) sessionStorage.setItem('demo', '1')
    if (set === false) sessionStorage.removeItem('demo')
    return sessionStorage.getItem('demo') === '1'
  } catch {
    return set === true
  }
}

/** Demo mode: ?demo in the URL, a demo-only build, or no Supabase configured. */
async function resolveApi(): Promise<Api> {
  if (import.meta.env.VITE_DEMO_ONLY === '1') return createDemoApi()
  const params = new URLSearchParams(location.search)
  const demo = demoFlag(params.has('demo') ? true : params.has('live') ? false : undefined)
  if (demo || params.has('demo')) return createDemoApi()
  try {
    const res = await fetch('/api/config')
    const cfg = await res.json() as { supabaseUrl?: string; supabaseKey?: string }
    if (cfg.supabaseUrl && cfg.supabaseKey) return createSupabaseApi(cfg.supabaseUrl, cfg.supabaseKey)
  } catch {
    // fall through to demo
  }
  return createDemoApi()
}

type Shared = Omit<AppData, 'api' | 'refresh' | 'rates' | 'isAdmin' | 'canSeePay' | 'loading'>
const EMPTY: Shared = { me: null, business: null, settings: null, profiles: [], positions: [], breakTypes: [], payRates: [] }

export function AppProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<Api | null>(null)
  const client = useQueryClient()

  useEffect(() => { resolveApi().then(setApi) }, [])

  // Who is signed in plus the team's reference data, cached and refreshed with everything else.
  const shared = useQuery({
    queryKey: ['app-shared', api?.mode],
    enabled: !!api,
    queryFn: async (): Promise<Shared> => {
      const me = await api!.me().catch(() => null)
      if (!me || me.role === 'kiosk') return { ...EMPTY, me }
      const [business, settings, profiles, positions, breakTypes, payRates] = await Promise.all([
        api!.business(), api!.settings(), api!.profiles(), api!.positions(), api!.breakTypes(), api!.payRates(),
      ])
      return { me, business, settings, profiles, positions, breakTypes, payRates }
    },
  })

  // Signing in or out changes what everyone may see: drop the whole cache.
  useEffect(() => {
    if (!api) return
    return api.onAuthChange(() => { client.resetQueries() })
  }, [api, client])

  const refresh = useCallback(async () => { await client.invalidateQueries() }, [client])
  const state = shared.data ?? EMPTY

  const value = useMemo<AppData | null>(() => api && ({
    ...state,
    api,
    refresh,
    loading: shared.isPending,
    rates: currentRates(state.payRates),
    isAdmin: state.me?.role === 'admin',
    canSeePay: state.me?.role === 'admin' && !!state.me?.can_see_pay,
  }), [api, state, refresh, shared.isPending])

  if (!value) return null
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
