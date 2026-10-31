import { describe, expect, it } from 'vitest'
import {
  applyEmailQuery, gmailLink, gmailSearch, hasWord, isBookingEmail, isInvoiceEmail, matchesEmailFilter, supplierSenders, type EmailMessage,
} from './email'

const email = (p: Partial<EmailMessage>): EmailMessage => ({
  id: 'm', thread_id: 't', from: 'someone@example.com', from_name: null, to: 'cafe@gmail.com', subject: '', snippet: '', at: '2026-09-29T08:00:00Z',
  unread: false, starred: false, important: false, labels: [], attachments: [], link: '', supplier_id: null, customer_id: null, customer_name: null, ...p,
})
const pdf = (name: string) => ({ name, size: 80_000, type: 'application/pdf' })

describe('the words that sort the mailbox', () => {
  it('finds whole words, in either language, whatever the accents and capitals', () => {
    expect(hasWord('Su FACTURA de septiembre', ['factura'])).toBe(true)
    expect(hasWord('Factura_F2026-0142.pdf', ['factura'])).toBe(true)
    expect(hasWord('Departamento de facturación', ['factura'])).toBe(false) // a department, not an invoice
    expect(hasWord('Reserva para el sábado', ['reserva'])).toBe(true)
    expect(hasWord('Préstamo', ['prestamo'])).toBe(true)
  })

  it('invoices and receipts: a file attached, and the email or the file says so', () => {
    expect(isInvoiceEmail(email({ subject: 'Factura F2026-0158', attachments: [pdf('F2026-0158.pdf')] }))).toBe(true)
    expect(isInvoiceEmail(email({ subject: 'Your order', attachments: [pdf('Receipt SQ-88412.pdf')] }))).toBe(true) // the file's name
    expect(isInvoiceEmail(email({ subject: 'Tu recibo de Square', snippet: 'Gracias por tu compra', attachments: [pdf('SQ-88412.pdf')] }))).toBe(true)
    expect(isInvoiceEmail(email({ subject: 'Necesitamos las facturas de septiembre' }))).toBe(false) // asks for them, nothing attached
    expect(isInvoiceEmail(email({ subject: 'Presupuesto vasos 12oz', attachments: [pdf('Presupuesto EP-7741.pdf')] }))).toBe(false) // a quote
  })

  it('bookings and enquiries, in English or Spanish', () => {
    expect(isBookingEmail(email({ subject: 'Booking enquiry: baby shower for 15' }))).toBe(true)
    expect(isBookingEmail(email({ subject: 'Terraza', snippet: 'Quería reservar la terraza para un cumpleaños' }))).toBe(true)
    expect(isBookingEmail(email({ subject: 'New harvest: Colombia Huila samples' }))).toBe(false)
  })

  it('each chip keeps its own emails; Customers & bookings also takes anyone on Customers', () => {
    const fromLead = email({ subject: 'Re: office coffee', customer_id: 'c1' })
    expect(matchesEmailFilter(fromLead, 'customers')).toBe(true)
    expect(matchesEmailFilter(email({ subject: 'Re: office coffee' }), 'customers')).toBe(false)
    expect(matchesEmailFilter(email({ unread: true }), 'unread')).toBe(true)
    expect(matchesEmailFilter(email({ supplier_id: 's1' }), 'suppliers')).toBe(true)
    expect(matchesEmailFilter(email({ attachments: [pdf('menu.pdf')] }), 'attachments')).toBe(true)
  })

  it('the period, a supplier and what’s typed narrow the list too', () => {
    const now = Date.parse('2026-09-30T07:00:00Z')
    const list = [
      email({ id: 'new', subject: 'Factura septiembre', supplier_id: 's1', at: '2026-09-28T10:00:00Z' }),
      email({ id: 'old', subject: 'Factura julio', supplier_id: 's1', at: '2026-07-20T10:00:00Z' }),
      email({ id: 'other', subject: 'Pedido', supplier_id: 's2', at: '2026-09-29T10:00:00Z' }),
    ]
    expect(applyEmailQuery(list, { filter: 'all', days: 30 }, now).map(m => m.id)).toEqual(['new', 'other'])
    expect(applyEmailQuery(list, { filter: 'all', days: 90, supplier: 's1' }, now).map(m => m.id)).toEqual(['new', 'old'])
    expect(applyEmailQuery(list, { filter: 'all', days: 90, q: 'FACTURA julio' }, now).map(m => m.id)).toEqual(['old'])
  })
})

describe('asking Gmail', () => {
  const senders = { suppliers: ['tostadoresdelsur.es', 'pedidos@lacteos.example'], customers: ['hannah@example.de'] }

  it('received email from the period, with what each chip asks for', () => {
    expect(gmailSearch({ filter: 'all', days: 30, ...senders })).toBe('newer_than:30d -in:sent -in:drafts -in:chats')
    expect(gmailSearch({ filter: 'unread', days: 7, ...senders })).toContain('is:unread')
    expect(gmailSearch({ filter: 'invoices', days: 30, ...senders })).toContain('has:attachment {factura facturas invoice invoices receipt receipts recibo recibos}')
    expect(gmailSearch({ filter: 'suppliers', days: 30, ...senders })).toContain('{from:tostadoresdelsur.es from:pedidos@lacteos.example}')
    expect(gmailSearch({ filter: 'customers', days: 30, ...senders })).toMatch(/\{reserva .*enquiry .*from:hannah@example\.de\}/)
    expect(gmailSearch({ filter: 'all', days: 30, q: '  coffee\n machine ', ...senders })).toMatch(/ coffee machine$/)
  })

  it('nothing to ask when there’s no supplier address to look for', () => {
    expect(gmailSearch({ filter: 'suppliers', days: 30, suppliers: [], customers: [] })).toBeNull()
    expect(gmailSearch({ filter: 'all', days: 30, suppliers: [], customers: [], supplier: [] })).toBeNull()
    expect(gmailSearch({ filter: 'all', days: 30, suppliers: [], customers: [], supplier: ['by-eric.es'] })).toContain(' from:by-eric.es')
  })

  it('a supplier is looked for by its company domain, or its address when it writes from gmail.com and the like', () => {
    const s = { id: 's', active: true, tax_id: null }
    expect(supplierSenders({ ...s, email: 'pedidos@tostadoresdelsur.es', website: 'https://www.tostadoresdelsur.es' })).toEqual(['tostadoresdelsur.es'])
    expect(supplierSenders({ ...s, email: 'gmcash@gmail.com', website: 'gmcash.es' })).toEqual(['gmcash.es', 'gmcash@gmail.com'])
    expect(supplierSenders({ ...s, email: 'eric.bakes@hotmail.com', website: null })).toEqual(['eric.bakes@hotmail.com'])
    expect(supplierSenders({ ...s, email: null, website: null })).toEqual([])
  })

  it('opens a conversation in the café’s own Gmail account', () => {
    expect(gmailLink('18f2a', 'easybeanscafe@gmail.com')).toBe('https://mail.google.com/mail/?authuser=easybeanscafe%40gmail.com#all/18f2a')
    expect(gmailLink('18f2a')).toBe('https://mail.google.com/mail/u/0/#all/18f2a')
  })
})
