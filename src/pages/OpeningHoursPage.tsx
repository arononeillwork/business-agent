import {
  Alert, Box, Button, Card, CardContent, Grid, Stack, Switch, TextField, Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { PageHeader, SectionTitle } from '../components/common'
import { DAY_KEYS, type DayKey, type OpeningHours } from '../../shared/types'
import { dayKey, hmToMinutes, today } from '../../shared/time'
import { tokens } from '../theme'

const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

/** When the café is open: weekly hours, busiest hours, and upcoming holidays and closures. */
export function OpeningHoursPage() {
  const { api, business: b, isAdmin, refresh } = useApp()
  const run = useAction()
  const [hours, setHours] = useState<OpeningHours | null>(b?.opening_hours ?? null)
  const [peak, setPeak] = useState(b?.peak_hours ?? null)
  useEffect(() => { setHours(b?.opening_hours ?? null); setPeak(b?.peak_hours ?? null) }, [b])
  const google = useAsync('opening-google', () => (isAdmin ? api.integrations() : Promise.resolve(null)), [isAdmin])
  if (!b || !hours) return null

  const changed = JSON.stringify(hours) !== JSON.stringify(b.opening_hours) || JSON.stringify(peak) !== JSON.stringify(b.peak_hours)
  const invalid = DAY_KEYS.some(d => hours[d] && hmToMinutes(hours[d]!.close) <= hmToMinutes(hours[d]!.open))
  const g = google.data?.integrations.find(i => i.provider === 'google_business')
  const setDay = (d: DayKey, v: OpeningHours[DayKey]) => setHours({ ...hours, [d]: v })

  return (
    <>
      <PageHeader eyebrow="Café" title="Opening hours"
        subtitle="The hours the rota, alerts and your Google listing use." />

      <Grid container spacing={2.5}>
        <Grid size={12}>
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

        <Grid size={12}>
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

            {isAdmin && (
              <Alert severity={g?.status === 'connected' ? 'success' : 'info'}>
                {g?.status === 'connected'
                  ? <>Google Maps is kept in step: changes here, and closures you add in the <RouterLink to="/calendar">Calendar</RouterLink>, reach your listing within a minute.</>
                  : <>Connect your Google listing on <RouterLink to="/connections">Connections</RouterLink> and these hours, and closures you add in the <RouterLink to="/calendar">Calendar</RouterLink>, update Google Maps by themselves.</>}
              </Alert>
            )}
          </Stack>
        </Grid>
      </Grid>
    </>
  )
}
