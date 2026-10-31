// Sales reps' own pages and reach, through the Worker's routes against stand-ins for Supabase and
// Instagram. What must never break:
//   - a rep's link loads only their own page, never cached, and a wrong or old link loads nothing
//   - what a rep sends from their page goes to the database as it is, tidied, and comes back in plain words when refused
//   - only the team looks people up on Instagram; followers come only from people who've messaged the café
//   - reps' followers follow Instagram, without rewriting a rep for every small change
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { repPage, sayPlainly, syncRepFollowers } from './repPage'
import { seal } from './crypto'
import { businessDb, type Env } from './supabase'
import { FakeSupabase, type Row } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'
import type { InboxConversation } from '../shared/messages'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key',
} as unknown as Env
const TOKEN = 'da11e0a7c0ac4f1e9a2b3c4d5e6f7a8b'

let db: FakeSupabase
let apis: FakeProviders
let calls: { name: string; args: Row }[]
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext
const call = (path: string, init: RequestInit = {}) => repPage.request(`${APP}${path}`, init, env, ctx())
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  call(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
const answer = (name: string, out: (args: Row) => unknown) => { db.rpcs[name] = args => { calls.push({ name, args }); return out(args) } }

beforeEach(() => {
  db = new FakeSupabase()
  apis = new FakeProviders()
  calls = []
  db.people.set('staff-token', { id: 'u-staff', role: 'employee' })
  db.people.set('partner-token', { id: 'u-partner', role: 'partner' as 'employee' })
  db.tables.rep_links = [{ rep_id: 'rep-dani', token: TOKEN, business_id: 1 }]
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('A rep’s own page', () => {
  it('loads their page, never cached; a wrong or old link loads nothing', async () => {
    answer('rep_page', ({ p_token }) => (p_token === TOKEN ? { rep: { name: 'Dani Ortega', reach: 10_640 }, crew: [], rules: [] } : null))
    const res = await call(`/api/rep-page/${TOKEN}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toMatchObject({ rep: { name: 'Dani Ortega', reach: 10_640 } })
    expect((await call('/api/rep-page/0123456789abcdef0123456789abcdef')).status).toBe(404)
    const bad = await call('/api/rep-page/not-a-link')
    expect(bad.status).toBe(404)
    expect(await bad.json()).toEqual({ error: 'This link has changed. Ask the café for your new one.' })
    expect(calls).toHaveLength(1)
  })

  it('sends what they shared to the database as it is; a reward to choose is needed first', async () => {
    answer('claim_reward', () => ({ id: 'w1', status: 'pending', amount: 4 }))
    const res = await post(`/api/rep-page/${TOKEN}/claim`, { rule_id: '6f1c7e0e-1d1b-4c55-9f5e-2b1c9a0e7d11', note: '  Reel after training ', proof_url: 'https://www.instagram.com/reel/abc/',
      occurred_on: '2026-10-30', amount: 1000 })
    expect(await res.json()).toEqual({ id: 'w1', status: 'pending', amount: 4 })
    expect(calls[0].args).toEqual({ p_token: TOKEN, p_rule_id: '6f1c7e0e-1d1b-4c55-9f5e-2b1c9a0e7d11', p_note: 'Reel after training',
      p_proof_url: 'https://www.instagram.com/reel/abc/', p_occurred_on: '2026-10-30' })
    const none = await post(`/api/rep-page/${TOKEN}/claim`, { note: 'A story' })
    expect(none.status).toBe(400)
    expect(await none.json()).toEqual({ error: 'Choose what you shared' })
  })

  it('adds someone to their crew with only the fields a person has; refusals in plain words', async () => {
    answer('suggest_crew', ({ p_person }) => ({ name: (p_person as Row).name, reach: 2300, approved: false }))
    const res = await post(`/api/rep-page/${TOKEN}/crew`, { name: ' Ana Ruiz ', instagram: '@ana_fights', instagram_followers: 2300.4, tiktok_followers: '',
      approved: true, leader_id: 'someone-else', note: 'Amateur champion' })
    expect(await res.json()).toEqual({ name: 'Ana Ruiz', reach: 2300, approved: false })
    expect(calls[0].args.p_person).toEqual({ name: 'Ana Ruiz', instagram: '@ana_fights', tiktok: null, youtube: null, facebook: null, phone: null,
      note: 'Amateur champion', instagram_followers: 2300, tiktok_followers: null, youtube_followers: null, facebook_followers: null, community: null })
    db.rpcs.suggest_crew = () => { throw new Error('duplicate key value violates unique constraint "sales_reps_business_id_instagram_idx"') }
    const dup = await post(`/api/rep-page/${TOKEN}/crew`, { name: 'Copy', instagram: 'carlos.ko' })
    expect(dup.status).toBe(400)
    expect(await dup.json()).toEqual({ error: 'Someone with that Instagram is in already.' })
  })

  it('the database’s refusals, as someone on their page reads them', () => {
    expect(sayPlainly('new row for relation "sales_reps" violates check constraint "sales_reps_tiktok_check"')).toBe('That isn’t a handle: letters, numbers, dots and underscores.')
    expect(sayPlainly('new row for relation "sales_reps" violates check constraint "sales_reps_instagram_followers_check"')).toBe('Followers are a number from 0 up.')
    expect(sayPlainly('Say what you shared, or add its link')).toBe('Say what you shared, or add its link')
  })
})

describe('Reach from Instagram', () => {
  const connect = async () => {
    apis.instagram.current = 'ig-long-1'
    db.tables.integrations = [{ provider: 'instagram', status: 'connected', external: { user_id: '17841400000000001', username: 'easy.beans.coffee' } }]
    db.tables.integration_secrets = [{ provider: 'instagram', ciphertext: await seal(env.INTEGRATION_KEY!, {
      access_token: apis.instagram.current, user_id: '17841400000000001', expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() }) }]
    apis.instagram.people['igsid-lucia'] = { name: 'Lucía García', username: 'lucia.marbella', profile_pic: 'https://cdn.instagram.test/lucia.jpg', follower_count: 640 }
  }
  const staff = { authorization: 'Bearer staff-token' }

  it('only the team looks people up, and only by a handle', async () => {
    expect((await post('/api/reps/instagram', { handle: 'lucia.marbella' })).status).toBe(403)
    expect((await post('/api/reps/instagram', { handle: 'lucia.marbella' }, { authorization: 'Bearer partner-token' })).status).toBe(403)
    expect((await post('/api/reps/instagram', { handle: 'not a handle!' }, staff)).status).toBe(400)
  })

  it('followers, name and photo for someone who has messaged the café; anyone else is typed in', async () => {
    expect(await (await post('/api/reps/instagram', { handle: 'lucia.marbella' }, staff)).json()).toEqual({ found: false,
      reason: 'Connect the café’s Instagram (Connections) to look people up there.' })
    await connect()
    expect(await (await post('/api/reps/instagram', { handle: '@Lucia.Marbella' }, staff)).json())
      .toEqual({ found: true, followers: 640, name: 'Lucía García', picture: 'https://cdn.instagram.test/lucia.jpg' })
    const other = await (await post('/api/reps/instagram', { handle: 'ortega.mma' }, staff)).json() as { found: boolean; reason: string }
    expect(other.found).toBe(false)
    expect(other.reason).toMatch(/only shares followers for people who’ve messaged the café/)
  })

  it('reps’ followers follow Instagram; small changes and people who aren’t reps are left alone', async () => {
    db.tables.sales_reps = [
      { id: 'r1', business_id: 1, instagram: 'lucia.marbella', instagram_followers: null, picture_url: null },
      { id: 'r2', business_id: 1, instagram: 'nora.kim.mma', instagram_followers: 26_800, picture_url: 'https://cdn.instagram.test/nora-old.jpg' },
      { id: 'r3', business_id: 1, instagram: 'carla.laroca', instagram_followers: 18_500, picture_url: null },
    ]
    const chat = (username: string, followers: number, picture?: string): InboxConversation =>
      ({ id: username, platform: 'instagram', updatedAt: '', recent: [], with: { id: `id-${username}`, username, followers, ...(picture ? { picture } : {}) } })
    const changed = await syncRepFollowers(businessDb(env, 1), [chat('lucia.marbella', 640, 'https://cdn.instagram.test/lucia.jpg'),
      chat('nora.kim.mma', 26_850, 'https://cdn.instagram.test/nora-new.jpg'), chat('carla.laroca', 19_900), chat('stranger', 99_000)])
    expect(changed).toBe(2)
    const rep = (id: string) => db.table('sales_reps').find(r => r.id === id)!
    expect(rep('r1')).toMatchObject({ instagram_followers: 640, picture_url: 'https://cdn.instagram.test/lucia.jpg' })
    expect(rep('r1').followers_checked_at).toBeTruthy()
    expect(rep('r2')).toMatchObject({ instagram_followers: 26_800, picture_url: 'https://cdn.instagram.test/nora-old.jpg' })
    expect(rep('r3')).toMatchObject({ instagram_followers: 19_900, picture_url: null })
    expect(db.table('sales_reps')).toHaveLength(3)
  })
})
