// The demo's User analytics: two months of the team using the app, each on their own devices and from their own
// towns, made the same way every time. Aron (owner) on his Mac and his iPhone, once from Dublin; Mark (owner) on
// the office PC in Marbella; Julio on his iPhone, the installed app; Maria on her Android phone from Estepona; Laura
// at the gestoría on hers; the cleaner never. Staff rules: Julio read them properly (and went back to them), Maria
// glanced at them, Mark checked them, Aron wrote them a month ago. The person using the demo adds their own visit.
import type { StoredPage, UsageDevice, UsageVisit } from '../../shared/usage'

type Visit = Omit<UsageVisit, 'pages'>
interface Habit {
  id: string
  /** How likely a visit is on a given day, and the pages they open (the first most). */
  chance: number
  pages: string[]
  devices: { device: UsageDevice; os: string; browser: string; installed: boolean; share: number }[]
  places: { city: string; region: string; country: string; share: number }[]
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
      places: [{ city: 'San Pedro de Alcántara', region: ANDALUSIA, country: 'ES', share: 0.85 }, { city: 'Marbella', region: ANDALUSIA, country: 'ES', share: 0.1 },
        { city: 'Dublin', region: 'Leinster', country: 'IE', share: 0.05 }] },
    { id: P.mark, chance: 0.45, hour: 9, pages: ['finances', 'invoices', 'expenses', 'pnl', 'tax', 'today', 'rota'],
      devices: [{ device: 'computer', os: 'Windows', browser: 'Edge', installed: false, share: 1 }],
      places: [{ city: 'Marbella', region: ANDALUSIA, country: 'ES', share: 1 }] },
    { id: P.julio, chance: 0.75, hour: 6, pages: ['today', 'rota', 'timecards', 'checklists', 'timeoff', 'menu', 'kitty', 'leaderboard'],
      devices: [{ device: 'phone', os: 'iOS', browser: 'Safari', installed: true, share: 1 }],
      places: [{ city: 'San Pedro de Alcántara', region: ANDALUSIA, country: 'ES', share: 1 }] },
    { id: P.maria, chance: 0.6, hour: 13, pages: ['today', 'rota', 'checklists', 'timeoff', 'allergens', 'foodsafety', 'calendar'],
      devices: [{ device: 'phone', os: 'Android', browser: 'Chrome', installed: false, share: 0.9 }, { device: 'tablet', os: 'Android', browser: 'Chrome', installed: false, share: 0.1 }],
      places: [{ city: 'Estepona', region: ANDALUSIA, country: 'ES', share: 0.7 }, { city: 'San Pedro de Alcántara', region: ANDALUSIA, country: 'ES', share: 0.3 }] },
    { id: partner, chance: 0.12, hour: 10, pages: ['timecards', 'finances', 'rota', 'expenses'],
      devices: [{ device: 'computer', os: 'Windows', browser: 'Chrome', installed: false, share: 1 }],
      places: [{ city: 'Marbella', region: ANDALUSIA, country: 'ES', share: 1 }] },
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
  const add = (h: Habit, start: number, opened: { page: string; seconds: number; views?: number }[]) => {
    const d = pick(h.devices)
    const p = pick(h.places)
    const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
    let at = start
    for (const o of opened) {
      pages.push({ visit_id: id, page: o.page, views: o.views ?? 1, seconds: o.seconds, first_at: iso(at), last_at: iso(at + o.seconds * 1000) })
      at += (o.seconds + 3) * 1000
    }
    const seconds = opened.reduce((s, o) => s + o.seconds, 0)
    visits.push({ id, profile_id: h.id, started_at: iso(start), last_seen_at: iso(Math.max(at, start + 10_000)), device: d.device, os: d.os, browser: d.browser,
      installed: d.installed, city: p.city, region: p.region, country: p.country, seconds })
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
  add(aron, at(31, 18), [{ page: 'rules', seconds: 1260, views: 3 }, { page: 'roles', seconds: 300 }])
  add(julio, at(12, 15), [{ page: 'today', seconds: 20 }, { page: 'rules', seconds: 380 }])
  add(julio, at(3, 16), [{ page: 'rules', seconds: 65 }])
  add(maria, at(20, 14), [{ page: 'today', seconds: 30 }, { page: 'rules', seconds: 45 }])
  add(mark, at(5, 11), [{ page: 'rules', seconds: 130 }, { page: 'values', seconds: 40 }])
  return { visits, pages }
}
