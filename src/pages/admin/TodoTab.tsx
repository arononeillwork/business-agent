import {
  Box, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Link, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import DragIcon from '@mui/icons-material/DragIndicator'
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useState, type ReactNode } from 'react'
import { restrictToVerticalAxis } from '../../components/dnd'
import { useApp } from '../../app/AppContext'
import { useAction } from '../../app/Notify'
import { ErrorBox, Loading, Tag } from '../../components/common'
import { formatLocal, today } from '../../../shared/time'
import { TODO_GROUPS, groupTodos, reorderTodos, type AdminTodo, type TodoCategory, type TodoGroup, type TodoInput } from '../../../shared/adminArea'
import type { Prospect } from '../../../shared/salesTeam'
import { ContactDialog } from './ContactDialog'
import { ProspectDialog } from './SalesTab'
import { useAdmin, useAdminQuery } from './shared'
import { tokens } from '../../theme'
import { t } from '../../i18n'

const day = (d: string) => formatLocal(`${d}T12:00:00Z`, 'EEE d MMM')

/**
 * To-do: your own list for running The Business Agent (HQ's To-do list: signed in as The Business Agent HQ,
 * the app's To-do page shows the same jobs). Each job can have a day, a category and a contact it's
 * about; they're grouped by when: gone by, today, coming up, whenever, and done in the last two weeks.
 * Within each group (but done) they're dragged into order, by the handle or with the keyboard; the order
 * is the To-do page's own (todos.position), and a new job goes at the top.
 */
export function TodoTab() {
  const { api } = useApp()
  const { token } = useAdmin()
  const run = useAction()
  const list = useAdminQuery('todos', tk => api.adminTodos(tk))
  const board = useAdminQuery('sales', tk => api.salesBoard(tk))
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState('')
  const [editing, setEditing] = useState<AdminTodo | null>(null)
  const [opened, setOpened] = useState<Prospect | null>(null)
  const [editingContact, setEditingContact] = useState<Prospect | null>(null)
  // Where jobs were just dragged to, shown until the list comes back with it saved.
  const [placed, setPlaced] = useState<Record<string, number>>({})
  useEffect(() => setPlaced({}), [list.data])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const now = today('Europe/Madrid')
  if (!list.data) return list.error ? <ErrorBox error={list.error} /> : <Loading />
  const groups = groupTodos(list.data.todos.map(x => (x.id in placed ? { ...x, position: placed[x.id] } : x)), now)
  const prospects = board.data?.prospects ?? []
  const add = async () => {
    if (await run(() => api.saveAdminTodo(token, { title, planned_on: when || null }), t('Added: {title}', { title: title.trim() }))) { setTitle(''); setWhen('') }
  }
  // A job dragged within its group: only the jobs whose place changes are saved.
  const reorder = (g: TodoGroup) => ({ active, over }: DragEndEvent) => {
    const jobs = groups[g]
    const from = jobs.findIndex(x => x.id === active.id)
    const to = jobs.findIndex(x => x.id === over?.id)
    const changes = reorderTodos(jobs, from, to)
    if (!changes.length) return
    setPlaced(p => ({ ...p, ...Object.fromEntries(changes.map(c => [c.id, c.position])) }))
    void run(() => Promise.all(changes.map(c => api.saveAdminTodo(token, c)))).then(ok => { if (!ok) setPlaced({}) })
  }
  const toggle = (todo: AdminTodo) => run(() => api.saveAdminTodo(token, { id: todo.id, done: !todo.done }),
    todo.done ? t('Back on the list: {title}', { title: todo.title }) : t('Done: {title}', { title: todo.title }))

  return (
    <Stack spacing={3}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('Your list for running The Business Agent. Signed in as The Business Agent HQ, the To-do page shows the same jobs.')}
      </Typography>
      <Stack component="form" direction={{ xs: 'column', sm: 'row' }} spacing={1.5} onSubmit={e => { e.preventDefault(); if (title.trim()) void add() }}>
        <TextField label={t('A job')} value={title} onChange={e => setTitle(e.target.value)} fullWidth size="small" />
        <TextField label={t('Day')} type="date" value={when} onChange={e => setWhen(e.target.value)} size="small" slotProps={{ inputLabel: { shrink: true } }} sx={{ minWidth: 170 }} />
        <Button type="submit" variant="contained" startIcon={<AddIcon />} disabled={!title.trim()} sx={{ flexShrink: 0 }}>{t('Add')}</Button>
      </Stack>
      <ErrorBox error={list.error} />
      {TODO_GROUPS.map(g => groups[g.id].length > 0 && (
        <Box key={g.id} component="section" aria-label={t(g.label)}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mb: 1 }}>
            <Typography variant="h6" component="h2" sx={{ color: g.id === 'overdue' ? tokens.warnFg : undefined }}>{t(g.label)}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{groups[g.id].length}</Typography>
          </Stack>
          <Card variant="outlined">
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Sortable on={g.id !== 'done'} ids={groups[g.id].map(x => x.id)} sensors={sensors} onDragEnd={reorder(g.id)}>
                <Stack role="list" aria-label={t(g.label)} divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
                  {groups[g.id].map(todo => (
                    <Job key={todo.id} todo={todo} category={list.data!.categories.find(c => c.id === todo.category_id)}
                      contact={prospects.find(p => p.id === todo.sales_prospect_id)} showDay={g.id !== 'today'}
                      draggable={g.id !== 'done'}
                      onToggle={() => void toggle(todo)} onEdit={() => setEditing(todo)} onContact={setOpened} />
                  ))}
                </Stack>
              </Sortable>
            </CardContent>
          </Card>
        </Box>
      ))}
      {editing && <JobDialog todo={editing} categories={list.data.categories} prospects={prospects} onClose={() => setEditing(null)} />}
      {opened && board.data && <ContactDialog prospect={opened} team={board.data.team} onClose={() => setOpened(null)}
        onEdit={p => { setOpened(null); setEditingContact(p) }} />}
      {editingContact && board.data && <ProspectDialog start={editingContact} team={board.data.team} onClose={() => setEditingContact(null)} />}
    </Stack>
  )
}

/** A group's jobs, dragged into order (up and down only). */
function Sortable({ on, ids, sensors, onDragEnd, children }: {
  on: boolean; ids: string[]; sensors: ReturnType<typeof useSensors>; onDragEnd: (e: DragEndEvent) => void; children: ReactNode
}) {
  if (!on) return <>{children}</>
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>
    </DndContext>
  )
}

function Job({ draggable, ...props }: JobProps & { draggable: boolean }) {
  return draggable ? <DraggableJob {...props} /> : <JobRow {...props} />
}

function DraggableJob(props: JobProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.todo.id })
  return (
    <Box ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{ position: 'relative', zIndex: isDragging ? 1 : 'auto', bgcolor: 'background.paper', boxShadow: isDragging ? `0 10px 24px -12px ${tokens.shadow}` : 'none' }}>
      <JobRow {...props} handle={
        <IconButton size="small" {...attributes} {...listeners} aria-label={t('Drag {title}', { title: props.todo.title })}
          sx={{ cursor: 'grab', touchAction: 'none', color: tokens.inkFaint, ml: -0.5 }}>
          <DragIcon fontSize="small" />
        </IconButton>
      } />
    </Box>
  )
}

interface JobProps {
  todo: AdminTodo; category?: TodoCategory; contact?: Prospect; showDay: boolean
  onToggle: () => void; onEdit: () => void; onContact: (p: Prospect) => void
}

function JobRow({ todo, category, contact, showDay, onToggle, onEdit, onContact, handle }: JobProps & { handle?: ReactNode }) {
  return (
    <Stack role="listitem" aria-label={todo.title} direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.5, py: 0.75 }}>
      {/* Done ones aren't dragged: the same room, so every checkbox lines up. */}
      {handle ?? <Box aria-hidden sx={{ width: 34, ml: -0.5, flexShrink: 0 }} />}
      <Checkbox checked={todo.done} onChange={onToggle} slotProps={{ input: { 'aria-label': t('Done: {title}', { title: todo.title }) } }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ textDecoration: todo.done ? 'line-through' : 'none', color: todo.done ? 'text.secondary' : 'text.primary' }}>{todo.title}</Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
          {showDay && todo.planned_on && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{day(todo.planned_on)}</Typography>}
          {contact && <Link component="button" variant="caption" onClick={() => onContact(contact)}>{contact.name}</Link>}
          {category && <Tag fg={category.colour} bg={tokens.surfaceAlt}>{category.name}</Tag>}
        </Stack>
      </Box>
      <IconButton size="small" onClick={onEdit} aria-label={t('Edit {name}', { name: todo.title })}><EditIcon fontSize="small" /></IconButton>
    </Stack>
  )
}

/** A job changed: its words, its day, its category, the contact it's about; or deleted. */
function JobDialog({ todo, categories, prospects, onClose }: { todo: AdminTodo; categories: TodoCategory[]; prospects: Prospect[]; onClose: () => void }) {
  const { api } = useApp()
  const { token } = useAdmin()
  const run = useAction()
  const [job, setJob] = useState<TodoInput>({ title: todo.title, planned_on: todo.planned_on, category_id: todo.category_id, sales_prospect_id: todo.sales_prospect_id })
  const save = async () => { if (await run(() => api.saveAdminTodo(token, { id: todo.id, ...job }), t('Saved'))) onClose() }
  const remove = async () => { if (await run(() => api.deleteAdminTodo(token, todo.id), t('Deleted: {title}', { title: todo.title }))) onClose() }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('Edit {name}', { name: todo.title })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('A job')} value={job.title ?? ''} onChange={e => setJob(j => ({ ...j, title: e.target.value }))} autoFocus />
          <TextField label={t('Day')} type="date" value={job.planned_on ?? ''} onChange={e => setJob(j => ({ ...j, planned_on: e.target.value || null }))}
            slotProps={{ inputLabel: { shrink: true } }} />
          <TextField select label={t('Category')} value={job.category_id ?? ''} onChange={e => setJob(j => ({ ...j, category_id: e.target.value || null }))}>
            <MenuItem value="">{t('None')}</MenuItem>
            {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
          <TextField select label={t('About a contact')} value={job.sales_prospect_id ?? ''} onChange={e => setJob(j => ({ ...j, sales_prospect_id: e.target.value || null }))}>
            <MenuItem value="">{t('None')}</MenuItem>
            {[...prospects].sort((a, b) => a.name.localeCompare(b.name)).map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="error" startIcon={<DeleteIcon />} onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Delete')}</Button>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()} disabled={!job.title?.trim()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
