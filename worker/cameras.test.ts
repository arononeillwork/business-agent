// Cameras, end to end through the Worker's routes against stand-ins for Supabase, Google Drive,
// OneDrive and the camera upload server. What must never break:
//   - only the upload server (its key) asks about logins and hands over video; a wrong password or a
//     switched-off camera is turned away
//   - video goes into the business's own storage, Business Agent/Cameras/<camera>/<day>/, named by
//     the local time it started, with its row; with no storage it's refused (the server tries again)
//   - admins only: the latest picture, what the upload server has, a clip to play by a signed address
//     that runs out, deleting a clip or a camera (its clips out of storage first), and the clips
//     whose days are up deleted every hour
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { cameras, forgetCameraTokens, purgeCameraClips } from './cameras'
import { businessDb, type Env } from './supabase'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', GOOGLE_CLIENT_ID: 'google-id', GOOGLE_CLIENT_SECRET: 'google-secret', MS_CLIENT_ID: 'ms-id', MS_CLIENT_SECRET: 'ms-secret',
  CAMERA_UPLOADS_URL: 'https://uploads.test', CAMERA_UPLOADS_KEY: 'uploads-key', CAMERA_FTP_HOST: 'cameras.test',
} as unknown as Env

const USER = 'cam0a1b2c3d'
const PASSWORD = '0123456789abcdef'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
let db: FakeSupabase
let apis: FakeProviders
let uploadsAsked: string[]
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

beforeEach(() => {
  db = new FakeSupabase()
  apis = new FakeProviders()
  uploadsAsked = []
  forgetCameraTokens()
  db.tables.business = [{ id: 1, name: 'Easy Beans', timezone: 'Europe/Madrid' }]
  db.tables.cameras = [{ id: 'cam-1', business_id: 1, name: 'Counter', placement: 'indoor', ftp_user: USER, ftp_password: PASSWORD, keep_days: 30, keep_video: 'motion', active: true }]
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    // The camera upload server: the latest picture and what it has from each camera.
    if (url.startsWith('https://uploads.test/')) {
      uploadsAsked.push(url)
      if (new Headers(init?.headers).get('authorization') !== 'Bearer uploads-key') return new Response('{}', { status: 401 })
      if (url === `https://uploads.test/picture/${USER}`) return new Response(JPEG, { headers: { 'content-type': 'image/jpeg', 'x-taken-at': '2026-10-30T09:15:05.000Z' } })
      if (url.startsWith('https://uploads.test/status')) {
        return Response.json({ cameras: { [USER]: { picture_at: '2026-10-30T09:15:05.000Z', video_at: null, kept_today: 3, skipped_today: 40 } } })
      }
      return new Response('{}', { status: 404 })
    }
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const call = (path: string, init: RequestInit = {}) => cameras.request(`${APP}${path}`, init, env, ctx())
const asUploads = { authorization: 'Bearer uploads-key' }
const admin = { authorization: 'Bearer admin-token' }
const login = (body: unknown, headers: Record<string, string> = asUploads) =>
  call('/api/camera-uploads/login', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) })
const video = new TextEncoder().encode('an mp4 from the counter camera')
const clip = (headers: Record<string, string> = {}, body = video) => call('/api/camera-uploads/clip', { method: 'POST', body, headers: {
  ...asUploads, 'content-type': 'video/mp4', 'content-length': String(body.length), 'x-camera': USER, 'x-file-name': 'Counter_00_20261030101500.mp4',
  'x-ended-at': '2026-10-30T09:15:30.000Z', 'x-seconds': '30', 'x-motion': '1', ...headers } })

async function connectStorage(provider: 'google_drive' | 'onedrive') {
  const req = (path: string, init: RequestInit = {}) => integrations.request(`${APP}${path}`, init, env, ctx())
  const start = await req(`/api/integrations/connect/${provider}/start`, { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: '{}' })
  const auth = new URL((await start.json() as { url: string }).url)
  const back = auth.host === 'login.microsoftonline.com' ? 'microsoft' : 'google'
  const res = await req(`/api/integrations/${back}/callback?code=the-code&state=${encodeURIComponent(auth.searchParams.get('state')!)}`)
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe(provider)
}
/** Where a Drive file or folder is, by folder names. */
const drivePath = (id: string): string[] => { const f = apis.google.folders.get(id); return f ? [...drivePath(f.parent), f.name] : [] }

describe('Cameras: what the camera upload server passes on', () => {
  it('only the upload server asks about logins, and only the right password for a camera that’s on gets in', async () => {
    expect((await login({ user: USER, password: PASSWORD }, {})).status).toBe(401)
    expect((await login({ user: USER, password: PASSWORD }, { authorization: 'Bearer guess' })).status).toBe(401)
    expect((await login({ user: USER, password: 'fedcba9876543210' })).status).toBe(401)
    expect((await login({ user: 'cam00000000', password: PASSWORD })).status).toBe(401)
    expect((await login({ user: "cam' or 1=1", password: PASSWORD })).status).toBe(401)
    const ok = await login({ user: USER, password: PASSWORD })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ camera: { keep_video: 'motion' } })
    db.tables.cameras[0].active = false
    expect((await login({ user: USER, password: PASSWORD })).status).toBe(403)
  })

  it('keeps video in the business’s Drive, by camera and day, named by when it started', async () => {
    // No storage yet: refused, and the Cameras page says why.
    const none = await clip()
    expect(none.status).toBe(409)
    expect(db.tables.camera_status[0].last_error).toMatch(/Connect Google Drive or OneDrive/)
    expect(db.tables.camera_clips ?? []).toEqual([])

    await connectStorage('google_drive')
    const res = await clip()
    expect(res.status).toBe(200)
    // 10:15:00 in Madrid (the camera's own clock, in its file name) is 09:15 UTC in late October.
    expect(await res.json()).toMatchObject({ folder: 'Cameras/Counter/2026-10-30', name: '10.15.00.mp4' })
    const [file] = [...apis.google.blobs]
    expect(file[1]).toMatchObject({ name: '10.15.00.mp4', type: 'video/mp4' })
    expect(new TextDecoder().decode(file[1].bytes)).toBe('an mp4 from the counter camera')
    expect(drivePath(file[1].parent)).toEqual(['Business Agent', 'Cameras', 'Counter', '2026-10-30'])
    expect(db.tables.camera_clips).toEqual([expect.objectContaining({ camera_id: 'cam-1', business_id: 1, started_at: '2026-10-30T09:15:00.000Z', seconds: 30,
      bytes: video.length, storage: 'google_drive', file_id: file[0], file_name: '10.15.00.mp4', link: `https://drive.google.com/file/d/${file[0]}/view`, motion: true })])
    expect(db.tables.camera_status[0]).toMatchObject({ camera_id: 'cam-1', last_error: null })
    expect(db.tables.camera_status[0].last_clip_at).toBeTruthy()
  })

  it('goes by when it arrived when the camera’s clock is wrong, and keeps video in OneDrive too', async () => {
    await connectStorage('onedrive')
    const res = await clip({ 'x-file-name': 'Counter_00_20200101000000.mp4', 'x-motion': '0' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ folder: 'Cameras/Counter/2026-10-30', name: '10.15.00.mp4' })
    const [[, f]] = [...apis.microsoft.blobs]
    expect(f.path).toBe('Business Agent/Cameras/Counter/2026-10-30/10.15.00.mp4')
    expect(db.tables.camera_clips[0]).toMatchObject({ storage: 'onedrive', motion: false })
  })

  it('turns away video from a camera that’s off, one it doesn’t know, or a piece too big', async () => {
    await connectStorage('google_drive')
    expect((await clip({ 'x-camera': 'cam00000000' })).status).toBe(404)
    expect((await clip({ 'content-length': String(200 * 1024 * 1024) }, video)).status).toBe(413)
    expect((await clip({ authorization: 'Bearer guess' })).status).toBe(401)
    db.tables.cameras[0].active = false
    expect((await clip()).status).toBe(403)
    expect(apis.google.blobs.size).toBe(0)
  })

  it('notes when a camera was last seen', async () => {
    const res = await call('/api/camera-uploads/seen', { method: 'POST', headers: { ...asUploads, 'content-type': 'application/json' }, body: JSON.stringify({ user: USER }) })
    expect(res.status).toBe(200)
    expect(db.tables.camera_status).toEqual([expect.objectContaining({ camera_id: 'cam-1', business_id: 1 })])
    expect(db.tables.camera_status[0].last_seen_at).toBeTruthy()
  })
})

describe('Cameras page: admins only', () => {
  it('says where cameras send to, and nothing until camera uploads are set up', async () => {
    expect(await (await call('/api/cameras/service', { headers: admin })).json()).toEqual({ ftp: { host: 'cameras.test', port: 21 } })
    expect((await call('/api/cameras/service', { headers: { authorization: 'Bearer staff-token' } })).status).toBe(403)
    expect((await call('/api/cameras/service')).status).toBe(401)
    const off = await cameras.request(`${APP}/api/cameras/service`, { headers: admin }, { ...env, CAMERA_UPLOADS_URL: undefined } as Env, ctx())
    expect(await off.json()).toEqual({ ftp: null })
  })

  it('shows each camera’s latest picture and what the upload server has from it', async () => {
    const pic = await call('/api/cameras/cam-1/picture', { headers: admin })
    expect(pic.status).toBe(200)
    expect(new Uint8Array(await pic.arrayBuffer())).toEqual(JPEG)
    expect(pic.headers.get('x-taken-at')).toBe('2026-10-30T09:15:05.000Z')
    expect((await call('/api/cameras/someone-elses/picture', { headers: admin })).status).toBe(404)
    expect((await call('/api/cameras/cam-1/picture', { headers: { authorization: 'Bearer staff-token' } })).status).toBe(403)
    const live = await (await call('/api/cameras/live', { headers: admin })).json()
    expect(live).toEqual({ cameras: { 'cam-1': { picture_at: '2026-10-30T09:15:05.000Z', video_at: null, kept_today: 3, skipped_today: 40 } } })
    expect(uploadsAsked.every(u => u.startsWith('https://uploads.test/'))).toBe(true)
  })

  it('plays a clip through a signed address that runs out, a piece at a time', async () => {
    await connectStorage('google_drive')
    await clip()
    const id = String(db.tables.camera_clips[0].id)
    expect((await call(`/api/cameras/clips/${id}/play`, { headers: { authorization: 'Bearer staff-token' } })).status).toBe(403)
    const { url } = await (await call(`/api/cameras/clips/${id}/play`, { headers: admin })).json() as { url: string }
    expect(url).toMatch(new RegExp(`^/api/camera-clips/1/${id}/\\d+/[\\w-]+\\.mp4$`))
    const whole = await call(url)
    expect(whole.status).toBe(200)
    expect(whole.headers.get('content-type')).toBe('video/mp4')
    expect(new TextDecoder().decode(await whole.arrayBuffer())).toBe('an mp4 from the counter camera')
    const part = await call(url, { headers: { range: 'bytes=0-1' } })
    expect(part.status).toBe(206)
    expect(new TextDecoder().decode(await part.arrayBuffer())).toBe('an')
    // Someone else's clip, or another time, with the same signature: nothing.
    expect((await call(url.replace('/api/camera-clips/1/', '/api/camera-clips/2/'))).status).toBe(404)
    expect((await call(url.replace(/\/(\d+)\//, (_, n: string) => `/${Number(n) + 1}/`))).status).toBe(404)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 3 * 3600_000)
    expect((await call(url)).status).toBe(404)
  })

  it('deletes a clip, and a camera with its clips, out of storage first', async () => {
    await connectStorage('google_drive')
    await clip()
    await clip({ 'x-file-name': 'Counter_00_20261030102000.mp4', 'x-ended-at': '2026-10-30T09:20:30.000Z' })
    expect(apis.google.blobs.size).toBe(2)
    const [first, second] = db.tables.camera_clips
    expect((await call(`/api/cameras/clips/${first.id}`, { method: 'DELETE', headers: { authorization: 'Bearer staff-token' } })).status).toBe(403)
    expect((await call(`/api/cameras/clips/${first.id}`, { method: 'DELETE', headers: admin })).status).toBe(200)
    expect(apis.google.blobs.has(String(first.file_id))).toBe(false)
    expect(db.tables.camera_clips.map(c => c.id)).toEqual([second.id])

    const gone = await call('/api/cameras/cam-1', { method: 'DELETE', headers: admin })
    expect(await gone.json()).toEqual({ ok: true, clips: 1 })
    expect(apis.google.blobs.size).toBe(0)
    expect(db.tables.camera_clips).toEqual([])
    expect(db.tables.cameras).toEqual([])
  })

  it('every hour, deletes the clips whose days are up (the database says which)', async () => {
    await connectStorage('google_drive')
    await clip()
    await clip({ 'x-file-name': 'Counter_00_20261030102000.mp4', 'x-ended-at': '2026-10-30T09:20:30.000Z' })
    const [old, kept] = db.tables.camera_clips
    db.rpcs.camera_clips_due = () => [{ id: old.id, storage: old.storage, file_id: old.file_id }]
    expect(await purgeCameraClips(env, businessDb(env, 1))).toBe(1)
    expect(apis.google.blobs.has(String(old.file_id))).toBe(false)
    expect(apis.google.blobs.has(String(kept.file_id))).toBe(true)
    expect(db.tables.camera_clips.map(c => c.id)).toEqual([kept.id])
    // One already gone from the Drive by hand counts as deleted.
    apis.google.blobs.clear()
    db.rpcs.camera_clips_due = () => [{ id: kept.id, storage: kept.storage, file_id: kept.file_id }]
    expect(await purgeCameraClips(env, businessDb(env, 1))).toBe(1)
    expect(db.tables.camera_clips).toEqual([])
  })
})
