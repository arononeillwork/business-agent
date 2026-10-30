import {
  Alert, AppBar, Badge, BottomNavigation, BottomNavigationAction, Box, ButtonBase, Collapse, Divider, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem, Paper, Select, Stack, Toolbar, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import TodayIcon from '@mui/icons-material/WbSunnyOutlined'
import RotaIcon from '@mui/icons-material/CalendarViewWeekOutlined'
import TimecardIcon from '@mui/icons-material/AccessTimeOutlined'
import CalendarIcon from '@mui/icons-material/EventOutlined'
import TeamIcon from '@mui/icons-material/PeopleAltOutlined'
import PeopleIcon from '@mui/icons-material/AccountTreeOutlined'
import BusinessIcon from '@mui/icons-material/StorefrontOutlined'
import CustomersIcon from '@mui/icons-material/ContactsOutlined'
import LoyaltyIcon from '@mui/icons-material/LoyaltyOutlined'
import StockIcon from '@mui/icons-material/Inventory2Outlined'
import SuppliersIcon from '@mui/icons-material/LocalShippingOutlined'
import WholesaleIcon from '@mui/icons-material/WarehouseOutlined'
import RecipesIcon from '@mui/icons-material/MenuBookOutlined'
import MenuIcon from '@mui/icons-material/RestaurantMenuOutlined'
import ScreensIcon from '@mui/icons-material/TvOutlined'
import CamerasIcon from '@mui/icons-material/VideocamOutlined'
import WasteIcon from '@mui/icons-material/DeleteSweepOutlined'
import TodoIcon from '@mui/icons-material/ChecklistRtlOutlined'
import HoursIcon from '@mui/icons-material/ScheduleOutlined'
import BrandIcon from '@mui/icons-material/BrushOutlined'
import AccountIcon from '@mui/icons-material/AccountCircleOutlined'
import AiIcon from '@mui/icons-material/SmartToyOutlined'
import AppearanceIcon from '@mui/icons-material/PaletteOutlined'
import KioskIcon from '@mui/icons-material/TabletMacOutlined'
import TimeOffIcon from '@mui/icons-material/BeachAccessOutlined'
import BenefitsIcon from '@mui/icons-material/CardGiftcardOutlined'
import KittyIcon from '@mui/icons-material/SavingsOutlined'
import RepsIcon from '@mui/icons-material/RecordVoiceOverOutlined'
import RolesIcon from '@mui/icons-material/AssignmentIndOutlined'
import RulesIcon from '@mui/icons-material/RuleOutlined'
import OutsourcingIcon from '@mui/icons-material/BusinessCenterOutlined'
import FinanceIcon from '@mui/icons-material/PaymentsOutlined'
import SalesIcon from '@mui/icons-material/InsightsOutlined'
import TaxIcon from '@mui/icons-material/ReceiptLongOutlined'
import DocumentsIcon from '@mui/icons-material/FolderOutlined'
import LegalIcon from '@mui/icons-material/GavelOutlined'
import InvoicesIcon from '@mui/icons-material/DescriptionOutlined'
import ProfitLossIcon from '@mui/icons-material/RequestQuoteOutlined'
import GrantsIcon from '@mui/icons-material/VolunteerActivismOutlined'
import CreditDebitIcon from '@mui/icons-material/CompareArrowsOutlined'
import BillingIcon from '@mui/icons-material/CreditCardOutlined'
import SocialIcon from '@mui/icons-material/CampaignOutlined'
import AdsIcon from '@mui/icons-material/AdsClickOutlined'
import OffersIcon from '@mui/icons-material/LocalOfferOutlined'
import CompetitionsIcon from '@mui/icons-material/EmojiEventsOutlined'
import CampaignsIcon from '@mui/icons-material/ForwardToInboxOutlined'
import LeadsIcon from '@mui/icons-material/ContactMailOutlined'
import ClaimsIcon from '@mui/icons-material/ReceiptOutlined'
import HiringIcon from '@mui/icons-material/BadgeOutlined'
import FoodSafetyIcon from '@mui/icons-material/ThermostatOutlined'
import AllergensIcon from '@mui/icons-material/NoMealsOutlined'
import TipsIcon from '@mui/icons-material/SavingsOutlined'
import MessagesIcon from '@mui/icons-material/ChatBubbleOutlineRounded'
import ReferralsIcon from '@mui/icons-material/CardGiftcardOutlined'
import NotificationsIcon from '@mui/icons-material/NotificationsNoneOutlined'
import ConnectIcon from '@mui/icons-material/HubOutlined'
import PagesIcon from '@mui/icons-material/VisibilityOutlined'
import LogoutIcon from '@mui/icons-material/LogoutOutlined'
import PartnersIcon from '@mui/icons-material/HandshakeOutlined'
import MoreIcon from '@mui/icons-material/MoreHoriz'
import SportsIcon from '@mui/icons-material/SportsSoccerOutlined'
import MusicIcon from '@mui/icons-material/LibraryMusicOutlined'
import AnalyticsIcon from '@mui/icons-material/QueryStatsOutlined'
import ReviewsIcon from '@mui/icons-material/StarOutlineRounded'
import WebsiteIcon from '@mui/icons-material/LanguageOutlined'
import CompetitorsIcon from '@mui/icons-material/StorefrontOutlined'
import DashboardsIcon from '@mui/icons-material/SpaceDashboardOutlined'
import AdvisorIcon from '@mui/icons-material/TipsAndUpdatesOutlined'
import ExpandIcon from '@mui/icons-material/ExpandMore'
import DragIcon from '@mui/icons-material/DragIndicator'
import PinIcon from '@mui/icons-material/PushPin'
import PinOutlineIcon from '@mui/icons-material/PushPinOutlined'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type Modifier } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ChevronIcon from '@mui/icons-material/ChevronLeftRounded'
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useApp } from './AppContext'
import { FEATURES } from './features'
import { useUnreadMessages } from './unread'
import { useConnected } from './connected'
import type { PartnerArea } from '../../shared/types'
import { hiddenByRole, roleNamesOf } from '../../shared/roles'
import { teamRoleLabel } from '../../shared/teamRoles'
import { BrandLogo } from '../components/Logo'
import { AssistantButton } from '../components/Assistant'
import { Loading, PersonAvatar, TitleSlot } from '../components/common'
import { KeyboardSensorNow } from '../components/dnd'
import { NotificationBell } from '../components/NotificationBell'
import { CafeSpeakerProvider } from './CafeSpeaker'
import { BillingBanner } from './plan'
import { SearchButton, ThemeToggle } from './QuickActions'
import { fonts, tokens } from '../theme'
import { msg, t, tc, tr } from '../i18n'
import { LanguageToggle } from '../components/Language'

// `partner`: which partner areas show the item ('any' = every partner). Items without it are staff-only.
// `children`: sub-pages, shown indented under the item when it's opened (or its arrow is pressed).
// `needs`: shown only while that app is connected (Loyalty & gift cards: Square).
export interface NavItem {
  key: string; to: string; label: string; short?: string; icon: ReactNode; who?: 'admin' | 'pay'; partner?: PartnerArea[] | 'any'; children?: NavItem[]; needs?: 'square'
  /** The label's English means something else elsewhere: its Spanish is kept under "context|label" (see tc). */
  context?: string
}
export interface NavSection { key: string; label: string | null; items: NavItem[] }

// The menu, in sections. Today is the landing page: the logo goes there, so it has no menu item.
export const SECTIONS: NavSection[] = [
  { key: 'business', label: msg('Business'), items: [
    // The team as a hierarchy, each with their roles and pets: first in the menu.
    { key: 'people', to: '/people', label: msg('People'), icon: <PeopleIcon /> },
    { key: 'business', to: '/business', label: msg('Business'), icon: <BusinessIcon />, partner: 'any' },
    { key: 'todo', to: '/todo', label: msg('To Do List'), short: msg('To do'), icon: <TodoIcon /> },
    { key: 'hours', to: '/opening-hours', label: msg('Opening hours'), icon: <HoursIcon />, partner: 'any' },
    { key: 'documents', to: '/documents', label: msg('Documents'), icon: <DocumentsIcon />, who: 'pay', partner: ['finances'] },
    { key: 'legal', to: '/legal', label: msg('Legal & licences'), short: msg('Legal'), icon: <LegalIcon />, who: 'admin', partner: ['finances'] },
    { key: 'brand', to: '/brand', label: msg('Brand'), icon: <BrandIcon />, partner: 'any' },
    { key: 'messages', to: '/messages', label: msg('Messages'), icon: <MessagesIcon />, who: 'admin' },
    { key: 'cameras', to: '/cameras', label: msg('Cameras'), icon: <CamerasIcon />, who: 'admin' },
  ] },
  // What the figures say: each person's own dashboards, and the Business advisor's findings.
  { key: 'insights', label: msg('Insights'), items: [
    { key: 'dashboards', to: '/dashboards', label: msg('Dashboards'), icon: <DashboardsIcon /> },
    { key: 'advisor', to: '/advisor', label: msg('Business advisor'), short: msg('Advisor'), icon: <AdvisorIcon />, who: 'admin' },
  ] },
  // Takings from the till (Square, SumUp or Stripe) and the people who buy; the running costs; then
  // marketing (the social planner and how the website does): a section each.
  { key: 'sales', label: msg('Sales'), items: [
    { key: 'sales', to: '/sales', label: msg('Sales'), icon: <SalesIcon />, who: 'pay' },
    { key: 'customers', to: '/customers', label: msg('Customers'), icon: <CustomersIcon />, who: 'admin' },
    { key: 'leads', to: '/leads', label: msg('Leads & enquiries'), short: msg('Leads'), icon: <LeadsIcon />, who: 'admin' },
    { key: 'loyalty', to: '/loyalty', label: msg('Loyalty & gift cards'), short: msg('Loyalty'), icon: <LoyaltyIcon />, who: 'admin', needs: 'square' },
    { key: 'reps', to: '/sales-reps', label: msg('Reps & rewards'), short: msg('Reps'), icon: <RepsIcon /> },
  ] },
  // The menu as customers see it (everyone reads it; admins design the printed and screen menus),
  // and the café's screens that play it.
  { key: 'menu', label: msg('Menu'), items: [
    { key: 'menu', to: '/menu', label: msg('Menu'), icon: <MenuIcon />, partner: ['finances'] },
    { key: 'screens', to: '/screens', label: msg('Screens'), icon: <ScreensIcon />, who: 'admin' },
  ] },
  // What's bought wholesale and sold in the shop, and who from. The team counts; admins price and order.
  { key: 'stock', label: msg('Stock'), items: [
    { key: 'stock', to: '/stock', label: msg('Current stock'), icon: <StockIcon />, partner: ['finances'] },
    { key: 'wholesale', to: '/wholesale', label: msg('Wholesale'), icon: <WholesaleIcon />, who: 'admin', partner: ['finances'] },
    { key: 'suppliers', to: '/suppliers', label: msg('Suppliers'), icon: <SuppliersIcon />, who: 'admin', partner: ['finances'] },
    { key: 'recipes', to: '/recipes', label: msg('Menu costing'), icon: <RecipesIcon />, who: 'admin', partner: ['finances'] },
    { key: 'allergens', to: '/allergens', label: msg('Allergens'), icon: <AllergensIcon />, partner: ['finances'] },
    { key: 'foodsafety', to: '/food-safety', label: msg('Food safety'), icon: <FoodSafetyIcon /> },
    { key: 'waste', to: '/waste', label: msg('Waste log'), icon: <WasteIcon />, partner: ['finances'] },
  ] },
  { key: 'accounts', label: msg('Accounts'), items: [
    { key: 'finances', to: '/finances', label: msg('Finances'), icon: <FinanceIcon />, who: 'pay', partner: ['finances'] },
    { key: 'pnl', to: '/profit-and-loss', label: msg('Profit & loss'), icon: <ProfitLossIcon />, who: 'pay', partner: ['finances'] },
    { key: 'invoices', to: '/invoices', label: msg('Invoices'), icon: <InvoicesIcon />, who: 'pay', partner: ['finances'] },
    { key: 'credit', to: '/credit-debit', label: msg('Credit & debit'), icon: <CreditDebitIcon />, who: 'pay', partner: ['finances'] },
    { key: 'expenses', to: '/expenses', label: msg('Expenses'), icon: <ClaimsIcon />, partner: ['finances'] },
    { key: 'tax', to: '/tax', label: msg('Tax'), icon: <TaxIcon />, who: 'pay', partner: ['finances'] },
    { key: 'grants', to: '/grants', label: msg('Grants'), icon: <GrantsIcon />, who: 'pay', partner: ['finances'] },
  ] },
  { key: 'marketing', label: msg('Marketing'), items: [
    { key: 'social', to: '/social', label: msg('Social planner'), icon: <SocialIcon />, who: 'admin' },
    { key: 'offers', to: '/offers', label: msg('Offers & specials'), short: msg('Offers'), icon: <OffersIcon />, who: 'admin' },
    { key: 'competitions', to: '/competitions', label: msg('Competitions'), context: 'marketing', icon: <CompetitionsIcon />, who: 'admin' },
    { key: 'campaigns', to: '/campaigns', label: msg('Campaigns'), icon: <CampaignsIcon />, who: 'admin' },
    { key: 'ads', to: '/ads', label: msg('Ads'), icon: <AdsIcon />, who: 'admin' },
    { key: 'analytics', to: '/analytics', label: msg('Analytics'), icon: <AnalyticsIcon />, who: 'admin' },
    { key: 'reviews', to: '/reviews', label: msg('Reviews'), icon: <ReviewsIcon />, who: 'admin' },
    { key: 'website', to: '/website', label: msg('Website & SEO'), icon: <WebsiteIcon />, who: 'admin' },
    { key: 'competitors', to: '/competitors', label: msg('Competitors'), icon: <CompetitorsIcon />, who: 'admin' },
  ] },
  { key: 'whatson', label: msg("What's on"), items: [
    { key: 'calendar', to: '/calendar', label: msg('Calendar'), icon: <CalendarIcon />, partner: ['calendar'] },
    { key: 'sports', to: '/sports', label: msg('Sports'), icon: <SportsIcon /> },
    { key: 'music', to: '/music', label: msg('Music'), icon: <MusicIcon /> },
  ] },
  { key: 'team', label: msg('Team'), items: [
    { key: 'rota', to: '/rota', label: msg('Rota'), icon: <RotaIcon />, partner: ['rota', 'payroll'] },
    { key: 'timeoff', to: '/time-off', label: msg('Time off'), icon: <TimeOffIcon /> },
    { key: 'benefits', to: '/benefits', label: msg('Staff benefits'), short: msg('Benefits'), icon: <BenefitsIcon />, partner: ['payroll'] },
    { key: 'kitty', to: '/kitty', label: msg('Staff kitty'), short: msg('Kitty'), icon: <KittyIcon /> },
    { key: 'timecards', to: '/timecards', label: msg('Timecards'), short: msg('Hours'), icon: <TimecardIcon />, partner: ['payroll'] },
    ...(FEATURES.tips ? [{ key: 'tips', to: '/tips', label: msg('Tips'), icon: <TipsIcon />, partner: ['payroll'] as PartnerArea[] }] : []),
    { key: 'hiring', to: '/hiring', label: msg('Hiring'), icon: <HiringIcon />, who: 'admin' },
    { key: 'team', to: '/team', label: msg('Team'), icon: <TeamIcon /> },
    { key: 'roles', to: '/roles', label: msg('Roles & responsibilities'), short: msg('Roles'), icon: <RolesIcon /> },
    { key: 'rules', to: '/rules', label: msg('Staff rules'), short: msg('Rules'), icon: <RulesIcon /> },
    { key: 'outsourcing', to: '/outsourcing', label: msg('Outsourcing'), icon: <OutsourcingIcon />, who: 'admin', partner: ['finances'] },
  ] },
  { key: 'admin', label: msg('Settings'), items: [
    { key: 'connections', to: '/connections', label: msg('Connections'), icon: <ConnectIcon />, who: 'admin' },
    { key: 'notifications', to: '/notifications', label: msg('Notifications'), icon: <NotificationsIcon /> },
    { key: 'pages', to: '/pages', label: msg('Pages'), icon: <PagesIcon />, partner: 'any' },
    ...(FEATURES.partners ? [{ key: 'partners', to: '/partners', label: msg('Partners'), icon: <PartnersIcon />, who: 'admin' as const }] : []),
    ...(FEATURES.kiosk ? [{ key: 'kiosk', to: '/kiosk', label: msg('Café tablet'), icon: <KioskIcon />, who: 'admin' as const }] : []),
  ] },
]
// Your own pages: not in the menu (your name at the bottom left, or the account icon on a phone,
// opens them), but still found by search and shown as the current page.
const YOU: NavItem[] = [
  { key: 'account', to: '/account', label: msg('My account'), icon: <AccountIcon />, partner: 'any' },
  { key: 'ai-assistants', to: '/ai-assistants', label: msg('AI assistants'), icon: <AiIcon />, partner: 'any' },
  { key: 'billing', to: '/account/billing', label: msg('Billing'), icon: <BillingIcon />, who: 'pay' },
  { key: 'referrals', to: '/referrals', label: msg('Referrals'), icon: <ReferralsIcon />, who: 'admin' },
  { key: 'appearance', to: '/appearance', label: msg('Appearance'), icon: <AppearanceIcon />, partner: 'any' },
]
const DRAWER = 252
const MINI = 76
/** Per-page counts shown in the menu (today just Messages: chats waiting on a reply). */
type NavBadges = Record<string, number>

/**
 * A small count that blends into the menu row (`dark`: the row is selected, so it sits on rose).
 * Hidden from the accessibility tree so the link keeps its plain name ("Messages", not
 * "Messages 3 waiting") for assistive tech and the live tests alike.
 */
function NavCount({ n, dark }: { n?: number; dark?: boolean }) {
  if (!n) return null
  return (
    <Box component="span" aria-hidden sx={{ ml: 1, minWidth: 20, height: 20, px: 0.6, borderRadius: '10px',
      display: 'inline-grid', placeItems: 'center', flexShrink: 0, fontSize: '0.7rem', fontWeight: 700, lineHeight: 1,
      bgcolor: dark ? 'rgba(43,37,34,0.16)' : tokens.rose, color: '#2B2522' }}>
      {n > 99 ? '99+' : n}
    </Box>
  )
}

/** The same count on an icon, for the icons-only sidebar and the phone tabs (visual only). */
function IconCount({ n, children }: { n?: number; children: ReactNode }) {
  return (
    <Badge badgeContent={n ?? 0} max={99} overlap="circular" slotProps={{ badge: { 'aria-hidden': true } }}
      sx={{ '& .MuiBadge-badge': { bgcolor: tokens.rose, color: '#2B2522', fontWeight: 700, fontSize: '0.65rem', minWidth: 16, height: 16 } }}>
      {children}
    </Badge>
  )
}
// Phone tabs: the everyday pages first; everything else sits under "More".
const PHONE_TABS = ['rota', 'timeoff', 'timecards', 'calendar', 'business']
/** A menu item with its words in the person's language. */
/** A menu item's name in the person's language. */
export const navLabel = (n: Pick<NavItem, 'label' | 'context'>) => (n.context ? tc(n.context, n.label) : t(n.label))
const inLanguage = (n: NavItem): NavItem => ({ ...n, label: navLabel(n), short: n.short && t(n.short), children: n.children?.map(inLanguage) })
/** Every page, sub-pages included. */
const withChildren = (items: NavItem[]) => items.flatMap(n => [n, ...(n.children ?? [])])

/** You: the account menu, opened from your name at the bottom left (or the account icon on a phone). */
function AccountMenu({ children, label, sx }: { children: ReactNode; label?: string; sx?: object }) {
  const { me, isAdmin, isPartner, canSeePay, api, permissions } = useApp()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = () => setAnchor(null)
  const item = (to: string, text: string, icon: ReactNode) => (
    <MenuItem component={Link} to={to} onClick={close}><ListItemIcon>{icon}</ListItemIcon><ListItemText primary={text} /></MenuItem>
  )
  return (
    <>
      <Tooltip title={label ?? ''} placement="right">
        <ButtonBase onClick={e => setAnchor(e.currentTarget)} aria-label={me ? t('Account menu: {name}', { name: me.full_name }) : t('Account menu')}
          aria-haspopup="menu" aria-expanded={!!anchor} sx={{ display: 'flex', alignItems: 'center', ...sx }}>
          {children}
        </ButtonBase>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close} anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }} slotProps={{ paper: { sx: { minWidth: 220, borderRadius: '14px' } } }}>
        {item('/account', t('My account'), <AccountIcon fontSize="small" />)}
        {permissions.ai !== 'none' && item('/ai-assistants', t('AI assistants'), <AiIcon fontSize="small" />)}
        {isAdmin && canSeePay && item('/account/billing', t('Billing'), <BillingIcon fontSize="small" />)}
        {isAdmin && !isPartner && item('/referrals', t('Referrals'), <ReferralsIcon fontSize="small" />)}
        {item('/appearance', t('Appearance'), <AppearanceIcon fontSize="small" />)}
        <Divider />
        <MenuItem onClick={() => { close(); void api.signOut() }}><ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon><ListItemText primary={t('Sign out')} /></MenuItem>
      </Menu>
    </>
  )
}

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
    ? [...DEMO_ACCOUNTS, { email: me.email, label: `${me.full_name} (${t(me.role)})` }] : DEMO_ACCOUNTS
  return (
    <Alert severity="info" icon={false}
      sx={{ borderRadius: 0, border: 0, py: 0.25, px: { xs: 2, md: 4 }, borderBottom: 1, borderColor: 'divider', '& .MuiAlert-message': { py: 1 } }}
      action={
        <Select size="small" variant="standard" disableUnderline value={me?.email ?? ''} aria-label={t('View as')}
          sx={{ fontSize: 14, fontWeight: 500 }} onChange={e => api.signIn(String(e.target.value), '')}>
          {accounts.map(a => <MenuItem key={a.email} value={a.email}>{t('View as {who}', { who: a.label })}</MenuItem>)}
        </Select>
      }>
      {tr('{demo} · sample data, nothing is saved', { demo: <b>{t('Demo')}</b> })}
    </Alert>
  )
}

/**
 * Phone: four tabs plus "More" (a sheet with every other page, by section, and sign out).
 * "My account" lives in the top bar.
 */
function PhoneNav({ sections, current, badges }: { sections: NavSection[]; current: string | false; badges: NavBadges }) {
  const { api } = useApp()
  const [more, setMore] = useState(false)
  const flat = sections.flatMap(s => withChildren(s.items)).filter(n => n.key !== 'account')
  const rank = (n: NavItem) => { const i = PHONE_TABS.indexOf(n.key); return i < 0 ? PHONE_TABS.length : i }
  const tabbable = flat.filter(n => n.key !== 'kiosk').sort((a, b) => rank(a) - rank(b))
  const overflow = flat.length > 5
  const shown = overflow ? tabbable.slice(0, 4) : tabbable
  const shownKeys = shown.map(n => n.key)
  const inRest = !!current && current !== 'today' && !shownKeys.includes(current)
  return (
    <Paper component="nav" aria-label={t('Main')} elevation={0}
      sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 10, pb: 'env(safe-area-inset-bottom)' }}>
      <BottomNavigation showLabels value={inRest ? 'more' : current}>
        {shown.map(n => (
          <BottomNavigationAction key={n.key} value={n.key} label={n.short ?? n.label}
            icon={<IconCount n={badges[n.key]}>{n.icon}</IconCount>} component={Link} to={n.to} sx={{ minWidth: 0 }} />
        ))}
        {overflow && (
          // A quiet dot when a page under "More" has something waiting (e.g. Messages).
          <BottomNavigationAction value="more" label={t('More')} sx={{ minWidth: 0 }}
            icon={
              <Badge variant="dot" invisible={!flat.some(n => !shownKeys.includes(n.key) && badges[n.key])}
                sx={{ '& .MuiBadge-badge': { bgcolor: tokens.rose } }}>
                <MoreIcon />
              </Badge>
            }
            onClick={() => setMore(true)} aria-haspopup="dialog" />
        )}
      </BottomNavigation>
      <Drawer anchor="bottom" open={more} onClose={() => setMore(false)}
        slotProps={{ paper: { sx: { borderTopLeftRadius: 20, borderTopRightRadius: 20, pb: 'env(safe-area-inset-bottom)', maxHeight: '85vh' } } }}>
        <List aria-label={t('More pages')} sx={{ py: 1 }} onClick={() => setMore(false)}>
          {sections.map(s => {
            const rest = withChildren(s.items).filter(n => n.key !== 'account' && !shownKeys.includes(n.key))
            if (!rest.length) return null
            return (
              <Box key={s.key}>
                {s.label && <ListSubheader disableSticky sx={{ bgcolor: 'transparent', lineHeight: '32px', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{s.label}</ListSubheader>}
                {rest.map(n => (
                  <ListItemButton key={n.key} component={Link} to={n.to} selected={current === n.key} sx={{ mx: 1 }}>
                    <ListItemIcon sx={{ minWidth: 40 }}>{n.icon}</ListItemIcon>
                    <ListItemText primary={n.label} />
                    <NavCount n={badges[n.key]} />
                  </ListItemButton>
                ))}
              </Box>
            )
          })}
          <ListItemButton onClick={() => api.signOut()} sx={{ mx: 1, mt: 1 }}>
            <ListItemIcon sx={{ minWidth: 40 }}><LogoutIcon /></ListItemIcon>
            <ListItemText primary={t('Sign out')} />
          </ListItemButton>
        </List>
      </Drawer>
    </Paper>
  )
}

/**
 * One menu row. With `sortable`, a drag handle sits at the right end (drag it, or focus it and use the arrow keys),
 * with a pin next to it: a pinned page stays at the top of its section, on a soft pink.
 * A page with sub-pages has an arrow to show them; they open by themselves while you're on the page or one of them.
 */
function NavRow({ n, current, sortable, badge, pinned, onPin }: {
  n: NavItem; current: string | false; sortable: boolean; badge?: number; pinned: boolean; onPin: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: n.key, disabled: !sortable })
  const kids = n.children ?? []
  const inside = current === n.key || kids.some(k => k.key === current)
  const [open, setOpen] = useState(inside)
  useEffect(() => { if (inside) setOpen(true) }, [inside])
  const selected = (key: string) => current === key
  const dark = selected(n.key)
  return (
    <Box ref={setNodeRef} sx={{ position: 'relative', mb: 0.25, transform: CSS.Transform.toString(transform), transition,
      zIndex: isDragging ? 2 : 'auto', opacity: isDragging ? 0.92 : 1,
      '&:hover .nav-drag, & .nav-drag:focus-visible': { opacity: 1 } }}>
      <Box sx={{ position: 'relative' }}>
        <ListItemButton component={Link} to={n.to} selected={dark} onClick={kids.length ? () => setOpen(true) : undefined}
          sx={{ py: 0.6, pl: 1.25, pr: (sortable ? 7 : 1.25) + (kids.length ? 3 : 0), ...(pinned && !dark ? { bgcolor: tokens.roseSoft } : {}),
            ...(isDragging ? { boxShadow: `0 10px 24px -10px ${tokens.shadow}`, bgcolor: tokens.surface } : {}) }}>
          <ListItemIcon sx={{ minWidth: 34, '& svg': { fontSize: 20 } }}>{n.icon}</ListItemIcon>
          <ListItemText primary={n.label} slotProps={{ primary: { sx: { fontWeight: dark ? 600 : 400, fontSize: '0.9rem' } } }} />
          <NavCount n={badge} dark={dark} />
        </ListItemButton>
        {kids.length > 0 && (
          <Box component="button" type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={`nav-sub-${n.key}`}
            aria-label={t(open ? 'Hide {page} pages' : 'Show {page} pages', { page: n.label })}
            sx={{ all: 'unset', position: 'absolute', right: sortable ? 54 : 6, top: '50%', transform: 'translateY(-50%)', display: 'grid', placeItems: 'center',
              width: 24, height: 24, borderRadius: '6px', cursor: 'pointer', color: dark ? '#2B2522' : SIDEBAR.faint,
              '&:hover': { color: dark ? '#2B2522' : SIDEBAR.bright, background: dark ? 'rgba(43,37,34,0.08)' : SIDEBAR.hover },
              '&:focus-visible': { outline: `2px solid ${tokens.rose}` } }}>
            <ExpandIcon sx={{ fontSize: 18, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }} />
          </Box>
        )}
        {sortable && (
          // Shows on hover like the drag handle; a pinned page keeps it showing, filled in.
          <Box component="button" type="button" className={pinned ? undefined : 'nav-drag'} onClick={onPin} aria-pressed={pinned}
            aria-label={t(pinned ? 'Unpin {page}' : 'Pin {page} to the top', { page: n.label })} title={t(pinned ? 'Unpin' : 'Pin to the top')}
            sx={{ all: 'unset', position: 'absolute', right: 30, top: '50%', transform: 'translateY(-50%)', display: 'grid', placeItems: 'center',
              width: 24, height: 24, borderRadius: '6px', cursor: 'pointer', opacity: pinned ? 1 : 0, transition: 'opacity .15s',
              color: dark ? '#2B2522' : pinned ? tokens.roseDeep : SIDEBAR.faint,
              '&:hover': { color: dark ? '#2B2522' : SIDEBAR.bright, background: dark ? 'rgba(43,37,34,0.08)' : SIDEBAR.hover },
              '&:focus-visible': { outline: `2px solid ${tokens.rose}`, opacity: 1 } }}>
            {pinned ? <PinIcon sx={{ fontSize: 15 }} /> : <PinOutlineIcon sx={{ fontSize: 15 }} />}
          </Box>
        )}
        {sortable && (
          <Box ref={setActivatorNodeRef} className="nav-drag" component="button" type="button" aria-label={t('Reorder {page}', { page: n.label })}
            {...attributes} {...listeners} aria-roledescription="drag handle"
            sx={{ all: 'unset', position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', display: 'grid', placeItems: 'center',
              width: 24, height: 24, borderRadius: '6px', cursor: isDragging ? 'grabbing' : 'grab', opacity: isDragging ? 1 : 0, transition: 'opacity .15s',
              color: dark ? '#2B2522' : SIDEBAR.faint, touchAction: 'none',
              '&:hover': { color: dark ? '#2B2522' : SIDEBAR.bright, background: dark ? 'rgba(43,37,34,0.08)' : SIDEBAR.hover },
              '&:focus-visible': { outline: `2px solid ${tokens.rose}` } }}>
            <DragIcon sx={{ fontSize: 18 }} />
          </Box>
        )}
      </Box>
      {kids.length > 0 && (
        <Collapse in={open} id={`nav-sub-${n.key}`}>
          <List disablePadding aria-label={t('{page} pages', { page: n.label })} sx={{ mt: 0.25, ml: 2.25, pl: 1, borderLeft: `1px solid ${tokens.navLine}` }}>
            {kids.map(k => (
              <ListItemButton key={k.key} component={Link} to={k.to} selected={selected(k.key)} sx={{ py: 0.45, pl: 1, mb: 0.25 }}>
                <ListItemIcon sx={{ minWidth: 30, '& svg': { fontSize: 18 } }}>{k.icon}</ListItemIcon>
                <ListItemText primary={k.label} slotProps={{ primary: { sx: { fontWeight: selected(k.key) ? 600 : 400, fontSize: '0.85rem' } } }} />
              </ListItemButton>
            ))}
          </List>
        </Collapse>
      )}
    </Box>
  )
}

function SidebarSection({ section, current, folded, onToggle, mini, onReorder, badges, pins, onPin }: {
  section: NavSection; current: string | false; folded: boolean; onToggle: () => void; mini: boolean; onReorder: (keys: string[]) => void; badges: NavBadges
  pins: string[]; onPin: (key: string) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensorNow, { coordinateGetter: sortableKeyboardCoordinates }),
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
      {withChildren(section.items).map(n => (
        <Tooltip key={n.key} title={n.label} placement="right">
          <ListItemButton component={Link} to={n.to} selected={current === n.key} aria-label={n.label}
            sx={{ justifyContent: 'center', py: 0.9, mb: 0.25 }}>
            <ListItemIcon sx={{ minWidth: 0, '& svg': { fontSize: 22 } }}><IconCount n={badges[n.key]}>{n.icon}</IconCount></ListItemIcon>
          </ListItemButton>
        </Tooltip>
      ))}
    </List>
  ) : (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={modifiers}
      accessibility={{ screenReaderInstructions: { draggable: t('Press space to pick up this page, use the arrow keys to move it within its section, and space again to drop it.') } }}>
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        <List disablePadding ref={listRef}>
          {section.items.map(n => <NavRow key={n.key} n={n} current={current} sortable={sortable} badge={badges[n.key]} pinned={pins.includes(n.key)} onPin={() => onPin(n.key)} />)}
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
          fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase',
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

/**
 * Sections in the person's own order (Settings → Pages, saved to their account). Sections they haven't
 * placed (a new one, or one they couldn't see when they ordered them) follow, in their usual order.
 */
export function sortSections<S extends { key: string }>(sections: S[], order: string[] | undefined): S[] {
  const o = order ?? []
  const rank = (k: string) => { const i = o.indexOf(k); return i < 0 ? o.length + SECTIONS.findIndex(s => s.key === k) : i }
  return [...sections].sort((a, b) => rank(a.key) - rank(b.key))
}

/** The person's own order of pages within each section (saved to their account), pinned pages first. */
function orderSections(sections: NavSection[], order: Record<string, string[]> | undefined, pins: string[] = []): NavSection[] {
  return sections.map(s => {
    const o = order?.[s.key] ?? []
    const rank = (k: string) => { const i = o.indexOf(k); return i < 0 ? o.length + s.items.findIndex(n => n.key === k) : i }
    const pinned = (k: string) => (pins.includes(k) ? 0 : 1)
    return { ...s, items: [...s.items].sort((a, b) => pinned(a.key) - pinned(b.key) || rank(a.key) - rank(b.key)) }
  })
}

/** Pages that can't be hidden: the one that shows them again. */
export const ALWAYS_SHOWN = ['pages']

/** Can this person open the page at all (their role, pay access, a partner's areas)? */
export function canOpen(n: NavItem, who: { isAdmin: boolean; isPartner: boolean; canSeePay: boolean; partnerCan: (a: PartnerArea) => boolean }) {
  return who.isPartner
    ? n.partner === 'any' || (!!n.partner && n.partner.some(who.partnerCan))
    : !n.who || (n.who === 'admin' ? who.isAdmin : who.canSeePay)
}

/** Pages hidden from this person's menu: by the admins for everyone, or by themselves (Settings → Pages). */
export function hiddenPages(settings: { hidden_pages?: string[] } | null, me: { preferences?: { navHidden?: string[] } } | null) {
  return new Set([...(settings?.hidden_pages ?? []), ...(me?.preferences?.navHidden ?? [])].filter(k => !ALWAYS_SHOWN.includes(k)))
}

export function AppShell() {
  const { isAdmin, isPartner, partnerCan, canSeePay, me, api, refresh, business, settings, permissions, jobRoles } = useApp()
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const { pathname } = useLocation()
  const [folded, toggleFolded] = useFolded()
  const [mini, toggleMini] = useMini()
  // The top row's place for the page's title (computer only).
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null>(null)
  // Chats waiting on a reply, as a small count on Messages (sidebar, icons-only menu and phone alike).
  const unread = useUnreadMessages()
  const badges: NavBadges = unread > 0 ? { messages: unread } : {}
  // Pages they can open, less the ones hidden from their menu (they still open from a link).
  // Their roles can leave some out too (Roles & responsibilities → Permissions).
  const hidden = new Set([...hiddenPages(settings, me), ...hiddenByRole(permissions)])
  const square = useConnected('square')
  const allowed = (n: NavItem) => (n.needs !== 'square' || square === true) && canOpen(n, { isAdmin, isPartner, canSeePay, partnerCan }) && !hidden.has(n.key)
  // Page order within sections: the person's own, kept locally while it saves.
  const [navOrder, setNavOrder] = useState<Record<string, string[]> | undefined>(me?.preferences?.navOrder)
  useEffect(() => setNavOrder(me?.preferences?.navOrder), [me?.preferences?.navOrder])
  const reorder = (section: string, keys: string[]) => {
    const next = { ...navOrder, [section]: keys }
    setNavOrder(next)
    if (me) api.updateProfile(me.id, { preferences: { ...me.preferences, navOrder: next } }).then(refresh).catch(() => { /* kept on screen; saves next time */ })
  }
  // Pinned pages go to the top of their section (in the person's own order among themselves).
  const [navPins, setNavPins] = useState<string[]>(me?.preferences?.navPins ?? [])
  useEffect(() => setNavPins(me?.preferences?.navPins ?? []), [me?.preferences?.navPins])
  const pin = (key: string) => {
    const next = navPins.includes(key) ? navPins.filter(k => k !== key) : [...navPins, key]
    setNavPins(next)
    if (me) api.updateProfile(me.id, { preferences: { ...me.preferences, navPins: next } }).then(refresh).catch(() => { /* kept on screen; saves next time */ })
  }
  const sections = orderSections(sortSections(SECTIONS, me?.preferences?.navSections).map(s => ({ ...s, label: s.label && t(s.label), items: s.items.filter(allowed).map(n => (n.children ? { ...n, children: n.children.filter(allowed) } : n)).map(inLanguage) }))
    .filter(s => s.items.length), navOrder, navPins)
  // The most specific match wins, so /account/billing is Billing, not My account.
  const all = [...SECTIONS.flatMap(s => withChildren(s.items)), ...YOU].sort((a, b) => b.to.length - a.to.length)
  const current = all.find(n => n.to !== '/' && pathname.startsWith(n.to))?.key ?? (pathname === '/' ? 'today' : false)
  // Under their name: their job (Barista / Bartender), after the access an admin has (Shop manager · Barista / Bartender).
  const jobs = roleNamesOf(me?.id, jobRoles).join(', ')
  const access = t((me && teamRoleLabel(me)) || 'Employee')
  const personLabel = me?.role === 'admin' ? [access, jobs].filter(Boolean).join(' · ') : jobs || access
  // A page their roles hide doesn't open either, from a link or the address bar: back to Today.
  const blocked = typeof current === 'string' && hiddenByRole(permissions).includes(current)
  const home = isPartner ? '/business' : '/'
  const searchPages = [
    ...(isPartner ? [] : [{ key: 'today', to: '/', label: t('Today'), icon: <TodayIcon />, section: null }]),
    ...sections.flatMap(s => withChildren(s.items).map(n => ({ key: n.key, to: n.to, label: n.label, icon: n.icon, section: s.label }))),
    ...YOU.filter(allowed).map(n => ({ key: n.key, to: n.to, label: t(n.label), icon: n.icon, section: t('You') })),
  ]

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {desktop && (
        <Box component="nav" aria-label={t('Main')} sx={{ width: mini ? MINI : DRAWER, flexShrink: 0, position: 'sticky', top: 0, height: '100vh',
          transition: 'width .2s ease', zIndex: 6,
          display: 'flex', flexDirection: 'column', background: SIDEBAR.bg, color: SIDEBAR.text, borderRight: `1px solid ${tokens.navLine}`, px: mini ? 1 : 1.5, ...sidebarItems }}>
          <Stack direction={mini ? 'column' : 'row'} spacing={1} sx={{ alignItems: 'center', pt: 2.25, pb: 1.75 }}>
            <ButtonBase component={Link} to={home} aria-label={isPartner ? t('Home') : t('Home: Today')}
              sx={{ flex: mini ? 'none' : 1, minWidth: 0, justifyContent: mini ? 'center' : 'flex-start', px: mini ? 0.5 : 1, py: 0.5, borderRadius: '12px', '&:hover': { background: SIDEBAR.hover } }}>
              <BrandLogo height={mini ? 44 : 48} />
              {!mini && business?.name && (
                <Typography component="span" sx={{ ml: 1.25, fontFamily: fonts.display, fontWeight: 500, fontSize: '1.02rem', lineHeight: 1.15,
                  color: SIDEBAR.bright, textAlign: 'left', minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {business.name}
                </Typography>
              )}
            </ButtonBase>
          </Stack>
          {/* Scrolls only on short screens, without a visible scrollbar. */}
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', mx: mini ? -1 : -1.5, px: mini ? 1 : 1.5, pb: 2,
            scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
            maskImage: 'linear-gradient(to bottom, #000 calc(100% - 28px), transparent)' }}>
            {sections.map(s => (
              <SidebarSection key={s.key} section={s} current={current} mini={mini} badges={badges}
                folded={!mini && folded.includes(s.key) && !withChildren(s.items).some(n => n.key === current)}
                onToggle={() => toggleFolded(s.key)} onReorder={keys => reorder(s.key, keys)} pins={navPins} onPin={pin} />
            ))}
          </Box>
          {/* Fold the menu to icons: a round arrow on the edge, halfway down. */}
          <Tooltip title={mini ? t('Show labels') : t('Icons only')} placement="right">
            <IconButton onClick={toggleMini} aria-label={mini ? t('Expand menu') : t('Collapse menu to icons')} aria-expanded={!mini}
              sx={{ position: 'absolute', top: '50%', right: 0, transform: 'translate(50%, -50%)', width: 28, height: 28, borderRadius: '50%',
                bgcolor: tokens.surface, color: tokens.inkSoft, border: `1px solid ${tokens.lineStrong}`,
                boxShadow: `0 6px 16px -6px ${tokens.shadow}`, transition: 'background .15s, color .15s, border-color .15s, box-shadow .15s',
                '&:hover': { bgcolor: tokens.rose, color: '#2B2522', borderColor: tokens.rose, boxShadow: `0 6px 18px -6px rgba(247,155,164,0.8)` } }}>
              <ChevronIcon sx={{ fontSize: 18, transition: 'transform .25s ease', transform: mini ? 'rotate(180deg)' : 'none' }} />
            </IconButton>
          </Tooltip>
          <Stack direction={mini ? 'column' : 'row'} spacing={mini ? 0.5 : 1.25} sx={{ mt: 1, mb: 2, flexShrink: 0, p: mini ? 0.75 : 1.25, alignItems: 'center', borderRadius: '14px', bgcolor: tokens.navPanel }}>
            {/* You: your name opens the account menu (My account, Billing, Referrals, Appearance, Sign out). */}
            <AccountMenu label={mini ? me?.full_name : undefined}
              sx={{ flex: mini ? 'none' : 1, minWidth: 0, gap: 1.25, justifyContent: 'flex-start', borderRadius: '10px', p: 0.25, '&:hover': { background: SIDEBAR.hover } }}>
              {me && <PersonAvatar name={me.full_name} colour={me.colour} size={34} />}
              {!mini && <Box sx={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                <Typography sx={{ fontWeight: 500, fontSize: '0.88rem', color: SIDEBAR.bright }} noWrap>{me?.full_name}</Typography>
                <Typography variant="caption" sx={{ color: SIDEBAR.faint }}>{me?.role === 'partner' ? me.partner_company ?? t('Partner') : personLabel}</Typography>
              </Box>}
            </AccountMenu>
            <Tooltip title={t('Sign out')}>
              <IconButton size="small" aria-label={t('Sign out')} onClick={() => api.signOut()} sx={{ color: SIDEBAR.text, '&:hover': { color: SIDEBAR.bright, background: SIDEBAR.hover } }}><LogoutIcon fontSize="small" /></IconButton>
            </Tooltip>
          </Stack>
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0, pb: desktop ? 0 : 10 }}>
        {!desktop && (
          <AppBar position="sticky" elevation={0} color="inherit" sx={{ bgcolor: tokens.surface, backdropFilter: 'blur(8px)', borderBottom: 1, borderColor: 'divider' }}>
            <Toolbar sx={{ gap: 1, minHeight: 56 }}>
              <ButtonBase component={Link} to={home} aria-label={isPartner ? t('Home') : t('Home: Today')} sx={{ gap: 1.25, flex: 1, justifyContent: 'flex-start', borderRadius: '10px', py: 0.5 }}>
                <BrandLogo height={36} />
                {business?.name && <Typography component="span" noWrap sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: '1rem', color: tokens.ink }}>{business.name}</Typography>}
              </ButtonBase>
              <LanguageToggle />
              {!isPartner && <NotificationBell />}
              <SearchButton pages={searchPages} />
              <ThemeToggle />
              <AccountMenu sx={{ p: 1, borderRadius: '50%' }}><AccountIcon /></AccountMenu>
            </Toolbar>
          </AppBar>
        )}
        <DemoBanner />
        <BillingBanner />
        <Box component="main" sx={{ px: { xs: 2, md: 4 }, pt: { xs: 2.5, md: 3 }, pb: { xs: 2.5, md: 4 }, maxWidth: 1360, mx: 'auto' }}>
          {/* Computer: the page's title (and its buttons) on the left of the top row, the round buttons on the right;
              on the page's own background, so there's no band across the top. */}
          {desktop && (
            // The round buttons sit level with the page's own buttons (below its small eyebrow line, when it has one).
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 3, '&:has([data-eyebrow]) > .eb-top-icons': { pt: 3.25 } }}>
              <Box ref={setTitleSlot} sx={{ flex: 1, minWidth: 0 }} />
              <Stack className="eb-top-icons" direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0, ml: 'auto', pt: 0.25 }}>
                {!isPartner && <NotificationBell />}
                <SearchButton pages={searchPages} wide />
                <ThemeToggle />
                <LanguageToggle />
              </Stack>
            </Box>
          )}
          <TitleSlot.Provider value={desktop ? titleSlot : null}>
            <CafeSpeakerProvider><Suspense fallback={<Loading />}>{blocked ? <Navigate to="/" replace /> : <Outlet />}</Suspense></CafeSpeakerProvider>
            <AssistantButton />
          </TitleSlot.Provider>
        </Box>
      </Box>
      {!desktop && <PhoneNav sections={sections} current={current} badges={badges} />}
    </Box>
  )
}
