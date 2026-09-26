// In-memory demo of the app with Easy Beans sample data. Used for previews, sales demos and
// when no Supabase project is configured. Mirrors the SQL rules closely but is not the source
// of truth: the database functions are.
import type { Api, ShiftInput } from './api'
import type {
  BreakType, Business, CalendarEvent, CorrectionRequest, PayRate, Position, Profile, Settings,
  Shift, TimeEntry, TimeEntryChange,
} from '../../shared/types'
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
  let adminNotes: string | null = 'Demo: alarm code holder, wifi for the kiosk, landlord and gestor contacts.'
  const settings: Settings = {
    early_clock_in_minutes: 10, unscheduled_clock_in: 'flag', auto_clock_out_minutes: 60,
    forgot_clock_out_grace_minutes: 30, phone_clock_in: 'anywhere', min_break_minutes: 15,
    break_after_hours: 6, max_daily_hours: 9, max_weekly_hours: 40, min_rest_hours: 12,
    approval_weekday: 1, employer_cost_multiplier: 1.3,
  }

  const P = { aron: 'p-aron', mark: 'p-mark', julio: 'p-julio', maria: 'p-maria', cleaner: 'p-cleaner' }
  const profiles: (Profile & { pin?: string })[] = [
    { id: P.aron, full_name: "Aron O'Neill", email: 'aron@example.com', role: 'admin', can_see_pay: true, colour: '#6a1b9a', active: true, phone: null, birth_date: null, pin: '1111' },
    { id: P.mark, full_name: 'Mark Murray', email: 'mark@example.com', role: 'admin', can_see_pay: true, colour: '#4527a0', active: true, phone: null, birth_date: null, pin: '2222' },
    { id: P.julio, full_name: 'Julio', email: 'julio@example.com', role: 'employee', can_see_pay: false, colour: '#6d4c41', active: true, phone: null, birth_date: null, pin: '1234' },
    { id: P.maria, full_name: 'Maria', email: 'maria@example.com', role: 'employee', can_see_pay: false, colour: '#ad1457', active: true, phone: null, birth_date: null, pin: '4321' },
    { id: P.cleaner, full_name: 'Cleaner', email: null, role: 'employee', can_see_pay: false, colour: '#0277bd', active: true, phone: null, birth_date: null },
  ]
  const positions: Position[] = [
    { id: 1, name: 'Barista', colour: '#6d4c41', sort: 1, active: true },
    { id: 2, name: 'Kitchen', colour: '#558b2f', sort: 2, active: true },
    { id: 3, name: 'Cleaner', colour: '#0277bd', sort: 3, active: true },
    { id: 4, name: 'Propietario', colour: '#6a1b9a', sort: 4, active: true },
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
      const saved = sessionStorage.getItem('demo-user')
      return saved === null ? P.aron : saved || null
    } catch {
      return P.aron
    }
  })()
  const listeners = new Set<() => void>()
  const notify = () => { remember(currentUser); listeners.forEach(l => l()) }

  const me = () => profiles.find(p => p.id === currentUser)
  const isAdmin = () => me()?.role === 'admin'
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
  const visibleProfile = ({ pin: _pin, ...p }: Profile & { pin?: string }) => p

  const api: Api = {
    mode: 'demo',
    async currentUserId() { return currentUser },
    onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },
    async signIn(email) {
      const p = profiles.find(x => x.email === email.trim().toLowerCase())
      if (!p) throw new Error('Demo: sign in as aron@example.com (admin) or maria@example.com (employee)')
      currentUser = p.id
      notify()
    },
    async signOut() { currentUser = null; notify() },
    async sendPasswordReset() {},
    async updatePassword() {},

    async me() { const p = me(); return p ? visibleProfile(p) : null },
    async business() { return clone(business) },
    async adminNotes() { requireAdmin(); return adminNotes },
    async settings() { return clone(settings) },
    async profiles() { return profiles.map(visibleProfile) },
    async positions() { return clone(positions) },
    async breakTypes() { return clone(breakTypes) },
    async payRates() {
      const m = me()
      return payRates.filter(r => (m?.role === 'admin' && m.can_see_pay) || r.profile_id === currentUser)
    },
    async shifts(fromIso, toIso) {
      return clone(shifts.filter(s => s.starts_at >= fromIso && s.starts_at < toIso))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    },
    async timeEntries(fromIso, toIso) {
      return entries.filter(e => e.clock_in >= fromIso && e.clock_in < toIso &&
        (isAdmin() || e.profile_id === currentUser)).map(totals)
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
        (e.visibility === 'all' || isAdmin()))).sort((a, b) => a.starts_on.localeCompare(b.starts_on))
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

    async saveShift(input: ShiftInput) {
      requireAdmin()
      if (input.ends_at <= input.starts_at) throw new Error('Shift must end after it starts')
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

    async updateBusiness(patch) { requireAdmin(); Object.assign(business, patch, { updated_at: nowIso() }) },
    async updateAdminNotes(notes) { requireAdmin(); adminNotes = notes },
    async updateSettings(patch) { requireAdmin(); Object.assign(settings, patch) },
    async updateProfile(id, patch) {
      if (id !== currentUser) requireAdmin()
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
    async invite(email, fullName, role) {
      requireAdmin()
      profiles.push({ id: uid(), full_name: fullName, email, role, can_see_pay: false, colour: '#8d6e63',
        active: true, phone: null, birth_date: null })
    },

    async kioskRoster() {
      return profiles.filter(p => p.active && p.role !== 'kiosk').map(p => {
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
