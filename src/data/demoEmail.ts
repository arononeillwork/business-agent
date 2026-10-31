// The demo's mailbox for the Email page: what lands in a Marbella café's Gmail in a few weeks
// (suppliers' invoices, a booking enquiry, a Square receipt, Google and Instagram notices, the
// gestoría), dated back from now so the period filter always has something to show.
import { matchSupplier } from '../../shared/invoices'
import {
  EMAIL_COUNT_CAP, EMAIL_FILTERS, EMAIL_PAGE_SIZE, DEFAULT_EMAIL_DAYS, applyEmailQuery, customerName, gmailLink,
  type EmailFilter, type EmailMessage, type EmailQuery,
} from '../../shared/email'
import type { Supplier } from '../../shared/stock'
import type { Customer } from '../../shared/types'

type Sample = { minutes: number; from: string; from_name: string; subject: string; snippet: string; files?: [string, number][]
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
    files: [['Presupuesto EP-7741.pdf', 210_000]] },
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
      attachments: (s.files ?? []).map(([name, size]) => ({ name, size, type: 'application/pdf' })),
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
