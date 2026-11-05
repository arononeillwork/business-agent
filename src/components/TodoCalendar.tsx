// The To Do List as a calendar: the jobs still to plan on the left, the month or the week on the right.
// Drag a job onto a day of the month (some time that day) or onto a time in the week (an hour, to start
// with); in the week, drag a job to move it and pull its bottom edge to change when it ends. Dragging
// a job back to the list takes it off the calendar. Every job also opens with a click (or Enter), to
// pick its day and times by hand: the way for the keyboard, and for small screens.
import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Stack, Switch, TextField, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import LeftIcon from '@mui/icons-material/ChevronLeftRounded'
import RightIcon from '@mui/icons-material/ChevronRightRounded'
import AddIcon from '@mui/icons-material/Add'
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from '@dnd-kit/core'
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  DAY_END, DAY_START, SLOT_DEFAULT, SLOT_STEP, moveToDay, placeAt, planDay, planLength, planProblem, plannedOn, snap, stretchTo, unplanned, type TodoPlan,
} from '../../shared/todo'
import type { Todo, TodoCategory, TodoPatch } from '../../shared/types'
import { addDays, formatLocal, today, weekStart } from '../../shared/time'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

type CalView = 'month' | 'week'
const VIEW_KEY = 'todo-calendar-view'
/** A pixel height per hour in the week. */
const HOUR_PX = 44
const mins = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m }
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const noon = (d: string) => `${d}T12:00:00Z`
const dayName = (d: string) => formatLocal(noon(d), 'EEEE d MMMM')
const plan = (j: Todo): TodoPlan => ({ planned_on: j.planned_on ?? null, planned_from: j.planned_from ?? null, planned_to: j.planned_to ?? null })

function readView(): CalView {
  try { return localStorage.getItem(VIEW_KEY) === 'week' ? 'week' : 'month' } catch { return 'month' }
}

/** Jobs side by side where their times overlap: each one's lane and how many lanes its group has. */
function lanes(jobs: Todo[]) {
  const out = new Map<string, { lane: number; of: number }>()
  const sorted = [...jobs].sort((a, b) => mins(a.planned_from!) - mins(b.planned_from!) || mins(b.planned_to!) - mins(a.planned_to!))
  let group: { id: string; lane: number; end: number }[] = []
  let groupEnd = -1
  const close = () => { const of = Math.max(1, ...group.map(g => g.lane + 1)); for (const g of group) out.set(g.id, { lane: g.lane, of }); group = [] }
  for (const j of sorted) {
    const from = mins(j.planned_from!), to = mins(j.planned_to!)
    if (from >= groupEnd) { close(); groupEnd = -1 }
    const taken = new Set(group.filter(g => g.end > from).map(g => g.lane))
    let lane = 0
    while (taken.has(lane)) lane++
    group.push({ id: j.id, lane, end: to })
    groupEnd = Math.max(groupEnd, to)
  }
  close()
  return out
}

export function TodoCalendar({ items, categories, onChange, onAdd }: {
  items: Todo[]
  categories: TodoCategory[]
  onChange: (id: string, patch: TodoPatch) => void
  onAdd: (title: string) => Promise<boolean>
}) {
  const wide = useMediaQuery(useTheme().breakpoints.up('md'))
  const [view, setViewState] = useState<CalView>(readView)
  const setView = (v: CalView) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* storage unavailable */ } }
  const [anchor, setAnchor] = useState(today())
  const [editing, setEditing] = useState<Todo | null>(null)
  const [dragging, setDragging] = useState<Todo | null>(null)
  const [ghost, setGhost] = useState<{ day: string; from: number; to: number } | null>(null)
  const [title, setTitle] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const colour = (j: Todo) => categories.find(c => c.id === j.category_id)?.colour ?? tokens.inkFaint
  const toPlan = items.filter(j => !j.done && !j.planned_on)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.starred) - Number(a.starred) || a.position - b.position)
  const save = (j: Todo, p: TodoPlan) => {
    const was = plan(j)
    if (was.planned_on === p.planned_on && was.planned_from === p.planned_from && was.planned_to === p.planned_to) return
    onChange(j.id, p)
  }

  // The days on show: the month's weeks (Monday to Sunday), or the week.
  const days = useMemo(() => {
    const first = view === 'week' ? weekStart(anchor) : weekStart(`${anchor.slice(0, 7)}-01`)
    const nextMonth = addDays(`${anchor.slice(0, 7)}-28`, 4).slice(0, 7)
    const last = view === 'week' ? addDays(first, 6) : addDays(weekStart(addDays(`${nextMonth}-01`, -1)), 6)
    const out: string[] = []
    for (let d = first; d <= last; d = addDays(d, 1)) out.push(d)
    return out
  }, [view, anchor])
  const step = (by: -1 | 1) => setAnchor(view === 'week' ? addDays(anchor, by * 7) : `${addDays(`${anchor.slice(0, 7)}-15`, by * 30).slice(0, 7)}-01`)
  const heading = view === 'week'
    ? `${formatLocal(noon(days[0]), 'd MMM')} – ${formatLocal(noon(days[6]), 'd MMM yyyy')}`
    : formatLocal(noon(`${anchor.slice(0, 7)}-15`), 'MMMM yyyy')

  // Where the pointer picked the job up, and how far below the job's top: the job's top follows the pointer.
  const grab = useRef<{ y: number; offset: number } | null>(null)
  const onDragStart = (e: DragStartEvent) => {
    setDragging(items.find(j => j.id === String(e.active.id).slice(4)) ?? null)
    const ev = e.activatorEvent as PointerEvent
    const el = (ev.target as HTMLElement | null)?.closest('[data-drag-job]')
    grab.current = { y: ev.clientY ?? 0, offset: el ? (ev.clientY ?? 0) - el.getBoundingClientRect().top : 0 }
  }
  /** Where a job dragged over the week would start: the top of the dragged job against the day's hours. */
  const slotAt = (e: DragMoveEvent | DragEndEvent) => {
    const over = e.over?.id ? String(e.over.id) : ''
    if (!over.startsWith('slot:') || !grab.current) return null
    const day = over.slice(5)
    const column = document.getElementById(`todo-slot-${day}`)?.getBoundingClientRect()
    if (!column) return null
    const top = grab.current.y + e.delta.y - grab.current.offset
    const job = items.find(j => j.id === String(e.active.id).slice(4))
    const length = (job && planLength(plan(job))) ?? SLOT_DEFAULT
    const from = Math.min(snap(DAY_START + (top - column.top) / HOUR_PX * 60), DAY_END - SLOT_STEP)
    return { day, from, to: Math.min(DAY_END, from + length) }
  }
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    setGhost(null)
    const job = items.find(j => j.id === String(e.active.id).slice(4))
    const over = e.over?.id ? String(e.over.id) : ''
    if (!job || !over) return
    if (over === 'unplan') return save(job, unplanned)
    if (over.startsWith('day:')) return save(job, moveToDay(plan(job), over.slice(4)))
    if (over.startsWith('allday:')) return save(job, planDay(over.slice(7)))
    const slot = slotAt(e)
    if (slot) save(job, placeAt(plan(job), slot.day, slot.from))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragMove={e => setGhost(slotAt(e))} onDragEnd={onDragEnd} onDragCancel={() => { setDragging(null); setGhost(null) }}>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '280px minmax(0, 1fr)' }, alignItems: 'start' }}>
        <ToPlan jobs={toPlan} colour={colour} onOpen={setEditing} wide={wide}
          add={<Stack component="form" direction="row" spacing={1} sx={{ mb: 1.5 }}
            onSubmit={async e => { e.preventDefault(); if (title.trim() && await onAdd(title.trim())) setTitle('') }}>
            <TextField size="small" fullWidth value={title} onChange={e => setTitle(e.target.value)} placeholder={t('Add a job to plan')}
              slotProps={{ htmlInput: { 'aria-label': t('Add a job to plan'), maxLength: 500 } }} />
            <IconButton type="submit" aria-label={t('Add')} disabled={!title.trim()}><AddIcon /></IconButton>
          </Stack>} />

        <Box component="section" aria-label={t('Calendar')} sx={{ minWidth: 0 }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
            <Button variant="outlined" size="small" onClick={() => setAnchor(today())}>{t('Today')}</Button>
            <Tooltip title={view === 'week' ? t('Previous week') : t('Previous month')}>
              <IconButton size="small" aria-label={view === 'week' ? t('Previous week') : t('Previous month')} onClick={() => step(-1)}><LeftIcon /></IconButton>
            </Tooltip>
            <Tooltip title={view === 'week' ? t('Next week') : t('Next month')}>
              <IconButton size="small" aria-label={view === 'week' ? t('Next week') : t('Next month')} onClick={() => step(1)}><RightIcon /></IconButton>
            </Tooltip>
            <Typography variant="h6" component="h2" aria-live="polite" sx={{ flex: 1, minWidth: 150, textTransform: 'capitalize' }}>{heading}</Typography>
            <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v: CalView | null) => v && setView(v)} aria-label={t('Calendar view')}>
              <ToggleButton value="month" sx={{ px: 2 }}>{t('Month')}</ToggleButton>
              <ToggleButton value="week" sx={{ px: 2 }}>{t('Week')}</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          {view === 'month'
            ? <Month days={days} month={anchor.slice(0, 7)} items={items} colour={colour} onOpen={setEditing} />
            : <Week days={days} items={items} colour={colour} onOpen={setEditing} ghost={ghost} onStretch={(j, end) => save(j, stretchTo(plan(j), end))} />}
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
            {view === 'month'
              ? t('Drag a job onto a day. In the week, drop it on a time, drag it to move it and pull its bottom edge to change when it ends. Drag it back to the list to take it off.')
              : t('Drop a job on a time, drag it to move it, and pull its bottom edge to change when it ends. The top row is for some time that day.')}
          </Typography>
        </Box>
      </Box>
      <DragOverlay dropAnimation={null}>
        {dragging && <Chipish job={dragging} colour={colour(dragging)} lifted />}
      </DragOverlay>
      {editing && <PlanDialog job={editing} onClose={() => setEditing(null)}
        onSave={p => { save(editing, p); setEditing(null) }} onDone={done => { onChange(editing.id, { done }); setEditing(null) }} />}
    </DndContext>
  )
}

/** The jobs still to plan: dragged from here onto the calendar; dropped back here, off it. */
function ToPlan({ jobs, colour, onOpen, add, wide }: { jobs: Todo[]; colour: (j: Todo) => string; onOpen: (j: Todo) => void; add: ReactNode; wide: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unplan' })
  return (
    <Box component="section" aria-label={t('To plan')} ref={setNodeRef}
      sx={{ p: 1.5, borderRadius: 3, border: `1px ${isOver ? 'dashed' : 'solid'} ${isOver ? tokens.rose : tokens.line}`, bgcolor: isOver ? tokens.roseSoft : tokens.surface,
        maxHeight: { md: 'calc(100vh - 32px)' }, overflowY: { md: 'auto' } }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
        <Typography variant="subtitle2" component="h2">{t('To plan')}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{tn(jobs.length, '{n} job', '{n} jobs')}</Typography>
      </Stack>
      {add}
      {!jobs.length && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Everything is on the calendar.')}</Typography>}
      <Stack component="ul" aria-label={t('Jobs to plan')} spacing={0.75} sx={{ m: 0, p: 0, listStyle: 'none', ...(wide ? {} : { maxHeight: 240, overflowY: 'auto' }) }}>
        {jobs.map(j => <Box component="li" key={j.id}><Draggable job={j} colour={colour(j)} onOpen={onOpen} /></Box>)}
      </Stack>
    </Box>
  )
}

/** A job as a small card that can be dragged (and opened with a click or Enter). */
function Draggable({ job, colour, onOpen, style, children }: { job: Todo; colour: string; onOpen: (j: Todo) => void; style?: CSSProperties; children?: ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `job:${job.id}` })
  const open = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(job) } }
  return (
    <Box ref={setNodeRef} {...attributes} {...listeners} data-drag-job={job.id} title={job.title} onClick={() => onOpen(job)} onKeyDown={open}
      aria-label={t('{job}: plan it', { job: job.title })} aria-roledescription={t('job you can drag')}
      sx={{ opacity: isDragging ? 0.35 : 1, cursor: 'grab', touchAction: 'none', outline: 'none', borderRadius: 1.5,
        '&:focus-visible': { boxShadow: `0 0 0 2px ${tokens.rose}` }, ...style }}>
      {children ?? <Chipish job={job} colour={colour} />}
    </Box>
  )
}

/** How a job looks on the list and the month: its category's colour down the side, its time and name. */
function Chipish({ job, colour, lifted, small }: { job: Todo; colour: string; lifted?: boolean; small?: boolean }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', px: 1, py: small ? 0.25 : 0.75, borderRadius: 1.5, bgcolor: tokens.surface,
      border: `1px solid ${tokens.line}`, borderLeft: `3px solid ${colour}`, boxShadow: lifted ? `0 12px 28px -12px ${tokens.shadow}` : 'none',
      opacity: job.done ? 0.6 : 1, minWidth: 0 }}>
      {job.planned_from && <Typography variant="caption" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{job.planned_from}</Typography>}
      <Typography variant={small ? 'caption' : 'body2'} noWrap sx={{ textDecoration: job.done ? 'line-through' : 'none', fontWeight: small ? 500 : 400 }}>{job.title}</Typography>
    </Box>
  )
}

/** The month: a day each, Monday first; a job dropped on a day keeps its time if it had one. */
function Month({ days, month, items, colour, onOpen }: { days: string[]; month: string; items: Todo[]; colour: (j: Todo) => string; onOpen: (j: Todo) => void }) {
  return (
    <Box role="grid" aria-label={t('Month')} sx={{ border: `1px solid ${tokens.line}`, borderRadius: 3, overflow: 'hidden', bgcolor: tokens.surface }}>
      <Box role="row" sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: `1px solid ${tokens.line}` }}>
        {days.slice(0, 7).map(d => (
          <Typography key={d} role="columnheader" variant="caption" sx={{ px: 1, py: 0.75, color: 'text.secondary', fontWeight: 600 }}>{formatLocal(noon(d), 'EEE')}</Typography>
        ))}
      </Box>
      {Array.from({ length: days.length / 7 }, (_, w) => days.slice(w * 7, w * 7 + 7)).map(week => (
        <Box key={week[0]} role="row" sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', '& + &': { borderTop: `1px solid ${tokens.line}` } }}>
          {week.map(d => <MonthDay key={d} day={d} inMonth={d.startsWith(month)} jobs={plannedOn(items, d)} colour={colour} onOpen={onOpen} />)}
        </Box>
      ))}
    </Box>
  )
}

function MonthDay({ day, inMonth, jobs, colour, onOpen }: { day: string; inMonth: boolean; jobs: Todo[]; colour: (j: Todo) => string; onOpen: (j: Todo) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}` })
  const isToday = day === today()
  const shown = jobs.slice(0, 4)
  return (
    <Box ref={setNodeRef} role="gridcell" aria-label={dayName(day)}
      sx={{ minHeight: 112, p: 0.75, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5,
        bgcolor: isOver ? tokens.roseSoft : isToday ? tokens.today : inMonth ? 'transparent' : tokens.surfaceAlt,
        outline: isOver ? `2px dashed ${tokens.rose}` : 'none', outlineOffset: -2, '& + &': { borderLeft: `1px solid ${tokens.line}` } }}>
      <Typography variant="caption" sx={{ fontWeight: isToday ? 700 : 500, color: isToday ? tokens.roseDeep : inMonth ? 'text.primary' : 'text.secondary' }}>
        {formatLocal(noon(day), 'd')}
      </Typography>
      {shown.map(j => <Draggable key={j.id} job={j} colour={colour(j)} onOpen={onOpen}><Chipish job={j} colour={colour(j)} small /></Draggable>)}
      {jobs.length > shown.length && <Typography variant="caption" sx={{ color: 'text.secondary', px: 0.5 }}>{t('and {n} more', { n: jobs.length - shown.length })}</Typography>}
    </Box>
  )
}

/** The week: a top row for jobs some time that day, then the hours; jobs at their times, side by side where they overlap. */
function Week({ days, items, colour, onOpen, ghost, onStretch }: {
  days: string[]; items: Todo[]; colour: (j: Todo) => string; onOpen: (j: Todo) => void
  ghost: { day: string; from: number; to: number } | null; onStretch: (j: Todo, end: number) => void
}) {
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START / 60 + i)
  const cols = '48px repeat(7, minmax(0, 1fr))'
  return (
    <Box role="grid" aria-label={t('Week')} sx={{ border: `1px solid ${tokens.line}`, borderRadius: 3, overflow: 'hidden', bgcolor: tokens.surface }}>
      <Box role="row" sx={{ display: 'grid', gridTemplateColumns: cols, borderBottom: `1px solid ${tokens.line}` }}>
        <Box />
        {days.map(d => (
          <Box key={d} role="columnheader" sx={{ px: 0.75, py: 0.75, borderLeft: `1px solid ${tokens.line}`, bgcolor: d === today() ? tokens.today : 'transparent' }}>
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 600 }}>{formatLocal(noon(d), 'EEE d')}</Typography>
          </Box>
        ))}
      </Box>
      <Box role="row" sx={{ display: 'grid', gridTemplateColumns: cols, borderBottom: `1px solid ${tokens.line}` }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', p: 0.5, fontSize: '0.68rem', lineHeight: 1.2 }}>{t('Any time')}</Typography>
        {days.map(d => <AllDay key={d} day={d} jobs={plannedOn(items, d).filter(j => !j.planned_from)} colour={colour} onOpen={onOpen} />)}
      </Box>
      <Box role="row" sx={{ display: 'grid', gridTemplateColumns: cols, position: 'relative' }}>
        <Box aria-hidden sx={{ position: 'relative' }}>
          {hours.slice(1).map((h, i) => (
            <Typography key={h} variant="caption" sx={{ position: 'absolute', right: 6, top: (i + 1) * HOUR_PX - 8, lineHeight: '16px', color: 'text.secondary',
              fontVariantNumeric: 'tabular-nums' }}>{`${String(h).padStart(2, '0')}:00`}</Typography>
          ))}
        </Box>
        {days.map(d => <DayColumn key={d} day={d} hours={hours.length} jobs={plannedOn(items, d).filter(j => j.planned_from)} colour={colour}
          onOpen={onOpen} ghost={ghost?.day === d ? ghost : null} onStretch={onStretch} />)}
      </Box>
    </Box>
  )
}

function AllDay({ day, jobs, colour, onOpen }: { day: string; jobs: Todo[]; colour: (j: Todo) => string; onOpen: (j: Todo) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `allday:${day}` })
  return (
    <Box ref={setNodeRef} role="gridcell" aria-label={t('{day}, any time', { day: dayName(day) })}
      sx={{ minHeight: 36, p: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0, borderLeft: `1px solid ${tokens.line}`,
        bgcolor: isOver ? tokens.roseSoft : 'transparent', outline: isOver ? `2px dashed ${tokens.rose}` : 'none', outlineOffset: -2 }}>
      {jobs.map(j => <Draggable key={j.id} job={j} colour={colour(j)} onOpen={onOpen}><Chipish job={j} colour={colour(j)} small /></Draggable>)}
    </Box>
  )
}

function DayColumn({ day, hours, jobs, colour, onOpen, ghost, onStretch }: {
  day: string; hours: number; jobs: Todo[]; colour: (j: Todo) => string; onOpen: (j: Todo) => void
  ghost: { from: number; to: number } | null; onStretch: (j: Todo, end: number) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${day}` })
  const lane = lanes(jobs)
  const top = (m: number) => (m - DAY_START) / 60 * HOUR_PX
  return (
    <Box ref={setNodeRef} id={`todo-slot-${day}`} role="gridcell" aria-label={t('{day}, by the hour', { day: dayName(day) })}
      sx={{ position: 'relative', height: hours * HOUR_PX, borderLeft: `1px solid ${tokens.line}`, bgcolor: isOver ? tokens.hover : day === today() ? tokens.today : 'transparent',
        backgroundImage: `repeating-linear-gradient(to bottom, ${tokens.line} 0, ${tokens.line} 1px, transparent 1px, transparent ${HOUR_PX}px)` }}>
      {ghost && (
        <Box aria-hidden sx={{ position: 'absolute', left: 2, right: 2, top: top(ghost.from), height: top(ghost.to) - top(ghost.from), borderRadius: 1.5,
          border: `2px dashed ${tokens.rose}`, bgcolor: tokens.roseSoft, px: 0.75, zIndex: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: tokens.roseDeep }}>{`${hm(ghost.from)}–${hm(ghost.to)}`}</Typography>
        </Box>
      )}
      {jobs.map(j => {
        const l = lane.get(j.id) ?? { lane: 0, of: 1 }
        return <Block key={j.id} job={j} colour={colour(j)} onOpen={onOpen} onStretch={onStretch}
          style={{ position: 'absolute', top: top(mins(j.planned_from!)), left: `calc(${l.lane / l.of * 100}% + 2px)`, width: `calc(${100 / l.of}% - 4px)`, zIndex: 2 }} />
      })}
    </Box>
  )
}

/** A job at its time in the week: dragged to move it; its bottom edge pulled (or arrowed) to change when it ends. */
function Block({ job, colour, onOpen, onStretch, style }: { job: Todo; colour: string; onOpen: (j: Todo) => void; onStretch: (j: Todo, end: number) => void; style: CSSProperties }) {
  const [end, setEnd] = useState<number | null>(null)
  const start = useRef<{ y: number; end: number } | null>(null)
  const from = mins(job.planned_from!), to = end ?? mins(job.planned_to!)
  const height = Math.max(18, (to - from) / 60 * HOUR_PX - 2)
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { y: e.clientY, end: mins(job.planned_to!) }
  }
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    setEnd(Math.max(from + SLOT_STEP, snap(start.current.end + (e.clientY - start.current.y) / HOUR_PX * 60)))
  }
  const up = () => {
    if (start.current && end !== null) onStretch(job, end)
    start.current = null
    setEnd(null)
  }
  const keys = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    e.stopPropagation()
    onStretch(job, mins(job.planned_to!) + (e.key === 'ArrowDown' ? SLOT_STEP : -SLOT_STEP))
  }
  return (
    <Draggable job={job} colour={colour} onOpen={onOpen} style={{ ...style, height }}>
      <Box sx={{ height: '100%', overflow: 'hidden', borderRadius: 1.5, px: 0.75, py: 0.25, position: 'relative',
        bgcolor: `color-mix(in srgb, ${colour} 16%, ${tokens.surface})`, borderLeft: `3px solid ${colour}`, opacity: job.done ? 0.6 : 1 }}>
        <Typography variant="caption" sx={{ display: 'block', fontVariantNumeric: 'tabular-nums', color: 'text.secondary', lineHeight: 1.3 }}>
          {`${job.planned_from}–${hm(to)}`}
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, lineHeight: 1.25, textDecoration: job.done ? 'line-through' : 'none' }}>{job.title}</Typography>
        <Box role="slider" tabIndex={0} aria-label={t('When {job} ends', { job: job.title })} aria-valuemin={from + SLOT_STEP} aria-valuemax={DAY_END}
          aria-valuenow={to} aria-valuetext={hm(to)} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={keys}
          onClick={e => e.stopPropagation()}
          sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, cursor: 'ns-resize', touchAction: 'none',
            '&::after': { content: '""', position: 'absolute', left: '35%', right: '35%', bottom: 2, height: 3, borderRadius: 2, bgcolor: colour, opacity: 0.7 },
            '&:focus-visible': { outline: `2px solid ${tokens.rose}` } }} />
      </Box>
    </Draggable>
  )
}

/** A job's day and times by hand (and done, or off the calendar). */
function PlanDialog({ job, onClose, onSave, onDone }: { job: Todo; onClose: () => void; onSave: (p: TodoPlan) => void; onDone: (done: boolean) => void }) {
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [p, setP] = useState<TodoPlan>({ planned_on: job.planned_on ?? today(), planned_from: job.planned_from ?? null, planned_to: job.planned_to ?? null })
  const problem = planProblem(p)
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" fullScreen={phone} aria-labelledby="todo-plan-title">
      <DialogTitle id="todo-plan-title">{job.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Day')} type="date" value={p.planned_on ?? ''} onChange={e => setP({ ...p, planned_on: e.target.value || null })}
            slotProps={{ inputLabel: { shrink: true } }} />
          <FormControlLabel label={t('At a set time')} control={<Switch checked={!!p.planned_from}
            onChange={e => setP(e.target.checked ? { ...p, planned_from: '10:00', planned_to: '11:00' } : { ...p, planned_from: null, planned_to: null })} />} />
          {p.planned_from && (
            <Stack direction="row" spacing={2}>
              <TextField label={t('From')} type="time" fullWidth value={p.planned_from} slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: SLOT_STEP * 60 } }}
                onChange={e => {
                  const from = e.target.value
                  if (!from) return
                  const length = planLength(p) ?? SLOT_DEFAULT
                  setP({ ...p, planned_from: from, planned_to: hm(Math.min(24 * 60 - 1, mins(from) + length)) })
                }} />
              <TextField label={t('To')} type="time" fullWidth value={p.planned_to ?? ''} slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: SLOT_STEP * 60 } }}
                onChange={e => e.target.value && setP({ ...p, planned_to: e.target.value })} />
            </Stack>
          )}
          {problem && <Typography variant="body2" sx={{ color: tokens.badFg }}>{t(problem)}</Typography>}
          <FormControlLabel label={t('Done')} control={<Checkbox checked={job.done} onChange={e => onDone(e.target.checked)} />} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {job.planned_on && <Button color="error" onClick={() => onSave(unplanned)} sx={{ mr: 'auto' }}>{t('Take off the calendar')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!!problem || !p.planned_on} onClick={() => onSave(p)}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
