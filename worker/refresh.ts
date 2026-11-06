// How often this business reads each outside service: its own choice (Connections → How often things
// update, settings.refresh_minutes), kept to what its plan in force allows (shared/refresh.ts). Read once
// per request, or per business in a cron run, and shared by everything that asks during it.
import type { SupabaseClient } from '@supabase/supabase-js'
import { PLANS, type PlanId } from '../shared/plans'
import { refreshMinutes, type Choosable, type RefreshChoices } from '../shared/refresh'

interface Known { chosen: RefreshChoices; plan: PlanId }
const known = new WeakMap<SupabaseClient, Promise<Known>>()

async function read(db: SupabaseClient): Promise<Known> {
  const [settings, plan] = await Promise.all([
    Promise.resolve(db.from('settings').select('refresh_minutes').eq('id', 1).maybeSingle()).catch(() => ({ data: null })),
    Promise.resolve(db.rpc('current_plan')).catch(() => ({ data: null })),
  ])
  const id = plan.data as string | null
  // Not known (it couldn't be read): the usual times, or the slower ones chosen, as on Free.
  return { chosen: ((settings.data as { refresh_minutes?: RefreshChoices } | null)?.refresh_minutes ?? {}) as RefreshChoices,
    plan: PLANS.some(p => p.id === id) ? id as PlanId : 'free' }
}

/** Minutes between reads of a service for this business (its choice within its plan; the usual time otherwise). */
export async function minutesFor(db: SupabaseClient, id: Choosable): Promise<number> {
  let k = known.get(db)
  if (!k) { k = read(db); known.set(db, k) }
  return refreshMinutes((await k).chosen, (await k).plan, id)
}
