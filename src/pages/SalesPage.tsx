import {
  Alert, Box, Button, Card, CardContent, MenuItem, Stack, Table, TableBody, TableCell, TableFooter, TableHead, TableRow, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import UpIcon from '@mui/icons-material/ArrowUpwardRounded'
import DownIcon from '@mui/icons-material/ArrowDownwardRounded'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { FEATURES } from '../app/features'
import { useAsync } from '../app/hooks'
import { BarChart, ShareBars, type BarPoint } from '../components/charts'
import { Empty, ErrorBox, Loading, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton, SortCell, useSort } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { addDays, currencySymbol, formatLocal, formatMoney, formatNumber, today, weekStart } from '../../shared/time'
import type { PayMethod, SalesDay, SalesItem } from '../../shared/types'
import { tokens } from '../theme'

// The periods to look at, each compared with the one before it (as Square's sales summary does).
type Period = 'today' | 'yesterday' | 'week' | 'lastweek' | 'month' | 'lastmonth' | '30'
const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Today' }, { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This week' }, { id: 'lastweek', label: 'Last week' },
  { id: 'month', label: 'This month' }, { id: 'lastmonth', label: 'Last month' },
  { id: '30', label: 'Last 30 days' },
]

interface Range { from: string; to: string; prevFrom: string; prevTo: string; /** "vs …" under each figure, and the grey line's name. */ vs: string }

const monthStart = (d: string) => `${d.slice(0, 8)}01`
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

/** The dates of a period and of the one it's compared with, the same number of days earlier on. */
function rangeOf(period: Period, day = today()): Range {
  const monday = weekStart(day), first = monthStart(day)
  const prevMonthEnd = addDays(first, -1), prevMonth = monthStart(prevMonthEnd)
  switch (period) {
    case 'today': return { from: day, to: day, prevFrom: addDays(day, -7), prevTo: addDays(day, -7), vs: `last ${formatLocal(`${day}T12:00:00Z`, 'EEEE')}` }
    case 'yesterday': { const y = addDays(day, -1); return { from: y, to: y, prevFrom: addDays(y, -7), prevTo: addDays(y, -7), vs: `the ${formatLocal(`${y}T12:00:00Z`, 'EEEE')} before` } }
    case 'week': return { from: monday, to: day, prevFrom: addDays(monday, -7), prevTo: addDays(day, -7), vs: 'last week' }
    case 'lastweek': return { from: addDays(monday, -7), to: addDays(monday, -1), prevFrom: addDays(monday, -14), prevTo: addDays(monday, -8), vs: 'the week before' }
    case 'month': {
      // The same days of last month (up to its last day: 31 March is compared with 28 February).
      const sameDay = addDays(prevMonth, daysBetween(first, day))
      return { from: first, to: day, prevFrom: prevMonth, prevTo: sameDay > prevMonthEnd ? prevMonthEnd : sameDay, vs: 'last month' }
    }
    case 'lastmonth': {
      const before = monthStart(addDays(prevMonth, -1))
      return { from: prevMonth, to: prevMonthEnd, prevFrom: before, prevTo: addDays(prevMonth, -1), vs: 'the month before' }
    }
    case '30': return { from: addDays(day, -29), to: day, prevFrom: addDays(day, -59), prevTo: addDays(day, -30), vs: 'the 30 days before' }
  }
}

/** Every date from `from` to `to` (not after today), with the takings of each (zero when nothing sold). */
function fill(days: SalesDay[], from: string, to: string): SalesDay[] {
  const by = new Map(days.map(d => [d.date, d]))
  const out: SalesDay[] = []
  const last = to > today() ? today() : to
  for (let d = from; d <= last; d = addDays(d, 1)) out.push(by.get(d) ?? { date: d, gross: 0, tips: 0, refunds: 0, payments: 0 })
  return out
}

function totals(days: SalesDay[]) {
  const gross = days.reduce((s, d) => s + d.gross, 0), refunds = days.reduce((s, d) => s + d.refunds, 0)
  const tips = days.reduce((s, d) => s + d.tips, 0), payments = days.reduce((s, d) => s + d.payments, 0)
  return { gross, refunds, tips, payments, net: gross - refunds, average: payments ? gross / payments : 0 }
}

/** "▲ 12% vs last week", in the good or problem colour with an arrow, or a plain note when there's nothing to compare. */
function Change({ now, before, vs }: { now: number; before: number; vs: string }) {
  if (!before) return <>{now ? `nothing ${vs} to compare` : `vs ${vs}`}</>
  const pct = Math.round((now - before) / before * 100)
  if (pct === 0) return <>same as {vs}</>
  const up = pct > 0
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', color: up ? tokens.goodFg : tokens.badFg, fontWeight: 600 }}>
        {up ? <UpIcon sx={{ fontSize: 14 }} /> : <DownIcon sx={{ fontSize: 14 }} />}{Math.abs(pct)}%
      </Box>
      &nbsp;vs {vs}
    </Box>
  )
}

const METHOD_NAMES: Record<PayMethod, string> = { card: 'Card', wallet: 'Apple Pay / Google Pay', cash: 'Cash', other: 'Other (gift cards, bank, external)' }
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const hourLabel = (h: number) => `${h}:00`
const wholeMoney = (n: number) => `${currencySymbol()}${formatNumber(Math.round(n))}`
const remembered = (): Period => {
  try { const p = localStorage.getItem('sales-period'); return PERIODS.some(x => x.id === p) ? p as Period : 'week' } catch { return 'week' }
}

type Metric = 'sales' | 'payments' | 'average'

/** Sales: takings from Square (or Stripe) like Square's own dashboard, with each figure next to the period before. */
export function SalesPage() {
  const { api, canSeePay, isPartner } = useApp()
  const [period, setPeriod] = useState<Period>(remembered)
  const [metric, setMetric] = useState<Metric>('sales')
  const day = today()
  const range = rangeOf(period, day)
  const integ = useAsync('integrations', () => api.integrations(), [])
  const till = integ.data?.integrations.find(i => (i.provider === 'stripe' || (FEATURES.square && i.provider === 'square')) && i.status === 'connected')
  const on = !!till && canSeePay && !isPartner
  // One read covers both periods; best sellers are for the period itself.
  const sales = useAsync('sales-page', () => (on ? api.sales(range.prevFrom, range.to) : Promise.resolve(null)), [on, period, day])
  const items = useAsync('sales-items', () => (on ? api.salesItems(range.from, range.to) : Promise.resolve(null)), [on, period, day])

  if (!canSeePay || isPartner) {
    return <>
      <PageHeader eyebrow="Accounts" title="Sales" />
      <Alert severity="info">Sales are only visible to admins with pay access.</Alert>
    </>
  }
  const pick = (p: Period) => {
    setPeriod(p)
    try { localStorage.setItem('sales-period', p) } catch { /* storage unavailable */ }
  }
  const picker = (
    <TextField select size="small" value={period} onChange={e => pick(e.target.value as Period)} sx={{ minWidth: 170 }}
      slotProps={{ select: { SelectDisplayProps: { 'aria-label': 'Period' } } }}>
      {PERIODS.map(p => <MenuItem key={p.id} value={p.id}>{p.label}</MenuItem>)}
    </TextField>
  )
  const name = till?.provider === 'stripe' ? 'Stripe' : 'Square'
  const header = (
    <PageHeader eyebrow="Accounts" title="Sales" actions={on && <>
      <Tag>From {name}</Tag>
      {picker}
    </>} />
  )
  if (!integ.data) return <>{header}<ErrorBox error={integ.error} /><Loading /></>
  if (!till) return <>{header}<ConnectFirst /></>

  const all = sales.data?.days ?? []
  const cur = fill(all, range.from, range.to)
  // The earlier period, lined up day for day with this one in the chart (it may be longer: last month had more days).
  const prev = fill(all, range.prevFrom, range.prevTo)
  const now = totals(cur), before = totals(prev)
  const single = range.from === range.to
  const periodName = PERIODS.find(p => p.id === period)!.label
  const vs = range.vs
  const loaded = !!sales.data

  return (
    <>
      {header}
      <ErrorBox error={sales.error} />

      <StatGrid>
        <StatTile label="Gross sales" value={loaded ? formatMoney(now.gross) : '–'} note={loaded && <Change now={now.gross} before={before.gross} vs={vs} />} />
        <StatTile label="Net sales" value={loaded ? formatMoney(now.net) : '–'} note={loaded && (now.refunds ? `after ${formatMoney(now.refunds)} refunded` : 'no refunds')} />
        <StatTile label="Transactions" value={loaded ? formatNumber(now.payments) : '–'} note={loaded && <Change now={now.payments} before={before.payments} vs={vs} />} />
        <StatTile label="Average sale" value={loaded ? formatMoney(now.average) : '–'} note={loaded && <Change now={now.average} before={before.average} vs={vs} />} />
      </StatGrid>

      <Card component="section" aria-label="Sales over time" sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={!single && (
            <ToggleButtonGroup size="small" exclusive value={metric} onChange={(_, m: Metric | null) => m && setMetric(m)} aria-label="Measure">
              <ToggleButton value="sales">Sales</ToggleButton>
              <ToggleButton value="payments">Transactions</ToggleButton>
              <ToggleButton value="average">Average</ToggleButton>
            </ToggleButtonGroup>
          )}>
            {single ? 'Sales by hour' : 'Sales over time'}
          </SectionTitle>
          {!loaded ? <Loading /> : single ? <HourChart today={cur[0]} before={prev[0]} periodName={periodName} vs={vs} /> : (
            <OverTime cur={cur} prev={prev} metric={metric} periodName={periodName} vs={vs} />
          )}
          {loaded && (
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
              Tips {formatMoney(now.tips)} on top of sales · refunds {formatMoney(now.refunds)}
            </Typography>
          )}
        </CardContent>
      </Card>

      {loaded && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, alignItems: 'start', gap: 2, mb: 3 }}>
          {!single && <BusiestHours days={cur} />}
          {cur.length >= 7 && <ByWeekday days={cur} />}
          <Methods days={cur} />
          <BestSellers data={items.data} error={items.error} periodName={periodName} />
        </Box>
      )}

      {loaded && <DayTable days={cur} periodName={periodName} />}
    </>
  )
}

/** Nothing connected yet: the steps, and the way to Connections. */
function ConnectFirst() {
  return (
    <Card>
      <CardContent>
        <SectionTitle>Connect Square to see your sales</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          Sales reads your payments and orders from Square (read only: it can't take, move or refund money) and shows them
          like Square's own dashboard: sales, transactions and average sale against the period before, the busiest hours and days,
          how people pay and your best sellers.
        </Typography>
        <Box component="ol" sx={{ pl: 2.5, my: 0, '& li': { mb: 0.5 } }}>
          <li>Open <b>Connections</b> and find <b>Payments and sales</b>.</li>
          <li>Press <b>Connect Square</b> and sign in with the Square account the café's till uses.</li>
          <li>Allow access. You're brought back here, connected, with every active location included.</li>
        </Box>
        <Button component={RouterLink} to="/connections" variant="contained" sx={{ mt: 2 }}>Go to Connections</Button>
      </CardContent>
    </Card>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const shortDate = (d: string, many: boolean) => formatLocal(`${d}T12:00:00Z`, many ? 'd MMM' : 'EEE d')
const longDate = (d: string) => formatLocal(`${d}T12:00:00Z`, 'EEEE d MMMM')

function OverTime({ cur, prev, metric, periodName, vs }: { cur: SalesDay[]; prev: SalesDay[]; metric: Metric; periodName: string; vs: string }) {
  const value = (d?: SalesDay) => (!d ? undefined : metric === 'sales' ? d.gross : metric === 'payments' ? d.payments : d.payments ? d.gross / d.payments : 0)
  const many = cur.length > 10
  const points: BarPoint[] = cur.map((d, i) => ({ label: shortDate(d.date, many), title: longDate(d.date), value: value(d)!, prev: value(prev[i]) }))
  const format = metric === 'payments' ? (n: number) => `${formatNumber(Math.round(n))} transactions` : formatMoney
  const axis = metric === 'payments' ? (n: number) => formatNumber(Math.round(n)) : wholeMoney
  const what = metric === 'sales' ? 'Sales' : metric === 'payments' ? 'Transactions' : 'Average sale'
  return <BarChart points={points} format={format} axisFormat={axis} current={periodName} previous={cap(vs)}
    label={`${what} per day, ${periodName.toLowerCase()}, with ${vs} as a line`} />
}

/** One day by the hour, against the same hours of the day it's compared with. */
function HourChart({ today: day, before, periodName, vs }: { today?: SalesDay; before?: SalesDay; periodName: string; vs: string }) {
  const a = day?.hours ?? [], b = before?.hours ?? []
  const busy = Array.from({ length: 24 }, (_, h) => h).filter(h => (a[h] ?? 0) > 0 || (b[h] ?? 0) > 0)
  if (!day?.hours && !before?.hours) return <Empty>No sales by the hour for this day.</Empty>
  // The opening hours (or whichever hours had sales), so the bars aren't lost in a night of zeros.
  const first = Math.min(8, ...busy), last = Math.max(17, ...busy)
  const points: BarPoint[] = Array.from({ length: last - first + 1 }, (_, i) => first + i)
    .map(h => ({ label: hourLabel(h), title: `${hourLabel(h)}–${hourLabel(h + 1)}`, value: a[h] ?? 0, prev: b[h] ?? 0 }))
  return <BarChart points={points} format={formatMoney} axisFormat={wholeMoney} current={periodName} previous={cap(vs)}
    label={`Sales by hour, ${periodName.toLowerCase()}, with ${vs} as a line`} />
}

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Card component="section" aria-label={title} sx={{ minWidth: 0 }}>
      <CardContent>
        <SectionTitle>{title}</SectionTitle>
        {note && <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1, mb: 1.5 }}>{note}</Typography>}
        {children}
      </CardContent>
    </Card>
  )
}

/** Average sales in each hour, over the days that had any. */
function BusiestHours({ days }: { days: SalesDay[] }) {
  const open = days.filter(d => d.hours && d.gross > 0)
  if (!open.length) return null
  const avg = Array.from({ length: 24 }, (_, h) => open.reduce((s, d) => s + (d.hours![h] ?? 0), 0) / open.length)
  const busy = avg.map((v, h) => (v > 0 ? h : -1)).filter(h => h >= 0)
  const first = Math.min(...busy), last = Math.max(...busy)
  const peak = avg.indexOf(Math.max(...avg))
  const points = Array.from({ length: last - first + 1 }, (_, i) => first + i)
    .map(h => ({ label: hourLabel(h), title: `${hourLabel(h)}–${hourLabel(h + 1)}, on average`, value: avg[h] }))
  return (
    <Panel title="Busiest hours" note={`Busiest at ${hourLabel(peak)}–${hourLabel(peak + 1)}: ${formatMoney(avg[peak])} an hour on average`}>
      <BarChart points={points} format={formatMoney} axisFormat={wholeMoney} height={180} label="Average sales in each hour of the day" />
    </Panel>
  )
}

/** Average sales on each day of the week. */
function ByWeekday({ days }: { days: SalesDay[] }) {
  const sum = Array<number>(7).fill(0), count = Array<number>(7).fill(0)
  for (const d of days) {
    const i = (new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7
    sum[i] += d.gross
    count[i] += 1
  }
  const avg = sum.map((s, i) => (count[i] ? s / count[i] : 0))
  const best = avg.indexOf(Math.max(...avg))
  const points = WEEKDAYS.map((w, i) => ({ label: w, title: `${formatLocal(`2024-01-0${i + 1}T12:00:00Z`, 'EEEE')}s, on average`, value: avg[i] }))
  return (
    <Panel title="Days of the week" note={`${formatLocal(`2024-01-0${best + 1}T12:00:00Z`, 'EEEE')}s are best: ${formatMoney(avg[best])} on average`}>
      <BarChart points={points} format={formatMoney} axisFormat={wholeMoney} height={180} label="Average sales on each day of the week" />
    </Panel>
  )
}

/** How people paid (Square only: Stripe is all card). */
function Methods({ days }: { days: SalesDay[] }) {
  const sum: Partial<Record<PayMethod, number>> = {}
  let any = false
  for (const d of days) {
    if (!d.methods) continue
    any = true
    for (const [k, v] of Object.entries(d.methods) as [PayMethod, number][]) sum[k] = (sum[k] ?? 0) + v
  }
  if (!any) return null
  const rows = (Object.entries(sum) as [PayMethod, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ name: METHOD_NAMES[k], value: v }))
  return (
    <Panel title="How people paid">
      {rows.length ? <ShareBars rows={rows} format={formatMoney} label="Sales by payment method" /> : <Empty>No sales yet.</Empty>}
    </Panel>
  )
}

function BestSellers({ data, error, periodName }: { data: { items: SalesItem[] | null; reason?: string } | null; error: string | null; periodName: string }) {
  const list = data?.items ?? []
  const total = list.reduce((s, i) => s + i.gross, 0)
  const { rows, sort } = useSort(list, { name: i => i.name, quantity: i => i.quantity, gross: i => i.gross }, { by: 'gross', dir: 'desc' }, ['quantity', 'gross'])
  const shown = rows.slice(0, 10)
  const table = (): ExportTable => ({
    title: `Best sellers: ${periodName.toLowerCase()}`, filename: `best-sellers-${today()}`,
    columns: ['Item', 'Sold', `Sales (${currencySymbol()})`, 'Share'],
    rows: rows.map(i => [i.name, i.quantity, i.gross, total ? `${Math.round(i.gross / total * 100)}%` : '']),
    money: [2],
  })
  return (
    <Card component="section" aria-label="Best sellers" sx={{ minWidth: 0 }}>
      <CardContent>
        <SectionTitle action={list.length > 0 && <ExportButton table={table} folder="Sales" />}>Best sellers</SectionTitle>
        <ErrorBox error={error} />
        {!data && !error && <Loading />}
        {data?.reason === 'stripe' && <Empty>Stripe doesn't send what was sold, only the payments. Connect Square to see best sellers.</Empty>}
        {data?.reason === 'reconnect' && (
          <Alert severity="info" action={<Button component={RouterLink} to="/connections" size="small">Connections</Button>}>
            Square was connected before best sellers were added. Connect Square again once to allow reading orders.
          </Alert>
        )}
        {data?.items && !list.length && <Empty>Nothing sold in this period.</Empty>}
        {shown.length > 0 && (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label="Best sellers">
              <TableHead>
                <TableRow>
                  <SortCell sort={sort} id="name">Item</SortCell>
                  <SortCell sort={sort} id="quantity" align="right">Sold</SortCell>
                  <SortCell sort={sort} id="gross" align="right">Sales</SortCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map(i => (
                  <TableRow key={i.name} hover>
                    <TableCell sx={{ fontWeight: 500 }}>
                      {i.name}
                      <Box sx={{ mt: 0.5, height: 4, borderRadius: 2, bgcolor: tokens.line, overflow: 'hidden', maxWidth: 160 }}>
                        <Box sx={{ width: `${total ? Math.max(2, i.gross / total * 100) : 0}%`, height: '100%', bgcolor: tokens.chart }} />
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(i.quantity)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(i.gross)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > shown.length && (
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>Top 10 of {rows.length}; export for the full list.</Typography>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

const DAY_SORT: Record<string, (d: SalesDay) => string | number> = {
  date: d => d.date, payments: d => d.payments, gross: d => d.gross, refunds: d => d.refunds,
  net: d => d.gross - d.refunds, tips: d => d.tips, average: d => (d.payments ? d.gross / d.payments : 0),
}

/** Every day of the period, newest first, with an export (the table view of the charts). */
function DayTable({ days, periodName }: { days: SalesDay[]; periodName: string }) {
  const { rows, sort } = useSort(days, DAY_SORT, { by: 'date', dir: 'desc' }, ['date', 'payments', 'gross', 'refunds', 'net', 'tips', 'average'])
  const t = totals(days)
  const table = (): ExportTable => ({
    title: `Sales by day: ${periodName.toLowerCase()}`, filename: `sales-${today()}`,
    columns: ['Date', 'Transactions', `Gross sales (${currencySymbol()})`, 'Refunds', 'Net sales', 'Tips', 'Average sale'],
    rows: rows.map(d => [d.date, d.payments, d.gross, d.refunds, d.gross - d.refunds, d.tips, d.payments ? d.gross / d.payments : 0]),
    footer: ['Total', t.payments, t.gross, t.refunds, t.net, t.tips, t.average],
    money: [2, 3, 4, 5, 6],
  })
  const num = { fontVariantNumeric: 'tabular-nums' }
  return (
    <Card component="section" aria-label="Sales by day">
      <CardContent>
        <SectionTitle action={<ExportButton table={table} folder="Sales" disabled={!rows.length} />}>Sales by day</SectionTitle>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label="Sales by day" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <SortCell sort={sort} id="date">Date</SortCell>
                <SortCell sort={sort} id="payments" align="right">Transactions</SortCell>
                <SortCell sort={sort} id="gross" align="right">Gross sales</SortCell>
                <SortCell sort={sort} id="refunds" align="right">Refunds</SortCell>
                <SortCell sort={sort} id="net" align="right">Net sales</SortCell>
                <SortCell sort={sort} id="tips" align="right">Tips</SortCell>
                <SortCell sort={sort} id="average" align="right">Average sale</SortCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(d => (
                <TableRow key={d.date} hover>
                  <TableCell>{formatLocal(`${d.date}T12:00:00Z`, 'EEE d MMM')}</TableCell>
                  <TableCell align="right" sx={num}>{formatNumber(d.payments)}</TableCell>
                  <TableCell align="right" sx={num}>{formatMoney(d.gross)}</TableCell>
                  <TableCell align="right" sx={num}>{d.refunds ? formatMoney(d.refunds) : '–'}</TableCell>
                  <TableCell align="right" sx={{ ...num, fontWeight: 500 }}>{formatMoney(d.gross - d.refunds)}</TableCell>
                  <TableCell align="right" sx={num}>{formatMoney(d.tips)}</TableCell>
                  <TableCell align="right" sx={num}>{d.payments ? formatMoney(d.gross / d.payments) : '–'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow sx={{ '& td': { fontWeight: 500, color: 'text.primary', fontSize: '0.9rem', ...num } }}>
                <TableCell>Total</TableCell>
                <TableCell align="right">{formatNumber(t.payments)}</TableCell>
                <TableCell align="right">{formatMoney(t.gross)}</TableCell>
                <TableCell align="right">{formatMoney(t.refunds)}</TableCell>
                <TableCell align="right">{formatMoney(t.net)}</TableCell>
                <TableCell align="right">{formatMoney(t.tips)}</TableCell>
                <TableCell align="right">{formatMoney(t.average)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Box>
        <Stack direction="row" sx={{ mt: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Gross sales are completed payments before tips; net sales take refunds off. Days run midnight to midnight, Madrid time.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  )
}
