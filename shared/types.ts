import { msg } from './i18n'
import type { SavedDashboards } from './dashboards'

export type Role = 'admin' | 'employee' | 'kiosk' | 'partner'

/** What an outside business (partner) can be given read-only access to. */
export type PartnerArea = 'calendar' | 'rota' | 'payroll' | 'finances'
export const PARTNER_AREAS: { key: PartnerArea; label: string; detail: string }[] = [
  { key: 'rota', label: msg('Rota'), detail: msg('Published shifts and approved time off') },
  { key: 'payroll', label: msg('Payroll'), detail: msg('Timecards, hours and pay rates') },
  { key: 'finances', label: msg('Finances'), detail: msg('Monthly expenses') },
  { key: 'calendar', label: msg('Calendar'), detail: msg('Holidays and events') },
]

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export type OpeningHours = Partial<Record<DayKey, { open: string; close: string } | null>>

export interface Business {
  /** Its number: 1 is Easy Beans, the first business (the several_businesses migration). */
  id?: number
  name: string
  business_type: string | null
  address: string | null
  phone: string | null
  email: string | null
  instagram: string | null
  /** The business's website (https://…), when it has one. Search Console is matched to it. */
  website?: string | null
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
  /** Sports page, live scores and big nights on Today. Off until an admin turns it on. */
  sports_enabled: boolean
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
  /** Owners' hours on the rota are paid as wages (Rota, Staff wages, Profit & loss). Breakeven counts them either way. */
  owner_pay?: boolean
  auto_timecards_from_rota: boolean
  vacation_days_per_year: number
  /** The languages the team uses (an admin picks them on My account): with two, everyone gets the flags to switch. */
  languages?: ('en' | 'es')[]
  alert_shift_reminders: boolean
  alert_missed_clock_in: boolean
  alert_rota: boolean
  alert_time_off: boolean
  /** Admins are told when someone tags the business on Instagram or mentions it in their story. */
  alert_instagram_mentions?: boolean
  /** Admins are reminded before each public holiday (on unless turned off), this many days ahead, for these kinds. */
  holiday_reminders?: boolean
  holiday_reminder_days?: number
  /** And again the day before (on unless turned off). */
  holiday_reminder_day_before?: boolean
  holiday_reminder_kinds?: ('national' | 'regional' | 'local' | 'area')[]
  /** Pages the admins hid from everyone's menu (Settings → Pages), by page key. */
  hidden_pages?: string[]
  /** Data retention: how many days saved WhatsApp chats are kept (30, 90, 180, 365 or 730; 90 unless changed). */
  whatsapp_retention_days?: number
  /** Menu page: where the menu comes from (custom: kept here, the default; square: the Square item library). */
  menu_source?: 'custom' | 'square'
  /** The menu's sections in order (the printed menus', Square's, or as moved on the Menu page). */
  menu_sections?: string[]
  /** When the menu was last read from Square, and why that failed when it did. */
  menu_synced_at?: string | null
  menu_sync_error?: string | null
  /** Expenses: euros paid back a kilometre driven in a private car (0.26 unless changed). */
  mileage_rate?: number
  /** The owners' changes to the agents (Roles & responsibilities → Agents, shared/agents.ts); null: the usual ones. Only owners change it. */
  agent_views?: import('./agents').AgentViews | null
  /** The weekly routine on everyone's Calendar and Today (on unless an admin turns it off on Calendar → Routine). */
  routine_on_calendar?: boolean
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

/** Customers page: people who buy (customers) and people who might (leads). Admins only. */
export type CustomerKind = 'customer' | 'lead'
/** square: brought in from Square's customer directory, by itself. */
export type CustomerSource = 'walk_in' | 'instagram' | 'facebook' | 'tiktok' | 'website' | 'google' | 'referral' | 'event' | 'square' | 'other'
export interface Customer {
  id: string
  kind: CustomerKind
  first_name: string | null
  last_name: string | null
  email: string | null
  /** "+34 600 000 000", as on profiles. */
  phone: string | null
  company: string | null
  source: CustomerSource
  /** Instagram handle without the @. */
  instagram: string | null
  birthday: string | null
  tags: string[]
  notes: string | null
  /** They agreed to receive marketing (GDPR); consent_at is when, set by the database. */
  marketing_consent: boolean
  consent_at: string | null
  last_contacted_at: string | null
  created_at: string
  updated_at: string
}
/** What the app writes: everything but what the database keeps itself. */
export type CustomerInput = Partial<Omit<Customer, 'consent_at' | 'created_at' | 'updated_at'>>

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
  /** The business they're in; null for someone who signed up and isn't in one yet. */
  business_id?: number | null
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
  /** False: not worked into the rota (an owner, the business's own login); they still sign in. Admins set it on Team. */
  on_rota?: boolean
  /** False: not a person on People or the owners' lanes on Roles & responsibilities (the business's own shared login); they still sign in. Admins set it on Team. */
  on_people?: boolean
}

export interface Preferences {
  theme?: 'system' | 'light' | 'dark'
  textSize?: 'small' | 'default' | 'large' | 'larger'
  contrast?: 'normal' | 'high'
  font?: 'default' | 'readable'
  motion?: 'system' | 'reduce'
  /** Decimal mark for money and numbers: €1.234,50 (comma) or €1,234.50 (point). */
  numberFormat?: 'comma' | 'point'
  /** Page background tint: a brand colour (#RRGGBB). Unset = the house cream. */
  background?: string
  /** Their own order of the menu's sections (Settings → Pages), by section key. */
  navSections?: string[]
  /** Their own order of pages within each menu section: section key → page keys. */
  navOrder?: Record<string, string[]>
  /** Pages they pinned to the top of their menu section (page keys). */
  navPins?: string[]
  /** Pages they hid from their own menu (Settings → Pages), by page key. */
  navHidden?: string[]
  /** The languages they use the app in (My account → Language). With both, flags at the top switch between them. */
  languages?: ('en' | 'es')[]
  /** How they're told about each kind of notification: in the app, on their devices, or both (shared/notify.ts). */
  notify?: Partial<Record<import('./notify').NotifyTopic, import('./notify').NotifyChannel>>
  /** The one shown now. */
  language?: 'en' | 'es'
  /** Their own time zone (IANA, e.g. "Europe/London"): social posts are planned and shown in it. Unset = the café's. */
  timeZone?: string
  /** Their own dashboards (Insights › Dashboards): the widgets on each, and the one open. */
  dashboards?: SavedDashboards
  /** Owners: the agent they're viewing the app as (the Agents button at the top, shared/agents.ts); unset or null: everything. */
  agentView?: string | null
  /** What their calendar shows: the theme days and the weekly routine, and the routine's categories and activities they hid. */
  calendarShow?: import('./routine').CalendarShow
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

export type TimeOffKind = 'vacation' | 'personal' | 'sick' | 'birth' | 'parental' | 'marriage' | 'family' | 'bereavement' | 'moving' | 'urgent' | 'other'

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
  vacation: msg('Holiday'), personal: msg('Personal day'), sick: msg('Sick'), birth: msg('Birth and childcare'),
  parental: msg('Parental leave'), marriage: msg('Marriage'), family: msg('A relative in hospital or seriously ill'),
  bereavement: msg('Bereavement'), moving: msg('Moving house'), urgent: msg('Urgent family reason'), other: msg('Other'),
}
export const TIME_OFF_KINDS = Object.keys(TIME_OFF_LABELS) as TimeOffKind[]
/** Leave nobody books ahead: it can be recorded for days already gone (the SQL rule is the same). */
export const TIME_OFF_AFTER_THE_FACT: TimeOffKind[] = ['sick', 'birth', 'family', 'bereavement', 'urgent']

export type IntegrationProvider = 'google_business' | 'whatsapp' | 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'spotify' | 'square' | 'stripe' | 'sumup' | 'meta_ads' | 'higgsfield' | ConnectorProvider | CalendarApp
/** Connections made with one sign-in with Google or Microsoft (email, files, café YouTube Music, Search Console, Google Ads). */
export type ConnectorProvider = 'gmail' | 'outlook' | 'google_drive' | 'onedrive' | 'youtube_music' | 'search_console' | 'google_ads'
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
  external: {
    locations?: { name: string; title: string; address?: string }[]; location?: string; closed_on_holidays?: boolean; playlist?: SpotifyPlaylist
    /** Facebook and LinkedIn: the Pages the account manages, and the chosen one (LinkedIn: 'me' = the person's own profile). */
    pages?: { id: string; name: string }[]; page_id?: string; page_name?: string
    /** LinkedIn: who signed in, and when the 60-day access runs out. */
    member?: { id: string; name: string }; expires_at?: string
    /** Gmail or Outlook: it may also be read, for invoices that come by email (allowed from Invoices). */
    reads_mail?: boolean
    /** Search Console: the websites the account can read, and the chosen one (`https://…/` or `sc-domain:…`). */
    sites?: string[]; site?: string
    /** SumUp: the merchant account and its currency. */
    merchant_code?: string; currency?: string
    /** TikTok: posts stay private until TikTok audits the app. */
    private_only?: boolean
    /** Instagram: whether the account allowed reading and answering messages, and seeing posts it's tagged in. */
    can_message?: boolean; can_see_tags?: boolean
    /** Instagram: the connected account's username (without the @). */
    username?: string
    /** Meta Ads and Google Ads: the ad accounts the person can use, and the chosen one. */
    accounts?: { id: string; name: string; currency: string }[]; account_id?: string; account_name?: string
    /** Meta Ads: allowed to pause, resume and change budgets (not only read). */
    can_manage?: boolean
    /** Google Maps: when the menu last went onto the listing, how many items, and why Google last refused it. */
    menu_sent_at?: string; menu_items?: number; menu_error?: string | null
  }
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
  /** Where photos and videos for posts are kept: the connected Drive/OneDrive, R2, or nowhere yet. */
  media_storage?: 'google_drive' | 'onedrive' | 'r2' | null
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
  national: { label: msg('National holiday'), colour: '#c62828' },
  regional: { label: msg('Andalucía holiday'), colour: '#2e7d32' },
  local:    { label: msg('Local holiday'), colour: '#6a1b9a' },
  area:     { label: msg('Nearby town holiday'), colour: '#8d6e63' },
  event:    { label: msg('Local event / feria'), colour: '#ef6c00' },
  sports:   { label: msg('Football'), colour: '#1565c0' },
  business: { label: msg('Business'), colour: '#37474f' },
  staff:    { label: msg('Staff'), colour: '#00838f' },
}

export const FLAG_LABELS: Record<string, string> = {
  missed_break: msg('Missed break'),
  over_daily_limit: msg('Over 9h'),
  unscheduled: msg('Unscheduled'),
  auto_clock_out: msg('Auto clock-out'),
  edited: msg('Edited'),
  early_override: msg('Early (override)'),
  from_rota: msg('From rota'),
}

/** In-app notification (the bell). */
export interface AppNotification {
  id: number; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null
  /** One with buttons: an Instagram mention (Repost / Ignore), data.mention its id. A review, a bank
   *  holiday coming up (data.event, data.date, data.days, data.name), or a test from the Notifications page. */
  kind?: 'instagram_mention' | 'review' | 'bank_holiday' | 'test' | null
  data?: { mention?: string; review?: string; event?: string; date?: string; days?: number; name?: string; category?: string; town?: string | null; offer?: string; item?: string }
}

/** A holiday an admin left out of the reminders, or one that's been reminded about. */
export interface HolidayReminder { event_id: string; remind: boolean; sent_for: string | null; sent_at: string | null; day_before_for?: string | null }

/** A phone or computer that gets this person's push notifications. */
export interface PushDevice { id: string; endpoint: string; device: string | null; created_at: string; last_ok_at: string | null }

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
  /** The brand's sound (moods its music has, and never has): suggestions and AI music start here. */
  sound_moods?: string[]
  sound_avoid?: string[]
  updated_at: string
}

/** A personal access key for AIs and automations (the key itself is shown only when it's made). */
export interface ApiKey { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null }

/** Social planner: one post, sent to each chosen network at the planned time. */
export type SocialNetwork = 'instagram' | 'facebook' | 'tiktok' | 'google' | 'linkedin'
/** What kind of post: a feed post (one photo), a carousel (2–10 photos/videos), a reel (one video) or a story. */
export type PostKind = 'post' | 'carousel' | 'reel' | 'story'
/** A photo or video of a post, at a public address the networks fetch it from. */
export interface PostMedia { url: string; type: 'image' | 'video' }

/** A track in the business's music library (migration 86). */
export interface MusicTrack {
  id: string
  /** starter: Business Agent's pack; ai: made for this business with ElevenLabs; upload: its own file. */
  source: 'starter' | 'ai' | 'upload'
  title: string
  artist: string | null
  url: string
  duration_s: number
  bpm: number | null
  energy: number | null
  moods: string[]
  genre: string | null
  vocals: boolean
  /** Where the best part starts, and the shape of the sound (0–1, a few hundred points). */
  highlight_s: number
  waveform: number[] | null
  licence: Record<string, unknown>
  saved: boolean
  hidden: boolean
  created_at: string
}

/** Music on a post: mixed into the file (stories and reels), or a song to add in Instagram (reminders). */
export type PostMusic = MixedMusic | InstagramMusic
export interface MixedMusic {
  mode: 'mixed'
  track_id: string
  title: string
  artist: string | null
  /** The track's file, and the part used. */
  url: string
  start: number
  seconds: number
  music_volume: number
  original_volume: number
  fade_in: boolean
  fade_out: boolean
  /** Reels: the sound's name on Instagram. */
  audio_name?: string | null
  /** Photo stories: "♫ title · artist" drawn on the photo. */
  label?: boolean
  /** The photo, video or photos before the music went in (changing the music starts from these). */
  source_media: PostMedia[]
  /** A reel from photos: where each photo starts. */
  cuts?: number[]
  /** The track's tempo, so a reel's photos change on the beat. */
  bpm?: number | null
  /** The file with the music in (the post's media), and the choices it was made with. */
  rendered_url: string | null
  rendered_for: string | null
}
export interface InstagramMusic { mode: 'in_instagram'; song: string; start: number }

/** What making an AI track would cost now (public.ai_music_quote). */
export interface AiMusicQuote {
  allowed: boolean
  plan: string
  uses: number
  free: number
  free_left: number
  included: number
  unit_cents: number
  price_cents: number
  spent_cents: number
  limit_cents: number
  reason: string | null
}

/** One "Make with AI" (public.music_generations): for the Billing page's list. */
export interface MusicGeneration {
  id: string
  prompt: string
  seconds: number
  uses: number
  status: 'working' | 'done' | 'failed' | 'refused'
  free: number
  price_cents: number
  kept_id: string | null
  error: string | null
  charged_at: string | null
  created_at: string
}
export interface SocialPost {
  id: string
  kind: PostKind
  caption: string
  /** The first photo or video (the cover); `media` has them all, in order. */
  image_url: string | null
  media: PostMedia[]
  targets: SocialNetwork[]
  scheduled_at: string | null
  /** true: it posts itself at the time. false: a reminder at the time, and you post it yourself. */
  auto: boolean
  /** due: a reminder whose time has come (post it yourself, then mark it posted). */
  status: 'draft' | 'scheduled' | 'due' | 'publishing' | 'published' | 'partly' | 'failed'
  results: Partial<Record<SocialNetwork, { status: 'queued' | 'retrying' | 'published' | 'failed'; id?: string; url?: string; error?: string; at?: string; manual?: boolean }>>
  /** Music on it (docs/SOCIAL_MUSIC_PLAN.md); null: none. */
  music?: PostMusic | null
  /** Likes and comments Instagram counted, for suggestions that learn what works. */
  insights?: { likes: number; comments: number; at: string } | null
  created_at: string
  published_at: string | null
}

/** Takings from the payment system (Square, Stripe or SumUp), per day in the business's time zone. */
/** How a payment was paid: card, cash, a phone wallet (Apple Pay, Google Pay) or anything else (gift card, bank, external). */
export type PayMethod = 'card' | 'cash' | 'wallet' | 'other'
/**
 * One local day of takings. `gross` excludes tips. `hours` (24 values, sales by local hour) and
 * `methods` (sales by how people paid) come from Square and SumUp; Stripe sends hours only.
 */
/** Where takings come from: the till (Square or SumUp) and/or Stripe (online payments), which can be added to either. */
export type SalesProvider = 'square' | 'stripe' | 'sumup'
export interface SalesDay {
  date: string; gross: number; tips: number; refunds: number; payments: number; hours?: number[]; methods?: Partial<Record<PayMethod, number>>
  /** Gross sales by payment system, when more than one is connected. */
  sources?: Partial<Record<SalesProvider, number>>
}
export interface Sales {
  /** The first payment system the takings come from (the till before Stripe); `providers` lists them all. */
  provider?: SalesProvider
  providers?: SalesProvider[]
  currency: string
  days: SalesDay[]
  /** Payment systems that couldn't be read just now (the others' takings are still shown). */
  failed?: { provider: SalesProvider; error: string }[]
  /** When the service was last asked (the Worker keeps its answer a while: shared/refresh.ts). */
  fetched_at?: string
}
/** One item on the Sales page's best sellers (Square orders): units sold and their sales before discounts. */
export interface SalesItem { name: string; quantity: number; gross: number }
/** Best sellers, or why there are none: Stripe and SumUp send no items, or Square was connected before items were asked for. */
export interface SalesItems {
  items: SalesItem[] | null; reason?: 'stripe' | 'sumup' | 'reconnect'; /** Square's items, with Stripe's online sales not among them. */ partial?: 'stripe'
  /** When the service was last asked (the Worker keeps its answer a while: shared/refresh.ts). */
  fetched_at?: string
}

/** Search Console (Google): how the website did in Google Search. Figures lag Google by 2–3 days. */
export interface SearchRow { clicks: number; impressions: number; /** 0–1 */ ctr: number; /** average position, 1 = top */ position: number }
export interface SearchReport {
  site: string; from: string; to: string
  totals: SearchRow
  days: (SearchRow & { date: string })[]
  queries: (SearchRow & { query: string })[]
  pages: (SearchRow & { page: string })[]
  devices: (SearchRow & { device: 'DESKTOP' | 'MOBILE' | 'TABLET' })[]
  countries: (SearchRow & { country: string })[]  // ISO 3166 alpha-3 lower-case as Google returns it
  /** When the service was last asked (the Worker keeps its answer a while: shared/refresh.ts). */
  fetched_at?: string
}

/** To Do List: a category the admins manage (jobs are grouped by these). */
export interface TodoCategory { id: string; name: string; hint: string | null; colour: string; sort: number }
/** Where a job is on the board: to do, being done, or done (done is also the list's tick). */
export type TodoStatus = 'todo' | 'doing' | 'done'
/** One job on the To Do List. `category_id` is null after its category was removed. */
export interface Todo {
  id: string
  title: string
  category_id: string | null
  section: string | null
  assignee_id: string | null
  done: boolean
  status: TodoStatus
  done_at: string | null
  starred: boolean
  pinned: boolean
  position: number
  created_at: string
}
export type TodoPatch = Partial<Pick<Todo, 'title' | 'category_id' | 'section' | 'assignee_id' | 'done' | 'status' | 'starred' | 'pinned' | 'position'>>

/** Café music (Music page): the café account's playlists, whichever service is connected. */
export interface CafeMusicLibrary { provider: 'youtube' | 'spotify' | null; account: string | null; playlists: SpotifyPlaylist[]; approved: SpotifyPlaylist | null; /** Sample songs (demo): played by a pretend player. */ demo?: boolean }
/** One song in the café queue (YouTube video id). */
export interface CafeTrack { id: string; title: string; artist?: string; image?: string }
export type MusicAction = 'play' | 'pause' | 'next' | 'previous' | 'jump' | 'seek' | 'volume'
/** The shared café player: which device plays, the queue, and where it's up to. */
export interface MusicPlayerState {
  device_id: string | null
  device_name: string | null
  playlist: SpotifyPlaylist | null
  queue: CafeTrack[]
  queue_version: number
  /** Playlist ids in the order they play, one after another. */
  playlist_order: string[]
  /** The café playlist: songs the team added from a search, in the order they were added (the `cafe_playlist` migration). */
  cafe_playlist?: CafeTrack[]
  position: number
  playing: boolean
  elapsed: number
  duration: number
  volume: number
  command: { action: MusicAction; value: number | null; by: string | null } | null
  command_seq: number
  heartbeat_at: string | null
  updated_at: string
}
/** What the speaker reports about itself. */
export type MusicPlayerReport = Partial<Pick<MusicPlayerState, 'device_id' | 'device_name' | 'position' | 'playing' | 'elapsed' | 'duration' | 'volume' | 'heartbeat_at'>>
