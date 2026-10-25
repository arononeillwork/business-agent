// WhatsApp chats for the Messages page. Meta never lets an app read WhatsApp messages back, so each
// one is saved as it happens: what people send arrives on the webhook, the café's replies and alerts
// are saved as they're sent. Photos, videos, voice notes and files are copied into private storage
// (Meta keeps them only for a while) and handed to the page as short-lived signed links. Everything
// is deleted once it's older than the time chosen under Data retention (migration 47).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Env } from './supabase'
import * as whatsapp from './providers/whatsapp'
import { waConfig } from './connections'
import { DEFAULT_WHATSAPP_RETENTION, isRetention, type InboxConversation, type InboxMessage, type InboxThread } from '../shared/messages'

export const BUCKET = 'whatsapp-media'
/** How long a photo's signed link works (the page reads the chat again well before then). */
const LINK_SECONDS = 60 * 60
/** The latest messages of each chat that the chat list carries (enough for previews and filters). */
const RECENT = 5
/** The most messages the chat list reads at once, and one chat shows. */
const LIST_LIMIT = 2000
const THREAD_LIMIT = 500

export interface Row {
  id: number
  wa_message_id: string
  wa_id: string
  name: string | null
  from_me: boolean
  kind: 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'other'
  body: string
  link: string | null
  media_id: string | null
  media_type: string | null
  media_path: string | null
  media_error: string | null
  reaction: string | null
  status: 'sent' | 'delivered' | 'read' | 'failed' | null
  error: string | null
  at: string
}

/** The café's alert templates (docs/INTEGRATIONS.md), so the chat shows what staff actually received. */
const TEMPLATES: Record<string, string> = {
  shift_reminder: 'Hola {{1}}, tu turno empieza a las {{2}} ({{3}}). ¡Hasta ahora!',
  missed_clock_in: 'Hola {{1}}, tu turno empezó a las {{2}} y no has fichado. ¿Todo bien?',
  missed_clock_in_admin: '{{1}} no ha fichado para el turno de las {{2}}.',
  rota_published: 'Hola {{1}}, tus turnos de la semana del {{2}}: {{3}}',
  time_off_requested: '{{1}} ha pedido tiempo libre: {{2}} ({{3}}). Revísalo en la app.',
  time_off_decided: 'Hola {{1}}, tu solicitud para {{2}} ha sido {{3}}.',
}

/** A template message as the person saw it (or its name and values, for one the app doesn't know). */
export function templateText(template: string, params: string[]) {
  const body = TEMPLATES[template]
  if (!body) return [template, ...params].join(' · ')
  return body.replace(/\{\{(\d+)\}\}/g, (all, n: string) => params[Number(n) - 1] ?? all)
}

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

/** A team member with this WhatsApp number, for naming the chat (null when it's someone else). */
async function teamName(db: SupabaseClient, waId: string) {
  const { data } = await db.from('profiles').select('full_name, phone')
  return ((data ?? []) as { full_name: string; phone: string | null }[]).find(p => digits(p.phone) === waId)?.full_name ?? null
}

/** Save what came in on the webhook. Returns the new messages that carry a photo, video, voice note or file. */
export async function saveInbound(db: SupabaseClient, events: whatsapp.WebhookEvents) {
  const rows = events.inbound.filter(m => /^[0-9]{6,20}$/.test(m.from)).map(m => ({
    wa_message_id: m.id, wa_id: m.from, name: m.name?.slice(0, 200) ?? null, from_me: false, kind: m.kind,
    body: m.text.slice(0, 4096), link: m.link ?? null, media_id: m.media?.id ?? null, media_type: m.media?.type ?? null, at: m.at,
  }))
  let saved: Row[] = []
  if (rows.length) {
    // Meta can deliver the same message twice: the second copy changes nothing.
    const { data, error } = await db.from('whatsapp_messages').upsert(rows, { onConflict: 'wa_message_id', ignoreDuplicates: true }).select()
    if (error) throw new Error(error.message)
    saved = (data ?? []) as Row[]
  }
  for (const r of events.reactions) {
    await db.from('whatsapp_messages').update({ reaction: r.emoji || null }).eq('wa_message_id', r.to)
  }
  for (const s of events.statuses) {
    if (!['sent', 'delivered', 'read', 'failed'].includes(s.status)) continue
    // Receipts can arrive out of order: never step back from read to delivered.
    const { data: row } = await db.from('whatsapp_messages').select('status').eq('wa_message_id', s.id).maybeSingle()
    if (!row) continue
    const rank = { sent: 1, delivered: 2, read: 3, failed: 4 } as Record<string, number>
    if ((rank[(row as { status: string | null }).status ?? ''] ?? 0) >= rank[s.status]) continue
    await db.from('whatsapp_messages').update({ status: s.status, ...(s.error ? { error: s.error } : {}) }).eq('wa_message_id', s.id)
  }
  return saved.filter(r => r.media_id)
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/3gpp': '3gp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'application/pdf': 'pdf',
}

/** Store a file in the private bucket, making the bucket the first time. */
async function upload(db: SupabaseClient, path: string, bytes: ArrayBuffer, type: string) {
  const put = () => db.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true })
  let { error } = await put()
  if (error && /bucket not found|not.?found/i.test(error.message)) {
    const made = await db.storage.createBucket(BUCKET, { public: false })
    if (made.error && !/already exists/i.test(made.error.message)) throw new Error(made.error.message)
    ;({ error } = await put())
  }
  if (error) throw new Error(error.message)
}

/** Copy one message's photo, video, voice note or file from Meta into storage (or note why it couldn't). */
export async function saveMedia(env: Env, db: SupabaseClient, row: Pick<Row, 'id' | 'wa_id' | 'media_id' | 'media_type' | 'at'>) {
  const cfg = waConfig(env)
  if (!cfg || !row.media_id) return
  try {
    const file = await whatsapp.downloadMedia(cfg, row.media_id)
    const path = `${row.at.slice(0, 10)}/${row.wa_id}/${row.id}.${EXT[file.type] ?? 'bin'}`
    await upload(db, path, file.bytes, file.type)
    await db.from('whatsapp_messages').update({ media_path: path, media_type: file.type, media_error: null }).eq('id', row.id)
  } catch (e) {
    await db.from('whatsapp_messages').update({ media_error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).eq('id', row.id)
  }
}

/** Keep a message the café sent (a reply from the Messages page, or an alert from the outbox). */
export async function saveOutgoing(db: SupabaseClient, m: { id: string; to: string; text: string }) {
  const waId = digits(m.to)
  if (!/^[0-9]{6,20}$/.test(waId)) return
  const { error } = await db.from('whatsapp_messages').upsert({
    wa_message_id: m.id, wa_id: waId, name: await teamName(db, waId), from_me: true, kind: 'text', body: m.text.slice(0, 4096), status: 'sent', at: new Date().toISOString(),
  }, { onConflict: 'wa_message_id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

/** Signed links for saved files, by path. */
async function links(db: SupabaseClient, rows: Row[]) {
  const paths = [...new Set(rows.map(r => r.media_path).filter((p): p is string => !!p))]
  if (!paths.length) return new Map<string, string>()
  const { data } = await db.storage.from(BUCKET).createSignedUrls(paths, LINK_SECONDS)
  return new Map<string, string>((data ?? []).filter(d => d.path && d.signedUrl).map(d => [d.path!, d.signedUrl!]))
}

function message(r: Row, url?: string): InboxMessage {
  return {
    id: r.wa_message_id, at: r.at, fromMe: r.from_me, kind: r.kind,
    // A file shows its name; a photo whose copy failed says so rather than showing nothing.
    text: r.body || (r.media_id && !r.media_path && r.media_error ? `(${r.media_error})` : ''),
    ...(url ? { mediaUrl: url } : {}),
    ...(r.link ? { link: r.link } : {}),
    ...(r.reaction ? { reactions: [r.reaction] } : {}),
    ...(r.status ? { status: r.status } : {}),
    ...(r.error ? { error: r.error } : {}),
  }
}

/** Who a chat is with: the latest name we have for them, else their number. */
function who(waId: string, rows: Row[]): InboxConversation['with'] {
  const name = rows.find(r => r.name)?.name ?? undefined
  return { id: waId, username: `+${waId}`, ...(name ? { name } : {}) }
}

/** Every saved chat, the one with the newest message first. */
export async function conversations(db: SupabaseClient): Promise<InboxConversation[]> {
  const { data, error } = await db.from('whatsapp_messages').select('*').order('at', { ascending: false }).limit(LIST_LIMIT)
  if (error) throw new Error(error.message)
  const chats = new Map<string, Row[]>()
  for (const r of (data ?? []) as Row[]) chats.set(r.wa_id, [...chats.get(r.wa_id) ?? [], r])
  return [...chats].map(([waId, rows]) => ({
    id: waId, platform: 'whatsapp' as const, with: who(waId, rows), updatedAt: rows[0].at, recent: rows.slice(0, RECENT).map(r => message(r)),
  }))
}

/** One chat, oldest message first, with links to its photos and voice notes. */
export async function thread(db: SupabaseClient, waId: string): Promise<InboxThread> {
  const { data, error } = await db.from('whatsapp_messages').select('*').eq('wa_id', waId).order('at', { ascending: false }).limit(THREAD_LIMIT)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Row[]
  const urls = await links(db, rows)
  const messages = rows.map(r => message(r, r.media_path ? urls.get(r.media_path) : undefined)).reverse()
  return {
    conversation: { id: waId, platform: 'whatsapp', with: who(waId, rows), updatedAt: rows[0]?.at ?? new Date().toISOString(), recent: messages.slice(-RECENT).reverse() },
    messages,
  }
}

/** Delete messages older than the chosen time, and their files. Returns how many went. */
export async function purge(db: SupabaseClient) {
  const { data, error } = await db.rpc('purge_whatsapp_messages')
  if (error) throw new Error(error.message)
  const gone = (data ?? []) as (string | null)[]
  const paths = gone.filter((p): p is string => !!p)
  // Storage takes a limited number of paths per call.
  for (let i = 0; i < paths.length; i += 500) {
    const { error: e } = await db.storage.from(BUCKET).remove(paths.slice(i, i + 500))
    if (e) console.error('whatsapp media purge failed', e.message)
  }
  return gone.length
}

/** The time chosen under Data retention, in days. */
export async function retention(db: SupabaseClient) {
  const { data } = await db.from('settings').select('whatsapp_retention_days').eq('id', 1).maybeSingle()
  const days = (data as { whatsapp_retention_days?: number } | null)?.whatsapp_retention_days
  return isRetention(days) ? days : DEFAULT_WHATSAPP_RETENTION
}

/**
 * Change how long chats are kept; anything now too old is deleted straight away. The setting is
 * saved as the admin (`asAdmin`, so the audit log says who), the deleting done by the Worker (`db`).
 */
export async function setRetention(asAdmin: SupabaseClient, db: SupabaseClient, days: number) {
  if (!isRetention(days)) throw new Error('Choose 1 month, 3 months, 6 months, 1 year or 2 years')
  const { error } = await asAdmin.from('settings').update({ whatsapp_retention_days: days }).eq('id', 1)
  if (error) throw new Error(error.message)
  return { days, deleted: await purge(db) }
}
