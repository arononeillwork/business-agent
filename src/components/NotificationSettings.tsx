// The Notifications page's settings: push notifications on this device (and the person's others),
// how each kind of notification reaches them (in the app, on their phone, or both), and for admins
// the bank holiday reminders (on by default, a week ahead and the day before).
import { useEffect, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Checkbox, FormControlLabel, MenuItem, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { pushState, thisDevice, turnOffPush, turnOnPush, type PushState } from '../app/push'
import { Empty, SectionTitle, Tag } from './common'
import { NOTIFY_TOPICS, channelFor, type NotifyChannel } from '../../shared/notify'
import { CATEGORY_META, type CalendarEvent, type Settings } from '../../shared/types'
import { addDays, formatLocal, today } from '../../shared/time'
import { tokens } from '../theme'
import { LANGUAGES, msg, t } from '../i18n'
import { languageOf } from '../../shared/pushText'

const day = (d: string, pattern = 'EEE d MMM') => formatLocal(`${d}T12:00:00Z`, pattern)

/** Push notifications on this device, and the person's other devices. */
export function PushDevices() {
  const { api, me, settings } = useApp()
  const run = useAction()
  const [state, setState] = useState<PushState | null>(null)
  const [here, setHere] = useState<string | null>(null)
  const devices = useAsync('push-devices', () => api.pushDevices(), [])
  const check = () => Promise.all([pushState(), thisDevice()]).then(([s, e]) => { setState(s); setHere(e) }).catch(() => setState('unsupported'))
  useEffect(() => { void check() }, [])
  const messages = {
    blocked: t('Notifications are blocked for this site. Allow them in your browser’s settings for this site, then try again.'),
    notReady: t('Push notifications are being set up. Try again after the next update.'),
  }

  return (
    <Card component="section" aria-label={t('Push notifications')}>
      <CardContent>
        <SectionTitle action={state === 'on' && (
          <Button size="small" onClick={() => run(() => api.sendTestNotification(), t('Test sent: it arrives within a minute'))}>{t('Send a test')}</Button>
        )}>
          {t('Push notifications')}
        </SectionTitle>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 500 }}>{t('On this device')}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {state === 'on' ? t('Your notifications pop up here, even when the app is closed.')
                : t('Get your notifications on this phone or computer, even when the app is closed.')}
            </Typography>
          </Box>
          {(state === 'on' || state === 'off') && (
            <Switch checked={state === 'on'} slotProps={{ input: { 'aria-label': t('Push notifications on this device') } }}
              onChange={e => run(async () => {
                if (e.target.checked) await turnOnPush(api, messages)
                else await turnOffPush(api)
                await check()
                await devices.reload()
              }, e.target.checked ? t('Push notifications on for this device') : t('Push notifications off for this device'))} />
          )}
        </Stack>
        {state === 'on' && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
            {t('Sent in {language}, the language you use the app in. Change it under My account → Language.', {
              language: LANGUAGES.find(l => l.code === languageOf(me?.preferences, settings?.languages))?.name ?? 'English' })}
          </Typography>
        )}
        {state === 'install-first' && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            {t('On an iPhone or iPad, add the app to your Home Screen first: tap Share, then Add to Home Screen. Open it from there and turn notifications on here.')}
          </Alert>
        )}
        {state === 'blocked' && <Alert severity="warning" sx={{ mb: 1.5 }}>{messages.blocked}</Alert>}
        {state === 'unsupported' && <Alert severity="info" sx={{ mb: 1.5 }}>{t('This browser can’t show push notifications. Try Chrome, Edge, Firefox or Safari.')}</Alert>}

        {(devices.data?.length ?? 0) > 0 && (
          <>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>{t('Your devices')}</Typography>
            {devices.data!.map(d => (
              <Stack key={d.id} direction="row" spacing={1.5} sx={{ py: 1, borderTop: `1px solid ${tokens.line}`, alignItems: 'center', '&:first-of-type': { borderTop: 0 } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography>{d.device ?? t('A device')} {d.endpoint === here && <Tag>{t('This one')}</Tag>}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                    {d.last_ok_at ? t('Last notified {when}', { when: formatLocal(d.last_ok_at, 'd MMM, HH:mm') }) : t('Added {when}', { when: formatLocal(d.created_at, 'd MMM') })}
                  </Typography>
                </Box>
                <Button size="small" onClick={() => run(async () => {
                  if (d.endpoint === here) await turnOffPush(api)
                  else await api.removePushDevice(d.endpoint)
                  await check()
                  await devices.reload()
                }, t('Device removed'))}>{t('Remove')}</Button>
              </Stack>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  )
}

const CHANNELS: { value: NotifyChannel; label: string }[] = [
  { value: 'app', label: msg('In the app') }, { value: 'push', label: msg('On my phone') }, { value: 'both', label: msg('Both') },
]

/** How each kind of notification reaches this person. */
export function NotificationChoices() {
  const { api, me, isAdmin, refresh } = useApp()
  const run = useAction()
  if (!me) return null
  const topics = NOTIFY_TOPICS.filter(k => isAdmin || !k.admins)
  const choose = (key: string, value: NotifyChannel | null) => value && run(async () => {
    await api.updateProfile(me.id, { preferences: { ...me.preferences, notify: { ...me.preferences?.notify, [key]: value } } })
    await refresh()
  })
  return (
    <Card component="section" aria-label={t('How you’re told')}>
      <CardContent>
        <SectionTitle>{t('How you’re told')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
          {t('In the app: the bell. On my phone: a push notification on your devices, kept in your list without lighting up the bell. Both: the two.')}
        </Typography>
        <Stack>
          {topics.map(k => (
            <Stack key={k.key} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ py: 1.25, borderTop: `1px solid ${tokens.line}`, alignItems: { sm: 'center' }, '&:first-of-type': { borderTop: 0 } }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 500 }}>{t(k.label)}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t(k.detail)}</Typography>
              </Box>
              <ToggleButtonGroup exclusive size="small" value={channelFor(me.preferences, k.key)} aria-label={t(k.label)}
                onChange={(_, v: NotifyChannel | null) => choose(k.key, v)}>
                {CHANNELS.map(c => <ToggleButton key={c.value} value={c.value}>{t(c.label)}</ToggleButton>)}
              </ToggleButtonGroup>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  )
}

const LEAD_DAYS = [1, 2, 3, 7, 14, 21, 30]
const HOLIDAY_KINDS = ['national', 'regional', 'local', 'area'] as const

/** Bank holiday reminders (admins): on or off, how far ahead, which holidays, and each one coming up. */
export function HolidayReminders() {
  const { api, settings, refresh } = useApp()
  const run = useAction()
  const from = today(), to = addDays(from, 120)
  const events = useAsync(`holiday-events-${from}`, () => api.events(from, to), [from])
  const reminders = useAsync('holiday-reminders', () => api.holidayReminders(), [])
  if (!settings) return null
  const on = settings.holiday_reminders !== false
  const days = settings.holiday_reminder_days ?? 7
  const kinds = settings.holiday_reminder_kinds ?? ['national', 'regional', 'local']
  const dayBefore = settings.holiday_reminder_day_before !== false
  const save = (patch: Partial<Settings>, done?: string) => run(async () => { await api.updateSettings(patch); await refresh() }, done)
  const upcoming = (events.data ?? [])
    .filter((e: CalendarEvent) => e.confirmed && (HOLIDAY_KINDS as readonly string[]).includes(e.category) && e.starts_on >= from)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
    .slice(0, 8)
  const of = (id: string) => reminders.data?.find(r => r.event_id === id)

  return (
    <Card component="section" aria-label={t('Bank holiday reminders')}>
      <CardContent>
        <SectionTitle>{t('Bank holiday reminders')}</SectionTitle>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontWeight: 500 }}>{t('Remind admins before each public holiday')}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('Sent at 9:00 to every admin, in the app and on their phones as each chose, to plan the rota and opening hours.')}
            </Typography>
          </Box>
          <Switch checked={on} slotProps={{ input: { 'aria-label': t('Bank holiday reminders') } }}
            onChange={e => save({ holiday_reminders: e.target.checked },
              e.target.checked ? t('{title}: switched on', { title: t('Bank holiday reminders') }) : t('{title}: switched off', { title: t('Bank holiday reminders') }))} />
        </Stack>
        {on && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2, alignItems: { sm: 'center' } }}>
            <TextField select size="small" label={t('How far ahead')} value={days} sx={{ minWidth: 160 }}
              onChange={e => save({ holiday_reminder_days: Number(e.target.value) }, t('Saved'))}>
              {LEAD_DAYS.map(n => <MenuItem key={n} value={n}>{n === 7 ? t('A week before') : n === 14 ? t('Two weeks before') : t('{n} days before', { n })}</MenuItem>)}
            </TextField>
            {days > 1 && (
              <FormControlLabel label={t('And again the day before')} control={
                <Checkbox size="small" checked={dayBefore} onChange={e => save({ holiday_reminder_day_before: e.target.checked }, t('Saved'))} />
              } />
            )}
            <Stack direction="row" sx={{ flexWrap: 'wrap' }}>
              {HOLIDAY_KINDS.map(k => (
                <FormControlLabel key={k} label={t(CATEGORY_META[k].label)} control={
                  <Checkbox size="small" checked={kinds.includes(k)}
                    onChange={e => save({ holiday_reminder_kinds: e.target.checked ? [...kinds, k] : kinds.filter(x => x !== k) }, t('Saved'))} />
                } />
              ))}
            </Stack>
          </Stack>
        )}
        {on && events.data && upcoming.length === 0 && <Empty>{t('No public holidays on the calendar in the next four months.')}</Empty>}
        {on && upcoming.map(e => {
          const r = of(e.id)
          const included = kinds.includes(e.category as typeof kinds[number])
          const remindOn = addDays(e.starts_on, -days) < from ? from : addDays(e.starts_on, -days)
          const sent = r?.sent_for === e.starts_on
          const tomorrowOf = addDays(e.starts_on, -1)
          const second = dayBefore && days > 1 && tomorrowOf >= from && r?.day_before_for !== e.starts_on ? tomorrowOf : null
          return (
            <Stack key={e.id} direction="row" spacing={1.5} sx={{ py: 1, borderTop: `1px solid ${tokens.line}`, alignItems: 'center' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 500 }}>{e.title}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {day(e.starts_on, 'EEEE d MMMM')} · {t(CATEGORY_META[e.category].label)}{e.town ? ` (${e.town})` : ''}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                  {!included ? t('Not reminded: this kind of holiday is switched off')
                    : r?.remind === false ? t('Left out')
                      : sent ? (second ? t('Reminder on {when}', { when: day(second) }) : t('Reminded {when}', { when: formatLocal(r!.sent_at!, 'd MMM') }))
                        : second && second !== remindOn ? t('Reminders on {first} and {second}', { first: day(remindOn), second: day(second) })
                          : t('Reminder on {when}', { when: day(remindOn) })}
                </Typography>
              </Box>
              {included && (!sent || second) && (
                <Switch size="small" checked={r?.remind !== false} slotProps={{ input: { 'aria-label': t('Remind about {name}', { name: e.title }) } }}
                  onChange={ev => run(() => api.setHolidayReminder(e.id, ev.target.checked),
                    ev.target.checked ? t('{name}: will be reminded', { name: e.title }) : t('{name}: left out', { name: e.title }))} />
              )}
            </Stack>
          )
        })}
      </CardContent>
    </Card>
  )
}
