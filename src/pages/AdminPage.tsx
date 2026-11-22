import { Alert, Box, Button, Card, CardContent, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import LockIcon from '@mui/icons-material/LockOutlined'
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { PageHeader } from '../components/common'
import { Logo } from '../components/Logo'
import { DEMO_ADMIN_PIN } from '../data/adminArea'
import type { AdminSession } from '../../shared/salesTeam'
import { AdminCtx } from './admin/shared'
import { TodayTab } from './admin/TodayTab'
import { SalesTab } from './admin/SalesTab'
import { TodoTab } from './admin/TodoTab'
import { OnboardingTab } from './admin/OnboardingTab'
import { TeamTab } from './admin/TeamTab'
import { SettingsTab } from './admin/SettingsTab'
import { fonts } from '../theme'
import { msg, t } from '../i18n'

// The session's token, kept on this device until it ends (12 hours) or someone locks it.
const KEY = 'business-agent.admin-area'
function keptSession(): AdminSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as AdminSession | null
    return s?.token && Date.parse(s.expires_at) > Date.now() ? s : null
  } catch { return null }
}
function keepSession(s: AdminSession | null) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY) } catch { /* private window: this tab only */ }
}

/** The sections, each at its own address (/admin is Today). */
const TABS: { path: string; label: string; page: ComponentType }[] = [
  { path: '', label: msg('Today'), page: TodayTab },
  { path: 'sales', label: msg('Sales'), page: SalesTab },
  { path: 'todo', label: msg('To-do'), page: TodoTab },
  { path: 'onboarding', label: msg('Onboarding'), page: OnboardingTab },
  { path: 'team', label: msg('Team'), page: TeamTab },
  { path: 'settings', label: msg('Settings'), page: SettingsTab },
]

/**
 * The admin area (/admin): The Business Agent's own back room, for running The Business Agent rather
 * than a café. No sign-in; it opens with its PIN (checked by the Worker, never here), and stays open on
 * this device for 12 hours or until Lock. Today first, then Sales, To-do, Onboarding, Team and Settings.
 */
export function AdminPage() {
  const [session, setSession] = useState<AdminSession | null>(keptSession)
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => { document.title = `${t('Admin')} · The Business Agent` }, [])
  const open = useCallback((s: AdminSession | null, why: string | null = null) => { keepSession(s); setSession(s); setNotice(why) }, [])

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box component="main" sx={{ maxWidth: 1280, mx: 'auto', px: 2, pt: 2.5, pb: 4 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 2.5 }}>
          <Logo size={32} />
          <Typography sx={{ fontFamily: fonts.display, fontWeight: 600 }}>{'The Business Agent'}</Typography>
        </Stack>
        {session
          ? <AdminHome token={session.token} onLocked={why => open(null, why)} />
          : <PinScreen notice={notice} onOpen={s => open(s)} />}
      </Box>
    </Box>
  )
}

function PinScreen({ notice, onOpen }: { notice: string | null; onOpen: (s: AdminSession) => void }) {
  const { api } = useApp()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const unlock = async () => {
    setBusy(true)
    setError(null)
    try { onOpen(await api.adminUnlock(pin)) } catch (e) { setError(e instanceof Error ? e.message : String(e)); setPin('') } finally { setBusy(false) }
  }
  return (
    <Card sx={{ maxWidth: 420, mx: 'auto', mt: { xs: 2, md: 8 } }}>
      <CardContent component="form" onSubmit={e => { e.preventDefault(); if (pin) void unlock() }} sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <LockIcon />
            <Typography variant="h5" component="h1">{t('Admin')}</Typography>
          </Stack>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('The Business Agent’s own: its sales team and how it’s run. Type the PIN to open it.')}
          </Typography>
          {notice && <Alert severity="info">{notice}</Alert>}
          <TextField label={t('PIN')} type="password" value={pin} autoFocus autoComplete="off"
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
            slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*' } }} error={!!error} helperText={error ?? undefined} />
          {api.mode === 'demo' && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('In the demo, the PIN is {pin}.', { pin: DEMO_ADMIN_PIN })}</Typography>}
          <Button type="submit" variant="contained" disabled={!pin || busy}>{t('Open')}</Button>
        </Stack>
      </CardContent>
    </Card>
  )
}

function AdminHome({ token, onLocked }: { token: string; onLocked: (why: string | null) => void }) {
  const { api } = useApp()
  const { pathname } = useLocation()
  const here = pathname.replace(/^\/admin\/?/, '').split('/')[0]
  const tab = TABS.find(x => x.path === here) ?? TABS[0]
  const ctx = useMemo(() => ({ token, onLocked }), [token, onLocked])
  const lock = async () => {
    await api.adminLock(token).catch(() => undefined)
    onLocked(null)
  }
  const Page = tab.page
  return (
    <AdminCtx.Provider value={ctx}>
      <PageHeader eyebrow={t('The Business Agent')} title={t('Admin')} actions={
        <Button startIcon={<LockIcon />} onClick={() => void lock()}>{t('Lock')}</Button>
      } />
      <Tabs value={tab.path} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label={t('Admin sections')}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        {TABS.map(x => <Tab key={x.path} value={x.path} label={t(x.label)} component={RouterLink} to={x.path ? `/admin/${x.path}` : '/admin'} />)}
      </Tabs>
      <Page />
    </AdminCtx.Provider>
  )
}
