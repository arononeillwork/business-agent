import { useQuery } from '@tanstack/react-query'
import type { IntegrationProvider } from '../../shared/types'
import { useApp } from './AppContext'

/**
 * Is this app connected right now? For menu items that only make sense with it (Loyalty & gift
 * cards needs Square). Shares the 'integrations' cache with Connections and the Messages badge, so
 * it costs no extra read; null while it's still loading. Admins only (staff never see those pages).
 */
export function useConnected(provider: IntegrationProvider): boolean | null {
  const { api, isAdmin, isPartner } = useApp()
  const admin = isAdmin && !isPartner
  const integ = useQuery({ queryKey: ['integrations'], queryFn: () => api.integrations(), enabled: admin })
  if (!admin) return false
  if (!integ.data) return null
  return integ.data.integrations.some(i => i.provider === provider && i.status === 'connected')
}
