import {
  Alert, AppBar, BottomNavigation, BottomNavigationAction, Box, Button, Divider, Drawer, List,
  ListItemButton, ListItemIcon, ListItemText, MenuItem, Paper, Select, Toolbar, Typography,
  useMediaQuery, useTheme,
} from '@mui/material'
import TodayIcon from '@mui/icons-material/WbSunnyOutlined'
import RotaIcon from '@mui/icons-material/CalendarViewWeekOutlined'
import TimecardIcon from '@mui/icons-material/AccessTimeOutlined'
import CalendarIcon from '@mui/icons-material/EventOutlined'
import TeamIcon from '@mui/icons-material/PeopleAltOutlined'
import BusinessIcon from '@mui/icons-material/StorefrontOutlined'
import AccountIcon from '@mui/icons-material/AccountCircleOutlined'
import KioskIcon from '@mui/icons-material/TabletMacOutlined'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useApp } from './AppContext'
import { businessConfig } from '../../shared/business.config'
import { Logo } from '../components/Logo'

const NAV = [
  { to: '/', label: 'Today', icon: <TodayIcon /> },
  { to: '/rota', label: 'Rota', icon: <RotaIcon /> },
  { to: '/timecards', label: 'Timecards', icon: <TimecardIcon /> },
  { to: '/calendar', label: 'Calendar', icon: <CalendarIcon /> },
  { to: '/team', label: 'Team', icon: <TeamIcon /> },
  { to: '/business', label: 'Business', icon: <BusinessIcon />, admin: true },
  { to: '/account', label: 'My account', icon: <AccountIcon /> },
]
const DRAWER = 220

function DemoBanner() {
  const { api, me, profiles } = useApp()
  if (api.mode !== 'demo') return null
  return (
    <Alert severity="info" sx={{ borderRadius: 0, py: 0, alignItems: 'center' }}
      action={
        <Select size="small" variant="standard" value={me?.email ?? ''} sx={{ fontSize: 14 }}
          onChange={e => api.signIn(String(e.target.value), '')}>
          {profiles.filter(p => p.email).map(p => (
            <MenuItem key={p.id} value={p.email!}>View as {p.full_name} ({p.role})</MenuItem>
          ))}
        </Select>
      }>
      Demo mode with sample data. Nothing is saved.
    </Alert>
  )
}

export function AppShell() {
  const { isAdmin, me, api } = useApp()
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const { pathname } = useLocation()
  const items = NAV.filter(n => !n.admin || isAdmin)
  const current = items.find(n => n.to !== '/' && pathname.startsWith(n.to))?.to ?? (pathname === '/' ? '/' : false)
  const mobileItems = items.filter(n => ['/', '/rota', '/timecards', '/calendar', '/account'].includes(n.to))

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {desktop && (
        <Drawer variant="permanent" sx={{ width: DRAWER, '& .MuiDrawer-paper': { width: DRAWER, boxSizing: 'border-box' } }}>
          <Toolbar sx={{ gap: 1 }}>
            <Logo size={28} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{businessConfig.shortName}</Typography>
          </Toolbar>
          <Divider />
          <List>
            {items.map(n => (
              <ListItemButton key={n.to} component={Link} to={n.to} selected={current === n.to}>
                <ListItemIcon sx={{ minWidth: 36 }}>{n.icon}</ListItemIcon>
                <ListItemText primary={n.label} />
              </ListItemButton>
            ))}
            {isAdmin && (
              <ListItemButton component={Link} to="/kiosk">
                <ListItemIcon sx={{ minWidth: 36 }}><KioskIcon /></ListItemIcon>
                <ListItemText primary="Kiosk mode" />
              </ListItemButton>
            )}
          </List>
          <Box sx={{ mt: 'auto', p: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{me?.full_name}</Typography>
            <Typography variant="caption" color="text.secondary">{me?.role === 'admin' ? 'Admin' : 'Employee'}</Typography>
            <Button size="small" onClick={() => api.signOut()} sx={{ display: 'block', px: 0 }}>Sign out</Button>
          </Box>
        </Drawer>
      )}
      <Box sx={{ flex: 1, minWidth: 0, pb: desktop ? 0 : 8 }}>
        {!desktop && (
          <AppBar position="sticky" elevation={0}>
            <Toolbar variant="dense" sx={{ gap: 1 }}>
              <Logo size={24} />
              <Typography sx={{ fontWeight: 700, flex: 1 }}>{businessConfig.shortName}</Typography>
              {isAdmin && <Button color="inherit" size="small" component={Link} to="/team">Team</Button>}
              {isAdmin && <Button color="inherit" size="small" component={Link} to="/business">Business</Button>}
            </Toolbar>
          </AppBar>
        )}
        <DemoBanner />
        <Box component="main" sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
      {!desktop && (
        <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10, pb: 'env(safe-area-inset-bottom)' }} elevation={3}>
          <BottomNavigation showLabels value={current}>
            {mobileItems.map(n => (
              <BottomNavigationAction key={n.to} value={n.to} label={n.label === 'My account' ? 'Me' : n.label}
                icon={n.icon} component={Link} to={n.to} sx={{ minWidth: 0 }} />
            ))}
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  )
}
