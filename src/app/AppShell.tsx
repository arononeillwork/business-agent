import {
  Alert, AppBar, BottomNavigation, BottomNavigationAction, Box, Button, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, MenuItem, Paper, Select, Stack, Toolbar, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import TodayIcon from '@mui/icons-material/WbSunnyOutlined'
import RotaIcon from '@mui/icons-material/CalendarViewWeekOutlined'
import TimecardIcon from '@mui/icons-material/AccessTimeOutlined'
import CalendarIcon from '@mui/icons-material/EventOutlined'
import TeamIcon from '@mui/icons-material/PeopleAltOutlined'
import BusinessIcon from '@mui/icons-material/StorefrontOutlined'
import AccountIcon from '@mui/icons-material/AccountCircleOutlined'
import KioskIcon from '@mui/icons-material/TabletMacOutlined'
import DragIcon from '@mui/icons-material/DragIndicator'
import TimeOffIcon from '@mui/icons-material/BeachAccessOutlined'
import FinanceIcon from '@mui/icons-material/EuroOutlined'
import AlertsIcon from '@mui/icons-material/NotificationsNoneOutlined'
import ConnectIcon from '@mui/icons-material/HubOutlined'
import LogoutIcon from '@mui/icons-material/LogoutOutlined'
import PartnersIcon from '@mui/icons-material/HandshakeOutlined'
import MoreIcon from '@mui/icons-material/MoreHoriz'
import SportsIcon from '@mui/icons-material/SportsSoccerOutlined'
import MusicIcon from '@mui/icons-material/LibraryMusicOutlined'
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '../components/dnd'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useApp } from './AppContext'
import { businessConfig } from '../../shared/business.config'
import type { PartnerArea } from '../../shared/types'
import { Logo } from '../components/Logo'
import { PersonAvatar } from '../components/common'
import { fonts, tokens } from '../theme'

// `partner`: which partner areas show the item ('any' = every partner). Items without it are staff-only.
interface NavItem { key: string; to: string; label: string; short?: string; icon: ReactNode; who?: 'admin' | 'pay'; partner?: PartnerArea[] | 'any' }

const NAV: NavItem[] = [
  { key: 'business', to: '/business', label: 'Business', icon: <BusinessIcon />, partner: 'any' },
  { key: 'today', to: '/', label: 'Today', icon: <TodayIcon /> },
  { key: 'rota', to: '/rota', label: 'Rota', icon: <RotaIcon />, partner: ['rota', 'payroll'] },
  { key: 'timeoff', to: '/time-off', label: 'Time off', icon: <TimeOffIcon /> },
  { key: 'timecards', to: '/timecards', label: 'Timecards', short: 'Hours', icon: <TimecardIcon />, partner: ['payroll'] },
  { key: 'calendar', to: '/calendar', label: 'Calendar', icon: <CalendarIcon />, partner: ['calendar'] },
  { key: 'sports', to: '/sports', label: 'Sports', icon: <SportsIcon /> },
  { key: 'music', to: '/music', label: 'Music', icon: <MusicIcon /> },
  { key: 'team', to: '/team', label: 'Team', icon: <TeamIcon /> },
  { key: 'finances', to: '/finances', label: 'Finances', icon: <FinanceIcon />, who: 'pay', partner: ['finances'] },
  { key: 'partners', to: '/partners', label: 'Partners', icon: <PartnersIcon />, who: 'admin' },
  { key: 'alerts', to: '/alerts', label: 'Alerts', icon: <AlertsIcon />, who: 'admin' },
  { key: 'connections', to: '/connections', label: 'Connections', icon: <ConnectIcon />, who: 'admin' },
  { key: 'account', to: '/account', label: 'My account', short: 'Me', icon: <AccountIcon />, partner: 'any' },
]
export const DEFAULT_ORDER = NAV.map(n => n.key)
const DRAWER = 256

/** The person's own sidebar order, kept on this device. Unknown or missing keys fall back to the default. */
function useNavOrder(userId: string | undefined) {
  const storageKey = `nav-order:${userId ?? 'anon'}`
  const read = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as string[] | null
      if (Array.isArray(saved)) {
        const known = saved.filter(k => DEFAULT_ORDER.includes(k))
        return [...known, ...DEFAULT_ORDER.filter(k => !known.includes(k))]
      }
    } catch { /* storage unavailable */ }
    return DEFAULT_ORDER
  }
  const [order, setOrder] = useState<string[]>(read)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setOrder(read()), [storageKey])
  const save = (next: string[]) => {
    setOrder(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* storage unavailable */ }
  }
  return [order, save] as const
}

// Sample accounts for switching views in the demo (partners can't see the team list, so it's fixed here).
const DEMO_ACCOUNTS = [
  { email: 'aron@example.com', label: "Aron O'Neill (admin)" },
  { email: 'mark@example.com', label: 'Mark Murray (admin)' },
  { email: 'maria@example.com', label: 'Maria (employee)' },
  { email: 'julio@example.com', label: 'Julio (employee)' },
  { email: 'laura@gestoria.example', label: 'Laura, Gestoría Marbella (partner)' },
]

function DemoBanner() {
  const { api, me } = useApp()
  if (api.mode !== 'demo') return null
  const accounts = me?.email && !DEMO_ACCOUNTS.some(a => a.email === me.email)
    ? [...DEMO_ACCOUNTS, { email: me.email, label: `${me.full_name} (${me.role})` }] : DEMO_ACCOUNTS
  return (
    <Alert severity="info" icon={false}
      sx={{ borderRadius: 0, py: 0.25, px: { xs: 2, md: 4 }, borderBottom: 1, borderColor: 'divider', '& .MuiAlert-message': { py: 1 } }}
      action={
        <Select size="small" variant="standard" disableUnderline value={me?.email ?? ''} aria-label="View as"
          sx={{ fontSize: 14, fontWeight: 700 }} onChange={e => api.signIn(String(e.target.value), '')}>
          {accounts.map(a => <MenuItem key={a.email} value={a.email}>View as {a.label}</MenuItem>)}
        </Select>
      }>
      <b>Demo</b> · sample data, nothing is saved
    </Alert>
  )
}

/**
 * Phone: up to five tabs; when there are more pages, four tabs plus "More" (a sheet with the
 * rest, the café tablet and sign out), so every page is reachable. "My account" lives in the top bar.
 */
function PhoneNav({ items, current }: { items: NavItem[]; current: string | false }) {
  const { isAdmin, api } = useApp()
  const [more, setMore] = useState(false)
  const tabs = items.filter(n => n.key !== 'account')
  const extra = isAdmin ? 1 : 0 // café tablet
  const overflow = tabs.length + extra > 5
  const shown = overflow ? tabs.slice(0, 4) : tabs
  const rest = overflow ? tabs.slice(4) : []
  const inRest = rest.some(n => n.key === current)
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
        slotProps={{ paper: { sx: { borderTopLeftRadius: 20, borderTopRightRadius: 20, pb: 'env(safe-area-inset-bottom)' } } }}>
        <List aria-label="More pages" sx={{ py: 1.5 }} onClick={() => setMore(false)}>
          {rest.map(n => (
            <ListItemButton key={n.key} component={Link} to={n.to} selected={current === n.key} sx={{ mx: 1 }}>
              <ListItemIcon sx={{ minWidth: 40 }}>{n.icon}</ListItemIcon>
              <ListItemText primary={n.label} />
            </ListItemButton>
          ))}
          {isAdmin && (
            <ListItemButton component={Link} to="/kiosk" sx={{ mx: 1 }}>
              <ListItemIcon sx={{ minWidth: 40 }}><KioskIcon /></ListItemIcon>
              <ListItemText primary="Café tablet" />
            </ListItemButton>
          )}
          <ListItemButton onClick={() => api.signOut()} sx={{ mx: 1 }}>
            <ListItemIcon sx={{ minWidth: 40 }}><LogoutIcon /></ListItemIcon>
            <ListItemText primary="Sign out" />
          </ListItemButton>
        </List>
      </Drawer>
    </Paper>
  )
}

function SortableNavRow({ item, selected }: { item: NavItem; selected: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key })
  const { role: _role, tabIndex: _tab, ...a11y } = attributes
  return (
    <Box ref={setNodeRef} {...a11y} {...listeners}
      sx={{ transform: CSS.Transform.toString(transform), transition, position: 'relative', zIndex: isDragging ? 2 : 0,
        '&:hover .drag-handle, &:focus-within .drag-handle': { opacity: 1 } }}>
      <ListItemButton component={Link} to={item.to} selected={selected}
        aria-roledescription="sortable" aria-describedby={a11y['aria-describedby']}
        sx={{ py: 1, pl: 1.5, pr: 1, mb: 0.25,
          boxShadow: isDragging ? '0 8px 24px rgba(28,20,16,0.16)' : 'none',
          bgcolor: isDragging ? 'background.paper' : undefined, cursor: isDragging ? 'grabbing' : 'pointer' }}>
        <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}>{item.icon}</ListItemIcon>
        <ListItemText primary={item.label} slotProps={{ primary: { sx: { fontWeight: selected ? 800 : 600, fontSize: '0.95rem' } } }} />
        <Tooltip title="Drag to reorder (or focus and press Space)" placement="right">
          <DragIcon className="drag-handle" fontSize="small" aria-hidden
            sx={{ opacity: { xs: 1, md: 0 }, color: tokens.inkFaint, cursor: 'grab', transition: 'opacity .15s' }} />
        </Tooltip>
      </ListItemButton>
    </Box>
  )
}

export function AppShell() {
  const { isAdmin, isPartner, partnerCan, canSeePay, me, api } = useApp()
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const { pathname } = useLocation()
  const [order, setOrder] = useNavOrder(me?.id)
  const allowed = (n: NavItem) => isPartner
    ? n.partner === 'any' || (!!n.partner && n.partner.some(partnerCan))
    : !n.who || (n.who === 'admin' ? isAdmin : canSeePay)
  const items = useMemo(() => order.map(k => NAV.find(n => n.key === k)!).filter(n => n && allowed(n)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order, isAdmin, isPartner, canSeePay, me?.partner_access?.join()])
  const current = NAV.find(n => n.to !== '/' && pathname.startsWith(n.to))?.key ?? (pathname === '/' ? 'today' : false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) {
      setOrder(arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id))))
    }
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {desktop && (
        <Box component="nav" aria-label="Main" sx={{ width: DRAWER, flexShrink: 0, position: 'sticky', top: 0, height: '100vh',
          display: 'flex', flexDirection: 'column', bgcolor: tokens.sidebar, borderRight: 1, borderColor: 'divider', px: 1.5 }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', px: 1, py: 2.5 }}>
            <Logo size={40} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontFamily: fonts.display, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }} noWrap>{businessConfig.shortName}</Typography>
              <Typography variant="caption" sx={{ color: tokens.roseDeep, fontWeight: 600 }}>Coffee · Team app</Typography>
            </Box>
          </Stack>
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', mx: -1.5, px: 1.5, display: 'flex', flexDirection: 'column' }}>
          <Typography variant="overline" sx={{ color: 'text.disabled', px: 1.5, mt: 1 }}>Menu</Typography>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}
            accessibility={{ screenReaderInstructions: { draggable: 'To reorder, press Space, use the arrow keys, then press Space again.' } }}>
            <SortableContext items={items.map(n => n.key)} strategy={verticalListSortingStrategy}>
              <List disablePadding aria-label="Sections (drag to reorder)">
                {items.map(n => <SortableNavRow key={n.key} item={n} selected={current === n.key} />)}
              </List>
            </SortableContext>
          </DndContext>
          {isAdmin && (
            <List disablePadding sx={{ mt: 1 }}>
              <ListItemButton component={Link} to="/kiosk" sx={{ py: 1, pl: 1.5 }}>
                <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}><KioskIcon /></ListItemIcon>
                <ListItemText primary="Café tablet" slotProps={{ primary: { sx: { fontWeight: 600, fontSize: '0.95rem' } } }} />
              </ListItemButton>
            </List>
          )}
          {order.join() !== DEFAULT_ORDER.join() && (
            <Button size="small" onClick={() => setOrder(DEFAULT_ORDER)} sx={{ alignSelf: 'flex-start', ml: 1, mt: 1, color: 'text.secondary' }}>
              Reset menu order
            </Button>
          )}
          </Box>
          <Stack direction="row" spacing={1.25} sx={{ mt: 1.5, mb: 2, flexShrink: 0, p: 1.25, alignItems: 'center', borderRadius: 3, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
            {me && <PersonAvatar name={me.full_name} colour={me.colour} size={36} />}
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }} noWrap>{me?.full_name}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{me?.role === 'admin' ? 'Admin' : me?.role === 'partner' ? me.partner_company ?? 'Partner' : 'Employee'}</Typography>
            </Box>
            <Tooltip title="Sign out">
              <IconButton size="small" aria-label="Sign out" onClick={() => api.signOut()}><LogoutIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Stack>
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0, pb: desktop ? 0 : 10 }}>
        {!desktop && (
          <AppBar position="sticky" elevation={0} color="inherit" sx={{ bgcolor: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderBottom: 1, borderColor: 'divider' }}>
            <Toolbar sx={{ gap: 1.25, minHeight: 56 }}>
              <Logo size={28} />
              <Typography sx={{ fontWeight: 800, flex: 1 }} noWrap>{businessConfig.shortName}</Typography>
              {isAdmin && <Button size="small" component={Link} to="/team">Team</Button>}
              <IconButton component={Link} to="/account" aria-label="My account"><AccountIcon /></IconButton>
            </Toolbar>
          </AppBar>
        )}
        <DemoBanner />
        <Box component="main" sx={{ px: { xs: 2, md: 4 }, py: { xs: 2.5, md: 4 }, maxWidth: 1360, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
      {!desktop && <PhoneNav items={items} current={current} />}
    </Box>
  )
}
