import {
  Alert, Box, Button, Card, CardContent, MenuItem, Stack, Table, TableBody, TableCell, TableFooter, TableHead, TableRow, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import UpIcon from '@mui/icons-material/ArrowUpwardRounded'
import DownIcon from '@mui/icons-material/ArrowDownwardRounded'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { FinanceTabs, TILL_NAMES, tillOf } from '../components/FinanceTabs'
import { useAsync } from '../app/hooks'
import { BarChart, ShareBars, type BarPoint } from '../components/charts'
import { Empty, ErrorBox, Loading, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton, SortCell, useSort } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { addDays, currencySymbol, formatLocal, formatMoney, formatNumber, today, weekStart } from '../../shared/time'
import type { PayMethod, SalesDay, SalesItem } from '../../shared/types'
import { tokens } from '../theme'
import { msg, t, tr } from '../i18n'

// The periods to look at, each compared with the one before it (as Square's sales summary does).
type Period = 'today' | 'yesterday' | 'week' | 'lastweek' | 'month' | 'lastmonth' | '30'
const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: msg('Today') }, { id: 'yesterday', label: msg('Yesterday') },
  { id: 'week', label: msg('This week') }, { id: 'lastweek', label: msg('Last week') },
  { id: 'month', label: msg('This month') }, { id: 'lastmonth', label: msg('Last month') },
  { id: '30', label: msg('Last 30 days') },
]

/** The earlier period, in words ("last week"), in the current language: "vs …" under each figure, and the grey line's name. */
interface Range { from: string; to: string; prevFrom: string; prevTo: string; vs: string }

const monthStart = (d: string) => `${d.slice(0, 8)}01`
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)

/** The dates of a period and of the one it's compared with, the same number of days earlier on. */
function rangeOf(period: Period, day = today()): Range {
  const monday = weekStart(day), first = monthStart(day)
  const prevMonthEnd = addDays(first, -1), prevMonth = monthStart(prevMonthEnd)
  switch (period) {
    case 'today': return { from: day, to: day, prevFrom: addDays(day, -7), prevTo: addDays(day, -7), vs: t('last {weekday}', { weekday: formatLocal(`${day}T12:00:00Z`, 'EEEE') }) }
    case 'yesterday': { const y = addDays(day, -1); return { from: y, to: y, prevFrom: addDays(y, -7), prevTo: addDays(y, -7), vs: t('the {weekday} before', { weekday: formatLocal(`${y}T12:00:00Z`, 'EEEE') }) } }
    case 'week': return { from: monday, to: day, prevFrom: addDays(monday, -7), prevTo: addDays(day, -7), vs: t('last week') }
    case 'lastweek': return { from: addDays(monday, -7), to: addDays(monday, -1), prevFrom: addDays(monday, -14), prevTo: addDays(monday, -8), vs: t('the week before') }
    case 'month': {
      // The same days of last month (up to its last day: 31 March is compared with 28 February).
      const sameDay = addDays(prevMonth, daysBetween(first, day))
      return { from: first, to: day, prevFrom: prevMonth, prevTo: sameDay > prevMonthEnd ? prevMonthEnd : sameDay, vs: t('last month') }
    }
    case 'lastmonth': {
      const before = monthStart(addDays(prevMonth, -1))
      return { from: prevMonth, to: prevMonthEnd, prevFrom: before, prevTo: addDays(prevMonth, -1), vs: t('the month before') }
    }
    case '30': return { from: addDays(day, -29), to: day, prevFrom: addDays(day, -59), prevTo: addDays(day, -30), vs: t('the 30 days before') }
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
  if (!before) return <>{now ? t('nothing {previous} to compare', { previous: vs }) : t('vs {previous}', { previous: vs })}</>
  const pct = Math.round((now - before) / before * 100)
  if (pct === 0) return <>{t('same as {previous}', { previous: vs })}</>
  const up = pct > 0
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', color: up ? tokens.goodFg : tokens.badFg, fontWeight: 600 }}>
        {up ? <UpIcon sx={{ fontSize: 14 }} /> : <DownIcon sx={{ fontSize: 14 }} />}{Math.abs(pct)}%
      </Box>
      &nbsp;{t('vs {previous}', { previous: vs })}
    </Box>
  )
}

const METHOD_NAMES: Record<PayMethod, string> = { card: msg('Card'), wallet: 'Apple Pay / Google Pay', cash: msg('Cash'), other: msg('Other (gift cards, bank, external)') }
/** Monday to Sunday (1 to 7 January 2024), as a date the day names come from in the current language. */
const weekday = (i: number) => `2024-01-0${i + 1}T12:00:00Z`
const hourLabel = (h: number) => `${h}:00`
const wholeMoney = (n: number) => `${currencySymbol()}${formatNumber(Math.round(n))}`
const remembered = (): Period => {
  try { const p = localStorage.getItem('sales-period'); return PERIODS.some(x => x.id === p) ? p as Period : 'week' } catch { return 'week' }
}

type Metric = 'sales' | 'payments' | 'average'

/** Sales (under Finances): takings from Square, SumUp or Stripe like Square's own dashboard, with each figure next to the period before. */
export function SalesPage() {
  const { api, canSeePay, isPartner } = useApp()
  const [period, setPeriod] = useState<Period>(remembered)
  const [metric, setMetric] = useState<Metric>('sales')
  const day = today()
  const range = rangeOf(period, day)
  const integ = useAsync('integrations', () => api.integrations(), [])
  const till = tillOf(integ.data?.integrations)
  const on = !!till && canSeePay && !isPartner
  // One read covers both periods; best sellers are for the period itself.
  const sales = useAsync('sales-page', () => (on ? api.sales(range.prevFrom, range.to) : Promise.resolve(null)), [on, period, day])
  const items = useAsync('sales-items', () => (on ? api.salesItems(range.from, range.to) : Promise.resolve(null)), [on, period, day])

  if (!canSeePay || isPartner) {
    return <>
      <PageHeader eyebrow={t('Finances')} title={t('Sales')} />
      <Alert severity="info">{t('Sales are only visible to admins with pay access.')}</Alert>
    </>
  }
  const pick = (p: Period) => {
    setPeriod(p)
    try { localStorage.setItem('sales-period', p) } catch { /* storage unavailable */ }
  }
  const picker = (
    <TextField select size="small" value={period} onChange={e => pick(e.target.value as Period)} sx={{ minWidth: 170 }}
      slotProps={{ select: { SelectDisplayProps: { 'aria-label': t('Period') } } }}>
      {PERIODS.map(p => <MenuItem key={p.id} value={p.id}>{t(p.label)}</MenuItem>)}
    </TextField>
  )
  const name = TILL_NAMES[till?.provider ?? 'square']
  const header = <>
    <PageHeader eyebrow={t('Finances')} title={t('Sales')} actions={on && <>
      <Tag>{t('From {name}', { name })}</Tag>
      {picker}
    </>} />
    <FinanceTabs />
  </>
  if (!integ.data) return <>{header}<ErrorBox error={integ.error} /><Loading /></>
  if (!till) return <>{header}<ConnectFirst /></>

  const all = sales.data?.days ?? []
  const cur = fill(all, range.from, range.to)
  // The earlier period, lined up day for day with this one in the chart (it may be longer: last month had more days).
  const prev = fill(all, range.prevFrom, range.prevTo)
  const now = totals(cur), before = totals(prev)
  const single = range.from === range.to
  const periodName = t(PERIODS.find(p => p.id === period)!.label)
  const vs = range.vs
  const loaded = !!sales.data

  return (
    <>
      {header}
      <ErrorBox error={sales.error} />

      <StatGrid>
        <StatTile label={t('Gross sales')} value={loaded ? formatMoney(now.gross) : '–'} note={loaded && <Change now={now.gross} before={before.gross} vs={vs} />} />
        <StatTile label={t('Net sales')} value={loaded ? formatMoney(now.net) : '–'} note={loaded && (now.refunds ? t('after {amount} refunded', { amount: formatMoney(now.refunds) }) : t('no refunds'))} />
        <StatTile label={t('Transactions')} value={loaded ? formatNumber(now.payments) : '–'} note={loaded && <Change now={now.payments} before={before.payments} vs={vs} />} />
        <StatTile label={t('Average sale')} value={loaded ? formatMoney(now.average) : '–'} note={loaded && <Change now={now.average} before={before.average} vs={vs} />} />
      </StatGrid>

      <Card component="section" aria-label={t('Sales over time')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={!single && (
            <ToggleButtonGroup size="small" exclusive value={metric} onChange={(_, m: Metric | null) => m && setMetric(m)} aria-label={t('Measure')}>
              <ToggleButton value="sales">{t('Sales')}</ToggleButton>
              <ToggleButton value="payments">{t('Transactions')}</ToggleButton>
              <ToggleButton value="average">{t('Average')}</ToggleButton>
            </ToggleButtonGroup>
          )}>
            {single ? t('Sales by hour') : t('Sales over time')}
          </SectionTitle>
          {!loaded ? <Loading /> : single ? <HourChart today={cur[0]} before={prev[0]} periodName={periodName} vs={vs} /> : (
            <OverTime cur={cur} prev={prev} metric={metric} periodName={periodName} vs={vs} />
          )}
          {loaded && (
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
              {t('Tips {tips} on top of sales · refunds {refunds}', { tips: formatMoney(now.tips), refunds: formatMoney(now.refunds) })}
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
        <SectionTitle>{t('Connect your till to see your sales')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t("Sales reads your payments from Square, SumUp or Stripe (read only: it can't take, move or refund money) and shows them like Square's own dashboard: sales, transactions and average sale against the period before, the busiest hours and days, how people pay and, with Square, your best sellers.")}
        </Typography>
        <Box component="ol" sx={{ pl: 2.5, my: 0, '& li': { mb: 0.5 } }}>
          <li>{tr('Open {connections} and find {payments}.', { connections: <b>{t('Connections')}</b>, payments: <b>{t('Payments and sales')}</b> })}</li>
          <li>{tr("Press {connect} next to Square, SumUp or Stripe and sign in with the account the café's till uses.", { connect: <b>{t('Connect')}</b> })}</li>
          <li>{t("Allow access. You're brought back here, connected, with every active location included.")}</li>
        </Box>
        <Button component={RouterLink} to="/connections" variant="contained" sx={{ mt: 2 }}>{t('Go to Connections')}</Button>
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
  const format = metric === 'payments' ? (n: number) => t('{n} transactions', { n: formatNumber(Math.round(n)) }) : formatMoney
  const axis = metric === 'payments' ? (n: number) => formatNumber(Math.round(n)) : wholeMoney
  const what = metric === 'sales' ? t('Sales') : metric === 'payments' ? t('Transactions') : t('Average sale')
  return <BarChart points={points} format={format} axisFormat={axis} current={periodName} previous={cap(vs)}
    label={t('{what} per day, {period}, with {previous} as a line', { what, period: periodName.toLowerCase(), previous: vs })} />
}

/** One day by the hour, against the same hours of the day it's compared with. */
function HourChart({ today: day, before, periodName, vs }: { today?: SalesDay; before?: SalesDay; periodName: string; vs: string }) {
  const a = day?.hours ?? [], b = before?.hours ?? []
  const busy = Array.from({ length: 24 }, (_, h) => h).filter(h => (a[h] ?? 0) > 0 || (b[h] ?? 0) > 0)
  if (!day?.hours && !before?.hours) return <Empty>{t('No sales by the hour for this day.')}</Empty>
  // The opening hours (or whichever hours had sales), so the bars aren't lost in a night of zeros.
  const first = Math.min(8, ...busy), last = Math.max(17, ...busy)
  const points: BarPoint[] = Array.from({ length: last - first + 1 }, (_, i) => first + i)
    .map(h => ({ label: hourLabel(h), title: `${hourLabel(h)}–${hourLabel(h + 1)}`, value: a[h] ?? 0, prev: b[h] ?? 0 }))
  return <BarChart points={points} format={formatMoney} axisFormat={wholeMoney} current={periodName} previous={cap(vs)}
    label={t('Sales by hour, {period}, with {previous} as a line', { period: periodName.toLowerCase(), previous: vs })} />
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
    .map(h => ({ label: hourLabel(h), title: t('{hours}, on average', { hours: `${hourLabel(h)}–${hourLabel(h + 1)}` }), value: avg[h] }))
  return (
    <Panel title={t('Busiest hours')} note={t('Busiest at {hours}: {amount} an hour on average', { hours: `${hourLabel(peak)}–${hourLabel(peak + 1)}`, amount: formatMoney(avg[peak]) })}>
      <BarChart points={points} format={formatMoney} axisFormat={wholeMoney} height={180} label={t('Average sales in each hour of the day')} />
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
  const points = avg.map((v, i) => ({ label: formatLocal(weekday(i), 'EEE'), title: t('{weekday}s, on average', { weekday: formatLocal(weekday(i), 'EEEE') }), value: v }))
  return (
    <Panel title={t('Days of the week')} note={t('{weekday}s are best: {amount} on average', { weekday: formatLocal(weekday(best), 'EEEE'), amount: formatMoney(avg[best]) })}>
      <BarChart points={points} format={formatMoney} axisFormat={wholeMoney} height={180} label={t('Average sales on each day of the week')} />
    </Panel>
  )
}

/** How people paid (Square and SumUp: Stripe is all card). */
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
    .map(([k, v]) => ({ name: t(METHOD_NAMES[k]), value: v }))
  return (
    <Panel title={t('How people paid')}>
      {rows.length ? <ShareBars rows={rows} format={formatMoney} label={t('Sales by payment method')} /> : <Empty>{t('No sales yet.')}</Empty>}
    </Panel>
  )
}

function BestSellers({ data, error, periodName }: { data: { items: SalesItem[] | null; reason?: string } | null; error: string | null; periodName: string }) {
  const list = data?.items ?? []
  const total = list.reduce((s, i) => s + i.gross, 0)
  const { rows, sort } = useSort(list, { name: i => i.name, quantity: i => i.quantity, gross: i => i.gross }, { by: 'gross', dir: 'desc' }, ['quantity', 'gross'])
  const shown = rows.slice(0, 10)
  const table = (): ExportTable => ({
    title: t('Best sellers: {period}', { period: periodName.toLowerCase() }), filename: `best-sellers-${today()}`,
    columns: [t('Item'), t('Sold'), t('Sales ({currency})', { currency: currencySymbol() }), t('Share')],
    rows: rows.map(i => [i.name, i.quantity, i.gross, total ? `${Math.round(i.gross / total * 100)}%` : '']),
    money: [2],
  })
  return (
    <Card component="section" aria-label={t('Best sellers')} sx={{ minWidth: 0 }}>
      <CardContent>
        <SectionTitle action={list.length > 0 && <ExportButton table={table} folder="Sales" />}>{t('Best sellers')}</SectionTitle>
        <ErrorBox error={error} />
        {!data && !error && <Loading />}
        {data?.reason === 'stripe' && <Empty>{t("Stripe doesn't send what was sold, only the payments. Connect Square to see best sellers.")}</Empty>}
        {data?.reason === 'sumup' && <Empty>{t("SumUp doesn't send what was sold, only the payments. Connect Square to see best sellers.")}</Empty>}
        {data?.reason === 'reconnect' && (
          <Alert severity="info" action={<Button component={RouterLink} to="/connections" size="small">{t('Connections')}</Button>}>
            {t('Square was connected before best sellers were added. Connect Square again once to allow reading orders.')}
          </Alert>
        )}
        {data?.items && !list.length && <Empty>{t('Nothing sold in this period.')}</Empty>}
        {shown.length > 0 && (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label={t('Best sellers')}>
              <TableHead>
                <TableRow>
                  <SortCell sort={sort} id="name">{t('Item')}</SortCell>
                  <SortCell sort={sort} id="quantity" align="right">{t('Sold')}</SortCell>
                  <SortCell sort={sort} id="gross" align="right">{t('Sales')}</SortCell>
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
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>{t('Top 10 of {n}; export for the full list.', { n: rows.length })}</Typography>
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
  const sum = totals(days)
  const table = (): ExportTable => ({
    title: t('Sales by day: {period}', { period: periodName.toLowerCase() }), filename: `sales-${today()}`,
    columns: [t('Date'), t('Transactions'), t('Gross sales ({currency})', { currency: currencySymbol() }), t('Refunds'), t('Net sales'), t('Tips'), t('Average sale')],
    rows: rows.map(d => [d.date, d.payments, d.gross, d.refunds, d.gross - d.refunds, d.tips, d.payments ? d.gross / d.payments : 0]),
    footer: [t('Total'), sum.payments, sum.gross, sum.refunds, sum.net, sum.tips, sum.average],
    money: [2, 3, 4, 5, 6],
  })
  const num = { fontVariantNumeric: 'tabular-nums' }
  return (
    <Card component="section" aria-label={t('Sales by day')}>
      <CardContent>
        <SectionTitle action={<ExportButton table={table} folder="Sales" disabled={!rows.length} />}>{t('Sales by day')}</SectionTitle>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label={t('Sales by day')} sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                <SortCell sort={sort} id="date">{t('Date')}</SortCell>
                <SortCell sort={sort} id="payments" align="right">{t('Transactions')}</SortCell>
                <SortCell sort={sort} id="gross" align="right">{t('Gross sales')}</SortCell>
                <SortCell sort={sort} id="refunds" align="right">{t('Refunds')}</SortCell>
                <SortCell sort={sort} id="net" align="right">{t('Net sales')}</SortCell>
                <SortCell sort={sort} id="tips" align="right">{t('Tips')}</SortCell>
                <SortCell sort={sort} id="average" align="right">{t('Average sale')}</SortCell>
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
                <TableCell>{t('Total')}</TableCell>
                <TableCell align="right">{formatNumber(sum.payments)}</TableCell>
                <TableCell align="right">{formatMoney(sum.gross)}</TableCell>
                <TableCell align="right">{formatMoney(sum.refunds)}</TableCell>
                <TableCell align="right">{formatMoney(sum.net)}</TableCell>
                <TableCell align="right">{formatMoney(sum.tips)}</TableCell>
                <TableCell align="right">{formatMoney(sum.average)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Box>
        <Stack direction="row" sx={{ mt: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('Gross sales are completed payments before tips; net sales take refunds off. Days run midnight to midnight, Madrid time.')}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  )
}
