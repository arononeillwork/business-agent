// The Ads page: Meta Ads and Google Ads, each platform's figures kept an hour (provider_cache) and
// added up by the app. Admins with pay access only, as ad spend is money. Pausing, resuming and
// daily budgets change the campaign on the platform itself, straight away (and what's kept is forgotten).
import { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, requestDb, userClient, type Env } from './supabase'
import { explain, googleAdsSession, lasting, markBroken, metaAdsSession, setIntegration, type AdsExternal } from './connections'
import { cached, forget, oldest } from './cache'
import * as googleAds from './providers/googleAds'
import * as metaAds from './providers/metaAds'
import { AD_PLATFORMS, PLATFORM_NAMES, sumDays, type AdPlatform, type CampaignPatch, type PlatformReport } from '../shared/ads'
import { MINUTES } from '../shared/refresh'

export const ads = new Hono<{ Bindings: Env; Variables: { userId: string } }>()

ads.use('/api/ads/*', async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const sb = userClient(c.env, token, 'app')
  const [{ data: user }, { data: isAdmin }] = await Promise.all([sb.auth.getUser(token), sb.rpc('is_admin')])
  if (!user.user || !isAdmin) return c.json({ error: 'Only an admin can see the ads' }, 403)
  const { data: me } = await (await requestDb(c)).from('profiles').select('can_see_pay').eq('id', user.user.id).single()
  if (!me?.can_see_pay) return c.json({ error: 'Ad spend is for admins with pay access' }, 403)
  c.set('userId', user.user.id)
  await next()
})

const isPlatform = (p: string): p is AdPlatform => (AD_PLATFORMS as string[]).includes(p)
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** One platform's campaigns and days for the chosen ad account. */
async function platformReport(env: Env, db: SupabaseClient, p: AdPlatform, from: string, to: string, origin: string): Promise<PlatformReport> {
  if (p === 'meta_ads') {
    const s = await metaAdsSession(env, db)
    if (!s.account) throw new Error('Choose which Meta ad account to show on the Connections page')
    const r = await metaAds.report(s.graphVersion, s.token, s.account.id, from, to)
    return { platform: p, account: s.account, can_manage: s.external.can_manage !== false, totals: sumDays(r.days), ...r }
  }
  const s = await googleAdsSession(env, db, origin)
  if (!s.account) throw new Error('Choose which Google Ads account to show on the Connections page')
  const r = await googleAds.report(s.cfg, s.token, s.account, from, to)
  const { login: _login, ...account } = s.account
  return { platform: p, account, can_manage: true, totals: sumDays(r.days), ...r }
}

/** A failure in words an admin can act on; one that trying again won't fix turns the connection red. */
async function failed(db: SupabaseClient, p: AdPlatform, e: unknown) {
  const why = explain(p, e)
  if (lasting(p, e)) await markBroken(db, p, why)
  return why
}

// Both platforms' figures, from and to inclusive (YYYY-MM-DD). One that can't be read just now
// leaves the other showing (`failed` says why).
ads.get('/api/ads/report', async c => {
  const from = c.req.query('from') ?? '', to = c.req.query('to') ?? ''
  if (!DATE.test(from) || !DATE.test(to) || from > to) return c.json({ error: 'Give from and to dates (YYYY-MM-DD)' }, 400)
  const db = await requestDb(c)
  const { data: rows } = await db.from('integrations').select('provider, status').in('provider', AD_PLATFORMS)
  const on = AD_PLATFORMS.filter(p => rows?.some(r => r.provider === p && (r.status === 'connected' || r.status === 'error')))
  if (!on.length) return c.json({ error: 'Connect Meta Ads or Google Ads on the Connections page to see your ads' }, 400)
  const origin = new URL(c.req.url).origin
  const read = await Promise.all(on.map(p => cached(db, `ads:${p}:${from}:${to}`, MINUTES.ads, async () => {
    const report = await platformReport(c.env, db, p, from, to, origin)
    await setIntegration(db, p, { last_sync_at: new Date().toISOString() })
    return report
  }).then(({ data: report, fetched_at }) => ({ report, fetched_at }), async (e: unknown) => ({ platform: p, error: await failed(db, p, e) }))))
  const platforms = read.flatMap(x => ('report' in x ? [x.report] : []))
  const failures = read.flatMap(x => ('error' in x ? [{ platform: x.platform, error: x.error }] : []))
  if (!platforms.length) return c.json({ error: failures[0].error }, 400)
  return c.json({ from, to, platforms, ...(failures.length ? { failed: failures } : {}),
    fetched_at: oldest(read.flatMap(x => ('fetched_at' in x ? [x.fetched_at] : []))) })
})

// Pause or resume a campaign, or change its daily budget, on the platform.
ads.post('/api/ads/:platform/campaigns/:id', async c => {
  const p = c.req.param('platform'), id = c.req.param('id')
  if (!isPlatform(p)) return c.json({ error: 'Unknown ad platform' }, 404)
  if (!/^\d{1,30}$/.test(id)) return c.json({ error: 'Unknown campaign' }, 404)
  const patch = await c.req.json<CampaignPatch>().catch(() => ({} as CampaignPatch))
  if (patch.status !== undefined && patch.status !== 'active' && patch.status !== 'paused') return c.json({ error: 'A campaign can be active or paused' }, 400)
  if (patch.daily_budget !== undefined && !(typeof patch.daily_budget === 'number' && patch.daily_budget >= 1 && patch.daily_budget <= 10_000)) {
    return c.json({ error: 'A daily budget is between 1 and 10,000' }, 400)
  }
  if (patch.status === undefined && patch.daily_budget === undefined) return c.json({ error: 'Nothing to change' }, 400)
  const db = await requestDb(c)
  try {
    if (p === 'meta_ads') {
      const s = await metaAdsSession(c.env, db)
      if (s.external.can_manage === false) return c.json({ error: 'Meta Ads was connected to read only. Connect it again and allow managing ads to change campaigns here.' }, 403)
      await metaAds.updateCampaign(s.graphVersion, s.token, id, patch)
    } else {
      const s = await googleAdsSession(c.env, db, new URL(c.req.url).origin)
      if (!s.account) return c.json({ error: 'Choose which Google Ads account to use on the Connections page' }, 400)
      if (patch.status) await googleAds.setStatus(s.cfg, s.token, s.account, id, patch.status)
      if (patch.daily_budget !== undefined) await googleAds.setDailyBudget(s.cfg, s.token, s.account, id, patch.daily_budget)
    }
    await forget(db, `ads:${p}:`)
    return c.json({ ok: true })
  } catch (e) {
    return c.json({ error: await failed(db, p, e) }, 400)
  }
})

// Which ad account to show (when the sign-in has several): connected once that account's campaigns can be read.
ads.post('/api/ads/:platform/account', async c => {
  const p = c.req.param('platform')
  if (!isPlatform(p)) return c.json({ error: 'Unknown ad platform' }, 404)
  const { id } = await c.req.json<{ id?: string }>().catch(() => ({ id: undefined }))
  const db = await requestDb(c)
  const { data } = await db.from('integrations').select('status, external').eq('provider', p).single()
  const ext = (data?.external ?? {}) as AdsExternal
  if (!data || data.status === 'disconnected') return c.json({ error: `Connect ${PLATFORM_NAMES[p]} first` }, 400)
  const account = ext.accounts?.find(a => a.id === id)
  if (!account) return c.json({ error: 'That ad account isn’t one this sign-in can use' }, 400)
  await setIntegration(db, p, { external: { ...ext, account_id: account.id, account_name: account.name, currency: account.currency } })
  await forget(db, `ads:${p}:`)
  try {
    const day = new Date().toISOString().slice(0, 10)
    await platformReport(c.env, db, p, day, day, new URL(c.req.url).origin)
    const now = new Date().toISOString()
    await setIntegration(db, p, { status: 'connected', last_checked_at: now, last_error: null, account_label: account.name })
    return c.json({ ok: true })
  } catch (e) {
    const why = explain(p, e)
    await setIntegration(db, p, { last_error: why })
    return c.json({ error: why }, 400)
  }
})
