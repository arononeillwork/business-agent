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

export interface WebhookEvents {
  statuses: { id: string; status: string; error?: string }[]
  messages: { from: string; text: string }[]
}

export function parseWebhook(body: unknown): WebhookEvents {
  const out: WebhookEvents = { statuses: [], messages: [] }
  const entries = (body as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] })?.entry ?? []
  for (const e of entries) for (const c of e.changes ?? []) {
    const v = c.value ?? {}
    for (const s of (v.statuses as { id: string; status: string; errors?: { title?: string }[] }[] | undefined) ?? []) {
      out.statuses.push({ id: s.id, status: s.status, error: s.errors?.[0]?.title })
    }
    for (const m of (v.messages as { from: string; type: string; text?: { body: string }; button?: { text: string } }[] | undefined) ?? []) {
      out.messages.push({ from: m.from, text: m.text?.body ?? m.button?.text ?? '' })
    }
  }
  return out
}
