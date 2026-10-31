import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Api } from '../data/api'
import { currentRates } from '../data/api'
import { createDemoApi } from '../data/demoApi'
import { createSupabaseApi } from '../data/supabaseApi'
import type { BreakType, Business, PartnerArea, PayRate, Position, Profile, Settings } from '../../shared/types'
import { setCurrency, setNumberFormat, setOwnTimeZone } from '../../shared/time'
import { permissionsOf, type JobRole, type RoleArea, type RoleLevel } from '../../shared/roles'
import { withoutTestAccounts } from '../../shared/people'
import { LoadError, StartError } from '../pages/StatusPages'
import { refreshAll } from './query'

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
  /** The business's roles (Roles & responsibilities), and what this person's give them in each area. */
  jobRoles: JobRole[]
  permissions: Record<RoleArea, RoleLevel>
  /** Whether their roles (or being an admin) let them read or update an area: `can('rota', 'update')`. */
  can: (area: RoleArea, level?: Exclude<RoleLevel, 'none'>) => boolean
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

type Shared = Omit<AppData, 'api' | 'refresh' | 'rates' | 'isAdmin' | 'isPartner' | 'partnerCan' | 'canSeePay' | 'canSeeFinances' | 'permissions' | 'can' | 'loading'>
const EMPTY: Shared = { me: null, business: null, settings: null, profiles: [], positions: [], breakTypes: [], payRates: [], jobRoles: [] }

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
      // Someone not on the team yet (a new Google sign-in nobody added) or switched off can read
      // only their own profile: the business is hidden from them, so there is nothing more to load.
      if (!me || me.role === 'kiosk' || !me.active) return { ...EMPTY, me }
      const [business, settings, profiles, positions, breakTypes, payRates, jobRoles] = await Promise.all([
        api!.business(), api!.settings(), api!.profiles(), api!.positions(), api!.breakTypes(), api!.payRates(),
        me.role === 'partner' ? [] : api!.jobRoles().catch(() => []),
      ])
      // The live tests' accounts (left behind when a run stops part way) aren't part of the team anyone sees.
      return { me, business, settings, profiles: withoutTestAccounts(profiles, me), positions, breakTypes, payRates, jobRoles }
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

  const refresh = useCallback(() => refreshAll(client), [client])
  const state = shared.data ?? EMPTY

  const value = useMemo<AppData | null>(() => {
    if (!api) return null
    const me = state.me
    // Set before any page renders, so every amount on screen uses this person's decimal mark.
    setNumberFormat(me?.preferences?.numberFormat)
    setCurrency(state.business?.currency)
    setOwnTimeZone(me?.preferences?.timeZone, state.business?.timezone)
    const isPartner = me?.role === 'partner'
    const partnerCan = (area: PartnerArea) => !!(isPartner && me?.partner_access?.includes(area))
    const adminPay = me?.role === 'admin' && !!me?.can_see_pay
    const permissions = permissionsOf(me, state.jobRoles)
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
      permissions,
      can: (area, level = 'read') => (level === 'update' ? permissions[area] === 'update' : permissions[area] !== 'none'),
    }
  }, [api, state, refresh, shared.isPending])

  if (startError) return <StartError message={startError} />
  if (!value) return null
  // Signed in, but the café's details didn't load (after the retries): say so and offer to try
  // again, rather than showing the sign-in page as if signed out. A later background refresh that
  // fails keeps what's on screen.
  if (shared.isLoadingError) return <Ctx.Provider value={value}><LoadError message={String(shared.error?.message ?? shared.error)} retry={() => void shared.refetch()} /></Ctx.Provider>
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
