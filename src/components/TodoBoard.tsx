import {
  Box, Button, Card, CardContent, Chip, IconButton, ListItemIcon, Menu, MenuItem, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import MoreIcon from '@mui/icons-material/MoreHoriz'
import MoveIcon from '@mui/icons-material/ArrowForward'
import PersonAddIcon from '@mui/icons-material/PersonAddAlt1Outlined'
import PinIcon from '@mui/icons-material/PushPin'
import StarIcon from '@mui/icons-material/Star'
import StarOutlineIcon from '@mui/icons-material/StarBorder'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { PersonAvatar } from './common'
import {
  BOARD_COLUMNS, DEFAULT_BOARD_FILTERS, EVERYONE, NO_CATEGORY, UNASSIGNED, buildColumns, countByCategory, jobsInView, resolveBoardMove,
  topPosition, type BoardFilters, type BoardView,
} from '../../shared/todo'
import type { Profile, Todo, TodoCategory, TodoPatch, TodoStatus } from '../../shared/types'
import { tokens } from '../theme'
import { t, tc } from '../i18n'

const STAR = '#C98A1E'
const PIN = '#7C63A8'
const COLUMN_TONE: Record<TodoStatus, string> = { todo: tokens.inkFaint, doing: '#C98A1E', done: tokens.matchaDeep }
const wash = (colour: string, pct = 10) => `color-mix(in srgb, ${colour} ${pct}%, ${tokens.surface})`

// The board's view (whose jobs) and each view's own filters, remembered on this device.
const BOARD_KEY = 'todo-board'
interface Remembered { view: BoardView | null; filters: Record<BoardView, BoardFilters> }
function readRemembered(): Remembered {
  try {
    const r = JSON.parse(localStorage.getItem(BOARD_KEY) ?? '{}') as Partial<Remembered>
    return { view: r.view ?? null, filters: r.filters ?? {} }
  } catch { return { view: null, filters: {} } }
}
function remember(r: Remembered) {
  try { localStorage.setItem(BOARD_KEY, JSON.stringify(r)) } catch { /* storage unavailable */ }
}

/**
 * The To Do List as a kanban board: To do, Doing and Done, a card per job, dragged between columns (or
 * moved from its menu). Seen as everyone's, one person's (the owner's or an employee's) or nobody's
 * yet; each of those views keeps its own category and star filters.
 */
export function TodoBoard({ items, categories, team, meId, isAdmin, onChange, onDelete, onAdd }: {
  items: Todo[]; categories: TodoCategory[]; team: Profile[]; meId: string | null; isAdmin: boolean
  onChange: (id: string, patch: TodoPatch) => void
  onDelete: (job: Todo) => void
  onAdd: (job: { title: string; category_id: string | null; assignee_id: string | null; position: number }) => Promise<boolean>
}) {
  const [saved, setSaved] = useState<Remembered>(readRemembered)
  const me = team.find(p => p.id === meId)
  const others = team.filter(p => p.id !== meId)
  const views: BoardView[] = [EVERYONE, ...(me ? [me.id] : []), ...others.map(p => p.id), UNASSIGNED]
  const fallback = isAdmin || !me ? EVERYONE : me.id
  const view = saved.view && views.includes(saved.view) ? saved.view : fallback
  // A remembered category that has since been removed is dropped from the filter.
  const raw = saved.filters[view] ?? DEFAULT_BOARD_FILTERS
  const filters: BoardFilters = { ...raw, categoryIds: raw.categoryIds.filter(id => id === NO_CATEGORY || categories.some(c => c.id === id)) }
  const update = (next: Partial<Remembered>) => setSaved(s => { const r = { ...s, ...next }; remember(r); return r })
  const setFilters = (patch: Partial<BoardFilters>) => update({ filters: { ...saved.filters, [view]: { ...filters, ...patch } } })
  const toggleCategory = (id: string) => setFilters({
    categoryIds: filters.categoryIds.includes(id) ? filters.categoryIds.filter(x => x !== id) : [...filters.categoryIds, id],
  })

  const columns = useMemo(() => buildColumns(items, categories, view, filters), [items, categories, view, filters])
  const counts = useMemo(() => countByCategory(items, categories, view), [items, categories, view])
  const inView = jobsInView(items, view).length
  const person = team.find(p => p.id === view)
  const viewName = (v: BoardView) => (v === EVERYONE ? t('Everyone') : v === UNASSIGNED ? tc('board', 'Nobody yet') : v === meId ? t('Mine') : team.find(p => p.id === v)?.full_name ?? '')
  const filtered = filters.categoryIds.length > 0 || filters.starredOnly

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [dragging, setDragging] = useState<Todo | null>(null)
  const onDragStart = ({ active }: DragStartEvent) => setDragging(items.find(x => x.id === active.id) ?? null)
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    if (!over) return
    const column = over.data.current?.column as TodoStatus | undefined
    const move = resolveBoardMove(columns, String(active.id), column ? { column } : { card: String(over.id) })
    if (move) onChange(String(active.id), move)
  }
  const categoryOf = (job: Todo) => categories.find(c => c.id === job.category_id)

  return (
    <Stack spacing={2}>
      <Card component="section" aria-label={t('Board')}>
        <CardContent>
          <Tabs value={view} onChange={(_, v: BoardView) => update({ view: v })} variant="scrollable" allowScrollButtonsMobile aria-label={t('Whose jobs')}
            sx={{ minHeight: 40, mb: 1.5, '& .MuiTab-root': { minHeight: 40, textTransform: 'none', px: 1.5, gap: 1 }, '& .MuiTab-iconWrapper, & .MuiTab-root > .MuiAvatar-root': { m: 0 } }}>
            {views.map(v => {
              const p = team.find(x => x.id === v)
              return (
                <Tab key={v} value={v} label={viewName(v)} iconPosition="start"
                  icon={p ? <PersonAvatar name={p.full_name} colour={p.colour} size={22} /> : undefined} />
              )
            })}
          </Tabs>

          <AddCard categories={categories} assignee={person ?? null} defaultCategory={filters.categoryIds.length === 1 ? filters.categoryIds[0] : null}
            onAdd={(title, category) => onAdd({ title, category_id: category, assignee_id: person?.id ?? null, position: topPosition(items) })} />

          <Stack direction="row" useFlexGap role="group" aria-label={t('Filter {view} by category', { view: viewName(view) })}
            sx={{ flexWrap: 'wrap', gap: 0.75, mt: 2, alignItems: 'center' }}>
            <Chip clickable onClick={() => setFilters({ categoryIds: [] })} aria-pressed={!filters.categoryIds.length}
              label={<>{t('All')} <Box component="span" sx={{ opacity: 0.7, ml: 0.5 }}>{inView}</Box></>}
              color={!filters.categoryIds.length ? 'primary' : 'default'} variant={!filters.categoryIds.length ? 'filled' : 'outlined'} />
            {categories.map(c => {
              const on = filters.categoryIds.includes(c.id)
              return (
                <Chip key={c.id} clickable onClick={() => toggleCategory(c.id)} aria-pressed={on}
                  icon={<Box component="span" sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: on ? '#fff' : c.colour, ml: '10px !important' }} />}
                  label={<>{c.name} <Box component="span" sx={{ opacity: 0.7, ml: 0.5 }}>{counts[c.id] ?? 0}</Box></>}
                  sx={{ fontWeight: 500, opacity: !counts[c.id] && !on ? 0.6 : 1, bgcolor: on ? c.colour : wash(c.colour, 12), color: on ? '#fff' : 'text.primary',
                    border: 1, borderColor: on ? 'transparent' : wash(c.colour, 35), '&:hover': { bgcolor: on ? c.colour : wash(c.colour, 20) } }} />
              )
            })}
            {(counts[NO_CATEGORY] ?? 0) > 0 && (
              <Chip clickable onClick={() => toggleCategory(NO_CATEGORY)} aria-pressed={filters.categoryIds.includes(NO_CATEGORY)}
                label={<>{t('No category')} <Box component="span" sx={{ opacity: 0.7, ml: 0.5 }}>{counts[NO_CATEGORY]}</Box></>}
                variant={filters.categoryIds.includes(NO_CATEGORY) ? 'filled' : 'outlined'} />
            )}
            <Chip icon={<StarIcon sx={{ fontSize: 18, color: `${STAR} !important` }} />} label={t('Starred')} clickable
              variant={filters.starredOnly ? 'filled' : 'outlined'} onClick={() => setFilters({ starredOnly: !filters.starredOnly })} aria-pressed={filters.starredOnly} />
            {filtered && <Button size="small" onClick={() => setFilters(DEFAULT_BOARD_FILTERS)}>{t('Clear filters')}</Button>}
          </Stack>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
            {t('Each view keeps its own filters.')}
          </Typography>
        </CardContent>
      </Card>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <Box sx={{
          display: 'grid', gap: 1.5, alignItems: 'start',
          gridTemplateColumns: { xs: `repeat(${BOARD_COLUMNS.length}, minmax(82vw, 1fr))`, sm: `repeat(${BOARD_COLUMNS.length}, minmax(260px, 1fr))` },
          overflowX: { xs: 'auto', md: 'visible' }, scrollSnapType: { xs: 'x mandatory', md: 'none' }, pb: 1,
        }}>
          {columns.map(col => (
            <Column key={col.id} id={col.id} label={tc('board', col.label)} count={col.items.length}>
              <SortableContext items={col.items.map(x => x.id)} strategy={verticalListSortingStrategy}>
                {col.items.map(job => (
                  <BoardCard key={job.id} job={job} category={categoryOf(job)} team={team}
                    onChange={p => onChange(job.id, p)} onDelete={() => onDelete(job)} />
                ))}
              </SortableContext>
              {col.items.length === 0 && (
                <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 3 }}>
                  {col.id === 'doing' ? t('Drag a job here when someone starts it') : col.id === 'done' ? t('Finished jobs land here') : t('Nothing to do here')}
                </Typography>
              )}
            </Column>
          ))}
        </Box>
        <DragOverlay>{dragging ? <CardFace job={dragging} category={categoryOf(dragging)} team={team} lifted /> : null}</DragOverlay>
      </DndContext>
    </Stack>
  )
}

function Column({ id, label, count, children }: { id: TodoStatus; label: string; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${id}`, data: { column: id } })
  return (
    <Box component="section" ref={setNodeRef} aria-label={label}
      sx={{ scrollSnapAlign: 'start', bgcolor: isOver ? wash(COLUMN_TONE[id], 14) : tokens.surfaceAlt, borderRadius: '14px', p: 1.25, minHeight: 160,
        border: 1, borderColor: isOver ? COLUMN_TONE[id] : 'divider', borderTop: `3px solid ${COLUMN_TONE[id]}`, transition: 'background-color 120ms' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', px: 0.5, mb: 1 }}>
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>{label}</Typography>
        <Box component="span" sx={{ fontSize: 13, fontWeight: 600, px: 1, borderRadius: 999, bgcolor: wash(COLUMN_TONE[id], 22) }}>{count}</Box>
      </Stack>
      <Stack spacing={1}>{children}</Stack>
    </Box>
  )
}

/** A job's card where it sits on the board; it can be dragged, or moved and changed from its menu. */
function BoardCard({ job, category, team, onChange, onDelete }: {
  job: Todo; category: TodoCategory | undefined; team: Profile[]; onChange: (p: TodoPatch) => void; onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: job.id })
  return (
    <Box ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} sx={{ opacity: isDragging ? 0.35 : 1 }}>
      <CardFace job={job} category={category} team={team} onChange={onChange} onDelete={onDelete} handle={{ ...attributes, ...listeners }} />
    </Box>
  )
}

function CardFace({ job, category, team, onChange, onDelete, handle, lifted }: {
  job: Todo; category: TodoCategory | undefined; team: Profile[]; onChange?: (p: TodoPatch) => void; onDelete?: () => void
  handle?: Record<string, unknown>; lifted?: boolean
}) {
  const [assignMenu, setAssignMenu] = useState<HTMLElement | null>(null)
  const [more, setMore] = useState<HTMLElement | null>(null)
  const person = team.find(p => p.id === job.assignee_id)
  const colour = category?.colour ?? '#8A7E76'
  const quiet = { p: 0.5, color: tokens.inkFaint }
  return (
    <Box component="article" aria-label={job.title} data-testid="board-card"
      sx={{ position: 'relative', bgcolor: 'background.paper', borderRadius: '12px', border: 1, borderColor: job.pinned ? PIN : 'divider',
        boxShadow: lifted ? `0 14px 30px -14px ${tokens.shadow}` : 'none', p: 1.25, pl: 1.75, cursor: handle ? 'grab' : 'grabbing', touchAction: 'manipulation',
        '&::before': { content: '""', position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: '0 3px 3px 0', bgcolor: colour } }}>
      <Box {...handle} aria-label={handle ? t('Drag {title}', { title: job.title }) : undefined} role={handle ? 'button' : undefined}
        sx={{ touchAction: 'none', outline: 'none', '&:focus-visible': { boxShadow: `0 0 0 2px ${tokens.ink}`, borderRadius: '6px' } }}>
        <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.45, wordBreak: 'break-word', pr: 3.5,
          textDecoration: job.status === 'done' ? 'line-through' : 'none', color: job.status === 'done' ? 'text.secondary' : 'text.primary' }}>
          {job.title}
        </Typography>
      </Box>
      <Stack direction="row" useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
        <Box component="span" sx={{ fontSize: 12, px: 1, py: 0.25, borderRadius: 999, bgcolor: wash(colour, 14), border: 1, borderColor: wash(colour, 35) }}>
          {category?.name ?? t('No category')}
        </Box>
        {job.section && <Box component="span" sx={{ fontSize: 12, px: 1, py: 0.25, borderRadius: 999, border: 1, borderColor: 'divider', color: 'text.secondary' }}>{job.section}</Box>}
        {job.pinned && <PinIcon sx={{ fontSize: 15, color: PIN }} aria-label={t('Pinned')} />}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}>
          {onChange && (
            <Tooltip title={job.starred ? t('Remove star') : t('Star')}>
              <IconButton size="small" onClick={() => onChange({ starred: !job.starred })} aria-label={t('Star')} aria-pressed={job.starred}
                sx={{ ...quiet, color: job.starred ? STAR : tokens.inkFaint }}>
                {job.starred ? <StarIcon sx={{ fontSize: 18 }} /> : <StarOutlineIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={person ? t('{name} (change)', { name: person.full_name }) : t('Assign to someone')}>
            <span>
              <IconButton size="small" disabled={!onChange} onClick={e => setAssignMenu(e.currentTarget)} sx={quiet}
                aria-label={person ? t('Assigned to {name}', { name: person.full_name }) : t('Assign to someone')}>
                {person ? <PersonAvatar name={person.full_name} colour={person.colour} size={22} /> : <PersonAddIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Stack>
      {onChange && (
        <>
          <IconButton size="small" onClick={e => setMore(e.currentTarget)} aria-label={t('More for {title}', { title: job.title })}
            sx={{ ...quiet, position: 'absolute', top: 6, right: 6 }}>
            <MoreIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <Menu anchorEl={assignMenu} open={!!assignMenu} onClose={() => setAssignMenu(null)}>
            <MenuItem selected={!job.assignee_id} onClick={() => { onChange({ assignee_id: null }); setAssignMenu(null) }}>{t('Nobody')}</MenuItem>
            {team.map(p => (
              <MenuItem key={p.id} selected={p.id === job.assignee_id} onClick={() => { onChange({ assignee_id: p.id }); setAssignMenu(null) }}>
                <ListItemIcon><PersonAvatar name={p.full_name} colour={p.colour} size={22} /></ListItemIcon>
                {p.full_name}
              </MenuItem>
            ))}
          </Menu>
          <Menu anchorEl={more} open={!!more} onClose={() => setMore(null)}>
            {BOARD_COLUMNS.filter(c => c.id !== job.status).map(c => (
              <MenuItem key={c.id} onClick={() => { onChange({ status: c.id }); setMore(null) }}>
                <ListItemIcon><MoveIcon fontSize="small" /></ListItemIcon>
                {t('Move to {column}', { column: tc('board', c.label) })}
              </MenuItem>
            ))}
            <MenuItem onClick={() => { onChange({ pinned: !job.pinned }); setMore(null) }}>
              <ListItemIcon><PinIcon fontSize="small" /></ListItemIcon>
              {job.pinned ? t('Unpin') : t('Pin to the top')}
            </MenuItem>
            <MenuItem onClick={() => { setMore(null); onDelete?.() }} sx={{ color: tokens.danger }}>
              <ListItemIcon><DeleteIcon fontSize="small" sx={{ color: tokens.danger }} /></ListItemIcon>
              {t('Delete')}
            </MenuItem>
          </Menu>
        </>
      )}
    </Box>
  )
}

/** Add a job to the board's To do column: for the person whose board this is, or nobody yet. */
function AddCard({ categories, assignee, defaultCategory, onAdd }: {
  categories: TodoCategory[]; assignee: Profile | null; defaultCategory: string | null
  onAdd: (title: string, categoryId: string | null) => Promise<boolean>
}) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)
  const chosen = categories.some(c => c.id === category) ? category
    : defaultCategory && categories.some(c => c.id === defaultCategory) ? defaultCategory : categories[0]?.id ?? ''
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    if (await onAdd(title.trim(), chosen || null)) setTitle('')
    setSaving(false)
  }
  return (
    <Box component="form" onSubmit={submit} autoComplete="off" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
      <TextField value={title} onChange={e => setTitle(e.target.value)} size="small" sx={{ flex: '1 1 240px' }}
        placeholder={assignee ? t('A job for {name}…', { name: assignee.full_name }) : t('Add a job…')}
        slotProps={{ htmlInput: { 'aria-label': t('New job'), maxLength: 500 } }} />
      <TextField select size="small" value={chosen} onChange={e => setCategory(e.target.value)} sx={{ flex: '0 1 200px', minWidth: 150 }}
        slotProps={{ select: { native: true }, htmlInput: { 'aria-label': t('Category for the new job') } }}>
        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        {categories.length === 0 && <option value="">{t('No category')}</option>}
      </TextField>
      <Button type="submit" variant="contained" startIcon={<AddIcon />} disabled={!title.trim() || saving}>{t('Add')}</Button>
      {assignee && <Typography variant="caption" sx={{ color: 'text.secondary', width: '100%' }}>{t('It goes in To do, for {name}.', { name: assignee.full_name })}</Typography>}
    </Box>
  )
}
