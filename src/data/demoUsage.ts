// The demo's User analytics: two months of the team using the app, each on their own devices and from their own
// towns, made the same way every time. Aron (owner) on his Mac and his iPhone, once from Dublin; Mark (owner) on
// the office PC in Marbella; Julio on his iPhone, the installed app; Maria on her Android phone from Estepona; Laura
// at the gestoría on hers; the cleaner never. Staff rules: Julio read them properly (and went back to them), Maria
// glanced at them, Mark checked them, Aron wrote them a month ago. The person using the demo adds their own visit.
// Locations: Easy Beans has two shops, each with its own internet connection, named by the owner: the San Pedro
// café (Aron, Julio and Maria) and the Marbella café (Mark, and Aron some days). Everything else (Aron's home,
// Julio's mobile data, Maria's home, the gestoría) isn't named, so it shows as its town.
import type { StoredPage, StoredVisit, UsageDevice, UsageSignIn } from '../../shared/usage'

/** The shops' connections (made up, like the Worker's ids), and the names the owner gave them. */
export const DEMO_CAFE_NETWORK = 'c0ffee0000000001'
const MARBELLA_CAFE = 'c0ffee0000000002'
const DEMO_NAMED = { [DEMO_CAFE_NETWORK]: 'San Pedro café', [MARBELLA_CAFE]: 'Marbella café' }

type Visit = StoredVisit
interface Habit {
  id: string
  /** How likely a visit is on a given day, and the pages they open (the first most). */
  chance: number
  pages: string[]
  devices: { device: UsageDevice; os: string; browser: string; installed: boolean; share: number }[]
  /** Where they use it, and on which connection (several: mobile data, which changes). */
  places: { city: string; region: string; country: string; share: number; networks: string[] }[]
  /** Their usual hour of the day (UTC). */
  hour: number
}

/** The same numbers every time (mulberry32). */
function random(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ANDALUSIA = 'Andalusia'

export function demoUsage(P: { aron: string; mark: string; julio: string; maria: string }, partner: string, now = Date.now()) {
  const habits: Habit[] = [
    { id: P.aron, chance: 0.85, hour: 7, pages: ['today', 'sales', 'rota', 'finances', 'pnl', 'social', 'analytics', 'dashboards', 'timecards', 'messages'],
      devices: [{ device: 'computer', os: 'macOS', browser: 'Chrome', installed: false, share: 0.6 }, { device: 'phone', os: 'iOS', browser: 'Safari', installed: true, share: 0.4 }],
      places: [{ city: 'San Pedro de Alcántara', region: ANDALUSIA, country: 'ES', share: 0.5, networks: [DEMO_CAFE_NETWORK] },
        { city: 'San Pedro de Alcántara', region: ANDALUSIA, country: 'ES', share: 0.3, networks: ['a0000000000000a1'] },
        { city: 'Marbella', region: ANDALUSIA, country: 'ES', share: 0.15, networks: [MARBELLA_CAFE] },
        { city: 'Dublin', region: 'Leinster', country: 'IE', share: 0.05, networks: ['a0000000000000e1'] }] },
    { id: P.mark, chance: 0.45, hour: 9, pages: ['finances', 'invoices', 'expenses', 'pnl', 'tax', 'today', 'rota'],
      devices: [{ device: 'computer', os: 'Windows', browser: 'Edge', installed: false, share: 1 }],
      places: [{ city: 'Marbella', region: ANDALUSIA, country: 'ES', share: 1, networks: [MARBELLA_CAFE] }] },
    { id: P.julio, chance: 0.75, hour: 6, pages: ['today', 'rota', 'timecards', 'checklists', 'timeoff', 'menu', 'kitty', 'leaderboard'],
      devices: [{ device: 'phone', os: 'iOS', browser: 'Safari', installed: true, share: 1 }],
      places: [{ city: 'San Pedro de Alcántara', region: ANDALUSIA, country: 'ES', share: 0.7, networks: [DEMO_CAFE_NETWORK] },
        { city: 'San Pedro de Alcántara', region: ANDALUSIA, country: 'ES', share: 0.3, networks: ['a0000000000000b1', 'a0000000000000b2', 'a0000000000000b3'] }] },
    { id: P.maria, chance: 0.6, hour: 13, pages: ['today', 'rota', 'checklists', 'timeoff', 'allergens', 'foodsafety', 'calendar'],
      devices: [{ device: 'phone', os: 'Android', browser: 'Chrome', installed: false, share: 0.9 }, { device: 'tablet', os: 'Android', browser: 'Chrome', installed: false, share: 0.1 }],
      places: [{ city: 'Estepona', region: ANDALUSIA, country: 'ES', share: 0.4, networks: ['a0000000000000c1'] },
        { city: 'San Pedro de Alcántara', region: ANDALUSIA, country: 'ES', share: 0.6, networks: [DEMO_CAFE_NETWORK] }] },
    { id: partner, chance: 0.12, hour: 10, pages: ['timecards', 'finances', 'rota', 'expenses'],
      devices: [{ device: 'computer', os: 'Windows', browser: 'Chrome', installed: false, share: 1 }],
      places: [{ city: 'Marbella', region: ANDALUSIA, country: 'ES', share: 1, networks: ['a0000000000000d1'] }] },
  ]
  const rnd = random(20261115)
  const pick = <T extends { share: number }>(xs: T[]) => {
    let r = rnd()
    for (const x of xs) { if ((r -= x.share) < 0) return x }
    return xs[xs.length - 1]
  }
  const visits: Visit[] = []
  const pages: StoredPage[] = []
  let n = 0
  const iso = (ms: number) => new Date(ms).toISOString()
  const add = (h: Habit, start: number, opened: { page: string; seconds: number; views?: number }[], place?: number) => {
    const d = pick(h.devices)
    const p = place === undefined ? pick(h.places) : h.places[place]
    const network = p.networks[Math.floor(rnd() * p.networks.length)]
    const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
    let at = start
    for (const o of opened) {
      pages.push({ visit_id: id, page: o.page, views: o.views ?? 1, seconds: o.seconds, first_at: iso(at), last_at: iso(at + o.seconds * 1000) })
      at += (o.seconds + 3) * 1000
    }
    const seconds = opened.reduce((s, o) => s + o.seconds, 0)
    visits.push({ id, profile_id: h.id, started_at: iso(start), last_seen_at: iso(Math.max(at, start + 10_000)), device: d.device, os: d.os, browser: d.browser,
      installed: d.installed, city: p.city, region: p.region, country: p.country, seconds, network })
  }
  const day = 86_400_000
  const midnight = Math.floor(now / day) * day
  for (let ago = 60; ago >= 0; ago--) {
    for (const h of habits) {
      if (rnd() > h.chance) continue
      const start = midnight - ago * day + (h.hour + rnd() * 3) * 3_600_000 + Math.floor(rnd() * 3_600_000)
      if (start > now - 5 * 60_000) continue
      const count = 1 + Math.floor(rnd() * 4)
      const opened = new Set<string>([h.pages[0]])
      while (opened.size < count) opened.add(h.pages[Math.floor(rnd() * h.pages.length)])
      add(h, start, [...opened].map(page => ({ page, seconds: 15 + Math.floor(rnd() * (page === h.pages[0] ? 240 : 150)), views: 1 + Math.floor(rnd() * 2) })))
    }
  }
  // The staff rules.
  const [aron, mark, julio, maria] = habits
  const at = (ago: number, hour: number) => midnight - ago * day + hour * 3_600_000
  add(aron, at(31, 18), [{ page: 'rules', seconds: 1260, views: 3 }, { page: 'roles', seconds: 300 }], 1)
  add(julio, at(12, 15), [{ page: 'today', seconds: 20 }, { page: 'rules', seconds: 380 }], 0)
  add(julio, at(3, 16), [{ page: 'rules', seconds: 65 }], 0)
  add(maria, at(20, 14), [{ page: 'today', seconds: 30 }, { page: 'rules', seconds: 45 }], 1)
  add(mark, at(5, 11), [{ page: 'rules', seconds: 130 }, { page: 'values', seconds: 40 }], 0)
  return { visits, pages, named: { ...DEMO_NAMED } as Record<string, string> }
}

/**
 * When each of the demo's people last signed in, and how: Aron and Maria with Google, Mark and Laura with their
 * email, Julio with Apple. The cleaner has no sign-in of their own.
 */
export function demoSignIns(people: { id: string; full_name: string; colour: string; role: string }[], now = Date.now()): UsageSignIn[] {
  const ago = (days: number, hours = 0) => new Date(now - days * 86_400_000 - hours * 3_600_000).toISOString()
  const how: Record<string, [string, string]> = {
    'p-aron': [ago(0, 2), 'google'], 'p-mark': [ago(5), 'email'], 'p-julio': [ago(12), 'apple'], 'p-maria': [ago(3), 'google'], 'p-laura': [ago(9), 'email'],
  }
  return people.filter(p => how[p.id]).map(p => ({
    profile_id: p.id, last_sign_in_at: how[p.id][0], provider: how[p.id][1], full_name: p.full_name, colour: p.colour, role: p.role,
  }))
}
