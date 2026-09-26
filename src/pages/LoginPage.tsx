import { Alert, Box, Button, Divider, Link, Stack, TextField, Typography } from '@mui/material'
import GoogleIcon from '@mui/icons-material/Google'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction, useNotify } from '../app/Notify'
import { businessConfig } from '../../shared/business.config'
import { Logo } from '../components/Logo'
import { fonts, tokens } from '../theme'

/** Microsoft's four-square mark, as Microsoft asks sign-in buttons to show it. */
function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" /><rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" /><rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}

/**
 * Sign-in. Supabase handles every method: email and password first, then Google or Microsoft
 * (Outlook / Microsoft 365) underneath. Only invited people get into the app.
 */
export function LoginPage() {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    await run(() => api.signIn(email, password))
    setBusy(false)
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 1fr' }, bgcolor: 'background.default' }}>
      {/* Brand panel */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', justifyContent: 'space-between', p: 6,
        background: `linear-gradient(160deg, ${tokens.roseWash} 0%, ${tokens.roseSoft} 55%, ${tokens.bg} 100%)` }}>
        <Typography variant="overline" sx={{ color: tokens.roseDeep }}>Specialty coffee · matcha · ube · chai · açaí</Typography>
        <Box>
          <Logo size={168} />
          <Typography sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: '2.6rem', lineHeight: 1.1, letterSpacing: '-0.03em', mt: 4, maxWidth: 460 }}>
            Same drink, same way, every time.
          </Typography>
          <Typography sx={{ color: 'text.secondary', mt: 2, maxWidth: 420 }}>
            The team app for {businessConfig.name}: your shifts, your hours and your time off, in one place.
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>C. Pizarro 8, San Pedro de Alcántara</Typography>
      </Box>

      {/* Sign-in */}
      <Box sx={{ display: 'grid', placeItems: 'center', px: 2, py: 5 }}>
        <Box component="form" onSubmit={submit} sx={{ width: '100%', maxWidth: 380 }}>
          <Stack spacing={2.25}>
            <Box sx={{ display: { xs: 'flex', md: 'none' }, justifyContent: 'center', mb: 1 }}><Logo size={112} /></Box>
            <Box>
              <Typography variant="h4" component="h1">Sign in</Typography>
              <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>Welcome back. Use the email your invite was sent to.</Typography>
            </Box>
            {api.mode === 'demo' && (
              <Alert severity="info">Demo: use aron@example.com (admin) or maria@example.com (employee), any password.</Alert>
            )}
            <TextField label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <Box>
              <TextField label="Password" type="password" autoComplete="current-password" value={password}
                onChange={e => setPassword(e.target.value)} required={api.mode === 'live'} />
              <Link component="button" type="button" variant="body2" sx={{ mt: 1 }} onClick={async () => {
                if (!email) return notify('Enter your email first', 'warning')
                await run(() => api.sendPasswordReset(email), 'Check your email for a reset link')
              }}>Forgot password?</Link>
            </Box>
            <Button type="submit" variant="contained" size="large" disabled={busy}>Sign in</Button>

            <Divider sx={{ color: 'text.secondary', fontSize: 13, pt: 1 }}>or continue with</Divider>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <Button fullWidth variant="outlined" size="large" startIcon={<GoogleIcon />} onClick={() => run(() => api.signInWithGoogle())}>
                Google
              </Button>
              <Button fullWidth variant="outlined" size="large" startIcon={<MicrosoftIcon />} onClick={() => run(() => api.signInWithMicrosoft())}>
                Microsoft
              </Button>
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center' }}>
              Outlook, Hotmail and Microsoft 365 accounts use Microsoft. Only invited team members can get in.
            </Typography>
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}
