import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { PromptError, SOCIAL_PROVIDERS, type AiTrackResult, type Api, type BillingInfo, type MusicStatus, type PlanStatus, type SignInMethods, type SocialProvider } from './api'
import type { ApiKey, AppNotification, Brand, Business, Customer, SocialPost, EventAlert, Expense, Integration, MusicPlaylist, OutboxItem, Profile, Settings, TimeEntry, TimeOff, Todo, TodoCategory, CafeTrack, MusicPlayerState } from '../../shared/types'
import type { HolidayReminder, PushDevice } from '../../shared/types'
import type { AiMusicQuote, MusicGeneration, MusicTrack } from '../../shared/types'
import type { InstagramMention } from '../../shared/mentions'
import type { FilingRecord, TaxDocument, TaxSettings } from '../../shared/tax'
import type { Invoice } from '../../shared/invoices'
import type { Licence } from '../../shared/licences'
import type { KeptDocument } from '../../shared/documents'
import type { MoneyItem } from '../../shared/creditDebit'
import { DEFAULT_RADIUS, competitorRows, type CompetitorData } from '../../shared/localCompetitors'
import type { LegalDocument, LegalSource, StorageListing } from '../../shared/legalDocs'
import { BRAND_COLUMNS, brandTitleOf, uploadProblem, type BrandDocument } from '../../shared/brandDocs'
import type { Benefit, LeaveAllowance } from '../../shared/benefits'
import type { LoggedReward, RepPageData, RepReward, RepSettings, RewardRule, SalesRep } from '../../shared/reps'
import type { KittyEntry, KittyGoal } from '../../shared/kitty'
import type { JobRole } from '../../shared/roles'
import type { RoleOwner } from '../../shared/roleOwners'
import type { RuleSection, RulesRead } from '../../shared/staffRules'
import type { Pet } from '../../shared/pets'
import type { QrCode } from '../../shared/qrCodes'
import type { Coffee, DayTheme, ThemeDate } from '../../shared/themeDays'
import type { RoutineDone, RoutineItem } from '../../shared/routine'
import type { Contractor, OutsourcedJob } from '../../shared/outsourcing'
import type { EmploymentContract, SalaryPer } from '../../shared/contracts'
import { DEFAULT_VAT_RATE, type PnlLine, type PnlSettings } from '../../shared/pnl'
import type { GiftCard, GiftCards, LoyaltyState } from '../../shared/loyalty'
import type { StockItem, StockMovement, Supplier, StockPrice } from '../../shared/stock'
import type { Recipe } from '../../shared/recipes'
import type { MenuDesign, MenuImage, MenuItem } from '../../shared/menu'
import { missingFrom, templateDesigns, templateSections } from '../../shared/menuTemplate'
import type { DisplayFeed, Screen } from '../../shared/screens'
import type { Offer } from '../../shared/offers'
import type { LastDayRule } from '../../shared/lastDayOffers'
import type { Camera, CameraClip, CameraLive, CameraService } from '../../shared/cameras'
import type { AdSettings } from '../../shared/ads'
import type { SportsCompetition, SportsEvent, SportsFavourite } from '../../shared/sports'
import type { ReferralState } from '../../shared/referrals'
import { newEntries, type Competition, type CompetitionEntry } from '../../shared/competitions'
import { readyPhoto } from '../lib/media'
import { cleanWebsite } from '../../shared/connections'
import { cleanAnswers, type GrantApplication } from '../../shared/grants'
import { SOURCE_FOR, type Enquiry } from '../../shared/leads'
import type { ExpenseClaim } from '../../shared/claims'
import type { Campaign } from '../../shared/campaigns'
import type { Applicant, JobOpening } from '../../shared/hiring'
import { CV_COLUMNS, cvProblem, type ApplicantCv } from '../../shared/hiring'
import type { SafetyCheck, SafetyPoint } from '../../shared/foodSafety'
import type { MenuAllergens } from '../../shared/allergens'
import type { TipPool } from '../../shared/tips'
import { addDays, zonedIso } from '../../shared/time'

const PROFILE_COLUMNS = 'id, business_id, full_name, email, role, can_see_pay, colour, active, phone, birth_date, whatsapp_opt_in, partner_company, partner_access, preferences, on_rota, on_people'

const GRANT_APPLICATION_COLUMNS = 'id, grant_id, grant_name, stage, submitted_on, expediente, amount_requested, amount_awarded, amount_received, deadline, deadline_label, notes, docs_done, obligations_done, created_at, updated_at'

const MENU_IMAGE_COLUMNS = 'id, design_id, item_id, url, source, model, prompt, edit_of, status, error, stored, created_at'
const TRACK_COLUMNS = 'id, source, title, artist, url, duration_s, bpm, energy, moods, genre, vocals, highlight_s, waveform, licence, saved, hidden, created_at'

const CUSTOMER_COLUMNS = 'id, kind, first_name, last_name, email, phone, company, source, instagram, birthday, tags, notes, marketing_consent, consent_at, last_contacted_at, created_at, updated_at'
const REP_COLUMNS = 'id, name, kind, profile_id, customer_id, code, instagram, phone, email, notes, active, created_at, created_by'
const REP_REACH_COLUMNS = 'tiktok, youtube, facebook, instagram_followers, tiktok_followers, youtube_followers, facebook_followers, community, reach, picture_url, followers_checked_at, leader_id, approved'
const REWARD_COLUMNS = 'id, rep_id, kind, rule_id, label, sale_amount, amount, status, proof_url, mention_id, note, occurred_on, logged_by, created_at, bonus_for, multiplier'


/** Postgres numeric can come back as text: a number, or null. */
const num = (v: unknown) => (v == null ? null : Number(v))

/** A file as a data: URL, to keep it in a text column. */
const dataUrlOf = (file: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result))
  r.onerror = () => reject(new Error('Could not read that file'))
  r.readAsDataURL(file)
})

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

// Supabase's names for the sign-in providers (Microsoft accounts go through "azure").
const SUPABASE_PROVIDER = { google: 'google', apple: 'apple', facebook: 'facebook', microsoft: 'azure' } as const
const OAUTH: Record<SocialProvider, { label: string; queryParams?: Record<string, string>; scopes?: string }> = {
  google: { label: 'Google', queryParams: { prompt: 'select_account' } },
  apple: { label: 'Apple' },
  facebook: { label: 'Facebook', scopes: 'email public_profile' },
  microsoft: { label: 'Microsoft', queryParams: { prompt: 'select_account' }, scopes: 'openid email profile' },
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
  let methods: Promise<SignInMethods> | null = null
  const signInMethods = () => methods ??= fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
    .then(r => r.ok ? r.json() : Promise.reject(new Error(`settings ${r.status}`)))
    .then((s: { external?: Record<string, boolean>; disable_signup?: boolean }) => ({
      ...Object.fromEntries(SOCIAL_PROVIDERS.map(p => [p, !!s.external?.[SUPABASE_PROVIDER[p]]])) as Record<SocialProvider, boolean>,
      signup: !s.disable_signup,
    }))
    .catch(() => { methods = null; return { google: true, apple: false, facebook: false, microsoft: true, signup: true } }) // unknown: let Supabase decide

  /** Sign in through Supabase with an outside account. Supabase handles the whole OAuth flow. */
  const oauth = async (provider: SocialProvider) => {
    const { label, queryParams, scopes } = OAUTH[provider]
    if (!(await signInMethods())[provider]) {
      throw new Error(`${label} sign-in is not switched on yet. Use your email for now.`)
    }
    const { error } = await sb.auth.signInWithOAuth({ provider: SUPABASE_PROVIDER[provider], options: { redirectTo: location.origin, queryParams, scopes } })
    if (error) {
      throw new Error(/provider is not enabled|unsupported provider/i.test(error.message)
        ? `${label} sign-in is not switched on yet. Use your email for now.`
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
      // Run after this callback returns: Supabase holds its auth lock while calling it, so queries
      // started from inside it would wait on that lock.
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        const id = session?.user.id ?? null
        setTimeout(() => cb(id), 0)
      })
      return () => data.subscription.unsubscribe()
    },
    async signUp(fullName, email, password) {
      const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() }, emailRedirectTo: location.origin } })
      if (error) throw new Error(/already registered/i.test(error.message) ? 'That email already has an account. Sign in instead.' : error.message)
      return { confirmEmail: !data.session }
    },
    async createBusiness(b) {
      return check(await sb.rpc('create_business', { p_name: b.name, p_kind: b.kind, p_timezone: b.timezone, p_referral: b.referral ?? null })) as number
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
      // Only the person's own business is there to read (row security).
      return check(await sb.from('business').select('*').single()) as Business
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
      // A website typed without https:// gets it (the database takes http(s) addresses only).
      const { data: business } = await sb.rpc('current_business_id')
      check(await sb.from('business').update('website' in patch ? { ...patch, website: cleanWebsite(patch.website) } : patch).eq('id', business as number))
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
    async invite(email, fullName, role, password, contact) {
      return worker<{ joined?: boolean }>('/api/admin/invite', { method: 'POST', body: JSON.stringify({ email, full_name: fullName, role, password, ...contact }) })
    },
    async setTemporaryPassword(userId, password) {
      await worker('/api/admin/set-password', { method: 'POST', body: JSON.stringify({ user_id: userId, password }) })
    },

    async partners() {
      return check(await sb.from('profiles').select(PROFILE_COLUMNS).eq('role', 'partner').order('full_name')) as Profile[]
    },
    async invitePartner(email, fullName, company, access, password) {
      return worker<{ joined?: boolean }>('/api/admin/invite', { method: 'POST', body: JSON.stringify({
        email, full_name: fullName, role: 'partner', partner_company: company, partner_access: access, password }) })
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
    async recordTimeOff(profileId, startsOn, endsOn, kind, note) {
      return check(await sb.rpc('record_time_off', { p_profile_id: profileId, p_starts_on: startsOn, p_ends_on: endsOn, p_kind: kind, p_note: note || null })) as number
    },

    async benefits() {
      const rows = check(await sb.from('benefits').select('id, law_key, name, amount, details, sort').order('sort').order('created_at')) as Benefit[]
      return rows.map(b => ({ ...b, amount: b.amount === null ? null : Number(b.amount) }))
    },
    async saveBenefit({ id, ...b }) {
      if (id) check(await sb.from('benefits').update(b).eq('id', id))
      else check(await sb.from('benefits').insert(b))
    },
    async deleteBenefit(id) { check(await sb.from('benefits').delete().eq('id', id)) },
    async leaveAllowances(year) {
      const rows = check(await sb.from('leave_allowances').select('profile_id, year, holiday_days, note').eq('year', year)) as LeaveAllowance[]
      return rows.map(a => ({ ...a, holiday_days: Number(a.holiday_days) }))
    },
    async saveLeaveAllowance({ profile_id, year, holiday_days, note }) {
      if (holiday_days === null) check(await sb.from('leave_allowances').delete().eq('profile_id', profile_id).eq('year', year))
      else check(await sb.from('leave_allowances').upsert({ profile_id, year, holiday_days, note: note?.trim() || null }))
    },

    async jobRoles() {
      return check(await sb.from('job_roles').select('id, name, summary, position_id, reports_to, people, duties, sort, updated_at, permissions, template, active')
        .order('sort').order('name')) as JobRole[]
    },
    async saveJobRole({ id, ...r }) {
      if (id) check(await sb.from('job_roles').update(r).eq('id', id))
      else check(await sb.from('job_roles').insert(r))
    },
    async deleteJobRole(id) { check(await sb.from('job_roles').delete().eq('id', id)) },
    async roleOwners() {
      return check(await sb.from('job_roles').select('id, owned_by, owner_sort')) as RoleOwner[]
    },
    async saveRoleOwners(changes) {
      for (const c of changes) check(await sb.from('job_roles').update({ owned_by: c.owned_by, owner_sort: c.owner_sort }).eq('id', c.id))
    },
    async ruleSections() {
      return check(await sb.from('staff_rules').select('id, title, intro, rules, sort, updated_at').order('sort').order('title')) as RuleSection[]
    },
    async saveRuleSection({ id, ...s }) {
      if (id) check(await sb.from('staff_rules').update(s).eq('id', id))
      else check(await sb.from('staff_rules').insert(s))
    },
    async deleteRuleSection(id) { check(await sb.from('staff_rules').delete().eq('id', id)) },
    async rulesRead() { return check(await sb.from('staff_rules_read').select('profile_id, read_at')) as RulesRead[] },
    async readRules() { check(await sb.rpc('read_staff_rules')) },
    async pets() {
      return (check(await sb.from('pets').select('id, profile_id, name, kind, breed, photo, photo_zoom, photo_x, photo_y, sort, created_at').order('sort').order('name')) as Pet[])
        .map(p => ({ ...p, photo_zoom: Number(p.photo_zoom ?? 1) }))
    },
    async savePet({ id, profile_id, ...p }) {
      if (id) { check(await sb.from('pets').update(p).eq('id', id)); return id }
      return (check(await sb.from('pets').insert({ ...p, profile_id: profile_id ?? await uid() }).select('id').single()) as { id: string }).id
    },
    async deletePet(id) { check(await sb.from('pets').delete().eq('id', id)) },
    async qrCodes() {
      return check(await sb.from('qr_codes')
        .select('id, name, kind, url, content, wifi_ssid, wifi_password, wifi_security, wifi_hidden, used_where, caption, dark_colour, light_colour, logo, sort, created_at, updated_at')
        .order('sort').order('name')) as QrCode[]
    },
    async saveQrCode({ id, ...c }) {
      if (id) { check(await sb.from('qr_codes').update(c).eq('id', id)); return id }
      return (check(await sb.from('qr_codes').insert(c).select('id').single()) as { id: string }).id
    },
    async deleteQrCode(id) { check(await sb.from('qr_codes').delete().eq('id', id)) },
    async orderQrCodes(ids) {
      for (const [sort, id] of ids.entries()) check(await sb.from('qr_codes').update({ sort: sort + 1 }).eq('id', id))
    },
    async coffees() {
      const rows = check(await sb.from('coffees')
        .select('id, name, country, region, roaster, roast, process, tasting_notes, brew, bag_grams, bag_price, active, photo, sort, created_at')
        .order('sort').order('name')) as Coffee[]
      return rows.map(c => ({ ...c, bag_price: num(c.bag_price) }))
    },
    async saveCoffee({ id, ...c }) {
      if (id) { check(await sb.from('coffees').update(c).eq('id', id)); return id }
      return (check(await sb.from('coffees').insert(c).select('id').single()) as { id: string }).id
    },
    async deleteCoffee(id) { check(await sb.from('coffees').delete().eq('id', id)) },
    async themeDays() {
      const [themes, rotation, dates] = await Promise.all([
        sb.from('day_themes').select('id, name, emoji, colour, description, coffee_id, playlist, notes, sort').order('sort').order('name'),
        sb.from('day_theme_schedule').select('weekday, theme_id'),
        sb.from('day_theme_dates').select('day, theme_id, note').order('day'),
      ])
      return {
        themes: check(themes) as DayTheme[],
        rotation: Object.fromEntries((check(rotation) as { weekday: number; theme_id: string }[]).map(r => [r.weekday, r.theme_id])),
        dates: check(dates) as ThemeDate[],
      }
    },
    async saveDayTheme({ id, ...t }) {
      if (id) { check(await sb.from('day_themes').update(t).eq('id', id)); return id }
      return (check(await sb.from('day_themes').insert(t).select('id').single()) as { id: string }).id
    },
    async deleteDayTheme(id) { check(await sb.from('day_themes').delete().eq('id', id)) },
    async setThemeRotation(weekday, themeId) {
      if (themeId) check(await sb.from('day_theme_schedule').upsert({ weekday, theme_id: themeId }, { onConflict: 'business_id,weekday' }))
      else check(await sb.from('day_theme_schedule').delete().eq('weekday', weekday))
    },
    async setThemeDate(day, themeId, note) {
      if (themeId === undefined) check(await sb.from('day_theme_dates').delete().eq('day', day))
      else check(await sb.from('day_theme_dates').upsert({ day, theme_id: themeId, note: note ?? null }, { onConflict: 'business_id,day' }))
    },
    async routineItems() {
      const rows = check(await sb.from('routine_items')
        .select('id, name, category, weekdays, every_weeks, month_week, starts_on, starts_at, ends_at, profile_id, job_role_id, checklist, notes, active, sort')
        .order('sort').order('name')) as RoutineItem[]
      // Postgres gives times as 09:00:00.
      return rows.map(r => ({ ...r, starts_at: r.starts_at?.slice(0, 5) ?? null, ends_at: r.ends_at?.slice(0, 5) ?? null }))
    },
    async saveRoutineItem({ id, ...r }) {
      if (id) { check(await sb.from('routine_items').update(r).eq('id', id)); return id }
      return (check(await sb.from('routine_items').insert(r).select('id').single()) as { id: string }).id
    },
    async deleteRoutineItem(id) { check(await sb.from('routine_items').delete().eq('id', id)) },
    async routineDone(from, to) {
      return check(await sb.from('routine_done').select('item_id, day, done_by, done_at').gte('day', from).lte('day', to)) as RoutineDone[]
    },
    async setRoutineDone(itemId, day, done) {
      if (done) check(await sb.from('routine_done').upsert({ item_id: itemId, day }, { onConflict: 'business_id,item_id,day', ignoreDuplicates: true }))
      else check(await sb.from('routine_done').delete().eq('item_id', itemId).eq('day', day))
    },

    async contractors() {
      const rows = check(await sb.from('contractors').select('*').order('name')) as Contractor[]
      return rows.map(c => ({ ...c, rate: num(c.rate) }))
    },
    async saveContractor({ id, ...c }) {
      if (id) { check(await sb.from('contractors').update(c).eq('id', id)); return id }
      return (check(await sb.from('contractors').insert(c).select('id').single()) as { id: string }).id
    },
    async deleteContractor(id) { check(await sb.from('contractors').delete().eq('id', id)) },
    async outsourcedJobs() {
      const rows = check(await sb.from('outsourced_jobs').select('*').order('starts_on', { ascending: false, nullsFirst: false }).order('service')) as OutsourcedJob[]
      return rows.map(j => ({ ...j, price: num(j.price), quantity: num(j.quantity) }))
    },
    async saveOutsourcedJob({ id, ...j }) {
      if (id) { check(await sb.from('outsourced_jobs').update(j).eq('id', id)); return id }
      return (check(await sb.from('outsourced_jobs').insert(j).select('id').single()) as { id: string }).id
    },
    async deleteOutsourcedJob(id) { check(await sb.from('outsourced_jobs').delete().eq('id', id)) },

    // The pay is its own table: a shop manager's read of it comes back empty (but for their own).
    async employmentContracts() {
      const [rows, pay] = await Promise.all([
        sb.from('employment_contracts').select('id, profile_id, kind, starts_on, ends_on, trial_ends_on, hours_per_week, convenio, job_title, document_url, notes, created_at, updated_at')
          .order('starts_on', { ascending: false }),
        sb.from('employment_contract_pay').select('contract_id, salary, salary_per'),
      ])
      const pays = new Map((check(pay) as { contract_id: string; salary: number; salary_per: SalaryPer }[]).map(p => [p.contract_id, p]))
      return (check(rows) as Omit<EmploymentContract, 'salary' | 'salary_per'>[]).map(c => ({
        ...c, hours_per_week: num(c.hours_per_week), salary: num(pays.get(c.id)?.salary), salary_per: pays.get(c.id)?.salary_per ?? null,
      }))
    },
    async saveEmploymentContract({ id, salary, salary_per, ...c }) {
      if (id) { if (Object.keys(c).length) check(await sb.from('employment_contracts').update(c).eq('id', id)) }
      else id = (check(await sb.from('employment_contracts').insert(c).select('id').single()) as { id: string }).id
      if (salary === null) check(await sb.from('employment_contract_pay').delete().eq('contract_id', id))
      else if (salary !== undefined) check(await sb.from('employment_contract_pay').upsert({ contract_id: id, salary, salary_per: salary_per ?? 'month' }))
      return id
    },
    async deleteEmploymentContract(id) { check(await sb.from('employment_contracts').delete().eq('id', id)) },

    signInWith: oauth,

    async planStatus() {
      const { data, error } = await sb.rpc('plan_status')
      if (error) throw new Error(error.message)
      return data as PlanStatus
    },
    billing: () => worker<BillingInfo>('/api/billing'),
    syncBilling: () => worker<BillingInfo>('/api/billing/sync', { method: 'POST' }),
    choosePlan: (plan, interval) => worker('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan, interval }) }),
    async billingPortal() { return (await worker<{ url: string }>('/api/billing/portal', { method: 'POST' })).url },

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

    async licences() {
      const rows = check(await sb.from('licences').select('*, document:tax_documents(name, link)').order('expires_on', { nullsFirst: false }).order('name')) as Licence[]
      return rows.map(l => ({ ...l, cost: l.cost === null ? null : Number(l.cost) }))
    },
    async saveLicence({ id, ...l }) {
      const { document: _doc, ...row } = l as typeof l & { document?: unknown }
      if (id) { check(await sb.from('licences').update(row).eq('id', id)); return id }
      return (check(await sb.from('licences').insert(row).select('id').single()) as { id: string }).id
    },
    async deleteLicence(id) { check(await sb.from('licences').delete().eq('id', id)) },
    async creditDebit() {
      const rows = check(await sb.from('credit_debit_items').select('*, payments:credit_debit_payments(id, item_id, paid_on, amount, note)')
        .order('next_due', { nullsFirst: false }).order('name')) as MoneyItem[]
      return rows.map(i => ({ ...i, amount: Number(i.amount), instalment: num(i.instalment),
        payments: i.payments.map(p => ({ ...p, amount: Number(p.amount) })).sort((a, b) => b.paid_on.localeCompare(a.paid_on)) }))
    },
    async saveCreditDebit({ id, ...item }) {
      const { payments: _payments, ...row } = item as typeof item & { payments?: unknown }
      if (id) { check(await sb.from('credit_debit_items').update(row).eq('id', id)); return id }
      return (check(await sb.from('credit_debit_items').insert(row).select('id').single()) as { id: string }).id
    },
    async deleteCreditDebit(id) { check(await sb.from('credit_debit_items').delete().eq('id', id)) },
    // The database moves the item's next date on, and marks it done once it's all paid (credit_debit_payment_made()).
    async addCreditDebitPayment(p) { check(await sb.from('credit_debit_payments').insert({ ...p, note: p.note?.trim() || null })) },
    async deleteCreditDebitPayment(id) { check(await sb.from('credit_debit_payments').delete().eq('id', id)) },

    async expenseClaims() {
      const rows = check(await sb.from('expense_claims').select('*, document:tax_documents(name, link)')
        .order('spent_on', { ascending: false }).order('created_at', { ascending: false })) as ExpenseClaim[]
      return rows.map(c => ({ ...c, amount: Number(c.amount), km: num(c.km), rate_per_km: num(c.rate_per_km) }))
    },
    async saveClaim({ id, ...c }) {
      const { document: _doc, ...row } = c as typeof c & { document?: unknown }
      if (id) { check(await sb.from('expense_claims').update(row).eq('id', id)); return id }
      return (check(await sb.from('expense_claims').insert(row).select('id').single()) as { id: string }).id
    },
    async deleteClaim(id) { check(await sb.from('expense_claims').delete().eq('id', id)) },
    async legalDocuments() {
      const rows = check(await sb.from('legal_documents').select('*').order('title')) as LegalDocument[]
      return rows.map(d => ({ ...d, size: d.size === null ? null : Number(d.size) }))
    },
    async legalSources() { return (await worker<{ sources: LegalSource[] }>('/api/legal/sources')).sources },
    legalPicker: () => worker('/api/legal/google/picker'),
    async browseLegalStorage(storage, folder, page = 'legal') {
      if (storage !== 'onedrive') throw new Error('Google Drive files are chosen in Google’s own picker')
      const q = new URLSearchParams({ ...(folder ? { folder } : {}), ...(page === 'brand' ? { for: 'brand' } : {}) }).toString()
      return worker<StorageListing>(`/api/legal/onedrive/browse${q ? `?${q}` : ''}`)
    },
    addLegalDocuments: (storage, ids) => worker('/api/legal/documents', { method: 'POST', body: JSON.stringify({ storage, ids }) }),
    async updateLegalDocument(id, patch) { check(await sb.from('legal_documents').update(patch).eq('id', id)) },
    async removeLegalDocument(id) { check(await sb.from('legal_documents').delete().eq('id', id)) },
    async legalFile(id) {
      // Not worker(): the answer is the file itself, not JSON.
      const token = (await sb.auth.getSession()).data.session?.access_token
      const res = await fetch(`/api/legal/documents/${encodeURIComponent(id)}/file`, { headers: { authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${res.status})`)
      return res.blob()
    },
    async brandDocuments() {
      const rows = check(await sb.from('brand_documents').select(BRAND_COLUMNS).order('title')) as unknown as BrandDocument[]
      return rows.map(d => ({ ...d, size: d.size === null ? null : Number(d.size) }))
    },
    async uploadBrandDocument(file) {
      const problem = uploadProblem(file)
      if (problem) throw new Error(problem)
      const content = await dataUrlOf(file)
      const row = check(await sb.from('brand_documents').insert({ title: brandTitleOf(file.name), storage: 'upload', file_name: file.name,
        mime_type: file.type || null, size: file.size, modified_at: new Date(file.lastModified || Date.now()).toISOString(), content })
        .select(BRAND_COLUMNS).single()) as unknown as BrandDocument
      return { ...row, size: row.size === null ? null : Number(row.size) }
    },
    addBrandDocuments: (storage, ids) => worker('/api/brand/documents', { method: 'POST', body: JSON.stringify({ storage, ids }) }),
    async renameBrandDocument(id, title) { check(await sb.from('brand_documents').update({ title }).eq('id', id)) },
    async removeBrandDocument(id) { check(await sb.from('brand_documents').delete().eq('id', id)) },
    async brandFile(id) {
      const d = check(await sb.from('brand_documents').select('storage, content').eq('id', id).single()) as { storage: string; content: string | null }
      if (d.content) return (await fetch(d.content)).blob()
      const token = (await sb.auth.getSession()).data.session?.access_token
      const res = await fetch(`/api/brand/documents/${encodeURIComponent(id)}/file`, { headers: { authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${res.status})`)
      return res.blob()
    },
    async invoices() {
      const rows = check(await sb.from('invoices').select('*, document:tax_documents(name, link)').order('issued_on', { ascending: false, nullsFirst: true })
        .order('created_at', { ascending: false })) as (Invoice & { document: { name: string; link: string | null } | null })[]
      const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))
      return rows.map(r => ({ ...r, net: n(r.net), vat: n(r.vat), total: n(r.total) }))
    },
    async saveInvoice({ id, ...i }) {
      const { document: _doc, created_at: _at, ...row } = i as typeof i & { document?: unknown; created_at?: unknown }
      if (id) { check(await sb.from('invoices').update(row).eq('id', id)); return id }
      return (check(await sb.from('invoices').insert(row).select('id').single()) as { id: string }).id
    },
    async deleteInvoice(id) { check(await sb.from('invoices').delete().eq('id', id)) },
    invoiceInbox: (days, supplierId) => {
      const q = new URLSearchParams({ ...(days ? { days: String(days) } : {}), ...(supplierId ? { supplier: supplierId } : {}) }).toString()
      return worker(`/api/invoices/inbox${q ? `?${q}` : ''}`)
    },
    async importInvoice(m, attachment, supplierId) {
      const a = m.attachments.find(x => x.id === attachment)!
      return (await worker<{ invoice: Invoice }>('/api/invoices/import', { method: 'POST', body: JSON.stringify({
        message: m.id, attachment, name: a.name, at: m.at, from: m.from_name ? `${m.from_name} <${m.from}>` : m.from, from_name: m.from_name, subject: m.subject,
        supplier_id: supplierId ?? m.supplier_id }) })).invoice
    },
    emailMessages: query => worker(`/api/email/messages?${new URLSearchParams(Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]))}`),
    emailMessage: id => worker(`/api/email/messages/${encodeURIComponent(id)}`),
    async emailAttachment(messageId, file) {
      // Not worker(): the answer is the file itself, not JSON.
      const token = (await sb.auth.getSession()).data.session?.access_token
      const res = await fetch(`/api/email/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(file.id)}?${new URLSearchParams({ name: file.name })}`,
        { headers: { authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${res.status})`)
      return res.blob()
    },
    async replyEmail(id, text, all) {
      await worker(`/api/email/messages/${encodeURIComponent(id)}/reply`, { method: 'POST', body: JSON.stringify({ text, all: !!all }) })
    },
    async taxSettings() {
      return check(await sb.from('tax_settings').select('withholding, rent, intra_eu, instalments, gestor_email').eq('id', 1).single()) as TaxSettings
    },
    async saveTaxSettings(patch) { check(await sb.from('tax_settings').update(patch).eq('id', 1)) },
    async taxFilings(year) {
      return (check(await sb.from('tax_filings').select('id, model, year, period, status, amount, filed_on, reference, notes').eq('year', year)) as FilingRecord[])
        .map(r => ({ ...r, amount: r.amount === null ? null : Number(r.amount) }))
    },
    async saveTaxFiling({ id: _id, ...r }) {
      check(await sb.from('tax_filings').upsert(r, { onConflict: 'business_id,model,year,period' }))
    },
    async taxDocuments(year) {
      // The Tax page's own: those under Business Agent/Tax (the Documents hub's are on its page).
      return (check(await sb.from('tax_documents').select('*').eq('year', year).order('uploaded_at', { ascending: false })) as TaxDocument[])
        .filter(d => d.folder[0] === 'Tax')
    },
    async updateTaxDocument(id, patch) { check(await sb.from('tax_documents').update(patch).eq('id', id)) },
    async removeTaxDocument(id) { check(await sb.from('tax_documents').delete().eq('id', id)) },
    taxFolders: path => worker(`/api/tax/folders?path=${encodeURIComponent(path.join('/'))}`),
    async makeTaxFolder(path, name) {
      return (await worker<{ path: string[] }>('/api/tax/folders', { method: 'POST', body: JSON.stringify({ path, name }) })).path
    },
    async uploadTaxDocument(file, m) {
      const q = new URLSearchParams({ name: m.name, kind: m.kind, year: String(m.year), quarter: m.quarter ? String(m.quarter) : '', folder: m.folder.join('/'), sha256: m.sha256 })
      return (await worker<{ document: TaxDocument }>(`/api/tax/upload?${q}`, { method: 'POST', body: file, headers: { 'content-type': 'application/octet-stream' } })).document
    },
    async documents() {
      return check(await sb.from('tax_documents').select('*, invoices(id, number, party_name, supplier:suppliers(name)), licences(id, name, expires_on)')
        .order('uploaded_at', { ascending: false })) as KeptDocument[]
    },
    browseFiles: path => worker(`/api/files/browse?path=${encodeURIComponent(path.join('/'))}`),
    async makeDocumentsFolder(path, name) {
      return (await worker<{ path: string[] }>('/api/files/folders', { method: 'POST', body: JSON.stringify({ path, name }) })).path
    },
    async uploadDocument(file, m) {
      const q = new URLSearchParams({ name: m.name, kind: m.kind, year: String(m.year), folder: m.folder.join('/'), sha256: m.sha256,
        title: m.title ?? '', tags: (m.tags ?? []).join(','), expires_on: m.expires_on ?? '' })
      return (await worker<{ document: KeptDocument }>(`/api/files/upload?${q}`, { method: 'POST', body: file, headers: { 'content-type': 'application/octet-stream' } })).document
    },
    async pnlSettings() {
      const { data, error } = await sb.from('pnl_settings').select('vat_rate').eq('id', 1).maybeSingle()
      if (error) throw new Error(error.message)
      return { vat_rate: Number((data as PnlSettings | null)?.vat_rate ?? DEFAULT_VAT_RATE) }
    },
    async savePnlSettings(patch) { check(await sb.from('pnl_settings').upsert({ id: 1, ...patch })) },
    async pnlLines(from, to) {
      const rows = check(await sb.from('pnl_lines').select('id, month, kind, category, label, amount, notes')
        .gte('month', `${from}-01`).lte('month', `${to}-01`).order('month').order('label')) as PnlLine[]
      return rows.map(l => ({ ...l, amount: Number(l.amount) }))
    },
    async savePnlLine({ id, ...l }) {
      const row = { month: `${l.month.slice(0, 7)}-01`, kind: l.kind, category: l.category ?? null, label: l.label.trim(), amount: l.amount, notes: l.notes ?? null }
      if (id) check(await sb.from('pnl_lines').update(row).eq('id', id))
      else check(await sb.from('pnl_lines').insert(row))
    },
    async deletePnlLine(id) { check(await sb.from('pnl_lines').delete().eq('id', id)) },
    async suppliers() {
      return (check(await sb.from('suppliers').select('*').order('name')) as Supplier[])
        .map(s => ({ ...s, cutoff: s.cutoff?.slice(0, 5) ?? null, minimum_order: s.minimum_order === null ? null : Number(s.minimum_order) }))
    },
    async saveSupplier({ id, ...s }) {
      if (id) check(await sb.from('suppliers').update(s).eq('id', id))
      else check(await sb.from('suppliers').insert(s))
    },
    async deleteSupplier(id) { check(await sb.from('suppliers').delete().eq('id', id)) },
    async stockPrices() {
      // Newest first, so that the page limit leaves out the oldest prices, never the latest change.
      return (check(await sb.from('stock_item_prices').select('item_id, cost_per_unit, changed_at')
        .order('changed_at', { ascending: false }).order('id', { ascending: false })) as StockPrice[])
        .map(p => ({ ...p, cost_per_unit: Number(p.cost_per_unit) }))
    },
    async stockItems() {
      const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
      return (check(await sb.from('stock_items').select('*').order('name')) as StockItem[]).map(i => ({
        ...i, on_hand: Number(i.on_hand), order_multiple: Number(i.order_multiple), vat_rate: Number(i.vat_rate), cost_per_unit: num(i.cost_per_unit),
        sell_price: num(i.sell_price), par_level: num(i.par_level), reorder_at: num(i.reorder_at),
      }))
    },
    async saveStockItem({ id, updated_at: _u, ...i }: Parameters<Api['saveStockItem']>[0] & { updated_at?: string }) {
      if (id) { const { on_hand: _o, ...rest } = i; check(await sb.from('stock_items').update(rest).eq('id', id)) }
      else check(await sb.from('stock_items').insert(i))
    },
    async deleteStockItem(id) { check(await sb.from('stock_items').delete().eq('id', id)) },
    async importStockItems(rows) {
      if (!rows.length) return 0
      check(await sb.from('stock_items').insert(rows))
      return rows.length
    },
    async stockMovements(itemId) {
      let q = sb.from('stock_movements').select('*').order('at', { ascending: false }).limit(200)
      if (itemId) q = q.eq('item_id', itemId)
      return (check(await q) as StockMovement[]).map(m => ({ ...m, change: Number(m.change), on_hand_after: Number(m.on_hand_after),
        counted: m.counted === null ? null : Number(m.counted) }))
    },
    async recordStock(moves) {
      if (!moves.length) return
      // A count only needs the figure; the database works out the change.
      check(await sb.from('stock_movements').insert(moves.map(m => ({ item_id: m.item_id, reason: m.reason, note: m.note ?? null,
        ...(m.reason === 'waste' && m.waste_reason ? { waste_reason: m.waste_reason } : {}),
        ...(m.reason === 'delivery' && m.use_by ? { use_by: m.use_by } : {}),
        ...(m.reason === 'count' ? { counted: m.counted, change: 0 } : { change: m.change }) }))))
    },
    async editWaste(id, w) {
      check(await sb.rpc('edit_waste', { p_id: id, p_item_id: w.item_id, p_quantity: w.quantity, p_reason: w.waste_reason, p_note: w.note?.trim() || null }))
    },
    async undoWaste(id) { check(await sb.rpc('undo_waste', { p_id: id })) },
    async recipes() {
      type Row = Omit<Recipe, 'variants' | 'lines'> & { recipe_variants: (Recipe['variants'][number] & { sort: number })[]; recipe_lines: (Recipe['lines'][number] & { sort: number })[] }
      const rows = check(await sb.from('recipes').select('*, recipe_variants(*), recipe_lines(*)').order('name')) as Row[]
      return rows.map(({ recipe_variants, recipe_lines, ...r }) => ({
        ...r, sell_price: r.sell_price === null ? null : Number(r.sell_price), vat_rate: Number(r.vat_rate), target_margin: Number(r.target_margin),
        wastage_pct: Number(r.wastage_pct),
        variants: [...recipe_variants].sort((a, b) => a.sort - b.sort).map(v => ({ id: v.id, name: v.name, price_change: Number(v.price_change) })),
        lines: [...recipe_lines].sort((a, b) => a.sort - b.sort).map(l => ({ item_id: l.item_id, quantity: Number(l.quantity), unit: l.unit,
          variant_id: l.variant_id, replaces_item_id: l.replaces_item_id })),
      }))
    },
    // One call, so a recipe is never left half saved.
    async saveRecipe(r) { return check(await sb.rpc('save_recipe', { p: r })) as string },
    async deleteRecipe(id) { check(await sb.from('recipes').delete().eq('id', id)) },
    async menuAllergens() {
      const { data, error } = await sb.rpc('menu_allergens')
      if (error) throw new Error(error.message)
      // Null for anyone who isn't on the team.
      return (data as MenuAllergens | null) ?? { dishes: [], items: [] }
    },
    async saveItemAllergens(itemId, allergens, mayContain, diet) {
      check(await sb.from('stock_items').update({ allergens, may_contain: mayContain, diet }).eq('id', itemId))
    },
    async safetyPoints() {
      return (check(await sb.from('food_safety_points').select('*').order('sort').order('name')) as SafetyPoint[])
        .map(p => ({ ...p, min_temp: num(p.min_temp), max_temp: num(p.max_temp) }))
    },
    async saveSafetyPoint({ id, ...p }) {
      if (id) { check(await sb.from('food_safety_points').update(p).eq('id', id)); return id }
      return (check(await sb.from('food_safety_points').insert(p).select('id').single()) as { id: string }).id
    },
    async deleteSafetyPoint(id) { check(await sb.from('food_safety_points').delete().eq('id', id)) },
    async safetyChecks(from, to) {
      return (check(await sb.from('food_safety_checks').select('*')
        .gte('checked_at', zonedIso(from, '00:00')).lt('checked_at', zonedIso(addDays(to, 1), '00:00')).order('checked_at', { ascending: false })) as SafetyCheck[])
        .map(c => ({ ...c, reading: num(c.reading) }))
    },
    async recordSafetyCheck(c) {
      check(await sb.from('food_safety_checks').insert({ point_id: c.point_id, reading: c.reading ?? null, action: c.action ?? null, note: c.note ?? null }))
    },

    async menuItems() {
      const rows = check(await sb.rpc('menu_items')) as MenuItem[]
      return rows.map(i => ({ ...i, sell_price: num(i.sell_price), vat_rate: Number(i.vat_rate), variants: i.variants.map(v => ({ ...v, price_change: Number(v.price_change) })) }))
    },
    async saveMenuItem({ id, ...item }) {
      if (id) { check(await sb.from('recipes').update(item).eq('id', id)); return id }
      return (check(await sb.from('recipes').insert(item).select('id').single()) as { id: string }).id
    },
    async reorderMenu(ids) { check(await sb.rpc('reorder_menu', { p_ids: ids })) },
    async loadMenuTemplate() {
      const add = missingFrom((check(await sb.rpc('menu_items')) as MenuItem[]).map(i => i.name))
      if (add.length) {
        const made = check(await sb.from('recipes').insert(add.map(({ variants: _v, ...r }) => r)).select('id, name')) as { id: string; name: string }[]
        const variants = add.flatMap(a => a.variants.map((v, sort) => ({ ...v, sort, recipe_id: made.find(m => m.name === a.name)!.id })))
        if (variants.length) check(await sb.from('recipe_variants').insert(variants))
      }
      // The printed menus' sections first, then any others there were.
      const { menu_sections: had } = check(await sb.from('settings').select('menu_sections').eq('id', 1).single()) as { menu_sections: string[] | null }
      check(await sb.from('settings').update({ menu_sections: [...new Set([...templateSections(), ...(had ?? [])])] }).eq('id', 1))
      const names = (check(await sb.from('menu_designs').select('name')) as { name: string }[]).map(d => d.name)
      const designs = templateDesigns().filter(d => !names.includes(d.name))
      if (designs.length) check(await sb.from('menu_designs').insert(designs))
      return { added: add.length, designs: designs.length }
    },
    syncMenuFromSquare: () => worker('/api/menu/square/sync', { method: 'POST' }),
    sendMenuToGoogle: () => worker('/api/integrations/google/menu', { method: 'POST' }),
    async uploadMenuPicture(file) {
      return (await worker<{ url: string }>('/api/integrations/media?folder=Menu', { method: 'POST', body: file, headers: { 'content-type': file.type } })).url
    },
    async menuDesigns() {
      // Its own images (menu_images.design_id), not the one it points at (image_id).
      const rows = check(await sb.from('menu_designs').select(`*, images:menu_images!menu_images_design_id_fkey(${MENU_IMAGE_COLUMNS})`).order('created_at')) as MenuDesign[]
      return rows.map(d => ({ ...d, images: [...d.images].sort((a, b) => b.created_at.localeCompare(a.created_at)) }))
    },
    async saveMenuDesign({ id, ...design }) {
      if (id) { check(await sb.from('menu_designs').update(design).eq('id', id)); return id }
      return (check(await sb.from('menu_designs').insert(design).select('id').single()) as { id: string }).id
    },
    async deleteMenuDesign(id) { check(await sb.from('menu_designs').delete().eq('id', id)) },
    async addMenuImage(designId, url, source) {
      const { id } = check(await sb.from('menu_images').insert({ design_id: designId, url, source }).select('id').single()) as { id: string }
      check(await sb.from('menu_designs').update({ image_id: id }).eq('id', designId))
      return id
    },
    async deleteMenuImage(id) { check(await sb.from('menu_images').delete().eq('id', id)) },
    async connectHiggsfield(keyId, secret) { await worker('/api/menu/ai/connect', { method: 'POST', body: JSON.stringify({ key_id: keyId, key_secret: secret }) }) },
    async generateMenuImage(request) { return (await worker<{ image: MenuImage }>('/api/menu/images', { method: 'POST', body: JSON.stringify(request) })).image },
    async checkMenuImage(id) { return (await worker<{ image: MenuImage }>(`/api/menu/images/${encodeURIComponent(id)}/check`, { method: 'POST' })).image },

    async screens() {
      const rows = check(await sb.from('screens').select('*, screen_status(last_seen_at)').order('created_at')) as (Omit<Screen, 'last_seen_at'> & { screen_status: { last_seen_at: string } | null })[]
      return rows.map(({ screen_status, ...s }) => ({ ...s, last_seen_at: screen_status?.last_seen_at ?? null }))
    },
    async saveScreen({ id, ...screen }) {
      if (id) { check(await sb.from('screens').update(screen).eq('id', id)); return id }
      return (check(await sb.from('screens').insert(screen).select('id').single()) as { id: string }).id
    },
    async deleteScreen(id) { check(await sb.from('screens').delete().eq('id', id)) },
    async newScreenLink(id) { return check(await sb.rpc('new_screen_link', { p_id: id })) as string },
    async display(token) {
      // The screen's own link: no sign-in, the Worker answers for it.
      const res = await fetch(`/api/display/${encodeURIComponent(token)}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({})) as DisplayFeed & { error?: string }
      if (!res.ok) throw new Error(json.error ?? `The slides couldn’t be loaded (${res.status})`)
      return json
    },
    async offers() {
      return check(await sb.from('offers').select('id, title, details, price, was_price, image_url, starts_at, ends_at, screen_ids, screen_mode, seconds, post_id, active, updated_at, stock_item_id, last_day_rule_id, auto_for')
        .order('starts_at', { ascending: false }).limit(500)) as Offer[]
    },
    async saveOffer({ id, ...offer }) {
      if (id) { check(await sb.from('offers').update(offer).eq('id', id)); return id }
      return (check(await sb.from('offers').insert(offer).select('id').single()) as { id: string }).id
    },
    async deleteOffer(id) { check(await sb.from('offers').delete().eq('id', id)) },
    async lastDayRules() {
      return check(await sb.from('last_day_rules').select('id, name, active, categories, item_ids, discount, percent_off, price, minutes_before_close, screen_ids, screen_mode, story, sort')
        .order('sort').order('created_at')) as LastDayRule[]
    },
    async saveLastDayRule({ id, ...rule }) {
      if (id) check(await sb.from('last_day_rules').update(rule).eq('id', id))
      else check(await sb.from('last_day_rules').insert(rule))
    },
    async deleteLastDayRule(id) { check(await sb.from('last_day_rules').delete().eq('id', id)) },

    async cameras() {
      const rows = check(await sb.from('cameras').select('*, camera_status(last_seen_at, last_clip_at, last_error)').order('created_at')) as
        (Omit<Camera, 'last_seen_at' | 'last_clip_at' | 'last_error'> & { camera_status: Pick<Camera, 'last_seen_at' | 'last_clip_at' | 'last_error'> | null })[]
      return rows.map(({ camera_status, ...c }) => ({ ...c, last_seen_at: camera_status?.last_seen_at ?? null, last_clip_at: camera_status?.last_clip_at ?? null,
        last_error: camera_status?.last_error ?? null }))
    },
    async saveCamera({ id, name, placement, keep_days, keep_video, active }) {
      const camera = { name, placement, keep_days, keep_video, active }
      if (id) { check(await sb.from('cameras').update(camera).eq('id', id)); return id }
      return (check(await sb.from('cameras').insert(camera).select('id').single()) as { id: string }).id
    },
    async deleteCamera(id) { await worker(`/api/cameras/${encodeURIComponent(id)}`, { method: 'DELETE' }) },
    async newCameraPassword(id) { return check(await sb.rpc('new_camera_password', { p_id: id })) as string },
    cameraService: () => worker<CameraService>('/api/cameras/service'),
    async camerasLive() { return (await worker<{ cameras: Record<string, CameraLive> }>('/api/cameras/live')).cameras },
    async cameraPicture(id) {
      // Not worker(): the answer is the picture itself.
      const token = (await sb.auth.getSession()).data.session?.access_token
      const res = await fetch(`/api/cameras/${encodeURIComponent(id)}/picture`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `The picture couldn’t be loaded (${res.status})`)
      return res.blob()
    },
    async cameraClips(cameraId) {
      return check(await sb.from('camera_clips').select('id, camera_id, started_at, seconds, bytes, storage, file_id, file_name, link, motion, kept, note, created_at')
        .eq('camera_id', cameraId).order('started_at', { ascending: false }).limit(2000)) as CameraClip[]
    },
    async keepClip(id, kept, note) { check(await sb.from('camera_clips').update({ kept, note }).eq('id', id)) },
    async playClip(id) { return (await worker<{ url: string }>(`/api/cameras/clips/${encodeURIComponent(id)}/play`)).url },
    async deleteClip(id) { await worker(`/api/cameras/clips/${encodeURIComponent(id)}`, { method: 'DELETE' }) },

    async customers() {
      return check(await sb.from('customers').select(CUSTOMER_COLUMNS).order('created_at', { ascending: false })) as Customer[]
    },
    async saveCustomer({ id, ...patch }) {
      if (id) check(await sb.from('customers').update(patch).eq('id', id))
      else check(await sb.from('customers').insert(patch))
    },
    async deleteCustomer(id) { check(await sb.from('customers').delete().eq('id', id)) },

    async grantProfile() {
      const { data, error } = await sb.from('grant_profile').select('answers').maybeSingle()
      if (error) throw new Error(error.message)
      return cleanAnswers(data?.answers)
    },
    async saveGrantProfile(answers) { check(await sb.from('grant_profile').update({ answers: cleanAnswers(answers) }).eq('id', true)) },
    async grantApplications() {
      return (check(await sb.from('grant_applications').select(GRANT_APPLICATION_COLUMNS).order('created_at')) as GrantApplication[])
        .map(a => ({ ...a, amount_requested: num(a.amount_requested), amount_awarded: num(a.amount_awarded), amount_received: num(a.amount_received) }))
    },
    async saveGrantApplication({ id, ...patch }) {
      if (id) { check(await sb.from('grant_applications').update(patch).eq('id', id)); return id }
      return (check(await sb.from('grant_applications').insert(patch).select('id').single()) as { id: string }).id
    },
    async deleteGrantApplication(id) { check(await sb.from('grant_applications').delete().eq('id', id)) },
    async importCustomers(rows) {
      // In batches, so a long list doesn't make one huge request. A field a row leaves out takes the column's default.
      for (let i = 0; i < rows.length; i += 500) check(await sb.from('customers').insert(rows.slice(i, i + 500), { defaultToNull: false }))
      return rows.length
    },

    async enquiries() {
      const rows = check(await sb.from('enquiries').select('*, customer:customers(first_name, last_name, company, email, phone, kind)')
        .order('received_at', { ascending: false })) as Enquiry[]
      return rows.map(e => ({ ...e, value: num(e.value) }))
    },
    async saveEnquiry({ id, ...e }, lead) {
      const { customer: _c, closed_at: _closed, ...row } = e as typeof e & { customer?: unknown; closed_at?: unknown }
      if (id) { check(await sb.from('enquiries').update(row).eq('id', id)); return id }
      // Someone new: added to Customers as a lead, from where the enquiry came in.
      const customerId = lead
        ? (check(await sb.from('customers').insert({ ...lead, kind: 'lead', source: SOURCE_FOR[row.channel ?? 'other'] }).select('id').single()) as { id: string }).id
        : row.customer_id
      return (check(await sb.from('enquiries').insert({ ...row, customer_id: customerId }).select('id').single()) as { id: string }).id
    },
    async deleteEnquiry(id) { check(await sb.from('enquiries').delete().eq('id', id)) },
    async campaigns() {
      return check(await sb.from('campaigns').select('*').order('created_at', { ascending: false })) as Campaign[]
    },
    async saveCampaign({ id, ...c }) {
      if (id) { check(await sb.from('campaigns').update(c).eq('id', id)); return id }
      return (check(await sb.from('campaigns').insert(c).select('id').single()) as { id: string }).id
    },
    async deleteCampaign(id) { check(await sb.from('campaigns').delete().eq('id', id)) },
    async setCampaignInactive(id, inactive) { check(await sb.from('campaigns').update({ inactive }).eq('id', id)) },
    async jobOpenings() {
      return (check(await sb.from('job_openings').select('*').order('opened_on', { ascending: false })) as JobOpening[])
        .map(o => ({ ...o, hours_per_week: num(o.hours_per_week) }))
    },
    async saveOpening({ id, ...o }) {
      const { created_at: _at, ...row } = o as typeof o & { created_at?: string }
      if (id) { check(await sb.from('job_openings').update(row).eq('id', id)); return id }
      return (check(await sb.from('job_openings').insert(row).select('id').single()) as { id: string }).id
    },
    async deleteOpening(id) { check(await sb.from('job_openings').delete().eq('id', id)) },
    async applicants() {
      return check(await sb.from('applicants').select('*').order('applied_on', { ascending: false })) as Applicant[]
    },
    async saveApplicant({ id, ...a }) {
      // When their details go is the database's (a year from applying).
      const { keep_until: _k, ...row } = a
      if (id) { check(await sb.from('applicants').update(row).eq('id', id)); return id }
      return (check(await sb.from('applicants').insert(row).select('id').single()) as { id: string }).id
    },
    async deleteApplicant(id) { check(await sb.from('applicants').delete().eq('id', id)) },
    async savePoolCandidate({ id, ...c }) {
      // Only someone in the pool is changed here; when their details go is the database's (a year from being added).
      const { keep_until: _k, ...row } = c as typeof c & { keep_until?: string }
      if (id) { check(await sb.from('applicants').update(row).eq('id', id).is('opening_id', null)); return id }
      return (check(await sb.from('applicants').insert({ ...row, opening_id: null }).select('id').single()) as { id: string }).id
    },
    async addToJob(applicantId, openingId) {
      check(await sb.from('applicants').update({ opening_id: openingId, stage: 'applied' }).eq('id', applicantId).is('opening_id', null))
    },
    async applicantCvs() {
      return (check(await sb.from('applicant_cvs').select(CV_COLUMNS)) as unknown as ApplicantCv[]).map(c => ({ ...c, size: Number(c.size) }))
    },
    async uploadApplicantCv(applicantId, file) {
      const problem = cvProblem(file)
      if (problem) throw new Error(problem)
      const content = await dataUrlOf(file)
      const row = check(await sb.from('applicant_cvs').upsert({ applicant_id: applicantId, file_name: file.name, mime_type: file.type || null, size: file.size, content },
        { onConflict: 'applicant_id' }).select(CV_COLUMNS).single()) as unknown as ApplicantCv
      return { ...row, size: Number(row.size) }
    },
    async removeApplicantCv(applicantId) { check(await sb.from('applicant_cvs').delete().eq('applicant_id', applicantId)) },
    async applicantCvFile(applicantId) {
      const c = check(await sb.from('applicant_cvs').select('content').eq('applicant_id', applicantId).single()) as { content: string }
      return (await fetch(c.content)).blob()
    },
    async tipPools() {
      return (check(await sb.from('tip_pools').select('*, shares:tip_shares(profile_id, minutes, amount)').order('starts_on', { ascending: false })) as TipPool[])
        .map(p => ({ ...p, cash: Number(p.cash), card: Number(p.card), shares: p.shares.map(s => ({ ...s, amount: Number(s.amount) })) }))
    },
    async saveTipPool(pool, shares) {
      return check(await sb.rpc('save_tip_pool', { p_pool: pool, p_shares: shares })) as string
    },
    async deleteTipPool(id) { check(await sb.from('tip_pools').delete().eq('id', id)) },
    async salesReps() {
      const rows = check(await sb.from('sales_reps').select(`${REP_COLUMNS}, ${REP_REACH_COLUMNS}`).order('name')) as SalesRep[]
      return rows.map(r => ({ ...r, reach: Number(r.reach ?? 0) }))
    },
    async saveSalesRep({ id, ...input }) {
      // What the database works out itself isn't sent back.
      const { reach: _reach, followers_checked_at: _checked, created_at: _created, created_by: _by, ...r } = input as Partial<SalesRep>
      if (id) { check(await sb.from('sales_reps').update(r).eq('id', id)); return id }
      return (check(await sb.from('sales_reps').insert(r).select('id').single()) as { id: string }).id
    },
    async deleteSalesRep(id) { check(await sb.from('sales_reps').delete().eq('id', id)) },
    async rewardRules() {
      const rows = check(await sb.from('reward_rules').select('id, name, who, basis, amount, needs_approval, monthly_limit, scales_with_reach, sort, active').order('sort').order('created_at')) as RewardRule[]
      return rows.map(r => ({ ...r, amount: Number(r.amount) }))
    },
    async saveRewardRule({ id, ...r }) {
      if (id) check(await sb.from('reward_rules').update(r).eq('id', id))
      else check(await sb.from('reward_rules').insert(r))
    },
    async deleteRewardRule(id) { check(await sb.from('reward_rules').delete().eq('id', id)) },
    async repRewards() {
      const rows = check(await sb.from('rep_rewards').select(REWARD_COLUMNS).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(2000)) as RepReward[]
      return rows.map(r => ({ ...r, amount: Number(r.amount), sale_amount: num(r.sale_amount), multiplier: num(r.multiplier) }))
    },
    async logReward(r) {
      const out = check(await sb.rpc('log_reward', { p_rep_id: r.rep_id, p_rule_id: r.rule_id, p_sale_amount: r.sale_amount ?? null, p_note: r.note || null,
        p_proof_url: r.proof_url || null, p_mention_id: r.mention_id ?? null, p_occurred_on: r.occurred_on ?? null })) as LoggedReward
      return { ...out, amount: Number(out.amount) }
    },
    async decideReward(id, approve, amount) {
      check(await sb.rpc('decide_reward', { p_id: id, p_approve: approve, p_amount: amount ?? null }))
    },
    async settleReward(repId, amount, note) {
      return Number(check(await sb.rpc('settle_reward', { p_rep_id: repId, p_amount: amount, p_note: note || null })))
    },
    async deleteReward(id) { check(await sb.from('rep_rewards').delete().eq('id', id)) },
    async repSettings() {
      const row = check(await sb.from('rep_settings').select('welcome_offer, crew_share, boost_by_reach, pitch').eq('id', 1).single()) as RepSettings
      return { ...row, crew_share: Number(row.crew_share) }
    },
    async updateRepSettings(patch) { check(await sb.from('rep_settings').update(patch).eq('id', 1)) },
    async decideRep(id, approve) { check(await sb.rpc('decide_rep', { p_id: id, p_approve: approve })) },
    async repLink(repId) {
      const row = check(await sb.from('rep_links').select('token').eq('rep_id', repId).maybeSingle()) as { token: string } | null
      if (row) return row.token
      return (check(await sb.from('rep_links').insert({ rep_id: repId }).select('token').single()) as { token: string }).token
    },
    async newRepLink(repId) {
      const token = crypto.randomUUID().replace(/-/g, '')
      check(await sb.from('rep_links').upsert({ rep_id: repId, token }, { onConflict: 'rep_id' }))
      return token
    },
    lookupInstagram: handle => worker('/api/reps/instagram', { method: 'POST', body: JSON.stringify({ handle }) }),
    async repPage(token) {
      // The rep's own link: no sign-in, the Worker answers for it.
      const res = await fetch(`/api/rep-page/${encodeURIComponent(token)}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({})) as RepPageData & { error?: string }
      if (!res.ok) throw new Error(json.error ?? `Your page couldn’t be loaded (${res.status})`)
      return json
    },
    async claimReward(token, claim) {
      const res = await fetch(`/api/rep-page/${encodeURIComponent(token)}/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(claim) })
      const json = await res.json().catch(() => ({})) as LoggedReward & { error?: string }
      if (!res.ok) throw new Error(json.error ?? `That couldn’t be sent (${res.status})`)
      return { ...json, amount: Number(json.amount) }
    },
    async suggestCrew(token, person) {
      const res = await fetch(`/api/rep-page/${encodeURIComponent(token)}/crew`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(person) })
      const json = await res.json().catch(() => ({})) as { name: string; reach: number; approved: boolean; error?: string }
      if (!res.ok) throw new Error(json.error ?? `That couldn’t be sent (${res.status})`)
      return { name: json.name, reach: Number(json.reach), approved: json.approved }
    },

    async kittySettings() {
      const row = check(await sb.from('kitty_settings').select('profit_percent').eq('id', 1).single()) as { profit_percent: number }
      return { profit_percent: Number(row.profit_percent) }
    },
    async updateKittySettings(patch) { check(await sb.from('kitty_settings').update(patch).eq('id', 1)) },
    async kittyGoals() {
      const rows = check(await sb.from('kitty_goals').select('id, name, icon, target, due_on, sort, link, notes, spent, bought_on, created_at').order('sort').order('created_at')) as KittyGoal[]
      return rows.map(g => ({ ...g, target: Number(g.target), spent: g.spent === null ? null : Number(g.spent) }))
    },
    async saveKittyGoal({ id, ...g }) {
      if (id) check(await sb.from('kitty_goals').update(g).eq('id', id))
      else check(await sb.from('kitty_goals').insert(g))
    },
    async deleteKittyGoal(id) { check(await sb.from('kitty_goals').delete().eq('id', id)) },
    async orderKittyGoals(ids) {
      for (const [i, id] of ids.entries()) check(await sb.from('kitty_goals').update({ sort: i + 1 }).eq('id', id))
    },
    async kittyEntries() {
      const rows = check(await sb.from('kitty_entries').select('id, kind, month, percent, amount, note, created_at').order('created_at', { ascending: false })) as KittyEntry[]
      return rows.map(e => ({ ...e, amount: Number(e.amount), percent: e.percent === null ? null : Number(e.percent) }))
    },
    async addKittyEntry(e) { check(await sb.from('kitty_entries').insert(e)) },
    async deleteKittyEntry(id) { check(await sb.from('kitty_entries').delete().eq('id', id)) },

    async todos() {
      const [categories, todos] = await Promise.all([
        sb.from('todo_categories').select('id, name, hint, colour, sort').order('sort').order('name'),
        sb.from('todos').select('id, title, category_id, section, assignee_id, done, status, done_at, starred, pinned, position, created_at')
          .order('position').order('created_at'),
      ])
      return { categories: check(categories) as TodoCategory[], todos: check(todos) as Todo[] }
    },
    async addTodo(t) {
      return check(await sb.from('todos').insert({ title: t.title.trim(), category_id: t.category_id, position: t.position,
        ...(t.assignee_id ? { assignee_id: t.assignee_id } : {}), ...(t.status ? { status: t.status } : {}) })
        .select('id, title, category_id, section, assignee_id, done, status, done_at, starred, pinned, position, created_at').single()) as Todo
    },
    async updateTodo(id, patch) { check(await sb.from('todos').update(patch).eq('id', id)) },
    async deleteTodo(id) { check(await sb.from('todos').delete().eq('id', id)) },
    async saveTodoCategory(c) {
      const row = { name: c.name.trim(), hint: c.hint?.trim() || null, ...(c.colour ? { colour: c.colour } : {}), ...(c.sort !== undefined ? { sort: c.sort } : {}) }
      const res = c.id ? await sb.from('todo_categories').update(row).eq('id', c.id) : await sb.from('todo_categories').insert(row)
      if (res.error?.code === '23505') throw new Error(`There is already a category called “${row.name}”`)
      check(res)
    },
    async deleteTodoCategory(id) { check(await sb.from('todo_categories').delete().eq('id', id)) },
    async sentAlerts(limit = 50) {
      return check(await sb.from('outbox').select('*').order('created_at', { ascending: false }).limit(limit)) as OutboxItem[]
    },

    async sportsCompetitions() {
      return check(await sb.from('sports_competitions').select('code, source, source_id, name, sport, region, kind, season_style, followed, sort, refreshed_at, last_error')
        .order('sort')) as SportsCompetition[]
    },
    async sportsEvents(fromIso, toIso) {
      return check(await sb.from('sports_events').select('*').gte('starts_at', fromIso).lt('starts_at', toIso)
        .order('starts_at').limit(1000)) as SportsEvent[]
    },
    async setSportsFollowed(code, followed) {
      check(await sb.from('sports_competitions').update({ followed }).eq('code', code))
    },
    async sportsFavourites() {
      return check(await sb.from('sports_favourites').select('kind, ref').order('created_at')) as SportsFavourite[]
    },
    async setSportsFavourite(fav, on) {
      if (on) check(await sb.from('sports_favourites').upsert(fav, { onConflict: 'profile_id,kind,ref', ignoreDuplicates: true }))
      else check(await sb.from('sports_favourites').delete().eq('kind', fav.kind).eq('ref', fav.ref))
    },
    async refreshSports() {
      return (await worker<{ events: number }>('/api/admin/sports/refresh', { method: 'POST' })).events
    },

    integrations: () => worker('/api/integrations'),
    async connectGoogle(back) {
      const { url } = await worker<{ url: string }>('/api/integrations/google/start', { method: 'POST', body: JSON.stringify({ back }) })
      location.assign(url)
    },
    async connectApp(provider, back) {
      const { url } = await worker<{ url: string }>(`/api/integrations/${provider}/start`, { method: 'POST', body: JSON.stringify({ back }) })
      location.assign(url)
    },
    async chooseFacebookPage(pageId) { await worker('/api/integrations/facebook/page', { method: 'POST', body: JSON.stringify({ page_id: pageId }) }) },
    async chooseLinkedInPage(pageId) { await worker('/api/integrations/linkedin/page', { method: 'POST', body: JSON.stringify({ page_id: pageId }) }) },
    async chooseSearchConsoleSite(site) { await worker('/api/integrations/search_console/site', { method: 'POST', body: JSON.stringify({ site }) }) },
    searchConsole: (from, to) => worker(`/api/integrations/search_console/report?from=${from}&to=${to}`),
    socialAnalytics: (source, from, to) => worker(`/api/analytics/${source}?from=${from}&to=${to}`),
    sales: (from, to) => worker(`/api/integrations/payments/sales?from=${from}&to=${to}`),
    salesItems: (from, to) => worker(`/api/integrations/payments/items?from=${from}&to=${to}`),
    adsReport: (from, to) => worker(`/api/ads/report?from=${from}&to=${to}`),
    async setAdCampaign(platform, id, patch) { await worker(`/api/ads/${platform}/campaigns/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(patch) }) },
    async chooseAdAccount(platform, id) { await worker(`/api/ads/${platform}/account`, { method: 'POST', body: JSON.stringify({ id }) }) },
    async adSettings() {
      const row = check(await sb.from('ad_settings').select('meta_ads_monthly_cap, google_ads_monthly_cap, alert_at_percent').eq('id', 1).single()) as AdSettings
      // Money columns (numeric) can arrive as text: keep them numbers.
      return { ...row, meta_ads_monthly_cap: row.meta_ads_monthly_cap === null ? null : Number(row.meta_ads_monthly_cap),
        google_ads_monthly_cap: row.google_ads_monthly_cap === null ? null : Number(row.google_ads_monthly_cap) }
    },
    async saveAdSettings(patch) { check(await sb.from('ad_settings').update(patch).eq('id', 1)) },
    async socialPosts() {
      return check(await sb.from('social_posts').select('id, kind, caption, image_url, media, targets, scheduled_at, auto, status, results, music, insights, created_at, published_at')
        .order('scheduled_at', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false }).limit(200)) as SocialPost[]
    },
    async saveSocialPost(p) {
      // The cover (image_url) follows the media in the database.
      const row = { kind: p.kind ?? 'post', caption: p.caption, media: p.media ?? (p.image_url ? [{ url: p.image_url, type: 'image' }] : []),
        targets: p.targets, status: p.status, scheduled_at: p.scheduled_at ?? null, auto: p.auto ?? true,
        ...(p.music !== undefined ? { music: p.music } : {}) }
      if (p.id) { check(await sb.from('social_posts').update(row).eq('id', p.id)); return p.id }
      return (check(await sb.from('social_posts').insert(row).select('id').single()) as { id: string }).id
    },
    async deleteSocialPost(id) { check(await sb.from('social_posts').delete().eq('id', id)) },
    async markPosted(id) { check(await sb.from('social_posts').update({ status: 'published' }).eq('id', id)) },
    async competitions() {
      type Row = Competition & { competition_entries: { count: number }[] }
      const rows = check(await sb.from('competitions').select('*, competition_entries(count)').order('created_at', { ascending: false })) as Row[]
      return rows.map(({ competition_entries, ...c }) => ({ ...c, prize_value: c.prize_value === null ? null : Number(c.prize_value),
        entries: competition_entries[0]?.count ?? 0 }))
    },
    async saveCompetition({ id, ...c }) {
      const { entries: _e, drawn_at: _d, entry_count: _n, created_at: _c, ...row } = c as typeof c & Partial<Competition>
      if (id) { check(await sb.from('competitions').update(row).eq('id', id)); return id }
      return (check(await sb.from('competitions').insert(row).select('id').single()) as { id: string }).id
    },
    async deleteCompetition(id) { check(await sb.from('competitions').delete().eq('id', id)) },
    async competitionEntries(id) {
      // A page at a time: a big giveaway can have more entries than one read returns.
      const out: CompetitionEntry[] = []
      for (let from = 0; ; from += 1000) {
        const page = check(await sb.from('competition_entries').select('*').eq('competition_id', id)
          .order('created_at').order('id').range(from, from + 999)) as CompetitionEntry[]
        out.push(...page)
        if (page.length < 1000) return out
      }
    },
    async addEntries(id, rows) {
      const { fresh, skipped } = newEntries(await api.competitionEntries(id), rows)
      if (fresh.length) check(await sb.from('competition_entries').insert(fresh.map(r => ({ ...r, competition_id: id }))))
      return { added: fresh.length, skipped }
    },
    async updateEntry(id, patch) { check(await sb.from('competition_entries').update(patch).eq('id', id)) },
    async drawCompetition(id) { return check(await sb.rpc('draw_competition', { p_id: id })) as number },
    async givePrize(id) {
      const c = check(await sb.from('competitions').select('name, winners, prize_item_id, prize_given_at').eq('id', id).single()) as
        Pick<Competition, 'name' | 'winners' | 'prize_item_id' | 'prize_given_at'>
      if (c.prize_given_at) return
      check(await sb.from('competitions').update({ prize_given_at: new Date().toISOString() }).eq('id', id))
      if (c.prize_item_id) await api.recordStock([{ item_id: c.prize_item_id, reason: 'used', change: -c.winners, note: `Prize: ${c.name}`.slice(0, 300) }])
    },
    loyalty: (from, to) => worker<LoyaltyState>(`/api/loyalty?from=${from}&to=${to}`),
    async adjustLoyalty(accountId, points, reason, key) {
      await worker('/api/loyalty/adjust', { method: 'POST', body: JSON.stringify({ account_id: accountId, points, reason, key }) })
    },
    giftCards: (from, to) => worker<GiftCards>(`/api/giftcards?from=${from}&to=${to}`),
    async sellGiftCard(amount, customerId, key) {
      return (await worker<{ card: GiftCard }>('/api/giftcards', { method: 'POST', body: JSON.stringify({ amount, customer_id: customerId, key }) })).card
    },
    giftCardNumber: async id => (await worker<{ number: string }>(`/api/giftcards/${encodeURIComponent(id)}/number`)).number,
    async uploadMedia(file, folder) {
      const { url, type } = await worker<{ url: string; type: 'image' | 'video' }>(`/api/integrations/media?folder=${folder}`, {
        method: 'POST', body: file, headers: { 'content-type': file.type } })
      return { url, type }
    },
    async musicTracks() {
      return check(await sb.from('music_tracks').select(TRACK_COLUMNS).eq('hidden', false).order('created_at', { ascending: false }).limit(500)) as MusicTrack[]
    },
    musicStatus: () => worker<MusicStatus>('/api/social/music/status'),
    assistantStatus: () => worker<{ ready: boolean }>('/api/assistant/status'),
    async askAssistant(messages) {
      return (await worker<{ reply: string }>('/api/assistant', { method: 'POST', body: JSON.stringify({ messages }) })).reply
    },
    async uploadTrack(file, t) {
      // Browsers name the same files differently: the two the Worker takes.
      const type = /\.m4a$/i.test(file.name) || /mp4|m4a/.test(file.type) ? 'audio/mp4' : 'audio/mpeg'
      const { url } = await worker<{ url: string }>('/api/integrations/media?folder=Music', { method: 'POST', body: file, headers: { 'content-type': type } })
      return check(await sb.from('music_tracks').insert({
        source: 'upload', title: t.title, artist: t.artist ?? null, url, duration_s: t.duration_s, moods: t.moods, waveform: t.waveform,
        highlight_s: t.highlight_s, bpm: t.bpm, licence: { confirmed: t.confirmed },
      }).select(TRACK_COLUMNS).single()) as MusicTrack
    },
    async saveTrack(id, patch) { check(await sb.from('music_tracks').update(patch).eq('id', id)) },
    async deleteTrack(id) { check(await sb.from('music_tracks').delete().eq('id', id)) },
    async aiMusicQuote(seconds) { return check(await sb.rpc('ai_music_quote', { p_seconds: seconds })) as AiMusicQuote },
    async makeAiTrack(req) {
      // Not worker(): a refused prompt comes with ElevenLabs' own rewording to offer.
      const token = (await sb.auth.getSession()).data.session?.access_token
      const res = await fetch('/api/social/music/generate', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(req) })
      const json = await res.json().catch(() => ({})) as AiTrackResult & { error?: string; suggestion?: string | null }
      if (!res.ok) throw new PromptError(json.error ?? `Request failed (${res.status})`, json.suggestion ?? undefined)
      return json
    },
    async keepAiTrack(generationId, trackId) { check(await sb.rpc('ai_music_keep', { p_id: generationId, p_track: trackId })) },
    async aiMusicUses() {
      return check(await sb.from('music_generations').select('id, prompt, seconds, uses, status, free, price_cents, kept_id, error, charged_at, created_at')
        .gte('created_at', new Date(Date.now() - 62 * 86_400_000).toISOString()).order('created_at', { ascending: false }).limit(200)) as MusicGeneration[]
    },
    async setPayPerUseLimit(euros) { check(await sb.rpc('set_ai_music_limit', { p_cents: Math.round(euros * 100) })) },
    renderPostMusic: req => worker('/api/social/render', { method: 'POST', body: JSON.stringify(req) }),
    async connectInstagram(back) {
      const { url } = await worker<{ url: string }>('/api/integrations/instagram/start', { method: 'POST', body: JSON.stringify({ back }) })
      location.assign(url)
    },
    async chooseGoogleListing(loc, closedOnHolidays) {
      await worker('/api/integrations/google/location', { method: 'POST',
        body: JSON.stringify({ location: loc ?? undefined, closed_on_holidays: closedOnHolidays }) })
    },
    async syncGoogleNow() { await worker('/api/integrations/google/sync', { method: 'POST' }) },
    async googleHours() { return (await worker<{ opening_hours: never }>('/api/integrations/google/hours')).opening_hours },
    async disconnect(provider) { await worker(`/api/integrations/${provider}/disconnect`, { method: 'POST' }) },
    async connectService(provider, back, opts) {
      const { url } = await worker<{ url: string }>(`/api/integrations/connect/${provider}/start`, { method: 'POST', body: JSON.stringify({ back, read: opts?.read }) })
      location.assign(url)
    },
    checkConnection: provider => worker(`/api/integrations/${provider}/check`, { method: 'POST' }),
    // Each app in its own request: one Worker run can only ask so many outside services (50 on
    // Workers Free), and checking every app in one run ran out, so the last ones looked broken.
    async checkConnections() {
      const { integrations } = await worker<{ integrations: Integration[] }>('/api/integrations')
      const rows = await Promise.all(integrations.filter(i => ['connected', 'error', 'pending'].includes(i.status))
        .map(i => worker<Integration | null>(`/api/integrations/${i.provider}/check`, { method: 'POST' })))
      return rows.filter((r): r is Integration => !!r)
    },
    chooseCalendar: app => worker(`/api/integrations/calendar/${app}/choose`, { method: 'POST' }),
    async sendTestEmail(to) { await worker('/api/integrations/email/test', { method: 'POST', body: JSON.stringify({ to }) }) },
    saveFile: f => worker('/api/integrations/files/save', { method: 'POST', body: JSON.stringify(f) }),
    reviews: () => worker('/api/reviews'),
    async replyReview(id, text) { await worker('/api/reviews/reply', { method: 'PUT', body: JSON.stringify({ id, text }) }) },
    async deleteReviewReply(id) { await worker('/api/reviews/reply', { method: 'DELETE', body: JSON.stringify({ id }) }) },
    website: () => worker('/api/website'),
    async checkWebsite() { return (await worker<{ report: never }>('/api/website/check', { method: 'POST' })).report },
    async pageSpeed(strategy) { return (await worker<{ pagespeed: never }>('/api/website/pagespeed', { method: 'POST', body: JSON.stringify({ strategy }) })).pagespeed },

    async competitors() {
      const [competitors, items, prices, notes, snapshots, nearby, settings] = await Promise.all([
        sb.from('competitors').select('*').order('name'),
        sb.from('competitor_items').select('*').order('sort').order('name'),
        sb.from('competitor_prices').select('*').order('observed_on', { ascending: false }),
        sb.from('competitor_notes').select('*').order('observed_on', { ascending: false }).order('created_at', { ascending: false }),
        sb.from('competitor_snapshots').select('*').order('taken_on'),
        sb.from('competitor_radar').select('*').order('distance_m', { nullsFirst: false }),
        sb.from('competitor_settings').select('radius_m, scan_weekly, scanned_at').eq('id', 1).maybeSingle(),
      ])
      return competitorRows({
        competitors: check(competitors), items: check(items), prices: check(prices), notes: check(notes), snapshots: check(snapshots), nearby: check(nearby),
        settings: (check(settings) as CompetitorData['settings'] | null) ?? { radius_m: DEFAULT_RADIUS, scan_weekly: true, scanned_at: null },
      } as CompetitorData)
    },
    async saveCompetitor({ id, ...c }) {
      if (id) { check(await sb.from('competitors').update(c).eq('id', id)); return id }
      return (check(await sb.from('competitors').insert(c).select('id').single()) as { id: string }).id
    },
    async deleteCompetitor(id) { check(await sb.from('competitors').delete().eq('id', id)) },
    async savePriceItem({ id, ...i }) {
      if (id) { check(await sb.from('competitor_items').update(i).eq('id', id)); return id }
      return (check(await sb.from('competitor_items').insert(i).select('id').single()) as { id: string }).id
    },
    async deletePriceItem(id) { check(await sb.from('competitor_items').delete().eq('id', id)) },
    async recordPrice(p) { check(await sb.from('competitor_prices').insert(p)) },
    async deletePrice(id) { check(await sb.from('competitor_prices').delete().eq('id', id)) },
    async saveCompetitorNote({ id, ...n }) {
      if (id) { check(await sb.from('competitor_notes').update(n).eq('id', id)); return id }
      return (check(await sb.from('competitor_notes').insert(n).select('id').single()) as { id: string }).id
    },
    async deleteCompetitorNote(id) { check(await sb.from('competitor_notes').delete().eq('id', id)) },
    async dismissNearby(placeId, dismissed) { check(await sb.from('competitor_radar').update({ dismissed }).eq('place_id', placeId)) },
    async saveCompetitorSettings(s) { check(await sb.from('competitor_settings').update(s).eq('id', 1)) },
    competitorGoogle: () => worker('/api/competitors/google'),
    lookAround: radius => worker('/api/competitors/look', { method: 'POST', body: JSON.stringify({ radius_m: radius }) }),
    async findPlaces(query) { return (await worker<{ places: never }>(`/api/competitors/search?q=${encodeURIComponent(query)}`)).places },
    async followPlace(placeId, id) { return (await worker<{ id: string }>('/api/competitors/follow', { method: 'POST', body: JSON.stringify({ place_id: placeId, id }) })).id },
    async refreshCompetitor(id) { await worker('/api/competitors/refresh', { method: 'POST', body: JSON.stringify({ id }) }) },
    async whatsappTest(to) { await worker('/api/integrations/whatsapp/test', { method: 'POST', body: JSON.stringify({ to }) }) },
    instagramProfile: () => worker('/api/integrations/instagram/profile'),
    instagramInbox: () => worker('/api/integrations/instagram/inbox'),
    instagramThread: id => worker(`/api/integrations/instagram/inbox/${encodeURIComponent(id)}`),
    async referrals() {
      const [{ data: b }, list, opens] = await Promise.all([
        sb.from('business').select('referral_code').single(),
        sb.from('referrals').select('id, business_name, joined_at, set_up_at').order('joined_at', { ascending: false }),
        sb.from('referral_opens').select('id', { count: 'exact', head: true }),
      ])
      return { code: (b as { referral_code: string } | null)?.referral_code ?? '', referrals: check(list) as ReferralState['referrals'], opens: opens.count ?? 0 }
    },
    openReferral: (code, count = true) => worker('/api/referrals/open', { method: 'POST', body: JSON.stringify({ code, count }) }),
    async replyInstagram(id, text) {
      await worker(`/api/integrations/instagram/inbox/${encodeURIComponent(id)}/reply`, { method: 'POST', body: JSON.stringify({ text }) })
    },
    messengerInbox: () => worker('/api/integrations/facebook/inbox'),
    messengerThread: id => worker(`/api/integrations/facebook/inbox/${encodeURIComponent(id)}`),
    async replyMessenger(id, text) {
      await worker(`/api/integrations/facebook/inbox/${encodeURIComponent(id)}/reply`, { method: 'POST', body: JSON.stringify({ text }) })
    },
    whatsappInbox: () => worker('/api/integrations/whatsapp/inbox'),
    whatsappThread: id => worker(`/api/integrations/whatsapp/inbox/${encodeURIComponent(id)}`),
    async replyWhatsApp(id, text) {
      await worker(`/api/integrations/whatsapp/inbox/${encodeURIComponent(id)}/reply`, { method: 'POST', body: JSON.stringify({ text }) })
    },
    setWhatsappRetention: days => worker('/api/integrations/whatsapp/retention', { method: 'POST', body: JSON.stringify({ days }) }),
    async uploadPhoto(file) {
      const jpeg = await readyPhoto(file, false)
      return (await worker<{ url: string }>('/api/integrations/media?folder=Posts', { method: 'POST', body: jpeg,
        headers: { 'content-type': jpeg.type } })).url
    },
    async share(caption, imageUrl, targets, eventId) {
      return check(await sb.rpc('queue_share', { p_caption: caption, p_image_url: imageUrl, p_targets: targets,
        p_event_id: eventId ?? null })) as number
    },
    async connectSpotify() {
      const { url } = await worker<{ url: string }>('/api/integrations/spotify/start', { method: 'POST' })
      location.assign(url)
    },
    cafePlaylists: () => worker('/api/integrations/music/playlists'),
    async chooseCafePlaylist(playlist) {
      await worker('/api/integrations/music/playlist', { method: 'POST', body: JSON.stringify({ playlist }) })
    },
    async brand() {
      return check(await sb.from('brand').select('logo, logo_mark, colours, heading_font, body_font, notes, sound_moods, sound_avoid, updated_at').eq('id', 1).single()) as Brand
    },
    async saveBrand(patch) {
      check(await sb.from('brand').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1))
    },
    async fontList() {
      const res = await fetch('/api/fonts')
      if (!res.ok) throw new Error('Could not load the font list')
      return res.json()
    },
    async notifications() {
      return check(await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(30)) as AppNotification[]
    },
    async instagramMentions() {
      return check(await sb.from('instagram_mentions').select('*').order('mentioned_at', { ascending: false }).limit(50)) as InstagramMention[]
    },
    async repostMention(id) { await worker(`/api/integrations/instagram/mentions/${encodeURIComponent(id)}/repost`, { method: 'POST' }) },
    async ignoreMention(id) { await worker(`/api/integrations/instagram/mentions/${encodeURIComponent(id)}/ignore`, { method: 'POST' }) },
    async checkMentions() { return (await worker<{ added: number }>('/api/integrations/instagram/mentions/check', { method: 'POST' })).added },
    async markNotificationsRead() {
      check(await sb.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null))
    },
    async eventAlerts() {
      return check(await sb.from('event_alerts').select('kind, ref_id, remind_at, sent_at').gte('starts_at', new Date(Date.now() - 86_400_000).toISOString())) as EventAlert[]
    },
    async setEventAlert(kind, refId, on) {
      return check(await sb.rpc('set_event_alert', { p_kind: kind, p_ref_id: refId, p_on: on })) as boolean
    },
    async holidayReminders() {
      return check(await sb.from('holiday_reminders').select('event_id, remind, sent_for, sent_at, day_before_for')) as HolidayReminder[]
    },
    async setHolidayReminder(eventId, on) {
      return check(await sb.rpc('set_holiday_reminder', { p_event_id: eventId, p_on: on })) as boolean
    },
    async pushKey() {
      const res = await fetch('/api/push/key')
      return res.ok ? ((await res.json()) as { key: string }).key : null
    },
    async pushDevices() {
      return check(await sb.from('push_subscriptions').select('id, endpoint, device, created_at, last_ok_at').order('created_at')) as PushDevice[]
    },
    async savePushDevice(s) {
      check(await sb.rpc('save_push_subscription', { p_endpoint: s.endpoint, p_p256dh: s.p256dh, p_auth: s.auth, p_device: s.device }))
    },
    async removePushDevice(endpoint) {
      check(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint))
    },
    async sendTestNotification() {
      check(await sb.rpc('send_me_test_notification'))
    },
    calendarFeeds: () => worker('/api/me/calendar-feed'),
    async makeCalendarFeed(scope) { return (await worker<{ url: string }>(`/api/me/calendar-feed/${scope}`, { method: 'POST' })).url },
    async stopCalendarFeed(scope) { await worker(`/api/me/calendar-feed/${scope}`, { method: 'DELETE' }) },
    async apiKeys() { return (await worker<{ keys: ApiKey[] }>('/api/me/api-keys')).keys },
    createApiKey: name => worker('/api/me/api-keys', { method: 'POST', body: JSON.stringify({ name }) }),
    async revokeApiKey(id) { await worker(`/api/me/api-keys/${id}`, { method: 'DELETE' }) },
    myMusic: () => worker('/api/me/music'),
    async connectMyMusic(provider) {
      const { url } = await worker<{ url: string }>(`/api/me/music/${provider}/start`, { method: 'POST' })
      location.assign(url)
    },
    async disconnectMyMusic(provider) { await worker(`/api/me/music/${provider}/disconnect`, { method: 'POST' }) },
    async myPlaylists(provider) { return (await worker<{ playlists: MusicPlaylist[] }>(`/api/me/music/${provider}/playlists`)).playlists },
    myNowPlaying: () => worker('/api/me/music/spotify/now'),
    async playMySpotify(playlistId) {
      await worker('/api/me/music/spotify/play', { method: 'POST', body: JSON.stringify({ playlist_id: playlistId }) })
    },
    async pauseMySpotify() { await worker('/api/me/music/spotify/pause', { method: 'POST' }) },
    cafeMusicLibrary: () => worker('/api/music/library'),
    async cafeTracks(playlistId) { return (await worker<{ tracks: CafeTrack[] }>(`/api/music/tracks/${encodeURIComponent(playlistId)}`)).tracks },
    async cafeSearch(q, kind) {
      return worker<{ tracks: CafeTrack[]; playlists: MusicPlaylist[] }>(`/api/music/search?kind=${kind}&q=${encodeURIComponent(q)}`)
    },
    async musicSetPlaylistOrder(ids) {
      check(await sb.from('music_player').update({ playlist_order: ids, updated_at: new Date().toISOString() }).eq('id', 1))
    },
    async musicAddToCafePlaylist(track) {
      const kept = (check(await sb.from('music_player').select('cafe_playlist').eq('id', 1).single()) as { cafe_playlist: CafeTrack[] }).cafe_playlist
      if (kept.some(x => x.id === track.id)) return // each song once
      const song: CafeTrack = { id: track.id, title: track.title, ...(track.artist ? { artist: track.artist } : {}), ...(track.image ? { image: track.image } : {}) }
      check(await sb.from('music_player').update({ cafe_playlist: [...kept, song], updated_at: new Date().toISOString() }).eq('id', 1))
    },
    async musicRemoveFromCafePlaylist(trackId) {
      const kept = (check(await sb.from('music_player').select('cafe_playlist').eq('id', 1).single()) as { cafe_playlist: CafeTrack[] }).cafe_playlist
      check(await sb.from('music_player').update({ cafe_playlist: kept.filter(x => x.id !== trackId), updated_at: new Date().toISOString() }).eq('id', 1))
    },
    async musicPlayer() { return check(await sb.from('music_player').select('*').eq('id', 1).single()) as MusicPlayerState },
    async musicSend(action, value) { check(await sb.rpc('music_send', { p_action: action, p_value: value ?? null })) },
    async musicSetQueue(playlist, queue, position) { check(await sb.rpc('music_set_queue', { p_playlist: playlist, p_queue: queue, p_position: position })) },
    async musicReport(report, asDevice) {
      const q = sb.from('music_player').update({ ...report, updated_at: new Date().toISOString() }).eq('id', 1)
      check(await (asDevice ? q.eq('device_id', asDevice) : q))
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
