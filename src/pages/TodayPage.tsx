import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, List, ListItem, ListItemAvatar, ListItemText, Menu, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync, useTick } from '../app/hooks'
import { useAction } from '../app/Notify'
import { ErrorBox, Flags, Loading, PageHeader, PersonAvatar, SectionTitle, Stat, StatRow, Tag } from '../components/common'
import { MusicCard } from '../components/MusicCard'
import { SetupPrompt } from './SetupPage'
import { holidayOn } from '../../shared/rules'
import { addDays, formatDuration, formatLocal, localDate, localTime, minutesBetween, today, zonedIso } from '../../shared/time'
import { tokens } from '../theme'
import { EventAlertButton } from '../components/NotificationBell'
import { CATEGORY_META, type TimeEntry } from '../../shared/types'

function ClockCard({ onChange }: { onChange: () => void }) {
  const { api, positions, breakTypes, settings } = useApp()
  const run = useAction()
  useTick(1000)
  const state = useAsync('clock', () => api.clockState(), [])
  const todayShifts = useAsync('my-shifts-today', async () => {
    const me = await api.currentUserId()
    const d = today()
    return (await api.shifts(zonedIso(d, '00:00'), zonedIso(addDays(d, 1), '00:00'))).filter(s => s.profile_id === me)
  }, [])
  const [positionId, setPositionId] = useState<number | ''>('')
  const [breakMenu, setBreakMenu] = useState<HTMLElement | null>(null)
  const [summary, setSummary] = useState<TimeEntry | null>(null)
  const [busy, setBusy] = useState(false)

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    const ok = await run(fn, msg)
    setBusy(false)
    if (ok) { await state.reload(); onChange() }
  }

  if (state.loading && !state.data) return null
  const entry = state.data?.entry
  const openBreak = state.data?.openBreak
  const shift = todayShifts.data?.[0]
  const now = new Date().toISOString()

  const tone = openBreak ? tokens.warning : entry ? tokens.matcha : tokens.inkFaint
  return (
    <Card component="section" aria-label="Your clock" sx={{ mb: 2.5 }}>
      <CardContent sx={{ py: '14px !important' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5, alignItems: { sm: 'center' } }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
            <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: tone, flexShrink: 0,
              boxShadow: entry ? `0 0 0 4px ${openBreak ? tokens.warnBg : tokens.goodBg}` : 'none' }} />
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline' }}>
                <Typography sx={{ fontWeight: 500 }}>{openBreak ? 'On a break' : entry ? 'Clocked in' : 'Not clocked in'}</Typography>
                {(entry || openBreak) && (
                  <Typography sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                    · {formatDuration(minutesBetween(openBreak ? openBreak.started_at : entry!.clock_in, now))}
                  </Typography>
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {entry ? `Since ${localTime(entry.clock_in)}${entry.break_minutes ? ` · ${entry.break_minutes} min break so far` : ''}`
                  : shift ? `Your shift today: ${localTime(shift.starts_at)}–${localTime(shift.ends_at)}`
                  : 'No shift scheduled today'}
              </Typography>
              {entry && entry.flags.length > 0 && <Box sx={{ mt: 0.5 }}><Flags flags={entry.flags} /></Box>}
            </Box>
          </Stack>

          {!entry && (
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, alignItems: { sm: 'center' }, width: { xs: '100%', sm: 'auto' } }}>
              {positions.length > 1 && (
                <TextField select size="small" label="Position" value={positionId || shift?.position_id || ''}
                  onChange={e => setPositionId(Number(e.target.value))} sx={{ width: { xs: '100%', sm: 160 } }}>
                  {positions.filter(p => p.active).map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </TextField>
              )}
              <Button variant="contained" disabled={busy} sx={{ flex: { xs: 1, sm: 'none' }, minHeight: { xs: 46, sm: 38 } }}
                onClick={() => act(() => api.clockIn(positionId || shift?.position_id || null), 'Clocked in. Have a good shift!')}>
                Clock in
              </Button>
            </Stack>
          )}
          {entry && !openBreak && (
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" disabled={busy} onClick={e => setBreakMenu(e.currentTarget)}>Start break</Button>
              <Button variant="outlined" color="error" disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const done = await api.clockOut()
                    setSummary(done)
                    await state.reload()
                    onChange()
                  } catch (e) {
                    await run(() => Promise.reject(e))
                  } finally { setBusy(false) }
                }}>Clock out</Button>
              <Menu anchorEl={breakMenu} open={!!breakMenu} onClose={() => setBreakMenu(null)}>
                {breakTypes.map(t => (
                  <MenuItem key={t.id} onClick={() => { setBreakMenu(null); act(() => api.startBreak(t.id), 'Enjoy your break') }}>
                    {t.name}
                  </MenuItem>
                ))}
              </Menu>
            </Stack>
          )}
          {openBreak && (
            <Button variant="contained" disabled={busy} onClick={() => act(() => api.endBreak(), 'Welcome back')}>End break</Button>
          )}
        </Stack>
        {settings?.phone_clock_in === 'off' && !entry && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>Clock-in from phones is off. Use the café tablet.</Typography>
        )}
      </CardContent>

      <Dialog open={!!summary} onClose={() => setSummary(null)} fullWidth maxWidth="xs">
        <DialogTitle>Workday summary</DialogTitle>
        {summary && (
          <DialogContent>
            <Stack spacing={1}>
              <Row label="Clock in" value={localTime(summary.clock_in)} />
              <Row label="Clock out" value={summary.clock_out ? localTime(summary.clock_out) : '—'} />
              <Row label="Breaks" value={`${summary.break_minutes} min`} />
              <Row label="Paid hours" value={formatDuration(summary.paid_minutes)} strong />
              {summary.flags.length > 0 && <Flags flags={summary.flags} />}
              {summary.flags.includes('missed_break') && (
                <Alert severity="warning">Shifts over 6 hours need at least a 15-minute break. Tell a manager if you took one.</Alert>
              )}
            </Stack>
          </DialogContent>
        )}
        <DialogActions><Button onClick={() => setSummary(null)}>Done</Button></DialogActions>
      </Dialog>
    </Card>
  )
}

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
    <Typography color="text.secondary">{label}</Typography>
    <Typography sx={{ fontWeight: strong ? 700 : 500 }}>{value}</Typography>
  </Stack>
)

export function TodayPage() {
  const { api, me, profiles, positions, isAdmin, business } = useApp()
  const d = today()
  const data = useAsync('today', async () => {
    const [shifts, events, corrections, timeOff, comps, sports] = await Promise.all([
      api.shifts(zonedIso(d, '00:00'), zonedIso(addDays(d, 8), '00:00')),
      api.events(d, addDays(d, 60)),
      isAdmin ? api.corrections() : Promise.resolve([]),
      isAdmin ? api.timeOff(d, addDays(d, 365)) : Promise.resolve([]),
      api.sportsCompetitions().catch(() => []),
      api.sportsEvents(zonedIso(d, '00:00'), zonedIso(addDays(d, 8), '00:00')).catch(() => []),
    ])
    const followed = new Map(comps.filter(c => c.followed).map(c => [c.code, c.name]))
    return { shifts, events, corrections, timeOff, bigNights: sports.filter(e => e.big && followed.has(e.competition)).map(e => ({ ...e, compName: followed.get(e.competition)! })) }
  }, [d])

  const todays = (data.data?.shifts ?? []).filter(s => localDate(s.starts_at) === d)
  const mine = (data.data?.shifts ?? []).filter(s => s.profile_id === me?.id)
  const openShifts = (data.data?.shifts ?? []).filter(s => !s.profile_id)
  const holiday = holidayOn(d, data.data?.events ?? [])
  const pending = (data.data?.corrections ?? []).filter(c => c.status === 'pending').length
  const person = (id: string | null) => profiles.find(p => p.id === id)
  const position = (id: number | null) => positions.find(p => p.id === id)
  const upcoming = (data.data?.events ?? []).filter(e => e.starts_on <= addDays(d, 21))
  const nextClosure = (data.data?.events ?? []).find(e =>
    ['national', 'regional', 'local'].includes(e.category) || (e.category === 'business' && /closed|cerrad|closure/i.test(e.title)))
  const big = data.data?.bigNights ?? []

  return (
    <>
      <PageHeader eyebrow={formatLocal(new Date(), 'EEEE d MMMM')} title={`Hola, ${me?.full_name.split(' ')[0]}`}
        subtitle="Here's the café today."
        actions={holiday && <Tag fg={tokens.badFg} bg={tokens.badBg}>Holiday · {holiday.title}</Tag>} />
      <ErrorBox error={data.error} />
      {isAdmin && business && !business.setup_completed_at && <SetupPrompt />}
      {isAdmin && (data.data?.timeOff ?? []).some(t => t.status === 'pending') && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button component={Link} to="/time-off" color="inherit">Review</Button>}>
          Time off requests waiting for approval
        </Alert>
      )}
      {isAdmin && pending > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} action={<Button component={Link} to="/timecards" color="inherit">Review</Button>}>
          {pending} timecard correction request{pending > 1 ? 's' : ''} waiting for approval
        </Alert>
      )}

      <StatRow>
        <Stat label="On today" value={data.data ? todays.filter(s => s.profile_id).length : '–'} note={todays.length ? `${localTime(todays[0].starts_at)} to ${localTime(todays.reduce((m, s) => s.ends_at > m ? s.ends_at : m, todays[0].ends_at))}` : 'Nobody scheduled'} />
        <Stat label="Open shifts" value={data.data ? openShifts.length : '–'} note="this week" tone={openShifts.length ? 'warning' : undefined} />
        <Stat label="Big nights" value={data.data ? big.length : '–'} note={big[0] ? `next: ${formatLocal(big[0].starts_at, 'EEE')} · ${big[0].title}` : 'none this week'} />
        <Stat label="Next day off" value={nextClosure ? formatLocal(`${nextClosure.starts_on}T12:00:00Z`, 'd MMM') : '–'} note={nextClosure?.title ?? 'No holidays in the next 2 months'} />
      </StatRow>

      <ClockCard onChange={data.reload} />

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Stack spacing={2.5}>
            <Card component="section" aria-label="Who's on today">
              <CardContent>
                <SectionTitle action={<Button size="small" component={Link} to="/rota">Rota</Button>}>Who's on today</SectionTitle>
                {!data.data && <Loading />}
                {data.data && todays.length === 0 && <Typography color="text.secondary">Nobody is scheduled today.</Typography>}
                <List dense disablePadding>
                  {todays.map(s => {
                    const p = person(s.profile_id)
                    return (
                      <ListItem key={s.id} disableGutters>
                        <ListItemAvatar>{p ? <PersonAvatar name={p.full_name} colour={p.colour} /> : <PersonAvatar name="?" colour="#C6C2BB" />}</ListItemAvatar>
                        <ListItemText primary={p?.full_name ?? 'Open shift'}
                          secondary={`${localTime(s.starts_at)}–${localTime(s.ends_at)} · ${position(s.position_id)?.name ?? ''}`} />
                      </ListItem>
                    )
                  })}
                </List>
                {openShifts.length > 0 && (
                  <Alert severity="info" sx={{ mt: 1 }} action={<Button component={Link} to="/rota" color="inherit">View</Button>}>
                    {openShifts.length} open shift{openShifts.length > 1 ? 's' : ''} this week you can pick up
                  </Alert>
                )}
              </CardContent>
            </Card>
            <Card component="section" aria-label="Coming up">
              <CardContent>
                <SectionTitle action={<Button size="small" component={Link} to="/calendar">Calendar</Button>}>Coming up</SectionTitle>
                {data.data && upcoming.length === 0 && <Typography color="text.secondary">Nothing in the next 3 weeks.</Typography>}
                <List dense disablePadding>
                  {upcoming.slice(0, 8).map(e => (
                    <ListItem key={e.id} disableGutters secondaryAction={<EventAlertButton kind="calendar" refId={e.id} title={e.title} />}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: CATEGORY_META[e.category].colour, mr: 1.5, flexShrink: 0 }} />
                      <ListItemText
                        primary={e.title}
                        secondary={`${formatLocal(`${e.starts_on}T12:00:00Z`, 'EEE d MMM')}${e.starts_at ? ` · ${localTime(e.starts_at)}` : ''} · ${e.competition ?? CATEGORY_META[e.category].label}${e.town ? ` · ${e.town}` : ''}`} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={2.5}>
            <Card component="section" aria-label="My next shifts">
              <CardContent>
                <SectionTitle>My next shifts</SectionTitle>
                {mine.length === 0 && <Typography color="text.secondary">No shifts in the next week.</Typography>}
                <List dense disablePadding>
                  {mine.slice(0, 5).map(s => (
                    <ListItem key={s.id} disableGutters>
                      <ListItemText primary={`${formatLocal(s.starts_at, 'EEE d MMM')} · ${localTime(s.starts_at)}–${localTime(s.ends_at)}`}
                        secondary={[position(s.position_id)?.name, s.break_minutes ? `${s.break_minutes} min break` : null, s.note].filter(Boolean).join(' · ')} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
            <Card component="section" aria-label="Big nights">
              <CardContent>
                <SectionTitle action={<Button size="small" component={Link} to="/sports">Sports</Button>}>Big nights this week</SectionTitle>
                {data.data && big.length === 0 && <Typography color="text.secondary">No big matches or fights this week.</Typography>}
                <List dense disablePadding>
                  {big.slice(0, 4).map(e => (
                    <ListItem key={e.id} disableGutters secondaryAction={<EventAlertButton kind="sports" refId={e.id} title={e.title} />}>
                      <ListItemText primary={e.title}
                        secondary={`${formatLocal(e.starts_at, 'EEE d MMM')}${e.time_tbc ? '' : ` · ${localTime(e.starts_at)}`} · ${e.compName}`} />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
            <MusicCard />
          </Stack>
        </Grid>
      </Grid>
    </>
  )
}
