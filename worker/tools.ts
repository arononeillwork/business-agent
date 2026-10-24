// Operations exposed to AI assistants (MCP) and scripts (REST). Each runs as the signed-in
// person through Supabase, so row-level security and the SQL rules decide what is allowed:
// an employee's AI can never do more than the employee could in the app.
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { shiftPaidMinutes, shiftWarnings } from '../shared/rules'
import { addDays, localDate, localTime, today, weekStart, zonedIso, formatLocal } from '../shared/time'
import { TIME_OFF_KINDS, type Business, type CalendarEvent, type Customer, type PartnerArea, type PayRate, type Position, type Profile, type Settings, type Shift, type TimeOff, type TimeOffKind } from '../shared/types'
import { COUNTRY_NAME, ENTITLEMENTS, LAW_CHECKED, PAYER_LABEL, leaveYear, type Benefit, type LeaveAllowance } from '../shared/benefits'
import { businessConfig } from '../shared/business.config'
import { dutiesByWhen, sortRoles, type JobRole } from '../shared/roles'
import { readState, rulesChangedAt, sortSections, type RuleSection, type RulesRead } from '../shared/staffRules'
import { cleanPhone, matchesSearch } from '../shared/customers'
import { cleanWebsite } from '../shared/connections'
import {
  FEATURES, IDEA_STATUSES, KINDS, NOTE_KINDS, PRICE_SOURCES, THREATS, analyse, competitorRows, featuresOf, hoursOf, insightText, insights, matchRecipe,
  priceKey, priceLevelLabel, type Competitor, type CompetitorData, type CompetitorKind, type IdeaStatus, type NoteKind, type PriceSource, type Threat,
} from '../shared/localCompetitors'

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
  /** Partners (outside businesses) may use it: with any of these areas, or 'any' partner. Never for writes. */
  partner?: PartnerArea[] | 'any'
  readOnly?: boolean
  destructive?: boolean
  run: (ctx: ToolContext, args: z.infer<S>) => Promise<unknown>
}

const tool = <S extends z.ZodType>(def: ToolDef<S>) => def as unknown as ToolDef

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const time = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm (24-hour)')
const category = z.enum(['national', 'regional', 'local', 'area', 'event', 'sports', 'business', 'staff'])
const leaveKind = z.enum(TIME_OFF_KINDS as [TimeOffKind, ...TimeOffKind[]])

function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message)
  return res.data as NonNullable<T>
}

/** For `.then(rowsAs<T>())`: check the response and type the rows. */
const rowsAs = <T,>() => (res: { data: unknown; error: { message: string } | null }) => check(res) as T

const PROFILE_COLUMNS = 'id, full_name, email, role, can_see_pay, colour, active, phone, birth_date, partner_company, partner_access'

/** Everything on the Competitors page, with the menu prices and opening hours it's compared with. */
async function competitorData(sb: SupabaseClient) {
  const [competitors, items, prices, notes, snapshots, nearby, settings, recipes, business] = await Promise.all([
    sb.from('competitors').select('*').then(rowsAs<CompetitorData['competitors']>()),
    sb.from('competitor_items').select('*').then(rowsAs<CompetitorData['items']>()),
    sb.from('competitor_prices').select('*').then(rowsAs<CompetitorData['prices']>()),
    sb.from('competitor_notes').select('*').order('observed_on', { ascending: false }).then(rowsAs<CompetitorData['notes']>()),
    sb.from('competitor_snapshots').select('*').then(rowsAs<CompetitorData['snapshots']>()),
    sb.from('competitor_radar').select('*').then(rowsAs<CompetitorData['nearby']>()),
    sb.from('competitor_settings').select('*').eq('id', 1).single().then(rowsAs<CompetitorData['settings']>()),
    sb.from('recipes').select('id, name, sell_price, active').then(rowsAs<{ id: string; name: string; sell_price: number | null; active: boolean }[]>()),
    sb.from('business').select('name, opening_hours').eq('id', 1).single().then(rowsAs<Pick<Business, 'name' | 'opening_hours'>>()),
  ])
  return { data: competitorRows({ competitors, items, prices, notes, snapshots, nearby, settings }),
    recipes: recipes.map(r => ({ ...r, sell_price: r.sell_price === null ? null : Number(r.sell_price) })), business }
}

/** Find a competitor (or the business itself) by id or (partial, case-insensitive) name. */
async function resolveCompetitor(sb: SupabaseClient, who: string): Promise<Pick<Competitor, 'id' | 'name' | 'is_self' | 'active' | 'features'>> {
  const rows = check(await sb.from('competitors').select('id, name, is_self, active, features')) as Pick<Competitor, 'id' | 'name' | 'is_self' | 'active' | 'features'>[]
  const q = who.trim().toLowerCase()
  const exact = rows.filter(c => c.id === who || c.name.toLowerCase() === q)
  const matches = exact.length ? exact : rows.filter(c => c.name.toLowerCase().includes(q))
  if (matches.length === 1) return matches[0]
  const followed = rows.filter(c => !c.is_self && c.active).map(c => c.name).join(', ') || 'none yet'
  if (!matches.length) throw new Error(`No competitor matches "${who}". Followed: ${followed}`)
  throw new Error(`"${who}" matches several: ${matches.map(c => c.name).join(', ')}`)
}

const enumOf = <T extends string>(list: { id: T }[]) => z.enum(list.map(x => x.id) as [T, ...T[]])
const FEATURE_KEYS = FEATURES.map(f => `${f.key} (${f.label})`).join(', ')

const partnerCan = (me: Profile, area: PartnerArea) => me.role === 'partner' && !!me.partner_access?.includes(area)
/** Pay rates and labour cost: admins with pay access, or payroll partners (read-only). */
const seesPay = (me: Profile) => (me.role === 'admin' && me.can_see_pay) || partnerCan(me, 'payroll')

async function team(sb: SupabaseClient): Promise<Profile[]> {
  const people = check(await sb.from('profiles').select(PROFILE_COLUMNS).not('role', 'in', '(kiosk,partner)')) as Profile[]
  if (people.length) return people
  // Partners only see their own profile row; with rota or payroll access they get names.
  return check(await sb.rpc('partner_team')) as Profile[]
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
    description: 'The signed-in person, their role (admin, employee, or partner = an outside business with read-only access to some areas) and the business name. Call this first.',
    partner: 'any',
    input: z.object({}),
    readOnly: true,
    async run({ sb, me }) {
      const b = check(await sb.from('business').select('name, timezone').eq('id', 1).single())
      return { name: me.full_name, email: me.email, role: me.role, can_see_pay: me.can_see_pay, business: b.name,
        ...(me.role === 'partner' ? { partner_company: me.partner_company, partner_can_see: ['business details', ...(me.partner_access ?? [])],
          partner_note: 'Read-only: you can look but not change anything.' } : {}),
        timezone: b.timezone, today: today(), note: 'Dates are YYYY-MM-DD, times are 24-hour local (Europe/Madrid).' }
    },
  }),

  // ---------------- Business ----------------
  tool({
    name: 'get_business_details',
    title: 'Business details',
    description: 'Address, phone, email, Instagram, website, opening hours, team channel, towns followed and notes.',
    partner: 'any',
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
    description: 'Admins: change contact details, team channel (whatsapp, slack, sms), towns followed, notes or opening hours. Only pass fields that change. Opening hours changes are pushed to Google Maps automatically within about a minute once Google is connected.',
    admin: true,
    input: z.object({
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      instagram: z.string().optional(),
      website: z.string().nullable().optional().describe('The business website, e.g. https://www.example.com/ (https:// is added if missing; null removes it)'),
      team_channel: z.enum(['whatsapp', 'slack', 'sms']).optional(),
      towns_followed: z.array(z.string()).optional(),
      notes: z.string().optional(),
      admin_notes: z.string().optional().describe('Admin-only notes (alarm code holder, wifi, landlord…)'),
      opening_hours: z.record(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
        z.object({ open: time, close: time }).nullable()).optional()
        .describe('Days to change, e.g. {"mon": {"open": "08:00", "close": "15:00"}, "sun": null} (null = closed)'),
    }),
    async run({ sb }, { admin_notes, opening_hours, ...patch }) {
      if (patch.website !== undefined) patch.website = cleanWebsite(patch.website)
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
    partner: ['rota', 'payroll'],
    input: z.object({}),
    readOnly: true,
    async run({ sb, me }) {
      const [people, rates] = await Promise.all([team(sb),
        sb.from('pay_rates').select('*').then(rowsAs<PayRate[]>())])
      const latest = new Map<string, number>()
      for (const r of rates.sort((a, b) => a.effective_from.localeCompare(b.effective_from))) latest.set(r.profile_id, Number(r.hourly_rate))
      return people.map(p => ({ name: p.full_name, role: p.role, active: p.active, email: p.email,
        ...(seesPay(me) ? { hourly_rate_eur: latest.get(p.id) ?? null } : {}) }))
    },
  }),

  // ---------------- Schedule ----------------
  tool({
    name: 'get_schedule',
    title: 'Rota',
    description: 'Shifts between two dates (default: this week), with open shifts and Spanish working-time warnings (breaks, 12h rest, opening hours, holidays).',
    partner: ['rota', 'payroll'],
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
    partner: ['rota', 'payroll'],
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
    partner: ['payroll'],
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
    partner: ['payroll'],
    input: z.object({ week_start: date.optional() }),
    async run({ sb, me }, { week_start }) {
      if (!seesPay(me)) throw new Error('You need pay access for labour costs')
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

  // ---------------- Time off ----------------
  tool({
    name: 'list_time_off',
    title: 'Time off',
    description: 'Holiday and time-off requests between two dates (default: next 90 days). Employees see their own plus approved time off of others; admins see all, including pending.',
    partner: ['rota', 'payroll'],
    input: z.object({ from: date.optional(), to: date.optional(), status: z.enum(['pending', 'approved', 'declined', 'cancelled']).optional() }),
    readOnly: true,
    async run({ sb }, a) {
      const start = a.from ?? today()
      let q = sb.from('time_off').select('*').lte('starts_on', a.to ?? addDays(start, 90)).gte('ends_on', start).order('starts_on')
      if (a.status) q = q.eq('status', a.status)
      const [rows, people] = await Promise.all([q.then(rowsAs<Record<string, any>[]>()), team(sb)])
      return rows.map(r => ({ request_id: r.id, person: people.find(p => p.id === r.profile_id)?.full_name, from: r.starts_on,
        to: r.ends_on, kind: r.kind, status: r.status, note: r.note, decision_note: r.decision_note }))
    },
  }),
  tool({
    name: 'request_time_off',
    title: 'Request time off',
    description: `Ask for holiday or other leave for yourself. Kinds: ${TIME_OFF_KINDS.join(', ')} (family: a relative's accident, serious illness or hospital stay; urgent: an urgent family reason). Sick, birth, family, bereavement and urgent can be for days already gone. An admin approves it.`,
    input: z.object({ from: date, to: date, kind: leaveKind.default('vacation'), note: z.string().optional() }),
    async run({ sb }, a) {
      check(await sb.rpc('request_time_off', { p_starts_on: a.from, p_ends_on: a.to, p_kind: a.kind, p_note: a.note ?? null }))
      return { ok: true, message: 'Request sent to the admins' }
    },
  }),
  tool({
    name: 'decide_time_off',
    title: 'Approve/decline time off',
    description: "Admins: approve or decline a time-off request. With release_shifts (default true), that person's shifts in the period become open shifts.",
    admin: true,
    input: z.object({ request_id: z.string().uuid(), approve: z.boolean(), note: z.string().optional(), release_shifts: z.boolean().default(true) }),
    async run({ sb }, a) {
      const n = check(await sb.rpc('decide_time_off', { p_id: a.request_id, p_approve: a.approve, p_note: a.note ?? null, p_release_shifts: a.release_shifts }))
      return { ok: true, shifts_released: n }
    },
  }),
  tool({
    name: 'record_time_off',
    title: 'Record leave for someone',
    description: `Admins: record leave for a team member, approved straight away (a sick note, birth leave, a bereavement). Kinds: ${TIME_OFF_KINDS.join(', ')}. With release_shifts (default true), their shifts in the period become open shifts.`,
    admin: true,
    input: z.object({ person: z.string().describe('Name of the team member'), from: date, to: date, kind: leaveKind, note: z.string().optional(),
      release_shifts: z.boolean().default(true) }),
    async run({ sb }, a) {
      const p = await resolvePerson(sb, a.person)
      const n = check(await sb.rpc('record_time_off', { p_profile_id: p.id, p_starts_on: a.from, p_ends_on: a.to, p_kind: a.kind,
        p_note: a.note ?? null, p_release_shifts: a.release_shifts }))
      return { ok: true, person: p.full_name, shifts_released: n }
    },
  }),
  tool({
    name: 'staff_benefits',
    title: 'Staff benefits',
    description: "What the team is entitled to by law in the business's country (holidays, public holidays, sick pay, birth leave, marriage, bereavement…), what the business gives on top, and each person's allocation for a year: holiday allowance, taken, booked and left, and the days of each other kind of leave. Employees get their own; admins and payroll partners everyone.",
    partner: ['payroll'],
    readOnly: true,
    input: z.object({ year: z.number().int().min(2000).max(2100).optional() }),
    async run({ sb, me }, a) {
      const year = a.year ?? Number(today().slice(0, 4))
      const [own, allowances, settings, off, people] = await Promise.all([
        sb.from('benefits').select('id, law_key, name, amount, details, sort').order('sort').then(rowsAs<Benefit[]>()),
        sb.from('leave_allowances').select('profile_id, year, holiday_days, note').eq('year', year).then(rowsAs<LeaveAllowance[]>()),
        sb.from('settings').select('vacation_days_per_year').eq('id', 1).single().then(rowsAs<Pick<Settings, 'vacation_days_per_year'>>()),
        sb.from('time_off').select('*').lte('starts_on', `${year}-12-31`).gte('ends_on', `${year}-01-01`).then(rowsAs<TimeOff[]>()),
        team(sb),
      ])
      const country = businessConfig.country
      const amountOf = (key: string, law: number | null) => key === 'holidays' ? settings.vacation_days_per_year : own.find(b => b.law_key === key)?.amount ?? law
      const who = me.role === 'employee' ? [me] : people.filter(p => p.active && (p.role === 'admin' || p.role === 'employee'))
      return {
        country: COUNTRY_NAME[country], law: LAW_CHECKED[country].source, law_checked_on: LAW_CHECKED[country].on,
        entitlements: ENTITLEMENTS[country].map(e => {
          const amount = amountOf(e.key, e.amount)
          return { name: e.name, in_law: e.term, article: e.law, allowance: e.allowance.replace('{n}', String(amount)), legal_minimum: e.amount,
            business_gives_more: amount !== e.amount, paid_by: PAYER_LABEL[e.payer], pay: e.pay, detail: e.detail,
            business_note: own.find(b => b.law_key === e.key)?.details ?? null }
        }),
        business_own_benefits: own.filter(b => !b.law_key).map(b => ({ name: b.name, details: b.details })),
        year,
        people: who.map(p => {
          const used = leaveYear(off, p.id, year, today())
          const allowance = allowances.find(x => x.profile_id === p.id)
          const holidays = allowance?.holiday_days ?? settings.vacation_days_per_year
          return { person: p.full_name, holiday_allowance: holidays, allowance_note: allowance?.note ?? null, holiday_taken: used.holidayTaken,
            holiday_booked: used.holidayBooked, holiday_left: holidays - used.holidayTaken - used.holidayBooked, other_leave_days: used.days }
        }),
      }
    },
  }),
  tool({
    name: 'roles_and_rules',
    title: 'Roles & responsibilities and staff rules',
    description: "Who does what in the business: each role (head barista, shop manager, chef…), what it's for, who it answers to, who's in it, its rota position and its duties, grouped as core responsibilities, also part of the role, or done at a set time (opening, during service, closing, every week). Then the staff rules (the house rules) in sections, when they last changed, and whether the person asking has confirmed reading them since; admins also get which employees have and haven't.",
    readOnly: true,
    input: z.object({}),
    async run({ sb, me }) {
      const [roles, sections, read, people, places] = await Promise.all([
        sb.from('job_roles').select('id, name, summary, position_id, reports_to, people, duties, sort, updated_at').then(rowsAs<JobRole[]>()),
        sb.from('staff_rules').select('id, title, intro, rules, sort, updated_at').then(rowsAs<RuleSection[]>()),
        sb.from('staff_rules_read').select('profile_id, read_at').then(rowsAs<RulesRead[]>()),
        team(sb),
        positions(sb),
      ])
      const name = (id: string) => people.find(p => p.id === id)?.full_name ?? null
      const changed = rulesChangedAt(sections)
      const mine = read.find(r => r.profile_id === me.id)
      return {
        roles: sortRoles(roles).map(r => ({
          role: r.name, what_its_for: r.summary, answers_to: roles.find(x => x.id === r.reports_to)?.name ?? null,
          on_the_rota_as: places.find(p => p.id === r.position_id)?.name ?? null, people: r.people.map(name).filter(Boolean),
          duties: Object.fromEntries(dutiesByWhen(r.duties).map(g => [g.id, g.duties])),
        })),
        rules: sortSections(sections).map(s => ({ section: s.title, intro: s.intro, rules: s.rules, last_changed: s.updated_at })),
        rules_last_changed: changed,
        you_confirmed_reading_them: { state: readState(mine, changed), on: mine?.read_at ?? null },
        ...(me.role === 'admin' ? {
          employees_reading: people.filter(p => p.active && p.role === 'employee').map(p => {
            const r = read.find(x => x.profile_id === p.id)
            return { person: p.full_name, state: readState(r, changed), confirmed_on: r?.read_at ?? null }
          }),
        } : {}),
      }
    },
  }),
  tool({
    name: 'send_rota_on_whatsapp',
    title: 'Send rota on WhatsApp',
    description: 'Admins: send each person their shifts for a week on WhatsApp (only staff who opted in). Ask the user to confirm first.',
    admin: true,
    input: z.object({ week_start: date, confirm: z.literal(true) }),
    async run({ sb }, { week_start }) {
      const n = check(await sb.rpc('send_rota', { p_week_start: weekStart(week_start) }))
      return { ok: true, people_messaged: n }
    },
  }),

  // ---------------- Calendar ----------------
  tool({
    name: 'list_calendar_events',
    title: 'Calendar',
    description: 'Holidays (national, regional, local, nearby towns), local events/ferias, football, business events and staff items between two dates.',
    partner: ['calendar'],
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

  // ---------------- Sports ----------------
  tool({
    name: 'list_sports_fixtures',
    title: 'Sports fixtures',
    description: 'Upcoming football (leagues, cups, national teams), rugby, UFC and boxing from the competitions the café follows, in UTC. big = likely a busy night (put it on the TV, plan staff).',
    input: z.object({
      from: z.string().describe('Start date YYYY-MM-DD'), to: z.string().describe('End date YYYY-MM-DD (inclusive)'),
      sport: z.enum(['football', 'rugby', 'ufc', 'boxing']).optional(), big_only: z.boolean().default(false),
    }),
    readOnly: true,
    async run({ sb }, a) {
      let q = sb.from('sports_events').select('starts_at, title, competition, sport, round, venue, city, status, big, sports_competitions!inner(name, followed)')
        .eq('sports_competitions.followed', true).gte('starts_at', `${a.from}T00:00:00Z`).lt('starts_at', `${addDays(a.to, 1)}T00:00:00Z`)
        .order('starts_at').limit(300)
      if (a.sport) q = q.eq('sport', a.sport)
      if (a.big_only) q = q.eq('big', true)
      return check(await q)
    },
  }),
  tool({
    name: 'list_sports_competitions',
    title: 'Sports competitions',
    description: 'Every competition the Sports page can show, whether the café follows it, and when it was last refreshed.',
    input: z.object({}),
    readOnly: true,
    async run({ sb }) {
      return check(await sb.from('sports_competitions').select('code, name, sport, region, kind, followed, refreshed_at, last_error').order('sort'))
    },
  }),
  tool({
    name: 'follow_sports_competition',
    title: 'Follow a competition',
    description: 'Admins: follow or stop following a competition on the Sports page (use a code from list_sports_competitions).',
    admin: true,
    input: z.object({ code: z.string(), followed: z.boolean() }),
    async run({ sb }, a) {
      const rows = check(await sb.from('sports_competitions').update({ followed: a.followed }).eq('code', a.code).select('code'))
      if (!rows?.length) throw new Error(`No competition with code ${a.code}`)
      return { ok: true }
    },
  }),

  // ---------------- Settings ----------------
  tool({
    name: 'get_settings',
    title: 'Clock-in rules',
    description: 'Clock-in enforcement and working-time limits (break rule, max hours, rest, approval day, employer cost multiplier).',
    partner: 'any',
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

  // ---------------- Alerts ----------------
  tool({
    name: 'get_alerts',
    title: 'Alerts',
    description: 'Admins: which WhatsApp alerts are switched on (shift reminders, missed clock-in, rota published, time off) and the most recent messages sent.',
    admin: true,
    readOnly: true,
    input: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
    async run({ sb }, { limit }) {
      const [s, sent] = await Promise.all([
        sb.from('settings').select('alert_shift_reminders, alert_missed_clock_in, alert_rota, alert_time_off').eq('id', 1).single().then(rowsAs<Record<string, boolean>>()),
        sb.from('outbox').select('kind, payload, status, attempts, last_error, created_at, sent_at').eq('kind', 'whatsapp')
          .order('created_at', { ascending: false }).limit(limit).then(rowsAs<Record<string, any>[]>()),
      ])
      return { switched_on: s, recent: sent.map(o => ({ template: o.payload?.template, status: o.status, attempts: o.attempts,
        error: o.last_error, queued: o.created_at, sent: o.sent_at })) }
    },
  }),
  tool({
    name: 'update_alerts',
    title: 'Switch alerts on/off',
    description: 'Admins: switch each kind of WhatsApp alert on or off. Only pass what changes.',
    admin: true,
    input: z.object({
      shift_reminders: z.boolean().optional(), missed_clock_in: z.boolean().optional(),
      rota_published: z.boolean().optional(), time_off: z.boolean().optional(),
    }),
    async run({ sb }, a) {
      const patch = Object.fromEntries(Object.entries({
        alert_shift_reminders: a.shift_reminders, alert_missed_clock_in: a.missed_clock_in,
        alert_rota: a.rota_published, alert_time_off: a.time_off,
      }).filter(([, v]) => v !== undefined))
      check(await sb.from('settings').update(patch).eq('id', 1))
      return { ok: true, updated: Object.keys(patch) }
    },
  }),

  // ---------------- Partners ----------------
  tool({
    name: 'list_partners',
    title: 'Partners',
    description: 'Admins: outside businesses with a read-only login (e.g. the gestoría), and which areas each can see.',
    admin: true,
    readOnly: true,
    input: z.object({}),
    async run({ sb }) {
      const rows = check(await sb.from('profiles').select(PROFILE_COLUMNS).eq('role', 'partner').order('full_name')) as Profile[]
      return rows.map(p => ({ partner_id: p.id, company: p.partner_company, name: p.full_name, email: p.email,
        can_see: ['business details', ...(p.partner_access ?? [])], active: p.active }))
    },
  }),
  tool({
    name: 'update_partner',
    title: 'Change partner access',
    description: 'Admins: change what a partner can see (areas: rota, payroll, finances, calendar; business details always), their company name, or remove/restore their access. New partners are invited from the Partners page.',
    admin: true,
    input: z.object({
      partner_id: z.string().uuid(), company: z.string().optional(),
      areas: z.array(z.enum(['rota', 'payroll', 'finances', 'calendar'])).optional(), active: z.boolean().optional(),
    }),
    async run({ sb }, a) {
      const cur = check(await sb.from('profiles').select(PROFILE_COLUMNS).eq('id', a.partner_id).eq('role', 'partner').maybeSingle()) as Profile | null
      if (!cur) throw new Error('No partner with that id')
      if (a.company !== undefined || a.areas) {
        check(await sb.rpc('set_partner_access', { p_id: a.partner_id, p_company: a.company ?? cur.partner_company ?? '',
          p_access: a.areas ?? cur.partner_access ?? [] }))
      }
      if (a.active !== undefined) check(await sb.from('profiles').update({ active: a.active }).eq('id', a.partner_id))
      return { ok: true }
    },
  }),

  // ---------------- Finances ----------------
  tool({
    name: 'list_expenses',
    title: 'Monthly expenses',
    description: 'Admins with pay access: the café’s recurring monthly costs (rent, wages, utilities, loan…) and the monthly total in euros. Expenses with active: false stay on the list but are not counted in the total.',
    admin: true,
    readOnly: true,
    partner: ['finances'],
    input: z.object({}),
    async run({ sb, me }) {
      if (!(me.role === 'admin' && me.can_see_pay) && !partnerCan(me, 'finances')) throw new Error('You need pay access to see finances')
      const rows = check(await sb.from('expenses').select('id, name, amount, category, notes, active').order('sort').order('name')) as Record<string, any>[]
      const active = rows.filter(r => r.active)
      return { expenses: rows.map(r => ({ expense_id: r.id, name: r.name, monthly_eur: +r.amount, category: r.category,
        notes: r.notes, active: r.active })), monthly_total_eur: +active.reduce((m, r) => m + +r.amount, 0).toFixed(2) }
    },
  }),
  tool({
    name: 'save_expense',
    title: 'Add/change expense',
    description: 'Admins with pay access: add a monthly expense, or change one (pass expense_id). Amounts are euros per month. active: false keeps it on the list but leaves it out of the monthly total.',
    admin: true,
    input: z.object({
      expense_id: z.string().uuid().optional(), name: z.string().min(1).optional(), monthly_eur: z.number().min(0).optional(),
      category: z.string().optional(), notes: z.string().optional(), active: z.boolean().optional(),
    }),
    async run({ sb, me }, { expense_id, monthly_eur, ...rest }) {
      if (!me.can_see_pay) throw new Error('You need pay access to change finances')
      const patch: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
      if (monthly_eur !== undefined) patch.amount = monthly_eur
      if (expense_id) {
        check(await sb.from('expenses').update(patch).eq('id', expense_id))
        return { ok: true, expense_id }
      }
      if (!patch.name || patch.amount === undefined) throw new Error('A new expense needs a name and monthly_eur')
      const row = check(await sb.from('expenses').insert({ ...patch, source: 'ai' }).select('id').single())
      return { ok: true, expense_id: row.id }
    },
  }),
  tool({
    name: 'delete_expense',
    title: 'Remove expense',
    description: 'Admins with pay access: remove a monthly expense. Ask the user to confirm first, then call with confirm: true.',
    admin: true,
    destructive: true,
    input: z.object({ expense_id: z.string().uuid(), confirm: z.literal(true) }),
    async run({ sb, me }, { expense_id }) {
      if (!me.can_see_pay) throw new Error('You need pay access to change finances')
      check(await sb.from('expenses').delete().eq('id', expense_id))
      return { ok: true }
    },
  }),

  // ---------------- Customers ----------------
  tool({
    name: 'list_customers',
    title: 'Customers and leads',
    description: 'Admins: the business’s customers (people who buy) and leads (people or businesses who might), for marketing. marketing_consent: true means they agreed to receive marketing; under GDPR only those may be sent offers or newsletters. Filter by kind, consent or a search word (name, email, phone, company, notes, tags).',
    admin: true,
    readOnly: true,
    input: z.object({
      kind: z.enum(['customer', 'lead']).optional(), marketing_consent_only: z.boolean().optional(), search: z.string().optional(),
    }),
    async run({ sb }, a) {
      const rows = check(await sb.from('customers').select('*').order('created_at', { ascending: false })) as Customer[]
      return rows.filter(c => (!a.kind || c.kind === a.kind) && (!a.marketing_consent_only || c.marketing_consent) && matchesSearch(c, a.search ?? ''))
        .map(({ id, created_at, updated_at: _u, ...c }) => ({ customer_id: id, ...c, added: localDate(created_at) }))
    },
  }),
  tool({
    name: 'save_customer',
    title: 'Add/change customer',
    description: 'Admins: add a customer or lead (a name, an email or a phone is needed), or change one (pass customer_id), e.g. kind: "customer" when a lead buys. Phone as "+34 600 000 000". Only set marketing_consent: true when the person really agreed to receive marketing (GDPR); the date is recorded.',
    admin: true,
    input: z.object({
      customer_id: z.string().uuid().optional(), kind: z.enum(['customer', 'lead']).optional(),
      first_name: z.string().optional(), last_name: z.string().optional(), email: z.string().email().optional(), phone: z.string().optional(),
      company: z.string().optional(), source: z.enum(['walk_in', 'instagram', 'facebook', 'tiktok', 'website', 'google', 'referral', 'event', 'square', 'other']).optional(),
      instagram: z.string().optional(), birthday: date.optional(), tags: z.array(z.string()).optional(), notes: z.string().optional(),
      marketing_consent: z.boolean().optional(), last_contacted_on: date.optional(),
    }),
    async run({ sb }, { customer_id, phone, last_contacted_on, ...rest }) {
      const patch: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
      if (phone !== undefined) patch.phone = cleanPhone(phone) ?? phone
      if (last_contacted_on) patch.last_contacted_at = zonedIso(last_contacted_on, '12:00')
      if (customer_id) {
        check(await sb.from('customers').update(patch).eq('id', customer_id))
        return { ok: true, customer_id }
      }
      const row = check(await sb.from('customers').insert(patch).select('id').single())
      return { ok: true, customer_id: row.id }
    },
  }),
  // ---------------- Competitors ----------------
  tool({
    name: 'list_competitors',
    title: 'Competitors',
    description: 'Admins: the cafés around the business followed on the Competitors page and how the business compares. Each competitor\'s kind, distance, how much it competes (threat), Google rating, reviews and new reviews a month, price level, what it offers and doesn\'t, opening hours, strengths, weaknesses and its latest prices; the basket item by item (the business\'s own price from Menu costing against the area\'s average and range); a price index (100 = the area average); recent price changes; the findings in plain words; notes and ideas to borrow; and places Google lists nearby that aren\'t followed. Prices in euros, IVA included.',
    admin: true,
    readOnly: true,
    input: z.object({ include_notes: z.boolean().default(true) }),
    async run({ sb }, a) {
      const { data, recipes, business } = await competitorData(sb)
      const now = today()
      const an = analyse(data, recipes, business.opening_hours, now)
      const offers = (c: Competitor, has: boolean) => FEATURES.filter(f => featuresOf(c)[f.key] === has).map(f => f.label)
      const rating = (c: Competitor) => an.ratings.find(r => r.competitor.id === c.id)
      const nameOf = (id: string | null) => (id ? data.competitors.find(c => c.id === id)?.name ?? '' : 'the area')
      const itemName = (id: string) => data.items.find(i => i.id === id)?.name ?? ''
      return {
        business: an.self && {
          name: business.name, google_rating: an.self.google_rating, google_reviews: an.self.google_count, reviews_per_month: rating(an.self)?.perMonth ?? null,
          price_level: priceLevelLabel(an.self.price_level), offers: offers(an.self, true), price_index: an.ourIndex.index,
        },
        competitors: an.rivals.map(c => ({
          competitor_id: c.id, name: c.name, kind: KINDS.find(k => k.id === c.kind)?.label, threat: c.threat, distance_m: c.distance_m, address: c.address,
          website: c.website, instagram: c.instagram ? `@${c.instagram}` : null, google_rating: c.google_rating, google_reviews: c.google_count,
          reviews_per_month: rating(c)?.perMonth ?? null, google_status: c.google_status, price_level: priceLevelLabel(c.price_level),
          price_index: an.rivalIndex.get(c.id)?.index ?? null, offers: offers(c, true), doesnt_offer: offers(c, false), opening_hours: hoursOf(c),
          strengths: c.strengths, weaknesses: c.weaknesses, notes: c.notes,
          latest_prices: data.items.flatMap(i => {
            const [last, before] = an.history.get(priceKey(c.id, i.id)) ?? []
            return last ? [{ item: i.name, price_eur: last.price, seen_on: last.observed_on, before_eur: before?.price ?? null }] : []
          }),
        })),
        basket: an.rows.map(r => ({ item: r.item.name, yours_eur: r.ours?.price ?? null, yours_from: r.ours ? (r.ours.from === 'menu' ? 'Menu costing' : 'typed in') : null,
          area_average_eur: r.avg, cheapest_eur: r.min, dearest_eur: r.max, places_with_a_price: r.n })),
        price_index: { yours: an.ourIndex.index, on_items: an.ourIndex.items, meaning: '100 is the area average; 110 is 10% dearer' },
        recent_price_changes: an.changes.slice(0, 20).map(ch => ({ competitor: nameOf(ch.competitor_id), item: itemName(ch.item_id), from_eur: ch.from, to_eur: ch.to, seen_on: ch.on })),
        findings: insights(an, { money: n => `€${n.toFixed(2)}`, rating: n => n.toFixed(1), label: l => l }).map(insightText),
        notes: a.include_notes ? data.notes.slice(0, 40).map(n => ({ note_id: n.id, about: nameOf(n.competitor_id), kind: n.kind, text: n.text, seen_on: n.observed_on,
          idea_status: n.status })) : undefined,
        nearby_not_followed: an.untracked.slice(0, 20).map(p => ({ name: p.name, distance_m: p.distance_m, google_rating: p.rating, google_reviews: p.review_count })),
      }
    },
  }),
  tool({
    name: 'save_competitor',
    title: 'Add/change competitor',
    description: `Admins: add a competitor by hand (name needed), or change one (pass competitor_id, or name to find it). Kinds: ${KINDS.map(k => k.id).join(', ')}. threat: how much it competes (${THREATS.map(t => t.id).join(', ')}). price_level 0-4 (Google's €-€€€€). offers sets what it offers or doesn't, by key: ${FEATURE_KEYS}. active: false stops following it (its history stays). Places on Google are best followed from the Competitors page (Find on Google): their rating, hours and what they offer then come from Google every week.`,
    admin: true,
    input: z.object({
      competitor_id: z.string().uuid().optional(), name: z.string().min(1).max(120).optional(), kind: enumOf(KINDS).optional(), threat: enumOf(THREATS).optional(),
      address: z.string().max(200).optional(), website: z.string().optional(), instagram: z.string().max(80).optional(), distance_m: z.number().int().min(0).optional(),
      price_level: z.number().int().min(0).max(4).optional(), strengths: z.string().max(2000).optional(), weaknesses: z.string().max(2000).optional(),
      notes: z.string().max(4000).optional(), offers: z.record(z.string(), z.boolean()).optional(), active: z.boolean().optional(),
    }),
    async run({ sb }, { competitor_id, offers, website, ...rest }) {
      const unknown = Object.keys(offers ?? {}).filter(k => !FEATURES.some(f => f.key === k))
      if (unknown.length) throw new Error(`Unknown offers: ${unknown.join(', ')}. Keys: ${FEATURES.map(f => f.key).join(', ')}`)
      const patch: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
      if (website !== undefined) patch.website = website ? cleanWebsite(website) ?? website : null
      // By id, or by its exact name: a name that only looks like another's ("Café") is a new one.
      const found = competitor_id ? await resolveCompetitor(sb, competitor_id)
        : (check(await sb.from('competitors').select('id, name, is_self, active, features')) as Pick<Competitor, 'id' | 'name' | 'is_self' | 'active' | 'features'>[])
          .find(c => c.name.toLowerCase() === rest.name?.trim().toLowerCase()) ?? null
      if (found) {
        if (offers) patch.features = { ...found.features, ...offers }
        if (found.is_self) delete patch.threat
        check(await sb.from('competitors').update(patch).eq('id', found.id))
        return { ok: true, competitor_id: found.id }
      }
      if (competitor_id || !rest.name) throw new Error('A new competitor needs a name')
      const row = check(await sb.from('competitors').insert({ threat: 'medium' satisfies Threat, kind: 'cafe' satisfies CompetitorKind, ...patch, features: offers ?? {} })
        .select('id').single())
      return { ok: true, competitor_id: row.id, added: true }
    },
  }),
  tool({
    name: 'record_competitor_price',
    title: 'Record a competitor\'s price',
    description: `Admins: a price seen at a competitor (or typed in for the business itself, for an item not on Menu costing), kept with the day so prices can be followed over time. The item is matched to the basket by name; a new one is added to the basket (and linked to the business's own menu item of the same name). Sources: ${PRICE_SOURCES.map(x => x.id).join(', ')}. Euros, IVA included.`,
    admin: true,
    input: z.object({
      competitor: z.string().describe('Name (or id) of the competitor'), item: z.string().min(1).max(80).describe('e.g. "Flat white"'), price_eur: z.number().min(0).max(999),
      seen_on: date.optional(), source: enumOf(PRICE_SOURCES).default('visit' satisfies PriceSource), note: z.string().max(300).optional(),
    }),
    async run({ sb }, a) {
      const c = await resolveCompetitor(sb, a.competitor)
      const items = check(await sb.from('competitor_items').select('id, name, sort')) as { id: string; name: string; sort: number }[]
      let item = items.find(i => i.name.toLowerCase() === a.item.trim().toLowerCase())
      let added = false
      if (!item) {
        const recipes = check(await sb.from('recipes').select('id, name, active')) as { id: string; name: string; active: boolean }[]
        item = check(await sb.from('competitor_items').insert({ name: a.item.trim(), recipe_id: matchRecipe(a.item, recipes)?.id ?? null,
          sort: Math.max(0, ...items.map(i => i.sort)) + 1 }).select('id, name, sort').single()) as { id: string; name: string; sort: number }
        added = true
      }
      check(await sb.from('competitor_prices').insert({ competitor_id: c.id, item_id: item.id, price: a.price_eur, observed_on: a.seen_on ?? today(),
        source: a.source, note: a.note ?? null }))
      return { ok: true, competitor: c.name, item: item.name, added_to_basket: added }
    },
  }),
  tool({
    name: 'add_competitor_note',
    title: 'Note about a competitor',
    description: `Admins: something seen or heard about a competitor (or the area as a whole: leave competitor out), kept on its timeline. Kinds: ${NOTE_KINDS.map(k => k.id).join(', ')}. An idea worth borrowing is kind "idea", with idea_status (${IDEA_STATUSES.map(s => s.id).join(', ')}; new by default).`,
    admin: true,
    input: z.object({
      competitor: z.string().optional().describe('Name (or id) of the competitor; none for the area'), kind: enumOf(NOTE_KINDS).default('visit' satisfies NoteKind),
      text: z.string().min(1).max(2000), seen_on: date.optional(), idea_status: enumOf(IDEA_STATUSES).optional(),
    }),
    async run({ sb }, a) {
      const c = a.competitor ? await resolveCompetitor(sb, a.competitor) : null
      const row = check(await sb.from('competitor_notes').insert({ competitor_id: c?.id ?? null, kind: a.kind, text: a.text, observed_on: a.seen_on ?? today(),
        status: a.kind === 'idea' ? a.idea_status ?? ('new' satisfies IdeaStatus) : null }).select('id').single())
      return { ok: true, note_id: row.id, about: c?.name ?? 'the area' }
    },
  }),
]

/** Tools available to this person: employees don't see admin tools; partners only get read-only tools for their areas. */
export const toolsFor = (me: Profile) => me.role === 'partner'
  ? TOOLS.filter(t => t.readOnly && (t.partner === 'any' || (t.partner ?? []).some(a => partnerCan(me, a))))
  : TOOLS.filter(t => !t.admin || me.role === 'admin')

export async function loadMe(sb: SupabaseClient, accessToken: string): Promise<Profile> {
  const { data: user } = await sb.auth.getUser(accessToken)
  if (!user.user) throw new Error('Session expired. Sign in again.')
  const me = check(await sb.from('profiles').select(PROFILE_COLUMNS).eq('id', user.user.id).single()) as Profile
  if (!me.active || me.role === 'kiosk') throw new Error('This account cannot use the API')
  if (me.role === 'partner' && !me.partner_access) me.partner_access = []
  return me
}

export async function runTool(t: ToolDef, ctx: ToolContext, raw: unknown) {
  if (ctx.me.role === 'partner') {
    if (!toolsFor(ctx.me).includes(t)) throw new Error('Partner access is read-only and limited to the areas Easy Beans gave you')
  } else if (t.admin && ctx.me.role !== 'admin') throw new Error('Only admins can do that')
  const parsed = t.input.safeParse(raw ?? {})
  if (!parsed.success) throw new Error(parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '))
  return t.run(ctx, parsed.data)
}
