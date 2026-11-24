// Repeating the rota (Rota → Repeat week, shared/rotaRepeat.ts): the dialog that copies the week on show onto
// the weeks after it, for a few weeks or kept going as a continuous rota, and the note over the rota while
// one is.
import {
  Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack,
  TextField, Typography,
} from '@mui/material'
import RepeatIcon from '@mui/icons-material/Repeat'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction, useNotify } from '../app/Notify'
import { MAX_REPEAT_WEEKS, WEEKS_AHEAD, repeatUntil, type RotaRepeat } from '../../shared/rotaRepeat'
import { addDays, formatLocal, today } from '../../shared/time'
import { t, tn } from '../i18n'

const day = (date: string) => formatLocal(`${date}T12:00:00Z`, 'EEE d MMM')

/** Copy the week starting `monday` (with `shifts` shifts) onto the weeks after it. */
export function RepeatRotaDialog({ open, monday, shifts, current, onClose }: {
  open: boolean; monday: string; shifts: number; current: RotaRepeat | null; onClose: () => void
}) {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const [weeks, setWeeks] = useState(1)
  const [continuous, setContinuous] = useState(false)
  const until = repeatUntil(monday, continuous ? null : weeks, today())
  const close = () => { setWeeks(1); setContinuous(false); onClose() }

  const repeat = () => run(async () => {
    const r = await api.repeatRotaWeek(monday, continuous ? null : weeks)
    close()
    notify([
      tn(r.added, '{n} shift added, to {until}.', '{n} shifts added, to {until}.', { until: day(r.until) }),
      r.away ? tn(r.away, '{n} left out for time off.', '{n} left out for time off.') : '',
      r.closed ? tn(r.closed, '{n} left out for days you’re closed.', '{n} left out for days you’re closed.') : '',
      continuous ? t('It now repeats every week.') : '',
    ].filter(Boolean).join(' '), 'success')
  })

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
      <DialogTitle>{t('Repeat this week')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {shifts > 0 ? (
            <Typography variant="body2">
              {tn(shifts, 'The week of {week} ({n} shift) goes onto the weeks after it: the same people, days and times.',
                'The week of {week} ({n} shifts) goes onto the weeks after it: the same people, days and times.', { week: day(monday) })}
            </Typography>
          ) : (
            <Alert severity="warning">{t('There are no shifts this week to repeat. Add some, or go to a week that has them.')}</Alert>
          )}
          <TextField select label={t('How long')} value={weeks} disabled={continuous} onChange={e => setWeeks(Number(e.target.value))}>
            {Array.from({ length: MAX_REPEAT_WEEKS }, (_, i) => i + 1).map(n => (
              <MenuItem key={n} value={n}>{n === 1 ? t('Next week only') : t('The next {n} weeks', { n })}</MenuItem>
            ))}
          </TextField>
          <div>
            <FormControlLabel control={<Checkbox checked={continuous} onChange={e => setContinuous(e.target.checked)} />}
              label={t('Continuous rota: repeat it every week from now on')} />
            <Typography variant="caption" component="div" color="text.secondary" sx={{ pl: 4 }}>
              {t('Kept filled {n} weeks ahead, every night. A change to one week stays that week’s; to change every week, change a week and repeat it again.', { n: WEEKS_AHEAD })}
            </Typography>
          </div>
          {continuous && current && (
            <Alert severity="info">{t('This takes the place of the continuous rota you have now (the week of {week}).', { week: day(current.source_week) })}</Alert>
          )}
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {continuous
              ? t('Goes onto {from} to {until}, then on every week.', { from: day(addDays(monday, 7)), until: day(until) })
              : t('Goes onto {from} to {until}.', { from: day(addDays(monday, 7)), until: day(until) })}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('Shifts already on those days are replaced, unless they’ve started. Nobody is put on a day they have off, or a day you’re closed (a closure on the Calendar, like “Closed for Christmas”).')}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{t('Cancel')}</Button>
        <Button variant="contained" startIcon={<RepeatIcon />} disabled={shifts === 0} onClick={repeat}>{t('Repeat')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Over the rota while a continuous rota is on, with the way to stop it. */
export function RotaRepeatBanner({ repeat }: { repeat: RotaRepeat }) {
  const { api } = useApp()
  const run = useAction()
  return (
    <Alert severity="info" icon={<RepeatIcon />} sx={{ mb: 2 }}>
      {t('Continuous rota: every week repeats the week of {week}, filled to {until}. A change to one week stays that week’s.',
        { week: day(repeat.source_week), until: day(repeat.filled_until) })}
      <div>
        <Button size="small" color="inherit" sx={{ mt: 0.5, ml: -0.75 }}
          onClick={() => run(() => api.stopRepeatingRota(), t('The rota no longer repeats'))}>{t('Stop repeating')}</Button>
      </div>
    </Alert>
  )
}
