import {
  Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack,
  TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CopyIcon from '@mui/icons-material/ContentCopy'
import WarningIcon from '@mui/icons-material/WarningAmberRounded'
import { useMemo, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { ErrorBox, PageHeader, PersonAvatar, WeekNav } from '../components/common'
import type { ShiftInput } from '../data/api'
import { dayCoverage, holidayOn, shiftPaidMinutes, shiftWarnings, weeklyCheck, type ShiftContext } from '../../shared/rules'
import {
  addDays, formatDuration, formatLocal, formatMoney, localDate, localTime, today, weekDates, weekStart, zonedIso,
} from '../../shared/time'
import type { Shift } from '../../shared/types'

const OPEN = '__open__'

interface Draft {
  id?: string
  profile_id: string
  position_id: number | ''
  date: string
  from: string
  to: string
  break_minutes: number
  note: string
}

export function RotaPage() {
  const { api, profiles, positions, business, isAdmin, canSeePay, rates, me, settings } = useApp()
  const run = useAction()
  const [monday, setMonday] = useState(weekStart(today()))
  const [positionFilter, setPositionFilter] = useState<number | 'all'>('all')
  const [draft, setDraft] = useState<Draft | null>(null)
  const days = weekDates(monday)

  const data = useAsync(async () => {
    // Include the day before so 12h-rest checks see Sunday night shifts.
    const [shifts, events] = await Promise.all([
      api.shifts(zonedIso(addDays(monday, -1), '00:00'), zonedIso(addDays(monday, 7), '00:00')),
      api.events(monday, addDays(monday, 6)),
    ])
    return { shifts, events }
  }, [monday])

  const allShifts = data.data?.shifts ?? []
  const weekShifts = allShifts.filter(s => localDate(s.starts_at) >= monday)
  const visible = weekShifts.filter(s => positionFilter === 'all' || s.position_id === positionFilter)
  const events = data.data?.events ?? []
  const openingHours = business?.opening_hours ?? {}
  const people = profiles.filter(p => p.active && p.role !== 'kiosk')
  const position = (id: number | null) => positions.find(p => p.id === id)
  const rate = (pid: string | null) => (pid ? rates.get(pid) ?? 0 : 0)
  const mult = settings?.employer_cost_multiplier ?? 1

  const ctx: ShiftContext = useMemo(() => ({
    shifts: allShifts, openingHours, events,
    hasPayRate: canSeePay ? (pid: string) => rates.has(pid) : undefined,
    limits: settings ? {
      breakAfterHours: settings.break_after_hours, minBreakMinutes: settings.min_break_minutes,
      maxDailyHours: settings.max_daily_hours, maxWeeklyHours: settings.max_weekly_hours,
      minRestHours: settings.min_rest_hours,
    } : undefined,
  }), [allShifts, openingHours, events, canSeePay, rates, settings])

  const cost = (list: Shift[]) => list.reduce((sum, s) => sum + shiftPaidMinutes(s) / 60 * rate(s.profile_id) * mult, 0)
  const mins = (list: Shift[]) => list.reduce((sum, s) => sum + shiftPaidMinutes(s), 0)

  const openDraft = (profileId: string | null, date: string, s?: Shift) => {
    if (s) {
      setDraft({ id: s.id, profile_id: s.profile_id ?? OPEN, position_id: s.position_id ?? '', date: localDate(s.starts_at),
        from: localTime(s.starts_at), to: localTime(s.ends_at), break_minutes: s.break_minutes, note: s.note ?? '' })
    } else {
      const hours = openingHours[['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][days.indexOf(date)] as 'mon']
      setDraft({ profile_id: profileId ?? OPEN, position_id: positions[0]?.id ?? '', date,
        from: hours?.open ?? '08:00', to: '15:00', break_minutes: 15, note: '' })
    }
  }

  const draftShift = (d: Draft): ShiftInput => ({
    id: d.id,
    profile_id: d.profile_id === OPEN ? null : d.profile_id,
    position_id: d.position_id === '' ? null : d.position_id,
    starts_at: zonedIso(d.date, d.from),
    ends_at: d.to <= d.from ? zonedIso(addDays(d.date, 1), d.to) : zonedIso(d.date, d.to),
    break_minutes: d.break_minutes,
    note: d.note || null,
  })

  const copyLastWeek = async () => {
    const prev = await api.shifts(zonedIso(addDays(monday, -7), '00:00'), zonedIso(monday, '00:00'))
    let added = 0
    for (const s of prev) {
      const starts_at = zonedIso(addDays(localDate(s.starts_at), 7), localTime(s.starts_at))
      if (weekShifts.some(w => w.profile_id === s.profile_id && w.starts_at === starts_at)) continue
      const length = new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()
      await api.saveShift({ profile_id: s.profile_id, position_id: s.position_id, starts_at,
        ends_at: new Date(new Date(starts_at).getTime() + length).toISOString(),
        break_minutes: s.break_minutes, note: s.note })
      added++
    }
    return added
  }

  const ShiftBlock = ({ s }: { s: Shift }) => {
    const warnings = shiftWarnings(s, ctx)
    const pos = position(s.position_id)
    const clickable = isAdmin || (!s.profile_id)
    return (
      <Box onClick={e => { e.stopPropagation(); if (isAdmin) openDraft(s.profile_id, localDate(s.starts_at), s)
        else if (!s.profile_id) run(async () => { await api.takeOpenShift(s.id); await data.reload() }, 'Shift is yours') }}
        sx={{
          borderLeft: 4, borderColor: pos?.colour ?? 'grey.500', bgcolor: `${pos?.colour ?? '#9e9e9e'}14`,
          borderRadius: 1, px: 0.75, py: 0.5, mb: 0.5, cursor: clickable ? 'pointer' : 'default',
          outline: s.profile_id === me?.id ? '2px solid' : 'none', outlineColor: 'secondary.main',
          '&:hover': clickable ? { bgcolor: `${pos?.colour ?? '#9e9e9e'}29` } : {},
        }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {localTime(s.starts_at)}–{localTime(s.ends_at)}
          </Typography>
          {warnings.length > 0 && (
            <Tooltip title={<>{warnings.map(w => <div key={w.code}>• {w.message}</div>)}</>} arrow>
              <WarningIcon fontSize="small" color={warnings.some(w => w.code !== 'holiday') ? 'warning' : 'disabled'} />
            </Tooltip>
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.3 }}>
          {pos?.name}{s.break_minutes ? ` · ${s.break_minutes}m break` : ''}
        </Typography>
        {!s.profile_id && !isAdmin && <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>Tap to take</Typography>}
        {s.note && <Typography variant="caption" component="div" sx={{ fontStyle: 'italic' }}>{s.note}</Typography>}
      </Box>
    )
  }

  const rows: { id: string | null; name: string; colour: string }[] = [
    { id: null, name: 'Open shifts', colour: '#bdbdbd' },
    ...people.map(p => ({ id: p.id, name: p.full_name, colour: p.colour })),
  ]

  const cellSx = { borderRight: 1, borderBottom: 1, borderColor: 'divider', p: 0.75, minHeight: 64 }
  const grid = { display: 'grid', gridTemplateColumns: '180px repeat(7, minmax(120px, 1fr))', minWidth: 1020 }

  const d = draft ? draftShift(draft) : null
  const draftWarnings = d ? shiftWarnings({ ...d, id: d.id ?? 'new', status: 'published' } as Shift, ctx) : []

  return (
    <>
      <PageHeader title="Rota"
        subtitle={canSeePay ? `${formatDuration(mins(visible.filter(s => s.profile_id)))} scheduled · ${formatMoney(cost(visible))} labour${mult !== 1 ? ` (×${mult} employer cost)` : ''}`
          : `${formatDuration(mins(visible.filter(s => s.profile_id === me?.id)))} scheduled for you this week`}
        actions={<>
          <WeekNav monday={monday} onChange={setMonday} />
          <TextField select size="small" label="Position" value={positionFilter} sx={{ width: 140 }}
            onChange={e => setPositionFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <MenuItem value="all">All</MenuItem>
            {positions.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
          {isAdmin && <Button startIcon={<CopyIcon />} variant="outlined" onClick={() => run(async () => {
            const n = await copyLastWeek(); await data.reload(); if (!n) throw new Error('Nothing new to copy from last week')
          }, 'Copied last week')}>Copy last week</Button>}
          {isAdmin && <Button startIcon={<AddIcon />} variant="contained" onClick={() => openDraft(null, days[0])}>Add shift</Button>}
        </>} />
      <ErrorBox error={data.error} />

      <Card sx={{ overflowX: 'auto' }}>
        <Box sx={grid}>
          {/* header */}
          <Box sx={{ ...cellSx, minHeight: 0, bgcolor: 'grey.50' }} />
          {days.map(date => {
            const dayShifts = visible.filter(s => localDate(s.starts_at) === date)
            const holiday = holidayOn(date, events)
            const coverage = dayCoverage(date, weekShifts, openingHours, business?.peak_hours ?? undefined)
            const open = openingHours[['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][days.indexOf(date)] as 'mon']
            return (
              <Box key={date} sx={{ ...cellSx, minHeight: 0, bgcolor: date === today() ? '#f1f8e9' : 'grey.50' }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatLocal(`${date}T12:00:00Z`, 'EEE d')}</Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  {open ? `${open.open}–${open.close}` : 'Closed'}
                  {' · '}{formatDuration(mins(dayShifts.filter(s => s.profile_id)))}
                  {canSeePay && ` · ${formatMoney(cost(dayShifts))}`}
                </Typography>
                {holiday && <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }} component="div">{holiday.title}</Typography>}
                {coverage.length > 0 && (
                  <Tooltip arrow title={<>{coverage.filter(c => c.level !== 'ok').map(c =>
                    <div key={c.from}>{c.from}–{c.to}: {c.staff === 0 ? 'nobody on' : 'only 1 person at peak'}</div>)}
                    {coverage.every(c => c.level === 'ok') && 'Fully covered'}</>}>
                    <Stack direction="row" sx={{ mt: 0.5, height: 6, borderRadius: 3, overflow: 'hidden' }}>
                      {coverage.map(c => {
                        const len = (Number(c.to.slice(0, 2)) * 60 + Number(c.to.slice(3))) - (Number(c.from.slice(0, 2)) * 60 + Number(c.from.slice(3)))
                        return <Box key={c.from} sx={{ flex: len, bgcolor: c.level === 'none' ? 'error.main' : c.level === 'thin' ? 'warning.main' : 'success.light' }} />
                      })}
                    </Stack>
                  </Tooltip>
                )}
              </Box>
            )
          })}

          {/* rows */}
          {rows.map(row => {
            const rowShifts = visible.filter(s => s.profile_id === row.id)
            const week = row.id ? weeklyCheck(weekShifts.filter(s => s.profile_id === row.id), ctx.limits) : null
            if (!row.id && rowShifts.length === 0 && !isAdmin) return null
            return [
              <Box key={`${row.id}-name`} sx={{ ...cellSx, bgcolor: row.id ? 'background.paper' : 'grey.50' }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <PersonAvatar name={row.name} colour={row.colour} size={28} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{row.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDuration(mins(rowShifts))}
                      {canSeePay && row.id && ` · ${formatMoney(cost(rowShifts))}`}
                    </Typography>
                  </Box>
                </Stack>
                {week?.warnings.map(w => (
                  <Typography key={w} variant="caption" color="warning.dark" component="div">⚠ {w}</Typography>
                ))}
              </Box>,
              ...days.map(date => (
                <Box key={`${row.id}-${date}`} sx={{ ...cellSx, cursor: isAdmin ? 'pointer' : 'default',
                  bgcolor: date === today() ? '#fbfdf7' : undefined, '&:hover': isAdmin ? { bgcolor: 'grey.50' } : {} }}
                  onClick={() => isAdmin && openDraft(row.id, date)}>
                  {rowShifts.filter(s => localDate(s.starts_at) === date).map(s => <ShiftBlock key={s.id} s={s} />)}
                </Box>
              )),
            ]
          })}
        </Box>
      </Card>
      <Stack direction="row" spacing={2} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
        {positions.map(p => (
          <Stack key={p.id} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: p.colour }} />
            <Typography variant="caption">{p.name}</Typography>
          </Stack>
        ))}
        <Typography variant="caption" color="text.secondary">
          Coverage bar: <Box component="span" sx={{ color: 'error.main' }}>red</Box> = open with nobody on,{' '}
          <Box component="span" sx={{ color: 'warning.main' }}>amber</Box> = one person at peak
        </Typography>
      </Stack>

      <Dialog open={!!draft} onClose={() => setDraft(null)} fullWidth maxWidth="xs">
        <DialogTitle>{draft?.id ? 'Edit shift' : 'Add shift'}</DialogTitle>
        {draft && (
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField select label="Team member" value={draft.profile_id} onChange={e => setDraft({ ...draft, profile_id: e.target.value })}>
                <MenuItem value={OPEN}>Open shift (anyone can take it)</MenuItem>
                {people.map(p => <MenuItem key={p.id} value={p.id}>{p.full_name}</MenuItem>)}
              </TextField>
              <TextField select label="Position" value={draft.position_id} onChange={e => setDraft({ ...draft, position_id: Number(e.target.value) })}>
                {positions.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              </TextField>
              <TextField type="date" label="Date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }} />
              <Stack direction="row" spacing={1}>
                <TextField type="time" label="Start" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 900 } }} />
                <TextField type="time" label="End" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 900 } }} />
              </Stack>
              <TextField type="number" label="Break (minutes)" value={draft.break_minutes}
                onChange={e => setDraft({ ...draft, break_minutes: Math.max(0, Number(e.target.value)) })} />
              <TextField label="Note" value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} />
              {d && (
                <Typography variant="body2" color="text.secondary">
                  {formatDuration(shiftPaidMinutes(d))} paid
                  {canSeePay && d.profile_id && ` · ${formatMoney(shiftPaidMinutes(d) / 60 * rate(d.profile_id) * mult)}`}
                </Typography>
              )}
              {draftWarnings.map(w => <Alert key={w.code} severity={w.code === 'holiday' ? 'info' : 'warning'}>{w.message}</Alert>)}
            </Stack>
          </DialogContent>
        )}
        <DialogActions>
          {draft?.id && <Button color="error" sx={{ mr: 'auto' }} onClick={() => run(async () => {
            await api.deleteShift(draft.id!); setDraft(null); await data.reload()
          }, 'Shift removed')}>Delete</Button>}
          <Button onClick={() => setDraft(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => draft && run(async () => {
            await api.saveShift(draftShift(draft)); setDraft(null); await data.reload()
          }, 'Shift saved')}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
