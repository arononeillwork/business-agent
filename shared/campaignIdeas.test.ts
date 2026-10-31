import { describe, expect, it } from 'vitest'
import { CAMPAIGN_IDEAS, campaignFrom, suggestCampaigns, takenIdeas, timing } from './campaignIdeas'
import { CAMPAIGN_CHANNELS, smsParts } from './campaigns'
import { zonedIso } from './time'

const idea = (key: string) => CAMPAIGN_IDEAS.find(i => i.key === key)!
const dayOfWeek = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7 // 0 Monday

describe('campaign ideas', () => {
  it('each has a key the database takes, why it helps, channels, an effort, a goal and a message', () => {
    const keys = CAMPAIGN_IDEAS.map(i => i.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(expect.arrayContaining(['brand_awareness', 'anniversary', 'loyalty_signup', 'win_back', 'quiet_days', 'partnerships', 'reviews',
      'autumn_menu', 'christmas', 'summer_drinks', 'match_nights', 'tourists_expats', 'corporate_catering', 'welcome_series']))
    for (const i of CAMPAIGN_IDEAS) {
      expect(i.key).toMatch(/^[a-z0-9_]{1,40}$/) // the campaigns.idea check
      expect(i.title && i.why && i.goal && i.subject && i.body).toBeTruthy()
      expect(i.channels.length).toBeGreaterThan(0)
      for (const c of i.channels) expect(CAMPAIGN_CHANNELS.map(x => x.id)).toContain(c)
      expect(['low', 'medium', 'high']).toContain(i.effort)
      for (const s of i.best) { expect(s.from).toMatch(/^\d\d-\d\d$/); expect(s.to).toMatch(/^\d\d-\d\d$/) }
      expect(i.allYear || i.best.length > 0).toBe(true)
    }
  })

  it('the ones sent by text or WhatsApp first are short: a text or two, no email-style letter', () => {
    for (const i of CAMPAIGN_IDEAS.filter(x => x.channels[0] !== 'email')) {
      expect(smsParts(i.body.replace(/\{business\}/g, 'Easy Beans Coffee')), i.key).toBeLessThanOrEqual(2)
      expect(i.body, i.key).not.toContain('\n')
    }
  })

  it('asks for reviews without paying for them (Google’s rules, EU and Spanish consumer law)', () => {
    expect(idea('reviews').tip).toMatch(/never pay/)
    expect(idea('reviews').body).not.toMatch(/free|off|discount|prize|draw/i)
  })

  it('Christmas: suggested from November, sent the week before December, until Reyes; then next year', () => {
    expect(timing(idea('christmas'), '2026-10-15')).toMatchObject({ phase: 'later', from: '2026-11-01' })
    expect(timing(idea('christmas'), '2026-11-02')).toMatchObject({ phase: 'soon', from: '2026-12-01', to: '2027-01-06', send_on: '2026-11-24', send_at: '10:00' })
    expect(timing(idea('christmas'), '2026-12-20')).toMatchObject({ phase: 'now', send_on: '2026-12-29' }) // once it's ready (medium: 5 days), a Tuesday
    expect(timing(idea('christmas'), '2027-01-03')).toMatchObject({ phase: 'later', from: '2027-11-01' }) // too late to send before Reyes
  })

  it('any-time ideas are planned once they’re ready, on their day of the week', () => {
    const s = timing(idea('brand_awareness'), '2026-09-30') // a Wednesday; medium effort: ready by Monday
    expect(s).toMatchObject({ phase: 'any', from: null, send_on: '2026-10-06' })
    expect(dayOfWeek(s.send_on)).toBe(1) // Tuesday
    expect(dayOfWeek(timing(idea('quiet_days'), '2026-09-30').send_on)).toBe(0) // Monday, for the afternoons that week
  })

  it('most relevant to the day first: seasonal ones in their season, any-time ones next, out of season last', () => {
    const order = suggestCampaigns('2026-10-31', []).map(s => s.idea.key)
    expect(order[0]).toBe('autumn_menu')
    expect(order.indexOf('loyalty_signup')).toBeLessThan(order.indexOf('brand_awareness')) // the quiet months are its best
    expect(order.slice(-3)).toEqual(['christmas', 'anniversary', 'summer_drinks']) // from 1 Nov, March, May
    const november = suggestCampaigns('2026-11-10', []).map(s => s.idea.key)
    expect(november[0]).toBe('christmas')
    const may = suggestCampaigns('2027-05-20', []).map(s => s.idea.key)
    expect(may[0]).toBe('summer_drinks')
    expect(may.slice(-3)).toEqual(['autumn_menu', 'christmas', 'anniversary']) // from September, November, next March
  })

  it('leaves out ideas already started, until one sent over ten months ago comes round again', () => {
    const today = '2026-10-31'
    expect(takenIdeas([
      { idea: 'christmas', status: 'draft', sent_at: null },
      { idea: 'autumn_menu', status: 'sent', sent_at: '2026-10-01T09:00:00Z' },
      { idea: 'summer_drinks', status: 'sent', sent_at: '2025-07-01T09:00:00Z' },
      { idea: null, status: 'draft', sent_at: null },
    ], today)).toEqual(new Set(['christmas', 'autumn_menu']))
    const keys = suggestCampaigns(today, [{ idea: 'brand_awareness', status: 'scheduled', sent_at: null }]).map(s => s.idea.key)
    expect(keys).not.toContain('brand_awareness')
    expect(keys).toHaveLength(CAMPAIGN_IDEAS.length - 1)
  })

  it('starts a campaign: translated, the business’s name in, only tags someone has, planned for its day, the goal in the notes', () => {
    const spanish: Record<string, string> = { 'Reviews drive': 'Campaña de reseñas', 'Goal: {goal}': 'Objetivo: {goal}', 'Tourists & expats': 'Turistas y extranjeros' }
    const say = (text: string, vars: Record<string, string | number> = {}) =>
      (spanish[text] ?? text).replace(/\{(\w+)\}/g, (all, k: string) => (k in vars ? String(vars[k]) : all))
    const s = timing(idea('reviews'), '2026-09-30')
    const c = campaignFrom(s, { say, business: 'Easy Beans Coffee', tags: ['Regular', 'B2B'] })
    expect(c).toMatchObject({ name: 'Campaña de reseñas', channel: 'email', status: 'scheduled', idea: 'reviews',
      audience: { kinds: ['customer'], tags: ['Regular'], sources: [] }, scheduled_at: zonedIso(s.send_on, '11:00') })
    expect(c.body).toContain('Search for Easy Beans Coffee on Google Maps')
    expect(c.notes).toMatch(/^Objetivo: New Google reviews/)
    expect(c.notes).toContain('never pay')
    // A seasonal one has the year in its name; one for English speakers stays in English.
    expect(campaignFrom(timing(idea('christmas'), '2026-11-02'), { say, business: 'Easy Beans', tags: [] }).name).toBe('Christmas menu 2026')
    const tourists = campaignFrom(timing(idea('tourists_expats'), '2026-09-30'), { say, business: 'Easy Beans', tags: ['expat'] })
    expect(tourists).toMatchObject({ name: 'Turistas y extranjeros', subject: 'Great coffee and a warm welcome at Easy Beans', audience: { tags: ['expat'] } })
    expect(tourists.body).toMatch(/^Hi \[first name\],\n\nWelcome to Easy Beans!/)
  })
})
