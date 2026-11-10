// Posts about the café on Instagram, end to end through the Worker against stand-ins for Supabase and
// Instagram. What must never break:
//   - a customer's collab reel (on the café's grid, listed by Instagram on its own) is kept, with its figures
//   - whoever posts about the café is put on Sales reps & rewards, waiting for an owner's OK, once:
//     an owner's no stands when they post again
//   - a story from a small account isn't put forward; one from 1,000 followers or more is
//   - a post Instagram doesn't list can be added by its link (admins), and taken off again
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { checkMentions, putForward, readPostWindow } from './mentions'
import { businessDb, type Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', INSTAGRAM_APP_ID: 'ig-app', INSTAGRAM_APP_SECRET: 'ig-secret', META_APP_ID: 'meta-app', META_APP_SECRET: 'meta-secret',
} as unknown as Env

let db: FakeSupabase
let apis: FakeProviders
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext
const as = (who: 'admin' | 'staff') => ({ authorization: `Bearer ${who}-token`, 'content-type': 'application/json' })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T10:00:00Z'))
  db = new FakeSupabase()
  apis = new FakeProviders()
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

async function connectFacebook() {
  const start = await integrations.request(`${APP}/api/integrations/facebook/start`, { method: 'POST', headers: as('admin'), body: '{}' }, env, ctx())
  const url = new URL((await start.json() as { url: string }).url)
  const res = await integrations.request(`${APP}/api/integrations/facebook/callback?code=c&state=${encodeURIComponent(url.searchParams.get('state')!)}`, {}, env, ctx())
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe('facebook')
  return url
}

async function connectInstagram() {
  const start = await integrations.request(`${APP}/api/integrations/instagram/start`, { method: 'POST', headers: as('admin'), body: '{}' }, env, ctx())
  const state = new URL((await start.json() as { url: string }).url).searchParams.get('state')!
  const res = await integrations.request(`${APP}/api/integrations/instagram/callback?code=c&state=${encodeURIComponent(state)}`, {}, env, ctx())
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe('instagram')
}

const reel = (id: string, username: string, code: string, timestamp: string, more: Row = {}) => ({
  id, username, caption: 'Best ube latte in San Pedro', media_type: 'VIDEO', media_product_type: 'REELS',
  permalink: `https://www.instagram.com/reel/${code}/`, timestamp, thumbnail_url: `https://cdn.instagram.test/${id}.jpg`,
  total_like_count: 1180, total_comments_count: 64, total_views_count: 14200, ...more,
})
const mentions = () => db.tables.instagram_mentions ?? []
const reps = () => db.tables.sales_reps ?? []
const check = () => checkMentions(env, businessDb(env, 1))

describe('Posts about the café', () => {
  it('keeps a customer’s collab reel with its figures, and puts them forward as a rep waiting for an OK', async () => {
    await connectInstagram()
    // Months old: still kept (it's on the café's own grid), but not told about.
    apis.instagram.collabs = [reel('c1', 'nora.eats.mbl', 'DfNora0001', '2026-10-17T18:30:00+0000'), reel('c0', 'tomas.runs', 'DfTomas001', '2026-07-02T08:00:00+0000')]
    const added = await check()
    const nora = mentions().find(m => m.id === 'collab:DfNora0001')
    expect(nora).toMatchObject({ kind: 'collab', username: 'nora.eats.mbl', video: true, likes: 1180, comments: 64, views: 14200,
      permalink: 'https://www.instagram.com/reel/DfNora0001/', media_url: 'https://cdn.instagram.test/c1.jpg' })
    expect(mentions().find(m => m.id === 'collab:DfTomas001')).toBeTruthy()
    // Told about: the tag and the story from the inbox, and Nora's reel (this week's); not Tomás's from July.
    const told = (db.tables.notifications ?? []).filter(n => n.kind === 'instagram_mention').map(n => n.title)
    expect(told).toContain('@nora.eats.mbl posted a reel with you')
    expect(told.some(t => String(t).startsWith('@tomas.runs'))).toBe(false)
    expect(added).toBe(3)
    // What the look found is noted at its end, so a look that didn't finish shows.
    expect(db.tables.provider_cache.find(c => c.key === 'instagram:mentions-check')!.data).toEqual({ tagged: 1, collabs: 2, via: 'instagram', chats: 1, new: 3 })

    // Everyone who posted a post or reel is waiting for an owner's OK; Lucía's story (followers unknown) isn't put forward.
    expect(reps().map(r => r.instagram).sort()).toEqual(['nora.eats.mbl', 'sanpedro.eats', 'tomas.runs'])
    expect(reps().find(r => r.instagram === 'nora.eats.mbl')).toMatchObject({ name: '@nora.eats.mbl', kind: 'customer', approved: false, found_mention_id: 'collab:DfNora0001' })
    expect(mentions().every(m => m.rep_checked_at)).toBe(true)

    // The next look: the figures move on, nobody is put forward twice.
    apis.instagram.collabs = [reel('c1', 'nora.eats.mbl', 'DfNora0001', '2026-10-17T18:30:00+0000', { total_like_count: 1400 })]
    expect(await check()).toBe(0)
    expect(mentions().find(m => m.id === 'collab:DfNora0001')!.likes).toBe(1400)
    expect(reps()).toHaveLength(3)
  })

  it('an owner’s no stands: their next reel doesn’t put them forward again', async () => {
    await connectInstagram()
    apis.instagram.collabs = [reel('c1', 'nora.eats.mbl', 'DfNora0001', '2026-10-17T18:30:00+0000')]
    await check()
    db.tables.sales_reps = reps().filter(r => r.instagram !== 'nora.eats.mbl') // decide_rep(…, false) deletes them
    apis.instagram.collabs = [reel('c2', 'nora.eats.mbl', 'DfNora0002', '2026-10-19T18:30:00+0000'), ...apis.instagram.collabs]
    await check()
    expect(reps().some(r => r.instagram === 'nora.eats.mbl')).toBe(false)
    expect(mentions().find(m => m.id === 'collab:DfNora0002')!.rep_checked_at).toBeTruthy()
  })

  it('a story mention puts someone forward only from 1,000 followers; never the café itself', async () => {
    db.tables.instagram_mentions = [
      { id: 'story:s1', kind: 'story', username: 'small.account', mentioned_at: '2026-10-19T09:00:00Z', followers: 300, rep_checked_at: null, put_forward: false },
      { id: 'story:s2', kind: 'story', username: 'marbella.brunchclub', mentioned_at: '2026-10-19T10:00:00Z', followers: 23_400, rep_checked_at: null, put_forward: false },
      { id: 'post:p1', kind: 'post', username: 'easy.beans.coffee', mentioned_at: '2026-10-19T11:00:00Z', followers: null, rep_checked_at: null, put_forward: false },
    ]
    expect(await putForward(businessDb(env, 1), 'easy.beans.coffee')).toBe(1)
    expect(reps()).toEqual([expect.objectContaining({ instagram: 'marbella.brunchclub', instagram_followers: 23_400, approved: false, found_mention_id: 'story:s2' })])
    // A small account's story was looked at, but doesn't count as put forward: their reel later still does.
    expect(mentions().find(m => m.id === 'story:s1')).toMatchObject({ put_forward: false })
    expect(mentions().find(m => m.id === 'story:s2')).toMatchObject({ put_forward: true })
    expect(mentions().every(m => m.rep_checked_at)).toBe(true)
  })

  it('Instagram not listing collabs for the account leaves the rest working, and the connection says so', async () => {
    await connectInstagram()
    apis.instagram.noCollabs = true
    expect(await check()).toBe(2) // the tag and the story
    expect(mentions().some(m => m.kind === 'collab')).toBe(false)
    expect(db.integration('instagram').external).toMatchObject({ can_list_collabs: false })
    // Once it has said no, it isn't asked again (each look has 50 requests)…
    apis.instagram.noCollabs = false
    apis.instagram.collabs = [reel('c1', 'nora.eats.mbl', 'DfNora0001', '2026-10-17T18:30:00+0000')]
    await check()
    expect(mentions().some(m => m.kind === 'collab')).toBe(false)
    expect(db.integration('instagram').external).toMatchObject({ can_list_collabs: false })
    // …until Instagram is connected again.
    await connectInstagram()
    await check()
    expect(mentions().some(m => m.id === 'collab:DfNora0001')).toBe(true)
    expect(db.integration('instagram').external).toMatchObject({ can_list_collabs: true })
  })

  it('collab reels Instagram Login won’t list come through the Facebook Page (instagram_basic), by themselves', async () => {
    await connectInstagram()
    apis.instagram.noCollabs = true
    apis.facebook.granted = [...apis.facebook.granted, 'instagram_basic']
    apis.facebook.collabs = [reel('c1', 'nora.eats.mbl', 'DfNora0001', '2026-10-17T18:30:00+0000')]
    // Connecting Facebook asks for instagram_basic, and notes it was allowed.
    const asked = await connectFacebook()
    expect(asked.searchParams.get('scope')!.split(',')).toContain('instagram_basic')
    expect(db.integration('facebook').external).toMatchObject({ instagram: true })

    expect(await check()).toBe(3) // the tag, the story and Nora's reel
    expect(mentions().find(m => m.id === 'collab:DfNora0001')).toMatchObject({ kind: 'collab', username: 'nora.eats.mbl', likes: 1180 })
    expect(reps().find(r => r.instagram === 'nora.eats.mbl')).toMatchObject({ approved: false, found_mention_id: 'collab:DfNora0001' })
    expect(db.integration('instagram').external).toMatchObject({ can_list_collabs: false, collabs_via: 'facebook' })
    expect(db.integration('facebook').external).toMatchObject({ instagram_id: '17841400000000001' })

    // The next look goes straight to the Page, and asks which Instagram is linked to it only the once.
    apis.facebook.collabs.push(reel('c2', 'tomas.runs', 'DfTomas001', '2026-10-19T08:00:00+0000'))
    await check()
    expect(mentions().some(m => m.id === 'collab:DfTomas001')).toBe(true)
    expect(apis.facebook.instagramLookups).toBe(1)
  })

  it('without instagram_basic, or with no Instagram linked to the Page, collabs are noted as not coming in', async () => {
    await connectInstagram()
    apis.instagram.noCollabs = true
    await connectFacebook() // instagram_basic not allowed
    await check()
    expect(db.integration('instagram').external).toMatchObject({ can_list_collabs: false, collabs_via: null })
    apis.facebook.granted = [...apis.facebook.granted, 'instagram_basic']
    apis.facebook.instagram = null
    await connectFacebook()
    await check()
    await check()
    expect(db.integration('facebook').external).toMatchObject({ instagram: true, instagram_id: null })
    expect(apis.facebook.instagramLookups).toBe(1)
    expect(db.integration('instagram').external).toMatchObject({ collabs_via: null })
  })

  it('the Page names its Instagram either way, or not at all: then the café’s own account (Instagram Login’s) is read through it', async () => {
    await connectInstagram()
    apis.instagram.noCollabs = true
    apis.facebook.granted = [...apis.facebook.granted, 'instagram_basic']
    apis.facebook.collabs = [reel('c1', 'nora.eats.mbl', 'DfNora0001', '2026-10-17T18:30:00+0000')]
    // Linked from Instagram's side: the Page's connected account.
    apis.facebook.namedAs = 'connected'
    await connectFacebook()
    await check()
    expect(mentions().some(m => m.id === 'collab:DfNora0001')).toBe(true)
    expect(db.integration('facebook').external).toMatchObject({ instagram_id: '17841400000000001' })
    // Not named at all: the café's own Instagram, by Instagram Login's id.
    apis.facebook.namedAs = 'none'
    apis.facebook.collabs.push(reel('c2', 'tomas.runs', 'DfTomas001', '2026-10-19T08:00:00+0000'))
    await connectFacebook()
    await check()
    expect(mentions().some(m => m.id === 'collab:DfTomas001')).toBe(true)
    expect(db.integration('facebook').external).toMatchObject({ instagram_id: '17841400000000001' })
    expect(db.integration('instagram').external).toMatchObject({ collabs_via: 'facebook' })
  })

  it('no Instagram the Page can read: asked again some hours later (the owner may link them meanwhile), and HQ hears why', async () => {
    await connectInstagram()
    apis.instagram.noCollabs = true
    apis.facebook.granted = [...apis.facebook.granted, 'instagram_basic']
    apis.facebook.instagram = null
    await connectFacebook()
    await check()
    await check()
    expect(apis.facebook.instagramLookups).toBe(1)
    expect(db.tables.app_errors?.some(e => /collabs through Facebook/.test(String(e.source)))).toBe(true)
    // Linked now; seven hours on, the Page is asked again.
    apis.facebook.instagram = { id: '17841400000000001', username: 'easy.beans.coffee' }
    apis.facebook.collabs = [reel('c1', 'nora.eats.mbl', 'DfNora0001', '2026-10-17T18:30:00+0000')]
    const fb = db.integration('facebook')
    fb.external = { ...(fb.external as object), instagram_asked_at: new Date(Date.now() - 7 * 3_600_000).toISOString() }
    await check()
    expect(apis.facebook.instagramLookups).toBe(2)
    expect(mentions().some(m => m.id === 'collab:DfNora0001')).toBe(true)
  })

  it('FACEBOOK_COLLABS=off: connecting Facebook doesn’t ask for instagram_basic', async () => {
    const start = await integrations.request(`${APP}/api/integrations/facebook/start`, { method: 'POST', headers: as('admin'), body: '{}' },
      { ...env, FACEBOOK_COLLABS: 'off' } as Env, ctx())
    expect(new URL((await start.json() as { url: string }).url).searchParams.get('scope')).not.toContain('instagram_basic')
  })

  it('looks up only the people who matter in the chats (a story mention, a rep): a scheduled run has 50 requests', async () => {
    await connectInstagram()
    // Twenty more chats with no story mention, from people who aren't reps.
    for (let i = 0; i < 20; i++) {
      apis.instagram.chats.push({ id: `conv-x${i}`, updated_time: '2026-10-18T08:00:00+0000',
        participants: { data: [{ id: '17841400000000001', username: 'easy.beans.coffee' }, { id: `igsid-x${i}`, username: `customer${i}` }] },
        messages: { data: [{ id: `mx${i}`, created_time: '2026-10-18T08:00:00+0000', from: { id: `igsid-x${i}`, username: `customer${i}` }, message: 'Open today?' }] } })
    }
    db.tables.sales_reps = [{ id: 'rep-1', name: 'Customer 3', instagram: 'customer3', instagram_followers: 10 }]
    await check()
    expect(apis.instagram.profileLookups).toBe(2) // Lucía (her story) and customer3 (a rep)
  })

  it('chats that can’t be read don’t stop collabs and tags being kept', async () => {
    await connectInstagram()
    apis.instagram.noMessages = true
    apis.instagram.collabs = [reel('c1', 'nora.eats.mbl', 'DfNora0001', '2026-10-17T18:30:00+0000')]
    expect(await check()).toBe(2) // the tag and the collab
    expect(mentions().map(m => m.id).sort()).toEqual(['collab:DfNora0001', 'post:tag-1'])
    expect(reps().map(r => r.instagram).sort()).toEqual(['nora.eats.mbl', 'sanpedro.eats'])
  })

  it('an admin adds a post Instagram doesn’t list by its link, and can take it off again', async () => {
    await connectInstagram()
    const add = (body: Row, who: 'admin' | 'staff' = 'admin') =>
      integrations.request(`${APP}/api/integrations/instagram/mentions`, { method: 'POST', headers: as(who), body: JSON.stringify(body) }, env, ctx())
    expect((await add({ link: 'https://www.instagram.com/reel/DfLink0001/', username: '@Nora.Eats.MBL', on: '2026-10-18' }, 'staff')).status).toBe(403)
    expect((await add({ link: 'https://example.com/x', username: 'nora' })).status).toBe(400)
    expect((await add({ link: 'https://www.instagram.com/reel/DfLink0001/', username: 'not a handle!' })).status).toBe(400)
    const res = await add({ link: 'https://www.instagram.com/reel/DfLink0001/?igsh=abc', username: '@Nora.Eats.MBL', on: '2026-10-18' })
    expect(await res.json()).toEqual({ id: 'collab:DfLink0001', put_forward: true })
    expect(mentions().find(m => m.id === 'collab:DfLink0001')).toMatchObject({
      kind: 'collab', username: 'nora.eats.mbl', video: true, permalink: 'https://www.instagram.com/reel/DfLink0001/', added_by: 'admin-1' })
    expect(String(mentions().find(m => m.id === 'collab:DfLink0001')!.mentioned_at).slice(0, 10)).toBe('2026-10-18')
    expect(reps()).toEqual([expect.objectContaining({ instagram: 'nora.eats.mbl', found_mention_id: 'collab:DfLink0001', approved: false })])
    expect((await add({ link: 'https://www.instagram.com/reel/DfLink0001/', username: 'nora.eats.mbl' })).status).toBe(400) // in already

    // When Instagram lists it later, it's the same post: one row, with Instagram's figures.
    apis.instagram.collabs = [reel('c9', 'nora.eats.mbl', 'DfLink0001', '2026-10-18T19:00:00+0000')]
    await check()
    expect(mentions().filter(m => String(m.id).includes('DfLink0001'))).toEqual([expect.objectContaining({ likes: 1180, added_by: 'admin-1' })])

    const remove = (id: string) => integrations.request(`${APP}/api/integrations/instagram/mentions/${encodeURIComponent(id)}`, { method: 'DELETE', headers: as('admin') }, env, ctx())
    expect((await remove('post:tag-1')).status).toBe(400) // Instagram listed it: it stays
    expect((await remove('collab:DfLink0001')).status).toBe(200)
    expect(mentions().some(m => m.id === 'collab:DfLink0001')).toBe(false)
  })

  it('a post added without its day is today’s where the business is: Dublin’s in Ireland, Madrid’s in Spain', async () => {
    await connectInstagram()
    vi.useFakeTimers({ now: Date.parse('2026-11-10T23:30:00Z'), toFake: ['Date'] }) // 23:30 in Dublin, 00:30 on the 11th in Madrid
    try {
      const add = (code: string) => integrations.request(`${APP}/api/integrations/instagram/mentions`,
        { method: 'POST', headers: as('admin'), body: JSON.stringify({ link: `https://www.instagram.com/p/${code}/`, username: 'nora.eats.mbl' }) }, env, ctx())
      const day = (code: string) => mentions().find(m => m.id === `collab:${code}`)?.mentioned_at
      Object.assign(db.table('business')[0], { country: 'IE', timezone: 'Europe/Dublin' })
      await add('DfDublin01')
      expect(day('DfDublin01')).toBe('2026-11-10T12:00:00.000Z')
      Object.assign(db.table('business')[0], { country: 'ES', timezone: 'Europe/Madrid' })
      await add('DfMadrid01')
      expect(day('DfMadrid01')).toBe('2026-11-11T11:00:00.000Z')
    } finally {
      vi.useRealTimers()
    }
  })

  it('what the café’s own account did in a post’s days, against a usual three days: one post a look, read once', async () => {
    db.tables.instagram_mentions = [
      { id: 'collab:old', kind: 'collab', username: 'nora.eats.mbl', mentioned_at: '2026-10-14T18:00:00Z', window_read_at: null },
      { id: 'collab:new', kind: 'collab', username: 'tomas.runs', mentioned_at: '2026-10-19T10:00:00Z', window_read_at: null }, // its days aren't in yet
    ]
    const base = globalThis.fetch
    let refuseProfileViews = false
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      if (url.host !== 'graph.instagram.com' || !url.pathname.endsWith('/me/insights')) return base(input, init)
      const metrics = url.searchParams.get('metric')!.split(',')
      if (refuseProfileViews && metrics.includes('profile_views')) return new Response(JSON.stringify({ error: { message: '(#100) metric[4] must be one of the following values', code: 100 } }), { status: 400 })
      const during = url.searchParams.get('since') === String(Date.parse('2026-10-14T00:00:00Z') / 1000)
      const value: Record<string, number> = during
        ? { reach: 3400, views: 9100, accounts_engaged: 210, profile_links_taps: 12, profile_views: 240 }
        : { reach: 2800, views: 7000, accounts_engaged: 140, profile_links_taps: 14, profile_views: 140 }
      return new Response(JSON.stringify({ data: metrics.map(name => ({ name, period: 'day', total_value: { value: value[name] } })) }), { status: 200 })
    }))
    const cfg = { token: 'ig', graphVersion: 'v23.0' } as Parameters<typeof readPostWindow>[1]
    expect(await readPostWindow(businessDb(env, 1), cfg, '2026-10-20')).toBe(true)
    expect(mentions().find(m => m.id === 'collab:old')!.account_window).toEqual({
      reach: 3400, views: 9100, engaged: 210, link_taps: 12, profile_visits: 240,
      usual: { reach: 1200, views: 3000, engaged: 60, link_taps: 6, profile_visits: 60 },
    })
    // Read once; the newer post's days aren't in yet.
    expect(await readPostWindow(businessDb(env, 1), cfg, '2026-10-20')).toBe(false)
    // Two days on: the newer one, where Instagram doesn't give profile visits.
    refuseProfileViews = true
    expect(await readPostWindow(businessDb(env, 1), cfg, '2026-10-23')).toBe(true)
    expect(mentions().find(m => m.id === 'collab:new')!.account_window).toMatchObject({ profile_visits: null, usual: { profile_visits: null } })
  })
})
