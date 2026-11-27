import {
  Alert, Box, Button, Card, CardContent, Checkbox, FormControlLabel, Grid, InputBase, Stack, Switch, Typography,
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

// The week is a grid, every day's line alike, sized by the card (not the screen), so it fits whatever the menu
// beside it leaves. A narrow card (a phone, a tablet): the day with its Break and Open switches, then the hours it's
// open under it, in order: one span, or two either side of its break (09:00 – 14:00, 17:00 – 20:00). A wide card
// (a computer): all of that on one line a day.
const WIDE = '@container (min-width: 820px)'
/** Too narrow for the time fields' clock buttons (a phone, a small tablet). */
const NARROW = '@container (max-width: 599.98px)'
/** A 12-hour clock ("06:00 PM") takes more room than "18:00": on a phone a day's two spans go one under the other. */
const TWELVE_HOUR = (() => {
  try { return /^h1[12]$/.test(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle ?? '') } catch { return false }
})()
const COLUMNS = {
  display: 'grid', alignItems: 'center', columnGap: 1.25, rowGap: 1,
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gridTemplateAreas: TWELVE_HOUR ? '"head head" "first first" "second second"' : '"head head" "first second"',
  [WIDE]: {
    columnGap: 2, gridAutoRows: 'minmax(44px, auto)',
    gridTemplateColumns: 'minmax(110px, 180px) repeat(2, minmax(0, 230px)) minmax(0, 1fr) auto',
    gridTemplateAreas: '"day first second . switches"',
  },
}
/** What staff see: each day and its hours. */
const STAFF_COLUMNS = {
  display: 'grid', alignItems: 'center', columnGap: 2, gridTemplateColumns: 'minmax(0, 1fr) auto', gridTemplateAreas: '"day hours"',
  [WIDE]: { gridTemplateColumns: 'minmax(110px, 200px) minmax(0, 1fr)' },
}
const ROW = { borderTop: 1, borderColor: 'divider', py: 1.5, [WIDE]: { py: 1.25 } }
/** The day and its switches on one line; on a wide card each in its own column. */
const HEAD = {
  gridArea: 'head', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minHeight: 40,
  [WIDE]: { display: 'contents' },
}
const SWITCHES = { gridArea: 'switches', display: 'flex', alignItems: 'center', flexShrink: 0, gap: 1.5, mr: -1 }
/** A switch with its word before it ("Break ☐", "Open ●"): the word says it, and a tap on it works too. */
const LABELLED = { m: 0, gap: 0.25, '& .MuiFormControlLabel-label': { fontSize: '0.875rem', color: 'text.secondary' }, '& .MuiCheckbox-root': { p: 0.75 } }
/** One span the café is open: a single box, its two times either side of a dash. */
const SPAN = {
  display: 'flex', alignItems: 'center', minWidth: 0, height: 44, px: 0.5,
  border: 1, borderColor: tokens.lineStrong, borderRadius: '12px', bgcolor: tokens.surface,
  transition: 'border-color 120ms, box-shadow 120ms',
  '&:hover': { borderColor: tokens.inkFaint },
  '&:focus-within': { borderColor: tokens.roseDeep, boxShadow: `inset 0 0 0 1px ${tokens.roseDeep}` },
  '& .MuiInputBase-root': { flex: '1 1 0', minWidth: 0, height: '100%', font: 'inherit', fontSize: '1rem' },
  '& .MuiInputBase-root.Mui-error': { color: 'error.main' },
  '& .MuiInputBase-input': {
    height: '100%', minWidth: 0, p: 0, boxSizing: 'border-box', textAlign: 'center', fontVariantNumeric: 'tabular-nums', cursor: 'pointer',
    // A phone's own look for a time is a drop-down with its arrow, which leaves the time no room ("09:0"): plain text instead.
    appearance: 'none', WebkitAppearance: 'none',
  },
  '& input::-webkit-date-and-time-value': { m: 0, textAlign: 'center' },
  // A computer's clock button (it opens a list of times) only shows while the box is pointed at or in use.
  '& input::-webkit-calendar-picker-indicator': { ml: 0.25, opacity: 0, cursor: 'pointer', transition: 'opacity 120ms' },
  '&:hover input::-webkit-calendar-picker-indicator, &:focus-within input::-webkit-calendar-picker-indicator': { opacity: 0.5 },
  [NARROW]: { '& input::-webkit-calendar-picker-indicator': { display: 'none' } },
}

type Time = { label: string; value: string; error?: boolean; onChange: (v: string) => void }

/** A time in a span; its name says which and the day ("Reopens on Thursday"). */
function TimeInput({ label, value, error, onChange }: Time) {
  return <InputBase type="time" value={value} error={error} onChange={e => onChange(e.target.value)} inputProps={{ 'aria-label': label }} />
}

/** From one time to the other, in one box. */
function Span({ area, from, to }: { area: string; from: Time; to: Time }) {
  return (
    <Box sx={[SPAN, { gridArea: area }, (!!from.error || !!to.error) && { borderColor: 'error.main', '&:hover': { borderColor: 'error.main' } }]}>
      <TimeInput {...from} />
      <Box component="span" aria-hidden sx={{ color: 'text.secondary', flexShrink: 0, px: 0.5 }}>{'–'}</Box>
      <TimeInput {...to} />
    </Box>
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
                <SectionTitle>{t('Every week')}</SectionTitle>
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
                  const opens: Time = { label: t('Opens on {day}', { day }), value: h?.open ?? '', onChange: open => h && setDay(d, { ...h, open }) }
                  const closes: Time = { label: t('Closes on {day}', { day }), value: h?.close ?? '', error: bad, onChange: close => h && setDay(d, { ...h, close }) }
                  return (
                    <Box key={d} sx={[COLUMNS, ROW]}>
                      <Box sx={HEAD}>
                        {name}
                        <Box sx={SWITCHES}>
                          {/* Closed in between (09:00–14:00 and 17:00–20:00): Google Maps and the website show both parts. */}
                          {h && (
                            <FormControlLabel labelPlacement="start" sx={LABELLED} label={tc('hours', 'Break')} control={
                              <Checkbox checked={!!h.break} slotProps={{ input: { 'aria-label': t('Closes for a break on {day}', { day }) } }}
                                onChange={e => setDay(d, e.target.checked ? { ...h, break: b.opening_hours[d]?.break ?? { from: '14:00', to: '17:00' } } : withoutBreak(h))} />
                            } />
                          )}
                          {/* Switched off: closed all day. */}
                          <FormControlLabel labelPlacement="start" sx={LABELLED} label={h ? tc('hours', 'Open') : t('Closed')} control={
                            <Switch checked={!!h} slotProps={{ input: { 'aria-label': t('Open on {day}', { day }) } }}
                              onChange={e => setDay(d, e.target.checked ? (b.opening_hours[d] ?? { open: '09:00', close: '17:00' }) : null)} />
                          } />
                        </Box>
                      </Box>
                      {h?.break ? (
                        // In the order they happen: open until the break, then from the end of the break until closing.
                        <>
                          <Span area="first" from={opens} to={{ label: t('Closed from on {day}', { day }), value: h.break.from, error: badBreak,
                            onChange: from => setDay(d, { ...h, break: { ...h.break!, from } }) }} />
                          <Span area="second" from={{ label: t('Reopens on {day}', { day }), value: h.break.to, error: badBreak,
                            onChange: to => setDay(d, { ...h, break: { ...h.break!, to } }) }} to={closes} />
                        </>
                      ) : h && <Span area="first" from={opens} to={closes} />}
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
