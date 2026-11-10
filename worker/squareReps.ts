// Customers who earn credit (Sales reps & rewards) have it on Square too, so the team finds them on the
// Square till with their balance there (the reps_on_square migration): a Square customer each (theirs
// when they're linked to one already, else one made for them, their Instagram as its nickname) with a
// digital gift card on file, holding their credit.
//
// The app's ledger stays the one record; the card follows it, one gift card activity per ledger line:
//   1. what was spent with the card at the till since the last look comes back as credit used;
//   2. every approved line not on the card yet goes onto it, oldest first: the first credit activates
//      the card, then credit earned goes on (a complimentary increase) and credit used in the app comes
//      off (a decrease). Each line's activity has the line's own key, so a retry never adds it twice.
// Every 15 minutes, a rep or two a time (the minute job may make only 50 outside requests).
import type { SupabaseClient } from '@supabase/supabase-js'
import { businessIdOf, type Env } from './supabase'
import { reportError } from './errors'
import { squareSession } from './connections'
import * as square from './providers/square'
import * as squareLoyalty from './providers/squareLoyalty'

/** Reps brought up to date in one run, and the most lines put on a card for each. */
const REPS_A_RUN = 2
const LINES_A_REP = 6
/** Till spends are looked for from a little before the last look, in case one was late to show. */
const LOOK_BACK_MS = 2 * 86_400_000

type Rep = {
  id: string; name: string; instagram: string | null; customer_id: string | null
  square_customer_id: string | null; square_gift_card_id: string | null; square_synced_at: string | null
}

/** The reps who have credit not on Square yet, or a card whose till spends are looked for; a few a run. */
export async function syncRepsToSquare(env: Env, db: SupabaseClient, now = new Date()): Promise<number> {
  const { data: row } = await db.from('integrations').select('status, external').eq('provider', 'square').maybeSingle()
  if (row?.status !== 'connected') return 0
  const [{ data: waiting }, { data: reps, error }] = await Promise.all([
    db.from('rep_rewards').select('rep_id').eq('status', 'approved').is('square_pushed_at', null).limit(1000),
    db.from('sales_reps').select('id, name, instagram, customer_id, square_customer_id, square_gift_card_id, square_synced_at')
      .eq('kind', 'customer').eq('approved', true).eq('active', true),
  ])
  if (error) throw new Error(error.message)
  const due = new Set((waiting ?? []).map(l => String(l.rep_id)))
  const todo = ((reps ?? []) as Rep[]).filter(r => due.has(r.id) || r.square_gift_card_id)
    .sort((a, b) => Number(due.has(b.id)) - Number(due.has(a.id)) || (a.square_synced_at ?? '').localeCompare(b.square_synced_at ?? ''))
    .slice(0, REPS_A_RUN)
  if (!todo.length) return 0
  const s = await squareSession(env, db)
  const locations = ((row.external ?? {}) as { locations?: { id: string; currency?: string }[] }).locations ?? []
  const location = locations.find(l => s.locationIds.includes(l.id)) ?? locations[0]
  if (!location) throw new Error('Square has no location to put gift cards at')
  let n = 0
  for (const rep of todo) {
    try {
      await syncRep(db, s, rep, location.id, location.currency ?? 'EUR', now)
      await db.from('sales_reps').update({ square_synced_at: now.toISOString(), square_error: null }).eq('id', rep.id)
      n++
    } catch (e) {
      const why = e instanceof square.SquareError && e.code === 'INSUFFICIENT_SCOPES'
        ? 'Connect Square again (Connections) to let the app add customers and their gift cards.'
        : (e instanceof Error ? e.message : String(e)).slice(0, 500)
      await db.from('sales_reps').update({ square_synced_at: now.toISOString(), square_error: why }).eq('id', rep.id)
      await reportError(env, 'square: a rep’s credit', e, { business: businessIdOf(db) })
    }
  }
  return n
}

type Session = { token: string; sandbox: boolean }

async function syncRep(db: SupabaseClient, s: Session, rep: Rep, locationId: string, currency: string, now: Date) {
  // 1. Spent at the till since the last look: credit used (each once, by Square's id for it).
  if (rep.square_gift_card_id) {
    const since = new Date(Date.parse(rep.square_synced_at ?? now.toISOString()) - LOOK_BACK_MS).toISOString()
    const found = (await squareLoyalty.cardRedemptions(s.sandbox, s.token, rep.square_gift_card_id, since)).filter(a => a.amount > 0)
    const { data: had } = found.length
      ? await db.from('rep_rewards').select('square_activity_id').in('square_activity_id', found.map(a => a.id))
      : { data: [] }
    const known = new Set((had ?? []).map(r => String(r.square_activity_id)))
    const spent = found.filter(a => !known.has(a.id))
    if (spent.length) {
      const { error } = await db.from('rep_rewards').upsert(spent.map(a => ({
        rep_id: rep.id, kind: 'redeem', label: 'Used at the till', amount: -a.amount, status: 'approved', note: 'With their gift card on Square',
        occurred_on: a.at.slice(0, 10), source: `square:${a.id}`, square_activity_id: a.id, square_pushed_at: a.at, decided_at: a.at,
      })), { onConflict: 'business_id,square_activity_id', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
    }
  }

  // 2. Their customer on Square: the one they're linked to, else one made for them.
  let customerId = rep.square_customer_id
  if (!customerId && rep.customer_id) {
    const { data: c } = await db.from('customers').select('square_id').eq('id', rep.customer_id).maybeSingle()
    customerId = (c?.square_id as string | null) ?? null
  }
  if (!customerId) {
    customerId = await square.createCustomer(s.sandbox, s.token, {
      key: `rep-customer:${rep.id}`, reference_id: `rep:${rep.id}`,
      given_name: rep.name.replace(/^@+/, '').trim() || rep.name, nickname: rep.instagram ? `@${rep.instagram}` : null,
      note: rep.instagram ? `Posts about the café on Instagram (@${rep.instagram}). Their credit: pay with "Gift card on file".` : 'Their credit: pay with "Gift card on file".',
    })
  }
  if (customerId !== rep.square_customer_id) {
    await db.from('sales_reps').update({ square_customer_id: customerId }).eq('id', rep.id)
    rep.square_customer_id = customerId
  }

  // 3. Every line not on the card yet, oldest first.
  const { data: lines, error } = await db.from('rep_rewards').select('id, amount').eq('rep_id', rep.id).eq('status', 'approved')
    .is('square_pushed_at', null).order('created_at').limit(LINES_A_REP)
  if (error) throw new Error(error.message)
  if (!lines?.length) return
  let cardId = rep.square_gift_card_id
  let active = false
  if (cardId) {
    const card = await squareLoyalty.giftCard(s.sandbox, s.token, cardId)
    active = card.state === 'ACTIVE'
    if (!card.customer_ids.includes(customerId) && active) await squareLoyalty.linkGiftCard(s.sandbox, s.token, cardId, customerId)
  }
  for (const line of lines as { id: string; amount: number | string }[]) {
    const amount = Math.round(Number(line.amount) * 100) / 100
    // A card starts with credit: nothing to take off one that has none yet.
    if (Math.abs(amount) >= 0.01 && (active || amount > 0)) {
      if (!cardId) {
        cardId = await squareLoyalty.newGiftCard(s.sandbox, s.token, { locationId, key: `rep-card:${rep.id}` })
        await db.from('sales_reps').update({ square_gift_card_id: cardId }).eq('id', rep.id)
        rep.square_gift_card_id = cardId
      }
      await squareLoyalty.creditGiftCard(s.sandbox, s.token, { cardId, locationId, amount, currency, key: `rep-line:${line.id}`, activate: !active })
      if (!active) {
        await squareLoyalty.linkGiftCard(s.sandbox, s.token, cardId, customerId)
        active = true
      }
    }
    const { error: e2 } = await db.from('rep_rewards').update({ square_pushed_at: now.toISOString() }).eq('id', line.id)
    if (e2) throw new Error(e2.message)
  }
}
