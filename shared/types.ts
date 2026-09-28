export type Role = 'admin' | 'employee' | 'kiosk' | 'partner'

/** What an outside business (partner) can be given read-only access to. */
export type PartnerArea = 'calendar' | 'rota' | 'payroll' | 'finances'
export const PARTNER_AREAS: { key: PartnerArea; label: string; detail: string }[] = [
  { key: 'rota', label: 'Rota', detail: 'Published shifts and approved time off' },
  { key: 'payroll', label: 'Payroll', detail: 'Timecards, hours and pay rates' },
  { key: 'finances', label: 'Finances', detail: 'Monthly expenses' },
  { key: 'calendar', label: 'Calendar', detail: 'Holidays and events' },
]

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export type OpeningHours = Partial<Record<DayKey, { open: string; close: string } | null>>

export interface Business {
  name: string
  business_type: string | null
  address: string | null
  phone: string | null
  email: string | null
  instagram: string | null
  timezone: string
  /** ISO 4217 code, e.g. EUR. Money everywhere is shown in it. */
  currency: string
  /** Spanish CIF (company) or NIF/NIE (self-employed), upper case, no spaces. */
  tax_id: string | null
  opening_hours: OpeningHours
  peak_hours: { start: string; end: string } | null
  team_channel: 'whatsapp' | 'slack' | 'sms' | null
  owners: string[]
  suppliers: { name: string; type?: string; phone?: string; email?: string; notes?: string }[]
  towns_followed: string[]
  notes: string | null
  /** When an admin finished or skipped the set-up wizard; until then Today shows a prompt. */
  setup_completed_at?: string | null
  updated_at: string
}

export interface Settings {
  early_clock_in_minutes: number
  unscheduled_clock_in: 'flag' | 'block'
  auto_clock_out_minutes: number
  forgot_clock_out_grace_minutes: number
  phone_clock_in: 'off' | 'anywhere' | 'near_cafe'
  min_break_minutes: number
  break_after_hours: number
  max_daily_hours: number
  max_weekly_hours: number
  min_rest_hours: number
  approval_weekday: number
  employer_cost_multiplier: number
  auto_timecards_from_rota: boolean
  vacation_days_per_year: number
  alert_shift_reminders: boolean
  alert_missed_clock_in: boolean
  alert_rota: boolean
  alert_time_off: boolean
}

export interface Expense {
  id: string
  name: string
  amount: number
  category: string | null
  notes: string | null
  active: boolean
  sort: number
  source: 'sheet' | 'app' | 'ai'
  updated_at: string
}

/** A message or update the app has sent (or is sending) to an outside service. */
export interface OutboxItem {
  id: number
  kind: 'whatsapp' | 'google_sync' | 'google_post' | 'instagram_post'
  payload: { template?: string; to?: string; profile_id?: string; caption?: string }
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'dead'
  attempts: number
  last_error: string | null
  delivery: string | null
  created_at: string
  sent_at: string | null
}

export type ContactMethod = 'sms' | 'email' | 'whatsapp' | 'call' | 'slack' | 'telegram'

export interface Profile {
  id: string
  full_name: string
  email: string | null
  role: Role
  can_see_pay: boolean
  colour: string
  active: boolean
  phone: string | null
  /** How they like to be contacted. Only sms, email and whatsapp can be chosen for now. */
  contact_method?: ContactMethod | null
  birth_date: string | null
  whatsapp_opt_in?: boolean
  /** Partners only: their company and the areas they can see. */
  partner_company?: string | null
  partner_access?: PartnerArea[]
  /** Appearance and accessibility, chosen by the person (My account → Appearance). */
  preferences?: Preferences
}

export interface Preferences {
  theme?: 'system' | 'light' | 'dark'
  textSize?: 'small' | 'default' | 'large' | 'larger'
  contrast?: 'normal' | 'high'
  font?: 'default' | 'readable'
  motion?: 'system' | 'reduce'
  /** Decimal mark for money and numbers: 1.234,50 € (comma) or €1,234.50 (point). */
  numberFormat?: 'comma' | 'point'
  /** Page background tint: a brand colour (#RRGGBB). Unset = the house cream. */
  background?: string
  /** Their own order of pages within each menu section: section key → page keys. */
  navOrder?: Record<string, string[]>
}

export interface Position {
  id: number
  name: string
  colour: string
  sort: number
  active: boolean
}

export interface BreakType {
  id: number
  name: string
  minutes: number
  paid: boolean
}

export interface Shift {
  id: string
  profile_id: string | null
  position_id: number | null
  starts_at: string
  ends_at: string
  break_minutes: number
  note: string | null
  status: 'draft' | 'published'
}

export interface TimeEntry {
  id: string
  profile_id: string
  position_id: number | null
  shift_id: string | null
  clock_in: string
  clock_out: string | null
  source: string
  clock_out_source: string | null
  flags: string[]
  note: string | null
  approved_at: string | null
  work_date: string
  total_minutes: number
  break_minutes: number
  unpaid_break_minutes: number
  paid_minutes: number
  on_holiday: boolean
}

export interface OpenBreak {
  id: string
  time_entry_id: string
  started_at: string
  break_type_id: number | null
}

export interface PayRate {
  profile_id: string
  effective_from: string
  hourly_rate: number
}

export type EventCategory =
  | 'national' | 'regional' | 'local' | 'area' | 'event' | 'sports' | 'business' | 'staff'

export interface CalendarEvent {
  id: string
  starts_on: string
  ends_on: string | null
  starts_at: string | null
  title: string
  category: EventCategory
  town: string | null
  competition: string | null
  source: string
  confirmed: boolean
  visibility: 'all' | 'admins'
}

export interface CorrectionRequest {
  id: string
  time_entry_id: string | null
  profile_id: string
  requested_clock_in: string | null
  requested_clock_out: string | null
  note: string
  status: 'pending' | 'approved' | 'declined' | 'expired'
  created_at: string
  expires_at: string
  decision_note: string | null
}

export interface TimeEntryChange {
  id: number
  time_entry_id: string
  changed_by: string | null
  changed_at: string
  via: string
  reason: string
  old_values: { clock_in?: string; clock_out?: string } | null
  new_values: { clock_in?: string; clock_out?: string } | null
}

export interface KioskPerson {
  id: string
  full_name: string
  colour: string
  status: 'in' | 'out' | 'break'
  since: string | null
  has_pin: boolean
}

export type TimeOffKind = 'vacation' | 'personal' | 'sick' | 'other'

export interface TimeOff {
  id: string
  profile_id: string
  starts_on: string
  ends_on: string
  kind: TimeOffKind
  note: string | null
  status: 'pending' | 'approved' | 'declined' | 'cancelled'
  created_at: string
  decision_note: string | null
}

export const TIME_OFF_LABELS: Record<TimeOffKind, string> = {
  vacation: 'Holiday', personal: 'Personal day', sick: 'Sick', other: 'Other',
}

export type IntegrationProvider = 'google_business' | 'whatsapp' | 'instagram' | 'spotify' | ConnectorProvider | CalendarApp
/** Connections made with one sign-in with Google or Microsoft (email, files, café YouTube Music). */
export type ConnectorProvider = 'gmail' | 'outlook' | 'google_drive' | 'onedrive' | 'youtube_music'
/** Calendar apps that subscribe to the team calendar link. */
export type CalendarApp = 'google_calendar' | 'outlook_calendar'

export interface SpotifyPlaylist { id: string; name: string; image?: string; tracks: number; url: string; owner?: string }

// Personal music (Music page): each person connects their own account.
export type MusicProvider = 'spotify' | 'youtube'
export interface MusicAccount { provider: MusicProvider; account_label: string | null; connected_at: string }
export interface MyMusic { configured: Record<MusicProvider, boolean>; accounts: MusicAccount[] }
export interface MusicPlaylist { id: string; name: string; image?: string; tracks: number; url: string; owner?: string; provider: MusicProvider }
export interface MyNowPlaying { playing: boolean; track?: string; artist?: string; device?: string; image?: string }

export interface MusicNow {
  /** Which app the café uses. Spotify can be played/paused from the app; YouTube Music is opened on the café device. */
  provider?: 'spotify' | 'youtube'
  controls?: boolean
  playlist: SpotifyPlaylist | null
  playing: boolean
  track?: string
  artist?: string
  device?: string
  onApprovedPlaylist: boolean
}

export interface Integration {
  provider: IntegrationProvider
  /** 'connected' only once the Worker has proven it works; 'pending' = chosen, waiting to be proven. */
  status: 'connected' | 'pending' | 'needs_setup' | 'error' | 'disconnected'
  account_label: string | null
  external: { locations?: { name: string; title: string; address?: string }[]; location?: string; closed_on_holidays?: boolean; playlist?: SpotifyPlaylist }
  connected_at: string | null
  last_sync_at: string | null
  last_error: string | null
  /** When the Worker last proved it still works (on connect, nightly, or "Check now"). */
  last_checked_at?: string | null
}

export interface IntegrationsState {
  integrations: Integration[]
  configured: Record<IntegrationProvider, boolean>
  queue: { kind: string; status: string }[]
}

export interface InstagramProfile {
  username: string
  name?: string
  followers_count: number
  media_count: number
  profile_picture_url?: string
  biography?: string
  recent: { id: string; caption?: string; media_url?: string; thumbnail_url?: string; permalink: string; timestamp: string; like_count?: number; comments_count?: number }[]
}

export const CATEGORY_META: Record<EventCategory, { label: string; colour: string }> = {
  national: { label: 'National holiday', colour: '#c62828' },
  regional: { label: 'Andalucía holiday', colour: '#2e7d32' },
  local:    { label: 'Local holiday', colour: '#6a1b9a' },
  area:     { label: 'Nearby town holiday', colour: '#8d6e63' },
  event:    { label: 'Local event / feria', colour: '#ef6c00' },
  sports:   { label: 'Football', colour: '#1565c0' },
  business: { label: 'Business', colour: '#37474f' },
  staff:    { label: 'Staff', colour: '#00838f' },
}

export const FLAG_LABELS: Record<string, string> = {
  missed_break: 'Missed break',
  over_daily_limit: 'Over 9h',
  unscheduled: 'Unscheduled',
  auto_clock_out: 'Auto clock-out',
  edited: 'Edited',
  early_override: 'Early (override)',
  from_rota: 'From rota',
}

/** In-app notification (the bell). */
export interface AppNotification { id: number; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null }

/** A bell switched on for a calendar event or sports fixture: admins are reminded before it. */
export interface EventAlert { kind: 'calendar' | 'sports'; ref_id: string; remind_at: string; sent_at: string | null }

/** Brand guidelines (Café → Brand): logo, colours and fonts, set by admins. */
export interface BrandColour { name: string; hex: string; role: 'primary' | 'secondary' | 'accent' | 'base'; use?: string }
export interface Brand {
  logo: string | null
  logo_mark: string | null
  colours: BrandColour[]
  heading_font: string
  body_font: string
  notes: string | null
  updated_at: string
}
