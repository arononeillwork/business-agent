// When the minute job does the work that reads outside services (Google Maps hours, Instagram mentions,
// Square customers and menu, Google reviews, the cameras' clips, the music starter pack), so that no two
// of them land in the same minute for a business, and businesses take their turns a minute or more apart.
//
// Why: each run of the minute job may make at most 50 outside requests (Cloudflare's limit for a
// Worker's invocation), the database's included. Past that every request fails, quietly, and whatever
// comes after in the run doesn't happen. With the hourly jobs on the quarter hours, where the Google hours
// sync and the Instagram check already were, one business's quarter-hour run used them all up: the
// Square menu (:15), Square customers (:00), reviews (:30) and the cameras' clean-up (:45) never ran, and
// nor did any other business's work in those minutes.
import type { SupabaseClient } from '@supabase/supabase-js'
import { due } from '../shared/refresh'
import { minutesFor } from './refresh'

/** The jobs the minute job runs now and then, each reading an outside service. */
export type Periodic = 'hours' | 'mentions' | 'customers' | 'menu' | 'reviews' | 'cameras' | 'music' | 'reps'

/**
 * Minutes into its round each job runs at, chosen so that at their usual times (every 15 minutes, hourly,
 * every 5 minutes) no two share a minute: the quarter hours are the Google hours sync's alone.
 */
export const OFFSETS: Record<Periodic, number> = { hours: 0, music: 2, customers: 3, mentions: 9, reps: 13, menu: 18, reviews: 36, cameras: 51 }

/** How often each runs (minutes): the business's choice for those it can choose, else fixed. */
export type Every = Record<Periodic, number>

/** A business's turn: its jobs shifted by up to 14 minutes, so businesses don't all go at once. */
export const shiftOf = (businessId: number) => Math.abs(Math.trunc(businessId)) % 15

/** The jobs due for a business on `minute` (minutes since 1970). */
export function dueJobs(minute: number, businessId: number, every: Every): Periodic[] {
  const shift = shiftOf(businessId)
  return (Object.keys(OFFSETS) as Periodic[]).filter(j => due(minute, every[j], OFFSETS[j] + shift))
}

/** How often each job runs for this business: its own choice within its plan for the ones it can choose. */
export async function everyFor(db: SupabaseClient): Promise<Every> {
  const [hours, mentions, customers, menu] = await Promise.all(
    (['hours', 'mentions', 'customers', 'menu'] as const).map(id => minutesFor(db, id)))
  // Reviews hourly (refreshReviews reads Places only every third hour); the cameras hourly; music every 5
  // minutes; customers' credit onto their Square gift cards every 15 (worker/squareReps.ts).
  return { hours, mentions, customers, menu, reviews: 60, cameras: 60, music: 5, reps: 15 }
}
