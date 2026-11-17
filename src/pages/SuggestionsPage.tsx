import {
  Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, ListItemIcon, Menu, MenuItem, Stack,
  TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import MoreIcon from '@mui/icons-material/MoreHoriz'
import MoveIcon from '@mui/icons-material/ArrowForward'
import NewSectionIcon from '@mui/icons-material/CreateNewFolderOutlined'
import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader } from '../components/common'
import { KeyboardSensorNow } from '../components/dnd'
import {
  SUGGESTION_LIMITS, USUAL_SOURCES, boardOf, groupProblem, nameFromIdea, suggestionProblem, tidySuggestion,
  type CustomerSuggestion, type SuggestionGroup, type SuggestionInput,
} from '../../shared/suggestions'
import { formatLocal, today } from '../../shared/time'
import { tokens } from '../theme'
import { t, tn, useLanguage } from '../i18n'

const ACCENT = '#C98A1E'
const wash = (colour: string, pct = 10) => `color-mix(in srgb, ${colour} ${pct}%, ${tokens.surface})`
const UNSORTED = 'group:none'
const groupKey = (id: string | null) => (id ? `group:${id}` : UNSORTED)
const ideaKey = (id: string) => `idea:${id}`

/** The innermost place under the pointer (an idea before the section it's in); else what the card overlaps. */
const collisions: CollisionDetection = args => {
  const under = pointerWithin(args)
  return under.length ? under : rectIntersection(args)
}

/**
 * Customer suggestions: the ideas customers give the business, for the team only (they're mostly added
 * through the business's AI assistant). Ideas that say the same thing are dragged into one section, whose
 * counter shows how many times customers asked; an idea dropped on one not sorted yet starts a section with
 * both. On a phone, or from the keyboard, an idea's menu moves it.
 */
export function SuggestionsPage() {
  const { api, isAdmin } = useApp()
  const run = useAction()
  useLanguage()
  const data = useAsync('customer-suggestions', () => api.customerSuggestions(), [])
  // Where ideas were just dropped, shown straight away while the page reloads.
  const [moved, setMoved] = useState<Record<string, string | null>>({})
  const [form, setForm] = useState<SuggestionInput | null>(null)
  const [naming, setNaming] = useState<{ id?: string; name: string; then?: string[] } | null>(null)
  const [dragging, setDragging] = useState<CustomerSuggestion | null>(null)

  const groups = data.data?.groups ?? []
  const ideas = (data.data?.ideas ?? []).map(i => (i.id in moved ? { ...i, group_id: moved[i.id] } : i))
  const board = boardOf(ideas, groups)
  const sorted = board.total - board.unsorted.length

  const move = async (ids: string[], groupId: string | null, done?: string) => {
    setMoved(m => ({ ...m, ...Object.fromEntries(ids.map(id => [id, groupId])) }))
    await run(() => api.moveSuggestions(ids, groupId), done, { fresh: true })
    setMoved(m => Object.fromEntries(Object.entries(m).filter(([id]) => !ids.includes(id))))
  }
  /** A new section, named after an idea; these ideas go in it. */
  const startSection = async (name: string, ids: string[]) => {
    setMoved(m => ({ ...m, ...Object.fromEntries(ids.map(id => [id, 'new'])) }))
    await run(async () => {
      const id = await api.saveSuggestionGroup({ name })
      await api.moveSuggestions(ids, id)
    }, t('New section: {name}', { name }), { fresh: true })
    setMoved(m => Object.fromEntries(Object.entries(m).filter(([id]) => !ids.includes(id))))
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensorNow))
  const onDragStart = ({ active }: DragStartEvent) => setDragging(ideas.find(i => ideaKey(i.id) === active.id) ?? null)
  const onDragEnd = ({ active, collisions: hits }: DragEndEvent) => {
    setDragging(null)
    const idea = ideas.find(i => ideaKey(i.id) === active.id)
    if (!idea || !hits?.length) return
    const ids = hits.map(h => String(h.id))
    const onto = ids.map(id => ideas.find(i => ideaKey(i.id) === id && i.id !== idea.id)).find(Boolean)
    if (onto) {
      // On an idea in a section: into that section. On one not sorted yet: a new section with both.
      if (onto.group_id) { if (onto.group_id !== idea.group_id) void move([idea.id], onto.group_id) }
      else void startSection(nameFromIdea(onto.text), [onto.id, idea.id])
      return
    }
    const place = ids.find(id => id.startsWith('group:'))
    if (!place) return
    const groupId = place === UNSORTED ? null : place.slice('group:'.length)
    if (groupId !== idea.group_id) void move([idea.id], groupId)
  }

  const card = (i: CustomerSuggestion) => (
    <IdeaCard key={i.id} idea={i} groups={groups} isAdmin={isAdmin}
      onMove={g => void move([i.id], g, g ? t('Moved to {name}', { name: groups.find(x => x.id === g)?.name ?? '' }) : t('Moved to Not sorted yet'))}
      onNewSection={() => setNaming({ name: nameFromIdea(i.text), then: [i.id] })}
      onEdit={() => setForm(i)}
      onDelete={() => void run(() => api.deleteSuggestion(i.id), t('Deleted'))} />
  )

  return (
    <>
      <PageHeader eyebrow={t('Sales')} title={t('Customer suggestions')} actions={<>
        <Button startIcon={<NewSectionIcon />} onClick={() => setNaming({ name: '' })}>{t('New section')}</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ text: '', heard_on: today() })}>{t('Add a suggestion')}</Button>
      </>} />
      <ErrorBox error={data.error} />
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: 760 }}>
        {t('Ideas customers give us, for the team only. Add them here or through your AI assistant (“a customer suggested…”). Drag ideas that say the same thing into one section: its counter shows how many times customers asked.')}
      </Typography>

      {data.data && !board.total && !groups.length ? (
        <Empty>{t('No suggestions yet. Tell your AI assistant what customers suggest, or add one here.')}</Empty>
      ) : data.data && (
        <DndContext sensors={sensors} collisionDetection={collisions} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <Typography variant="body2" aria-live="polite" sx={{ mb: 1.5, fontWeight: 500 }}>
            {tn(board.total, '{n} suggestion', '{n} suggestions')}{' · '}
            {tn(board.sections.length, '{n} section', '{n} sections')}{' · '}
            {tn(board.unsorted.length, '{n} not sorted yet', '{n} not sorted yet')}
          </Typography>

          <Place id={null} label={t('Not sorted yet')} count={board.unsorted.length} tone={tokens.inkFaint}
            hint={sorted || board.unsorted.length ? t('Drop an idea on another to start a section with both.') : undefined}>
            {board.unsorted.length ? (
              <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
                {board.unsorted.map(card)}
              </Box>
            ) : (
              <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>{t('Every idea is sorted.')}</Typography>
            )}
          </Place>

          <Box role="list" aria-label={t('Sections')}
            sx={{ display: 'grid', gap: 1.5, mt: 1.5, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' } }}>
            {board.sections.map(s => (
              <Box role="listitem" key={s.group.id} aria-label={s.group.name}>
                <Place id={s.group.id} label={s.group.name} count={s.ideas.length} tone={ACCENT} counter
                  menu={<SectionMenu group={s.group} onRename={() => setNaming({ id: s.group.id, name: s.group.name })}
                    onRemove={() => void run(() => api.deleteSuggestionGroup(s.group.id), t('Removed {name}: its ideas are back in Not sorted yet', { name: s.group.name }))} />}>
                  <Stack spacing={1}>{s.ideas.map(card)}</Stack>
                  {!s.ideas.length && (
                    <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>{t('Drag ideas here')}</Typography>
                  )}
                </Place>
              </Box>
            ))}
          </Box>
          <DragOverlay>{dragging ? <IdeaFace idea={dragging} lifted /> : null}</DragOverlay>
        </DndContext>
      )}

      {form && <IdeaDialog idea={form} groups={groups} onClose={() => setForm(null)} />}
      {naming && (
        <SectionDialog section={naming} onClose={() => setNaming(null)}
          save={async name => {
            if (naming.id) return run(() => api.saveSuggestionGroup({ id: naming.id, name }), t('Saved'))
            if (naming.then) { await startSection(name, naming.then); return true }
            return run(() => api.saveSuggestionGroup({ name }), t('New section: {name}', { name }))
          }} />
      )}
    </>
  )
}

/** Not sorted yet, or a section: a place ideas are dropped, with its counter. */
function Place({ id, label, count, tone, counter, hint, menu, children }: {
  id: string | null; label: string; count: number; tone: string; counter?: boolean; hint?: string; menu?: ReactNode; children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: groupKey(id) })
  return (
    <Box component="section" ref={setNodeRef} aria-label={label}
      sx={{ bgcolor: isOver ? wash(tone, 14) : tokens.surfaceAlt, borderRadius: '14px', p: 1.25, border: 1, borderColor: isOver ? tone : 'divider',
        borderTop: `3px solid ${tone}`, transition: 'background-color 120ms' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 0.5, mb: 1 }}>
        {counter && (
          <Tooltip title={tn(count, 'Asked {n} time', 'Asked {n} times')}>
            <Box aria-label={tn(count, 'Asked {n} time', 'Asked {n} times')} data-testid="counter"
              sx={{ flex: 'none', minWidth: 36, height: 36, px: 0.75, borderRadius: '10px', display: 'grid', placeItems: 'center',
                fontWeight: 700, fontSize: 18, color: '#fff', bgcolor: tone }}>
              {count}
            </Box>
          </Tooltip>
        )}
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, flex: 1, minWidth: 0, wordBreak: 'break-word', lineHeight: 1.3 }}>
          {label}
          {!counter && <Box component="span" sx={{ ml: 1, fontSize: 13, fontWeight: 600, px: 1, borderRadius: 999, bgcolor: wash(tone, 22) }}>{count}</Box>}
        </Typography>
        {menu}
      </Stack>
      {hint && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', px: 0.5, mt: -0.5, mb: 1 }}>{hint}</Typography>}
      {children}
    </Box>
  )
}

function SectionMenu({ group, onRename, onRemove }: { group: SuggestionGroup; onRename: () => void; onRemove: () => void }) {
  const [at, setAt] = useState<HTMLElement | null>(null)
  return (
    <>
      <IconButton size="small" onClick={e => setAt(e.currentTarget)} aria-label={t('Options for the {name} section', { name: group.name })} sx={{ color: tokens.inkFaint }}>
        <MoreIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={at} open={!!at} onClose={() => setAt(null)}>
        <MenuItem onClick={() => { setAt(null); onRename() }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>{t('Rename')}
        </MenuItem>
        <MenuItem onClick={() => { setAt(null); onRemove() }} sx={{ color: tokens.danger }}>
          <ListItemIcon><DeleteIcon fontSize="small" sx={{ color: tokens.danger }} /></ListItemIcon>{t('Remove the section')}
        </MenuItem>
      </Menu>
    </>
  )
}

/** An idea where it sits: dragged by its words, dropped on (to group with it), or moved from its menu. */
function IdeaCard({ idea, groups, isAdmin, onMove, onNewSection, onEdit, onDelete }: {
  idea: CustomerSuggestion; groups: SuggestionGroup[]; isAdmin: boolean
  onMove: (groupId: string | null) => void; onNewSection: () => void; onEdit: () => void; onDelete: () => void
}) {
  const drag = useDraggable({ id: ideaKey(idea.id) })
  const drop = useDroppable({ id: ideaKey(idea.id) })
  const [at, setAt] = useState<HTMLElement | null>(null)
  const targetOf = drop.isOver && !drag.isDragging
  const others = groups.filter(g => g.id !== idea.group_id).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <Box ref={(el: HTMLElement | null) => { drag.setNodeRef(el); drop.setNodeRef(el) }}
      sx={{ opacity: drag.isDragging ? 0.35 : 1, position: 'relative', borderRadius: '12px', outline: targetOf ? `2px dashed ${ACCENT}` : 'none', outlineOffset: 2 }}>
      <IdeaFace idea={idea} handle={{ ...drag.attributes, ...drag.listeners }} />
      <IconButton size="small" onClick={e => setAt(e.currentTarget)} aria-label={t('More for {text}', { text: idea.text })}
        sx={{ position: 'absolute', top: 6, right: 6, p: 0.5, color: tokens.inkFaint }}>
        <MoreIcon sx={{ fontSize: 18 }} />
      </IconButton>
      <Menu anchorEl={at} open={!!at} onClose={() => setAt(null)}>
        {others.map(g => (
          <MenuItem key={g.id} onClick={() => { setAt(null); onMove(g.id) }}>
            <ListItemIcon><MoveIcon fontSize="small" /></ListItemIcon>{t('Move to {name}', { name: g.name })}
          </MenuItem>
        ))}
        {idea.group_id && (
          <MenuItem onClick={() => { setAt(null); onMove(null) }}>
            <ListItemIcon><MoveIcon fontSize="small" /></ListItemIcon>{t('Move to Not sorted yet')}
          </MenuItem>
        )}
        <MenuItem onClick={() => { setAt(null); onNewSection() }}>
          <ListItemIcon><NewSectionIcon fontSize="small" /></ListItemIcon>{t('Start a new section with it')}
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { setAt(null); onEdit() }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>{t('Edit')}
        </MenuItem>
        {isAdmin && (
          <MenuItem onClick={() => { setAt(null); onDelete() }} sx={{ color: tokens.danger }}>
            <ListItemIcon><DeleteIcon fontSize="small" sx={{ color: tokens.danger }} /></ListItemIcon>{t('Delete')}
          </MenuItem>
        )}
      </Menu>
    </Box>
  )
}

function IdeaFace({ idea, handle, lifted }: { idea: CustomerSuggestion; handle?: Record<string, unknown>; lifted?: boolean }) {
  const about = [idea.customer, idea.source, formatLocal(`${idea.heard_on}T12:00:00`, 'd MMM')].filter(Boolean).join(' · ')
  return (
    <Box component="article" aria-label={idea.text} data-testid="suggestion"
      sx={{ bgcolor: 'background.paper', borderRadius: '12px', border: 1, borderColor: 'divider', p: 1.25, pr: 4.5,
        boxShadow: lifted ? `0 14px 30px -14px ${tokens.shadow}` : 'none', cursor: handle ? 'grab' : 'grabbing' }}>
      <Box {...handle} role={handle ? 'button' : undefined} aria-label={handle ? t('Drag {text}', { text: idea.text }) : undefined}
        sx={{ touchAction: 'none', outline: 'none', '&:focus-visible': { boxShadow: `0 0 0 2px ${tokens.ink}`, borderRadius: '6px' } }}>
        <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.45, wordBreak: 'break-word' }}>{idea.text}</Typography>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>{about}</Typography>
      </Box>
    </Box>
  )
}

/** Add an idea, or change one. */
function IdeaDialog({ idea, groups, onClose }: { idea: SuggestionInput; groups: SuggestionGroup[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [s, setS] = useState<SuggestionInput>({ ...idea, source: idea.source && USUAL_SOURCES.includes(idea.source) ? t(idea.source) : idea.source })
  const set = (p: Partial<SuggestionInput>) => setS(x => ({ ...x, ...p }))
  const save = async () => {
    const ok = await run(async () => {
      // A usual source typed in the person's language is kept by its English name.
      const typed = (s.source ?? '').trim()
      const source = USUAL_SOURCES.find(x => x.toLowerCase() === typed.toLowerCase() || t(x).toLowerCase() === typed.toLowerCase()) ?? typed
      const next = tidySuggestion({ ...s, source })
      const problem = suggestionProblem(next)
      if (problem) throw new Error(t(problem))
      const { id, text, customer, source: from, heard_on, group_id } = next
      await api.saveSuggestion({ id, text, customer, source: from, heard_on, group_id: group_id ?? null })
    }, idea.id ? t('Saved') : t('Added'))
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone} aria-labelledby="suggestion-dialog-title">
      <DialogTitle id="suggestion-dialog-title">{idea.id ? t('Edit the suggestion') : t('Add a suggestion')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('The idea')} value={s.text ?? ''} onChange={e => set({ text: e.target.value })} autoFocus={!idea.id} multiline minRows={2}
            placeholder={t('e.g. Oat milk at no extra cost')} slotProps={{ htmlInput: { maxLength: SUGGESTION_LIMITS.text } }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label={t('Who suggested it')} value={s.customer ?? ''} onChange={e => set({ customer: e.target.value })}
              placeholder={t('e.g. Lucía, a regular')} slotProps={{ htmlInput: { maxLength: SUGGESTION_LIMITS.customer } }} />
            <Autocomplete freeSolo fullWidth options={USUAL_SOURCES.map(x => t(x))} inputValue={s.source ?? ''} onInputChange={(_, v) => set({ source: v })}
              renderInput={p => <TextField {...p} label={t('Where it was heard')} slotProps={{ ...p.slotProps, htmlInput: { ...p.slotProps.htmlInput, maxLength: SUGGESTION_LIMITS.source } }} />} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth type="date" label={t('Heard on')} value={s.heard_on ?? today()} onChange={e => set({ heard_on: e.target.value || today() })}
              slotProps={{ inputLabel: { shrink: true } }} />
            <TextField fullWidth select label={t('Section')} value={s.group_id ?? ''} onChange={e => set({ group_id: e.target.value || null })}
              slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
              <option value="">{t('Not sorted yet')}</option>
              {[...groups].sort((a, b) => a.name.localeCompare(b.name)).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </TextField>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{idea.id ? t('Save') : t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Name a new section, or rename one. */
function SectionDialog({ section, onClose, save }: {
  section: { id?: string; name: string }; onClose: () => void; save: (name: string) => Promise<boolean>
}) {
  const [name, setName] = useState(section.name)
  const [problem, setProblem] = useState<string | null>(null)
  const submit = async () => {
    const p = groupProblem(name)
    if (p) { setProblem(t(p)); return }
    if (await save(name.trim())) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="section-dialog-title">
      <DialogTitle id="section-dialog-title">{section.id ? t('Rename the section') : t('New section')}</DialogTitle>
      <DialogContent>
        <Box component="form" onSubmit={e => { e.preventDefault(); void submit() }} sx={{ pt: 1 }}>
          <TextField fullWidth autoFocus label={t('Section name')} value={name} onChange={e => { setName(e.target.value); setProblem(null) }}
            error={!!problem} helperText={problem ?? t('What these ideas have in common, e.g. Open earlier on weekdays')}
            slotProps={{ htmlInput: { maxLength: SUGGESTION_LIMITS.group } }} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void submit()}>{section.id ? t('Save') : t('Create')}</Button>
      </DialogActions>
    </Dialog>
  )
}
