// What every tab of the admin area (/admin) shares: the session's token, going back to the PIN when it
// has ended, and its reads (each locked again the moment the Worker says so).
import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useEffect } from 'react'
import { AdminLocked } from '../../../shared/salesTeam'
import { referralLink } from '../../../shared/referrals'
import { t } from '../../i18n'

export interface AdminSessionCtx {
  token: string
  /** Back to the PIN, saying why (none: locked on purpose). */
  onLocked: (why: string | null) => void
}
export const AdminCtx = createContext<AdminSessionCtx | null>(null)
export function useAdmin(): AdminSessionCtx {
  const ctx = useContext(AdminCtx)
  if (!ctx) throw new Error('Inside the admin area only')
  return ctx
}

/** A read in the admin area: tried again unless locked; locked meanwhile (12 hours gone by, the PIN changed), back to the PIN. */
export function useAdminQuery<T>(name: string, read: (token: string) => Promise<T>, extra: unknown[] = []) {
  const { token, onLocked } = useAdmin()
  const query = useQuery({ queryKey: ['admin-area', name, token, ...extra], queryFn: () => read(token), retry: (n, e) => n < 2 && !(e instanceof AdminLocked) })
  useEffect(() => { if (query.error instanceof AdminLocked) onLocked(t('Locked: type the PIN to open it again')) }, [query.error, onLocked])
  return { data: query.data, loading: query.isLoading, error: query.error && !(query.error instanceof AdminLocked) ? (query.error as Error).message : null }
}

/** The address a rep's code signs a business up from. */
export const signUpLink = (code: string) => referralLink(location.origin, code)
