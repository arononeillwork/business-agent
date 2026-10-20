import type { ApiKey, AppNotification, Brand, BreakType, Business, CalendarApp, CalendarEvent, ConnectorProvider, ContactMethod, CorrectionRequest, Customer, CustomerInput, EventAlert, Expense, InstagramProfile, Integration, PostMedia, Sales, SalesItems, SearchReport, SocialNetwork, SocialPost, IntegrationProvider, IntegrationsState, KioskPerson, MusicNow, MusicPlaylist, MusicProvider, MyMusic, MyNowPlaying, OpenBreak, OpeningHours, OutboxItem, PartnerArea, PayRate, Position, Profile, Settings, Shift, SpotifyPlaylist, TimeEntry, TimeEntryChange, TimeOff, TimeOffKind, Todo, TodoCategory, TodoPatch, CafeMusicLibrary, CafeTrack, MusicAction, MusicPlayerReport, MusicPlayerState } from '../../shared/types'
import type { Billing, Interval, PlanId } from '../../shared/plans'
import type { SportsCompetition, SportsEvent, SportsFavourite } from '../../shared/sports'
import type { InboxConversation, InboxState, InboxThread } from '../../shared/messages'
import type { ReferralState } from '../../shared/referrals'
import type { KindInfo } from '../../shared/social'
import type { InstagramMention } from '../../shared/mentions'
import type { FilingRecord, Quarter, TaxDocKind, TaxDocument, TaxSettings } from '../../shared/tax'
import type { PnlLine, PnlLineInput, PnlSettings } from '../../shared/pnl'
import type { GrantApplication, GrantApplicationInput, GrantProfile } from '../../shared/grants'
import type { GiftCard, GiftCards, LoyaltyState } from '../../shared/loyalty'
import type { MovementInput, StockItem, StockItemInput, StockMovement, Supplier, SupplierInput } from '../../shared/stock'
import type { Recipe, RecipeInput } from '../../shared/recipes'

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
  invite(email: string, fullName: string, role: 'admin' | 'employee' | 'kiosk', password?: string, contact?: { phone?: string | null; contact_method?: ContactMethod | null }): Promise<void>
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

  // Tax (admins with pay access; finance partners read). The files are in the café's Drive or OneDrive.
  taxSettings(): Promise<TaxSettings>
  saveTaxSettings(patch: Partial<TaxSettings>): Promise<void>
  /** What's been done about each return of the tax year. */
  taxFilings(year: number): Promise<FilingRecord[]>
  saveTaxFiling(record: FilingRecord): Promise<void>
  /** The documents kept for a tax year, newest first. */
  taxDocuments(year: number): Promise<TaxDocument[]>
  updateTaxDocument(id: string, patch: Partial<Pick<TaxDocument, 'kind' | 'year' | 'quarter' | 'notes'>>): Promise<void>
  /** Take a document off the list (the file stays in Drive or OneDrive). */
  removeTaxDocument(id: string): Promise<void>
  /** The folders inside one under Business Agent (["Tax", "2026"]), and a link to open it there. */
  taxFolders(path: string[]): Promise<{ storage: 'google_drive' | 'onedrive'; path: string[]; folders: string[]; link: string | null }>
  /** Make a folder inside one; returns its path. */
  makeTaxFolder(path: string[], name: string): Promise<string[]>
  /** Upload one document into a folder under Business Agent/Tax; refused when the same file (sha256) is already kept. */
  uploadTaxDocument(file: Blob, meta: { name: string; kind: TaxDocKind; year: number; quarter: Quarter | null; folder: string[]; sha256: string }): Promise<TaxDocument>
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
  /** Add an item (no id; on_hand is its first count) or change one (on_hand changes only through recordStock). */
  saveStockItem(item: StockItemInput): Promise<void>
  deleteStockItem(id: string): Promise<void>
  /** Add many at once (a CSV file); returns how many were added. */
  importStockItems(rows: StockItemInput[]): Promise<number>
  /** What changed the figures, newest first: one item's, or everything's. */
  stockMovements(itemId?: string): Promise<StockMovement[]>
  /** Record deliveries, counts, waste… (a stocktake sends many at once). */
  recordStock(moves: MovementInput[]): Promise<void>
  /** Menu items and what goes in them (admins; finance partners read). */
  recipes(): Promise<Recipe[]>
  /** Save a recipe with its variants and lines (they replace the ones there were); returns its id. */
  saveRecipe(recipe: RecipeInput): Promise<string>
  deleteRecipe(id: string): Promise<void>

  // To Do List (the team; admins manage categories)
  todos(): Promise<{ categories: TodoCategory[]; todos: Todo[] }>
  addTodo(todo: { title: string; category_id: string | null; position: number }): Promise<Todo>
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
  connectApp(provider: 'facebook' | 'tiktok' | 'square' | 'stripe' | 'sumup' | 'linkedin', back?: 'setup' | 'connections' | 'messages'): Promise<void>
  /** Facebook: which Page to post to, when the account manages more than one. */
  chooseFacebookPage(pageId: string): Promise<void>
  /** LinkedIn: post to one of their company Pages, or 'me' for their own profile. */
  chooseLinkedInPage(pageId: string): Promise<void>
  /** Search Console: which website to read, when the account has several and none is the business's. */
  chooseSearchConsoleSite(site: string): Promise<void>
  /** How the website did in Google Search (admins), from and to inclusive. Google is 2–3 days behind. */
  searchConsole(from: string, to: string): Promise<SearchReport>
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

  // Social planner (admins)
  socialPosts(): Promise<SocialPost[]>
  /** Save a draft or schedule a post (scheduled_at now = post now). Returns its id. */
  saveSocialPost(post: Partial<SocialPost> & { caption: string; targets: SocialNetwork[]; status: 'draft' | 'scheduled' }): Promise<string>
  deleteSocialPost(id: string): Promise<void>
  /** A reminder you posted yourself: mark it posted. */
  markPosted(id: string): Promise<void>
  /**
   * Keep a photo (JPEG) or video (MP4/MOV) for a post in the connected Google Drive or OneDrive,
   * in Business Agent/Social/<folder>; returns its public address and type.
   */
  uploadMedia(file: File, folder: KindInfo['folder']): Promise<PostMedia>
  chooseGoogleListing(location: string | null, closedOnHolidays?: boolean): Promise<void>
  syncGoogleNow(): Promise<void>
  googleHours(): Promise<OpeningHours>
  disconnect(provider: string): Promise<void>
  /** Start connecting Gmail, Outlook, Google Drive, OneDrive, YouTube Music or Search Console (goes to Google/Microsoft and back). */
  connectService(provider: ConnectorProvider, back?: 'setup' | 'connections'): Promise<void>
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
  /** A business joins the waitlist from a referral link (no sign-in). */
  joinReferral(input: { code: string; business_name: string; contact_name?: string; email: string }): Promise<void>
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
