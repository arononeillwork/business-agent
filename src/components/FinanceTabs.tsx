import { Tab, Tabs } from '@mui/material'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { FEATURES } from '../app/features'
import { t } from '../i18n'
import type { Integration } from '../../shared/types'

/** The till the takings come from: Square (when switched on), SumUp or Stripe, whichever is connected. */
export const tillOf = (rows: Integration[] | undefined) => rows?.find(i =>
  (i.provider === 'stripe' || i.provider === 'sumup' || (FEATURES.square && i.provider === 'square')) && i.status === 'connected')

export const TILL_NAMES: Record<string, string> = { square: 'Square', sumup: 'SumUp', stripe: 'Stripe' }

/** Finances and its Sales page, side by side at the top of both (Sales only for those who can see pay). */
export function FinanceTabs() {
  const { canSeePay, isPartner } = useApp()
  const { pathname } = useLocation()
  if (!canSeePay || isPartner) return null
  const value = pathname.startsWith('/finances/sales') ? 'sales' : 'costs'
  return (
    <Tabs value={value} aria-label={t('Finances pages')} sx={{ mt: -1.5, mb: 2.5, minHeight: 40, '& .MuiTab-root': { minHeight: 40, px: 1.5 } }}>
      <Tab value="costs" label={t('Costs')} component={RouterLink} to="/finances" />
      <Tab value="sales" label={t('Sales')} component={RouterLink} to="/finances/sales" />
    </Tabs>
  )
}
