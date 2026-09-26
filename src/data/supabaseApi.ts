import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Api } from './api'
import type { Business, Settings, TimeEntry } from '../../shared/types'

const PROFILE_COLUMNS = 'id, full_name, email, role, can_see_pay, colour, active, phone, birth_date'

/** Throw the Postgres error message (our SQL functions raise human-readable ones). */
function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message)
  return res.data as NonNullable<T>
}
function checkAuth(res: { error: { message: string } | null }) {
  if (res.error) throw new Error(res.error.message)
}

export function createSupabaseApi(url: string, key: string): Api {
  const sb: SupabaseClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })

  const uid = async () => (await sb.auth.getSession()).data.session?.user.id ?? null

  const api: Api = {
    mode: 'live',

    currentUserId: uid,
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange(() => cb())
      return () => data.subscription.unsubscribe()
    },
    async signIn(email, password) {
      checkAuth(await sb.auth.signInWithPassword({ email, password }))
    },
    async signOut() {
      await sb.auth.signOut()
    },
    async sendPasswordReset(email) {
      checkAuth(await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/account` }))
    },
    async updatePassword(password) {
      checkAuth(await sb.auth.updateUser({ password }))
    },

    async me() {
      const id = await uid()
      if (!id) return null
      return check(await sb.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle())
    },
    async business() {
      return check(await sb.from('business').select('*').eq('id', 1).single()) as Business
    },
    async adminNotes() {
      const row = check(await sb.from('business_admin_notes').select('notes').eq('id', 1).maybeSingle())
      return row?.notes ?? null
    },
    async settings() {
      return check(await sb.from('settings').select('*').eq('id', 1).single()) as Settings
    },
    async profiles() {
      return check(await sb.from('profiles').select(PROFILE_COLUMNS).neq('role', 'kiosk').order('full_name'))
    },
    async positions() {
      return check(await sb.from('positions').select('*').order('sort'))
    },
    async breakTypes() {
      return check(await sb.from('break_types').select('*').eq('active', true).order('id'))
    },
    async payRates() {
      return check(await sb.from('pay_rates').select('*'))
    },
    async shifts(fromIso, toIso) {
      return check(await sb.from('shifts').select('*')
        .gte('starts_at', fromIso).lt('starts_at', toIso).order('starts_at'))
    },
    async timeEntries(fromIso, toIso) {
      return check(await sb.from('time_entry_totals').select('*')
        .gte('clock_in', fromIso).lt('clock_in', toIso).order('clock_in')) as TimeEntry[]
    },
    async clockState() {
      const id = await uid()
      if (!id) return { entry: null, openBreak: null }
      const entry = check(await sb.from('time_entry_totals').select('*')
        .eq('profile_id', id).is('clock_out', null).maybeSingle()) as TimeEntry | null
      if (!entry) return { entry: null, openBreak: null }
      const openBreak = check(await sb.from('breaks').select('*')
        .eq('time_entry_id', entry.id).is('ended_at', null).maybeSingle())
      return { entry, openBreak }
    },
    async events(fromDate, toDate) {
      return check(await sb.from('calendar_events').select('*')
        .lte('starts_on', toDate)
        .or(`ends_on.gte.${fromDate},and(ends_on.is.null,starts_on.gte.${fromDate})`)
        .order('starts_on'))
    },
    async corrections() {
      return check(await sb.from('correction_requests').select('*').order('created_at', { ascending: false }))
    },
    async entryChanges(entryId) {
      return check(await sb.from('time_entry_changes').select('*')
        .eq('time_entry_id', entryId).order('changed_at'))
    },

    async clockIn(positionId) {
      check(await sb.rpc('clock_in', { p_position_id: positionId ?? null }))
    },
    async clockOut() {
      const row = check(await sb.rpc('clock_out')) as { id: string }
      return check(await sb.from('time_entry_totals').select('*').eq('id', row.id).single()) as TimeEntry
    },
    async startBreak(breakTypeId) {
      check(await sb.rpc('start_break', { p_break_type_id: breakTypeId ?? null }))
    },
    async endBreak() {
      check(await sb.rpc('end_break'))
    },
    async editEntry(id, clockIn, clockOut, reason) {
      check(await sb.rpc('edit_time_entry', {
        p_entry_id: id, p_clock_in: clockIn, p_clock_out: clockOut, p_reason: reason,
      }))
    },
    async addEntry(profileId, clockIn, clockOut, reason, positionId) {
      check(await sb.rpc('add_time_entry', {
        p_profile_id: profileId, p_clock_in: clockIn, p_clock_out: clockOut,
        p_reason: reason, p_position_id: positionId ?? null,
      }))
    },
    async requestCorrection(entryId, clockIn, clockOut, note) {
      check(await sb.rpc('request_correction', {
        p_entry_id: entryId, p_clock_in: clockIn, p_clock_out: clockOut, p_note: note,
      }))
    },
    async decideCorrection(id, approve, note) {
      check(await sb.rpc('decide_correction', { p_request_id: id, p_approve: approve, p_note: note ?? null }))
    },
    async approveWeek(monday) {
      return check(await sb.rpc('approve_week', { p_week_start: monday })) as number
    },

    async saveShift(shift) {
      const { id, ...rest } = shift
      if (id) check(await sb.from('shifts').update(rest).eq('id', id))
      else check(await sb.from('shifts').insert(rest))
    },
    async deleteShift(id) {
      check(await sb.from('shifts').delete().eq('id', id))
    },
    async takeOpenShift(id) {
      check(await sb.rpc('take_open_shift', { p_shift_id: id }))
    },

    async saveEvent(event) {
      const { id, ...rest } = event
      if (id) check(await sb.from('calendar_events').update(rest).eq('id', id))
      else check(await sb.from('calendar_events').insert({ ...rest, source: 'admin' }))
    },
    async deleteEvent(id) {
      check(await sb.from('calendar_events').delete().eq('id', id))
    },

    async updateBusiness(patch) {
      check(await sb.from('business').update(patch).eq('id', 1))
    },
    async updateAdminNotes(notes) {
      check(await sb.from('business_admin_notes').update({ notes }).eq('id', 1))
    },
    async updateSettings(patch) {
      check(await sb.from('settings').update(patch).eq('id', 1))
    },
    async updateProfile(id, patch) {
      check(await sb.from('profiles').update(patch).eq('id', id))
    },
    async setPin(pin, profileId) {
      check(await sb.rpc('set_pin', { p_pin: pin, p_profile_id: profileId ?? null }))
    },
    async setPayRate(profileId, hourlyRate) {
      check(await sb.from('pay_rates').upsert({
        profile_id: profileId, hourly_rate: hourlyRate,
        effective_from: new Date().toISOString().slice(0, 10),
      }))
    },
    async invite(email, fullName, role) {
      const token = (await sb.auth.getSession()).data.session?.access_token
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, full_name: fullName, role }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Invite failed')
    },

    async kioskRoster() {
      return check(await sb.rpc('kiosk_roster'))
    },
    async kioskPunch(profileId, pin, action, positionId, breakTypeId) {
      return check(await sb.rpc('kiosk_punch', {
        p_profile_id: profileId, p_pin: pin, p_action: action,
        p_position_id: positionId ?? null, p_break_type_id: breakTypeId ?? null,
      }))
    },
  }
  return api
}
