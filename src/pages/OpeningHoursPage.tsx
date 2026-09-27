import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Grid, Stack, Switch, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { PageHeader, SectionTitle, Tag } from '../components/common'
import { DAY_KEYS, type DayKey, type OpeningHours } from '../../shared/types'
import { addDays, dayKey, formatLocal, hmToMinutes, localTime, today } from '../../shared/time'
import { tokens } from '../theme'

const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

function status(hours: OpeningHours) {
  const h = hours[dayKey(today())]
  if (!h) return { open: false, text: 'Closed today' }
  const now = hmToMinutes(localTime(new Date()))
  if (now < hmToMinutes(h.open)) return { open: false, text: `Opens at ${h.open}` }
  if (now >= hmToMinutes(h.close)) return { open: false, text: 'Closed now' }
  return { open: true, text: `Open now · closes ${h.close}` }
}

/** When the café is open: weekly hours, busiest hours, and upcoming holidays and closures. */
export function OpeningHoursPage() {
  const { api, business: b, isAdmin, refresh } = useApp()
  const run = useAction()
  const [hours, setHours] = useState<OpeningHours | null>(b?.opening_hours ?? null)
  const [peak, setPeak] = useState(b?.peak_hours ?? null)
  const [closing, setClosing] = useState(false)
  useEffect(() => { setHours(b?.opening_hours ?? null); setPeak(b?.peak_hours ?? null) }, [b])
  const special = useAsync('opening-special', () => api.events(today(), addDays(today(), 120)), [])
  const google = useAsync('opening-google', () => (isAdmin ? api.integrations() : Promise.resolve(null)), [isAdmin])
  if (!b || !hours) return null

  const changed = JSON.stringify(hours) !== JSON.stringify(b.opening_hours) || JSON.stringify(peak) !== JSON.stringify(b.peak_hours)
  const invalid = DAY_KEYS.some(d => hours[d] && hmToMinutes(hours[d]!.close) <= hmToMinutes(hours[d]!.open))
  const s = status(b.opening_hours)
  const g = google.data?.integrations.find(i => i.provider === 'google_business')
  const upcoming = (special.data ?? []).filter(e =>
    ['national', 'regional', 'local'].includes(e.category) || (e.category === 'business' && /closed|cerrad|closure/i.test(e.title)))
  const setDay = (d: DayKey, v: OpeningHours[DayKey]) => setHours({ ...hours, [d]: v })

  return (
    <>
      <PageHeader eyebrow="Café" title="Opening hours"
        subtitle="The hours the rota, alerts and your Google listing use."
        actions={<Tag fg={s.open ? tokens.goodFg : tokens.neutralFg} bg={s.open ? tokens.goodBg : tokens.neutralBg}>● {s.text}</Tag>} />

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card component="section" aria-label="Weekly hours">
            <CardContent>
              <SectionTitle>Every week</SectionTitle>
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
                {DAY_KEYS.map(d => {
                  const h = hours[d]
                  const isToday = d === dayKey(today())
                  const bad = h && hmToMinutes(h.close) <= hmToMinutes(h.open)
                  return (
                    <Stack key={d} direction="row" sx={{ alignItems: 'center', gap: 1.5, py: 1.1, flexWrap: 'wrap' }}>
                      <Box sx={{ width: 130, flexShrink: 0 }}>
                        <Typography sx={{ fontWeight: isToday ? 600 : 400 }}>{DAY_LABELS[d]}</Typography>
                        {isToday && <Typography variant="caption" sx={{ color: tokens.roseDeep }}>Today</Typography>}
                      </Box>
                      {isAdmin && (
                        <Switch checked={!!h} slotProps={{ input: { 'aria-label': `Open on ${DAY_LABELS[d]}` } }}
                          onChange={e => setDay(d, e.target.checked ? (b.opening_hours[d] ?? { open: '09:00', close: '17:00' }) : null)} />
                      )}
                      {h ? (
                        isAdmin ? (
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flex: 1, minWidth: 220 }}>
                            <TextField type="time" size="small" label="Opens" value={h.open} onChange={e => setDay(d, { ...h, open: e.target.value })}
                              slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: 130 }} />
                            <Typography sx={{ color: 'text.secondary' }}>to</Typography>
                            <TextField type="time" size="small" label="Closes" value={h.close} onChange={e => setDay(d, { ...h, close: e.target.value })}
                              error={!!bad} slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: 130 }} />
                          </Stack>
                        ) : <Typography sx={{ fontVariantNumeric: 'tabular-nums' }}>{h.open} – {h.close}</Typography>
                      ) : <Typography sx={{ color: 'text.secondary' }}>Closed</Typography>}
                    </Stack>
                  )
                })}
              </Stack>
              {isAdmin && (
                <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: 'center' }}>
                  <Button variant="contained" disabled={!changed || invalid} onClick={() => run(async () => {
                    await api.updateBusiness({ opening_hours: hours, peak_hours: peak }); await refresh()
                  }, 'Opening hours saved')}>Save hours</Button>
                  {changed && <Button onClick={() => { setHours(b.opening_hours); setPeak(b.peak_hours) }}>Undo changes</Button>}
                  {invalid && <Typography variant="body2" sx={{ color: 'error.main' }}>Closing time must be after opening time.</Typography>}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Stack spacing={2.5}>
            <Card component="section" aria-label="Busiest hours">
              <CardContent>
                <SectionTitle>Busiest hours</SectionTitle>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>The rota warns when only one person is on during these hours.</Typography>
                {isAdmin ? (
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <TextField type="time" size="small" label="From" value={peak?.start ?? ''} slotProps={{ inputLabel: { shrink: true } }}
                      onChange={e => setPeak({ start: e.target.value, end: peak?.end ?? '15:00' })} />
                    <TextField type="time" size="small" label="To" value={peak?.end ?? ''} slotProps={{ inputLabel: { shrink: true } }}
                      onChange={e => setPeak({ start: peak?.start ?? '11:00', end: e.target.value })} />
                  </Stack>
                ) : <Typography>{b.peak_hours ? `${b.peak_hours.start} – ${b.peak_hours.end}` : 'Not set'}</Typography>}
              </CardContent>
            </Card>

            <Card component="section" aria-label="Holidays and closures">
              <CardContent>
                <SectionTitle action={isAdmin && <Button size="small" startIcon={<AddIcon />} onClick={() => setClosing(true)}>Add a closure</Button>}>
                  Holidays and closures
                </SectionTitle>
                {special.data && upcoming.length === 0 && <Typography sx={{ color: 'text.secondary' }}>Nothing in the next four months.</Typography>}
                <Stack spacing={1}>
                  {upcoming.slice(0, 10).map(e => {
                    const closed = e.category === 'business'
                    return (
                      <Stack key={e.id} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                        <Box sx={{ width: 52, textAlign: 'center', flexShrink: 0, py: 0.5, borderRadius: '10px', bgcolor: closed ? tokens.badBg : tokens.surfaceAlt }}>
                          <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2, textTransform: 'uppercase', color: 'text.secondary' }}>{formatLocal(`${e.starts_on}T12:00:00Z`, 'MMM')}</Typography>
                          <Typography sx={{ fontWeight: 600, lineHeight: 1.1 }}>{Number(e.starts_on.slice(8))}</Typography>
                        </Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography noWrap>{e.title}</Typography>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
                            {formatLocal(`${e.starts_on}T12:00:00Z`, 'EEEE')}{e.ends_on && e.ends_on !== e.starts_on ? ` to ${formatLocal(`${e.ends_on}T12:00:00Z`, 'EEE d MMM')}` : ''}{e.town ? ` · ${e.town}` : ''}
                          </Typography>
                        </Box>
                        {closed ? <Tag fg={tokens.badFg} bg={tokens.badBg}>Closed</Tag> : <Tag>Holiday</Tag>}
                      </Stack>
                    )
                  })}
                </Stack>
                <Button component={RouterLink} to="/calendar" size="small" sx={{ mt: 1.5, ml: -1 }}>Open the calendar</Button>
              </CardContent>
            </Card>

            {isAdmin && (
              <Alert severity={g?.status === 'connected' ? 'success' : 'info'}>
                {g?.status === 'connected'
                  ? <>Google Maps is kept in step: changes here and closures reach your listing within a minute.</>
                  : <>Connect your Google listing on <RouterLink to="/connections">Connections</RouterLink> and these hours and closures update Google Maps by themselves.</>}
              </Alert>
            )}
          </Stack>
        </Grid>
      </Grid>
      {closing && <ClosureDialog onClose={() => { setClosing(false); void special.reload() }} />}
    </>
  )
}

function ClosureDialog({ onClose }: { onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [from, setFrom] = useState(addDays(today(), 1))
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Add a closure</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField type="date" label="Closed from" value={from} onChange={e => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="date" label="Until (optional)" value={to} onChange={e => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="Reason (optional)" placeholder="Staff holiday, refurbishment…" value={reason} onChange={e => setReason(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!from || (!!to && to < from)} onClick={async () => {
          const ok = await run(() => api.saveEvent({
            title: `Closed${reason.trim() ? `: ${reason.trim()}` : ''}`, category: 'business', starts_on: from, ends_on: to || null,
            starts_at: null, town: null, confirmed: true, visibility: 'all',
          }), 'Closure added')
          if (ok) onClose()
        }}>Add closure</Button>
      </DialogActions>
    </Dialog>
  )
}
