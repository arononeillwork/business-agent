import { CssBaseline, ThemeProvider } from '@mui/material'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './app/query'
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './app/AppContext'
import { NotifyProvider } from './app/Notify'
import { AppShell } from './app/AppShell'
import { FEATURES } from './app/features'
import { Loading } from './components/common'
import { theme } from './theme'
import { AppearanceSync } from './app/Appearance'
import { LoginPage } from './pages/LoginPage'
import { NotActive } from './pages/StatusPages'
import { lazy, Suspense, type ComponentType } from 'react'

// Pages load when first opened, so the first screen is quick on phones.
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then(m => ({ default: m[name] })))
const TodayPage = page(() => import('./pages/TodayPage'), 'TodayPage')
const RotaPage = page(() => import('./pages/RotaPage'), 'RotaPage')
const TimecardsPage = page(() => import('./pages/TimecardsPage'), 'TimecardsPage')
const CalendarPage = page(() => import('./pages/CalendarPage'), 'CalendarPage')
const TeamPage = page(() => import('./pages/TeamPage'), 'TeamPage')
const BusinessPage = page(() => import('./pages/BusinessPage'), 'BusinessPage')
const AccountPage = page(() => import('./pages/AccountPage'), 'AccountPage')
const KioskPage = page(() => import('./pages/KioskPage'), 'KioskPage')
const TimeOffPage = page(() => import('./pages/TimeOffPage'), 'TimeOffPage')
const FinancesPage = page(() => import('./pages/FinancesPage'), 'FinancesPage')
const AlertsPage = page(() => import('./pages/AlertsPage'), 'AlertsPage')
const SportsPage = page(() => import('./pages/SportsPage'), 'SportsPage')
const MusicPage = page(() => import('./pages/MusicPage'), 'MusicPage')
const ConnectionsPage = page(() => import('./pages/ConnectionsPage'), 'ConnectionsPage')
const SocialPlannerPage = page(() => import('./pages/SocialPlannerPage'), 'SocialPlannerPage')
const SetupPage = page(() => import('./pages/SetupPage'), 'SetupPage')
const PartnersPage = page(() => import('./pages/PartnersPage'), 'PartnersPage')
const RegistroPage = page(() => import('./pages/RegistroPage'), 'RegistroPage')
const OpeningHoursPage = page(() => import('./pages/OpeningHoursPage'), 'OpeningHoursPage')
const AppearancePage = page(() => import('./pages/AppearancePage'), 'AppearancePage')
const BrandPage = page(() => import('./pages/BrandPage'), 'BrandPage')
const PrivacyPage = page(() => import('./pages/PrivacyPage'), 'PrivacyPage')

function Routed() {
  const { me, loading, isAdmin, isPartner, partnerCan } = useApp()
  const { pathname } = useLocation()
  // Public, signed in or not (Google and others check it before approving the app).
  if (pathname === '/privacy') return <PrivacyPage />
  if (loading) return <Loading />
  if (!me) return <LoginPage />
  if (!me.active) return <NotActive />
  if (me.role === 'kiosk') return <KioskPage />
  if (isPartner) {
    // Outside businesses: read-only, only the areas an admin gave them (the database enforces it too).
    return (
      <Routes>
        {partnerCan('payroll') && <Route path="/registro" element={<RegistroPage />} />}
        <Route element={<AppShell />}>
          <Route path="business" element={<BusinessPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="appearance" element={<AppearancePage />} />
          <Route path="opening-hours" element={<OpeningHoursPage />} />
          <Route path="brand" element={<BrandPage />} />
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
      <Route path="/kiosk" element={isAdmin && FEATURES.kiosk ? <KioskPage /> : <Navigate to="/" />} />
      {/* Printable monthly hours record (no menu around it). */}
      <Route path="/registro" element={<RegistroPage />} />
      <Route element={<AppShell />}>
        <Route index element={<TodayPage />} />
        <Route path="rota" element={<RotaPage />} />
        <Route path="timecards" element={<TimecardsPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="time-off" element={<TimeOffPage />} />
        <Route path="sports" element={<SportsPage />} />
        <Route path="music" element={<MusicPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="business" element={<BusinessPage />} />
        <Route path="opening-hours" element={<OpeningHoursPage />} />
        <Route path="brand" element={<BrandPage />} />
        <Route path="appearance" element={<AppearancePage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="finances" element={<FinancesPage />} />
        <Route path="alerts" element={isAdmin ? <AlertsPage /> : <Navigate to="/" />} />
        <Route path="connections" element={isAdmin ? <ConnectionsPage /> : <Navigate to="/" />} />
        <Route path="social" element={isAdmin ? <SocialPlannerPage /> : <Navigate to="/" />} />
        <Route path="setup" element={isAdmin ? <SetupPage /> : <Navigate to="/" />} />
        <Route path="partners" element={isAdmin && FEATURES.partners ? <PartnersPage /> : <Navigate to="/" />} />
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
    <ThemeProvider theme={theme} defaultMode="system" disableTransitionOnChange>
      <CssBaseline />
      <NotifyProvider>
        <AppProvider>
          <AppearanceSync />
          <Router>
            <Suspense fallback={<Loading />}><Routed /></Suspense>
          </Router>
        </AppProvider>
      </NotifyProvider>
    </ThemeProvider>
    </QueryClientProvider>
  )
}
