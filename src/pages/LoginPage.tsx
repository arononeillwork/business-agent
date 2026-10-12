import { Link as RouterLink } from 'react-router-dom'
import { Alert, Box, Button, Divider, Link, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import GoogleIcon from '@mui/icons-material/Google'
import RotaIcon from '@mui/icons-material/CalendarViewWeekOutlined'
import ClockIcon from '@mui/icons-material/AccessTimeOutlined'
import TimeOffIcon from '@mui/icons-material/BeachAccessOutlined'
import MapIcon from '@mui/icons-material/StorefrontOutlined'
import ChatIcon from '@mui/icons-material/ForumOutlined'
import SparkIcon from '@mui/icons-material/AutoAwesomeOutlined'
import LockIcon from '@mui/icons-material/VerifiedUserOutlined'
import EuIcon from '@mui/icons-material/PublicOutlined'
import QuickIcon from '@mui/icons-material/BoltOutlined'
import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAction, useNotify } from '../app/Notify'

// Business Agent: the product. Signed-out visitors see this page, in its own look (not any one
// business's brand). Once someone signs in, they see their business's branded app.
const BA = {
  ink: '#12141A', soft: '#4B5160', faint: '#8A90A0', line: '#E4E7EE', bg: '#F5F6FA', card: '#FFFFFF',
  accent: '#4F46E5', accentDeep: '#3730A3', accentSoft: '#EEF0FF', teal: '#0EA5A0',
}
const display = '"Poppins", system-ui, sans-serif'

/** The Business Agent mark: a rounded square with a spark. */
export function AgentMark({ size = 32 }: { size?: number }) {
  return (
    <Box component="svg" viewBox="0 0 32 32" aria-hidden sx={{ width: size, height: size, flexShrink: 0 }}>
      <defs>
        <linearGradient id="ba-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={BA.accent} /><stop offset="1" stopColor={BA.teal} /></linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#ba-g)" />
      <path d="M16 7.5l2.2 5.9 5.9 2.2-5.9 2.2L16 23.7l-2.2-5.9-5.9-2.2 5.9-2.2z" fill="#fff" />
    </Box>
  )
}

/** Microsoft's four-square mark, as Microsoft asks sign-in buttons to show it. */
function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" /><rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" /><rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}

// What it does, at a glance: an icon and a few words each, no paragraphs to read.
const HIGHLIGHTS: { icon: ReactNode; label: string }[] = [
  { icon: <RotaIcon />, label: 'Rota in minutes' },
  { icon: <ClockIcon />, label: 'Clock-ins and hours' },
  { icon: <TimeOffIcon />, label: 'Time off' },
  { icon: <MapIcon />, label: 'Google Maps in sync' },
  { icon: <ChatIcon />, label: 'WhatsApp reminders' },
  { icon: <SparkIcon />, label: 'Ask Claude or ChatGPT' },
]
const TRUST: { icon: ReactNode; label: string }[] = [
  { icon: <QuickIcon />, label: 'Set up in minutes' },
  { icon: <LockIcon />, label: 'Pay stays private' },
  { icon: <EuIcon />, label: 'Data stored in the EU' },
]

// Buttons in the product's own colours (the app's theme is the business's brand).
const primaryBtn = { bgcolor: BA.accent, color: '#fff', fontWeight: 500, '&:hover': { bgcolor: BA.accentDeep } }
const outlineBtn = { borderColor: BA.line, color: BA.ink, bgcolor: '#fff', '&:hover': { borderColor: BA.accent, bgcolor: BA.accentSoft } }

/** Signed out: the Business Agent landing page with sign-in and registration. */
export function LoginPage() {
  const [tab, setTab] = useState<'signin' | 'signup'>('signin')
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: BA.bg, color: BA.ink, colorScheme: 'light', display: 'flex', flexDirection: 'column',
      '& .MuiOutlinedInput-root': { bgcolor: '#fff', color: BA.ink },
      '& .MuiOutlinedInput-notchedOutline': { borderColor: BA.line },
      '& .Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: `${BA.accent} !important` },
      '& .MuiInputLabel-root': { color: BA.soft }, '& .MuiInputLabel-root.Mui-focused': { color: BA.accent },
      backgroundImage: `radial-gradient(900px 480px at 85% -120px, rgba(79,70,229,0.16), transparent 70%), radial-gradient(760px 420px at 0% 0%, rgba(14,165,160,0.12), transparent 70%)`,
      backgroundRepeat: 'no-repeat' }}>
      <Box component="header" sx={{ width: '100%', maxWidth: 1180, mx: 'auto', px: { xs: 2, md: 4 }, py: 2.25, display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <AgentMark />
        <Typography sx={{ fontFamily: display, fontWeight: 500, fontSize: '1.15rem', letterSpacing: '-0.01em', flex: 1 }}>Business Agent</Typography>
        <Button onClick={() => setTab('signin')} href="#account" sx={{ color: BA.ink, display: { xs: 'none', sm: 'inline-flex' } }}>Sign in</Button>
        <Button variant="contained" href="#account" onClick={() => setTab('signup')} sx={primaryBtn}>Get started</Button>
      </Box>

      {/* Phones: the headline, then sign-in, then the rest. Wider screens: sign-in beside it all. */}
      <Box component="main" sx={{ flex: 1, width: '100%', maxWidth: 1180, mx: 'auto', px: { xs: 2, md: 4 }, pt: { xs: 2, md: 8 }, pb: { xs: 6, md: 10 },
        display: 'grid', columnGap: 8, rowGap: { xs: 4, md: 5 }, alignItems: 'start',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) 440px' },
        gridTemplateRows: { md: 'auto 1fr' },
        gridTemplateAreas: { xs: '"hero" "account" "more"', md: '"hero account" "more account"' } }}>
        <Box sx={{ gridArea: 'hero' }}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderRadius: 99, bgcolor: BA.accentSoft, color: BA.accentDeep }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: BA.teal }} />
            <Typography sx={{ fontWeight: 500, fontSize: '0.8rem' }}>For cafés, shops and small teams</Typography>
          </Box>
          <Typography component="h1" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '2.25rem', sm: '2.8rem', md: '3.5rem' }, lineHeight: 1.05,
            letterSpacing: '-0.035em', mt: 2.5, maxWidth: 640 }}>
            The agent that runs your business's{' '}
            <Box component="span" sx={{ background: `linear-gradient(90deg, ${BA.accent}, ${BA.teal})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', whiteSpace: 'nowrap' }}>
              day-to-day.
            </Box>
          </Typography>
          <Typography sx={{ color: BA.soft, fontSize: { xs: '1.05rem', md: '1.2rem' }, mt: 2.5, maxWidth: 520, lineHeight: 1.55 }}>
            Rota, clock-ins, time off and team messages in one place, in your own brand.
          </Typography>
        </Box>

        <Box id="account" sx={{ gridArea: 'account', scrollMarginTop: 16 }}>
          <Box sx={{ p: { xs: 2.5, sm: 3.5 }, borderRadius: '24px', bgcolor: BA.card, border: `1px solid ${BA.line}`,
            boxShadow: '0 30px 70px -36px rgba(18,20,26,0.4)' }}>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" aria-label="Account"
              sx={{ mb: 2.5, minHeight: 40, bgcolor: BA.bg, borderRadius: '12px', p: 0.5,
                '& .MuiTabs-indicator': { display: 'none' },
                '& .MuiTab-root': { minHeight: 36, borderRadius: '9px', color: BA.soft, fontWeight: 500, textTransform: 'none' },
                '& .Mui-selected': { bgcolor: '#fff', color: `${BA.ink} !important`, boxShadow: '0 1px 3px rgba(18,20,26,0.12)' } }}>
              <Tab value="signin" label="Sign in" />
              <Tab value="signup" label="Create account" />
            </Tabs>
            {tab === 'signin' ? <SignInForm /> : <SignUpForm onSignIn={() => setTab('signin')} />}
          </Box>
        </Box>

        <Box sx={{ gridArea: 'more' }}>
          <Box component="ul" aria-label="What it does" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', columnGap: 2, rowGap: 2.25, maxWidth: 600,
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' } }}>
            {HIGHLIGHTS.map(h => (
              <Box component="li" key={h.label} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: '10px', display: 'grid', placeItems: 'center', flexShrink: 0,
                  bgcolor: '#fff', color: BA.accent, border: `1px solid ${BA.line}`, '& svg': { fontSize: 20 } }}>{h.icon}</Box>
                <Typography sx={{ fontWeight: 500, fontSize: '0.95rem', lineHeight: 1.3 }}>{h.label}</Typography>
              </Box>
            ))}
          </Box>
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', columnGap: 2.5, rowGap: 1, mt: 4, color: BA.soft }}>
            {TRUST.map(t => (
              <Stack key={t.label} direction="row" spacing={0.75} sx={{ alignItems: 'center', '& svg': { fontSize: 18, color: BA.teal } }}>
                {t.icon}<Typography variant="body2">{t.label}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      </Box>

      <Box component="footer" sx={{ borderTop: `1px solid ${BA.line}`, py: 3, px: 2, textAlign: 'center' }}>
        <Typography variant="caption" sx={{ color: BA.faint }}>
          Business Agent · Made in Marbella ·{' '}
          <Link component={RouterLink} to="/privacy" underline="hover" sx={{ color: 'inherit' }}>Privacy policy</Link>{' · '}
          <Link component={RouterLink} to="/terms" underline="hover" sx={{ color: 'inherit' }}>Terms of service</Link>
        </Typography>
      </Box>
    </Box>
  )
}

function SignInForm() {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [methods, setMethods] = useState<{ google: boolean; microsoft: boolean } | null>(null)
  // Until Supabase says which methods are on, the Google/Microsoft buttons wait: a click before
  // then could open a provider that isn't set up. If the check fails, offer them anyway.
  useEffect(() => { api.signInMethods().then(setMethods, () => setMethods({ google: true, microsoft: true })) }, [api])
  const off = [methods && !methods.google && 'Google', methods && !methods.microsoft && 'Microsoft'].filter(Boolean) as string[]
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
          <Typography variant="h5" component="h2" sx={{ fontFamily: display, fontWeight: 500, color: BA.ink }}>Sign in</Typography>
          <Typography sx={{ color: BA.soft, mt: 0.5 }}>Welcome back. You'll go straight to your business.</Typography>
        </Box>
        {api.authError?.() && <Alert severity="error">{api.authError()}</Alert>}
        {api.mode === 'demo' && (
          <Alert severity="info">Demo: use aron@example.com (admin) or maria@example.com (employee), any password.</Alert>
        )}
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
        {codeSent ? <>
          <TextField label="6-digit code" value={code} onChange={e => setCode(e.target.value)} autoFocus
            slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 8 } }}
            helperText={api.mode === 'demo' ? 'Demo: the code is 123456' : `We emailed a code to ${email.trim()}. It works once, for an hour.`} />
          <Button variant="contained" size="large" disabled={busy || code.replace(/\D/g, '').length < 6} sx={primaryBtn}
            onClick={() => run(() => api.verifySignInCode(email, code))}>Sign in with code</Button>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Link component="button" type="button" variant="body2" onClick={sendCode} sx={{ color: BA.accent }}>Send a new code</Link>
            <Link component="button" type="button" variant="body2" onClick={() => { setCodeSent(false); setCode('') }} sx={{ color: BA.accent }}>Use my password</Link>
          </Stack>
        </> : <>
          <Box>
            <TextField label="Password" type="password" autoComplete="current-password" value={password}
              onChange={e => setPassword(e.target.value)} required={api.mode === 'live'} />
            <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 1 }}>
              <Link component="button" type="button" variant="body2" onClick={sendCode} sx={{ color: BA.accent }}>Email me a sign-in code</Link>
              <Link component="button" type="button" variant="body2" sx={{ color: BA.accent }} onClick={async () => {
                if (!email) return notify('Enter your email first', 'warning')
                await run(() => api.sendPasswordReset(email), 'Check your email for a reset link')
              }}>Forgot password?</Link>
            </Stack>
          </Box>
          <Button type="submit" variant="contained" size="large" disabled={busy} sx={primaryBtn}>Sign in</Button>
        </>}
        <Divider sx={{ color: BA.faint, fontSize: 13, pt: 1 }}>or continue with</Divider>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <Button fullWidth variant="outlined" size="large" startIcon={<GoogleIcon />} disabled={!methods?.google} sx={outlineBtn}
            onClick={() => run(() => api.signInWithGoogle())}>Google</Button>
          <Button fullWidth variant="outlined" size="large" startIcon={<MicrosoftIcon />} disabled={!methods?.microsoft} sx={outlineBtn}
            onClick={() => run(() => api.signInWithMicrosoft())}>Microsoft</Button>
        </Stack>
        <Typography variant="caption" sx={{ color: BA.faint, textAlign: 'center' }}>
          {off.length ? `${off.join(' and ')} sign-in ${off.length > 1 ? 'are' : 'is'} being set up. Use your email and password for now.`
            : 'Outlook, Hotmail and Microsoft 365 accounts use Microsoft.'}
        </Typography>
      </Stack>
    </Box>
  )
}

function SignUpForm({ onSignIn }: { onSignIn: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  useEffect(() => { api.signInMethods().then(m => setOpen(m.signup !== false), () => {}) }, [api])
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
      <Typography variant="h5" component="h2" sx={{ fontFamily: display, fontWeight: 500 }}>Check your email</Typography>
      <Typography sx={{ color: BA.soft }}>We sent a link to <b>{sent}</b>. Open it to confirm your account, then sign in.</Typography>
      <Button variant="outlined" sx={outlineBtn} onClick={onSignIn}>Back to sign in</Button>
    </Stack>
  )
  return (
    <Box component="form" onSubmit={submit}>
      <Stack spacing={2.25}>
        <Box>
          <Typography variant="h5" component="h2" sx={{ fontFamily: display, fontWeight: 500, color: BA.ink }}>Create account</Typography>
          <Typography sx={{ color: BA.soft, mt: 0.5 }}>Joining a team? Register here, then your business's admin adds you.</Typography>
        </Box>
        {!open && <Alert severity="info">Registration is closed for now. Ask your business's admin to invite you.</Alert>}
        <TextField label="Your name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} required disabled={!open} />
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={!open} />
        <TextField label="Password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
          required disabled={!open} helperText="At least 8 characters" />
        <Button type="submit" variant="contained" size="large" disabled={busy || !open} sx={primaryBtn}>Create account</Button>
        <Typography variant="caption" sx={{ color: BA.faint, textAlign: 'center' }}>
          Setting up Business Agent for your own business? That's coming soon.
        </Typography>
      </Stack>
    </Box>
  )
}
