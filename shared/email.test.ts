import { describe, expect, it } from 'vitest'
import {
  applyEmailQuery, gmailLink, gmailSearch, hasWord, isBookingEmail, isInvoiceEmail, matchesEmailFilter, supplierSenders, type EmailMessage,
} from './email'
import {
  EMAIL_CSP, attachmentView, decodeEntities, emailDocument, htmlToText, messageId, mimeAddress, parseAddresses, placePictures, quotedReply, replyHtml,
  replyMime, replyRecipients, replySubject, sniffType, toBase64Url,
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

describe('an email opened in the app, and a reply', () => {
  const invoice = { from: 'facturacion@tostadores.es', from_name: 'Tostadores del Sur', reply_to: null,
    to: 'Easy Beans <CAFE@gmail.com>, Ana Ruiz <ana@tostadores.es>', cc: '"Ruiz, Bob" <bob@example.com>; ana@tostadores.es' }

  it('reads a list of addresses, names with commas and quotes included', () => {
    expect(parseAddresses('Ana Ruiz <Ana@X.es>, "Ruiz, Bob" <bob@y.com>; c@z.com, "Say \\"hi\\"" <d@z.com>, not an address, <E@Z.COM>')).toEqual([
      { name: 'Ana Ruiz', email: 'ana@x.es' }, { name: 'Ruiz, Bob', email: 'bob@y.com' }, { name: null, email: 'c@z.com' },
      { name: 'Say "hi"', email: 'd@z.com' }, { name: null, email: 'e@z.com' },
    ])
    expect(parseAddresses('')).toEqual([])
    expect(parseAddresses(null)).toEqual([])
  })

  it('a reply goes to who sent it (or the Reply-To); Reply all copies everyone else once, never the café itself', () => {
    expect(replyRecipients(invoice, 'cafe@gmail.com')).toEqual({ to: [{ name: 'Tostadores del Sur', email: 'facturacion@tostadores.es' }], cc: [] })
    expect(replyRecipients(invoice, 'cafe@gmail.com', true).cc).toEqual([{ name: 'Ana Ruiz', email: 'ana@tostadores.es' }, { name: 'Ruiz, Bob', email: 'bob@example.com' }])
    expect(replyRecipients({ ...invoice, reply_to: 'cobros@tostadores.es' }, 'cafe@gmail.com').to).toEqual([{ name: null, email: 'cobros@tostadores.es' }])
    // One the café sent itself (in the inbox too): back to who it went to.
    expect(replyRecipients({ ...invoice, from: 'cafe@gmail.com', from_name: null, cc: '' }, 'cafe@gmail.com').to).toEqual([{ name: 'Ana Ruiz', email: 'ana@tostadores.es' }])
  })

  it('"Re: " once', () => {
    expect(replySubject('Factura F2026-0158')).toBe('Re: Factura F2026-0158')
    expect(replySubject('RE: Factura')).toBe('RE: Factura')
    expect(replySubject('Re:Factura')).toBe('Re:Factura')
    expect(replySubject('AW: Rechnung')).toBe('AW: Rechnung')
    expect(replySubject('Reserva')).toBe('Re: Reserva') // not "Re" from "Reserva"
  })

  it('the reply as Gmail sends it: in the conversation, names and subjects in any language, nothing that breaks a header', () => {
    const raw = replyMime({ to: [{ name: 'Lácteos Costa del Sol', email: 'pedidos@lacteos.es' }], cc: [{ name: 'Ruiz, Bob', email: 'bob@y.com' }, { name: null, email: 'c@z.com' }],
      subject: 'Albarán semana 39\r\nBcc: someone@evil.example', text: 'Gracias.\nAron', inReplyTo: 'abc@lacteos.es', references: '<a@x> junk <b@x> <abc@lacteos.es>' })
    const [head, body] = raw.split('\r\n\r\n')
    const lines = head.split('\r\n')
    expect(lines[0]).toBe(`To: =?UTF-8?B?${Buffer.from('Lácteos Costa del Sol').toString('base64')}?= <pedidos@lacteos.es>`)
    expect(lines[1]).toBe('Cc: "Ruiz, Bob" <bob@y.com>,')
    expect(lines[2]).toBe(' c@z.com')
    // A subject in another language: short encoded words, folded; what it said, all on the one header (no Bcc sneaks in).
    const subject = head.match(/\r\nSubject: ((?:[^\r]*)(?:\r\n [^\r]*)*)/)![1].split('\r\n ')
    expect(subject.every(w => /^=\?UTF-8\?B\?[\w+/=]+\?=$/.test(w) && w.length <= 75)).toBe(true)
    expect(subject.map(w => Buffer.from(w.slice(10, -2), 'base64').toString()).join('')).toBe('Re: Albarán semana 39 Bcc: someone@evil.example')
    expect(lines.some(l => l.startsWith('Bcc'))).toBe(false)
    expect(lines).toContain('In-Reply-To: <abc@lacteos.es>')
    expect(head).toContain('References: <a@x>\r\n <b@x>\r\n <abc@lacteos.es>\r\n')
    expect(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString()).toBe('Gracias.\r\nAron')
    // Plain ASCII as it is; no In-Reply-To without the email's id.
    const plain = replyMime({ to: [{ name: null, email: 'a@b.es' }], cc: [], subject: 'Presupuesto vasos compostables 12 oz', text: 'x', inReplyTo: null, references: null })
    expect(plain).toContain('\r\nSubject: Re: Presupuesto vasos compostables 12 oz\r\n')
    expect(plain).not.toContain('In-Reply-To')
    expect(plain).not.toContain('References')
  })

  it('addresses and message ids as headers want them', () => {
    expect(mimeAddress({ name: 'Ana Ruiz', email: 'ana@x.es' })).toBe('Ana Ruiz <ana@x.es>')
    expect(mimeAddress({ name: 'Say "hi"', email: 'a@x.es' })).toBe('"Say \\"hi\\"" <a@x.es>')
    expect(mimeAddress({ name: null, email: 'a@x.es' })).toBe('a@x.es')
    expect(messageId(' <x@y> ')).toBe('<x@y>')
    expect(messageId('x@y')).toBe('<x@y>')
    expect(messageId('not one')).toBeNull()
    expect(messageId(null)).toBeNull()
  })

  it('the email answered is quoted under the reply; Outlook gets the reply as HTML', () => {
    expect(quotedReply('Perfecto', { date: 'Tue, 29 Sep 2026 10:00:00 +0200', from: 'Ana <ana@x.es>', body: 'Hola\n\n> antes\r\nAdiós\n' }))
      .toBe('Perfecto\n\nOn Tue, 29 Sep 2026 10:00:00 +0200, Ana <ana@x.es> wrote:\n> Hola\n>\n> > antes\n> Adiós')
    expect(quotedReply('Perfecto  \n', { date: 'd', from: 'f', body: '  ' })).toBe('Perfecto')
    expect(replyHtml('1 < 2 & "ok"\nAron\n')).toBe('1 &lt; 2 &amp; &quot;ok&quot;<br>Aron')
  })

  it('an HTML email’s words, to quote it', () => {
    expect(htmlToText('<html><head><style>p{color:red}</style><title>x</title></head><body><p>Hola&nbsp;Aron,</p><p>Adjunto la factura n&ordm; 3 &amp; el albar&aacute;n.<br>Gracias</p>'
      + '<ul><li>Uno</li><li>Dos</li></ul><!-- tracking --><script>alert(1)</script></body></html>'))
      .toBe('Hola Aron,\nAdjunto la factura nº 3 & el albarán.\nGracias\n• Uno\n• Dos')
    expect(decodeEntities('&#39;&#x41;&euro;&unknown;')).toBe('\'A€&unknown;')
  })

  it('an HTML email is shown under a policy that runs nothing, with links opening in a new tab', () => {
    const doc = emailDocument('<base href="https://evil.example/"><meta http-equiv="refresh" content="0;url=https://evil.example">'
      + '<p onclick="x()">Hola</p><script src="https://evil.example/x.js"></script><SCRIPT>alert(1)</SCRIPT><img src="https://example.com/logo.png">')
    expect(doc).toContain(`<meta http-equiv="Content-Security-Policy" content="${EMAIL_CSP}">`)
    expect(EMAIL_CSP).toContain('default-src \'none\'')
    expect(EMAIL_CSP).not.toMatch(/script-src/)
    expect(doc).toContain('<base target="_blank">')
    expect(doc).toContain('<meta name="referrer" content="no-referrer">')
    expect(doc).not.toMatch(/<script|evil\.example/i)
    expect(doc).toContain('<img src="https://example.com/logo.png">') // remote pictures load
  })

  it('files: PDFs and pictures a browser shows are shown in the page, anything else is downloaded; what a file really is comes from its first bytes', () => {
    expect(attachmentView({ name: 'Factura.pdf', type: 'application/octet-stream' })).toBe('pdf')
    expect(attachmentView({ name: 'scan', type: 'application/pdf' })).toBe('pdf')
    expect(attachmentView({ name: 'IMG_0042.JPG', type: '' })).toBe('image')
    expect(attachmentView({ name: 'logo.svg', type: 'image/svg+xml' })).toBeNull() // can carry scripts
    expect(attachmentView({ name: 'IMG_0043.HEIC', type: 'image/heic' })).toBeNull() // most browsers can't show it
    expect(attachmentView({ name: 'factura.xsig', type: 'application/xml' })).toBeNull()
    const bytes = (...b: number[]) => new Uint8Array(b)
    expect(sniffType(new TextEncoder().encode('%PDF-1.7\n'))).toBe('application/pdf')
    expect(sniffType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png')
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(sniffType(new TextEncoder().encode('GIF89a'))).toBe('image/gif')
    expect(sniffType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp')
    expect(sniffType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull()
    expect(sniffType(new TextEncoder().encode('<html><script>'))).toBeNull()
    expect(sniffType(new Uint8Array())).toBeNull()
  })

  it('the pictures inside an email are put in place; something that isn’t a picture isn’t', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])
    const html = '<img src="cid:logo@x"><img src="cid:logo@x"><img src="cid:fake">'
    expect(placePictures(html, [{ cid: 'logo@x', bytes: png }, { cid: 'fake', bytes: new TextEncoder().encode('<svg onload="x()">') }]))
      .toBe(`<img src="data:image/png;base64,${Buffer.from(png).toString('base64')}"><img src="data:image/png;base64,${Buffer.from(png).toString('base64')}"><img src="cid:fake">`)
  })

  it('base64url for long messages too', () => {
    const big = new Uint8Array(200_000).map((_, i) => i % 256)
    expect(toBase64Url(big)).toBe(Buffer.from(big).toString('base64url'))
  })
})
