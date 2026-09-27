import {
  Alert, AppBar, BottomNavigation, BottomNavigationAction, Box, ButtonBase, Collapse, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, ListSubheader, MenuItem, Paper, Select, Stack, Toolbar, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import TodayIcon from '@mui/icons-material/WbSunnyOutlined'
import RotaIcon from '@mui/icons-material/CalendarViewWeekOutlined'
import TimecardIcon from '@mui/icons-material/AccessTimeOutlined'
import CalendarIcon from '@mui/icons-material/EventOutlined'
import TeamIcon from '@mui/icons-material/PeopleAltOutlined'
import BusinessIcon from '@mui/icons-material/StorefrontOutlined'
import HoursIcon from '@mui/icons-material/ScheduleOutlined'
import BrandIcon from '@mui/icons-material/BrushOutlined'
import AccountIcon from '@mui/icons-material/AccountCircleOutlined'
import AppearanceIcon from '@mui/icons-material/PaletteOutlined'
import KioskIcon from '@mui/icons-material/TabletMacOutlined'
import TimeOffIcon from '@mui/icons-material/BeachAccessOutlined'
import FinanceIcon from '@mui/icons-material/PaymentsOutlined'
import AlertsIcon from '@mui/icons-material/CampaignOutlined'
import ConnectIcon from '@mui/icons-material/HubOutlined'
import LogoutIcon from '@mui/icons-material/LogoutOutlined'
import PartnersIcon from '@mui/icons-material/HandshakeOutlined'
import MoreIcon from '@mui/icons-material/MoreHoriz'
import SportsIcon from '@mui/icons-material/SportsSoccerOutlined'
import MusicIcon from '@mui/icons-material/LibraryMusicOutlined'
import ExpandIcon from '@mui/icons-material/ExpandMore'
import DragIcon from '@mui/icons-material/DragIndicator'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type Modifier } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ChevronIcon from '@mui/icons-material/ChevronLeftRounded'
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useApp } from './AppContext'
import { FEATURES } from './features'
import type { PartnerArea } from '../../shared/types'
import { BrandLogo } from '../components/Logo'
import { Loading, PersonAvatar } from '../components/common'
import { NotificationBell } from '../components/NotificationBell'
import { SearchButton, ThemeToggle } from './QuickActions'
import { fonts, tokens } from '../theme'

// `partner`: which partner areas show the item ('any' = every partner). Items without it are staff-only.
interface NavItem { key: string; to: string; label: string; short?: string; icon: ReactNode; who?: 'admin' | 'pay'; partner?: PartnerArea[] | 'any' }
interface NavSection { key: string; label: string | null; items: NavItem[] }

// The menu, in sections. Today is the home page (the logo goes there too).
export const SECTIONS: NavSection[] = [
  { key: 'home', label: null, items: [
    { key: 'today', to: '/', label: 'Today', icon: <TodayIcon /> },
  ] },
  { key: 'business', label: 'Business', items: [
    { key: 'business', to: '/business', label: 'Business', icon: <BusinessIcon />, partner: 'any' },
    { key: 'hours', to: '/opening-hours', label: 'Opening hours', icon: <HoursIcon />, partner: 'any' },
    { key: 'brand', to: '/brand', label: 'Brand', icon: <BrandIcon />, partner: 'any' },
    { key: 'finances', to: '/finances', label: 'Finances', icon: <FinanceIcon />, who: 'pay', partner: ['finances'] },
  ] },
  { key: 'whatson', label: "What's on", items: [
    { key: 'calendar', to: '/calendar', label: 'Calendar', icon: <CalendarIcon />, partner: ['calendar'] },
    { key: 'sports', to: '/sports', label: 'Sports', icon: <SportsIcon /> },
    { key: 'music', to: '/music', label: 'Music', icon: <MusicIcon /> },
  ] },
  { key: 'team', label: 'Team', items: [
    { key: 'rota', to: '/rota', label: 'Rota', icon: <RotaIcon />, partner: ['rota', 'payroll'] },
    { key: 'timeoff', to: '/time-off', label: 'Time off', icon: <TimeOffIcon /> },
    { key: 'timecards', to: '/timecards', label: 'Timecards', short: 'Hours', icon: <TimecardIcon />, partner: ['payroll'] },
    { key: 'team', to: '/team', label: 'Team', icon: <TeamIcon /> },
  ] },
  { key: 'admin', label: 'Settings', items: [
    { key: 'connections', to: '/connections', label: 'Connections', icon: <ConnectIcon />, who: 'admin' },
    { key: 'alerts', to: '/alerts', label: 'Alerts', icon: <AlertsIcon />, who: 'admin' },
    ...(FEATURES.partners ? [{ key: 'partners', to: '/partners', label: 'Partners', icon: <PartnersIcon />, who: 'admin' as const }] : []),
    ...(FEATURES.kiosk ? [{ key: 'kiosk', to: '/kiosk', label: 'Café tablet', icon: <KioskIcon />, who: 'admin' as const }] : []),
  ] },
  { key: 'me', label: 'You', items: [
    { key: 'account', to: '/account', label: 'My account', short: 'Me', icon: <AccountIcon />, partner: 'any' },
    { key: 'appearance', to: '/appearance', label: 'Appearance', icon: <AppearanceIcon />, partner: 'any' },
  ] },
]
const DRAWER = 252
const MINI = 76
// Phone tabs: the everyday pages first; everything else sits under "More".
const PHONE_TABS = ['today', 'rota', 'timeoff', 'timecards', 'business', 'calendar']

// The desktop sidebar: deep espresso with cream text and the brand's Rose Pink for the current page.
const SIDEBAR = {
  bg: tokens.navBg,
  text: tokens.navText,
  faint: tokens.navFaint,
  hover: tokens.navHover,
  bright: tokens.navBright,
}
const sidebarItems = {
  '& .MuiListItemButton-root': { color: SIDEBAR.text, borderRadius: '10px', transition: 'background .15s, color .15s',
    '& .MuiListItemIcon-root': { color: 'inherit' },
    '&:hover': { background: SIDEBAR.hover, color: SIDEBAR.bright },
    '&.Mui-selected, &.Mui-selected:hover': { background: tokens.rose, color: '#2B2522', boxShadow: '0 6px 18px -8px rgba(247,155,164,0.7)',
      '& .MuiListItemIcon-root': { color: '#2B2522' } },
    '&.Mui-focusVisible': { outline: `2px solid ${tokens.rose}`, outlineOffset: 1 } },
}

/** Sections the person folded away, remembered on this device. */
function useFolded() {
  const read = () => { try { return JSON.parse(localStorage.getItem('nav-folded') ?? '[]') as string[] } catch { return [] } }
  const [folded, setFolded] = useState<string[]>(read)
  const toggle = (k: string) => {
    const next = folded.includes(k) ? folded.filter(x => x !== k) : [...folded, k]
    setFolded(next)
    try { localStorage.setItem('nav-folded', JSON.stringify(next)) } catch { /* storage unavailable */ }
  }
  return [folded, toggle] as const
}

/** Icons-only sidebar, remembered on this device. */
function useMini() {
  const [mini, setMini] = useState(() => { try { return localStorage.getItem('nav-mini') === '1' } catch { return false } })
  const toggle = () => {
    setMini(!mini)
    try { localStorage.setItem('nav-mini', mini ? '0' : '1') } catch { /* storage unavailable */ }
  }
  return [mini, toggle] as const
}

// Sample accounts for switching views in the demo (partners can't see the team list, so it's fixed here).
const DEMO_ACCOUNTS = [
  { email: 'aron@example.com', label: "Aron O'Neill (admin)" },
  { email: 'mark@example.com', label: 'Mark Murray (admin)' },
  { email: 'maria@example.com', label: 'Maria (employee)' },
  { email: 'julio@example.com', label: 'Julio (employee)' },
  ...(FEATURES.partners ? [{ email: 'laura@gestoria.example', label: 'Laura, Gestoría Marbella (partner)' }] : []),
]

function DemoBanner() {
  const { api, me } = useApp()
  if (api.mode !== 'demo') return null
  const accounts = me?.email && !DEMO_ACCOUNTS.some(a => a.email === me.email)
    ? [...DEMO_ACCOUNTS, { email: me.email, label: `${me.full_name} (${me.role})` }] : DEMO_ACCOUNTS
  return (
    <Alert severity="info" icon={false}
      sx={{ borderRadius: 0, border: 0, py: 0.25, px: { xs: 2, md: 4 }, borderBottom: 1, borderColor: 'divider', '& .MuiAlert-message': { py: 1 } }}
      action={
        <Select size="small" variant="standard" disableUnderline value={me?.email ?? ''} aria-label="View as"
          sx={{ fontSize: 14, fontWeight: 600 }} onChange={e => api.signIn(String(e.target.value), '')}>
          {accounts.map(a => <MenuItem key={a.email} value={a.email}>View as {a.label}</MenuItem>)}
        </Select>
      }>
      <b>Demo</b> · sample data, nothing is saved
    </Alert>
  )
}

/**
 * Phone: four tabs plus "More" (a sheet with every other page, by section, and sign out).
 * "My account" lives in the top bar.
 */
function PhoneNav({ sections, current }: { sections: NavSection[]; current: string | false }) {
  const { api } = useApp()
  const [more, setMore] = useState(false)
  const flat = sections.flatMap(s => s.items).filter(n => n.key !== 'account')
  const rank = (n: NavItem) => { const i = PHONE_TABS.indexOf(n.key); return i < 0 ? PHONE_TABS.length : i }
  const tabbable = flat.filter(n => n.key !== 'kiosk').sort((a, b) => rank(a) - rank(b))
  const overflow = flat.length > 5
  const shown = overflow ? tabbable.slice(0, 4) : tabbable
  const shownKeys = shown.map(n => n.key)
  const inRest = !!current && !shownKeys.includes(current)
  return (
    <Paper component="nav" aria-label="Main" elevation={0}
      sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10, pb: 'env(safe-area-inset-bottom)' }}>
      <BottomNavigation showLabels value={inRest ? 'more' : current}>
        {shown.map(n => (
          <BottomNavigationAction key={n.key} value={n.key} label={n.short ?? n.label}
            icon={n.icon} component={Link} to={n.to} sx={{ minWidth: 0 }} />
        ))}
        {overflow && (
          <BottomNavigationAction value="more" label="More" icon={<MoreIcon />} sx={{ minWidth: 0 }}
            onClick={() => setMore(true)} aria-haspopup="dialog" />
        )}
      </BottomNavigation>
      <Drawer anchor="bottom" open={more} onClose={() => setMore(false)}
        slotProps={{ paper: { sx: { borderTopLeftRadius: 20, borderTopRightRadius: 20, pb: 'env(safe-area-inset-bottom)', maxHeight: '85vh' } } }}>
        <List aria-label="More pages" sx={{ py: 1 }} onClick={() => setMore(false)}>
          {sections.map(s => {
            const rest = s.items.filter(n => !shownKeys.includes(n.key))
            if (!rest.length) return null
            return (
              <Box key={s.key}>
                {s.label && <ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: '32px', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{s.label}</ListSubheader>}
                {rest.map(n => (
                  <ListItemButton key={n.key} component={Link} to={n.to} selected={current === n.key} sx={{ mx: 1 }}>
                    <ListItemIcon sx={{ minWidth: 40 }}>{n.icon}</ListItemIcon>
                    <ListItemText primary={n.label} />
                  </ListItemButton>
                ))}
              </Box>
            )
          })}
          <ListItemButton onClick={() => api.signOut()} sx={{ mx: 1, mt: 1 }}>
            <ListItemIcon sx={{ minWidth: 40 }}><LogoutIcon /></ListItemIcon>
            <ListItemText primary="Sign out" />
          </ListItemButton>
        </List>
      </Drawer>
    </Paper>
  )
}

/** One menu row. With `sortable`, a drag handle sits at the right end (drag it, or focus it and use the arrow keys). */
function NavRow({ n, current, sortable }: { n: NavItem; current: string | false; sortable: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: n.key, disabled: !sortable })
  return (
    <Box ref={setNodeRef} sx={{ position: 'relative', mb: 0.25, transform: CSS.Transform.toString(transform), transition,
      zIndex: isDragging ? 2 : 'auto', opacity: isDragging ? 0.92 : 1,
      '&:hover .nav-drag, & .nav-drag:focus-visible': { opacity: 1 } }}>
      <ListItemButton component={Link} to={n.to} selected={current === n.key}
        sx={{ py: 0.6, pl: 1.25, pr: sortable ? 4 : 1.25, ...(isDragging ? { boxShadow: `0 10px 24px -10px ${tokens.shadow}`, bgcolor: tokens.surface } : {}) }}>
        <ListItemIcon sx={{ minWidth: 34, '& svg': { fontSize: 20 } }}>{n.icon}</ListItemIcon>
        <ListItemText primary={n.label} slotProps={{ primary: { sx: { fontWeight: current === n.key ? 600 : 400, fontSize: '0.9rem' } } }} />
      </ListItemButton>
      {sortable && (
        <Box ref={setActivatorNodeRef} className="nav-drag" component="button" type="button" aria-label={`Reorder ${n.label}`}
          {...attributes} {...listeners} aria-roledescription="drag handle"
          sx={{ all: 'unset', position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'grid', placeItems: 'center',
            width: 24, height: 24, borderRadius: '6px', cursor: isDragging ? 'grabbing' : 'grab', opacity: isDragging ? 1 : 0, transition: 'opacity .15s',
            color: current === n.key ? '#2B2522' : SIDEBAR.faint, touchAction: 'none',
            '&:hover': { color: current === n.key ? '#2B2522' : SIDEBAR.bright, background: current === n.key ? 'rgba(43,37,34,0.08)' : SIDEBAR.hover },
            '&:focus-visible': { outline: `2px solid ${tokens.rose}` } }}>
          <DragIcon sx={{ fontSize: 18 }} />
        </Box>
      )}
    </Box>
  )
}

function SidebarSection({ section, current, folded, onToggle, mini, onReorder }: {
  section: NavSection; current: string | false; folded: boolean; onToggle: () => void; mini: boolean; onReorder: (keys: string[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const keys = section.items.map(n => n.key)
  const listRef = useRef<HTMLUListElement>(null)
  const modifiers = useMemo(() => [restrictTo(listRef)], [])
  const sortable = !mini && section.items.length > 1
  // Each section is its own drag area, so pages only move within their section.
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    onReorder(arrayMove(keys, keys.indexOf(String(active.id)), keys.indexOf(String(over.id))))
  }
  const list = mini ? (
    <List disablePadding>
      {section.items.map(n => (
        <Tooltip key={n.key} title={n.label} placement="right">
          <ListItemButton component={Link} to={n.to} selected={current === n.key} aria-label={n.label}
            sx={{ justifyContent: 'center', py: 0.9, mb: 0.25 }}>
            <ListItemIcon sx={{ minWidth: 0, '& svg': { fontSize: 22 } }}>{n.icon}</ListItemIcon>
          </ListItemButton>
        </Tooltip>
      ))}
    </List>
  ) : (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={modifiers}
      accessibility={{ screenReaderInstructions: { draggable: 'Press space to pick up this page, use the arrow keys to move it within its section, and space again to drop it.' } }}>
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        <List disablePadding ref={listRef}>
          {section.items.map(n => <NavRow key={n.key} n={n} current={current} sortable={sortable} />)}
        </List>
      </SortableContext>
    </DndContext>
  )
  if (!section.label) return <Box sx={{ mb: 1 }}>{list}</Box>
  // Icons only: a thin rule between sections instead of the headings.
  if (mini) return <Box component="section" aria-label={section.label} sx={{ mb: 0.75, pt: 0.75, borderTop: `1px solid ${tokens.navLine}` }}>{list}</Box>
  const id = `nav-${section.key}`
  return (
    <Box component="section" aria-labelledby={`${id}-h`} sx={{ mb: 0.75 }}>
      <ButtonBase id={`${id}-h`} onClick={onToggle} aria-expanded={!folded} aria-controls={id}
        sx={{ width: '100%', justifyContent: 'space-between', px: 1.25, py: 0.6, borderRadius: '8px', color: SIDEBAR.faint,
          fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
          '&:hover': { color: SIDEBAR.text }, '&.Mui-focusVisible': { outline: `2px solid ${tokens.rose}` } }}>
        {section.label}
        <ExpandIcon sx={{ fontSize: 18, transition: 'transform .2s', transform: folded ? 'rotate(-90deg)' : 'none' }} />
      </ButtonBase>
      <Collapse in={!folded} id={id}>{list}</Collapse>
    </Box>
  )
}

/** Keeps a page dragged with the mouse or finger inside its own section's list (up and down only). */
const restrictTo = (list: { current: HTMLElement | null }): Modifier => ({ transform, draggingNodeRect }) => {
  const t = { ...transform, x: 0 }
  const bounds = list.current?.getBoundingClientRect()
  if (!draggingNodeRect || !bounds) return t
  const minY = bounds.top - draggingNodeRect.top
  const maxY = bounds.bottom - draggingNodeRect.bottom
  return { ...t, y: Math.min(Math.max(t.y, minY), maxY) }
}

/** The person's own order of pages within each section (saved to their account). */
function orderSections(sections: NavSection[], order: Record<string, string[]> | undefined): NavSection[] {
  if (!order) return sections
  return sections.map(s => {
    const o = order[s.key]
    if (!o?.length) return s
    const rank = (k: string) => { const i = o.indexOf(k); return i < 0 ? o.length + s.items.findIndex(n => n.key === k) : i }
    return { ...s, items: [...s.items].sort((a, b) => rank(a.key) - rank(b.key)) }
  })
}

export function AppShell() {
  const { isAdmin, isPartner, partnerCan, canSeePay, me, api, refresh, business } = useApp()
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const { pathname } = useLocation()
  const [folded, toggleFolded] = useFolded()
  const [mini, toggleMini] = useMini()
  const allowed = (n: NavItem) => isPartner
    ? n.partner === 'any' || (!!n.partner && n.partner.some(partnerCan))
    : !n.who || (n.who === 'admin' ? isAdmin : canSeePay)
  // Page order within sections: the person's own, kept locally while it saves.
  const [navOrder, setNavOrder] = useState<Record<string, string[]> | undefined>(me?.preferences?.navOrder)
  useEffect(() => setNavOrder(me?.preferences?.navOrder), [me?.preferences?.navOrder])
  const reorder = (section: string, keys: string[]) => {
    const next = { ...navOrder, [section]: keys }
    setNavOrder(next)
    if (me) api.updateProfile(me.id, { preferences: { ...me.preferences, navOrder: next } }).then(refresh).catch(() => { /* kept on screen; saves next time */ })
  }
  const sections = orderSections(SECTIONS.map(s => ({ ...s, items: s.items.filter(allowed) })).filter(s => s.items.length), navOrder)
  const all = SECTIONS.flatMap(s => s.items)
  const current = all.find(n => n.to !== '/' && pathname.startsWith(n.to))?.key ?? (pathname === '/' ? 'today' : false)
  const home = isPartner ? '/business' : '/'
  const searchPages = sections.flatMap(s => s.items.map(n => ({ key: n.key, to: n.to, label: n.label, icon: n.icon, section: s.label })))

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {desktop && (
        <Box component="nav" aria-label="Main" sx={{ width: mini ? MINI : DRAWER, flexShrink: 0, position: 'sticky', top: 0, height: '100vh',
          transition: 'width .2s ease', zIndex: 6,
          display: 'flex', flexDirection: 'column', background: SIDEBAR.bg, color: SIDEBAR.text, borderRight: `1px solid ${tokens.navLine}`, px: mini ? 1 : 1.5, ...sidebarItems }}>
          <Stack direction={mini ? 'column' : 'row'} spacing={1} sx={{ alignItems: 'center', pt: 2.25, pb: 1.75 }}>
            <ButtonBase component={Link} to={home} aria-label={isPartner ? 'Home' : 'Home: Today'}
              sx={{ flex: mini ? 'none' : 1, minWidth: 0, justifyContent: mini ? 'center' : 'flex-start', px: mini ? 0.5 : 1, py: 0.5, borderRadius: '12px', '&:hover': { background: SIDEBAR.hover } }}>
              <BrandLogo height={mini ? 44 : 48} />
              {!mini && business?.name && (
                <Typography component="span" sx={{ ml: 1.25, fontFamily: fonts.display, fontWeight: 500, fontSize: '1.02rem', lineHeight: 1.15,
                  color: SIDEBAR.bright, textAlign: 'left', minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {business.name}
                </Typography>
              )}
            </ButtonBase>
            {!isPartner && <NotificationBell tone="nav" />}
          </Stack>
          {/* Scrolls only on short screens, without a visible scrollbar. */}
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', mx: mini ? -1 : -1.5, px: mini ? 1 : 1.5, pb: 2,
            scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
            maskImage: 'linear-gradient(to bottom, #000 calc(100% - 28px), transparent)' }}>
            {sections.map(s => (
              <SidebarSection key={s.key} section={s} current={current} mini={mini}
                folded={!mini && folded.includes(s.key) && !s.items.some(n => n.key === current)}
                onToggle={() => toggleFolded(s.key)} onReorder={keys => reorder(s.key, keys)} />
            ))}
          </Box>
          {/* Fold the menu to icons: a round arrow on the edge, halfway down. */}
          <Tooltip title={mini ? 'Show labels' : 'Icons only'} placement="right">
            <IconButton onClick={toggleMini} aria-label={mini ? 'Expand menu' : 'Collapse menu to icons'} aria-expanded={!mini}
              sx={{ position: 'absolute', top: '50%', right: 0, transform: 'translate(50%, -50%)', width: 28, height: 28, borderRadius: '50%',
                bgcolor: tokens.surface, color: tokens.inkSoft, border: `1px solid ${tokens.lineStrong}`,
                boxShadow: `0 6px 16px -6px ${tokens.shadow}`, transition: 'background .15s, color .15s, border-color .15s, box-shadow .15s',
                '&:hover': { bgcolor: tokens.rose, color: '#2B2522', borderColor: tokens.rose, boxShadow: `0 6px 18px -6px rgba(247,155,164,0.8)` } }}>
              <ChevronIcon sx={{ fontSize: 18, transition: 'transform .25s ease', transform: mini ? 'rotate(180deg)' : 'none' }} />
            </IconButton>
          </Tooltip>
          <Stack direction={mini ? 'column' : 'row'} spacing={mini ? 0.5 : 1.25} sx={{ mt: 1, mb: 2, flexShrink: 0, p: mini ? 0.75 : 1.25, alignItems: 'center', borderRadius: '14px', bgcolor: tokens.navPanel }}>
            {me && <Tooltip title={mini ? me.full_name : ''} placement="right"><span><PersonAvatar name={me.full_name} colour={me.colour} size={34} /></span></Tooltip>}
            {!mini && <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontWeight: 500, fontSize: '0.88rem', color: SIDEBAR.bright }} noWrap>{me?.full_name}</Typography>
              <Typography variant="caption" sx={{ color: SIDEBAR.faint }}>{me?.role === 'admin' ? 'Admin' : me?.role === 'partner' ? me.partner_company ?? 'Partner' : 'Employee'}</Typography>
            </Box>}
            <Tooltip title="Sign out">
              <IconButton size="small" aria-label="Sign out" onClick={() => api.signOut()} sx={{ color: SIDEBAR.text, '&:hover': { color: SIDEBAR.bright, background: SIDEBAR.hover } }}><LogoutIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Stack>
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0, pb: desktop ? 0 : 10 }}>
        {!desktop && (
          <AppBar position="sticky" elevation={0} color="inherit" sx={{ bgcolor: tokens.surface, backdropFilter: 'blur(8px)', borderBottom: 1, borderColor: 'divider' }}>
            <Toolbar sx={{ gap: 1, minHeight: 56 }}>
              <ButtonBase component={Link} to={home} aria-label={isPartner ? 'Home' : 'Home: Today'} sx={{ gap: 1.25, flex: 1, justifyContent: 'flex-start', borderRadius: '10px', py: 0.5 }}>
                <BrandLogo height={36} />
                {business?.name && <Typography component="span" noWrap sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: '1rem', color: tokens.ink }}>{business.name}</Typography>}
              </ButtonBase>
              <SearchButton pages={searchPages} />
              <ThemeToggle />
              {!isPartner && <NotificationBell />}
              <IconButton component={Link} to="/account" aria-label="My account"><AccountIcon /></IconButton>
            </Toolbar>
          </AppBar>
        )}
        {desktop && (
          <Box sx={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1,
            px: 4, height: 60, backdropFilter: 'blur(12px)', background: `color-mix(in srgb, ${tokens.bg} 78%, transparent)` }}>
            <SearchButton pages={searchPages} />
            <ThemeToggle />
          </Box>
        )}
        <DemoBanner />
        <Box component="main" sx={{ px: { xs: 2, md: 4 }, pt: { xs: 2.5, md: 1.5 }, pb: { xs: 2.5, md: 4 }, maxWidth: 1360, mx: 'auto' }}>
          <Suspense fallback={<Loading />}><Outlet /></Suspense>
        </Box>
      </Box>
      {!desktop && <PhoneNav sections={sections} current={current} />}
    </Box>
  )
}
