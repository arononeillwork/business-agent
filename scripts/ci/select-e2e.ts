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
const NO_UI = [/^worker\//, /^supabase\//, /^docs\//, /^scripts\/(ops|test-db)/, /^README\.md$/, /^ops\//, /^\.github\//, /^wrangler\.jsonc$/,
  /\.test\.ts$/, /^shared\/(rules|reach|registro|taxId|ics|crests|alertText|connections|legal)\.ts$/]

/** Areas of the app: the files that make them, and the test titles that cover them. */
export const AREAS: { name: string; files: RegExp[]; tests: string }[] = [
  { name: 'rota', files: [/RotaPage/], tests: String.raw`rota|shift` },
  { name: 'hours', files: [/(Timecards|Kiosk|Today|Registro)Page/, /ClockRules/, /CafeSpeaker/], tests: String.raw`clock|timecard|registro|correction|hours|Today` },
  { name: 'calendar', files: [/CalendarPage/, /CalendarFeed/], tests: String.raw`calendar|event` },
  { name: 'time off', files: [/TimeOffPage/], tests: String.raw`time off|holiday` },
  { name: 'business', files: [/(Business|Brand|OpeningHours)Page/, /shared\/(taxId|brand)/], tests: String.raw`business|brand|opening hours|currency|colour|logo` },
  { name: 'team', files: [/TeamPage/, /TempPassword/, /ContactMethod/, /ShareDialog/], tests: String.raw`team|invite|contact|account` },
  { name: 'connections', files: [/(Connections|SocialPlanner)Page/, /components\/Connect/, /shared\/connections/],
    tests: String.raw`connect|Square|Stripe|TikTok|Instagram|Google|WhatsApp|Spotify|YouTube|social|post` },
  { name: 'music', files: [/MusicPage/, /MusicCard/, /CafeSpeaker/], tests: String.raw`music|playlist|song` },
  { name: 'sports', files: [/SportsPage/, /shared\/(sports|crests)/], tests: String.raw`sports|teams|big nights|Favourites` },
  { name: 'finances', files: [/FinancesPage/], tests: String.raw`finances|takings|expenses` },
  { name: 'sales', files: [/SalesPage/, /components\/charts/], tests: String.raw`Sales page|best sellers` },
  { name: 'alerts', files: [/AlertsPage/, /NotificationBell/], tests: String.raw`alert|notification|bell` },
  { name: 'to do', files: [/TodoPage/, /shared\/todo/], tests: String.raw`To Do|job|categor` },
  { name: 'customers', files: [/CustomersPage/, /shared\/customers/], tests: String.raw`customers|leads` },
  { name: 'ads', files: [/AdsPage/, /shared\/ads/], tests: String.raw`ads|campaign|UTM` },
  { name: 'set-up', files: [/SetupPage/], tests: String.raw`set-up|wizard` },
  { name: 'appearance', files: [/AppearancePage/, /app\/Appearance/], tests: String.raw`theme|text size|decimal|tint|appearance` },
  { name: 'account', files: [/AccountPage/, /StatusPages/], tests: String.raw`My account|account|registered` },
  { name: 'messages', files: [/MessagesPage/, /shared\/messages/], tests: String.raw`messages|DMs|chat` },
  { name: 'referrals', files: [/ReferralsPage/, /shared\/referrals/], tests: String.raw`referral|account menu` },
  { name: 'plans', files: [/(Billing|Pricing|Compare|Login)Page/, /pages\/marketing\//, /shared\/(plans|competitors)/, /app\/plan/],
    tests: String.raw`pricing|compare|billing|plan|landing|one-tap|founding` },
  { name: 'partners', files: [/PartnersPage/], tests: String.raw`partner` },
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
