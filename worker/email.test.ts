// The Email page, end to end through the Worker's routes against stand-ins for Supabase and Gmail.
// What must never break:
//   - only admins, and only once reading the mailbox was allowed (the Invoices permission)
//   - each email is matched to its supplier and customer, and opens in the café's own Gmail account
//   - each chip, the period and a supplier are what Gmail is asked for
//   - Gmail answering empty or busy is asked again, and never shows as "Unexpected end of JSON input"
//   - an email opens in the app with its body and files, a file comes back as what it really is
//     (never as something a browser would run), and a reply stays in the email's conversation
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { integrations } from './integrations'
import { email } from './email'
import type { Env } from './supabase'
import type { EmailState } from '../shared/email'
import type { EmailFull } from '../shared/email'
import { FakeSupabase } from './test/fakeSupabase'
import { FakeProviders } from './test/fakeProviders'
import { GMAIL_WAITS } from './providers/google'
import { decodeBody, gmailParts } from './providers/google'

const APP = 'https://app.test'
const env = {
  SUPABASE_URL: 'https://db.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', BUSINESS_ID: 'easy-beans',
  INTEGRATION_KEY: 'test-integration-key', GOOGLE_CLIENT_ID: 'google-id', GOOGLE_CLIENT_SECRET: 'google-secret', MS_CLIENT_ID: 'ms-id', MS_CLIENT_SECRET: 'ms-secret',
} as unknown as Env

let db: FakeSupabase
let apis: FakeProviders
/** What Gmail was asked to search for (each list of emails). */
let searches: string[]
/** Gmail's next answers, each in place of the real one: an empty 200, a busy 503, or none (the real one). */
let gmailHiccups: ('empty' | 'busy')[]
/** Gmail's searches that come back empty, every time (the chips' counts: those asking for 500 ids). */
let countsBroken: boolean
/** Emails as Gmail gives one that's opened (format=full), by id, and its files' bytes by attachment id. */
let opened: Map<string, unknown>
let gmailFiles: Map<string, Uint8Array>
/** What was sent through Gmail (the raw message and the thread it's in). */
let gmailSends: { raw: string; threadId?: string }[]
/** Outlook's answers to an email opened, its files and replies, by path; and what was posted to it. */
let graphAnswers: Map<string, () => Response>
let graphPosts: { path: string; body: unknown }[]
const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as unknown as ExecutionContext

beforeEach(() => {
  db = new FakeSupabase()
  apis = new FakeProviders()
  searches = []
  gmailHiccups = []
  countsBroken = false
  opened = new Map()
  gmailFiles = new Map()
  gmailSends = []
  graphAnswers = new Map()
  graphPosts = []
  GMAIL_WAITS.fill(0)
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const u = new URL(url)
    if (u.host === 'gmail.googleapis.com' && u.pathname.endsWith('/messages')) searches.push(u.searchParams.get('q') ?? '')
    if (u.host === 'gmail.googleapis.com') {
      if (countsBroken && u.searchParams.get('maxResults') === '500') return new Response('', { status: 200 })
      const hiccup = gmailHiccups.shift()
      if (hiccup === 'empty') return new Response('', { status: 200, headers: { 'content-type': 'application/json' } })
      if (hiccup === 'busy') return new Response('', { status: 503 })
      const one = u.pathname.match(/\/messages\/([^/]+)(?:\/attachments\/([^/]+))?$/)
      if (init?.method !== 'POST' && one && opened.has(decodeURIComponent(one[1]))) {
        if (!one[2]) return Response.json(opened.get(decodeURIComponent(one[1])))
        return Response.json({ data: Buffer.from(gmailFiles.get(decodeURIComponent(one[2]))!).toString('base64url') })
      }
      if (u.pathname.endsWith('/messages/send')) gmailSends.push(JSON.parse(String(init?.body)))
    }
    if (u.host === 'graph.microsoft.com' && u.pathname.startsWith('/v1.0/me/messages/')) {
      const path = u.pathname.replace('/v1.0', '')
      if (init?.method === 'POST') graphPosts.push({ path, body: JSON.parse(String(init.body)) })
      const answer = graphAnswers.get(`${init?.method ?? 'GET'} ${path}`)
      if (answer) return answer()
    }
    const res = db.handle(url, init) ?? apis.handle(url, init)
    if (!res) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`)
    return res
  }))
  db.table('suppliers').push(
    { id: 'roaster', name: 'Tostadores del Sur', email: 'pedidos@tostadoresdelsur.es', website: null, active: true, tax_id: null },
    { id: 'bakery', name: 'By Eric', email: 'info@by-eric.es', website: null, active: true, tax_id: null })
  db.table('customers').push({ id: 'c1', first_name: 'Hannah', last_name: 'Becker', company: null, email: 'hannah@example.de', updated_at: '2026-09-20T10:00:00Z' })
  const pdf = new TextEncoder().encode('%PDF-1.7 invoice')
  apis.google.inbox = [
    { id: 'm1', from: 'Tostadores del Sur <facturacion@tostadoresdelsur.es>', subject: 'Factura F2026-0158', at: '2026-09-29T08:00:00Z',
      files: [{ id: 'a1', name: 'Factura F2026-0158.pdf', type: 'application/pdf', bytes: pdf }] },
    { id: 'm2', from: 'Hannah Becker <hannah@example.de>', subject: 'Booking enquiry: baby shower', at: '2026-09-28T09:00:00Z', files: [] },
  ]
})
afterEach(() => vi.unstubAllGlobals())

const admin = { authorization: 'Bearer admin-token' }
const call = (path: string, headers: Record<string, string> = admin) => email.request(`${APP}${path}`, { headers }, env, ctx())
const req = (path: string, init: RequestInit = {}) => integrations.request(`${APP}${path}`, init, env, ctx())
const post = (path: string, body: unknown, headers: Record<string, string> = admin) =>
  email.request(`${APP}${path}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) }, env, ctx())

/** Connect Gmail on Connections, allowing it to read the mailbox too when `read` (and Google grants it). */
async function connectGmail(read: boolean) {
  if (read) apis.google.granted += ' https://www.googleapis.com/auth/gmail.readonly'
  const start = await req('/api/integrations/connect/gmail/start', { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: JSON.stringify({ read }) })
  const auth = new URL((await start.json() as { url: string }).url)
  const res = await req(`/api/integrations/google/callback?code=the-code&state=${encodeURIComponent(auth.searchParams.get('state')!)}`)
  expect(new URL(res.headers.get('location')!).searchParams.get('connected')).toBe('gmail')
}

describe('Email page', () => {
  it('admins only, and the mailbox is read only once reading it was allowed', async () => {
    expect((await call('/api/email/messages', { authorization: 'Bearer staff-token' })).status).toBe(403)
    expect(await (await call('/api/email/messages')).json()).toMatchObject({ mailbox: null, can_read: false, messages: [] })
    await connectGmail(false)
    expect(await (await call('/api/email/messages')).json()).toMatchObject({ mailbox: 'gmail', can_read: false, messages: [] })
    expect(searches).toEqual([]) // Gmail wasn't asked
  })

  it('lists the mailbox, each email matched to its supplier or customer and opening in the café’s Gmail, with counts for the chips', async () => {
    await connectGmail(true)
    const state = await (await call('/api/email/messages')).json() as EmailState
    expect(state).toMatchObject({ mailbox: 'gmail', can_read: true, next_page: null })
    expect(state.messages.map(m => [m.id, m.from, m.from_name, m.supplier_id, m.customer_name, m.attachments.map(a => a.name)])).toEqual([
      ['m1', 'facturacion@tostadoresdelsur.es', 'Tostadores del Sur', 'roaster', null, ['Factura F2026-0158.pdf']], // the same company domain
      ['m2', 'hannah@example.de', 'Hannah Becker', null, 'Hannah Becker', []],
    ])
    expect(state.messages[0].link).toBe(`https://mail.google.com/mail/?authuser=${encodeURIComponent(state.account!)}#all/m1`)
    expect(Object.keys(state.counts ?? {})).toHaveLength(8)
    expect(searches).toContain('newer_than:30d -in:sent -in:drafts -in:chats')
    expect(searches).toHaveLength(1 + 8) // the list, and a count for each chip

    // Kept 5 minutes: the same list again doesn't ask Gmail.
    const asked = searches.length
    await call('/api/email/messages')
    expect(searches).toHaveLength(asked)
  })

  it('a chip, the period, a search and a supplier are what Gmail is asked for', async () => {
    await connectGmail(true)
    await call('/api/email/messages?filter=unread&days=7&q=espresso')
    expect(searches).toContain('newer_than:7d -in:sent -in:drafts -in:chats is:unread espresso')
    searches = []
    await call('/api/email/messages?filter=invoices&supplier=roaster')
    expect(searches).toContain('newer_than:30d -in:sent -in:drafts -in:chats from:tostadoresdelsur.es has:attachment {factura facturas invoice invoices receipt receipts recibo recibos}')
    searches = []
    await call('/api/email/messages?filter=suppliers&page=next-one')
    expect(searches).toEqual(['newer_than:30d -in:sent -in:drafts -in:chats {from:tostadoresdelsur.es from:by-eric.es}']) // a later page: no counts again
    expect((await call('/api/email/messages?supplier=gone')).status).toBe(400)
  })

  it('Gmail answering empty or busy is asked again; when it keeps on, a plain message, not "Unexpected end of JSON input"', async () => {
    await connectGmail(true)
    gmailHiccups = ['empty', 'busy']
    const state = await (await call('/api/email/messages')).json() as EmailState
    expect(state.messages.map(m => m.id)).toEqual(['m1', 'm2'])

    gmailHiccups = Array(20).fill('empty')
    const res = await call('/api/email/messages?filter=unread')
    expect(res.status).toBe(502)
    const { error } = await res.json() as { error: string }
    expect(error).toBe('Gmail didn’t answer properly just now. Try again in a minute.')
    expect(error).not.toMatch(/JSON/)
  })

  it('the list still shows when Gmail won’t count the chips', async () => {
    await connectGmail(true)
    countsBroken = true
    const state = await (await call('/api/email/messages?days=7')).json() as EmailState
    expect(state.messages.map(m => m.id)).toEqual(['m1', 'm2'])
    expect(state.counts).toBeUndefined()
  })
})

const b64url = (s: string | Uint8Array) => Buffer.from(s).toString('base64url')
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
const header = (name: string, value: string) => ({ name, value })
/** An invoice as Gmail gives it opened: text and HTML (with the sender's logo inside it), a PDF and an e-invoice attached. */
function openInvoice() {
  opened.set('m9', { id: 'm9', threadId: 't9', labelIds: ['INBOX', 'UNREAD'], internalDate: String(Date.parse('2026-09-29T08:00:00Z')), payload: {
    mimeType: 'multipart/mixed', headers: [
      header('From', 'Tostadores del Sur <facturacion@tostadoresdelsur.es>'), header('To', 'cafe@gmail.com, Ana Ruiz <ana@tostadoresdelsur.es>'),
      header('Cc', '"Ruiz, Bob" <bob@example.com>'), header('Subject', 'Factura F2026-0158'), header('Date', 'Tue, 29 Sep 2026 10:00:00 +0200'),
      header('Message-ID', '<inv-0158@tostadoresdelsur.es>'), header('References', '<order-77@easybeans.example>'),
    ],
    parts: [
      { mimeType: 'multipart/related', parts: [
        { mimeType: 'multipart/alternative', parts: [
          { mimeType: 'text/plain', headers: [header('Content-Type', 'text/plain; charset="UTF-8"')], body: { size: 32, data: b64url('Adjuntamos la factura.\nUn saludo') } },
          { mimeType: 'text/html', headers: [header('Content-Type', 'text/html; charset="UTF-8"')], body: { size: 70, data: b64url('<p>Adjuntamos la <b>factura</b>.</p><img src="cid:logo@x">') } },
        ] },
        { mimeType: 'image/png', filename: 'logo.png', headers: [header('Content-ID', '<logo@x>')], body: { attachmentId: 'logo', size: PNG.length } },
      ] },
      { mimeType: 'application/pdf', filename: 'Factura F2026-0158.pdf', body: { attachmentId: 'pdf1', size: 16 } },
      { mimeType: 'application/pdf', filename: 'not really.pdf', body: { attachmentId: 'html1', size: 30 } },
      { mimeType: 'application/octet-stream', filename: 'factura.xsig', body: { attachmentId: 'xsig', size: 5 } },
    ],
  } })
  gmailFiles.set('logo', PNG)
  gmailFiles.set('pdf1', new TextEncoder().encode('%PDF-1.7 invoice'))
  gmailFiles.set('html1', new TextEncoder().encode('<script>alert(1)</script>'))
  gmailFiles.set('xsig', new TextEncoder().encode('<?xml version="1.0"?>'))
}

describe('an email opened in the app', () => {
  it('admins only, and only once reading the mailbox was allowed', async () => {
    openInvoice()
    expect((await call('/api/email/messages/m9', { authorization: 'Bearer staff-token' })).status).toBe(403)
    expect((await call('/api/email/messages/m9/attachments/pdf1', { authorization: 'Bearer staff-token' })).status).toBe(403)
    expect((await post('/api/email/messages/m9/reply', { text: 'Hola' }, { authorization: 'Bearer staff-token' })).status).toBe(403)
    await connectGmail(false)
    const res = await call('/api/email/messages/m9')
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toBe('Allow Business Agent to read Gmail first, on the Email page.')
  })

  it('who it’s from and to, its HTML with the pictures inside it in place, and its files (not those pictures)', async () => {
    openInvoice()
    await connectGmail(true)
    const m = await (await call('/api/email/messages/m9')).json() as EmailFull
    expect(m).toMatchObject({
      id: 'm9', thread_id: 't9', from: 'facturacion@tostadoresdelsur.es', from_name: 'Tostadores del Sur', to: 'cafe@gmail.com, Ana Ruiz <ana@tostadoresdelsur.es>',
      cc: '"Ruiz, Bob" <bob@example.com>', reply_to: null, subject: 'Factura F2026-0158', at: '2026-09-29T08:00:00.000Z', text: 'Adjuntamos la factura.\nUn saludo',
    })
    expect(m.html).toBe(`<p>Adjuntamos la <b>factura</b>.</p><img src="data:image/png;base64,${Buffer.from(PNG).toString('base64')}">`)
    expect(m.attachments.map(a => [a.id, a.name, a.type])).toEqual([
      ['pdf1', 'Factura F2026-0158.pdf', 'application/pdf'], ['html1', 'not really.pdf', 'application/pdf'], ['xsig', 'factura.xsig', 'application/octet-stream'],
    ])
    expect(m.link).toMatch(/#all\/t9$/)
    // Gone from the mailbox since the list was read.
    const gone = await call('/api/email/messages/m404')
    expect(gone.status).toBe(404)
    expect(await gone.json()).toEqual({ error: 'That email isn’t in the mailbox any more' })
  })

  it('a file comes as what it really is: a PDF to show in the page; anything else only to download, never as something a browser runs', async () => {
    openInvoice()
    await connectGmail(true)
    const pdf = await call(`/api/email/messages/m9/attachments/pdf1?name=${encodeURIComponent('Factura F2026-0158.pdf')}`)
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get('content-type')).toBe('application/pdf')
    expect(pdf.headers.get('content-disposition')).toBe('inline; filename*=UTF-8\'\'Factura%20F2026-0158.pdf')
    expect(new TextDecoder().decode(await pdf.arrayBuffer())).toBe('%PDF-1.7 invoice')
    for (const id of ['html1', 'xsig']) {
      const other = await call(`/api/email/messages/m9/attachments/${id}?name=x`)
      expect(other.headers.get('content-type')).toBe('application/octet-stream') // whatever the email says it is
      expect(other.headers.get('content-disposition')).toMatch(/^attachment;/)
      expect(other.headers.get('x-content-type-options')).toBe('nosniff')
    }
  })

  it('a reply goes from the café’s Gmail into the same conversation, to who sent it; Reply all copies everyone else, never the café', async () => {
    openInvoice()
    await connectGmail(true)
    gmailSends = [] // the confirmation sent when it was connected
    expect(await (await post('/api/email/messages/m9/reply', { text: 'Gracias, ¡recibida!' })).json()).toEqual({ sent: true })
    expect(gmailSends).toHaveLength(1)
    expect(gmailSends[0].threadId).toBe('t9')
    const raw = Buffer.from(gmailSends[0].raw, 'base64url').toString()
    const [head, body] = raw.split('\r\n\r\n')
    expect(head.split('\r\n')).toEqual([
      'To: Tostadores del Sur <facturacion@tostadoresdelsur.es>', 'Subject: Re: Factura F2026-0158', 'In-Reply-To: <inv-0158@tostadoresdelsur.es>',
      'References: <order-77@easybeans.example>', ' <inv-0158@tostadoresdelsur.es>', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64',
    ])
    expect(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString()).toBe(
      'Gracias, ¡recibida!\r\n\r\nOn Tue, 29 Sep 2026 10:00:00 +0200, Tostadores del Sur <facturacion@tostadoresdelsur.es> wrote:\r\n> Adjuntamos la factura.\r\n> Un saludo')

    await post('/api/email/messages/m9/reply', { text: 'Para todos', all: true })
    const all = Buffer.from(gmailSends[1].raw, 'base64url').toString()
    expect(all).toContain('\r\nCc: Ana Ruiz <ana@tostadoresdelsur.es>,\r\n "Ruiz, Bob" <bob@example.com>\r\n')
    expect(all).not.toContain('cafe@gmail.com')

    expect((await post('/api/email/messages/m9/reply', { text: '   ' })).status).toBe(400)
    expect((await post('/api/email/messages/m9/reply', { text: 'x'.repeat(20_001) })).status).toBe(400)
    expect(gmailSends).toHaveLength(2)
  })

  it('Outlook: an email opened with the pictures inside it, a file passed on as it comes, and a reply Outlook puts in the conversation itself', async () => {
    apis.microsoft.granted += ' Mail.Read'
    const start = await req('/api/integrations/connect/outlook/start', { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: JSON.stringify({ read: true, back: 'email' }) })
    const auth = new URL((await start.json() as { url: string }).url)
    const back = await req(`/api/integrations/microsoft/callback?code=the-code&state=${encodeURIComponent(auth.searchParams.get('state')!)}`)
    expect(new URL(back.headers.get('location')!).pathname).toBe('/email')

    graphAnswers.set('GET /me/messages/o1', () => Response.json({
      id: 'o1', conversationId: 'c1', subject: 'Pedido semana 40', receivedDateTime: '2026-09-29T08:00:00Z', webLink: 'https://outlook.office.com/mail/o1',
      body: { contentType: 'html', content: '<p>Hola</p><img src="cid:sig1">' },
      from: { emailAddress: { name: 'Lácteos Costa del Sol', address: 'Pedidos@lacteoscosta.es' } }, toRecipients: [{ emailAddress: { address: 'cafe@outlook.com' } }],
      ccRecipients: [], replyTo: [],
      attachments: [{ id: 'a1', name: 'Factura LC-4502.pdf', size: 16, contentType: 'application/pdf', isInline: false },
        { id: 'sig', name: 'firma.png', size: PNG.length, contentType: 'image/png', isInline: true }],
    }))
    graphAnswers.set('GET /me/messages/o1/attachments/sig', () => Response.json({ contentId: 'sig1', contentBytes: Buffer.from(PNG).toString('base64') }))
    graphAnswers.set('GET /me/messages/o1/attachments/a1/$value', () => new Response(new TextEncoder().encode('%PDF-1.4 factura LC-4502'), { headers: { 'content-type': 'text/html' } }))
    graphAnswers.set('POST /me/messages/o1/reply', () => new Response(null, { status: 202 }))
    graphAnswers.set('POST /me/messages/o1/replyAll', () => new Response(null, { status: 202 }))

    const m = await (await call('/api/email/messages/o1')).json() as EmailFull
    expect(m).toMatchObject({ thread_id: 'c1', from: 'pedidos@lacteoscosta.es', from_name: 'Lácteos Costa del Sol', to: 'cafe@outlook.com', text: null, link: 'https://outlook.office.com/mail/o1' })
    expect(m.html).toBe(`<p>Hola</p><img src="data:image/png;base64,${Buffer.from(PNG).toString('base64')}">`)
    expect(m.attachments).toEqual([{ id: 'a1', name: 'Factura LC-4502.pdf', size: 16, type: 'application/pdf' }])

    const file = await call('/api/email/messages/o1/attachments/a1?name=Factura.pdf')
    expect(file.headers.get('content-type')).toBe('application/pdf') // what it is, not what Outlook said
    expect(new TextDecoder().decode(await file.arrayBuffer())).toBe('%PDF-1.4 factura LC-4502')

    await post('/api/email/messages/o1/reply', { text: 'Recibido <gracias>\nAron' })
    await post('/api/email/messages/o1/reply', { text: 'Todos', all: true })
    expect(graphPosts).toEqual([
      { path: '/me/messages/o1/reply', body: { comment: 'Recibido &lt;gracias&gt;<br>Aron' } },
      { path: '/me/messages/o1/replyAll', body: { comment: 'Todos' } },
    ])
  })
})

describe('Gmail’s parts of an email', () => {
  it('the first HTML and text bodies, even when Gmail sends a big one separately; files, not the pictures inside the email', () => {
    const parts = gmailParts({ mimeType: 'multipart/mixed', parts: [
      { mimeType: 'multipart/alternative', parts: [
        { mimeType: 'text/plain', body: { data: b64url('hola'), size: 4 } },
        { mimeType: 'text/html', body: { attachmentId: 'big-html', size: 900_000 } },
      ] },
      { mimeType: 'text/plain', filename: 'notas.txt', body: { attachmentId: 'notes', size: 10 } },
      { mimeType: 'text/html', headers: [header('Content-Disposition', 'attachment; filename=x.html')], body: { data: b64url('<p>x</p>'), size: 8 } },
      { mimeType: 'image/jpeg', filename: 'foto.jpg', body: { attachmentId: 'photo', size: 50_000 } },
      { mimeType: 'image/png', filename: 'logo.png', headers: [header('Content-ID', '<logo>')], body: { attachmentId: 'logo', size: 900 } },
    ] })
    expect(parts.text).toMatchObject({ data: b64url('hola') })
    expect(parts.html).toMatchObject({ attachmentId: 'big-html' })
    expect(parts.files.map(f => f.id)).toEqual(['notes', 'photo'])
    expect(parts.pictures.map(p => [p.cid, p.attachmentId])).toEqual([['logo', 'logo']])
  })

  it('reads a body in its own character set', () => {
    expect(decodeBody(new Uint8Array([0x46, 0x61, 0x63, 0x74, 0x75, 0x72, 0x61, 0x20, 0x6e, 0xba, 0x20, 0x33]), 'text/plain; charset=ISO-8859-1')).toBe('Factura nº 3')
    expect(decodeBody(new TextEncoder().encode('Año'), 'text/plain')).toBe('Año')
    expect(decodeBody(new TextEncoder().encode('Año'), 'text/plain; charset=made-up')).toBe('Año')
  })
})
