// Staff benefits: what everyone on the team is entitled to in the business's country (the legal
// minimum), what the business gives on top, and each person's allocation for the year (holiday
// left, sick days, the other leave taken). Spain: Estatuto de los Trabajadores and Social Security,
// checked against the consolidated text in the BOE on LAW_CHECKED's date. A convenio colectivo can
// improve any of them, never reduce them, so the business's own amounts can only go up.
import { msg } from './i18n'
import type { TimeOff, TimeOffKind } from './types'

export type Country = 'ES'
export const COUNTRY_NAME: Record<Country, string> = { ES: msg('Spain') }

/** Where the law was read, and when: the page says so, so nobody takes it as newer than it is. */
export const LAW_CHECKED: Record<Country, { on: string; source: string; link: string }> = {
  ES: { on: '2026-10-23', source: 'Estatuto de los Trabajadores', link: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430' },
}

export type LeaveGroup = 'holidays' | 'health' | 'family' | 'other'
export const LEAVE_GROUPS: { id: LeaveGroup; label: string }[] = [
  { id: 'holidays', label: msg('Holidays') },
  { id: 'health', label: msg('Health') },
  { id: 'family', label: msg('Family') },
  { id: 'other', label: msg('Other paid leave') },
]

export type Payer = 'business' | 'social_security' | 'shared' | 'unpaid'
export const PAYER_LABEL: Record<Payer, string> = {
  business: msg('Paid by the business'),
  social_security: msg('Paid by Social Security'),
  shared: msg('The business, then Social Security'),
  unpaid: msg('Unpaid'),
}

export interface Entitlement {
  key: string
  group: LeaveGroup
  name: string
  /** Its name in the law, in Spanish (that's how the gestoría and the payslip know it). */
  term: string
  law: string
  /** The legal minimum, counted as `allowance` says; null when it's the time needed. */
  amount: number | null
  /** How much, with {n} for the amount. */
  allowance: string
  payer: Payer
  pay: string
  detail: string
  /** The kind it's recorded as on Time off. */
  leave?: TimeOffKind
}

export const ENTITLEMENTS: Record<Country, Entitlement[]> = {
  ES: [
    { key: 'holidays', group: 'holidays', name: msg('Paid holidays'), term: 'Vacaciones', law: 'Art. 38 ET', amount: 30,
      allowance: msg('{n} calendar days a year'), payer: 'business', pay: msg('Full pay'), leave: 'vacation',
      detail: msg('Can’t be swapped for money: days not taken are only paid when someone leaves. Someone who starts or leaves during the year gets their share. Dates are agreed, and known at least two months ahead. Holidays that sick or birth leave overlaps are taken later, even the next year.') },
    { key: 'public_holidays', group: 'holidays', name: msg('Public holidays'), term: 'Fiestas laborales', law: 'Art. 37.2 ET', amount: 14,
      allowance: msg('{n} a year'), payer: 'business', pay: msg('Full pay'),
      detail: msg('National, regional and 2 local days (they’re on the Calendar). Paid and not made up; one that’s worked is paid extra or given back as another day off.') },
    { key: 'sick', group: 'health', name: msg('Sick leave'), term: 'Incapacidad temporal (baja médica)', law: 'LGSS arts. 169–176', amount: null,
      allowance: msg('While the doctor signs them off: up to 365 days, and 180 more if needed'), payer: 'shared', leave: 'sick',
      pay: msg('Days 1–3 unpaid by law; days 4–20 at 60% of the regulatory base; from day 21, 75%'),
      detail: msg('The business pays days 4 to 15 and Social Security the rest, through the payslip. An accident at work or an illness caused by the job pays 75% from the day after. The doctor’s note reaches the business electronically: nothing to hand in. The convenio often pays more.') },
    { key: 'pregnancy_risk', group: 'health', name: msg('Risk during pregnancy or breastfeeding'), term: 'Riesgo durante el embarazo y la lactancia natural', law: 'Art. 48.7 ET',
      amount: null, allowance: msg('While the risk lasts'), payer: 'social_security', pay: msg('100% of the regulatory base'),
      detail: msg('When the job can’t be made safe (lifting, long hours standing, heat) or changed for another, the contract pauses until the birth, or until the baby is 9 months old.') },
    { key: 'birth', group: 'family', name: msg('Birth and childcare leave'), term: 'Nacimiento y cuidado del menor', law: 'Art. 48.4 ET', amount: 19,
      allowance: msg('{n} weeks for each parent'), payer: 'social_security', pay: msg('100% of the regulatory base'), leave: 'birth',
      detail: msg('The first 6 weeks straight after the birth, full time; 11 more before the baby turns 1, at once or in weeks; and 2 more until the child turns 8. 32 weeks for a single parent. The same for adoption and fostering. The mother can start up to 4 weeks before the due date.') },
    { key: 'nursing', group: 'family', name: msg('Nursing time'), term: 'Permiso de lactancia', law: 'Art. 37.4 ET', amount: 1,
      allowance: msg('{n} hour a day until the baby is 9 months old'), payer: 'business', pay: msg('Full pay'),
      detail: msg('For either parent: an hour off each day (or two halves), half an hour less each day, or added up into whole days as the convenio or an agreement allows. Until 12 months when both parents take it the same way, unpaid after 9.') },
    { key: 'parental', group: 'family', name: msg('Parental leave'), term: 'Permiso parental', law: 'Art. 48 bis ET', amount: 8,
      allowance: msg('Up to {n} weeks until the child turns 8'), payer: 'unpaid', pay: msg('Unpaid: the contract pauses'), leave: 'parental',
      detail: msg('For each parent, at once or in whole weeks, full or part time. Asked for at least 10 days ahead.') },
    { key: 'reduced_hours', group: 'family', name: msg('Shorter hours to care for someone'), term: 'Reducción de jornada por guarda legal', law: 'Art. 37.6 ET', amount: 12,
      allowance: msg('For a child under {n}, or a relative who needs care'), payer: 'unpaid', pay: msg('Pay goes down in step with the hours'),
      detail: msg('From an eighth to half of their hours, choosing when within their usual working day.') },
    { key: 'marriage', group: 'family', name: msg('Marriage or registered partnership'), term: 'Matrimonio o registro de pareja de hecho', law: 'Art. 37.3.a ET', amount: 15,
      allowance: msg('{n} calendar days'), payer: 'business', pay: msg('Full pay'), leave: 'marriage',
      detail: msg('Counted from the wedding day, or the next working day when it falls on a day off.') },
    { key: 'family', group: 'family', name: msg('A relative’s accident, serious illness or hospital stay'), term: 'Accidente, enfermedad grave u hospitalización de un familiar', law: 'Art. 37.3.b ET', amount: 5,
      allowance: msg('{n} days each time'), payer: 'business', pay: msg('Full pay'), leave: 'family',
      detail: msg('For a spouse or partner, a relative up to the second degree (parents, children, grandparents, grandchildren, brothers and sisters, and the same by marriage), or someone who lives with them and needs their care. Surgery without a stay that needs rest at home counts too.') },
    { key: 'bereavement', group: 'family', name: msg('Bereavement'), term: 'Fallecimiento de un familiar', law: 'Art. 37.3.b bis ET', amount: 2,
      allowance: msg('{n} days, 2 more when they travel'), payer: 'business', pay: msg('Full pay'), leave: 'bereavement',
      detail: msg('For the death of a spouse or partner, or of a relative up to the second degree.') },
    { key: 'urgent', group: 'family', name: msg('Urgent family reasons'), term: 'Fuerza mayor familiar', law: 'Art. 37.9 ET', amount: 4,
      allowance: msg('{n} days a year, in hours'), payer: 'business', pay: msg('Full pay'), leave: 'urgent',
      detail: msg('When an illness or accident at home needs them there straight away. Paid up to the hours of 4 working days a year.') },
    { key: 'moving', group: 'other', name: msg('Moving house'), term: 'Traslado de domicilio', law: 'Art. 37.3.c ET', amount: 1,
      allowance: msg('{n} day'), payer: 'business', pay: msg('Full pay'), leave: 'moving', detail: msg('The day of the move.') },
    { key: 'climate', group: 'other', name: msg('Can’t get to work: weather or emergency'), term: 'Permiso por imposibilidad de acceso (climático)', law: 'Art. 37.3.g ET', amount: 4,
      allowance: msg('Up to {n} days each time'), payer: 'business', pay: msg('Full pay'),
      detail: msg('When the authorities restrict travel, or there’s serious, imminent danger (a storm, floods, a fire), and the work can’t be done from home. Not made up.') },
    { key: 'public_duty', group: 'other', name: msg('Public duties'), term: 'Deber inexcusable de carácter público y personal', law: 'Art. 37.3.d ET', amount: null,
      allowance: msg('The time needed'), payer: 'business', pay: msg('Full pay'),
      detail: msg('Sitting on a jury or a polling station, a court summons, renewing official documents.') },
    { key: 'prenatal', group: 'other', name: msg('Antenatal checks and classes'), term: 'Exámenes prenatales y preparación al parto', law: 'Art. 37.3.f ET', amount: null,
      allowance: msg('The time needed'), payer: 'business', pay: msg('Full pay'),
      detail: msg('When they have to be in working hours. The same for the meetings and reports needed to adopt or foster.') },
  ],
}

/** The business's allocation for one of the law's (law_key), or a benefit of its own (name). */
export interface Benefit {
  id: string
  law_key: string | null
  name: string | null
  /** More than the law gives, in the entitlement's unit; null: the law's. */
  amount: number | null
  details: string | null
  sort: number
}
export type BenefitInput = Partial<Omit<Benefit, 'id'>> & { id?: string }

/** One person's holiday for a year, when it isn't the business's (they started part-way, days carried over). */
export interface LeaveAllowance {
  profile_id: string
  year: number
  holiday_days: number
  note: string | null
}

/** What small businesses often give on top of the law: ideas to add in one press. */
export const PERK_IDEAS: string[] = [
  msg('A staff meal on every shift'),
  msg('Free coffee and drinks on shift'),
  msg('Staff discount'),
  msg('Their birthday off'),
  msg('Tips shared out every month'),
  msg('Paid training and the food handler certificate'),
]

/** Their allocation: the business's own amount when it's set, else the law's. */
export const allocated = (e: Pick<Entitlement, 'amount'>, own?: Pick<Benefit, 'amount'> | null) => own?.amount ?? e.amount

/** A convenio or contract can give more than the law, never less. */
export const belowLaw = (e: Pick<Entitlement, 'amount'>, amount: number | null) => amount !== null && e.amount !== null && amount < e.amount

const DAY = 86_400_000
const ms = (d: string) => Date.parse(`${d}T12:00:00Z`)

/** Calendar days of a stretch that fall between two days (both counted). */
export function daysBetween(r: Pick<TimeOff, 'starts_on' | 'ends_on'>, from: string, to: string) {
  const a = r.starts_on > from ? r.starts_on : from
  const b = r.ends_on < to ? r.ends_on : to
  return b < a ? 0 : Math.round((ms(b) - ms(a)) / DAY) + 1
}

export const daysInYear = (year: number) => Math.round((ms(`${year}-12-31`) - ms(`${year}-01-01`)) / DAY) + 1

/**
 * Holiday for someone who starts or leaves part-way through the year: their share of its days,
 * rounded up (in their favour).
 */
export function proRata(days: number, year: number, from?: string | null, to?: string | null) {
  const share = daysBetween({ starts_on: from || `${year}-01-01`, ends_on: to || `${year}-12-31` }, `${year}-01-01`, `${year}-12-31`)
  return Math.ceil((days * share) / daysInYear(year))
}

export interface LeaveYear {
  /** Holiday days taken: approved, up to today. */
  holidayTaken: number
  /** Holiday days still to come: approved after today, or waiting for approval. */
  holidayBooked: number
  /** Approved days of every other kind in the year, by kind. */
  days: Partial<Record<TimeOffKind, number>>
}

/** One person's time off in a year, as the allocation counts it (the same days the database counts). */
export function leaveYear(list: TimeOff[], profileId: string, year: number, today: string): LeaveYear {
  const y0 = `${year}-01-01`, y1 = `${year}-12-31`
  const out: LeaveYear = { holidayTaken: 0, holidayBooked: 0, days: {} }
  for (const r of list) {
    if (r.profile_id !== profileId) continue
    if (r.kind === 'vacation') {
      if (r.status === 'approved') {
        out.holidayTaken += daysBetween(r, y0, today < y1 ? today : y1)
        out.holidayBooked += daysBetween(r, today >= y0 ? next(today) : y0, y1)
      } else if (r.status === 'pending') out.holidayBooked += daysBetween(r, y0, y1)
    } else if (r.status === 'approved') {
      const n = daysBetween(r, y0, y1)
      if (n) out.days[r.kind] = (out.days[r.kind] ?? 0) + n
    }
  }
  return out
}
const next = (d: string) => new Date(ms(d) + DAY).toISOString().slice(0, 10)

/** Approved time off that covers a day. */
export const awayOn = (list: TimeOff[], day: string) => list.filter(r => r.status === 'approved' && r.starts_on <= day && r.ends_on >= day)
