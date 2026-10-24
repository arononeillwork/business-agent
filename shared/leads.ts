// Leads & enquiries: what someone asked for (cakes for a baby shower, the terrace for a birthday,
// coffee for an office), where it came in, how far it's got and when to follow it up. Each enquiry
// belongs to a person on the Customers page (a lead until one of theirs is won); a quote made for
// it moves it to Quoted, and the quote accepted makes it Won (Quotes & estimates).
import { msg } from './i18n'
import type { Customer, CustomerInput, CustomerSource } from './types'

export type EnquiryStage = 'new' | 'contacted' | 'quoted' | 'won' | 'lost'
export const STAGES: { id: EnquiryStage; label: string }[] = [
  { id: 'new', label: msg('New') }, { id: 'contacted', label: msg('Contacted') }, { id: 'quoted', label: msg('Quoted') },
  { id: 'won', label: msg('Won') }, { id: 'lost', label: msg('Lost') },
]
export const OPEN_STAGES: EnquiryStage[] = ['new', 'contacted', 'quoted']
export const stageLabel = (s: EnquiryStage) => STAGES.find(x => x.id === s)!.label

export type EnquiryChannel = 'whatsapp' | 'instagram' | 'email' | 'phone' | 'website' | 'walk_in' | 'other'
/** Where it came in. Brand names are the same in every language. */
export const CHANNELS: { id: EnquiryChannel; label: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp' }, { id: 'instagram', label: 'Instagram' }, { id: 'email', label: msg('Email') },
  { id: 'phone', label: msg('Phone') }, { id: 'website', label: msg('Website') }, { id: 'walk_in', label: msg('In person') },
  { id: 'other', label: msg('Other') },
]
export const channelLabel = (c: EnquiryChannel) => CHANNELS.find(x => x.id === c)!.label

/** A new person typed in with the enquiry comes from the same place (Customers has no WhatsApp or phone source). */
export const SOURCE_FOR: Record<EnquiryChannel, CustomerSource> = {
  whatsapp: 'other', instagram: 'instagram', email: 'other', phone: 'other', website: 'website', walk_in: 'walk_in', other: 'other',
}

export interface Enquiry {
  id: string
  customer_id: string
  /** What they asked for, in a line. */
  title: string
  channel: EnquiryChannel
  stage: EnquiryStage
  /** What it could be worth, IVA included: a guess until there's a quote. */
  value: number | null
  /** The day it's for (the party, the first delivery). */
  wanted_on: string | null
  follow_up_on: string | null
  assigned_to: string | null
  lost_reason: string | null
  notes: string | null
  received_at: string
  /** When it was won or lost (the database keeps it). */
  closed_at: string | null
  /** The person, from Customers. */
  customer?: Pick<Customer, 'first_name' | 'last_name' | 'company' | 'email' | 'phone' | 'kind'> | null
}
export type EnquiryInput = Partial<Omit<Enquiry, 'id' | 'customer' | 'closed_at'>> & { id?: string; title: string }
/** Someone new, typed in with their enquiry: they're added to Customers as a lead. */
export type NewLead = Pick<CustomerInput, 'first_name' | 'last_name' | 'email' | 'phone' | 'company' | 'marketing_consent'>

export const isOpen = (e: Pick<Enquiry, 'stage'>) => OPEN_STAGES.includes(e.stage)

/** Still open and its follow-up day has come (or gone). */
export const followUpDue = (e: Pick<Enquiry, 'stage' | 'follow_up_on'>, today: string) => isOpen(e) && !!e.follow_up_on && e.follow_up_on <= today

export interface Pipeline {
  open: number
  /** What the open ones could be worth. */
  openValue: number
  /** Won since `from`, and what they're worth. */
  won: number
  wonValue: number
  /** Won out of those won or lost since `from` (0–100); null when none closed. */
  winRate: number | null
}

/** The figures at the top of the page: what's open now, and what was won and lost since a day. */
export function pipeline(list: Pick<Enquiry, 'stage' | 'value' | 'closed_at'>[], from: string): Pipeline {
  const open = list.filter(isOpen)
  const closed = list.filter(e => !isOpen(e) && !!e.closed_at && e.closed_at.slice(0, 10) >= from)
  const won = closed.filter(e => e.stage === 'won')
  const sum = (xs: typeof list) => Math.round(xs.reduce((s, e) => s + (e.value ?? 0), 0) * 100) / 100
  return {
    open: open.length, openValue: sum(open), won: won.length, wonValue: sum(won),
    winRate: closed.length ? Math.round((won.length / closed.length) * 100) : null,
  }
}
