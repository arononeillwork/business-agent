import { CssBaseline, ThemeProvider } from '@mui/material'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './app/query'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './app/AppContext'
import { NotifyProvider } from './app/Notify'
import { AppShell } from './app/AppShell'
import { Loading } from './components/common'
import { theme } from './theme'
import { LoginPage } from './pages/LoginPage'
import { TodayPage } from './pages/TodayPage'
import { RotaPage } from './pages/RotaPage'
import { TimecardsPage } from './pages/TimecardsPage'
import { CalendarPage } from './pages/CalendarPage'
import { TeamPage } from './pages/TeamPage'
import { BusinessPage } from './pages/BusinessPage'
import { AccountPage } from './pages/AccountPage'
import { KioskPage } from './pages/KioskPage'
import { TimeOffPage } from './pages/TimeOffPage'
import { NotActive } from './pages/StatusPages'
import { FinancesPage } from './pages/FinancesPage'
import { AlertsPage } from './pages/AlertsPage'
import { ConnectionsPage } from './pages/ConnectionsPage'

function Routed() {
  const { me, loading, isAdmin } = useApp()
  if (loading) return <Loading />
  if (!me) return <LoginPage />
  if (!me.active) return <NotActive />
  if (me.role === 'kiosk') return <KioskPage />
  return (
    <Routes>
      <Route path="/kiosk" element={<KioskPage />} />
      <Route element={<AppShell />}>
        <Route index element={<TodayPage />} />
        <Route path="rota" element={<RotaPage />} />
        <Route path="timecards" element={<TimecardsPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="time-off" element={<TimeOffPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="business" element={<BusinessPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="finances" element={<FinancesPage />} />
        <Route path="alerts" element={isAdmin ? <AlertsPage /> : <Navigate to="/" />} />
        <Route path="connections" element={isAdmin ? <ConnectionsPage /> : <Navigate to="/" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  )
}

// The demo-only build is served from a single page URL, so it routes with the hash.
const Router = import.meta.env.VITE_DEMO_ONLY === '1' ? HashRouter : BrowserRouter

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <NotifyProvider>
        <AppProvider>
          <Router>
            <Routed />
          </Router>
        </AppProvider>
      </NotifyProvider>
    </ThemeProvider>
    </QueryClientProvider>
  )
}
