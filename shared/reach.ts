// How shift alerts will actually reach someone, given how they prefer to be contacted and what the
// business has connected. Same rules as _enqueue_whatsapp() in migration 26: people who prefer
// email get an email when a mailbox is connected; everyone else (and email people until then) gets
// WhatsApp if they switched it on and have a mobile number.
import { optionName } from './connections'
import type { Integration, Profile } from './types'

export interface Reach { ok: boolean; text: string }

export function howReached(p: Pick<Profile, 'email' | 'phone' | 'whatsapp_opt_in' | 'contact_method'>, integrations: Pick<Integration, 'provider' | 'status' | 'account_label'>[]): Reach {
  const on = (provider: string) => integrations.find(i => i.provider === provider && i.status === 'connected')
  const mailbox = on('gmail') ?? on('outlook')
  const whatsapp = (): Reach => {
    if (!p.whatsapp_opt_in) return { ok: false, text: 'WhatsApp messages are off (they switch them on under My account)' }
    if (!p.phone) return { ok: false, text: 'No mobile number for WhatsApp' }
    if (!on('whatsapp')) return { ok: false, text: 'WhatsApp isn’t connected yet (Connections)' }
    return { ok: true, text: `WhatsApp to ${p.phone}` }
  }
  const meanwhile = () => {
    const w = whatsapp()
    return w.ok ? `Until then: ${w.text}.` : 'Until then they get no alerts.'
  }
  if (p.contact_method === 'email') {
    if (p.email && mailbox) return { ok: true, text: `Email to ${p.email}, from ${mailbox.account_label ?? optionName(mailbox.provider)}` }
    return { ok: false, text: `Prefers email, but ${p.email ? 'no mailbox is connected (Connections → Email)' : 'has no email address'}. ${meanwhile()}` }
  }
  if (p.contact_method === 'sms') return { ok: false, text: `Prefers text messages, which are coming soon. ${meanwhile()}` }
  return whatsapp()
}
