// The widgets a dashboard is made of. Each one reads what it shows through the shared cache (the
// same keys the pages use, so a dashboard of ten widgets asks for the takings once) and says plainly
// when there's nothing to show yet, or what to connect.
import { Box, Button, Stack, Typography } from '@mui/material'
import UpIcon from '@mui/icons-material/ArrowUpwardRounded'
import DownIcon from '@mui/icons-material/ArrowDownwardRounded'
import StarIcon from '@mui/icons-material/Star'
import { Link as RouterLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAdvice } from '../app/insightsData'
import { AdviceCard } from '../pages/AdvisorPage'
import { BarChart, ShareBars, type BarPoint } from './charts'
import { PersonAvatar } from './common'
import { tillsOf } from './till'
import type { DashRange, WidgetKind } from '../../shared/dashboards'
import { change, hourTotals, hoursByPerson, lateStarts, salesTotals, weekdayAverages, between } from '../../shared/insights'
import { analyse } from '../../shared/localCompetitors'
import { costing } from '../../shared/recipes'
import { isLow, stockValue, unitLabel } from '../../shared/stock'
import type { PayMethod, SalesDay } from '../../shared/types'
import { addDays, currencySymbol, formatLocal, formatMoney, formatNumber, localDate, localTime, today, zonedIso } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t, tn } from '../i18n'

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

function useSales(r: DashRange) {
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
  const { rates, settings, canSeeFinances } = useApp()
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
  const on = shifts.data.filter(s => s.status === 'published' && s.profile_id && localDate(s.starts_at) === day).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
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
  return <Figure value={formatMoney(stockValue(stock.data))} note={tn(stock.data.filter(i => i.active).length, '{n} item at cost, without IVA', '{n} items at cost, without IVA')} />
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

/** The widget's body, for the period picked. */
export function WidgetBody({ kind, range }: { kind: WidgetKind; range: DashRange }) {
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
  }
}
