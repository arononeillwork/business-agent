import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, Switch, TextField, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { SectionTitle } from '../components/common'
import {
  WEEKDAYS, newSchedule, nextSend, scheduleProblem, type ReportInfo, type ReportPeriod, type ReportSchedule, type ReportScheduleInput, type ScheduleFrequency,
} from '../../shared/reports'
import { TZ, formatLocal } from '../../shared/time'
import { PeriodPicker, RecipientPicker, ReportPicker, periodLabel, useRecipientEmails, type Recipients } from './ReportsTab'
import { tokens } from '../theme'
import { currentLanguage, msg, t, tn } from '../i18n'

const FREQUENCIES: { id: ScheduleFrequency; label: string }[] = [
  { id: 'daily', label: msg('Every day') }, { id: 'weekly', label: msg('Every week') }, { id: 'monthly', label: msg('Every month') },
]

/** "Every Monday and Thursday at 08:00", "Every weekday at 18:30", "On day 1 of every month at 09:00". */
export function scheduleText(s: Pick<ReportSchedule, 'frequency' | 'weekdays' | 'month_day' | 'send_at'>) {
  const time = s.send_at
  if (s.frequency === 'monthly') return t('On day {n} of every month at {time}', { n: s.month_day ?? 1, time })
  const days = [...s.weekdays].sort((a, b) => a - b)
  if (s.frequency === 'daily' || days.length === 7) return t('Every day at {time}', { time })
  if (days.join() === '1,2,3,4,5') return t('Every weekday at {time}', { time })
  const names = days.map(d => t(WEEKDAYS.find(w => w.day === d)!.label))
  const list = names.length > 1 ? t('{some} and {last}', { some: names.slice(0, -1).join(', '), last: names[names.length - 1] }) : names[0]
  return t('Every {days} at {time}', { days: list, time })
}

/**
 * Dashboards → Reports → Scheduled reports (admins): reports that go by themselves, every day, on the days of the
 * week picked or on a day of the month, at a time, from the business's Gmail or Outlook (worker/reportSchedules.ts).
 * Each one's figures are what the person who last changed it can see. `startFrom`: the page's own picks, for a new one.
 */
export function ReportSchedules({ offered, mailbox, startFrom, onStarted }: {
  offered: ReportInfo[]; mailbox: boolean; startFrom: Omit<ReportScheduleInput, 'name' | 'frequency' | 'weekdays' | 'month_day' | 'send_at' | 'active'> | null
  onStarted: () => void
}) {
  const { api, business, profiles } = useApp()
  const run = useAction()
  const tz = business?.timezone ?? TZ
  const list = useAsync('report-schedules', () => api.reportSchedules(), [])
  const [editing, setEditing] = useState<ReportScheduleInput | null>(null)
  useEffect(() => {
    if (!startFrom) return
    setEditing({ ...newSchedule(startFrom.language), ...startFrom })
    onStarted()
  }, [startFrom, onStarted])
  const schedules = list.data ?? []
  const toggle = (s: ReportSchedule) => run(async () => {
    await api.saveReportSchedule({ ...inputOf(s), active: !s.active })
    await list.reload()
  }, s.active ? t('{name} is paused', { name: s.name }) : t('{name} is on', { name: s.name }))

  return (
    <Card component="section" aria-label={t('Scheduled reports')}>
      <CardContent>
        <SectionTitle action={<Button size="small" startIcon={<AddIcon />} onClick={() => setEditing(newSchedule(currentLanguage()))}>{t('New schedule')}</Button>}>
          {t('Scheduled reports')}
        </SectionTitle>
        {!mailbox && schedules.some(s => s.active) && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>{t('Scheduled reports wait until Gmail or Outlook is connected on Connections.')}</Alert>
        )}
        {list.data && !schedules.length && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('Have a report go by itself: last week’s takings to the owners every Monday morning, what’s low to the shop manager every evening…')}
          </Typography>
        )}
        <Stack component="ul" aria-label={t('Scheduled reports')} sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {schedules.map(s => {
            const next = nextSend(s, Date.now(), tz)
            const people = s.team.length + s.contacts.length + s.emails.length
            const by = profiles.find(p => p.id === s.updated_by)?.full_name
            return (
              <Stack component="li" key={s.id} aria-label={s.name} direction="row"
                sx={{ py: 1.25, gap: 1.5, alignItems: 'center', borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 }, opacity: s.active ? 1 : 0.7 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }}>{s.name}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {[scheduleText(s), periodLabel(s.period), tn(people, 'to {n} person', 'to {n} people')].join(' · ')}
                  </Typography>
                  <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
                    {[s.active && next ? t('Next: {when}', { when: formatLocal(next, 'EEE d MMM, HH:mm', tz) }) : t('Paused'),
                      s.last_sent_at ? t('Last sent {when}', { when: formatLocal(s.last_sent_at, 'EEE d MMM, HH:mm', tz) }) : null,
                      by ? t('Set up by {name}', { name: by }) : null].filter(Boolean).join(' · ')}
                  </Typography>
                  {s.last_error && <Typography variant="caption" component="p" sx={{ color: tokens.badFg }}>{t('Last time it didn’t go: {error}', { error: s.last_error })}</Typography>}
                </Box>
                <Tooltip title={s.active ? t('Pause') : t('Switch on')}>
                  <Switch checked={s.active} onChange={() => void toggle(s)} slotProps={{ input: { 'aria-label': t('{name} on', { name: s.name }) } }} />
                </Tooltip>
                <Tooltip title={t('Edit')}>
                  <IconButton size="small" aria-label={t('Edit {name}', { name: s.name })} onClick={() => setEditing(inputOf(s))}><EditIcon fontSize="small" /></IconButton>
                </Tooltip>
              </Stack>
            )
          })}
        </Stack>
      </CardContent>
      {editing && <ScheduleDialog schedule={editing} offered={offered} tz={tz} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void list.reload() }} />}
    </Card>
  )
}

const inputOf = ({ last_sent_at: _l, last_error: _e, updated_at: _u, updated_by: _b, ...s }: ReportSchedule): ReportScheduleInput => s

/** A schedule's name, reports, period, who gets it, and when it goes. */
function ScheduleDialog({ schedule, offered, tz, onClose, onSaved }: {
  schedule: ReportScheduleInput; offered: ReportInfo[]; tz: string; onClose: () => void; onSaved: () => void
}) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [s, setS] = useState<ReportScheduleInput>({ ...schedule, kinds: schedule.kinds.filter(k => offered.some(r => r.kind === k)) })
  const [deleting, setDeleting] = useState(false)
  const set = (p: Partial<ReportScheduleInput>) => setS(x => ({ ...x, ...p }))
  const to = useRecipientEmails(s)
  const problem = scheduleProblem(s)
  const next = nextSend(s, Date.now(), tz)
  const save = async () => {
    const ok = await run(async () => {
      if (problem) throw new Error(t(problem))
      await api.saveReportSchedule({ ...s, name: s.name.trim() })
    }, schedule.id ? t('Saved') : t('{name} is scheduled', { name: s.name.trim() }))
    if (ok) onSaved()
  }
  const remove = async () => { if (await run(() => api.deleteReportSchedule(schedule.id!), t('Deleted {name}', { name: schedule.name }))) onSaved() }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={phone} aria-labelledby="schedule-dialog-title">
      <DialogTitle id="schedule-dialog-title">{schedule.id ? schedule.name : t('Send on a schedule')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.25} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Name')} fullWidth value={s.name} onChange={e => set({ name: e.target.value })} placeholder={t('e.g. Monday takings for the owners')}
              autoFocus={!schedule.id} slotProps={{ htmlInput: { maxLength: 60 } }} />
            <PeriodPicker value={s.period} onChange={(period: ReportPeriod) => set({ period })} label={t('Covering')} />
          </Stack>

          <Box>
            <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>{t('When it goes')}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, mt: 0.5 }}>
              <ToggleButtonGroup size="small" exclusive value={s.frequency} aria-label={t('How often')}
                onChange={(_, f: ScheduleFrequency | null) => f && set({ frequency: f, ...(f === 'weekly' && !s.weekdays.length ? { weekdays: [1] } : {}), ...(f === 'monthly' && !s.month_day ? { month_day: 1 } : {}) })}>
                {FREQUENCIES.map(f => <ToggleButton key={f.id} value={f.id} sx={{ px: 1.5 }}>{t(f.label)}</ToggleButton>)}
              </ToggleButtonGroup>
              {s.frequency === 'monthly' && (
                <TextField select size="small" label={t('Day of the month')} value={s.month_day ?? 1} onChange={e => set({ month_day: Number(e.target.value) })} sx={{ width: 160 }}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                </TextField>
              )}
              <TextField size="small" type="time" label={t('Time')} value={s.send_at} onChange={e => e.target.value && set({ send_at: e.target.value })}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 300 } }} sx={{ width: 130 }} />
            </Stack>
            {s.frequency === 'weekly' && (
              <ToggleButtonGroup size="small" value={s.weekdays} aria-label={t('Days of the week')} sx={{ mt: 1.25, flexWrap: 'wrap' }}
                onChange={(_, days: number[]) => set({ weekdays: [...days].sort((a, b) => a - b) })}>
                {WEEKDAYS.map(w => <ToggleButton key={w.day} value={w.day} aria-label={t(w.label)} sx={{ px: 1.25 }}>{t(w.short)}</ToggleButton>)}
              </ToggleButtonGroup>
            )}
            <Typography variant="body2" role="status" sx={{ color: 'text.secondary', mt: 1 }}>
              {problem && problem !== 'Give the schedule a name' ? t(problem)
                : t('{when}, business time. Next: {next}.', { when: scheduleText(s), next: next ? formatLocal(next, 'EEE d MMM, HH:mm', tz) : '—' })}
            </Typography>
          </Box>

          <Box>
            <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>{t('Reports')}</Typography>
            <ReportPicker offered={offered} value={s.kinds} onChange={kinds => set({ kinds })} />
          </Box>
          <Box>
            <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>{t('Who gets it')}</Typography>
            <RecipientPicker value={s} onChange={(r: Recipients) => set(r)} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {to.length ? tn(to.length, 'To {n} person, one email each', 'To {n} people, one email each') : t('Pick who gets it')}
              {' · '}{t('With the figures you can see, from the business’s Gmail or Outlook.')}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {schedule.id && (deleting ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto' }}>
            <Typography variant="body2" sx={{ color: tokens.badFg }}>{t('Delete {name}?', { name: schedule.name })}</Typography>
            <Button size="small" color="error" variant="contained" onClick={() => void remove()}>{t('Delete')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </Stack>
        ) : <Button color="error" onClick={() => setDeleting(true)} sx={{ mr: 'auto' }}>{t('Delete')}</Button>)}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!!problem} onClick={() => void save()}>{schedule.id ? t('Save') : t('Schedule it')}</Button>
      </DialogActions>
    </Dialog>
  )
}
