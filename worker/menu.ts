// Menu page: images made with AI through Higgsfield, with the business's own API key (Connections →
// AI images, or the Menu page's Design tab). An image is asked for here; Higgsfield calls the
// webhook below when it's done (the page also asks while it's open, and the minute cron picks up
// any whose webhook was lost). Each finished image is copied into the café's own storage ("Business
// Agent/Menu" in Drive or OneDrive, or R2), since Higgsfield keeps it only a week. Admins only.
// And the menu itself from Square, when that's where it comes from (settings.menu_source): its item
// library read on demand and every hour, into the menu items (sync_square_menu()).
import { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, businessDb, requestDb, serviceClient, userClient, type Env } from './supabase'
import { higgsfieldKey, markBroken, setIntegration, squareSession } from './connections'
import { hmacHex, safeEqual, seal } from './crypto'
import { storeMedia } from './media'
import * as higgsfield from './providers/higgsfield'
import * as square from './providers/square'
import { fromSquareCatalog } from '../shared/menuSquare'
import { businessConfig } from '../shared/business.config'
import {
  MAX_PROMPT, aiRequest, buildPrompt, menuSections, modelOf, photoPrompt, readAiResult, imageShape, type AiModel, type AiResult, type MenuDesign, type MenuImage, type MenuItem,
} from '../shared/menu'
import type { BrandColour } from '../shared/types'

export const menu = new Hono<{ Bindings: Env; Variables: { userId: string } }>()

/** A problem with what was asked (shown as is), as opposed to Higgsfield or storage failing. */
class MenuError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 429 = 400) { super(message) }
}

export const IMAGE_COLUMNS = 'id, design_id, item_id, url, source, model, prompt, edit_of, status, error, stored, created_at'
type WaitingRow = Pick<MenuImage, 'id' | 'status'> & { request_id: string | null; status_url: string | null }
const WAITING = ['queued', 'working']
/** Images being made at once, at most (each one spends the account's Higgsfield credits). */
const MAX_WAITING = 4
/** Past this, an image Higgsfield hasn't finished is given up on. */
const GIVE_UP_MS = 3 * 60 * 60_000

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const status = (e: unknown) => (e instanceof MenuError ? e.status : e instanceof higgsfield.HiggsfieldError && e.status < 500 ? 400 : 502)

menu.use('/api/menu/*', async (c, next) => {
  const token = bearer(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Not signed in' }, 401)
  const sb = userClient(c.env, token, 'app')
  const [{ data: user }, { data: isAdmin }] = await Promise.all([sb.auth.getUser(token), sb.rpc('is_admin')])
  if (!user.user || !isAdmin) return c.json({ error: 'Only admins change the menu and its images' }, 403)
  c.set('userId', user.user.id)
  await next()
})

/** The signature in an image's webhook address: only Higgsfield, given it by us, can report on it. */
const sign = async (env: Env, id: string) => (await hmacHex(env.INTEGRATION_KEY!, `higgsfield:${id}`)).slice(0, 32)

/** Our webhook for an image, when Higgsfield can reach us (a public https address, not a laptop). */
async function webhookFor(env: Env, origin: string, id: string) {
  if (!env.INTEGRATION_KEY || !/^https:\/\//.test(origin) || /localhost|127\.0\.0\.1/.test(origin)) return null
  return `${origin}/api/hooks/higgsfield/${id}/${await sign(env, id)}`
}

// Connect Higgsfield with its API key (key ID and secret, from higgsfield.ai → API keys). Proven
// before it's kept: Higgsfield must accept it. Kept encrypted, like every other connection's access.
menu.post('/api/menu/ai/connect', async c => {
  const sent = await c.req.json<{ key_id?: string; key_secret?: string }>().catch(() => ({} as { key_id?: string; key_secret?: string }))
  let keyId = (sent.key_id ?? '').trim(), secret = (sent.key_secret ?? '').trim()
  // Pasted as one "id:secret", the way Higgsfield shows it for its own tools.
  if (!secret && keyId.includes(':')) [keyId, secret] = [keyId.slice(0, keyId.indexOf(':')), keyId.slice(keyId.indexOf(':') + 1)]
  if (!keyId || !secret) return c.json({ error: 'Paste both the key ID and the secret' }, 400)
  if (keyId.length > 200 || secret.length > 500) return c.json({ error: 'That doesn’t look like a Higgsfield key' }, 400)
  if (!c.env.INTEGRATION_KEY) return c.json({ error: 'Business Agent can’t keep keys yet: INTEGRATION_KEY isn’t set (see docs/INTEGRATIONS.md).' }, 500)
  const key = { key_id: keyId, key_secret: secret }
  try {
    await higgsfield.prove(key)
  } catch (e) {
    return c.json({ error: message(e) }, status(e))
  }
  const db = await requestDb(c)
  const { error } = await db.from('integration_secrets').upsert({ provider: 'higgsfield', ciphertext: await seal(c.env.INTEGRATION_KEY, key), updated_at: new Date().toISOString() })
  if (error) return c.json({ error: error.message }, 500)
  const now = new Date().toISOString()
  await setIntegration(db, 'higgsfield', { status: 'connected', connected_by: c.get('userId'), connected_at: now, last_checked_at: now, last_error: null,
    account_label: `Key ${keyId.slice(0, 4)}…${keyId.slice(-4)}`, external: {} })
  return c.json({ ok: true })
})

// Ask for an image: for a design (artwork for behind the menu, or the whole menu), or an item's
// photo; or a change to one of their images (edit_of). It comes back queued; the page shows it
// once it's ready.
menu.post('/api/menu/images', async c => {
  const sent = await c.req.json<GenerateInput>().catch(() => ({} as GenerateInput))
  try {
    return c.json({ image: await generate(c.env, await requestDb(c), new URL(c.req.url).origin, c.get('userId'), sent) })
  } catch (e) {
    return c.json({ error: message(e) }, status(e))
  }
})

// How an image is going (the page asks every few seconds while one is being made).
menu.post('/api/menu/images/:id/check', async c => {
  const db = await requestDb(c)
  const { data: row } = await db.from('menu_images').select('id, status, request_id, status_url').eq('id', c.req.param('id')).maybeSingle()
  if (!row) return c.json({ error: 'That image has gone' }, 404)
  try {
    await check(c.env, db, new URL(c.req.url).origin, row as WaitingRow)
  } catch (e) {
    return c.json({ error: message(e) }, status(e))
  }
  const { data } = await db.from('menu_images').select(IMAGE_COLUMNS).eq('id', row.id).single()
  return c.json({ image: data })
})

// Higgsfield's webhook: the image is done (or failed). Answered at once (Higgsfield waits up to 10
// seconds), the image copied afterwards. Duplicates are acknowledged and change nothing.
menu.post('/api/hooks/higgsfield/:id/:sig', async c => {
  const id = c.req.param('id')
  if (!c.env.INTEGRATION_KEY || !safeEqual(c.req.param('sig'), await sign(c.env, id))) return c.json({ error: 'Not found' }, 404)
  const body = await c.req.json().catch(() => null) as { request_id?: string; status?: string } | null
  if (!body?.request_id || !body.status) return c.json({ error: 'Not a Higgsfield result' }, 400)
  // The image's own business (its id is in the signed address).
  const { data: owner } = await serviceClient(c.env).from('menu_images').select('business_id').eq('id', id).maybeSingle()
  if (!owner) return c.json({ ok: true })
  const db = businessDb(c.env, owner.business_id as number)
  const { data: row } = await db.from('menu_images').select('id, status, request_id, status_url').eq('id', id).maybeSingle()
  // Ours, unless it names another request (it can arrive before the request's id is saved).
  if (!row || (row.request_id && row.request_id !== body.request_id)) return c.json({ ok: true })
  c.executionCtx.waitUntil(settle(c.env, db, new URL(c.req.url).origin, row as WaitingRow, readAiResult(body)).catch(e => console.error('higgsfield webhook failed', e)))
  return c.json({ ok: true })
})

// The menu from Square: read its item library now (the Menu page's "Read from Square now", and right
// after Square is chosen as where the menu comes from).
menu.post('/api/menu/square/sync', async c => {
  try {
    return c.json(await syncSquareMenu(c.env, await requestDb(c)))
  } catch (e) {
    return c.json({ error: message(e) }, status(e))
  }
})

/**
 * Read the Square item library into the menu. A connection made before the app asked to read items
 * is told to connect again; any failure is kept for the Menu page to show.
 */
export async function syncSquareMenu(env: Env, db: SupabaseClient) {
  const { data: row } = await db.from('integrations').select('status').eq('provider', 'square').maybeSingle()
  if (row?.status !== 'connected') throw new MenuError('Connect Square on the Connections page first: the menu is read from its item library.', 409)
  let objects
  try {
    const s = await squareSession(env, db)
    objects = await square.catalog(s.sandbox, s.token)
  } catch (e) {
    const scopes = e instanceof square.SquareError && e.code === 'INSUFFICIENT_SCOPES'
    const why = scopes ? 'Connect Square again on the Connections page so the app can read your item library (it asks for that permission now).' : message(e)
    await db.from('settings').update({ menu_sync_error: why.slice(0, 500) }).eq('id', 1)
    throw scopes ? new MenuError(why, 409) : new Error(why)
  }
  const read = fromSquareCatalog(objects)
  const { data, error } = await db.rpc('sync_square_menu', { p: read })
  if (error) throw new Error(error.message)
  return { ...(data as { added: number; changed: number; off: number }), items: read.items.length }
}

/** Every hour (the cron), while the menu comes from Square. */
export async function syncSquareMenuIfChosen(env: Env, db: SupabaseClient) {
  const { data } = await db.from('settings').select('menu_source').eq('id', 1).maybeSingle()
  if (data?.menu_source !== 'square') return
  await syncSquareMenu(env, db).catch(e => console.error('square menu failed', message(e)))
}

interface GenerateInput { design_id?: string; item_id?: string; prompt?: string; model?: AiModel; edit_of?: string }

async function generate(env: Env, db: SupabaseClient, origin: string, userId: string, p: GenerateInput): Promise<MenuImage> {
  const words = (p.prompt ?? '').trim()
  if (words.length > MAX_PROMPT) throw new MenuError('Keep the description under 1,500 characters')
  const model = modelOf(p.model).id
  const key = await higgsfieldKey(env, db).catch(() => { throw new MenuError('Connect Higgsfield first (Connections → AI images) to make images with AI.', 409) })
  const { count } = await db.from('menu_images').select('id', { count: 'exact', head: true }).in('status', WAITING)
    .gte('created_at', new Date(Date.now() - GIVE_UP_MS).toISOString())
  if ((count ?? 0) >= MAX_WAITING) throw new MenuError('Four images are being made already. Wait for one to finish, then try again.', 429)

  // The image to change, when it's an edit: one of the same design's (or item's), ready.
  let edit: { url: string } | null = null
  if (p.edit_of) {
    const { data: from } = await db.from('menu_images').select('url, status, design_id, item_id').eq('id', p.edit_of).maybeSingle()
    if (!from?.url || from.status !== 'ready' || (from.design_id ?? null) !== (p.design_id ?? null) || (from.item_id ?? null) !== (p.item_id ?? null)) {
      throw new MenuError('That image can’t be changed: pick one of this design’s finished images')
    }
    if (!words) throw new MenuError('Say what to change')
    edit = { url: from.url }
  }

  let prompt: string
  let shape: { width: number; height: number }
  if (p.design_id) {
    const { data: d } = await db.from('menu_designs').select('*').eq('id', p.design_id).maybeSingle() as { data: Omit<MenuDesign, 'images'> | null }
    if (!d) throw new MenuError('That design has gone', 404)
    shape = imageShape(d)
    if (edit) prompt = words
    else {
      if (!words && d.mode === 'background') throw new MenuError('Describe the look you want: colours, style, what’s in it')
      const [{ data: business }, { data: items }, { data: settings }] = await Promise.all([db.from('business').select('name').maybeSingle(), db.rpc('menu_list'),
        db.from('settings').select('menu_sections').eq('id', 1).maybeSingle()])
      const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: businessConfig.currency })
      prompt = buildPrompt(words, { mode: d.mode, style: d.style, format: d.format, size: d.size, title: d.title ?? business?.name ?? businessConfig.name, subtitle: d.subtitle,
        footer: d.footer, sections: menuSections((items ?? []) as MenuItem[], { only: d.categories, order: settings?.menu_sections ?? [] }), money: n => money.format(n) })
    }
  } else if (p.item_id) {
    const { data: item } = await db.from('recipes').select('name, description, category').eq('id', p.item_id).maybeSingle()
    if (!item) throw new MenuError('That menu item has gone', 404)
    shape = { width: 1, height: 1 }
    prompt = edit ? words : photoPrompt(item, words)
  } else throw new MenuError('Say which design or menu item the image is for')

  const colours = model === 'recraft' ? (((await db.from('brand').select('colours').eq('id', 1).maybeSingle()).data?.colours ?? []) as BrandColour[]) : []
  const request = aiRequest(model, prompt, shape, { image: edit?.url, colours })
  // The row first: its id is the request's idempotency key and part of the webhook's address.
  const { data: row, error } = await db.from('menu_images').insert({ design_id: p.design_id ?? null, item_id: p.design_id ? null : p.item_id, source: 'ai', model,
    prompt: words || null, edit_of: p.edit_of ?? null, status: 'queued', created_by: userId }).select(IMAGE_COLUMNS).single()
  if (error) throw new Error(error.message)
  try {
    const { requestId, statusUrl } = await higgsfield.submit(key, request, { key: row.id, webhook: await webhookFor(env, origin, row.id) })
    const { data } = await db.from('menu_images').update({ request_id: requestId, status_url: statusUrl }).eq('id', row.id).select(IMAGE_COLUMNS).single()
    return data as MenuImage
  } catch (e) {
    await db.from('menu_images').update({ status: 'failed', error: message(e) }).eq('id', row.id)
    // A key Higgsfield no longer takes: the Connections card turns red and admins hear about it.
    if (e instanceof higgsfield.HiggsfieldError && e.status === 401) await markBroken(db, 'higgsfield', e.message)
    throw e
  }
}

/** Ask Higgsfield how a waiting image is going, and act on the answer. */
async function check(env: Env, db: SupabaseClient, origin: string, row: WaitingRow) {
  if (!WAITING.includes(row.status) || !row.status_url) return
  await settle(env, db, origin, row, await higgsfield.status(await higgsfieldKey(env, db), row.status_url))
}

/** The address's picture type, when the download doesn't say (some storage answers binary/octet-stream). */
function pictureType(header: string | null, url: string) {
  const type = (header ?? '').split(';')[0].trim().toLowerCase()
  if (/^image\/(jpeg|png|webp)$/.test(type)) return type
  const ext = new URL(url).pathname.match(/\.(jpe?g|png|webp)$/i)?.[1].toLowerCase()
  return ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg'
}

/**
 * Act on Higgsfield's answer about an image: still going, failed, or done. A finished image is
 * copied into the café's storage; with none connected, Higgsfield's own address is kept (the page
 * says it lasts a week). Only an image still waiting is changed, so a late duplicate does nothing.
 */
export async function settle(env: Env, db: SupabaseClient, origin: string, row: WaitingRow, result: AiResult) {
  if (!WAITING.includes(row.status)) return
  const update = (patch: Record<string, unknown>) => db.from('menu_images').update(patch).eq('id', row.id).in('status', WAITING)
  if (result.status === 'queued' || result.status === 'working') {
    if (result.status !== row.status) await update({ status: result.status })
    return
  }
  if (result.status === 'failed') { await update({ status: 'failed', error: result.error }); return }
  let url = result.url!, stored = false
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Higgsfield’s image couldn’t be downloaded (${res.status})`)
    const bytes = await res.arrayBuffer()
    url = (await storeMedia(env, db, origin, { type: pictureType(res.headers.get('content-type'), url), size: bytes.byteLength, body: bytes, folder: 'Menu' })).url
    stored = true
  } catch (e) {
    console.error('menu image kept at Higgsfield only', message(e))
  }
  await update({ status: 'ready', url, stored, error: null })
}

/**
 * Every minute (the cron): images still waiting a couple of minutes on, whose webhook may have been
 * lost, are asked about; ones Higgsfield hasn't finished in 3 hours are given up on.
 */
export async function checkWaitingImages(env: Env, db: SupabaseClient) {
  const { data } = await db.from('menu_images').select('id, status, request_id, status_url, created_at').in('status', WAITING)
    .lt('created_at', new Date(Date.now() - 2 * 60_000).toISOString()).order('created_at').limit(10)
  if (!data?.length) return
  const origin = new URL(businessConfig.appUrl).origin
  for (const row of data as (WaitingRow & { created_at: string })[]) {
    if (Date.now() - Date.parse(row.created_at) > GIVE_UP_MS || !row.status_url) {
      await db.from('menu_images').update({ status: 'failed', error: 'Higgsfield didn’t finish this image. Try again (nothing is charged for an image that isn’t made).' })
        .eq('id', row.id).in('status', WAITING)
      continue
    }
    await check(env, db, origin, row).catch(e => console.error('menu image check failed', message(e)))
  }
}
