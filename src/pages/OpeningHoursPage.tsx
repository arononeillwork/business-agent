import {
  Alert, Box, Button, Card, CardContent, Checkbox, FormControlLabel, Grid, Stack, TextField, Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { PageHeader, SectionTitle } from '../components/common'
import { DAY_KEYS, type DayHours, type DayKey, type OpeningHours } from '../../shared/types'
import { breakOf, hoursLabel, hoursProblem } from '../../shared/openingHours'
import { dayKey, formatLocal, hmToMinutes, today } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t, tc, tn, tr } from '../i18n'

const DAY_LABELS: Record<DayKey, string> = {
  mon: msg('Monday'), tue: msg('Tuesday'), wed: msg('Wednesday'), thu: msg('Thursday'), fri: msg('Friday'), sat: msg('Saturday'), sun: msg('Sunday'),
}

/** The day without its break. */
const withoutBreak = ({ open, close }: DayHours): DayHours => ({ open, close })

/** When the café is open, week by week (closures live in the Calendar). */
export function OpeningHoursPage() {
  const { api, business: b, isAdmin } = useApp()
  const run = useAction()
  const [hours, setHours] = useState<OpeningHours | null>(b?.opening_hours ?? null)
  // Saving until the business is back with them (the hours reset from it), so they're saved once.
  const [saving, setSaving] = useState(false)
  useEffect(() => { setHours(b?.opening_hours ?? null) }, [b])
  const google = useAsync('opening-google', () => (isAdmin ? api.integrations() : Promise.resolve(null)), [isAdmin])
  if (!b || !hours) return null

  const changed = JSON.stringify(hours) !== JSON.stringify(b.opening_hours)
  const problem = DAY_KEYS.map(d => hoursProblem(hours[d])).find(Boolean) ?? null
  const g = google.data?.integrations.find(i => i.provider === 'google_business')
  const waiting = google.data?.queue.filter(q => q.status === 'pending').length ?? 0
  const failing = google.data?.queue.filter(q => q.status !== 'pending').length ?? 0
  const setDay = (d: DayKey, v: OpeningHours[DayKey]) => setHours({ ...hours, [d]: v })

  return (
    <>
      <PageHeader eyebrow={t('Café')} title={t('Opening hours')} />

      <Grid container spacing={2.5}>
        <Grid size={12}>
          <Card component="section" aria-label={t('Weekly hours')}>
            <CardContent>
              <SectionTitle>{t('Every week')}</SectionTitle>
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
                {DAY_KEYS.map(d => {
                  const h = hours[d]
                  const isToday = d === dayKey(today())
                  const bad = h && hmToMinutes(h.close) <= hmToMinutes(h.open)
                  const badBreak = !!h?.break && !breakOf(h)
                  return (
                    <Stack key={d} direction="row" sx={{ alignItems: 'center', gap: 1.5, py: 1.1, flexWrap: 'wrap' }}>
                      <Box sx={{ width: 130, flexShrink: 0 }}>
                        <Typography sx={{ fontWeight: isToday ? 600 : 400 }}>{t(DAY_LABELS[d])}</Typography>
                        {isToday && <Typography variant="caption" sx={{ color: tokens.roseDeep }}>{t('Today')}</Typography>}
                      </Box>
                      {isAdmin && (
                        // A ticked "Open" box: unticked means closed all day.
                        <FormControlLabel label={tc('hours', 'Open')} sx={{ mr: 0.5, minWidth: 84 }}
                          control={<Checkbox checked={!!h} slotProps={{ input: { 'aria-label': t('Open on {day}', { day: t(DAY_LABELS[d]) }) } }}
                            onChange={e => setDay(d, e.target.checked ? (b.opening_hours[d] ?? { open: '09:00', close: '17:00' }) : null)} />} />
                      )}
                      {h ? (
                        isAdmin ? (
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flex: 1, minWidth: 220 }}>
                            <TextField type="time" size="small" label={t('Opens')} value={h.open} onChange={e => setDay(d, { ...h, open: e.target.value })}
                              slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: 150 }} />
                            <Typography sx={{ color: 'text.secondary' }}>{t('to')}</Typography>
                            <TextField type="time" size="small" label={t('Closes')} value={h.close} onChange={e => setDay(d, { ...h, close: e.target.value })}
                              error={!!bad} slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: 150 }} />
                          </Stack>
                        ) : <Typography sx={{ fontVariantNumeric: 'tabular-nums' }}>{hoursLabel(h)}</Typography>
                      ) : <Typography sx={{ color: 'text.secondary' }}>{t('Closed')}</Typography>}
                      {h && isAdmin && (
                        // Closed in between (09:00–14:00 and 17:00–20:00): Google Maps and the website show both parts.
                        <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 1, width: '100%', mt: -0.5, pl: { xs: 0, sm: '142px' } }}>
                          <FormControlLabel label={t('Closes for a break')} sx={{ mr: 0 }}
                            control={<Checkbox checked={!!h.break} slotProps={{ input: { 'aria-label': t('Closes for a break on {day}', { day: t(DAY_LABELS[d]) }) } }}
                              onChange={e => setDay(d, e.target.checked ? { ...h, break: b.opening_hours[d]?.break ?? { from: '14:00', to: '17:00' } } : withoutBreak(h))} />} />
                          {h.break && (
                            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flex: { xs: 1, sm: 'none' }, minWidth: 220 }}>
                              <TextField type="time" size="small" label={t('Closed from')} value={h.break.from} error={badBreak}
                                onChange={e => setDay(d, { ...h, break: { ...h.break!, from: e.target.value } })}
                                slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: 150 }} />
                              <Typography sx={{ color: 'text.secondary' }}>{t('to')}</Typography>
                              <TextField type="time" size="small" label={t('Reopens')} value={h.break.to} error={badBreak}
                                onChange={e => setDay(d, { ...h, break: { ...h.break!, to: e.target.value } })}
                                slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: 150 }} />
                            </Stack>
                          )}
                        </Stack>
                      )}
                    </Stack>
                  )
                })}
              </Stack>
              {isAdmin && (
                <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: 'center' }}>
                  <Button variant="contained" disabled={saving || !changed || !!problem} onClick={() => {
                    setSaving(true)
                    void run(() => api.updateBusiness({ opening_hours: hours }), t('Opening hours saved'), { fresh: true }).finally(() => setSaving(false))
                  }}>{t('Save hours')}</Button>
                  {changed && <Button disabled={saving} onClick={() => setHours(b.opening_hours)}>{t('Undo changes')}</Button>}
                  {problem && <Typography variant="body2" sx={{ color: 'error.main' }}>{t(problem)}</Typography>}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        {isAdmin && (g?.status === 'connected' || g?.status === 'error') && (
          // Google Maps looks after itself: nothing to push. Here: how it's going, and public holidays.
          <Grid size={12}>
            <Card component="section" aria-label={t('Google Maps')}>
              <CardContent>
                <SectionTitle>{'Google Maps'}</SectionTitle>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                  {tr('Kept in step by itself: changes here, and closures you add in the {calendar}, reach your listing within a minute; changes made on Google Maps come in within 15 minutes.', {
                    calendar: <RouterLink to="/calendar">{t('Calendar')}</RouterLink> })}
                  {g.last_sync_at ? ` ${t('Last sent {when}.', { when: formatLocal(g.last_sync_at, 'd MMM, HH:mm') })}` : ''}
                </Typography>
                {!g.external.location && (
                  <Alert severity="warning" sx={{ mb: 1 }}>
                    {tr('Choose which of your Google listings is the café’s on {connections}.', { connections: <RouterLink to="/connections">{t('Connections')}</RouterLink> })}
                  </Alert>
                )}
                {g.status === 'error' && g.last_error && <Alert severity="error" sx={{ mb: 1 }}>{g.last_error}</Alert>}
                {(waiting > 0 || failing > 0) && (
                  <Alert severity={failing ? 'warning' : 'info'} sx={{ mb: 1 }}>
                    {waiting > 0 && `${tn(waiting, '{n} update waiting to send.', '{n} updates waiting to send.')} `}
                    {failing > 0 && t('{n} failed and will be retried automatically.', { n: failing })}
                  </Alert>
                )}
                <FormControlLabel sx={{ ml: 0 }} control={<Checkbox checked={!!g.external.closed_on_holidays}
                  onChange={e => run(async () => { await api.chooseGoogleListing(null, e.target.checked); await google.reload() }, t('Saved'))} />}
                  label={t('We close on public holidays')} />
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  {tr('Google Maps then shows the café closed on the public holidays in the {calendar}.', { calendar: <RouterLink to="/calendar">{t('Calendar')}</RouterLink> })}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}
        {isAdmin && g?.status !== 'connected' && g?.status !== 'error' && (
          <Grid size={12}>
            <Alert severity="info">
              {tr('Connect your Google listing on {connections} and these hours, and closures you add in the {calendar}, update Google Maps by themselves.', {
                connections: <RouterLink to="/connections">{t('Connections')}</RouterLink>, calendar: <RouterLink to="/calendar">{t('Calendar')}</RouterLink> })}
            </Alert>
          </Grid>
        )}
      </Grid>
    </>
  )
}
