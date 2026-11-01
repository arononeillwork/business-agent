// The app on a phone or tablet's Home Screen (app/install.ts): a card offering it once the person has
// had a moment in the app, the steps where the browser can't do it in one tap, and "Add to Home Screen"
// in the account menu for later. None of it shows on a computer.
import { useEffect, useState, type ReactNode } from 'react'
import { Box, Button, Drawer, ListItemIcon, ListItemText, MenuItem, Paper, Slide, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import { useColorScheme } from '@mui/material/styles'
import InstallIcon from '@mui/icons-material/InstallMobile'
import ShareIcon from '@mui/icons-material/IosShare'
import AddBoxIcon from '@mui/icons-material/AddBoxOutlined'
import MenuDotsIcon from '@mui/icons-material/MoreVert'
import { useApp } from '../app/AppContext'
import { useNotify } from '../app/Notify'
import { closeSteps, install, notNow, shouldOffer, startServiceWorker, useInstall } from '../app/install'
import { tokens } from '../theme'
import { t, tr } from '../i18n'

/** How long someone is in the app before the card comes up, so it isn't the first thing they see. */
const SETTLE_MS = 4000
/** The phone's status bar in the installed app: the page's top bar, light (index.html) or dark (theme.ts). */
const BAR = { light: '#FBF8F4', dark: '#1A1620' }

/** Add the app: the browser's own Install, or the steps; a word once it's on its way. */
export function useAddToHomeScreen() {
  const notify = useNotify()
  return async () => {
    try {
      if (await install() === 'accepted') notify(t('Added: the app is on your Home Screen'), 'success')
    } catch {
      notify(t('Your browser didn’t open its Install. Try again after reloading the page.'), 'error')
    }
  }
}

/** In AppShell: the offer, the steps, the service worker and the status bar colour. */
export function InstallApp() {
  const { api } = useApp()
  const { way, steps, answer } = useInstall()
  const add = useAddToHomeScreen()
  // The computer layout on a big tablet held sideways: no tabs along the bottom, so the card sits in the corner.
  const wide = useMediaQuery(useTheme().breakpoints.up('md'))
  const [settled, setSettled] = useState(false)
  // Not in the demo: it's the real app that gets added, and the demo is for looking around.
  const live = api.mode === 'live'
  useEffect(() => { if (live) startServiceWorker() }, [live])
  useEffect(() => { const id = setTimeout(() => setSettled(true), SETTLE_MS); return () => clearTimeout(id) }, [])
  const { mode, systemMode } = useColorScheme()
  const dark = (mode === 'system' ? systemMode : mode) === 'dark'
  useEffect(() => { document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? BAR.dark : BAR.light) }, [dark])

  const show = live && settled && !!way && !steps && shouldOffer(answer, Date.now())
  const title = t('Add the app to your Home Screen')
  return (
    <>
      <Slide direction="up" in={show} mountOnEnter unmountOnExit>
        <Paper role="region" aria-label={title} elevation={0}
          sx={{ position: 'fixed', zIndex: theme => theme.zIndex.appBar + 50, p: 2, borderRadius: '20px',
            border: `1px solid ${tokens.line}`, bgcolor: tokens.surface, boxShadow: `0 20px 48px -18px ${tokens.shadow}`,
            ...(wide ? { right: 24, bottom: 24, width: 380 }
              // Above the tabs along the bottom (66px), clear of the phone's home bar.
              : { left: 12, right: 12, mx: 'auto', maxWidth: 480, bottom: 'calc(66px + env(safe-area-inset-bottom) + 12px)' }) }}>
          <Stack direction="row" spacing={1.75} sx={{ alignItems: 'center' }}>
            <Box component="img" src="/apple-touch-icon.png" alt=""
              sx={{ width: 52, height: 52, borderRadius: '13px', border: `1px solid ${tokens.line}`, flexShrink: 0 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600, lineHeight: 1.3 }}>{title}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
                {way === 'ios' ? t('It opens full screen like your other apps, one tap away, and can send you notifications.')
                  : t('It opens full screen like your other apps, one tap away.')}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 1.5 }}>
            <Button onClick={notNow} sx={{ color: 'text.secondary' }}>{t('Not now')}</Button>
            <Button variant="contained" startIcon={<InstallIcon />} onClick={() => void add()}>
              {way === 'prompt' ? t('Install') : t('Show me how')}
            </Button>
          </Stack>
        </Paper>
      </Slide>
      {(way === 'ios' || way === 'menu') && <InstallSteps way={way} open={steps} onClose={closeSteps} />}
    </>
  )
}

/** "Add to Home Screen" in the account menu, on a phone or tablet that can and hasn't yet. */
export function InstallMenuItem({ onClick }: { onClick: () => void }) {
  const { way } = useInstall()
  const add = useAddToHomeScreen()
  if (!way) return null
  return (
    <MenuItem onClick={() => { onClick(); void add() }}>
      <ListItemIcon><InstallIcon fontSize="small" /></ListItemIcon>
      <ListItemText primary={t('Add to Home Screen')} />
    </MenuItem>
  )
}

/** Where the browser can't add it in one tap: what to tap, as it looks on the phone. */
function InstallSteps({ way, open, onClose }: { way: 'ios' | 'menu'; open: boolean; onClose: () => void }) {
  const chromeOnIphone = /CriOS\//.test(navigator.userAgent)
  const steps: { what: ReactNode; detail: string; icon?: ReactNode }[] = way === 'ios' ? [
    { what: tr('Tap {share}', { share: <b>{t('Share')}</b> }), icon: <ShareIcon />,
      detail: chromeOnIphone ? t('At the top, beside the address.') : t('In Safari’s toolbar, or under ··· if it isn’t there.') },
    { what: tr('Choose {add}', { add: <b>{t('Add to Home Screen')}</b> }), icon: <AddBoxIcon />,
      detail: t('Scroll down the list if you don’t see it.') },
    { what: tr('Tap {add}', { add: <b>{t('Add')}</b> }), detail: t('The app’s icon appears on your Home Screen: open it from there.') },
  ] : [
    { what: t('Open the browser’s menu'), icon: <MenuDotsIcon />, detail: t('The ⋮ button, beside the address or at the bottom.') },
    { what: tr('Choose {install}', { install: <b>{t('Install')}</b> }), icon: <InstallIcon />, detail: t('Or Add to Home screen, depending on the browser.') },
    { what: t('Confirm'), detail: t('The app’s icon appears with your other apps.') },
  ]
  return (
    <Drawer anchor="bottom" open={open} onClose={onClose}
      slotProps={{ paper: { role: 'dialog', 'aria-labelledby': 'install-steps-title',
        sx: { left: 0, right: 0, mx: 'auto', maxWidth: 520, borderTopLeftRadius: 24, borderTopRightRadius: 24, px: 2.5, pt: 3, pb: 'calc(20px + env(safe-area-inset-bottom))' } } }}>
      <Stack direction="row" spacing={1.75} sx={{ alignItems: 'center', mb: 2.5 }}>
        <Box component="img" src="/apple-touch-icon.png" alt="" sx={{ width: 48, height: 48, borderRadius: '12px', border: `1px solid ${tokens.line}` }} />
        <Typography id="install-steps-title" variant="h6" component="h2" sx={{ fontWeight: 600 }}>
          {way === 'ios' ? t('Add to your Home Screen') : t('Install the app')}
        </Typography>
      </Stack>
      <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 2 }}>
        {steps.map((s, i) => (
          <Stack key={i} component="li" direction="row" spacing={1.75} sx={{ alignItems: 'flex-start' }}>
            <Box aria-hidden sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: tokens.roseSoft, color: tokens.roseDeep,
              display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '0.9rem', flexShrink: 0 }}>{i + 1}</Box>
            <Box sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>
              <Typography>{s.what}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{s.detail}</Typography>
            </Box>
            {/* The button to look for, drawn as the phone shows it. */}
            {s.icon && (
              <Box aria-hidden sx={{ width: 40, height: 40, borderRadius: '10px', border: `1px solid ${tokens.lineStrong}`, color: tokens.ink,
                display: 'grid', placeItems: 'center', flexShrink: 0, '& svg': { fontSize: 22 } }}>{s.icon}</Box>
            )}
          </Stack>
        ))}
      </Box>
      <Button variant="contained" size="large" fullWidth onClick={onClose} sx={{ mt: 3 }}>{t('Got it')}</Button>
    </Drawer>
  )
}
