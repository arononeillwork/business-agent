import {
  Alert, Box, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  Grid, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, PersonAvatar, SectionTitle, Stat, StatRow, Tag } from '../components/common'
import { addDays, formatLocal, today, zonedIso } from '../../shared/time'
import { TIME_OFF_LABELS, type TimeOff, type TimeOffKind } from '../../shared/types'
import { tokens } from '../theme'
import { msg, t, tn, tc } from '../i18n'

const STATUS_TAG: Record<TimeOff['status'], { fg: string; bg: string; label: string }> = {
  pending: { fg: tokens.warnFg, bg: tokens.warnBg, label: msg('Waiting for approval') },
  approved: { fg: tokens.goodFg, bg: tokens.goodBg, label: msg('Approved') },
  declined: { fg: tokens.badFg, bg: tokens.badBg, label: msg('Declined') },
  cancelled: { fg: tokens.neutralFg, bg: tokens.neutralBg, label: msg('Cancelled') },
}

const days = (r: Pick<TimeOff, 'starts_on' | 'ends_on'>) => (Date.parse(r.ends_on) - Date.parse(r.starts_on)) / 86400000 + 1
const range = (r: Pick<TimeOff, 'starts_on' | 'ends_on'>) => {
  const a = formatLocal(`${r.starts_on}T12:00:00Z`, 'EEE d MMM')
  return r.ends_on === r.starts_on ? a : `${a} – ${formatLocal(`${r.ends_on}T12:00:00Z`, 'EEE d MMM')}`
}

export function TimeOffPage() {
  const { api, me, isAdmin, profiles, settings } = useApp()
  const run = useAction()
  const year = Number(today().slice(0, 4))
  const [asking, setAsking] = useState(false)
  const [deciding, setDeciding] = useState<TimeOff | null>(null)
  const data = useAsync('time-off', async () => {
    const [list, used] = await Promise.all([
      api.timeOff(`${year}-01-01`, `${year + 1}-12-31`),
      api.vacationDaysUsed(me!.id, year),
    ])
    return { list, used }
  }, [year, me?.id])

  const list = data.data?.list ?? []
  const mine = list.filter(r => r.profile_id === me?.id)
  const pending = list.filter(r => r.status === 'pending' && r.profile_id !== me?.id)
  const upcoming = list.filter(r => r.status === 'approved' && r.ends_on >= today())
  const allowance = settings?.vacation_days_per_year ?? 30
  const used = data.data?.used ?? 0
  const person = (id: string) => profiles.find(p => p.id === id)

  return (
    <>
      <PageHeader eyebrow={t('Holidays & days off')} title={t('Time off')}
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setAsking(true)}>{t('Request time off')}</Button>} />
      <ErrorBox error={data.error} />

      <StatRow>
        <Stat label={t('Holiday left in {year}', { year })} value={t('{n} days', { n: Math.max(0, allowance - used) })}
          tone={allowance - used <= 3 ? 'warning' : 'good'} note={t('{used} of {allowance} used or requested', { used, allowance })} />
        <Stat label={t('My requests waiting')} value={mine.filter(r => r.status === 'pending').length} />
        {isAdmin && <Stat label={t('To approve')} value={pending.length} tone={pending.length ? 'warning' : 'good'} note={pending.length ? t('from the team') : t('nothing waiting')} />}
        <Stat label={t('Away in the next 30 days')} value={upcoming.filter(r => r.starts_on <= addDays(today(), 30)).length}
          note={t('approved, whole team')} />
      </StatRow>

      <Grid container spacing={2.5}>
        {isAdmin && (
          <Grid size={12}>
            <Card>
              <CardContent>
                <SectionTitle>{t('Requests to approve')}</SectionTitle>
                {pending.length === 0 && <Empty>{t('No requests waiting.')}</Empty>}
                <Stack spacing={1.5}>
                  {pending.map(r => {
                    const p = person(r.profile_id)
                    return (
                      <Stack key={r.id} direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 1.5, borderRadius: 3, border: 1, borderColor: 'divider' }}>
                        {p && <PersonAvatar name={p.full_name} colour={p.colour} size={36} />}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 500 }}>{p?.full_name} · {tc('leave', TIME_OFF_LABELS[r.kind])}</Typography>
                          <Typography variant="body2">{range(r)} · {tn(days(r), '{n} day', '{n} days')}</Typography>
                          {r.note && <Typography variant="body2" sx={{ color: 'text.secondary' }}>“{r.note}”</Typography>}
                        </Box>
                        <Button variant="contained" onClick={() => setDeciding(r)}>{t('Review')}</Button>
                      </Stack>
                    )
                  })}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        )}

        <Grid size={12}>
          <Card>
            <CardContent>
              <SectionTitle>{t('My requests')}</SectionTitle>
              {mine.length === 0 && <Empty>{t("You haven't asked for time off yet.")}</Empty>}
              <Stack spacing={1}>
                {mine.map(r => (
                  <Stack key={r.id} direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1.25, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 500 }}>{range(r)}</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {tc('leave', TIME_OFF_LABELS[r.kind])} · {tn(days(r), '{n} day', '{n} days')}{r.decision_note ? ` · “${r.decision_note}”` : ''}
                      </Typography>
                    </Box>
                    <Tag {...STATUS_TAG[r.status]}>{t(STATUS_TAG[r.status].label)}</Tag>
                    {(r.status === 'pending' || (r.status === 'approved' && r.starts_on > today())) && (
                      <Button size="small" color="error" onClick={() => run(() => api.cancelTimeOff(r.id), t('Request cancelled'))}>{t('Cancel')}</Button>
                    )}
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={12}>
          <Card>
            <CardContent>
              <SectionTitle>{t("Who's away")}</SectionTitle>
              {upcoming.length === 0 && <Empty>{t('Nobody has time off coming up.')}</Empty>}
              <Stack spacing={1}>
                {upcoming.map(r => {
                  const p = person(r.profile_id)
                  return (
                    <Stack key={r.id} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      {p && <PersonAvatar name={p.full_name} colour={p.colour} size={30} />}
                      <Typography sx={{ fontWeight: 500, minWidth: 120 }}>{p?.full_name}</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{range(r)} · {tc('leave', TIME_OFF_LABELS[r.kind])}</Typography>
                    </Stack>
                  )
                })}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {asking && <RequestDialog left={allowance - used} onClose={() => setAsking(false)} />}
      {deciding && <DecideDialog request={deciding} onClose={() => setDeciding(null)} />}
    </>
  )
}

function RequestDialog({ left, onClose }: { left: number; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [from, setFrom] = useState(addDays(today(), 7))
  const [to, setTo] = useState(addDays(today(), 7))
  const [kind, setKind] = useState<TimeOffKind>('vacation')
  const [note, setNote] = useState('')
  const n = to >= from ? days({ starts_on: from, ends_on: to }) : 0
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Request time off')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label={t('Type')} value={kind} onChange={e => setKind(e.target.value as TimeOffKind)}>
            {(Object.keys(TIME_OFF_LABELS) as TimeOffKind[]).map(k => <MenuItem key={k} value={k}>{tc('leave', TIME_OFF_LABELS[k])}</MenuItem>)}
          </TextField>
          <Stack direction="row" spacing={1.5}>
            <TextField type="date" label={t('First day')} value={from} slotProps={{ inputLabel: { shrink: true } }}
              onChange={e => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value) }} />
            <TextField type="date" label={t('Last day')} value={to} slotProps={{ inputLabel: { shrink: true } }} onChange={e => setTo(e.target.value)} />
          </Stack>
          <TextField label={t('Note for the manager (optional)')} value={note} onChange={e => setNote(e.target.value)} multiline minRows={2} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {tn(n, '{n} calendar day', '{n} calendar days')}{kind === 'vacation' ? ` · ${t('you have {n} holiday days left this year', { n: Math.max(0, left) })}` : ''}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={async () => {
          if (await run(() => api.requestTimeOff(from, to, kind, note), t('Request sent'))) onClose()
        }}>{t('Send request')}</Button>
      </DialogActions>
    </Dialog>
  )
}

function DecideDialog({ request, onClose }: { request: TimeOff; onClose: () => void }) {
  const { api, profiles } = useApp()
  const run = useAction()
  const [note, setNote] = useState('')
  const [release, setRelease] = useState(true)
  const name = profiles.find(p => p.id === request.profile_id)?.full_name
  const shifts = useAsync('time-off-shifts', async () => {
    const all = await api.shifts(zonedIso(request.starts_on, '00:00'), zonedIso(addDays(request.ends_on, 1), '00:00'))
    return all.filter(s => s.profile_id === request.profile_id)
  }, [request.id])
  const clash = shifts.data?.length ?? 0
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{name}: {tc('leave', TIME_OFF_LABELS[request.kind])}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography>{range(request)} · {tn(days(request), '{n} day', '{n} days')}</Typography>
          {request.note && <Typography sx={{ color: 'text.secondary' }}>“{request.note}”</Typography>}
          {clash > 0 ? (
            <>
              <Alert severity="warning">{tn(clash, '{name} has {n} shift in this period.', '{name} has {n} shifts in this period.', { name: name ?? '' })}</Alert>
              <FormControlLabel control={<Checkbox checked={release} onChange={e => setRelease(e.target.checked)} />}
                label={t('Turn them into open shifts so someone else can cover')} />
            </>
          ) : <Alert severity="success">{t('No shifts in this period.')}</Alert>}
          <TextField label={t('Message to them (optional)')} value={note} onChange={e => setNote(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button color="error" sx={{ mr: 'auto' }} onClick={async () => {
          if (await run(() => api.decideTimeOff(request.id, false, note), t('Request declined'))) onClose()
        }}>{t('Decline')}</Button>
        <Button onClick={onClose}>{t('Later')}</Button>
        <Button variant="contained" onClick={async () => {
          if (await run(() => api.decideTimeOff(request.id, true, note, release), t('Time off approved'))) onClose()
        }}>{t('Approve')}</Button>
      </DialogActions>
    </Dialog>
  )
}
