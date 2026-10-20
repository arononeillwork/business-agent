// In-memory demo of the app with Easy Beans sample data. Used for previews, sales demos and
// when no Supabase project is configured. Mirrors the SQL rules closely but is not the source
// of truth: the database functions are.
import type { Api, BillingInfo, ShiftInput } from './api'
import { PLANS, SOCIAL_CONNECTIONS, TRIAL_DAYS, effectivePlan, plan as planById, type PlanId } from '../../shared/plans'
import type {
  ApiKey, AppNotification, Brand, Customer, EventAlert, Sales, SalesItem, SearchReport, SearchRow, SocialNetwork, SocialPost, MusicAccount, MusicPlaylist, MusicProvider, MyNowPlaying,
  Expense, Integration, IntegrationProvider, IntegrationsState, OutboxItem, PartnerArea, TimeOff,
  BreakType, Business, CalendarEvent, CorrectionRequest, PayRate, Position, Profile, Settings,
  Shift, TimeEntry, TimeEntryChange, Todo, TodoCategory, CafeTrack, MusicPlayerState,
} from '../../shared/types'
import { mentionTitle, mentionsIn, type InstagramMention } from '../../shared/mentions'
import { demoSports } from './demoSports'
import { demoInbox, demoMessenger, demoWhatsApp } from './demoMessages'
import { DEFAULT_WHATSAPP_RETENTION, isRetention, replyWindow } from '../../shared/messages'
import { cleanCode } from '../../shared/referrals'
import { postProblem } from '../../shared/social'
import type { SportsFavourite } from '../../shared/sports'
import { POPULAR_FONTS } from '../../shared/fonts'
import { addToCalendarUrl, cleanWebsite, groupOf } from '../../shared/connections'
import { mergeSales } from '../../shared/sales'
import { DEFAULT_TAX_SETTINGS, cleanFolderName, cleanFolderPath, taxFileProblem, type FilingRecord, type TaxDocument, type TaxSettings } from '../../shared/tax'
import { DEFAULT_VAT_RATE, type PnlLine } from '../../shared/pnl'
import { cleanAnswers, isDone, type GrantApplication, type GrantProfile } from '../../shared/grants'
import { adjustProblem, giftCardAmountProblem, type GiftCard, type GiftCardActivity, type LoyaltyEvent, type LoyaltyMember, type LoyaltyProgram } from '../../shared/loyalty'
import type { MovementInput, StockItem, StockMovement, Supplier } from '../../shared/stock'
import type { Recipe } from '../../shared/recipes'
import { addDays, localDate, minutesBetween, today, weekDates, weekStart, zonedIso } from '../../shared/time'

interface RawEntry {
  id: string; profile_id: string; position_id: number | null; shift_id: string | null
  clock_in: string; clock_out: string | null; source: string; clock_out_source: string | null
  flags: string[]; note: string | null; approved_at: string | null
}
interface RawBreak { id: string; time_entry_id: string; break_type_id: number | null; started_at: string; ended_at: string | null }

const uid = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

export function createDemoApi(): Api {
  const business: Business = {
    name: 'Easy Beans Coffee',
    business_type: 'Specialty café, drinks-first, owner-run',
    address: 'C. Pizarro, 8, 29670 San Pedro de Alcántara, Málaga',
    phone: '+34 695 415 335',
    email: 'easybeanscafe@gmail.com',
    instagram: '@easy.beans.coffee',
    website: 'https://www.easybeanscoffee.com/',
    timezone: 'Europe/Madrid',
    currency: 'EUR',
    tax_id: 'B12345674',
    opening_hours: {
      mon: { open: '08:00', close: '18:00' }, tue: { open: '08:00', close: '18:00' },
      wed: { open: '08:00', close: '18:00' }, thu: { open: '08:00', close: '18:00' },
      fri: { open: '08:00', close: '18:00' }, sat: { open: '09:00', close: '18:00' },
      sun: { open: '09:00', close: '16:00' },
    },
    peak_hours: { start: '11:00', end: '15:00' },
    team_channel: 'whatsapp',
    owners: ["Aron O'Neill", 'Mark Murray'],
    suppliers: [{ name: 'By Eric', type: 'Bakery', phone: '+34 683 16 94 37', email: 'info@by-eric.es',
      notes: 'Croissants daily, pastries every 2 days' }],
    towns_followed: ['Marbella', 'Estepona', 'Benahavís', 'Málaga'],
    notes: 'Weekday closing time to confirm: 18:00 (plan) vs 15:00 (Square rota).',
    // The sample café shows every feature; a real business starts with Sports off.
    sports_enabled: true,
    updated_at: nowIso(),
  }
  const inbox = demoInbox()
  const messenger = demoMessenger()
  const whatsappChats = demoWhatsApp()
  // Instagram mentions from the sample inbox: the bell tells every admin once (as the Worker does).
  let mentions: InstagramMention[] | null = null
  const demoMentions = () => {
    if (mentions) return mentions
    const { conversations, tagged } = inbox.state()
    mentions = mentionsIn(conversations, tagged).map(m => ({ ...m, status: 'new' as const, reposted_url: null, decided_at: null }))
    for (const m of mentions) for (const a of profiles.filter(p => p.role === 'admin' && p.active)) {
      notes.push({ id: notes.length + 1, profile_id: a.id, title: mentionTitle(m), body: m.caption, link: '/notifications',
        created_at: m.mentioned_at, read_at: null, kind: 'instagram_mention', data: { mention: m.id } })
    }
    return mentions
  }
  const decideMention = (id: string, status: 'reposted' | 'ignored') => {
    const m = demoMentions().find(x => x.id === id)
    if (!m) throw new Error('That mention has gone')
    Object.assign(m, { status, decided_at: nowIso(), reposted_url: status === 'reposted' ? 'https://www.instagram.com/stories/easy.beans.coffee/' : null })
    for (const n of notes) if (n.kind === 'instagram_mention' && n.data?.mention === id && !n.read_at) n.read_at = nowIso()
  }
  // Referrals: ten weeks of a café sharing its link; four businesses have gone live.
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()
  const referralDemo = {
    code: 'EASYBEAN', opens: 46,
    referrals: [
      { id: 'r1', business_name: 'La Tostadora', joined_at: daysAgo(66), set_up_at: daysAgo(58) },
      { id: 'r2', business_name: 'Panadería Sol', joined_at: daysAgo(52), set_up_at: daysAgo(40) },
      { id: 'r3', business_name: 'Matcha Marbella', joined_at: daysAgo(31), set_up_at: daysAgo(24) },
      { id: 'r4', business_name: 'Brunch Club Estepona', joined_at: daysAgo(19), set_up_at: daysAgo(9) },
      { id: 'r5', business_name: 'Heladería Nieve', joined_at: daysAgo(12), set_up_at: null },
      { id: 'r6', business_name: 'The Juice Bar', joined_at: daysAgo(6), set_up_at: null },
      { id: 'r7', business_name: 'Café Alameda', joined_at: daysAgo(2), set_up_at: null },
    ].reverse().sort((a, b) => b.joined_at.localeCompare(a.joined_at)),
  }
  const integ: IntegrationsState = {
    configured: { google_business: true, whatsapp: true, instagram: true, spotify: true, gmail: true, outlook: true, google_drive: true, onedrive: true,
      youtube_music: true, google_calendar: true, outlook_calendar: true, facebook: true, tiktok: true, square: true, stripe: true,
      sumup: true, linkedin: true, search_console: true },
    queue: [],
    integrations: [
      { provider: 'google_business', status: 'connected', account_label: 'Easy Beans Coffee',
        external: { locations: [{ name: 'locations/1', title: 'Easy Beans Coffee' }], location: 'locations/1', closed_on_holidays: false },
        connected_at: nowIso(), last_sync_at: nowIso(), last_error: null, last_checked_at: nowIso() },
      { provider: 'whatsapp', status: 'connected', account_label: '+34 695 415 335', external: {}, connected_at: nowIso(), last_sync_at: null, last_error: null, last_checked_at: nowIso() },
      { provider: 'spotify', status: 'connected', account_label: 'Easy Beans (Premium)',
        external: { playlist: { id: 'pl1', name: 'Easy Beans · Mornings', tracks: 84, url: 'https://open.spotify.com', owner: 'Easy Beans' } },
        connected_at: nowIso(), last_sync_at: null, last_error: null, last_checked_at: nowIso() },
      { provider: 'instagram', status: 'connected', account_label: '@easy.beans.coffee', external: {}, connected_at: nowIso(), last_sync_at: nowIso(), last_error: null, last_checked_at: nowIso() },
      // LinkedIn posts to the café's Page; Search Console reads the café's website.
      { provider: 'linkedin', status: 'connected', account_label: 'Easy Beans Coffee',
        external: { member: { id: 'demo-member', name: "Aron O'Neill" }, pages: [{ id: '101', name: 'Easy Beans Coffee' }], page_id: '101', page_name: 'Easy Beans Coffee',
          expires_at: new Date(Date.now() + 45 * 86_400_000).toISOString() },
        connected_at: nowIso(), last_sync_at: null, last_error: null, last_checked_at: nowIso() },
      { provider: 'search_console', status: 'connected', account_label: 'www.easybeanscoffee.com',
        external: { sites: ['https://www.easybeanscoffee.com/'], site: 'https://www.easybeanscoffee.com/' },
        connected_at: nowIso(), last_sync_at: nowIso(), last_error: null, last_checked_at: nowIso() },
      ...(['gmail', 'outlook', 'google_drive', 'onedrive', 'youtube_music', 'google_calendar', 'outlook_calendar', 'facebook', 'tiktok', 'square', 'stripe', 'sumup'] as const).map(provider => ({
        provider, status: 'disconnected' as const, account_label: null, external: {}, connected_at: null, last_sync_at: null, last_error: null, last_checked_at: null })),
    ],
  }
  /** Demo of the Worker's rules: an app that becomes connected (or chosen) disconnects the others in its group. */
  const setConnection = (provider: IntegrationProvider, patch: Partial<Integration>) => {
    const row = integ.integrations.find(i => i.provider === provider)!
    Object.assign(row, patch)
    const g = groupOf(provider)
    if (g && (patch.status === 'connected' || patch.status === 'pending')) {
      for (const o of integ.integrations) {
        if (o !== row && groupOf(o.provider) === g && o.status !== 'disconnected') Object.assign(o, { status: 'disconnected', account_label: null, external: {}, last_error: null })
      }
    }
    return row
  }
  const youtubePlaylists = [
    { id: 'yt1', name: 'Easy Beans · Café mix', tracks: 56, url: 'https://music.youtube.com/playlist?list=yt1', owner: 'Easy Beans' },
    { id: 'yt2', name: 'Sunday slow bar', tracks: 31, url: 'https://music.youtube.com/playlist?list=yt2', owner: 'Easy Beans' },
  ]
  const demoPlaylists = [
    { id: 'pl1', name: 'Easy Beans · Mornings', tracks: 84, url: 'https://open.spotify.com', owner: 'Easy Beans' },
    { id: 'pl2', name: 'Easy Beans · Afternoon chill', tracks: 112, url: 'https://open.spotify.com', owner: 'Easy Beans' },
    { id: 'pl3', name: 'Aron’s gym mix', tracks: 40, url: 'https://open.spotify.com', owner: 'Aron' },
  ]
  const music: { playing: boolean; track?: string; artist?: string; device?: string } = { playing: false }
  // The café player (Music page): sample songs; the demo plays them with a pretend player.
  const demoTracks: Record<string, CafeTrack[]> = {
    yt1: [['Sunday Morning', 'Maroon 5'], ['Coffee', 'beabadoobee'], ['Banana Pancakes', 'Jack Johnson'], ['Bloom', 'The Paper Kites'],
      ['Golden Hour', 'JVKE'], ['Riptide', 'Vance Joy']].map(([title, artist], i) => ({ id: `demo-yt1-${i + 1}`, title, artist })),
    yt2: [['Holocene', 'Bon Iver'], ['Skinny Love', 'Birdy'], ['Ho Hey', 'The Lumineers']].map(([title, artist], i) => ({ id: `demo-yt2-${i + 1}`, title, artist })),
    yt3: [['Day one', 'Easy Beans'], ['Day two', 'Easy Beans']].map(([title, artist], i) => ({ id: `demo-yt3-${i + 1}`, title, artist })),
  }
  const player: MusicPlayerState = { device_id: null, device_name: null, playlist: null, queue: [], queue_version: 0, playlist_order: [], position: 0, playing: false,
    elapsed: 0, duration: 0, volume: 80, command: null, command_seq: 0, heartbeat_at: null, updated_at: nowIso() }
  const cafeMusic = () => integ.integrations.find(i => (i.provider === 'spotify' || i.provider === 'youtube_music') && i.status === 'connected')
  // Social planner: a published post and carousel, a post Instagram refused (to fix and post again),
  // a reel and a story coming up, a story reminder that's due now (posted by hand), a Facebook text
  // post next week, and a draft.
  const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
  const svg = (bg: string, cup: string, text: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="${bg}"/><circle cx="200" cy="215" r="120" fill="#fff"/><circle cx="200" cy="215" r="92" fill="${cup}"/><path d="M165 205c20-30 50-30 70 0-20 30-50 30-70 0z" fill="${bg}"/><text x="200" y="70" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#A85A68">${text}</text></svg>`)}`
  const PHOTO = svg('#F3DED3', '#8B5E3C', 'Easy Beans')
  const MATCHA = svg('#E3EDD9', '#6B8E4E', 'Matcha')
  const UBE = svg('#E9E2F4', '#7E64A8', 'Ube latte')
  // Demo "videos" are pictures (the planner shows a video badge and plays what it can).
  const CLIP = svg('#2B2B2B', '#8B5E3C', 'Latte art')
  const photo = (url: string) => ({ url, type: 'image' as const })
  const clip = (url: string) => ({ url, type: 'video' as const })
  const posts: SocialPost[] = [
    { id: uid(), kind: 'post', caption: 'Iced oat latte season is here. Come and cool down on the terrace.', image_url: PHOTO, media: [photo(PHOTO)], targets: ['facebook', 'instagram'], auto: true,
      scheduled_at: hoursFromNow(-26), status: 'published', created_at: hoursFromNow(-50), published_at: hoursFromNow(-26),
      results: { instagram: { status: 'published', url: 'https://www.instagram.com/easy.beans.coffee/' }, facebook: { status: 'published', url: 'https://www.facebook.com/' } } },
    { id: uid(), kind: 'carousel', caption: 'Three new drinks for autumn: which one first?', image_url: MATCHA, media: [photo(MATCHA), photo(UBE), photo(PHOTO)], targets: ['instagram'], auto: true,
      scheduled_at: hoursFromNow(-24 * 5), status: 'published', created_at: hoursFromNow(-24 * 6), published_at: hoursFromNow(-24 * 5),
      results: { instagram: { status: 'published', url: 'https://www.instagram.com/easy.beans.coffee/' } } },
    { id: uid(), kind: 'post', caption: 'Acai bowls are back: fresh fruit, granola, honey.', image_url: UBE, media: [photo(UBE)], targets: ['instagram'], auto: true,
      scheduled_at: hoursFromNow(-3), status: 'failed', created_at: hoursFromNow(-28), published_at: null,
      results: { instagram: { status: 'failed', error: 'Instagram couldn’t use the photo or video', at: hoursFromNow(-2) } } },
    { id: uid(), kind: 'story', caption: 'Poll sticker: oat or almond?', image_url: null, media: [], targets: ['instagram'], auto: false,
      scheduled_at: hoursFromNow(-1), status: 'due', results: {}, created_at: hoursFromNow(-30), published_at: null },
    { id: uid(), kind: 'post', caption: 'Feria week: we stay open until 23:00 from Thursday to Sunday. See you there!', image_url: PHOTO, media: [photo(PHOTO)], targets: ['google', 'instagram'], auto: true,
      scheduled_at: hoursFromNow(20), status: 'scheduled', results: {}, created_at: nowIso(), published_at: null },
    { id: uid(), kind: 'reel', caption: 'Latte art, slowly. 🎥', image_url: CLIP, media: [clip(CLIP)], targets: ['instagram'], auto: true,
      scheduled_at: hoursFromNow(24 * 2 + 3), status: 'scheduled', results: {}, created_at: nowIso(), published_at: null },
    { id: uid(), kind: 'story', caption: '', image_url: UBE, media: [photo(UBE)], targets: ['instagram'], auto: true,
      scheduled_at: hoursFromNow(24 * 3), status: 'scheduled', results: {}, created_at: nowIso(), published_at: null },
    { id: uid(), kind: 'post', caption: 'Sunday slow bar: our new Ethiopian filter, brewed to order.', image_url: null, media: [], targets: ['facebook'], auto: true,
      scheduled_at: hoursFromNow(24 * 6), status: 'scheduled', results: {}, created_at: nowIso(), published_at: null },
    { id: uid(), kind: 'post', caption: 'Ideas for the matcha menu launch…', image_url: null, media: [], targets: ['instagram'], auto: true, scheduled_at: null, status: 'draft', results: {}, created_at: nowIso(), published_at: null },
  ]
  // Tax: what the business files, returns done so far this year, and documents kept (Easy Beans opened in April).
  const taxSettings: TaxSettings = { ...DEFAULT_TAX_SETTINGS, gestor_email: 'hola@gestoriacosta.es' }
  const taxFilings: FilingRecord[] = [
    { id: uid(), model: '303', year: 2026, period: '2T', status: 'filed', amount: 1284.6, filed_on: '2026-07-14', reference: '3036203812456', notes: null },
    { id: uid(), model: '111', year: 2026, period: '2T', status: 'filed', amount: 412.18, filed_on: '2026-07-14', reference: '1116203812457', notes: null },
    { id: uid(), model: '115', year: 2026, period: '2T', status: 'filed', amount: 342, filed_on: '2026-07-15', reference: '1156203812458', notes: null },
    { id: uid(), model: '303', year: 2026, period: '1T', status: 'not_needed', amount: null, filed_on: null, reference: null, notes: 'Opened in April' },
    { id: uid(), model: '111', year: 2026, period: '1T', status: 'not_needed', amount: null, filed_on: null, reference: null, notes: 'Opened in April' },
    { id: uid(), model: '115', year: 2026, period: '1T', status: 'not_needed', amount: null, filed_on: null, reference: null, notes: 'Opened in April' },
    { id: uid(), model: '303', year: 2026, period: '3T', status: 'with_gestor', amount: null, filed_on: null, reference: null, notes: null },
  ]
  const taxDoc = (name: string, kind: TaxDocument['kind'], quarter: TaxDocument['quarter'], day: string, size: number): TaxDocument => {
    const folder = ['Tax', '2026', `Q${quarter}`, ({ purchase_invoice: 'Purchase invoices', sales_invoice: 'Sales invoices', receipt: 'Receipts', payslip: 'Payslips',
      bank_statement: 'Bank statements', tax_return: 'Tax returns', contract: 'Contracts', other: 'Other' } as const)[kind]]
    return { id: uid(), name, kind, year: 2026, quarter, size, sha256: null, storage: 'google_drive', file_id: uid(), folder,
      link: `https://drive.google.com/demo/Business Agent/${folder.join('/')}/${name}`, notes: null, uploaded_by: null, uploaded_at: `${day}T10:00:00Z` }
  }
  const taxDocuments: TaxDocument[] = [
    taxDoc('Factura By Eric agosto.pdf', 'purchase_invoice', 3, '2026-09-02', 184_220),
    taxDoc('Factura Makro 2026-08-21.pdf', 'purchase_invoice', 3, '2026-08-22', 96_512),
    taxDoc('Extracto BBVA agosto.pdf', 'bank_statement', 3, '2026-09-03', 402_118),
    taxDoc('Nómina Julio agosto.pdf', 'payslip', 3, '2026-09-01', 88_004),
    taxDoc('Modelo 303 2T 2026 justificante.pdf', 'tax_return', 2, '2026-07-14', 61_877),
  ]
  // Folders made in the demo Drive under Business Agent (the sorted ones exist once a document is in them).
  const taxFolderPaths = new Set<string>(['Tax/2026/Gestoría'])
  const canTax = () => me()?.role === 'admin' && !!me()?.can_see_pay
  const readTax = () => canTax() || partnerCan('finances')
  const needTax = () => { if (!canTax()) throw new Error('Only admins with pay access manage tax documents') }
  const taxStorage = () => {
    const store = (['google_drive', 'onedrive'] as const).find(p => integ.integrations.some(i => i.provider === p && i.status === 'connected'))
    if (!store) throw new Error('Connect Google Drive or OneDrive on the Connections page to keep tax documents. They go in its Business Agent/Tax folder.')
    return store
  }
  // Square loyalty (Easy Beans Club: a stamp a visit, the 10th coffee free) and gift cards, once Square is connected.
  const clubProgram: LoyaltyProgram = { one: 'Stamp', other: 'Stamps', per_visit: 1, minimum_spend: 2.5, per_spend: null,
    tiers: [{ id: 'tier-coffee', name: 'Free coffee (the 10th)', points: 9 }] }
  const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const roll = seeded(42)
  const CLUB = ['Lucía García', 'Tom Baker', 'Carmen Ruiz', 'Javier López', 'Emma Wilson', 'Sofía Martín', 'Daniel Sánchez', 'Olivia Brown', 'Pablo Romero',
    'Laura Navarro', 'James Taylor', 'Elena Torres', 'Hugo Díaz', 'Chloe Martin', 'Marta Gil', 'Lars Jensen', 'Paula Molina', 'Isabel Ortega', 'Noah Smith',
    'Alba Castro', 'Diego Ramos', 'Grace Evans', 'Irene Vázquez', 'Mateo Herrera', 'Ana Morales', 'Sven Larsen', 'Nuria Iglesias', 'Leo Garrido',
    'Rocío Prieto', 'Ella Johnson', 'Adrián Cano', 'Clara Rubio', 'Mia Thomas', 'Álvaro Peña', 'Inés Calvo', 'Lucas Fuentes', 'Sara Méndez', 'Oscar Lund',
    'Julia Serrano', null]
  const clubMembers: LoyaltyMember[] = []
  const clubEvents: LoyaltyEvent[] = []
  CLUB.forEach((name, i) => {
    const id = `la-${i + 1}`
    const visits = Math.floor(roll() * 14) + 1
    let balance = Math.floor(roll() * 9)
    let last: string | null = null
    for (let v = 0; v < visits; v++) {
      const at = new Date(Date.now() - Math.floor(roll() * 59 * 86_400_000) - 3_600_000).toISOString()
      clubEvents.push({ id: `${id}-v${v}`, kind: 'earn', points: 1, at, account_id: id })
      if (!last || at > last) last = at
    }
    if (visits > 9) clubEvents.push({ id: `${id}-r`, kind: 'redeem', points: 0, at: new Date(Date.now() - Math.floor(roll() * 20 * 86_400_000)).toISOString(), account_id: id })
    if (i === 0) balance = 8 // Lucía: one more coffee and the next is free
    clubMembers.push({ id, customer_id: `sq-c${i + 1}`, name, balance, lifetime: visits + balance, enrolled_at: new Date(Date.now() - (60 + i) * 86_400_000).toISOString(), last_visit: last })
  })
  clubEvents.sort((a, b) => b.at.localeCompare(a.at))
  const gan4 = () => String(1000 + Math.floor(roll() * 9000))
  const cardDay = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
  const giftCardList: GiftCard[] = [
    [25, 25, 3, 'Lucía García'], [50, 32.4, 9, null], [20, 0, 40, 'Tom Baker'], [30, 30, 12, null],
    [15, 6.8, 22, 'Carmen Ruiz'], [40, 40, 1, null], [25, 11.2, 30, 'Emma Wilson'], [100, 100, 6, 'Hotel Puente Romano'],
  ].map(([sold, balance, ago, customer], i) => ({ id: `gc-${i + 1}`, last4: gan4(), type: 'DIGITAL' as const,
    state: (balance === 0 ? 'DEACTIVATED' : 'ACTIVE') as GiftCard['state'], balance: balance as number, created_at: cardDay(ago as number),
    customer_id: customer ? `sq-g${i + 1}` : null, customer: customer as string | null, sold: sold as number }))
    .map(({ sold: _sold, ...c }) => c)
  const giftActivity: GiftCardActivity[] = giftCardList.flatMap((c, i) => {
    const sold = [25, 50, 20, 30, 15, 40, 25, 100][i]
    const out: GiftCardActivity[] = [{ id: `ga-${i}-a`, kind: 'activate', amount: sold, at: c.created_at, last4: c.last4, balance: sold }]
    if (c.balance < sold) out.push({ id: `ga-${i}-r`, kind: 'redeem', amount: Math.round((sold - c.balance) * 100) / 100, at: new Date(Date.parse(c.created_at) + 2 * 86_400_000).toISOString(), last4: c.last4, balance: c.balance })
    return out
  }).sort((a, b) => b.at.localeCompare(a.at))
  const squareOn = () => integ.integrations.some(i => i.provider === 'square' && i.status === 'connected')
  const needSquare = () => {
    if (!isAdmin()) throw new Error('Only an admin can see loyalty and gift cards')
    if (!squareOn()) throw new Error('Connect Square on the Connections page to see loyalty and gift cards.')
  }
  const inRange = (at: string, from: string, to: string) => at.slice(0, 10) >= from && at.slice(0, 10) <= to

  /** Where the demo keeps photos and videos: the connected Drive or OneDrive. */
  const mediaStorage = () => (['google_drive', 'onedrive'] as const).find(p => integ.integrations.some(i => i.provider === p && i.status === 'connected')) ?? null
  const networkName = (t: SocialNetwork) => ({ google: 'Google Maps', tiktok: 'TikTok', linkedin: 'LinkedIn' } as Partial<Record<SocialNetwork, string>>)[t] ?? t[0].toUpperCase() + t.slice(1)
  /** Demo: posts that are due "go out" to every connected network; reminders become due and admins are told. */
  const publishDue = () => {
    for (const p of posts) {
      if (p.status !== 'scheduled' || !p.scheduled_at || p.scheduled_at > nowIso()) continue
      if (!p.auto) {
        p.status = 'due'
        for (const a of profiles.filter(x => x.role === 'admin' && x.active)) {
          notes.push({ id: notes.length + 1, profile_id: a.id, title: `Time to post your ${p.kind} on ${p.targets.map(networkName).join(' and ')}`,
            body: p.caption.slice(0, 140) || null, link: '/social', created_at: nowIso(), read_at: null })
        }
        continue
      }
      const connected = (n: string) => integ.integrations.some(i => i.provider === (n === 'google' ? 'google_business' : n) && i.status === 'connected')
      p.results = Object.fromEntries(p.targets.map(t => [t, connected(t) ? { status: 'published' as const, at: nowIso() } : { status: 'failed' as const, error: `${networkName(t)} is not connected`, at: nowIso() }]))
      const ok = Object.values(p.results).filter(r => r.status === 'published').length
      p.status = ok === p.targets.length ? 'published' : ok ? 'partly' : 'failed'
      p.published_at = ok ? nowIso() : null
    }
  }
  /**
   * Demo takings: a believable café week (quieter Mondays, busy weekends), spread over the opening
   * hours with the 11–3 rush, and paid mostly by card. Stripe sends no payment methods.
   */
  const round2 = (n: number) => Math.round(n * 100) / 100
  const paymentSystems = () => (['square', 'sumup', 'stripe'] as const).filter(p => integ.integrations.some(i => i.provider === p && i.status === 'connected'))
  // Easy Beans opened in April 2026: no takings before then.
  const OPENED = '2026-04-01'
  const demoSales = (from: string, to: string, provider: 'square' | 'stripe' | 'sumup', share = 1): Sales => {
    const days: Sales['days'] = []
    for (let d = from < OPENED ? OPENED : from; d <= to; d = addDays(d, 1)) {
      if (d > today()) break
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay()
      const seed = [...d].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 997, 7)
      const gross = round2(([520, 380, 430, 450, 610, 890, 820][dow] + (seed % 90) - 45) * share)
      const [open, close] = dow === 0 ? [9, 16] : dow === 6 ? [9, 18] : [8, 18]
      const weight = Array.from({ length: 24 }, (_, h) => (h < open || h >= close ? 0 : h >= 11 && h < 15 ? 2.4 + ((seed + h) % 5) / 10 : 1 + ((seed * h) % 4) / 10))
      const total = weight.reduce((a, b) => a + b, 0)
      const hours = weight.map(w => round2(gross * w / total))
      const methods = provider !== 'stripe' ? { card: round2(gross * 0.71), wallet: round2(gross * 0.19), cash: round2(gross * 0.09), other: round2(gross * 0.01) } : undefined
      days.push({ date: d, gross, tips: round2(gross * 0.04), refunds: seed % 11 === 0 ? 4.2 : 0, payments: Math.round(gross / 6.4), hours, ...(methods ? { methods } : {}) })
    }
    return { currency: 'EUR', days }
  }
  /** Demo best sellers: the Easy Beans menu, in proportion to the days asked for. */
  const demoItems = (from: string, to: string): SalesItem[] => {
    const span = Math.max(1, Math.round((Date.parse(`${to > today() ? today() : to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1)
    const menu: [string, number, number][] = [
      ['Iced Matcha Latte', 4.5, 21], ['Flat White', 3.2, 24], ['Cappuccino', 3, 17], ['Iced Strawberry Ube Latte', 5.2, 11],
      ['Croissant', 2.4, 15], ['Pistachio Croissant', 4.2, 9], ['Açaí Bowl', 8.5, 6], ['Iced Latte', 3.8, 12],
      ['Matcha Latte', 4.2, 10], ['Americano', 2.5, 9], ['Smoothie', 5.5, 5], ['Almond Croissant', 3.4, 5], ['Brownie', 3.2, 4], ['Lemon Tart', 4.5, 3],
    ]
    return menu.map(([name, price, perDay]) => ({ name, quantity: perDay * span, gross: round2(perDay * span * price) }))
      .sort((a, b) => b.gross - a.gross)
  }
  /**
   * Demo Search Console: the café's website on Google since it went live two months ago, growing
   * week by week, busier at weekends (brunch), mostly found on phones, with Google's 2-day lag.
   */
  const SITE_START = addDays(today(), -60)
  const SEARCHES: [string, number, number][] = [ // what people searched, impressions a day, average position
    ['easy beans coffee', 34, 1.1], ['easy beans san pedro', 12, 1.3], ['coffee san pedro de alcantara', 48, 4.6], ['cafe san pedro alcantara', 41, 5.4],
    ['specialty coffee marbella', 58, 8.7], ['brunch marbella', 115, 13.8], ['best coffee marbella', 66, 11.2], ['breakfast san pedro de alcantara', 31, 7.4],
    ['matcha latte marbella', 21, 6.2], ['iced matcha marbella', 11, 7.8], ['açaí bowl marbella', 17, 9.1], ['ube latte', 24, 12.6],
    ['oat latte san pedro', 8, 3.1], ['cafe calle pizarro san pedro', 5, 1.6], ['coffee shop near me', 90, 18.3], ['specialty coffee costa del sol', 27, 15.4],
    ['brunch san pedro alcantara', 39, 5.9], ['croissant san pedro de alcantara', 14, 6.8], ['coffee marbella', 72, 16.1], ['flat white marbella', 9, 8.2],
  ]
  const ctrAt = (pos: number) => (pos < 1.5 ? 0.41 : pos < 3 ? 0.19 : pos < 5 ? 0.092 : pos < 8 ? 0.046 : pos < 11 ? 0.024 : 0.007)
  const sumRows = (rows: SearchRow[]): SearchRow => {
    const clicks = rows.reduce((n, r) => n + r.clicks, 0), impressions = rows.reduce((n, r) => n + r.impressions, 0)
    const position = impressions ? rows.reduce((n, r) => n + r.position * r.impressions, 0) / impressions : 0
    return { clicks, impressions, ctr: impressions ? Math.round(clicks / impressions * 10_000) / 10_000 : 0, position: Math.round(position * 10) / 10 }
  }
  /** One part of the whole (a page, device or country): its share of clicks, a little higher or lower on the page (lower down: fewer clicks per view). */
  const share = (all: SearchRow, part: number, lower: number): SearchRow =>
    sumRows([{ clicks: Math.round(all.clicks * part), impressions: Math.round(all.impressions * part * (1 + lower / 8)), ctr: 0, position: Math.max(1, all.position + lower) }])
  const demoSearch = (from: string, to: string): SearchReport => {
    const site = 'https://www.easybeanscoffee.com/'
    const byQuery = new Map<string, SearchRow[]>()
    const days: SearchReport['days'] = []
    const last = addDays(today(), -2)
    for (let d = from < SITE_START ? SITE_START : from; d <= to && d <= last; d = addDays(d, 1)) {
      const age = Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${SITE_START}T12:00:00Z`)) / 86_400_000)
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay()
      const growth = 0.45 + 0.55 * Math.min(1, age / 60)
      const rows = SEARCHES.map(([q, perDay, pos], i) => {
        const seed = [...`${d}${q}`].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 1009, 11)
        const weekend = (dow === 0 || dow === 6) && /brunch|breakfast/.test(q) ? 1.6 : 1
        const impressions = Math.round(perDay * growth * weekend * (0.75 + (seed % 50) / 100))
        const position = Math.max(1, pos * (1.15 - 0.15 * Math.min(1, age / 60)) + ((seed % 7) - 3) / 10)
        const clicks = Math.round(impressions * ctrAt(position) * (0.8 + ((seed * (i + 1)) % 40) / 100))
        const r = { clicks, impressions, ctr: 0, position }
        byQuery.set(q, [...(byQuery.get(q) ?? []), r])
        return r
      })
      days.push({ date: d, ...sumRows(rows) })
    }
    const totals = sumRows(days)
    const byClicks = (a: SearchRow, b: SearchRow) => b.clicks - a.clicks || b.impressions - a.impressions
    const pages: [string, number, number][] = [['', 0.5, -0.4], ['menu/', 0.21, 0.6], ['brunch/', 0.12, 1.4], ['contact/', 0.1, 0.2], ['about/', 0.07, 2.1]]
    const devices: [SearchReport['devices'][number]['device'], number, number][] = [['MOBILE', 0.74, -0.3], ['DESKTOP', 0.22, 0.8], ['TABLET', 0.04, 0.4]]
    const countries: [string, number, number][] = [['esp', 0.6, -0.5], ['gbr', 0.17, 0.4], ['irl', 0.05, 0.9], ['deu', 0.04, 1.3], ['nld', 0.035, 1.1],
      ['fra', 0.03, 1.6], ['swe', 0.025, 1.2], ['usa', 0.02, 2.4], ['bel', 0.015, 1.5], ['nor', 0.015, 1.8]]
    return {
      site, from, to, totals, days,
      queries: [...byQuery].map(([query, rows]) => ({ query, ...sumRows(rows) })).sort(byClicks).slice(0, 25),
      pages: pages.map(([path, part, lower]) => ({ page: `${site}${path}`, ...share(totals, part, lower) })).sort(byClicks),
      devices: devices.map(([device, part, lower]) => ({ device, ...share(totals, part, lower) })).sort(byClicks),
      countries: countries.map(([country, part, lower]) => ({ country, ...share(totals, part, lower) })).sort(byClicks),
    }
  }
  // Music page: each person's own accounts (connecting is simulated in the demo).
  const myAccounts = new Map<string, MusicAccount[]>()
  const myPlayer: MyNowPlaying = { playing: false }
  const feeds = new Map<string, Partial<Record<'me' | 'business', string>>>()
  const keys = new Map<string, ApiKey[]>()
  const alerts: EventAlert[] = []
  const brand: Brand = {
    logo: null, logo_mark: null, heading_font: 'Poppins', body_font: 'Figtree', updated_at: nowIso(),
    notes: 'Rose Pink leads; one accent at a time. Never recolour, stretch or redraw the logo.',
    colours: [
      { name: 'Rose Pink', hex: '#F79BA4', role: 'primary', use: 'Buttons, highlights, the logo circle' },
      { name: 'Grey Limewash', hex: '#C6C2BB', role: 'secondary', use: 'Surfaces and panels, used generously' },
      { name: 'Ube Lilac', hex: '#B7A3D8', role: 'accent', use: 'Ube drinks, seasonal moments' },
      { name: 'Matcha Green', hex: '#6B8E4E', role: 'accent', use: 'Wellbeing, sourcing, all-good cues' },
    ],
  }
  const notes: (AppNotification & { profile_id: string })[] = []
  const samplePlaylists: Record<MusicProvider, MusicPlaylist[]> = {
    spotify: [
      { provider: 'spotify', id: 'demo-sp-1', name: 'Morning coffee', tracks: 64, url: 'https://open.spotify.com', owner: 'You' },
      { provider: 'spotify', id: 'demo-sp-2', name: 'Lo-fi for closing up', tracks: 120, url: 'https://open.spotify.com', owner: 'You' },
      { provider: 'spotify', id: 'demo-sp-3', name: 'Gym mix', tracks: 38, url: 'https://open.spotify.com', owner: 'You' },
    ],
    youtube: [
      { provider: 'youtube', id: 'demo-yt-1', name: 'Liked music', tracks: 212, url: 'https://music.youtube.com', owner: 'You' },
      { provider: 'youtube', id: 'demo-yt-2', name: 'Spanish summer', tracks: 45, url: 'https://music.youtube.com', owner: 'You' },
    ],
  }
  // Stock: the café's wholesale suppliers and what it buys from each (By Eric is the bakery from the business details).
  const supplier = (s: Partial<Supplier> & { id: string; name: string }): Supplier => ({ kind: null, contact_name: null, email: null, phone: null,
    whatsapp: false, website: null, order_url: null, address: null, account_number: null, order_days: [], cutoff: null, lead_days: 1,
    minimum_order: null, payment_terms: null, notes: null, active: true, ...s })
  const suppliers: Supplier[] = [
    supplier({ id: 'sup-eric', name: 'By Eric', kind: 'Bakery', contact_name: 'Eric', phone: '+34 683 16 94 37', whatsapp: true, email: 'info@by-eric.es',
      order_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], cutoff: '17:00', lead_days: 1, notes: 'Croissants daily, pastries every 2 days' }),
    supplier({ id: 'sup-roaster', name: 'Tostadores del Sur', kind: 'Coffee roaster', contact_name: 'Lucía', phone: '+34 952 77 41 10', whatsapp: true,
      email: 'pedidos@tostadoresdelsur.example', website: 'https://tostadoresdelsur.example', order_url: 'https://tostadoresdelsur.example/trade',
      account_number: 'EB-2041', order_days: ['mon', 'thu'], cutoff: '12:00', lead_days: 2, minimum_order: 80, payment_terms: '30 days' }),
    supplier({ id: 'sup-dairy', name: 'Lácteos Costa del Sol', kind: 'Dairy', contact_name: 'Paco', phone: '+34 611 48 20 93', whatsapp: true,
      email: 'pedidos@lacteoscosta.example', website: 'https://lacteoscosta.example', order_days: ['mon', 'wed', 'fri'], cutoff: '12:00', lead_days: 1,
      minimum_order: 60, payment_terms: 'Direct debit, monthly' }),
    supplier({ id: 'sup-pack', name: 'EcoPack Andalucía', kind: 'Packaging', email: 'ventas@ecopack.example', phone: '+34 954 30 12 88',
      website: 'https://ecopack.example', order_url: 'https://ecopack.example/shop', order_days: ['tue'], lead_days: 3, minimum_order: 150,
      payment_terms: 'Card on order' }),
    supplier({ id: 'sup-matcha', name: 'Matcha & Chai Co.', kind: 'Drinks', contact_name: 'Hana', email: 'trade@matchachai.example',
      website: 'https://matchachai.example', order_url: 'https://matchachai.example/wholesale', order_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
      lead_days: 3, minimum_order: 50 }),
    supplier({ id: 'sup-cash', name: 'Cash & Carry Marbella', kind: 'Cash & carry', phone: '+34 952 82 33 00', address: 'Pol. Ind. La Ermita, Marbella',
      account_number: '7781-332', notes: 'Card needed at the door. Syrups, napkins and cleaning when short.' }),
  ]
  const stockItem = (i: Partial<StockItem> & { name: string }): StockItem => ({ id: uid(), category: null, supplier_id: null, supplier_sku: null,
    product_url: null, unit: 'unit', pack_size: null, order_multiple: 1, cost_per_unit: null, vat_rate: 10, sell_price: null, on_hand: 0,
    par_level: null, reorder_at: null, location: 'Storeroom', retail: false, notes: null, active: true, updated_at: nowIso(), ...i })
  const stock: StockItem[] = [
    stockItem({ name: 'House espresso blend', category: 'Coffee', supplier_id: 'sup-roaster', supplier_sku: 'ESP-HOUSE-1K', unit: 'kg', pack_size: '1 kg bag',
      product_url: 'https://tostadoresdelsur.example/trade/house-espresso', cost_per_unit: 18.5, on_hand: 6, par_level: 12, reorder_at: 4 }),
    stockItem({ name: 'Decaf beans', category: 'Coffee', supplier_id: 'sup-roaster', supplier_sku: 'DEC-1K', unit: 'kg', pack_size: '1 kg bag', cost_per_unit: 21,
      on_hand: 1.5, par_level: 3, reorder_at: 1 }),
    stockItem({ name: 'Guest filter coffee', category: 'Coffee', supplier_id: 'sup-roaster', supplier_sku: 'GUEST-500', unit: 'kg', pack_size: '500 g bag',
      order_multiple: 0.5, cost_per_unit: 24, on_hand: 0.8, par_level: 3, reorder_at: 1 }),
    stockItem({ name: 'Whole milk', category: 'Milk & dairy', supplier_id: 'sup-dairy', supplier_sku: 'LE-1L', unit: 'l', pack_size: '6 × 1 l', order_multiple: 6,
      cost_per_unit: 0.95, on_hand: 14, par_level: 36, reorder_at: 12, location: 'Fridge' }),
    stockItem({ name: 'Oat milk (barista)', category: 'Milk & dairy', supplier_id: 'sup-dairy', supplier_sku: 'AV-B-1L', unit: 'l', pack_size: '6 × 1 l',
      order_multiple: 6, cost_per_unit: 1.45, on_hand: 8, par_level: 24, reorder_at: 10 }),
    stockItem({ name: 'Almond milk', category: 'Milk & dairy', supplier_id: 'sup-dairy', supplier_sku: 'AL-1L', unit: 'l', pack_size: '6 × 1 l', order_multiple: 6,
      cost_per_unit: 1.9, on_hand: 7, par_level: 12, reorder_at: 4 }),
    stockItem({ name: 'Ceremonial matcha', category: 'Tea & matcha', supplier_id: 'sup-matcha', supplier_sku: 'MAT-100', pack_size: '100 g tin',
      product_url: 'https://matchachai.example/wholesale/ceremonial-matcha', cost_per_unit: 14, on_hand: 2, par_level: 6, reorder_at: 2, location: 'Bar' }),
    stockItem({ name: 'Chai concentrate', category: 'Tea & matcha', supplier_id: 'sup-matcha', unit: 'bottle', pack_size: '1 l', cost_per_unit: 9.5,
      on_hand: 5, par_level: 6, reorder_at: 2, location: 'Fridge' }),
    stockItem({ name: 'Vanilla syrup', category: 'Syrups & sauces', supplier_id: 'sup-cash', unit: 'bottle', pack_size: '70 cl', cost_per_unit: 6.2,
      on_hand: 3, par_level: 6, reorder_at: 2, location: 'Bar' }),
    stockItem({ name: 'Caramel syrup', category: 'Syrups & sauces', supplier_id: 'sup-cash', unit: 'bottle', pack_size: '70 cl', cost_per_unit: 6.2,
      on_hand: 1, par_level: 6, reorder_at: 2, location: 'Bar' }),
    stockItem({ name: 'Butter croissants', category: 'Bakery', supplier_id: 'sup-eric', order_multiple: 10, cost_per_unit: 0.85, on_hand: 18, par_level: 40,
      reorder_at: 12, location: 'Bar' }),
    stockItem({ name: 'Pain au chocolat', category: 'Bakery', supplier_id: 'sup-eric', order_multiple: 6, cost_per_unit: 0.95, on_hand: 6, par_level: 24,
      reorder_at: 8, location: 'Bar' }),
    stockItem({ name: 'Cups 8 oz', category: 'Packaging', supplier_id: 'sup-pack', supplier_sku: 'CUP-8-K', pack_size: '1000 per case', order_multiple: 1000,
      cost_per_unit: 0.08, vat_rate: 21, on_hand: 650, par_level: 2000, reorder_at: 500, product_url: 'https://ecopack.example/shop/cups-8oz-kraft' }),
    stockItem({ name: 'Lids 8 oz', category: 'Packaging', supplier_id: 'sup-pack', supplier_sku: 'LID-8', pack_size: '1000 per case', order_multiple: 1000,
      cost_per_unit: 0.04, vat_rate: 21, on_hand: 300, par_level: 2000, reorder_at: 500 }),
    stockItem({ name: 'Napkins', category: 'Packaging', supplier_id: 'sup-cash', unit: 'pack', pack_size: '500 napkins', cost_per_unit: 2.1, vat_rate: 21,
      on_hand: 3, par_level: 10, reorder_at: 4 }),
    stockItem({ name: 'Easy Beans house blend 250 g', category: 'Shop', supplier_id: 'sup-roaster', supplier_sku: 'EB-RET-250', unit: 'bag', cost_per_unit: 5.2,
      sell_price: 12.5, on_hand: 14, par_level: 20, reorder_at: 6, location: 'Shop shelf', retail: true }),
    stockItem({ name: 'Easy Beans tote bag', category: 'Shop', cost_per_unit: 4.5, sell_price: 15, vat_rate: 21, on_hand: 9, par_level: 12, reorder_at: 3,
      location: 'Shop shelf', retail: true }),
  ]
  const movements: StockMovement[] = stock.slice(0, 6).map((i, n) => ({ id: uid(), item_id: i.id, at: new Date(Date.now() - (n + 1) * 86_400_000).toISOString(),
    reason: n % 2 ? 'count' : 'delivery', change: n % 2 ? -1 : i.order_multiple * 2, counted: n % 2 ? i.on_hand : null, on_hand_after: i.on_hand,
    note: null, by: null, waste_reason: null }))
  // Some waste this week and last, for the Waste page.
  const wasted = (name: string, change: number, reason: StockMovement['waste_reason'], daysAgo: number, note: string | null = null) => {
    const i = stock.find(x => x.name === name)!
    movements.push({ id: uid(), item_id: i.id, at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(), reason: 'waste', change, counted: null,
      on_hand_after: i.on_hand, note, by: null, waste_reason: reason })
  }
  wasted('Butter croissants', -4, 'expired', 0.2, 'Left at closing')
  wasted('Whole milk', -1, 'spilled', 1)
  wasted('Oat milk (barista)', -0.5, 'wrong_order', 2)
  wasted('Pain au chocolat', -3, 'expired', 3)
  wasted('House espresso blend', -0.05, 'quality', 4, 'Dialling in the grinder')
  wasted('Butter croissants', -2, 'expired', 8)
  // Menu items, made of the stock items above (by name).
  const byName = (name: string) => stock.find(x => x.name === name)!.id
  const line = (name: string, quantity: number, unit: StockItem['unit'], variant_id: string | null = null, replaces?: string) =>
    ({ item_id: byName(name), quantity, unit, variant_id, replaces_item_id: replaces ? byName(replaces) : null })
  const cupAndLid = [line('Cups 8 oz', 1, 'unit'), line('Lids 8 oz', 1, 'unit')]
  const recipe = (r: Partial<Recipe> & { name: string }): Recipe => ({ id: uid(), category: 'Coffee', square_item: null, sell_price: null, vat_rate: 10,
    target_margin: 70, wastage_pct: 3, notes: null, active: true, variants: [], lines: [], ...r })
  const recipes: Recipe[] = [
    recipe({ name: 'Flat white', sell_price: 3.2, square_item: 'Flat white', variants: [{ id: 'v-fw-oat', name: 'Oat milk', price_change: 0.4 }, { id: 'v-fw-shot', name: 'Extra shot', price_change: 0.5 }],
      lines: [line('House espresso blend', 18, 'g'), line('Whole milk', 150, 'ml'), ...cupAndLid,
        line('Oat milk (barista)', 150, 'ml', 'v-fw-oat', 'Whole milk'), line('House espresso blend', 9, 'g', 'v-fw-shot')] }),
    recipe({ name: 'Cappuccino', sell_price: 2.9, variants: [{ id: 'v-cap-oat', name: 'Oat milk', price_change: 0.4 }],
      lines: [line('House espresso blend', 18, 'g'), line('Whole milk', 180, 'ml'), ...cupAndLid, line('Oat milk (barista)', 180, 'ml', 'v-cap-oat', 'Whole milk')] }),
    recipe({ name: 'Espresso', sell_price: 1.6, lines: [line('House espresso blend', 18, 'g')] }),
    recipe({ name: 'Iced matcha latte', category: 'Tea & matcha', sell_price: 4.5, target_margin: 70,
      lines: [line('Ceremonial matcha', 0.04, 'unit'), line('Oat milk (barista)', 250, 'ml'), ...cupAndLid] }),
    recipe({ name: 'Chai latte', category: 'Tea & matcha', sell_price: 3.8, lines: [line('Chai concentrate', 0.06, 'bottle'), line('Whole milk', 200, 'ml'), ...cupAndLid] }),
    recipe({ name: 'Caramel latte', sell_price: 3.6, lines: [line('House espresso blend', 18, 'g'), line('Whole milk', 220, 'ml'), line('Caramel syrup', 0.03, 'bottle'), ...cupAndLid] }),
    recipe({ name: 'Croissant', category: 'Bakery', sell_price: 1.8, target_margin: 60, wastage_pct: 10, lines: [line('Butter croissants', 1, 'unit')] }),
    recipe({ name: 'Pain au chocolat', category: 'Bakery', sell_price: 2, target_margin: 60, wastage_pct: 10, lines: [line('Pain au chocolat', 1, 'unit')] }),
  ]
  const expenses: Expense[] = ([
    ['Rent', 1530, 'Premises'], ['Staff wages', 4300, 'People'], ['Electricity', 200, 'Utilities'], ['Insurance', 100, 'Premises'],
    ['Council tax', 50, 'Premises'], ['Broadband', 20, 'Utilities'], ['Accountant', 100, 'Services'], ['Water', 50, 'Utilities'],
    ['Cleaning supplies', 20, 'Supplies'], ['Cleaning', 50, 'Services'], ['Loan', 641.53, 'Finance'], ['Automo costs', 80, 'Services'],
    ['Wastage', 50, 'Stock'], ['Freebies', 30, 'Stock'], ['Non-retail supplies', 500, 'Supplies'], ['Printing / labels', 50, 'Marketing'],
    ['Advertising / social media', 50, 'Marketing'], ['Security system', 43.56, 'Premises'],
  ] as const).map(([name, amount, category], i) => ({ id: uid(), name, amount, category, notes: null, active: true, sort: i + 1,
    source: 'sheet' as const, updated_at: nowIso() }))
  // Profit & loss: the café's IVA rate and a one-off cost (the grinder's first service).
  const pnlSettings = { vat_rate: DEFAULT_VAT_RATE }
  const pnlLines: PnlLine[] = [
    { id: uid(), month: '2026-07-01', kind: 'cost', category: 'Equipment', label: 'Grinder service', amount: 180, notes: null },
  ]
  const sent: OutboxItem[] = [
    { id: 3, kind: 'whatsapp', payload: { template: 'shift_reminder', to: '34600111222', profile_id: 'p-julio' }, status: 'sent',
      attempts: 1, last_error: null, delivery: 'read', created_at: new Date(Date.now() - 3600000).toISOString(), sent_at: new Date(Date.now() - 3590000).toISOString() },
    { id: 2, kind: 'google_sync', payload: {}, status: 'sent', attempts: 1, last_error: null, delivery: null,
      created_at: new Date(Date.now() - 86400000).toISOString(), sent_at: new Date(Date.now() - 86390000).toISOString() },
    { id: 1, kind: 'whatsapp', payload: { template: 'missed_clock_in', to: '34600333444', profile_id: 'p-maria' }, status: 'failed',
      attempts: 2, last_error: 'Recipient phone number not on WhatsApp', delivery: null,
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(), sent_at: null },
  ]
  const todoCategories: TodoCategory[] = ([
    ['Legal & money', 'Contracts, licences, insurance, bills', '#2F4C73'], ['People', 'Roles, reviews, standards, hiring, pay', '#21907F'],
    ['Shop', 'The space: fit-out, repairs, cleaning', '#D46A2E'], ['Buying', 'Stock, packaging, equipment', '#C2961C'],
    ['Food & drink', 'Menu, recipes, ingredients, prep', '#4F8A3F'], ['Tech & till', 'Till, wifi, TV, website', '#4B4FB0'],
    ['Design', 'Menus, signage, branding, print', '#7C52AE'], ['Social & content', 'Photos, videos, posts', '#2479A8'],
    ['Marketing', 'Events, collabs, outreach', '#B23C78'], ['Future ideas', 'New business ideas for later', '#6E7D1A'],
  ] as const).map(([name, hint, colour], i) => ({ id: `tc-${i + 1}`, name, hint, colour, sort: i + 1 }))
  const cat = (name: string) => todoCategories.find(c => c.name === name)!.id
  const todos: Todo[] = ([
    ['Get the AC serviced before summer', 'Shop', null, 'p-mark', false, false, false],
    ['Buy bowls and plates', 'Buying', null, null, true, false, false],
    ['Add a photo to every item on the till', 'Tech & till', 'Square', null, false, false, false],
    ['Set up the card reader on the terrace', 'Tech & till', 'Square', 'p-aron', false, false, false],
    ['Branded paper fans for the terrace', 'Design', null, null, true, false, true],
    ['Menu board for the counter', 'Design', null, null, false, false, false],
    ['Rubbish bin for outside', 'Buying', null, null, false, false, false],
    ['Image / video loop for the TV', 'Social & content', null, 'p-maria', false, false, false],
    ['Renew the terrace licence', 'Legal & money', null, 'p-aron', false, false, false],
    ['Write the closing checklist', 'People', null, 'p-julio', false, false, false],
    ['Test a cold brew recipe', 'Food & drink', null, null, false, false, false],
    ['Clean the outside terrace', 'Shop', null, 'p-cleaner', false, true, false],
    ['Order more oat milk', 'Buying', null, null, true, false, false],
  ] as const).map(([title, c, section, assignee, starred, done, pinned], i) => ({ id: `td-${i + 1}`, title, category_id: cat(c), section,
    assignee_id: assignee, done, done_at: done ? nowIso() : null, starred, pinned, position: i + 1, created_at: nowIso() }))
  // Customers and leads: regulars, people who asked about something, and a few businesses to win over.
  const person = (c: Partial<Customer> & { days: number }): Customer => {
    const { days, ...rest } = c
    return { id: uid(), kind: 'customer', first_name: null, last_name: null, email: null, phone: null, company: null, source: 'walk_in',
      instagram: null, birthday: null, tags: [], notes: null, marketing_consent: false, consent_at: null, last_contacted_at: null,
      created_at: daysAgo(days), updated_at: daysAgo(days), ...rest, ...(rest.marketing_consent ? { consent_at: daysAgo(days) } : {}) }
  }
  const customers: Customer[] = [
    person({ days: 140, first_name: 'Lucía', last_name: 'García López', email: 'lucia.garcia@example.com', phone: '+34 611 204 318', source: 'instagram',
      instagram: 'lucia.mbl', birthday: '1992-11-03', tags: ['regular', 'oat milk'], notes: 'Oat flat white every morning before work', marketing_consent: true,
      last_contacted_at: daysAgo(9) }),
    person({ days: 120, first_name: 'James', last_name: 'Whitfield', email: 'james.whitfield@example.co.uk', phone: '+44 7700 900123',
      tags: ['regular', 'laptop'], notes: 'Works from the window table on weekdays', marketing_consent: true }),
    person({ days: 96, first_name: 'Carmen', last_name: 'Ruiz Navarro', phone: '+34 622 418 905', source: 'google', notes: 'Left a 5-star review in August' }),
    person({ days: 75, first_name: 'Sofia', last_name: 'Lindqvist', email: 'sofia.lindqvist@example.se', source: 'tiktok', birthday: '1998-10-12',
      tags: ['matcha'], marketing_consent: true }),
    person({ days: 64, first_name: 'Pablo', last_name: 'Ortega', email: 'pablo.ortega@example.es', phone: '+34 633 551 274', source: 'referral',
      birthday: '1985-10-04', tags: ['regular'], notes: 'Came with Lucía; double espresso', marketing_consent: true }),
    person({ days: 51, first_name: 'Aisha', last_name: 'Rahman', email: 'aisha.rahman@example.com', source: 'facebook' }),
    person({ days: 44, first_name: 'Kate', last_name: 'Murphy', phone: '+353 87 123 4567', tags: ['dog owner'],
      notes: 'Brings Luna the beagle; a puppuccino for her', marketing_consent: true }),
    person({ days: 20, first_name: 'Liam', last_name: "O'Connor", email: 'liam.oconnor@example.ie', source: 'event', tags: ['latte art class'], marketing_consent: true }),
    person({ days: 25, kind: 'lead', first_name: 'Marco', last_name: 'Bellini', company: 'Hotel Costa Serena (concierge)', email: 'concierge@costaserena.example',
      phone: '+34 952 880 410', source: 'event', tags: ['B2B', 'hotel'], notes: 'Met at the San Pedro business breakfast; wants a coffee voucher for guests' }),
    person({ days: 12, kind: 'lead', first_name: 'Elena', last_name: 'Vidal', company: 'Nomad Hub Coworking', email: 'elena@nomadhub.example', phone: '+34 644 902 117',
      source: 'referral', tags: ['B2B', 'office coffee'], notes: 'Coffee for 30 desks, twice a week. Send prices.' }),
    person({ days: 9, kind: 'lead', first_name: 'Inés', last_name: 'Castillo', company: 'Estudio Shanti Yoga', instagram: 'shanti.yoga.sanpedro', source: 'instagram',
      tags: ['B2B', 'collab'], notes: 'Coffee after class for their members, 10% off?', marketing_consent: true }),
    person({ days: 6, kind: 'lead', first_name: 'Javier', last_name: 'Moreno', instagram: 'javi.runs', source: 'instagram',
      notes: 'Asked about a Sunday running club coffee', marketing_consent: true }),
    person({ days: 3, kind: 'lead', first_name: 'Hannah', last_name: 'Becker', email: 'hannah.becker@example.de', source: 'website',
      notes: 'Asked about cakes and coffee for a baby shower, 15 people', marketing_consent: true }),
    person({ days: 2, kind: 'lead', first_name: 'Marta', last_name: 'Jiménez', email: 'marta.jimenez@example.es', source: 'other',
      notes: 'Signed up at the Saturday market stall' }),
    person({ days: 1, kind: 'lead', first_name: 'Diego', last_name: 'Fernández', phone: '+34 655 310 862', source: 'google',
      notes: 'Phoned about booking the terrace for a birthday' }),
  ]
  let adminNotes: string | null = 'Demo: alarm code holder, wifi for the kiosk, landlord and gestor contacts.'
  const settings: Settings = {
    early_clock_in_minutes: 10, unscheduled_clock_in: 'flag', auto_clock_out_minutes: 60,
    forgot_clock_out_grace_minutes: 30, phone_clock_in: 'anywhere', min_break_minutes: 15,
    break_after_hours: 6, max_daily_hours: 9, max_weekly_hours: 40, min_rest_hours: 12,
    approval_weekday: 1, employer_cost_multiplier: 1.3, auto_timecards_from_rota: true, vacation_days_per_year: 30,
    alert_shift_reminders: true, alert_missed_clock_in: true, alert_rota: true, alert_time_off: true,
    whatsapp_retention_days: DEFAULT_WHATSAPP_RETENTION, hidden_pages: [],
  }

  const P = { aron: 'p-aron', mark: 'p-mark', julio: 'p-julio', maria: 'p-maria', cleaner: 'p-cleaner' }
  const profiles: (Profile & { pin?: string })[] = [
    { id: P.aron, full_name: "Aron O'Neill", email: 'aron@example.com', role: 'admin', can_see_pay: true, colour: '#A85A68', active: true, phone: null, birth_date: null, pin: '1111' },
    { id: P.mark, full_name: 'Mark Murray', email: 'mark@example.com', role: 'admin', can_see_pay: true, colour: '#5B4A86', active: true, phone: null, birth_date: null, pin: '2222' },
    { id: P.julio, full_name: 'Julio', email: 'julio@example.com', role: 'employee', can_see_pay: false, colour: '#4A6536', active: true, whatsapp_opt_in: true, contact_method: 'whatsapp', phone: '+34 600 111 222', birth_date: null, pin: '1234' },
    { id: P.maria, full_name: 'Maria', email: 'maria@example.com', role: 'employee', can_see_pay: false, colour: '#B3404F', active: true, whatsapp_opt_in: true, phone: '+34 600 333 444', birth_date: null, pin: '4321' },
    { id: P.cleaner, full_name: 'Cleaner', email: null, role: 'employee', can_see_pay: false, colour: '#6B645E', active: true, phone: null, birth_date: null },
    // An outside business: the gestoría that does payroll and the accounts (read-only).
    { id: 'p-laura', full_name: 'Laura Ruiz', email: 'laura@gestoria.example', role: 'partner', can_see_pay: false, colour: '#6B645E',
      active: true, phone: null, birth_date: null, partner_company: 'Gestoría Marbella', partner_access: ['payroll', 'finances'] },
  ]
  const positions: Position[] = [
    { id: 1, name: 'Barista', colour: '#F79BA4', sort: 1, active: true },
    { id: 2, name: 'Kitchen', colour: '#6B8E4E', sort: 2, active: true },
    { id: 3, name: 'Cleaner', colour: '#C6C2BB', sort: 3, active: true },
    { id: 4, name: 'Propietario', colour: '#B7A3D8', sort: 4, active: true },
  ]
  const breakTypes: BreakType[] = [
    { id: 1, name: 'Rest 15 min (paid)', minutes: 15, paid: true },
    { id: 2, name: 'Lunch 30 min (unpaid)', minutes: 30, paid: false },
  ]
  const payRates: PayRate[] = [
    { profile_id: P.aron, effective_from: '2026-04-01', hourly_rate: 0 },
    { profile_id: P.mark, effective_from: '2026-04-01', hourly_rate: 0 },
    { profile_id: P.julio, effective_from: '2026-04-01', hourly_rate: 8.8 },
    { profile_id: P.maria, effective_from: '2026-04-01', hourly_rate: 8.8 },
    { profile_id: P.cleaner, effective_from: '2026-04-01', hourly_rate: 9.5 },
  ]

  // Rota: this week and last week, Square-style.
  const shifts: Shift[] = []
  const addShift = (date: string, profile: string | null, pos: number, from: string, to: string, brk = 0, note: string | null = null) =>
    shifts.push({ id: uid(), profile_id: profile, position_id: pos, starts_at: zonedIso(date, from),
      ends_at: zonedIso(date, to), break_minutes: brk, note, status: 'published' })
  for (const monday of [addDays(weekStart(today()), -7), weekStart(today()), addDays(weekStart(today()), 7)]) {
    const d = weekDates(monday)
    for (let i = 0; i < 5; i++) {
      addShift(d[i], P.julio, 1, '07:45', '15:00', 15)
      addShift(d[i], P.maria, 1, '10:00', i === 2 ? '17:30' : '15:00', i === 2 ? 0 : 15)
      addShift(d[i], P.aron, 4, '08:00', '12:00')
    }
    for (const i of [0, 2, 4]) addShift(d[i], P.cleaner, 3, '15:00', '17:00')
    addShift(d[5], P.maria, 1, '09:00', '15:00', 15)
    addShift(d[5], P.mark, 4, '09:00', '14:00')
    addShift(d[6], null, 1, '09:00', '16:00', 30, 'Sunday cover needed')
  }

  // Timecards for past days of last week and this week.
  const entries: RawEntry[] = []
  const breaks: RawBreak[] = []
  const changes: TimeEntryChange[] = []
  const nowMs = Date.now()
  for (const s of shifts) {
    if (!s.profile_id || new Date(s.ends_at).getTime() > nowMs) continue
    const jitterIn = (s.id.charCodeAt(0) % 7) - 3
    const jitterOut = (s.id.charCodeAt(1) % 11) - 2
    const clockIn = new Date(new Date(s.starts_at).getTime() + jitterIn * 60000).toISOString()
    const clockOut = new Date(new Date(s.ends_at).getTime() + jitterOut * 60000).toISOString()
    const e: RawEntry = { id: uid(), profile_id: s.profile_id, position_id: s.position_id, shift_id: s.id,
      clock_in: clockIn, clock_out: clockOut, source: s.profile_id === P.aron ? 'phone' : 'kiosk',
      clock_out_source: 'kiosk', flags: [], note: null, approved_at: null }
    entries.push(e)
    if (s.break_minutes) {
      const bStart = new Date(new Date(clockIn).getTime() + 3 * 3600000).toISOString()
      breaks.push({ id: uid(), time_entry_id: e.id, break_type_id: 1, started_at: bStart,
        ended_at: new Date(new Date(bStart).getTime() + s.break_minutes * 60000).toISOString() })
    }
    e.flags = computeFlags(e)
  }
  // Approve last week.
  const lastMonday = addDays(weekStart(today()), -7)
  for (const e of entries) if (localDate(e.clock_in) < weekStart(today()) && localDate(e.clock_in) >= lastMonday) e.approved_at = nowIso()

  const timeOff: TimeOff[] = [
    { id: uid(), profile_id: P.maria, starts_on: addDays(weekStart(today()), 9), ends_on: addDays(weekStart(today()), 11), kind: 'vacation',
      note: 'Family wedding in Sevilla', status: 'pending', created_at: nowIso(), decision_note: null },
    { id: uid(), profile_id: P.julio, starts_on: addDays(today(), 30), ends_on: addDays(today(), 36), kind: 'vacation',
      note: null, status: 'approved', created_at: nowIso(), decision_note: 'Enjoy!' },
  ]
  const corrections: CorrectionRequest[] = []
  const firstMaria = entries.find(e => e.profile_id === P.maria && !e.approved_at)
  if (firstMaria?.clock_out) {
    corrections.push({ id: uid(), time_entry_id: firstMaria.id, profile_id: P.maria, requested_clock_in: null,
      requested_clock_out: new Date(new Date(firstMaria.clock_out).getTime() + 20 * 60000).toISOString(),
      note: 'Stayed 20 min to help with the bakery delivery', status: 'pending', created_at: nowIso(),
      expires_at: new Date(nowMs + 30 * 86400000).toISOString(), decision_note: null })
  }

  const events: CalendarEvent[] = [
    ['2026-01-01', 'Año Nuevo', 'national'], ['2026-01-06', 'Epifanía del Señor', 'national'],
    ['2026-04-03', 'Viernes Santo', 'national'], ['2026-05-01', 'Fiesta del Trabajo', 'national'],
    ['2026-08-15', 'Asunción de la Virgen', 'national'], ['2026-10-12', 'Fiesta Nacional de España', 'national'],
    ['2026-12-08', 'Inmaculada Concepción', 'national'], ['2026-12-25', 'Natividad del Señor', 'national'],
    ['2026-02-28', 'Día de Andalucía', 'regional'], ['2026-04-02', 'Jueves Santo', 'regional'],
    ['2026-11-02', 'Todos los Santos (trasladado)', 'regional'], ['2026-12-07', 'Día de la Constitución (trasladado)', 'regional'],
    ['2026-06-11', 'San Bernabé', 'local', 'Marbella'], ['2026-10-19', 'San Pedro de Alcántara', 'local', 'Marbella'],
    ['2026-05-15', 'San Isidro Labrador', 'area', 'Estepona', false], ['2026-07-16', 'Virgen del Carmen', 'area', 'Estepona', false],
    ['2026-08-17', 'Fiesta local', 'area', 'Benahavís', false], ['2026-08-19', 'Toma de Málaga', 'area', 'Málaga', false],
    ['2026-09-08', 'Virgen de la Victoria', 'area', 'Málaga', false], ['2026-10-07', 'Fiesta local', 'area', 'Benahavís', false],
  ].map(([starts_on, title, category, town, confirmed]) => ({
    id: uid(), starts_on: starts_on as string, ends_on: null, starts_at: null, title: title as string,
    category: category as CalendarEvent['category'], town: (town as string) ?? null, competition: null,
    source: 'import', confirmed: confirmed !== false, visibility: 'all' as const,
  }))
  events.push(
    { id: uid(), starts_on: '2026-10-16', ends_on: '2026-10-20', starts_at: null, title: 'Feria de San Pedro',
      category: 'event', town: 'San Pedro', competition: null, source: 'admin', confirmed: true, visibility: 'all' },
    { id: uid(), starts_on: addDays(today(), 2), ends_on: null, starts_at: zonedIso(addDays(today(), 2), '21:00'),
      title: 'Real Madrid vs FC Barcelona', category: 'sports', town: null, competition: 'La Liga', source: 'feed',
      confirmed: true, visibility: 'all' },
    { id: uid(), starts_on: addDays(today(), 3), ends_on: null, starts_at: zonedIso(addDays(today(), 3), '16:00'),
      title: 'Arsenal vs Liverpool', category: 'sports', town: null, competition: 'Premier League', source: 'feed',
      confirmed: true, visibility: 'all' },
    { id: uid(), starts_on: addDays(today(), 4), ends_on: null, starts_at: zonedIso(addDays(today(), 4), '14:30'),
      title: 'Ajax vs PSV', category: 'sports', town: null, competition: 'Eredivisie', source: 'feed',
      confirmed: true, visibility: 'all' },
    { id: uid(), starts_on: addDays(today(), 5), ends_on: null, starts_at: null, title: 'Staff training: new espresso recipe',
      category: 'business', town: null, competition: null, source: 'admin', confirmed: true, visibility: 'all' },
  )

  // The subscription: the sample café is on Business (given free); ?plan=free|starter|pro|business
  // shows another plan, remembered for the tab like the signed-in person.
  const demoPlan = (() => {
    try {
      const q = new URLSearchParams(location.search).get('plan')
      if (q) sessionStorage.setItem('demo-plan', q)
      return (q ?? sessionStorage.getItem('demo-plan')) || 'business'
    } catch { return 'business' }
  })()
  const demoBilling: BillingInfo = {
    plan: PLANS.some(p => p.id === demoPlan) ? demoPlan as PlanId : 'business', status: demoPlan === 'business' ? 'comped' : demoPlan === 'free' ? 'none' : 'active',
    interval: demoPlan === 'business' || demoPlan === 'free' ? null : 'month', trial_ends_at: null, current_period_end: null,
    cancel_at_period_end: false, trial_used: false, has_customer: demoPlan !== 'business' && demoPlan !== 'free', ready: true,
    complimentary: demoPlan === 'business' ? 'founder' : null, complimentary_note: demoPlan === 'business' ? 'Easy Beans Coffee' : null,
    referral_months_applied: 0, referred_by: null,
  }

  // Who is signed in survives a page reload within the tab (the demo data itself does not).
  const remember = (id: string | null) => {
    try { sessionStorage.setItem('demo-user', id ?? '') } catch { /* storage unavailable */ }
  }
  // Guest mode (the guest build, or ?guest in the address): opens already signed in as a Guest
  // admin, so someone can look around everything without signing in.
  const guestMode = import.meta.env.VITE_DEMO_GUEST === '1' || (() => { try { return new URLSearchParams(location.search).has('guest') } catch { return false } })()
  if (guestMode && !profiles.some(p => p.id === 'p-guest')) {
    profiles.push({ id: 'p-guest', full_name: 'Guest', email: 'guest@example.com', role: 'admin', can_see_pay: true, colour: '#5B4A86',
      active: true, phone: null, birth_date: null } as never)
  }
  let currentUser: string | null = (() => {
    try {
      return sessionStorage.getItem('demo-user') || (guestMode ? 'p-guest' : null)
    } catch {
      return guestMode ? 'p-guest' : null
    }
  })()
  const listeners = new Set<(userId: string | null) => void>()
  const notify = () => { remember(currentUser); listeners.forEach(l => l(currentUser)) }

  const me = () => profiles.find(p => p.id === currentUser)
  const favourites: (SportsFavourite & { profile_id: string })[] = [{ profile_id: P.aron, kind: 'team', ref: 'Real Betis' }]
  const isAdmin = () => me()?.role === 'admin'
  const isPartner = () => me()?.role === 'partner'
  const isStaff = () => me()?.role === 'admin' || me()?.role === 'employee'
  const readStock = () => isStaff() || partnerCan('finances')
  /** Mirrors partner_can() in SQL: an active partner who was given that area. */
  const partnerCan = (area: PartnerArea) => !!(isPartner() && me()?.active && me()?.partner_access?.includes(area))
  const staffOnly = (p: Profile) => p.role === 'admin' || p.role === 'employee'
  const requireAdmin = () => { if (!isAdmin()) throw new Error('Only an admin can do that') }

  // Grants: some answers given, and Talento Joven being prepared (its deadline is on the calendar).
  let grantAnswers: Partial<GrantProfile> = { debts: 'no', startY: 2026, startM: 4, hiring: 'yes', candidate: 'unsure' }
  const grantApps: GrantApplication[] = [{
    id: 'ga-talento', grant_id: 'talento-joven', grant_name: 'Hiring grant: Talento Joven', stage: 'gathering', submitted_on: null, expediente: null,
    amount_requested: 5000, amount_awarded: null, amount_received: null, deadline: '2026-12-31', deadline_label: 'Apply on the Cámara e-office',
    notes: 'Ask the Cámara for candidates from the programme.', docs_done: ['cert_aeat', 'cert_ss'], obligations_done: [],
    created_at: '2026-09-21T10:00:00Z', updated_at: '2026-09-21T10:00:00Z',
  }]
  const paysAdmin = () => !!(me()?.role === 'admin' && me()?.can_see_pay)
  const requirePay = () => { if (!paysAdmin()) throw new Error('Only admins with pay access can change grants') }
  /** Mirrors grant_deadline_event() in SQL: the deadline as an admins-only calendar event while the application is open. */
  function grantEvent(a: GrantApplication | undefined, id: string) {
    const i = events.findIndex(e => e.id === `grant:${id}`)
    if (i >= 0) events.splice(i, 1)
    if (!a?.deadline || isDone(a.stage)) return
    events.push({ id: `grant:${id}`, starts_on: a.deadline, ends_on: null, starts_at: null, category: 'business', town: null, competition: null,
      title: `Grant deadline: ${a.grant_name}${a.deadline_label ? ` (${a.deadline_label})` : ''}`, source: 'app', confirmed: true, visibility: 'admins' })
  }
  grantApps.forEach(a => grantEvent(a, a.id))

  /** The customers table's rules (supabase/migrations/…_customers.sql): tidy what's typed, and someone to reach. */
  function tidyCustomer(c: Customer): Customer {
    const text = (v: string | null | undefined) => v?.trim() || null
    const out: Customer = { ...c, first_name: text(c.first_name), last_name: text(c.last_name), email: text(c.email)?.toLowerCase() ?? null,
      phone: text(c.phone)?.replace(/\s+/g, ' ') ?? null, company: text(c.company), instagram: text(c.instagram)?.replace(/^@/, '') || null,
      notes: text(c.notes), tags: [...new Set((c.tags ?? []).map(x => x.trim()).filter(Boolean))].sort() }
    if (!out.first_name && !out.last_name && !out.email && !out.phone) throw new Error('Add a name, an email or a phone number')
    if (out.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw new Error('That email doesn’t look right')
    if (out.phone && !/^\+\d[\d ]{4,24}$/.test(out.phone)) throw new Error('That phone number doesn’t look right')
    if (out.instagram && !/^[A-Za-z0-9._]{1,30}$/.test(out.instagram)) throw new Error('That Instagram name doesn’t look right')
    return out
  }

  function computeFlags(e: RawEntry): string[] {
    const keep = e.flags.filter(f => f !== 'missed_break' && f !== 'over_daily_limit')
    if (!e.clock_out) return keep
    const total = minutesBetween(e.clock_in, e.clock_out)
    const brk = breaks.filter(b => b.time_entry_id === e.id)
      .reduce((s, b) => s + minutesBetween(b.started_at, b.ended_at ?? e.clock_out!), 0)
    if (total > settings.break_after_hours * 60 && brk < settings.min_break_minutes) keep.push('missed_break')
    if (total - brk > settings.max_daily_hours * 60) keep.push('over_daily_limit')
    return keep
  }

  function totals(e: RawEntry): TimeEntry {
    const end = e.clock_out ?? nowIso()
    const bs = breaks.filter(b => b.time_entry_id === e.id)
    const breakMin = bs.reduce((s, b) => s + minutesBetween(b.started_at, b.ended_at ?? end), 0)
    const unpaid = bs.filter(b => !breakTypes.find(t => t.id === b.break_type_id)?.paid)
      .reduce((s, b) => s + minutesBetween(b.started_at, b.ended_at ?? end), 0)
    const total = minutesBetween(e.clock_in, end)
    const date = localDate(e.clock_in)
    return {
      ...e, work_date: date, total_minutes: total, break_minutes: breakMin, unpaid_break_minutes: unpaid,
      paid_minutes: total - unpaid,
      on_holiday: events.some(ev => ['national', 'regional', 'local'].includes(ev.category) && ev.confirmed &&
        date >= ev.starts_on && date <= (ev.ends_on ?? ev.starts_on)),
    }
  }

  const openEntry = (pid: string) => entries.find(e => e.profile_id === pid && !e.clock_out)

  function doClockIn(pid: string, source: string, positionId?: number | null) {
    const who = profiles.find(p => p.id === pid)
    if (!who || !staffOnly(who)) throw new Error('Only team members can clock in')
    if (openEntry(pid)) throw new Error('Already clocked in')
    const now = Date.now()
    const shift = shifts
      .filter(s => s.profile_id === pid && new Date(s.ends_at).getTime() > now &&
        new Date(s.starts_at).getTime() < now + 12 * 3600000)
      .sort((a, b) => Math.abs(new Date(a.starts_at).getTime() - now) - Math.abs(new Date(b.starts_at).getTime() - now))[0]
    const flags: string[] = []
    if (shift) {
      const earliest = new Date(shift.starts_at).getTime() - settings.early_clock_in_minutes * 60000
      if (now < earliest) {
        const fmt = (ms: number) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
        throw new Error(`Too early: your shift starts at ${fmt(new Date(shift.starts_at).getTime())}. You can clock in from ${fmt(earliest)}.`)
      }
    } else {
      if (settings.unscheduled_clock_in === 'block') throw new Error('You have no shift scheduled now.')
      flags.push('unscheduled')
    }
    entries.push({ id: uid(), profile_id: pid, position_id: positionId ?? shift?.position_id ?? null,
      shift_id: shift?.id ?? null, clock_in: nowIso(), clock_out: null, source, clock_out_source: null,
      flags, note: null, approved_at: null })
  }
  function doClockOut(pid: string, source: string) {
    const e = openEntry(pid)
    if (!e) throw new Error('Not clocked in')
    for (const b of breaks) if (b.time_entry_id === e.id && !b.ended_at) b.ended_at = nowIso()
    e.clock_out = nowIso()
    e.clock_out_source = source
    e.flags = computeFlags(e)
    return totals(e)
  }
  function doStartBreak(pid: string, breakTypeId?: number | null) {
    const e = openEntry(pid)
    if (!e) throw new Error('Not clocked in')
    if (breaks.some(b => b.time_entry_id === e.id && !b.ended_at)) throw new Error('Already on a break')
    breaks.push({ id: uid(), time_entry_id: e.id, break_type_id: breakTypeId ?? null, started_at: nowIso(), ended_at: null })
  }
  function doEndBreak(pid: string) {
    const e = openEntry(pid)
    const b = e && breaks.find(x => x.time_entry_id === e.id && !x.ended_at)
    if (!b) throw new Error('Not on a break')
    b.ended_at = nowIso()
  }
  function applyEdit(id: string, clockIn: string | null, clockOut: string | null, reason: string) {
    if (!reason.trim()) throw new Error('A reason is required')
    const e = entries.find(x => x.id === id)
    if (!e) throw new Error('Timecard not found')
    const old = { clock_in: e.clock_in, clock_out: e.clock_out ?? undefined }
    if (clockIn) e.clock_in = clockIn
    if (clockOut) e.clock_out = clockOut
    if (!e.flags.includes('edited')) e.flags.push('edited')
    e.flags = computeFlags(e)
    changes.push({ id: changes.length + 1, time_entry_id: id, changed_by: currentUser, changed_at: nowIso(),
      via: 'app', reason, old_values: old, new_values: { clock_in: e.clock_in, clock_out: e.clock_out ?? undefined } })
  }

  const clone = <T,>(x: T): T => structuredClone(x)
  const sports = demoSports(today())
  const visibleProfile = ({ pin: _pin, ...p }: Profile & { pin?: string }) => p

  const api: Api = {
    mode: 'demo',
    async currentUserId() { return currentUser },
    onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },
    async signIn(email) {
      const p = profiles.find(x => x.email === email.trim().toLowerCase())
      if (!p) throw new Error('Demo: sign in as aron@example.com (admin), maria@example.com (employee) or laura@gestoria.example (partner)')
      currentUser = p.id
      notify()
    },
    async signOut() { currentUser = null; notify() },
    async signInMethods() { return { google: true, apple: true, facebook: true, microsoft: true, signup: true } },
    async signUp(fullName, email, password) {
      const e = email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw new Error('Enter a full email address')
      if (password.length < 8) throw new Error('Use at least 8 characters for your password')
      if (profiles.some(p => p.email === e)) throw new Error('That email already has an account. Sign in instead.')
      // Like the real app: a self-registered account waits until an admin adds it to the business.
      const id = `p-${Math.random().toString(36).slice(2, 10)}`
      profiles.push({ id, full_name: fullName.trim() || e.split('@')[0], email: e, role: 'employee', can_see_pay: false, colour: '#8E877F',
        active: false, phone: null, birth_date: null } as never)
      currentUser = id
      notify()
      return { confirmEmail: false }
    },
    async sendSignInCode(email) {
      if (!profiles.some(p => p.email === email.trim().toLowerCase())) throw new Error('No invited account uses this email. Ask an admin to invite you.')
    },
    async verifySignInCode(email, code) {
      if (code.replace(/\D/g, '') !== '123456') throw new Error('That code is wrong or has expired. Send a new one.')
      await api.signIn(email, '')
    },
    async sendPasswordReset() { throw new Error('Password reset emails are sent on the live app. In the demo, any password works.') },
    async updatePassword() {},

    async me() { const p = me(); return p ? visibleProfile(p) : null },
    async business() { return clone(business) },
    async adminNotes() { requireAdmin(); return adminNotes },
    async settings() { return clone(settings) },
    async profiles() {
      if (!isPartner()) return profiles.filter(p => p.role !== 'partner').map(visibleProfile)
      if (!partnerCan('rota') && !partnerCan('payroll')) return []
      return profiles.filter(staffOnly).map(p => ({ id: p.id, full_name: p.full_name, colour: p.colour, role: p.role,
        active: p.active, email: null, can_see_pay: false, phone: null, birth_date: null }))
    },
    async positions() { return clone(positions) },
    async breakTypes() { return clone(breakTypes) },
    async payRates() {
      const m = me()
      return payRates.filter(r => (m?.role === 'admin' && m.can_see_pay) || partnerCan('payroll') || r.profile_id === currentUser)
    },
    async shifts(fromIso, toIso) {
      if (isPartner() && !partnerCan('rota') && !partnerCan('payroll')) return []
      return clone(shifts.filter(s => s.starts_at >= fromIso && s.starts_at < toIso && (!isPartner() || s.status === 'published')))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    },
    async timeEntries(fromIso, toIso) {
      return entries.filter(e => e.clock_in >= fromIso && e.clock_in < toIso &&
        (isAdmin() || partnerCan('payroll') || e.profile_id === currentUser)).map(totals)
        .sort((a, b) => a.clock_in.localeCompare(b.clock_in))
    },
    async clockState() {
      const e = currentUser ? openEntry(currentUser) : undefined
      if (!e) return { entry: null, openBreak: null }
      const b = breaks.find(x => x.time_entry_id === e.id && !x.ended_at)
      return { entry: totals(e), openBreak: b ? clone(b) : null }
    },
    async events(fromDate, toDate) {
      return clone(events.filter(e => e.starts_on <= toDate && (e.ends_on ?? e.starts_on) >= fromDate &&
        (e.visibility === 'all' || isAdmin()) && (!isPartner() || partnerCan('calendar')))).sort((a, b) => a.starts_on.localeCompare(b.starts_on))
    },
    async corrections() {
      return clone(corrections.filter(c => isAdmin() || c.profile_id === currentUser))
    },
    async entryChanges(entryId) { return clone(changes.filter(c => c.time_entry_id === entryId)) },

    async clockIn(positionId) { doClockIn(currentUser!, 'phone', positionId) },
    async clockOut() { return doClockOut(currentUser!, 'phone') },
    async startBreak(t) { doStartBreak(currentUser!, t) },
    async endBreak() { doEndBreak(currentUser!) },
    async editEntry(id, ci, co, reason) {
      requireAdmin()
      applyEdit(id, ci, co, reason)
    },
    async addEntry(profileId, clockIn, clockOut, reason, positionId) {
      requireAdmin()
      if (!reason.trim()) throw new Error('A reason is required')
      const e: RawEntry = { id: uid(), profile_id: profileId, position_id: positionId ?? null, shift_id: null,
        clock_in: clockIn, clock_out: clockOut, source: 'manual', clock_out_source: 'manual', flags: ['edited'],
        note: null, approved_at: null }
      entries.push(e)
      e.flags = computeFlags(e)
      changes.push({ id: changes.length + 1, time_entry_id: e.id, changed_by: currentUser, changed_at: nowIso(),
        via: 'app', reason, old_values: null, new_values: { clock_in: clockIn, clock_out: clockOut } })
    },
    async requestCorrection(entryId, ci, co, note) {
      const e = entries.find(x => x.id === entryId)
      if (!e || e.profile_id !== currentUser) throw new Error('You can only request corrections to your own timecards')
      if (!note.trim()) throw new Error('Please add a note explaining the correction')
      corrections.unshift({ id: uid(), time_entry_id: entryId, profile_id: currentUser!, requested_clock_in: ci,
        requested_clock_out: co, note, status: 'pending', created_at: nowIso(),
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), decision_note: null })
    },
    async decideCorrection(id, approve, note) {
      requireAdmin()
      const c = corrections.find(x => x.id === id)
      if (!c || c.status !== 'pending') throw new Error('This request is no longer pending')
      if (approve && c.time_entry_id) {
        applyEdit(c.time_entry_id, c.requested_clock_in, c.requested_clock_out,
          `Correction request approved: ${c.note}${note ? ` (${note})` : ''}`)
      }
      c.status = approve ? 'approved' : 'declined'
      c.decision_note = note ?? null
    },
    async approveWeek(monday) {
      requireAdmin()
      const from = zonedIso(monday, '00:00')
      const to = zonedIso(addDays(monday, 7), '00:00')
      const week = entries.filter(e => e.clock_in >= from && e.clock_in < to)
      if (week.some(e => !e.clock_out)) throw new Error('Someone is still clocked in for that week')
      let n = 0
      for (const e of week) if (!e.approved_at) { e.approved_at = nowIso(); n++ }
      return n
    },

    async fillFromRota(monday) {
      requireAdmin()
      const todayStart = zonedIso(today(), '00:00')
      let n = 0
      for (const s of shifts) {
        if (!s.profile_id || localDate(s.starts_at) < monday || localDate(s.starts_at) > addDays(monday, 6)) continue
        if (s.starts_at >= todayStart) continue
        const has = entries.some(e => e.profile_id === s.profile_id && e.clock_in < s.ends_at && (e.clock_out ?? nowIso()) > s.starts_at)
        if (has) continue
        const e: RawEntry = { id: uid(), profile_id: s.profile_id, position_id: s.position_id, shift_id: s.id,
          clock_in: s.starts_at, clock_out: s.ends_at, source: 'rota', clock_out_source: 'rota', flags: ['from_rota'],
          note: null, approved_at: null }
        entries.push(e)
        e.flags = computeFlags(e)
        changes.push({ id: changes.length + 1, time_entry_id: e.id, changed_by: currentUser, changed_at: nowIso(), via: 'app',
          reason: 'Filled from the rota: no clock-in was recorded for this shift', old_values: null,
          new_values: { clock_in: s.starts_at, clock_out: s.ends_at } })
        n++
      }
      return n
    },

    async saveShift(input: ShiftInput) {
      requireAdmin()
      if (input.ends_at <= input.starts_at) throw new Error('Shift must end after it starts')
      const off = input.profile_id && timeOff.find(t => t.profile_id === input.profile_id && t.status === 'approved' &&
        localDate(input.starts_at) >= t.starts_on && localDate(input.starts_at) <= t.ends_on)
      if (off) throw new Error(`${profiles.find(p => p.id === input.profile_id)?.full_name} has approved time off that day`)
      if (input.id) {
        const s = shifts.find(x => x.id === input.id)
        if (s) Object.assign(s, input)
      } else {
        shifts.push({ ...input, id: uid(), status: input.status ?? 'published' })
      }
    },
    async deleteShift(id) {
      requireAdmin()
      const i = shifts.findIndex(s => s.id === id)
      if (i >= 0) shifts.splice(i, 1)
    },
    async takeOpenShift(id) {
      if (isPartner()) throw new Error('Not allowed')
      const s = shifts.find(x => x.id === id && !x.profile_id)
      if (!s) throw new Error('That shift is no longer open')
      if (shifts.some(x => x.profile_id === currentUser && x.starts_at < s.ends_at && x.ends_at > s.starts_at)) {
        throw new Error('It clashes with one of your shifts')
      }
      s.profile_id = currentUser
    },

    async saveEvent(input) {
      requireAdmin()
      if (input.id) Object.assign(events.find(e => e.id === input.id) ?? {}, input)
      else events.push({ competition: null, ...input, id: uid(), source: 'admin' } as CalendarEvent)
    },
    async deleteEvent(id) {
      requireAdmin()
      const i = events.findIndex(e => e.id === id)
      if (i >= 0) events.splice(i, 1)
    },

    async updateBusiness(patch) {
      requireAdmin()
      if ('name' in patch && !patch.name?.trim()) throw new Error('The business needs a name')
      Object.assign(business, patch, 'website' in patch ? { website: cleanWebsite(patch.website) } : {}, { updated_at: nowIso() })
    },
    async updateAdminNotes(notes) { requireAdmin(); adminNotes = notes },
    async updateSettings(patch) { requireAdmin(); Object.assign(settings, patch) },
    async updateProfile(id, patch) {
      if (id !== currentUser) requireAdmin()
      if (id !== currentUser && 'preferences' in patch) throw new Error('Only the person themselves can change their appearance settings')
      if (id === currentUser && patch.active === false) throw new Error("You can't switch off your own account. Ask another admin.")
      if (!isAdmin() && ('role' in patch || 'can_see_pay' in patch || 'active' in patch)) {
        throw new Error('Only an admin can change role, pay access or status')
      }
      const p = profiles.find(x => x.id === id)
      if (patch.role && patch.role !== 'admin' && p?.role === 'admin' &&
        profiles.filter(x => x.role === 'admin' && x.active).length === 1) {
        throw new Error('At least one admin must remain')
      }
      if (p) Object.assign(p, patch)
    },
    async setPin(pin, profileId) {
      if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be 4 digits')
      if (profileId && profileId !== currentUser) requireAdmin()
      const p = profiles.find(x => x.id === (profileId ?? currentUser))
      if (p) p.pin = pin
    },
    async setPayRate(profileId, rate) {
      requireAdmin()
      payRates.push({ profile_id: profileId, effective_from: today(), hourly_rate: rate })
    },
    async setTemporaryPassword(userId, password) {
      requireAdmin()
      if (password.length < 8) throw new Error('The temporary password needs at least 8 characters')
      const p = profiles.find(x => x.id === userId)
      if (!p) throw new Error('No such person')
      if (p.role === 'admin') throw new Error('Admins change their own password on My account')
    },
    async invite(email, fullName, role, password, contact) {
      requireAdmin()
      if (password !== undefined && password.length < 8) throw new Error('The temporary password needs at least 8 characters')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Enter a full email address, like name@example.com')
      profiles.push({ id: uid(), full_name: fullName, email, role, can_see_pay: false, colour: '#8d6e63',
        active: true, phone: contact?.phone ?? null, birth_date: null, contact_method: contact?.contact_method ?? null })
    },
    async partners() {
      requireAdmin()
      return profiles.filter(p => p.role === 'partner').map(visibleProfile)
    },
    async invitePartner(email, fullName, company, access, password) {
      requireAdmin()
      if (password !== undefined && password.length < 8) throw new Error('The temporary password needs at least 8 characters')
      const addr = email.trim().toLowerCase()
      if (!fullName.trim() || !addr) throw new Error('Name and email are required')
      if (!company.trim()) throw new Error('Add the partner’s company name')
      if (profiles.some(p => p.email === addr)) throw new Error('Someone with that email already has an account')
      profiles.push({ id: uid(), full_name: fullName.trim(), email: addr, role: 'partner', can_see_pay: false, colour: '#6B645E',
        active: true, phone: null, birth_date: null, partner_company: company.trim(), partner_access: [...access] })
    },
    async setPartnerAccess(id, company, access) {
      requireAdmin()
      const p = profiles.find(x => x.id === id && x.role === 'partner')
      if (!p) throw new Error('That person is not a partner')
      Object.assign(p, { partner_company: company.trim() || null, partner_access: [...access] })
    },

    async timeOff(fromDate, toDate) {
      return clone(timeOff.filter(t => t.starts_on <= toDate && t.ends_on >= fromDate &&
        (isAdmin() || t.profile_id === currentUser || (t.status === 'approved' && (!isPartner() || partnerCan('rota') || partnerCan('payroll'))))))
        .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
    },
    async vacationDaysUsed(profileId, year) {
      const y0 = `${year}-01-01`, y1 = `${year}-12-31`
      return timeOff.filter(t => t.profile_id === profileId && t.kind === 'vacation' && ['approved', 'pending'].includes(t.status)
        && t.starts_on <= y1 && t.ends_on >= y0)
        .reduce((n, t) => n + (Date.parse(t.ends_on < y1 ? t.ends_on : y1) - Date.parse(t.starts_on > y0 ? t.starts_on : y0)) / 86400000 + 1, 0)
    },
    async requestTimeOff(startsOn, endsOn, kind, note) {
      if (isPartner()) throw new Error('Not allowed')
      if (endsOn < startsOn) throw new Error('The last day must be on or after the first day')
      if (kind !== 'sick' && startsOn < today()) throw new Error('Holiday requests must be for today or later')
      if (timeOff.some(t => t.profile_id === currentUser && ['pending', 'approved'].includes(t.status) && t.starts_on <= endsOn && t.ends_on >= startsOn)) {
        throw new Error('You already have time off requested for some of those days')
      }
      const days = (Date.parse(endsOn) - Date.parse(startsOn)) / 86400000 + 1
      if (kind === 'vacation' && (await api.vacationDaysUsed(currentUser!, Number(startsOn.slice(0, 4)))) + days > settings.vacation_days_per_year) {
        throw new Error(`That is more than your ${settings.vacation_days_per_year} holiday days for the year`)
      }
      timeOff.push({ id: uid(), profile_id: currentUser!, starts_on: startsOn, ends_on: endsOn, kind, note: note || null,
        status: 'pending', created_at: nowIso(), decision_note: null })
    },
    async cancelTimeOff(id) {
      const t = timeOff.find(x => x.id === id && (x.profile_id === currentUser || isAdmin()))
      if (!t) throw new Error('Request not found')
      if (!['pending', 'approved'].includes(t.status)) throw new Error(`This request is already ${t.status}`)
      t.status = 'cancelled'
    },
    async decideTimeOff(id, approve, note, releaseShifts = true) {
      requireAdmin()
      const t = timeOff.find(x => x.id === id)
      if (!t || t.status !== 'pending') throw new Error('This request is no longer pending')
      t.status = approve ? 'approved' : 'declined'
      t.decision_note = note ?? null
      let n = 0
      if (approve && releaseShifts) {
        const name = profiles.find(p => p.id === t.profile_id)?.full_name
        for (const s of shifts) {
          if (s.profile_id === t.profile_id && localDate(s.starts_at) >= t.starts_on && localDate(s.starts_at) <= t.ends_on) {
            s.profile_id = null
            s.note = `${s.note ? `${s.note} · ` : ''}Released: ${name} off`
            n++
          }
        }
      }
      return n
    },

    async planStatus() {
      const p = planById(effectivePlan(demoBilling))
      const month = new Date().toISOString().slice(0, 7)
      return {
        plan: p.id,
        limits: { people: p.limits.people, social_accounts: p.limits.socialAccounts, posts_per_month: p.limits.postsPerMonth, features: p.features },
        usage: {
          people: profiles.filter(x => x.active && (x.role === 'admin' || x.role === 'employee')).length,
          social_accounts: integ.integrations.filter(i => SOCIAL_CONNECTIONS.includes(i.provider) && i.status === 'connected').length,
          posts_this_month: posts.filter(x => x.status !== 'draft' && x.scheduled_at?.startsWith(month)).length,
        },
      }
    },
    async billing() { return { ...demoBilling } },
    async syncBilling() { return { ...demoBilling } },
    async choosePlan(plan, interval) {
      // The live app goes to Stripe Checkout here; the demo pretends the card went through.
      const trial = planById(plan).trial && !demoBilling.trial_used
      if (demoBilling.status === 'comped') throw new Error('This business already has the top plan, free. Nothing to pay.')
      Object.assign(demoBilling, { plan, interval, has_customer: true, status: trial ? 'trialing' : 'active', trial_used: demoBilling.trial_used || trial,
        trial_ends_at: trial ? new Date(Date.now() + TRIAL_DAYS * 86400_000).toISOString() : demoBilling.trial_ends_at })
      return { changed: true }
    },
    async billingPortal() { throw new Error("Stripe's billing page opens on the live app.") },

    async signInWith(provider) {
      const label = { google: 'Google', apple: 'Apple', facebook: 'Facebook', microsoft: 'Microsoft' }[provider]
      throw new Error(`${label} sign-in works on the live app. In the demo, use an example email.`)
    },

    async expenses() {
      if (!(me()?.role === 'admin' && me()?.can_see_pay) && !partnerCan('finances')) return []
      return clone(expenses).sort((a, b) => a.sort - b.sort)
    },
    async saveExpense(e) {
      if (!(me()?.role === 'admin' && me()?.can_see_pay)) throw new Error('Only admins with pay access can change finances')
      if (!e.name.trim()) throw new Error('Give the expense a name')
      if (!(e.amount >= 0)) throw new Error('Enter an amount of 0 or more')
      const existing = e.id && expenses.find(x => x.id === e.id)
      if (existing) Object.assign(existing, { ...e, updated_at: nowIso() })
      else expenses.push({ id: uid(), category: null, notes: null, active: true, sort: expenses.length + 1, source: 'app',
        updated_at: nowIso(), ...e, name: e.name.trim() })
    },
    async deleteExpense(id) {
      if (!(me()?.role === 'admin' && me()?.can_see_pay)) throw new Error('Only admins with pay access can change finances')
      const i = expenses.findIndex(x => x.id === id)
      if (i >= 0) expenses.splice(i, 1)
    },
    async taxSettings() { return readTax() ? clone(taxSettings) : DEFAULT_TAX_SETTINGS },
    async saveTaxSettings(patch) {
      needTax()
      const email = patch.gestor_email === undefined ? taxSettings.gestor_email : patch.gestor_email?.trim().toLowerCase() || null
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a full email address, like name@example.com')
      Object.assign(taxSettings, patch, { gestor_email: email })
    },
    async taxFilings(year) { return readTax() ? clone(taxFilings.filter(f => f.year === year)) : [] },
    async saveTaxFiling(r) {
      needTax()
      const row = { ...r, filed_on: r.status === 'filed' ? r.filed_on ?? today() : r.status === 'not_needed' ? r.filed_on : null,
        reference: r.reference?.trim() || null, notes: r.notes?.trim() || null }
      const existing = taxFilings.find(f => f.model === r.model && f.year === r.year && f.period === r.period)
      if (existing) Object.assign(existing, row, { id: existing.id })
      else taxFilings.push({ ...row, id: uid() })
    },
    async taxDocuments(year) {
      return readTax() ? clone(taxDocuments.filter(d => d.year === year)).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)) : []
    },
    async updateTaxDocument(id, patch) {
      needTax()
      const d = taxDocuments.find(x => x.id === id)
      if (d) Object.assign(d, patch, { notes: patch.notes === undefined ? d.notes : patch.notes?.trim() || null })
    },
    async removeTaxDocument(id) {
      needTax()
      const i = taxDocuments.findIndex(x => x.id === id)
      if (i >= 0) taxDocuments.splice(i, 1)
    },
    async taxFolders(path) {
      needTax()
      const storage = taxStorage()
      const at = path.join('/')
      const known = [...taxFolderPaths, ...taxDocuments.map(d => d.folder.join('/'))]
      const folders = [...new Set(known.flatMap(p => (p.startsWith(`${at}/`) ? [p.slice(at.length + 1).split('/')[0]] : [])))].sort((a, b) => a.localeCompare(b))
      return { storage, path, folders, link: `https://${storage === 'google_drive' ? 'drive.google.com' : 'onedrive.live.com'}/demo/Business Agent/${at}` }
    },
    async makeTaxFolder(path, name) {
      needTax()
      taxStorage()
      const clean = cleanFolderName(name)
      if (!clean) throw new Error('Give the folder a name (up to 100 characters)')
      const made = cleanFolderPath([...path, clean])
      if (!made) throw new Error('That folder isn’t in the Tax folder')
      taxFolderPaths.add(made.join('/'))
      return made
    },
    async uploadTaxDocument(file, m) {
      needTax()
      const storage = taxStorage()
      const problem = taxFileProblem(m.name, file.size)
      if (problem) throw new Error(problem)
      const kept = taxDocuments.find(d => d.sha256 === m.sha256)
      if (kept) throw new Error(`Already kept as “${kept.name}”`)
      const doc: TaxDocument = { id: uid(), name: m.name, kind: m.kind, year: m.year, quarter: m.quarter, size: file.size, sha256: m.sha256, storage,
        file_id: uid(), folder: m.folder, link: `https://${storage === 'google_drive' ? 'drive.google.com' : 'onedrive.live.com'}/demo/Business Agent/${m.folder.join('/')}/${m.name}`,
        notes: null, uploaded_by: me()?.id ?? null, uploaded_at: nowIso() }
      taxDocuments.push(doc)
      return clone(doc)
    },
    async pnlSettings() {
      if (!(me()?.role === 'admin' && me()?.can_see_pay) && !partnerCan('finances')) throw new Error('Profit & loss is only visible to admins with pay access')
      return { ...pnlSettings }
    },
    async savePnlSettings(patch) {
      if (!(me()?.role === 'admin' && me()?.can_see_pay)) throw new Error('Only admins with pay access can change finances')
      if (patch.vat_rate !== undefined && !(patch.vat_rate >= 0 && patch.vat_rate <= 30)) throw new Error('IVA is between 0% and 30%')
      Object.assign(pnlSettings, patch)
    },
    async pnlLines(from, to) {
      if (!(me()?.role === 'admin' && me()?.can_see_pay) && !partnerCan('finances')) return []
      return clone(pnlLines.filter(l => l.month.slice(0, 7) >= from && l.month.slice(0, 7) <= to)).sort((a, b) => a.month.localeCompare(b.month))
    },
    async savePnlLine({ id, ...l }) {
      if (!(me()?.role === 'admin' && me()?.can_see_pay)) throw new Error('Only admins with pay access can change finances')
      if (!l.label.trim()) throw new Error('Say what it is')
      if (!(l.amount >= 0)) throw new Error('Enter an amount of 0 or more')
      const row = { month: `${l.month.slice(0, 7)}-01`, kind: l.kind, category: l.category?.trim() || null, label: l.label.trim(), amount: l.amount, notes: l.notes?.trim() || null }
      const existing = id && pnlLines.find(x => x.id === id)
      if (existing) Object.assign(existing, row)
      else pnlLines.push({ id: uid(), ...row })
    },
    async deletePnlLine(id) {
      if (!(me()?.role === 'admin' && me()?.can_see_pay)) throw new Error('Only admins with pay access can change finances')
      const i = pnlLines.findIndex(x => x.id === id)
      if (i >= 0) pnlLines.splice(i, 1)
    },
    async loyalty(from, to) {
      needSquare()
      return { status: 'ok', program: clone(clubProgram), members: clone(clubMembers).sort((a, b) => b.balance - a.balance || b.lifetime - a.lifetime),
        events: clone(clubEvents.filter(e => inRange(e.at, from, to))) }
    },
    async adjustLoyalty(accountId, points, reason) {
      needSquare()
      const problem = adjustProblem(points)
      if (problem) throw new Error(problem)
      if (!reason.trim()) throw new Error('Say why, for the record (Square keeps it)')
      const m = clubMembers.find(x => x.id === accountId)
      if (!m) throw new Error('Choose a member')
      m.balance += points
      clubEvents.unshift({ id: uid(), kind: 'adjust', points, at: nowIso(), account_id: accountId, reason: reason.trim() })
    },
    async giftCards(from, to) {
      needSquare()
      return { status: 'ok', currency: 'EUR', cards: clone(giftCardList).sort((a, b) => b.created_at.localeCompare(a.created_at)),
        activities: clone(giftActivity.filter(a => inRange(a.at, from, to))) }
    },
    async sellGiftCard(amount, customerId) {
      needSquare()
      const problem = giftCardAmountProblem(amount)
      if (problem) throw new Error(problem)
      const member = clubMembers.find(m => m.customer_id === customerId)
      const card: GiftCard = { id: uid(), last4: gan4(), type: 'DIGITAL', state: 'ACTIVE', balance: amount, created_at: nowIso(),
        customer_id: customerId, customer: member?.name ?? null }
      giftCardList.push(card)
      giftActivity.unshift({ id: uid(), kind: 'activate', amount, at: card.created_at, last4: card.last4, balance: amount })
      return clone(card)
    },
    async suppliers() { return readStock() ? clone(suppliers).sort((a, b) => a.name.localeCompare(b.name)) : [] },
    async saveSupplier({ id, ...patch }) {
      requireAdmin()
      if (!patch.name?.trim()) throw new Error('Give the supplier a name')
      const row = { ...patch, name: patch.name.trim(), whatsapp: !!patch.phone && !!(patch.whatsapp ?? false) }
      const existing = id ? suppliers.find(x => x.id === id) : undefined
      if (existing) Object.assign(existing, row)
      else suppliers.push(supplier({ ...row, id: uid() }))
    },
    async deleteSupplier(id) {
      requireAdmin()
      const i = suppliers.findIndex(x => x.id === id)
      if (i >= 0) suppliers.splice(i, 1)
      for (const item of stock) if (item.supplier_id === id) item.supplier_id = null
    },
    async stockItems() { return readStock() ? clone(stock).sort((a, b) => a.name.localeCompare(b.name)) : [] },
    async saveStockItem({ id, ...patch }) {
      requireAdmin()
      if (!patch.name?.trim()) throw new Error('Give the item a name')
      if (patch.reorder_at != null && patch.par_level != null && patch.reorder_at > patch.par_level) throw new Error('Reorder at can’t be more than the par level')
      const existing = id ? stock.find(x => x.id === id) : undefined
      // How many are in changes only through a delivery, count…: editing an item keeps it.
      if (existing) Object.assign(existing, { ...patch, name: patch.name.trim(), on_hand: existing.on_hand, updated_at: nowIso() })
      else stock.push(stockItem({ ...patch, name: patch.name.trim() }))
    },
    async deleteStockItem(id) {
      requireAdmin()
      const i = stock.findIndex(x => x.id === id)
      if (i >= 0) stock.splice(i, 1)
    },
    async importStockItems(rows) {
      requireAdmin()
      for (const r of rows) stock.push(stockItem({ ...r, name: r.name.trim() }))
      return rows.length
    },
    async stockMovements(itemId) {
      if (!readStock()) return []
      return clone(movements.filter(m => !itemId || m.item_id === itemId)).sort((a, b) => b.at.localeCompare(a.at))
    },
    async recipes() { return isAdmin() || partnerCan('finances') ? clone(recipes).sort((a, b) => a.name.localeCompare(b.name)) : [] },
    async saveRecipe({ id, ...r }) {
      requireAdmin()
      if (!r.name.trim()) throw new Error('Give it a name')
      if (r.lines.some(l => !(l.quantity > 0))) throw new Error('Every ingredient needs a quantity')
      if (r.square_item && recipes.some(x => x.square_item === r.square_item && x.id !== id)) throw new Error('That Square item is already on the menu')
      const existing = id ? recipes.find(x => x.id === id) : undefined
      if (existing) { Object.assign(existing, { ...r, name: r.name.trim() }); return existing.id }
      const made = recipe({ ...r, name: r.name.trim() })
      recipes.push(made)
      return made.id
    },
    async deleteRecipe(id) {
      requireAdmin()
      const i = recipes.findIndex(x => x.id === id)
      if (i >= 0) recipes.splice(i, 1)
    },
    async recordStock(moves: MovementInput[]) {
      if (!isStaff()) throw new Error('Only the team records stock')
      // Check them all first: the database takes all or none.
      const checked = moves.map(m => {
        const item = stock.find(x => x.id === m.item_id)
        if (!item) throw new Error('No such stock item')
        if (m.reason === 'count') {
          if (m.counted === undefined || !(m.counted >= 0)) throw new Error('Enter how many you counted')
          return { m, item }
        }
        if (!m.change) throw new Error('Enter how many')
        if (m.reason === 'delivery' && m.change < 0) throw new Error('A delivery adds stock')
        if (['waste', 'sold', 'used'].includes(m.reason) && m.change > 0) throw new Error('Waste, used and sold take stock away')
        return { m, item }
      })
      for (const { m, item } of checked) {
        const change = m.reason === 'count' ? m.counted! - item.on_hand : m.change!
        item.on_hand = Math.round((item.on_hand + change) * 100) / 100
        movements.push({ id: uid(), item_id: item.id, at: nowIso(), reason: m.reason, change, counted: m.reason === 'count' ? m.counted! : null,
          on_hand_after: item.on_hand, note: m.note?.trim() || null, by: me()?.id ?? null, waste_reason: m.reason === 'waste' ? m.waste_reason ?? 'other' : null })
      }
    },
    async customers() {
      if (!isAdmin()) return []
      return clone(customers).sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    async saveCustomer(c) {
      requireAdmin()
      const existing = c.id ? customers.find(x => x.id === c.id) : undefined
      if (c.id && !existing) throw new Error('That person has gone')
      const next = tidyCustomer({ ...(existing ?? person({ days: 0, kind: 'lead' })), ...c })
      // Mirrors the database: when they said yes is recorded here, and cleared when they take it back.
      next.consent_at = !next.marketing_consent ? null : existing?.marketing_consent ? existing.consent_at : nowIso()
      if (existing) Object.assign(existing, next, { updated_at: nowIso() })
      else customers.push({ ...next, id: uid(), created_at: nowIso(), updated_at: nowIso() })
    },
    async deleteCustomer(id) {
      requireAdmin()
      const i = customers.findIndex(x => x.id === id)
      if (i >= 0) customers.splice(i, 1)
    },
    async importCustomers(rows) {
      requireAdmin()
      const added = rows.map(r => tidyCustomer({ ...person({ days: 0, kind: 'lead' }), ...r, id: uid() }))
      for (const c of added) customers.push({ ...c, consent_at: c.marketing_consent ? nowIso() : null })
      return added.length
    },
    async grantProfile() {
      if (!paysAdmin() && !partnerCan('finances')) return {}
      return clone(grantAnswers)
    },
    async saveGrantProfile(answers) {
      requirePay()
      grantAnswers = cleanAnswers(answers)
    },
    async grantApplications() {
      if (!paysAdmin() && !partnerCan('finances')) return []
      return clone(grantApps)
    },
    async saveGrantApplication({ id, ...patch }) {
      requirePay()
      const text = (v: string | null | undefined) => v?.trim() || null
      const existing = id ? grantApps.find(a => a.id === id) : undefined
      if (id && !existing) throw new Error('That application has gone')
      const next: GrantApplication = { ...(existing ?? { id: uid(), grant_id: '', grant_name: '', stage: 'interested', submitted_on: null, expediente: null,
        amount_requested: null, amount_awarded: null, amount_received: null, deadline: null, deadline_label: null, notes: null, docs_done: [],
        obligations_done: [], created_at: nowIso() }), ...patch, updated_at: nowIso() }
      // The database's rules: tidy text, one open application per grant, dated when submitted, the grant stays.
      Object.assign(next, { expediente: text(next.expediente), deadline_label: text(next.deadline_label), notes: text(next.notes),
        docs_done: [...new Set(next.docs_done)].sort(), obligations_done: [...new Set(next.obligations_done)].sort() })
      if (existing) next.grant_id = existing.grant_id
      if (!existing && grantApps.some(a => a.grant_id === next.grant_id && !isDone(a.stage))) throw new Error('That grant is already in your applications')
      if (next.stage === 'submitted' && !next.submitted_on) next.submitted_on = today()
      if (existing) Object.assign(existing, next)
      else grantApps.push(next)
      grantEvent(next, next.id)
      return next.id
    },
    async deleteGrantApplication(id) {
      requirePay()
      const i = grantApps.findIndex(a => a.id === id)
      if (i >= 0) grantApps.splice(i, 1)
      grantEvent(undefined, id)
    },
    async todos() {
      if (!staffOnly(me()!)) return { categories: [], todos: [] }
      return { categories: clone(todoCategories).sort((a, b) => a.sort - b.sort), todos: clone(todos) }
    },
    async addTodo(t) {
      if (!staffOnly(me()!)) throw new Error('Only the team can add jobs')
      if (!t.title.trim()) throw new Error('Write the job first')
      const todo: Todo = { id: uid(), title: t.title.trim(), category_id: t.category_id, section: null, assignee_id: null, done: false,
        done_at: null, starred: false, pinned: false, position: t.position, created_at: nowIso() }
      todos.push(todo)
      return clone(todo)
    },
    async updateTodo(id, patch) {
      if (!staffOnly(me()!)) throw new Error('Only the team can change jobs')
      const t = todos.find(x => x.id === id)
      if (!t) throw new Error('That job has gone')
      if (patch.title !== undefined && !patch.title.trim()) throw new Error('A job needs a name')
      Object.assign(t, patch, patch.title !== undefined ? { title: patch.title.trim() } : {},
        patch.section !== undefined ? { section: patch.section?.trim() || null } : {},
        patch.done !== undefined ? { done_at: patch.done ? (t.done_at ?? nowIso()) : null } : {})
    },
    async deleteTodo(id) {
      if (!staffOnly(me()!)) throw new Error('Only the team can delete jobs')
      const i = todos.findIndex(x => x.id === id)
      if (i >= 0) todos.splice(i, 1)
    },
    async saveTodoCategory(c) {
      requireAdmin()
      const name = c.name.trim()
      if (!name) throw new Error('Give the category a name')
      if (name.length > 40) throw new Error('Keep the name to 40 characters')
      if (todoCategories.some(x => x.id !== c.id && x.name.toLowerCase() === name.toLowerCase())) throw new Error(`There is already a category called “${name}”`)
      const existing = c.id && todoCategories.find(x => x.id === c.id)
      if (existing) Object.assign(existing, { ...c, name, hint: c.hint?.trim() || null })
      else todoCategories.push({ id: uid(), colour: '#8A7E76', sort: Math.max(0, ...todoCategories.map(x => x.sort)) + 1, ...c, name, hint: c.hint?.trim() || null })
    },
    async deleteTodoCategory(id) {
      requireAdmin()
      const i = todoCategories.findIndex(x => x.id === id)
      if (i >= 0) todoCategories.splice(i, 1)
      todos.forEach(t => { if (t.category_id === id) t.category_id = null })
    },
    async sentAlerts() {
      requireAdmin()
      return clone(sent)
    },

    async sportsCompetitions() { return clone(sports.competitions) },
    async sportsEvents(fromIso, toIso) {
      return clone(sports.events.filter(e => e.starts_at >= fromIso && e.starts_at < toIso)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)))
    },
    async setSportsFollowed(code, followed) {
      requireAdmin()
      const c = sports.competitions.find(x => x.code === code)
      if (c) c.followed = followed
    },
    async sportsFavourites() {
      return clone(favourites.filter(f => f.profile_id === currentUser).map(({ kind, ref }) => ({ kind, ref })))
    },
    async setSportsFavourite(fav, on) {
      if (!me() || me()!.role === 'partner') throw new Error('Only the team has sports favourites')
      const i = favourites.findIndex(f => f.profile_id === currentUser && f.kind === fav.kind && f.ref === fav.ref)
      if (on && i < 0) favourites.push({ ...fav, profile_id: currentUser! })
      if (!on && i >= 0) favourites.splice(i, 1)
    },
    async refreshSports() {
      requireAdmin()
      if (!business.sports_enabled) throw new Error('Sports is off. Turn it on on the Sports page first.')
      for (const c of sports.competitions) c.refreshed_at = nowIso()
      return sports.events.length
    },

    async integrations() {
      requireAdmin()
      return { ...structuredClone(integ), media_storage: mediaStorage() }
    },
    async connectGoogle() {
      requireAdmin()
      const g = integ.integrations.find(i => i.provider === 'google_business')!
      Object.assign(g, { status: 'connected', account_label: 'Easy Beans Coffee', connected_at: nowIso(), last_sync_at: nowIso(), last_checked_at: nowIso(), last_error: null,
        external: { locations: [{ name: 'locations/1', title: 'Easy Beans Coffee', address: business.address ?? '' }], location: 'locations/1' } })
    },
    async connectInstagram() {
      requireAdmin()
      setConnection('instagram', { status: 'connected', account_label: '@easy.beans.coffee', connected_at: nowIso(), last_checked_at: nowIso(), last_sync_at: nowIso(), last_error: null, external: {} })
    },
    async chooseGoogleListing(_loc, closedOnHolidays) {
      requireAdmin()
      const g = integ.integrations.find(i => i.provider === 'google_business')!
      if (closedOnHolidays !== undefined) g.external.closed_on_holidays = closedOnHolidays
    },
    async syncGoogleNow() {
      requireAdmin()
      integ.integrations.find(i => i.provider === 'google_business')!.last_sync_at = nowIso()
    },
    async googleHours() {
      return { ...business.opening_hours, sun: { open: '10:00', close: '15:00' } }
    },
    async disconnect(provider) {
      requireAdmin()
      Object.assign(integ.integrations.find(i => i.provider === provider)!, { status: 'disconnected', account_label: null, external: {}, last_error: null, last_checked_at: null })
    },
    async connectService(provider) {
      requireAdmin()
      // Demo: pretend the café signed in with its Google / Microsoft account and the proof passed.
      if (provider === 'search_console') {
        // The café's website is in the account, so it's picked straight away.
        const site = 'https://www.easybeanscoffee.com/'
        setConnection(provider, { status: 'connected', account_label: 'www.easybeanscoffee.com', connected_at: nowIso(), last_checked_at: nowIso(), last_error: null,
          external: { sites: [site, 'sc-domain:easybeans.events'], site } })
        return
      }
      const account = provider === 'youtube_music' ? 'Easy Beans' : provider === 'gmail' || provider === 'google_drive' ? 'easybeanscafe@gmail.com' : 'easybeans@outlook.com'
      setConnection(provider, { status: 'connected', account_label: account, connected_at: nowIso(), last_checked_at: nowIso(), last_error: null, external: {} })
      // Like the Worker: the mailbox becomes the business's email when none was typed.
      if ((provider === 'gmail' || provider === 'outlook') && !business.email?.trim()) business.email = account
    },
    async checkConnection(provider) {
      requireAdmin()
      const row = integ.integrations.find(i => i.provider === provider)
      if (!row) return null
      // Demo: a chosen calendar counts as fetched by the calendar app as soon as you check.
      if (row.status === 'pending') setConnection(provider, { status: 'connected', connected_at: nowIso(), last_sync_at: nowIso() })
      if (row.status === 'connected' || row.status === 'error') Object.assign(row, { status: 'connected', last_error: null })
      if (row.status !== 'disconnected') row.last_checked_at = nowIso()
      return structuredClone(row)
    },
    async checkConnections() {
      requireAdmin()
      const out: Integration[] = []
      for (const i of integ.integrations) if (['connected', 'error', 'pending'].includes(i.status)) out.push((await this.checkConnection(i.provider))!)
      return out
    },
    async chooseCalendar(app) {
      requireAdmin()
      const feed = feeds.get(currentUser!)?.business ?? await this.makeCalendarFeed('business')
      if (integ.integrations.find(i => i.provider === app)!.status !== 'connected') setConnection(app, { status: 'pending', connected_at: null, last_error: null, account_label: null })
      return { url: addToCalendarUrl(app, feed), feed }
    },
    async sendTestEmail(to) {
      requireAdmin()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) throw new Error('Enter a full email address')
      if (!integ.integrations.some(i => (i.provider === 'gmail' || i.provider === 'outlook') && i.status === 'connected')) {
        throw new Error('No mailbox connected. Connect Gmail or Outlook on the Connections page.')
      }
    },
    async saveFile(f) {
      const store = (['google_drive', 'onedrive'] as const).find(p => integ.integrations.some(i => i.provider === p && i.status === 'connected'))
      if (!store) throw new Error('No file storage connected. Connect Google Drive or OneDrive on the Connections page.')
      return { provider: store, link: `https://${store === 'google_drive' ? 'drive.google.com' : 'onedrive.live.com'}/demo/Business Agent/${f.folder}/${f.name}` }
    },
    async whatsappTest(to) {
      requireAdmin()
      if (!/\d{9,}/.test(to.replace(/\D/g, ''))) throw new Error('Enter a full number with country code, e.g. +34 600 000 000')
      setConnection('whatsapp', { status: 'connected', account_label: '+34 695 415 335', last_checked_at: nowIso(), last_error: null })
    },
    async connectApp(provider) {
      requireAdmin()
      if (provider === 'linkedin') {
        // Signed in as the owner, who runs the café's Page: they choose where posts go (chooseLinkedInPage).
        setConnection(provider, { status: 'pending', account_label: null, connected_at: nowIso(), last_checked_at: null, last_error: null,
          external: { member: { id: 'demo-member', name: "Aron O'Neill" }, pages: [{ id: '101', name: 'Easy Beans Coffee' }], expires_at: new Date(Date.now() + 60 * 86_400_000).toISOString() } })
        return
      }
      const label = { facebook: 'Easy Beans Coffee', tiktok: '@easybeanscoffee', square: 'Easy Beans Coffee', stripe: 'Easy Beans Coffee SL', sumup: 'Easy Beans Coffee' }[provider]
      const external = provider === 'facebook' ? { pages: [{ id: 'page-1', name: 'Easy Beans Coffee' }], page_id: 'page-1' } : provider === 'tiktok' ? { private_only: true }
        : provider === 'sumup' ? { merchant_code: 'MDEMO123', currency: 'EUR' } : {}
      setConnection(provider, { status: 'connected', account_label: label, connected_at: nowIso(), last_checked_at: nowIso(), last_error: null, external })
    },
    async chooseLinkedInPage(pageId) {
      requireAdmin()
      const li = integ.integrations.find(i => i.provider === 'linkedin')!
      const name = pageId === 'me' ? li.external.member?.name : li.external.pages?.find(p => p.id === pageId)?.name
      if (!li.external.member || !name) throw new Error('That Page isn’t one this account manages')
      Object.assign(li, { status: 'connected', account_label: name, last_checked_at: nowIso(), last_error: null, external: { ...li.external, page_id: pageId, page_name: name } })
    },
    async chooseSearchConsoleSite(site) {
      requireAdmin()
      const sc = integ.integrations.find(i => i.provider === 'search_console')!
      if (!sc.external.sites?.includes(site)) throw new Error('That website isn’t in this Google account’s Search Console')
      Object.assign(sc, { status: 'connected', account_label: site.replace(/^sc-domain:|^https?:\/\/|\/$/g, ''), last_checked_at: nowIso(), last_error: null, external: { ...sc.external, site } })
    },
    async searchConsole(from, to) {
      requireAdmin()
      const sc = integ.integrations.find(i => i.provider === 'search_console')!
      if (sc.status !== 'connected') throw new Error('Connect Search Console on the Connections page to see how the website does on Google')
      return demoSearch(from, to)
    },
    async chooseFacebookPage(pageId) {
      requireAdmin()
      const fb = integ.integrations.find(i => i.provider === 'facebook')!
      const page = fb.external.pages?.find(p => p.id === pageId)
      if (!page) throw new Error('That Page isn’t one this account manages')
      Object.assign(fb, { status: 'connected', account_label: page.name, external: { ...fb.external, page_id: pageId } })
    },
    async sales(from, to) {
      requireAdmin()
      const ps = paymentSystems()
      if (!ps.length) throw new Error('Connect Square, SumUp or Stripe on the Connections page to see takings')
      // The till and Stripe added up (Stripe's online share is about a fifth of the till's).
      return { provider: ps[0], providers: ps, ...mergeSales(ps.map(p => ({ provider: p, sales: demoSales(from, to, p, ps.length > 1 && p === 'stripe' ? 0.2 : 1) }))) }
    },
    async salesItems(from, to) {
      requireAdmin()
      const ps = paymentSystems()
      if (!ps.length) throw new Error('Connect Square, SumUp or Stripe on the Connections page to see takings')
      // Only Square sends items; Stripe and SumUp send payments only, so there are no best sellers without Square.
      return ps.includes('square') ? { items: demoItems(from, to), ...(ps.includes('stripe') ? { partial: 'stripe' as const } : {}) } : { items: null, reason: ps[0] as 'stripe' | 'sumup' }
    },
    async socialPosts() {
      requireAdmin()
      publishDue()
      return clone(posts)
    },
    async saveSocialPost(p) {
      requireAdmin()
      const targets = [...new Set(p.targets)].sort() as SocialNetwork[]
      const kind = p.kind ?? 'post'
      const media = p.media ?? (p.image_url ? [{ url: p.image_url, type: 'image' as const }] : [])
      const auto = p.auto ?? true
      // The database's rules (shared/social.ts mirrors them).
      const problem = postProblem({ kind, caption: p.caption, media, targets, auto, status: p.status })
      if (problem) throw new Error(problem)
      if (p.status === 'scheduled' && !p.scheduled_at) throw new Error('Pick when to post')
      const existing = p.id ? posts.find(x => x.id === p.id) : undefined
      if (existing && ['publishing', 'published', 'partly'].includes(existing.status)) throw new Error('This post has already gone out. Make a new post instead.')
      const row: SocialPost = { id: existing?.id ?? uid(), kind, caption: p.caption, image_url: media[0]?.url ?? null, media, targets, scheduled_at: p.scheduled_at ?? null,
        auto, status: p.status, results: {}, created_at: existing?.created_at ?? nowIso(), published_at: null }
      if (existing) Object.assign(existing, row); else posts.unshift(row)
      publishDue()
      return row.id
    },
    async deleteSocialPost(id) {
      requireAdmin()
      const i = posts.findIndex(p => p.id === id)
      if (i >= 0) posts.splice(i, 1)
    },
    async markPosted(id) {
      requireAdmin()
      const p = posts.find(x => x.id === id)
      if (!p || p.status !== 'due') throw new Error('Only a reminder that’s due can be marked posted')
      Object.assign(p, { status: 'published', published_at: nowIso(),
        results: Object.fromEntries(p.targets.map(t => [t, { status: 'published', manual: true, at: nowIso() }])) })
    },
    async uploadMedia(file, folder) {
      requireAdmin()
      if (!mediaStorage()) throw new Error('Connect Google Drive or OneDrive on the Connections page to add photos and videos. They’re kept in its Business Agent folder.')
      void folder
      return { url: URL.createObjectURL(file), type: file.type.startsWith('video/') ? 'video' : 'image' }
    },
    async referrals() {
      requireAdmin()
      return { code: referralDemo.code, opens: referralDemo.opens, referrals: [...referralDemo.referrals] }
    },
    async openReferral(code, count = true) {
      if (cleanCode(code) !== referralDemo.code) throw new Error('That invite link isn’t valid')
      if (count) referralDemo.opens++
      return { business: business.name }
    },
    async joinReferral(input) {
      if (cleanCode(input.code) !== referralDemo.code) throw new Error('That invite link isn’t valid')
      if (!input.business_name.trim()) throw new Error('Add your business’s name')
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) throw new Error('Add a valid email address')
      referralDemo.referrals.unshift({ id: uid(), business_name: input.business_name.trim(), joined_at: nowIso(), set_up_at: null })
    },
    async instagramInbox() {
      requireAdmin()
      if (integ.integrations.find(i => i.provider === 'instagram')!.status !== 'connected') throw new Error('Instagram is not connected')
      return inbox.state()
    },
    async instagramThread(id) { requireAdmin(); return inbox.thread(id) },
    async replyInstagram(id, text) {
      requireAdmin()
      if (!text.trim()) throw new Error('Write a message first')
      if (replyWindow(inbox.thread(id).messages).mode === 'closed') throw new Error('Instagram allows replies up to 7 days after their last message. Reply in the Instagram app instead.')
      inbox.reply(id, text.trim())
    },
    // Messenger comes with the Facebook connection (connect it to see the Page's two chats).
    async messengerInbox() {
      requireAdmin()
      if (integ.integrations.find(i => i.provider === 'facebook')!.status !== 'connected') throw new Error('Facebook is not connected')
      return { conversations: messenger.state().conversations }
    },
    async messengerThread(id) { requireAdmin(); return messenger.thread(id) },
    async replyMessenger(id, text) {
      requireAdmin()
      if (!text.trim()) throw new Error('Write a message first')
      if (replyWindow(messenger.thread(id).messages).mode === 'closed') throw new Error('Messenger allows replies up to 7 days after their last message. Reply in Meta Business Suite instead.')
      messenger.reply(id, text.trim())
    },
    // WhatsApp: the chats the app saved (shown while WhatsApp is connected).
    async whatsappInbox() {
      requireAdmin()
      return whatsappChats.state()
    },
    async whatsappThread(id) { requireAdmin(); return whatsappChats.thread(id) },
    async replyWhatsApp(id, text) {
      requireAdmin()
      if (!text.trim()) throw new Error('Write a message first')
      if (replyWindow(whatsappChats.thread(id).messages, Date.now(), 'whatsapp').mode === 'closed') {
        throw new Error('WhatsApp only allows replies within 24 hours of their last message. After that, the café can only send approved templates.')
      }
      whatsappChats.reply(id, text.trim())
    },
    async setWhatsappRetention(days) {
      requireAdmin()
      if (!isRetention(days)) throw new Error('Choose 1 month, 3 months, 6 months, 1 year or 2 years')
      settings.whatsapp_retention_days = days
      return { days, deleted: whatsappChats.purge(days) }
    },
    async instagramProfile() {
      if (integ.integrations.find(i => i.provider === 'instagram')!.status !== 'connected') throw new Error('Instagram is not connected')
      return {
        username: 'easy.beans.coffee', name: 'Easy Beans Coffee', followers_count: 1284, media_count: 57,
        biography: 'Specialty coffee & matcha · San Pedro de Alcántara',
        recent: ['Iced oat latte season', 'Matcha, but make it ceremonial', 'Fresh from By Eric this morning',
          'Sunday slow bar', 'Our new Ethiopian filter', 'Feria week hours'].map((caption, i) => ({
          id: String(i), caption, permalink: 'https://instagram.com/easy.beans.coffee',
          timestamp: new Date(Date.now() - i * 2 * 86400000).toISOString(), like_count: 180 - i * 17, comments_count: 12 - i,
        })),
      }
    },
    async uploadPhoto(file) {
      if (!mediaStorage()) throw new Error('Connect Google Drive or OneDrive on the Connections page to add photos and videos. They’re kept in its Business Agent folder.')
      return URL.createObjectURL(file)
    },
    async share(caption, imageUrl, targets) {
      requireAdmin()
      if (!caption.trim()) throw new Error('Write a caption first')
      if (targets.includes('instagram') && !imageUrl) throw new Error('Instagram posts need a photo')
      return targets.length
    },
    async connectSpotify() {
      requireAdmin()
      setConnection('spotify', { status: 'connected', account_label: 'Easy Beans (Premium)', connected_at: nowIso(), last_checked_at: nowIso(), last_error: null, external: {} })
    },
    async cafePlaylists() {
      const p = cafeMusic()
      if (!p) throw new Error('Connect Spotify or YouTube Music first')
      return { provider: p.provider as 'spotify' | 'youtube_music', playlists: clone(p.provider === 'spotify' ? demoPlaylists : youtubePlaylists), approved: p.external.playlist ?? null }
    },
    async chooseCafePlaylist(playlist) {
      requireAdmin()
      const p = cafeMusic()
      if (!p) throw new Error('Connect Spotify or YouTube Music first')
      p.external.playlist = playlist
    },
    async brand() { return clone(brand) },
    async saveBrand(patch) {
      requireAdmin()
      Object.assign(brand, patch, { updated_at: nowIso() })
    },
    async fontList() { return { source: 'built-in', fonts: POPULAR_FONTS } },
    async notifications() {
      demoMentions()
      return clone(notes.filter(n => n.profile_id === currentUser).map(({ profile_id: _p, ...n }) => n).reverse())
    },
    async markNotificationsRead() {
      for (const n of notes) if (n.profile_id === currentUser && !n.read_at) n.read_at = nowIso()
    },
    async instagramMentions() {
      requireAdmin()
      return clone(demoMentions())
    },
    async repostMention(id) {
      requireAdmin()
      decideMention(id, 'reposted')
    },
    async ignoreMention(id) {
      requireAdmin()
      decideMention(id, 'ignored')
    },
    async checkMentions() {
      requireAdmin()
      demoMentions()
      return 0
    },
    async eventAlerts() { return clone(alerts) },
    async setEventAlert(kind, refId, on) {
      requireAdmin()
      const i = alerts.findIndex(a => a.kind === kind && a.ref_id === refId)
      if (i >= 0) alerts.splice(i, 1)
      if (!on) return false
      const title = kind === 'sports' ? sports.events.find(e => e.id === refId)?.title : events.find(e => e.id === refId)?.title
      if (!title) throw new Error('That event no longer exists')
      alerts.push({ kind, ref_id: refId, remind_at: nowIso(), sent_at: null })
      // The demo delivers the reminder straight away so you can see it arrive.
      for (const p of profiles.filter(x => x.role === 'admin' && x.active)) {
        notes.push({ id: notes.length + 1, profile_id: p.id, title, body: 'Reminder switched on. Admins get this the day before (or 3 hours before a match).', link: kind === 'sports' ? '/sports' : '/calendar', created_at: nowIso(), read_at: null })
      }
      return true
    },
    async calendarFeeds() {
      const f = feeds.get(currentUser!) ?? {}
      return isAdmin() ? { ...f } : { me: f.me }
    },
    async makeCalendarFeed(scope) {
      if (scope === 'business') requireAdmin()
      const url = `https://easybeans.example/cal/${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}.ics`
      feeds.set(currentUser!, { ...feeds.get(currentUser!), [scope]: url })
      return url
    },
    async stopCalendarFeed(scope) {
      const f = { ...feeds.get(currentUser!) }
      delete f[scope]
      feeds.set(currentUser!, f)
    },
    async apiKeys() { return clone(keys.get(currentUser!) ?? []) },
    async createApiKey(name) {
      if (!name.trim()) throw new Error('Give the key a name, like “ChatGPT” or “n8n”')
      const list = keys.get(currentUser!) ?? []
      if (list.length >= 10) throw new Error('You have 10 keys already. Revoke one you no longer use first.')
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      const key = `ba_${Array.from(crypto.getRandomValues(new Uint8Array(40)), b => chars[b % 62]).join('')}`
      const row: ApiKey = { id: uid(), name: name.trim(), prefix: key.slice(0, 7), created_at: nowIso(), last_used_at: null }
      keys.set(currentUser!, [row, ...list])
      return { ...row, key }
    },
    async revokeApiKey(id) { keys.set(currentUser!, (keys.get(currentUser!) ?? []).filter(k => k.id !== id)) },
    async myMusic() {
      if (!['admin', 'employee'].includes(me()?.role ?? '')) throw new Error('Music is for the team')
      return { configured: { spotify: true, youtube: true }, accounts: clone(myAccounts.get(currentUser!) ?? []) }
    },
    async connectMyMusic(provider) {
      const list = (myAccounts.get(currentUser!) ?? []).filter(a => a.provider !== provider)
      myAccounts.set(currentUser!, [...list, { provider, account_label: me()?.full_name ?? null, connected_at: nowIso() }])
    },
    async disconnectMyMusic(provider) {
      myAccounts.set(currentUser!, (myAccounts.get(currentUser!) ?? []).filter(a => a.provider !== provider))
      if (provider === 'spotify') myPlayer.playing = false
    },
    async myPlaylists(provider) {
      if (!(myAccounts.get(currentUser!) ?? []).some(a => a.provider === provider)) throw new Error(`Connect ${provider === 'spotify' ? 'Spotify' : 'YouTube Music'} first`)
      return clone(samplePlaylists[provider])
    },
    async myNowPlaying() { return clone(myPlayer) },
    async playMySpotify(playlistId) {
      const p = samplePlaylists.spotify.find(x => x.id === playlistId)
      if (!p) throw new Error('Pick a playlist')
      Object.assign(myPlayer, { playing: true, track: 'Coffee', artist: 'beabadoobee', device: 'iPhone' })
    },
    async pauseMySpotify() { myPlayer.playing = false },

    async cafeMusicLibrary() {
      if (!staffOnly(me()!)) throw new Error('Music is for the team')
      const p = cafeMusic()
      if (!p) return { provider: null, account: null, playlists: [], approved: null }
      const youtube = p.provider === 'youtube_music'
      return { provider: youtube ? 'youtube' : 'spotify', account: p.account_label ?? null,
        playlists: clone(youtube ? youtubePlaylists : demoPlaylists), approved: clone(p.external.playlist ?? null), demo: true,
        // A YouTube playlist that isn't music: hidden unless asked for.
        other_playlists: youtube ? [{ id: 'yt3', name: 'Café refit timelapse', tracks: 4, url: 'https://music.youtube.com/playlist?list=yt3', owner: 'Easy Beans' }] : undefined }
    },
    async cafeTracks(playlistId) {
      if (!staffOnly(me()!)) throw new Error('Music is for the team')
      const t = demoTracks[playlistId]
      if (!t) throw new Error('That playlist is not in the café’s YouTube Music account')
      return clone(t)
    },
    async cafeSearch(q, kind) {
      if (!staffOnly(me()!)) throw new Error('Music is for the team')
      const t = q.trim()
      if (t.length < 2) return { tracks: [], playlists: [] }
      return kind === 'songs'
        ? { playlists: [], tracks: [`${t}`, `${t} (Live)`, `${t} (Acoustic)`].map((title, i) => ({ id: `demo-search-${i + 1}`, title, artist: 'Search result' })) }
        : { tracks: [], playlists: [{ id: 'yt2', provider: 'youtube' as const, name: `${t} mix`, tracks: 3, url: 'https://music.youtube.com', owner: 'YouTube Music' }] }
    },
    async musicSetPlaylistOrder(ids) {
      if (!staffOnly(me()!)) throw new Error('Music is for the team')
      Object.assign(player, { playlist_order: [...ids], updated_at: nowIso() })
    },
    async musicPlayer() {
      if (!staffOnly(me()!)) throw new Error('Music is for the team')
      return clone(player)
    },
    async musicSend(action, value) {
      if (!staffOnly(me()!)) throw new Error('Music is for the team')
      Object.assign(player, { command: { action, value: value ?? null, by: currentUser }, command_seq: player.command_seq + 1, updated_at: nowIso() })
    },
    async musicSetQueue(playlist, queue, position) {
      if (!staffOnly(me()!)) throw new Error('Music is for the team')
      Object.assign(player, { playlist: clone(playlist), queue: clone(queue), position: Math.max(0, Math.min(position, queue.length - 1)),
        queue_version: player.queue_version + 1, updated_at: nowIso() })
    },
    async musicReport(report, asDevice) {
      if (!staffOnly(me()!)) throw new Error('Music is for the team')
      if (asDevice && player.device_id !== asDevice) return
      Object.assign(player, report, { updated_at: nowIso() })
    },
    async musicNow() {
      const s = cafeMusic()
      if (!s) throw new Error('No café music connected yet. An admin connects Spotify or YouTube Music on the Connections page.')
      if (s.provider === 'youtube_music') return { provider: 'youtube', controls: false, playlist: s.external.playlist ?? null, playing: false, onApprovedPlaylist: false }
      return { provider: 'spotify', controls: true, playlist: s.external.playlist ?? null, ...music, onApprovedPlaylist: music.playing }
    },
    async musicPlay() {
      const s = cafeMusic()
      if (s?.provider === 'youtube_music') throw new Error('YouTube Music plays on the café device: open the playlist there.')
      if (!s?.external.playlist) throw new Error('No playlist approved yet. An admin picks one on the Connections page.')
      Object.assign(music, { playing: true, track: 'Sunday Morning', artist: 'Maroon 5', device: 'Café speaker' })
    },
    async musicPause() { music.playing = false },
    async sendRota() {
      requireAdmin()
      return profiles.filter(p => p.whatsapp_opt_in && p.phone).length
    },

    async kioskRoster() {
      return profiles.filter(p => p.active && staffOnly(p)).map(p => {
        const e = openEntry(p.id)
        const b = e && breaks.find(x => x.time_entry_id === e.id && !x.ended_at)
        return { id: p.id, full_name: p.full_name, colour: p.colour, status: b ? 'break' : e ? 'in' : 'out',
          since: b?.started_at ?? e?.clock_in ?? null, has_pin: !!p.pin }
      })
    },
    async kioskPunch(profileId, pin, action, positionId, breakTypeId) {
      const p = profiles.find(x => x.id === profileId)
      if (!p?.pin) throw new Error('No PIN set. Ask an admin to set your PIN.')
      if (p.pin !== pin) throw new Error('Wrong PIN')
      let summary: TimeEntry | null = null
      if (action === 'in') doClockIn(profileId, 'kiosk', positionId)
      if (action === 'out') summary = doClockOut(profileId, 'kiosk')
      if (action === 'break_start') doStartBreak(profileId, breakTypeId)
      if (action === 'break_end') doEndBreak(profileId)
      return { action, at: nowIso(), full_name: p.full_name, summary }
    },
  }
  return api
}
