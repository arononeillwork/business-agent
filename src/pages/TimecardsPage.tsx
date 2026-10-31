import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, List, ListItem, ListItemText, MenuItem, Stack, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import LockIcon from '@mui/icons-material/LockOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import PrintIcon from '@mui/icons-material/PrintOutlined'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { ClockRulesCard } from '../components/ClockRules'
import { ExportButton, SortCell, useSort } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { ErrorBox, Flags, Loading, PageHeader, PersonAvatar, SectionTitle, Stat, StatRow, Tag, WeekNav } from '../components/common'
import { addDays, currencySymbol, formatDuration, formatLocal, formatMoney, localDate, localTime, today, weekStart, zonedIso } from '../../shared/time'
import type { CorrectionRequest, Shift, TimeEntry } from '../../shared/types'
import { t, tn } from '../i18n'

/** yyyy-MM-ddTHH:mm in business time, for datetime-local inputs. */
const toInput = (iso: string | null) => (iso ? formatLocal(iso, "yyyy-MM-dd'T'HH:mm") : '')
const fromInput = (v: string) => (v ? zonedIso(v.slice(0, 10), v.slice(11, 16)) : null)

export function TimecardsPage() {
  const { api, profiles, positions, can, isPartner, canSeePay, rates, me, settings } = useApp()
  // Admins, and anyone whose role has Update on timecards: the team's hours (their own through a correction).
  const canEdit = can('timecards', 'update')
  const run = useAction()
  const [monday, setMonday] = useState(weekStart(today()))
  const [person, setPerson] = useState<string>('all')
  const [editing, setEditing] = useState<TimeEntry | null>(null)
  const [adding, setAdding] = useState(false)

  const data = useAsync('timecards', async () => {
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

  // For the gestoría: one row per timecard, in date order (Export: Excel, CSV, PDF, copy, or the café's Drive / OneDrive).
  const table = (): ExportTable => {
    const rows = [...entries].sort((a, b) => a.work_date.localeCompare(b.work_date) || name(a.profile_id).localeCompare(name(b.profile_id)))
      .map(e => {
        const hours = Math.round(e.paid_minutes / 60 * 100) / 100
        const rate = rates.get(e.profile_id) ?? 0
        return [name(e.profile_id), e.work_date, positions.find(p => p.id === e.position_id)?.name ?? '',
          localTime(e.clock_in), e.clock_out ? localTime(e.clock_out) : '', e.break_minutes,
          hours, e.on_holiday ? 'Sí' : '', e.flags.join(' '), e.approved_at ? 'Sí' : '',
          ...(canSeePay ? [rate, Math.round(hours * rate * 100) / 100] : [])]
      })
    const hours = Math.round(entries.reduce((s, e) => s + e.paid_minutes, 0) / 60 * 100) / 100
    return {
      title: `${t('Timecards, week of {date}', { date: formatLocal(`${monday}T12:00:00Z`, 'd MMMM yyyy') })}${person !== 'all' ? `: ${name(person)}` : ''}`,
      filename: `timecards-${monday}${person !== 'all' ? `-${name(person).toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}`,
      columns: [t('Employee'), t('Date'), t('Position'), t('Clock in'), t('Clock out'), t('Break (min)'), t('Paid hours'), t('Holiday'), t('Flags'), t('Approved'),
        ...(canSeePay ? [t('Rate {currency}/h', { currency: currencySymbol() }), t('Gross {currency}', { currency: currencySymbol() })] : [])],
      rows,
      footer: [t('Total'), '', '', '', '', '', hours, '', '', '', ...(canSeePay ? ['', Math.round(rows.reduce((s, r) => s + Number(r[11]), 0) * 100) / 100] : [])],
      money: canSeePay ? [10, 11] : [],
    }
  }

  return (
    <>
      <PageHeader eyebrow={'Registro de jornada'} title={t('Timecards')}
        actions={<>
          {isPartner && <Tag>{t('Read-only')}</Tag>}
          <WeekNav monday={monday} onChange={setMonday} />
          {(canEdit || isPartner) && (
            <TextField select size="small" label={t('Person')} value={person} onChange={e => setPerson(e.target.value)} sx={{ width: 150 }}>
              <MenuItem value="all">{t('Everyone')}</MenuItem>
              {profiles.filter(p => p.role !== 'kiosk').map(p => <MenuItem key={p.id} value={p.id}>{p.full_name}</MenuItem>)}
            </TextField>
          )}
          <ExportButton table={table} disabled={!entries.length} folder="Timecards" />
          <Button startIcon={<PrintIcon />} variant="outlined" component={RouterLink} to={`/registro?month=${monday.slice(0, 7)}${person !== 'all' ? `&person=${person}` : ''}`}>
            {t('Monthly record')}
          </Button>
          {canEdit && <Button variant="outlined" onClick={() => setAdding(true)}>{t('Add timecard')}</Button>}
          {canEdit && <Button variant="outlined" onClick={() => run(async () => {
            const n = await api.fillFromRota(monday); await data.reload()
            if (!n) throw new Error(t('Nothing to fill: everyone on the rota has a timecard'))
          }, t('Missing timecards filled from the rota'))}>{t('Fill from rota')}</Button>}
          {canEdit && (
            <Button variant="contained" disabled={allApproved || !entries.length} startIcon={allApproved ? <LockIcon /> : undefined}
              onClick={() => run(async () => { const n = await api.approveWeek(monday); await data.reload(); return n },
                t('Week approved and locked'))}>
              {allApproved ? t('Approved') : t('Approve week')}
            </Button>
          )}
        </>} />
      <ErrorBox error={data.error} />
      <ClockRulesCard />

      {data.data && (() => {
        const paid = entries.reduce((m, e) => m + e.paid_minutes, 0)
        const holidayMin = entries.filter(e => e.on_holiday).reduce((m, e) => m + e.paid_minutes, 0)
        const flagged = entries.filter(e => e.flags.some(f => f !== 'edited')).length
        const gross = entries.reduce((m, e) => m + e.paid_minutes / 60 * (rates.get(e.profile_id) ?? 0), 0)
        return (
          <StatRow>
            <Stat label={t('Paid hours')} value={formatDuration(paid)} note={tn(entries.length, '{n} timecard', '{n} timecards')} />
            {canSeePay && <Stat label={t('Labour cost')} value={formatMoney(gross * mult)} note={mult !== 1 ? t('incl. ×{mult} employer cost', { mult }) : t('gross pay')} />}
            <Stat label={t('On holidays')} value={formatDuration(holidayMin)} note={t('paid extra or time off')} />
            <Stat label={t('Needs a look')} value={flagged} tone={flagged ? 'warning' : 'good'} note={flagged ? t('missed breaks, auto clock-outs…') : t('all clean')} />
            <Stat label={t('Week status')} value={allApproved ? t('Approved') : t('Open')} tone={allApproved ? 'good' : undefined}
              note={allApproved ? t('locked for the gestor') : pending.length ? tn(pending.length, '{n} request pending', '{n} requests pending') : t('ready to approve')} />
          </StatRow>
        )
      })()}

      {pending.length > 0 && (
        <Card sx={{ mb: 2, borderColor: 'warning.main' }}>
          <CardContent>
            <SectionTitle>{canEdit ? t('Correction requests') : t('My pending requests')}</SectionTitle>
            <List dense disablePadding>
              {pending.map(c => <CorrectionRow key={c.id} c={c} name={name(c.profile_id)} onDone={data.reload} />)}
            </List>
          </CardContent>
        </Card>
      )}

      {data.loading && !data.data && <Loading />}
      {data.data && entries.length === 0 && <Alert severity="info">{t('No timecards this week.')}</Alert>}

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
                <Chip label={t('{duration} paid', { duration: formatDuration(paid) })} color={overWeek ? 'error' : 'default'} />
                {holiday > 0 && <Chip label={t('{duration} on holidays', { duration: formatDuration(holiday) })} color="secondary" />}
                {rate !== undefined && (canSeePay || pid === me?.id) && (
                  <Chip variant="outlined" label={canSeePay ? formatMoney(paid / 60 * rate * mult) : t('Est. {amount}', { amount: formatMoney(paid / 60 * rate) })} />
                )}
              </Stack>
              <TimecardTable list={list} shiftOf={shiftOf} onEdit={setEditing} />
            </CardContent>
          </Card>
        )
      })}

      {editing && <EditDialog entry={editing} onClose={() => setEditing(null)} onSaved={data.reload} />}
      {adding && <AddDialog monday={monday} onClose={() => setAdding(false)} onSaved={data.reload} />}
    </>
  )
}

/** One person's week, day by day; the headings sort it. */
function TimecardTable({ list, shiftOf, onEdit }: { list: TimeEntry[]; shiftOf: (e: TimeEntry) => Shift | undefined; onEdit: (e: TimeEntry) => void }) {
  const { isAdmin, can, me } = useApp()
  // Edited directly by admins, and by those whose role has Update on timecards when it isn't their own.
  const manages = (e: TimeEntry) => isAdmin || (can('timecards', 'update') && e.profile_id !== me?.id)
  const { rows, sort } = useSort(list, {
    day: e => e.clock_in, scheduled: e => { const s = shiftOf(e); return s ? localTime(s.starts_at) : null }, in: e => localTime(e.clock_in),
    out: e => (e.clock_out ? localTime(e.clock_out) : null), breaks: e => e.break_minutes, paid: e => e.paid_minutes, flags: e => e.flags.length || null,
  }, undefined, ['paid', 'breaks', 'flags'])
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <SortCell sort={sort} id="day">{t('Day')}</SortCell><SortCell sort={sort} id="scheduled">{t('Scheduled')}</SortCell>
          <SortCell sort={sort} id="in">{t('In')}</SortCell><SortCell sort={sort} id="out">{t('Out')}</SortCell>
          <SortCell sort={sort} id="breaks">{t('Breaks')}</SortCell><SortCell sort={sort} id="paid">{t('Paid')}</SortCell>
          <SortCell sort={sort} id="flags">{t('Flags')}</SortCell><TableCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map(e => {
          const s = shiftOf(e)
          return (
            <TableRow key={e.id} hover>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                {formatLocal(e.clock_in, 'EEE d')}{e.on_holiday && <Chip size="small" label={t('Holiday')} color="error" sx={{ ml: 0.5 }} />}
              </TableCell>
              <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{s ? `${localTime(s.starts_at)}–${localTime(s.ends_at)}` : '—'}</TableCell>
              <TableCell>{localTime(e.clock_in)}</TableCell>
              <TableCell>{e.clock_out ? localTime(e.clock_out) : <Chip size="small" color="success" label={t('On shift')} />}</TableCell>
              <TableCell>{e.break_minutes ? t('{n}m', { n: e.break_minutes }) : '—'}</TableCell>
              <TableCell sx={{ fontWeight: 500 }}>{formatDuration(e.paid_minutes)}</TableCell>
              <TableCell><Flags flags={e.flags} /></TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                {e.approved_at && <Tooltip title={t('Approved')}><LockIcon fontSize="small" color="action" sx={{ verticalAlign: 'middle' }} /></Tooltip>}
                {(manages(e) || (e.profile_id === me?.id && e.clock_out)) && (
                  <IconButton size="small" aria-label={manages(e) ? t('Edit') : t('Request correction')} onClick={() => onEdit(e)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function CorrectionRow({ c, name, onDone }: { c: CorrectionRequest; name: string; onDone: () => void }) {
  const { api, isAdmin, can, me } = useApp()
  const decides = isAdmin || (can('timecards', 'update') && c.profile_id !== me?.id)
  const run = useAction()
  const what = [c.requested_clock_in && t('in → {time}', { time: formatLocal(c.requested_clock_in, 'EEE d HH:mm') }),
    c.requested_clock_out && t('out → {time}', { time: formatLocal(c.requested_clock_out, 'EEE d HH:mm') })].filter(Boolean).join(', ')
  return (
    <ListItem disableGutters secondaryAction={decides && (
      <Stack direction="row" spacing={1}>
        <Button size="small" color="error" onClick={() => run(async () => { await api.decideCorrection(c.id, false); onDone() }, t('Declined'))}>{t('Decline')}</Button>
        <Button size="small" variant="contained" onClick={() => run(async () => { await api.decideCorrection(c.id, true); onDone() }, t('Approved and applied'))}>{t('Approve')}</Button>
      </Stack>
    )}>
      <ListItemText sx={{ pr: decides ? 22 : 0 }} primary={`${name}: ${what}`}
        secondary={t('“{note}” · expires {date}', { note: c.note, date: formatLocal(c.expires_at, 'd MMM') })} />
    </ListItem>
  )
}

function EditDialog({ entry, onClose, onSaved }: { entry: TimeEntry; onClose: () => void; onSaved: () => void }) {
  const { api, isAdmin, can, me } = useApp()
  const manages = isAdmin || (can('timecards', 'update') && entry.profile_id !== me?.id)
  const run = useAction()
  const [clockIn, setClockIn] = useState(toInput(entry.clock_in))
  const [clockOut, setClockOut] = useState(toInput(entry.clock_out))
  const [reason, setReason] = useState('')
  const history = useAsync('timecard-history', () => api.entryChanges(entry.id), [entry.id])

  const save = () => run(async () => {
    const ci = clockIn !== toInput(entry.clock_in) ? fromInput(clockIn) : null
    const co = clockOut !== toInput(entry.clock_out) ? fromInput(clockOut) : null
    if (!ci && !co) throw new Error(t('Change a time first'))
    if (manages) await api.editEntry(entry.id, ci, co, reason)
    else await api.requestCorrection(entry.id, ci, co, reason)
    onClose()
    onSaved()
  }, manages ? t('Timecard updated') : t('Correction requested'))

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{manages ? t('Edit timecard') : t('Request a correction')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {entry.approved_at && manages && <Alert severity="warning">{t('This week is approved. Your change will be logged.')}</Alert>}
          <TextField type="datetime-local" label={t('Clock in')} value={clockIn} onChange={e => setClockIn(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="datetime-local" label={t('Clock out')} value={clockOut} onChange={e => setClockOut(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label={manages ? t('Reason (required)') : t('What happened? (required)')} value={reason}
            onChange={e => setReason(e.target.value)} multiline minRows={2} />
          {(history.data?.length ?? 0) > 0 && (
            <Box>
              <Typography variant="subtitle2">{t('History')}</Typography>
              {history.data!.map(h => (
                <Typography key={h.id} variant="caption" component="div" color="text.secondary">
                  {t('{when} via {via}: {reason}', { when: formatLocal(h.changed_at, 'd MMM HH:mm'), via: h.via, reason: h.reason })}
                  {h.old_values?.clock_out !== h.new_values?.clock_out && h.new_values?.clock_out &&
                    t(' (out {from} → {to})', { from: h.old_values?.clock_out ? localTime(h.old_values.clock_out) : '—', to: localTime(h.new_values.clock_out) })}
                  {h.old_values?.clock_in !== h.new_values?.clock_in && h.new_values?.clock_in &&
                    t(' (in {from} → {to})', { from: h.old_values?.clock_in ? localTime(h.old_values.clock_in) : '—', to: localTime(h.new_values.clock_in) })}
                </Typography>
              ))}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={save}>{manages ? t('Save') : t('Send request')}</Button>
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
      <DialogTitle>{t('Add a missing timecard')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label={t('Team member')} value={pid} onChange={e => setPid(e.target.value)}>
            {profiles.filter(p => p.role !== 'kiosk').map(p => <MenuItem key={p.id} value={p.id}>{p.full_name}</MenuItem>)}
          </TextField>
          <TextField select label={t('Position')} value={pos} onChange={e => setPos(Number(e.target.value))}>
            {positions.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          <TextField type="datetime-local" label={t('Clock in')} value={clockIn} onChange={e => setClockIn(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="datetime-local" label={t('Clock out')} value={clockOut} onChange={e => setClockOut(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label={t('Reason (required)')} value={reason} onChange={e => setReason(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => run(async () => {
          await api.addEntry(pid, fromInput(clockIn)!, fromInput(clockOut)!, reason, pos || null)
          onClose(); onSaved()
        }, t('Timecard added'))}>{t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}
