// Suggested campaigns (Campaigns → Suggested): ready-made ideas for a café's marketing messages, each
// with why it helps, the channels it suits, when it works best (worked out from today), the effort it
// takes and what to measure. Starting one fills in a new campaign, which keeps the idea's key (`idea`,
// the `campaign_inactive` migration) so the idea isn't suggested again while that campaign is there.
// Text is English through msg(), translated where it's shown; {business} is the business's name and
// [first name] each person's (FIRST_NAME_TAG).
import { msg } from './i18n'
import { zonedIso } from './time'
import type { Audience, Campaign, CampaignChannel, CampaignInput } from './campaigns'

export type Effort = 'low' | 'medium' | 'high'
export const EFFORTS: { id: Effort; label: string; days: number }[] = [
  // `days`: how long it takes to get ready, so it isn't planned for sooner.
  { id: 'low', label: msg('Low effort'), days: 2 },
  { id: 'medium', label: msg('Medium effort'), days: 5 },
  { id: 'high', label: msg('High effort'), days: 10 },
]
export const effortLabel = (e: Effort) => EFFORTS.find(x => x.id === e)!.label

/** A stretch of the year (month-day to month-day, it may run over New Year), worth starting on `lead` days before it. */
export interface Season { from: string; to: string; lead: number }

export interface CampaignIdea {
  /** Kept on a campaign started from it. Never renamed. */
  key: string
  title: string
  /** Why it helps, in a line. */
  why: string
  /** The channels it suits; the first is the one filled in. */
  channels: CampaignChannel[]
  /** Who it goes to. A tag nobody on Customers has is left out when it's started. */
  audience: Audience
  /** For email. */
  subject: string
  body: string
  effort: Effort
  /** What to measure. */
  goal: string
  /** A word of advice, kept in the campaign's notes. */
  tip?: string
  /** When it works best; none: any time. */
  best: Season[]
  /** Still worth doing outside `best`. */
  allYear: boolean
  /** When in the week to send it: 0 Monday … 6 Sunday, and the time. */
  send: { weekday: number; time: string }
  /** Its order among ideas at the same point in their year (higher first). */
  weight: number
}

const CUSTOMERS: Audience = { kinds: ['customer'], tags: [], sources: [] }
const EVERYONE: Audience = { kinds: [], tags: [], sources: [] }
const BUSINESSES: Audience = { kinds: ['lead'], tags: ['B2B'], sources: [] }
const TUESDAY_10 = { weekday: 1, time: '10:00' }

export const CAMPAIGN_IDEAS: CampaignIdea[] = [
  {
    key: 'brand_awareness', title: msg('Brand awareness'),
    why: msg('Tell people who you are: your story, your specialty coffee and why it’s worth the walk.'),
    channels: ['email', 'whatsapp'], audience: EVERYONE, effort: 'medium',
    goal: msg('New faces: ask at the till how they heard of you'),
    subject: msg('The story behind {business}'),
    body: msg('Hi [first name],\n\nWe’re {business}, specialty coffee made with care. We opened because we believe coffee should be done properly: beans from small roasters, freshly roasted, and baristas who care about every cup.\n\nCome and taste the difference, and bring a friend who hasn’t been yet.\n\nSee you soon,\n{business}'),
    best: [], allYear: true, send: TUESDAY_10, weight: 40,
  },
  {
    key: 'anniversary', title: msg('Anniversary or new season'),
    why: msg('A birthday or the start of the season is a reason to come back: thank people with a treat for a day or a week.'),
    channels: ['email', 'sms'], audience: CUSTOMERS, effort: 'medium',
    goal: msg('Visits during the celebration: count the treats given at the till'),
    subject: msg('We’re celebrating, and you’re invited'),
    body: msg('Hi [first name],\n\n{business} is celebrating, and we’d love to see you. Come in this week for a treat on us with your coffee.\n\nThank you for being part of it,\n{business}'),
    best: [{ from: '04-01', to: '04-30', lead: 21 }], allYear: false, send: TUESDAY_10, weight: 20,
  },
  {
    key: 'loyalty_signup', title: msg('Loyalty sign-up push'),
    why: msg('Regulars who collect stamps come back more often; sign up the ones who haven’t joined yet.'),
    channels: ['email', 'sms'], audience: CUSTOMERS, effort: 'low',
    goal: msg('New loyalty members (Loyalty & gift cards)'),
    subject: msg('Your coffees can earn you free ones'),
    body: msg('Hi [first name],\n\nDid you know your coffees at {business} can earn you free ones? Ask at the till to join our loyalty card: it takes a few seconds, and every visit counts from then on.\n\nSee you soon,\n{business}'),
    // Quieter months, when regulars are the takings.
    best: [{ from: '01-07', to: '02-28', lead: 0 }, { from: '10-01', to: '11-30', lead: 0 }], allYear: true, send: TUESDAY_10, weight: 30,
  },
  {
    key: 'win_back', title: msg('Win back lapsed customers'),
    why: msg('Bringing back someone who hasn’t been in for a while costs far less than finding someone new.'),
    channels: ['email', 'sms', 'whatsapp'], audience: CUSTOMERS, effort: 'low',
    goal: msg('Lapsed customers back: count the messages shown at the till'),
    tip: msg('Send it to the customers you haven’t seen for two months or more: give them a tag on Customers and pick it here.'),
    subject: msg('We’ve missed you'),
    body: msg('Hi [first name],\n\nWe’ve missed you at {business}! Show this message at the till this week and your next coffee is half price.\n\nHope to see you soon,\n{business}'),
    // After the summer and Christmas, when routines restart.
    best: [{ from: '01-07', to: '02-28', lead: 0 }, { from: '09-01', to: '10-15', lead: 0 }], allYear: true, send: TUESDAY_10, weight: 25,
  },
  {
    key: 'quiet_days', title: msg('Quiet-day boost'),
    why: msg('Fill slow Monday and Tuesday afternoons with a reason to drop in, without discounting your busy times.'),
    channels: ['sms', 'whatsapp', 'email'], audience: CUSTOMERS, effort: 'low',
    goal: msg('Monday and Tuesday afternoon takings (Sales)'),
    tip: msg('Keep the offer to the quiet hours, so it doesn’t eat into what you’d sell anyway.'),
    subject: msg('Quiet afternoon treat at {business}'),
    body: msg('{business}: quiet afternoons are better with cake. This Monday and Tuesday from 3 pm, coffee and a slice of cake at a special price. Show this message at the till.'),
    // The low season, when afternoons are quietest.
    best: [{ from: '11-01', to: '03-15', lead: 0 }], allYear: true, send: { weekday: 0, time: '10:00' }, weight: 18,
  },
  {
    key: 'partnerships', title: msg('Local partnerships'),
    why: msg('Hotels, gyms, yoga studios and coworkings nearby can send you their guests and members, for a perk in return.'),
    channels: ['email'], audience: BUSINESSES, effort: 'high',
    goal: msg('Partners signed up, and the customers they send (Sales reps & rewards)'),
    tip: msg('Give each partner a code on Sales reps & rewards to see who they send you.'),
    subject: msg('A coffee perk for your guests and members'),
    body: msg('Hi [first name],\n\nI’m writing from {business}, the specialty coffee bar near you. We’d love to offer your guests, members or team a perk: 10% off with your card or our code.\n\nIn return we’d only ask you to mention us. Could I drop by with a coffee to talk about it?\n\nBest wishes,\n{business}'),
    // Before the season, and when hotels and gyms plan the autumn.
    best: [{ from: '02-01', to: '04-15', lead: 0 }, { from: '09-01', to: '10-15', lead: 0 }], allYear: true, send: TUESDAY_10, weight: 15,
  },
  {
    key: 'reviews', title: msg('Reviews drive'),
    why: msg('Google reviews bring new people from Maps, and your regulars only need asking.'),
    channels: ['email', 'whatsapp'], audience: { kinds: ['customer'], tags: ['regular'], sources: [] }, effort: 'low',
    goal: msg('New Google reviews (Reviews)'),
    // Google's review policy; EU Directive 2019/2161 (Omnibus), in Spain's consumer law since 2022.
    tip: msg('Ask, never pay: no discount, gift or prize draw for a review, and ask everyone, not just the people you know are happy. Google’s rules forbid both, and EU and Spanish consumer law forbid fake or misleading reviews.'),
    subject: msg('Could you spare a minute for us?'),
    body: msg('Hi [first name],\n\nThank you for coming to {business}. If you have a minute, an honest review on Google would mean a lot to us: it helps people nearby find us.\n\nSearch for {business} on Google Maps and tap “Write a review”.\n\nThank you!\n{business}'),
    // After the summer, with the season's visitors still remembering you.
    best: [{ from: '09-01', to: '10-31', lead: 0 }], allYear: true, send: { weekday: 3, time: '11:00' }, weight: 35,
  },
  {
    key: 'autumn_menu', title: msg('Autumn menu launch'),
    why: msg('Pumpkin spice, chai and warm spices: the first cool days are when people go looking for them.'),
    channels: ['email', 'sms', 'whatsapp'], audience: CUSTOMERS, effort: 'medium',
    goal: msg('Seasonal drinks sold (Sales, best sellers)'),
    subject: msg('Autumn is here: pumpkin spice is back'),
    body: msg('Hi [first name],\n\nAutumn has arrived at {business}: pumpkin spice lattes, chai and warm spiced cakes are back on the menu.\n\nCome and try them while they last!\n{business}'),
    best: [{ from: '09-22', to: '11-15', lead: 14 }], allYear: false, send: { weekday: 3, time: '10:00' }, weight: 30,
  },
  {
    key: 'christmas', title: msg('Christmas menu'),
    why: msg('Festive lattes, Christmas treats and gift cards: people plan their December treats in November.'),
    channels: ['email', 'whatsapp', 'sms'], audience: EVERYONE, effort: 'medium',
    goal: msg('Christmas drinks and gift cards sold'),
    tip: msg('Put the gift cards in the message: in December they’re an easy present.'),
    subject: msg('Christmas at {business}'),
    body: msg('Hi [first name],\n\nChristmas has come to {business}: festive lattes, Christmas treats, and gift cards for the coffee lovers in your life.\n\nCome and get into the Christmas spirit with us!\n{business}'),
    // Suggested from the start of November, sent the week before December.
    best: [{ from: '12-01', to: '01-06', lead: 30 }], allYear: false, send: TUESDAY_10, weight: 40,
  },
  {
    key: 'summer_drinks', title: msg('Summer iced drinks'),
    why: msg('When it’s hot, iced lattes, cold brew and frappés bring people in for an afternoon cool-down.'),
    channels: ['email', 'sms', 'whatsapp'], audience: CUSTOMERS, effort: 'low',
    goal: msg('Iced drinks sold (Sales, best sellers)'),
    subject: msg('Cool down at {business}'),
    body: msg('Hi [first name],\n\nSummer is here and so are our iced drinks: iced lattes, cold brew and frappés, made with the same specialty coffee.\n\nCome in and cool down!\n{business}'),
    best: [{ from: '06-01', to: '08-31', lead: 21 }], allYear: false, send: { weekday: 3, time: '10:00' }, weight: 30,
  },
  {
    key: 'match_nights', title: msg('Event and match nights'),
    why: msg('Big matches and events bring people out on nights they’d stay in; tell them beforehand.'),
    channels: ['whatsapp', 'sms'], audience: CUSTOMERS, effort: 'medium',
    goal: msg('Takings on event nights against a usual night'),
    tip: msg('The Sports page has the big nights coming up.'),
    subject: msg('Big match night at {business}'),
    body: msg('Hi [first name], big match coming up! Watch it at {business} with good drinks and snacks. Come early for the best seats.'),
    // Whenever there's a big night: the Sports page says when.
    best: [], allYear: true, send: { weekday: 3, time: '12:00' }, weight: 5,
  },
  {
    // Written in English for English speakers, so not through msg(): it stays English in any language.
    key: 'tourists_expats', title: msg('Tourists & expats'),
    why: msg('English speakers on holiday or living nearby look for a friendly place with great coffee: tell them in English.'),
    channels: ['email', 'whatsapp'], audience: { kinds: [], tags: ['English', 'expat', 'tourist'], sources: [] }, effort: 'low',
    goal: msg('New English-speaking customers on Customers'),
    tip: msg('Written in English for English speakers, whatever language you use the app in.'),
    subject: 'Great coffee and a warm welcome at {business}',
    body: 'Hi [first name],\n\nWelcome to {business}! Whether you’re here on holiday or you live nearby, come and enjoy specialty coffee, fresh cakes and a warm welcome. We speak English, of course.\n\nSee you soon,\n{business}',
    // Easter to October, the visitors' season.
    best: [{ from: '04-01', to: '10-31', lead: 21 }], allYear: true, send: TUESDAY_10, weight: 8,
  },
  {
    key: 'corporate_catering', title: msg('Office and corporate catering'),
    why: msg('Offices nearby order coffee and breakfast for meetings and celebrations; one booking can be worth a morning’s takings.'),
    channels: ['email'], audience: BUSINESSES, effort: 'high',
    goal: msg('Catering enquiries (Leads & enquiries)'),
    tip: msg('Have a simple price list ready to send back the same day.'),
    subject: msg('Coffee and breakfast for your team'),
    body: msg('Hi [first name],\n\n{business} caters for offices: specialty coffee, pastries and breakfast boxes for meetings, training days and team celebrations, delivered or ready to collect.\n\nReply to this email and we’ll send you our menu and prices.\n\nBest wishes,\n{business}'),
    // Back to work after the summer, and Christmas at the office.
    best: [{ from: '09-01', to: '10-15', lead: 0 }, { from: '11-01', to: '12-15', lead: 0 }], allYear: true, send: TUESDAY_10, weight: 12,
  },
  {
    key: 'welcome_series', title: msg('Newsletter welcome series'),
    why: msg('Greet everyone who’s just said yes with your story and a welcome treat, while you’re fresh in their mind.'),
    channels: ['email'], audience: EVERYONE, effort: 'medium',
    goal: msg('Welcome treats claimed at the till'),
    tip: msg('Send it every month to the people who said yes since the last one: give them a tag on Customers and pick it here.'),
    subject: msg('Welcome to {business}'),
    body: msg('Hi [first name],\n\nThank you for joining us! At {business} we serve specialty coffee from small roasters, made with care every day.\n\nAs a welcome, your next coffee is on us: just show this email at the till.\n\nSee you soon,\n{business}'),
    best: [], allYear: true, send: TUESDAY_10, weight: 22,
  },
]

// ---------------------------------------------------------------------------------------------
// When: the stretch an idea is in (or the next one), and the day to send it
// ---------------------------------------------------------------------------------------------

const DAY = 86_400_000
const at = (date: string) => new Date(`${date}T12:00:00Z`)
const plusDays = (date: string, n: number) => new Date(at(date).getTime() + n * DAY).toISOString().slice(0, 10)
const daysFrom = (from: string, to: string) => Math.round((at(to).getTime() - at(from).getTime()) / DAY)
const later = (a: string, b: string) => (a > b ? a : b)
/** The first `weekday` (0 Monday … 6 Sunday) on or after `date`. */
const onOrAfter = (date: string, weekday: number) => plusDays(date, (weekday - ((at(date).getUTCDay() + 6) % 7) + 7) % 7)

/**
 * Where an idea is in its year:
 * - now: in its best stretch;
 * - soon: in the run-up to it (its `lead`);
 * - any: an any-time idea outside a best stretch (or with none);
 * - later: a seasonal idea out of season; `from` is when it's worth starting on.
 */
export type Phase = 'now' | 'soon' | 'any' | 'later'
export interface Suggestion {
  idea: CampaignIdea
  phase: Phase
  /** The best stretch it's in or coming up to (now, soon), or the next one (later); null for any. */
  from: string | null
  to: string | null
  /** The day to send it (yyyy-MM-dd) and the time. */
  send_on: string
  send_at: string
  /** Higher first. */
  score: number
}

/** The idea's best stretches around `today`, earliest first, from the one `today` may be in. */
function stretches(idea: CampaignIdea, today: string) {
  const y = Number(today.slice(0, 4))
  return [y - 1, y, y + 1, y + 2]
    .flatMap(year => idea.best.map(s => ({ s, from: `${year}-${s.from}`, to: `${s.to < s.from ? year + 1 : year}-${s.to}` })))
    .filter(x => x.to >= today)
    .sort((a, b) => a.from.localeCompare(b.from))
}

/** When an idea works best from `today`, the day to send it, and how relevant it is now. */
export function timing(idea: CampaignIdea, today: string): Suggestion {
  const ready = plusDays(today, EFFORTS.find(e => e.id === idea.effort)!.days)
  // A week before its stretch starts, once it's ready, on its day of the week.
  const sendFor = (from: string) => onOrAfter(later(ready, plusDays(from, -7)), idea.send.weekday)
  const base = { idea, send_at: idea.send.time }
  const all = stretches(idea, today)
  const current = all.find(x => plusDays(x.from, -x.s.lead) <= today && sendFor(x.from) <= x.to)
  if (current) {
    const soon = today < current.from
    // A seasonal idea in or near its season first, then an any-time one at its best time of year.
    return { ...base, phase: soon ? 'soon' : 'now', from: current.from, to: current.to, send_on: sendFor(current.from),
      score: (idea.allYear ? 300 : 400) + idea.weight - (soon ? daysFrom(today, current.from) : 0) }
  }
  if (idea.allYear) return { ...base, phase: 'any', from: null, to: null, send_on: onOrAfter(ready, idea.send.weekday), score: 100 + idea.weight }
  const next = all.find(x => plusDays(x.from, -x.s.lead) > today)!
  const start = plusDays(next.from, -next.s.lead)
  return { ...base, phase: 'later', from: start, to: next.to, send_on: sendFor(next.from), score: -daysFrom(today, start) + idea.weight / 100 }
}

/**
 * Ideas a campaign was started from: not suggested while it's there, unless it was sent more than
 * ten months ago (a seasonal one comes round again the next year).
 */
export function takenIdeas(campaigns: Pick<Campaign, 'idea' | 'status' | 'sent_at'>[], today: string) {
  return new Set(campaigns.filter(c => c.idea && !(c.status === 'sent' && c.sent_at && daysFrom(c.sent_at.slice(0, 10), today) > 300)).map(c => c.idea!))
}

/** The ideas to suggest on `today`, most relevant first, leaving out those already started. */
export function suggestCampaigns(today: string, campaigns: Pick<Campaign, 'idea' | 'status' | 'sent_at'>[]): Suggestion[] {
  const taken = takenIdeas(campaigns, today)
  return CAMPAIGN_IDEAS.filter(i => !taken.has(i.key)).map(i => timing(i, today))
    .sort((a, b) => b.score - a.score || a.idea.key.localeCompare(b.idea.key))
}

/**
 * A new campaign from a suggestion, ready to change and save: its name (with the year for a seasonal
 * one), message, channel, audience (with only the tags someone on Customers has, spelt as they are
 * there), planned for its day, with the goal, why and any advice in the notes. `say` translates.
 */
export function campaignFrom(s: Suggestion, { say, business, tags }: {
  say: (text: string, vars?: Record<string, string | number>) => string; business: string; tags: string[]
}): CampaignInput {
  const { idea } = s
  const vars = { business }
  const known = (tag: string) => tags.find(x => x.toLowerCase() === tag.toLowerCase())
  return {
    name: idea.allYear || !s.from ? say(idea.title) : `${say(idea.title)} ${s.from.slice(0, 4)}`,
    channel: idea.channels[0],
    subject: say(idea.subject, vars),
    body: say(idea.body, vars),
    audience: { ...idea.audience, tags: idea.audience.tags.map(known).filter((x): x is string => !!x) },
    status: 'scheduled',
    scheduled_at: zonedIso(s.send_on, s.send_at),
    notes: [say(msg('Goal: {goal}'), { goal: say(idea.goal) }), say(idea.why), idea.tip ? say(idea.tip) : ''].filter(Boolean).join('\n\n'),
    idea: idea.key,
  }
}
