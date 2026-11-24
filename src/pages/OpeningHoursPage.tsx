import {
  Alert, Box, Button, Card, CardContent, Checkbox, FormControlLabel, Grid, Stack, TextField, Typography,
} from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { useEffect, useState, type ReactNode } from 'react'
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

// The week is a grid, the headings' row and every day's alike, sized by the card (not the screen), so it
// fits whatever the menu beside it leaves. A wide card (a computer): one line a day, the day, its two boxes and
// its four times. A narrow one (a phone, a tablet): the day and its boxes, then its four times under the headings.
const WIDE = '@container (min-width: 880px)'
/** A big monitor: the columns stop growing, so the times don't stretch across it. */
const HUGE = '@container (min-width: 1100px)'
/** Too narrow for the time fields' clock buttons and their usual padding (a phone, a small tablet). */
const NARROW = '@container (max-width: 599.98px)'
/** A 12-hour clock ("06:00 PM") takes more room than "18:00": on a phone its times get a smaller font, to fit. */
const TWELVE_HOUR = (() => {
  try { return /^h1[12]$/.test(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle ?? '') } catch { return false }
})()
const COLUMNS = {
  display: 'grid', alignItems: 'center', columnGap: 1, rowGap: 0.75,
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gridTemplateAreas: '"day day ticks ticks" "opens closes from reopens"',
  [WIDE]: {
    columnGap: 1.5,
    gridTemplateColumns: 'minmax(100px, 0.8fr) 56px repeat(2, minmax(0, 1fr)) 120px repeat(2, minmax(0, 1fr))',
    gridTemplateAreas: '"day open opens closes brk from reopens"',
  },
  [HUGE]: { gridTemplateColumns: '160px 56px repeat(2, 170px) 132px repeat(2, 170px)' },
}
/** What staff see: each day and its hours. */
const STAFF_COLUMNS = {
  display: 'grid', alignItems: 'center', columnGap: 2, gridTemplateColumns: 'minmax(0, 1fr) auto', gridTemplateAreas: '"day hours"',
  [WIDE]: { gridTemplateColumns: 'minmax(110px, 200px) minmax(0, 1fr)' },
}
const ROW = { borderTop: 1, borderColor: 'divider', py: 1.25, [WIDE]: { py: 1 } }
/** The two boxes: side by side at the end of the day's line, or each in its column on a wide card. */
const TICKS = { gridArea: 'ticks', display: 'flex', justifySelf: 'end', [WIDE]: { display: 'contents' } }
const tick = (area: 'open' | 'brk') => ({ gridArea: area, width: 60, display: 'flex', justifyContent: 'center', textAlign: 'center', [WIDE]: { width: 'auto' } })
/** Text in a time's column starts where the times do. */
const INSET = { pl: 1.25, [NARROW]: { pl: 0.75 } }
const TIME = {
  '& .MuiInputBase-root': { height: 40 },
  '& .MuiInputBase-input': { px: 1.25, fontVariantNumeric: 'tabular-nums' },
  [NARROW]: {
    // Four to a line, each a quarter of the card less the gaps; "06:00 PM" in a smaller font.
    '& .MuiInputBase-input': TWELVE_HOUR ? { px: 0.5, fontSize: 'min(1em, calc((100cqi - 56px) / 20))' } : { px: 0.75 },
    '& input::-webkit-calendar-picker-indicator': { display: 'none' },
  },
}
/** Where "Closed" goes on a day that doesn't open: across its times. */
const CLOSED = { gridColumn: '1 / -1', gridRow: 2, [WIDE]: { gridColumn: '3 / -1', gridRow: 1 } }

function Heading({ sx, children }: { sx?: SxProps<Theme>; children: ReactNode }) {
  return (
    <Typography variant="caption" sx={[{ color: 'text.secondary', fontWeight: 600, lineHeight: 1.3 }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {children}
    </Typography>
  )
}

function Muted({ sx, quiet, children }: { sx?: SxProps<Theme>; quiet?: boolean; children: ReactNode }) {
  return (
    <Typography aria-hidden={quiet || undefined} sx={[INSET, { color: quiet ? tokens.inkFaint : 'text.secondary' }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {children}
    </Typography>
  )
}

/** A time under its heading; its name says which and the day ("Reopens on Thursday"). */
function TimeField({ area, label, value, error, onChange }: { area: string; label: string; value: string; error?: boolean; onChange: (v: string) => void }) {
  return (
    <TextField type="time" value={value} error={error} onChange={e => onChange(e.target.value)} sx={[{ gridArea: area }, TIME]}
      slotProps={{ htmlInput: { 'aria-label': label } }} />
  )
}

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
  const todayKey = dayKey(today())

  return (
    <>
      <PageHeader eyebrow={t('Café')} title={t('Opening hours')} />

      <Grid container spacing={2.5}>
        <Grid size={12}>
          <Card component="section" aria-label={t('Weekly hours')}>
            <CardContent sx={{ px: { xs: 2, sm: 3 } }}>
              <Box sx={{ containerType: 'inline-size' }}>
                {/* On a narrow card the boxes' headings share the title's line, over the boxes at the end of each day's. */}
                <SectionTitle action={isAdmin && (
                  <Box aria-hidden sx={{ display: 'flex', alignSelf: 'end', [WIDE]: { display: 'none' } }}>
                    <Heading sx={tick('open')}>{tc('hours', 'Open')}</Heading>
                    <Heading sx={tick('brk')}>{tc('hours', 'Break')}</Heading>
                  </Box>
                )}>{t('Every week')}</SectionTitle>
                {isAdmin && (
                  // The headings, once: every day's boxes and times line up under them (each field has its own name, with its day).
                  <Box aria-hidden sx={[COLUMNS, { alignItems: 'end', rowGap: 0, pb: 0.75 }]}>
                    <Box sx={{ ...TICKS, display: 'none' }}>
                      <Heading sx={tick('open')}>{tc('hours', 'Open')}</Heading>
                      <Heading sx={tick('brk')}>{t('Closes for a break')}</Heading>
                    </Box>
                    <Heading sx={[INSET, { gridArea: 'opens' }]}>{t('Opens')}</Heading>
                    <Heading sx={[INSET, { gridArea: 'closes' }]}>{t('Closes')}</Heading>
                    <Heading sx={[INSET, { gridArea: 'from' }]}>{t('Closed from')}</Heading>
                    <Heading sx={[INSET, { gridArea: 'reopens' }]}>{t('Reopens')}</Heading>
                  </Box>
                )}
                {DAY_KEYS.map(d => {
                  const h = hours[d]
                  const day = t(DAY_LABELS[d])
                  const bad = !!h && hmToMinutes(h.close) <= hmToMinutes(h.open)
                  const badBreak = !!h?.break && !breakOf(h)
                  const name = (
                    <Box sx={{ gridArea: 'day', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: d === todayKey ? 600 : 500 }}>{day}</Typography>
                      {d === todayKey && <Typography variant="caption" sx={{ color: tokens.roseDeep, fontWeight: 600 }}>{t('Today')}</Typography>}
                    </Box>
                  )
                  if (!isAdmin) return (
                    <Box key={d} sx={[STAFF_COLUMNS, ROW]}>
                      {name}
                      {h ? <Typography sx={{ gridArea: 'hours', fontVariantNumeric: 'tabular-nums' }}>{hoursLabel(h)}</Typography>
                        : <Typography sx={{ gridArea: 'hours', color: 'text.secondary' }}>{t('Closed')}</Typography>}
                    </Box>
                  )
                  return (
                    <Box key={d} sx={[COLUMNS, ROW]}>
                      {name}
                      <Box sx={TICKS}>
                        {/* A ticked "Open" box: unticked means closed all day. */}
                        <Box sx={tick('open')}>
                          <Checkbox checked={!!h} slotProps={{ input: { 'aria-label': t('Open on {day}', { day }) } }}
                            onChange={e => setDay(d, e.target.checked ? (b.opening_hours[d] ?? { open: '09:00', close: '17:00' }) : null)} />
                        </Box>
                        {/* Closed in between (09:00–14:00 and 17:00–20:00): Google Maps and the website show both parts. */}
                        <Box sx={tick('brk')}>
                          {h && (
                            <Checkbox checked={!!h.break} slotProps={{ input: { 'aria-label': t('Closes for a break on {day}', { day }) } }}
                              onChange={e => setDay(d, e.target.checked ? { ...h, break: b.opening_hours[d]?.break ?? { from: '14:00', to: '17:00' } } : withoutBreak(h))} />
                          )}
                        </Box>
                      </Box>
                      {h ? (
                        <>
                          <TimeField area="opens" label={t('Opens on {day}', { day })} value={h.open} onChange={open => setDay(d, { ...h, open })} />
                          <TimeField area="closes" label={t('Closes on {day}', { day })} value={h.close} error={bad} onChange={close => setDay(d, { ...h, close })} />
                          {h.break ? (
                            <>
                              <TimeField area="from" label={t('Closed from on {day}', { day })} value={h.break.from} error={badBreak}
                                onChange={from => setDay(d, { ...h, break: { ...h.break!, from } })} />
                              <TimeField area="reopens" label={t('Reopens on {day}', { day })} value={h.break.to} error={badBreak}
                                onChange={to => setDay(d, { ...h, break: { ...h.break!, to } })} />
                            </>
                          ) : (
                            // No break: a quiet dash under each of its headings (its box already says so to a screen reader).
                            <>
                              <Muted quiet sx={{ gridArea: 'from' }}>{'–'}</Muted>
                              <Muted quiet sx={{ gridArea: 'reopens' }}>{'–'}</Muted>
                            </>
                          )}
                        </>
                      ) : <Muted sx={CLOSED}>{t('Closed')}</Muted>}
                    </Box>
                  )
                })}
              </Box>
              {isAdmin && (
                <Stack direction="row" useFlexGap sx={{ mt: 2, alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
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
                  {tr('Google Maps, your website and the Rota then show the café closed on the public holidays in the {calendar}, and nobody is put on the rota on them.', { calendar: <RouterLink to="/calendar">{t('Calendar')}</RouterLink> })}
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
