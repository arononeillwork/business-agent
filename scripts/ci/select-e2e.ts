// Which browser tests (e2e/demo.spec.ts) a change needs, from the files it touches.
//   npx tsx scripts/ci/select-e2e.ts <base-sha> [head-sha]   → prints a --grep pattern, or "all"
// Always included: the core tests (sign-in, the landing page, permissions, privacy, the café
// tablet PIN, partners), whatever changed. A file that isn't mapped below, or one every page uses
// (the app shell, data layer, theme, config), means the whole suite. Deploys always run everything.
import { execFileSync } from 'node:child_process'

/** Test titles that always run: sign-in and who-can-see-what. */
export const CORE = String.raw`sign-in|sign in|signed out|landing page|guest link|emailed code|temporary password|permissions|guard rails|employees|staff|partner|gestoría|kiosk|PIN|can't|can’t|cannot|don’t|do not|never|privacy|terms of service`

/** Changes here can affect any page: run everything. */
const EVERYTHING = [
  /^src\/(App|main)\.tsx$/, /^src\/app\/(AppShell|AppContext|hooks|query|Notify|features|QuickActions)\.tsx?$/,
  /^src\/theme\.ts$/, /^src\/components\/(common|legal|Logo|dnd)\.tsx?$/, /^src\/data\//, /^src\/assets\//,
  /^shared\/(types|time|business\.config|numberFormat|fonts)\.ts$/, /^index\.html$/, /^public\//,
  /^package(-lock)?\.json$/, /^playwright\.config\.ts$/, /^vite(\.demo)?\.config\.ts$/, /^tsconfig/, /^e2e\//,
  /^scripts\/ci\//, /^\.github\/workflows\/ci\.yml$/,
]

/** Nothing the demo browser tests run (the Worker, database, docs, ops): the core tests are enough. */
const NO_UI = [/^worker\//, /^supabase\//, /^docs\//, /^video\//, /^\.claude\//, /^scripts\/(ops|test-db)/, /^README\.md$/, /^ops\//, /^\.github\//, /^wrangler\.jsonc$/,
  /\.test\.ts$/, /^shared\/(rules|reach|registro|taxId|ics|crests|alertText|connections|legal)\.ts$/]

/** Areas of the app: the files that make them, and the test titles that cover them. */
export const AREAS: { name: string; files: RegExp[]; tests: string }[] = [
  { name: 'rota', files: [/RotaPage/], tests: String.raw`rota|shift` },
  { name: 'hours', files: [/(Timecards|Kiosk|Today|Registro)Page/, /ClockRules/, /CafeSpeaker/], tests: String.raw`clock|timecard|registro|correction|hours|Today` },
  { name: 'calendar', files: [/CalendarPage/, /CalendarFeed/], tests: String.raw`calendar|event` },
  { name: 'notifications', files: [/NotificationsPage/, /Notification(Bell|Settings)/, /shared\/notify/, /app\/push/], tests: String.raw`notification|holiday|mention` },
  { name: 'time off', files: [/TimeOffPage/], tests: String.raw`time off|holiday` },
  { name: 'staff benefits', files: [/BenefitsPage/, /shared\/benefits/], tests: String.raw`staff benefits|allocation` },
  { name: 'staff kitty', files: [/KittyPage/, /KittyJar/, /shared\/kitty/, /monthProfit/], tests: String.raw`staff kitty` },
  { name: 'sales reps', files: [/(SalesReps|RepCards)Page/, /shared\/reps/], tests: String.raw`sales reps` },
  { name: 'outsourcing', files: [/OutsourcingPage/, /shared\/outsourcing/], tests: String.raw`outsourcing|menu|pages can be dragged` },
  { name: 'roles and rules', files: [/(Roles|StaffRules)Page/, /components\/Expandable/, /shared\/(roles|staffRules)/], tests: String.raw`roles and rules|menu|pages can be dragged` },
  { name: 'role permissions', files: [/shared\/roleTemplates/, /RolesPage/], tests: String.raw`role permissions|roles and rules` },
  { name: 'business', files: [/(Business|Brand|OpeningHours)Page/, /shared\/(taxId|brand)/, /lib\/googleFont/], tests: String.raw`business|brand|opening hours|currency|colour|logo` },
  { name: 'team', files: [/TeamPage/, /TempPassword/, /ContactMethod/, /ShareDialog/, /shared\/teamRoles/], tests: String.raw`team|invite|contact|account` },
  { name: 'people and pets', files: [/PeoplePage/, /components\/Pets/, /shared\/(people|pets)/], tests: String.raw`people|pets` },
  { name: 'connections', files: [/(Connections|SocialPlanner)Page/, /components\/(Connect|AiImages)/, /shared\/connections/],
    tests: String.raw`connect|Square|Stripe|TikTok|Instagram|Google|WhatsApp|Spotify|YouTube|social|post` },
  { name: 'music', files: [/MusicPage/, /MusicCard/, /CafeSpeaker/], tests: String.raw`music|playlist|song` },
  { name: 'sports', files: [/SportsPage/, /shared\/(sports|crests)/], tests: String.raw`sports|teams|big nights|Favourites` },
  { name: 'finances', files: [/FinancesPage/], tests: String.raw`finances|takings|expenses` },
  { name: 'tax', files: [/TaxPage/, /shared\/tax/], tests: String.raw`tax|upload` },
  { name: 'pages', files: [/PagesPage/], tests: String.raw`pages|hide` },
  { name: 'licences', files: [/LicencesPage/, /shared\/licences/, /pages\/LegalPage/], tests: String.raw`licences|renew` },
  { name: 'competitions', files: [/CompetitionsPage/, /shared\/competitions/], tests: String.raw`competition|giveaway|draw` },
  { name: 'documents', files: [/DocumentsPage/, /shared\/documents/], tests: String.raw`documents|browse storage` },
  { name: 'legal', files: [/LegalDocumentsPage/, /pages\/LegalPage/, /shared\/legalDocs/, /lib\/googlePicker/], tests: String.raw`legal documents|gestoría reads them` },
  { name: 'invoices', files: [/InvoicesPage/, /shared\/invoices/], tests: String.raw`invoices|from email` },
  { name: 'grants', files: [/GrantsPage/, /shared\/grant/], tests: String.raw`grants|applications` },
  { name: 'credit and debit', files: [/CreditDebitPage/, /shared\/creditDebit/, /GrantsPage/], tests: String.raw`credit and debit` },
  { name: 'sales', files: [/SalesPage/, /components\/charts/], tests: String.raw`Sales page|best sellers` },
  { name: 'profit and loss', files: [/ProfitLossPage/, /shared\/pnl/], tests: String.raw`profit and loss|P&L` },
  { name: 'alerts', files: [/AlertsPage/, /NotificationBell/], tests: String.raw`alert|notification|bell` },
  { name: 'to do', files: [/TodoPage/, /TodoBoard/, /shared\/todo/], tests: String.raw`To Do|job|categor` },
  { name: 'customers', files: [/CustomersPage/, /shared\/customers/], tests: String.raw`customers|leads` },
  { name: 'loyalty', files: [/LoyaltyPage/, /shared\/loyalty/, /app\/connected/], tests: String.raw`loyalty|stamp|gift card` },
  { name: 'stock', files: [/(Stock|Suppliers|Wholesale)Page/, /shared\/stock/], tests: String.raw`stock|supplier|order list|wholesale|price list` },
  { name: 'recipes', files: [/(Recipes|Waste)Page/, /shared\/recipes/], tests: String.raw`recipe|margin|waste` },
  { name: 'menu and screens', files: [/(Menu|MenuPrint|Screens|Display)Page/, /pages\/menu\//, /components\/(MenuBoard|ScreenPlayer|AiImages)/, /lib\/googleFont/,
    /shared\/(menu|screens)/], tests: String.raw`menu|screen|Higgsfield` },
  { name: 'google maps menu', files: [/MenuPage/], tests: String.raw`Google Maps` },
  { name: 'ads', files: [/AdsPage/, /shared\/ads/], tests: String.raw`ads|campaign|UTM` },
  { name: 'reviews', files: [/(Reviews|Website)Page/, /shared\/(seo|reviews)/], tests: String.raw`review|SEO|website` },
  { name: 'competitors', files: [/CompetitorsPage/, /competitorDialogs/, /shared\/localCompetitors/, /components\/charts/], tests: String.raw`competitors` },
  { name: 'set-up', files: [/Setup(Page|Prompt)/, /setupPresets/], tests: String.raw`set-up|wizard` },
  { name: 'sign-up', files: [/NewBusinessPage/, /app\/referral/], tests: String.raw`self-serve|signs up|referral|set-up` },
  { name: 'appearance', files: [/AppearancePage/, /app\/Appearance/], tests: String.raw`theme|text size|decimal|tint|appearance` },
  { name: 'account', files: [/AccountPage/, /StatusPages/], tests: String.raw`My account|account|registered` },
  { name: 'ai-assistants', files: [/AiAssistantsPage/, /i18n\/es\/aiAssistants/], tests: String.raw`AI assistants` },
  { name: 'messages', files: [/MessagesPage/, /shared\/messages/], tests: String.raw`messages|DMs|chat` },
  { name: 'referrals', files: [/ReferralsPage/, /shared\/referrals/], tests: String.raw`referral|account menu` },
  { name: 'plans', files: [/(Billing|Pricing|Login)Page/, /pages\/marketing\//, /shared\/plans/, /app\/plan/],
    tests: String.raw`pricing|billing|plan|landing|one-tap|founding` },
  { name: 'partners', files: [/PartnersPage/], tests: String.raw`partner` },
  { name: 'leads', files: [/LeadsPage/, /shared\/leads/], tests: String.raw`leads and enquiries|enquir` },
  { name: 'expenses', files: [/ExpensesPage/, /shared\/claims/], tests: String.raw`expenses and mileage|trip` },
  { name: 'campaigns', files: [/CampaignsPage/, /shared\/campaigns/], tests: String.raw`campaigns|marketing` },
  { name: 'suggested campaigns', files: [/shared\/campaignIdeas/], tests: String.raw`campaigns` },
  { name: 'hiring', files: [/HiringPage/, /HiringBoard/, /shared\/hiring/], tests: String.raw`hiring|applicant` },
  { name: 'cv pool', files: [/components\/CvPool/, /i18n\/es\/hiring/], tests: String.raw`hiring|applicant|CV pool` },
  { name: 'food safety and allergens', files: [/(FoodSafety|Allergens)Page/, /shared\/(foodSafety|allergens)/], tests: String.raw`food safety|allergen` },
  { name: 'tips', files: [/TipsPage/, /shared\/tips/], tests: String.raw`tips` },
  { name: 'insights', files: [/(Dashboards|Advisor)Page/, /dashboardWidgets/, /app\/insightsData/, /shared\/(insights|dashboards)/], tests: String.raw`dashboard|advisor|Today` },
  { name: 'brand documents', files: [/shared\/brandDocs/], tests: String.raw`brand` },
  { name: 'usual allergens', files: [/shared\/allergenGuide/], tests: String.raw`allergen` },
  { name: 'cameras', files: [/CamerasPage/, /shared\/cameras/], tests: String.raw`camera` },
  { name: 'offers', files: [/OffersPage/, /OfferBoard/, /lib\/offerPicture/, /shared\/offers/], tests: String.raw`offer|special|screen` },
  { name: 'last-day offers', files: [/LastDayRules/, /shared\/lastDayOffers/, /i18n\/es\/lastDayOffers/, /StockPage/, /WastePage/], tests: String.raw`last-day|offer|stock|waste` },
  { name: 'email', files: [/EmailPage/, /shared\/email/, /i18n\/es\/email/, /EmailReader/], tests: String.raw`email` },
  { name: 'contracts', files: [/TeamContracts/, /shared\/contracts/, /i18n\/es\/contracts/], tests: String.raw`contract` },
  { name: 'agents', files: [/shared\/agents/, /AgentsMenu/, /AgentFocus/, /RolesAgentsTab/, /i18n\/es\/agents/], tests: String.raw`agent` },
  { name: 'role ownership', files: [/RolesOwnershipTab/, /shared\/roleOwners/, /i18n\/es\/roleOwners/], tests: String.raw`ownership` },
  { name: 'theme days and routine', files: [/CoffeesPage/, /components\/(ThemeDays|Routine)\.tsx$/, /shared\/(themeDays|routine)\.ts$/, /i18n\/es\/(themeDays|routine)\.ts$/],
    tests: String.raw`theme|coffee|routine` },
  { name: 'qr codes', files: [/QrCodes(Print)?Page/, /components\/QrCode\.tsx$/, /lib\/qrImage/, /shared\/qrCodes\.ts$/, /i18n\/es\/qrCodes\.ts$/], tests: String.raw`QR code` },
  { name: 'analytics', files: [/pages\/(AnalyticsPage|SocialAnalytics)\.tsx$/, /shared\/socialAnalytics/, /i18n\/es\/(analytics|socialAnalytics)\.ts$/],
    tests: String.raw`Analytics` },
]

/** The --grep pattern for these changed files, or 'all'. */
export function selectTests(files: string[]): string {
  const picked = new Set<string>()
  for (const f of files) {
    if (EVERYTHING.some(r => r.test(f))) return 'all'
    const areas = AREAS.filter(a => a.files.some(r => r.test(f)))
    if (areas.length) { areas.forEach(a => picked.add(a.tests)); continue }
    if (NO_UI.some(r => r.test(f))) continue
    // A file we don't know about: play safe.
    return 'all'
  }
  return [CORE, ...picked].join('|')
}

function changedFiles(base: string, head = 'HEAD'): string[] | null {
  if (!base || /^0+$/.test(base)) return null
  try {
    return execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { encoding: 'utf8' }).split('\n').filter(Boolean)
  } catch {
    return null // base not fetched (force-push, shallow clone): run everything
  }
}

if (process.argv[1]?.endsWith('select-e2e.ts')) {
  const files = changedFiles(process.argv[2] ?? '', process.argv[3])
  console.log(files ? selectTests(files) : 'all')
}
