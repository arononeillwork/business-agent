import {
  Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  MenuItem, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { ErrorBox, PageHeader } from '../components/common'
import { ShareDialog } from '../components/ShareDialog'
import type { EventInput } from '../data/api'
import { addDays, formatLocal, localTime, today, weekStart, zonedIso } from '../../shared/time'
import { tokens } from '../theme'
import { EventAlertButton } from '../components/NotificationBell'
import { CATEGORY_META, type CalendarEvent, type EventCategory } from '../../shared/types'

const monthStart = (d: string) => `${d.slice(0, 7)}-01`
const addMonths = (first: string, n: number) => {
  const [y, m] = first.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  return t.toISOString().slice(0, 10)
}

type View = 'month' | 'week'
const VIEW_KEY = 'calendar-view'
const savedView = (): View => { try { return localStorage.getItem(VIEW_KEY) === 'week' ? 'week' : 'month' } catch { return 'month' } }
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function CalendarPage() {
  const { api, isAdmin } = useApp()
  const run = useAction()
  const theme = useTheme()
  const wide = useMediaQuery(theme.breakpoints.up('md'))
  const [view, setViewState] = useState<View>(savedView)
  // The day the calendar is showing (its month, or its week).
  const [cursor, setCursor] = useState(today())
  const [hidden, setHidden] = useState<Set<EventCategory>>(new Set())
  const [editing, setEditing] = useState<EventInput | null>(null)
  const [sharing, setSharing] = useState<CalendarEvent | null>(null)
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* private mode */ } }

  const month = monthStart(cursor)
  const gridStart = view === 'week' ? weekStart(cursor) : weekStart(month)
  const gridEnd = view === 'week' ? addDays(gridStart, 6) : addDays(weekStart(addDays(addMonths(month, 1), -1)), 6)
  const data = useAsync('calendar', () => api.events(gridStart, gridEnd), [gridStart, gridEnd])
  const events = (data.data ?? []).filter(e => !hidden.has(e.category))
  const on = (date: string) => events.filter(e => date >= e.starts_on && date <= (e.ends_on ?? e.starts_on))
    .sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''))

  const days: string[] = []
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d)
  const inView = (d: string) => view === 'week' || d.slice(0, 7) === month.slice(0, 7)

  const unit = view === 'week' ? 'week' : 'month'
  const step = (n: number) => setCursor(view === 'week' ? addDays(cursor, 7 * n) : addMonths(month, n))
  const title = view === 'week'
    ? `${formatLocal(`${gridStart}T12:00:00Z`, gridStart.slice(0, 7) === gridEnd.slice(0, 7) ? 'd' : 'd MMM')} – ${formatLocal(`${gridEnd}T12:00:00Z`, 'd MMM yyyy')}`
    : formatLocal(`${month}T12:00:00Z`, 'MMMM yyyy')
  const showingToday = today() >= gridStart && today() <= gridEnd && inView(today())

  const toggle = (c: EventCategory) => setHidden(h => {
    const n = new Set(h)
    if (n.has(c)) n.delete(c)
    else n.add(c)
    return n
  })

  const newEvent = (d: string) => isAdmin && setEditing({ starts_on: d, ends_on: null, starts_at: null, title: '',
    category: 'business', town: null, confirmed: true, visibility: 'all' })
  const openEvent = (e: CalendarEvent) => isAdmin && setEditing({
    id: e.id, starts_on: e.starts_on, ends_on: e.ends_on, starts_at: e.starts_at, title: e.title, category: e.category,
    town: e.town, confirmed: e.confirmed, visibility: e.visibility, competition: e.competition,
  })

  const EventPill = ({ e }: { e: CalendarEvent }) => (
    <Box onClick={() => openEvent(e)} title={e.title}
      sx={{ bgcolor: CATEGORY_META[e.category].colour, color: '#fff', borderRadius: 0.75, px: 0.5, mb: 0.25,
        fontSize: 11, lineHeight: 1.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        opacity: e.confirmed ? 1 : 0.6, cursor: isAdmin ? 'pointer' : 'default' }}>
      {e.starts_at ? `${localTime(e.starts_at)} ` : ''}{e.title}{e.confirmed ? '' : ' (to confirm)'}
    </Box>
  )

  /** Week view: one tall column per day, events in full (they have room to wrap). */
  const EventBlock = ({ e }: { e: CalendarEvent }) => (
    <Box onClick={() => openEvent(e)}
      sx={{ borderLeft: 3, borderColor: CATEGORY_META[e.category].colour, bgcolor: tokens.surfaceAlt, borderRadius: 1,
        px: 0.75, py: 0.5, mb: 0.75, opacity: e.confirmed ? 1 : 0.7, cursor: isAdmin ? 'pointer' : 'default' }}>
      {e.starts_at && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.3 }}>{localTime(e.starts_at)}</Typography>}
      <Typography variant="body2" sx={{ fontSize: 13, lineHeight: 1.35, wordBreak: 'break-word' }}>{e.title}</Typography>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.3 }}>
        {e.competition ?? CATEGORY_META[e.category].label}{e.town ? `, ${e.town}` : ''}{e.confirmed ? '' : ' · to confirm'}
      </Typography>
    </Box>
  )

  return (
    <>
      <PageHeader eyebrow="What's on" title="Calendar" subtitle="Holidays, ferias, football and business events. Tap a category to hide it."
        actions={isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => newEvent(today())}>Add event</Button>} />
      <ErrorBox error={data.error} />

      {/* One toolbar: where you are on the left, how you look at it on the right. */}
      <Stack direction="row" role="toolbar" aria-label="Calendar" spacing={1}
        sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, mb: 1.5 }}>
        <Button variant="outlined" size="small" disabled={showingToday} onClick={() => setCursor(today())}>Today</Button>
        <Stack direction="row" sx={{ alignItems: 'center' }}>
          <Tooltip title={`Previous ${unit}`}><IconButton aria-label={`Previous ${unit}`} onClick={() => step(-1)}><ChevronLeft /></IconButton></Tooltip>
          <Tooltip title={`Next ${unit}`}><IconButton aria-label={`Next ${unit}`} onClick={() => step(1)}><ChevronRight /></IconButton></Tooltip>
        </Stack>
        <Typography variant="h6" component="h2" aria-live="polite" sx={{ flex: 1, minWidth: 160, textTransform: 'capitalize' }}>{title}</Typography>
        <ToggleButtonGroup exclusive size="small" value={view} aria-label="Calendar view" onChange={(_, v: View | null) => v && setView(v)}>
          <ToggleButton value="month" sx={{ px: 2 }}>Month</ToggleButton>
          <ToggleButton value="week" sx={{ px: 2 }}>Week</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Stack direction="row" spacing={0.5} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 0.5 }}>
        {(Object.keys(CATEGORY_META) as EventCategory[]).map(c => (
          <Chip key={c} size="small" label={CATEGORY_META[c].label} onClick={() => toggle(c)}
            sx={{ bgcolor: hidden.has(c) ? 'transparent' : CATEGORY_META[c].colour, color: hidden.has(c) ? 'text.secondary' : '#fff',
              border: 1, borderColor: CATEGORY_META[c].colour }} />
        ))}
      </Stack>

      {wide ? (
        <Card>
          {/* minmax(0, 1fr): every day the same width, whatever the events in it say. */}
          <Box role="grid" aria-label={title} sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
            {(view === 'week' ? days : DAY_NAMES).map((d, i) => (
              <Box key={d} role="columnheader" sx={{ px: 1, py: 0.75, fontWeight: 500, fontSize: 13, borderBottom: 1, borderColor: 'divider',
                bgcolor: tokens.surfaceAlt, color: view === 'week' && d === today() ? tokens.roseDeep : undefined }}>
                {view === 'week' ? `${DAY_NAMES[i]} ${Number(d.slice(8))}` : d}
              </Box>
            ))}
            {days.map(d => (
              <Box key={d} role="gridcell" aria-label={formatLocal(`${d}T12:00:00Z`, 'EEEE d MMMM')} onClick={() => newEvent(d)}
                sx={{ minHeight: view === 'week' ? 360 : 104, p: 0.75, borderRight: 1, borderBottom: 1, borderColor: 'divider',
                  '&:nth-of-type(7n)': { borderRight: 0 },
                  bgcolor: d === today() ? tokens.today : !inView(d) ? tokens.surfaceAlt : undefined,
                  cursor: isAdmin ? 'pointer' : 'default' }}>
                {view === 'month' && (
                  <Typography variant="caption" sx={{ display: 'block', mb: 0.25, fontWeight: d === today() ? 700 : 400,
                    color: !inView(d) ? 'text.disabled' : 'text.primary' }}>{Number(d.slice(8))}</Typography>
                )}
                <Box onClick={e => e.stopPropagation()}>
                  {on(d).map(e => view === 'week' ? <EventBlock key={e.id} e={e} /> : <EventPill key={e.id} e={e} />)}
                </Box>
              </Box>
            ))}
          </Box>
        </Card>
      ) : (
        <Stack spacing={1}>
          {days.filter(d => inView(d) && (view === 'week' || on(d).length)).map(d => (
            <Card key={d} sx={{ p: 1.5 }}>
              <Typography variant="subtitle2" sx={{ textTransform: 'capitalize', color: d === today() ? tokens.roseDeep : undefined }}>
                {formatLocal(`${d}T12:00:00Z`, 'EEEE d MMMM')}
              </Typography>
              {on(d).length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>Nothing planned</Typography>}
              {on(d).map(e => (
                <Stack key={e.id} direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }} onClick={() => openEvent(e)}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: CATEGORY_META[e.category].colour, flexShrink: 0 }} />
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {e.starts_at ? `${localTime(e.starts_at)} · ` : ''}{e.title}
                    <Typography component="span" variant="caption" color="text.secondary">
                      {' '}· {e.competition ?? CATEGORY_META[e.category].label}{e.town ? `, ${e.town}` : ''}{e.confirmed ? '' : ' · to confirm'}
                    </Typography>
                  </Typography>
                  {d >= today() && <EventAlertButton kind="calendar" refId={e.id} title={e.title} />}
                </Stack>
              ))}
            </Card>
          ))}
          {data.data && view === 'month' && !days.some(d => inView(d) && on(d).length) &&
            <Typography color="text.secondary">Nothing this month.</Typography>}
        </Stack>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} fullWidth maxWidth="xs">
        <DialogTitle>{editing?.id ? 'Edit event' : 'Add event'}</DialogTitle>
        {editing && (
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField label="Title" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} autoFocus />
              <TextField select label="Category" value={editing.category}
                onChange={e => setEditing({ ...editing, category: e.target.value as EventCategory })}>
                {(Object.keys(CATEGORY_META) as EventCategory[]).map(c => <MenuItem key={c} value={c}>{CATEGORY_META[c].label}</MenuItem>)}
              </TextField>
              <Stack direction="row" spacing={1}>
                <TextField type="date" label="From" value={editing.starts_on} slotProps={{ inputLabel: { shrink: true } }}
                  onChange={e => setEditing({ ...editing, starts_on: e.target.value })} />
                <TextField type="date" label="To (optional)" value={editing.ends_on ?? ''} slotProps={{ inputLabel: { shrink: true } }}
                  onChange={e => setEditing({ ...editing, ends_on: e.target.value || null })} />
              </Stack>
              <TextField type="time" label="Time (optional)" slotProps={{ inputLabel: { shrink: true } }}
                value={editing.starts_at ? localTime(editing.starts_at) : ''}
                onChange={e => setEditing({ ...editing, starts_at: e.target.value ? zonedIso(editing.starts_on, e.target.value) : null })} />
              <TextField label="Town (optional)" value={editing.town ?? ''} onChange={e => setEditing({ ...editing, town: e.target.value || null })} />
              <FormControlLabel control={<Switch checked={editing.visibility === 'admins'}
                onChange={e => setEditing({ ...editing, visibility: e.target.checked ? 'admins' : 'all' })} />} label="Admins only" />
              <FormControlLabel control={<Switch checked={!editing.confirmed}
                onChange={e => setEditing({ ...editing, confirmed: !e.target.checked })} />} label="Date to confirm" />
              {editing.id && (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 1, borderRadius: '12px', bgcolor: tokens.surfaceAlt }}>
                  <EventAlertButton kind="calendar" refId={editing.id} title={editing.title} />
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>Remind the admins the day before (3 hours before if it has a time).</Typography>
                </Stack>
              )}
            </Stack>
          </DialogContent>
        )}
        <DialogActions>
          {editing?.id && <Button color="error" sx={{ mr: 'auto' }} onClick={() => run(async () => {
            await api.deleteEvent(editing.id!); setEditing(null); await data.reload()
          }, 'Event removed')}>Delete</Button>}
          {editing?.id && <Button onClick={() => {
            setSharing((data.data ?? []).find(e => e.id === editing.id) ?? null); setEditing(null)
          }}>Share</Button>}
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" disabled={!editing?.title.trim()} onClick={() => editing && run(async () => {
            await api.saveEvent(editing); setEditing(null); await data.reload()
          }, 'Event saved')}>Save</Button>
        </DialogActions>
      </Dialog>
      {sharing && <ShareDialog event={sharing} onClose={() => setSharing(null)} />}
    </>
  )
}
