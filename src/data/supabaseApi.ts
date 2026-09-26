import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Api } from './api'
import type { Business, Expense, OutboxItem, Profile, Settings, TimeEntry, TimeOff } from '../../shared/types'

const PROFILE_COLUMNS = 'id, full_name, email, role, can_see_pay, colour, active, phone, birth_date, whatsapp_opt_in, partner_company, partner_access'

/** Throw the Postgres error message (our SQL functions raise human-readable ones). */
function check<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message)
  return res.data as NonNullable<T>
}
function checkAuth(res: { error: { message: string } | null }) {
  if (res.error) throw new Error(res.error.message)
}

/** Sign in from a link: ?code= (Google/Microsoft, PKCE) or #access_token (email invite/reset). */
export async function sessionFromUrl(sb: SupabaseClient) {
  const query = new URLSearchParams(location.search)
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
  const tidy = (keys: string[]) => {
    keys.forEach(k => query.delete(k))
    const rest = query.toString()
    history.replaceState(history.state, '', `${location.pathname}${rest ? `?${rest}` : ''}`)
  }
  const failed = hash.get('error_description') ?? query.get('error_description')
  if (failed) {
    tidy(['error', 'error_code', 'error_description'])
    throw new Error(/expired|invalid/i.test(failed) ? 'That sign-in link has expired or was already used. Ask for a new one.' : failed)
  }
  const code = query.get('code')
  if (code) {
    tidy(['code'])
    const { error } = await sb.auth.exchangeCodeForSession(code)
    if (error) throw new Error(error.message)
    return
  }
  const access_token = hash.get('access_token'), refresh_token = hash.get('refresh_token')
  if (access_token && refresh_token) {
    tidy([])
    const { error } = await sb.auth.setSession({ access_token, refresh_token })
    if (error) throw new Error(error.message)
  }
}

export function createSupabaseApi(url: string, key: string): Api {
  const sb: SupabaseClient = createClient(url, key, {
    // PKCE for Google/Microsoft sign-in (a one-time ?code= comes back). Links in Supabase emails
    // (invites, password resets sent by an admin) carry #access_token instead, which the PKCE
    // client refuses, so the URL is handled here for both.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
  })
  let urlError: string | null = null
  const fromUrl = sessionFromUrl(sb).catch(e => { urlError = e instanceof Error ? e.message : String(e) })

  // Supabase answers a sign-in redirect for a provider that is off with a bare 400 page, so ask first.
  let methods: Promise<{ google: boolean; microsoft: boolean }> | null = null
  const signInMethods = () => methods ??= fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
    .then(r => r.ok ? r.json() : Promise.reject(new Error(`settings ${r.status}`)))
    .then((s: { external?: Record<string, boolean> }) => ({ google: !!s.external?.google, microsoft: !!s.external?.azure }))
    .catch(() => { methods = null; return { google: true, microsoft: true } }) // unknown: let Supabase decide

  /** Sign in through Supabase with an outside account. Supabase handles the whole OAuth flow. */
  const oauth = async (provider: 'google' | 'azure', label: string, queryParams: Record<string, string>, scopes?: string) => {
    const on = await signInMethods()
    if (!(provider === 'google' ? on.google : on.microsoft)) {
      throw new Error(`${label} sign-in is not switched on yet. Use your email and password for now.`)
    }
    const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin, queryParams, scopes } })
    if (error) {
      throw new Error(/provider is not enabled|unsupported provider/i.test(error.message)
        ? `${label} sign-in is not switched on yet. Use your email and password for now.`
        : error.message)
    }
  }

  const uid = async () => { await fromUrl; return (await sb.auth.getSession()).data.session?.user.id ?? null }

  /** Call the Worker's admin endpoints with the signed-in person's token. */
  const worker = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const token = (await sb.auth.getSession()).data.session?.access_token
    const res = await fetch(path, { ...init, headers: { authorization: `Bearer ${token}`,
      ...(init.body && typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}), ...init.headers } })
    const json = await res.json().catch(() => ({})) as T & { error?: string }
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`)
    return json
  }

  const api: Api = {
    mode: 'live',

    currentUserId: uid,
    authError: () => urlError,
    signInMethods,
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
    async sendSignInCode(email) {
      const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } })
      if (error) throw new Error(/signups? not allowed|not found|user/i.test(error.message)
        ? 'No invited account uses this email. Ask an admin to invite you.'
        : /rate|seconds|too many/i.test(error.message) ? 'A code was sent a moment ago. Wait a minute, then try again.' : error.message)
    },
    async verifySignInCode(email, code) {
      const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.replace(/\D/g, ''), type: 'email' })
      if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Send a new one.' : error.message)
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
      const team = check(await sb.from('profiles').select(PROFILE_COLUMNS).not('role', 'in', '(kiosk,partner)').order('full_name')) as Profile[]
      if (team.length) return team
      // Partners only see their own profile row; with rota or payroll access they get names from partner_team().
      const names = check(await sb.rpc('partner_team')) as Pick<Profile, 'id' | 'full_name' | 'colour' | 'role' | 'active'>[]
      return names.map(p => ({ ...p, email: null, can_see_pay: false, phone: null, birth_date: null }))
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

    async fillFromRota(monday) {
      return check(await sb.rpc('fill_timecards_from_rota', { p_week_start: monday })) as number
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

    async partners() {
      return check(await sb.from('profiles').select(PROFILE_COLUMNS).eq('role', 'partner').order('full_name')) as Profile[]
    },
    async invitePartner(email, fullName, company, access) {
      const token = (await sb.auth.getSession()).data.session?.access_token
      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, full_name: fullName, role: 'partner', partner_company: company, partner_access: access }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Invite failed')
    },
    async setPartnerAccess(id, company, access) {
      check(await sb.rpc('set_partner_access', { p_id: id, p_company: company, p_access: access }))
    },

    async timeOff(fromDate, toDate) {
      return check(await sb.from('time_off').select('*').lte('starts_on', toDate).gte('ends_on', fromDate)
        .order('starts_on')) as TimeOff[]
    },
    async vacationDaysUsed(profileId, year) {
      return check(await sb.rpc('vacation_days_used', { p_profile_id: profileId, p_year: year })) as number
    },
    async requestTimeOff(startsOn, endsOn, kind, note) {
      check(await sb.rpc('request_time_off', { p_starts_on: startsOn, p_ends_on: endsOn, p_kind: kind, p_note: note || null }))
    },
    async cancelTimeOff(id) { check(await sb.rpc('cancel_time_off', { p_id: id })) },
    async decideTimeOff(id, approve, note, releaseShifts = true) {
      return check(await sb.rpc('decide_time_off', { p_id: id, p_approve: approve, p_note: note ?? null, p_release_shifts: releaseShifts })) as number
    },

    signInWithGoogle: () => oauth('google', 'Google', { prompt: 'select_account' }),
    // Supabase calls Microsoft (Outlook / Microsoft 365 / Entra ID) "azure".
    signInWithMicrosoft: () => oauth('azure', 'Microsoft', { prompt: 'select_account' }, 'openid email profile'),

    async expenses() {
      return check(await sb.from('expenses').select('*').order('sort').order('name')) as Expense[]
    },
    async saveExpense(e) {
      const row = { name: e.name.trim(), amount: e.amount, category: e.category ?? null, notes: e.notes ?? null,
        active: e.active ?? true, ...(e.sort !== undefined ? { sort: e.sort } : {}) }
      if (e.id) check(await sb.from('expenses').update(row).eq('id', e.id))
      else check(await sb.from('expenses').insert({ ...row, source: 'app' }))
    },
    async deleteExpense(id) { check(await sb.from('expenses').delete().eq('id', id)) },
    async sentAlerts(limit = 50) {
      return check(await sb.from('outbox').select('*').order('created_at', { ascending: false }).limit(limit)) as OutboxItem[]
    },

    integrations: () => worker('/api/integrations'),
    async connectGoogle() {
      const { url } = await worker<{ url: string }>('/api/integrations/google/start', { method: 'POST' })
      location.assign(url)
    },
    async chooseGoogleListing(loc, closedOnHolidays) {
      await worker('/api/integrations/google/location', { method: 'POST',
        body: JSON.stringify({ location: loc ?? undefined, closed_on_holidays: closedOnHolidays }) })
    },
    async syncGoogleNow() { await worker('/api/integrations/google/sync', { method: 'POST' }) },
    async googleHours() { return (await worker<{ opening_hours: never }>('/api/integrations/google/hours')).opening_hours },
    async disconnect(provider) { await worker(`/api/integrations/${provider}/disconnect`, { method: 'POST' }) },
    async whatsappTest(to) { await worker('/api/integrations/whatsapp/test', { method: 'POST', body: JSON.stringify({ to }) }) },
    instagramProfile: () => worker('/api/integrations/instagram/profile'),
    async uploadPhoto(file) {
      return (await worker<{ url: string }>('/api/integrations/media', { method: 'POST', body: file,
        headers: { 'content-type': file.type } })).url
    },
    async share(caption, imageUrl, targets, eventId) {
      return check(await sb.rpc('queue_share', { p_caption: caption, p_image_url: imageUrl, p_targets: targets,
        p_event_id: eventId ?? null })) as number
    },
    async connectSpotify() {
      const { url } = await worker<{ url: string }>('/api/integrations/spotify/start', { method: 'POST' })
      location.assign(url)
    },
    spotifyPlaylists: () => worker('/api/integrations/spotify/playlists'),
    async chooseSpotifyPlaylist(playlist) {
      await worker('/api/integrations/spotify/playlist', { method: 'POST', body: JSON.stringify({ playlist }) })
    },
    musicNow: () => worker('/api/music/now'),
    async musicPlay() { await worker('/api/music/play', { method: 'POST' }) },
    async musicPause() { await worker('/api/music/pause', { method: 'POST' }) },
    async sendRota(monday) {
      return check(await sb.rpc('send_rota', { p_week_start: monday })) as number
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
