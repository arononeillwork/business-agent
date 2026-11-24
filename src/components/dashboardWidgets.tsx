// The widgets a dashboard is made of. Each one reads what it shows through the shared cache (the
// same keys the pages use, so a dashboard of ten widgets asks for the takings once) and says plainly
// when there's nothing to show yet, or what to connect.
import { Box, Button, Stack, Typography } from '@mui/material'
import UpIcon from '@mui/icons-material/ArrowUpwardRounded'
import DownIcon from '@mui/icons-material/ArrowDownwardRounded'
import StarIcon from '@mui/icons-material/Star'
import PinIcon from '@mui/icons-material/PushPin'
import DotIcon from '@mui/icons-material/RadioButtonUncheckedRounded'
import { Link as RouterLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { usePayRates } from '../app/dailyCost'
import { useAsync } from '../app/hooks'
import { useAdvice } from '../app/insightsData'
import { AdviceCard } from '../pages/AdvisorPage'
import { BarChart, ShareBars, type BarPoint } from './charts'
import { PersonAvatar } from './common'
import { tillsOf } from './till'
import type { DashRange, WidgetKind } from '../../shared/dashboards'
import { periodEnd, type DashPeriod } from '../../shared/dashboards'
import { mostSold, percentOf, repsBetween, salesPace } from '../../shared/salesDashboard'
import { RECONNECT_TEAM } from '../../shared/squareTeam'
import { change, hourTotals, hoursByPerson, lateStarts, salesTotals, weekdayAverages, between } from '../../shared/insights'
import { analyse } from '../../shared/localCompetitors'
import { costing } from '../../shared/recipes'
import { isLow, stockValue, unitLabel } from '../../shared/stock'
import type { PayMethod, SalesDay } from '../../shared/types'
import { addDays, currencySymbol, formatLocal, formatMoney, formatNumber, localDate, localTime, today, zonedIso } from '../../shared/time'
import { lowestFirst, topJobs } from '../../shared/todayGlance'
import { tokens } from '../theme'
import { msg, t, tn } from '../i18n'
import { claimsOwed, invoicesDue, netTakings, periodPnl, pnlFigures, returnsDue, runningCosts, vatSummary } from '../../shared/accountant'
import { countryProfile } from '../../shared/country'
import { moneyLines, totals as moneyTotals } from '../../shared/creditDebit'
import { isOverdue } from '../../shared/invoices'
import { daysBetween, filingKey, type Filing } from '../../shared/tax'
import { filingsIn, irishModelLabel } from '../../shared/taxIreland'

const METHOD_NAMES: Record<PayMethod, string> = { card: msg('Card'), wallet: 'Apple Pay / Google Pay', cash: msg('Cash'), other: msg('Other') }
const wholeMoney = (n: number) => `${currencySymbol()}${formatNumber(Math.round(n))}`
const iso = (date: string) => zonedIso(date, '00:00')

/** Can the person see the takings (a till connected, and pay access)? */
export function useTakings() {
  const { api, isAdmin, isPartner, canSeePay } = useApp()
  const integ = useAsync('integrations', () => (isAdmin ? api.integrations() : Promise.resolve(null)), [isAdmin])
  const tills = tillsOf(integ.data?.integrations ?? undefined)
  return { till: tills.length > 0, on: tills.length > 0 && canSeePay && !isPartner, ready: !isAdmin || !!integ.data }
}

export function useSales(r: DashRange) {
  const { api } = useApp()
  const { on } = useTakings()
  return useAsync('dash-sales', () => (on ? api.sales(r.prevFrom, r.to) : Promise.resolve(null)), [on, r.prevFrom, r.to])
}
function useTeam(r: DashRange) {
  const { api, isAdmin, isPartner } = useApp()
  const on = isAdmin && !isPartner
  return useAsync('dash-team', async () => {
    if (!on) return null
    const [entries, shifts] = await Promise.all([api.timeEntries(iso(r.from), iso(addDays(r.to, 1))), api.shifts(iso(r.from), iso(addDays(r.to, 1)))])
    return { entries, shifts }
  }, [on, r.from, r.to])
}

/** Every day of a range up to today, with zero where nothing sold. */
function fill(days: SalesDay[], from: string, to: string): SalesDay[] {
  const by = new Map(days.map(d => [d.date, d]))
  const out: SalesDay[] = []
  for (let d = from; d <= to && d <= today(); d = addDays(d, 1)) out.push(by.get(d) ?? { date: d, gross: 0, tips: 0, refunds: 0, payments: 0 })
  return out
}

/** A widget's message when there's nothing to show (and, for admins, where to fix it). */
function Note({ children, to, action }: { children: ReactNode; to?: string; action?: string }) {
  return (
    <Box sx={{ py: 1.5, color: 'text.secondary' }}>
      <Typography variant="body2">{children}</Typography>
      {to && action && <Button size="small" component={RouterLink} to={to} sx={{ mt: 0.5, ml: -1 }}>{action}</Button>}
    </Box>
  )
}

/** One headline figure, with how it moved against the period before. */
function Figure({ value, now, before, note, upIsGood = true }: { value: string; now?: number; before?: number; note?: ReactNode; upIsGood?: boolean }) {
  const c = now !== undefined && before !== undefined ? change(now, before) : null
  const pct = c === null ? null : Math.round(c * 100)
  const good = pct !== null && (pct > 0) === upIsGood
  return (
    <Box>
      <Typography sx={{ fontFamily: '"Poppins", system-ui, sans-serif', fontSize: '1.9rem', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{value}</Typography>
      {pct !== null && pct !== 0 && (
        <Typography variant="body2" component="div" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, color: good ? tokens.goodFg : tokens.badFg, fontWeight: 600 }}>
          {pct > 0 ? <UpIcon sx={{ fontSize: 15 }} /> : <DownIcon sx={{ fontSize: 15 }} />}{t('{pct}% on the period before', { pct: Math.abs(pct) })}
        </Typography>
      )}
      {pct === 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Same as the period before')}</Typography>}
      {note && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{note}</Typography>}
    </Box>
  )
}

/** Takings widgets need a till; say so (with the way to connect one for admins). */
function NeedsTill() {
  const { isAdmin } = useApp()
  const { till } = useTakings()
  return till
    ? <Note>{t('Takings are for admins with pay access.')}</Note>
    : <Note to={isAdmin ? '/connections' : undefined} action={t('Connect a till')}>{t('Connect Square, SumUp or Stripe to see takings here.')}</Note>
}

function SalesFigure({ r, pick }: { r: DashRange; pick: 'gross' | 'payments' | 'average' }) {
  const { on, ready } = useTakings()
  const sales = useSales(r)
  if (!ready || (on && !sales.data && !sales.error)) return <Note>{t('Loading…')}</Note>
  if (!on) return <NeedsTill />
  if (sales.error) return <Note>{sales.error}</Note>
  const now = salesTotals(between(sales.data!.days, r.from, r.to)), before = salesTotals(between(sales.data!.days, r.prevFrom, r.prevTo))
  const v = pick === 'gross' ? now.gross : pick === 'payments' ? now.payments : now.average
  const b = pick === 'gross' ? before.gross : pick === 'payments' ? before.payments : before.average
  return <Figure value={pick === 'payments' ? formatNumber(v) : formatMoney(v)} now={v} before={b}
    note={pick === 'gross' && now.refunds ? t('{money} refunded', { money: formatMoney(now.refunds) }) : undefined} />
}

function TakingsByDay({ r }: { r: DashRange }) {
  const { on } = useTakings()
  const sales = useSales(r)
  if (!on) return <NeedsTill />
  if (!sales.data) return <Note>{sales.error ?? t('Loading…')}</Note>
  const days = fill(sales.data.days, r.from, r.to), prev = fill(sales.data.days, r.prevFrom, r.prevTo)
  // One day: hour by hour instead.
  if (days.length === 1) return <BusiestHours r={r} />
  const points: BarPoint[] = days.map((d, i) => ({ label: formatLocal(`${d.date}T12:00:00Z`, days.length > 8 ? 'd' : 'EEE'), title: formatLocal(`${d.date}T12:00:00Z`, 'EEEE d MMMM'),
    value: d.gross, prev: prev[i]?.gross }))
  return <BarChart points={points} format={formatMoney} axisFormat={wholeMoney} label={t('Takings by day')} current={t('This period')} previous={t('The period before')} />
}

function BusiestHours({ r }: { r: DashRange }) {
  const { on } = useTakings()
  const sales = useSales(r)
  if (!on) return <NeedsTill />
  if (!sales.data) return <Note>{sales.error ?? t('Loading…')}</Note>
  const hours = hourTotals(between(sales.data.days, r.from, r.to))
  const used = hours.map((v, h) => ({ v, h })).filter(x => x.v > 0)
  if (!used.length) return <Note>{t('No takings by the hour for this period.')}</Note>
  const points: BarPoint[] = []
  for (let h = used[0].h; h <= used[used.length - 1].h; h++) points.push({ label: `${h}`, title: `${h}:00–${h + 1}:00`, value: hours[h] })
  return <BarChart points={points} format={formatMoney} axisFormat={wholeMoney} label={t('Busiest hours')} />
}

function WeekdayTakings() {
  const { api } = useApp()
  const { on } = useTakings()
  const day = today()
  // The same eight weeks the Business advisor reads.
  const sales = useAsync('advisor-sales', () => (on ? api.sales(addDays(day, -55), day) : Promise.resolve(null)), [on, day])
  if (!on) return <NeedsTill />
  if (!sales.data) return <Note>{sales.error ?? t('Loading…')}</Note>
  const points: BarPoint[] = weekdayAverages(sales.data.days).map((w, i) => ({ label: formatLocal(`2024-01-0${i + 1}T12:00:00Z`, 'EEE'),
    title: formatLocal(`2024-01-0${i + 1}T12:00:00Z`, 'EEEE'), value: w.average }))
  return <BarChart points={points} format={formatMoney} axisFormat={wholeMoney} label={t('Takings by day of the week')} />
}

function BestSellers({ r }: { r: DashRange }) {
  const { api } = useApp()
  const { on } = useTakings()
  const items = useAsync('dash-items', () => (on ? api.salesItems(r.from, r.to) : Promise.resolve(null)), [on, r.from, r.to])
  if (!on) return <NeedsTill />
  if (!items.data) return <Note>{items.error ?? t('Loading…')}</Note>
  if (!items.data.items) return <Note>{t('Best sellers come from Square: Stripe and SumUp send payments only.')}</Note>
  const top = [...items.data.items].sort((a, b) => b.gross - a.gross).slice(0, 6)
  return top.length ? <ShareBars rows={top.map(i => ({ name: i.name, value: i.gross }))} format={formatMoney} label={t('Best sellers')} /> : <Note>{t('Nothing sold yet.')}</Note>
}

function PaymentMethods({ r }: { r: DashRange }) {
  const { on } = useTakings()
  const sales = useSales(r)
  if (!on) return <NeedsTill />
  if (!sales.data) return <Note>{sales.error ?? t('Loading…')}</Note>
  const sums = new Map<PayMethod, number>()
  for (const d of between(sales.data.days, r.from, r.to)) for (const [k, v] of Object.entries(d.methods ?? {}) as [PayMethod, number][]) sums.set(k, (sums.get(k) ?? 0) + v)
  const rows = [...sums].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: t(METHOD_NAMES[k]), value: v }))
  return rows.length ? <ShareBars rows={rows} format={formatMoney} label={t('How people paid')} /> : <Note>{t('The till didn’t say how people paid.')}</Note>
}

function TeamCost({ r, share }: { r: DashRange; share?: boolean }) {
  const { settings, canSeeFinances } = useApp()
  const rates = usePayRates()
  const team = useTeam(r)
  const { on } = useTakings()
  const sales = useSales(r)
  if (!canSeeFinances) return <Note>{t('Team costs are for admins with pay access.')}</Note>
  if (!team.data) return <Note>{team.error ?? t('Loading…')}</Note>
  const cost = team.data.entries.reduce((s, e) => s + e.paid_minutes / 60 * (rates.get(e.profile_id) ?? 0), 0) * (settings?.employer_cost_multiplier ?? 1)
  const hours = team.data.entries.reduce((s, e) => s + e.paid_minutes / 60, 0)
  if (!share) return <Figure value={formatMoney(cost)} note={t('{hours} hours worked, from the timecards', { hours: formatNumber(Math.round(hours)) })} />
  if (!on) return <NeedsTill />
  if (!sales.data) return <Note>{sales.error ?? t('Loading…')}</Note>
  const takings = salesTotals(between(sales.data.days, r.from, r.to)).gross
  if (!takings) return <Note>{t('No takings in this period yet.')}</Note>
  const pct = Math.round(cost / takings * 100)
  return <Figure value={`${pct}%`} note={<Box component="span" sx={{ color: pct > 35 ? tokens.badFg : pct <= 28 ? tokens.goodFg : 'inherit' }}>
    {t('{cost} of {takings} taken', { cost: formatMoney(cost), takings: formatMoney(takings) })}</Box>} />
}

function HoursWorked({ r }: { r: DashRange }) {
  const { profiles } = useApp()
  const team = useTeam(r)
  if (!team.data) return <Note>{team.error ?? t('Loading…')}</Note>
  const rows = [...hoursByPerson(team.data.entries)].map(([id, h]) => ({ name: profiles.find(p => p.id === id)?.full_name ?? '—', value: h })).sort((a, b) => b.value - a.value)
  return rows.length ? <ShareBars rows={rows} format={h => t('{n} h', { n: formatNumber(h) })} label={t('Hours worked')} /> : <Note>{t('No timecards in this period yet.')}</Note>
}

function OnToday() {
  const { api, profiles, positions } = useApp()
  const day = today()
  const shifts = useAsync('dash-today-shifts', () => api.shifts(iso(day), iso(addDays(day, 1))), [day])
  if (!shifts.data) return <Note>{shifts.error ?? t('Loading…')}</Note>
  const on = shifts.data.filter(s => s.status === 'published' && s.profile_id && localDate(s.starts_at) === day && profiles.some(p => p.id === s.profile_id))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  if (!on.length) return <Note to="/rota" action={t('Open the rota')}>{t('Nobody is on the rota today.')}</Note>
  return (
    <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label={t('On today')}>
      {on.map(s => {
        const p = profiles.find(x => x.id === s.profile_id)
        return (
          <Stack component="li" key={s.id} direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            {p && <PersonAvatar name={p.full_name} colour={p.colour} size={28} />}
            <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>{p?.full_name ?? '—'}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{positions.find(x => x.id === s.position_id)?.name ?? ''}</Typography>
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{`${localTime(s.starts_at)}–${localTime(s.ends_at)}`}</Typography>
          </Stack>
        )
      })}
    </Stack>
  )
}

function LateStarts({ r }: { r: DashRange }) {
  const { profiles } = useApp()
  const team = useTeam(r)
  if (!team.data) return <Note>{team.error ?? t('Loading…')}</Note>
  const late = [...lateStarts(team.data.entries, team.data.shifts)].sort((a, b) => b[1] - a[1])
  if (!late.length) return <Note>{t('Everyone started on time.')}</Note>
  return (
    <Stack spacing={0.75}>
      {late.map(([id, n]) => (
        <Stack key={id} direction="row" sx={{ justifyContent: 'space-between' }}>
          <Typography variant="body2">{profiles.find(p => p.id === id)?.full_name ?? '—'}</Typography>
          <Typography variant="body2" sx={{ color: tokens.warnFg }}>{tn(n, '{n} time', '{n} times')}</Typography>
        </Stack>
      ))}
    </Stack>
  )
}

function useStock() {
  const { api } = useApp()
  return useAsync('stock', () => api.stockItems(), [])
}

function LowStock() {
  const stock = useStock()
  if (!stock.data) return <Note>{stock.error ?? t('Loading…')}</Note>
  const low = stock.data.filter(isLow)
  if (!low.length) return <Note>{t('Nothing is low. Nothing to order.')}</Note>
  return (
    <Stack spacing={0.75}>
      {low.slice(0, 8).map(i => (
        <Stack key={i.id} direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="body2" noWrap>{i.name}</Typography>
          <Typography variant="body2" sx={{ color: tokens.badFg, whiteSpace: 'nowrap' }}>{`${formatNumber(i.on_hand)} ${t(unitLabel(i.unit))}`}</Typography>
        </Stack>
      ))}
      {low.length > 8 && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('and {n} more', { n: low.length - 8 })}</Typography>}
      <Button size="small" component={RouterLink} to="/stock" sx={{ alignSelf: 'flex-start', ml: -1 }}>{t('Order list')}</Button>
    </Stack>
  )
}

function StockValue() {
  const stock = useStock()
  if (!stock.data) return <Note>{stock.error ?? t('Loading…')}</Note>
  return <Figure value={formatMoney(stockValue(stock.data))} note={tn(stock.data.filter(i => i.active).length, '{n} item at cost, without VAT', '{n} items at cost, without VAT')} />
}

function Waste({ r }: { r: DashRange }) {
  const { api, canSeeFinances } = useApp()
  const stock = useStock()
  const moves = useAsync('stock-movements', () => api.stockMovements(), [])
  if (!stock.data || !moves.data) return <Note>{stock.error ?? moves.error ?? t('Loading…')}</Note>
  const inRange = (from: string, to: string) => moves.data!.filter(m => m.reason === 'waste' && !m.undone_at && localDate(m.at) >= from && localDate(m.at) <= to)
  const cost = (list: typeof moves.data) => list!.reduce((s, m) => s + Math.abs(m.change) * (stock.data!.find(i => i.id === m.item_id)?.cost_per_unit ?? 0), 0)
  const now = inRange(r.from, r.to), before = inRange(r.prevFrom, r.prevTo)
  return canSeeFinances
    ? <Figure value={formatMoney(cost(now))} now={cost(now)} before={cost(before)} upIsGood={false} note={tn(now.length, '{n} thing thrown away', '{n} things thrown away')} />
    : <Figure value={formatNumber(now.length)} now={now.length} before={before.length} upIsGood={false} note={t('times logged')} />
}

function Margins() {
  const { api, isAdmin, isPartner } = useApp()
  const stock = useStock()
  // The same read as the Business advisor's.
  const recipes = useAsync('advisor-recipes', () => (isAdmin && !isPartner ? api.recipes() : Promise.resolve([])), [isAdmin, !isPartner])
  if (!stock.data || !recipes.data) return <Note>{stock.error ?? recipes.error ?? t('Loading…')}</Note>
  const rows = recipes.data.filter(x => x.active && x.sell_price !== null).map(x => ({ x, c: costing(x, stock.data!) })).filter(r => r.c.marginPct !== null && !r.c.missing.length)
    .sort((a, b) => a.c.marginPct! - b.c.marginPct!).slice(0, 5)
  if (!rows.length) return <Note to="/recipes" action={t('Open Menu costing')}>{t('Add menu prices and what goes in them on Menu costing.')}</Note>
  return (
    <Stack spacing={0.75}>
      {rows.map(({ x, c }) => (
        <Stack key={x.id} direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="body2" noWrap>{x.name}</Typography>
          <Typography variant="body2" sx={{ color: c.below ? tokens.badFg : 'text.secondary', whiteSpace: 'nowrap' }}>
            {t('{pct}% (aim {target}%)', { pct: Math.round(c.marginPct!), target: x.target_margin })}
          </Typography>
        </Stack>
      ))}
    </Stack>
  )
}

function Reviews({ r }: { r: DashRange }) {
  const { api } = useApp()
  const data = useAsync('reviews', () => api.reviews(), [])
  if (!data.data) return <Note>{data.error ?? t('Loading…')}</Note>
  if (!data.data.feed) return <Note to="/reviews" action={t('Reviews')}>{data.data.problem ?? t('Connect Google Maps to read reviews.')}</Note>
  const fresh = data.data.reviews.filter(x => x.created_at.slice(0, 10) >= r.from)
  const rating = data.data.google_rating
  return <Figure value={rating !== null ? `${rating.toFixed(1)}★` : '—'}
    note={t('{count} reviews · {n} new in this period', { count: data.data.google_count ?? data.data.reviews.length, n: fresh.length })} />
}

function AreaPrices() {
  const { api, business } = useApp()
  const data = useAsync('competitors', () => api.competitors(), [true])
  const recipes = useAsync('competitor-recipes', () => api.recipes(), [true])
  if (!data.data || !recipes.data) return <Note>{data.error ?? recipes.error ?? t('Loading…')}</Note>
  const a = analyse(data.data, recipes.data, business?.opening_hours ?? null, today())
  const i = a.ourIndex.index
  if (i === null) return <Note to="/competitors" action={t('Competitors')}>{t('Add a few prices on Competitors to compare.')}</Note>
  return <Figure value={i === 100 ? '±0%' : `${i > 100 ? '+' : '−'}${Math.abs(i - 100)}%`}
    note={tn(a.ourIndex.items, 'against the area, on {n} item', 'against the area, on {n} items')} />
}

function Jobs() {
  const { api } = useApp()
  const data = useAsync('todos', () => api.todos(), [])
  if (!data.data) return <Note>{data.error ?? t('Loading…')}</Note>
  const open = data.data.todos.filter(x => !x.done)
  const starred = open.filter(x => x.starred).slice(0, 5)
  return (
    <Box>
      <Figure value={formatNumber(open.length)} note={tn(open.filter(x => x.status === 'doing').length, '{n} being done', '{n} being done')} />
      {starred.length > 0 && (
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          {starred.map(x => (
            <Stack key={x.id} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <StarIcon sx={{ fontSize: 16, color: '#C98A1E' }} />
              <Typography variant="body2" noWrap>{x.title}</Typography>
            </Stack>
          ))}
        </Stack>
      )}
      <Button size="small" component={RouterLink} to="/todo" sx={{ mt: 0.5, ml: -1 }}>{t('Open the To Do List')}</Button>
    </Box>
  )
}

function TopAdvice() {
  const { advice, loading } = useAdvice()
  if (loading) return <Note>{t('Loading…')}</Note>
  if (!advice.length) return <Note>{t('Nothing stands out yet.')}</Note>
  return (
    <Box>
      {advice.slice(0, 3).map(a => <AdviceCard key={a.id} a={a} compact />)}
      <Button size="small" component={RouterLink} to="/advisor" sx={{ mt: 0.5, ml: -1 }}>{t('Everything the advisor found')}</Button>
    </Box>
  )
}

// ---------------- The Accountant's (shared/accountant.ts works the figures out) ----------------

const short = (d: string) => formatLocal(`${d}T12:00:00Z`, 'd MMM')
const minus = (n: number) => (n ? `−${formatMoney(n)}` : formatMoney(0))

/** Figures one under another, each name on the left and its amount on the right; a result in bold, over a line. */
function Lines({ rows, label }: { rows: { name: string; value: string; strong?: boolean; tone?: string }[]; label: string }) {
  return (
    <Box component="dl" aria-label={label} sx={{ m: 0 }}>
      {rows.map(x => (
        <Stack key={x.name} direction="row" sx={{ justifyContent: 'space-between', gap: 2, py: 0.5, ...(x.strong ? { borderTop: `1px solid ${tokens.line}`, mt: 0.5, pt: 1 } : {}) }}>
          <Typography component="dt" variant="body2" sx={{ fontWeight: x.strong ? 600 : 400, minWidth: 0 }}>{x.name}</Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: x.strong ? 600 : 400, color: x.tone, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{x.value}</Typography>
        </Stack>
      ))}
    </Box>
  )
}

/** A line of small print under a widget, and the page it comes from. */
function From({ to, action, children }: { to: string; action: string; children?: ReactNode }) {
  return (
    <Box sx={{ mt: 1 }}>
      {children && <Typography variant="caption" component="p" sx={{ color: 'text.secondary', m: 0 }}>{children}</Typography>}
      <Button size="small" component={RouterLink} to={to} sx={{ mt: 0.25, ml: -1 }}>{action}</Button>
    </Box>
  )
}

/** The VAT rate the takings are charged at (Profit & loss's setting; the country's usual one until it's read). */
function useVatRate() {
  const { api } = useApp()
  const s = useAsync('pnl-settings', () => api.pnlSettings(), [])
  return { rate: s.data?.vat_rate ?? countryProfile().defaultVat, ready: !!s.data || !!s.error }
}

/** The period's profit and loss, from the takings (with a till), Finances' costs, the timecards and the rota, and the one-off lines. */
function usePeriodPnl(r: DashRange) {
  const { api, settings } = useApp()
  const { on } = useTakings()
  const sales = useSales(r)
  const team = useTeam(r)
  const rates = usePayRates()
  const vat = useVatRate()
  const expenses = useAsync('expenses', () => api.expenses(), [])
  const [fromMonth, toMonth] = [r.from.slice(0, 7), r.to.slice(0, 7)]
  const lines = useAsync('pnl-lines', () => api.pnlLines(fromMonth, toMonth), [fromMonth, toMonth])
  if (!team.data || !expenses.data || !lines.data || !vat.ready || (on && !sales.data)) {
    return { pnl: null, error: team.error ?? expenses.error ?? lines.error ?? (on ? sales.error : null) }
  }
  const pnl = periodPnl({
    vatRate: vat.rate, employerMultiplier: settings?.employer_cost_multiplier ?? 1, country: countryProfile().code,
    takings: on ? sales.data!.days : [], expenses: expenses.data, entries: team.data.entries, shifts: team.data.shifts, rates, lines: lines.data,
  }, r.from, r.to, today())
  return { pnl, error: null }
}

function NetTakingsFigure({ r }: { r: DashRange }) {
  const { on, ready } = useTakings()
  const sales = useSales(r)
  const vat = useVatRate()
  if (!ready) return <Note>{t('Loading…')}</Note>
  if (!on) return <NeedsTill />
  if (sales.error) return <Note>{sales.error}</Note>
  if (!sales.data || !vat.ready) return <Note>{t('Loading…')}</Note>
  const now = netTakings(sales.data.days, r.from, r.to, vat.rate), before = netTakings(sales.data.days, r.prevFrom, r.prevTo, vat.rate)
  return <Figure value={formatMoney(now.net)} now={now.net} before={before.net}
    note={[t('{money} without VAT', { money: formatMoney(now.withoutVat) }), now.refunds ? t('{money} refunded', { money: formatMoney(now.refunds) }) : ''].filter(Boolean).join(' · ')} />
}

function Vat({ r }: { r: DashRange }) {
  const { api } = useApp()
  const { on, ready } = useTakings()
  const sales = useSales(r)
  const vat = useVatRate()
  const invoices = useAsync('invoices', () => api.invoices(), [])
  if (!ready) return <Note>{t('Loading…')}</Note>
  if (!on) return <NeedsTill />
  if (!sales.data || !vat.ready || !invoices.data) return <Note>{sales.error ?? invoices.error ?? t('Loading…')}</Note>
  const v = vatSummary({ takings: netTakings(sales.data.days, r.from, r.to, vat.rate).net, rate: vat.rate, invoices: invoices.data, from: r.from, to: r.to })
  return (
    <Box>
      <Lines label={t('VAT')} rows={[
        { name: t('Charged on the takings ({rate}%)', { rate: formatNumber(vat.rate) }), value: formatMoney(v.onTakings) },
        { name: t('Charged on sales invoices'), value: formatMoney(v.onSales) },
        { name: t('Paid on invoices received'), value: minus(v.onPurchases) },
        v.balance >= 0 ? { name: t('To pay'), value: formatMoney(v.balance), strong: true }
          : { name: t('To claim back'), value: formatMoney(-v.balance), strong: true, tone: tokens.goodFg },
      ]} />
      <From to="/invoices" action={t('Open Invoices')}>
        {[t('An estimate for the VAT return, by the day each invoice was issued.'),
          v.missing ? tn(v.missing, '{n} invoice has no VAT on it yet, so isn’t counted.', '{n} invoices have no VAT on them yet, so aren’t counted.') : ''].filter(Boolean).join(' ')}
      </From>
    </Box>
  )
}

function ProfitLoss({ r }: { r: DashRange }) {
  const { on, ready } = useTakings()
  const { pnl, error } = usePeriodPnl(r)
  if (!ready) return <Note>{t('Loading…')}</Note>
  if (!on) return <NeedsTill />
  if (!pnl) return <Note>{error ?? t('Loading…')}</Note>
  const f = pnlFigures(pnl)
  return (
    <Box>
      <Lines label={t('Profit & loss')} rows={[
        { name: t('Takings, without VAT'), value: formatMoney(f.takings) },
        ...(f.otherIncome ? [{ name: t('Other income'), value: formatMoney(f.otherIncome) }] : []),
        { name: t('Cost of sales'), value: minus(f.costOfSales) },
        { name: t('Team'), value: minus(f.team) },
        { name: t('Running costs'), value: minus(f.running) },
        { name: t('Operating profit'), value: formatMoney(f.operatingProfit), strong: true, tone: f.operatingProfit < 0 ? tokens.badFg : tokens.goodFg },
      ]} />
      <From to="/profit-and-loss" action={t('Open Profit & loss')}>
        {f.margin !== null ? t('{pct}% of the income. An estimate from the app’s own figures, not the filed accounts.', { pct: formatNumber(f.margin) })
          : t('An estimate from the app’s own figures, not the filed accounts.')}
      </From>
    </Box>
  )
}

function Wages({ r }: { r: DashRange }) {
  const { pnl, error } = usePeriodPnl(r)
  if (!pnl) return <Note>{error ?? t('Loading…')}</Note>
  const f = pnlFigures(pnl)
  const ie = countryProfile().code === 'IE'
  if (!f.team) return <Note>{t('No timecards in this period yet.')}</Note>
  return <Figure value={formatMoney(f.team)} note={[
    f.pay ? t('{money} pay', { money: formatMoney(f.pay) }) : '',
    f.social ? (ie ? t('{money} PRSI', { money: formatMoney(f.social) }) : t('{money} Social Security', { money: formatMoney(f.social) })) : '',
    // Days with no timecards or rota yet: Finances' wages, as Profit & loss counts them.
    f.estimate ? t('{money} estimated from Finances', { money: formatMoney(f.estimate) }) : '',
  ].filter(Boolean).join(' · ')} />
}

/** A return's period, as Tax shows it: Q3, Year, Instalment 2; Ireland's Mar–Apr and April. */
function filingPeriod(p: Filing['period']) {
  const month = (m: number, f: string) => formatLocal(`2026-${String(m).padStart(2, '0')}-15T12:00:00Z`, f)
  return p === '0A' ? t('Year') : p.endsWith('T') ? t('Q{n}', { n: p[0] }) : p.endsWith('B') ? `${month(Number(p[0]) * 2 - 1, 'MMM')}–${month(Number(p[0]) * 2, 'MMM')}`
    : p.endsWith('M') ? month(Number(p.slice(0, -1)), 'MMMM') : t('Instalment {n}', { n: p[0] })
}

function TaxDue() {
  const { api, business } = useApp()
  const day = today(), year = Number(day.slice(0, 4))
  const settings = useAsync('tax-settings', () => api.taxSettings(), [])
  const records = useAsync('tax-filings', () => api.taxFilings(year), [year])
  const before = useAsync('tax-filings', () => api.taxFilings(year - 1), [year - 1])
  if (!settings.data || !records.data || !before.data) return <Note>{settings.error ?? records.error ?? before.error ?? t('Loading…')}</Note>
  const country = business?.country === 'IE' ? 'IE' : 'ES'
  const all = [...before.data, ...records.data]
  const { next, overdue } = returnsDue([...filingsIn(country, year - 1, settings.data), ...filingsIn(country, year, settings.data)], all, day)
  const withAdviser = new Set(all.filter(x => x.status === 'with_gestor').map(filingKey))
  const adviser = country === 'IE' ? t('With your {adviser}', { adviser: t(countryProfile('IE').adviser) }) : t('With the gestoría')
  return (
    <Box>
      {overdue.length > 0 && (
        <Typography variant="body2" sx={{ color: tokens.badFg, fontWeight: 600, mb: 1 }}>
          {tn(overdue.length, '{n} return is past its last day and not marked filed', '{n} returns are past their last day and not marked filed')}
        </Typography>
      )}
      {next.length ? (
        <Stack component="ul" aria-label={t('Next tax returns')} spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {[...next].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4).map(f => (
            <Stack component="li" key={filingKey(f)} direction="row" sx={{ justifyContent: 'space-between', gap: 1.5, alignItems: 'flex-start' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{`${f.model === 'CCAA' ? t('Accounts') : irishModelLabel(f.model)} · ${filingPeriod(f.period)}`}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t(f.name)}</Typography>
              </Box>
              <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{short(f.due)}</Typography>
                <Typography variant="caption" sx={{ color: daysBetween(day, f.due) <= 7 ? tokens.warnFg : 'text.secondary' }}>
                  {withAdviser.has(filingKey(f)) ? adviser : tn(daysBetween(day, f.due), 'in {n} day', 'in {n} days')}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Stack>
      ) : <Note>{t('Nothing due')}</Note>}
      <From to="/tax" action={t('Open Tax')} />
    </Box>
  )
}

function InvoicesToPay() {
  const { api } = useApp()
  const invoices = useAsync('invoices', () => api.invoices(), [])
  const suppliers = useAsync('suppliers', () => api.suppliers(), [])
  if (!invoices.data) return <Note>{invoices.error ?? t('Loading…')}</Note>
  const day = today()
  const d = invoicesDue(invoices.data, day)
  const nameOf = (i: (typeof d.next)[number]) => suppliers.data?.find(s => s.id === i.supplier_id)?.name ?? i.party_name ?? i.party_email ?? t('Unknown')
  return (
    <Box>
      <Figure value={formatMoney(d.toPay.total)} note={[tn(d.toPay.count, '{n} invoice not paid yet', '{n} invoices not paid yet'),
        d.overdue.count ? t('{money} overdue', { money: formatMoney(d.overdue.total) }) : ''].filter(Boolean).join(' · ')} />
      {d.next.length > 0 && (
        <Stack component="ul" aria-label={t('Invoices to pay')} spacing={0.75} sx={{ listStyle: 'none', m: 0, mt: 1.25, p: 0 }}>
          {d.next.slice(0, 4).map(i => (
            <Stack component="li" key={i.id} direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>{nameOf(i)}</Typography>
              <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0 }}>
                <Typography variant="body2" sx={{ color: isOverdue(i, day) ? tokens.badFg : 'text.secondary' }}>
                  {isOverdue(i, day) ? t('Overdue since {date}', { date: short(i.due_on!) }) : i.status === 'to_check' ? t('To check') : i.due_on ? t('Due {date}', { date: short(i.due_on) }) : t('To pay')}
                </Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(Number(i.total ?? 0))}</Typography>
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}
      <From to="/invoices" action={t('Open Invoices')}>
        {d.owed.count ? tn(d.owed.count, 'Customers owe {money} on {n} invoice sent.', 'Customers owe {money} on {n} invoices sent.', { money: formatMoney(d.owed.total) }) : undefined}
      </From>
    </Box>
  )
}

function ClaimsToPayBack({ r }: { r: DashRange }) {
  const { api, profiles } = useApp()
  const list = useAsync('expense-claims', () => api.expenseClaims(), [])
  if (!list.data) return <Note>{list.error ?? t('Loading…')}</Note>
  const c = claimsOwed(list.data, r.from, r.to)
  return (
    <Box>
      <Figure value={formatMoney(c.toPayBack)} note={[t('approved, to pay back'),
        c.toApprove.count ? tn(c.toApprove.count, '{n} to approve ({money})', '{n} to approve ({money})', { money: formatMoney(c.toApprove.total) }) : '',
        c.paidBack ? t('{money} paid back in this period', { money: formatMoney(c.paidBack) }) : ''].filter(Boolean).join(' · ')} />
      {c.people.length > 0 && (
        <Stack component="ul" aria-label={t('Who’s owed')} spacing={0.75} sx={{ listStyle: 'none', m: 0, mt: 1.25, p: 0 }}>
          {c.people.slice(0, 5).map(p => (
            <Stack component="li" key={p.profile_id} direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
              <Typography variant="body2" noWrap>{profiles.find(x => x.id === p.profile_id)?.full_name ?? t('Someone on the team')}</Typography>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(p.amount)}</Typography>
            </Stack>
          ))}
        </Stack>
      )}
      <From to="/expenses" action={t('Open Expenses')} />
    </Box>
  )
}

function MonthlyCosts() {
  const { api } = useApp()
  const expenses = useAsync('expenses', () => api.expenses(), [])
  if (!expenses.data) return <Note>{expenses.error ?? t('Loading…')}</Note>
  const c = runningCosts(expenses.data)
  if (!c.count) return <Note to="/finances" action={t('Open Finances')}>{t('Add the monthly running costs on Finances.')}</Note>
  return <Figure value={formatMoney(c.monthly)} note={[tn(c.count, '{n} cost on Finances', '{n} costs on Finances'), t('{money} a year', { money: formatMoney(c.monthly * 12) })].join(' · ')} />
}

function CreditDebitFigure() {
  const { api } = useApp()
  const items = useAsync('credit-debit', () => api.creditDebit(), [])
  const grants = useAsync('grant-applications', () => api.grantApplications(), [])
  if (!items.data || !grants.data) return <Note>{items.error ?? grants.error ?? t('Loading…')}</Note>
  const lines = moneyLines(items.data, grants.data)
  if (!lines.length) return <Note to="/credit-debit" action={t('Open Credit & debit')}>{t('Nothing owed, by the business or to it.')}</Note>
  const sums = moneyTotals(lines)
  return <Figure value={formatMoney(sums.toPay)} note={[t('still to pay'), sums.monthly ? t('{money} a month', { money: formatMoney(sums.monthly) }) : '',
    sums.comingIn ? t('{money} to come in', { money: formatMoney(sums.comingIn) }) : ''].filter(Boolean).join(' · ')} />
}

// ---------------- The Sales template's (shared/salesDashboard.ts works the figures out) ----------------

/** Where a period still going is heading: so far, and a usual day of each kind (the last eight weeks) for the days left. */
function SalesPaceFigure({ r, period }: { r: DashRange; period?: DashPeriod }) {
  const { api } = useApp()
  const { on, ready } = useTakings()
  const sales = useSales(r)
  const day = today()
  // The same eight weeks Takings by day of the week reads.
  const history = useAsync('advisor-sales', () => (on ? api.sales(addDays(day, -55), day) : Promise.resolve(null)), [on, day])
  const end = period ? periodEnd(period, day) : null
  if (!ready) return <Note>{t('Loading…')}</Note>
  if (!on) return <NeedsTill />
  if (!end || !period) return <Note>{t('For a period still going: today, this week or this month.')}</Note>
  if (!sales.data || !history.data) return <Note>{sales.error ?? history.error ?? t('Loading…')}</Note>
  const pace = salesPace(sales.data.days, history.data.days, r.from, end, day)
  const before = salesTotals(between(sales.data.days, r.prevFrom, periodEnd(period, r.prevFrom) ?? r.prevTo)).gross
  return (
    <Box>
      <Figure value={formatMoney(pace.total)} now={pace.total} before={before}
        note={[t('{money} taken so far', { money: formatMoney(pace.soFar) }), pace.daysLeft ? tn(pace.daysLeft, '{n} day to go', '{n} days to go') : ''].filter(Boolean).join(' · ')} />
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary', m: 0, mt: 0.75 }}>
        {t('Against the whole period before. What’s left counts as a usual day of each kind, from the last eight weeks.')}
      </Typography>
    </Box>
  )
}

/** What sold most by how many (Square's items): the counterpart of Best sellers, which goes by the money. */
function MostSold({ r }: { r: DashRange }) {
  const { api } = useApp()
  const { on } = useTakings()
  const items = useAsync('dash-items', () => (on ? api.salesItems(r.from, r.to) : Promise.resolve(null)), [on, r.from, r.to])
  if (!on) return <NeedsTill />
  if (!items.data) return <Note>{items.error ?? t('Loading…')}</Note>
  if (!items.data.items) return <Note>{t('Best sellers come from Square: Stripe and SumUp send payments only.')}</Note>
  const top = mostSold(items.data.items)
  return top.length ? <ShareBars rows={top.map(i => ({ name: i.name, value: i.quantity }))} format={n => tn(n, '{n} sold', '{n} sold', { n: formatNumber(n) })} label={t('Most sold')} />
    : <Note>{t('Nothing sold yet.')}</Note>
}

/** Who took the payments in Square, as the Leaderboard counts them (how much each took only for the owners). */
function SalesByPerson({ r }: { r: DashRange }) {
  const { api, profiles } = useApp()
  const till = useAsync('leaderboard-till', () => api.leaderboardTill(r.from, r.to), [r.from, r.to])
  if (!till.data) return <Note>{till.error ?? t('Loading…')}</Note>
  const b = till.data
  if (b.status === 'plan') return <Note>{t('Sales by person come with takings, on the Pro plan and up.')}</Note>
  if (b.status === 'not_connected') return <Note to="/connections" action={t('Connect a till')}>{t('Connect Square to see who sold most: each payment in Square says who took it.')}</Note>
  if (b.status === 'reconnect') return <Note to="/connections" action={t('Open Connections')}>{t(RECONNECT_TEAM)}</Note>
  if (b.status === 'no_links') return <Note to="/leaderboard" action={t('Open the Leaderboard')}>{t('Link each person to their own Square login to see who sold most.')}</Note>
  const money = b.people.some(p => p.gross !== null)
  const rows = b.people.map(p => ({ name: profiles.find(x => x.id === p.profile_id)?.full_name ?? t('Someone on the team'), value: money ? p.gross ?? 0 : p.sales }))
    .filter(x => x.value > 0).sort((a, b) => b.value - a.value)
  return (
    <Box>
      {rows.length ? <ShareBars rows={rows} format={money ? formatMoney : n => tn(n, '{n} sale', '{n} sales')} label={t('Sales by person')} />
        : <Note>{t('No sales taken in Square in this period yet.')}</Note>}
      <From to="/leaderboard" action={t('Open the Leaderboard')}>
        {b.unlinked.sales > 0 ? tn(b.unlinked.sales, '1 sale was taken in Square by someone not linked to anyone here.', '{n} sales were taken in Square by someone not linked to anyone here.') : undefined}
      </From>
    </Box>
  )
}

/** The reps who brought most in the period (Sales reps & rewards): what each earned, and how many times. */
function TopReps({ r }: { r: DashRange }) {
  const { api } = useApp()
  const reps = useAsync('sales-reps', () => api.salesReps(), [])
  const rewards = useAsync('rep-rewards', () => api.repRewards(), [])
  if (!reps.data || !rewards.data) return <Note>{reps.error ?? rewards.error ?? t('Loading…')}</Note>
  const top = repsBetween(reps.data, rewards.data, r.from, r.to)
  if (!top.length) return <Note to="/sales-reps" action={t('Open Reps & rewards')}>{t('No rewards earned in this period yet.')}</Note>
  return (
    <Box>
      <Stack component="ol" aria-label={t('Reps who brought most')} spacing={0.75} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {top.slice(0, 5).map(s => (
          <Stack component="li" key={s.rep.id} direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>{s.rep.name}</Typography>
            <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{tn(s.rewards, '{n} reward', '{n} rewards')}</Typography>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(s.earned)}</Typography>
            </Stack>
          </Stack>
        ))}
      </Stack>
      <From to="/sales-reps" action={t('Open Reps & rewards')}>
        {top.length > 5 ? tn(top.length - 5, 'and {n} more rep', 'and {n} more reps') : undefined}
      </From>
    </Box>
  )
}

/** Tips or refunds in the period, against the period before, with their share of the takings. */
function TipsOrRefunds({ r, pick }: { r: DashRange; pick: 'tips' | 'refunds' }) {
  const { on, ready } = useTakings()
  const sales = useSales(r)
  if (!ready || (on && !sales.data && !sales.error)) return <Note>{t('Loading…')}</Note>
  if (!on) return <NeedsTill />
  if (sales.error) return <Note>{sales.error}</Note>
  const now = salesTotals(between(sales.data!.days, r.from, r.to)), before = salesTotals(between(sales.data!.days, r.prevFrom, r.prevTo))
  const pct = percentOf(now[pick], now.gross)
  if (pick === 'refunds' && !now.refunds) return <Figure value={formatMoney(0)} note={t('Nothing refunded in this period')} />
  return <Figure value={formatMoney(now[pick])} now={now[pick]} before={before[pick]} upIsGood={pick === 'tips'}
    note={pct !== null ? t('{pct}% of the takings', { pct }) : undefined} />
}

/** The widget's body, for the period picked (`period`: what On course for goes by). */
export function WidgetBody({ kind, range, period }: { kind: WidgetKind; range: DashRange; period?: DashPeriod }) {
  switch (kind) {
    case 'takings': return <SalesFigure r={range} pick="gross" />
    case 'payments': return <SalesFigure r={range} pick="payments" />
    case 'average_sale': return <SalesFigure r={range} pick="average" />
    case 'takings_by_day': return <TakingsByDay r={range} />
    case 'busiest_hours': return <BusiestHours r={range} />
    case 'weekday_takings': return <WeekdayTakings />
    case 'best_sellers': return <BestSellers r={range} />
    case 'payment_methods': return <PaymentMethods r={range} />
    case 'team_cost': return <TeamCost r={range} />
    case 'labour_share': return <TeamCost r={range} share />
    case 'hours_worked': return <HoursWorked r={range} />
    case 'on_today': return <OnToday />
    case 'late_starts': return <LateStarts r={range} />
    case 'low_stock': return <LowStock />
    case 'stock_value': return <StockValue />
    case 'waste': return <Waste r={range} />
    case 'margins': return <Margins />
    case 'reviews': return <Reviews r={range} />
    case 'area_prices': return <AreaPrices />
    case 'todo': return <Jobs />
    case 'advice': return <TopAdvice />
    case 'net_takings': return <NetTakingsFigure r={range} />
    case 'vat': return <Vat r={range} />
    case 'pnl': return <ProfitLoss r={range} />
    case 'wages': return <Wages r={range} />
    case 'tax_due': return <TaxDue />
    case 'invoices': return <InvoicesToPay />
    case 'claims': return <ClaimsToPayBack r={range} />
    case 'running_costs': return <MonthlyCosts />
    case 'credit_debit': return <CreditDebitFigure />
    case 'sales_pace': return <SalesPaceFigure r={range} period={period} />
    case 'items_sold': return <MostSold r={range} />
    case 'team_sales': return <SalesByPerson r={range} />
    case 'top_reps': return <TopReps r={range} />
    case 'tips': return <TipsOrRefunds r={range} pick="tips" />
    case 'refunds': return <TipsOrRefunds r={range} pick="refunds" />
  }
}

/** The Today page's short list of what's low: the first `n`, and how many more. */
export function LowStockTop({ n = 3 }: { n?: number }) {
  const stock = useStock()
  if (!stock.data) return <Note>{stock.error ?? t('Loading…')}</Note>
  const low = lowestFirst(stock.data.filter(isLow))
  if (!low.length) return <Note>{t('Nothing is low. Nothing to order.')}</Note>
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{tn(low.length, '{n} item to order', '{n} items to order')}</Typography>
      {low.slice(0, n).map(i => (
        <Stack key={i.id} direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="body2" noWrap>{i.name}</Typography>
          <Typography variant="body2" sx={{ color: tokens.badFg, whiteSpace: 'nowrap' }}>{`${formatNumber(i.on_hand)} ${t(unitLabel(i.unit))}`}</Typography>
        </Stack>
      ))}
      {low.length > n && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('and {n} more', { n: low.length - n })}</Typography>}
    </Stack>
  )
}

/** The Today page's short list of jobs: how many are open, and the first `n` to do (pinned, starred, being done). */
export function TopJobs({ n = 3 }: { n?: number }) {
  const { api } = useApp()
  const data = useAsync('todos', () => api.todos(), [])
  if (!data.data) return <Note>{data.error ?? t('Loading…')}</Note>
  const open = data.data.todos.filter(x => !x.done)
  const top = topJobs(data.data.todos, n)
  if (!open.length) return <Note>{t('Nothing to do. All done!')}</Note>
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {[tn(open.length, '{n} open', '{n} open'), tn(open.filter(x => x.status === 'doing').length, '{n} being done', '{n} being done')].join(' · ')}
      </Typography>
      <Stack component="ol" aria-label={t('Jobs to do first')} spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {top.map(x => (
          <Stack component="li" key={x.id} direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
            {x.pinned ? <PinIcon sx={{ fontSize: 16, color: tokens.roseDeep }} /> : x.starred ? <StarIcon sx={{ fontSize: 16, color: '#C98A1E' }} />
              : <DotIcon sx={{ fontSize: 16, color: x.status === 'doing' ? tokens.matcha : tokens.inkFaint }} />}
            <Typography variant="body2" noWrap>{x.title}</Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  )
}
