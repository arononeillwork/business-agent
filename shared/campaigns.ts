// Campaigns: one message (an email, a text or a WhatsApp) to the customers and leads who said yes to
// marketing, picked by type, tag and where they came from. Spain/GDPR: only people with marketing
// consent are ever in an audience. Sending straight from the app comes with an email marketing
// service (Brevo or Mailchimp, on Connections); until then the audience is exported to send from one.
import { msg } from './i18n'
import type { Customer, CustomerKind, CustomerSource } from './types'

export type CampaignChannel = 'email' | 'sms' | 'whatsapp'
export const CAMPAIGN_CHANNELS: { id: CampaignChannel; label: string }[] = [
  { id: 'email', label: msg('Email') }, { id: 'sms', label: msg('Text message') }, { id: 'whatsapp', label: 'WhatsApp' },
]
export const channelName = (c: CampaignChannel) => CAMPAIGN_CHANNELS.find(x => x.id === c)!.label

export type CampaignStatus = 'draft' | 'scheduled' | 'sent'
export const CAMPAIGN_STATUSES: { id: CampaignStatus; label: string }[] = [
  { id: 'draft', label: msg('Draft') }, { id: 'scheduled', label: msg('Planned') }, { id: 'sent', label: msg('Sent') },
]
export const campaignStatusLabel = (s: CampaignStatus) => CAMPAIGN_STATUSES.find(x => x.id === s)!.label

/** Who it goes to. Empty lists mean anyone. */
export interface Audience { kinds: CustomerKind[]; tags: string[]; sources: CustomerSource[] }
export const EVERYONE: Audience = { kinds: [], tags: [], sources: [] }

export interface Campaign {
  id: string
  name: string
  channel: CampaignChannel
  /** Emails only. */
  subject: string | null
  body: string
  audience: Audience
  status: CampaignStatus
  scheduled_at: string | null
  sent_at: string | null
  /** How many it went to (kept when it's marked sent). */
  recipients: number | null
  notes: string | null
  created_at: string
}
export type CampaignInput = Partial<Omit<Campaign, 'id' | 'created_at'>> & { id?: string; name: string }

/** Reachable on that channel: an email for email, a phone number for texts and WhatsApp. */
export const reachable = (c: Pick<Customer, 'email' | 'phone'>, channel: CampaignChannel) => (channel === 'email' ? !!c.email : !!c.phone)

/** The people a campaign goes to: they said yes to marketing, can be reached on its channel, and match its audience. */
export function audienceOf<C extends Pick<Customer, 'kind' | 'tags' | 'source' | 'marketing_consent' | 'email' | 'phone'>>(customers: C[], a: Audience, channel: CampaignChannel): C[] {
  return customers.filter(c => c.marketing_consent && reachable(c, channel)
    && (!a.kinds.length || a.kinds.includes(c.kind))
    && (!a.tags.length || c.tags.some(t => a.tags.includes(t)))
    && (!a.sources.length || a.sources.includes(c.source)))
}

/** Written in the message where each person's first name goes. */
export const FIRST_NAME_TAG = '[first name]'

/** The message as one person gets it: their first name in place of the tag (or nothing, tidily, when there's none). */
export function personalise(body: string, firstName: string | null) {
  return firstName ? body.split(FIRST_NAME_TAG).join(firstName) : body.split(` ${FIRST_NAME_TAG}`).join('').split(FIRST_NAME_TAG).join('')
}

// Text messages: 160 plain characters fit one (153 each when it takes several); with an emoji or a
// letter outside the GSM alphabet, 70 (67 each).
const GSM = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/
/** How many text messages it takes to send. */
export function smsParts(text: string) {
  if (!text) return 0
  const plain = GSM.test(text)
  const length = plain ? [...text].reduce((n, ch) => n + ('^{}\\[~]|€'.includes(ch) ? 2 : 1), 0) : [...text].length
  const one = plain ? 160 : 70
  return length <= one ? 1 : Math.ceil(length / (plain ? 153 : 67))
}
