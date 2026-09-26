import { CssBaseline, ThemeProvider } from '@mui/material'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
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

function Routed() {
  const { me, loading, isAdmin } = useApp()
  if (loading) return <Loading />
  if (!me) return <LoginPage />
  if (me.role === 'kiosk') return <KioskPage />
  return (
    <Routes>
      <Route path="/kiosk" element={<KioskPage />} />
      <Route element={<AppShell />}>
        <Route index element={<TodayPage />} />
        <Route path="rota" element={<RotaPage />} />
        <Route path="timecards" element={<TimecardsPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="business" element={isAdmin ? <BusinessPage /> : <Navigate to="/" />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <NotifyProvider>
        <AppProvider>
          <BrowserRouter>
            <Routed />
          </BrowserRouter>
        </AppProvider>
      </NotifyProvider>
    </ThemeProvider>
  )
}
