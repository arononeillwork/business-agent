import { Alert, Box, Button, Card, CardContent, Divider, Link, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction, useNotify } from '../app/Notify'
import { businessConfig } from '../../shared/business.config'
import { Logo } from '../components/Logo'
import GoogleIcon from '@mui/icons-material/Google'

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
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 380 }}>
        <CardContent component="form" onSubmit={submit}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Logo size={40} />
              <Box>
                <Typography variant="h6">{businessConfig.name}</Typography>
                <Typography variant="body2" color="text.secondary">Team sign-in</Typography>
              </Box>
            </Stack>
            <Button variant="outlined" size="large" startIcon={<GoogleIcon />} onClick={() => run(() => api.signInWithGoogle())}>
              Continue with Google
            </Button>
            <Divider sx={{ color: 'text.secondary', fontSize: 13 }}>or with email</Divider>
            {api.mode === 'demo' && (
              <Alert severity="info">Demo: use aron@example.com (admin) or maria@example.com (employee), any password.</Alert>
            )}
            <TextField label="Email" type="email" autoComplete="email" value={email}
              onChange={e => setEmail(e.target.value)} required />
            <TextField label="Password" type="password" autoComplete="current-password" value={password}
              onChange={e => setPassword(e.target.value)} required={api.mode === 'live'} />
            <Button type="submit" variant="contained" size="large" disabled={busy}>Sign in</Button>
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
              <Link component="button" type="button" variant="body2" onClick={async () => {
                if (!email) return notify('Enter your email first', 'warning')
                await run(() => api.sendPasswordReset(email), 'Check your email for a reset link')
              }}>Forgot password?</Link>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
