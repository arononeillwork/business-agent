// Analytics for one social account (Instagram, TikTok, the LinkedIn Page, the Facebook Page): its
// headline figures against the period before, one figure day by day, and the period's best posts.
// Each comes from that platform itself, with the connection the Social planner uses.
import { Alert, Box, Button, Card, CardContent, Link, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { BarChart, type BarPoint } from '../components/charts'
import { Empty, ErrorBox, Loading, SectionTitle, StatGrid, StatTile } from '../components/common'
import { Freshness } from '../components/Freshness'
import { msg, t } from '../i18n'
import { addDays, formatLocal, formatNumber, today } from '../../shared/time'
import {
  METRIC_LABELS, SOCIAL_NAMES, type PostColumn, type SocialDay, type SocialMetric, type SocialMetricId, type SocialReport, type SocialSource,
} from '../../shared/socialAnalytics'
import { Change } from './AnalyticsPage'

const COLUMNS: Record<PostColumn, string> = {
  views: msg('Views'), reach: msg('Reach'), likes: msg('Likes'), comments: msg('Comments'), shares: msg('Shares'), saves: msg('Saves'),
}
const CHART_TITLES: Partial<Record<SocialMetricId, string>> = {
  reach: msg('Accounts reached each day'), impressions: msg('Impressions each day'), views: msg('Views each day'),
}
/** What's worth knowing about each platform's figures, under the chart. */
const CHART_NOTES: Partial<Record<SocialSource, string>> = {
  instagram: msg('Instagram’s figures can be up to two days late, and it adds up accounts reached 30 days at a time.'),
  linkedin: msg('The Page’s own posts, not ads (those are on the Ads page). New followers are counted up to two days ago.'),
  facebook: msg('Facebook’s figures can be up to two days late.'),
}

const shown = (m: SocialMetric) => (m.value === null ? '–' : m.percent ? `${formatNumber(Math.round(m.value * 1000) / 10)}%` : formatNumber(Math.round(m.value)))
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatNumber(Math.abs(n))}`

/** Why there are no figures, in words the admin can act on. */
function noFigures(r: SocialReport) {
  if (r.access === 'needs_page') {
    return t('LinkedIn shares statistics only for a company Page, and your LinkedIn posts go out from your own profile at the moment. Choose your business’s Page on the Connections page to see them.')
  }
  if (r.source === 'linkedin') return t('LinkedIn shares page statistics only with Community Management access: connect again on Connections to allow it.')
  return t('{name} was connected without permission to read its statistics. Connect again on Connections to allow statistics.', { name: SOCIAL_NAMES[r.source] })
}

export function SocialAnalytics({ source, days, periodName, vs, frame }: {
  source: SocialSource
  days: number
  periodName: string
  vs: string
  /** The page's title and the toolbar under it: `left` on the left, the pickers on the right (with the period when there are figures). */
  frame: (left: ReactNode, withPeriod: boolean) => ReactNode
}) {
  const { api } = useApp()
  const name = SOCIAL_NAMES[source]
  const integ = useAsync('integrations', () => api.integrations(), [])
  const row = integ.data?.integrations.find(i => i.provider === source)
  const on = row?.status === 'connected'
  // The platforms are at most a day or two behind: each period ends yesterday.
  const to = addDays(today(), -1), from = addDays(to, -(days - 1))
  const prevTo = addDays(from, -1), prevFrom = addDays(prevTo, -(days - 1))
  const report = useAsync('social-analytics', () => (on ? api.socialAnalytics(source, from, to) : Promise.resolve(null)), [on, source, from, to])
  const before = useAsync('social-analytics', () => (on ? api.socialAnalytics(source, prevFrom, prevTo) : Promise.resolve(null)), [on, source, prevFrom, prevTo])
  const r = report.data?.source === source ? report.data : null
  const b = before.data?.source === source && before.data.access === 'ok' ? before.data : null

  const account = r?.account ?? row?.account_label
  const left = on && (
    <Stack direction="row" useFlexGap sx={{ gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
      {account && (r?.profile_url
        ? <Link href={r.profile_url} target="_blank" rel="noreferrer" underline="hover" variant="body2" sx={{ fontWeight: 500 }}>{account}</Link>
        : <Typography variant="body2" sx={{ fontWeight: 500 }}>{account}</Typography>)}
      {r && <Freshness id="social" at={r.fetched_at} />}
    </Stack>
  )
  const header = frame(left, on)
  const go = (label: string) => <Button component={RouterLink} to="/connections" size="small">{label}</Button>

  if (!integ.data) return <>{header}<ErrorBox error={integ.error} /><Loading /></>
  if (!row || row.status === 'disconnected' || row.status === 'needs_setup') {
    return <>{header}<Alert severity="info" action={go(t('Connections'))}>{t('Connect {name} on the Connections page to see how your account and posts are doing here.', { name })}</Alert></>
  }
  if (row.status === 'pending') {
    return <>{header}<Alert severity="info" action={go(t('Connections'))}>{t('{name} is connected. Choose which account to use on the Connections page to see its statistics.', { name })}</Alert></>
  }
  if (row.status === 'error') {
    return <>{header}<Alert severity="error" action={go(t('Fix'))}>{row.last_error ?? t('{name} isn’t working. Connect it again on the Connections page.', { name })}</Alert></>
  }
  if (!r) return <>{header}<ErrorBox error={report.error} />{!report.error && <Loading />}</>
  if (r.access !== 'ok') return <>{header}<Alert severity="warning" action={go(t('Connections'))}>{noFigures(r)}</Alert></>

  const note = (m: SocialMetric): ReactNode => {
    if (m.kind === 'now') return m.change !== undefined && m.change !== null ? t('{n} in this period', { n: signed(m.change) }) : t('as it stands today')
    if (m.value === null) return null
    const was = b?.metrics.find(x => x.id === m.id)?.value
    return <Change now={m.value} before={was ?? undefined} vs={vs} />
  }
  return (
    <>
      {header}
      <ErrorBox error={report.error} />
      <StatGrid>
        {r.metrics.map(m => <StatTile key={m.id} label={t(METRIC_LABELS[m.id])} value={shown(m)} note={note(m)} />)}
      </StatGrid>
      {r.note === 'tiktok_videos' && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1.5, mb: 3 }}>
          {t('TikTok shares today’s counts only: followers and likes as they stand, and so far for each video posted in this period.')}
        </Typography>
      )}
      {r.chart && (
        <Card component="section" aria-label={t(CHART_TITLES[r.chart.metric] ?? METRIC_LABELS[r.chart.metric])} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle>{t(CHART_TITLES[r.chart.metric] ?? METRIC_LABELS[r.chart.metric])}</SectionTitle>
            <DailyChart days={r.chart.days} before={b?.chart?.metric === r.chart.metric ? b.chart.days : null} what={t(METRIC_LABELS[r.chart.metric])}
              periodName={periodName} vs={vs} />
            {CHART_NOTES[source] && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>{t(CHART_NOTES[source]!)}</Typography>}
          </CardContent>
        </Card>
      )}
      {r.post_columns.length > 0 && <TopPosts report={r} />}
    </>
  )
}

function DailyChart({ days, before, what, periodName, vs }: { days: SocialDay[]; before: SocialDay[] | null; what: string; periodName: string; vs: string }) {
  if (!days.some(d => d.value > 0)) return <Empty>{t('Nothing yet for this period.')}</Empty>
  const many = days.length > 10
  const points: BarPoint[] = days.map((d, i) => ({
    label: formatLocal(`${d.date}T12:00:00Z`, many ? 'd MMM' : 'EEE d'), title: formatLocal(`${d.date}T12:00:00Z`, 'EEEE d MMMM'),
    value: d.value, prev: before ? before[i]?.value ?? 0 : undefined,
  }))
  const cap = vs.charAt(0).toUpperCase() + vs.slice(1)
  return <BarChart points={points} format={n => formatNumber(Math.round(n))} axisFormat={n => formatNumber(Math.round(n))} current={periodName} previous={cap}
    label={t('{what} per day, {period}, with {before} as a line', { what, period: periodName.toLowerCase(), before: vs })} />
}

/** The period's best posts (or videos), each linking to itself on the platform. */
function TopPosts({ report: r }: { report: SocialReport }) {
  const title = r.source === 'tiktok' ? t('Top videos in this period') : t('Top posts in this period')
  return (
    <Card component="section" aria-label={title} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{title}</SectionTitle>
        {!r.posts.length ? <Empty>{r.source === 'tiktok' ? t('No videos posted in this period.') : t('No posts in this period.')}</Empty> : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label={title}>
              <TableHead>
                <TableRow>
                  <TableCell>{r.source === 'tiktok' ? t('Video') : t('Post')}</TableCell>
                  {r.post_columns.map(c => <TableCell key={c} align="right">{t(COLUMNS[c])}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {r.posts.map(p => (
                  <TableRow key={p.id} hover>
                    <TableCell>
                      {/* Narrow on a phone, so the figures beside it stay in view. */}
                      <Box sx={{ maxWidth: { xs: 170, sm: 360 }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.url
                          ? <Link href={p.url} target="_blank" rel="noreferrer" underline="hover" color="inherit">{p.caption || t('(no caption)')}</Link>
                          : p.caption || t('(no caption)')}
                      </Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatLocal(p.at, 'd MMM, HH:mm')}</Typography>
                    </TableCell>
                    {r.post_columns.map(c => (
                      <TableCell key={c} align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{p[c] === null || p[c] === undefined ? '–' : formatNumber(p[c]!)}</TableCell>
                    ))}
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
