import {
  Alert, Box, Button, Card, CardContent, Link, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import UpIcon from '@mui/icons-material/ArrowUpwardRounded'
import DownIcon from '@mui/icons-material/ArrowDownwardRounded'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { BarChart, ShareBars, type BarPoint } from '../components/charts'
import { Empty, ErrorBox, Loading, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton, SortCell, useSort } from '../components/tables'
import { Freshness } from '../components/Freshness'
import { locale, msg, t, tc } from '../i18n'
import type { ExportTable } from '../lib/export'
import { addDays, formatLocal, formatNumber, today } from '../../shared/time'
import type { SearchReport, SearchRow } from '../../shared/types'
import { tokens } from '../theme'

// Google shares search data two to three days late, so every period ends three days ago.
const LAG = 3
type Period = '7' | '28' | '90'
const PERIODS: { id: Period; label: string; vs: string }[] = [
  { id: '7', label: msg('Last 7 days'), vs: msg('the 7 days before') },
  { id: '28', label: msg('Last 28 days'), vs: msg('the 28 days before') },
  { id: '90', label: msg('Last 3 months'), vs: msg('the 3 months before') },
]
const remembered = (): Period => {
  try { const p = localStorage.getItem('analytics-period'); return PERIODS.some(x => x.id === p) ? p as Period : '28' } catch { return '28' }
}

const percent = (n: number) => `${formatNumber(Math.round(n * 1000) / 10)}%`
const position = (n: number) => formatNumber(Math.round(n * 10) / 10)
/** The site as people know it: no https://, no trailing slash, no "sc-domain:". */
const siteName = (s: string) => s.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, '')
const pathOf = (url: string) => { try { const u = new URL(url); return u.pathname + u.search || '/' } catch { return url } }

// Google gives countries as three-letter codes; the browser names them from the two-letter ones.
const ALPHA2: Record<string, string> = {
  esp: 'ES', gbr: 'GB', irl: 'IE', usa: 'US', fra: 'FR', deu: 'DE', ita: 'IT', prt: 'PT', nld: 'NL', bel: 'BE', che: 'CH',
  aut: 'AT', swe: 'SE', nor: 'NO', dnk: 'DK', fin: 'FI', pol: 'PL', mar: 'MA', can: 'CA', aus: 'AU', mex: 'MX', arg: 'AR',
  bra: 'BR', col: 'CO', rus: 'RU', ukr: 'UA', rou: 'RO', gib: 'GI', and: 'AD', lux: 'LU', isr: 'IL', are: 'AE', ind: 'IN', chn: 'CN',
}
function countryName(code: string) {
  const two = ALPHA2[code.toLowerCase()]
  try { return two ? new Intl.DisplayNames([locale()], { type: 'region' }).of(two) ?? code.toUpperCase() : code.toUpperCase() } catch { return code.toUpperCase() }
}
const DEVICES: Record<string, string> = { MOBILE: msg('Phones'), DESKTOP: msg('Computers'), TABLET: msg('Tablets') }

/** "▲ 12% vs the 28 days before"; for position, lower is better. */
function Change({ now, before, vs, lowerIsBetter }: { now: number; before?: number; vs: string; lowerIsBetter?: boolean }) {
  if (!before) return <>{t('vs {period}', { period: vs })}</>
  const pct = Math.round((now - before) / before * 100)
  if (pct === 0) return <>{t('same as {period}', { period: vs })}</>
  const good = lowerIsBetter ? pct < 0 : pct > 0
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', color: good ? tokens.goodFg : tokens.badFg, fontWeight: 600 }}>
        {pct > 0 ? <UpIcon sx={{ fontSize: 14 }} /> : <DownIcon sx={{ fontSize: 14 }} />}{Math.abs(pct)}%
      </Box>
      {'\u00a0'}{t('vs {period}', { period: vs })}
    </Box>
  )
}

/** Analytics: how people find the business's website on Google, from Search Console. Admins only. */
export function AnalyticsPage() {
  const { api, business } = useApp()
  const [period, setPeriod] = useState<Period>(remembered)
  const integ = useAsync('integrations', () => api.integrations(), [])
  const row = integ.data?.integrations.find(i => i.provider === 'search_console')
  const on = row?.status === 'connected'
  const days = Number(period)
  const to = addDays(today(), -LAG), from = addDays(to, -(days - 1))
  const prevTo = addDays(from, -1), prevFrom = addDays(prevTo, -(days - 1))
  const report = useAsync('search-console', () => (on ? api.searchConsole(from, to) : Promise.resolve(null)), [on, from, to])
  const before = useAsync('search-console', () => (on ? api.searchConsole(prevFrom, prevTo) : Promise.resolve(null)), [on, prevFrom, prevTo])
  const pick = (p: Period) => {
    setPeriod(p)
    try { localStorage.setItem('analytics-period', p) } catch { /* storage unavailable */ }
  }
  const info = PERIODS.find(p => p.id === period)!
  const r = report.data, b = before.data
  const site = r?.site ?? (row?.external.site as string | undefined)

  const header = (
    <PageHeader title={t('Analytics')} actions={on && <>
      {site && <Tag>{siteName(site)}</Tag>}
      <TextField select size="small" value={period} onChange={e => pick(e.target.value as Period)} sx={{ minWidth: 170 }}
        slotProps={{ select: { SelectDisplayProps: { 'aria-label': t('Period') } } }}>
        {PERIODS.map(p => <MenuItem key={p.id} value={p.id}>{t(p.label)}</MenuItem>)}
      </TextField>
    </>} />
  )
  if (!integ.data) return <>{header}<ErrorBox error={integ.error} /><Loading /></>
  if (!row || row.status === 'disconnected' || row.status === 'needs_setup') return <>{header}<ConnectFirst website={business?.website ?? null} /></>
  if (row.status === 'pending') {
    return <>{header}<Alert severity="info" action={<Button component={RouterLink} to="/connections" size="small">{t('Connections')}</Button>}>
      {t('Search Console is connected. Pick which website to show on the Connections page.')}
    </Alert></>
  }
  if (row.status === 'error') {
    return <>{header}<Alert severity="error" action={<Button component={RouterLink} to="/connections" size="small">{t('Fix')}</Button>}>
      {row.last_error ?? t('Search Console isn’t working. Connect it again on the Connections page.')}
    </Alert></>
  }

  const vs = t(info.vs)
  const tile = (label: string, value: (x: SearchRow) => number, show: (n: number) => string, lowerIsBetter?: boolean) => (
    <StatTile label={label} value={r ? show(value(r.totals)) : '–'}
      note={r && <Change now={value(r.totals)} before={b ? value(b.totals) : undefined} vs={vs} lowerIsBetter={lowerIsBetter} />} />
  )
  return (
    <>
      {header}
      <ErrorBox error={report.error} />
      <StatGrid>
        {tile(t('Clicks'), x => x.clicks, n => formatNumber(n))}
        {tile(t('Times shown'), x => x.impressions, n => formatNumber(n))}
        {tile(t('Click rate'), x => x.ctr, percent)}
        {tile(t('Average position'), x => x.position, position, true)}
      </StatGrid>
      {!r ? <Loading /> : <>
        <Card component="section" aria-label={t('Clicks from Google')} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle>{t('Clicks from Google')}</SectionTitle>
            <ClicksChart report={r} before={b} periodName={t(info.label)} vs={vs} />
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
              {t('Google shares search data a few days late: this runs to {date}.', { date: formatLocal(`${to}T12:00:00Z`, 'd MMMM') })}
            </Typography>
            <Freshness id="search" at={r.fetched_at} sx={{ mt: 0.5 }} />
          </CardContent>
        </Card>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, alignItems: 'start', gap: 2, mb: 3 }}>
          <TopTable title={t('What people searched for')} column={tc('search', 'Search')} rows={r.queries.map(q => ({ ...q, key: q.query }))} filename="searches" />
          <TopTable title={t('Pages they landed on')} column={t('Page')} rows={r.pages.map(p => ({ ...p, key: pathOf(p.page), href: p.page }))} filename="pages" />
          <Panel title={t('Devices')}>
            {r.devices.length ? <ShareBars rows={r.devices.map(d => ({ name: DEVICES[d.device] ? t(DEVICES[d.device]) : d.device, value: d.clicks }))}
              format={n => t('{n} clicks', { n: formatNumber(n) })} label={t('Clicks by device')} /> : <Empty>{t('No clicks yet.')}</Empty>}
          </Panel>
          <Panel title={t('Countries')}>
            {r.countries.length ? <ShareBars rows={r.countries.slice(0, 8).map(c => ({ name: countryName(c.country), value: c.clicks }))}
              format={n => t('{n} clicks', { n: formatNumber(n) })} label={t('Clicks by country')} /> : <Empty>{t('No clicks yet.')}</Empty>}
          </Panel>
        </Box>
      </>}
    </>
  )
}

function ClicksChart({ report, before, periodName, vs }: { report: SearchReport; before: SearchReport | null; periodName: string; vs: string }) {
  const by = new Map(report.days.map(d => [d.date, d]))
  const prev = new Map((before?.days ?? []).map(d => [d.date, d]))
  const n = Math.round((Date.parse(`${report.to}T12:00:00Z`) - Date.parse(`${report.from}T12:00:00Z`)) / 86_400_000) + 1
  const many = n > 10
  const points: BarPoint[] = Array.from({ length: n }, (_, i) => {
    const date = addDays(report.from, i)
    return {
      label: formatLocal(`${date}T12:00:00Z`, many ? 'd MMM' : 'EEE d'), title: formatLocal(`${date}T12:00:00Z`, 'EEEE d MMMM'),
      value: by.get(date)?.clicks ?? 0, prev: before ? prev.get(addDays(date, -n))?.clicks ?? 0 : undefined,
    }
  })
  if (!report.days.length) return <Empty>{t('No clicks from Google in this period yet.')}</Empty>
  const cap = vs.charAt(0).toUpperCase() + vs.slice(1)
  return <BarChart points={points} format={c => t('{n} clicks', { n: formatNumber(c) })} axisFormat={c => formatNumber(Math.round(c))}
    current={periodName} previous={cap} label={t('Clicks per day, {period}, with {before} as a line', { period: periodName.toLowerCase(), before: vs })} />
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card component="section" aria-label={title} sx={{ minWidth: 0 }}>
      <CardContent><SectionTitle>{title}</SectionTitle>{children}</CardContent>
    </Card>
  )
}

type TopRow = SearchRow & { key: string; href?: string }

/** The top searches or pages, sortable, with clicks, times shown, click rate and position. */
function TopTable({ title, column, rows: list, filename }: { title: string; column: string; rows: TopRow[]; filename: string }) {
  const { rows, sort } = useSort(list, { key: x => x.key, clicks: x => x.clicks, impressions: x => x.impressions, ctr: x => x.ctr, position: x => x.position },
    { by: 'clicks', dir: 'desc' }, ['clicks', 'impressions', 'ctr'])
  const table = (): ExportTable => ({
    title, filename: `${filename}-${today()}`,
    columns: [column, t('Clicks'), t('Times shown'), t('Click rate'), t('Average position')],
    rows: rows.map(x => [x.key, x.clicks, x.impressions, percent(x.ctr), Math.round(x.position * 10) / 10]),
  })
  return (
    <Card component="section" aria-label={title} sx={{ minWidth: 0 }}>
      <CardContent>
        <SectionTitle action={list.length > 0 && <ExportButton table={table} folder="Analytics" />}>{title}</SectionTitle>
        {!list.length ? <Empty>{t('Nothing yet for this period.')}</Empty> : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label={title}>
              <TableHead>
                <TableRow>
                  <SortCell sort={sort} id="key">{column}</SortCell>
                  <SortCell sort={sort} id="clicks" align="right">{t('Clicks')}</SortCell>
                  <SortCell sort={sort} id="impressions" align="right">{t('Shown')}</SortCell>
                  <SortCell sort={sort} id="position" align="right">{tc('search', 'Position')}</SortCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.slice(0, 10).map(x => (
                  <TableRow key={x.key} hover>
                    <TableCell sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {x.href ? <Link href={x.href} target="_blank" rel="noreferrer" underline="hover" color="inherit">{x.key}</Link> : x.key}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{formatNumber(x.clicks)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(x.impressions)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{position(x.position)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

/** Not connected yet: what it shows and how to connect it. */
function ConnectFirst({ website }: { website: string | null }) {
  return (
    <Card>
      <CardContent>
        <SectionTitle>{t('Connect Search Console to see how people find you on Google')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('Google Search Console is free. It shows what people searched for before they clicked through to your website, how often your site came up, and which pages they landed on. Business Agent only reads it.')}
        </Typography>
        <Box component="ol" sx={{ pl: 2.5, my: 0, '& li': { mb: 0.5 } }}>
          <li>{website
            ? t('Make sure {site} is added and verified in Search Console (search.google.com/search-console).', { site: siteName(website) })
            : t('Add your website on the Business page, and make sure it is verified in Search Console (search.google.com/search-console).')}</li>
          <li>{t('Open Connections, find Analytics, and press Connect next to Search Console.')}</li>
          <li>{t('Sign in with the Google account that owns the website in Search Console. Your site is picked automatically.')}</li>
        </Box>
        <Button component={RouterLink} to="/connections" variant="contained" sx={{ mt: 2 }}>{t('Go to Connections')}</Button>
      </CardContent>
    </Card>
  )
}
