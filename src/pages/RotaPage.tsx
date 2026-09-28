import {
  Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CopyIcon from '@mui/icons-material/ContentCopy'
import WarningIcon from '@mui/icons-material/WarningAmberRounded'
import { useMemo, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { ErrorBox, PageHeader, PersonAvatar, WeekNav } from '../components/common'
import { fonts, tokens } from '../theme'
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
  const { api, profiles, positions, business, isAdmin, isPartner, canSeePay, rates, me, settings } = useApp()
  const run = useAction()
  const [monday, setMonday] = useState(weekStart(today()))
  const [positionFilter, setPositionFilter] = useState<number | 'all'>('all')
  const [draft, setDraft] = useState<Draft | null>(null)
  const days = weekDates(monday)
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('md'))
  const [viewChoice, setView] = useState<'week' | 'day' | null>(null)
  const view = viewChoice ?? (phone ? 'day' : 'week')
  const [day, setDay] = useState(today())

  const data = useAsync('rota', async () => {
    // Include the day before so 12h-rest checks see Sunday night shifts.
    const [shifts, events, timeOff] = await Promise.all([
      api.shifts(zonedIso(addDays(monday, -1), '00:00'), zonedIso(addDays(monday, 7), '00:00')),
      api.events(monday, addDays(monday, 6)),
      api.timeOff(monday, addDays(monday, 6)),
    ])
    return { shifts, events, timeOff }
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
    const colour = pos?.colour ?? '#B5ADA6'
    const clickable = isAdmin || (!s.profile_id && !isPartner)
    const mine = !!me && s.profile_id === me.id
    const serious = warnings.some(w => w.code !== 'holiday')
    return (
      <Box role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
        onKeyDown={e => { if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }}
        onClick={e => { e.stopPropagation(); if (isAdmin) openDraft(s.profile_id, localDate(s.starts_at), s)
          else if (!s.profile_id && !isPartner) run(async () => { await api.takeOpenShift(s.id); await data.reload() }, 'Shift is yours') }}
        sx={{
          position: 'relative', borderRadius: '10px', pl: 1.25, pr: 0.75, py: 0.6, mb: 0.6, cursor: clickable ? 'pointer' : 'default',
          bgcolor: s.profile_id ? `${colour}1F` : 'transparent', border: s.profile_id ? '1px solid transparent' : `1px dashed ${colour}`,
          transition: 'background .15s, box-shadow .15s',
          '&::before': { content: '""', position: 'absolute', left: 5, top: 7, bottom: 7, width: 3, borderRadius: 2, bgcolor: colour },
          '&:hover': clickable ? { bgcolor: `${colour}33` } : {},
          '&:focus-visible': { outline: `2px solid ${tokens.roseDeep}`, outlineOffset: 1 },
          ...(mine ? { boxShadow: `0 0 0 1.5px ${tokens.matcha}` } : {}),
        }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 0.5, pl: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
            {localTime(s.starts_at)}–{localTime(s.ends_at)}
          </Typography>
          {warnings.length > 0 && (
            <Tooltip title={<>{warnings.map(w => <div key={w.code}>• {w.message}</div>)}</>} arrow>
              <WarningIcon sx={{ fontSize: 16, color: serious ? tokens.warning : tokens.inkFaint }} aria-label={`${warnings.length} warning${warnings.length > 1 ? 's' : ''}`} />
            </Tooltip>
          )}
        </Stack>
        <Typography variant="caption" component="div" sx={{ color: 'text.secondary', lineHeight: 1.3, pl: 0.5 }} noWrap>
          {pos?.name}{s.break_minutes ? ` · ${s.break_minutes}m break` : ''}{mine ? ' · You' : ''}
        </Typography>
        {!s.profile_id && !isAdmin && !isPartner && <Typography variant="caption" sx={{ color: tokens.roseDeep, fontWeight: 500, pl: 0.5 }}>Tap to take</Typography>}
        {s.note && <Typography variant="caption" component="div" sx={{ fontStyle: 'italic', color: 'text.secondary', pl: 0.5 }} noWrap>{s.note}</Typography>}
      </Box>
    )
  }

  const rows: { id: string | null; name: string; colour: string }[] = [
    { id: null, name: 'Open shifts', colour: '#B5ADA6' },
    ...people.map(p => ({ id: p.id, name: p.full_name, colour: p.colour })),
  ]
  const onLeave = (pid: string | null, date: string) => !!pid && (data.data?.timeOff ?? []).some(t => t.profile_id === pid && t.status === 'approved' && date >= t.starts_on && date <= t.ends_on)

  const NAME_W = 190
  const line = `1px solid ${tokens.line}`
  const d = draft ? draftShift(draft) : null
  const draftWarnings = d ? shiftWarnings({ ...d, id: d.id ?? 'new', status: 'published' } as Shift, ctx) : []
  const flagged = weekShifts.filter(s => shiftWarnings(s, ctx).some(w => w.code !== 'holiday')).length
  const gapDays = days.filter(dt => dayCoverage(dt, weekShifts, openingHours, business?.peak_hours ?? undefined).some(c => c.level === 'none')).length
  const openCount = visible.filter(s => !s.profile_id).length

  const DayHead = ({ date, compact }: { date: string; compact?: boolean }) => {
    const dayShifts = visible.filter(s => localDate(s.starts_at) === date)
    const holiday = holidayOn(date, events)
    const coverage = dayCoverage(date, weekShifts, openingHours, business?.peak_hours ?? undefined)
    const open = openingHours[['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][days.indexOf(date)] as 'mon']
    const isToday = date === today()
    return (
      <Box sx={{ px: compact ? 0 : 1.25, pt: compact ? 0 : 1.25, pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
            bgcolor: isToday ? tokens.rose : 'transparent', color: isToday ? '#2B2522' : 'text.primary' }}>
            <Typography sx={{ fontWeight: 500, fontSize: '1.05rem', fontVariantNumeric: 'tabular-nums' }}>{formatLocal(`${date}T12:00:00Z`, 'd')}</Typography>
          </Box>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: isToday ? tokens.roseDeep : 'text.secondary' }}>
            {formatLocal(`${date}T12:00:00Z`, 'EEE')}{isToday ? ' · Today' : ''}
          </Typography>
        </Stack>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.35, mt: 0.5 }}>
          {open ? `${open.open}–${open.close}` : 'Closed'}
          <br />{formatDuration(mins(dayShifts.filter(s => s.profile_id)))}{canSeePay ? ` · ${formatMoney(cost(dayShifts))}` : ''}
        </Typography>
        {holiday && <Chip size="small" label={holiday.title} sx={{ mt: 0.75, maxWidth: '100%', bgcolor: tokens.badBg, color: tokens.badFg }} />}
        {coverage.length > 0 && (
          <Tooltip arrow title={<>{coverage.filter(c => c.level !== 'ok').map(c =>
            <div key={c.from}>{c.from}–{c.to}: {c.staff === 0 ? 'nobody on' : 'only 1 person at peak'}</div>)}
            {coverage.every(c => c.level === 'ok') && 'Fully covered'}</>}>
            <Stack direction="row" aria-label="Coverage" sx={{ mt: 1, height: 4, borderRadius: 2, overflow: 'hidden', gap: '2px' }}>
              {coverage.map(c => {
                const len = (Number(c.to.slice(0, 2)) * 60 + Number(c.to.slice(3))) - (Number(c.from.slice(0, 2)) * 60 + Number(c.from.slice(3)))
                return <Box key={c.from} sx={{ flex: len, bgcolor: c.level === 'none' ? tokens.danger : c.level === 'thin' ? tokens.warning : tokens.matcha, opacity: 0.85 }} />
              })}
            </Stack>
          </Tooltip>
        )}
      </Box>
    )
  }

  const hm = (iso: string) => { const t = localTime(iso); return Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) }
  const DayView = () => {
    const key = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][Math.max(0, days.indexOf(day))] as 'mon'
    const open = openingHours[key]
    const dayShifts = visible.filter(s => localDate(s.starts_at) === day).sort((x, y) => x.starts_at.localeCompare(y.starts_at))
    const startMin = Math.min(open ? Number(open.open.slice(0, 2)) * 60 : 7 * 60, ...dayShifts.map(x => hm(x.starts_at))) - 30
    const endMin = Math.max(open ? Number(open.close.slice(0, 2)) * 60 + Number(open.close.slice(3)) : 21 * 60, ...dayShifts.map(x => (hm(x.ends_at) < hm(x.starts_at) ? 24 * 60 : hm(x.ends_at)))) + 30
    const span = endMin - startMin
    const pct = (m: number) => `${((m - startMin) / span) * 100}%`
    const ticks = Array.from({ length: Math.floor(endMin / 60) - Math.ceil(startMin / 60) + 1 }, (_, i) => (Math.ceil(startMin / 60) + i) * 60)
    const away = people.filter(p => onLeave(p.id, day))
    return (
      <Card sx={{ p: { xs: 1.5, md: 2 } }}>
        <Stack direction="row" sx={{ gap: 0.75, mb: 2, overflowX: 'auto', pb: 0.5 }} role="tablist" aria-label="Day">
          {days.map(date => (
            <Chip key={date} role="tab" aria-selected={date === day} clickable onClick={() => setDay(date)}
              label={`${formatLocal(`${date}T12:00:00Z`, 'EEE d')}${date === today() ? ' · today' : ''}`}
              variant={date === day ? 'filled' : 'outlined'} color={date === day ? 'primary' : 'default'} />
          ))}
        </Stack>
        <DayHead date={day} compact />
        {open && (
          <Box sx={{ position: 'relative', height: 18, ml: { xs: 0, sm: '150px' }, mb: 0.5 }}>
            {ticks.map(t => (
              <Typography key={t} variant="caption" sx={{ position: 'absolute', left: pct(t), transform: 'translateX(-50%)', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                {String(t / 60).padStart(2, '0')}
              </Typography>
            ))}
          </Box>
        )}
        <Stack spacing={1}>
          {dayShifts.length === 0 && <Typography sx={{ color: 'text.secondary', py: 2 }}>Nobody on the rota this day.</Typography>}
          {dayShifts.map(x => {
            const p = profiles.find(pp => pp.id === x.profile_id)
            const endM = hm(x.ends_at) < hm(x.starts_at) ? 24 * 60 : hm(x.ends_at)
            return (
              <Stack key={x.id} direction={{ xs: 'column', sm: 'row' }} sx={{ gap: { xs: 0.5, sm: 0 }, alignItems: { sm: 'center' } }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', width: { sm: 150 }, flexShrink: 0 }}>
                  <PersonAvatar name={p?.full_name ?? 'Open'} colour={p?.colour ?? '#B5ADA6'} size={26} />
                  <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>{p?.full_name ?? 'Open shift'}</Typography>
                </Stack>
                <Box sx={{ position: 'relative', flex: 1, minHeight: 50, borderRadius: '10px', bgcolor: tokens.surfaceAlt,
                  backgroundImage: ticks.map(t => `linear-gradient(to right, transparent calc(${pct(t)} - 0.5px), ${tokens.line} calc(${pct(t)} - 0.5px), ${tokens.line} calc(${pct(t)} + 0.5px), transparent calc(${pct(t)} + 0.5px))`).join(',') }}>
                  <Box sx={{ position: 'absolute', top: 3, left: pct(hm(x.starts_at)), width: `calc(${pct(endM)} - ${pct(hm(x.starts_at))})`, minWidth: 110 }}>
                    <ShiftBlock s={x} />
                  </Box>
                </Box>
              </Stack>
            )
          })}
        </Stack>
        {away.length > 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>Time off: {away.map(p => p.full_name).join(', ')}</Typography>
        )}
        {isAdmin && <Button startIcon={<AddIcon />} sx={{ mt: 1.5 }} onClick={() => openDraft(null, day)}>Add a shift on {formatLocal(`${day}T12:00:00Z`, 'EEEE')}</Button>}
      </Card>
    )
  }

  return (
    <>
      <PageHeader eyebrow="Team" title="Rota"
        subtitle={isAdmin ? 'Click a day to add a shift, or a shift to change it. Warnings follow Spanish working-time rules.'
          : isPartner ? 'The published rota, read-only.' : 'Your shifts are marked “You”. Open shifts can be picked up.'}
        actions={isAdmin && <>
          <Button startIcon={<CopyIcon />} variant="outlined" onClick={() => run(async () => {
            const n = await copyLastWeek(); await data.reload(); if (!n) throw new Error('Nothing new to copy from last week')
          }, 'Copied last week')}>Copy last week</Button>
          <Button variant="outlined" onClick={() => run(async () => {
            const n = await api.sendRota(monday)
            if (!n) throw new Error('Nobody to send to: staff turn on WhatsApp under My account')
          }, 'Rota sent on WhatsApp')}>Send on WhatsApp</Button>
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => openDraft(null, view === 'day' ? day : days[0])}>Add shift</Button>
        </>} />
      <ErrorBox error={data.error} />

      {/* Toolbar: week, view, positions */}
      <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
        <WeekNav monday={monday} onChange={m => { setMonday(m); setDay(weekDates(m).includes(today()) ? today() : m) }} />
        <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, v) => v && setView(v)} aria-label="View"
          sx={{ '& .MuiToggleButton-root': { px: 1.75, borderRadius: '999px', textTransform: 'none', fontWeight: 500 }, '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': { ml: 0.5, borderLeft: `1px solid ${tokens.lineStrong}` } }}>
          <ToggleButton value="week">Week</ToggleButton>
          <ToggleButton value="day">Day</ToggleButton>
        </ToggleButtonGroup>
        <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }} role="group" aria-label="Position">
          {[{ id: 'all' as const, name: 'All', colour: '' }, ...positions].map(p => (
            <Chip key={p.id} size="small" clickable label={p.name} onClick={() => setPositionFilter(p.id)} aria-pressed={positionFilter === p.id}
              icon={p.colour ? <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.colour, ml: '8px !important' }} /> : undefined}
              variant={positionFilter === p.id ? 'filled' : 'outlined'} color={positionFilter === p.id ? 'primary' : 'default'} />
          ))}
        </Stack>
      </Stack>

      {/* Summary strip */}
      <Card sx={{ mb: 2, px: 2, py: 1.25 }}>
        <Stack direction="row" sx={{ gap: { xs: 2, md: 3.5 }, flexWrap: 'wrap', alignItems: 'center' }}>
          {canSeePay || isPartner ? <>
            <Figure label="Scheduled" value={formatDuration(mins(visible.filter(s => s.profile_id)))} />
            {canSeePay && <Figure label="Labour cost" value={formatMoney(cost(visible))} note={mult !== 1 ? `incl. ×${mult} employer cost` : undefined} />}
          </> : <Figure label="Your hours" value={formatDuration(mins(visible.filter(s => s.profile_id === me?.id)))} />}
          <Figure label="Open shifts" value={String(openCount)} tone={openCount ? 'warn' : 'good'} />
          {isAdmin && <>
            <Figure label="Warnings" value={String(flagged)} tone={flagged ? 'bad' : 'good'} />
            <Figure label="Days with gaps" value={String(gapDays)} tone={gapDays ? 'warn' : 'good'} />
          </>}
        </Stack>
      </Card>

      {view === 'week' ? (
        <Card sx={{ overflow: 'hidden' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: `${NAME_W}px repeat(7, minmax(132px, 1fr))`, minWidth: NAME_W + 7 * 132 }}>
              <Box sx={{ position: 'sticky', left: 0, zIndex: 2, bgcolor: tokens.surface, borderBottom: line, borderRight: line }} />
              {days.map(date => (
                <Box key={date} sx={{ borderBottom: line, bgcolor: date === today() ? tokens.today : tokens.surface }}><DayHead date={date} /></Box>
              ))}
              {rows.map(row => {
                const rowShifts = visible.filter(s => s.profile_id === row.id)
                const week = row.id ? weeklyCheck(weekShifts.filter(s => s.profile_id === row.id), ctx.limits) : null
                if (!row.id && rowShifts.length === 0 && !isAdmin) return null
                return [
                  <Box key={`${row.id}-name`} sx={{ position: 'sticky', left: 0, zIndex: 1, bgcolor: row.id ? tokens.surface : tokens.surfaceAlt,
                    borderBottom: line, borderRight: line, p: 1.25 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <PersonAvatar name={row.name} colour={row.colour} size={28} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>{row.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDuration(mins(rowShifts))}{canSeePay && row.id ? ` · ${formatMoney(cost(rowShifts))}` : ''}
                        </Typography>
                      </Box>
                    </Stack>
                    {week?.warnings.map(w => (
                      <Typography key={w} variant="caption" component="div" sx={{ color: tokens.warning, mt: 0.5, lineHeight: 1.3 }}>⚠ {w}</Typography>
                    ))}
                  </Box>,
                  ...days.map(date => (
                    <Box key={`${row.id}-${date}`} onClick={() => isAdmin && openDraft(row.id, date)}
                      aria-label={isAdmin ? `Add a shift for ${row.name} on ${formatLocal(`${date}T12:00:00Z`, 'EEEE d')}` : undefined}
                      sx={{ position: 'relative', borderBottom: line, p: 0.75, minHeight: 72, cursor: isAdmin ? 'pointer' : 'default',
                        bgcolor: date === today() ? tokens.today : undefined,
                        '& .add-hint': { opacity: 0 }, '&:hover .add-hint': { opacity: isAdmin ? 1 : 0 } }}>
                      {onLeave(row.id, date) && (
                        <Box sx={{ px: 1, py: 0.6, mb: 0.6, borderRadius: '10px', fontSize: '0.78rem', fontWeight: 500, color: tokens.infoFg, bgcolor: tokens.infoBg }}>
                          Time off
                        </Box>
                      )}
                      {rowShifts.filter(s => localDate(s.starts_at) === date).map(s => <ShiftBlock key={s.id} s={s} />)}
                      <Box className="add-hint" aria-hidden sx={{ display: 'grid', placeItems: 'center', height: 26, borderRadius: '8px',
                        border: `1px dashed ${tokens.lineStrong}`, color: tokens.inkFaint, transition: 'opacity .15s' }}>
                        <AddIcon sx={{ fontSize: 16 }} />
                      </Box>
                    </Box>
                  )),
                ]
              })}
            </Box>
          </Box>
        </Card>
      ) : (
        <DayView />
      )}

      <Stack direction="row" spacing={2} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          Coverage line under each day: <Box component="span" sx={{ color: tokens.danger }}>red</Box> = open with nobody on,{' '}
          <Box component="span" sx={{ color: tokens.warning }}>amber</Box> = one person at the busiest time
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

/** One figure in the rota's summary strip. */
function Figure({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const colour = tone === 'bad' ? tokens.danger : tone === 'warn' ? tokens.roseDeep : 'text.primary'
  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.2 }}>{label}</Typography>
      <Typography sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: '1.2rem', color: colour, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>
        {value}{note && <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 0.75, fontFamily: fonts.text }}>{note}</Typography>}
      </Typography>
    </Box>
  )
}
