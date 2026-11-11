// Switching between businesses: someone in more than one (an owner with two cafés, Business Agent HQ
// and their own café, a barista who works at two places) keeps each signed in on this device and
// switches from the top left or the account menu, without signing out. An account is in one business,
// so each business has its own sign-in; the device keeps them (src/data/deviceAccounts.ts).
import { Backdrop, Box, Button, Card, CardContent, CircularProgress, Divider, IconButton, ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem, Stack, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/AddBusinessOutlined'
import CheckIcon from '@mui/icons-material/CheckRounded'
import SwitchIcon from '@mui/icons-material/UnfoldMoreRounded'
import { useState, type ReactNode } from 'react'
import easyBeansLogoUrl from '../assets/easy-beans-logo.png'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import type { DeviceAccount } from '../data/api'
import { SectionTitle } from './common'
import { t, tc } from '../i18n'

/** A business's mark: its logo, or its initials (Easy Beans, business 1, has the bundled one). */
export function BusinessAvatar({ name, logo, businessId, size = 32 }: { name: string | null; logo: string | null; businessId: number | null; size?: number }) {
  const src = logo ?? (businessId === 1 ? easyBeansLogoUrl : null)
  const initials = (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?'
  return (
    <Box aria-hidden sx={{ width: size, height: size, flexShrink: 0, borderRadius: `${Math.round(size * 0.28)}px`, overflow: 'hidden',
      display: 'grid', placeItems: 'center', bgcolor: src ? '#fff' : 'action.selected', border: 1, borderColor: 'divider',
      fontSize: size * 0.38, fontWeight: 600, color: 'text.primary' }}>
      {src ? <Box component="img" src={src} alt="" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : initials}
    </Box>
  )
}

/** The business open now, with the logo from its Brand page. */
function CurrentAvatar({ size }: { size?: number }) {
  const { api, business } = useApp()
  const brand = useAsync('brand', () => api.brand(), [])
  // As BrandLogo: without its own logo, the first business (Easy Beans) has the bundled one.
  return <BusinessAvatar name={business?.name ?? null} logo={brand.data?.logo ?? null} businessId={business?.id ?? 1} size={size} />
}

/** The other businesses on this device, and switching to them, adding one or taking one off. */
export function useBusinesses() {
  const { api, me, business } = useApp()
  const notify = useNotify()
  const run = useAction()
  // Read afresh each time (it's small): it changes as businesses are switched, added and taken off.
  const [, changed] = useState(0)
  const others = api.deviceAccounts().filter(a => a.userId !== me?.id)
  const [opening, setOpening] = useState<DeviceAccount | null>(null)
  const add = () => run(() => api.addAccount())
  const switchTo = async (a: DeviceAccount) => {
    if (a.signedOut) return add()
    setOpening(a)
    try {
      const done = await api.switchAccount(a.userId)
      // Opened: the app starts again in that business (the live app reloads; the demo has switched already).
      if (done === 'opened') { if (api.mode === 'demo') setOpening(null); return }
      setOpening(null)
      changed(n => n + 1)
      const name = a.business ?? a.email ?? a.name
      notify(done === 'signed-out' ? t('{business} was signed out on this device. Sign in to it again.', { business: name })
        : t('Couldn’t reach {business}. Check your connection and try again.', { business: name }), 'error')
    } catch (e) {
      setOpening(null)
      notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }
  const forget = (a: DeviceAccount) => run(async () => { await api.forgetAccount(a.userId); changed(n => n + 1) },
    t('{business} is off this device', { business: a.business ?? a.email ?? a.name }))
  const current = me && { name: business?.name ?? null, businessId: business?.id ?? me.business_id ?? null }
  return { current, others, opening, switchTo, add, forget }
}

/** "Sign out", or, with other businesses on this device too, a word that it's all of them. */
export function useSignOutLabel() {
  const { api, me } = useApp()
  return api.deviceAccounts().some(a => a.userId !== me?.id) ? t('Sign out of all businesses') : t('Sign out')
}

/** While another business opens: the app starts again in it. */
export function Opening({ account }: { account: DeviceAccount | null }) {
  return (
    <Backdrop open={!!account} sx={{ zIndex: theme => theme.zIndex.modal + 1, color: '#fff', flexDirection: 'column', gap: 2 }}>
      <CircularProgress color="inherit" />
      {account && <Typography role="status">{t('Opening {business}…', { business: account.business ?? account.email ?? account.name })}</Typography>}
    </Backdrop>
  )
}

const otherLine = (a: DeviceAccount) => (a.signedOut ? t('Signed out: sign in again') : a.email ?? a.name)

/**
 * The businesses as menu items: the one open now, the others to switch to, and adding another. The account
 * menu has only the others (none: nothing at all); a business is added from the top left or My account.
 */
export function businessMenuItems(b: ReturnType<typeof useBusinesses>, close: () => void, withCurrent = true, withAdd = true): ReactNode[] {
  // With nothing to list (one business), just adding another.
  const listed = (withCurrent && b.current ? 1 : 0) + b.others.length > 0
  return [
    listed && <ListSubheader key="title" sx={{ lineHeight: '32px', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', bgcolor: 'transparent' }}>{t('Your businesses')}</ListSubheader>,
    withCurrent && b.current && (
      <MenuItem key="current" selected onClick={close} aria-current="true">
        <ListItemIcon sx={{ minWidth: 44 }}><CurrentAvatar /></ListItemIcon>
        <ListItemText primary={b.current.name ?? t('No business yet')} secondary={t('Open now')} />
        <CheckIcon fontSize="small" sx={{ ml: 1.5, color: 'text.secondary' }} />
      </MenuItem>
    ),
    ...b.others.map(a => (
      <MenuItem key={a.userId} onClick={() => { close(); void b.switchTo(a) }}>
        <ListItemIcon sx={{ minWidth: 44 }}><BusinessAvatar name={a.business} logo={a.logo} businessId={a.businessId} /></ListItemIcon>
        <ListItemText primary={a.business ?? t('No business yet')} secondary={otherLine(a)}
          slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }} sx={{ minWidth: 0, maxWidth: 260 }} />
      </MenuItem>
    )),
    withAdd && listed && <Divider key="divider" />,
    withAdd && (
      <MenuItem key="add" onClick={() => { close(); void b.add() }}>
        <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
        <ListItemText primary={t('Add another business')} />
      </MenuItem>
    ),
  ].filter(Boolean)
}

/** Top left, beside the business's name: switch to another business on this device, or add one. */
export function BusinessSwitchButton({ sx }: { sx?: object }) {
  const b = useBusinesses()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const close = () => setAnchor(null)
  return (
    <>
      <Tooltip title={t('Switch business')}>
        <IconButton size="small" aria-label={t('Switch business')} aria-haspopup="menu" aria-expanded={!!anchor}
          onClick={e => setAnchor(e.currentTarget)} sx={sx}>
          <SwitchIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { minWidth: 260, maxWidth: 340, borderRadius: '14px' } } }}>
        {businessMenuItems(b, close)}
      </Menu>
      <Opening account={b.opening} />
    </>
  )
}

/** My account: the businesses on this device, to open, add or take off. */
export function DeviceBusinesses() {
  const b = useBusinesses()
  return (
    <Card component="section" aria-label={t('Your businesses')}>
      <CardContent>
        <SectionTitle>{t('Your businesses')}</SectionTitle>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 720 }}>
          {t('Work in more than one business? Each has its own sign-in. Add the others here once, then switch between them from the top left or the account menu without signing out. Signing out signs you out of all of them on this device.')}
        </Typography>
        <Stack divider={<Divider flexItem />} sx={{ borderTop: 1, borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          {b.current && (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1.25 }}>
              <CurrentAvatar size={36} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 500 }}>{b.current.name ?? t('No business yet')}</Typography>
                <Typography variant="body2" color="text.secondary" noWrap>{t('Open now')}</Typography>
              </Box>
            </Stack>
          )}
          {b.others.map(a => (
            <Stack key={a.userId} direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1.25 }}>
              <BusinessAvatar name={a.business} logo={a.logo} businessId={a.businessId} size={36} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 500 }}>{a.business ?? t('No business yet')}</Typography>
                <Typography variant="body2" color={a.signedOut ? 'warning.main' : 'text.secondary'} noWrap>{otherLine(a)}</Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexShrink: 0 }}>
                <Button size="small" variant="outlined" onClick={() => void b.switchTo(a)}>{a.signedOut ? t('Sign in') : tc('verb', 'Open')}</Button>
                <Button size="small" color="inherit" onClick={() => void b.forget(a)}
                  aria-label={t('Take {business} off this device', { business: a.business ?? a.email ?? a.name })}>{t('Remove')}</Button>
              </Stack>
            </Stack>
          ))}
        </Stack>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => void b.add()}>{t('Add another business')}</Button>
      </CardContent>
      <Opening account={b.opening} />
    </Card>
  )
}

/** Signed in to an account that has no business to open (none yet, or switched off): back to the others here. */
export function BackToBusinesses({ sx }: { sx?: object }) {
  const b = useBusinesses()
  const usable = b.others.filter(a => !a.signedOut)
  if (!usable.length) return null
  return (
    <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
      {usable.map(a => (
        <Button key={a.userId} variant="outlined" sx={sx} onClick={() => void b.switchTo(a)}>
          {t('Back to {business}', { business: a.business ?? a.email ?? a.name })}
        </Button>
      ))}
      <Opening account={b.opening} />
    </Stack>
  )
}
