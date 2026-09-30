import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Api } from '../data/api'
import { currentRates } from '../data/api'
import { createDemoApi } from '../data/demoApi'
import { createSupabaseApi } from '../data/supabaseApi'
import type { BreakType, Business, PartnerArea, PayRate, Position, Profile, Settings } from '../../shared/types'
import { setCurrency, setNumberFormat } from '../../shared/time'
import { StartError } from '../pages/StatusPages'

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
  /** An outside business with read-only access to some areas. */
  isPartner: boolean
  partnerCan: (area: PartnerArea) => boolean
  /** Pay rates and labour costs: admins with pay access, or payroll partners (read-only). */
  canSeePay: boolean
  /** Monthly expenses: admins with pay access, or finance partners (read-only). */
  canSeeFinances: boolean
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

/** Sample data is only ever offered in the demo build and in local development (?demo). */
const DEMO_ALLOWED = import.meta.env.VITE_DEMO_ONLY === '1' || import.meta.env.DEV

/**
 * The real app always talks to Supabase and requires sign-in. It never falls back to sample
 * data: if the server can't be reached, the person sees an error and can retry.
 */
async function resolveApi(): Promise<Api> {
  if (import.meta.env.VITE_DEMO_ONLY === '1') return createDemoApi()
  if (DEMO_ALLOWED) {
    const params = new URLSearchParams(location.search)
    if (demoFlag(params.has('demo') ? true : params.has('live') ? false : undefined)) return createDemoApi()
  }
  const res = await fetch('/api/config')
  const cfg = await res.json().catch(() => ({})) as { supabaseUrl?: string; supabaseKey?: string }
  if (!res.ok || !cfg.supabaseUrl || !cfg.supabaseKey) throw new Error('The app is not configured')
  return createSupabaseApi(cfg.supabaseUrl, cfg.supabaseKey)
}

type Shared = Omit<AppData, 'api' | 'refresh' | 'rates' | 'isAdmin' | 'isPartner' | 'partnerCan' | 'canSeePay' | 'canSeeFinances' | 'loading'>
const EMPTY: Shared = { me: null, business: null, settings: null, profiles: [], positions: [], breakTypes: [], payRates: [] }

export function AppProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<Api | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const client = useQueryClient()

  useEffect(() => {
    resolveApi().then(setApi).catch(e => setStartError(e instanceof Error ? e.message : String(e)))
  }, [])

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

  // Signing in or out changes what everyone may see: drop the whole cache when the person signed in
  // is not the one the app has loaded (or nothing is loaded yet). Compared with what is loaded, not
  // with the previous event, so it doesn't matter which of Supabase's events arrives first; token
  // refreshes for the same person don't reload anything.
  const loaded = useRef<string | null | undefined>(undefined)
  loaded.current = shared.isSuccess ? shared.data.me?.id ?? null : undefined
  useEffect(() => {
    if (!api) return
    return api.onAuthChange(id => { if (id !== loaded.current) client.resetQueries() })
  }, [api, client])

  const refresh = useCallback(async () => { await client.invalidateQueries() }, [client])
  const state = shared.data ?? EMPTY

  const value = useMemo<AppData | null>(() => {
    if (!api) return null
    const me = state.me
    // Set before any page renders, so every amount on screen uses this person's decimal mark.
    setNumberFormat(me?.preferences?.numberFormat)
    setCurrency(state.business?.currency)
    const isPartner = me?.role === 'partner'
    const partnerCan = (area: PartnerArea) => !!(isPartner && me?.partner_access?.includes(area))
    const adminPay = me?.role === 'admin' && !!me?.can_see_pay
    return {
      ...state,
      api,
      refresh,
      loading: shared.isPending,
      rates: currentRates(state.payRates),
      isAdmin: me?.role === 'admin',
      isPartner,
      partnerCan,
      canSeePay: adminPay || partnerCan('payroll'),
      canSeeFinances: adminPay || partnerCan('finances'),
    }
  }, [api, state, refresh, shared.isPending])

  if (startError) return <StartError message={startError} />
  if (!value) return null
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
