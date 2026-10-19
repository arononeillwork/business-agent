// The Google Fonts catalogue for the brand page's font picker: every family and its category.
// Uses the official Web Fonts API when GOOGLE_FONTS_API_KEY is set, otherwise Google's public
// font list, and falls back to a built-in list of popular families if neither answers.
// Cached for a day at the edge.
import { Hono } from 'hono'
import type { Env } from './supabase'
import { POPULAR_FONTS as POPULAR, type FontFamily } from '../shared/fonts'

const clean = (list: FontFamily[]) =>
  [...new Map(list.filter(f => f.family).map(f => [f.family, { family: f.family, category: f.category.toLowerCase().replace('_', '-') }])).values()]
    .sort((a, b) => a.family.localeCompare(b.family))

export async function loadFonts(env: Pick<Env, 'GOOGLE_FONTS_API_KEY'>): Promise<{ source: string; fonts: FontFamily[] }> {
  if (env.GOOGLE_FONTS_API_KEY) {
    try {
      const res = await fetch(`https://www.googleapis.com/webfonts/v1/webfonts?sort=popularity&key=${env.GOOGLE_FONTS_API_KEY}`)
      const json = await res.json() as { items?: { family: string; category: string }[] }
      if (res.ok && json.items?.length) return { source: 'google-api', fonts: clean(json.items) }
    } catch { /* fall through */ }
  }
  try {
    const res = await fetch('https://fonts.google.com/metadata/fonts', { headers: { accept: 'application/json' } })
    const text = (await res.text()).replace(/^\)\]\}'\s*/, '')
    const json = JSON.parse(text) as { familyMetadataList?: { family: string; category: string }[] }
    if (res.ok && json.familyMetadataList?.length) return { source: 'google', fonts: clean(json.familyMetadataList) }
  } catch { /* fall through */ }
  return { source: 'built-in', fonts: clean(POPULAR) }
}

export const fonts = new Hono<{ Bindings: Env }>()

fonts.get('/api/fonts', async c => {
  const cache = (caches as unknown as { default: Cache }).default
  const key = new Request(new URL('/api/fonts?v=1', c.req.url).toString())
  const hit = await cache.match(key)
  if (hit) return hit
  const body = await loadFonts(c.env)
  const res = new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${body.source === 'built-in' ? 600 : 86400}` },
  })
  c.executionCtx.waitUntil(cache.put(key, res.clone()))
  return res
})
