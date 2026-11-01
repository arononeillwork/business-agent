// The demo's mailbox for the Email page: what lands in a Marbella café's Gmail in a few weeks
// (suppliers' invoices, a booking enquiry, a Square receipt, Google and Instagram notices, the
// gestoría), dated back from now so the period filter always has something to show.
import { matchSupplier } from '../../shared/invoices'
import {
  EMAIL_COUNT_CAP, EMAIL_FILTERS, EMAIL_PAGE_SIZE, DEFAULT_EMAIL_DAYS, applyEmailQuery, customerName, gmailLink,
  type EmailFilter, type EmailMessage, type EmailQuery,
} from '../../shared/email'
import type { EmailFull } from '../../shared/email'
import type { Supplier } from '../../shared/stock'
import type { Customer } from '../../shared/types'

/** A file: its name, size and type (a PDF when not given). */
type Sample = { minutes: number; from: string; from_name: string; subject: string; snippet: string; files?: [string, number, string?][]
  unread?: boolean; starred?: boolean; important?: boolean; labels?: string[] }

const H = 60, D = 24 * H
const SAMPLES: Sample[] = [
  { minutes: 35, from: 'facturacion@tostadoresdelsur.example', from_name: 'Tostadores del Sur', subject: 'Factura F2026-0158', unread: true, important: true,
    snippet: 'Buenos días, adjuntamos la factura del pedido del lunes: 12 kg Brasil Cerrado y 4 kg Etiopía Guji. Vencimiento a 30 días.',
    files: [['Factura F2026-0158.pdf', 88_412]] },
  { minutes: 2 * H + 10, from: 'hannah.becker@example.de', from_name: 'Hannah Becker', subject: 'Booking enquiry: baby shower for 15 on Saturday 17 October',
    unread: true, starred: true,
    snippet: 'Hi! We’d love to book the terrace for a baby shower, around 15 people, from 11:00. Could you do cakes and coffee for everyone? What would it cost?' },
  { minutes: 4 * H, from: 'noreply@messaging.squareup.com', from_name: 'Square', subject: 'Your receipt from Square Shop', labels: ['CATEGORY_UPDATES'],
    snippet: 'Thanks for your order: 20 thermal paper rolls for Square Terminal. Your receipt is attached.', files: [['Receipt SQ-88412.pdf', 41_200]] },
  { minutes: 7 * H, from: 'laura@gestoria.example', from_name: 'Laura · Gestoría Marbella', subject: 'Modelo 303 del tercer trimestre: faltan facturas',
    unread: true, important: true, starred: true,
    snippet: 'Hola Aron: para presentar el 303 antes del 20 de octubre nos faltan las facturas de septiembre de Lácteos Costa del Sol y del cash & carry. ¿Nos las reenvías?' },
  { minutes: 22 * H, from: 'businessprofile-noreply@google.com', from_name: 'Google Business Profile', labels: ['CATEGORY_UPDATES'],
    subject: 'Easy Beans Coffee: 1,240 people viewed your profile in September',
    snippet: 'Your Business Profile in September: 1,240 views, 186 requests for directions and 41 calls. See what customers searched for.' },
  { minutes: 26 * H, from: 'no-reply@mail.instagram.com', from_name: 'Instagram', subject: 'lucia.mbl mentioned you in her story', labels: ['CATEGORY_SOCIAL'],
    snippet: 'lucia.mbl mentioned @easy.beans.coffee in her story. Share it to your own story before it disappears.' },
  { minutes: 2 * D, from: 'facturas@gmcash.example', from_name: 'GM Cash & Carry', subject: 'Factura simplificada T-2026/88412',
    snippet: 'Gracias por su compra en GM Cash & Carry Marbella. Le enviamos su factura en PDF.', files: [['Factura T-2026-88412.pdf', 52_330]] },
  { minutes: 2 * D + 5 * H, from: 'elena@nomadhub.example', from_name: 'Elena Vidal', subject: 'Re: Office coffee for 30 desks', unread: true,
    snippet: 'Thanks for the prices! Could we start with a trial week from 5 October, twice a week? Our members loved the samples.' },
  { minutes: 3 * D, from: 'pedidos@lacteoscosta.example', from_name: 'Lácteos Costa del Sol', subject: 'Albarán y factura semana 39',
    snippet: 'Le enviamos el albarán y la factura de los pedidos de esta semana: 48 l de leche entera y 24 l de avena barista.',
    files: [['Albaran S39.pdf', 30_120], ['Factura LC-4502.pdf', 61_870]] },
  { minutes: 4 * D, from: 'hola@santaroaster.example', from_name: 'Santa Roaster', subject: 'New harvest: Colombia Huila samples for Easy Beans', starred: true,
    snippet: 'Hi Aron, our new Huila lot has just landed: red fruit, panela and a long finish. Shall we send you 250 g to try? Price list attached.',
    files: [['Santa Roaster price list autumn 2026.pdf', 1_204_000]] },
  { minutes: 5 * D, from: 'envios@matchachai.example', from_name: 'Matcha & Chai Co.', subject: 'Your order MC-2291 has shipped',
    snippet: 'Good news: 2 kg of ceremonial matcha and 1 kg of masala chai are on their way with SEUR. Tracking 7741 2291 05.' },
  { minutes: 6 * D, from: 'marina.soto@example.es', from_name: 'Marina Soto', subject: 'Reserva terraza para un cumpleaños', unread: true,
    snippet: 'Hola, quería reservar la terraza el sábado 10 de octubre por la tarde para el cumpleaños de mi hija, unas 12 personas. ¿Es posible?' },
  { minutes: 9 * D, from: 'info@by-eric.es', from_name: 'By Eric', subject: 'Factura septiembre',
    snippet: '¡Hola! Te paso la factura de croissants y bollería de septiembre. ¡Gracias!', files: [['Factura 2026-0930.pdf', 66_502]] },
  { minutes: 13 * D, from: 'no-reply@marbella.example', from_name: 'Ayuntamiento de Marbella', subject: 'Licencia de terraza 2027: abierto el plazo de renovación',
    important: true,
    snippet: 'Le recordamos que el plazo para renovar la ocupación de la vía pública con mesas y sillas para 2027 está abierto hasta el 30 de noviembre.' },
  { minutes: 18 * D, from: 'ventas@ecopack.example', from_name: 'EcoPack Andalucía', subject: 'Presupuesto vasos compostables 12 oz',
    snippet: 'Adjuntamos el presupuesto que nos pidió: 2.000 vasos compostables de 12 oz con tapa, impresos con su logo.',
    files: [['Presupuesto EP-7741.pdf', 210_000], ['Prueba de impresión vaso 12 oz.png', 1638, 'image/png']] },
  { minutes: 24 * D, from: 'formulario@easybeanscoffee.example', from_name: 'Easy Beans website', subject: 'Nuevo mensaje de la web: reserva para un grupo',
    snippet: 'Nombre: David Ruiz. Mensaje: somos un grupo de ciclistas, 8 personas. ¿Podemos reservar mesa el domingo a las 9:00?' },
  { minutes: 41 * D, from: 'facturas@iberdrola.example', from_name: 'Iberdrola', subject: 'Tu factura de luz de agosto',
    snippet: 'Ya tienes disponible tu factura de luz del 1 al 31 de agosto: 312,48 €. Se cargará en tu cuenta el 25 de septiembre.',
    files: [['Factura luz agosto 2026.pdf', 98_000]] },
]

/** The demo mailbox as the Worker would give it, matched to the demo's suppliers and customers. */
export function demoEmails(box: 'gmail' | 'outlook', account: string | null, suppliers: Supplier[], customers: Customer[], now = Date.now()): EmailMessage[] {
  return SAMPLES.map((s, i) => {
    const customer = customers.find(c => c.email?.toLowerCase() === s.from)
    const labels = [...(s.unread ? ['UNREAD'] : []), ...(s.starred ? ['STARRED'] : []), ...(s.important ? ['IMPORTANT'] : []), ...(s.labels ?? ['INBOX'])]
    return {
      id: `demo-mail-${i + 1}`, thread_id: `demo-thread-${i + 1}`, from: s.from, from_name: s.from_name, to: account ?? '', subject: s.subject, snippet: s.snippet,
      at: new Date(now - s.minutes * 60_000).toISOString(), unread: !!s.unread, starred: !!s.starred, important: !!s.important, labels,
      attachments: (s.files ?? []).map(([name, size, type]) => ({ name, size, type: type ?? 'application/pdf' })),
      link: box === 'gmail' ? gmailLink(`demo-thread-${i + 1}`, account) : 'https://outlook.live.com/mail/0/inbox',
      supplier_id: matchSupplier(suppliers, { email: s.from }), customer_id: customer?.id ?? null, customer_name: customer ? customerName(customer) : null,
    }
  })
}

/** A page of the demo mailbox for a query, with each chip's count, as the Worker answers for Gmail. */
export function demoEmailPage(all: EmailMessage[], query: EmailQuery) {
  const o = { q: query.q, days: query.days ?? DEFAULT_EMAIL_DAYS, supplier: query.supplier }
  const shown = applyEmailQuery(all, { ...o, filter: query.filter ?? 'all' })
  const from = Number(query.page ?? 0) || 0
  const counts = Object.fromEntries(EMAIL_FILTERS.map(f => [f.id, Math.min(applyEmailQuery(all, { ...o, filter: f.id }).length, EMAIL_COUNT_CAP)])) as Record<EmailFilter, number>
  return {
    messages: shown.slice(from, from + EMAIL_PAGE_SIZE),
    next_page: shown.length > from + EMAIL_PAGE_SIZE ? String(from + EMAIL_PAGE_SIZE) : null,
    counts: query.page ? undefined : counts,
  }
}

// An email opened in the app: what each says in full (the list shows its first line or two), as
// HTML where its sender sends HTML; anyone else it went to; and its files' contents.
const BODIES: Record<string, { html?: string; text?: string; cc?: string }> = {
  'Factura F2026-0158': {
    html: '<div style="font-family:Arial,sans-serif;color:#333;max-width:560px">'
      + '<p>Buenos días,</p><p>Adjuntamos la factura <b>F2026-0158</b> del pedido del lunes. Vencimiento a 30 días.</p>'
      + '<table style="border-collapse:collapse;width:100%;font-size:14px">'
      + '<tr style="background:#6b3f26;color:#fff"><th align="left" style="padding:6px">Producto</th><th align="right" style="padding:6px">Kg</th><th align="right" style="padding:6px">Importe</th></tr>'
      + '<tr style="border-bottom:1px solid #eee"><td style="padding:6px">Brasil Cerrado (espresso)</td><td align="right">12</td><td align="right" style="padding:6px">214,80 €</td></tr>'
      + '<tr style="border-bottom:1px solid #eee"><td style="padding:6px">Etiopía Guji (filtro)</td><td align="right">4</td><td align="right" style="padding:6px">98,00 €</td></tr>'
      + '<tr><td style="padding:6px" colspan="2">IVA 10%</td><td align="right" style="padding:6px">31,28 €</td></tr>'
      + '<tr><td style="padding:6px" colspan="2"><b>Total</b></td><td align="right" style="padding:6px"><b>344,08 €</b></td></tr></table>'
      + '<p>Un saludo,<br>Departamento de facturación<br><a href="https://tostadoresdelsur.example">Tostadores del Sur</a></p></div>',
  },
  'Booking enquiry: baby shower for 15 on Saturday 17 October': {
    text: 'Hi!\n\nWe’d love to book the terrace for a baby shower on Saturday 17 October, around 15 people, from 11:00 to about 14:00.\n\n'
      + 'Could you do cakes and coffee for everyone? A few of us don’t drink dairy, so oat milk would be great. What would it cost, and do you need a deposit?\n\n'
      + 'Thanks so much,\nHannah Becker\n+49 151 2345 6789',
  },
  'Your receipt from Square Shop': {
    html: '<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:auto;color:#1a1a1a">'
      + '<h2 style="font-weight:600">Thanks for your order</h2><p>Order SQ-88412 · Easy Beans Coffee</p>'
      + '<table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px 0">20 × Thermal paper rolls (Square Terminal)</td><td align="right">€36.00</td></tr>'
      + '<tr><td style="padding:8px 0;border-top:1px solid #ddd"><b>Total</b></td><td align="right" style="border-top:1px solid #ddd"><b>€36.00</b></td></tr></table>'
      + '<p style="color:#666;font-size:12px">Your receipt is attached as a PDF.</p></div>',
  },
  'Modelo 303 del tercer trimestre: faltan facturas': {
    text: 'Hola Aron:\n\nPara presentar el 303 antes del 20 de octubre nos faltan estas facturas de septiembre:\n\n'
      + '- Lácteos Costa del Sol (las cuatro semanas)\n- GM Cash & Carry (compras del día 12 y del 26)\n\n'
      + '¿Nos las reenvías cuando puedas? Con eso lo dejamos listo.\n\nUn abrazo,\nLaura\nGestoría Marbella',
  },
  'Easy Beans Coffee: 1,240 people viewed your profile in September': {
    html: '<div style="font-family:Roboto,Arial,sans-serif;max-width:520px;color:#202124">'
      + '<h2 style="font-weight:400">Your Business Profile in September</h2>'
      + '<table style="width:100%;text-align:center"><tr><td><div style="font-size:28px;color:#1a73e8">1,240</div>views</td>'
      + '<td><div style="font-size:28px;color:#1a73e8">186</div>direction requests</td><td><div style="font-size:28px;color:#1a73e8">41</div>calls</td></tr></table>'
      + '<p>People found you by searching for <b>coffee San Pedro de Alcántara</b>, <b>brunch Marbella</b> and <b>flat white near me</b>.</p></div>',
  },
  'Re: Office coffee for 30 desks': {
    text: 'Hi Aron,\n\nThanks for the prices! Could we start with a trial week from 5 October, twice a week (Tuesday and Thursday mornings)? '
      + 'Our members loved the samples, especially the Ethiopian filter.\n\nI’ve copied Marc, who looks after the kitchen.\n\nBest,\nElena Vidal\nNomad Hub Marbella',
    cc: 'Marc Puig <marc@nomadhub.example>',
  },
  'Albarán y factura semana 39': {
    text: 'Buenos días:\n\nLe enviamos el albarán y la factura de los pedidos de esta semana: 48 l de leche entera y 24 l de avena barista.\n\nAtentamente,\nLácteos Costa del Sol',
  },
  'New harvest: Colombia Huila samples for Easy Beans': {
    text: 'Hi Aron,\n\nOur new Huila lot has just landed: red fruit, panela and a long finish. It works beautifully as a filter and as a fruity espresso.\n\n'
      + 'Shall we send you 250 g to try? Our autumn price list is attached.\n\nSee more at https://santaroaster.example/huila\n\nCheers,\nSanta Roaster',
  },
  'Presupuesto vasos compostables 12 oz': {
    text: 'Buenos días:\n\nAdjuntamos el presupuesto que nos pidió: 2.000 vasos compostables de 12 oz con tapa, impresos con su logo.\n\n'
      + 'También le enviamos una prueba de impresión del vaso para que vea cómo queda el logo en rosa. Si le parece bien, lo dejamos en producción esta semana.\n\n'
      + 'Un saludo,\nEcoPack Andalucía',
  },
}

/** One demo email opened, as the Worker gives it: its body, anyone else it went to, its files with their ids. */
export function demoEmailFull(m: EmailMessage, account: string | null): EmailFull {
  const b = BODIES[m.subject]
  return {
    id: m.id, thread_id: m.thread_id, from: m.from, from_name: m.from_name, to: account ?? m.to, cc: b?.cc ?? '', reply_to: null, subject: m.subject, at: m.at,
    html: b?.html ?? null, text: b?.html ? null : b?.text ?? `${m.snippet}\n\n${m.from_name ?? ''}`.trim(),
    attachments: m.attachments.map((a, i) => ({ ...a, id: `${m.id}-file-${i + 1}` })), link: m.link,
  }
}

/** What a demo file's stand-in PDF says (the demo has no real files). */
export function demoFileLines(m: EmailFull, name: string): string[] {
  if (name === 'Factura F2026-0158.pdf') {
    return ['Tostadores del Sur S.L.  CIF B93412577', `Fecha: ${m.at.slice(0, 10)}   Vencimiento: 30 dias`, 'Cliente: Easy Beans Coffee', '',
      '12 kg  Brasil Cerrado (espresso)      214,80 EUR', '4 kg   Etiopia Guji (filtro)          98,00 EUR', '',
      'Base imponible   312,80 EUR', 'IVA 10%           31,28 EUR', 'Total            344,08 EUR']
  }
  return [`From: ${m.from_name ?? m.from}`, `Email: ${m.subject}`, '', 'A demo copy of the file attached to this email.']
}

/** The print proof EcoPack sends (a small PNG). */
const CUP_PROOF = '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'

/** A demo file that's a picture, as its bytes; null for the others (PDFs, made with demoFileLines). */
export function demoPicture(name: string): Blob | null {
  if (name !== 'Prueba de impresión vaso 12 oz.png') return null
  return new Blob([Uint8Array.from(atob(CUP_PROOF), c => c.charCodeAt(0))], { type: 'image/png' })
}

/** Replies sent from the demo's Email page (nothing leaves the demo). */
export const demoReplies: { id: string; text: string; all: boolean; at: string }[] = []
