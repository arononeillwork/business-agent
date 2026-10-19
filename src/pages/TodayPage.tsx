import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, Menu, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync, useTick } from '../app/hooks'
import { useAction } from '../app/Notify'
import { ErrorBox, Flags, Loading, PageHeader, PersonAvatar, SectionTitle, Tag } from '../components/common'
import { MusicCard } from '../components/MusicCard'
import { SetupPrompt } from './SetupPage'
import { holidayOn } from '../../shared/rules'
import { addDays, dayKey, formatDuration, formatLocal, localDate, localTime, minutesBetween, today, zonedIso } from '../../shared/time'
import { fonts, tokens } from '../theme'
import { EventAlertButton } from '../components/NotificationBell'
import { CATEGORY_META, type TimeEntry } from '../../shared/types'
import { t, tn } from '../i18n'

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
    <Card component="section" aria-label={t('Your clock')} sx={{ mb: 2.5 }}>
      <CardContent sx={{ py: '14px !important' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5, alignItems: { sm: 'center' } }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
            <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: tone, flexShrink: 0,
              boxShadow: entry ? `0 0 0 4px ${openBreak ? tokens.warnBg : tokens.goodBg}` : 'none' }} />
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline' }}>
                <Typography sx={{ fontWeight: 500 }}>{openBreak ? t('On a break') : entry ? t('Clocked in') : t('Not clocked in')}</Typography>
                {(entry || openBreak) && (
                  <Typography sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                    · {formatDuration(minutesBetween(openBreak ? openBreak.started_at : entry!.clock_in, now))}
                  </Typography>
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {entry ? t('Since {time}', { time: localTime(entry.clock_in) }) + (entry.break_minutes ? ` · ${t('{n} min break so far', { n: entry.break_minutes })}` : '')
                  : shift ? t('Your shift today: {from}–{to}', { from: localTime(shift.starts_at), to: localTime(shift.ends_at) })
                  : t('No shift scheduled today')}
              </Typography>
              {entry && entry.flags.length > 0 && <Box sx={{ mt: 0.5 }}><Flags flags={entry.flags} /></Box>}
            </Box>
          </Stack>

          {!entry && (
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, alignItems: { sm: 'center' }, width: { xs: '100%', sm: 'auto' } }}>
              {positions.length > 1 && (
                <TextField select size="small" label={t('Position')} value={positionId || shift?.position_id || ''}
                  onChange={e => setPositionId(Number(e.target.value))} sx={{ width: { xs: '100%', sm: 160 } }}>
                  {positions.filter(p => p.active).map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </TextField>
              )}
              <Button variant="contained" disabled={busy} sx={{ flex: { xs: 1, sm: 'none' }, minHeight: { xs: 46, sm: 38 } }}
                onClick={() => act(() => api.clockIn(positionId || shift?.position_id || null), t('Clocked in. Have a good shift!'))}>
                {t('Clock in')}
              </Button>
            </Stack>
          )}
          {entry && !openBreak && (
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" disabled={busy} onClick={e => setBreakMenu(e.currentTarget)}>{t('Start break')}</Button>
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
                }}>{t('Clock out')}</Button>
              <Menu anchorEl={breakMenu} open={!!breakMenu} onClose={() => setBreakMenu(null)}>
                {breakTypes.map(b => (
                  <MenuItem key={b.id} onClick={() => { setBreakMenu(null); act(() => api.startBreak(b.id), t('Enjoy your break')) }}>
                    {b.name}
                  </MenuItem>
                ))}
              </Menu>
            </Stack>
          )}
          {openBreak && (
            <Button variant="contained" disabled={busy} onClick={() => act(() => api.endBreak(), t('Welcome back'))}>{t('End break')}</Button>
          )}
        </Stack>
        {settings?.phone_clock_in === 'off' && !entry && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>{t('Clock-in from phones is off. Use the café tablet.')}</Typography>
        )}
      </CardContent>

      <Dialog open={!!summary} onClose={() => setSummary(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t('Workday summary')}</DialogTitle>
        {summary && (
          <DialogContent>
            <Stack spacing={1}>
              <Row label={t('Clock in')} value={localTime(summary.clock_in)} />
              <Row label={t('Clock out')} value={summary.clock_out ? localTime(summary.clock_out) : '—'} />
              <Row label={t('Breaks')} value={t('{n} min', { n: summary.break_minutes })} />
              <Row label={t('Paid hours')} value={formatDuration(summary.paid_minutes)} strong />
              {summary.flags.length > 0 && <Flags flags={summary.flags} />}
              {summary.flags.includes('missed_break') && (
                <Alert severity="warning">{t('Shifts over 6 hours need at least a 15-minute break. Tell a manager if you took one.')}</Alert>
              )}
            </Stack>
          </DialogContent>
        )}
        <DialogActions><Button onClick={() => setSummary(null)}>{t('Done')}</Button></DialogActions>
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

/** A small calendar date: the weekday over the day of the month, with the event's colour on top. */
function DateBadge({ date, accent, today: isToday }: { date: string; accent?: string; today?: boolean }) {
  const at = `${date}T12:00:00Z`
  return (
    <Box aria-hidden sx={{ width: 46, flexShrink: 0, borderRadius: '10px', overflow: 'hidden', textAlign: 'center', pb: 0.5,
      bgcolor: isToday ? tokens.roseSoft : tokens.surfaceAlt, border: `1px solid ${tokens.line}`, borderTop: `3px solid ${accent ?? (isToday ? tokens.rose : tokens.line)}` }}>
      <Typography sx={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1.6, mt: 0.25,
        color: isToday ? tokens.roseDeep : 'text.secondary' }}>
        {formatLocal(at, 'EEE')}
      </Typography>
      <Typography sx={{ fontFamily: fonts.display, fontSize: '1.15rem', lineHeight: 1.1 }}>{formatLocal(at, 'd')}</Typography>
    </Box>
  )
}

/** One line in a Today card: a date or a face, two lines of text, and an optional button. */
function Item({ lead, primary, secondary, action, label }: { lead: ReactNode; primary: ReactNode; secondary?: ReactNode; action?: ReactNode; label?: string }) {
  return (
    <Stack component="li" aria-label={label} direction="row" spacing={1.5}
      sx={{ alignItems: 'center', py: 1, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0, pt: 0 } }}>
      {lead}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap>{primary}</Typography>
        {secondary && <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{secondary}</Typography>}
      </Box>
      {action}
    </Stack>
  )
}

const Items = ({ children }: { children: ReactNode }) => <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>{children}</Box>
const Quiet = ({ children }: { children: ReactNode }) => <Typography sx={{ color: 'text.secondary' }}>{children}</Typography>

/**
 * The landing page: a short overview of the day. Clock in, who's on and the café's hours, what's
 * coming up, your own next shifts, the week's big matches and the music.
 */
export function TodayPage() {
  const { api, me, profiles, positions, isAdmin, business } = useApp()
  const d = today()
  const sportsOn = !!business?.sports_enabled
  const data = useAsync('today', async () => {
    const [shifts, events, corrections, timeOff, comps, sports] = await Promise.all([
      api.shifts(zonedIso(d, '00:00'), zonedIso(addDays(d, 8), '00:00')),
      api.events(d, addDays(d, 60)),
      isAdmin ? api.corrections() : Promise.resolve([]),
      isAdmin ? api.timeOff(d, addDays(d, 365)) : Promise.resolve([]),
      sportsOn ? api.sportsCompetitions().catch(() => []) : Promise.resolve([]),
      sportsOn ? api.sportsEvents(zonedIso(d, '00:00'), zonedIso(addDays(d, 8), '00:00')).catch(() => []) : Promise.resolve([]),
    ])
    const followed = new Map(comps.filter(c => c.followed).map(c => [c.code, c.name]))
    return { shifts, events, corrections, timeOff, bigNights: sports.filter(e => e.big && followed.has(e.competition)).map(e => ({ ...e, compName: followed.get(e.competition)! })) }
  }, [d, sportsOn])

  const todays = (data.data?.shifts ?? []).filter(s => localDate(s.starts_at) === d)
  const mine = (data.data?.shifts ?? []).filter(s => s.profile_id === me?.id)
  const openShifts = (data.data?.shifts ?? []).filter(s => !s.profile_id)
  const holiday = holidayOn(d, data.data?.events ?? [])
  const pending = (data.data?.corrections ?? []).filter(c => c.status === 'pending').length
  const person = (id: string | null) => profiles.find(p => p.id === id)
  const position = (id: number | null) => positions.find(p => p.id === id)
  const upcoming = (data.data?.events ?? []).filter(e => e.starts_on <= addDays(d, 21))
  const big = data.data?.bigNights ?? []
  const hours = business?.opening_hours[dayKey(d)]

  return (
    <>
      <PageHeader eyebrow={formatLocal(new Date(), 'EEEE d MMMM')} title={t('Hola, {name}', { name: me?.full_name.split(' ')[0] ?? '' })}
        actions={holiday && <Tag fg={tokens.badFg} bg={tokens.badBg}>{t('Holiday · {name}', { name: holiday.title })}</Tag>} />
      <ErrorBox error={data.error} />
      {isAdmin && business && !business.setup_completed_at && <SetupPrompt />}
      {isAdmin && (data.data?.timeOff ?? []).some(t => t.status === 'pending') && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button component={Link} to="/time-off" color="inherit">{t('Review')}</Button>}>
          {t('Time off requests waiting for approval')}
        </Alert>
      )}
      {isAdmin && pending > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} action={<Button component={Link} to="/timecards" color="inherit">{t('Review')}</Button>}>
          {tn(pending, '{n} timecard correction request waiting for approval', '{n} timecard correction requests waiting for approval')}
        </Alert>
      )}

      <ClockCard onChange={data.reload} />

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Stack spacing={2.5}>
            <Card component="section" aria-label={t("Who's on today")}>
              <CardContent>
                <SectionTitle action={<Button size="small" component={Link} to="/rota">{t('Rota')}</Button>}>{t("Who's on today")}</SectionTitle>
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1, mb: 1.5 }}>
                  {hours ? t('The café is open {open}–{close}', { open: hours.open, close: hours.close }) : t('The café is closed today')}
                </Typography>
                {!data.data && <Loading />}
                {data.data && todays.length === 0 && <Quiet>{t('Nobody is scheduled today.')}</Quiet>}
                <Items>
                  {todays.map(s => {
                    const p = person(s.profile_id)
                    return (
                      <Item key={s.id} lead={<PersonAvatar name={p?.full_name ?? '?'} colour={p?.colour ?? '#C6C2BB'} size={36} />}
                        primary={p?.full_name ?? t('Open shift')}
                        secondary={[`${localTime(s.starts_at)}–${localTime(s.ends_at)}`, position(s.position_id)?.name].filter(Boolean).join(' · ')} />
                    )
                  })}
                </Items>
                {openShifts.length > 0 && (
                  <Alert severity="info" sx={{ mt: 1.5 }} action={<Button component={Link} to="/rota" color="inherit">{t('View')}</Button>}>
                    {tn(openShifts.length, '{n} open shift this week you can pick up', '{n} open shifts this week you can pick up')}
                  </Alert>
                )}
              </CardContent>
            </Card>
            <Card component="section" aria-label={t('Coming up')}>
              <CardContent>
                <SectionTitle action={<Button size="small" component={Link} to="/calendar">{t('Calendar')}</Button>}>{t('Coming up')}</SectionTitle>
                {data.data && upcoming.length === 0 && <Quiet>{t('Nothing in the next 3 weeks.')}</Quiet>}
                <Items>
                  {upcoming.slice(0, 6).map(e => (
                    <Item key={e.id} label={e.title} lead={<DateBadge date={e.starts_on} accent={CATEGORY_META[e.category].colour} today={e.starts_on === d} />}
                      primary={e.title}
                      secondary={[e.starts_at ? localTime(e.starts_at) : null, e.competition ?? t(CATEGORY_META[e.category].label), e.town].filter(Boolean).join(' · ')}
                      action={<EventAlertButton kind="calendar" refId={e.id} title={e.title} />} />
                  ))}
                </Items>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={2.5}>
            <Card component="section" aria-label={t('My next shifts')}>
              <CardContent>
                <SectionTitle>{t('My next shifts')}</SectionTitle>
                {data.data && mine.length === 0 && <Quiet>{t('No shifts in the next week.')}</Quiet>}
                <Items>
                  {mine.slice(0, 4).map(s => (
                    <Item key={s.id} lead={<DateBadge date={localDate(s.starts_at)} today={localDate(s.starts_at) === d} />}
                      primary={`${localTime(s.starts_at)}–${localTime(s.ends_at)}`}
                      secondary={[position(s.position_id)?.name, s.break_minutes ? t('{n} min break', { n: s.break_minutes }) : null, s.note].filter(Boolean).join(' · ')} />
                  ))}
                </Items>
              </CardContent>
            </Card>
            {sportsOn && <Card component="section" aria-label={t('Big nights')}>
              <CardContent>
                <SectionTitle action={<Button size="small" component={Link} to="/sports">{t('Sports')}</Button>}>{t('Big nights this week')}</SectionTitle>
                {data.data && big.length === 0 && <Quiet>{t('No big matches or fights this week.')}</Quiet>}
                <Items>
                  {big.slice(0, 4).map(e => (
                    <Item key={e.id} label={e.title} lead={<DateBadge date={localDate(e.starts_at)} accent={tokens.rose} today={localDate(e.starts_at) === d} />}
                      primary={e.title}
                      secondary={[e.time_tbc ? t('Time to be confirmed') : localTime(e.starts_at), e.compName].join(' · ')}
                      action={<EventAlertButton kind="sports" refId={e.id} title={e.title} />} />
                  ))}
                </Items>
              </CardContent>
            </Card>}
            <MusicCard />
          </Stack>
        </Grid>
      </Grid>
    </>
  )
}
