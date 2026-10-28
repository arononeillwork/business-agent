import type { AiMusicQuote, MusicGeneration, MusicTrack } from '../../shared/types'
import type { ApiKey, AppNotification, Brand, BreakType, Business, CalendarApp, CalendarEvent, ConnectorProvider, ContactMethod, CorrectionRequest, Customer, CustomerInput, EventAlert, Expense, InstagramProfile, Integration, PostMedia, Sales, SalesItems, SearchReport, SocialNetwork, SocialPost, IntegrationProvider, IntegrationsState, KioskPerson, MusicNow, MusicPlaylist, MusicProvider, MyMusic, MyNowPlaying, OpenBreak, OpeningHours, OutboxItem, PartnerArea, PayRate, Position, Profile, Settings, Shift, SpotifyPlaylist, TimeEntry, TimeEntryChange, TimeOff, TimeOffKind, Todo, TodoCategory, TodoPatch, CafeMusicLibrary, CafeTrack, MusicAction, MusicPlayerReport, MusicPlayerState } from '../../shared/types'
import type { Billing, Interval, PlanId } from '../../shared/plans'
import type { SportsCompetition, SportsEvent, SportsFavourite } from '../../shared/sports'
import type { InboxConversation, InboxState, InboxThread } from '../../shared/messages'
import type { ReferralState } from '../../shared/referrals'
import type { KindInfo } from '../../shared/social'
import type { InstagramMention } from '../../shared/mentions'
import type { FilingRecord, Quarter, TaxDocKind, TaxDocument, TaxSettings } from '../../shared/tax'
import type { InboxInvoice, InboxState as InvoiceInbox, Invoice, InvoiceInput } from '../../shared/invoices'
import type { Licence, LicenceInput } from '../../shared/licences'
import type { KeptDocument, StorageFolder } from '../../shared/documents'
import type { MoneyItem, MoneyItemInput } from '../../shared/creditDebit'
import type { LegalDocument, LegalDocumentPatch, LegalSource, LegalStorage, StorageListing } from '../../shared/legalDocs'
import type { Benefit, BenefitInput, LeaveAllowance } from '../../shared/benefits'
import type { LoggedReward, RepReward, RepSettings, RewardLog, RewardRule, RewardRuleInput, SalesRep, SalesRepInput } from '../../shared/reps'
import type { KittyEntry, KittyEntryInput, KittyGoal, KittyGoalInput, KittySettings } from '../../shared/kitty'
import type { JobRole, JobRoleInput } from '../../shared/roles'
import type { TeamRole } from '../../shared/teamRoles'
import type { RuleSection, RuleSectionInput, RulesRead } from '../../shared/staffRules'
import type { Contractor, ContractorInput, OutsourcedJob, OutsourcedJobInput } from '../../shared/outsourcing'
import type { PnlLine, PnlLineInput, PnlSettings } from '../../shared/pnl'
import type { GrantApplication, GrantApplicationInput, GrantProfile } from '../../shared/grants'
import type { GiftCard, GiftCards, LoyaltyState } from '../../shared/loyalty'
import type { MovementInput, StockItem, StockItemInput, StockMovement, Supplier, SupplierInput, StockPrice, WasteEdit } from '../../shared/stock'
import type { Recipe, RecipeInput } from '../../shared/recipes'
import type { MenuDesign, MenuDesignInput, MenuImage, MenuImageRequest, MenuItem, MenuItemInput } from '../../shared/menu'
import type { DisplayFeed, Screen, ScreenInput } from '../../shared/screens'
import type { AdPlatform, AdSettings, AdsReport, CampaignPatch } from '../../shared/ads'
import type { ReviewsState } from '../../shared/reviews'
import type { PageSpeed, Strategy, WebsiteReport, WebsiteState } from '../../shared/seo'
import type { Competition, CompetitionEntry, CompetitionInput, EntryInput } from '../../shared/competitions'
import type { Enquiry, EnquiryInput, NewLead } from '../../shared/leads'
import type { ClaimInput, ExpenseClaim } from '../../shared/claims'
import type { Campaign, CampaignInput } from '../../shared/campaigns'
import type { Applicant, ApplicantInput, JobOpening, OpeningInput } from '../../shared/hiring'
import type { CheckInput, PointInput, SafetyCheck, SafetyPoint } from '../../shared/foodSafety'
import type { Allergen, Diet, MenuAllergens } from '../../shared/allergens'
import type { BrandDocument } from '../../shared/brandDocs'
import type { TipPool, TipPoolInput, TipShare } from '../../shared/tips'
import type { CompetitorData, CompetitorInput, CompetitorNoteInput, CompetitorPrice, CompetitorSettings, NearbyPlace, PriceItem } from '../../shared/localCompetitors'

export type ShiftInput = Omit<Shift, 'id' | 'status'> & { id?: string; status?: Shift['status'] }
export type EventInput = Omit<CalendarEvent, 'id' | 'source' | 'competition'> & { id?: string; competition?: string | null }

/** Outside accounts people can sign in with (Supabase Auth providers; Microsoft is Supabase's "azure"). */
export type SocialProvider = 'google' | 'apple' | 'facebook' | 'microsoft'
export const SOCIAL_PROVIDERS: SocialProvider[] = ['google', 'apple', 'facebook', 'microsoft']
export type SignInMethods = Record<SocialProvider, boolean> & { signup?: boolean }

/** The plan in force for the business, its limits and what's used (public.plan_status()). */
export interface PlanStatus {
  plan: PlanId
  limits: { people: number | null; social_accounts: number; posts_per_month: number | null; features: string[] }
  usage: { people: number; social_accounts: number; posts_this_month: number }
}
export type BillingInfo = Billing & { ready: boolean }

/** Create with AI turned down (an artist or a song named): ElevenLabs' own rewording, when it gives one. */
export class PromptError extends Error {
  suggestion?: string
  constructor(message: string, suggestion?: string) {
    super(message)
    this.suggestion = suggestion
  }
}

/** Music on stories and reels: what's switched on (GET /api/social/music/status). */
export interface MusicStatus {
  /** AI music (ElevenLabs) can be made. */
  ai: boolean
  /** Music can be put into files (the render service). */
  render: boolean
  storage: IntegrationsState['media_storage']
  starter: { made: number; of: number; on: boolean }
}
/** A track of the business's own, with what the browser worked out about it. */
export interface NewTrack {
  title: string; artist?: string | null; moods: string[]; duration_s: number; waveform: number[] | null; highlight_s: number; bpm: number | null
  /** The rights tick: "We have the right to use this on social media". */
  confirmed: boolean
}
export type TrackPatch = Partial<Pick<MusicTrack, 'title' | 'artist' | 'moods' | 'saved' | 'hidden' | 'waveform' | 'highlight_s' | 'bpm' | 'energy'>>
export interface AiTrackRequest { prompt: string; seconds: number; title: string; moods: string[]; energy: number; bpm: number; genre?: string; post_id?: string | null }
export interface AiTrackResult { generation: { id: string; uses: number; free: number; price_cents: number }; tracks: MusicTrack[] }
export interface RenderMusicRequest {
  kind: 'story' | 'reel'
  /** The photo or video before the music; several photos make a reel cut on `cuts`. */
  sources: PostMedia[]
  cuts?: number[]
  track_id: string
  start: number
  seconds: number
  music_volume: number
  original_volume: number
  fade_in: boolean
  fade_out: boolean
  label?: boolean
}

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
  /** Calls back with who is signed in now (null: nobody) whenever that may have changed. */
  onAuthChange(cb: (userId: string | null) => void): () => void
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
  signInMethods(): Promise<SignInMethods>
  /** Register a new account. `confirmEmail`: they must click the link in their email before signing in. */
  signUp(fullName: string, email: string, password: string): Promise<{ confirmEmail: boolean }>
  /**
   * Signed in and in no business yet: create mine and run it (admin, first boss, Free plan). `kind`
   * picks its first positions; `referral` is another business's referral code. Returns its number.
   */
  createBusiness(b: { name: string; kind: 'cafe' | 'restaurant' | 'salon' | 'other' | null; timezone: string; referral?: string | null }): Promise<number>
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
  /**
   * Email an invite, or (with a temporary password) create the account straight away. Someone who
   * already has an account and is in no business yet joins the team as they are (`joined`).
   */
  invite(email: string, fullName: string, role: TeamRole | 'kiosk', password?: string, contact?: { phone?: string | null; contact_method?: ContactMethod | null }): Promise<{ joined?: boolean }>
  /** Admins: give someone (not an admin) a new temporary password to sign in with. */
  setTemporaryPassword(userId: string, password: string): Promise<void>

  // partners: outside businesses with read-only access to chosen areas (admins manage them)
  partners(): Promise<Profile[]>
  invitePartner(email: string, fullName: string, company: string, access: PartnerArea[], password?: string): Promise<{ joined?: boolean }>
  setPartnerAccess(id: string, company: string, access: PartnerArea[]): Promise<void>

  // time off
  timeOff(fromDate: string, toDate: string): Promise<TimeOff[]>
  vacationDaysUsed(profileId: string, year: number): Promise<number>
  requestTimeOff(startsOn: string, endsOn: string, kind: TimeOffKind, note: string): Promise<void>
  cancelTimeOff(id: string): Promise<void>
  decideTimeOff(id: string, approve: boolean, note?: string, releaseShifts?: boolean): Promise<number>
  /** Admins: leave for someone (a sick note, birth leave), approved already; returns the shifts opened up. */
  recordTimeOff(profileId: string, startsOn: string, endsOn: string, kind: TimeOffKind, note: string): Promise<number>

  // Staff benefits: the business's own amounts over the law's and its own benefits (the team reads,
  // admins change), and each person's holiday for a year when it isn't the business's.
  benefits(): Promise<Benefit[]>
  /** Add one (no id) or change one. */
  saveBenefit(b: BenefitInput): Promise<void>
  deleteBenefit(id: string): Promise<void>
  /** Admins see everyone's; others their own. */
  leaveAllowances(year: number): Promise<LeaveAllowance[]>
  /** Admins. No holiday_days: back to the business's allowance. */
  saveLeaveAllowance(a: Omit<LeaveAllowance, 'holiday_days'> & { holiday_days: number | null }): Promise<void>

  // Roles & responsibilities and Staff rules: the team reads them, admins write them.
  jobRoles(): Promise<JobRole[]>
  /** Add one (no id) or change one. */
  saveJobRole(r: JobRoleInput): Promise<void>
  deleteJobRole(id: string): Promise<void>
  ruleSections(): Promise<RuleSection[]>
  /** Add one (no id) or change one. */
  saveRuleSection(s: RuleSectionInput): Promise<void>
  deleteRuleSection(id: string): Promise<void>
  /** When people last confirmed they'd read the rules: admins see everyone's, others their own. */
  rulesRead(): Promise<RulesRead[]>
  /** "I've read the rules", for the person signed in. */
  readRules(): Promise<void>

  // Outsourcing (admins; finance partners read): the jobs done by people and firms outside the team,
  // and the catalogue to choose them from.
  contractors(): Promise<Contractor[]>
  /** Add someone to the catalogue (no id) or change them; returns their id. */
  saveContractor(c: ContractorInput): Promise<string>
  /** Only someone who has never done a job for the business: archive the others. */
  deleteContractor(id: string): Promise<void>
  outsourcedJobs(): Promise<OutsourcedJob[]>
  /** Give someone a job (no id) or change one; returns its id. */
  saveOutsourcedJob(j: OutsourcedJobInput): Promise<string>
  deleteOutsourcedJob(id: string): Promise<void>

  // Business Agent subscription (Stripe Billing). planStatus: everyone; the rest: admins.
  planStatus(): Promise<PlanStatus>
  billing(): Promise<BillingInfo>
  /** After Stripe Checkout: read the subscription from Stripe again. */
  syncBilling(): Promise<BillingInfo>
  /** A paid plan: a Stripe Checkout URL to go to, or `changed` when an existing subscription moved plan. */
  choosePlan(plan: PlanId, interval: Interval): Promise<{ url?: string; changed?: boolean }>
  /** Stripe's page to change the card, see invoices or cancel. */
  billingPortal(): Promise<string>

  // sign-in with Google, Apple, Facebook or Microsoft (Supabase OAuth)
  signInWith(provider: SocialProvider): Promise<void>

  // finances (admins with pay access)
  expenses(): Promise<Expense[]>
  saveExpense(expense: Partial<Expense> & { name: string; amount: number }): Promise<void>
  deleteExpense(id: string): Promise<void>

  // Licences (admins; finance partners read): what the business keeps open and when each runs out.
  licences(): Promise<Licence[]>
  /** Add a licence (no id) or change one; returns its id. */
  saveLicence(l: LicenceInput): Promise<string>
  deleteLicence(id: string): Promise<void>

  // Credit & debit (admins with pay access; finance partners read): money still to pay back and money still to
  // come in or that could be raised, each with the payments towards it. Grants come from grantApplications().
  creditDebit(): Promise<MoneyItem[]>
  /** Add an item (no id) or change one; returns its id. */
  saveCreditDebit(item: MoneyItemInput): Promise<string>
  deleteCreditDebit(id: string): Promise<void>
  /** A payment made or received towards an item: a repeating one moves on to its next date, and once it's all paid it's done. */
  addCreditDebitPayment(p: { item_id: string; amount: number; paid_on: string; note?: string | null }): Promise<void>
  deleteCreditDebitPayment(id: string): Promise<void>

  // Legal page (admins; finance partners read): legal documents that stay where they are in the café's
  // Google Drive or OneDrive. Only where each one is, is kept; the file is shown from there.
  legalDocuments(): Promise<LegalDocument[]>
  /** The storages documents can be picked from: each one, connected or not, and how it's picked. Admins. */
  legalSources(): Promise<LegalSource[]>
  /** What Google's file picker needs: a short-lived Drive token, the key and the project number. Admins. */
  legalPicker(): Promise<{ token: string; key: string; app_id: string }>
  /** A folder of a storage that's browsed in the app (OneDrive), null for the top. Admins. */
  browseLegalStorage(storage: LegalStorage, folder: string | null, page?: 'legal' | 'brand'): Promise<StorageListing>
  /** Add files picked in a storage. Ones already added, folders and ones that can't be opened come back skipped, with why. */
  addLegalDocuments(storage: LegalStorage, ids: string[]): Promise<{ added: LegalDocument[]; skipped: { id: string; name: string | null; why: string }[] }>
  updateLegalDocument(id: string, patch: LegalDocumentPatch): Promise<void>
  /** Take a document off the Legal page (the file stays where it is). */
  removeLegalDocument(id: string): Promise<void>
  /** The file, fetched from its storage now, to show in the page (a PDF or a picture). */
  legalFile(id: string): Promise<Blob>

  // Brand page documents (the guidelines PDF, logo packs…): uploaded here and kept in the database, or
  // picked in the connected Google Drive or OneDrive (the Legal page's pickers) and shown from there.
  // Everyone reads; admins add, rename and remove.
  brandDocuments(): Promise<BrandDocument[]>
  uploadBrandDocument(file: File): Promise<BrandDocument>
  addBrandDocuments(storage: LegalStorage, ids: string[]): Promise<{ added: BrandDocument[]; skipped: { id: string; name: string | null; why: string }[] }>
  renameBrandDocument(id: string, title: string): Promise<void>
  /** Take it off the Brand page (a picked file stays where it is; an upload goes). */
  removeBrandDocument(id: string): Promise<void>
  /** The file itself: an upload from the database, a picked one from its storage now. */
  brandFile(id: string): Promise<Blob>

  // Invoices (admins with pay access; finance partners read): received and sent, each with its supplier and file.
  invoices(): Promise<Invoice[]>
  /** Add an invoice (no id) or change one; returns its id. */
  saveInvoice(i: InvoiceInput): Promise<string>
  deleteInvoice(id: string): Promise<void>
  /** Emails from the last `days` with files that could be invoices (once reading the mailbox is allowed). */
  invoiceInbox(days?: number): Promise<InvoiceInbox>
  /** Bring one attachment in as an invoice, its file kept with the tax documents. */
  importInvoice(message: InboxInvoice, attachmentId: string, supplierId?: string | null): Promise<Invoice>

  // Expenses: everyone sends their own (and changes them while they wait); admins with pay
  // access see and decide all of them; finance partners read.
  expenseClaims(): Promise<ExpenseClaim[]>
  /** Send a claim (no id) or change one; returns its id. */
  saveClaim(c: ClaimInput): Promise<string>
  deleteClaim(id: string): Promise<void>

  // Tax (admins with pay access; finance partners read). The files are in the café's Drive or OneDrive.
  taxSettings(): Promise<TaxSettings>
  saveTaxSettings(patch: Partial<TaxSettings>): Promise<void>
  /** What's been done about each return of the tax year. */
  taxFilings(year: number): Promise<FilingRecord[]>
  saveTaxFiling(record: FilingRecord): Promise<void>
  /** The documents kept for a tax year, newest first. */
  taxDocuments(year: number): Promise<TaxDocument[]>
  updateTaxDocument(id: string, patch: Partial<Pick<TaxDocument, 'kind' | 'year' | 'quarter' | 'notes' | 'title' | 'tags' | 'expires_on'>>): Promise<void>
  /** Take a document off the list (the file stays in Drive or OneDrive). */
  removeTaxDocument(id: string): Promise<void>
  /** The folders inside one under Business Agent (["Tax", "2026"]), and a link to open it there. */
  taxFolders(path: string[]): Promise<{ storage: 'google_drive' | 'onedrive'; path: string[]; folders: string[]; link: string | null }>
  /** Make a folder inside one; returns its path. */
  makeTaxFolder(path: string[], name: string): Promise<string[]>
  /** Upload one document into a folder under Business Agent/Tax; refused when the same file (sha256) is already kept. */
  uploadTaxDocument(file: Blob, meta: { name: string; kind: TaxDocKind; year: number; quarter: Quarter | null; folder: string[]; sha256: string }): Promise<TaxDocument>
  // Documents hub (admins with pay access; finance partners read the list): every kept file, and the café's Business Agent folder.
  /** Every kept document (all years, Tax and Documents), newest first, with the invoices and licences that point at it. */
  documents(): Promise<KeptDocument[]>
  /** What's inside a folder under Business Agent ([] is Business Agent itself); nothing is made. */
  browseFiles(path: string[]): Promise<StorageFolder>
  /** Make a folder inside Documents; returns its path. */
  makeDocumentsFolder(path: string[], name: string): Promise<string[]>
  /** Upload one document into Documents/<folder…>; refused when the same file (sha256) is already kept. */
  uploadDocument(file: Blob, meta: { name: string; kind: TaxDocKind; year: number; folder: string[]; sha256: string; title?: string | null; tags?: string[]; expires_on?: string | null }): Promise<KeptDocument>
  // Profit & loss (admins with pay access; finance partners read): the IVA rate and one-off lines
  pnlSettings(): Promise<PnlSettings>
  savePnlSettings(patch: Partial<PnlSettings>): Promise<void>
  /** One-off income and costs for the months from and to (YYYY-MM), inclusive. */
  pnlLines(fromMonth: string, toMonth: string): Promise<PnlLine[]>
  /** Add a line (no id) or change it. */
  savePnlLine(line: PnlLineInput): Promise<void>
  deletePnlLine(id: string): Promise<void>

  // Customers and leads, for marketing (admins)
  customers(): Promise<Customer[]>
  /** Add someone (no id) or change them. */
  saveCustomer(patch: CustomerInput): Promise<void>
  deleteCustomer(id: string): Promise<void>
  /** Add many at once (a CSV file); returns how many were added. */
  importCustomers(rows: CustomerInput[]): Promise<number>

  // Leads & enquiries (admins): what people asked for, each belonging to someone on Customers.
  enquiries(): Promise<Enquiry[]>
  /** Add an enquiry (no id; with `lead`, for someone new, added to Customers as a lead) or change one; returns its id. */
  saveEnquiry(e: EnquiryInput, lead?: NewLead): Promise<string>
  deleteEnquiry(id: string): Promise<void>

  // Campaigns (admins): one message to the customers and leads who said yes to marketing.
  campaigns(): Promise<Campaign[]>
  /** Add a campaign (no id) or change one; returns its id. */
  saveCampaign(c: CampaignInput): Promise<string>
  deleteCampaign(id: string): Promise<void>

  // Sales reps & rewards: the team sees every rep and customers' credit, adds customers, logs
  // rewards and lets customers spend credit at the till; admins manage reps and the list, approve
  // what waits and pay commission out. Reps on the team see their own commission.
  salesReps(): Promise<SalesRep[]>
  /** Add a rep (no id; the team only customers) or change one (admins); returns its id. */
  saveSalesRep(r: SalesRepInput): Promise<string>
  deleteSalesRep(id: string): Promise<void>
  rewardRules(): Promise<RewardRule[]>
  /** Admins: add a reward to the list (no id) or change one. */
  saveRewardRule(r: RewardRuleInput): Promise<void>
  deleteRewardRule(id: string): Promise<void>
  /** Every reward, spend and payout the person may see, newest first. */
  repRewards(): Promise<RepReward[]>
  /** Log a reward from the list: it counts now, or waits for an admin. */
  logReward(r: RewardLog): Promise<LoggedReward>
  /** Admins: approve (optionally for another amount) or turn down a reward that's waiting. */
  decideReward(id: string, approve: boolean, amount?: number): Promise<void>
  /** A customer spends credit (the team), or a rep is paid commission (admins); returns what's left. */
  settleReward(repId: string, amount: number, note?: string): Promise<number>
  /** Admins: take a line off (a mistake). */
  deleteReward(id: string): Promise<void>
  repSettings(): Promise<RepSettings>
  updateRepSettings(patch: Partial<RepSettings>): Promise<void>

  // Staff kitty: the team reads; admins set the share of profit, add goals, put money in and mark goals bought.
  kittySettings(): Promise<KittySettings>
  updateKittySettings(patch: Partial<KittySettings>): Promise<void>
  kittyGoals(): Promise<KittyGoal[]>
  /** Add a goal (no id) or change one (bought: `spent` and `bought_on`). */
  saveKittyGoal(g: KittyGoalInput): Promise<void>
  deleteKittyGoal(id: string): Promise<void>
  /** The goals in a new order: their ids, the first to fill first. */
  orderKittyGoals(ids: string[]): Promise<void>
  /** What's gone in, newest first. */
  kittyEntries(): Promise<KittyEntry[]>
  addKittyEntry(e: KittyEntryInput): Promise<void>
  deleteKittyEntry(id: string): Promise<void>

  // Grants (admins with pay access; finance partners read): the answers that decide which fit, and the applications
  /** The answers given so far (what the app works out by itself isn't saved). */
  grantProfile(): Promise<Partial<GrantProfile>>
  saveGrantProfile(answers: Partial<GrantProfile>): Promise<void>
  grantApplications(): Promise<GrantApplication[]>
  /** Track a grant (no id) or change an application. Returns its id. */
  saveGrantApplication(a: GrantApplicationInput): Promise<string>
  deleteGrantApplication(id: string): Promise<void>
  // Stock and suppliers: the team reads and records deliveries, counts and waste; admins change
  // items (prices included) and suppliers; finance partners read.
  suppliers(): Promise<Supplier[]>
  saveSupplier(s: SupplierInput): Promise<void>
  deleteSupplier(id: string): Promise<void>
  stockItems(): Promise<StockItem[]>
  /** Every wholesale price each item has had (kept by the database when a cost changes), oldest first. */
  stockPrices(): Promise<StockPrice[]>
  /** Add an item (no id; on_hand is its first count) or change one (on_hand changes only through recordStock). */
  saveStockItem(item: StockItemInput): Promise<void>
  deleteStockItem(id: string): Promise<void>
  /** Add many at once (a CSV file); returns how many were added. */
  importStockItems(rows: StockItemInput[]): Promise<number>
  /** What changed the figures, newest first: one item's, or everything's. */
  stockMovements(itemId?: string): Promise<StockMovement[]>
  /** Record deliveries, counts, waste… (a stocktake sends many at once). */
  recordStock(moves: MovementInput[]): Promise<void>
  /** Waste log: change an entry (whoever logged it, or an admin); it stays on its day. */
  editWaste(id: string, w: WasteEdit): Promise<void>
  /** Take an entry off the waste log; its stock comes back. */
  undoWaste(id: string): Promise<void>
  /** Menu items and what goes in them (admins; finance partners read). */
  recipes(): Promise<Recipe[]>
  /** Save a recipe with its variants and lines (they replace the ones there were); returns its id. */
  saveRecipe(recipe: RecipeInput): Promise<string>
  deleteRecipe(id: string): Promise<void>
  /** The menu's allergens: active dishes and the items in them, without costs (the team and finance partners). */
  menuAllergens(): Promise<MenuAllergens>
  /** What an item contains (null: not known yet), may contain, and whether it's vegan or vegetarian (admins). */
  saveItemAllergens(itemId: string, allergens: Allergen[] | null, mayContain: Allergen[], diet: Diet | null): Promise<void>

  // Food safety: the team records checks (kept for good); admins set what's checked.
  safetyPoints(): Promise<SafetyPoint[]>
  /** Add something to check (no id) or change one; returns its id. */
  saveSafetyPoint(p: PointInput): Promise<string>
  /** Only while it has no checks (otherwise switch it off). */
  deleteSafetyPoint(id: string): Promise<void>
  /** The checks done from one local day to another (inclusive), newest first. */
  safetyChecks(from: string, to: string): Promise<SafetyCheck[]>
  recordSafetyCheck(c: CheckInput): Promise<void>

  // Hiring (admins): the jobs being filled and who applied.
  jobOpenings(): Promise<JobOpening[]>
  /** Add a job (no id) or change one; returns its id. */
  saveOpening(o: OpeningInput): Promise<string>
  /** The job and everyone who applied for it. */
  deleteOpening(id: string): Promise<void>
  applicants(): Promise<Applicant[]>
  /** Add an applicant (no id) or change one; returns their id. */
  saveApplicant(a: ApplicantInput): Promise<string>
  deleteApplicant(id: string): Promise<void>

  // Tips: admins with pay access share them out; payroll partners read; everyone sees their own share.
  tipPools(): Promise<TipPool[]>
  /** Save a pool (no id: a new one) with its shares, which replace the ones it had; returns its id. */
  saveTipPool(pool: TipPoolInput, shares: TipShare[]): Promise<string>
  deleteTipPool(id: string): Promise<void>

  // Menu (everyone on the team reads; admins change): what customers read about each item. The same
  // items as Menu costing, without their costs.
  menuItems(): Promise<MenuItem[]>
  /** Add a menu item (no id) or change what customers read about it; returns its id. Its costing stays as it is. */
  saveMenuItem(item: MenuItemInput): Promise<string>
  /** A section's new order: its items' ids, in order. */
  reorderMenu(ids: string[]): Promise<void>
  /**
   * Start from the café's printed menus (Drinks, Food, The fridge): adds the items that aren't on the
   * menu yet, puts the sections in the printed menus' order, and makes the three printed menus.
   */
  loadMenuTemplate(): Promise<{ added: number; designs: number }>
  /** Read the Square item library into the menu now (when the menu comes from Square). */
  syncMenuFromSquare(): Promise<{ added: number; changed: number; off: number; items: number }>
  /** Keep a picture for the menu (a photo, a design) in the café's storage, Business Agent/Menu; returns its address. */
  uploadMenuPicture(file: File): Promise<string>
  // Menu designs (admins): printed (physical) and on screens (digital), each with its images.
  menuDesigns(): Promise<MenuDesign[]>
  /** Add a design (no id) or change one; returns its id. */
  saveMenuDesign(design: MenuDesignInput): Promise<string>
  deleteMenuDesign(id: string): Promise<void>
  /** An uploaded picture or a link as one of a design's images; it becomes the one in use. Returns its id. */
  addMenuImage(designId: string, url: string, source: 'upload' | 'link'): Promise<string>
  deleteMenuImage(id: string): Promise<void>
  /** Connect Higgsfield (AI images) with its API key; Higgsfield must accept it first. */
  connectHiggsfield(keyId: string, secret: string): Promise<void>
  /** Ask Higgsfield for an image (or a change to one); it comes back queued. */
  generateMenuImage(request: MenuImageRequest): Promise<MenuImage>
  /** How an AI image is going. */
  checkMenuImage(id: string): Promise<MenuImage>

  // Screens (admins): the café's TVs and tablets, each playing its slides.
  screens(): Promise<Screen[]>
  /** Add a screen (no id) or change one; returns its id. */
  saveScreen(screen: ScreenInput): Promise<string>
  deleteScreen(id: string): Promise<void>
  /** A new secret link for a screen (the old one stops working); returns its token. */
  newScreenLink(id: string): Promise<string>
  /** What a screen's link plays (no sign-in needed). */
  display(token: string): Promise<DisplayFeed>

  // To Do List (the team; admins manage categories)
  todos(): Promise<{ categories: TodoCategory[]; todos: Todo[] }>
  /** Add a job; on the board it can go straight to someone, or into Doing. */
  addTodo(todo: { title: string; category_id: string | null; position: number; assignee_id?: string | null; status?: Todo['status'] }): Promise<Todo>
  updateTodo(id: string, patch: TodoPatch): Promise<void>
  deleteTodo(id: string): Promise<void>
  saveTodoCategory(category: Partial<TodoCategory> & { name: string }): Promise<void>
  deleteTodoCategory(id: string): Promise<void>

  // alerts log (admins)
  sentAlerts(limit?: number): Promise<OutboxItem[]>

  // sports fixtures (staff read; admins choose competitions and can refresh now)
  sportsCompetitions(): Promise<SportsCompetition[]>
  sportsEvents(fromIso: string, toIso: string): Promise<SportsEvent[]>
  setSportsFollowed(code: string, followed: boolean): Promise<void>
  /** The signed-in person's favourite teams and competitions. */
  sportsFavourites(): Promise<SportsFavourite[]>
  setSportsFavourite(fav: SportsFavourite, on: boolean): Promise<void>
  refreshSports(): Promise<number>

  // connections: Google Business Profile, WhatsApp, Instagram (admins)
  integrations(): Promise<IntegrationsState>
  connectGoogle(back?: 'setup' | 'connections'): Promise<void>
  /** One click: sign in on instagram.com and come back connected. */
  connectInstagram(back?: 'setup' | 'connections' | 'messages'): Promise<void>
  /** One click for Facebook, TikTok, LinkedIn, Square, Stripe or SumUp: sign in there and come back connected. */
  connectApp(provider: 'facebook' | 'tiktok' | 'square' | 'stripe' | 'sumup' | 'linkedin' | 'meta_ads', back?: 'setup' | 'connections' | 'messages'): Promise<void>
  /** Facebook: which Page to post to, when the account manages more than one. */
  chooseFacebookPage(pageId: string): Promise<void>
  /** LinkedIn: post to one of their company Pages, or 'me' for their own profile. */
  chooseLinkedInPage(pageId: string): Promise<void>
  /** Search Console: which website to read, when the account has several and none is the business's. */
  chooseSearchConsoleSite(site: string): Promise<void>
  /** How the website did in Google Search (admins), from and to inclusive. Google is 2–3 days behind. */
  searchConsole(from: string, to: string): Promise<SearchReport>
  // Reviews (admins): Google reviews, read now from the business's profile (or the public listing until that's approved).
  reviews(): Promise<ReviewsState>
  /** Reply to a review on Google (or change the reply). Only with the business's own profile. */
  replyReview(id: string, text: string): Promise<void>
  deleteReviewReply(id: string): Promise<void>
  // Website & SEO (admins): the last check and PageSpeed results; run either again.
  website(): Promise<WebsiteState>
  checkWebsite(): Promise<WebsiteReport>
  pageSpeed(strategy: Strategy): Promise<PageSpeed>
  // Competitors (admins): the cafés around, what they charge and offer, followed over time (shared/localCompetitors).
  competitors(): Promise<CompetitorData>
  /** Add a competitor by hand (no id) or change one, the business's own row included; returns its id. */
  saveCompetitor(c: CompetitorInput): Promise<string>
  /** Remove a competitor with its prices, notes and ratings (to keep its history, switch it off instead). */
  deleteCompetitor(id: string): Promise<void>
  /** Add a basket item (no id) or change one; returns its id. */
  savePriceItem(i: Partial<PriceItem> & { name: string }): Promise<string>
  deletePriceItem(id: string): Promise<void>
  /** A price seen on a day (each one is kept). */
  recordPrice(p: Omit<CompetitorPrice, 'id' | 'created_at'>): Promise<void>
  deletePrice(id: string): Promise<void>
  saveCompetitorNote(n: CompetitorNoteInput): Promise<string>
  deleteCompetitorNote(id: string): Promise<void>
  /** Put a place Google lists nearby aside, or back. */
  dismissNearby(placeId: string, dismissed: boolean): Promise<void>
  saveCompetitorSettings(s: Pick<CompetitorSettings, 'radius_m' | 'scan_weekly'>): Promise<void>
  /** Google's side (the Worker, Places API): is it set up, look around now, find by name, follow a place, read one again. */
  competitorGoogle(): Promise<{ places: boolean; own_place: boolean }>
  lookAround(radius: number): Promise<{ found: number; fresh: number }>
  findPlaces(query: string): Promise<NearbyPlace[]>
  /** Follow a place from Google (`id`: the competitor added by hand that it is); returns the competitor's id. */
  followPlace(placeId: string, id?: string): Promise<string>
  refreshCompetitor(id: string): Promise<void>
  /** Takings per day from Square, Stripe or SumUp (admins with pay access), from and to inclusive. */
  sales(from: string, to: string): Promise<Sales>
  /** Best sellers from Square's orders, same dates and rules as `sales`. */
  salesItems(from: string, to: string): Promise<SalesItems>

  // Loyalty and gift cards, from Square (admins, while Square is the connected till). `key`: one per
  // action the person takes, so trying again never gives points or a card twice.
  loyalty(from: string, to: string): Promise<LoyaltyState>
  /** Goodwill points for a member (negative takes some back), with the reason Square keeps. */
  adjustLoyalty(accountId: string, points: number, reason: string, key: string): Promise<void>
  giftCards(from: string, to: string): Promise<GiftCards>
  /** Sell a digital gift card for an amount paid at the till, optionally for a Square customer. */
  sellGiftCard(amount: number, customerId: string | null, key: string): Promise<GiftCard>
  // Ads (admins with pay access): Meta Ads and Google Ads, read and changed live on each platform
  /** Spend, clicks and results per day and campaign, from and to inclusive. */
  adsReport(from: string, to: string): Promise<AdsReport>
  /** Pause or resume a campaign, or change its daily budget, on its platform. */
  setAdCampaign(platform: AdPlatform, id: string, patch: CampaignPatch): Promise<void>
  /** Which ad account to show, when the sign-in can use several. */
  chooseAdAccount(platform: AdPlatform, id: string): Promise<void>
  /** The monthly limits the business set itself (admins). */
  adSettings(): Promise<AdSettings>
  saveAdSettings(patch: Partial<AdSettings>): Promise<void>

  // Social planner (admins)
  socialPosts(): Promise<SocialPost[]>
  /** Save a draft or schedule a post (scheduled_at now = post now). Returns its id. */
  saveSocialPost(post: Partial<SocialPost> & { caption: string; targets: SocialNetwork[]; status: 'draft' | 'scheduled' }): Promise<string>
  deleteSocialPost(id: string): Promise<void>
  /** A reminder you posted yourself: mark it posted. */
  markPosted(id: string): Promise<void>

  // Competitions (admins): giveaways and draws, their entries and the draw. The post goes out
  // through the Social planner (saveSocialPost).
  /** Every competition, newest first, each with how many entries it has. */
  competitions(): Promise<Competition[]>
  /** Add one (no id) or change one; returns its id. */
  saveCompetition(c: CompetitionInput): Promise<string>
  /** Delete one and its entries (the people's details go with it). */
  deleteCompetition(id: string): Promise<void>
  competitionEntries(id: string): Promise<CompetitionEntry[]>
  /** Add entries; whoever is already in (the same username or email) is skipped. */
  addEntries(id: string, rows: EntryInput[]): Promise<{ added: number; skipped: number }>
  updateEntry(id: string, patch: Pick<Partial<CompetitionEntry>, 'valid' | 'note' | 'name' | 'email' | 'phone'>): Promise<void>
  /** Pick the winners and then the reserves at random from the valid entries (once). Returns how many were picked. */
  drawCompetition(id: string): Promise<number>
  /** The winners have their prizes: a stock prize comes off the stock (one each). */
  givePrize(id: string): Promise<void>
  /**
   * Keep a photo (JPEG) or video (MP4/MOV) for a post in the connected Google Drive or OneDrive,
   * in Business Agent/Social/<folder>; returns its public address and type.
   */
  uploadMedia(file: File, folder: KindInfo['folder']): Promise<PostMedia>

  // Music on stories and reels (admins; docs/SOCIAL_MUSIC_PLAN.md)
  /** The music library, newest first (hidden tracks left out). */
  musicTracks(): Promise<MusicTrack[]>
  /** What's switched on: AI music, putting music into files, storage, the starter pack. */
  musicStatus(): Promise<MusicStatus>
  /** Keep the business's own MP3/M4A in the library; `confirmed`: the rights tick. */
  uploadTrack(file: File, t: NewTrack): Promise<MusicTrack>
  /** A track's name, moods, saved or hidden; or its waveform once worked out. */
  saveTrack(id: string, patch: TrackPatch): Promise<void>
  deleteTrack(id: string): Promise<void>
  /** What making an AI track of this length would cost now (free, or the price; why not). */
  aiMusicQuote(seconds: number): Promise<AiMusicQuote>
  /** Create with AI: two versions of a track (pay per use: one use per started minute). */
  makeAiTrack(req: AiTrackRequest): Promise<AiTrackResult>
  /** Keep one of the two versions (the other is hidden). */
  keepAiTrack(generationId: string, trackId: string): Promise<void>
  /** This month's AI tracks, for the Billing page. */
  aiMusicUses(): Promise<MusicGeneration[]>
  /** The monthly limit on pay per use, in euros (Billing page). */
  setPayPerUseLimit(euros: number): Promise<void>
  /** Put the music into a story or reel: the file with the music in. */
  renderPostMusic(req: RenderMusicRequest): Promise<{ media: PostMedia; ms: number | null }>
  chooseGoogleListing(location: string | null, closedOnHolidays?: boolean): Promise<void>
  syncGoogleNow(): Promise<void>
  googleHours(): Promise<OpeningHours>
  disconnect(provider: string): Promise<void>
  /** Start connecting Gmail, Outlook, Google Drive, OneDrive, YouTube Music or Search Console (goes to Google/Microsoft and back). */
  connectService(provider: ConnectorProvider, back?: 'setup' | 'connections' | 'invoices', opts?: { read?: boolean }): Promise<void>
  /** Prove a connection still works, now (the result is also on its card). */
  checkConnection(provider: IntegrationProvider): Promise<Integration | null>
  /** Check every connection that is (or was) working. */
  checkConnections(): Promise<Integration[]>
  /** Choose Google Calendar or Outlook Calendar: returns the page that adds the team calendar there. */
  chooseCalendar(app: CalendarApp): Promise<{ url: string; feed: string }>
  /** Send a test email from the connected mailbox. */
  sendTestEmail(to: string): Promise<void>
  /** Save a file into "Business Agent/<folder>" in the connected Drive/OneDrive; returns a link to it. */
  saveFile(f: { folder: string; name: string; content: string; type?: string }): Promise<{ link: string; provider: ConnectorProvider }>
  whatsappTest(to: string): Promise<void>
  instagramProfile(): Promise<InstagramProfile>
  // Messages page (admins): the Instagram inbox, read live from Instagram.
  instagramInbox(): Promise<InboxState>
  instagramThread(id: string): Promise<InboxThread>
  /** Reply by text; Instagram allows it within 24 hours of the customer's last message. */
  replyInstagram(id: string, text: string): Promise<void>
  // The Facebook Page's Messenger chats, read live with the Facebook connection (same reply rules).
  messengerInbox(): Promise<{ conversations: InboxConversation[] }>
  messengerThread(id: string): Promise<InboxThread>
  replyMessenger(id: string, text: string): Promise<void>
  // WhatsApp chats: the ones the app saved (WhatsApp can't be read back), kept as long as Data retention says.
  whatsappInbox(): Promise<{ conversations: InboxConversation[] }>
  whatsappThread(id: string): Promise<InboxThread>
  /** Reply by text; WhatsApp allows it within 24 hours of the person's last message. */
  replyWhatsApp(id: string, text: string): Promise<void>
  /** How long WhatsApp chats are kept (days); anything older is deleted now. Returns how many messages went. */
  setWhatsappRetention(days: number): Promise<{ days: number; deleted: number }>
  // Referrals: admins see the link, how it's doing and the free months banked.
  referrals(): Promise<ReferralState>
  /** Someone opened a referral link (no sign-in): counted, and who invited them. */
  openReferral(code: string, count?: boolean): Promise<{ business: string }>
  uploadPhoto(file: File): Promise<string>
  share(caption: string, imageUrl: string | null, targets: ('instagram' | 'google')[], eventId?: string): Promise<number>
  sendRota(monday: string): Promise<number>
  connectSpotify(): Promise<void>
  /** The café music account's playlists (Spotify or YouTube Music, whichever is connected) and the approved one. */
  cafePlaylists(): Promise<{ provider: 'spotify' | 'youtube_music'; playlists: SpotifyPlaylist[]; approved: SpotifyPlaylist | null }>
  chooseCafePlaylist(playlist: SpotifyPlaylist): Promise<void>

  // Brand guidelines (everyone reads; admins change) and the Google Fonts list for the picker
  brand(): Promise<Brand>
  saveBrand(patch: Partial<Omit<Brand, 'updated_at'>>): Promise<void>
  fontList(): Promise<{ source: string; fonts: { family: string; category: string }[] }>

  // Notifications (the bell) and event alerts (admins get reminded before an event)
  notifications(): Promise<AppNotification[]>
  markNotificationsRead(): Promise<void>
  /** Instagram tags and story mentions (admins), newest first, with what was done about each. */
  instagramMentions(): Promise<InstagramMention[]>
  /** Put a mention's photo or video on the business's Instagram story. */
  repostMention(id: string): Promise<void>
  ignoreMention(id: string): Promise<void>
  /** Look for new mentions now (the Worker also looks every 15 minutes); how many were new. */
  checkMentions(): Promise<number>
  eventAlerts(): Promise<EventAlert[]>
  setEventAlert(kind: EventAlert['kind'], refId: string, on: boolean): Promise<boolean>

  // Calendar feeds: my shifts (everyone), the whole team (admins). Returns subscribe links.
  calendarFeeds(): Promise<Partial<Record<'me' | 'business', string>>>
  makeCalendarFeed(scope: 'me' | 'business'): Promise<string>
  stopCalendarFeed(scope: 'me' | 'business'): Promise<void>

  // AI assistants: personal access keys for AIs and automations that don't sign in (MCP header, REST)
  apiKeys(): Promise<ApiKey[]>
  /** Returns the new key; it is shown only this once. */
  createApiKey(name: string): Promise<ApiKey & { key: string }>
  revokeApiKey(id: string): Promise<void>

  // Music page: each person's own Spotify / YouTube Music (must connect to use it)
  myMusic(): Promise<MyMusic>
  connectMyMusic(provider: MusicProvider): Promise<void>
  disconnectMyMusic(provider: MusicProvider): Promise<void>
  myPlaylists(provider: MusicProvider): Promise<MusicPlaylist[]>
  myNowPlaying(): Promise<MyNowPlaying>
  playMySpotify(playlistId: string): Promise<void>
  pauseMySpotify(): Promise<void>

  // café music player (Music page): the café account's playlists, one device plays, any phone controls it
  cafeMusicLibrary(): Promise<CafeMusicLibrary>
  cafeTracks(playlistId: string): Promise<CafeTrack[]>
  musicPlayer(): Promise<MusicPlayerState>
  /** A button press for whichever device is playing. */
  musicSend(action: MusicAction, value?: number): Promise<void>
  /** A new queue: another playlist, a new order or shuffled. */
  musicSetQueue(playlist: SpotifyPlaylist | null, queue: CafeTrack[], position: number): Promise<void>
  /** Search all of YouTube for songs or playlists. */
  cafeSearch(q: string, kind: 'songs' | 'playlists'): Promise<{ tracks: CafeTrack[]; playlists: MusicPlaylist[] }>
  /** The order playlists play in, one after another. */
  musicSetPlaylistOrder(ids: string[]): Promise<void>
  /** The playing device says what it's doing (and claims the speaker with device_id). With asDevice, only while it still is the speaker. */
  musicReport(report: MusicPlayerReport, asDevice?: string): Promise<void>

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
