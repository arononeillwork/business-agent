import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, List, ListItem, ListItemAvatar, ListItemText, Menu, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync, useTick } from '../app/hooks'
import { useAction } from '../app/Notify'
import { ErrorBox, Flags, Loading, PageHeader, PersonAvatar, SectionTitle, Tag } from '../components/common'
import { MusicCard } from '../components/MusicCard'
import { holidayOn } from '../../shared/rules'
import { addDays, formatDuration, formatLocal, localDate, localTime, minutesBetween, today, zonedIso } from '../../shared/time'
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

  if (state.loading && !state.data) return <Card><CardContent><Loading /></CardContent></Card>
  const entry = state.data?.entry
  const openBreak = state.data?.openBreak
  const shift = todayShifts.data?.[0]
  const now = new Date().toISOString()

  return (
    <Card sx={{ bgcolor: entry ? (openBreak ? '#F3DED3' : '#E8EEE2') : 'background.paper' }}>
      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              {openBreak ? 'On a break' : entry ? 'Clocked in' : 'Not clocked in'}
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {openBreak ? formatDuration(minutesBetween(openBreak.started_at, now))
                : entry ? formatDuration(minutesBetween(entry.clock_in, now)) : formatLocal(now, 'HH:mm')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {entry ? `Since ${localTime(entry.clock_in)}${entry.break_minutes ? ` · ${entry.break_minutes} min break so far` : ''}`
                : shift ? `Your shift today: ${localTime(shift.starts_at)}–${localTime(shift.ends_at)}`
                : 'No shift scheduled today'}
            </Typography>
            {entry && entry.flags.length > 0 && <Box sx={{ mt: 1 }}><Flags flags={entry.flags} /></Box>}
          </Box>

          {!entry && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              {positions.length > 1 && (
                <TextField select label="Position" value={positionId || shift?.position_id || ''}
                  onChange={e => setPositionId(Number(e.target.value))} sx={{ width: { sm: 180 }, flexShrink: 0 }}>
                  {positions.filter(p => p.active).map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </TextField>
              )}
              <Button variant="contained" size="large" disabled={busy} sx={{ flex: 1, py: 1.5 }}
                onClick={() => act(() => api.clockIn(positionId || shift?.position_id || null), 'Clocked in. Have a good shift!')}>
                Clock in
              </Button>
            </Stack>
          )}
          {entry && !openBreak && (
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" size="large" disabled={busy} sx={{ flex: 1 }}
                onClick={e => setBreakMenu(e.currentTarget)}>Start break</Button>
              <Button variant="contained" color="error" size="large" disabled={busy} sx={{ flex: 1 }}
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
            <Button variant="contained" color="warning" size="large" disabled={busy}
              onClick={() => act(() => api.endBreak(), 'Welcome back')}>End break</Button>
          )}
          {settings?.phone_clock_in === 'off' && !entry && (
            <Alert severity="info">Clock-in from phones is off. Use the café tablet.</Alert>
          )}
        </Stack>
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
  const { api, me, profiles, positions, isAdmin } = useApp()
  const d = today()
  const data = useAsync('today', async () => {
    const [shifts, events, corrections, timeOff] = await Promise.all([
      api.shifts(zonedIso(d, '00:00'), zonedIso(addDays(d, 8), '00:00')),
      api.events(d, addDays(d, 21)),
      isAdmin ? api.corrections() : Promise.resolve([]),
      isAdmin ? api.timeOff(d, addDays(d, 365)) : Promise.resolve([]),
    ])
    return { shifts, events, corrections, timeOff }
  }, [d])

  const todays = (data.data?.shifts ?? []).filter(s => localDate(s.starts_at) === d)
  const mine = (data.data?.shifts ?? []).filter(s => s.profile_id === me?.id)
  const openShifts = (data.data?.shifts ?? []).filter(s => !s.profile_id)
  const holiday = holidayOn(d, data.data?.events ?? [])
  const pending = (data.data?.corrections ?? []).filter(c => c.status === 'pending').length
  const person = (id: string | null) => profiles.find(p => p.id === id)
  const position = (id: number | null) => positions.find(p => p.id === id)

  return (
    <>
      <PageHeader eyebrow={formatLocal(new Date(), 'EEEE d MMMM')} title={`Hola, ${me?.full_name.split(' ')[0]}`}
        subtitle="Your clock, today's team and what's coming up."
        actions={holiday && <Tag fg="#8E2B3A" bg="#F9DDE0">Holiday · {holiday.title}</Tag>} />
      <ErrorBox error={data.error} />
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
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 5 }}>
          <ClockCard onChange={data.reload} />
          <Box sx={{ mt: 2 }}><MusicCard /></Box>
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <SectionTitle>My next shifts</SectionTitle>
              {mine.length === 0 && <Typography color="text.secondary">No shifts in the next week.</Typography>}
              <List dense disablePadding>
                {mine.slice(0, 6).map(s => (
                  <ListItem key={s.id} disableGutters>
                    <ListItemText primary={`${formatLocal(s.starts_at, 'EEE d MMM')} · ${localTime(s.starts_at)}–${localTime(s.ends_at)}`}
                      secondary={[position(s.position_id)?.name, s.break_minutes ? `${s.break_minutes} min break` : null, s.note].filter(Boolean).join(' · ')} />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card>
            <CardContent>
              <SectionTitle>Who's on today</SectionTitle>
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
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <SectionTitle>Coming up</SectionTitle>
              {(data.data?.events ?? []).length === 0 && <Typography color="text.secondary">Nothing in the next 3 weeks.</Typography>}
              <List dense disablePadding>
                {(data.data?.events ?? []).slice(0, 8).map(e => (
                  <ListItem key={e.id} disableGutters>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: CATEGORY_META[e.category].colour, mr: 1.5, flexShrink: 0 }} />
                    <ListItemText
                      primary={e.title}
                      secondary={`${formatLocal(`${e.starts_on}T12:00:00Z`, 'EEE d MMM')}${e.starts_at ? ` · ${localTime(e.starts_at)}` : ''} · ${e.competition ?? CATEGORY_META[e.category].label}${e.town ? ` · ${e.town}` : ''}`} />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  )
}
