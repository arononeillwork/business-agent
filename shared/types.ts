export type Role = 'admin' | 'employee' | 'kiosk'

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
  opening_hours: OpeningHours
  peak_hours: { start: string; end: string } | null
  team_channel: 'whatsapp' | 'slack' | 'sms' | null
  owners: string[]
  suppliers: { name: string; type?: string; phone?: string; email?: string; notes?: string }[]
  towns_followed: string[]
  notes: string | null
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
}

export interface Profile {
  id: string
  full_name: string
  email: string | null
  role: Role
  can_see_pay: boolean
  colour: string
  active: boolean
  phone: string | null
  birth_date: string | null
  whatsapp_opt_in?: boolean
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

export type IntegrationProvider = 'google_business' | 'whatsapp' | 'instagram'

export interface Integration {
  provider: IntegrationProvider
  status: 'connected' | 'needs_setup' | 'error' | 'disconnected'
  account_label: string | null
  external: { locations?: { name: string; title: string; address?: string }[]; location?: string; closed_on_holidays?: boolean }
  connected_at: string | null
  last_sync_at: string | null
  last_error: string | null
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
