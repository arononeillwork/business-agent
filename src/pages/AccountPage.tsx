import { Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { PageHeader } from '../components/common'
import { PinDialog } from './TeamPage'

export function AccountPage() {
  const { api, me, refresh } = useApp()
  const run = useAction()
  const [name, setName] = useState(me?.full_name ?? '')
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState(false)
  if (!me) return null
  return (
    <>
      <PageHeader title="My account" subtitle={me.email ?? undefined}
        actions={<Button variant="outlined" onClick={() => api.signOut()}>Sign out</Button>} />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Details</Typography>
              <Stack spacing={2}>
                <TextField label="Name" value={name} onChange={e => setName(e.target.value)} />
                <TextField label="Mobile (for WhatsApp / SMS alerts)" value={phone} onChange={e => setPhone(e.target.value)} />
                <TextField select label="Where should alerts reach me?" value="default" disabled
                  helperText="Personal alert channels arrive with alerts (phase 2)">
                  <MenuItem value="default">Team default</MenuItem>
                </TextField>
                <Button variant="contained" onClick={() => run(async () => {
                  await api.updateProfile(me.id, { full_name: name, phone: phone || null }); await refresh()
                }, 'Saved')}>Save</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Café tablet PIN</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Your 4-digit PIN for clocking in at the counter.</Typography>
              <Button variant="outlined" onClick={() => setPin(true)}>Set my PIN</Button>
            </CardContent>
          </Card>
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Password</Typography>
              <Stack direction="row" spacing={1}>
                <TextField type="password" label="New password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
                <Button variant="outlined" disabled={password.length < 8} onClick={() => run(async () => {
                  await api.updatePassword(password); setPassword('')
                }, 'Password changed')}>Change</Button>
              </Stack>
            </CardContent>
          </Card>
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>Your data</Typography>
              <Typography variant="body2" color="text.secondary">
                We record your clock-in and clock-out times and breaks, as Spanish law requires (registro de jornada, kept 4 years).
                Times come from our server, not your phone. Your location is never tracked. Data is stored in the EU.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      {pin && <PinDialog onClose={() => setPin(false)} />}
    </>
  )
}
