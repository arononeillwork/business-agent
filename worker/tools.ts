// Operations exposed to AI assistants (MCP) and scripts (REST). Each runs as the signed-in
// person through Supabase, so row-level security and the SQL rules decide what is allowed:
// an employee's AI can never do more than the employee could in the app.
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { shiftPaidMinutes, shiftWarnings } from '../shared/rules'
import { addDays, localDate, localTime, today, weekStart, zonedIso, formatLocal } from '../shared/time'
import type { Business, CalendarEvent, PayRate, Position, Profile, Settings, Shift } from '../shared/types'

export interface ToolContext {
  sb: SupabaseClient
  me: Profile
}

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string
  title: string
  description: string
  input: S
  admin?: boolean
  readOnly?: boolean
  destructive?: boolean
  run: (ctx: ToolContext, args: z.infer<S>) => Promise<unknown>
}

const tool = <S extends z.ZodType>(def: ToolDef<S>) => def as unknown as ToolDef

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const time = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm (24-hour)')
const category = z.enum(['national', 'regional', 'local', 'area', 'event', 'sports', 'business', 'staff'])

function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message)
  return res.data as NonNullable<T>
}

/** For `.then(rowsAs<T>())`: check the response and type the rows. */
const rowsAs = <T,>() => (res: { data: unknown; error: { message: string } | null }) => check(res) as T

const PROFILE_COLUMNS = 'id, full_name, email, role, can_see_pay, colour, active, phone, birth_date'

async function team(sb: SupabaseClient): Promise<Profile[]> {
  return check(await sb.from('profiles').select(PROFILE_COLUMNS).neq('role', 'kiosk'))
}
async function positions(sb: SupabaseClient): Promise<Position[]> {
  return check(await sb.from('positions').select('*'))
}

/** Find a person by id or (partial, case-insensitive) name. */
async function resolvePerson(sb: SupabaseClient, who: string): Promise<Profile> {
  const people = await team(sb)
  const q = who.trim().toLowerCase()
  const exact = people.filter(p => p.id === who || p.full_name.toLowerCase() === q)
  const matches = exact.length ? exact : people.filter(p => p.full_name.toLowerCase().includes(q))
  if (matches.length === 1) return matches[0]
  if (!matches.length) throw new Error(`No team member matches "${who}". Team: ${people.map(p => p.full_name).join(', ')}`)
  throw new Error(`"${who}" matches several people: ${matches.map(p => p.full_name).join(', ')}`)
}

async function resolvePosition(sb: SupabaseClient, name: string | undefined): Promise<number | null> {
  if (!name) return null
  const all = await positions(sb)
  const p = all.find(x => x.name.toLowerCase() === name.trim().toLowerCase())
  if (!p) throw new Error(`Unknown position "${name}". Positions: ${all.map(x => x.name).join(', ')}`)
  return p.id
}

function endIso(day: string, start: string, end: string) {
  return end <= start ? zonedIso(addDays(day, 1), end) : zonedIso(day, end)
}

async function describeShifts(sb: SupabaseClient, from: string, to: string) {
  const [shifts, people, pos, business, events] = await Promise.all([
    sb.from('shifts').select('*').gte('starts_at', zonedIso(addDays(from, -1), '00:00'))
      .lt('starts_at', zonedIso(addDays(to, 1), '00:00')).order('starts_at').then(rowsAs<Shift[]>()),
    team(sb), positions(sb),
    sb.from('business').select('opening_hours').eq('id', 1).single().then(rowsAs<Pick<Business, 'opening_hours'>>()),
    sb.from('calendar_events').select('*').gte('starts_on', from).lte('starts_on', to).then(rowsAs<CalendarEvent[]>()),
  ])
  const ctx = { shifts, openingHours: business.opening_hours, events }
  return shifts.filter(s => localDate(s.starts_at) >= from).map(s => ({
    shift_id: s.id,
    date: localDate(s.starts_at),
    day: formatLocal(s.starts_at, 'EEEE'),
    start: localTime(s.starts_at),
    end: localTime(s.ends_at),
    person: s.profile_id ? people.find(p => p.id === s.profile_id)?.full_name ?? 'Unknown' : 'OPEN SHIFT',
    position: pos.find(p => p.id === s.position_id)?.name ?? null,
    break_minutes: s.break_minutes,
    paid_hours: +(shiftPaidMinutes(s) / 60).toFixed(2),
    note: s.note,
    status: s.status,
    warnings: shiftWarnings(s, ctx).map(w => w.message),
  }))
}

export const TOOLS: ToolDef[] = [
  tool({
    name: 'whoami',
    title: 'Who am I',
    description: 'The signed-in person, their role (admin or employee) and the business name. Call this first.',
    input: z.object({}),
    readOnly: true,
    async run({ sb, me }) {
      const b = check(await sb.from('business').select('name, timezone').eq('id', 1).single())
      return { name: me.full_name, email: me.email, role: me.role, can_see_pay: me.can_see_pay, business: b.name,
        timezone: b.timezone, today: today(), note: 'Dates are YYYY-MM-DD, times are 24-hour local (Europe/Madrid).' }
    },
  }),

  // ---------------- Business ----------------
  tool({
    name: 'get_business_details',
    title: 'Business details',
    description: 'Address, phone, email, Instagram, opening hours, team channel, suppliers, towns followed and notes.',
    input: z.object({}),
    readOnly: true,
    async run({ sb, me }) {
      const b = check(await sb.from('business').select('*').eq('id', 1).single())
      const adminNotes = me.role === 'admin'
        ? check(await sb.from('business_admin_notes').select('notes').eq('id', 1).maybeSingle())?.notes ?? null : undefined
      return { ...b, admin_notes: adminNotes }
    },
  }),
  tool({
    name: 'update_business_details',
    title: 'Update business details',
    description: 'Admins: change contact details, team channel (whatsapp, slack, sms), towns followed, notes or opening hours. Only pass fields that change.',
    admin: true,
    input: z.object({
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      instagram: z.string().optional(),
      team_channel: z.enum(['whatsapp', 'slack', 'sms']).optional(),
      towns_followed: z.array(z.string()).optional(),
      notes: z.string().optional(),
      admin_notes: z.string().optional().describe('Admin-only notes (alarm code holder, wifi, landlord…)'),
      opening_hours: z.record(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
        z.object({ open: time, close: time }).nullable()).optional()
        .describe('Days to change, e.g. {"mon": {"open": "08:00", "close": "15:00"}, "sun": null} (null = closed)'),
    }),
    async run({ sb }, { admin_notes, opening_hours, ...patch }) {
      if (opening_hours) {
        const cur = check(await sb.from('business').select('opening_hours').eq('id', 1).single())
        Object.assign(patch, { opening_hours: { ...cur.opening_hours, ...opening_hours } })
      }
      if (Object.keys(patch).length) check(await sb.from('business').update(patch).eq('id', 1))
      if (admin_notes !== undefined) check(await sb.from('business_admin_notes').update({ notes: admin_notes }).eq('id', 1))
      return { ok: true, updated: [...Object.keys(patch), ...(admin_notes !== undefined ? ['admin_notes'] : [])] }
    },
  }),

  // ---------------- Team ----------------
  tool({
    name: 'list_team',
    title: 'Team',
    description: 'Team members with roles. Hourly pay rates are included only for admins with pay access.',
    input: z.object({}),
    readOnly: true,
    async run({ sb, me }) {
      const [people, rates] = await Promise.all([team(sb),
        sb.from('pay_rates').select('*').then(rowsAs<PayRate[]>())])
      const latest = new Map<string, number>()
      for (const r of rates.sort((a, b) => a.effective_from.localeCompare(b.effective_from))) latest.set(r.profile_id, Number(r.hourly_rate))
      return people.map(p => ({ name: p.full_name, role: p.role, active: p.active, email: p.email,
        ...(me.can_see_pay && me.role === 'admin' ? { hourly_rate_eur: latest.get(p.id) ?? null } : {}) }))
    },
  }),

  // ---------------- Schedule ----------------
  tool({
    name: 'get_schedule',
    title: 'Rota',
    description: 'Shifts between two dates (default: this week), with open shifts and Spanish working-time warnings (breaks, 12h rest, opening hours, holidays).',
    input: z.object({ from: date.optional(), to: date.optional() }),
    readOnly: true,
    async run({ sb }, { from, to }) {
      const start = from ?? weekStart(today())
      return describeShifts(sb, start, to ?? addDays(start, 6))
    },
  }),
  tool({
    name: 'whos_working',
    title: "Who's working",
    description: "Who is scheduled on a day (default today), who is clocked in right now, and any open shifts.",
    input: z.object({ date: date.optional() }),
    readOnly: true,
    async run({ sb, me }, { date: d }) {
      const day = d ?? today()
      const shifts = await describeShifts(sb, day, day)
      let clockedIn: string[] | undefined
      if (me.role === 'admin' && day === today()) {
        const [open, people] = await Promise.all([
          sb.from('time_entries').select('profile_id, clock_in').is('clock_out', null).then(rowsAs<{ profile_id: string; clock_in: string }[]>()),
          team(sb)])
        clockedIn = open.map(e => `${people.find(p => p.id === e.profile_id)?.full_name} since ${localTime(e.clock_in)}`)
      }
      return { date: day, scheduled: shifts, clocked_in_now: clockedIn,
        open_shifts: shifts.filter(s => s.person === 'OPEN SHIFT').length }
    },
  }),
  tool({
    name: 'create_shift',
    title: 'Add shift',
    description: 'Admins: add a shift. Leave person empty for an open shift anyone can take. Returns warnings (e.g. no break, short rest).',
    admin: true,
    input: z.object({
      person: z.string().optional().describe('Name of the team member; omit for an open shift'),
      date, start: time, end: time,
      position: z.string().optional().describe('Barista, Kitchen, Cleaner, Propietario…'),
      break_minutes: z.number().int().min(0).default(0),
      note: z.string().optional(),
    }),
    async run({ sb }, a) {
      const profile = a.person ? await resolvePerson(sb, a.person) : null
      const row = check(await sb.from('shifts').insert({
        profile_id: profile?.id ?? null, position_id: await resolvePosition(sb, a.position),
        starts_at: zonedIso(a.date, a.start), ends_at: endIso(a.date, a.start, a.end),
        break_minutes: a.break_minutes, note: a.note ?? null,
      }).select('id').single())
      const described = (await describeShifts(sb, a.date, a.date)).find(s => s.shift_id === row.id)
      return { ok: true, shift: described }
    },
  }),
  tool({
    name: 'update_shift',
    title: 'Change shift',
    description: 'Admins: move or change a shift (get shift_id from get_schedule). Only pass what changes. person "open" makes it an open shift.',
    admin: true,
    input: z.object({
      shift_id: z.string().uuid(),
      person: z.string().optional(), date: date.optional(), start: time.optional(), end: time.optional(),
      position: z.string().optional(), break_minutes: z.number().int().min(0).optional(), note: z.string().optional(),
    }),
    async run({ sb }, a) {
      const cur = check(await sb.from('shifts').select('*').eq('id', a.shift_id).single()) as Shift
      const day = a.date ?? localDate(cur.starts_at)
      const start = a.start ?? localTime(cur.starts_at)
      const end = a.end ?? localTime(cur.ends_at)
      const patch: Record<string, unknown> = { starts_at: zonedIso(day, start), ends_at: endIso(day, start, end) }
      if (a.person !== undefined) patch.profile_id = a.person.toLowerCase() === 'open' ? null : (await resolvePerson(sb, a.person)).id
      if (a.position !== undefined) patch.position_id = await resolvePosition(sb, a.position)
      if (a.break_minutes !== undefined) patch.break_minutes = a.break_minutes
      if (a.note !== undefined) patch.note = a.note
      check(await sb.from('shifts').update(patch).eq('id', a.shift_id))
      return { ok: true, shift: (await describeShifts(sb, day, day)).find(s => s.shift_id === a.shift_id) }
    },
  }),
  tool({
    name: 'delete_shift',
    title: 'Remove shift',
    description: 'Admins: remove a shift. Ask the user to confirm first, then call with confirm: true.',
    admin: true,
    destructive: true,
    input: z.object({ shift_id: z.string().uuid(), confirm: z.literal(true) }),
    async run({ sb }, { shift_id }) {
      check(await sb.from('shifts').delete().eq('id', shift_id))
      return { ok: true }
    },
  }),

  // ---------------- Time tracking ----------------
  tool({
    name: 'list_timecards',
    title: 'Timecards',
    description: 'Clock-in/out records with paid hours, breaks and flags (missed break, over 9h, auto clock-out). Employees see only their own.',
    input: z.object({ from: date.optional(), to: date.optional(), person: z.string().optional() }),
    readOnly: true,
    async run({ sb }, { from, to, person }) {
      const start = from ?? weekStart(today())
      let q = sb.from('time_entry_totals').select('*').gte('clock_in', zonedIso(start, '00:00'))
        .lt('clock_in', zonedIso(addDays(to ?? addDays(start, 6), 1), '00:00')).order('clock_in')
      if (person) q = q.eq('profile_id', (await resolvePerson(sb, person)).id)
      const [rows, people] = await Promise.all([q.then(rowsAs<Record<string, never>[]>()), team(sb)])
      return rows.map((e: Record<string, any>) => ({
        entry_id: e.id, person: people.find(p => p.id === e.profile_id)?.full_name, date: e.work_date,
        clock_in: localTime(e.clock_in), clock_out: e.clock_out ? localTime(e.clock_out) : 'still clocked in',
        break_minutes: e.break_minutes, paid_hours: +(e.paid_minutes / 60).toFixed(2), flags: e.flags,
        on_holiday: e.on_holiday, approved: !!e.approved_at, source: e.source,
      }))
    },
  }),
  tool({
    name: 'edit_timecard',
    title: 'Correct timecard',
    description: 'Admins: correct a clock-in or clock-out time. A reason is required and the change is logged as made via AI.',
    admin: true,
    input: z.object({ entry_id: z.string().uuid(), date, clock_in: time.optional(), clock_out: time.optional(), reason: z.string().min(3) }),
    async run({ sb }, a) {
      check(await sb.rpc('edit_time_entry', {
        p_entry_id: a.entry_id, p_clock_in: a.clock_in ? zonedIso(a.date, a.clock_in) : null,
        p_clock_out: a.clock_out ? zonedIso(a.date, a.clock_out) : null, p_reason: a.reason,
      }))
      return { ok: true }
    },
  }),
  tool({
    name: 'request_timecard_correction',
    title: 'Request correction',
    description: 'Employees: ask an admin to fix one of your own timecards (e.g. forgot to clock out). A note is required.',
    input: z.object({ entry_id: z.string().uuid(), date, clock_in: time.optional(), clock_out: time.optional(), note: z.string().min(3) }),
    async run({ sb }, a) {
      check(await sb.rpc('request_correction', {
        p_entry_id: a.entry_id, p_clock_in: a.clock_in ? zonedIso(a.date, a.clock_in) : null,
        p_clock_out: a.clock_out ? zonedIso(a.date, a.clock_out) : null, p_note: a.note,
      }))
      return { ok: true, message: 'Request sent to the admins' }
    },
  }),
  tool({
    name: 'list_correction_requests',
    title: 'Correction requests',
    description: 'Pending timecard correction requests (admins see everyone’s, employees their own).',
    input: z.object({ include_decided: z.boolean().default(false) }),
    readOnly: true,
    async run({ sb }, { include_decided }) {
      let q = sb.from('correction_requests').select('*').order('created_at', { ascending: false })
      if (!include_decided) q = q.eq('status', 'pending')
      const [rows, people] = await Promise.all([q.then(rowsAs<Record<string, any>[]>()), team(sb)])
      return rows.map(r => ({ request_id: r.id, person: people.find(p => p.id === r.profile_id)?.full_name, note: r.note,
        requested_clock_in: r.requested_clock_in ? formatLocal(r.requested_clock_in, 'yyyy-MM-dd HH:mm') : null,
        requested_clock_out: r.requested_clock_out ? formatLocal(r.requested_clock_out, 'yyyy-MM-dd HH:mm') : null,
        status: r.status, expires: localDate(r.expires_at) }))
    },
  }),
  tool({
    name: 'decide_correction_request',
    title: 'Approve/decline correction',
    description: 'Admins: approve (applies the change, logged) or decline a correction request.',
    admin: true,
    input: z.object({ request_id: z.string().uuid(), approve: z.boolean(), note: z.string().optional() }),
    async run({ sb }, a) {
      check(await sb.rpc('decide_correction', { p_request_id: a.request_id, p_approve: a.approve, p_note: a.note ?? null }))
      return { ok: true }
    },
  }),
  tool({
    name: 'approve_week',
    title: 'Approve week',
    description: 'Admins: approve and lock all timecards for a week (week_start = the Monday). Fails if someone is still clocked in.',
    admin: true,
    input: z.object({ week_start: date }),
    async run({ sb }, { week_start }) {
      const n = check(await sb.rpc('approve_week', { p_week_start: weekStart(week_start) }))
      return { ok: true, approved_timecards: n }
    },
  }),
  tool({
    name: 'fill_timecards_from_rota',
    title: 'Fill timecards from rota',
    description: 'Admins: for a week (week_start = Monday), create timecards from the rota for past shifts nobody clocked in for. They are marked "from rota" for review.',
    admin: true,
    input: z.object({ week_start: date }),
    async run({ sb }, { week_start }) {
      const n = check(await sb.rpc('fill_timecards_from_rota', { p_week_start: weekStart(week_start) }))
      return { ok: true, created: n }
    },
  }),
  tool({
    name: 'clock',
    title: 'Clock in/out',
    description: 'Clock yourself in or out, or start/end a break. Uses the server time.',
    input: z.object({ action: z.enum(['in', 'out', 'break_start', 'break_end']), position: z.string().optional() }),
    async run({ sb }, { action, position }) {
      const fn = { in: 'clock_in', out: 'clock_out', break_start: 'start_break', break_end: 'end_break' }[action]
      const args = action === 'in' ? { p_position_id: await resolvePosition(sb, position) } : {}
      check(await sb.rpc(fn, args))
      return { ok: true, action, at: formatLocal(new Date(), 'HH:mm') }
    },
  }),
  tool({
    name: 'labour_summary',
    title: 'Labour summary',
    description: 'Admins with pay access: scheduled vs worked hours and cost per person for a week.',
    admin: true,
    readOnly: true,
    input: z.object({ week_start: date.optional() }),
    async run({ sb, me }, { week_start }) {
      if (!me.can_see_pay) throw new Error('You need pay access for labour costs')
      const monday = weekStart(week_start ?? today())
      const from = zonedIso(monday, '00:00')
      const to = zonedIso(addDays(monday, 7), '00:00')
      const [shifts, entries, rates, people, settings] = await Promise.all([
        sb.from('shifts').select('*').gte('starts_at', from).lt('starts_at', to).then(rowsAs<Shift[]>()),
        sb.from('time_entry_totals').select('profile_id, paid_minutes').gte('clock_in', from).lt('clock_in', to)
          .then(rowsAs<{ profile_id: string; paid_minutes: number }[]>()),
        sb.from('pay_rates').select('*').then(rowsAs<PayRate[]>()),
        team(sb),
        sb.from('settings').select('employer_cost_multiplier').eq('id', 1).single().then(rowsAs<Pick<Settings, 'employer_cost_multiplier'>>()),
      ])
      const rate = new Map<string, number>()
      for (const r of rates.sort((a, b) => a.effective_from.localeCompare(b.effective_from))) rate.set(r.profile_id, Number(r.hourly_rate))
      const rows = people.map(p => {
        const sched = shifts.filter(s => s.profile_id === p.id).reduce((m, s) => m + shiftPaidMinutes(s), 0) / 60
        const worked = entries.filter(e => e.profile_id === p.id).reduce((m, e) => m + e.paid_minutes, 0) / 60
        const r = rate.get(p.id) ?? 0
        return { person: p.full_name, scheduled_hours: +sched.toFixed(2), worked_hours: +worked.toFixed(2),
          rate_eur: r, scheduled_cost_eur: +(sched * r).toFixed(2), worked_cost_eur: +(worked * r).toFixed(2) }
      }).filter(r => r.scheduled_hours || r.worked_hours)
      const sum = (k: 'scheduled_cost_eur' | 'worked_cost_eur') => +rows.reduce((m, r) => m + r[k], 0).toFixed(2)
      return { week_start: monday, people: rows, total_scheduled_eur: sum('scheduled_cost_eur'),
        total_worked_eur: sum('worked_cost_eur'), employer_cost_multiplier: settings.employer_cost_multiplier }
    },
  }),

  // ---------------- Calendar ----------------
  tool({
    name: 'list_calendar_events',
    title: 'Calendar',
    description: 'Holidays (national, regional, local, nearby towns), local events/ferias, football, business events and staff items between two dates.',
    input: z.object({ from: date.optional(), to: date.optional(), category: category.optional() }),
    readOnly: true,
    async run({ sb }, { from, to, category: cat }) {
      const start = from ?? today()
      let q = sb.from('calendar_events').select('*').gte('starts_on', start).lte('starts_on', to ?? addDays(start, 30)).order('starts_on')
      if (cat) q = q.eq('category', cat)
      return (check(await q) as CalendarEvent[]).map(e => ({ event_id: e.id, date: e.starts_on, until: e.ends_on,
        time: e.starts_at ? localTime(e.starts_at) : null, title: e.title, category: e.category, town: e.town,
        competition: e.competition, to_confirm: !e.confirmed, admins_only: e.visibility === 'admins' }))
    },
  }),
  tool({
    name: 'add_calendar_event',
    title: 'Add calendar event',
    description: 'Admins: add a holiday, feria, closure, training day, etc. Categories: national, regional, local, area (nearby town holiday), event (feria/market), sports, business, staff.',
    admin: true,
    input: z.object({
      title: z.string().min(2), category, starts_on: date, ends_on: date.optional(), time: time.optional(),
      town: z.string().optional(), admins_only: z.boolean().default(false), to_confirm: z.boolean().default(false),
    }),
    async run({ sb }, a) {
      const row = check(await sb.from('calendar_events').insert({
        title: a.title, category: a.category, starts_on: a.starts_on, ends_on: a.ends_on ?? null,
        starts_at: a.time ? zonedIso(a.starts_on, a.time) : null, town: a.town ?? null, source: 'ai',
        visibility: a.admins_only ? 'admins' : 'all', confirmed: !a.to_confirm,
      }).select('id').single())
      return { ok: true, event_id: row.id }
    },
  }),
  tool({
    name: 'update_calendar_event',
    title: 'Change calendar event',
    description: 'Admins: change an event (e.g. confirm a date). Only pass fields that change.',
    admin: true,
    input: z.object({
      event_id: z.string().uuid(), title: z.string().optional(), category: category.optional(), starts_on: date.optional(),
      ends_on: date.nullable().optional(), town: z.string().optional(), confirmed: z.boolean().optional(),
      admins_only: z.boolean().optional(),
    }),
    async run({ sb }, { event_id, admins_only, ...rest }) {
      const patch: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
      if (admins_only !== undefined) patch.visibility = admins_only ? 'admins' : 'all'
      check(await sb.from('calendar_events').update(patch).eq('id', event_id))
      return { ok: true }
    },
  }),
  tool({
    name: 'delete_calendar_event',
    title: 'Remove calendar event',
    description: 'Admins: remove an event. Ask the user to confirm first, then call with confirm: true.',
    admin: true,
    destructive: true,
    input: z.object({ event_id: z.string().uuid(), confirm: z.literal(true) }),
    async run({ sb }, { event_id }) {
      check(await sb.from('calendar_events').delete().eq('id', event_id))
      return { ok: true }
    },
  }),

  // ---------------- Football ----------------
  tool({
    name: 'list_followed_football',
    title: 'Football followed',
    description: 'Competitions and teams whose fixtures appear on the calendar, and their alert level.',
    input: z.object({}),
    readOnly: true,
    async run({ sb }) {
      return check(await sb.from('sports_follows').select('kind, provider_id, name, alerts').order('name'))
    },
  }),
  tool({
    name: 'follow_football',
    title: 'Follow football',
    description: 'Admins: follow a competition (football-data.org code, e.g. PD La Liga, PL Premier League, ELC Championship, DED Eredivisie, CL Champions League, WC World Cup, EC Euros) or a team, with alerts all, big_matches or none.',
    admin: true,
    input: z.object({
      kind: z.enum(['competition', 'team']), code: z.string().describe('Provider code or team id'), name: z.string(),
      alerts: z.enum(['all', 'big_matches', 'none']).default('big_matches'),
    }),
    async run({ sb }, a) {
      check(await sb.from('sports_follows').upsert({ kind: a.kind, provider: 'football-data', provider_id: a.code,
        name: a.name, alerts: a.alerts }, { onConflict: 'provider,provider_id' }))
      return { ok: true }
    },
  }),
  tool({
    name: 'unfollow_football',
    title: 'Unfollow football',
    description: 'Admins: stop following a competition or team (by code).',
    admin: true,
    destructive: true,
    input: z.object({ code: z.string() }),
    async run({ sb }, { code }) {
      check(await sb.from('sports_follows').delete().eq('provider_id', code))
      return { ok: true }
    },
  }),

  // ---------------- Settings ----------------
  tool({
    name: 'get_settings',
    title: 'Clock-in rules',
    description: 'Clock-in enforcement and working-time limits (break rule, max hours, rest, approval day, employer cost multiplier).',
    input: z.object({}),
    readOnly: true,
    async run({ sb }) {
      return check(await sb.from('settings').select('*').eq('id', 1).single())
    },
  }),
  tool({
    name: 'update_settings',
    title: 'Change clock-in rules',
    description: 'Admins: change clock-in rules or limits. Only pass what changes.',
    admin: true,
    input: z.object({
      early_clock_in_minutes: z.number().int().min(0).optional(),
      unscheduled_clock_in: z.enum(['flag', 'block']).optional(),
      auto_clock_out_minutes: z.number().int().min(0).optional(),
      phone_clock_in: z.enum(['off', 'anywhere', 'near_cafe']).optional(),
      min_break_minutes: z.number().int().min(0).optional(),
      break_after_hours: z.number().min(0).optional(),
      max_daily_hours: z.number().min(0).optional(),
      max_weekly_hours: z.number().min(0).optional(),
      min_rest_hours: z.number().min(0).optional(),
      employer_cost_multiplier: z.number().min(1).optional(),
    }),
    async run({ sb }, patch) {
      check(await sb.from('settings').update(patch).eq('id', 1))
      return { ok: true, updated: Object.keys(patch) }
    },
  }),
]

/** Tools available to this person (employees don't see admin tools). */
export const toolsFor = (me: Profile) => TOOLS.filter(t => !t.admin || me.role === 'admin')

export async function loadMe(sb: SupabaseClient, accessToken: string): Promise<Profile> {
  const { data: user } = await sb.auth.getUser(accessToken)
  if (!user.user) throw new Error('Session expired. Sign in again.')
  const me = check(await sb.from('profiles').select(PROFILE_COLUMNS).eq('id', user.user.id).single()) as Profile
  if (!me.active || me.role === 'kiosk') throw new Error('This account cannot use the API')
  return me
}

export async function runTool(t: ToolDef, ctx: ToolContext, raw: unknown) {
  if (t.admin && ctx.me.role !== 'admin') throw new Error('Only admins can do that')
  const parsed = t.input.safeParse(raw ?? {})
  if (!parsed.success) throw new Error(parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '))
  return t.run(ctx, parsed.data)
}
