// In-memory demo of the app with Easy Beans sample data. Used for previews, sales demos and
// when no Supabase project is configured. Mirrors the SQL rules closely but is not the source
// of truth: the database functions are.
import type { Api, ShiftInput } from './api'
import type {
  AppNotification, Brand, EventAlert, MusicAccount, MusicPlaylist, MusicProvider, MyNowPlaying,
  Expense, IntegrationsState, OutboxItem, PartnerArea, TimeOff,
  BreakType, Business, CalendarEvent, CorrectionRequest, PayRate, Position, Profile, Settings,
  Shift, TimeEntry, TimeEntryChange,
} from '../../shared/types'
import { demoSports } from './demoSports'
import type { SportsFavourite } from '../../shared/sports'
import { POPULAR_FONTS } from '../../shared/fonts'
import { addDays, localDate, minutesBetween, today, weekDates, weekStart, zonedIso } from '../../shared/time'

interface RawEntry {
  id: string; profile_id: string; position_id: number | null; shift_id: string | null
  clock_in: string; clock_out: string | null; source: string; clock_out_source: string | null
  flags: string[]; note: string | null; approved_at: string | null
}
interface RawBreak { id: string; time_entry_id: string; break_type_id: number | null; started_at: string; ended_at: string | null }

const uid = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export function createDemoApi(): Api {
  const business: Business = {
    name: 'Easy Beans Coffee',
    business_type: 'Specialty café, drinks-first, owner-run',
    address: 'C. Pizarro, 8, 29670 San Pedro de Alcántara, Málaga',
    phone: '+34 695 415 335',
    email: 'easybeanscafe@gmail.com',
    instagram: '@easy.beans.coffee',
    timezone: 'Europe/Madrid',
    currency: 'EUR',
    tax_id: 'B12345674',
    opening_hours: {
      mon: { open: '08:00', close: '18:00' }, tue: { open: '08:00', close: '18:00' },
      wed: { open: '08:00', close: '18:00' }, thu: { open: '08:00', close: '18:00' },
      fri: { open: '08:00', close: '18:00' }, sat: { open: '09:00', close: '18:00' },
      sun: { open: '09:00', close: '16:00' },
    },
    peak_hours: { start: '11:00', end: '15:00' },
    team_channel: 'whatsapp',
    owners: ["Aron O'Neill", 'Mark Murray'],
    suppliers: [{ name: 'By Eric', type: 'Bakery', phone: '+34 683 16 94 37', email: 'info@by-eric.es',
      notes: 'Croissants daily, pastries every 2 days' }],
    towns_followed: ['Marbella', 'Estepona', 'Benahavís', 'Málaga'],
    notes: 'Weekday closing time to confirm: 18:00 (plan) vs 15:00 (Square rota).',
    updated_at: nowIso(),
  }
  const integ: IntegrationsState = {
    configured: { google_business: true, whatsapp: true, instagram: true, spotify: true },
    queue: [],
    integrations: [
      { provider: 'google_business', status: 'connected', account_label: 'Easy Beans Coffee',
        external: { locations: [{ name: 'locations/1', title: 'Easy Beans Coffee' }], location: 'locations/1', closed_on_holidays: false },
        connected_at: nowIso(), last_sync_at: nowIso(), last_error: null },
      { provider: 'whatsapp', status: 'connected', account_label: '+34 695 415 335', external: {}, connected_at: nowIso(), last_sync_at: null, last_error: null },
      { provider: 'spotify', status: 'connected', account_label: 'Easy Beans (Premium)',
        external: { playlist: { id: 'pl1', name: 'Easy Beans · Mornings', tracks: 84, url: 'https://open.spotify.com', owner: 'Easy Beans' } },
        connected_at: nowIso(), last_sync_at: null, last_error: null },
      { provider: 'instagram', status: 'connected', account_label: '@easy.beans.coffee', external: {}, connected_at: nowIso(), last_sync_at: nowIso(), last_error: null },
    ],
  }
  const demoPlaylists = [
    { id: 'pl1', name: 'Easy Beans · Mornings', tracks: 84, url: 'https://open.spotify.com', owner: 'Easy Beans' },
    { id: 'pl2', name: 'Easy Beans · Afternoon chill', tracks: 112, url: 'https://open.spotify.com', owner: 'Easy Beans' },
    { id: 'pl3', name: 'Aron’s gym mix', tracks: 40, url: 'https://open.spotify.com', owner: 'Aron' },
  ]
  const music: { playing: boolean; track?: string; artist?: string; device?: string } = { playing: false }
  // Music page: each person's own accounts (connecting is simulated in the demo).
  const myAccounts = new Map<string, MusicAccount[]>()
  const myPlayer: MyNowPlaying = { playing: false }
  const feeds = new Map<string, Partial<Record<'me' | 'business', string>>>()
  const alerts: EventAlert[] = []
  const brand: Brand = {
    logo: null, logo_mark: null, heading_font: 'Poppins', body_font: 'Figtree', updated_at: nowIso(),
    notes: 'Rose Pink leads; one accent at a time. Never recolour, stretch or redraw the logo.',
    colours: [
      { name: 'Rose Pink', hex: '#F79BA4', role: 'primary', use: 'Buttons, highlights, the logo circle' },
      { name: 'Grey Limewash', hex: '#C6C2BB', role: 'secondary', use: 'Surfaces and panels, used generously' },
      { name: 'Rose Wash', hex: '#F3DED3', role: 'accent', use: 'Soft panels behind copy' },
      { name: 'Ube Lilac', hex: '#B7A3D8', role: 'accent', use: 'Ube drinks, seasonal moments' },
      { name: 'Matcha Green', hex: '#6B8E4E', role: 'accent', use: 'Wellbeing, sourcing, all-good cues' },
      { name: 'Cream', hex: '#FBF8F4', role: 'base', use: 'Preferred background' },
    ],
  }
  const notes: (AppNotification & { profile_id: string })[] = []
  const samplePlaylists: Record<MusicProvider, MusicPlaylist[]> = {
    spotify: [
      { provider: 'spotify', id: 'demo-sp-1', name: 'Morning coffee', tracks: 64, url: 'https://open.spotify.com', owner: 'You' },
      { provider: 'spotify', id: 'demo-sp-2', name: 'Lo-fi for closing up', tracks: 120, url: 'https://open.spotify.com', owner: 'You' },
      { provider: 'spotify', id: 'demo-sp-3', name: 'Gym mix', tracks: 38, url: 'https://open.spotify.com', owner: 'You' },
    ],
    youtube: [
      { provider: 'youtube', id: 'demo-yt-1', name: 'Liked music', tracks: 212, url: 'https://music.youtube.com', owner: 'You' },
      { provider: 'youtube', id: 'demo-yt-2', name: 'Spanish summer', tracks: 45, url: 'https://music.youtube.com', owner: 'You' },
    ],
  }
  const expenses: Expense[] = ([
    ['Rent', 1530, 'Premises'], ['Staff wages', 4300, 'People'], ['Electricity', 200, 'Utilities'], ['Insurance', 100, 'Premises'],
    ['Council tax', 50, 'Premises'], ['Broadband', 20, 'Utilities'], ['Accountant', 100, 'Services'], ['Water', 50, 'Utilities'],
    ['Cleaning supplies', 20, 'Supplies'], ['Cleaning', 50, 'Services'], ['Loan', 641.53, 'Finance'], ['Automo costs', 80, 'Services'],
    ['Wastage', 50, 'Stock'], ['Freebies', 30, 'Stock'], ['Non-retail supplies', 500, 'Supplies'], ['Printing / labels', 50, 'Marketing'],
    ['Advertising / social media', 50, 'Marketing'], ['Security system', 43.56, 'Premises'],
  ] as const).map(([name, amount, category], i) => ({ id: uid(), name, amount, category, notes: null, active: true, sort: i + 1,
    source: 'sheet' as const, updated_at: nowIso() }))
  const sent: OutboxItem[] = [
    { id: 3, kind: 'whatsapp', payload: { template: 'shift_reminder', to: '34600111222', profile_id: 'p-julio' }, status: 'sent',
      attempts: 1, last_error: null, delivery: 'read', created_at: new Date(Date.now() - 3600000).toISOString(), sent_at: new Date(Date.now() - 3590000).toISOString() },
    { id: 2, kind: 'google_sync', payload: {}, status: 'sent', attempts: 1, last_error: null, delivery: null,
      created_at: new Date(Date.now() - 86400000).toISOString(), sent_at: new Date(Date.now() - 86390000).toISOString() },
    { id: 1, kind: 'whatsapp', payload: { template: 'missed_clock_in', to: '34600333444', profile_id: 'p-maria' }, status: 'failed',
      attempts: 2, last_error: 'Recipient phone number not on WhatsApp', delivery: null,
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(), sent_at: null },
  ]
  let adminNotes: string | null = 'Demo: alarm code holder, wifi for the kiosk, landlord and gestor contacts.'
  const settings: Settings = {
    early_clock_in_minutes: 10, unscheduled_clock_in: 'flag', auto_clock_out_minutes: 60,
    forgot_clock_out_grace_minutes: 30, phone_clock_in: 'anywhere', min_break_minutes: 15,
    break_after_hours: 6, max_daily_hours: 9, max_weekly_hours: 40, min_rest_hours: 12,
    approval_weekday: 1, employer_cost_multiplier: 1.3, auto_timecards_from_rota: true, vacation_days_per_year: 30,
    alert_shift_reminders: true, alert_missed_clock_in: true, alert_rota: true, alert_time_off: true,
  }

  const P = { aron: 'p-aron', mark: 'p-mark', julio: 'p-julio', maria: 'p-maria', cleaner: 'p-cleaner' }
  const profiles: (Profile & { pin?: string })[] = [
    { id: P.aron, full_name: "Aron O'Neill", email: 'aron@example.com', role: 'admin', can_see_pay: true, colour: '#A85A68', active: true, phone: null, birth_date: null, pin: '1111' },
    { id: P.mark, full_name: 'Mark Murray', email: 'mark@example.com', role: 'admin', can_see_pay: true, colour: '#5B4A86', active: true, phone: null, birth_date: null, pin: '2222' },
    { id: P.julio, full_name: 'Julio', email: 'julio@example.com', role: 'employee', can_see_pay: false, colour: '#4A6536', active: true, whatsapp_opt_in: true, contact_method: 'whatsapp', phone: '+34 600 111 222', birth_date: null, pin: '1234' },
    { id: P.maria, full_name: 'Maria', email: 'maria@example.com', role: 'employee', can_see_pay: false, colour: '#B3404F', active: true, whatsapp_opt_in: true, phone: '+34 600 333 444', birth_date: null, pin: '4321' },
    { id: P.cleaner, full_name: 'Cleaner', email: null, role: 'employee', can_see_pay: false, colour: '#6B645E', active: true, phone: null, birth_date: null },
    // An outside business: the gestoría that does payroll and the accounts (read-only).
    { id: 'p-laura', full_name: 'Laura Ruiz', email: 'laura@gestoria.example', role: 'partner', can_see_pay: false, colour: '#6B645E',
      active: true, phone: null, birth_date: null, partner_company: 'Gestoría Marbella', partner_access: ['payroll', 'finances'] },
  ]
  const positions: Position[] = [
    { id: 1, name: 'Barista', colour: '#F79BA4', sort: 1, active: true },
    { id: 2, name: 'Kitchen', colour: '#6B8E4E', sort: 2, active: true },
    { id: 3, name: 'Cleaner', colour: '#C6C2BB', sort: 3, active: true },
    { id: 4, name: 'Propietario', colour: '#B7A3D8', sort: 4, active: true },
  ]
  const breakTypes: BreakType[] = [
    { id: 1, name: 'Rest 15 min (paid)', minutes: 15, paid: true },
    { id: 2, name: 'Lunch 30 min (unpaid)', minutes: 30, paid: false },
  ]
  const payRates: PayRate[] = [
    { profile_id: P.aron, effective_from: '2026-04-01', hourly_rate: 0 },
    { profile_id: P.mark, effective_from: '2026-04-01', hourly_rate: 0 },
    { profile_id: P.julio, effective_from: '2026-04-01', hourly_rate: 8.8 },
    { profile_id: P.maria, effective_from: '2026-04-01', hourly_rate: 8.8 },
    { profile_id: P.cleaner, effective_from: '2026-04-01', hourly_rate: 9.5 },
  ]

  // Rota: this week and last week, Square-style.
  const shifts: Shift[] = []
  const addShift = (date: string, profile: string | null, pos: number, from: string, to: string, brk = 0, note: string | null = null) =>
    shifts.push({ id: uid(), profile_id: profile, position_id: pos, starts_at: zonedIso(date, from),
      ends_at: zonedIso(date, to), break_minutes: brk, note, status: 'published' })
  for (const monday of [addDays(weekStart(today()), -7), weekStart(today()), addDays(weekStart(today()), 7)]) {
    const d = weekDates(monday)
    for (let i = 0; i < 5; i++) {
      addShift(d[i], P.julio, 1, '07:45', '15:00', 15)
      addShift(d[i], P.maria, 1, '10:00', i === 2 ? '17:30' : '15:00', i === 2 ? 0 : 15)
      addShift(d[i], P.aron, 4, '08:00', '12:00')
    }
    for (const i of [0, 2, 4]) addShift(d[i], P.cleaner, 3, '15:00', '17:00')
    addShift(d[5], P.maria, 1, '09:00', '15:00', 15)
    addShift(d[5], P.mark, 4, '09:00', '14:00')
    addShift(d[6], null, 1, '09:00', '16:00', 30, 'Sunday cover needed')
  }

  // Timecards for past days of last week and this week.
  const entries: RawEntry[] = []
  const breaks: RawBreak[] = []
  const changes: TimeEntryChange[] = []
  const nowMs = Date.now()
  for (const s of shifts) {
    if (!s.profile_id || new Date(s.ends_at).getTime() > nowMs) continue
    const jitterIn = (s.id.charCodeAt(0) % 7) - 3
    const jitterOut = (s.id.charCodeAt(1) % 11) - 2
    const clockIn = new Date(new Date(s.starts_at).getTime() + jitterIn * 60000).toISOString()
    const clockOut = new Date(new Date(s.ends_at).getTime() + jitterOut * 60000).toISOString()
    const e: RawEntry = { id: uid(), profile_id: s.profile_id, position_id: s.position_id, shift_id: s.id,
      clock_in: clockIn, clock_out: clockOut, source: s.profile_id === P.aron ? 'phone' : 'kiosk',
      clock_out_source: 'kiosk', flags: [], note: null, approved_at: null }
    entries.push(e)
    if (s.break_minutes) {
      const bStart = new Date(new Date(clockIn).getTime() + 3 * 3600000).toISOString()
      breaks.push({ id: uid(), time_entry_id: e.id, break_type_id: 1, started_at: bStart,
        ended_at: new Date(new Date(bStart).getTime() + s.break_minutes * 60000).toISOString() })
    }
    e.flags = computeFlags(e)
  }
  // Approve last week.
  const lastMonday = addDays(weekStart(today()), -7)
  for (const e of entries) if (localDate(e.clock_in) < weekStart(today()) && localDate(e.clock_in) >= lastMonday) e.approved_at = nowIso()

  const timeOff: TimeOff[] = [
    { id: uid(), profile_id: P.maria, starts_on: addDays(weekStart(today()), 9), ends_on: addDays(weekStart(today()), 11), kind: 'vacation',
      note: 'Family wedding in Sevilla', status: 'pending', created_at: nowIso(), decision_note: null },
    { id: uid(), profile_id: P.julio, starts_on: addDays(today(), 30), ends_on: addDays(today(), 36), kind: 'vacation',
      note: null, status: 'approved', created_at: nowIso(), decision_note: 'Enjoy!' },
  ]
  const corrections: CorrectionRequest[] = []
  const firstMaria = entries.find(e => e.profile_id === P.maria && !e.approved_at)
  if (firstMaria?.clock_out) {
    corrections.push({ id: uid(), time_entry_id: firstMaria.id, profile_id: P.maria, requested_clock_in: null,
      requested_clock_out: new Date(new Date(firstMaria.clock_out).getTime() + 20 * 60000).toISOString(),
      note: 'Stayed 20 min to help with the bakery delivery', status: 'pending', created_at: nowIso(),
      expires_at: new Date(nowMs + 30 * 86400000).toISOString(), decision_note: null })
  }

  const events: CalendarEvent[] = [
    ['2026-01-01', 'Año Nuevo', 'national'], ['2026-01-06', 'Epifanía del Señor', 'national'],
    ['2026-04-03', 'Viernes Santo', 'national'], ['2026-05-01', 'Fiesta del Trabajo', 'national'],
    ['2026-08-15', 'Asunción de la Virgen', 'national'], ['2026-10-12', 'Fiesta Nacional de España', 'national'],
    ['2026-12-08', 'Inmaculada Concepción', 'national'], ['2026-12-25', 'Natividad del Señor', 'national'],
    ['2026-02-28', 'Día de Andalucía', 'regional'], ['2026-04-02', 'Jueves Santo', 'regional'],
    ['2026-11-02', 'Todos los Santos (trasladado)', 'regional'], ['2026-12-07', 'Día de la Constitución (trasladado)', 'regional'],
    ['2026-06-11', 'San Bernabé', 'local', 'Marbella'], ['2026-10-19', 'San Pedro de Alcántara', 'local', 'Marbella'],
    ['2026-05-15', 'San Isidro Labrador', 'area', 'Estepona', false], ['2026-07-16', 'Virgen del Carmen', 'area', 'Estepona', false],
    ['2026-08-17', 'Fiesta local', 'area', 'Benahavís', false], ['2026-08-19', 'Toma de Málaga', 'area', 'Málaga', false],
    ['2026-09-08', 'Virgen de la Victoria', 'area', 'Málaga', false], ['2026-10-07', 'Fiesta local', 'area', 'Benahavís', false],
  ].map(([starts_on, title, category, town, confirmed]) => ({
    id: uid(), starts_on: starts_on as string, ends_on: null, starts_at: null, title: title as string,
    category: category as CalendarEvent['category'], town: (town as string) ?? null, competition: null,
    source: 'import', confirmed: confirmed !== false, visibility: 'all' as const,
  }))
  events.push(
    { id: uid(), starts_on: '2026-10-16', ends_on: '2026-10-20', starts_at: null, title: 'Feria de San Pedro',
      category: 'event', town: 'San Pedro', competition: null, source: 'admin', confirmed: true, visibility: 'all' },
    { id: uid(), starts_on: addDays(today(), 2), ends_on: null, starts_at: zonedIso(addDays(today(), 2), '21:00'),
      title: 'Real Madrid vs FC Barcelona', category: 'sports', town: null, competition: 'La Liga', source: 'feed',
      confirmed: true, visibility: 'all' },
    { id: uid(), starts_on: addDays(today(), 3), ends_on: null, starts_at: zonedIso(addDays(today(), 3), '16:00'),
      title: 'Arsenal vs Liverpool', category: 'sports', town: null, competition: 'Premier League', source: 'feed',
      confirmed: true, visibility: 'all' },
    { id: uid(), starts_on: addDays(today(), 4), ends_on: null, starts_at: zonedIso(addDays(today(), 4), '14:30'),
      title: 'Ajax vs PSV', category: 'sports', town: null, competition: 'Eredivisie', source: 'feed',
      confirmed: true, visibility: 'all' },
    { id: uid(), starts_on: addDays(today(), 5), ends_on: null, starts_at: null, title: 'Staff training: new espresso recipe',
      category: 'business', town: null, competition: null, source: 'admin', confirmed: true, visibility: 'all' },
  )

  // Who is signed in survives a page reload within the tab (the demo data itself does not).
  const remember = (id: string | null) => {
    try { sessionStorage.setItem('demo-user', id ?? '') } catch { /* storage unavailable */ }
  }
  let currentUser: string | null = (() => {
    try {
      return sessionStorage.getItem('demo-user') || null
    } catch {
      return null
    }
  })()
  const listeners = new Set<() => void>()
  const notify = () => { remember(currentUser); listeners.forEach(l => l()) }

  const me = () => profiles.find(p => p.id === currentUser)
  const favourites: (SportsFavourite & { profile_id: string })[] = [{ profile_id: P.aron, kind: 'team', ref: 'Real Betis' }]
  const isAdmin = () => me()?.role === 'admin'
  const isPartner = () => me()?.role === 'partner'
  /** Mirrors partner_can() in SQL: an active partner who was given that area. */
  const partnerCan = (area: PartnerArea) => !!(isPartner() && me()?.active && me()?.partner_access?.includes(area))
  const staffOnly = (p: Profile) => p.role === 'admin' || p.role === 'employee'
  const requireAdmin = () => { if (!isAdmin()) throw new Error('Only an admin can do that') }

  function computeFlags(e: RawEntry): string[] {
    const keep = e.flags.filter(f => f !== 'missed_break' && f !== 'over_daily_limit')
    if (!e.clock_out) return keep
    const total = minutesBetween(e.clock_in, e.clock_out)
    const brk = breaks.filter(b => b.time_entry_id === e.id)
      .reduce((s, b) => s + minutesBetween(b.started_at, b.ended_at ?? e.clock_out!), 0)
    if (total > settings.break_after_hours * 60 && brk < settings.min_break_minutes) keep.push('missed_break')
    if (total - brk > settings.max_daily_hours * 60) keep.push('over_daily_limit')
    return keep
  }

  function totals(e: RawEntry): TimeEntry {
    const end = e.clock_out ?? nowIso()
    const bs = breaks.filter(b => b.time_entry_id === e.id)
    const breakMin = bs.reduce((s, b) => s + minutesBetween(b.started_at, b.ended_at ?? end), 0)
    const unpaid = bs.filter(b => !breakTypes.find(t => t.id === b.break_type_id)?.paid)
      .reduce((s, b) => s + minutesBetween(b.started_at, b.ended_at ?? end), 0)
    const total = minutesBetween(e.clock_in, end)
    const date = localDate(e.clock_in)
    return {
      ...e, work_date: date, total_minutes: total, break_minutes: breakMin, unpaid_break_minutes: unpaid,
      paid_minutes: total - unpaid,
      on_holiday: events.some(ev => ['national', 'regional', 'local'].includes(ev.category) && ev.confirmed &&
        date >= ev.starts_on && date <= (ev.ends_on ?? ev.starts_on)),
    }
  }

  const openEntry = (pid: string) => entries.find(e => e.profile_id === pid && !e.clock_out)

  function doClockIn(pid: string, source: string, positionId?: number | null) {
    const who = profiles.find(p => p.id === pid)
    if (!who || !staffOnly(who)) throw new Error('Only team members can clock in')
    if (openEntry(pid)) throw new Error('Already clocked in')
    const now = Date.now()
    const shift = shifts
      .filter(s => s.profile_id === pid && new Date(s.ends_at).getTime() > now &&
        new Date(s.starts_at).getTime() < now + 12 * 3600000)
      .sort((a, b) => Math.abs(new Date(a.starts_at).getTime() - now) - Math.abs(new Date(b.starts_at).getTime() - now))[0]
    const flags: string[] = []
    if (shift) {
      const earliest = new Date(shift.starts_at).getTime() - settings.early_clock_in_minutes * 60000
      if (now < earliest) {
        const fmt = (ms: number) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
        throw new Error(`Too early: your shift starts at ${fmt(new Date(shift.starts_at).getTime())}. You can clock in from ${fmt(earliest)}.`)
      }
    } else {
      if (settings.unscheduled_clock_in === 'block') throw new Error('You have no shift scheduled now.')
      flags.push('unscheduled')
    }
    entries.push({ id: uid(), profile_id: pid, position_id: positionId ?? shift?.position_id ?? null,
      shift_id: shift?.id ?? null, clock_in: nowIso(), clock_out: null, source, clock_out_source: null,
      flags, note: null, approved_at: null })
  }
  function doClockOut(pid: string, source: string) {
    const e = openEntry(pid)
    if (!e) throw new Error('Not clocked in')
    for (const b of breaks) if (b.time_entry_id === e.id && !b.ended_at) b.ended_at = nowIso()
    e.clock_out = nowIso()
    e.clock_out_source = source
    e.flags = computeFlags(e)
    return totals(e)
  }
  function doStartBreak(pid: string, breakTypeId?: number | null) {
    const e = openEntry(pid)
    if (!e) throw new Error('Not clocked in')
    if (breaks.some(b => b.time_entry_id === e.id && !b.ended_at)) throw new Error('Already on a break')
    breaks.push({ id: uid(), time_entry_id: e.id, break_type_id: breakTypeId ?? null, started_at: nowIso(), ended_at: null })
  }
  function doEndBreak(pid: string) {
    const e = openEntry(pid)
    const b = e && breaks.find(x => x.time_entry_id === e.id && !x.ended_at)
    if (!b) throw new Error('Not on a break')
    b.ended_at = nowIso()
  }
  function applyEdit(id: string, clockIn: string | null, clockOut: string | null, reason: string) {
    if (!reason.trim()) throw new Error('A reason is required')
    const e = entries.find(x => x.id === id)
    if (!e) throw new Error('Timecard not found')
    const old = { clock_in: e.clock_in, clock_out: e.clock_out ?? undefined }
    if (clockIn) e.clock_in = clockIn
    if (clockOut) e.clock_out = clockOut
    if (!e.flags.includes('edited')) e.flags.push('edited')
    e.flags = computeFlags(e)
    changes.push({ id: changes.length + 1, time_entry_id: id, changed_by: currentUser, changed_at: nowIso(),
      via: 'app', reason, old_values: old, new_values: { clock_in: e.clock_in, clock_out: e.clock_out ?? undefined } })
  }

  const clone = <T,>(x: T): T => structuredClone(x)
  const sports = demoSports(today())
  const visibleProfile = ({ pin: _pin, ...p }: Profile & { pin?: string }) => p

  const api: Api = {
    mode: 'demo',
    async currentUserId() { return currentUser },
    onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },
    async signIn(email) {
      const p = profiles.find(x => x.email === email.trim().toLowerCase())
      if (!p) throw new Error('Demo: sign in as aron@example.com (admin), maria@example.com (employee) or laura@gestoria.example (partner)')
      currentUser = p.id
      notify()
    },
    async signOut() { currentUser = null; notify() },
    async signInMethods() { return { google: true, microsoft: true } },
    async sendSignInCode(email) {
      if (!profiles.some(p => p.email === email.trim().toLowerCase())) throw new Error('No invited account uses this email. Ask an admin to invite you.')
    },
    async verifySignInCode(email, code) {
      if (code.replace(/\D/g, '') !== '123456') throw new Error('That code is wrong or has expired. Send a new one.')
      await api.signIn(email, '')
    },
    async sendPasswordReset() { throw new Error('Password reset emails are sent on the live app. In the demo, any password works.') },
    async updatePassword() {},

    async me() { const p = me(); return p ? visibleProfile(p) : null },
    async business() { return clone(business) },
    async adminNotes() { requireAdmin(); return adminNotes },
    async settings() { return clone(settings) },
    async profiles() {
      if (!isPartner()) return profiles.filter(p => p.role !== 'partner').map(visibleProfile)
      if (!partnerCan('rota') && !partnerCan('payroll')) return []
      return profiles.filter(staffOnly).map(p => ({ id: p.id, full_name: p.full_name, colour: p.colour, role: p.role,
        active: p.active, email: null, can_see_pay: false, phone: null, birth_date: null }))
    },
    async positions() { return clone(positions) },
    async breakTypes() { return clone(breakTypes) },
    async payRates() {
      const m = me()
      return payRates.filter(r => (m?.role === 'admin' && m.can_see_pay) || partnerCan('payroll') || r.profile_id === currentUser)
    },
    async shifts(fromIso, toIso) {
      if (isPartner() && !partnerCan('rota') && !partnerCan('payroll')) return []
      return clone(shifts.filter(s => s.starts_at >= fromIso && s.starts_at < toIso && (!isPartner() || s.status === 'published')))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    },
    async timeEntries(fromIso, toIso) {
      return entries.filter(e => e.clock_in >= fromIso && e.clock_in < toIso &&
        (isAdmin() || partnerCan('payroll') || e.profile_id === currentUser)).map(totals)
        .sort((a, b) => a.clock_in.localeCompare(b.clock_in))
    },
    async clockState() {
      const e = currentUser ? openEntry(currentUser) : undefined
      if (!e) return { entry: null, openBreak: null }
      const b = breaks.find(x => x.time_entry_id === e.id && !x.ended_at)
      return { entry: totals(e), openBreak: b ? clone(b) : null }
    },
    async events(fromDate, toDate) {
      return clone(events.filter(e => e.starts_on <= toDate && (e.ends_on ?? e.starts_on) >= fromDate &&
        (e.visibility === 'all' || isAdmin()) && (!isPartner() || partnerCan('calendar')))).sort((a, b) => a.starts_on.localeCompare(b.starts_on))
    },
    async corrections() {
      return clone(corrections.filter(c => isAdmin() || c.profile_id === currentUser))
    },
    async entryChanges(entryId) { return clone(changes.filter(c => c.time_entry_id === entryId)) },

    async clockIn(positionId) { doClockIn(currentUser!, 'phone', positionId) },
    async clockOut() { return doClockOut(currentUser!, 'phone') },
    async startBreak(t) { doStartBreak(currentUser!, t) },
    async endBreak() { doEndBreak(currentUser!) },
    async editEntry(id, ci, co, reason) {
      requireAdmin()
      applyEdit(id, ci, co, reason)
    },
    async addEntry(profileId, clockIn, clockOut, reason, positionId) {
      requireAdmin()
      if (!reason.trim()) throw new Error('A reason is required')
      const e: RawEntry = { id: uid(), profile_id: profileId, position_id: positionId ?? null, shift_id: null,
        clock_in: clockIn, clock_out: clockOut, source: 'manual', clock_out_source: 'manual', flags: ['edited'],
        note: null, approved_at: null }
      entries.push(e)
      e.flags = computeFlags(e)
      changes.push({ id: changes.length + 1, time_entry_id: e.id, changed_by: currentUser, changed_at: nowIso(),
        via: 'app', reason, old_values: null, new_values: { clock_in: clockIn, clock_out: clockOut } })
    },
    async requestCorrection(entryId, ci, co, note) {
      const e = entries.find(x => x.id === entryId)
      if (!e || e.profile_id !== currentUser) throw new Error('You can only request corrections to your own timecards')
      if (!note.trim()) throw new Error('Please add a note explaining the correction')
      corrections.unshift({ id: uid(), time_entry_id: entryId, profile_id: currentUser!, requested_clock_in: ci,
        requested_clock_out: co, note, status: 'pending', created_at: nowIso(),
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), decision_note: null })
    },
    async decideCorrection(id, approve, note) {
      requireAdmin()
      const c = corrections.find(x => x.id === id)
      if (!c || c.status !== 'pending') throw new Error('This request is no longer pending')
      if (approve && c.time_entry_id) {
        applyEdit(c.time_entry_id, c.requested_clock_in, c.requested_clock_out,
          `Correction request approved: ${c.note}${note ? ` (${note})` : ''}`)
      }
      c.status = approve ? 'approved' : 'declined'
      c.decision_note = note ?? null
    },
    async approveWeek(monday) {
      requireAdmin()
      const from = zonedIso(monday, '00:00')
      const to = zonedIso(addDays(monday, 7), '00:00')
      const week = entries.filter(e => e.clock_in >= from && e.clock_in < to)
      if (week.some(e => !e.clock_out)) throw new Error('Someone is still clocked in for that week')
      let n = 0
      for (const e of week) if (!e.approved_at) { e.approved_at = nowIso(); n++ }
      return n
    },

    async fillFromRota(monday) {
      requireAdmin()
      const todayStart = zonedIso(today(), '00:00')
      let n = 0
      for (const s of shifts) {
        if (!s.profile_id || localDate(s.starts_at) < monday || localDate(s.starts_at) > addDays(monday, 6)) continue
        if (s.starts_at >= todayStart) continue
        const has = entries.some(e => e.profile_id === s.profile_id && e.clock_in < s.ends_at && (e.clock_out ?? nowIso()) > s.starts_at)
        if (has) continue
        const e: RawEntry = { id: uid(), profile_id: s.profile_id, position_id: s.position_id, shift_id: s.id,
          clock_in: s.starts_at, clock_out: s.ends_at, source: 'rota', clock_out_source: 'rota', flags: ['from_rota'],
          note: null, approved_at: null }
        entries.push(e)
        e.flags = computeFlags(e)
        changes.push({ id: changes.length + 1, time_entry_id: e.id, changed_by: currentUser, changed_at: nowIso(), via: 'app',
          reason: 'Filled from the rota: no clock-in was recorded for this shift', old_values: null,
          new_values: { clock_in: s.starts_at, clock_out: s.ends_at } })
        n++
      }
      return n
    },

    async saveShift(input: ShiftInput) {
      requireAdmin()
      if (input.ends_at <= input.starts_at) throw new Error('Shift must end after it starts')
      const off = input.profile_id && timeOff.find(t => t.profile_id === input.profile_id && t.status === 'approved' &&
        localDate(input.starts_at) >= t.starts_on && localDate(input.starts_at) <= t.ends_on)
      if (off) throw new Error(`${profiles.find(p => p.id === input.profile_id)?.full_name} has approved time off that day`)
      if (input.id) {
        const s = shifts.find(x => x.id === input.id)
        if (s) Object.assign(s, input)
      } else {
        shifts.push({ ...input, id: uid(), status: input.status ?? 'published' })
      }
    },
    async deleteShift(id) {
      requireAdmin()
      const i = shifts.findIndex(s => s.id === id)
      if (i >= 0) shifts.splice(i, 1)
    },
    async takeOpenShift(id) {
      if (isPartner()) throw new Error('Not allowed')
      const s = shifts.find(x => x.id === id && !x.profile_id)
      if (!s) throw new Error('That shift is no longer open')
      if (shifts.some(x => x.profile_id === currentUser && x.starts_at < s.ends_at && x.ends_at > s.starts_at)) {
        throw new Error('It clashes with one of your shifts')
      }
      s.profile_id = currentUser
    },

    async saveEvent(input) {
      requireAdmin()
      if (input.id) Object.assign(events.find(e => e.id === input.id) ?? {}, input)
      else events.push({ competition: null, ...input, id: uid(), source: 'admin' } as CalendarEvent)
    },
    async deleteEvent(id) {
      requireAdmin()
      const i = events.findIndex(e => e.id === id)
      if (i >= 0) events.splice(i, 1)
    },

    async updateBusiness(patch) {
      requireAdmin()
      if ('name' in patch && !patch.name?.trim()) throw new Error('The business needs a name')
      Object.assign(business, patch, { updated_at: nowIso() })
    },
    async updateAdminNotes(notes) { requireAdmin(); adminNotes = notes },
    async updateSettings(patch) { requireAdmin(); Object.assign(settings, patch) },
    async updateProfile(id, patch) {
      if (id !== currentUser) requireAdmin()
      if (id !== currentUser && 'preferences' in patch) throw new Error('Only the person themselves can change their appearance settings')
      if (id === currentUser && patch.active === false) throw new Error("You can't switch off your own account. Ask another admin.")
      if (!isAdmin() && ('role' in patch || 'can_see_pay' in patch || 'active' in patch)) {
        throw new Error('Only an admin can change role, pay access or status')
      }
      const p = profiles.find(x => x.id === id)
      if (patch.role && patch.role !== 'admin' && p?.role === 'admin' &&
        profiles.filter(x => x.role === 'admin' && x.active).length === 1) {
        throw new Error('At least one admin must remain')
      }
      if (p) Object.assign(p, patch)
    },
    async setPin(pin, profileId) {
      if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits')
      if (profileId && profileId !== currentUser) requireAdmin()
      const p = profiles.find(x => x.id === (profileId ?? currentUser))
      if (p) p.pin = pin
    },
    async setPayRate(profileId, rate) {
      requireAdmin()
      payRates.push({ profile_id: profileId, effective_from: today(), hourly_rate: rate })
    },
    async setTemporaryPassword(userId, password) {
      requireAdmin()
      if (password.length < 8) throw new Error('The temporary password needs at least 8 characters')
      const p = profiles.find(x => x.id === userId)
      if (!p) throw new Error('No such person')
      if (p.role === 'admin') throw new Error('Admins change their own password on My account')
    },
    async invite(email, fullName, role, password) {
      requireAdmin()
      if (password !== undefined && password.length < 8) throw new Error('The temporary password needs at least 8 characters')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Enter a full email address, like name@example.com')
      profiles.push({ id: uid(), full_name: fullName, email, role, can_see_pay: false, colour: '#8d6e63',
        active: true, phone: null, birth_date: null })
    },
    async partners() {
      requireAdmin()
      return profiles.filter(p => p.role === 'partner').map(visibleProfile)
    },
    async invitePartner(email, fullName, company, access, password) {
      requireAdmin()
      if (password !== undefined && password.length < 8) throw new Error('The temporary password needs at least 8 characters')
      const addr = email.trim().toLowerCase()
      if (!fullName.trim() || !addr) throw new Error('Name and email are required')
      if (!company.trim()) throw new Error('Add the partner’s company name')
      if (profiles.some(p => p.email === addr)) throw new Error('Someone with that email already has an account')
      profiles.push({ id: uid(), full_name: fullName.trim(), email: addr, role: 'partner', can_see_pay: false, colour: '#6B645E',
        active: true, phone: null, birth_date: null, partner_company: company.trim(), partner_access: [...access] })
    },
    async setPartnerAccess(id, company, access) {
      requireAdmin()
      const p = profiles.find(x => x.id === id && x.role === 'partner')
      if (!p) throw new Error('That person is not a partner')
      Object.assign(p, { partner_company: company.trim() || null, partner_access: [...access] })
    },

    async timeOff(fromDate, toDate) {
      return clone(timeOff.filter(t => t.starts_on <= toDate && t.ends_on >= fromDate &&
        (isAdmin() || t.profile_id === currentUser || (t.status === 'approved' && (!isPartner() || partnerCan('rota') || partnerCan('payroll'))))))
        .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
    },
    async vacationDaysUsed(profileId, year) {
      const y0 = `${year}-01-01`, y1 = `${year}-12-31`
      return timeOff.filter(t => t.profile_id === profileId && t.kind === 'vacation' && ['approved', 'pending'].includes(t.status)
        && t.starts_on <= y1 && t.ends_on >= y0)
        .reduce((n, t) => n + (Date.parse(t.ends_on < y1 ? t.ends_on : y1) - Date.parse(t.starts_on > y0 ? t.starts_on : y0)) / 86400000 + 1, 0)
    },
    async requestTimeOff(startsOn, endsOn, kind, note) {
      if (isPartner()) throw new Error('Not allowed')
      if (endsOn < startsOn) throw new Error('The last day must be on or after the first day')
      if (kind !== 'sick' && startsOn < today()) throw new Error('Holiday requests must be for today or later')
      if (timeOff.some(t => t.profile_id === currentUser && ['pending', 'approved'].includes(t.status) && t.starts_on <= endsOn && t.ends_on >= startsOn)) {
        throw new Error('You already have time off requested for some of those days')
      }
      const days = (Date.parse(endsOn) - Date.parse(startsOn)) / 86400000 + 1
      if (kind === 'vacation' && (await api.vacationDaysUsed(currentUser!, Number(startsOn.slice(0, 4)))) + days > settings.vacation_days_per_year) {
        throw new Error(`That is more than your ${settings.vacation_days_per_year} holiday days for the year`)
      }
      timeOff.push({ id: uid(), profile_id: currentUser!, starts_on: startsOn, ends_on: endsOn, kind, note: note || null,
        status: 'pending', created_at: nowIso(), decision_note: null })
    },
    async cancelTimeOff(id) {
      const t = timeOff.find(x => x.id === id && (x.profile_id === currentUser || isAdmin()))
      if (!t) throw new Error('Request not found')
      if (!['pending', 'approved'].includes(t.status)) throw new Error(`This request is already ${t.status}`)
      t.status = 'cancelled'
    },
    async decideTimeOff(id, approve, note, releaseShifts = true) {
      requireAdmin()
      const t = timeOff.find(x => x.id === id)
      if (!t || t.status !== 'pending') throw new Error('This request is no longer pending')
      t.status = approve ? 'approved' : 'declined'
      t.decision_note = note ?? null
      let n = 0
      if (approve && releaseShifts) {
        const name = profiles.find(p => p.id === t.profile_id)?.full_name
        for (const s of shifts) {
          if (s.profile_id === t.profile_id && localDate(s.starts_at) >= t.starts_on && localDate(s.starts_at) <= t.ends_on) {
            s.profile_id = null
            s.note = `${s.note ? `${s.note} · ` : ''}Released: ${name} off`
            n++
          }
        }
      }
      return n
    },

    async signInWithGoogle() {
      throw new Error('Google sign-in works on the live app. In the demo, use an example email.')
    },
    async signInWithMicrosoft() {
      throw new Error('Microsoft sign-in works on the live app. In the demo, use an example email.')
    },

    async expenses() {
      if (!(me()?.role === 'admin' && me()?.can_see_pay) && !partnerCan('finances')) return []
      return clone(expenses).sort((a, b) => a.sort - b.sort)
    },
    async saveExpense(e) {
      if (!(me()?.role === 'admin' && me()?.can_see_pay)) throw new Error('Only admins with pay access can change finances')
      if (!e.name.trim()) throw new Error('Give the expense a name')
      if (!(e.amount >= 0)) throw new Error('Enter an amount of 0 or more')
      const existing = e.id && expenses.find(x => x.id === e.id)
      if (existing) Object.assign(existing, { ...e, updated_at: nowIso() })
      else expenses.push({ id: uid(), category: null, notes: null, active: true, sort: expenses.length + 1, source: 'app',
        updated_at: nowIso(), ...e, name: e.name.trim() })
    },
    async deleteExpense(id) {
      if (!(me()?.role === 'admin' && me()?.can_see_pay)) throw new Error('Only admins with pay access can change finances')
      const i = expenses.findIndex(x => x.id === id)
      if (i >= 0) expenses.splice(i, 1)
    },
    async sentAlerts() {
      requireAdmin()
      return clone(sent)
    },

    async sportsCompetitions() { return clone(sports.competitions) },
    async sportsEvents(fromIso, toIso) {
      return clone(sports.events.filter(e => e.starts_at >= fromIso && e.starts_at < toIso)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)))
    },
    async setSportsFollowed(code, followed) {
      requireAdmin()
      const c = sports.competitions.find(x => x.code === code)
      if (c) c.followed = followed
    },
    async sportsFavourites() {
      return clone(favourites.filter(f => f.profile_id === currentUser).map(({ kind, ref }) => ({ kind, ref })))
    },
    async setSportsFavourite(fav, on) {
      if (!me() || me()!.role === 'partner') throw new Error('Only the team has sports favourites')
      const i = favourites.findIndex(f => f.profile_id === currentUser && f.kind === fav.kind && f.ref === fav.ref)
      if (on && i < 0) favourites.push({ ...fav, profile_id: currentUser! })
      if (!on && i >= 0) favourites.splice(i, 1)
    },
    async refreshSports() {
      requireAdmin()
      for (const c of sports.competitions) c.refreshed_at = nowIso()
      return sports.events.length
    },

    async integrations() {
      requireAdmin()
      return structuredClone(integ)
    },
    async connectGoogle() {
      requireAdmin()
      const g = integ.integrations.find(i => i.provider === 'google_business')!
      Object.assign(g, { status: 'connected', account_label: 'Easy Beans Coffee', connected_at: nowIso(), last_sync_at: nowIso(),
        external: { locations: [{ name: 'locations/1', title: 'Easy Beans Coffee', address: business.address ?? '' }], location: 'locations/1' } })
    },
    async chooseGoogleListing(_loc, closedOnHolidays) {
      requireAdmin()
      const g = integ.integrations.find(i => i.provider === 'google_business')!
      if (closedOnHolidays !== undefined) g.external.closed_on_holidays = closedOnHolidays
    },
    async syncGoogleNow() {
      requireAdmin()
      integ.integrations.find(i => i.provider === 'google_business')!.last_sync_at = nowIso()
    },
    async googleHours() {
      return { ...business.opening_hours, sun: { open: '10:00', close: '15:00' } }
    },
    async disconnect(provider) {
      requireAdmin()
      Object.assign(integ.integrations.find(i => i.provider === provider)!, { status: 'disconnected', account_label: null, external: {} })
    },
    async whatsappTest(to) {
      requireAdmin()
      if (!/\d{9,}/.test(to.replace(/\D/g, ''))) throw new Error('Enter a full number with country code, e.g. +34 600 000 000')
    },
    async instagramProfile() {
      return {
        username: 'easy.beans.coffee', name: 'Easy Beans Coffee', followers_count: 1284, media_count: 57,
        biography: 'Specialty coffee & matcha · San Pedro de Alcántara',
        recent: ['Iced oat latte season', 'Matcha, but make it ceremonial', 'Fresh from By Eric this morning',
          'Sunday slow bar', 'Our new Ethiopian filter', 'Feria week hours'].map((caption, i) => ({
          id: String(i), caption, permalink: 'https://instagram.com/easy.beans.coffee',
          timestamp: new Date(Date.now() - i * 2 * 86400000).toISOString(), like_count: 180 - i * 17, comments_count: 12 - i,
        })),
      }
    },
    async uploadPhoto(file) {
      return URL.createObjectURL(file)
    },
    async share(caption, imageUrl, targets) {
      requireAdmin()
      if (!caption.trim()) throw new Error('Write a caption first')
      if (targets.includes('instagram') && !imageUrl) throw new Error('Instagram posts need a photo')
      return targets.length
    },
    async connectSpotify() {
      requireAdmin()
      Object.assign(integ.integrations.find(i => i.provider === 'spotify')!, { status: 'connected', account_label: 'Easy Beans (Premium)', connected_at: nowIso() })
    },
    async spotifyPlaylists() {
      return { playlists: demoPlaylists, approved: integ.integrations.find(i => i.provider === 'spotify')!.external.playlist ?? null }
    },
    async chooseSpotifyPlaylist(playlist) {
      requireAdmin()
      integ.integrations.find(i => i.provider === 'spotify')!.external.playlist = playlist
    },
    async brand() { return clone(brand) },
    async saveBrand(patch) {
      requireAdmin()
      Object.assign(brand, patch, { updated_at: nowIso() })
    },
    async fontList() { return { source: 'built-in', fonts: POPULAR_FONTS } },
    async notifications() {
      return clone(notes.filter(n => n.profile_id === currentUser).map(({ profile_id: _p, ...n }) => n).reverse())
    },
    async markNotificationsRead() {
      for (const n of notes) if (n.profile_id === currentUser && !n.read_at) n.read_at = nowIso()
    },
    async eventAlerts() { return clone(alerts) },
    async setEventAlert(kind, refId, on) {
      requireAdmin()
      const i = alerts.findIndex(a => a.kind === kind && a.ref_id === refId)
      if (i >= 0) alerts.splice(i, 1)
      if (!on) return false
      const title = kind === 'sports' ? sports.events.find(e => e.id === refId)?.title : events.find(e => e.id === refId)?.title
      if (!title) throw new Error('That event no longer exists')
      alerts.push({ kind, ref_id: refId, remind_at: nowIso(), sent_at: null })
      // The demo delivers the reminder straight away so you can see it arrive.
      for (const p of profiles.filter(x => x.role === 'admin' && x.active)) {
        notes.push({ id: notes.length + 1, profile_id: p.id, title, body: 'Reminder switched on. Admins get this the day before (or 3 hours before a match).', link: kind === 'sports' ? '/sports' : '/calendar', created_at: nowIso(), read_at: null })
      }
      return true
    },
    async calendarFeeds() {
      const f = feeds.get(currentUser!) ?? {}
      return isAdmin() ? { ...f } : { me: f.me }
    },
    async makeCalendarFeed(scope) {
      if (scope === 'business') requireAdmin()
      const url = `https://easybeans.example/cal/${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}.ics`
      feeds.set(currentUser!, { ...feeds.get(currentUser!), [scope]: url })
      return url
    },
    async stopCalendarFeed(scope) {
      const f = { ...feeds.get(currentUser!) }
      delete f[scope]
      feeds.set(currentUser!, f)
    },
    async myMusic() {
      if (!['admin', 'employee'].includes(me()?.role ?? '')) throw new Error('Music is for the team')
      return { configured: { spotify: true, youtube: true }, accounts: clone(myAccounts.get(currentUser!) ?? []) }
    },
    async connectMyMusic(provider) {
      const list = (myAccounts.get(currentUser!) ?? []).filter(a => a.provider !== provider)
      myAccounts.set(currentUser!, [...list, { provider, account_label: me()?.full_name ?? null, connected_at: nowIso() }])
    },
    async disconnectMyMusic(provider) {
      myAccounts.set(currentUser!, (myAccounts.get(currentUser!) ?? []).filter(a => a.provider !== provider))
      if (provider === 'spotify') myPlayer.playing = false
    },
    async myPlaylists(provider) {
      if (!(myAccounts.get(currentUser!) ?? []).some(a => a.provider === provider)) throw new Error(`Connect ${provider === 'spotify' ? 'Spotify' : 'YouTube Music'} first`)
      return clone(samplePlaylists[provider])
    },
    async myNowPlaying() { return clone(myPlayer) },
    async playMySpotify(playlistId) {
      const p = samplePlaylists.spotify.find(x => x.id === playlistId)
      if (!p) throw new Error('Pick a playlist')
      Object.assign(myPlayer, { playing: true, track: 'Coffee', artist: 'beabadoobee', device: 'iPhone' })
    },
    async pauseMySpotify() { myPlayer.playing = false },

    async musicNow() {
      const s = integ.integrations.find(i => i.provider === 'spotify')!
      if (s.status !== 'connected') throw new Error('Spotify is not connected')
      return { playlist: s.external.playlist ?? null, ...music, onApprovedPlaylist: music.playing }
    },
    async musicPlay() {
      if (!integ.integrations.find(i => i.provider === 'spotify')!.external.playlist) throw new Error('No playlist approved yet. An admin picks one on the Connections page.')
      Object.assign(music, { playing: true, track: 'Sunday Morning', artist: 'Maroon 5', device: 'Café speaker' })
    },
    async musicPause() { music.playing = false },
    async sendRota() {
      requireAdmin()
      return profiles.filter(p => p.whatsapp_opt_in && p.phone).length
    },

    async kioskRoster() {
      return profiles.filter(p => p.active && staffOnly(p)).map(p => {
        const e = openEntry(p.id)
        const b = e && breaks.find(x => x.time_entry_id === e.id && !x.ended_at)
        return { id: p.id, full_name: p.full_name, colour: p.colour, status: b ? 'break' : e ? 'in' : 'out',
          since: b?.started_at ?? e?.clock_in ?? null, has_pin: !!p.pin }
      })
    },
    async kioskPunch(profileId, pin, action, positionId, breakTypeId) {
      const p = profiles.find(x => x.id === profileId)
      if (!p?.pin) throw new Error('No PIN set. Ask an admin to set your PIN.')
      if (p.pin !== pin) throw new Error('Wrong PIN')
      let summary: TimeEntry | null = null
      if (action === 'in') doClockIn(profileId, 'kiosk', positionId)
      if (action === 'out') summary = doClockOut(profileId, 'kiosk')
      if (action === 'break_start') doStartBreak(profileId, breakTypeId)
      if (action === 'break_end') doEndBreak(profileId)
      return { action, at: nowIso(), full_name: p.full_name, summary }
    },
  }
  return api
}
