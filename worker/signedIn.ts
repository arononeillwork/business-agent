// Who signed in to a request, asked of Supabase once and then kept for 30 seconds in this Worker instance.
// A page asks the Worker several things at once, and each route used to ask Supabase again who the person
// is, whether they're an admin, which business they're in: about 3,600 of Supabase's requests an hour,
// almost all of them the same questions, on a database with ten connections. The answers change rarely
// (someone's role or business); a change shows within 30 seconds, nothing is kept past the sign-in's own
// expiry, and only answers Supabase gave are kept, never its errors.
import type { UserResponse } from '@supabase/supabase-js'
import { userClient, type Env } from './supabase'

/** How long an answer is kept. */
export const KEEP_MS = 30_000
/** Answers kept at most (the oldest go first). */
const MAX_KEPT = 2000

/** The checks a route asks about whoever signed in (SQL functions in the database), and what each answers. */
interface Answers { is_admin: boolean; is_staff: boolean; can_see_pay: boolean; my_role: string; current_business_id: number }
export type SignInCheck = keyof Answers

const kept = new Map<string, { until: number; answer: Promise<{ error: unknown }> }>()
let now = () => Date.now()

/** Tests: nothing kept from another test, and a clock of their own if they like. */
export function forgetSignIns(clock?: () => number) {
  kept.clear()
  now = clock ?? (() => Date.now())
}

/** When the sign-in (a JWT) runs out, in ms since 1970; null when it can't be read. Never trusted for more. */
export function expiresAt(token: string): number | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown }
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null
  } catch {
    return null
  }
}

/** The answer kept for this key, or asked now (and kept unless Supabase answered with an error). */
function keep<T extends { error: unknown }>(key: string, token: string, ask: () => Promise<T>): Promise<T> {
  const t = now()
  const hit = kept.get(key)
  if (hit && hit.until > t) return hit.answer as Promise<T>
  const until = Math.min(t + KEEP_MS, expiresAt(token) ?? Infinity)
  const answer: Promise<T> = ask().then(
    r => { if (r.error && kept.get(key)?.answer === answer) kept.delete(key); return r },
    e => { if (kept.get(key)?.answer === answer) kept.delete(key); throw e },
  )
  kept.delete(key)
  if (until > t) {
    kept.set(key, { until, answer })
    if (kept.size > MAX_KEPT) kept.delete(kept.keys().next().value!)
  }
  return answer
}

/** Supabase's answer to who this sign-in is, as `userClient(env, token).auth.getUser(token)`. */
export function signedInUser(env: Env, token: string): Promise<UserResponse> {
  return keep(`user ${token}`, token, () => userClient(env, token, 'app').auth.getUser(token))
}

/** One of the checks about whoever signed in, as `userClient(env, token).rpc(check)`. */
export function signInCheck<K extends SignInCheck>(env: Env, token: string, check: K): Promise<{ data: Answers[K] | null; error: unknown }> {
  return keep(`${check} ${token}`, token, async () => {
    const { data, error } = await userClient(env, token, 'app').rpc(check)
    return { data: (data ?? null) as Answers[K] | null, error }
  })
}
