// A Spanish business's town's two local holidays a year (shared/townHolidays.ts): the Business page's card
// with this year's and next year's, the dialog that adds a year's two days in one go, and the prompt on
// Today when a year's aren't in.
import { Alert, AlertTitle, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { SectionTitle } from './common'
import { t } from '../i18n'
import { formatLocal, today } from '../../shared/time'
import type { CalendarEvent } from '../../shared/types'
import {
  sameTown, TOWN_HOLIDAYS_BODY, TOWN_HOLIDAYS_TITLE, townHolidaysMissing, townHolidaysProblem, townHolidayYearsToSet,
} from '../../shared/townHolidays'

const dayName = (date: string, pattern = 'EEE d MMMM') => formatLocal(`${date}T12:00:00Z`, pattern)

/** In Spain with a town: its local holidays this year and next, and the years still to add. */
export function useTownHolidays() {
  const { api, business } = useApp()
  const d = today()
  const years = townHolidayYearsToSet(d)
  const town = business && business.country !== 'IE' ? business.town?.trim() || null : null
  const data = useAsync('town-holidays', () => (town ? api.townHolidays(years[0], years[1]) : Promise.resolve([])), [town, years[0]])
  const days = (data.data ?? []).filter(e => sameTown(e.town, town))
  return {
    town, years, loaded: !!data.data,
    of: (year: number) => days.filter(e => e.starts_on.startsWith(`${year}-`)),
    missing: town && data.data ? townHolidaysMissing(d, town, days) : [],
  }
}

/** "Your town's local holidays for 2027": its two days, in one go, in place of that year's. */
export function TownHolidaysDialog({ year, town, days, onClose }: { year: number; town: string; days: CalendarEvent[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [dates, setDates] = useState(() => [days[0]?.starts_on ?? '', days[1]?.starts_on ?? ''])
  const [busy, setBusy] = useState(false)
  // That year's public holidays on the calendar: neither day can be one.
  const holidays = useAsync('town-holidays-year', () => api.events(`${year}-01-01`, `${year}-12-31`), [year])
  const save = async () => {
    setBusy(true)
    const ok = await run(async () => {
      const problem = townHolidaysProblem(year, dates, holidays.data ?? [])
      if (problem) {
        throw new Error(t(problem.text, { year, name: problem.holiday?.name ?? '', date: problem.holiday ? dayName(problem.holiday.date, 'EEEE d MMMM') : '' }))
      }
      await api.setTownHolidays(year, [...dates].sort())
    }, t('Local holidays saved'))
    setBusy(false)
    if (ok) onClose()
  }
  const field = (i: number, label: string) => (
    <TextField type="date" label={label} value={dates[i]}
      slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: `${year}-01-01`, max: `${year}-12-31` } }}
      onChange={e => setDates(ds => ds.map((x, j) => (j === i ? e.target.value : x)))} />
  )
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Your town’s local holidays for {year}', { year })}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5 }}>
          {t('The two days {town}’s town hall set for {year}. They go on the calendar as local holidays, and next year’s are asked for again.', { town, year })}
        </Typography>
        <Stack spacing={2}>
          {field(0, t('First day'))}
          {field(1, t('Second day'))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={busy || !holidays.data} onClick={save}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * Business, in Spain with a town: its local holidays this year and next, each year's added or changed in
 * one go by an admin. ?local-holidays=2027 (the reminder's link) opens that year's.
 */
export function TownHolidaysCard() {
  const { isAdmin } = useApp()
  const th = useTownHolidays()
  const [params, setParams] = useSearchParams()
  const asked = Number(params.get('local-holidays'))
  const [editing, setEditing] = useState<number | null>(null)
  const year = editing ?? (isAdmin && th.loaded && th.years.includes(asked) ? asked : null)
  if (!th.town) return null
  const close = () => {
    setEditing(null)
    if (params.has('local-holidays')) setParams(p => { p.delete('local-holidays'); return p }, { replace: true })
  }
  return (
    <Card component="section" aria-label={t('Local holidays')}>
      <CardContent>
        <SectionTitle>{t('Local holidays')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1, mb: 1 }}>
          {t('{town}’s two days off a year, set by its town hall. Each year’s are asked for.', { town: th.town })}
        </Typography>
        {th.years.map(y => {
          const days = th.of(y)
          return (
            <Stack key={y} role="group" aria-label={String(y)} direction="row" spacing={1.5}
              sx={{ alignItems: 'center', py: 1.25, borderTop: 1, borderColor: 'divider' }}>
              <Typography sx={{ fontWeight: 500, width: 44, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{y}</Typography>
              <Box sx={{ flex: 1, minWidth: 0, textTransform: 'capitalize' }}>
                {days.length ? days.map(e => dayName(e.starts_on)).join(' · ')
                  : <Box component="span" sx={{ color: 'text.secondary', textTransform: 'none' }}>{t('Not on the calendar yet')}</Box>}
              </Box>
              {isAdmin && th.loaded && (
                <Button size="small" variant={days.length ? 'text' : 'outlined'} onClick={() => setEditing(y)}>{days.length ? t('Change') : t('Add')}</Button>
              )}
            </Stack>
          )
        })}
      </CardContent>
      {year !== null && <TownHolidaysDialog key={year} year={year} town={th.town} days={th.of(year)} onClose={close} />}
    </Card>
  )
}

/** On Today, for admins: the first year whose town local holidays aren't in, until they're added or put off ("Not now"). */
export function TownHolidaysPrompt() {
  const { api, me, refresh } = useApp()
  const run = useAction()
  const th = useTownHolidays()
  const [open, setOpen] = useState(false)
  const later = me?.preferences?.townHolidaysLater ?? []
  const year = th.missing.find(y => !later.includes(y))
  if (!th.town || !me || year === undefined) return null
  const putOff = () => run(async () => {
    await api.updateProfile(me.id, { preferences: { ...me.preferences, townHolidaysLater: [...later.filter(y => y >= th.years[0]), year] } })
    await refresh()
  })
  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }} action={
        <Stack direction="row" spacing={0.5}>
          <Button color="inherit" size="small" onClick={putOff}>{t('Not now')}</Button>
          <Button color="inherit" size="small" variant="outlined" onClick={() => setOpen(true)}>{t('Add them')}</Button>
        </Stack>
      }>
        <AlertTitle>{t(TOWN_HOLIDAYS_TITLE, { town: th.town, year })}</AlertTitle>
        {t(TOWN_HOLIDAYS_BODY)}
      </Alert>
      {open && <TownHolidaysDialog key={year} year={year} town={th.town} days={th.of(year)} onClose={() => setOpen(false)} />}
    </>
  )
}
