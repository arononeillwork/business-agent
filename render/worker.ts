// The render service's Worker (render/wrangler.jsonc): the only way in to the ffmpeg container
// (render/server.ts). The app's Worker calls POST /render with its key (RENDER_KEY, shared by
// .github/workflows/deploy-render.yml) and gets the MP4 back. Its own deploy, separate from the
// app's: Containers need the Workers Paid plan, and the app works without it (no music in files).
import { Container, getRandom } from '@cloudflare/containers'

/** ffmpeg in a container: started on the first job, asleep after a few idle minutes. */
export class Renderer extends Container {
  defaultPort = 8080
  sleepAfter = '5m'
}

interface Env { RENDERER: DurableObjectNamespace<Renderer>; RENDER_KEY?: string }

/** The key, compared without leaking how much of it matched. */
async function keyMatches(env: Env, header: string | null) {
  if (!env.RENDER_KEY || !header?.startsWith('Bearer ')) return false
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([header.slice(7), env.RENDER_KEY].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))))
  return crypto.subtle.timingSafeEqual(a, b)
}

/** Containers to spread jobs over (each takes two at a time). */
const INSTANCES = 3

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url)
    if (pathname === '/health') return Response.json({ ok: true, keyed: !!env.RENDER_KEY })
    if (pathname !== '/render' || req.method !== 'POST') return Response.json({ error: 'Not found' }, { status: 404 })
    if (!await keyMatches(env, req.headers.get('authorization'))) return Response.json({ error: 'Not allowed' }, { status: 401 })
    const box = await getRandom(env.RENDERER, INSTANCES)
    return box.fetch(new Request('http://render/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: req.body }))
  },
} satisfies ExportedHandler<Env>
