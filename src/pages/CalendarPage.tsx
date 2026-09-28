import {
  Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  MenuItem, Stack, Switch, TextField, Typography, useMediaQuery, useTheme,
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

export function CalendarPage() {
  const { api, isAdmin } = useApp()
  const run = useAction()
  const theme = useTheme()
  const wide = useMediaQuery(theme.breakpoints.up('md'))
  const [month, setMonth] = useState(monthStart(today()))
  const [hidden, setHidden] = useState<Set<EventCategory>>(new Set())
  const [editing, setEditing] = useState<EventInput | null>(null)
  const [sharing, setSharing] = useState<CalendarEvent | null>(null)

  const gridStart = weekStart(month)
  const gridEnd = addDays(weekStart(addDays(addMonths(month, 1), -1)), 6)
  const data = useAsync('calendar', () => api.events(gridStart, gridEnd), [month])
  const events = (data.data ?? []).filter(e => !hidden.has(e.category))
  const on = (date: string) => events.filter(e => date >= e.starts_on && date <= (e.ends_on ?? e.starts_on))

  const days: string[] = []
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d)

  const toggle = (c: EventCategory) => setHidden(h => {
    const n = new Set(h)
    if (n.has(c)) n.delete(c)
    else n.add(c)
    return n
  })

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

  return (
    <>
      <PageHeader eyebrow="What's on" title="Calendar" subtitle="Holidays, nearby towns, ferias, football and business events. Tap a category to hide it."
        actions={<>
          <Stack direction="row" sx={{ alignItems: 'center' }}>
            <IconButton aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft /></IconButton>
            <Typography sx={{ minWidth: 130, textAlign: 'center', fontWeight: 500, textTransform: 'capitalize' }}>
              {formatLocal(`${month}T12:00:00Z`, 'MMMM yyyy')}
            </Typography>
            <IconButton aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight /></IconButton>
          </Stack>
          {isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({
            starts_on: today(), ends_on: null, starts_at: null, title: '', category: 'business', town: null,
            confirmed: true, visibility: 'all',
          })}>Add event</Button>}
        </>} />
      <ErrorBox error={data.error} />
      <Stack direction="row" spacing={0.5} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 0.5 }}>
        {(Object.keys(CATEGORY_META) as EventCategory[]).map(c => (
          <Chip key={c} size="small" label={CATEGORY_META[c].label} onClick={() => toggle(c)}
            sx={{ bgcolor: hidden.has(c) ? 'transparent' : CATEGORY_META[c].colour, color: hidden.has(c) ? 'text.secondary' : '#fff',
              border: 1, borderColor: CATEGORY_META[c].colour }} />
        ))}
      </Stack>

      {wide ? (
        <Card>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <Box key={d} sx={{ p: 1, fontWeight: 500, fontSize: 13, borderBottom: 1, borderColor: 'divider', bgcolor: tokens.surfaceAlt }}>{d}</Box>
            ))}
            {days.map(d => (
              <Box key={d} onClick={() => isAdmin && setEditing({ starts_on: d, ends_on: null, starts_at: null, title: '',
                category: 'business', town: null, confirmed: true, visibility: 'all' })}
                sx={{ minHeight: 96, p: 0.5, borderRight: 1, borderBottom: 1, borderColor: 'divider',
                  bgcolor: d === today() ? tokens.today : d.slice(0, 7) !== month.slice(0, 7) ? tokens.surfaceAlt : undefined,
                  cursor: isAdmin ? 'pointer' : 'default' }}>
                <Typography variant="caption" sx={{ fontWeight: d === today() ? 700 : 400,
                  color: d.slice(0, 7) !== month.slice(0, 7) ? 'text.disabled' : 'text.primary' }}>{Number(d.slice(8))}</Typography>
                <Box onClick={e => e.stopPropagation()}>{on(d).map(e => <EventPill key={e.id} e={e} />)}</Box>
              </Box>
            ))}
          </Box>
        </Card>
      ) : (
        <Stack spacing={1}>
          {days.filter(d => d.slice(0, 7) === month.slice(0, 7) && on(d).length).map(d => (
            <Card key={d} sx={{ p: 1.5 }}>
              <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>{formatLocal(`${d}T12:00:00Z`, 'EEEE d MMMM')}</Typography>
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
          {data.data && !days.some(d => d.slice(0, 7) === month.slice(0, 7) && on(d).length) &&
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
