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

const STATUS_TAG: Record<TimeOff['status'], { fg: string; bg: string; label: string }> = {
  pending: { fg: tokens.warnFg, bg: tokens.warnBg, label: 'Waiting for approval' },
  approved: { fg: tokens.goodFg, bg: tokens.goodBg, label: 'Approved' },
  declined: { fg: tokens.badFg, bg: tokens.badBg, label: 'Declined' },
  cancelled: { fg: tokens.neutralFg, bg: tokens.neutralBg, label: 'Cancelled' },
}

const days = (t: Pick<TimeOff, 'starts_on' | 'ends_on'>) => (Date.parse(t.ends_on) - Date.parse(t.starts_on)) / 86400000 + 1
const range = (t: Pick<TimeOff, 'starts_on' | 'ends_on'>) => {
  const a = formatLocal(`${t.starts_on}T12:00:00Z`, 'EEE d MMM')
  return t.ends_on === t.starts_on ? a : `${a} – ${formatLocal(`${t.ends_on}T12:00:00Z`, 'EEE d MMM')}`
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
  const mine = list.filter(t => t.profile_id === me?.id)
  const pending = list.filter(t => t.status === 'pending' && t.profile_id !== me?.id)
  const upcoming = list.filter(t => t.status === 'approved' && t.ends_on >= today())
  const allowance = settings?.vacation_days_per_year ?? 30
  const used = data.data?.used ?? 0
  const person = (id: string) => profiles.find(p => p.id === id)

  return (
    <>
      <PageHeader eyebrow="Holidays & days off" title="Time off"
        subtitle={isAdmin ? 'Approve requests, see who is away, and keep the rota covered.'
          : 'Ask for holidays or a day off. You will get an answer here (and on WhatsApp if you turned it on).'}
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setAsking(true)}>Request time off</Button>} />
      <ErrorBox error={data.error} />

      <StatRow>
        <Stat label={`Holiday left in ${year}`} value={`${Math.max(0, allowance - used)} days`}
          tone={allowance - used <= 3 ? 'warning' : 'good'} note={`${used} of ${allowance} used or requested`} />
        <Stat label="My requests waiting" value={mine.filter(t => t.status === 'pending').length} />
        {isAdmin && <Stat label="To approve" value={pending.length} tone={pending.length ? 'warning' : 'good'} note={pending.length ? 'from the team' : 'nothing waiting'} />}
        <Stat label="Away in the next 30 days" value={upcoming.filter(t => t.starts_on <= addDays(today(), 30)).length}
          note="approved, whole team" />
      </StatRow>

      <Grid container spacing={2.5}>
        {isAdmin && (
          <Grid size={12}>
            <Card>
              <CardContent>
                <SectionTitle>Requests to approve</SectionTitle>
                {pending.length === 0 && <Empty>No requests waiting.</Empty>}
                <Stack spacing={1.5}>
                  {pending.map(t => {
                    const p = person(t.profile_id)
                    return (
                      <Stack key={t.id} direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 1.5, borderRadius: 3, border: 1, borderColor: 'divider' }}>
                        {p && <PersonAvatar name={p.full_name} colour={p.colour} size={36} />}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 500 }}>{p?.full_name} · {TIME_OFF_LABELS[t.kind]}</Typography>
                          <Typography variant="body2">{range(t)} · {days(t)} day{days(t) > 1 ? 's' : ''}</Typography>
                          {t.note && <Typography variant="body2" sx={{ color: 'text.secondary' }}>“{t.note}”</Typography>}
                        </Box>
                        <Button variant="contained" onClick={() => setDeciding(t)}>Review</Button>
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
              <SectionTitle>My requests</SectionTitle>
              {mine.length === 0 && <Empty>You haven't asked for time off yet.</Empty>}
              <Stack spacing={1}>
                {mine.map(t => (
                  <Stack key={t.id} direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1.25, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 500 }}>{range(t)}</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {TIME_OFF_LABELS[t.kind]} · {days(t)} day{days(t) > 1 ? 's' : ''}{t.decision_note ? ` · “${t.decision_note}”` : ''}
                      </Typography>
                    </Box>
                    <Tag {...STATUS_TAG[t.status]}>{STATUS_TAG[t.status].label}</Tag>
                    {(t.status === 'pending' || (t.status === 'approved' && t.starts_on > today())) && (
                      <Button size="small" color="error" onClick={() => run(() => api.cancelTimeOff(t.id), 'Request cancelled')}>Cancel</Button>
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
              <SectionTitle>Who's away</SectionTitle>
              {upcoming.length === 0 && <Empty>Nobody has time off coming up.</Empty>}
              <Stack spacing={1}>
                {upcoming.map(t => {
                  const p = person(t.profile_id)
                  return (
                    <Stack key={t.id} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      {p && <PersonAvatar name={p.full_name} colour={p.colour} size={30} />}
                      <Typography sx={{ fontWeight: 500, minWidth: 120 }}>{p?.full_name}</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{range(t)} · {TIME_OFF_LABELS[t.kind]}</Typography>
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
      <DialogTitle>Request time off</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label="Type" value={kind} onChange={e => setKind(e.target.value as TimeOffKind)}>
            {(Object.keys(TIME_OFF_LABELS) as TimeOffKind[]).map(k => <MenuItem key={k} value={k}>{TIME_OFF_LABELS[k]}</MenuItem>)}
          </TextField>
          <Stack direction="row" spacing={1.5}>
            <TextField type="date" label="First day" value={from} slotProps={{ inputLabel: { shrink: true } }}
              onChange={e => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value) }} />
            <TextField type="date" label="Last day" value={to} slotProps={{ inputLabel: { shrink: true } }} onChange={e => setTo(e.target.value)} />
          </Stack>
          <TextField label="Note for the manager (optional)" value={note} onChange={e => setNote(e.target.value)} multiline minRows={2} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {n} calendar day{n === 1 ? '' : 's'}{kind === 'vacation' ? ` · you have ${Math.max(0, left)} holiday days left this year` : ''}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={async () => {
          if (await run(() => api.requestTimeOff(from, to, kind, note), 'Request sent')) onClose()
        }}>Send request</Button>
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
      <DialogTitle>{name}: {TIME_OFF_LABELS[request.kind]}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography>{range(request)} · {days(request)} day{days(request) > 1 ? 's' : ''}</Typography>
          {request.note && <Typography sx={{ color: 'text.secondary' }}>“{request.note}”</Typography>}
          {clash > 0 ? (
            <>
              <Alert severity="warning">{name} has {clash} shift{clash > 1 ? 's' : ''} in this period.</Alert>
              <FormControlLabel control={<Checkbox checked={release} onChange={e => setRelease(e.target.checked)} />}
                label="Turn them into open shifts so someone else can cover" />
            </>
          ) : <Alert severity="success">No shifts in this period.</Alert>}
          <TextField label="Message to them (optional)" value={note} onChange={e => setNote(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button color="error" sx={{ mr: 'auto' }} onClick={async () => {
          if (await run(() => api.decideTimeOff(request.id, false, note), 'Request declined')) onClose()
        }}>Decline</Button>
        <Button onClick={onClose}>Later</Button>
        <Button variant="contained" onClick={async () => {
          if (await run(() => api.decideTimeOff(request.id, true, note, release), 'Time off approved')) onClose()
        }}>Approve</Button>
      </DialogActions>
    </Dialog>
  )
}
