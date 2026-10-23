import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Link, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material'
import PassIcon from '@mui/icons-material/CheckCircleOutlineRounded'
import WarnIcon from '@mui/icons-material/ErrorOutlineRounded'
import FailIcon from '@mui/icons-material/HighlightOff'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import { Freshness } from '../components/Freshness'
import type { ExportTable } from '../lib/export'
import { addDays, formatLocal, formatNumber, today } from '../../shared/time'
import {
  consistency, scoreLevel, vitalLevel, type CheckLevel, type ConsistencyField, type PageSpeed, type SeoItem, type Strategy, type WebsiteReport,
} from '../../shared/seo'
import { DAY_KEYS, type DayKey } from '../../shared/types'
import { tokens } from '../theme'
import { msg, t } from '../i18n'

const LEVEL: Record<CheckLevel, { icon: ReactNode; fg: string; bg: string; label: string }> = {
  pass: { icon: <PassIcon fontSize="small" />, fg: tokens.goodFg, bg: tokens.goodBg, label: msg('Fine') },
  warn: { icon: <WarnIcon fontSize="small" />, fg: tokens.warnFg, bg: tokens.warnBg, label: msg('Worth a look') },
  fail: { icon: <FailIcon fontSize="small" />, fg: tokens.badFg, bg: tokens.badBg, label: msg('To fix') },
}
const FIELD: Record<ConsistencyField, string> = { name: msg('Name'), phone: msg('Phone'), address: msg('Address'), hours: msg('Opening hours') }
const SCORES: { key: keyof PageSpeed['scores']; label: string }[] = [
  { key: 'performance', label: msg('Speed') }, { key: 'accessibility', label: msg('Accessibility') },
  { key: 'best_practices', label: msg('Best practices') }, { key: 'seo', label: msg('SEO') },
]
/** "mon, sun" → "Monday, Sunday" in the person's language (28 Sep 2026 was a Monday). */
const dayNames = (keys: string) => keys.split(', ').map(k => {
  const i = DAY_KEYS.indexOf(k as DayKey)
  return i < 0 ? k : formatLocal(`${addDays('2026-09-28', i)}T12:00:00Z`, 'EEEE')
}).join(', ')
const itemText = (i: SeoItem) => t(i.title, i.vars?.days ? { ...i.vars, days: dayNames(String(i.vars.days)) } : i.vars)
const host = (url: string) => { try { return new URL(url).host } catch { return url } }

/** Website & SEO: what Google and shared links see on the business's website, how fast it is, and whether its details match. Admins only. */
export function WebsitePage() {
  const { api, business } = useApp()
  const run = useAction()
  const data = useAsync('website', () => api.website(), [])
  const [checking, setChecking] = useState(false)
  const [testing, setTesting] = useState<Strategy | null>(null)
  const w = data.data
  const report = w?.report ?? null
  const items = report?.items ?? []

  const check = async () => {
    setChecking(true)
    await run(() => api.checkWebsite(), t('Website checked'))
    setChecking(false)
  }
  const speed = async (s: Strategy) => {
    setTesting(s)
    await run(() => api.pageSpeed(s))
    setTesting(null)
  }

  const table = (): ExportTable => ({
    title: t('SEO check: {site}', { site: host(report!.url) }),
    filename: `seo-check-${today()}`,
    columns: [t('Result'), t('Check'), t('How to fix it'), t('Pages')],
    rows: items.map(i => [t(LEVEL[i.level].label), itemText(i), i.fix ? t(i.fix) : '', (i.pages ?? []).join(' · ')]),
  })

  return (
    <>
      <PageHeader eyebrow={t('Marketing')} title={t('Website & SEO')} actions={<>
        {w?.website && <Button variant="contained" startIcon={checking ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
          disabled={checking} onClick={() => void check()}>{report ? t('Check again') : t('Check the website')}</Button>}
        <ExportButton table={table} disabled={!items.length} folder="Marketing" />
      </>} />
      <ErrorBox error={data.error} />

      {w && !w.website && (
        <Alert severity="info" sx={{ mb: 3 }} action={<Button component={RouterLink} to="/business" color="inherit">{t('Business')}</Button>}>
          {t('Add the website’s address on the Business page to check it.')}
        </Alert>
      )}
      {w?.website && (
        <Typography sx={{ mb: 2 }}>
          <Link href={w.website} target="_blank" rel="noopener">{host(w.website)}</Link>
          {report && <Box component="span" sx={{ color: 'text.secondary' }}> · {t('Checked {when}', { when: formatLocal(report.checked_at, 'd MMM, HH:mm') })}</Box>}
        </Typography>
      )}

      {report && (
        <StatGrid>
          <StatTile label={t('To fix')} value={report.score.fail} />
          <StatTile label={t('Worth a look')} value={report.score.warn} />
          <StatTile label={t('Fine')} value={report.score.pass} />
          <StatTile label={t('Pages checked')} value={report.pages.length} />
        </StatGrid>
      )}

      {w?.website && !report && !checking && (
        <Alert severity="info" sx={{ mb: 3 }}>{t('Check the website to see what Google and people sharing a link see, and what to fix.')}</Alert>
      )}

      {report && (
        <Card component="section" aria-label={t('SEO check')} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle>{t('SEO check')}</SectionTitle>
            <Stack component="ul" spacing={1.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {items.map(i => (
                <Box component="li" key={i.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', p: 1.5, borderRadius: 2, bgcolor: i.level === 'pass' ? 'transparent' : LEVEL[i.level].bg }}>
                  <Box sx={{ color: LEVEL[i.level].fg, display: 'flex', pt: 0.25 }} aria-label={t(LEVEL[i.level].label)} role="img">{LEVEL[i.level].icon}</Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: i.level === 'pass' ? 400 : 600 }}>{itemText(i)}</Typography>
                    {typeof i.vars?.text === 'string' && <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>“{i.vars.text}”</Typography>}
                    {i.fix && <Typography variant="body2">{t(i.fix)}</Typography>}
                    {i.pages && <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                      {i.pages.map(p => <Typography component="li" variant="body2" key={p} sx={{ overflowWrap: 'anywhere' }}>{p}</Typography>)}
                    </Box>}
                  </Box>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {w?.website && (
        <Card component="section" aria-label={t('Speed and quality (Google PageSpeed)')} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle>{t('Speed and quality (Google PageSpeed)')}</SectionTitle>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              {(['mobile', 'desktop'] as const).map(s => (
                <SpeedCard key={s} strategy={s} result={w.pagespeed[s] ?? null} busy={testing === s} disabled={testing !== null} onTest={() => void speed(s)} />
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {report && business && <Consistency report={report} />}
      {w?.website && <OnGoogle />}
    </>
  )
}

function SpeedCard({ strategy, result, busy, disabled, onTest }: { strategy: Strategy; result: PageSpeed | null; busy: boolean; disabled: boolean; onTest: () => void }) {
  const name = strategy === 'mobile' ? t('On a phone') : t('On a computer')
  const tone = (l: CheckLevel | null) => (l ? LEVEL[l] : { fg: tokens.neutralFg, bg: tokens.neutralBg })
  const ms = (v: number | null) => (v === null ? '–' : t('{s} s', { s: formatNumber(Math.round(v / 100) / 10) }))
  return (
    <Box component="section" aria-label={name} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography sx={{ fontWeight: 600 }}>{name}</Typography>
        <Button size="small" onClick={onTest} disabled={disabled} startIcon={busy ? <CircularProgress size={14} /> : undefined}>
          {busy ? t('Testing… (up to a minute)') : result ? t('Test again') : t('Test')}
        </Button>
      </Stack>
      {!result ? <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Not tested yet.')}</Typography> : <>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 1.5 }}>
          {SCORES.map(x => {
            const v = result.scores[x.key]
            return <Tag key={x.key} {...tone(scoreLevel(v))}>{t(x.label)}: {v ?? '–'}</Tag>
          })}
        </Stack>
        <Table size="small" aria-label={t('Core Web Vitals, {where}', { where: name })}>
          <TableBody>
            <TableRow><TableCell>{t('Main content shows (LCP)')}</TableCell><TableCell align="right"><Tag {...tone(vitalLevel('lcp_ms', result.vitals.lcp_ms))}>{ms(result.vitals.lcp_ms)}</Tag></TableCell></TableRow>
            <TableRow><TableCell>{t('Layout jumps (CLS)')}</TableCell><TableCell align="right"><Tag {...tone(vitalLevel('cls', result.vitals.cls))}>{result.vitals.cls === null ? '–' : formatNumber(result.vitals.cls)}</Tag></TableCell></TableRow>
            {result.vitals.inp_ms !== null && <TableRow><TableCell>{t('Reacts to a tap (INP)')}</TableCell><TableCell align="right"><Tag {...tone(vitalLevel('inp_ms', result.vitals.inp_ms))}>{t('{ms} ms', { ms: result.vitals.inp_ms })}</Tag></TableCell></TableRow>}
          </TableBody>
        </Table>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
          {result.vitals.field ? t('From real visitors over the last 28 days (Chrome).') : t('From Google’s test run: not enough visitors yet for real-world figures.')}
        </Typography>
        {result.opportunities.length > 0 && <>
          <Typography variant="body2" sx={{ fontWeight: 600, mt: 1.5 }}>{t('Biggest savings')}</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>{result.opportunities.map(o => <Typography component="li" variant="body2" key={o}>{o}</Typography>)}</Box>
        </>}
      </>}
    </Box>
  )
}

/** Name, phone, address and hours: the app, the website and Google Maps should all say the same. */
function Consistency({ report }: { report: WebsiteReport }) {
  const { business } = useApp()
  const rows = consistency({ name: business!.name, phone: business!.phone, address: business!.address, opening_hours: business!.opening_hours },
    report.site_business, report.google_listing)
  const cell = (v: string | null) => v ?? <Box component="span" sx={{ color: 'text.secondary' }}>–</Box>
  return (
    <Card component="section" aria-label={t('Same details everywhere')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('Same details everywhere')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('Google trusts a business more when its name, address, phone and hours match on the website, in Google Maps and everywhere else.')}
        </Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell /><TableCell>{t('In the app')}</TableCell><TableCell>{t('On the website')}</TableCell><TableCell>{t('On Google Maps')}</TableCell><TableCell />
            </TableRow></TableHead>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.field}>
                  <TableCell sx={{ fontWeight: 600 }}>{t(FIELD[r.field])}</TableCell>
                  <TableCell>{cell(r.app)}</TableCell><TableCell>{cell(r.website)}</TableCell><TableCell>{cell(r.google)}</TableCell>
                  <TableCell>{r.matches === null ? null : r.matches
                    ? <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Matches')}</Tag>
                    : <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Different')}</Tag>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  )
}

/** The last 28 days on Google Search (the full report is on Analytics). */
function OnGoogle() {
  const { api } = useApp()
  const integ = useAsync('integrations', () => api.integrations(), [])
  const on = integ.data?.integrations.find(i => i.provider === 'search_console')?.status === 'connected'
  const to = addDays(today(), -3), from = addDays(to, -27)
  const report = useAsync('search-console', () => (on ? api.searchConsole(from, to) : Promise.resolve(null)), [on, from, to])
  return (
    <Card component="section" aria-label={t('On Google Search')}>
      <CardContent>
        <SectionTitle action={on ? <Button component={RouterLink} to="/analytics">{t('Full report')}</Button> : undefined}>{t('On Google Search')}</SectionTitle>
        {!on ? (
          <Typography variant="body2">
            {t('Connect Search Console to see what people search for before they find the website.')}{' '}
            <Link component={RouterLink} to="/connections">{t('Connections')}</Link>
          </Typography>
        ) : !report.data ? <ErrorBox error={report.error} /> : <>
          <Freshness id="search" at={report.data.fetched_at} sx={{ mb: 1 }} />
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            {t('Last 28 days: {clicks} clicks from {impressions} times shown, average position {position}.', {
              clicks: formatNumber(report.data.totals.clicks), impressions: formatNumber(report.data.totals.impressions), position: formatNumber(report.data.totals.position) })}
          </Typography>
          <Table size="small" aria-label={t('Top searches')}>
            <TableHead><TableRow><TableCell>{t('Top searches')}</TableCell><TableCell align="right">{t('Clicks')}</TableCell><TableCell align="right">{t('Position')}</TableCell></TableRow></TableHead>
            <TableBody>
              {report.data.queries.slice(0, 5).map(q => (
                <TableRow key={q.query}><TableCell>{q.query}</TableCell><TableCell align="right">{formatNumber(q.clicks)}</TableCell><TableCell align="right">{formatNumber(q.position)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </>}
      </CardContent>
    </Card>
  )
}
