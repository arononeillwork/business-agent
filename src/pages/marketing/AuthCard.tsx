import { Alert, Box, Button, Divider, Link, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { siApple, siFacebook } from 'simple-icons'
import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../../app/AppContext'
import { useAction, useNotify } from '../../app/Notify'
import { SOCIAL_PROVIDERS, type SignInMethods, type SocialProvider } from '../../data/api'
import { BA, display, outlineBtn, primaryBtn } from './site'
import { TRIAL_MONTHS } from './plans'

/** Google's four-colour "G", as Google asks sign-in buttons to show it. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

/** Microsoft's four-square mark, as Microsoft asks sign-in buttons to show it. */
function MicrosoftIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" /><rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" /><rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}

const simple = (icon: { path: string; hex: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d={icon.path} fill={`#${icon.hex}`} /></svg>
)

const PROVIDER: Record<SocialProvider, { label: string; icon: ReactNode }> = {
  google: { label: 'Google', icon: <GoogleIcon /> },
  apple: { label: 'Apple', icon: simple(siApple) },
  facebook: { label: 'Facebook', icon: simple(siFacebook) },
  microsoft: { label: 'Microsoft', icon: <MicrosoftIcon /> },
}

/** Which outside sign-ins Supabase has switched on (null while asking). */
function useSignInMethods() {
  const { api } = useApp()
  const [methods, setMethods] = useState<SignInMethods | null>(null)
  // If the check fails, offer the long-standing ones anyway and let Supabase decide.
  useEffect(() => {
    api.signInMethods().then(setMethods, () => setMethods({ google: true, apple: false, facebook: false, microsoft: true }))
  }, [api])
  return methods
}

/**
 * One tap with an account people already have. Only the methods that are switched on are shown,
 * so a button never leads to a provider's error page.
 */
function SocialButtons({ methods }: { methods: SignInMethods | null }) {
  const { api } = useApp()
  const run = useAction()
  const on = SOCIAL_PROVIDERS.filter(p => methods?.[p])
  if (methods && !on.length) return null
  // While asking, hold the space with the two that are usually on, so the form doesn't jump.
  const shown = methods ? on : (['google', 'microsoft'] as SocialProvider[])
  return (
    <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: shown.length === 1 ? '1fr' : '1fr 1fr' }}>
      {shown.map(p => (
        <Button key={p} variant="outlined" size="large" startIcon={PROVIDER[p].icon} disabled={!methods}
          sx={{ ...outlineBtn, py: 1.1, '& .MuiButton-startIcon': { mr: 1.25 } }}
          onClick={() => run(() => api.signInWith(p))}>{PROVIDER[p].label}</Button>
      ))}
    </Box>
  )
}

/** The sign-in / create-account card on the landing page. */
export function AuthCard({ tab, onTab }: { tab: 'signin' | 'signup'; onTab: (t: 'signin' | 'signup') => void }) {
  return (
    <Box sx={{ p: { xs: 2.5, sm: 3.5 }, borderRadius: '22px', bgcolor: BA.card, border: `1px solid ${BA.line}`,
      boxShadow: '0 1px 2px rgba(17,19,24,0.04), 0 30px 60px -32px rgba(17,19,24,0.28)' }}>
      <Tabs value={tab} onChange={(_, v) => onTab(v)} variant="fullWidth" aria-label="Account"
        sx={{ mb: 3, minHeight: 40, bgcolor: BA.tint, borderRadius: '12px', p: 0.5,
          '& .MuiTabs-indicator': { display: 'none' },
          '& .MuiTab-root': { minHeight: 36, borderRadius: '9px', color: BA.soft, fontWeight: 500, textTransform: 'none' },
          '& .Mui-selected': { bgcolor: '#fff', color: `${BA.ink} !important`, boxShadow: '0 1px 3px rgba(17,19,24,0.12)' } }}>
        <Tab value="signin" label="Sign in" />
        <Tab value="signup" label="Create account" />
      </Tabs>
      {tab === 'signin' ? <SignInForm /> : <SignUpForm onSignIn={() => onTab('signin')} />}
    </Box>
  )
}

const linkSx = { color: BA.ink, fontWeight: 500, textDecorationColor: BA.line, '&:hover': { textDecorationColor: BA.ink } }

function SignInForm() {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const methods = useSignInMethods()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const sendCode = async () => {
    if (!email.trim()) return notify('Enter your email first', 'warning')
    if (await run(() => api.sendSignInCode(email), `Code sent to ${email.trim()}. Check your inbox (and spam).`)) setCodeSent(true)
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    await run(() => api.signIn(email, password))
    setBusy(false)
  }
  return (
    <Box component="form" onSubmit={submit}>
      <Stack spacing={2.25}>
        <Box>
          <Typography variant="h5" component="h2" sx={{ fontFamily: display, fontWeight: 600, letterSpacing: '-0.02em', color: BA.ink }}>Sign in</Typography>
          <Typography sx={{ color: BA.soft, mt: 0.5 }}>Welcome back. You'll go straight to your business.</Typography>
        </Box>
        {api.authError?.() && <Alert severity="error">{api.authError()}</Alert>}
        {api.mode === 'demo' && (
          <Alert severity="info">Demo: use aron@example.com (admin) or maria@example.com (employee), any password.</Alert>
        )}
        <SocialButtons methods={methods} />
        <Divider sx={{ color: BA.faint, fontSize: 13 }}>or with your email</Divider>
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
        {codeSent ? <>
          <TextField label="6-digit code" value={code} onChange={e => setCode(e.target.value)} autoFocus
            slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 8 } }}
            helperText={api.mode === 'demo' ? 'Demo: the code is 123456' : `We emailed a code to ${email.trim()}. It works once, for an hour.`} />
          <Button variant="contained" size="large" disabled={busy || code.replace(/\D/g, '').length < 6} sx={primaryBtn}
            onClick={() => run(() => api.verifySignInCode(email, code))}>Sign in with code</Button>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Link component="button" type="button" variant="body2" onClick={sendCode} sx={linkSx}>Send a new code</Link>
            <Link component="button" type="button" variant="body2" onClick={() => { setCodeSent(false); setCode('') }} sx={linkSx}>Use my password</Link>
          </Stack>
        </> : <>
          <Box>
            <TextField label="Password" type="password" autoComplete="current-password" value={password} fullWidth
              onChange={e => setPassword(e.target.value)} required={api.mode === 'live'} />
            <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 1 }}>
              <Link component="button" type="button" variant="body2" onClick={sendCode} sx={linkSx}>Email me a sign-in code</Link>
              <Link component="button" type="button" variant="body2" sx={linkSx} onClick={async () => {
                if (!email) return notify('Enter your email first', 'warning')
                await run(() => api.sendPasswordReset(email), 'Check your email for a reset link')
              }}>Forgot password?</Link>
            </Stack>
          </Box>
          <Button type="submit" variant="contained" size="large" disabled={busy} sx={primaryBtn}>Sign in</Button>
        </>}
      </Stack>
    </Box>
  )
}

function SignUpForm({ onSignIn }: { onSignIn: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const methods = useSignInMethods()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const open = methods?.signup !== false
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return run(async () => { throw new Error('Use at least 8 characters for your password') })
    setBusy(true)
    let confirm = false
    await run(async () => { confirm = (await api.signUp(name, email, password)).confirmEmail })
    setBusy(false)
    if (confirm) setSent(email.trim())
  }
  if (sent) return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h2" sx={{ fontFamily: display, fontWeight: 600 }}>Check your email</Typography>
      <Typography sx={{ color: BA.soft }}>We sent a link to <b>{sent}</b>. Open it to confirm your account, then sign in.</Typography>
      <Button variant="outlined" sx={outlineBtn} onClick={onSignIn}>Back to sign in</Button>
    </Stack>
  )
  return (
    <Box component="form" onSubmit={submit}>
      <Stack spacing={2.25}>
        <Box>
          <Typography variant="h5" component="h2" sx={{ fontFamily: display, fontWeight: 600, letterSpacing: '-0.02em', color: BA.ink }}>Create your account</Typography>
          <Typography sx={{ color: BA.soft, mt: 0.5 }}>{TRIAL_MONTHS} months free for your business, no card needed. Joining a team? Register, then your admin adds you.</Typography>
        </Box>
        {!open && <Alert severity="info">Registration is closed for now. Ask your business's admin to invite you.</Alert>}
        {open && <>
          <SocialButtons methods={methods} />
          <Divider sx={{ color: BA.faint, fontSize: 13 }}>or with your email</Divider>
        </>}
        <TextField label="Your name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} required disabled={!open} />
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={!open} />
        <TextField label="Password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
          required disabled={!open} helperText="At least 8 characters" />
        <Button type="submit" variant="contained" size="large" disabled={busy || !open} sx={primaryBtn}>Create account</Button>
        <Typography variant="caption" sx={{ color: BA.faint, textAlign: 'center' }}>
          By creating an account you agree to the <Link href="/terms" sx={{ color: 'inherit' }}>terms</Link> and <Link href="/privacy" sx={{ color: 'inherit' }}>privacy policy</Link>.
        </Typography>
      </Stack>
    </Box>
  )
}
