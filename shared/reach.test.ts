import { describe, expect, it } from 'vitest'
import { howReached } from './reach'

const person = { email: 'maria@example.com', phone: '+34 600 111 222', whatsapp_opt_in: true, contact_method: null }
const gmail = { provider: 'gmail' as const, status: 'connected' as const, account_label: 'cafe@gmail.com' }
const whatsapp = { provider: 'whatsapp' as const, status: 'connected' as const, account_label: '+34 695 415 335' }

describe('how shift alerts reach someone', () => {
  it('email people get email from the connected mailbox', () => {
    expect(howReached({ ...person, contact_method: 'email' }, [gmail, whatsapp])).toEqual({ ok: true, text: 'Email to maria@example.com, from cafe@gmail.com' })
  })

  it('email people fall back to WhatsApp while no mailbox is connected', () => {
    expect(howReached({ ...person, contact_method: 'email' }, [whatsapp]))
      .toEqual({ ok: false, text: 'Prefers email, but no mailbox is connected (Connections → Email). Until then: WhatsApp to +34 600 111 222.' })
    expect(howReached({ ...person, contact_method: 'email', whatsapp_opt_in: false }, [whatsapp]).text).toMatch(/Until then they get no alerts/)
  })

  it('WhatsApp needs their consent, a number and WhatsApp connected', () => {
    expect(howReached({ ...person, contact_method: 'whatsapp' }, [whatsapp])).toEqual({ ok: true, text: 'WhatsApp to +34 600 111 222' })
    expect(howReached({ ...person, whatsapp_opt_in: false }, [whatsapp]).ok).toBe(false)
    expect(howReached({ ...person, phone: null }, [whatsapp]).text).toBe('No mobile number for WhatsApp')
    expect(howReached(person, [{ ...whatsapp, status: 'error' }]).text).toMatch(/isn’t connected/)
  })

  it('text messages are coming soon: says so, and what happens meanwhile', () => {
    expect(howReached({ ...person, contact_method: 'sms' }, [whatsapp]))
      .toEqual({ ok: false, text: 'Prefers text messages, which are coming soon. Until then: WhatsApp to +34 600 111 222.' })
  })
})
