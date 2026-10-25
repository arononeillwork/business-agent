import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, LinearProgress, MenuItem, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import CopyIcon from '@mui/icons-material/ContentCopyOutlined'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { BarChart, type BarPoint } from '../components/charts'
import { Empty, ErrorBox, Loading, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { SortCell, useSort } from '../components/tables'
import { tillsOf } from '../components/till'
import { Freshness } from '../components/Freshness'
import {
  AD_PLATFORMS, CREATE_CAMPAIGN_URL, PLATFORM_NAMES, allCampaigns, costPerResult, ctr, mergeDays, pacing, totalsOf, utmLink,
  type AdCampaign, type AdPlatform, type AdSettings, type CampaignPatch,
} from '../../shared/ads'
import { addDays, currencySymbol, formatLocal, formatMoney, formatNumber, today } from '../../shared/time'
import type { Integration } from '../../shared/types'
import { tokens } from '../theme'
import { msg, t, tn, tr } from '../i18n'

// What the ad platforms report, so the periods include today (their figures for today are partial).
type Period = '7' | '30' | 'month' | 'lastmonth'
const PERIODS: { id: Period; label: string }[] = [
  { id: '7', label: msg('Last 7 days') }, { id: '30', label: msg('Last 30 days') },
  { id: 'month', label: msg('This month') }, { id: 'lastmonth', label: msg('Last month') },
]
const monthStart = (d: string) => `${d.slice(0, 8)}01`
function rangeOf(period: Period, day = today()) {
  if (period === 'month') return { from: monthStart(day), to: day }
  if (period === 'lastmonth') { const end = addDays(monthStart(day), -1); return { from: monthStart(end), to: end } }
  return { from: addDays(day, -(Number(period) - 1)), to: day }
}
const remembered = (): Period => {
  try { const p = localStorage.getItem('ads-period'); return PERIODS.some(x => x.id === p) ? p as Period : '30' } catch { return '30' }
}

const percent = (n: number | null) => (n === null ? '–' : `${formatNumber(Math.round(n * 1000) / 10)}%`)
const money = (n: number | null) => (n === null ? '–' : formatMoney(n))
const wholeMoney = (n: number) => `${currencySymbol()}${formatNumber(Math.round(n))}`
const shortDate = (d: string, many: boolean) => formatLocal(`${d}T12:00:00Z`, many ? 'd MMM' : 'EEE d')
const longDate = (d: string) => formatLocal(`${d}T12:00:00Z`, 'EEEE d MMMM')
const STATUS: Record<AdCampaign['status'], string> = { active: msg('Active'), paused: msg('Paused'), other: msg('Ended') }

/**
 * Ads: Meta (Facebook and Instagram) and Google side by side, read live from each platform, with
 * the till's takings for the same days, monthly limits and each campaign's pause and budget.
 * Admins with pay access (ad spend is money).
 */
export function AdsPage() {
  const { api, canSeePay, isPartner } = useApp()
  const [period, setPeriod] = useState<Period>(remembered)
  const [metric, setMetric] = useState<'spend' | 'takings'>('spend')
  const day = today()
  const range = rangeOf(period, day)
  const integ = useAsync('integrations', () => api.integrations(), [])
  const rows = AD_PLATFORMS.map(p => integ.data?.integrations.find(i => i.provider === p))
  const connected = AD_PLATFORMS.filter((_, i) => rows[i]?.status === 'connected' || rows[i]?.status === 'error')
  const on = connected.length > 0 && canSeePay && !isPartner
  const tills = tillsOf(integ.data?.integrations)
  const report = useAsync('ads-report', () => (on ? api.adsReport(range.from, range.to) : Promise.resolve(null)), [on, period, day])
  // This month so far, for the monthly limits (the same read when the period is this month).
  const month = useAsync('ads-report', () => (on ? api.adsReport(monthStart(day), day) : Promise.resolve(null)), [on, 'month', day])
  const takings = useAsync('ads-takings', () => (on && tills.length ? api.sales(range.from, range.to).catch(() => null) : Promise.resolve(null)), [on, tills.length, period, day])
  const settings = useAsync('ad-settings', () => (on ? api.adSettings() : Promise.resolve(null)), [on])

  if (!canSeePay || isPartner) {
    return <>
      <PageHeader eyebrow={t('Marketing')} title={t('Ads')} />
      <Alert severity="info">{t('Ads are only visible to admins with pay access.')}</Alert>
    </>
  }
  const pick = (p: Period) => {
    setPeriod(p)
    try { localStorage.setItem('ads-period', p) } catch { /* storage unavailable */ }
  }
  const header = (
    <PageHeader eyebrow={t('Marketing')} title={t('Ads')} actions={on && (
      <TextField select size="small" value={period} onChange={e => pick(e.target.value as Period)} sx={{ minWidth: 170 }}
        slotProps={{ select: { SelectDisplayProps: { 'aria-label': t('Period') } } }}>
        {PERIODS.map(p => <MenuItem key={p.id} value={p.id}>{t(p.label)}</MenuItem>)}
      </TextField>
    )} />
  )
  const fresh = report.data && <Box sx={{ mt: -2, mb: 2 }}><Freshness id="ads" at={report.data.fetched_at} /></Box>
  if (!integ.data) return <>{header}<ErrorBox error={integ.error} /><Loading /></>
  const waiting = AD_PLATFORMS.filter((_, i) => rows[i]?.status === 'pending')
  const notYet = AD_PLATFORMS.filter((_, i) => !rows[i] || ['disconnected', 'needs_setup'].includes(rows[i]!.status))
  if (!connected.length) return <>{header}<PlatformStatus waiting={waiting} rows={rows} /><ConnectFirst /><UtmBuilder /></>

  const r = report.data
  const platforms = r?.platforms ?? []
  const totals = totalsOf(platforms)
  const days = r ? mergeDays(platforms, range.from, range.to > day ? day : range.to) : []
  const periodName = t(PERIODS.find(p => p.id === period)!.label)
  const takingsByDay = new Map((takings.data?.days ?? []).map(d => [d.date, d.gross]))
  const takingsTotal = [...takingsByDay.values()].reduce((s, n) => s + n, 0)
  const many = days.length > 10
  const points: BarPoint[] = days.map(d => ({ label: shortDate(d.date, many), title: longDate(d.date), value: metric === 'spend' ? d.spend : takingsByDay.get(d.date) ?? 0 }))

  return (
    <>
      {header}
      {fresh}
      <ErrorBox error={report.error} />
      {r?.failed?.map(f => (
        <Alert key={f.platform} severity="warning" sx={{ mb: 2 }}>{t('{app} couldn’t be read just now, so its ads aren’t included: {reason}', { app: PLATFORM_NAMES[f.platform], reason: f.error })}</Alert>
      ))}
      <PlatformStatus waiting={waiting} rows={rows} />

      <StatGrid>
        <StatTile label={t('Spent on ads')} value={r ? formatMoney(totals.spend) : '–'}
          note={r && tn(platforms.length, 'on {n} platform', 'on {n} platforms')} />
        <StatTile label={t('Results')} value={r ? formatNumber(Math.round(totals.results)) : '–'} note={t('purchases, leads, messages, conversions')} />
        <StatTile label={t('Cost per result')} value={r ? money(costPerResult(totals)) : '–'} />
        <StatTile label={t('Clicks')} value={r ? formatNumber(totals.clicks) : '–'}
          note={r && t('{rate} of {n} times shown', { rate: percent(ctr(totals)), n: formatNumber(totals.impressions) })} />
      </StatGrid>

      <Card component="section" aria-label={t('Ad spend over time')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={takings.data && (
            <ToggleButtonGroup size="small" exclusive value={metric} onChange={(_, m: 'spend' | 'takings' | null) => m && setMetric(m)} aria-label={t('Measure')}>
              <ToggleButton value="spend">{t('Ad spend')}</ToggleButton>
              <ToggleButton value="takings">{t('Takings')}</ToggleButton>
            </ToggleButtonGroup>
          )}>
            {metric === 'spend' ? t('Ad spend over time') : t('Takings over time')}
          </SectionTitle>
          {!r ? <Loading /> : <BarChart points={points} format={formatMoney} axisFormat={wholeMoney}
            label={metric === 'spend' ? t('Ad spend per day, {period}', { period: periodName.toLowerCase() }) : t('Takings per day, {period}', { period: periodName.toLowerCase() })} />}
          {r && takings.data && totals.spend > 0 && (
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
              {t('Takings in the same days: {takings}, or {each} for every {one} spent on ads. Not all of it came from the ads.', {
                takings: formatMoney(takingsTotal), each: formatMoney(takingsTotal / totals.spend), one: formatMoney(1) })}
            </Typography>
          )}
        </CardContent>
      </Card>

      {settings.data && month.data && (
        <Limits settings={settings.data} spentThisMonth={Object.fromEntries(month.data.platforms.map(p => [p.platform, p.totals.spend]))}
          platforms={month.data.platforms.map(p => p.platform)} day={day} reload={settings.reload} />
      )}

      {r && <Campaigns list={allCampaigns(platforms)} canManage={Object.fromEntries(platforms.map(p => [p.platform, p.can_manage]))}
        periodName={periodName} reload={async () => { await Promise.all([report.reload(), month.reload()]) }} />}

      {notYet.length > 0 && (
        <Alert severity="info" sx={{ mb: 3 }} action={<Button component={RouterLink} to="/connections" size="small">{t('Connect')}</Button>}>
          {t('Run ads on {app} too? Connect it to see them here.', { app: PLATFORM_NAMES[notYet[0]] })}
        </Alert>
      )}

      <UtmBuilder />
    </>
  )
}

/** A platform signed in that still needs its ad account picked, or one that stopped working. */
function PlatformStatus({ waiting, rows }: { waiting: AdPlatform[]; rows: (Integration | undefined)[] }) {
  const broken = rows.filter((x): x is Integration => x?.status === 'error')
  return <>
    {waiting.map(p => (
      <Alert key={p} severity="info" sx={{ mb: 2 }} action={<Button component={RouterLink} to="/connections" size="small">{t('Connections')}</Button>}>
        {t('{app} is connected. Pick which ad account to show on the Connections page.', { app: PLATFORM_NAMES[p] })}
      </Alert>
    ))}
    {broken.map(row => (
      <Alert key={row.provider} severity="error" sx={{ mb: 2 }} action={<Button component={RouterLink} to="/connections" size="small">{t('Fix')}</Button>}>
        {row.last_error ?? t('{app} isn’t working. Connect it again on the Connections page.', { app: PLATFORM_NAMES[row.provider as AdPlatform] })}
      </Alert>
    ))}
  </>
}

/** Nothing connected yet: what the page does, and the way to Connections. */
function ConnectFirst() {
  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('Connect your ad accounts to see your ads')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('Ads shows your Facebook, Instagram and Google ads together: what they cost, the clicks and results they brought, next to your takings for the same days. Pause a campaign or change its daily budget from here.')}
        </Typography>
        <Box component="ol" sx={{ pl: 2.5, my: 0, '& li': { mb: 0.5 } }}>
          <li>{tr('Open {connections} and find {advertising}.', { connections: <b>{t('Connections')}</b>, advertising: <b>{t('Advertising')}</b> })}</li>
          <li>{tr('Press {connect} next to Meta Ads or Google Ads and sign in with the account that runs the café’s ads.', { connect: <b>{t('Connect')}</b> })}</li>
          <li>{t('Allow access. With more than one ad account, pick the café’s.')}</li>
        </Box>
        <Button component={RouterLink} to="/connections" variant="contained" sx={{ mt: 2 }}>{t('Go to Connections')}</Button>
      </CardContent>
    </Card>
  )
}

/** This month's spend on each platform against the limit the business set itself. */
function Limits({ settings, spentThisMonth, platforms, day, reload }: {
  settings: AdSettings; spentThisMonth: Partial<Record<AdPlatform, number>>; platforms: AdPlatform[]; day: string; reload: () => Promise<void>
}) {
  const { api } = useApp()
  const run = useAction()
  const [editing, setEditing] = useState<AdPlatform | null>(null)
  const [value, setValue] = useState('')
  const key = (p: AdPlatform): 'meta_ads_monthly_cap' | 'google_ads_monthly_cap' => (p === 'meta_ads' ? 'meta_ads_monthly_cap' : 'google_ads_monthly_cap')
  const save = async (p: AdPlatform) => {
    const n = value.trim() === '' ? null : Number(value.replace(',', '.'))
    if (n !== null && !(n >= 0)) { await run(async () => { throw new Error(t('Enter an amount, or leave it empty for no limit')) }); return }
    if (await run(async () => { await api.saveAdSettings({ [key(p)]: n }); await reload() }, t('Monthly limit saved'))) setEditing(null)
  }
  return (
    <Card component="section" aria-label={t('Monthly limits')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('Monthly limits')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1, mb: 2 }}>
          {t('Your own limit for each platform, to keep an eye on: the platforms keep spending by the budgets set on them. You’re warned here at {n}% of a limit.', { n: settings.alert_at_percent })}
        </Typography>
        <Stack spacing={2.5}>
          {platforms.map(p => {
            const cap = settings[key(p)]
            const pace = pacing(spentThisMonth[p] ?? 0, cap, day, settings.alert_at_percent)
            const monthEnd = formatLocal(`${day.slice(0, 8)}${String(pace.daysInMonth).padStart(2, '0')}T12:00:00Z`, 'd MMMM')
            return (
              <Box key={p} component="article" aria-label={PLATFORM_NAMES[p]}>
                <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontWeight: 500 }}>{PLATFORM_NAMES[p]}</Typography>
                  <Typography variant="body2">
                    {cap === null ? t('{spent} this month · no limit', { spent: formatMoney(pace.spent) })
                      : t('{spent} of {cap} this month', { spent: formatMoney(pace.spent), cap: formatMoney(cap) })}
                  </Typography>
                </Stack>
                {cap !== null && <LinearProgress variant="determinate" value={Math.min(100, (pace.share ?? 0) * 100)} aria-label={t('{app}: share of the monthly limit spent', { app: PLATFORM_NAMES[p] })}
                  sx={{ my: 1, height: 8, borderRadius: 4, bgcolor: tokens.surfaceAlt, '& .MuiLinearProgress-bar': { bgcolor: pace.warn ? tokens.badFg : tokens.matcha } }} />}
                <Typography variant="caption" sx={{ display: 'block', color: pace.warn ? tokens.badFg : 'text.secondary' }}>
                  {pace.over ? t('Over the limit by {amount}.', { amount: formatMoney(pace.spent - cap!) })
                    : pace.warn ? t('Close to the limit: at this pace the month comes to {amount} by {date}.', { amount: formatMoney(pace.projected), date: monthEnd })
                    : t('At this pace the month comes to {amount}.', { amount: formatMoney(pace.projected) })}
                </Typography>
                {editing === p ? (
                  <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center' }}>
                    <TextField size="small" autoFocus label={t('Monthly limit')} value={value} onChange={e => setValue(e.target.value)} sx={{ width: 170 }}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start">{currencySymbol()}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
                      onKeyDown={e => { if (e.key === 'Enter') void save(p) }} />
                    <Button variant="contained" size="small" onClick={() => save(p)}>{t('Save')}</Button>
                    <Button size="small" onClick={() => setEditing(null)}>{t('Cancel')}</Button>
                  </Stack>
                ) : (
                  <Button size="small" sx={{ mt: 0.5, ml: -1 }} aria-label={t('Change the {app} monthly limit', { app: PLATFORM_NAMES[p] })}
                    onClick={() => { setValue(cap === null ? '' : String(cap)); setEditing(p) }}>{cap === null ? t('Set a limit') : t('Change limit')}</Button>
                )}
              </Box>
            )
          })}
        </Stack>
      </CardContent>
    </Card>
  )
}

const SORT_BY = {
  name: (c: AdCampaign) => c.name.toLowerCase(), spend: (c: AdCampaign) => c.spend, results: (c: AdCampaign) => c.results,
  cost: (c: AdCampaign) => costPerResult(c) ?? Infinity, budget: (c: AdCampaign) => c.daily_budget ?? -1,
}

/** A change about to be made on a platform, confirmed first. */
interface Pending { c: AdCampaign; patch: CampaignPatch }

/** Every campaign on every platform, with pause or resume and the daily budget. */
function Campaigns({ list, canManage, periodName, reload }: {
  list: AdCampaign[]; canManage: Partial<Record<AdPlatform, boolean>>; periodName: string; reload: () => Promise<void>
}) {
  const { rows, sort } = useSort(list, SORT_BY, undefined, ['spend', 'results', 'budget'])
  const [pending, setPending] = useState<Pending | null>(null)
  const [budgetFor, setBudgetFor] = useState<AdCampaign | null>(null)
  const used = [...new Set(list.map(c => c.platform))]
  return (
    <Card component="section" aria-label={t('Campaigns')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={
          <Stack direction="row" spacing={1}>
            {AD_PLATFORMS.filter(p => used.includes(p) || canManage[p] !== undefined).map(p => (
              <Button key={p} size="small" href={CREATE_CAMPAIGN_URL[p]} target="_blank" rel="noopener" endIcon={<OpenIcon fontSize="small" />}>
                {t('New on {app}', { app: PLATFORM_NAMES[p] })}
              </Button>
            ))}
          </Stack>
        }>{t('Campaigns')}</SectionTitle>
        {!list.length ? <Empty>{t('No campaigns yet. Make one on the platform; it shows here straight away.')}</Empty> : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label={t('Campaigns, {period}', { period: periodName.toLowerCase() })}>
              <TableHead>
                <TableRow>
                  <SortCell sort={sort} id="name">{t('Campaign')}</SortCell>
                  <TableCell>{t('Status')}</TableCell>
                  <SortCell sort={sort} id="budget" align="right">{t('Daily budget')}</SortCell>
                  <SortCell sort={sort} id="spend" align="right">{t('Spent')}</SortCell>
                  <SortCell sort={sort} id="results" align="right">{t('Results')}</SortCell>
                  <SortCell sort={sort} id="cost" align="right">{t('Cost per result')}</SortCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map(c => {
                  const manage = canManage[c.platform] !== false && c.status !== 'other'
                  return (
                    <TableRow key={`${c.platform}-${c.id}`} hover>
                      <TableCell sx={{ minWidth: 220 }}>
                        <Typography variant="body2">{c.name}</Typography>
                        <Tag>{PLATFORM_NAMES[c.platform]}</Tag>
                      </TableCell>
                      <TableCell>
                        <Tag {...(c.status === 'active' ? { fg: tokens.goodFg, bg: tokens.goodBg } : c.status === 'paused' ? { fg: tokens.warnFg, bg: tokens.warnBg } : {})}>{t(STATUS[c.status])}</Tag>
                      </TableCell>
                      <TableCell align="right">{c.daily_budget === null ? <Tooltip title={t('Set on the ad sets or for the whole campaign: change it on {app}.', { app: PLATFORM_NAMES[c.platform] })}><span>–</span></Tooltip> : formatMoney(c.daily_budget)}</TableCell>
                      <TableCell align="right">{formatMoney(c.spend)}</TableCell>
                      <TableCell align="right">{formatNumber(Math.round(c.results))}</TableCell>
                      <TableCell align="right">{money(costPerResult(c))}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {manage && c.daily_budget !== null && <Button size="small" onClick={() => setBudgetFor(c)} aria-label={t('Change the daily budget of {name}', { name: c.name })}>{t('Budget')}</Button>}
                        {manage && <Button size="small" onClick={() => setPending({ c, patch: { status: c.status === 'active' ? 'paused' : 'active' } })}
                          aria-label={c.status === 'active' ? t('Pause {name}', { name: c.name }) : t('Resume {name}', { name: c.name })}>
                          {c.status === 'active' ? t('Pause') : t('Resume')}
                        </Button>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardContent>
      {budgetFor && <BudgetDialog c={budgetFor} onClose={() => setBudgetFor(null)} onNext={patch => { setPending({ c: budgetFor, patch }); setBudgetFor(null) }} />}
      {pending && <ConfirmDialog {...pending} onClose={() => setPending(null)} reload={reload} />}
    </Card>
  )
}

function BudgetDialog({ c, onClose, onNext }: { c: AdCampaign; onClose: () => void; onNext: (patch: CampaignPatch) => void }) {
  const [value, setValue] = useState(String(c.daily_budget ?? ''))
  const n = Number(value.replace(',', '.'))
  const ok = value.trim() !== '' && n >= 1 && n <= 10_000
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Daily budget')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>{c.name}</Typography>
        <TextField autoFocus fullWidth label={t('New daily budget')} value={value} onChange={e => setValue(e.target.value)}
          error={value.trim() !== '' && !ok} helperText={value.trim() !== '' && !ok ? t('Between {min} and {max} a day', { min: formatMoney(1), max: formatMoney(10_000) }) : ' '}
          slotProps={{ input: { startAdornment: <InputAdornment position="start">{currencySymbol()}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
          onKeyDown={e => { if (e.key === 'Enter' && ok) onNext({ daily_budget: Math.round(n * 100) / 100 }) }} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!ok} onClick={() => onNext({ daily_budget: Math.round(n * 100) / 100 })}>{t('Next')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Says exactly what changes, where, before anything is sent to the platform. */
function ConfirmDialog({ c, patch, onClose, reload }: Pending & { onClose: () => void; reload: () => Promise<void> }) {
  const { api } = useApp()
  const run = useAction()
  const app = PLATFORM_NAMES[c.platform]
  const title = patch.status === 'paused' ? t('Pause this campaign?') : patch.status === 'active' ? t('Resume this campaign?') : t('Change the daily budget?')
  const what = patch.status === 'paused' ? t('“{name}” stops showing ads on {app} straight away, and stops spending. You can resume it any time.', { name: c.name, app })
    : patch.status === 'active' ? t('“{name}” starts showing ads on {app} again and spends up to its daily budget of {budget}.', { name: c.name, app, budget: money(c.daily_budget) })
    : t('“{name}” on {app} goes from {from} to {to} a day, from now on.', { name: c.name, app, from: money(c.daily_budget), to: formatMoney(patch.daily_budget!) })
  const done = patch.status === 'paused' ? t('Campaign paused') : patch.status === 'active' ? t('Campaign resumed') : t('Daily budget changed')
  const confirm = async () => {
    if (await run(async () => { await api.setAdCampaign(c.platform, c.id, patch); await reload() }, done)) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent><Typography>{what}</Typography></DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={confirm}>
          {patch.status === 'paused' ? t('Pause on {app}', { app }) : patch.status === 'active' ? t('Resume on {app}', { app }) : t('Change on {app}', { app })}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** Tagged links: each ad (or post, or flyer QR code) points at the website with where it came from. */
function UtmBuilder() {
  const { business } = useApp()
  const notify = useNotify()
  const [url, setUrl] = useState(business?.website ?? '')
  const [source, setSource] = useState('instagram')
  const [medium, setMedium] = useState('paid_social')
  const [campaign, setCampaign] = useState('')
  const [content, setContent] = useState('')
  const link = utmLink({ url, source, medium, campaign, content })
  const copy = async () => {
    if (!link) return
    try { await navigator.clipboard.writeText(link); notify(t('Link copied'), 'success') } catch { notify(t('Couldn’t copy: select the link and copy it'), 'error') }
  }
  return (
    <Card component="section" aria-label={t('Tracked link')}>
      <CardContent>
        <SectionTitle>{t('Tracked link')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1, mb: 2 }}>
          {t('Use it as the ad’s link (or on a flyer’s QR code) so your website’s analytics can tell which ad each visit came from.')}
        </Typography>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
          <TextField size="small" label={t('Web address')} value={url} onChange={e => setUrl(e.target.value)} sx={{ gridColumn: { sm: '1 / -1' } }} />
          <TextField size="small" label={t('Source')} value={source} onChange={e => setSource(e.target.value)} helperText={t('Where it’s shown: instagram, facebook, google')} />
          <TextField size="small" label={t('Medium')} value={medium} onChange={e => setMedium(e.target.value)} helperText={t('What kind: paid_social, cpc, qr')} />
          <TextField size="small" label={t('Campaign')} value={campaign} onChange={e => setCampaign(e.target.value)} helperText={t('Its name, e.g. autumn-menu')} />
          <TextField size="small" label={t('Ad (optional)')} value={content} onChange={e => setContent(e.target.value)} helperText={t('Tells two ads apart, e.g. reel-1')} />
        </Box>
        <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: 'center', p: 1.25, borderRadius: '10px', bgcolor: tokens.surfaceAlt, minWidth: 0 }}>
          <Typography aria-label={t('Your link')} sx={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: '0.85rem', overflowWrap: 'anywhere', color: link ? 'text.primary' : 'text.secondary' }}>
            {link ?? t('Fill in the web address, source, medium and campaign.')}
          </Typography>
          <IconButton disabled={!link} onClick={copy} aria-label={t('Copy link')}><CopyIcon fontSize="small" /></IconButton>
        </Stack>
      </CardContent>
    </Card>
  )
}
