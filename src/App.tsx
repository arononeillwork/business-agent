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
import { PlanGate } from './app/plan'
import { Fragment, lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react'
import { preferredLanguage, setLanguage, useLanguage } from './i18n'

// Pages load when first opened, so the first screen is quick on phones.
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then(m => ({ default: m[name] })))
const TodayPage = page(() => import('./pages/TodayPage'), 'TodayPage')
const MessagesPage = page(() => import('./pages/MessagesPage'), 'MessagesPage')
const ReferralsPage = page(() => import('./pages/ReferralsPage'), 'ReferralsPage')
const RotaPage = page(() => import('./pages/RotaPage'), 'RotaPage')
const TimecardsPage = page(() => import('./pages/TimecardsPage'), 'TimecardsPage')
const CalendarPage = page(() => import('./pages/CalendarPage'), 'CalendarPage')
const TeamPage = page(() => import('./pages/TeamPage'), 'TeamPage')
const BusinessPage = page(() => import('./pages/BusinessPage'), 'BusinessPage')
const AccountPage = page(() => import('./pages/AccountPage'), 'AccountPage')
const KioskPage = page(() => import('./pages/KioskPage'), 'KioskPage')
const TimeOffPage = page(() => import('./pages/TimeOffPage'), 'TimeOffPage')
const BenefitsPage = page(() => import('./pages/BenefitsPage'), 'BenefitsPage')
const RolesPage = page(() => import('./pages/RolesPage'), 'RolesPage')
const StaffRulesPage = page(() => import('./pages/StaffRulesPage'), 'StaffRulesPage')
const FinancesPage = page(() => import('./pages/FinancesPage'), 'FinancesPage')
const GrantsPage = page(() => import('./pages/GrantsPage'), 'GrantsPage')
const SalesPage = page(() => import('./pages/SalesPage'), 'SalesPage')
const TaxPage = page(() => import('./pages/TaxPage'), 'TaxPage')
const LicencesPage = page(() => import('./pages/LicencesPage'), 'LicencesPage')
const LegalDocumentsPage = page(() => import('./pages/LegalDocumentsPage'), 'LegalDocumentsPage')
const InvoicesPage = page(() => import('./pages/InvoicesPage'), 'InvoicesPage')
const CreditDebitPage = page(() => import('./pages/CreditDebitPage'), 'CreditDebitPage')
const PagesPage = page(() => import('./pages/PagesPage'), 'PagesPage')
const ProfitLossPage = page(() => import('./pages/ProfitLossPage'), 'ProfitLossPage')
const AnalyticsPage = page(() => import('./pages/AnalyticsPage'), 'AnalyticsPage')
const ReviewsPage = page(() => import('./pages/ReviewsPage'), 'ReviewsPage')
const WebsitePage = page(() => import('./pages/WebsitePage'), 'WebsitePage')
const NotificationsPage = page(() => import('./pages/NotificationsPage'), 'NotificationsPage')
const SportsPage = page(() => import('./pages/SportsPage'), 'SportsPage')
const MusicPage = page(() => import('./pages/MusicPage'), 'MusicPage')
const ConnectionsPage = page(() => import('./pages/ConnectionsPage'), 'ConnectionsPage')
const SocialPlannerPage = page(() => import('./pages/SocialPlannerPage'), 'SocialPlannerPage')
const AdsPage = page(() => import('./pages/AdsPage'), 'AdsPage')
const PartnersPage = page(() => import('./pages/PartnersPage'), 'PartnersPage')
const TodoPage = page(() => import('./pages/TodoPage'), 'TodoPage')
const CustomersPage = page(() => import('./pages/CustomersPage'), 'CustomersPage')
const LoyaltyPage = page(() => import('./pages/LoyaltyPage'), 'LoyaltyPage')
const StockPage = page(() => import('./pages/StockPage'), 'StockPage')
const SuppliersPage = page(() => import('./pages/SuppliersPage'), 'SuppliersPage')
const RecipesPage = page(() => import('./pages/RecipesPage'), 'RecipesPage')
const WastePage = page(() => import('./pages/WastePage'), 'WastePage')
const RegistroPage = page(() => import('./pages/RegistroPage'), 'RegistroPage')
const OpeningHoursPage = page(() => import('./pages/OpeningHoursPage'), 'OpeningHoursPage')
const AppearancePage = page(() => import('./pages/AppearancePage'), 'AppearancePage')
const BrandPage = page(() => import('./pages/BrandPage'), 'BrandPage')
const PrivacyPage = page(() => import('./pages/PrivacyPage'), 'PrivacyPage')
const TermsPage = page(() => import('./pages/TermsPage'), 'TermsPage')
const DataDeletionPage = page(() => import('./pages/DataDeletionPage'), 'DataDeletionPage')
const BillingPage = page(() => import('./pages/BillingPage'), 'BillingPage')
const ComparePage = page(() => import('./pages/ComparePage'), 'ComparePage')
const PricingPage = page(() => import('./pages/PricingPage'), 'PricingPage')

/** /billing → /account/billing, keeping ?checkout=… from Stripe. */
function ToBilling() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/account/billing', search }} replace />
}

function Routed() {
  const { me, loading, isAdmin, isPartner, partnerCan, canSeePay } = useApp()
  const { pathname } = useLocation()
  // Public, signed in or not (Google and others check it before approving the app).
  if (pathname === '/privacy') return <PrivacyPage />
  if (pathname === '/terms') return <TermsPage />
  if (pathname === '/data-deletion') return <DataDeletionPage />
  if (pathname === '/pricing') return <PricingPage />
  if (pathname === '/compare') return <ComparePage />
  if (loading) return <Loading />
  if (!me) return <LoginPage />
  if (!me.active) return <NotActive />
  if (me.role === 'kiosk') return <PlanGate feature="kiosk"><KioskPage /></PlanGate>
  if (isPartner) {
    // Outside businesses: read-only, only the areas an admin gave them (the database enforces it too).
    return (
      <Routes>
        {partnerCan('payroll') && <Route path="/registro" element={<RegistroPage />} />}
        <Route element={<AppShell />}>
          <Route path="business" element={<BusinessPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="appearance" element={<AppearancePage />} />
          <Route path="pages" element={<PagesPage />} />
          <Route path="opening-hours" element={<OpeningHoursPage />} />
          <Route path="brand" element={<BrandPage />} />
          {(partnerCan('rota') || partnerCan('payroll')) && <Route path="rota" element={<RotaPage />} />}
          {partnerCan('payroll') && <Route path="timecards" element={<TimecardsPage />} />}
          {partnerCan('payroll') && <Route path="benefits" element={<BenefitsPage />} />}
          {partnerCan('calendar') && <Route path="calendar" element={<CalendarPage />} />}
          {partnerCan('finances') && <Route path="finances" element={<FinancesPage />} />}
          {partnerCan('finances') && <Route path="tax" element={<TaxPage />} />}
          {partnerCan('finances') && <Route path="licences" element={<LicencesPage />} />}
          {partnerCan('finances') && <Route path="legal" element={<LegalDocumentsPage />} />}
          {partnerCan('finances') && <Route path="invoices" element={<InvoicesPage />} />}
          {partnerCan('finances') && <Route path="credit-debit" element={<CreditDebitPage />} />}
          {partnerCan('finances') && <Route path="profit-and-loss" element={<ProfitLossPage />} />}
          {partnerCan('finances') && <Route path="grants" element={<GrantsPage />} />}
          {partnerCan('finances') && <Route path="stock" element={<StockPage />} />}
          {partnerCan('finances') && <Route path="suppliers" element={<SuppliersPage />} />}
          {partnerCan('finances') && <Route path="recipes" element={<RecipesPage />} />}
          {partnerCan('finances') && <Route path="waste" element={<WastePage />} />}
          <Route path="*" element={<Navigate to="/business" />} />
        </Route>
      </Routes>
    )
  }
  return (
    <Routes>
      {/* Staff use the tablet itself (kiosk account); admins can open it to set it up. */}
      <Route path="/kiosk" element={isAdmin && FEATURES.kiosk ? <PlanGate feature="kiosk"><KioskPage /></PlanGate> : <Navigate to="/" />} />
      {/* Printable monthly hours record (no menu around it). */}
      <Route path="/registro" element={<RegistroPage />} />
      <Route element={<AppShell />}>
        <Route index element={<TodayPage />} />
        <Route path="rota" element={<RotaPage />} />
        <Route path="timecards" element={<TimecardsPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="time-off" element={<TimeOffPage />} />
        <Route path="benefits" element={<BenefitsPage />} />
        <Route path="roles" element={<RolesPage />} />
        <Route path="rules" element={<StaffRulesPage />} />
        <Route path="sports" element={<PlanGate feature="sports"><SportsPage /></PlanGate>} />
        <Route path="music" element={<PlanGate feature="music"><MusicPage /></PlanGate>} />
        <Route path="team" element={<TeamPage />} />
        <Route path="business" element={<BusinessPage />} />
        <Route path="customers" element={isAdmin ? <CustomersPage /> : <Navigate to="/" />} />
        {/* Only while Square is the till: the page itself goes to Connections otherwise. */}
        <Route path="loyalty" element={isAdmin ? <LoyaltyPage /> : <Navigate to="/" />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="suppliers" element={isAdmin ? <SuppliersPage /> : <Navigate to="/" />} />
        <Route path="recipes" element={isAdmin ? <RecipesPage /> : <Navigate to="/" />} />
        <Route path="waste" element={<WastePage />} />
        <Route path="todo" element={<TodoPage />} />
        <Route path="opening-hours" element={<OpeningHoursPage />} />
        <Route path="brand" element={<BrandPage />} />
        <Route path="appearance" element={<AppearancePage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="finances" element={<FinancesPage />} />
        <Route path="tax" element={<TaxPage />} />
        <Route path="licences" element={isAdmin ? <LicencesPage /> : <Navigate to="/" />} />
        <Route path="legal" element={isAdmin ? <LegalDocumentsPage /> : <Navigate to="/" />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="credit-debit" element={<CreditDebitPage />} />
        <Route path="profit-and-loss" element={<ProfitLossPage />} />
        <Route path="grants" element={<GrantsPage />} />
        <Route path="sales" element={canSeePay ? <PlanGate feature="takings"><SalesPage /></PlanGate> : <Navigate to="/" />} />
        {/* Sales was briefly under Finances, and Accounts is a menu section: old links still land. */}
        <Route path="finances/sales" element={<Navigate to="/sales" replace />} />
        <Route path="accounts" element={<Navigate to="/finances" replace />} />
        <Route path="analytics" element={isAdmin ? <AnalyticsPage /> : <Navigate to="/" />} />
        <Route path="reviews" element={isAdmin ? <ReviewsPage /> : <Navigate to="/" />} />
        <Route path="website" element={isAdmin ? <WebsitePage /> : <Navigate to="/" />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="pages" element={<PagesPage />} />
        {/* Alerts became part of Notifications. */}
        <Route path="alerts" element={<Navigate to="/notifications" replace />} />
        <Route path="account/billing" element={isAdmin ? <BillingPage /> : <Navigate to="/" />} />
        {/* Billing used to be under Settings: old links (and Stripe's way back) still land on it. */}
        <Route path="billing" element={<ToBilling />} />
        <Route path="connections" element={isAdmin ? <ConnectionsPage /> : <Navigate to="/" />} />
        <Route path="social" element={isAdmin ? <SocialPlannerPage /> : <Navigate to="/" />} />
        <Route path="ads" element={isAdmin ? <AdsPage /> : <Navigate to="/" />} />
        <Route path="messages" element={isAdmin ? <MessagesPage /> : <Navigate to="/" />} />
        <Route path="referrals" element={isAdmin ? <ReferralsPage /> : <Navigate to="/" />} />
        <Route path="setup" element={<Navigate to="/" replace />} />
        <Route path="partners" element={isAdmin && FEATURES.partners ? <PlanGate feature="partners"><PartnersPage /></PlanGate> : <Navigate to="/" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  )
}

/**
 * Shows the app in the signed-in person's language, and redraws everything when it changes (text is
 * looked up as each page renders). Signed out, it keeps the language last used on this device.
 */
function InLanguage({ children }: { children: ReactNode }) {
  const { me } = useApp()
  const language = useLanguage()
  const wanted = me ? preferredLanguage(me.preferences) : null
  // Only when what the account asks for changes: a flag pressed a moment ago isn't undone while it saves.
  useEffect(() => { if (wanted) void setLanguage(wanted) }, [wanted])
  return <Fragment key={language}>{children}</Fragment>
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
            <InLanguage><Suspense fallback={<Loading />}><Routed /></Suspense></InLanguage>
          </Router>
        </AppProvider>
      </NotifyProvider>
    </ThemeProvider>
    </QueryClientProvider>
  )
}
