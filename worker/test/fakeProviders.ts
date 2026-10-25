// Stand-ins for the Google, Microsoft, Spotify, Meta, TikTok, LinkedIn and payment APIs the connections use, answering the way
// the real ones do (including their error shapes), with switches to make each one misbehave.
export type Json = Record<string, unknown>

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
/** A request body as bytes (the Worker sends uploads as ArrayBuffers or pieces of one). */
const bytesOf = (b: unknown) => (b instanceof Uint8Array ? b : b instanceof ArrayBuffer ? new Uint8Array(b) : new TextEncoder().encode(String(b ?? '')))
/** A stored file, whole or the Range asked for. */
function bytesResponse(bytes: Uint8Array, type: string, range: string | null) {
  const m = range?.match(/bytes=(\d+)-(\d*)/)
  if (!m) return new Response(bytes, { status: 200, headers: { 'content-type': type, 'content-length': String(bytes.length) } })
  const from = Number(m[1]), to = m[2] ? Number(m[2]) : bytes.length - 1
  return new Response(bytes.slice(from, to + 1), { status: 206, headers: { 'content-type': type, 'content-length': String(to - from + 1), 'content-range': `bytes ${from}-${to}/${bytes.length}` } })
}
const googleError = (status: number, message: string, reason?: string) =>
  json({ error: { code: status, message, ...(reason ? { errors: [{ reason, message }] } : {}) } }, status)

const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/adwords openid https://www.googleapis.com/auth/userinfo.email'
const MS_SCOPES = 'Mail.Send Files.ReadWrite User.Read openid email profile'

/** Decode a Gmail `raw` message into its To, Subject and text. */
export function readGmail(raw: string) {
  const text = atob(raw.replace(/-/g, '+').replace(/_/g, '/'))
  const [head, body] = text.split('\r\n\r\n')
  const utf8 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)))
  return {
    to: head.match(/^To: (.*)$/m)?.[1],
    subject: utf8(head.match(/^Subject: =\?UTF-8\?B\?(.*)\?=$/m)?.[1] ?? ''),
    text: utf8(body.replace(/\r\n/g, '')),
  }
}

export class FakeProviders {
  google = {
    email: 'cafe@gmail.com',
    /** What the person allowed on the consent screen (default: everything asked for). */
    granted: GOOGLE_SCOPES,
    revoked: false,
    /** APIs switched off in Google Cloud: 'gmail', 'drive', 'youtube'. */
    disabled: new Set<string>(),
    sent: [] as string[],
    folders: new Map<string, { name: string; parent: string; trashed: boolean }>(),
    uploads: [] as { parent: string; name: string }[],
    /** Photos and videos stored by resumable upload, by file id (and files the café keeps there, for the Legal page). */
    blobs: new Map<string, { name: string; parent: string; type: string; bytes: Uint8Array }>(),
    /** Files in the Drive that the app can't open (drive.file: never picked in Google's picker, nor made by the app). */
    unshared: new Set<string>(),
    sessions: new Map<string, { name: string; parent: string; type: string }>(),
    channel: 'Easy Beans' as string | null,
    playlists: [{ id: 'PL1', snippet: { title: 'Morning café', channelTitle: 'Easy Beans', thumbnails: {} }, contentDetails: { itemCount: 42 } }],
    /** Answer the next N Drive calls with a 500 (a provider having a bad minute). */
    driveHiccups: 0,
    /** Google Maps listings the account manages. */
    listings: [{ name: 'locations/1', title: 'Easy Beans Coffee', storefrontAddress: { addressLines: ['Calle Mayor 1'], locality: 'San Pedro' } }] as Json[],
    /** The listing's opening hours, as Google shows them (set it to edit hours "on Google Maps"). */
    hours: { periods: [] } as Json,
    /** Updates the app sent to the listing. */
    edits: [] as Json[],
    /** Google takes edits but keeps showing the old hours for a while. */
    slowToShow: false,
    /** The mailbox, for reading invoices that come by email (Gmail with gmail.readonly). */
    inbox: [] as { id: string; from: string; subject: string; at: string; files: { id: string; name: string; type: string; bytes: Uint8Array }[] }[],
    /** Reviews on the listing (v4 My Business API), newest first; replies the app sent, by review name. */
    reviews: [] as Json[],
    replies: new Map<string, string>(),
    /** The listing's phone, as Google Maps shows it. */
    phone: '+34 695 415 335',
  }
  /** Google's public listing (Places API): rating, count and the 5 newest reviews; empty when Google leaves them out. */
  places = {
    rating: 4.7, count: 38, reviews: [] as Json[], calls: 0,
    /** More of the business's own listing (where it is, for Competitors). */
    own: {} as Json,
    /** Other places (Competitors) as Google answers for each, by place id; `nearby`: those around the business, nearest first; `gone`: ids Google no longer finds. */
    listings: {} as Record<string, Json>, nearby: [] as string[], gone: new Set<string>(),
    /** Each search asked (nearby or by name): its path, body and field mask. */
    searches: [] as { path: string; body: Json; fields: string }[],
  }
  /** PageSpeed Insights: the next answers (a 429 when the free quota is used up). */
  pagespeed = { quotaUsed: false, score: 0.62, calls: [] as { url: string; strategy: string }[] }
  /** Search Console: the websites (properties) the Google account can see, and the queries asked of it. */
  searchConsole = {
    sites: [
      { siteUrl: 'https://www.easybeanscoffee.com/', permissionLevel: 'siteOwner' },
      { siteUrl: 'sc-domain:easybeans.events', permissionLevel: 'siteFullUser' },
      { siteUrl: 'https://old.example.com/', permissionLevel: 'siteUnverifiedUser' },
    ],
    queries: [] as { site: string; dimensions: string[]; startDate: string; endDate: string }[],
  }
  /** Google Ads: the accounts the Google sign-in reaches (one under a manager), campaigns, daily figures and the changes made. */
  googleAds = {
    /** Google hasn't approved the developer token for real accounts yet. */
    unapproved: false,
    accessible: ['1112223333'],
    customers: { '1112223333': { name: 'Easy Beans Coffee', currency: 'EUR', manager: false } } as Record<string, { name: string; currency: string; manager: boolean; clients?: string[] }>,
    campaigns: [
      { id: '111', name: 'Search — café San Pedro de Alcántara', status: 'ENABLED', budget: 'customers/1112223333/campaignBudgets/9', amountMicros: '8000000', shared: false },
      { id: '112', name: 'Brand (shared budget)', status: 'PAUSED', budget: 'customers/1112223333/campaignBudgets/10', amountMicros: '3000000', shared: true },
    ],
    metrics: [
      { campaign: '111', date: '2026-09-28', costMicros: '4560000', impressions: '300', clicks: '20', conversions: 1.5 },
      { campaign: '111', date: '2026-09-29', costMicros: '2005000', impressions: '150', clicks: '9', conversions: 0 },
    ],
    /** login-customer-id headers seen, and the changes made. */
    logins: [] as (string | null)[],
    mutations: [] as Json[],
  }
  /** Meta Ads: the person's ad accounts, campaigns and daily insights, and the changes made. */
  metaAds = {
    /** Until Meta's App Review, people outside the app's roles get (#200) on the ads calls. */
    unapproved: false,
    accounts: [{ id: 'act_101', name: 'Easy Beans Coffee', currency: 'EUR', account_status: 1 }] as Json[],
    campaigns: [
      { id: '2381', name: 'Instagram — new autumn menu', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '500' },
      { id: '2382', name: 'Summer (ad set budgets)', status: 'PAUSED', effective_status: 'PAUSED' },
      { id: '2383', name: 'Old opening', status: 'PAUSED', effective_status: 'ARCHIVED', daily_budget: '300' },
    ] as Json[],
    insights: [
      { campaign_id: '2381', date_start: '2026-09-28', spend: '4.12', impressions: '800', clicks: '25',
        actions: [{ action_type: 'link_click', value: '25' }, { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '3' }, { action_type: 'lead', value: '1' }] },
      { campaign_id: '2382', date_start: '2026-09-29', spend: '1.00', impressions: '120', clicks: '2' },
    ] as Json[],
    updates: [] as { id: string; status?: string; daily_budget?: string }[],
  }
  instagram = {
    username: 'easy.beans.coffee',
    permissions: 'instagram_business_basic,instagram_business_content_publish',
    /** Until Meta's review, only accounts added as Instagram testers can connect. */
    tester: true,
    /** The id Instagram Login hands back with the token: not the one posting takes. */
    loginId: '29327688583481868',
    revoked: false,
    refreshes: 0,
    /** The long-lived token the Worker should be using now. */
    current: '',
    /** The account's posts and reels (me/media), newest first. */
    media: [{ id: 'm1', caption: 'Iced oat latte season', permalink: 'https://instagram.com/p/1', timestamp: '2026-09-27T10:00:00Z' }] as Json[],
    /** Direct messages, as Instagram's Conversations API returns them (newest first). */
    chats: [
      { id: 'conv-1', updated_time: '2026-10-18T10:05:00+0000',
        participants: { data: [{ id: '17841400000000001', username: 'easy.beans.coffee' }, { id: 'igsid-lucia', username: 'lucia.marbella' }] },
        messages: { data: [
          { id: 'mid-3', created_time: '2026-10-18T10:05:00+0000', from: { id: 'igsid-lucia', username: 'lucia.marbella' }, message: 'Do you have oat milk?' },
          { id: 'mid-2', created_time: '2026-10-18T09:00:00+0000', from: { id: 'igsid-lucia', username: 'lucia.marbella' }, message: '',
            story: { mention: { link: 'https://cdn.instagram.test/story.jpg', id: 'story-1' } } },
          { id: 'mid-1', created_time: '2026-10-17T18:00:00+0000', from: { id: '17841400000000001', username: 'easy.beans.coffee' }, message: 'See you tomorrow!' },
        ] } },
    ] as Json[],
    sent: [] as Json[],
    /** Instagram refuses the detailed message fields (the Worker asks again for the plain ones). */
    plainOnly: false,
    /** The account didn't allow messages / comments when it connected. */
    noMessages: false, noTags: false,
    /** Media containers made for posting, and how many more status checks a video stays "in progress". */
    containers: new Map<string, { params: Record<string, string>; busy: number }>(),
    /** Videos take this many status checks before Instagram has processed them. */
    videoChecks: 1,
    /** Instagram can't use the videos (bad format). */
    badVideo: false,
    published: [] as { id: string; params: Record<string, string>; children: Record<string, string>[] }[],
    /** What the User Profile API says about people who messaged the café. */
    people: { 'igsid-lucia': { name: 'Lucía García', username: 'lucia.marbella', profile_pic: 'https://cdn.instagram.test/lucia.jpg' } } as Record<string, Json>,
    /** Profile lookups that fail (the person blocked the café, or Instagram is busy). */
    profileFails: [] as string[],
    profileLookups: 0,
    /** The Meta app doesn't have the Human Agent feature: replies after 24 hours are refused. */
    noHumanAgent: false,
  }
  microsoft = {
    mail: 'cafe@outlook.com' as string | null,
    granted: MS_SCOPES,
    revoked: false,
    noMailbox: false,
    /** Refresh tokens that still work. Microsoft hands out a new one on every refresh and the old one stops working. */
    valid: new Set<string>(),
    sent: [] as { to: string; subject: string }[],
    folderId: null as string | null,
    files: [] as string[],
    /** Folders below Business Agent, by path ("Business Agent/Social"), and by id. */
    paths: new Map<string, string>(),
    /** Upload sessions in progress, and the stored photos and videos by item id. */
    sessions: new Map<string, { path: string; got: Uint8Array[]; size: number }>(),
    blobs: new Map<string, { path: string; bytes: Uint8Array }>(),
    /** The café's own files and folders in its OneDrive (the Legal page browses them), by id; `parent` 'root' is the top. */
    items: new Map<string, { name: string; parent: string; folder?: boolean; type?: string; bytes?: Uint8Array }>(),
  }
  spotify = { premium: true, revoked: false }
  facebook = {
    /** What the person allowed (Facebook and Meta Ads share the sign-in's permission list here). */
    granted: ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'pages_messaging', 'public_profile', 'ads_read', 'ads_management', 'business_management'],
    pages: [{ id: 'page-1', name: 'Easy Beans Coffee', access_token: 'page-token-1' }] as { id: string; name: string; access_token: string }[],
    revoked: false,
    posts: [] as { page: string; kind: 'photos' | 'feed'; caption?: string; url?: string }[],
    /** Messenger chats on the Page (newest message first), and replies sent. */
    chats: [] as { id: string; updated_time: string; with: { id: string; name: string }; messages: { id: string; created_time: string; fromPage: boolean; message: string }[] }[],
    replies: [] as { to: string; text: string; messaging_type: string; tag?: string }[],
  }
  tiktok = {
    scope: 'user.info.basic,video.publish',
    privacy: ['SELF_ONLY'] as string[],
    revoked: false,
    /** Refresh tokens that still work (TikTok may hand out a new one on refresh). */
    refreshes: 0,
    posts: [] as { caption: string; image: string; privacy: string }[],
    failPost: null as string | null,
  }
  square = {
    locations: [{ id: 'L1', name: 'Easy Beans · San Pedro', status: 'ACTIVE', currency: 'EUR' }],
    revoked: false,
    refreshes: 0,
    payments: [
      { created_at: '2026-09-28T08:15:00Z', status: 'COMPLETED', source_type: 'CARD', amount_money: { amount: 350, currency: 'EUR' }, tip_money: { amount: 50 } },
      { created_at: '2026-09-28T21:30:00Z', status: 'COMPLETED', source_type: 'CASH', amount_money: { amount: 1200, currency: 'EUR' } }, // 23:30 in Madrid, same day
      { created_at: '2026-09-28T22:30:00Z', status: 'COMPLETED', source_type: 'WALLET', amount_money: { amount: 900, currency: 'EUR' } },  // 00:30 next day in Madrid
      { created_at: '2026-09-28T10:00:00Z', status: 'FAILED', amount_money: { amount: 9999, currency: 'EUR' } },
    ],
    /** The customer directory. `customersScope: false` is a connection made before CUSTOMERS_READ was asked for. */
    customersScope: true,
    customers: [
      { id: 'SQC1', given_name: 'Lucía', family_name: 'García', email_address: 'Lucia@Example.com', phone_number: '+34600111222', birthday: '0000-05-14', updated_at: '2026-09-01T10:00:00Z' },
      { id: 'SQC2', given_name: 'Tom', email_address: 'tom@example.co.uk', note: 'Oat flat white', updated_at: '2026-09-02T10:00:00Z' },
      { id: 'SQC3', company_name: 'No way to reach them', updated_at: '2026-09-03T10:00:00Z' },
    ] as { id: string; updated_at: string; [k: string]: string }[],
    /** Loyalty and gift cards. `loyaltyScope: false` is a connection made before LOYALTY_READ and GIFTCARDS_READ were asked for. */
    loyaltyScope: true,
    /** The loyalty programme (null: none set up): a stamp card, a stamp a visit, the 10th coffee free. */
    program: { status: 'ACTIVE', terminology: { one: 'Stamp', other: 'Stamps' }, reward_tiers: [{ id: 'T1', name: 'Free coffee', points: 9 }],
      accrual_rules: [{ accrual_type: 'VISIT', points: 1, visit_data: { minimum_amount_money: { amount: 250, currency: 'EUR' } } }] } as Record<string, unknown> | null,
    loyaltyAccounts: [
      { id: 'LA1', customer_id: 'SQC1', balance: 7, lifetime_points: 25, enrolled_at: '2026-05-02T09:00:00Z' },
      { id: 'LA2', customer_id: 'SQC9', balance: 3, lifetime_points: 3, enrolled_at: '2026-09-01T09:00:00Z' },
    ] as { id: string; customer_id?: string; balance: number; lifetime_points: number; enrolled_at: string }[],
    loyaltyEvents: [
      { id: 'E1', type: 'ACCUMULATE_POINTS', created_at: '2026-09-28T08:15:00Z', loyalty_account_id: 'LA1', accumulate_points: { points: 1 } },
      { id: 'E2', type: 'CREATE_REWARD', created_at: '2026-09-27T10:00:00Z', loyalty_account_id: 'LA1', create_reward: { points: 9 } },
      { id: 'E3', type: 'REDEEM_REWARD', created_at: '2026-09-27T10:00:00Z', loyalty_account_id: 'LA1', redeem_reward: { reward_id: 'R1' } },
      { id: 'E4', type: 'ACCUMULATE_POINTS', created_at: '2026-09-20T08:15:00Z', loyalty_account_id: 'LA2', accumulate_points: { points: 1 } },
    ] as { id: string; type: string; created_at: string; loyalty_account_id: string; [k: string]: unknown }[],
    /** Points adjustments asked for, by idempotency key (the same key twice is one adjustment, as on Square). */
    adjustments: new Map<string, { account: string; points: number; reason: string }>(),
    giftCards: [
      { id: 'GC1', type: 'DIGITAL', state: 'ACTIVE', gan: '7783320001234567', balance_money: { amount: 2500, currency: 'EUR' }, created_at: '2026-09-10T10:00:00Z', customer_ids: ['SQC1'] },
      { id: 'GC2', type: 'PHYSICAL', state: 'DEACTIVATED', gan: '7783320009876543', balance_money: { amount: 0, currency: 'EUR' }, created_at: '2026-08-01T10:00:00Z' },
    ] as { id: string; type: string; state: string; gan: string; balance_money: { amount: number; currency: string }; created_at: string; customer_ids?: string[] }[],
    giftActivities: [
      { id: 'GA1', type: 'ACTIVATE', created_at: '2026-09-10T10:00:00Z', gift_card_gan: '7783320001234567', activate_activity_details: { amount_money: { amount: 3000, currency: 'EUR' } }, gift_card_balance_money: { amount: 3000, currency: 'EUR' } },
      { id: 'GA2', type: 'REDEEM', created_at: '2026-09-20T10:00:00Z', gift_card_gan: '7783320001234567', redeem_activity_details: { amount_money: { amount: 500, currency: 'EUR' } }, gift_card_balance_money: { amount: 2500, currency: 'EUR' } },
    ] as { id: string; type: string; created_at: string; gift_card_gan: string; [k: string]: unknown }[],
    /** Idempotency keys seen on gift card writes. */
    giftKeys: [] as string[],
    /** Completed orders, for best sellers. `ordersScope: false` is a connection made before ORDERS_READ was asked for. */
    ordersScope: true,
    orders: [
      { closed_at: '2026-09-28T08:15:00Z', line_items: [
        { name: 'Flat White', variation_name: 'Regular', quantity: '2', gross_sales_money: { amount: 640 } },
        { name: 'Croissant', variation_name: 'Pistachio', quantity: '1', gross_sales_money: { amount: 420 } },
      ] },
      { closed_at: '2026-09-28T12:00:00Z', line_items: [{ name: 'Flat White', variation_name: 'Regular', quantity: '1', gross_sales_money: { amount: 320 } }] },
      { closed_at: '2026-10-02T12:00:00Z', line_items: [{ name: 'Açaí Bowl', quantity: '1', gross_sales_money: { amount: 850 } }] },
    ],
  }
  stripe = {
    revoked: false,
    deauthorized: [] as string[],
    /** Balance transactions: payments, a refund and a payout (ignored). */
    txs: [
      { id: 'txn_1', type: 'charge', amount: 350, currency: 'eur', created: Date.parse('2026-09-28T08:15:00Z') / 1000 },
      { id: 'txn_2', type: 'payment', amount: 1200, currency: 'eur', created: Date.parse('2026-09-28T21:30:00Z') / 1000 }, // 23:30 in Madrid, same day
      { id: 'txn_3', type: 'refund', amount: -200, currency: 'eur', created: Date.parse('2026-09-28T12:00:00Z') / 1000 },
      { id: 'txn_4', type: 'charge', amount: 900, currency: 'eur', created: Date.parse('2026-09-28T22:30:00Z') / 1000 },  // 00:30 next day in Madrid
      { id: 'txn_5', type: 'payout', amount: -5000, currency: 'eur', created: Date.parse('2026-09-29T09:00:00Z') / 1000 },
    ],
  }
  sumup = {
    revoked: false,
    /** Refreshes made; the refresh token that still works is su-refresh-<refreshes> (SumUp hands out a new one each time). */
    refreshes: 0,
    merchant: { merchant_code: 'MCODE1', company_name: 'Easy Beans Coffee SL', doing_business_as: { business_name: 'Easy Beans Coffee' }, country: 'ES' } as Json,
    /** Transactions history: amounts in euros, including the tip. A page holds this many. */
    pageSize: 2,
    txs: [
      { id: 'tx1', timestamp: '2026-09-28T08:15:00.000Z', amount: 4, tip_amount: 0.5, currency: 'EUR', status: 'SUCCESSFUL', type: 'PAYMENT', payment_type: 'POS', entry_mode: 'CONTACTLESS', card_type: 'VISA' },
      { id: 'tx2', timestamp: '2026-09-28T21:30:00.000Z', amount: 12, currency: 'EUR', status: 'SUCCESSFUL', type: 'PAYMENT', payment_type: 'CASH' }, // 23:30 in Madrid, same day
      { id: 'tx3', timestamp: '2026-09-28T22:30:00.000Z', amount: 9, currency: 'EUR', status: 'SUCCESSFUL', type: 'PAYMENT', payment_type: 'POS', entry_mode: 'APPLE_PAY', card_type: 'MASTERCARD' }, // 00:30 next day
      { id: 'tx4', timestamp: '2026-09-28T10:00:00.000Z', amount: 99.99, currency: 'EUR', status: 'FAILED', type: 'PAYMENT', payment_type: 'POS' },
      { id: 'tx5', timestamp: '2026-09-28T12:00:00.000Z', amount: 5, refunded_amount: 5, currency: 'EUR', status: 'REFUNDED', type: 'PAYMENT', payment_type: 'POS', entry_mode: 'CHIP', card_type: 'VISA' },
    ] as Json[],
    pages: 0,
  }
  linkedin = {
    /** What the person allowed (LinkedIn lists scopes with commas). */
    scope: 'openid,profile,w_member_social,r_organization_admin,w_organization_social',
    member: { sub: 'mem-1', name: 'Aron O’Neill', given_name: 'Aron', family_name: 'O’Neill' },
    /** Company Pages the person administers. */
    orgs: [{ id: 101, localizedName: 'Easy Beans Coffee', vanityName: 'easy-beans-coffee' }] as { id: number; localizedName: string; vanityName?: string }[],
    revoked: false,
    /** Apps LinkedIn approved for refresh tokens get one; most don't. */
    refreshable: false,
    refreshes: 0,
    uploads: [] as { owner: string; type: string; size: number; image: string }[],
    posts: [] as Json[],
  }
  whatsapp = {
    sent: [] as { to: string; template: string; language: string }[],
    /** Free-form replies (within 24 hours of the person's last message). */
    texts: [] as { to: string; text: string }[],
    broken: false,
    /** Photos and voice notes people sent, by media id (Meta keeps them for a while, then they're gone). */
    media: new Map<string, { type: string; bytes: Uint8Array }>(),
  }
  /** ElevenLabs Music (key "el-key"): what it was asked for, and switches to refuse a prompt or fail. */
  elevenlabs = { asked: [] as Json[], refuse: false, down: false }
  /** The render service (render/, at https://render.test, key "render-key"): the jobs it got, and a switch to refuse one. */
  render = { jobs: [] as Json[], refuse: null as string | null }

  /** Every call, as "METHOD host/path". */
  calls: string[] = []
  private nextId = 1

  handle(input: string, init: RequestInit = {}): Response | null {
    const url = new URL(input)
    const method = (init.method ?? 'GET').toUpperCase()
    this.calls.push(`${method} ${url.host}${url.pathname}`)
    const form = () => new URLSearchParams(String(init.body ?? ''))
    const body = () => JSON.parse(String(init.body ?? '{}')) as Json

    // ---- ElevenLabs Music: an MP3 per call (a few bytes standing in) ----
    if (url.host === 'api.elevenlabs.io' && url.pathname === '/v1/music' && method === 'POST') {
      if (new Headers(init.headers).get('xi-api-key') !== 'el-key') return json({ detail: { status: 'invalid_api_key', message: 'Invalid API key' } }, 401)
      this.elevenlabs.asked.push(body())
      if (this.elevenlabs.refuse) {
        return json({ detail: { status: 'bad_prompt', message: 'The prompt includes copyrighted material.', data: { prompt_suggestion: 'Bright upbeat pop with handclaps' } } }, 400)
      }
      if (this.elevenlabs.down) return json({ detail: { message: 'Service temporarily unavailable' } }, 503)
      const n = this.nextId++
      return new Response(new Uint8Array(2048).fill(n % 251), { headers: { 'content-type': 'audio/mpeg', 'song-id': `song-${n}` } })
    }

    // ---- The render service: the MP4 with the music in ----
    if (url.host === 'render.test') {
      if (new Headers(init.headers).get('authorization') !== 'Bearer render-key') return json({ error: 'Not allowed' }, 401)
      this.render.jobs.push(body())
      if (this.render.refuse) return json({ error: this.render.refuse }, 400)
      const bytes = new Uint8Array(4096).fill(7)
      // A video source is 12.5 s long here; photos last as asked.
      const job = body() as { seconds: number; source: { type: string } }
      const seconds = job.source.type === 'video' ? Math.min(12.5, job.seconds) : job.seconds
      return new Response(bytes, { headers: { 'content-type': 'video/mp4', 'content-length': String(bytes.length), 'x-render-ms': '8400', 'x-render-seconds': String(seconds) } })
    }

    // ---- Google ----
    if (url.href === 'https://oauth2.googleapis.com/token') {
      const f = form()
      if (f.get('grant_type') === 'refresh_token' && (this.google.revoked || f.get('refresh_token') !== 'g-refresh')) {
        return json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400)
      }
      return json({ access_token: `g-access-${this.nextId++}`, expires_in: 3599, scope: this.google.granted, token_type: 'Bearer',
        ...(f.get('grant_type') === 'authorization_code' ? { refresh_token: 'g-refresh' } : {}) })
    }
    if (url.href === 'https://openidconnect.googleapis.com/v1/userinfo') return json({ email: this.google.email })
    if (url.host === 'gmail.googleapis.com') {
      if (this.google.disabled.has('gmail')) return googleError(403, 'Gmail API has not been used in project 1234 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=1234 then retry.', 'accessNotConfigured')
      // Reading the mailbox (Invoices).
      if (method === 'GET' && url.pathname.startsWith('/gmail/v1/users/me/messages')) {
        if (!this.google.granted.includes('gmail.readonly')) return googleError(403, 'Request had insufficient authentication scopes.', 'insufficientPermissions')
        const [, , , , , , id, , att] = url.pathname.split('/')
        if (!id) return json({ messages: this.google.inbox.map(m => ({ id: m.id })) })
        const m = this.google.inbox.find(x => x.id === decodeURIComponent(id))
        if (!m) return googleError(404, 'Requested entity was not found.', 'notFound')
        if (att) {
          const f = m.files.find(x => x.id === decodeURIComponent(att))!
          return json({ data: Buffer.from(f.bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_') })
        }
        return json({ id: m.id, internalDate: String(Date.parse(m.at)), payload: { headers: [{ name: 'From', value: m.from }, { name: 'Subject', value: m.subject }],
          parts: [{ mimeType: 'text/plain', body: { size: 10 } }, ...m.files.map(f => ({ filename: f.name, mimeType: f.type, body: { attachmentId: f.id, size: f.bytes.length } }))] } })
      }
      if (!this.google.granted.includes('gmail.send')) return googleError(403, 'Request had insufficient authentication scopes.', 'insufficientPermissions')
      this.google.sent.push(String(body().raw))
      return json({ id: `msg-${this.nextId++}`, threadId: 't', labelIds: ['SENT'] })
    }
    if (url.host === 'www.googleapis.com' && url.pathname.startsWith('/drive/v3/')) {
      if (this.google.disabled.has('drive')) return googleError(403, 'Google Drive API has not been used in project 1234 before or it is disabled.', 'accessNotConfigured')
      if (this.google.driveHiccups > 0) { this.google.driveHiccups--; return googleError(500, 'Backend Error', 'backendError') }
      const seen = (id: string) => (this.google.unshared.has(id) ? undefined : this.google.blobs.get(id))
      // Google's own documents (Docs, Sheets…) as a PDF; anything else can't be exported.
      const exported = url.pathname.match(/\/drive\/v3\/files\/([^/]+)\/export$/)
      if (exported) {
        const f = seen(decodeURIComponent(exported[1]))
        if (!f) return googleError(404, `File not found: ${exported[1]}.`, 'notFound')
        if (!f.type.startsWith('application/vnd.google-apps.')) return googleError(403, 'Export only supports Docs Editors files.', 'fileNotExportable')
        return bytesResponse(new TextEncoder().encode(`%PDF-1.7 ${f.name}`), url.searchParams.get('mimeType') ?? '', null)
      }
      const byId = url.pathname.match(/\/drive\/v3\/files\/([^/]+)$/)
      if (byId && url.searchParams.get('alt') === 'media') {
        const f = seen(decodeURIComponent(byId[1]))
        return f ? bytesResponse(f.bytes, f.type, new Headers(init.headers).get('range')) : googleError(404, `File not found: ${byId[1]}.`, 'notFound')
      }
      if (byId) {
        const id = decodeURIComponent(byId[1])
        const f = this.google.folders.get(id)
        if (f) return json({ id, name: f.name, mimeType: 'application/vnd.google-apps.folder', trashed: f.trashed })
        const b = seen(id)
        return b ? json({ id, name: b.name, mimeType: b.type, ...(b.type.startsWith('application/vnd.google-apps.') ? {} : { size: String(b.bytes.length) }),
          modifiedTime: '2026-10-20T09:30:00.000Z', webViewLink: `https://drive.google.com/file/d/${id}/view`, trashed: false })
          : googleError(404, `File not found: ${byId[1]}.`, 'notFound')
      }
      if (method === 'GET') {
        const q = url.searchParams.get('q') ?? ''
        const name = q.match(/name = '(.*?)'/)?.[1], parent = q.match(/'([^']+)' in parents/)?.[1]
        // Without a name: every folder inside the parent (the Tax page's folder list).
        const files = [...this.google.folders].filter(([, f]) => (name === undefined || f.name === name) && f.parent === parent && !f.trashed)
          .map(([id, f]) => ({ id, name: f.name })).sort((a, b) => a.name.localeCompare(b.name))
        return json({ files })
      }
      const made = body() as { name: string; parents: string[] }
      const id = `folder-${this.nextId++}`
      this.google.folders.set(id, { name: made.name, parent: made.parents[0], trashed: false })
      return json({ id })
    }
    if (url.host === 'www.googleapis.com' && url.pathname.startsWith('/upload/drive/v3/files') && url.searchParams.get('uploadType') === 'resumable') {
      const upload = url.searchParams.get('upload_id')
      if (!upload) {
        const meta = body() as { name: string; parents: string[] }
        const id = `sess-${this.nextId++}`
        this.google.sessions.set(id, { name: meta.name, parent: meta.parents[0], type: new Headers(init.headers).get('x-upload-content-type') ?? '' })
        return new Response(null, { status: 200, headers: { location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${id}` } })
      }
      const sess = this.google.sessions.get(upload)!
      const id = `file-${this.nextId++}`
      this.google.blobs.set(id, { ...sess, bytes: bytesOf(init.body) })
      return json({ id })
    }
    if (url.host === 'www.googleapis.com' && url.pathname.startsWith('/upload/drive/v3/files')) {
      const meta = JSON.parse(String(init.body).split('\r\n')[3]) as { name: string; parents: string[] }
      this.google.uploads.push({ parent: meta.parents[0], name: meta.name })
      return json({ webViewLink: `https://drive.google.com/file/d/${this.nextId++}/view` })
    }
    if (url.host === 'www.googleapis.com' && url.pathname.startsWith('/youtube/v3/')) {
      if (this.google.disabled.has('youtube')) return googleError(403, 'YouTube Data API v3 has not been used in project 1234 before or it is disabled.', 'accessNotConfigured')
      if (url.pathname.endsWith('/channels')) return json({ items: this.google.channel ? [{ snippet: { title: this.google.channel } }] : [] })
      if (url.pathname.endsWith('/playlists')) return json({ items: this.google.playlists })
    }

    if (url.host === 'googleads.googleapis.com') {
      const g = this.googleAds
      const headers = new Headers(init.headers)
      if (!headers.get('developer-token')) return googleError(401, 'The developer token is missing.')
      if (this.google.revoked) return googleError(401, 'Request had invalid authentication credentials.')
      if (g.unapproved) {
        return json({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'The caller does not have permission',
          details: [{ errors: [{ errorCode: { authorizationError: 'DEVELOPER_TOKEN_NOT_APPROVED' }, message: 'The developer token is only approved for use with test accounts.' }] }] } }, 403)
      }
      if (url.pathname.endsWith('/customers:listAccessibleCustomers')) return json({ resourceNames: g.accessible.map(id => `customers/${id}`) })
      const call = url.pathname.match(/\/customers\/(\d+)\/(googleAds:search|campaigns:mutate|campaignBudgets:mutate)$/)
      if (!call) return googleError(404, 'Not found')
      g.logins.push(headers.get('login-customer-id'))
      const [, customer, what] = call
      const b = body() as { query?: string; operations?: { update: Json; updateMask: string }[] }
      if (what !== 'googleAds:search') {
        g.mutations.push({ customer, what, ...b.operations![0] })
        const u = b.operations![0].update as { resourceName: string; status?: string; amountMicros?: string }
        if (what === 'campaigns:mutate') { const c = g.campaigns.find(x => u.resourceName.endsWith(`/campaigns/${x.id}`)); if (c && u.status) c.status = u.status }
        else { const c = g.campaigns.find(x => x.budget === u.resourceName); if (c && u.amountMicros) c.amountMicros = u.amountMicros }
        return json({ results: [{ resourceName: u.resourceName }] })
      }
      const q = b.query ?? ''
      if (/FROM customer_client/.test(q)) {
        return json({ results: (g.customers[customer]?.clients ?? []).map(id => ({ customerClient: { id, descriptiveName: g.customers[id].name, currencyCode: g.customers[id].currency, manager: false } })) })
      }
      if (/FROM customer /.test(`${q} `) && !/campaign/.test(q)) {
        const c = g.customers[customer]
        return json({ results: c ? [{ customer: { id: customer, descriptiveName: c.name, currencyCode: c.currency, manager: c.manager } }] : [] })
      }
      if (/segments\.date BETWEEN/.test(q)) {
        const [, from, to] = q.match(/BETWEEN '(.*?)' AND '(.*?)'/)!
        return json({ results: g.metrics.filter(m => m.date >= from && m.date <= to).map(m => ({ campaign: { id: m.campaign }, segments: { date: m.date },
          metrics: { costMicros: m.costMicros, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions } })) })
      }
      const one = q.match(/campaign\.id = (\d+)/)?.[1]
      return json({ results: g.campaigns.filter(c => (!one || c.id === one) && c.status !== 'REMOVED').map(c => ({ campaign: { id: c.id, name: c.name, status: c.status },
        campaignBudget: { resourceName: c.budget, amountMicros: c.amountMicros, explicitlyShared: c.shared, period: 'DAILY' } })) })
    }

    if (url.host === 'searchconsole.googleapis.com') {
      if (this.google.disabled.has('search_console')) return googleError(403, 'Google Search Console API has not been used in project 1234 before or it is disabled.', 'accessNotConfigured')
      if (this.google.revoked) return googleError(401, 'Request had invalid authentication credentials.')
      if (url.pathname === '/webmasters/v3/sites') return json({ siteEntry: this.searchConsole.sites })
      const q = url.pathname.match(/^\/webmasters\/v3\/sites\/([^/]+)\/searchAnalytics\/query$/)
      if (q && method === 'POST') {
        const site = decodeURIComponent(q[1])
        if (!this.searchConsole.sites.some(s => s.siteUrl === site && s.permissionLevel !== 'siteUnverifiedUser')) return googleError(403, `User does not have sufficient permission for site '${site}'.`, 'forbidden')
        const b = body() as { dimensions?: string[]; startDate: string; endDate: string }
        const dimensions = b.dimensions ?? []
        this.searchConsole.queries.push({ site, dimensions, startDate: b.startDate, endDate: b.endDate })
        const r = (keys: string[] | null, clicks: number, impressions: number, position: number) => ({ ...(keys ? { keys } : {}), clicks, impressions, ctr: clicks / impressions, position })
        const rows: Record<string, unknown[]> = {
          '': [r(null, 61, 2400, 9.4567)],
          date: [r(['2026-10-02'], 25, 1300, 9.1), r(['2026-10-01'], 36, 1100, 9.88)],
          query: [r(['brunch marbella'], 4, 900, 13.97), r(['easy beans coffee'], 40, 101, 1.12)],
          page: [r(['https://www.easybeanscoffee.com/'], 50, 1800, 8.2)],
          device: [r(['DESKTOP'], 11, 500, 10.3), r(['MOBILE'], 49, 1850, 9.2), r(['TABLET'], 1, 50, 11)],
          country: [r(['gbr'], 9, 400, 11.5), r(['esp'], 50, 1900, 8.9)],
        }
        return json(rows[dimensions.join(',')]?.length ? { rows: rows[dimensions.join(',')], responseAggregationType: 'byProperty' } : { responseAggregationType: 'byProperty' })
      }
    }
    if (url.host === 'mybusiness.googleapis.com' && /\/reviews$/.test(url.pathname) && method === 'GET') {
      return json({ reviews: this.google.reviews.map(r => ({ ...r, ...(this.google.replies.has(String(r.name)) ? { reviewReply: { comment: this.google.replies.get(String(r.name)), updateTime: '2026-10-20T10:00:00Z' } } : {}) })) })
    }
    const reply = url.pathname.match(/^\/v4\/(accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+)\/reply$/)
    if (url.host === 'mybusiness.googleapis.com' && reply) {
      if (method === 'DELETE') { this.google.replies.delete(reply[1]); return json({}) }
      this.google.replies.set(reply[1], String((body() as { comment: string }).comment))
      return json({ comment: (body() as { comment: string }).comment, updateTime: '2026-10-20T10:00:00Z' })
    }
    if (url.host === 'places.googleapis.com') {
      this.places.calls++
      const h = new Headers(init.headers)
      if (h.get('x-goog-api-key') !== 'places-key') return googleError(403, 'API key not valid. Please pass a valid API key.', 'forbidden')
      if (method === 'POST') {
        const b = body()
        this.places.searches.push({ path: url.pathname, body: b, fields: h.get('x-goog-fieldmask') ?? '' })
        if (url.pathname === '/v1/places:searchNearby') {
          return json({ places: this.places.nearby.map(id => this.places.listings[id] ?? (id === this.places.own.id ? this.places.own : null)).filter(Boolean) })
        }
        if (url.pathname === '/v1/places:searchText') {
          const words = String(b.textQuery).toLowerCase().split(/\s+/).filter(w => w.length > 2)
          const name = (p: Json) => String((p.displayName as Json | undefined)?.text ?? '').toLowerCase()
          return json({ places: Object.values(this.places.listings).filter(p => words.some(w => name(p).includes(w))) })
        }
      }
      const id = decodeURIComponent(url.pathname.replace(/^\/v1\/places\//, ''))
      if (this.places.gone.has(id)) return googleError(404, 'Not found: places/' + id, 'NOT_FOUND')
      if (this.places.listings[id]) return json(this.places.listings[id])
      return json({ rating: this.places.rating, userRatingCount: this.places.count, ...(this.places.reviews.length ? { reviews: this.places.reviews } : {}), ...this.places.own })
    }
    if (url.host === 'www.googleapis.com' && url.pathname === '/pagespeedonline/v5/runPagespeed') {
      this.pagespeed.calls.push({ url: url.searchParams.get('url')!, strategy: url.searchParams.get('strategy')! })
      if (this.pagespeed.quotaUsed) return googleError(429, "Quota exceeded for quota metric 'Queries' and limit 'Queries per day'.", 'rateLimitExceeded')
      return json({ lighthouseResult: { categories: { performance: { score: this.pagespeed.score }, accessibility: { score: 0.9 }, 'best-practices': { score: 1 }, seo: { score: 0.92 } },
        audits: { 'largest-contentful-paint': { numericValue: 3200 }, 'cumulative-layout-shift': { numericValue: 0.02 },
          'uses-webp-images': { title: 'Serve images in modern formats', details: { type: 'opportunity', overallSavingsMs: 1200 } } } } })
    }
    if (url.host === 'mybusinessaccountmanagement.googleapis.com') return json({ accounts: [{ name: 'accounts/1' }] })
    if (url.host === 'mybusinessbusinessinformation.googleapis.com') {
      if (url.pathname.endsWith('/locations')) return json({ locations: this.google.listings })
      if (method === 'PATCH') {
        const edit = body()
        this.google.edits.push(edit)
        if (edit.regularHours && !this.google.slowToShow) this.google.hours = edit.regularHours as Json
        return json({})
      }
      return json({ ...this.google.listings[0], phoneNumbers: { primaryPhone: this.google.phone }, regularHours: this.google.hours })
    }

    // ---- Instagram (Instagram Login) ----
    if (url.href === 'https://api.instagram.com/oauth/access_token') {
      if (!this.instagram.tester) return json({ error_type: 'OAuthException', code: 400, error_message: 'Insufficient Developer Role' }, 400)
      // Not the professional account's id (that's /me's user_id), as with the real Instagram Login.
      return json({ data: [{ access_token: 'ig-short', user_id: this.instagram.loginId, permissions: this.instagram.permissions }] })
    }
    if (url.host === 'graph.instagram.com' && url.pathname === '/access_token') {
      this.instagram.current = 'ig-long-0'
      return json({ access_token: this.instagram.current, token_type: 'bearer', expires_in: 5_184_000 })
    }
    if (url.host === 'graph.instagram.com' && url.pathname === '/refresh_access_token') {
      if (this.instagram.revoked || url.searchParams.get('access_token') !== this.instagram.current) return json({ error: { message: 'Error validating access token: Session has expired.', type: 'OAuthException', code: 190 } }, 400)
      this.instagram.current = `ig-long-${++this.instagram.refreshes}`
      return json({ access_token: this.instagram.current, token_type: 'bearer', expires_in: 5_184_000 })
    }
    if (url.host === 'graph.instagram.com') {
      const token = new Headers(init.headers).get('authorization')?.replace('Bearer ', '')
      if (this.instagram.revoked || token !== this.instagram.current) {
        return json({ error: { message: 'Error validating access token: The user has not authorized application 123.', type: 'OAuthException', code: 190 } }, 400)
      }
      if (url.pathname.endsWith('/me')) return json({ user_id: '17841400000000001', username: this.instagram.username, account_type: 'BUSINESS', followers_count: 1284, media_count: 57 })
      if (url.pathname.endsWith('/me/media') && method === 'GET') return json({ data: this.instagram.media })
      const noMessages = () => json({ error: { message: '(#3) Application does not have the capability to make this API call.', type: 'OAuthException', code: 3 } }, 400)
      const fieldsOk = () => !this.instagram.plainOnly || !(url.searchParams.get('fields') ?? '').includes('image_data')
      if (url.pathname.endsWith('/me/conversations')) {
        if (this.instagram.noMessages) return noMessages()
        if (!fieldsOk()) return json({ error: { message: '(#100) Tried accessing nonexisting field (image_data)', code: 100 } }, 400)
        return json({ data: this.instagram.chats })
      }
      if (url.pathname.endsWith('/me/messages') && method === 'POST') {
        if (this.instagram.noMessages) return noMessages()
        if (body().tag && this.instagram.noHumanAgent) {
          return json({ error: { message: '(#10) This message is sent outside of allowed window.', type: 'OAuthException', code: 10, error_subcode: 2534022 } }, 400)
        }
        this.instagram.sent.push(body())
        return json({ recipient_id: (body().recipient as Json).id, message_id: `mid-sent-${this.nextId++}` })
      }
      if (url.pathname.endsWith('/me/tags')) {
        if (this.instagram.noTags) return json({ error: { message: '(#10) Application does not have permission for this action', code: 10 } }, 400)
        return json({ data: [{ id: 'tag-1', username: 'sanpedro.eats', caption: 'Morning stop', media_url: 'https://cdn.instagram.test/t.jpg', permalink: 'https://instagram.com/p/t1', timestamp: '2026-10-16T09:00:00+0000' }] })
      }
      // Posting takes only the professional account's id.
      const postingAs = /\/(\d+)\/media(?:_publish)?$/.exec(url.pathname)?.[1]
      if (postingAs && postingAs !== '17841400000000001' && method === 'POST') {
        return json({ error: { message: `Unsupported post request. Object with ID '${postingAs}' does not exist, cannot be loaded due to missing permissions, or does not support this operation`, type: 'GraphMethodException', code: 100, error_subcode: 33 } }, 400)
      }
      if (/\/\d+\/media$/.test(url.pathname) && method === 'POST') {
        const params = Object.fromEntries(form())
        const id = `container-${this.nextId++}`
        const video = !!params.video_url || params.media_type === 'VIDEO' || params.media_type === 'REELS'
        this.instagram.containers.set(id, { params, busy: video ? this.instagram.videoChecks : 0 })
        return json({ id })
      }
      if (url.pathname.endsWith('/media_publish') && method === 'POST') {
        const c = this.instagram.containers.get(form().get('creation_id') ?? '')
        if (!c) return json({ error: { message: 'Media ID is not available', code: 9007 } }, 400)
        if (c.busy > 0) return json({ error: { message: 'Media ID is not available', code: 9007 } }, 400)
        const id = `ig-media-${this.nextId++}`
        const children = (c.params.children ?? '').split(',').filter(Boolean).map(k => this.instagram.containers.get(k)!.params)
        this.instagram.published.push({ id, params: c.params, children })
        return json({ id })
      }
      const container = this.instagram.containers.get(url.pathname.split('/').pop() ?? '')
      if (container) {
        const video = !!container.params.video_url
        if (video && this.instagram.badVideo) return json({ id: 'x', status_code: 'ERROR', status: 'Error: 2207026' })
        if (container.busy > 0) { container.busy--; return json({ status_code: 'IN_PROGRESS', status: 'In Progress' }) }
        return json({ status_code: 'FINISHED', status: 'Finished' })
      }
      const post = this.instagram.published.find(p => url.pathname.endsWith(`/${p.id}`))
      if (post) return json({ permalink: `https://www.instagram.com/p/${post.id}/` })
      if ((url.searchParams.get('fields') ?? '').includes('profile_pic')) {
        const who = decodeURIComponent(url.pathname.split('/').pop() ?? '')
        this.instagram.profileLookups++
        const p = this.instagram.people[who]
        if (!p || this.instagram.profileFails.includes(who)) return json({ error: { message: '(#100) The user can not be found', code: 100 } }, 400)
        return json({ id: who, ...p })
      }
      const chat = this.instagram.chats.find(c => url.pathname.endsWith(`/${c.id}`))
      if (chat) return this.instagram.noMessages ? noMessages() : json(chat)
    }

    // ---- Microsoft ----
    if (url.href === 'https://login.microsoftonline.com/common/oauth2/v2.0/token') {
      const f = form()
      if (f.get('grant_type') === 'refresh_token') {
        if (this.microsoft.revoked || !this.microsoft.valid.delete(f.get('refresh_token') ?? '')) {
          return json({ error: 'invalid_grant', error_description: 'AADSTS70000: The provided grant has expired due to it being revoked.\r\nTrace ID: x' }, 400)
        }
      }
      const refresh = `ms-refresh-${this.nextId++}`
      this.microsoft.valid.add(refresh)
      return json({ access_token: `ms-access-${this.nextId++}`, refresh_token: refresh, scope: this.microsoft.granted, token_type: 'Bearer' })
    }
    if (url.host === 'graph.microsoft.com') {
      const path = url.pathname.replace('/v1.0', '')
      if (path === '/me') return json({ displayName: 'Easy Beans', mail: this.microsoft.mail, userPrincipalName: this.microsoft.mail ?? 'cafe@outlook.com' })
      if (path === '/me/sendMail') {
        if (this.microsoft.noMailbox) return json({ error: { code: 'MailboxNotEnabledForRESTAPI', message: 'The mailbox is either inactive, soft-deleted, or is hosted on-premise.' } }, 404)
        if (!/mail\.send/i.test(this.microsoft.granted)) return json({ error: { code: 'ErrorAccessDenied', message: 'Access is denied. Check credentials and try again.' } }, 403)
        const m = body() as { message: { subject: string; toRecipients: { emailAddress: { address: string } }[] } }
        this.microsoft.sent.push({ to: m.message.toRecipients[0].emailAddress.address, subject: m.message.subject })
        return new Response(null, { status: 202 })
      }
      // The café's own OneDrive, item by item (the Legal page): the top, a file or folder, a folder's contents.
      const msItem = (id: string) => {
        const i = this.microsoft.items.get(id)!
        const names = (p: string): string[] => (p === 'root' ? [] : [...names(this.microsoft.items.get(p)!.parent), this.microsoft.items.get(p)!.name])
        return { id, name: i.name, webUrl: `https://onedrive.live.com/?id=${id}`, lastModifiedDateTime: '2026-10-21T08:00:00Z',
          parentReference: { id: i.parent, path: `/drive/root:${names(i.parent).map(n => `/${encodeURIComponent(n)}`).join('')}` },
          ...(i.folder ? { folder: { childCount: [...this.microsoft.items.values()].filter(x => x.parent === id).length } } : { size: i.bytes?.length ?? 0, file: { mimeType: i.type } }) }
      }
      const kids = (parent: string) => json({ value: [...this.microsoft.items].filter(([, i]) => i.parent === parent).map(([id]) => msItem(id)) })
      if (path === '/me/drive/root' && method === 'GET') return json({ id: 'ms-root', name: 'root', folder: {}, webUrl: 'https://onedrive.live.com/' })
      if (path === '/me/drive/root/children' && method === 'GET') return kids('root')
      const oneItem = path.match(/^\/me\/drive\/items\/([^/]+)(\/children)?$/)
      if (oneItem && method === 'GET' && this.microsoft.items.has(decodeURIComponent(oneItem[1]))) {
        return oneItem[2] ? kids(decodeURIComponent(oneItem[1])) : json(msItem(decodeURIComponent(oneItem[1])))
      }
      if (oneItem && method === 'GET' && !this.microsoft.blobs.has(oneItem[1])) return json({ error: { code: 'itemNotFound', message: 'The resource could not be found.' } }, 404)
      if (path === '/me/drive/root:/Business%20Agent' || path === '/me/drive/root:/Business Agent') {
        return this.microsoft.folderId ? json({ id: this.microsoft.folderId, name: 'Business Agent', folder: {} }) : json({ error: { code: 'itemNotFound', message: 'The resource could not be found.' } }, 404)
      }
      if (path === '/me/drive/root/children' && method === 'POST') {
        this.microsoft.folderId = `ms-folder-${this.nextId++}`
        return json({ id: this.microsoft.folderId, name: 'Business Agent', folder: {} }, 201)
      }
      if (path.startsWith('/me/drive/root:/Business%20Agent/') && method === 'GET' && !path.includes(':/', '/me/drive/root:/'.length)) {
        const at = decodeURIComponent(path.slice('/me/drive/root:/'.length))
        const id = [...this.microsoft.paths].find(([, p]) => p === at)?.[0]
        return id ? json({ id, name: at.split('/').pop(), folder: {}, webUrl: `https://onedrive.live.com/?id=${id}` }) : json({ error: { code: 'itemNotFound', message: 'The resource could not be found.' } }, 404)
      }
      // A folder's children by path (the Tax page's folder list): the folders made inside it.
      if (path.startsWith('/me/drive/root:/') && path.endsWith(':/children') && method === 'GET') {
        const at = decodeURIComponent(path.slice('/me/drive/root:/'.length, -':/children'.length))
        const value = [...this.microsoft.paths.values()].filter(p => p.startsWith(`${at}/`) && !p.slice(at.length + 1).includes('/'))
          .map(p => ({ name: p.split('/').pop(), folder: {} }))
        return json({ value })
      }
      const children = path.match(/^\/me\/drive\/items\/([^/]+)\/children$/)
      if (children && method === 'POST') {
        const parent = children[1] === this.microsoft.folderId ? 'Business Agent' : this.microsoft.paths.get(children[1])!
        const id = `ms-folder-${this.nextId++}`
        this.microsoft.paths.set(id, `${parent}/${(body() as { name: string }).name}`)
        return json({ id, folder: {} }, 201)
      }
      if (path.startsWith('/me/drive/root:/') && path.endsWith(':/createUploadSession') && method === 'POST') {
        const at = decodeURIComponent(path.slice('/me/drive/root:/'.length, -':/createUploadSession'.length))
        const id = `up-${this.nextId++}`
        this.microsoft.sessions.set(id, { path: at, got: [], size: 0 })
        return json({ uploadUrl: `https://upload.onedrive.test/${id}` })
      }
      const content = path.match(/^\/me\/drive\/items\/([^/]+)\/content$/)
      if (content) {
        if (new Headers(init.headers).get('authorization') === null) return json({ error: { code: 'unauthenticated' } }, 401)
        const pdf = url.searchParams.get('format') === 'pdf' ? '?format=pdf' : ''
        return this.microsoft.blobs.has(content[1]) || this.microsoft.items.get(content[1])?.bytes
          ? new Response(null, { status: 302, headers: { location: `https://download.onedrive.test/${content[1]}${pdf}` } })
          : json({ error: { code: 'itemNotFound', message: 'The resource could not be found.' } }, 404)
      }
      if (path.startsWith('/me/drive/root:/') && path.endsWith(':/content') && method === 'PUT') {
        this.microsoft.files.push(decodeURIComponent(path.slice('/me/drive/root:/'.length, -':/content'.length)))
        return json({ id: `item-${this.nextId++}`, webUrl: `https://onedrive.live.com/?id=${this.nextId}` }, 201)
      }
    }

    if (url.host === 'upload.onedrive.test') {
      // The upload address carries its own permission; a sign-in header is refused.
      if (new Headers(init.headers).get('authorization')) return json({ error: { code: 'invalidRequest', message: 'Authorization header not allowed' } }, 401)
      const sess = this.microsoft.sessions.get(url.pathname.slice(1))!
      const range = new Headers(init.headers).get('content-range')!.match(/bytes (\d+)-(\d+)\/(\d+)/)!
      sess.got.push(bytesOf(init.body))
      sess.size = Number(range[3])
      if (Number(range[2]) + 1 < sess.size) return json({ nextExpectedRanges: [`${Number(range[2]) + 1}-`] }, 202)
      const id = `item-${this.nextId++}`
      const all = new Uint8Array(sess.got.reduce((n, b) => n + b.length, 0))
      let at = 0
      for (const b of sess.got) { all.set(b, at); at += b.length }
      this.microsoft.blobs.set(id, { path: sess.path, bytes: all })
      return json({ id, name: sess.path.split('/').pop(), webUrl: `https://onedrive.live.com/?id=${id}` }, 201)
    }
    if (url.host === 'download.onedrive.test') {
      if (new Headers(init.headers).get('authorization')) return json({ error: 'pre-authenticated: no sign-in header' }, 401)
      const own = this.microsoft.items.get(url.pathname.slice(1))
      if (own?.bytes) {
        return url.searchParams.get('format') === 'pdf'
          ? bytesResponse(new TextEncoder().encode(`%PDF-1.7 converted ${own.name}`), 'application/pdf', null)
          : bytesResponse(own.bytes, own.type ?? 'application/octet-stream', new Headers(init.headers).get('range'))
      }
      const f = this.microsoft.blobs.get(url.pathname.slice(1))
      return f ? bytesResponse(f.bytes, 'application/octet-stream', new Headers(init.headers).get('range')) : new Response('Not found', { status: 404 })
    }

    // ---- Spotify ----
    if (url.href === 'https://accounts.spotify.com/api/token') {
      const f = form()
      if (f.get('grant_type') === 'refresh_token' && this.spotify.revoked) return json({ error: 'invalid_grant', error_description: 'Refresh token revoked' }, 400)
      return json({ access_token: `sp-access-${this.nextId++}`, token_type: 'Bearer', expires_in: 3600, ...(f.get('grant_type') === 'authorization_code' ? { refresh_token: 'sp-refresh' } : {}) })
    }
    if (url.host === 'api.spotify.com') {
      if (url.pathname === '/v1/me') return json({ id: 'easybeans', display_name: 'Easy Beans', product: this.spotify.premium ? 'premium' : 'free' })
      if (url.pathname === '/v1/me/playlists') return json({ items: [{ id: 'sp1', name: 'Café mornings', tracks: { total: 30 }, images: [], external_urls: { spotify: 'https://open.spotify.com/playlist/sp1' }, owner: { display_name: 'Easy Beans' } }] })
      if (url.pathname === '/v1/me/player') return new Response(null, { status: 204 })
    }

    // ---- Facebook Pages (Meta Graph) ----
    if (url.host === 'graph.facebook.com' && /\/oauth\/access_token$/.test(url.pathname)) {
      if (url.searchParams.get('grant_type') === 'fb_exchange_token') return json({ access_token: 'fb-user-long', token_type: 'bearer', expires_in: 5_184_000 })
      return json({ access_token: 'fb-user-short', token_type: 'bearer', expires_in: 3600 })
    }
    if (url.host === 'graph.facebook.com' && /\/me\/permissions$/.test(url.pathname)) return json({ data: this.facebook.granted.map(permission => ({ permission, status: 'granted' })) })
    if (url.host === 'graph.facebook.com' && /\/me\/accounts$/.test(url.pathname)) return json({ data: this.facebook.pages })
    // Meta Ads (Marketing API), with the person's own sign-in.
    const campaignId = url.pathname.match(/\/v[\d.]+\/(\d+)$/)?.[1]
    const adsCall = url.host === 'graph.facebook.com' && (url.pathname.match(/\/v[\d.]+\/(?:me\/(adaccounts)|(act_\d+)\/(campaigns|insights))$/)
      ?? (method === 'POST' && this.metaAds.campaigns.some(c => c.id === campaignId) ? [url.pathname, undefined, undefined, undefined, campaignId] : null))
    if (adsCall) {
      const m = this.metaAds
      if (m.unapproved) return json({ error: { message: '(#200) Requires ads_read permission to manage the object', type: 'OAuthException', code: 200 } }, 403)
      if (adsCall[1]) return json({ data: m.accounts })
      if (adsCall[3] === 'campaigns') return json({ data: m.campaigns })
      if (adsCall[3] === 'insights') {
        const range = JSON.parse(url.searchParams.get('time_range') ?? '{}') as { since: string; until: string }
        return json({ data: m.insights.filter(i => String(i.date_start) >= range.since && String(i.date_start) <= range.until) })
      }
      const f = form()
      const change = { id: adsCall[4]!, ...(f.get('status') ? { status: f.get('status')! } : {}), ...(f.get('daily_budget') ? { daily_budget: f.get('daily_budget')! } : {}) }
      m.updates.push(change)
      const c = m.campaigns.find(x => x.id === adsCall[4])
      if (c) Object.assign(c, change.status ? { status: change.status, effective_status: change.status } : {}, change.daily_budget ? { daily_budget: change.daily_budget } : {})
      return json({ success: true })
    }
    // Messenger: the Page's chats and replies (pages_messaging), with the Page token.
    const messenger = url.host === 'graph.facebook.com' && url.pathname.match(/\/v[\d.]+\/(?:(page-[\w-]+)\/(conversations|messages)|(t_[\w-]+))$/)
    if (messenger) {
      const token = new Headers(init.headers).get('authorization')?.replace('Bearer ', '')
      if (this.facebook.revoked || !this.facebook.pages.some(p => p.access_token === token)) return json({ error: { message: 'Error validating access token: The session has been invalidated.', code: 190 } }, 400)
      if (!this.facebook.granted.includes('pages_messaging')) return json({ error: { message: '(#10) This endpoint requires the pages_messaging permission to manage the object', code: 10 } }, 403)
      const raw = (c: FakeProviders['facebook']['chats'][number], n: number) => ({
        id: c.id, updated_time: c.updated_time,
        participants: { data: [{ id: c.with.id, name: c.with.name }, { id: 'page-1', name: 'Easy Beans Coffee' }] },
        messages: { data: c.messages.slice(0, n).map(m => ({ id: m.id, created_time: m.created_time, message: m.message, from: m.fromPage ? { id: 'page-1', name: 'Easy Beans Coffee' } : c.with })) },
      })
      if (messenger[2] === 'conversations') return json({ data: url.searchParams.get('platform') === 'messenger' ? this.facebook.chats.map(c => raw(c, 5)) : [] })
      if (messenger[2] === 'messages' && method === 'POST') {
        const b = body() as { recipient: { id: string }; messaging_type: string; tag?: string; message: { text: string } }
        this.facebook.replies.push({ to: b.recipient.id, text: b.message.text, messaging_type: b.messaging_type, ...(b.tag ? { tag: b.tag } : {}) })
        return json({ recipient_id: b.recipient.id, message_id: `m_${this.nextId++}` })
      }
      const chat = this.facebook.chats.find(c => c.id === messenger[3])
      return chat ? json(raw(chat, 20)) : json({ error: { message: 'Unsupported get request', code: 100 } }, 400)
    }
    const pageCall = url.host === 'graph.facebook.com' && url.pathname.match(/\/v[\d.]+\/(page-[\w-]+)(\/photos|\/feed)?$/)
    if (pageCall) {
      const token = new Headers(init.headers).get('authorization')?.replace('Bearer ', '')
      const page = this.facebook.pages.find(p => p.id === pageCall[1])
      if (this.facebook.revoked || !page || token !== page.access_token) return json({ error: { message: 'Error validating access token: The session has been invalidated.', code: 190 } }, 400)
      if (!pageCall[2]) return json({ id: page.id, name: page.name, followers_count: 812 })
      const f = form()
      this.facebook.posts.push({ page: page.id, kind: pageCall[2] === '/photos' ? 'photos' : 'feed', caption: f.get('caption') ?? f.get('message') ?? undefined, url: f.get('url') ?? undefined })
      return json({ id: `${this.nextId++}`, post_id: `${page.id}_${this.nextId++}` })
    }

    // ---- TikTok ----
    if (url.href === 'https://open.tiktokapis.com/v2/oauth/token/') {
      const f = form()
      if (f.get('grant_type') === 'refresh_token' && (this.tiktok.revoked || f.get('refresh_token') !== `tt-refresh-${this.tiktok.refreshes}`)) {
        return json({ error: 'invalid_grant', error_description: 'Refresh token is invalid or expired.' }, 400)
      }
      if (f.get('grant_type') === 'refresh_token') this.tiktok.refreshes++
      return json({ access_token: `tt-access-${this.nextId++}`, refresh_token: `tt-refresh-${this.tiktok.refreshes}`, expires_in: 86_400, open_id: 'open-1', scope: this.tiktok.scope, token_type: 'Bearer' })
    }
    if (url.host === 'open.tiktokapis.com') {
      if (this.tiktok.revoked) return json({ data: {}, error: { code: 'access_token_invalid', message: 'The access token is invalid or not found in the request.' } }, 401)
      if (url.pathname === '/v2/user/info/') return json({ data: { user: { open_id: 'open-1', display_name: 'Easy Beans' } }, error: { code: 'ok', message: '' } })
      if (url.pathname === '/v2/post/publish/creator_info/query/') {
        return json({ data: { creator_username: 'easybeanscoffee', creator_nickname: 'Easy Beans', privacy_level_options: this.tiktok.privacy }, error: { code: 'ok', message: '' } })
      }
      if (url.pathname === '/v2/post/publish/content/init/') {
        const b = body() as { post_info: { description: string; privacy_level: string }; source_info: { photo_images: string[] } }
        this.tiktok.posts.push({ caption: b.post_info.description, image: b.source_info.photo_images[0], privacy: b.post_info.privacy_level })
        return json({ data: { publish_id: 'p_pub_1' }, error: { code: 'ok', message: '' } })
      }
      if (url.pathname === '/v2/post/publish/status/fetch/') {
        if (!this.tiktok.failPost) return new Response(JSON.stringify({ data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['POST_ID'] }, error: { code: 'ok', message: '' } }).replace('"POST_ID"', '7400000000000000001'), { headers: { 'content-type': 'application/json' } })
        return json({ data: this.tiktok.failPost ? { status: 'FAILED', fail_reason: this.tiktok.failPost } : { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['POST_ID'] }, error: { code: 'ok', message: '' } })
      }
    }

    // ---- Square ----
    if (url.href === 'https://connect.squareup.com/oauth2/token') {
      const b = body() as { grant_type: string; refresh_token?: string }
      if (b.grant_type === 'refresh_token' && (this.square.revoked || b.refresh_token !== 'sq-refresh')) return json({ message: 'Invalid refresh token', type: 'service.not_authorized' }, 401)
      if (b.grant_type === 'refresh_token') this.square.refreshes++
      return json({ access_token: `sq-access-${this.nextId++}`, token_type: 'bearer', expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), merchant_id: 'M1', refresh_token: 'sq-refresh' })
    }
    if (url.host === 'connect.squareup.com') {
      if (this.square.revoked) return json({ errors: [{ category: 'AUTHENTICATION_ERROR', code: 'ACCESS_TOKEN_REVOKED', detail: 'The access token has been revoked.' }] }, 401)
      if (url.pathname === '/v2/merchants/me') return json({ merchant: { id: 'M1', business_name: 'Easy Beans Coffee', country: 'ES', currency: 'EUR' } })
      if (url.pathname === '/v2/locations') return json({ locations: this.square.locations })
      if (url.pathname === '/v2/payments') {
        const from = url.searchParams.get('begin_time')!, to = url.searchParams.get('end_time')!
        return json({ payments: this.square.payments.filter(p => p.created_at >= from && p.created_at < to) })
      }
      if (url.pathname === '/v2/customers/search' && method === 'POST') {
        if (!this.square.customersScope) return json({ errors: [{ category: 'AUTHENTICATION_ERROR', code: 'INSUFFICIENT_SCOPES', detail: 'The merchant has not granted CUSTOMERS_READ' }] }, 403)
        const since = (body() as { query?: { filter?: { updated_at?: { start_at?: string } } } }).query?.filter?.updated_at?.start_at ?? ''
        return json({ customers: this.square.customers.filter(c => c.updated_at >= since) })
      }
      if (url.pathname.startsWith('/v2/loyalty/') || url.pathname.startsWith('/v2/gift-cards')) {
        const sq = this.square
        if (!sq.loyaltyScope) return json({ errors: [{ category: 'AUTHENTICATION_ERROR', code: 'INSUFFICIENT_SCOPES', detail: 'The merchant has not granted LOYALTY_READ' }] }, 403)
        if (url.pathname === '/v2/loyalty/programs/main') {
          return sq.program ? json({ program: sq.program }) : json({ errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'NOT_FOUND', detail: 'Merchant does not have a loyalty program' }] }, 404)
        }
        if (url.pathname === '/v2/loyalty/accounts/search') return json({ loyalty_accounts: sq.loyaltyAccounts })
        if (url.pathname === '/v2/loyalty/events/search') {
          const range = (body() as { query: { filter: { date_time_filter: { created_at: { start_at: string; end_at: string } } } } }).query.filter.date_time_filter.created_at
          return json({ events: sq.loyaltyEvents.filter(e => e.created_at >= range.start_at && e.created_at < range.end_at) })
        }
        const adjust = url.pathname.match(/^\/v2\/loyalty\/accounts\/([^/]+)\/adjust$/)
        if (adjust && method === 'POST') {
          const b = body() as { idempotency_key: string; adjust_points: { points: number; reason: string } }
          const account = sq.loyaltyAccounts.find(a => a.id === adjust[1])
          if (!account) return json({ errors: [{ code: 'NOT_FOUND', detail: 'Loyalty account not found' }] }, 404)
          if (!sq.adjustments.has(b.idempotency_key)) {
            sq.adjustments.set(b.idempotency_key, { account: account.id, points: b.adjust_points.points, reason: b.adjust_points.reason })
            account.balance += b.adjust_points.points
          }
          return json({ event: { id: `E-${b.idempotency_key}`, type: 'ADJUST_POINTS' } })
        }
        if (url.pathname === '/v2/gift-cards' && method === 'GET') return json({ gift_cards: sq.giftCards })
        if (url.pathname === '/v2/gift-cards' && method === 'POST') {
          const b = body() as { idempotency_key: string; location_id: string; gift_card: { type: string } }
          sq.giftKeys.push(b.idempotency_key)
          const card = { id: `GC-${this.nextId++}`, type: b.gift_card.type, state: 'PENDING', gan: `77833200${String(this.nextId).padStart(8, '0')}`,
            balance_money: { amount: 0, currency: 'EUR' }, created_at: '2026-09-30T07:00:00Z' }
          sq.giftCards.push(card)
          return json({ gift_card: card })
        }
        if (url.pathname === '/v2/gift-cards/activities' && method === 'GET') {
          const from = url.searchParams.get('begin_time')!, to = url.searchParams.get('end_time')!
          return json({ gift_card_activities: sq.giftActivities.filter(a => a.created_at >= from && a.created_at < to) })
        }
        if (url.pathname === '/v2/gift-cards/activities' && method === 'POST') {
          const b = body() as { idempotency_key: string; gift_card_activity: { type: string; gift_card_id: string; location_id: string; activate_activity_details: { amount_money: { amount: number; currency: string } } } }
          sq.giftKeys.push(b.idempotency_key)
          const card = sq.giftCards.find(g => g.id === b.gift_card_activity.gift_card_id)!
          card.state = 'ACTIVE'
          card.balance_money = b.gift_card_activity.activate_activity_details.amount_money
          sq.giftActivities.push({ id: `GA-${this.nextId++}`, type: 'ACTIVATE', created_at: '2026-09-30T07:00:00Z', gift_card_gan: card.gan,
            activate_activity_details: b.gift_card_activity.activate_activity_details, location_id: b.gift_card_activity.location_id })
          return json({ gift_card_activity: { id: 'GA-new', type: 'ACTIVATE' } })
        }
        const link = url.pathname.match(/^\/v2\/gift-cards\/([^/]+)\/link-customer$/)
        if (link && method === 'POST') {
          const card = sq.giftCards.find(g => g.id === link[1])!
          card.customer_ids = [(body() as { customer_id: string }).customer_id]
          return json({ gift_card: card })
        }
      }
      if (url.pathname === '/v2/orders/search' && method === 'POST') {
        if (!this.square.ordersScope) return json({ errors: [{ category: 'AUTHENTICATION_ERROR', code: 'INSUFFICIENT_SCOPES', detail: 'The merchant has not granted ORDERS_READ' }] }, 403)
        const q = body() as { query: { filter: { date_time_filter: { closed_at: { start_at: string; end_at: string } } } } }
        const { start_at, end_at } = q.query.filter.date_time_filter.closed_at
        return json({ orders: this.square.orders.filter(o => o.closed_at >= start_at && o.closed_at < end_at) })
      }
    }

    // ---- Stripe (Connect OAuth, then the platform key with Stripe-Account) ----
    if (url.href === 'https://connect.stripe.com/oauth/token') return json({ stripe_user_id: 'acct_1', scope: 'read_only', livemode: false })
    if (url.href === 'https://connect.stripe.com/oauth/deauthorize') {
      const id = new URLSearchParams(String(init.body)).get('stripe_user_id')!
      this.stripe.deauthorized.push(id)
      return json({ stripe_user_id: id })
    }
    if (url.host === 'api.stripe.com') {
      if (new Headers(init.headers).get('Stripe-Account') !== 'acct_1') return json({ error: { message: 'Missing Stripe-Account' } }, 400)
      if (this.stripe.revoked) return json({ error: { type: 'invalid_request_error', message: 'The provided key does not have access to account acct_1 (or that account does not exist).' } }, 403)
      if (url.pathname === '/v1/account') return json({ id: 'acct_1', business_profile: { name: 'Easy Beans Coffee SL' }, default_currency: 'eur', charges_enabled: true })
      if (url.pathname === '/v1/balance_transactions') {
        const gte = Number(url.searchParams.get('created[gte]')), lt = Number(url.searchParams.get('created[lt]'))
        return json({ data: this.stripe.txs.filter(t => t.created >= gte && t.created < lt), has_more: false })
      }
    }

    // ---- SumUp (OAuth, then the merchant's own API) ----
    if (url.href === 'https://api.sumup.com/token') {
      const f = form()
      if (f.get('grant_type') === 'refresh_token' && (this.sumup.revoked || f.get('refresh_token') !== `su-refresh-${this.sumup.refreshes}`)) {
        return json({ error: 'invalid_grant', error_description: 'The refresh token is invalid.' }, 400)
      }
      if (f.get('grant_type') === 'refresh_token') this.sumup.refreshes++
      return json({ access_token: `su-access-${this.nextId++}`, token_type: 'Bearer', expires_in: 3599, refresh_token: `su-refresh-${this.sumup.refreshes}`, scope: 'transactions.history user.profile_readonly' })
    }
    if (url.host === 'api.sumup.com') {
      if (this.sumup.revoked) return json({ error_message: 'invalid access token', error_code: 'NOT_AUTHORIZED' }, 401)
      if (url.pathname === '/v0.1/me') return json({ account: { username: 'cafe@easybeans.es', type: 'normal' }, merchant_profile: this.sumup.merchant })
      if (url.pathname === '/v0.1/me/transactions/history') {
        const p = url.searchParams
        const limit = Number(p.get('limit') ?? 10)
        const statuses = p.getAll('statuses[]'), types = p.getAll('types[]')
        let items = this.sumup.txs.filter(t => (!statuses.length || statuses.includes(String(t.status))) && (!types.length || types.includes(String(t.type)))
          && (!p.get('oldest_time') || String(t.timestamp) >= p.get('oldest_time')!) && (!p.get('newest_time') || String(t.timestamp) <= p.get('newest_time')!))
          .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)) * (p.get('order') === 'descending' ? -1 : 1))
        const after = p.get('oldest_ref')
        if (after) items = items.slice(items.findIndex(t => t.id === after) + 1)
        const page = items.slice(0, Math.min(limit, this.sumup.pageSize))
        this.sumup.pages++
        const next = new URLSearchParams(p)
        if (page.length) next.set('oldest_ref', String(page.at(-1)!.id))
        return json({ items: page, links: items.length > page.length ? [{ rel: 'next', href: next.toString() }] : [] })
      }
    }

    // ---- LinkedIn (OAuth, OpenID userinfo, Posts and Images APIs) ----
    if (url.href === 'https://www.linkedin.com/oauth/v2/accessToken') {
      const f = form()
      if (f.get('grant_type') === 'refresh_token') {
        if (this.linkedin.revoked || f.get('refresh_token') !== 'li-refresh') return json({ error: 'invalid_grant', error_description: 'The provided authorization grant or refresh token is invalid, expired or revoked.' }, 400)
        this.linkedin.refreshes++
      }
      return json({ access_token: `li-access-${this.nextId++}`, expires_in: 5_184_000, scope: this.linkedin.scope, token_type: 'Bearer', id_token: 'jwt',
        ...(this.linkedin.refreshable ? { refresh_token: 'li-refresh', refresh_token_expires_in: 31_536_000 } : {}) })
    }
    if (url.host === 'www.linkedin.com' && url.pathname.startsWith('/dms-uploads/') && method === 'PUT') {
      if (!new Headers(init.headers).get('authorization')) return json({ message: 'Unauthorized' }, 401)
      const up = this.linkedin.uploads.find(u => url.pathname.endsWith(u.image.split(':').pop()!))!
      Object.assign(up, { type: new Headers(init.headers).get('content-type') ?? '', size: bytesOf(init.body).length })
      return new Response(null, { status: 201 })
    }
    if (url.host === 'api.linkedin.com') {
      const h = new Headers(init.headers)
      if (this.linkedin.revoked) return json({ status: 401, serviceErrorCode: 65601, code: 'REVOKED_ACCESS_TOKEN', message: 'The token used in the request has been revoked by the user' }, 401)
      if (url.pathname === '/v2/userinfo') return json(this.linkedin.member)
      if (!/^\d{6}$/.test(h.get('LinkedIn-Version') ?? '')) return json({ status: 426, code: 'NONEXISTENT_VERSION', message: 'Requested version is not active' }, 426)
      const orgScopes = this.linkedin.scope.includes('r_organization_admin')
      if (url.pathname === '/rest/organizationAcls') {
        if (!orgScopes) return json({ status: 403, code: 'ACCESS_DENIED', message: 'Not enough permissions to access: organizationAcls.FINDER-roleAssignee' }, 403)
        return json({ elements: this.linkedin.orgs.map(o => ({ organization: `urn:li:organization:${o.id}`, role: 'ADMINISTRATOR', state: 'APPROVED', roleAssignee: `urn:li:person:${this.linkedin.member.sub}` })) })
      }
      const org = url.pathname.match(/^\/rest\/organizations\/(\d+)$/)
      if (org) {
        const o = this.linkedin.orgs.find(x => String(x.id) === org[1])
        return o ? json(o) : json({ status: 404, code: 'NOT_FOUND', message: 'Not found' }, 404)
      }
      if (url.pathname === '/rest/images' && url.searchParams.get('action') === 'initializeUpload' && method === 'POST') {
        const id = `IMG${this.nextId++}`
        this.linkedin.uploads.push({ owner: String((body().initializeUploadRequest as Json).owner), type: '', size: 0, image: `urn:li:image:${id}` })
        return json({ value: { uploadUrlExpiresAt: Date.now() + 3_600_000, uploadUrl: `https://www.linkedin.com/dms-uploads/${id}`, image: `urn:li:image:${id}` } })
      }
      if (url.pathname === '/rest/posts' && method === 'POST') {
        const b = body()
        if (String(b.author).startsWith('urn:li:organization:') && !this.linkedin.scope.includes('w_organization_social')) {
          return json({ status: 403, code: 'ACCESS_DENIED', message: 'Not enough permissions to access: partnerApiPostsExternal.CREATE' }, 403)
        }
        this.linkedin.posts.push(b)
        return new Response(null, { status: 201, headers: { 'x-restli-id': `urn:li:share:70000000000000000${this.linkedin.posts.length}` } })
      }
    }

    // A photo for a post, at a public address (the networks that take uploads read it first).
    if (url.host === 'cdn.test') return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]), { headers: { 'content-type': 'image/jpeg' } })

    if (url.host === 'lookaside.fbsbx.com') {
      const m = this.whatsapp.media.get(url.searchParams.get('mid') ?? '')
      if (!m || new Headers(init?.headers).get('authorization') !== 'Bearer meta-token') return new Response('Not found', { status: 404 })
      return new Response(m.bytes, { headers: { 'content-type': m.type } })
    }
    // ---- WhatsApp (Meta Graph) ----
    if (url.host === 'graph.facebook.com') {
      if (this.whatsapp.broken) return json({ error: { message: 'Error validating access token: Session has expired.', code: 190 } }, 401)
      if (url.pathname.endsWith('/messages')) {
        const m = body() as { to: string; type: string; text?: { body: string }; template?: { name: string; language: { code: string } } }
        if (m.type === 'text') this.whatsapp.texts.push({ to: m.to, text: m.text!.body })
        else this.whatsapp.sent.push({ to: m.to, template: m.template!.name, language: m.template!.language.code })
        return json({ messaging_product: 'whatsapp', messages: [{ id: `wamid.${this.nextId++}` }] })
      }
      // A photo or voice note: its details, then a short-lived address that needs the token.
      const mediaId = url.pathname.match(/\/v[\d.]+\/(media-[\w-]+)$/)?.[1]
      if (mediaId) {
        const m = this.whatsapp.media.get(mediaId)
        if (!m) return json({ error: { message: 'Media not found', code: 100 } }, 404)
        return json({ url: `https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=${mediaId}`, mime_type: m.type, file_size: m.bytes.length, id: mediaId })
      }
      return json({ display_phone_number: '+34 600 000 000', verified_name: 'Easy Beans', id: '555' })
    }
    return null
  }
}
