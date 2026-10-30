import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, Collapse, FormControlLabel, IconButton, ListItemIcon, Menu, MenuItem, Snackbar, Stack,
  Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import ListViewIcon from '@mui/icons-material/ViewListOutlined'
import BoardViewIcon from '@mui/icons-material/ViewKanbanOutlined'
import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import DoneIcon from '@mui/icons-material/CheckCircle'
import DragIcon from '@mui/icons-material/DragIndicator'
import EditIcon from '@mui/icons-material/EditOutlined'
import ExpandIcon from '@mui/icons-material/ExpandMore'
import OpenIcon from '@mui/icons-material/RadioButtonUnchecked'
import PersonAddIcon from '@mui/icons-material/PersonAddAlt1Outlined'
import PinIcon from '@mui/icons-material/PushPin'
import PinOutlineIcon from '@mui/icons-material/PushPinOutlined'
import StarIcon from '@mui/icons-material/Star'
import StarOutlineIcon from '@mui/icons-material/StarBorder'
import TuneIcon from '@mui/icons-material/TuneOutlined'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, PersonAvatar, SectionTitle } from '../components/common'
import { restrictToVerticalAxis } from '../components/dnd'
import { NO_CATEGORY, buildBoard, flatten, inStep, resolveMove, topPosition, visible, type TodoFilters } from '../../shared/todo'
import { TodoBoard } from '../components/TodoBoard'
import type { Profile, Todo, TodoCategory, TodoPatch } from '../../shared/types'
import { fonts, tokens } from '../theme'
import { t, tn } from '../i18n'

const VIEW_KEY = 'todo-view'
// The list (by category) or the board (To do, Doing, Done), remembered on this device.
const MODE_KEY = 'todo-mode'
type Mode = 'list' | 'board'
function readMode(): Mode {
  try { return localStorage.getItem(MODE_KEY) === 'board' ? 'board' : 'list' } catch { return 'list' }
}
const DEFAULT_VIEW: TodoFilters = { categoryId: null, starredOnly: false, showDone: false }
const STAR = '#C98A1E'
const PIN = '#7C63A8'
/** A light wash of a category's colour that works on light and dark surfaces. */
const wash = (colour: string, pct = 10) => `color-mix(in srgb, ${colour} ${pct}%, ${tokens.surface})`

const FOLDED_KEY = 'todo-folded'
function readFolded(): string[] {
  try { return JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '[]') as string[] } catch { return [] }
}

function readView(): TodoFilters {
  try { return { ...DEFAULT_VIEW, ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') } } catch { return DEFAULT_VIEW }
}

/** The team's to-do list, grouped by categories the admins add and remove; or the same jobs as a kanban board. */
export function TodoPage() {
  const { api, isAdmin, can, permissions, profiles, me } = useApp()
  // Admins, and anyone whose role has Update on the To Do List, set up its categories.
  const managesLists = can('todo', 'update')
  // A role with Own: only the jobs given to them (the database shows no others), and what they add is theirs.
  const ownOnly = permissions.todo === 'own'
  const notify = useNotify()
  const run = useAction()
  const data = useAsync('todos', () => api.todos(), [])
  const [items, setItems] = useState<Todo[]>([])
  const [view, setView] = useState<TodoFilters>(readView)
  const [mode, setMode] = useState<Mode>(readMode)
  const chooseMode = (m: Mode | null) => {
    if (!m) return
    setMode(m)
    try { localStorage.setItem(MODE_KEY, m) } catch { /* storage unavailable */ }
  }
  const [managing, setManaging] = useState(false)
  const [undo, setUndo] = useState<Todo | null>(null)
  useEffect(() => { if (data.data) setItems(data.data.todos) }, [data.data])

  const categories = useMemo(() => data.data?.categories ?? [], [data.data])
  // A remembered category filter that has since been removed would hide everything.
  const filters = view.categoryId && view.categoryId !== NO_CATEGORY && !categories.some(c => c.id === view.categoryId)
    ? { ...view, categoryId: null } : view
  const groups = useMemo(() => buildBoard(items, categories, filters), [items, categories, filters])
  const team = profiles.filter(p => p.active && (p.role === 'admin' || p.role === 'employee') && (!ownOnly || p.id === me?.id))
  const open = items.filter(t => !t.done)
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 }
    for (const t of items) {
      if (!visible(t, view)) continue
      const k = t.category_id && categories.some(x => x.id === t.category_id) ? t.category_id : NO_CATEGORY
      c[k] = (c[k] ?? 0) + 1
      c.all++
    }
    return c
  }, [items, categories, view])

  const setFilters = (patch: Partial<TodoFilters>) => {
    const next = { ...filters, ...patch }
    setView(next)
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
  }

  /** Change a job on screen straight away, then save it; put it back if the save fails. Its column and tick stay in step. */
  const change = async (id: string, asked: TodoPatch) => {
    const job = items.find(t => t.id === id)
    const patch = job ? inStep(job, asked) : asked
    setItems(list => list.map(t => (t.id === id ? { ...t, ...patch } : t)))
    try { await api.updateTodo(id, patch) } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
      await data.reload()
    }
  }
  const add = async (title: string, categoryId: string | null, more: { assignee_id?: string | null; position?: number } = {}) => {
    try {
      const created = await api.addTodo({ title, category_id: categoryId, position: more.position ?? topPosition(items),
        assignee_id: more.assignee_id ?? (ownOnly ? me?.id ?? null : null) })
      setItems(list => [...list, created])
      return true
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
      return false
    }
  }
  const remove = async (job: Todo) => {
    setItems(list => list.filter(x => x.id !== job.id))
    try {
      await api.deleteTodo(job.id)
      setUndo(job)
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
      await data.reload()
    }
  }
  const restore = async () => {
    const job = undo
    setUndo(null)
    if (!job) return
    try {
      const back = await api.addTodo({ title: job.title, category_id: job.category_id, position: job.position, assignee_id: job.assignee_id })
      const rest = { section: job.section, assignee_id: job.assignee_id, done: job.done, status: job.status, starred: job.starred, pinned: job.pinned }
      await api.updateTodo(back.id, rest)
      setItems(list => [...list, { ...back, ...rest }])
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }
  // Category groups folded away on the list, remembered on this device.
  const [folded, setFolded] = useState<string[]>(readFolded)
  const fold = (key: string) => {
    const next = folded.includes(key) ? folded.filter(k => k !== key) : [...folded, key]
    setFolded(next)
    try { localStorage.setItem(FOLDED_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const order = flatten(groups)
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const move = resolveMove(order, categories, String(active.id), String(over.id))
    if (move) void change(String(active.id), move)
  }

  const done = items.length - open.length
  return (
    <>
      <PageHeader eyebrow={t('Business')} title={t('To Do List')}
        actions={<>
          <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, m: Mode | null) => chooseMode(m)} aria-label={t('Show as')}>
            <ToggleButton value="list" aria-label={t('List')} sx={{ gap: 0.75, px: 1.5, textTransform: 'none' }}><ListViewIcon fontSize="small" />{t('List')}</ToggleButton>
            <ToggleButton value="board" aria-label={t('Board')} sx={{ gap: 0.75, px: 1.5, textTransform: 'none' }}><BoardViewIcon fontSize="small" />{t('Board')}</ToggleButton>
          </ToggleButtonGroup>
          {/* The list's own filters, at the top right next to how it's shown. */}
          {mode === 'list' && <>
            <Chip icon={<StarIcon sx={{ fontSize: 18, color: `${STAR} !important` }} />} label={t('Starred')} variant={filters.starredOnly ? 'filled' : 'outlined'}
              onClick={() => setFilters({ starredOnly: !filters.starredOnly })} aria-pressed={filters.starredOnly} sx={{ height: 36, borderRadius: 999 }} />
            <FormControlLabel sx={{ mx: 0.5, '& .MuiFormControlLabel-label': { fontSize: '0.9rem', fontWeight: 500 } }} label={t('Show done')}
              control={<Switch size="small" checked={filters.showDone} onChange={e => setFilters({ showDone: e.target.checked })} />} />
          </>}
          {managesLists && (
            <Button variant={managing ? 'contained' : 'outlined'} startIcon={<TuneIcon />} onClick={() => setManaging(m => !m)}
              aria-pressed={managing}>
              {t('Categories')}
            </Button>
          )}
        </>} />
      <ErrorBox error={data.error} />

      {/* At a glance, on one line. */}
      <Stack direction="row" role="list" aria-label={t('At a glance')} useFlexGap sx={{ gap: { xs: 2, sm: 3.5 }, flexWrap: 'wrap', alignItems: 'baseline', mb: 2.5 }}>
        {[
          { label: t('open'), value: open.length, colour: tokens.ink },
          { label: t('done'), value: done, colour: tokens.matchaDeep },
          { label: t('starred'), value: open.filter(x => x.starred).length, colour: STAR },
        ].map(x => (
          <Typography key={x.label} role="listitem" sx={{ color: 'text.secondary' }}>
            <Box component="span" sx={{ fontFamily: fonts.display, fontSize: '1.6rem', color: x.colour, mr: 0.75, fontVariantNumeric: 'tabular-nums' }}>
              {data.data ? x.value : '–'}
            </Box>
            {x.label}
          </Typography>
        ))}
        {items.length > 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('· {pct}% done', { pct: Math.round(done / items.length * 100) })}</Typography>}
      </Stack>

      <Stack spacing={2.5}>
        {managing && managesLists && (
          <CategoryManager categories={categories} items={items}
            onSave={c => run(() => api.saveTodoCategory(c))}
            onDelete={c => run(() => api.deleteTodoCategory(c.id), t('Removed {name}', { name: c.name }))} />
        )}

        {mode === 'board' ? (
          <TodoBoard items={items} categories={categories} team={team} meId={me?.id ?? null} isAdmin={isAdmin}
            onChange={(id, p) => void change(id, p)} onDelete={job => void remove(job)}
            onAdd={j => add(j.title, j.category_id, { assignee_id: j.assignee_id, position: j.position })} />
        ) : <>
          <Card component="section" aria-label={t('Add a job')}>
            <CardContent>
              <AddJob categories={categories} filter={filters.categoryId} onAdd={add} />
              <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75, mt: 2 }} role="group" aria-label={t('Filter by category')}>
                <FilterChip label={t('All')} count={counts.all ?? 0} selected={!filters.categoryId} onClick={() => setFilters({ categoryId: null })} />
                {categories.map(c => (
                  <FilterChip key={c.id} label={c.name} colour={c.colour} count={counts[c.id] ?? 0} selected={filters.categoryId === c.id}
                    onClick={() => setFilters({ categoryId: filters.categoryId === c.id ? null : c.id })} />
                ))}
                {(counts[NO_CATEGORY] ?? 0) > 0 && (
                  <FilterChip label={t('No category')} count={counts[NO_CATEGORY]} selected={filters.categoryId === NO_CATEGORY}
                    onClick={() => setFilters({ categoryId: filters.categoryId === NO_CATEGORY ? null : NO_CATEGORY })} />
                )}
              </Stack>
            </CardContent>
          </Card>

          {data.data && groups.length === 0 && (
            <Card><CardContent>
              <Empty>{filters.starredOnly ? t('Nothing starred. Star a job to see it here.')
                : filters.categoryId ? t('Nothing in this category. Switch back to All, or add a job above.')
                : t('All clear. Add a job above and it goes to the top.')}</Empty>
            </CardContent></Card>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
            <SortableContext items={order.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {groups.map(g => {
                const shut = folded.includes(g.key)
                return (
                <Card key={g.key} component="section" aria-label={groupLabel(g)}
                  sx={{ bgcolor: wash(g.colour, 7), borderTop: `3px solid ${g.colour}` }}>
                  <CardContent sx={shut ? { pb: '16px !important' } : undefined}>
                    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: shut ? 0 : 1.5 }}>
                      {/* Fold the category away (its jobs stay; the count still shows). */}
                      <Tooltip title={shut ? t('Show {name}', { name: groupLabel(g) }) : t('Minimise {name}', { name: groupLabel(g) })}>
                        <IconButton size="small" onClick={() => fold(g.key)} aria-expanded={!shut} aria-controls={`todo-group-${g.key}`}
                          aria-label={shut ? t('Show {name}', { name: groupLabel(g) }) : t('Minimise {name}', { name: groupLabel(g) })}
                          sx={{ ml: -0.75, color: tokens.inkSoft }}>
                          <ExpandIcon sx={{ transition: 'transform .2s', transform: shut ? 'rotate(-90deg)' : 'none' }} />
                        </IconButton>
                      </Tooltip>
                      <Typography variant="h6" component="h2" sx={{ ml: '4px !important' }}>{groupLabel(g)}</Typography>
                      <Box component="span" sx={{ fontSize: 13, fontWeight: 600, px: 1, borderRadius: 999, bgcolor: wash(g.colour, 22), color: 'text.primary' }}>
                        {g.count}
                      </Box>
                      {g.hint && <Typography variant="body2" sx={{ ml: 'auto !important', color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}>{g.key === NO_CATEGORY ? t(g.hint) : g.hint}</Typography>}
                    </Stack>
                    <Collapse in={!shut} id={`todo-group-${g.key}`} unmountOnExit>
                    {g.sections.map(s => (
                      <Fragment key={s.key}>
                        {s.label && <Typography variant="overline" component="h3" sx={{ display: 'block', color: 'text.secondary', mt: 1.5, mb: 0.5 }}>{s.label}</Typography>}
                        {s.items.map(job => (
                          <JobRow key={job.id} todo={job} colour={g.colour} categories={categories} team={team}
                            onChange={p => change(job.id, p)} onDelete={() => remove(job)} />
                        ))}
                      </Fragment>
                    ))}
                    </Collapse>
                  </CardContent>
                </Card>
                )
              })}
            </SortableContext>
          </DndContext>
        </>}
      </Stack>

      <Snackbar open={!!undo} autoHideDuration={6000} onClose={() => setUndo(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="info" variant="filled" onClose={() => setUndo(null)}
          action={<Button color="inherit" size="small" onClick={restore}>{t('Undo')}</Button>}>
          {t('Deleted “{title}”', { title: undo?.title ?? '' })}
        </Alert>
      </Snackbar>
    </>
  )
}

/** A category's name; the catch-all group's is ours to translate (the others are the business's own). */
const groupLabel = (g: { key: string; label: string }) => (g.key === NO_CATEGORY ? t(g.label) : g.label)

function FilterChip({ label, count, selected, onClick, colour }: { label: string; count: number; selected: boolean; onClick: () => void; colour?: string }) {
  return (
    <Chip clickable onClick={onClick} aria-pressed={selected}
      label={<>{label} <Box component="span" sx={{ opacity: 0.7, ml: 0.5 }}>{count}</Box></>}
      icon={colour ? <Box component="span" sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: selected ? '#fff' : colour, ml: '10px !important' }} /> : undefined}
      sx={{
        fontWeight: 500, opacity: count === 0 && !selected ? 0.6 : 1,
        bgcolor: selected ? (colour ?? tokens.ink) : colour ? wash(colour, 12) : 'transparent',
        color: selected ? '#fff' : 'text.primary',
        border: 1, borderColor: selected ? 'transparent' : colour ? wash(colour, 35) : 'divider',
        '&:hover': { bgcolor: selected ? (colour ?? tokens.ink) : colour ? wash(colour, 20) : tokens.hover },
      }} />
  )
}

/** The compose line: what the job is and its category. Follows the category filter. */
function AddJob({ categories, filter, onAdd }: { categories: TodoCategory[]; filter: string | null; onAdd: (title: string, categoryId: string | null) => Promise<boolean> }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (filter && filter !== NO_CATEGORY) setCategory(filter) }, [filter])
  const chosen = categories.some(c => c.id === category) ? category : categories[0]?.id ?? ''
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || saving) return
    setSaving(true)
    // Keep the category: jobs tend to come in runs.
    if (await onAdd(title.trim(), chosen || null)) setTitle('')
    setSaving(false)
  }
  return (
    <Box component="form" onSubmit={submit} autoComplete="off" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      <TextField value={title} onChange={e => setTitle(e.target.value)} placeholder={t('Add a job…')} size="small" sx={{ flex: '1 1 240px' }}
        slotProps={{ htmlInput: { 'aria-label': t('New job'), maxLength: 500 } }} />
      <TextField select size="small" value={chosen} onChange={e => setCategory(e.target.value)} sx={{ flex: '0 1 200px', minWidth: 150 }}
        slotProps={{ select: { native: true }, htmlInput: { 'aria-label': t('Category for the new job') } }}>
        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        {categories.length === 0 && <option value="">{t('No category')}</option>}
      </TextField>
      <Button type="submit" variant="contained" startIcon={<AddIcon />} disabled={!title.trim() || saving}>{t('Add')}</Button>
    </Box>
  )
}

function JobRow({ todo: job, colour, categories, team, onChange, onDelete }: {
  todo: Todo; colour: string; categories: TodoCategory[]; team: Profile[]
  onChange: (p: TodoPatch) => void; onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: job.id })
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(job.title)
  const [section, setSection] = useState(job.section ?? '')
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const person = team.find(p => p.id === job.assignee_id)
  const startEdit = () => { setTitle(job.title); setSection(job.section ?? ''); setEditing(true) }
  const save = () => {
    if (!title.trim()) return
    onChange({ title: title.trim(), section: section.trim() || null })
    setEditing(false)
  }
  const quiet = { p: 0.5, color: tokens.inkFaint }

  return (
    <Box ref={setNodeRef} data-testid="todo-row" aria-label={job.title}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{
        position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1, py: 1.25, pr: 1.25, pl: 0.5,
        bgcolor: 'background.paper', borderRadius: '12px', border: 1, borderColor: job.pinned ? PIN : 'divider',
        outline: job.pinned ? `1px solid ${PIN}` : 'none', opacity: isDragging ? 0.9 : job.done ? 0.55 : 1,
        boxShadow: isDragging ? `0 10px 26px -12px ${tokens.shadow}` : 'none', zIndex: isDragging ? 2 : 'auto',
        '&::before': { content: '""', position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: '0 3px 3px 0', bgcolor: colour },
      }}>
      <IconButton size="small" {...attributes} {...listeners} aria-label={t('Drag to reorder')}
        sx={{ ...quiet, cursor: 'grab', touchAction: 'none', ml: 0.25, mt: 0.25 }}>
        <DragIcon fontSize="small" />
      </IconButton>
      <Checkbox checked={job.done} onChange={e => onChange({ done: e.target.checked })} icon={<OpenIcon />} checkedIcon={<DoneIcon />}
        color="success" sx={{ p: 0.5 }} slotProps={{ input: { 'aria-label': job.done ? t('Mark as not done') : t('Mark as done') } }} />

      {editing ? (
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField value={title} onChange={e => setTitle(e.target.value)} size="small" fullWidth autoFocus
            slotProps={{ htmlInput: { 'aria-label': t('Job'), maxLength: 500 } }}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }} />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TextField value={section} onChange={e => setSection(e.target.value)} size="small" placeholder={t('Sub-heading (optional)')} sx={{ flex: 1 }}
              slotProps={{ htmlInput: { 'aria-label': t('Sub-heading'), maxLength: 100 } }}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }} />
            <IconButton size="small" onClick={save} aria-label={t('Save')}><CheckIcon fontSize="small" /></IconButton>
            <IconButton size="small" onClick={() => setEditing(false)} aria-label={t('Cancel')}><CloseIcon fontSize="small" /></IconButton>
          </Stack>
        </Box>
      ) : (
        <Box sx={{ flex: 1, minWidth: 0 }} onDoubleClick={startEdit}>
          <Typography sx={{ lineHeight: 1.45, pt: 0.5, wordBreak: 'break-word', textDecoration: job.done ? 'line-through' : 'none' }}>{job.title}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
            <Box component="select" value={job.category_id ?? ''} aria-label={t('Change category')}
              onChange={e => onChange({ category_id: (e.target as HTMLSelectElement).value || null })}
              sx={{ font: 'inherit', fontSize: 12.5, color: 'text.primary', bgcolor: wash(colour, 14), border: 1, borderColor: wash(colour, 35),
                borderRadius: 999, px: 1.25, py: 0.4, cursor: 'pointer', maxWidth: 180 }}>
              {!categories.some(c => c.id === job.category_id) && <option value="">{t('No category')}</option>}
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Box>
            {job.section && (
              <Box component="span" sx={{ fontSize: 12.5, px: 1.25, py: 0.4, borderRadius: 999, border: 1, borderColor: 'divider', color: 'text.secondary' }}>
                {job.section}
              </Box>
            )}
            {job.status === 'doing' && (
              <Box component="span" sx={{ fontSize: 12.5, fontWeight: 600, px: 1.25, py: 0.4, borderRadius: 999, bgcolor: wash(STAR, 18), color: 'text.primary' }}>
                {t('Doing')}
              </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto' }}>
              <Tooltip title={person ? t('{name} (change)', { name: person.full_name }) : t('Assign to someone')}>
                <IconButton size="small" onClick={e => setMenu(e.currentTarget)} sx={quiet}
                  aria-label={person ? t('Assigned to {name}', { name: person.full_name }) : t('Assign to someone')}>
                  {person ? <PersonAvatar name={person.full_name} colour={person.colour} size={24} /> : <PersonAddIcon sx={{ fontSize: 19 }} />}
                </IconButton>
              </Tooltip>
              <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
                <MenuItem selected={!job.assignee_id} onClick={() => { onChange({ assignee_id: null }); setMenu(null) }}>{t('Nobody')}</MenuItem>
                {team.map(p => (
                  <MenuItem key={p.id} selected={p.id === job.assignee_id} onClick={() => { onChange({ assignee_id: p.id }); setMenu(null) }}>
                    <ListItemIcon><PersonAvatar name={p.full_name} colour={p.colour} size={24} /></ListItemIcon>
                    {p.full_name}
                  </MenuItem>
                ))}
              </Menu>
              <Tooltip title={job.starred ? t('Remove star') : t('Star')}>
                <IconButton size="small" onClick={() => onChange({ starred: !job.starred })} aria-label={t('Star')} aria-pressed={job.starred}
                  sx={{ ...quiet, color: job.starred ? STAR : tokens.inkFaint }}>
                  {job.starred ? <StarIcon sx={{ fontSize: 20 }} /> : <StarOutlineIcon sx={{ fontSize: 20 }} />}
                </IconButton>
              </Tooltip>
              <Tooltip title={job.pinned ? t('Unpin') : t('Pin to the top')}>
                <IconButton size="small" onClick={() => onChange({ pinned: !job.pinned })} aria-label={t('Pin')} aria-pressed={job.pinned}
                  sx={{ ...quiet, color: job.pinned ? PIN : tokens.inkFaint }}>
                  {job.pinned ? <PinIcon sx={{ fontSize: 18 }} /> : <PinOutlineIcon sx={{ fontSize: 18 }} />}
                </IconButton>
              </Tooltip>
              <Tooltip title={t('Rename')}>
                <IconButton size="small" onClick={startEdit} aria-label={t('Rename')} sx={quiet}><EditIcon sx={{ fontSize: 18 }} /></IconButton>
              </Tooltip>
              <Tooltip title={t('Delete')}>
                <IconButton size="small" onClick={onDelete} aria-label={t('Delete')} sx={{ ...quiet, '&:hover': { color: tokens.danger } }}>
                  <DeleteIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}

const COLOURS = ['#2F4C73', '#21907F', '#D46A2E', '#C2961C', '#4F8A3F', '#4B4FB0', '#7C52AE', '#2479A8', '#B23C78', '#6E7D1A', '#B3404F', '#8A7E76']

/** Admins: rename, recolour, add and remove categories, right on the page. */
function CategoryManager({ categories, items, onSave, onDelete }: {
  categories: TodoCategory[]; items: Todo[]
  onSave: (c: Partial<TodoCategory> & { name: string }) => Promise<boolean>; onDelete: (c: TodoCategory) => Promise<boolean>
}) {
  const [name, setName] = useState('')
  const used = new Set(categories.map(c => c.colour.toUpperCase()))
  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const colour = COLOURS.find(c => !used.has(c)) ?? COLOURS[categories.length % COLOURS.length]
    if (await onSave({ name: name.trim(), colour, sort: Math.max(0, ...categories.map(c => c.sort)) + 1 })) setName('')
  }
  return (
    <Card component="section" aria-label={t('Categories')}>
      <CardContent>
        <SectionTitle>{t('Categories')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {t('Jobs are grouped by these. Changes save as you go. Removing a category keeps its jobs; they move to “No category”.')}
        </Typography>
        <Stack spacing={1}>
          {categories.map(c => (
            <CategoryRow key={`${c.id}:${c.name}:${c.hint}:${c.colour}`} category={c} jobs={items.filter(x => x.category_id === c.id).length}
              onSave={onSave} onDelete={() => onDelete(c)} />
          ))}
        </Stack>
        <Box component="form" onSubmit={add} sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
          <TextField value={name} onChange={e => setName(e.target.value)} size="small" placeholder={t('New category, e.g. Kitchen')}
            sx={{ flex: '1 1 220px' }} slotProps={{ htmlInput: { 'aria-label': t('New category'), maxLength: 40 } }} />
          <Button type="submit" variant="outlined" startIcon={<AddIcon />} disabled={!name.trim()}>{t('Add category')}</Button>
        </Box>
      </CardContent>
    </Card>
  )
}

function CategoryRow({ category: c, jobs, onSave, onDelete }: {
  category: TodoCategory; jobs: number
  onSave: (c: Partial<TodoCategory> & { name: string }) => Promise<boolean>; onDelete: () => Promise<boolean>
}) {
  const [name, setName] = useState(c.name)
  const [hint, setHint] = useState(c.hint ?? '')
  const [confirm, setConfirm] = useState(false)
  const commit = () => {
    if (!name.trim()) { setName(c.name); return }
    if (name.trim() !== c.name || (hint.trim() || null) !== c.hint) void onSave({ id: c.id, name, hint })
  }
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', p: 1, borderRadius: '10px', bgcolor: wash(c.colour, 8) }}
      aria-label={t('Category {name}', { name: c.name })} role="group">
      <TextField select size="small" value={c.colour.toUpperCase()} onChange={e => void onSave({ id: c.id, name: c.name, colour: e.target.value })}
        sx={{ width: 74 }} slotProps={{
          select: { renderValue: v => <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: String(v) }} /> },
          htmlInput: { 'aria-label': t('Colour for {name}', { name: c.name }) },
        }}>
        {[...new Set([c.colour.toUpperCase(), ...COLOURS])].map(col => (
          <MenuItem key={col} value={col}><Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: col }} /></MenuItem>
        ))}
      </TextField>
      <TextField size="small" value={name} onChange={e => setName(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        sx={{ flex: '1 1 160px' }} slotProps={{ htmlInput: { 'aria-label': t('Name'), maxLength: 40 } }} />
      <TextField size="small" value={hint} onChange={e => setHint(e.target.value)} onBlur={commit} placeholder={t('What goes here (optional)')}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        sx={{ flex: '2 1 220px' }} slotProps={{ htmlInput: { 'aria-label': t('Description'), maxLength: 80 } }} />
      <Typography variant="body2" sx={{ color: 'text.secondary', minWidth: 54 }}>{tn(jobs, '{n} job', '{n} jobs')}</Typography>
      {confirm ? (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Typography variant="body2">{jobs ? tn(jobs, 'Remove? Its {n} job move to No category.', 'Remove? Its {n} jobs move to No category.') : t('Remove?')}</Typography>
          <Button size="small" color="error" variant="contained" onClick={() => void onDelete()}>{t('Remove')}</Button>
          <Button size="small" onClick={() => setConfirm(false)}>{t('Keep')}</Button>
        </Stack>
      ) : (
        <Tooltip title={t('Remove category')}>
          <IconButton size="small" onClick={() => setConfirm(true)} aria-label={t('Remove {name}', { name: c.name })}><DeleteIcon fontSize="small" /></IconButton>
        </Tooltip>
      )}
    </Box>
  )
}
