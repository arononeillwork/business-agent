import { FEATURES } from '../app/features'
import type { Integration, SalesProvider } from '../../shared/types'

/**
 * Where the takings come from: the till (Square when switched on, or SumUp; one at a time) and
 * Stripe (online payments, on top of either), whichever are connected, the till first.
 */
export const tillsOf = (rows: Integration[] | undefined): SalesProvider[] => (['square', 'sumup', 'stripe'] as const)
  .filter(p => (p !== 'square' || FEATURES.square) && rows?.some(i => i.provider === p && i.status === 'connected'))

export const TILL_NAMES: Record<string, string> = { square: 'Square', sumup: 'SumUp', stripe: 'Stripe' }

/** "Square", or "Square + Stripe" when both are added up. */
export const tillNames = (ps: SalesProvider[]) => ps.map(p => TILL_NAMES[p]).join(' + ')
