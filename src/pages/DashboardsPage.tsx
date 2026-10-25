import {
  Box, Button, ButtonBase, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, ListItemText, Menu, MenuItem, Stack, Tab, Tabs,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import DoneIcon from '@mui/icons-material/Check'
import LeftIcon from '@mui/icons-material/ChevronLeftRounded'
import RightIcon from '@mui/icons-material/ChevronRightRounded'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import ExecIcon from '@mui/icons-material/InsightsOutlined'
import ManagerIcon from '@mui/icons-material/StorefrontOutlined'
import BlankIcon from '@mui/icons-material/DashboardCustomizeOutlined'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useNotify } from '../app/Notify'
import { PageHeader, SectionTitle } from '../components/common'
import { WidgetBody, useTakings } from '../components/dashboardWidgets'
import {
  DASH_PERIODS, TEMPLATES, WIDGETS, WIDGET_GROUPS, addWidget, dashRange, moveWidget, newDashboard, readSaved, removeWidget, resizeWidget, widgetInfo,
  type DashPeriod, type DashTemplate, type Dashboard, type SavedDashboards, type Widget, type WidgetKind, type WidgetSize,
} from '../../shared/dashboards'
import { today } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t, tn } from '../i18n'

const SPAN: Record<WidgetSize, Record<string, string>> = {
  small: { xs: 'span 12', sm: 'span 6', lg: 'span 3' },
  medium: { xs: 'span 12', lg: 'span 6' },
  large: { xs: 'span 12' },
}
const SIZES: { id: WidgetSize; label: string }[] = [{ id: 'small', label: msg('Small') }, { id: 'medium', label: msg('Medium') }, { id: 'large', label: msg('Wide') }]
const TEMPLATE_ICON = { executive: <ExecIcon />, manager: <ManagerIcon />, blank: <BlankIcon /> }

/**
 * Dashboards (Insights): each person's own reports, made of widgets over a period (today, this
 * week, this month, the last 30 days), each against the period before. Start from the Executive or
 * Shop manager template or a blank one, then add, move, resize and remove widgets. Widgets only
 * show what the person may see. Kept in their preferences, on every device they sign in on.
 */
export function DashboardsPage() {
  const { api, me, refresh, isAdmin, isPartner, canSeePay } = useApp()
  const notify = useNotify()
  const [saved, setSaved] = useState<SavedDashboards>(() => readSaved(me?.preferences?.dashboards))
  useEffect(() => setSaved(readSaved(me?.preferences?.dashboards)), [me?.preferences?.dashboards])
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const { till } = useTakings()
  const period: DashPeriod = saved.period ?? 'week'
  const range = dashRange(period, today())
  const board = saved.boards.find(b => b.id === saved.open) ?? saved.boards[0] ?? null

  /** Which widgets the person can have: by role and pay access (the takings ones also need a till, and say so). */
  const can = (k: WidgetKind) => widgetInfo(k).needs.every(n => (n === 'admin' ? isAdmin && !isPartner : n === 'pay' || n === 'sales' ? canSeePay && !isPartner : !isPartner))
  const save = (next: SavedDashboards) => {
    setSaved(next)
    if (!me) return
    api.updateProfile(me.id, { preferences: { ...me.preferences, dashboards: next } }).then(refresh)
      .catch(e => notify(e instanceof Error ? e.message : String(e), 'error'))
  }
  const change = (d: Dashboard) => save({ ...saved, boards: saved.boards.map(b => (b.id === d.id ? d : b)) })
  const create = (template: DashTemplate) => {
    setMenu(null)
    const name = template === 'blank' ? t('My dashboard') : t(TEMPLATES.find(x => x.id === template)!.name)
    const d = newDashboard(template, name, can)
    save({ ...saved, boards: [...saved.boards, d], open: d.id })
    setEditing(template === 'blank')
    notify(t('Added {name}', { name }), 'success')
  }
  const remove = () => {
    if (!board) return
    const boards = saved.boards.filter(b => b.id !== board.id)
    save({ ...saved, boards, open: boards[0]?.id })
    setEditing(false)
  }
  const shown = board?.widgets.filter(w => can(w.kind)) ?? []

  return (
    <>
      <PageHeader eyebrow={t('Insights')} title={t('Dashboards')} actions={<>
        {board && (
          <ToggleButtonGroup size="small" exclusive value={period} onChange={(_, p: DashPeriod | null) => p && save({ ...saved, period: p })} aria-label={t('Period')}>
            {DASH_PERIODS.map(p => <ToggleButton key={p.id} value={p.id} sx={{ px: 1.5 }}>{t(p.label)}</ToggleButton>)}
          </ToggleButtonGroup>
        )}
        {board && (
          <Button variant={editing ? 'contained' : 'outlined'} startIcon={editing ? <DoneIcon /> : <EditIcon />} onClick={() => setEditing(x => !x)} aria-pressed={editing}>
            {editing ? t('Done') : t('Edit')}
          </Button>
        )}
        <Button variant="outlined" startIcon={<AddIcon />} onClick={e => setMenu(e.currentTarget)} aria-haspopup="menu">{t('New dashboard')}</Button>
        <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
          {TEMPLATES.map(x => (
            <MenuItem key={x.id} onClick={() => create(x.id)} sx={{ whiteSpace: 'normal', maxWidth: 380, gap: 1.5 }}>
              {TEMPLATE_ICON[x.id]}<ListItemText primary={t('{name} template', { name: t(x.name) })} secondary={t(x.hint)} />
            </MenuItem>
          ))}
          <MenuItem onClick={() => create('blank')} sx={{ gap: 1.5 }}>{TEMPLATE_ICON.blank}<ListItemText primary={t('Blank: choose every widget')} /></MenuItem>
        </Menu>
      </>} />

      {!board ? <TemplatePicker onPick={create} /> : <>
        {saved.boards.length > 1 && (
          <Tabs value={board.id} onChange={(_, v: string) => save({ ...saved, open: v })} variant="scrollable" sx={{ mb: 2, borderBottom: `1px solid ${tokens.line}` }}>
            {saved.boards.map(b => <Tab key={b.id} value={b.id} label={b.name} />)}
          </Tabs>
        )}
        {editing && (
          <Card sx={{ mb: 2, bgcolor: tokens.roseSoft, borderColor: tokens.rose }}>
            <CardContent sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', py: '12px !important' }}>
              <Typography sx={{ fontWeight: 600, mr: 'auto' }}>{t('Editing {name}', { name: board.name })}</Typography>
              <Button size="small" startIcon={<AddIcon />} variant="contained" onClick={() => setAdding(true)}>{t('Add a widget')}</Button>
              <Button size="small" startIcon={<EditIcon />} onClick={() => setRenaming(true)}>{t('Rename')}</Button>
              <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={remove}>{t('Delete dashboard')}</Button>
            </CardContent>
          </Card>
        )}
        {!till && isAdmin && shown.some(w => widgetInfo(w.kind).needs.includes('sales')) && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            {t('Takings widgets fill in once Square, SumUp or Stripe is connected (Connections).')}
          </Typography>
        )}
        {shown.length === 0 ? (
          <Card><CardContent>
            <Typography sx={{ mb: 1.5 }}>{t('Nothing on this dashboard yet.')}</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(true); setAdding(true) }}>{t('Add a widget')}</Button>
          </CardContent></Card>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: 2 }}>
            {shown.map((w, i) => (
              <WidgetCard key={w.id} w={w} editing={editing} first={i === 0} last={i === shown.length - 1} range={range}
                onMove={by => change(moveWidget(board, w.id, by))} onSize={s => change(resizeWidget(board, w.id, s))} onRemove={() => change(removeWidget(board, w.id))} />
            ))}
          </Box>
        )}
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 2 }}>
          {t('Your own dashboards: only you see them, on every device you sign in on. Figures are compared with the period before.')}
        </Typography>
      </>}

      {adding && board && <AddWidgetDialog board={board} can={can} onAdd={k => change(addWidget(board, k))} onClose={() => setAdding(false)} />}
      {renaming && board && <RenameDialog name={board.name} onSave={name => { change({ ...board, name }); setRenaming(false) }} onClose={() => setRenaming(false)} />}
    </>
  )
}

/** No dashboards yet: the two templates (and blank), each saying what's on it. */
function TemplatePicker({ onPick }: { onPick: (t: DashTemplate) => void }) {
  return (
    <>
      <Typography sx={{ color: 'text.secondary', mb: 2.5, maxWidth: 760 }}>
        {t('Make your own reports from the figures in the app: start from a template and change it, or choose every widget yourself.')}
      </Typography>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
        {[...TEMPLATES, { id: 'blank' as const, name: msg('Blank'), hint: msg('An empty dashboard: add the widgets you want, in the order you want.'), widgets: [] }].map(x => (
          <Card key={x.id} sx={{ display: 'flex' }}>
            <ButtonBase onClick={() => onPick(x.id)} aria-label={t('Start from {name}', { name: t(x.name) })}
              sx={{ display: 'block', textAlign: 'left', p: 2.5, width: '100%', '&:hover': { bgcolor: tokens.hover }, '&.Mui-focusVisible': { outline: `2px solid ${tokens.rose}` } }}>
              <Box sx={{ color: tokens.roseDeep, mb: 1 }}>{TEMPLATE_ICON[x.id]}</Box>
              <Typography variant="h6" component="h2">{t(x.name)}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, mb: 1.5 }}>{t(x.hint)}</Typography>
              {x.widgets.length > 0 && (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{x.widgets.map(w => t(widgetInfo(w.kind).label)).join(' · ')}</Typography>
              )}
            </ButtonBase>
          </Card>
        ))}
      </Box>
    </>
  )
}

/** One widget: its title, what it shows, and (while editing) move, resize and remove. */
function WidgetCard({ w, editing, first, last, range, onMove, onSize, onRemove }: {
  w: Widget; editing: boolean; first: boolean; last: boolean; range: ReturnType<typeof dashRange>
  onMove: (by: -1 | 1) => void; onSize: (s: WidgetSize) => void; onRemove: () => void
}) {
  const info = widgetInfo(w.kind)
  return (
    <Card component="section" aria-label={t(info.label)} sx={{ gridColumn: SPAN[w.size], minWidth: 0, ...(editing ? { outline: `1px dashed ${tokens.lineStrong}` } : {}) }}>
      <CardContent>
        <SectionTitle action={editing && (
          <Stack direction="row" sx={{ alignItems: 'center' }}>
            <Tooltip title={t('Move earlier')}><span><IconButton size="small" disabled={first} onClick={() => onMove(-1)} aria-label={t('Move {name} earlier', { name: t(info.label) })}><LeftIcon fontSize="small" /></IconButton></span></Tooltip>
            <Tooltip title={t('Move later')}><span><IconButton size="small" disabled={last} onClick={() => onMove(1)} aria-label={t('Move {name} later', { name: t(info.label) })}><RightIcon fontSize="small" /></IconButton></span></Tooltip>
            <TextField select size="small" value={w.size} onChange={e => onSize(e.target.value as WidgetSize)} sx={{ mx: 0.5, '& .MuiSelect-select': { py: 0.5, fontSize: 13 } }}
              slotProps={{ htmlInput: { 'aria-label': t('Size of {name}', { name: t(info.label) }) } }}>
              {SIZES.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
            </TextField>
            <Tooltip title={t('Remove')}><IconButton size="small" onClick={onRemove} aria-label={t('Remove {name}', { name: t(info.label) })}><CloseIcon fontSize="small" /></IconButton></Tooltip>
          </Stack>
        )}>{t(info.label)}</SectionTitle>
        <WidgetBody kind={w.kind} range={range} />
      </CardContent>
    </Card>
  )
}

/** The widgets the person can add, by group, each saying what it shows (already there ones can go on again). */
function AddWidgetDialog({ board, can, onAdd, onClose }: { board: Dashboard; can: (k: WidgetKind) => boolean; onAdd: (k: WidgetKind) => void; onClose: () => void }) {
  const on = new Set(board.widgets.map(w => w.kind))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t('Add a widget')}</DialogTitle>
      <DialogContent>
        {WIDGET_GROUPS.map(g => {
          const list = WIDGETS.filter(w => w.group === g.id && can(w.kind))
          if (!list.length) return null
          return (
            <Box key={g.id} sx={{ mb: 2.5 }}>
              <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>{t(g.label)}</Typography>
              <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
                {list.map(w => (
                  <Stack key={w.kind} direction="row" spacing={1} sx={{ alignItems: 'center', p: 1.25, border: `1px solid ${tokens.line}`, borderRadius: 2 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{t(w.label)}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t(w.hint)}</Typography>
                    </Box>
                    <Button size="small" variant={on.has(w.kind) ? 'text' : 'outlined'} startIcon={<AddIcon />} onClick={() => onAdd(w.kind)}
                      aria-label={t('Add {name}', { name: t(w.label) })}>{on.has(w.kind) ? t('Again') : t('Add')}</Button>
                  </Stack>
                ))}
              </Box>
            </Box>
          )
        })}
      </DialogContent>
      <DialogActions>
        <Typography variant="body2" sx={{ color: 'text.secondary', mr: 'auto', pl: 2 }}>{tn(board.widgets.length, '{n} widget on it', '{n} widgets on it')}</Typography>
        <Button variant="contained" onClick={onClose}>{t('Done')}</Button>
      </DialogActions>
    </Dialog>
  )
}

function RenameDialog({ name, onSave, onClose }: { name: string; onSave: (name: string) => void; onClose: () => void }) {
  const [v, setV] = useState(name)
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Rename the dashboard')}</DialogTitle>
      <DialogContent>
        <TextField fullWidth autoFocus label={t('Name')} value={v} onChange={e => setV(e.target.value)} sx={{ mt: 1 }} slotProps={{ htmlInput: { maxLength: 60 } }}
          onKeyDown={e => { if (e.key === 'Enter' && v.trim()) onSave(v.trim()) }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!v.trim()} onClick={() => onSave(v.trim())}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
