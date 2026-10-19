import { FEATURES } from '../app/features'
import type { Integration } from '../../shared/types'

/** The till the takings come from: Square (when switched on), SumUp or Stripe, whichever is connected. */
export const tillOf = (rows: Integration[] | undefined) => rows?.find(i =>
  (i.provider === 'stripe' || i.provider === 'sumup' || (FEATURES.square && i.provider === 'square')) && i.status === 'connected')

export const TILL_NAMES: Record<string, string> = { square: 'Square', sumup: 'SumUp', stripe: 'Stripe' }
