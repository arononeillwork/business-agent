import { Alert, Button, Card, CardContent, FormControlLabel, Grid, Stack, Switch, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { PageHeader, SectionTitle } from '../components/common'
import { PinDialog } from './TeamPage'

export function AccountPage() {
  const { api, me, refresh, isPartner } = useApp()
  const run = useAction()
  const [name, setName] = useState(me?.full_name ?? '')
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [optIn, setOptIn] = useState(!!me?.whatsapp_opt_in)
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState(false)
  if (!me) return null
  return (
    <>
      <PageHeader eyebrow="You" title="My account" subtitle={me.email ?? undefined}
        actions={<Button variant="outlined" onClick={() => api.signOut()}>Sign out</Button>} />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <SectionTitle>Details</SectionTitle>
              <Stack spacing={2}>
                <TextField label="Name" value={name} onChange={e => setName(e.target.value)} />
                {isPartner ? (
                  <Typography variant="body2" color="text.secondary">
                    {me.partner_company}: read-only partner access. Ask Easy Beans to change what you can see.
                  </Typography>
                ) : <>
                  <TextField label="Mobile (for WhatsApp / SMS alerts)" value={phone} onChange={e => setPhone(e.target.value)} />
                  <FormControlLabel control={<Switch checked={optIn} onChange={e => setOptIn(e.target.checked)} />}
                    label="Send me shift reminders and rota updates on WhatsApp" />
                  {optIn && !phone && <Alert severity="info">Add your mobile number above to get WhatsApp messages.</Alert>}
                </>}
                <Button variant="contained" onClick={() => run(async () => {
                  await api.updateProfile(me.id, { full_name: name, phone: phone || null, whatsapp_opt_in: optIn }); await refresh()
                }, 'Saved')}>Save</Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          {!isPartner && (
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <SectionTitle>Café tablet PIN</SectionTitle>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Your 4-digit PIN for clocking in at the counter.</Typography>
                <Button variant="outlined" onClick={() => setPin(true)}>Set my PIN</Button>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent>
              <SectionTitle>Password</SectionTitle>
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
              <SectionTitle>Your data</SectionTitle>
              <Typography variant="body2" color="text.secondary">
                {isPartner ? 'Your access is read-only. Use what you see only for the work agreed with Easy Beans. Data is stored in the EU.' : <>We record your clock-in and clock-out times and breaks, as Spanish law requires (registro de jornada, kept 4 years).
                Times come from our server, not your phone. Your location is never tracked. Data is stored in the EU.</>}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      {pin && <PinDialog onClose={() => setPin(false)} />}
    </>
  )
}
