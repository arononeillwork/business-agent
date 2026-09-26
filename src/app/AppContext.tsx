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

export function AppProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<Api | null>(null)
  const [state, setState] = useState<Omit<AppData, 'api' | 'refresh' | 'rates' | 'isAdmin' | 'canSeePay'>>({
    me: null, business: null, settings: null, profiles: [], positions: [], breakTypes: [], payRates: [], loading: true,
  })

  useEffect(() => { resolveApi().then(setApi) }, [])

  const refresh = useCallback(async () => {
    if (!api) return
    const me = await api.me().catch(() => null)
    if (!me || me.role === 'kiosk') {
      setState(s => ({ ...s, me, loading: false }))
      return
    }
    const [business, settings, profiles, positions, breakTypes, payRates] = await Promise.all([
      api.business(), api.settings(), api.profiles(), api.positions(), api.breakTypes(), api.payRates(),
    ])
    setState({ me, business, settings, profiles, positions, breakTypes, payRates, loading: false })
  }, [api])

  useEffect(() => {
    if (!api) return
    refresh()
    return api.onAuthChange(() => { refresh() })
  }, [api, refresh])

  const value = useMemo<AppData | null>(() => api && ({
    ...state,
    api,
    refresh,
    rates: currentRates(state.payRates),
    isAdmin: state.me?.role === 'admin',
    canSeePay: state.me?.role === 'admin' && !!state.me?.can_see_pay,
  }), [api, state, refresh])

  if (!value) return null
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
