import {
  Alert, Box, Button, Card, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  LinearProgress, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import UpIcon from '@mui/icons-material/ArrowUpward'
import DownIcon from '@mui/icons-material/ArrowDownward'
import DoneIcon from '@mui/icons-material/TaskAltRounded'
import MorningIcon from '@mui/icons-material/WbSunnyOutlined'
import EveningIcon from '@mui/icons-material/NightsStayOutlined'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync, useTick } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Empty, ErrorBox, PageHeader } from '../components/common'
import {
  CHECKLISTS, CHECKLIST_TEXT_MAX, checklistFor, checklistItemProblem, checklistProgress, checklistTree, isChecklistList, itemText,
  type ChecklistItem, type ChecklistItemInput, type ChecklistList, type ChecklistNode, type ChecklistTick,
} from '../../shared/checklists'
import { formatLocal, localTime, today } from '../../shared/time'
import { tokens } from '../theme'
import { t, tn, useLanguage } from '../i18n'

/**
 * Daily checklists: what the team does to open the shop at the start of the day and to close it at the
 * end, in the language each person uses the app in. Everyone on the team ticks things off as they go
 * (an item with steps is done when its steps are), sees who did what, and the next day starts clear.
 * Admins change the lists: each thing in English and Spanish, its steps, and the order.
 */
export function ChecklistsPage() {
  const { api, me, isAdmin, business } = useApp()
  const run = useAction()
  const lang = useLanguage()
  useTick(60_000) // a new day starts clear, even with the page left open
  const day = today()
  const [params, setParams] = useSearchParams()
  const asked = params.get('list')
  // By the time of day when the page opens (it doesn't switch under someone halfway through).
  const [byTime] = useState(() => checklistFor(day, localTime(new Date()), business?.opening_hours))
  const list: ChecklistList = isChecklistList(asked) ? asked : byTime
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ChecklistItemInput | null>(null)
  const [removing, setRemoving] = useState<ChecklistNode | null>(null)

  const items = useAsync('checklist-items', () => api.checklistItems(), [])
  // Someone else ticking things off shows up within the half-minute.
  const ticks = useAsync('checklist-ticks', () => api.checklistTicks(day), [day], { refetchInterval: 30_000 })
  const tree = useMemo(() => checklistTree(items.data ?? [], list), [items.data, list])
  const saved = useMemo(() => new Map((ticks.data ?? []).map(x => [x.item_id, x])), [ticks.data])
  // A tick shows straight away; what's saved takes over once it's back.
  const [pending, setPending] = useState<Map<string, boolean>>(new Map())
  useEffect(() => setPending(new Map()), [ticks.data])
  const isDone = (id: string) => pending.get(id) ?? saved.has(id)
  const ticked = new Set([...tree.flatMap(n => [n.item, ...n.steps]).map(i => i.id)].filter(isDone))
  const { done, total } = checklistProgress(tree, ticked)
  /** Someone else's tick is theirs (or an admin's) to take off. */
  const canUntick = (x: ChecklistTick | undefined) => !x || x.done_by === me?.id || isAdmin

  const setTicks = (ids: string[], on: boolean) => {
    if (!ids.length) return
    setPending(p => new Map([...p, ...ids.map(id => [id, on] as const)]))
    void run(() => api.setChecklistTicks(ids, day, on)).then(ok => { if (!ok) setPending(new Map()) })
  }
  const choose = (next: ChecklistList) => setParams(p => { p.set('list', next); return p }, { replace: true })
  /** Swap an item (or a step) with the one above or below it. */
  const move = (siblings: ChecklistItem[], i: number, by: -1 | 1) => {
    const order = [...siblings]
    ;[order[i], order[i + by]] = [order[i + by], order[i]]
    void run(() => api.orderChecklistItems(order.map(x => x.id)))
  }
  const remove = (n: ChecklistNode) => run(() => api.deleteChecklistItem(n.item.id), t('Removed from the checklist'))
  const nextSort = (siblings: ChecklistItem[]) => siblings.reduce((m, x) => Math.max(m, x.sort + 1), 1)
  const current = CHECKLISTS.find(c => c.id === list)!

  return (
    <>
      <PageHeader eyebrow={t('Business')} title={t('Daily checklists')} actions={isAdmin && (
        <Button variant={editing ? 'contained' : 'outlined'} startIcon={editing ? undefined : <EditIcon />} onClick={() => setEditing(!editing)}>
          {editing ? t('Done') : t('Change the checklists')}
        </Button>
      )} />
      <ErrorBox error={items.error ?? ticks.error} />

      <Tabs value={list} onChange={(_, v: ChecklistList) => choose(v)} variant="scrollable" allowScrollButtonsMobile
        sx={{ mb: 2, borderBottom: `1px solid ${tokens.line}` }}>
        {CHECKLISTS.map(c => (
          <Tab key={c.id} value={c.id} label={t(c.label)} iconPosition="start" sx={{ minHeight: 48 }}
            icon={c.id === 'opening' ? <MorningIcon fontSize="small" /> : <EveningIcon fontSize="small" />} />
        ))}
      </Tabs>

      <Card component="section" aria-label={t(current.label)} sx={{ overflow: 'hidden' }}>
        {!editing && total > 0 && (
          <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
            <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1 }}>
              <Typography variant="overline" component="p" sx={{ color: tokens.roseDeep, textTransform: 'capitalize' }}>{t('Today')} · {formatLocal(`${day}T12:00:00Z`, 'EEEE d MMMM')}</Typography>
              <Typography variant="body2" role="status" sx={{ color: done === total ? tokens.goodFg : 'text.secondary', fontWeight: done === total ? 600 : undefined }}>
                {t('{done} of {total} done', { done, total })}
              </Typography>
            </Stack>
            <LinearProgress variant="determinate" value={(done / total) * 100} aria-label={t('How much is done')}
              sx={{ height: 8, borderRadius: 4, bgcolor: tokens.surfaceAlt, '& .MuiLinearProgress-bar': { bgcolor: done === total ? tokens.matcha : tokens.rose } }} />
            {done === total && (
              <Alert icon={<DoneIcon />} severity="success" sx={{ mt: 1.5 }}>
                {list === 'opening' ? t('All done: the shop is ready to open.') : t('All done: the shop is closed up for the night.')}
              </Alert>
            )}
          </Box>
        )}

        {items.data && tree.length === 0 && (
          <Box sx={{ p: 2 }}>
            <Empty>
              <Typography sx={{ mb: isAdmin ? 1.5 : 0 }}>{t('Nothing on this checklist yet.')}</Typography>
              {isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ list, parent_id: null, sort: 1 })}>{t('Add something to do')}</Button>}
            </Empty>
          </Box>
        )}

        <Box role="list" aria-label={t('{list}: what to do', { list: t(current.label) })}>
          {tree.map((n, i) => {
            const stepsDone = n.steps.filter(s => isDone(s.id)).length
            const all = n.steps.length > 0 && stepsDone === n.steps.length
            return (
              <Box key={n.item.id} role="listitem" aria-label={itemText(n.item, lang)} sx={{ borderTop: `1px solid ${tokens.line}` }}>
                {editing ? (
                  <EditRow item={n.item} lang={lang} first={i === 0} last={i === tree.length - 1}
                    onUp={() => move(tree.map(x => x.item), i, -1)} onDown={() => move(tree.map(x => x.item), i, 1)}
                    onEdit={() => setForm(n.item)} onRemove={() => setRemoving(n)}
                    onAddStep={() => setForm({ list, parent_id: n.item.id, sort: nextSort(n.steps) })} />
                ) : n.steps.length ? (
                  // An item with steps: done when they all are; its box ticks (or unticks) them all.
                  <CheckRow text={itemText(n.item, lang)} checked={all} indeterminate={stepsDone > 0 && !all}
                    note={tn(n.steps.length, '{done} of {n} step', '{done} of {n} steps', { done: stepsDone })}
                    onChange={on => setTicks(n.steps.filter(s => (on ? !isDone(s.id) : isDone(s.id) && canUntick(saved.get(s.id)))).map(s => s.id), on)} />
                ) : (
                  <TickRow item={n.item} lang={lang} done={isDone(n.item.id)} tick={saved.get(n.item.id)} canUntick={canUntick(saved.get(n.item.id))}
                    onChange={on => setTicks([n.item.id], on)} />
                )}
                {n.steps.length > 0 && (
                  <Box role="list" aria-label={t('Steps')} sx={{ pl: { xs: 3.5, sm: 5 }, pb: 0.5 }}>
                    {n.steps.map((s, j) => (
                      <Box key={s.id} role="listitem" aria-label={itemText(s, lang)}>
                        {editing
                          ? <EditRow item={s} lang={lang} first={j === 0} last={j === n.steps.length - 1}
                              onUp={() => move(n.steps, j, -1)} onDown={() => move(n.steps, j, 1)} onEdit={() => setForm(s)} onRemove={() => void remove({ item: s, steps: [] })} />
                          : <TickRow item={s} lang={lang} done={isDone(s.id)} tick={saved.get(s.id)} canUntick={canUntick(saved.get(s.id))} small
                              onChange={on => setTicks([s.id], on)} />}
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
        {/* Admins add to it straight from the list; Change the checklists rewords, reorders and removes. */}
        {isAdmin && tree.length > 0 && (
          <Box sx={{ p: 1.5, borderTop: `1px solid ${tokens.line}` }}>
            <Button startIcon={<AddIcon />} onClick={() => setForm({ list, parent_id: null, sort: nextSort(tree.map(x => x.item)) })}>{t('Add something to do')}</Button>
          </Box>
        )}
      </Card>

      {form && <ItemDialog item={form} parent={tree.find(n => n.item.id === form.parent_id)?.item ?? null} lang={lang} onClose={() => setForm(null)} />}
      {removing && (
        <Dialog open onClose={() => setRemoving(null)} fullWidth maxWidth="xs" aria-labelledby="remove-title">
          <DialogTitle id="remove-title">{t('Take “{text}” off the checklist?', { text: itemText(removing.item, lang) })}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              {removing.steps.length ? tn(removing.steps.length, 'Its step goes too.', 'Its {n} steps go too.') : t('It goes from the checklist for everyone.')}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRemoving(null)}>{t('Cancel')}</Button>
            <Button variant="contained" color="error" onClick={() => { const n = removing; setRemoving(null); void remove(n) }}>{t('Remove')}</Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  )
}

/** A thing to tick off: who ticked it and when, once it's done. */
function TickRow({ item, lang, done, tick, canUntick, small, onChange }: {
  item: ChecklistItem; lang: ReturnType<typeof useLanguage>; done: boolean; tick?: ChecklistTick; canUntick: boolean; small?: boolean; onChange: (on: boolean) => void
}) {
  const { profiles } = useApp()
  const who = tick?.done_by ? profiles.find(p => p.id === tick.done_by)?.full_name : null
  const note = done && tick ? (who ? t('{name} · {time}', { name: who, time: localTime(tick.done_at) }) : localTime(tick.done_at)) : undefined
  const row = <CheckRow text={itemText(item, lang)} checked={done} small={small} note={note} disabled={done && !canUntick} onChange={onChange} />
  return done && !canUntick && who
    ? <Tooltip title={t('Ticked by {name}: they or an admin can untick it', { name: who })} placement="top-start"><Box>{row}</Box></Tooltip>
    : row
}

function CheckRow({ text, checked, indeterminate, note, small, disabled, onChange }: {
  text: string; checked: boolean; indeterminate?: boolean; note?: string; small?: boolean; disabled?: boolean; onChange: (on: boolean) => void
}) {
  return (
    <FormControlLabel disabled={disabled} sx={{ display: 'flex', alignItems: 'flex-start', m: 0, px: 1, py: small ? 0.25 : 0.75, gap: 0.5,
      '& .MuiFormControlLabel-label.Mui-disabled': { color: 'inherit' } }}
      control={<Checkbox checked={checked} indeterminate={indeterminate} size={small ? 'small' : 'medium'} onChange={e => onChange(e.target.checked)}
        slotProps={{ input: { 'aria-label': text } }} sx={{ mt: small ? -0.25 : -0.5 }} />}
      label={
        <Box sx={{ pt: small ? 0.5 : 0.75, minWidth: 0 }}>
          <Typography variant={small ? 'body2' : 'body1'} sx={{ color: checked ? 'text.secondary' : 'text.primary', textDecoration: checked ? 'line-through' : 'none',
            textDecorationColor: tokens.inkFaint, wordBreak: 'break-word' }}>{text}</Typography>
          {note && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{note}</Typography>}
        </Box>
      } />
  )
}

/** An item as an admin changes it: both languages, its place, and its steps. */
function EditRow({ item, lang, first, last, onUp, onDown, onEdit, onRemove, onAddStep }: {
  item: ChecklistItem; lang: ReturnType<typeof useLanguage>; first: boolean; last: boolean
  onUp: () => void; onDown: () => void; onEdit: () => void; onRemove: () => void; onAddStep?: () => void
}) {
  const other = lang === 'es' ? item.text_en : item.text_es
  const text = itemText(item, lang)
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, px: 1.5, py: 0.75, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
      <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
        <Typography variant={item.parent_id ? 'body2' : 'body1'} sx={{ wordBreak: 'break-word' }}>{text}</Typography>
        <Typography variant="caption" sx={{ color: other ? 'text.secondary' : tokens.warnFg, display: 'block' }}>
          {other ?? (lang === 'es' ? t('No English yet') : t('No Spanish yet'))}
        </Typography>
      </Box>
      <Stack direction="row" sx={{ flexShrink: 0 }}>
        {onAddStep && <Tooltip title={t('Add a step')}><IconButton size="small" aria-label={t('Add a step to “{text}”', { text })} onClick={onAddStep}><AddIcon fontSize="small" /></IconButton></Tooltip>}
        <Tooltip title={t('Move up')}><span><IconButton size="small" aria-label={t('Move “{text}” up', { text })} disabled={first} onClick={onUp}><UpIcon fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title={t('Move down')}><span><IconButton size="small" aria-label={t('Move “{text}” down', { text })} disabled={last} onClick={onDown}><DownIcon fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title={t('Change')}><IconButton size="small" aria-label={t('Change “{text}”', { text })} onClick={onEdit}><EditIcon fontSize="small" /></IconButton></Tooltip>
        <Tooltip title={t('Remove')}><IconButton size="small" aria-label={t('Remove “{text}”', { text })} onClick={onRemove}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
      </Stack>
    </Stack>
  )
}

/** Add something to do (or a step under one), or change it: in English and Spanish. */
function ItemDialog({ item, parent, lang, onClose }: { item: ChecklistItemInput; parent: ChecklistItem | null; lang: ReturnType<typeof useLanguage>; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const [en, setEn] = useState(item.text_en ?? '')
  const [es, setEs] = useState(item.text_es ?? '')
  const isNew = !item.id
  const title = !isNew ? t('Change it') : parent ? t('Add a step to “{text}”', { text: itemText(parent, lang) }) : t('Add something to do')
  const save = async () => {
    const problem = checklistItemProblem({ text_en: en, text_es: es })
    if (problem) return notify(t(problem), 'error')
    if (await run(() => api.saveChecklistItem({ ...item, text_en: en.trim() || null, text_es: es.trim() || null }), isNew ? t('Added to the checklist') : t('Saved'))) onClose()
  }
  const field = { multiline: true, maxRows: 4, slotProps: { htmlInput: { maxLength: CHECKLIST_TEXT_MAX } } }
  const fields = [
    <TextField key="en" label={t('In English')} value={en} onChange={e => setEn(e.target.value)} autoFocus={lang === 'en'} {...field} />,
    <TextField key="es" label={t('In Spanish')} value={es} onChange={e => setEs(e.target.value)} autoFocus={lang === 'es'} {...field} />,
  ]
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {lang === 'es' ? fields.reverse() : fields}
          <Typography variant="body2" color="text.secondary">{t('Everyone reads it in the language they use the app in. Leave one blank and they see the other.')}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!en.trim() && !es.trim()} onClick={() => void save()}>{isNew ? t('Add') : t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
