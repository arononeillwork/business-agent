// Menu page: images made with AI through Higgsfield, with the business's own API key (Connections →
// AI images, or the Menu page's Design tab). An image is asked for here; Higgsfield calls the
// webhook below when it's done (the page also asks while it's open, and the minute cron picks up
// any whose webhook was lost). Each finished image is copied into the café's own storage ("Business
// Agent/Menu" in Drive or OneDrive, or R2), since Higgsfield keeps it only a week. Admins only.
// And the menu itself from Square, when that's where it comes from (settings.menu_source): its item
// library read on demand, as soon as Square says it changed (its catalog webhook) and at the business's
// chosen refresh rate as a safety net, into the menu items (sync_square_menu()); and a price changed
// here sent back to Square (pushSquarePrices()), so the till charges what the menu says.
import { Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import { bearer, businessDb, requestDb, serviceClient, type Env } from './supabase'
import { higgsfieldKey, markBroken, setIntegration, squareSession } from './connections'
import { hmacHex, safeEqual, seal } from './crypto'
import { storeMedia } from './media'
import { pushGoogleMenu } from './integrations'
import * as higgsfield from './providers/higgsfield'
import * as square from './providers/square'
import { fromSquareCatalog, squarePriceChanges, type SquareMenuItem } from '../shared/menuSquare'
import { squareShelfChanges } from '../shared/freshBatches'
import { businessConfig } from '../shared/business.config'
import { defaultNumberFormat } from '../shared/time'
import {
  MAX_PROMPT, aiRequest, buildPrompt, menuSections, modelOf, photoPrompt, readAiResult, imageShape, type AiModel, type AiResult, type MenuDesign, type MenuImage, type MenuItem,
  type PricePush,
} from '../shared/menu'
import type { BrandColour } from '../shared/types'
import { signInCheck, signedInUser } from './signedIn'

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
  const [{ data: user }, { data: isAdmin }] = await Promise.all([signedInUser(c.env, token), signInCheck(c.env, token, 'is_admin')])
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
  if (!c.env.INTEGRATION_KEY) return c.json({ error: 'The Business Agent can’t keep keys yet: INTEGRATION_KEY isn’t set (see docs/INTEGRATIONS.md).' }, 500)
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
  const done = data as { added: number; changed: number; off: number }
  // The items' shelf lives (a "Shelf life" custom attribute in Square), for Stock's Freshly made.
  await squareShelfLives(db, read.items).catch(e => console.error('square shelf lives failed', message(e)))
  // Something changed: the Google Maps listing's menu follows straight away (a refusal shows on the Menu page).
  if (done.added || done.changed || done.off) await pushGoogleMenu(env, db).catch(e => console.error('google menu failed', message(e)))
  return { ...done, items: read.items.length }
}

/**
 * Square's shelf lives into the menu items' (Stock's Freshly made, the `fresh_items` migration): set from
 * the item's "Shelf life" custom attribute while Square has one, kept as set here once it hasn't.
 */
async function squareShelfLives(db: SupabaseClient, read: SquareMenuItem[]) {
  const [recipes, items] = await Promise.all([
    db.from('recipes').select('id, square_id').not('square_id', 'is', null),
    db.from('fresh_items').select('id, recipe_id, shelf_life_hours, offer_hours, from_square'),
  ])
  if (recipes.error || items.error) throw new Error((recipes.error ?? items.error)!.message)
  const { add, change, release } = squareShelfChanges(read, recipes.data ?? [], items.data ?? [])
  const fail = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message) }
  if (add.length) fail(await db.from('fresh_items').insert(add))
  for (const c of change) fail(await db.from('fresh_items').update(c.patch).eq('id', c.id))
  if (release.length) fail(await db.from('fresh_items').update({ from_square: false }).in('id', release))
}

/** At the business's refresh rate (the cron), and when Square says its item library changed, while the menu comes from Square. */
export async function syncSquareMenuIfChosen(env: Env, db: SupabaseClient) {
  const { data } = await db.from('settings').select('menu_source').eq('id', 1).maybeSingle()
  if (data?.menu_source !== 'square') return
  await syncSquareMenu(env, db).catch(e => console.error('square menu failed', message(e)))
}

// Prices changed here, to Square now (the Menu page, straight after saving one; the cron catches the
// rest every minute, such as a change made through the AI connector).
menu.post('/api/menu/square/prices', async c => {
  try {
    return c.json(await pushSquarePrices(c.env, await requestDb(c)))
  } catch (e) {
    return c.json({ error: message(e) }, status(e))
  }
})

/** Tries before a change Square keeps not answering is given up on (one a minute). */
const PRICE_TRIES = 5
/** What the Menu page says when the connection can't change items yet. */
export const RECONNECT_FOR_PRICES = 'Connect Square again on the Connections page so the app can change prices in Square (it asks for that permission now). Until then, Square’s price stays.'

interface Waiting { recipe_id: string; price: number | null; queued_at: string; tries: number }
interface Priced { id: string; name: string; square_id: string | null; sell_price: number | null }

/**
 * Menu prices changed here, while the menu comes from Square, into the Square item library (the
 * `square_price_write_back` migration queues them). Each item's variations are read from Square first and
 * only the prices that differ are sent, with their versions. Sent: off the list. Refused (no permission
 * to change items, gone from Square, no price): kept with why for the Menu page, and Square's price comes
 * back with the next read. Square not answering: tried again next minute, a few times.
 */
export async function pushSquarePrices(env: Env, db: SupabaseClient): Promise<PricePush> {
  const done: PricePush = { sent: 0, refused: [], waiting: 0 }
  const { data: waiting, error } = await db.from('square_price_pushes').select('recipe_id, price, queued_at, tries').is('error', null).order('queued_at').limit(25)
  if (error) throw new Error(error.message)
  if (!waiting?.length) return done
  const ids = (waiting as Waiting[]).map(w => w.recipe_id)
  const [{ data: settings }, { data: integration }] = await Promise.all([
    db.from('settings').select('menu_source').eq('id', 1).maybeSingle(),
    db.from('integrations').select('status').eq('provider', 'square').maybeSingle(),
  ])
  // Kept here again (Custom): nothing goes to Square.
  if (settings?.menu_source !== 'square') {
    await db.from('square_price_pushes').delete().in('recipe_id', ids).is('error', null)
    return done
  }
  const [{ data: rows, error: e2 }, { data: variants, error: e3 }] = await Promise.all([
    db.from('recipes').select('id, name, square_id, sell_price').in('id', ids),
    db.from('recipe_variants').select('recipe_id, name, price_change').in('recipe_id', ids),
  ])
  if (e2 || e3) throw new Error((e2 ?? e3)!.message)
  const items = new Map(((rows ?? []) as Priced[]).map(r => [r.id, r]))
  const variantsOf = (id: string) => ((variants ?? []) as { recipe_id: string; name: string; price_change: number }[])
    .filter(v => v.recipe_id === id).map(v => ({ name: v.name, price_change: Number(v.price_change) }))
  const refuse = async (w: Waiting, why: string) => {
    await db.from('square_price_pushes').update({ error: why.slice(0, 500), failed_at: new Date().toISOString() }).eq('recipe_id', w.recipe_id).eq('queued_at', w.queued_at)
    done.refused.push({ id: w.recipe_id, name: items.get(w.recipe_id)?.name ?? '', error: why })
  }
  if (integration?.status !== 'connected') {
    for (const w of waiting as Waiting[]) await refuse(w, 'Square isn’t connected, so the price couldn’t be changed there. Connect it on the Connections page.')
    return done
  }
  let s
  try {
    s = await squareSession(env, db)
  } catch (e) {
    // Its sign-in has gone (Connections shows it), or Square isn't set up: nothing will send until that's fixed.
    if (!/^invalid_grant|not set up/.test(message(e))) throw e
    for (const w of waiting as Waiting[]) await refuse(w, 'Square needs connecting again (Connections), so the price couldn’t be changed there.')
    return done
  }
  let objects
  try {
    objects = new Map((await square.catalogObjects(s.sandbox, s.token, [...new Set([...items.values()].map(r => r.square_id).filter((x): x is string => !!x))]))
      .map(o => [o.id, o]))
  } catch (e) {
    if (e instanceof square.SquareError && e.code === 'INSUFFICIENT_SCOPES') {
      for (const w of waiting as Waiting[]) await refuse(w, RECONNECT_FOR_PRICES)
      return done
    }
    throw e
  }
  for (const w of waiting as Waiting[]) {
    const item = items.get(w.recipe_id)
    // The item went (deleted here): nothing to send. Its row went with it.
    if (!item?.square_id) { await db.from('square_price_pushes').delete().eq('recipe_id', w.recipe_id).eq('queued_at', w.queued_at); continue }
    const { changes, problem } = squarePriceChanges(objects.get(item.square_id),
      { sell_price: item.sell_price === null ? null : Number(item.sell_price), variants: variantsOf(item.id) })
    if (problem) { await refuse(w, problem); continue }
    try {
      if (changes.length) await square.upsertVariations(s.sandbox, s.token, `price:${w.recipe_id}:${Date.parse(w.queued_at)}`, changes.map(c => c.variation))
      // Sent (or already Square's): off the list, unless it changed again meanwhile (then it goes next).
      await db.from('square_price_pushes').delete().eq('recipe_id', w.recipe_id).eq('queued_at', w.queued_at)
      if (changes.length) done.sent += 1
    } catch (e) {
      const code = e instanceof square.SquareError ? e.code : undefined
      const status = e instanceof square.SquareError ? e.status : undefined
      if (code === 'INSUFFICIENT_SCOPES') { await refuse(w, RECONNECT_FOR_PRICES); continue }
      // Square changed the item meanwhile, didn't answer or was busy: again next minute, a few times.
      const again = code === 'VERSION_MISMATCH' || status === undefined || status >= 500 || status === 429
      if (again && w.tries + 1 < PRICE_TRIES) {
        await db.from('square_price_pushes').update({ tries: w.tries + 1 }).eq('recipe_id', w.recipe_id).eq('queued_at', w.queued_at)
        done.waiting += 1
      } else await refuse(w, message(e).replace(/^invalid_grant: /, 'Square: '))
    }
  }
  return done
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
      const [{ data: business }, { data: items }, { data: settings }] = await Promise.all([db.from('business').select('name, country').maybeSingle(), db.rpc('menu_list'),
        db.from('settings').select('menu_sections').eq('id', 1).maybeSingle()])
      // Prices as the business's country writes them on a menu ("3,20 €" in Spain, "€3.20" in Ireland), whoever is making it.
      prompt = buildPrompt(words, { mode: d.mode, style: d.style, format: d.format, size: d.size, title: d.title ?? business?.name ?? businessConfig.name, subtitle: d.subtitle,
        footer: d.footer, sections: menuSections((items ?? []) as MenuItem[], { only: d.categories, order: settings?.menu_sections ?? [] }),
        numbers: defaultNumberFormat(business?.country as string | null | undefined) })
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
