// WhatsApp Business Platform (Cloud API), direct from Meta.
// Proactive messages must use templates approved in WhatsApp Manager (see docs/INTEGRATIONS.md).
import { hmacHex, safeEqual } from '../crypto'

export interface WhatsAppConfig {
  token: string            // system-user access token
  phoneNumberId: string    // the business number's id in WhatsApp Manager
  graphVersion: string     // e.g. v23.0
  language: string         // template language, e.g. es
}

export function templateBody(to: string, template: string, params: string[], language: string) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: template,
      language: { code: language },
      components: params.length ? [{ type: 'body', parameters: params.map(text => ({ type: 'text', text: text.slice(0, 1024) })) }] : [],
    },
  }
}

/** Sends a template message. Returns the WhatsApp message id. */
export async function sendTemplate(cfg: WhatsAppConfig, to: string, template: string, params: string[]) {
  const res = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(templateBody(to, template, params, cfg.language)),
  })
  const json = await res.json() as { messages?: { id: string }[]; error?: { message: string; code?: number } }
  if (!res.ok || !json.messages?.[0]) throw new Error(json.error?.message ?? `WhatsApp error ${res.status}`)
  return json.messages[0].id
}

/** Sends a free-form text: allowed within 24 hours of the person's last message. Returns the message id. */
export async function sendText(cfg: WhatsAppConfig, to: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text, preview_url: false } }),
  })
  const json = await res.json() as { messages?: { id: string }[]; error?: { message: string; code?: number } }
  if (!res.ok || !json.messages?.[0]) throw new Error(json.error?.message ?? `WhatsApp error ${res.status}`)
  return json.messages[0].id
}

/** The biggest photo, video, voice note or file kept from a chat (WhatsApp's own limit for documents is 100 MB). */
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024

/**
 * A photo, video, voice note or file someone sent: Meta gives an id, then a short-lived address that
 * needs the token. Throws when it's gone or bigger than MAX_MEDIA_BYTES.
 */
export async function downloadMedia(cfg: WhatsAppConfig, mediaId: string) {
  const res = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${encodeURIComponent(mediaId)}`, { headers: { authorization: `Bearer ${cfg.token}` } })
  const info = await res.json() as { url?: string; mime_type?: string; file_size?: number; error?: { message: string } }
  if (!res.ok || !info.url) throw new Error(info.error?.message ?? `WhatsApp error ${res.status}`)
  if ((info.file_size ?? 0) > MAX_MEDIA_BYTES) throw new Error(`Too big to keep (over ${MAX_MEDIA_BYTES / 1024 / 1024} MB)`)
  const file = await fetch(info.url, { headers: { authorization: `Bearer ${cfg.token}` } })
  if (!file.ok) throw new Error(`WhatsApp error ${file.status} downloading the file`)
  const bytes = await file.arrayBuffer()
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error(`Too big to keep (over ${MAX_MEDIA_BYTES / 1024 / 1024} MB)`)
  return { bytes, type: (info.mime_type ?? file.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim() }
}

/** Is the café's WhatsApp number still reachable with this token? Returns its display number. */
export async function phoneNumber(cfg: WhatsAppConfig) {
  const res = await fetch(`https://graph.facebook.com/${cfg.graphVersion}/${cfg.phoneNumberId}?fields=display_phone_number,verified_name`, {
    headers: { authorization: `Bearer ${cfg.token}` },
  })
  const json = await res.json() as { display_phone_number?: string; verified_name?: string; error?: { message: string } }
  if (!res.ok) throw new Error(json.error?.message ?? `WhatsApp error ${res.status}`)
  return json.display_phone_number ?? json.verified_name ?? cfg.phoneNumberId
}

/** Meta signs webhook bodies with the app secret: X-Hub-Signature-256: sha256=<hex>. */
export async function verifySignature(appSecret: string, rawBody: string, header: string | null | undefined) {
  if (!header?.startsWith('sha256=')) return false
  return safeEqual(header.slice(7), await hmacHex(appSecret, rawBody))
}

/** A message someone sent the café, as the Messages page keeps it. */
export interface Inbound {
  id: string
  from: string
  /** Their WhatsApp profile name, when Meta sends it. */
  name?: string
  at: string
  kind: 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'other'
  text: string
  link?: string
  media?: { id: string; type?: string }
}

export interface WebhookEvents {
  statuses: { id: string; status: string; error?: string }[]
  messages: { from: string; text: string }[]
  /** Every message, in full (reactions apart). */
  inbound: Inbound[]
  /** A reaction to one of the café's messages (an empty emoji takes it back). */
  reactions: { from: string; to: string; emoji: string }[]
}

type WaMessage = {
  id: string; from: string; timestamp?: string; type: string
  text?: { body: string }
  button?: { text: string }
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string; description?: string } }
  image?: { id: string; mime_type?: string; caption?: string }
  video?: { id: string; mime_type?: string; caption?: string }
  audio?: { id: string; mime_type?: string }
  sticker?: { id: string; mime_type?: string }
  document?: { id: string; mime_type?: string; caption?: string; filename?: string }
  location?: { latitude: number; longitude: number; name?: string; address?: string }
  contacts?: { name?: { formatted_name?: string }; phones?: { phone?: string }[] }[]
  reaction?: { message_id: string; emoji?: string }
}

/** One message in full: what it says, and the photo, voice note or file it carries. */
function inboundOf(m: WaMessage, name?: string): Inbound {
  const at = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString()
  const base = { id: m.id, from: m.from, ...(name ? { name } : {}), at }
  const media = (x: { id: string; mime_type?: string }) => ({ id: x.id, ...(x.mime_type ? { type: x.mime_type } : {}) })
  switch (m.type) {
    case 'text': return { ...base, kind: 'text', text: m.text?.body ?? '' }
    case 'button': return { ...base, kind: 'text', text: m.button?.text ?? '' }
    case 'interactive': return { ...base, kind: 'text', text: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '' }
    case 'image': return m.image ? { ...base, kind: 'image', text: m.image.caption ?? '', media: media(m.image) } : { ...base, kind: 'other', text: '' }
    case 'sticker': return m.sticker ? { ...base, kind: 'image', text: '', media: media(m.sticker) } : { ...base, kind: 'other', text: '' }
    case 'video': return m.video ? { ...base, kind: 'video', text: m.video.caption ?? '', media: media(m.video) } : { ...base, kind: 'other', text: '' }
    case 'audio': return m.audio ? { ...base, kind: 'audio', text: '', media: media(m.audio) } : { ...base, kind: 'other', text: '' }
    case 'document': return m.document
      ? { ...base, kind: 'file', text: [m.document.filename, m.document.caption].filter(Boolean).join('\n'), media: media(m.document) }
      : { ...base, kind: 'other', text: '' }
    case 'location': {
      const l = m.location
      if (!l) return { ...base, kind: 'other', text: '' }
      return { ...base, kind: 'location', text: [l.name, l.address].filter(Boolean).join(', '),
        link: `https://www.google.com/maps/search/?api=1&query=${l.latitude},${l.longitude}` }
    }
    case 'contacts': return { ...base, kind: 'text',
      text: (m.contacts ?? []).map(c => [c.name?.formatted_name, c.phones?.[0]?.phone].filter(Boolean).join(' ')).join('\n') }
    default: return { ...base, kind: 'other', text: '' }
  }
}

export function parseWebhook(body: unknown): WebhookEvents {
  const out: WebhookEvents = { statuses: [], messages: [], inbound: [], reactions: [] }
  const entries = (body as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] })?.entry ?? []
  for (const e of entries) for (const c of e.changes ?? []) {
    const v = c.value ?? {}
    for (const s of (v.statuses as { id: string; status: string; errors?: { title?: string }[] }[] | undefined) ?? []) {
      out.statuses.push({ id: s.id, status: s.status, error: s.errors?.[0]?.title })
    }
    const names = new Map(((v.contacts as { wa_id?: string; profile?: { name?: string } }[] | undefined) ?? [])
      .filter(x => x.wa_id && x.profile?.name).map(x => [x.wa_id!, x.profile!.name!]))
    for (const m of (v.messages as WaMessage[] | undefined) ?? []) {
      out.messages.push({ from: m.from, text: m.text?.body ?? m.button?.text ?? '' })
      if (m.type === 'reaction') {
        if (m.reaction?.message_id) out.reactions.push({ from: m.from, to: m.reaction.message_id, emoji: m.reaction.emoji ?? '' })
        continue
      }
      if (m.id) out.inbound.push(inboundOf(m, names.get(m.from)))
    }
  }
  return out
}
