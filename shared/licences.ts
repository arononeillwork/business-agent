// Licences & renewals: what the business needs to keep open and up to date, when each one runs out,
// and the ones a café in Spain usually has (to add in one click). The presets are a starting point:
// what applies, and how often, depends on the town hall and the business, so each one says to check.
import { msg } from './i18n'

export type LicenceCategory = 'permit' | 'music' | 'insurance' | 'health' | 'safety' | 'certificate' | 'contract' | 'other'
export const LICENCE_CATEGORIES: { id: LicenceCategory; label: string }[] = [
  { id: 'permit', label: msg('Permits') },
  { id: 'music', label: msg('Music') },
  { id: 'health', label: msg('Food safety') },
  { id: 'safety', label: msg('Safety checks') },
  { id: 'insurance', label: msg('Insurance') },
  { id: 'certificate', label: msg('Certificates') },
  { id: 'contract', label: msg('Contracts') },
  { id: 'other', label: msg('Other') },
]

export interface Licence {
  id: string
  name: string
  category: LicenceCategory
  issuer: string | null
  reference: string | null
  holder: string | null
  starts_on: string | null
  /** Null: it doesn't run out. */
  expires_on: string | null
  /** Null: it doesn't renew. */
  renew_every_months: number | null
  auto_renews: boolean
  cost: number | null
  reminder_days: number
  document_id: string | null
  link: string | null
  notes: string | null
  active: boolean
  /** Its file, when one was added (the tax document's name and link). */
  document?: { name: string; link: string | null } | null
}
export type LicenceInput = Partial<Omit<Licence, 'id' | 'document'>> & { id?: string; name: string }

export type LicenceStatus = 'expired' | 'due' | 'valid' | 'permanent'
export const STATUS_LABEL: Record<LicenceStatus, string> = {
  expired: msg('Ran out'), due: msg('Renew soon'), valid: msg('Up to date'), permanent: msg('Doesn’t run out'),
}

export const daysUntil = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

/** Ran out, to renew soon (within its reminder days), up to date, or never runs out. */
export function statusOf(l: Pick<Licence, 'expires_on' | 'reminder_days'>, today: string): LicenceStatus {
  if (!l.expires_on) return 'permanent'
  const left = daysUntil(today, l.expires_on)
  if (left < 0) return 'expired'
  return left <= l.reminder_days ? 'due' : 'valid'
}

/** A date some months on, kept to the month's last day when it has fewer days (31 Jan + 1 → 28/29 Feb). */
export function addMonths(date: string, months: number) {
  const [y, m, d] = date.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, last))
  return target.toISOString().slice(0, 10)
}

/**
 * The new last day once renewed: one period on from when it ran out (so renewing early or late
 * keeps its usual date), or from today when it has none yet. Null when it doesn't renew.
 */
export function renewedUntil(l: Pick<Licence, 'expires_on' | 'renew_every_months'>, today: string): string | null {
  if (!l.renew_every_months) return null
  let next = addMonths(l.expires_on ?? today, l.renew_every_months)
  // Years behind: move on until it's in the future.
  while (next < today) next = addMonths(next, l.renew_every_months)
  return next
}

/** What the business spends on them in a year (each renewal's cost times how often a year). */
export function yearlyCost(list: Pick<Licence, 'cost' | 'renew_every_months' | 'active'>[]) {
  return list.filter(l => l.active && l.cost && l.renew_every_months)
    .reduce((s, l) => s + Number(l.cost) * (12 / l.renew_every_months!), 0)
}

export const renewalLabel = (months: number | null) =>
  !months ? msg('Doesn’t renew') : months === 1 ? msg('Every month') : months === 3 ? msg('Every 3 months') : months === 6 ? msg('Every 6 months')
    : months === 12 ? msg('Every year') : months === 24 ? msg('Every 2 years') : months === 48 ? msg('Every 4 years') : months === 60 ? msg('Every 5 years') : msg('Every {n} months')

export interface LicencePreset { key: string; name: string; category: LicenceCategory; issuer: string; renew_every_months: number | null; what: string; link?: string }

/** What a café or bar in Spain (Andalucía) usually needs. The names stay in Spanish: that's how they're known. */
export const CAFE_PRESETS: LicencePreset[] = [
  { key: 'apertura', name: 'Licencia de apertura / actividad', category: 'permit', issuer: 'Ayuntamiento', renew_every_months: null,
    what: msg('The town hall’s licence (or declaración responsable) to open and run the premises. It doesn’t run out, but a change of owner or activity needs a new one.') },
  { key: 'sgae', name: 'SGAE (música ambiente)', category: 'music', issuer: 'SGAE', renew_every_months: 12,
    what: msg('Playing music in the café: the authors’ licence, paid each year by the size of the premises.'), link: 'https://www.sgae.es' },
  { key: 'agedi', name: 'AGEDI / AIE (música grabada)', category: 'music', issuer: 'AGEDI-AIE', renew_every_months: 12,
    what: msg('Recorded music also needs the producers’ and performers’ licence, apart from SGAE (the Ventanilla Única Digital takes both).'), link: 'https://www.vud.es' },
  { key: 'terraza', name: 'Licencia de terraza (ocupación de vía pública)', category: 'permit', issuer: 'Ayuntamiento', renew_every_months: 12,
    what: msg('Tables and chairs outside: the town hall’s permit and its yearly fee.') },
  { key: 'sanitario', name: 'Registro sanitario (comunicación de inicio de actividad)', category: 'health', issuer: 'Junta de Andalucía', renew_every_months: null,
    what: msg('Food businesses tell the health authority when they start. Keep the receipt with the APPCC (food safety plan).') },
  { key: 'manipulador', name: 'Certificado de manipulador de alimentos', category: 'certificate', issuer: '', renew_every_months: 48,
    what: msg('Food handler training for each person who prepares food or drink. Add one per person; many businesses renew it every 4 years.') },
  { key: 'rc', name: 'Seguro de responsabilidad civil', category: 'insurance', issuer: '', renew_every_months: 12,
    what: msg('Public liability insurance, usually required by the licence and by the lease.') },
  { key: 'multirriesgo', name: 'Seguro multirriesgo del local', category: 'insurance', issuer: '', renew_every_months: 12,
    what: msg('The premises and what’s in them: fire, water, theft, breakdowns.') },
  { key: 'extintores', name: 'Revisión de extintores', category: 'safety', issuer: '', renew_every_months: 12,
    what: msg('Fire extinguishers are checked by an authorised company each year (and retested every 5).') },
  { key: 'electrica', name: 'Inspección de la instalación eléctrica (OCA)', category: 'safety', issuer: '', renew_every_months: 60,
    what: msg('Premises open to the public have the electrical installation inspected every 5 years.') },
  { key: 'plagas', name: 'Control de plagas (DDD)', category: 'health', issuer: '', renew_every_months: 12,
    what: msg('Pest control contract and its certificates, part of the APPCC.') },
  { key: 'reclamaciones', name: 'Hojas de reclamaciones y cartel', category: 'permit', issuer: 'Junta de Andalucía', renew_every_months: null,
    what: msg('Complaint forms must be available, with the sign that says so on show.') },
]
