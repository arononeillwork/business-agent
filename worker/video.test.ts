// The landing page's videos: a browser asking for part of one gets that part (206), so the video's
// slider can go to a moment not downloaded yet; without a Range header, the whole file as before.
import { describe, expect, it } from 'vitest'
import { byteRange, serveVideo } from './video'

const FILE = Uint8Array.from({ length: 1000 }, (_, i) => i % 256)
/** The static assets as Cloudflare serves them: the whole file whatever is asked, or the app's page for a file that isn't there. */
const assets = {
  asked: [] as Request[],
  async fetch(r: Request) {
    this.asked.push(r)
    if (!new URL(r.url).pathname.endsWith('.mp4')) return new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
    return new Response(FILE, { headers: { 'content-type': 'video/mp4', etag: '"v1"' } })
  },
}
const get = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  serveVideo(assets, new Request(`https://app.test${path}`, { method, headers }))

describe('byteRange', () => {
  it('reads a range, an open-ended one and the last N bytes', () => {
    expect(byteRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(byteRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 })
    expect(byteRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
    expect(byteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
  })
  it('none of the file, or not a range it understands', () => {
    expect(byteRange('bytes=1000-', 1000)).toBeNull()
    expect(byteRange('bytes=50-10', 1000)).toBeNull()
    expect(byteRange('bytes=-', 1000)).toBeNull()
    expect(byteRange('bytes=0-1,5-9', 1000)).toBeNull()
    expect(byteRange('items=0-9', 1000)).toBeNull()
  })
})

describe('serveVideo', () => {
  it('the part asked for, with 206 and where it is in the file', async () => {
    const res = await get('/video/demo.mp4', { range: 'bytes=500-509' })
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 500-509/1000')
    expect(res.headers.get('content-length')).toBe('10')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('content-type')).toBe('video/mp4')
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([...FILE.slice(500, 510)])
    // The assets were asked for the whole file, with no range or condition they'd answer without bytes.
    expect(assets.asked.at(-1)!.headers.get('range')).toBeNull()
  })

  it('the whole file when no range is asked for, saying ranges can be', async () => {
    const res = await get('/video/demo.mp4', { 'if-none-match': '"v1"' })
    expect(res.status).toBe(200)
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect((await res.arrayBuffer()).byteLength).toBe(1000)
    expect(assets.asked.at(-1)!.headers.get('if-none-match')).toBeNull()
  })

  it('416 for a range past the end; 404 for a video that isn’t there', async () => {
    const past = await get('/video/demo.mp4', { range: 'bytes=2000-' })
    expect(past.status).toBe(416)
    expect(past.headers.get('content-range')).toBe('bytes */1000')
    expect((await get('/video/gone.webm')).status).toBe(404)
  })
})
