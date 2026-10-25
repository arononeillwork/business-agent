import { Box, Button, Card, CardContent, IconButton, List, ListItem, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import UpIcon from '@mui/icons-material/KeyboardArrowUp'
import DownIcon from '@mui/icons-material/KeyboardArrowDown'
import DragIcon from '@mui/icons-material/DragIndicator'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { ALWAYS_SHOWN, SECTIONS, canOpen, navLabel, sortSections, type NavItem, type NavSection } from '../app/AppShell'
import { PageHeader, SectionTitle } from '../components/common'
import { restrictToVerticalAxis } from '../components/dnd'
import type { Preferences } from '../../shared/types'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

/**
 * Settings → Pages: the order of the menu's sections, and which pages show in it. Everyone puts the
 * sections in their own order and hides pages from their own menu; admins also hide pages from
 * everyone's (a business that doesn't use Sports or Music, say). A hidden page leaves the menu and
 * search, and still opens from a link.
 */
export function PagesPage() {
  const { isAdmin, isPartner, canSeePay, partnerCan, me, settings, api, refresh } = useApp()
  const run = useAction()
  // Kept on screen straight away while it saves (as the menu's pins are).
  const [mine, setMineNow] = useState<string[]>(me?.preferences?.navHidden ?? [])
  const [team, setTeamNow] = useState<string[]>(settings?.hidden_pages ?? [])
  const [order, setOrderNow] = useState<string[] | undefined>(me?.preferences?.navSections)
  useEffect(() => setMineNow(me?.preferences?.navHidden ?? []), [me?.preferences?.navHidden])
  useEffect(() => setTeamNow(settings?.hidden_pages ?? []), [settings?.hidden_pages])
  useEffect(() => setOrderNow(me?.preferences?.navSections), [me?.preferences?.navSections])
  const admin = isAdmin && !isPartner
  const sections = sortSections(SECTIONS, order)
    .map(s => ({ ...s, items: s.items.filter(n => canOpen(n, { isAdmin, isPartner, canSeePay, partnerCan })) })).filter(s => s.items.length)

  // Each save carries what's on screen, so changes made quickly one after another never undo each other.
  const savePrefs = async (patch: Preferences) => {
    if (me) await api.updateProfile(me.id, { preferences: { ...me.preferences, navHidden: mine, navSections: order, ...patch } })
  }
  const setMine = (key: string, show: boolean) => run(async () => {
    if (!me) return
    const next = show ? mine.filter(k => k !== key) : [...new Set([...mine, key])]
    setMineNow(next)
    await savePrefs({ navHidden: next })
    await refresh()
  })
  const reorder = (keys: string[] | undefined) => run(async () => {
    setOrderNow(keys)
    await savePrefs({ navSections: keys })
    await refresh()
  }, keys ? undefined : t('The menu’s sections are in their usual order again'))
  const setTeam = (key: string, show: boolean) => run(async () => {
    const next = show ? team.filter(k => k !== key) : [...new Set([...team, key])]
    setTeamNow(next)
    await api.updateSettings({ hidden_pages: next })
    await refresh()
  })
  const showAll = () => run(async () => {
    setMineNow([])
    if (admin) setTeamNow([])
    if (me && mine.length) await savePrefs({ navHidden: [] })
    if (admin && team.length) await api.updateSettings({ hidden_pages: [] })
    await refresh()
  }, t('Every page is in the menu again'))

  const row = (n: NavItem) => {
    const fixed = ALWAYS_SHOWN.includes(n.key)
    const forTeam = !team.includes(n.key)
    return (
      <TableRow key={n.key} hover>
        <TableCell>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box sx={{ color: 'text.secondary', display: 'flex' }}>{n.icon}</Box>
            <Box>
              <Typography>{navLabel(n)}</Typography>
              {!forTeam && <Typography variant="caption" sx={{ color: tokens.roseDeep }}>{t('Hidden for the team')}</Typography>}
            </Box>
          </Stack>
        </TableCell>
        <TableCell align="center">
          <Switch checked={fixed || !mine.includes(n.key)} disabled={fixed || !forTeam} onChange={e => void setMine(n.key, e.target.checked)}
            slotProps={{ input: { 'aria-label': t('Show {page} in my menu', { page: navLabel(n) }) } }} />
        </TableCell>
        {admin && (
          <TableCell align="center">
            <Switch checked={fixed || forTeam} disabled={fixed} onChange={e => void setTeam(n.key, e.target.checked)}
              slotProps={{ input: { 'aria-label': t('Show {page} for the team', { page: navLabel(n) }) } }} />
          </TableCell>
        )}
      </TableRow>
    )
  }

  const hiddenCount = new Set([...mine, ...(admin ? team : [])]).size
  return (
    <>
      <PageHeader eyebrow={t('Settings')} title={t('Pages')} actions={hiddenCount > 0 && (
        <Button onClick={() => void showAll()}>{tn(hiddenCount, 'Show {n} hidden page again', 'Show {n} hidden pages again')}</Button>
      )} />
      <SectionOrder sections={sections} custom={!!order?.length} onReorder={reorder} />
      <Typography sx={{ color: 'text.secondary', mt: 3, mb: 2, maxWidth: 720 }}>
        {admin
          ? t('Choose the pages in your menu. “For the team” hides a page from everyone’s menu, yours included, for parts of the app the business doesn’t use. A hidden page still opens from a link.')
          : t('Choose the pages in your menu. A hidden page still opens from a link.')}
      </Typography>
      {sections.map(s => (
        <Card key={s.key} component="section" aria-label={s.label ? t(s.label) : t('Pages')} sx={{ mb: 2 }}>
          <CardContent sx={{ pb: '8px !important' }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell sx={{ fontWeight: 600 }}>{s.label ? t(s.label) : ''}</TableCell>
                <TableCell align="center" sx={{ width: 120 }}>{t('My menu')}</TableCell>
                {admin && <TableCell align="center" sx={{ width: 120 }}>{t('For the team')}</TableCell>}
              </TableRow></TableHead>
              <TableBody>{s.items.map(row)}</TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </>
  )
}

/**
 * The order of the menu's sections, for this person: drag one (or focus its handle and use the arrow
 * keys), or press its arrows. The sidebar, the phone's More list and this page follow it.
 */
function SectionOrder({ sections, custom, onReorder }: { sections: NavSection[]; custom: boolean; onReorder: (keys: string[] | undefined) => void }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const keys = sections.map(s => s.key)
  const move = (from: number, to: number) => onReorder(arrayMove(keys, from, to))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) move(keys.indexOf(String(active.id)), keys.indexOf(String(over.id)))
  }
  if (sections.length < 2) return null
  return (
    <Card component="section" aria-label={t('Menu sections')} sx={{ mb: 2 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <SectionTitle action={custom && <Button size="small" onClick={() => onReorder(undefined)}>{t('Usual order')}</Button>}>{t('Menu sections')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('Put the sections of your menu in the order you want. It’s your menu only: everyone else keeps theirs.')}
        </Typography>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}
          accessibility={{ screenReaderInstructions: { draggable: t('Press space to pick up this section, use the arrow keys to move it, and space again to drop it.') } }}>
          <SortableContext items={keys} strategy={verticalListSortingStrategy}>
            <List disablePadding aria-label={t('Menu sections')}>
              {sections.map((s, i) => (
                <SectionRow key={s.key} section={s} first={i === 0} last={i === sections.length - 1} onUp={() => move(i, i - 1)} onDown={() => move(i, i + 1)} />
              ))}
            </List>
          </SortableContext>
        </DndContext>
      </CardContent>
    </Card>
  )
}

function SectionRow({ section, first, last, onUp, onDown }: { section: NavSection; first: boolean; last: boolean; onUp: () => void; onDown: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: section.key })
  const label = section.label ? t(section.label) : t('Pages')
  return (
    <ListItem ref={setNodeRef} disableGutters sx={{ py: 0.5, px: 0.5, gap: 1, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper',
      transform: CSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 2 : 'auto',
      boxShadow: isDragging ? `0 10px 24px -10px ${tokens.shadow}` : 'none', borderRadius: isDragging ? 2 : 0 }}>
      <Box ref={setActivatorNodeRef} component="button" type="button" aria-label={t('Reorder {page}', { page: label })} {...attributes} {...listeners}
        aria-roledescription="drag handle"
        sx={{ all: 'unset', display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: '6px', color: 'text.secondary', touchAction: 'none',
          cursor: isDragging ? 'grabbing' : 'grab', '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: `2px solid ${tokens.rose}` } }}>
        <DragIcon fontSize="small" />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 500 }}>{label}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap component="div">
          {section.items.map(n => navLabel(n)).join(' · ')}
        </Typography>
      </Box>
      <IconButton size="small" disabled={first} onClick={onUp} aria-label={t('Move {section} up', { section: label })}><UpIcon fontSize="small" /></IconButton>
      <IconButton size="small" disabled={last} onClick={onDown} aria-label={t('Move {section} down', { section: label })}><DownIcon fontSize="small" /></IconButton>
    </ListItem>
  )
}
