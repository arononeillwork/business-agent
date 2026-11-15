import {
  Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs,
  ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import PhoneIcon from '@mui/icons-material/PhoneIphoneOutlined'
import TabletIcon from '@mui/icons-material/TabletMacOutlined'
import ComputerIcon from '@mui/icons-material/ComputerOutlined'
import PlaceIcon from '@mui/icons-material/PlaceOutlined'
import TodayIcon from '@mui/icons-material/WbSunnyOutlined'
import PageIcon from '@mui/icons-material/ArticleOutlined'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { menuPage, navLabel } from '../app/AppShell'
import { Empty, ErrorBox, Loading, PageHeader, PageToolbar, PersonAvatar, StatGrid, StatTile, Tag } from '../components/common'
import {
  IDLE_MS, KEEP_DAYS, USAGE_PERIODS, isUsagePeriod, pageReaders, pagesUsage, peopleUsage, usageRange, usageTotals,
  type PersonDevice, type PersonPlace, type PersonUsage, type UsageData, type UsageDevice, type UsagePeriod, type UsageSignIn, type UsageVisit,
} from '../../shared/usage'
import { addDays, formatLocal, localDate, today } from '../../shared/time'
import { tokens } from '../theme'
import { locale, t, tn, tr } from '../i18n'

type View = 'people' | 'pages' | 'visits'
const VIEWS: View[] = ['people', 'pages', 'visits']

/** "42 s", "6 min 20 s", "42 min", "3 h 5 min". */
export function duration(seconds: number) {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return t('{n} s', { n: s })
  const m = Math.floor(s / 60)
  if (m < 10) return s % 60 ? t('{m} min {s} s', { m, s: s % 60 }) : t('{m} min', { m })
  if (m < 60) return t('{m} min', { m })
  const h = Math.floor(m / 60)
  return m % 60 ? t('{h} h {m} min', { h, m: m % 60 }) : t('{h} h', { h })
}

/** When, in the business's time: "Today 14:05", "Yesterday 09:12", "Mon 9 Nov, 18:40". */
function when(iso: string) {
  const d = localDate(iso)
  const time = formatLocal(iso, 'HH:mm')
  if (d === today()) return t('Today {time}', { time })
  if (d === addDays(today(), -1)) return t('Yesterday {time}', { time })
  return t('{day}, {time}', { day: formatLocal(iso, d.slice(0, 4) === today().slice(0, 4) ? 'EEE d MMM' : 'd MMM yyyy'), time })
}

const DEVICE_ICON: Record<UsageDevice, ReactNode> = { phone: <PhoneIcon fontSize="small" />, tablet: <TabletIcon fontSize="small" />, computer: <ComputerIcon fontSize="small" /> }
const deviceName = (d: UsageDevice) => (d === 'phone' ? t('Phone') : d === 'tablet' ? t('Tablet') : t('Computer'))

/** "Phone · iOS · Safari · installed app". */
function deviceText(d: Pick<PersonDevice, 'device' | 'os' | 'browser' | 'installed'>) {
  return [deviceName(d.device), d.os, d.installed ? t('installed app') : d.browser].filter(Boolean).join(' · ')
}

function countryName(code: string) {
  try { return new Intl.DisplayNames([locale()], { type: 'region' }).of(code) ?? code } catch { return code }
}
/** "San Pedro de Alcántara, Spain". */
const placeText = (p: { city: PersonPlace['city']; country: string | null }) =>
  p.country ? [p.city, countryName(p.country)].filter(Boolean).join(', ') : t('Not known')

/** How someone signed in, as people say it: "Google", "Apple", "email". */
function providerName(provider: string | null) {
  const brands: Record<string, string> = { google: 'Google', apple: 'Apple', azure: 'Microsoft', facebook: 'Facebook' }
  if (provider && brands[provider]) return brands[provider]
  if (provider === 'phone') return t('their phone number')
  return t('their email')
}
/** "Today 18:16 with Google". */
const signInText = (s: UsageSignIn) => t('{when} with {how}', { when: when(s.last_sign_in_at), how: providerName(s.provider) })

/** A page's name and icon, by the menu's key for it. */
function pageName(key: string) {
  if (key === 'today') return t('Today')
  const n = menuPage(key)
  return n ? navLabel(n) : key
}
const pageIcon = (key: string) => (key === 'today' ? <TodayIcon fontSize="small" /> : menuPage(key)?.icon ?? <PageIcon fontSize="small" />)
const pageLink = (key: string) => (key === 'today' ? '/' : menuPage(key)?.to ?? null)

const num = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const
const wide = { display: { xs: 'none', md: 'table-cell' } } as const
const fromSm = { display: { xs: 'none', sm: 'table-cell' } } as const
const clickable = { cursor: 'pointer' } as const

/**
 * Settings → User analytics (the owners'): who uses the app, on which devices and from where, and how long they
 * spend on each page, for the last 7, 30 or 90 days or 12 months. People: each person's visits, time, devices and
 * places; Pages: the time spent on each page, and for one (Staff rules, say) how long each person spent on it and
 * who never opened it; Visits: each visit in turn. The app keeps the time (src/app/usage.ts); the Worker adds the
 * device and town (worker/usage.ts). In the address: `?period=90&view=pages&page=rules`, `?person=<id>`.
 */
export function UserAnalyticsPage() {
  const { api, profiles, me } = useApp()
  const [params, setParams] = useSearchParams()
  const asked = params.get('period')
  const period: UsagePeriod = isUsagePeriod(asked) ? asked : '30'
  const view: View = VIEWS.includes(params.get('view') as View) ? params.get('view') as View : 'people'
  const openPage = params.get('page')
  const openPerson = params.get('person')
  // The period ends when the page was opened (so the figures hold still while they're read).
  const [opened] = useState(() => Date.now())
  const { from, to } = usageRange(period, opened)
  const report = useAsync('user-analytics', () => api.usageReport(from, to), [from, to])
  const data: UsageData | null = report.data
  // Who has signed in, and how, from Supabase's own records: shown even before any visit is recorded.
  const signIns = useAsync('user-analytics-sign-ins', () => api.usageSignIns(), []).data ?? []
  // Each change keeps the rest of the address (the period, the tab, what's open).
  const set = (patch: Record<string, string | null>) => setParams(prev => {
    const next = new URLSearchParams(prev)
    for (const [k, v] of Object.entries(patch)) { if (v === null) next.delete(k); else next.set(k, v) }
    return next
  }, { replace: true })

  // The team's names, and the report's own for partners (the app's list of the team leaves them out).
  const known = (id: string) => profiles.find(p => p.id === id) ?? data?.names.find(n => n.profile_id === id) ?? signIns.find(n => n.profile_id === id)
  const name = (id: string) => known(id)?.full_name ?? t('Someone no longer on the team')
  const colour = (id: string) => known(id)?.colour ?? tokens.inkSoft
  const team = profiles.filter(p => p.active && (p.role === 'admin' || p.role === 'employee'))
  const totals = data ? usageTotals(data) : null
  const people = data ? peopleUsage(data, signIns, from) : []
  const pages = data ? pagesUsage(data) : []
  const unused = team.filter(p => !people.some(x => x.profile_id === p.id))
  const person = (id: string) => (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
      <PersonAvatar name={name(id)} colour={colour(id)} size={26} />
      <Box sx={{ minWidth: 0, overflowWrap: 'break-word' }}>
        {id === me?.id ? t('{name} (you)', { name: name(id) }) : name(id)}
        {known(id)?.role === 'partner' && <Box sx={{ mt: 0.25 }}><Tag>{t('Partner')}</Tag></Box>}
      </Box>
    </Stack>
  )

  return (
    <>
      <PageHeader eyebrow={t('Settings')} title={t('User analytics')} />
      <PageToolbar actions={
        <ToggleButtonGroup exclusive size="small" value={period} aria-label={t('Period')}
          onChange={(_, v: UsagePeriod | null) => v && set({ period: v === '30' ? null : v })}>
          {USAGE_PERIODS.map(p => <ToggleButton key={p.id} value={p.id}>{t(p.label)}</ToggleButton>)}
        </ToggleButtonGroup>
      }>
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 640 }}>
          {t('Who uses the app, on which devices and from where, and how long they spend on each page. A page’s time counts while it’s on screen and in use, and stops {minutes} minutes after the last touch, scroll or key.',
            { minutes: IDLE_MS / 60_000 })}
        </Typography>
      </PageToolbar>
      <ErrorBox error={report.error} />

      {!data || !totals ? <Loading /> : (
        <>
          <StatGrid>
            <StatTile label={t('People who used it')} value={people.length} note={team.length ? t('of {n} on the team', { n: team.length }) : undefined} />
            <StatTile label={t('Visits')} value={totals.visits} />
            <StatTile label={t('Time in the app')} value={duration(totals.seconds)} />
            <StatTile label={t('Most time on')} value={totals.topPage ? pageName(totals.topPage) : '—'} />
          </StatGrid>

          <Tabs value={view} onChange={(_, v: View) => set({ view: v === 'people' ? null : v })} variant="scrollable" allowScrollButtonsMobile
            sx={{ mb: 2, borderBottom: `1px solid ${tokens.line}` }}>
            <Tab value="people" label={t('People')} />
            <Tab value="pages" label={t('Pages')} />
            <Tab value="visits" label={t('Visits')} />
          </Tabs>

          {view === 'people' && (people.length ? (
            <Card sx={{ overflowX: 'auto', mb: 2 }}>
              <Table size="small" aria-label={t('People')}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('Name')}</TableCell>
                    <TableCell>{t('Last used')}</TableCell>
                    <TableCell sx={fromSm}>{t('Last sign-in')}</TableCell>
                    <TableCell align="right">{t('Visits')}</TableCell>
                    <TableCell align="right">{t('Time')}</TableCell>
                    <TableCell sx={wide}>{t('Device')}</TableCell>
                    <TableCell sx={wide}>{t('Where')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {people.map(p => (
                    <TableRow key={p.profile_id} hover sx={clickable} onClick={() => set({ person: p.profile_id })}>
                      <TableCell>
                        <Button variant="text" color="inherit" sx={{ p: 0, minWidth: 0, textTransform: 'none', fontWeight: 'inherit', textAlign: 'left' }}
                          aria-label={t('{name}: their visits and pages', { name: name(p.profile_id) })} onClick={e => { e.stopPropagation(); set({ person: p.profile_id }) }}>
                          {person(p.profile_id)}
                        </Button>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: { sm: 'nowrap' } }}>{when(p.last_at)}</TableCell>
                      <TableCell sx={{ ...fromSm, color: 'text.secondary' }}>{p.signIn ? signInText(p.signIn) : '—'}</TableCell>
                      <TableCell align="right" sx={num}>{p.visits}</TableCell>
                      <TableCell align="right" sx={num}>{p.visits ? duration(p.seconds) : '—'}</TableCell>
                      <TableCell sx={wide}>
                        {!p.visits && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Signed in; no visits recorded yet')}</Typography>}
                        {p.devices[0] && (
                          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                            {DEVICE_ICON[p.devices[0].device]}
                            <span>{deviceText(p.devices[0])}{p.devices.length > 1 ? ` ${t('+{n} more', { n: p.devices.length - 1 })}` : ''}</span>
                          </Stack>
                        )}
                      </TableCell>
                      <TableCell sx={{ ...wide, color: 'text.secondary' }}>{p.places[0] ? placeText(p.places[0]) : p.visits ? t('Not known') : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : <Empty>{t('Nobody has used the app in this period yet.')}</Empty>)}
          {view === 'people' && unused.length > 0 && (
            <NotUsed label={t('Didn’t use the app in this period')} ids={unused.map(p => p.id)} name={name} colour={colour} />
          )}

          {view === 'pages' && (pages.length ? (
            <Card sx={{ overflowX: 'auto', mb: 2 }}>
              <Table size="small" aria-label={t('Pages')}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('Page')}</TableCell>
                    <TableCell align="right">{t('People')}</TableCell>
                    <TableCell align="right" sx={wide}>{t('Times opened')}</TableCell>
                    <TableCell align="right">{t('Time')}</TableCell>
                    <TableCell align="right" sx={wide}>{t('A person, on average')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pages.map(p => (
                    <TableRow key={p.page} hover sx={clickable} onClick={() => set({ page: p.page })}>
                      <TableCell>
                        <Button variant="text" color="inherit" startIcon={pageIcon(p.page)} onClick={e => { e.stopPropagation(); set({ page: p.page }) }}
                          aria-label={t('{page}: who spent time on it', { page: pageName(p.page) })}
                          sx={{ p: 0, minWidth: 0, textTransform: 'none', fontWeight: 'inherit', textAlign: 'left', '& .MuiButton-startIcon': { color: tokens.inkSoft } }}>
                          {pageName(p.page)}
                        </Button>
                      </TableCell>
                      <TableCell align="right" sx={num}>{p.people}</TableCell>
                      <TableCell align="right" sx={{ ...num, ...wide }}>{p.views}</TableCell>
                      <TableCell align="right" sx={num}>{duration(p.seconds)}</TableCell>
                      <TableCell align="right" sx={{ ...num, ...wide }}>{duration(p.average)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : <Empty>{t('No pages opened in this period yet.')}</Empty>)}

          {view === 'visits' && (data.visits.length ? (
            <>
              <Card sx={{ overflowX: 'auto', mb: 1 }}>
                <VisitsTable visits={data.visits} person={person} />
              </Card>
              {data.total_visits > data.visits.length && (
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                  {t('The latest {shown} of {n} visits.', { shown: data.visits.length, n: data.total_visits })}
                </Typography>
              )}
            </>
          ) : <Empty>{t('Nobody has used the app in this period yet.')}</Empty>)}
        </>
      )}

      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 3, maxWidth: 760 }}>
        {tr('“Where” is the town the internet connection is in, not the phone’s GPS, so on mobile data it can be a nearby town. Visits are kept for {days} days. Let the team know their use of the app is recorded: a line in {rules} does it.', {
          days: KEEP_DAYS, rules: <RouterLink to="/rules">{t('Staff rules')}</RouterLink>,
        })}
      </Typography>

      {data && openPage && (
        <PageDialog page={openPage} data={data} team={team.map(p => p.id)} name={name} colour={colour} person={person} onClose={() => set({ page: null })}
          onPerson={id => set({ page: null, person: id })} />
      )}
      {data && openPerson && (
        <PersonDialog id={openPerson} data={data} p={people.find(x => x.profile_id === openPerson)} name={name} onClose={() => set({ person: null })} onPage={key => set({ person: null, page: key })} />
      )}
    </>
  )
}

/** People on the team who didn't use the app, or didn't open a page. */
function NotUsed({ label, ids, name, colour }: { label: string; ids: string[]; name: (id: string) => string; colour: (id: string) => string }) {
  return (
    <Box component="section" aria-label={label} sx={{ mb: 2 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{label}</Typography>
      <Stack direction="row" useFlexGap spacing={1} role="list" sx={{ flexWrap: 'wrap' }}>
        {ids.map(id => <Chip key={id} role="listitem" variant="outlined" avatar={<PersonAvatar name={name(id)} colour={colour(id)} size={24} />} label={name(id)} />)}
      </Stack>
    </Box>
  )
}

function VisitsTable({ visits, person }: { visits: UsageVisit[]; person?: (id: string) => ReactNode }) {
  return (
    <Table size="small" aria-label={t('Visits')}>
      <TableHead>
        <TableRow>
          <TableCell>{t('When')}</TableCell>
          {person && <TableCell>{t('Name')}</TableCell>}
          <TableCell align="right">{t('Time')}</TableCell>
          <TableCell sx={wide}>{t('Device')}</TableCell>
          <TableCell sx={wide}>{t('Where')}</TableCell>
          <TableCell>{t('Pages')}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {visits.map(v => (
          <TableRow key={v.id}>
            <TableCell sx={{ whiteSpace: { sm: 'nowrap' } }}>{when(v.started_at)}</TableCell>
            {person && <TableCell>{person(v.profile_id)}</TableCell>}
            <TableCell align="right" sx={num}>{duration(v.seconds)}</TableCell>
            <TableCell sx={wide}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'text.secondary' }}>{DEVICE_ICON[v.device]}<span>{deviceText(v)}</span></Stack>
            </TableCell>
            <TableCell sx={{ ...wide, color: 'text.secondary' }}>{placeText(v)}</TableCell>
            <TableCell>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {v.pages.length ? v.pages.map(p => `${pageName(p.page)}${p.seconds ? ` (${duration(p.seconds)})` : ''}`).join(', ') : '—'}
              </Typography>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function useFullScreen() {
  const theme = useTheme()
  return useMediaQuery(theme.breakpoints.down('sm'))
}

/** One page: how long each person spent on it, and who on the team never opened it in the period. */
function PageDialog({ page, data, team, name, colour, person, onClose, onPerson }: {
  page: string; data: UsageData; team: string[]; name: (id: string) => string; colour: (id: string) => string; person: (id: string) => ReactNode
  onClose: () => void; onPerson: (id: string) => void
}) {
  const phone = useFullScreen()
  const { readers, notOpened } = pageReaders(data, page, team)
  const total = readers.reduce((s, r) => s + r.seconds, 0)
  const link = pageLink(page)
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone} aria-labelledby="usage-page-title">
      <DialogTitle id="usage-page-title">
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', '& svg': { color: tokens.inkSoft } }}>{pageIcon(page)}<span>{pageName(page)}</span></Stack>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {readers.length
            ? tn(readers.length, '{n} person spent {time} on it in this period.', '{n} people spent {time} on it in this period.', { time: duration(total) })
            : t('Nobody opened it in this period.')}
        </Typography>
        {readers.length > 0 && (
          <Card variant="outlined" sx={{ overflowX: 'auto', mb: 2 }}>
            <Table size="small" aria-label={t('Time on {page}', { page: pageName(page) })}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('Name')}</TableCell>
                  <TableCell align="right">{t('Time')}</TableCell>
                  <TableCell align="right">{t('Times opened')}</TableCell>
                  <TableCell sx={wide}>{t('Last opened')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {readers.map(r => (
                  <TableRow key={r.profile_id} hover sx={clickable} onClick={() => onPerson(r.profile_id)}>
                    <TableCell>{person(r.profile_id)}</TableCell>
                    <TableCell align="right" sx={num}>{duration(r.seconds)}</TableCell>
                    <TableCell align="right" sx={num}>{r.views}</TableCell>
                    <TableCell sx={{ ...wide, whiteSpace: 'nowrap' }}>{when(r.last_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
        {notOpened.length > 0 && <NotUsed label={t('Didn’t open it in this period')} ids={notOpened} name={name} colour={colour} />}
      </DialogContent>
      <DialogActions>
        {link && <Button component={RouterLink} to={link}>{t('Open the page')}</Button>}
        <Button onClick={onClose}>{t('Close')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** One person: their pages, devices, places and visits in the period. */
function PersonDialog({ id, data, p, name, onClose, onPage }: {
  id: string; data: UsageData; p: PersonUsage | undefined; name: (id: string) => string; onClose: () => void; onPage: (key: string) => void
}) {
  const phone = useFullScreen()
  const visits = data.visits.filter(v => v.profile_id === id).slice(0, 30)
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={phone} aria-labelledby="usage-person-title">
      <DialogTitle id="usage-person-title">{name(id)}</DialogTitle>
      <DialogContent>
        {!p ? <Alert severity="info">{t('They didn’t use the app in this period.')}</Alert> : (
          <>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: p.signIn ? 0.5 : 2 }}>
              {p.visits
                ? t('{visits} in this period, {time} in all. Last used: {when}.', { visits: tn(p.visits, '{n} visit', '{n} visits'), time: duration(p.seconds), when: when(p.last_at) })
                : t('No visits recorded yet in this period.')}
            </Typography>
            {p.signIn && (
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                {t('Last signed in: {when}.', { when: signInText(p.signIn) })}
              </Typography>
            )}
            {p.visits > 0 && <>
            <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>{t('Pages')}</Typography>
            <Card variant="outlined" sx={{ overflowX: 'auto', mb: 2.5 }}>
              <Table size="small" aria-label={t('Their pages')}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('Page')}</TableCell>
                    <TableCell align="right">{t('Time')}</TableCell>
                    <TableCell align="right">{t('Times opened')}</TableCell>
                    <TableCell sx={wide}>{t('Last opened')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {p.pages.map(x => (
                    <TableRow key={x.page} hover sx={clickable} onClick={() => onPage(x.page)}>
                      <TableCell>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', '& svg': { color: tokens.inkSoft } }}>{pageIcon(x.page)}<span>{pageName(x.page)}</span></Stack>
                      </TableCell>
                      <TableCell align="right" sx={num}>{duration(x.seconds)}</TableCell>
                      <TableCell align="right" sx={num}>{x.views}</TableCell>
                      <TableCell sx={{ ...wide, whiteSpace: 'nowrap' }}>{when(x.last_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5, mb: 2.5 }}>
              <Box component="section" aria-label={t('Devices')}>
                <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>{t('Devices')}</Typography>
                <Stack spacing={0.75}>
                  {p.devices.map(d => (
                    <Stack key={[d.device, d.os, d.browser].join()} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      {DEVICE_ICON[d.device]}
                      <Typography variant="body2" sx={{ flex: 1 }}>{deviceText(d)}</Typography>
                      <Typography variant="body2" sx={{ ...num, color: 'text.secondary' }}>{tn(d.visits, '{n} visit', '{n} visits')}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>
              <Box component="section" aria-label={t('Places')}>
                <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>{t('Places')}</Typography>
                <Stack spacing={0.75}>
                  {p.places.length ? p.places.map(x => (
                    <Stack key={[x.city, x.region, x.country].join()} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <PlaceIcon fontSize="small" />
                      <Typography variant="body2" sx={{ flex: 1 }}>{placeText(x)}</Typography>
                      <Typography variant="body2" sx={{ ...num, color: 'text.secondary' }}>{tn(x.visits, '{n} visit', '{n} visits')}</Typography>
                    </Stack>
                  )) : <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Not known')}</Typography>}
                </Stack>
              </Box>
            </Box>
            {visits.length > 0 && (
              <>
                <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>{t('Latest visits')}</Typography>
                <Card variant="outlined" sx={{ overflowX: 'auto' }}><VisitsTable visits={visits} /></Card>
              </>
            )}
            </>}
          </>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{t('Close')}</Button></DialogActions>
    </Dialog>
  )
}
