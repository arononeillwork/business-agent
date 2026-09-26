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
import { PartnersPage } from './pages/PartnersPage'

function Routed() {
  const { me, loading, isAdmin, isPartner, partnerCan } = useApp()
  if (loading) return <Loading />
  if (!me) return <LoginPage />
  if (!me.active) return <NotActive />
  if (me.role === 'kiosk') return <KioskPage />
  if (isPartner) {
    // Outside businesses: read-only, only the areas an admin gave them (the database enforces it too).
    return (
      <Routes>
        <Route element={<AppShell />}>
          <Route path="business" element={<BusinessPage />} />
          <Route path="account" element={<AccountPage />} />
          {(partnerCan('rota') || partnerCan('payroll')) && <Route path="rota" element={<RotaPage />} />}
          {partnerCan('payroll') && <Route path="timecards" element={<TimecardsPage />} />}
          {partnerCan('calendar') && <Route path="calendar" element={<CalendarPage />} />}
          {partnerCan('finances') && <Route path="finances" element={<FinancesPage />} />}
          <Route path="*" element={<Navigate to="/business" />} />
        </Route>
      </Routes>
    )
  }
  return (
    <Routes>
      {/* Staff use the tablet itself (kiosk account); admins can open it to set it up. */}
      <Route path="/kiosk" element={isAdmin ? <KioskPage /> : <Navigate to="/" />} />
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
        <Route path="partners" element={isAdmin ? <PartnersPage /> : <Navigate to="/" />} />
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
