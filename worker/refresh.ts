// How often this business reads each outside service: its own choice (Connections → How often things
// update, settings.refresh_minutes), kept to what its plan in force allows (shared/refresh.ts). Read once
// per request, or per business in a cron run, and shared by everything that asks during it.
// The minute job makes at most 50 outside requests a run (worker/schedule.ts), so this costs one: the
// plan is only asked for when the business has chosen a time (the usual times are the same on every
// plan), and where its menu comes from rides along (menuFromSquare(), for the price push).
import type { SupabaseClient } from '@supabase/supabase-js'
import { PLANS, type PlanId } from '../shared/plans'
import { refreshMinutes, type Choosable, type RefreshChoices } from '../shared/refresh'

interface Known { chosen: RefreshChoices; plan: PlanId; menuFromSquare: boolean }
const known = new WeakMap<SupabaseClient, Promise<Known>>()

async function read(db: SupabaseClient): Promise<Known> {
  const { data } = await Promise.resolve(db.from('settings').select('refresh_minutes, menu_source').eq('id', 1).maybeSingle())
    .catch(() => ({ data: null }))
  const row = data as { refresh_minutes?: RefreshChoices | null; menu_source?: string | null } | null
  const chosen = (row?.refresh_minutes ?? {}) as RefreshChoices
  let plan: PlanId = 'free'
  if (Object.keys(chosen).length) {
    const { data: id } = await Promise.resolve(db.rpc('current_plan')).catch(() => ({ data: null }))
    // Not known (it couldn't be read): the usual times, or the slower ones chosen, as on Free.
    if (PLANS.some(p => p.id === id)) plan = id as PlanId
  }
  return { chosen, plan, menuFromSquare: row?.menu_source === 'square' }
}

const known$ = (db: SupabaseClient) => {
  let k = known.get(db)
  if (!k) { k = read(db); known.set(db, k) }
  return k
}

/** Minutes between reads of a service for this business (its choice within its plan; the usual time otherwise). */
export async function minutesFor(db: SupabaseClient, id: Choosable): Promise<number> {
  const k = await known$(db)
  return refreshMinutes(k.chosen, k.plan, id)
}

/** Whether this business's menu comes from Square (so menu prices changed here go back to it). */
export const menuFromSquare = async (db: SupabaseClient) => (await known$(db)).menuFromSquare
