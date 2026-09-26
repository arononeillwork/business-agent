import type {
  Expense, InstagramProfile, IntegrationsState, MusicNow, OutboxItem, OpeningHours, SpotifyPlaylist, TimeOff, TimeOffKind,
  BreakType, Business, CalendarEvent, CorrectionRequest, KioskPerson, OpenBreak, PayRate,
  PartnerArea, Position, Profile, Settings, Shift, TimeEntry, TimeEntryChange,
} from '../../shared/types'

export type ShiftInput = Omit<Shift, 'id' | 'status'> & { id?: string; status?: Shift['status'] }
export type EventInput = Omit<CalendarEvent, 'id' | 'source' | 'competition'> & { id?: string; competition?: string | null }

export interface ClockState {
  entry: TimeEntry | null
  openBreak: OpenBreak | null
}

export interface KioskResult {
  action: 'in' | 'out' | 'break_start' | 'break_end'
  at: string
  full_name: string
  summary?: TimeEntry | null
}

/** Everything the UI needs. Implemented by Supabase (live) and in memory (demo). */
export interface Api {
  mode: 'live' | 'demo'

  // auth
  currentUserId(): Promise<string | null>
  onAuthChange(cb: () => void): () => void
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  sendPasswordReset(email: string): Promise<void>
  /** Email a 6-digit sign-in code (invited accounts only), then sign in with it. No link to click. */
  sendSignInCode(email: string): Promise<void>
  verifySignInCode(email: string, code: string): Promise<void>
  updatePassword(password: string): Promise<void>

  // reads
  /** A problem signing in from an email or sign-in link, to show on the sign-in screen. */
  authError?(): string | null
  /** Which outside sign-in methods are switched on (so a button never leads to an error page). */
  signInMethods(): Promise<{ google: boolean; microsoft: boolean }>
  me(): Promise<Profile | null>
  business(): Promise<Business>
  adminNotes(): Promise<string | null>
  settings(): Promise<Settings>
  profiles(): Promise<Profile[]>
  positions(): Promise<Position[]>
  breakTypes(): Promise<BreakType[]>
  payRates(): Promise<PayRate[]>
  shifts(fromIso: string, toIso: string): Promise<Shift[]>
  timeEntries(fromIso: string, toIso: string): Promise<TimeEntry[]>
  clockState(): Promise<ClockState>
  events(fromDate: string, toDate: string): Promise<CalendarEvent[]>
  corrections(): Promise<CorrectionRequest[]>
  entryChanges(entryId: string): Promise<TimeEntryChange[]>

  // time tracking
  clockIn(positionId?: number | null): Promise<void>
  clockOut(): Promise<TimeEntry>
  startBreak(breakTypeId?: number | null): Promise<void>
  endBreak(): Promise<void>
  editEntry(id: string, clockIn: string | null, clockOut: string | null, reason: string): Promise<void>
  addEntry(profileId: string, clockIn: string, clockOut: string, reason: string, positionId?: number | null): Promise<void>
  requestCorrection(entryId: string, clockIn: string | null, clockOut: string | null, note: string): Promise<void>
  decideCorrection(id: string, approve: boolean, note?: string): Promise<void>
  approveWeek(monday: string): Promise<number>
  /** Create timecards from the rota for past shifts nobody clocked in for. */
  fillFromRota(monday: string): Promise<number>

  // rota
  saveShift(shift: ShiftInput): Promise<void>
  deleteShift(id: string): Promise<void>
  takeOpenShift(id: string): Promise<void>

  // calendar
  saveEvent(event: EventInput): Promise<void>
  deleteEvent(id: string): Promise<void>

  // business, team
  updateBusiness(patch: Partial<Business>): Promise<void>
  updateAdminNotes(notes: string): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  updateProfile(id: string, patch: Partial<Profile>): Promise<void>
  setPin(pin: string, profileId?: string): Promise<void>
  setPayRate(profileId: string, hourlyRate: number): Promise<void>
  /** Email an invite, or (with a temporary password) create the account straight away. */
  invite(email: string, fullName: string, role: 'admin' | 'employee' | 'kiosk', password?: string): Promise<void>
  /** Admins: give someone (not an admin) a new temporary password to sign in with. */
  setTemporaryPassword(userId: string, password: string): Promise<void>

  // partners: outside businesses with read-only access to chosen areas (admins manage them)
  partners(): Promise<Profile[]>
  invitePartner(email: string, fullName: string, company: string, access: PartnerArea[], password?: string): Promise<void>
  setPartnerAccess(id: string, company: string, access: PartnerArea[]): Promise<void>

  // time off
  timeOff(fromDate: string, toDate: string): Promise<TimeOff[]>
  vacationDaysUsed(profileId: string, year: number): Promise<number>
  requestTimeOff(startsOn: string, endsOn: string, kind: TimeOffKind, note: string): Promise<void>
  cancelTimeOff(id: string): Promise<void>
  decideTimeOff(id: string, approve: boolean, note?: string, releaseShifts?: boolean): Promise<number>

  // sign-in with Google / Microsoft (Supabase OAuth)
  signInWithGoogle(): Promise<void>
  signInWithMicrosoft(): Promise<void>

  // finances (admins with pay access)
  expenses(): Promise<Expense[]>
  saveExpense(expense: Partial<Expense> & { name: string; amount: number }): Promise<void>
  deleteExpense(id: string): Promise<void>

  // alerts log (admins)
  sentAlerts(limit?: number): Promise<OutboxItem[]>

  // connections: Google Business Profile, WhatsApp, Instagram (admins)
  integrations(): Promise<IntegrationsState>
  connectGoogle(): Promise<void>
  chooseGoogleListing(location: string | null, closedOnHolidays?: boolean): Promise<void>
  syncGoogleNow(): Promise<void>
  googleHours(): Promise<OpeningHours>
  disconnect(provider: string): Promise<void>
  whatsappTest(to: string): Promise<void>
  instagramProfile(): Promise<InstagramProfile>
  uploadPhoto(file: File): Promise<string>
  share(caption: string, imageUrl: string | null, targets: ('instagram' | 'google')[], eventId?: string): Promise<number>
  sendRota(monday: string): Promise<number>
  connectSpotify(): Promise<void>
  spotifyPlaylists(): Promise<{ playlists: SpotifyPlaylist[]; approved: SpotifyPlaylist | null }>
  chooseSpotifyPlaylist(playlist: SpotifyPlaylist): Promise<void>

  // café music (staff): only the approved playlist
  musicNow(): Promise<MusicNow>
  musicPlay(): Promise<void>
  musicPause(): Promise<void>

  // kiosk
  kioskRoster(): Promise<KioskPerson[]>
  kioskPunch(profileId: string, pin: string, action: KioskResult['action'],
    positionId?: number | null, breakTypeId?: number | null): Promise<KioskResult>
}

/** Latest effective pay rate per person. */
export const currentRates = (rates: PayRate[]) => {
  const map = new Map<string, number>()
  for (const r of [...rates].sort((a, b) => a.effective_from.localeCompare(b.effective_from))) {
    map.set(r.profile_id, Number(r.hourly_rate))
  }
  return map
}
