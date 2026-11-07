// An owner's own data and account (Billing → Your data, owners only: admins with pay access, as Billing).
// - Export: everything the business keeps, one CSV file per table in a zip, read with the business's own
//   client (businessDb) through public.export_part(), which leaves out the secrets and every other
//   business's rows (the close_account migration).
// - Closing: the account closes 30 days after an owner asks (shared/accountClosing.ts). The subscription
//   stops renewing at the end of the period already paid for (closingRenewal in worker/billing.ts), The
//   Business Agent hears about it (a notification to HQ's admins, and an email to support when Cloudflare
//   Email Sending is on), and an owner can keep the account until then. Deleting the data once it has
//   closed is HQ's, by hand, keeping the working-hours records the law requires (docs/SEVERAL_BUSINESSES.md).
import { Hono } from 'hono'
import { bearer, businessDb, type BusinessDb, type Env } from './supabase'
import { signInCheck, signedInUser } from './signedIn'
import { closingRenewal } from './billing'
import { SENDER } from './authEmail'
import { LEGAL } from '../shared/legal'
import { closesAt } from '../shared/accountClosing'
import { csvLine, exportFileName, exportReadme, zipFiles, type ZipEntry } from '../shared/dataExport'

type Vars = { userId: string; businessId: number }
export const account = new Hono<{ Bindings: Env; Variables: Vars }>()

/** Owners only: admins with pay access, the same people who see Billing. */
account.use('/api/account/*', async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const [{ data: user }, { data: isOwner }, { data: businessId }] = await Promise.all([
    signedInUser(c.env, token), signInCheck(c.env, token, 'can_see_pay'), signInCheck(c.env, token, 'current_business_id')])
  if (!user.user || !isOwner || !businessId) return c.json({ error: 'Only an owner can do that' }, 403)
  c.set('userId', user.user.id)
  c.set('businessId', businessId as number)
  await next()
})

/** Rows asked for at a time (the database gives at most 10,000): a few requests take everything. */
export const EXPORT_ROWS = 10_000

interface ExportPart { n: number; name: string; first_row: number; rows: Record<string, unknown>[] }

/** Everything the business keeps: a CSV file per table with anything in it, and a README saying what's left out. */
export async function exportBusiness(db: BusinessDb, now = new Date()): Promise<{ name: string; zip: Uint8Array }> {
  const { data: tables, error } = await db.rpc('export_tables')
  if (error) throw new Error(error.message)
  const columns = new Map(((tables ?? []) as { name: string; columns: string[] }[]).map(t => [t.name, t.columns]))
  // Each table's CSV lines, made as its rows come (the rows themselves aren't kept).
  const lines = new Map<string, string[]>()
  let business = ''
  for (let from = 1, offset = 0; ;) {
    const { data, error } = await db.rpc('export_part', { p_from: from, p_offset: offset, p_rows: EXPORT_ROWS })
    if (error) throw new Error(error.message)
    let got = 0
    for (const p of (data ?? []) as ExportPart[]) {
      const cols = columns.get(p.name) ?? Object.keys(p.rows[0] ?? {})
      if (!lines.has(p.name)) lines.set(p.name, [csvLine(cols)])
      const out = lines.get(p.name)!
      for (const r of p.rows) out.push(csvLine(cols.map(c => r[c])))
      if (p.name === 'business' && !business) business = String(p.rows[0]?.name ?? '')
      got += p.rows.length
      from = p.n
      offset = p.first_row + p.rows.length
    }
    if (got < EXPORT_ROWS) break
  }
  const enc = new TextEncoder()
  const files: ZipEntry[] = [{ name: 'README.txt', data: enc.encode(exportReadme(business || 'The business', now, [...lines].map(([name, l]) => ({ name, rows: l.length - 1 })))) }]
  for (const [name, l] of lines) files.push({ name: `${name}.csv`, data: enc.encode('﻿' + l.join('\r\n') + '\r\n') })
  return { name: exportFileName(business, now), zip: await zipFiles(files, now) }
}

account.get('/api/account/export', async c => {
  const { name, zip } = await exportBusiness(businessDb(c.env, c.get('businessId')))
  return new Response(zip, { headers: {
    'content-type': 'application/zip', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } })
})

/** The business's name and whether it's closing, and the name of someone on its team. */
async function about(db: BusinessDb, person: string) {
  const [{ data: b }, { data: p }] = await Promise.all([
    db.from('business').select('id, name, closing_requested_at').maybeSingle<{ id: number; name: string; closing_requested_at: string | null }>(),
    db.from('profiles').select('full_name, email').eq('id', person).maybeSingle<{ full_name: string | null; email: string | null }>(),
  ])
  return { business: b, who: p?.full_name || p?.email || 'An owner', email: p?.email ?? null }
}

/** The Business Agent's support inbox hears about it too, when Cloudflare Email Sending is on (HQ's admins get a notification either way). */
async function tellSupport(env: Env, subject: string, text: string, replyTo: string | null) {
  if (!env.EMAIL) return
  try {
    await env.EMAIL.send({ from: SENDER, to: LEGAL.supportEmail, subject, text, ...(replyTo ? { replyTo } : {}) })
  } catch (e) {
    console.warn(`The email to support about an account closing wasn't sent: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** An owner asks to close the account: it closes in 30 days. Asking again changes nothing. */
account.post('/api/account/close', async c => {
  const id = c.get('businessId'), by = c.get('userId')
  const db = businessDb(c.env, id)
  const before = await about(db, by)
  if (before.business?.closing_requested_at) return c.json({ closes_at: closesAt(before.business.closing_requested_at) })
  const { data: closes, error } = await db.rpc('request_account_closure', { p_by: by })
  if (error) return c.json({ error: error.message }, 400)
  try {
    await closingRenewal(c.env, id, true)
  } catch (e) {
    // Stripe didn't take it: the account isn't closing (rather than closing with the card still being charged).
    await db.rpc('keep_account', { p_by: by })
    return c.json({ error: `The subscription couldn’t be stopped, so nothing has changed. Try again in a minute. (${e instanceof Error ? e.message : String(e)})` }, 502)
  }
  const name = before.business?.name ?? `Business ${id}`
  const closesOn = new Date(String(closes)).toISOString().slice(0, 10)
  await tellSupport(c.env, `Account closing: ${name} (#${id})`,
    `${before.who} asked to close ${name} (#${id}) on The Business Agent. It closes on ${closesOn} unless an owner keeps it.\n\n` +
    `Its subscription stops renewing at the end of the period already paid for. Once it has closed, delete its data, ` +
    `keeping the working-hours records (registro de jornada) for four years: docs/SEVERAL_BUSINESSES.md, "Closing an account".`, before.email)
  return c.json({ closes_at: closes })
})

/** An owner keeps the account, within the 30 days: it won't close, and the subscription renews again. */
account.post('/api/account/keep', async c => {
  const id = c.get('businessId'), by = c.get('userId')
  const db = businessDb(c.env, id)
  const { error } = await db.rpc('keep_account', { p_by: by })
  if (error) return c.json({ error: error.message }, 400)
  // Kept either way; if Stripe doesn't answer now, the owner can renew from Stripe's page on Billing.
  const renewalFailed = await closingRenewal(c.env, id, false).then(() => false, e => {
    console.error('renewing again failed', id, e)
    return true
  })
  const now = await about(db, by)
  const name = now.business?.name ?? `Business ${id}`
  await tellSupport(c.env, `Account kept: ${name} (#${id})`, `${now.who} kept ${name} (#${id}) on The Business Agent: it won't close.`, now.email)
  return c.json({ ok: true, renewal_failed: renewalFailed })
})
