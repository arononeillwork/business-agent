import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, List, ListItem, ListItemText, MenuItem, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import LockIcon from '@mui/icons-material/LockOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { ErrorBox, Flags, Loading, PageHeader, PersonAvatar, WeekNav } from '../components/common'
import { addDays, formatDuration, formatLocal, formatMoney, localDate, localTime, today, weekStart, zonedIso } from '../../shared/time'
import type { CorrectionRequest, TimeEntry } from '../../shared/types'

/** yyyy-MM-ddTHH:mm in business time, for datetime-local inputs. */
const toInput = (iso: string | null) => (iso ? formatLocal(iso, "yyyy-MM-dd'T'HH:mm") : '')
const fromInput = (v: string) => (v ? zonedIso(v.slice(0, 10), v.slice(11, 16)) : null)

function download(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

export function TimecardsPage() {
  const { api, profiles, positions, isAdmin, canSeePay, rates, me, settings } = useApp()
  const run = useAction()
  const [monday, setMonday] = useState(weekStart(today()))
  const [person, setPerson] = useState<string>('all')
  const [editing, setEditing] = useState<TimeEntry | null>(null)
  const [adding, setAdding] = useState(false)

  const data = useAsync(async () => {
    const [entries, corrections, shifts] = await Promise.all([
      api.timeEntries(zonedIso(monday, '00:00'), zonedIso(addDays(monday, 7), '00:00')),
      api.corrections(),
      api.shifts(zonedIso(monday, '00:00'), zonedIso(addDays(monday, 7), '00:00')),
    ])
    return { entries, corrections, shifts }
  }, [monday])

  const entries = (data.data?.entries ?? []).filter(e => person === 'all' || e.profile_id === person)
  const byPerson = new Map<string, TimeEntry[]>()
  for (const e of entries) byPerson.set(e.profile_id, [...(byPerson.get(e.profile_id) ?? []), e])
  const name = (id: string) => profiles.find(p => p.id === id)?.full_name ?? '—'
  const pending = (data.data?.corrections ?? []).filter(c => c.status === 'pending')
  const mult = settings?.employer_cost_multiplier ?? 1
  const allApproved = entries.length > 0 && entries.every(e => e.approved_at)
  const shiftOf = (e: TimeEntry) => data.data?.shifts.find(s => s.id === e.shift_id)

  const exportCsv = () => {
    const rows: (string | number)[][] = [['Employee', 'Date', 'Position', 'Clock in', 'Clock out', 'Break (min)',
      'Paid hours', 'Holiday', 'Flags', 'Approved', ...(canSeePay ? ['Rate €/h', 'Gross €'] : [])]]
    for (const e of entries) {
      const hours = e.paid_minutes / 60
      rows.push([name(e.profile_id), e.work_date, positions.find(p => p.id === e.position_id)?.name ?? '',
        localTime(e.clock_in), e.clock_out ? localTime(e.clock_out) : '', e.break_minutes,
        hours.toFixed(2).replace('.', ','), e.on_holiday ? 'Sí' : '', e.flags.join(' '), e.approved_at ? 'Sí' : '',
        ...(canSeePay ? [String(rates.get(e.profile_id) ?? 0).replace('.', ','),
          (hours * (rates.get(e.profile_id) ?? 0)).toFixed(2).replace('.', ',')] : [])])
    }
    download(`timecards-${monday}.csv`, rows)
  }

  return (
    <>
      <PageHeader title="Timecards"
        subtitle={isAdmin ? 'Clock-ins are stamped by the server and can be corrected, never deleted. Every change is logged.'
          : 'Your hours. Spot a mistake? Request a correction.'}
        actions={<>
          <WeekNav monday={monday} onChange={setMonday} />
          {isAdmin && (
            <TextField select size="small" label="Person" value={person} onChange={e => setPerson(e.target.value)} sx={{ width: 150 }}>
              <MenuItem value="all">Everyone</MenuItem>
              {profiles.filter(p => p.role !== 'kiosk').map(p => <MenuItem key={p.id} value={p.id}>{p.full_name}</MenuItem>)}
            </TextField>
          )}
          <Button startIcon={<DownloadIcon />} variant="outlined" onClick={exportCsv} disabled={!entries.length}>CSV</Button>
          {isAdmin && <Button variant="outlined" onClick={() => setAdding(true)}>Add timecard</Button>}
          {isAdmin && (
            <Button variant="contained" disabled={allApproved || !entries.length} startIcon={allApproved ? <LockIcon /> : undefined}
              onClick={() => run(async () => { const n = await api.approveWeek(monday); await data.reload(); return n },
                'Week approved and locked')}>
              {allApproved ? 'Approved' : 'Approve week'}
            </Button>
          )}
        </>} />
      <ErrorBox error={data.error} />

      {pending.length > 0 && (
        <Card sx={{ mb: 2, borderColor: 'warning.main' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>{isAdmin ? 'Correction requests' : 'My pending requests'}</Typography>
            <List dense disablePadding>
              {pending.map(c => <CorrectionRow key={c.id} c={c} name={name(c.profile_id)} onDone={data.reload} />)}
            </List>
          </CardContent>
        </Card>
      )}

      {data.loading && !data.data && <Loading />}
      {data.data && entries.length === 0 && <Alert severity="info">No timecards this week.</Alert>}

      {[...byPerson.entries()].map(([pid, list]) => {
        const p = profiles.find(x => x.id === pid)
        const paid = list.reduce((s, e) => s + e.paid_minutes, 0)
        const holiday = list.filter(e => e.on_holiday).reduce((s, e) => s + e.paid_minutes, 0)
        const rate = rates.get(pid)
        const overWeek = settings && paid > settings.max_weekly_hours * 60
        return (
          <Card key={pid} sx={{ mb: 2, overflowX: 'auto' }}>
            <CardContent sx={{ pb: 1 }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
                {p && <PersonAvatar name={p.full_name} colour={p.colour} />}
                <Typography variant="h6" sx={{ flex: 1 }}>{name(pid)}</Typography>
                <Chip label={`${formatDuration(paid)} paid`} color={overWeek ? 'error' : 'default'} />
                {holiday > 0 && <Chip label={`${formatDuration(holiday)} on holidays`} color="secondary" />}
                {rate !== undefined && (canSeePay || pid === me?.id) && (
                  <Chip variant="outlined" label={`${canSeePay ? '' : 'Est. '}${formatMoney(paid / 60 * rate * (canSeePay ? mult : 1))}`} />
                )}
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Day</TableCell><TableCell>Scheduled</TableCell><TableCell>In</TableCell><TableCell>Out</TableCell>
                    <TableCell>Breaks</TableCell><TableCell>Paid</TableCell><TableCell>Flags</TableCell><TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {list.map(e => {
                    const s = shiftOf(e)
                    return (
                      <TableRow key={e.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {formatLocal(e.clock_in, 'EEE d')}{e.on_holiday && <Chip size="small" label="Holiday" color="error" sx={{ ml: 0.5 }} />}
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{s ? `${localTime(s.starts_at)}–${localTime(s.ends_at)}` : '—'}</TableCell>
                        <TableCell>{localTime(e.clock_in)}</TableCell>
                        <TableCell>{e.clock_out ? localTime(e.clock_out) : <Chip size="small" color="success" label="On shift" />}</TableCell>
                        <TableCell>{e.break_minutes ? `${e.break_minutes}m` : '—'}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{formatDuration(e.paid_minutes)}</TableCell>
                        <TableCell><Flags flags={e.flags} /></TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {e.approved_at && <Tooltip title="Approved"><LockIcon fontSize="small" color="action" sx={{ verticalAlign: 'middle' }} /></Tooltip>}
                          {(isAdmin || (e.profile_id === me?.id && e.clock_out)) && (
                            <IconButton size="small" aria-label={isAdmin ? 'Edit' : 'Request correction'} onClick={() => setEditing(e)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      })}

      {editing && <EditDialog entry={editing} onClose={() => setEditing(null)} onSaved={data.reload} />}
      {adding && <AddDialog monday={monday} onClose={() => setAdding(false)} onSaved={data.reload} />}
    </>
  )
}

function CorrectionRow({ c, name, onDone }: { c: CorrectionRequest; name: string; onDone: () => void }) {
  const { api, isAdmin } = useApp()
  const run = useAction()
  const what = [c.requested_clock_in && `in → ${formatLocal(c.requested_clock_in, 'EEE d HH:mm')}`,
    c.requested_clock_out && `out → ${formatLocal(c.requested_clock_out, 'EEE d HH:mm')}`].filter(Boolean).join(', ')
  return (
    <ListItem disableGutters secondaryAction={isAdmin && (
      <Stack direction="row" spacing={1}>
        <Button size="small" color="error" onClick={() => run(async () => { await api.decideCorrection(c.id, false); onDone() }, 'Declined')}>Decline</Button>
        <Button size="small" variant="contained" onClick={() => run(async () => { await api.decideCorrection(c.id, true); onDone() }, 'Approved and applied')}>Approve</Button>
      </Stack>
    )}>
      <ListItemText sx={{ pr: isAdmin ? 22 : 0 }} primary={`${name}: ${what}`}
        secondary={`“${c.note}” · expires ${formatLocal(c.expires_at, 'd MMM')}`} />
    </ListItem>
  )
}

function EditDialog({ entry, onClose, onSaved }: { entry: TimeEntry; onClose: () => void; onSaved: () => void }) {
  const { api, isAdmin } = useApp()
  const run = useAction()
  const [clockIn, setClockIn] = useState(toInput(entry.clock_in))
  const [clockOut, setClockOut] = useState(toInput(entry.clock_out))
  const [reason, setReason] = useState('')
  const history = useAsync(() => api.entryChanges(entry.id), [entry.id])

  const save = () => run(async () => {
    const ci = clockIn !== toInput(entry.clock_in) ? fromInput(clockIn) : null
    const co = clockOut !== toInput(entry.clock_out) ? fromInput(clockOut) : null
    if (!ci && !co) throw new Error('Change a time first')
    if (isAdmin) await api.editEntry(entry.id, ci, co, reason)
    else await api.requestCorrection(entry.id, ci, co, reason)
    onClose()
    onSaved()
  }, isAdmin ? 'Timecard updated' : 'Correction requested')

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{isAdmin ? 'Edit timecard' : 'Request a correction'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {entry.approved_at && isAdmin && <Alert severity="warning">This week is approved. Your change will be logged.</Alert>}
          <TextField type="datetime-local" label="Clock in" value={clockIn} onChange={e => setClockIn(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="datetime-local" label="Clock out" value={clockOut} onChange={e => setClockOut(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label={isAdmin ? 'Reason (required)' : 'What happened? (required)'} value={reason}
            onChange={e => setReason(e.target.value)} multiline minRows={2} />
          {(history.data?.length ?? 0) > 0 && (
            <Box>
              <Typography variant="subtitle2">History</Typography>
              {history.data!.map(h => (
                <Typography key={h.id} variant="caption" component="div" color="text.secondary">
                  {formatLocal(h.changed_at, 'd MMM HH:mm')} via {h.via}: {h.reason}
                  {h.old_values?.clock_out !== h.new_values?.clock_out && h.new_values?.clock_out &&
                    ` (out ${h.old_values?.clock_out ? localTime(h.old_values.clock_out) : '—'} → ${localTime(h.new_values.clock_out)})`}
                  {h.old_values?.clock_in !== h.new_values?.clock_in && h.new_values?.clock_in &&
                    ` (in ${h.old_values?.clock_in ? localTime(h.old_values.clock_in) : '—'} → ${localTime(h.new_values.clock_in)})`}
                </Typography>
              ))}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save}>{isAdmin ? 'Save' : 'Send request'}</Button>
      </DialogActions>
    </Dialog>
  )
}

function AddDialog({ monday, onClose, onSaved }: { monday: string; onClose: () => void; onSaved: () => void }) {
  const { api, profiles, positions } = useApp()
  const run = useAction()
  const date = localDate(new Date()) < monday ? monday : localDate(new Date())
  const [pid, setPid] = useState(profiles.find(p => p.role === 'employee')?.id ?? '')
  const [pos, setPos] = useState<number | ''>(positions[0]?.id ?? '')
  const [clockIn, setClockIn] = useState(`${date}T08:00`)
  const [clockOut, setClockOut] = useState(`${date}T15:00`)
  const [reason, setReason] = useState('')
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Add a missing timecard</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label="Team member" value={pid} onChange={e => setPid(e.target.value)}>
            {profiles.filter(p => p.role !== 'kiosk').map(p => <MenuItem key={p.id} value={p.id}>{p.full_name}</MenuItem>)}
          </TextField>
          <TextField select label="Position" value={pos} onChange={e => setPos(Number(e.target.value))}>
            {positions.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <TextField type="datetime-local" label="Clock in" value={clockIn} onChange={e => setClockIn(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="datetime-local" label="Clock out" value={clockOut} onChange={e => setClockOut(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="Reason (required)" value={reason} onChange={e => setReason(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => run(async () => {
          await api.addEntry(pid, fromInput(clockIn)!, fromInput(clockOut)!, reason, pos || null)
          onClose(); onSaved()
        }, 'Timecard added')}>Add</Button>
      </DialogActions>
    </Dialog>
  )
}
