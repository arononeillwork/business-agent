import type {
  BreakType, Business, CalendarEvent, CorrectionRequest, KioskPerson, OpenBreak, PayRate,
  Position, Profile, Settings, Shift, TimeEntry, TimeEntryChange,
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
  updatePassword(password: string): Promise<void>

  // reads
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
  invite(email: string, fullName: string, role: 'admin' | 'employee' | 'kiosk'): Promise<void>

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
