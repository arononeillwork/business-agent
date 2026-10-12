import { Alert, Box, Button, Card, CardContent, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material'
import { FEATURES } from '../app/features'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { PageHeader, SectionTitle } from '../components/common'
import { PinDialog } from './TeamPage'
import { ContactMethodField } from '../components/ContactMethod'
import type { ContactMethod } from '../../shared/types'

export function AccountPage() {
  const { api, me, refresh, isPartner } = useApp()
  const run = useAction()
  const [name, setName] = useState(me?.full_name ?? '')
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [optIn, setOptIn] = useState(!!me?.whatsapp_opt_in)
  const [method, setMethod] = useState<ContactMethod | null>(me?.contact_method ?? null)
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState(false)
  if (!me) return null
  const dirty = name !== (me.full_name ?? '') || phone !== (me.phone ?? '') || optIn !== !!me.whatsapp_opt_in || method !== (me.contact_method ?? null)
  return (
    <>
      <PageHeader eyebrow="You" title="My account"
        actions={<Button variant="outlined" onClick={() => api.signOut()}>Sign out</Button>} />
      <Stack spacing={2.5}>
        <Card component="section" aria-label="Personal details">
          <CardContent>
            <SectionTitle>Personal details</SectionTitle>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <TextField label="Name" value={name} onChange={e => setName(e.target.value)} />
              <TextField label="Email" value={me.email ?? ''} helperText="Used to sign in. Ask an admin if it needs to change."
                slotProps={{ input: { readOnly: true } }} />
              {!isPartner && <>
                <TextField label="Mobile" type="tel" value={phone} onChange={e => setPhone(e.target.value)} helperText="For WhatsApp and text alerts" />
                <ContactMethodField value={method} onChange={setMethod} />
              </>}
            </Box>
            {isPartner ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                {me.partner_company}: read-only partner access. Ask Easy Beans to change what you can see.
              </Typography>
            ) : (
              <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                <FormControlLabel control={<Switch checked={optIn} onChange={e => setOptIn(e.target.checked)} />}
                  label="Send me shift reminders and rota updates on WhatsApp" />
                {(method === 'sms' || method === 'whatsapp' || optIn) && !phone && <Alert severity="info">Add your mobile number so the café can reach you that way.</Alert>}
              </Stack>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: 'flex-end' }}>
              {dirty && <Button onClick={() => { setName(me.full_name ?? ''); setPhone(me.phone ?? ''); setOptIn(!!me.whatsapp_opt_in); setMethod(me.contact_method ?? null) }}>Cancel</Button>}
              <Button variant="contained" disabled={!dirty || !name.trim()} onClick={() => run(async () => {
                await api.updateProfile(me.id, { full_name: name, phone: phone || null, whatsapp_opt_in: optIn, ...(isPartner ? {} : { contact_method: method }) }); await refresh()
              }, 'Saved')}>Save</Button>
            </Stack>
          </CardContent>
        </Card>

        {!isPartner && FEATURES.kiosk && (
          <Card component="section" aria-label="Café tablet PIN">
            <CardContent>
              <SectionTitle>Café tablet PIN</SectionTitle>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Your 4-digit PIN for clocking in at the counter.</Typography>
              <Button variant="outlined" onClick={() => setPin(true)}>Set my PIN</Button>
            </CardContent>
          </Card>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
          <Card component="section" aria-label="Password">
            <CardContent>
              <SectionTitle>Password</SectionTitle>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-start' } }}>
                <TextField type="password" label="New password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
                  helperText="At least 8 characters" sx={{ flex: 1 }} />
                <Button variant="outlined" disabled={password.length < 8} sx={{ mt: { sm: 1 } }} onClick={() => run(async () => {
                  await api.updatePassword(password); setPassword('')
                }, 'Password changed')}>Change</Button>
              </Stack>
            </CardContent>
          </Card>
          <Card component="section" aria-label="Your data">
            <CardContent>
              <SectionTitle>Your data</SectionTitle>
              <Typography variant="body2" color="text.secondary">
                {isPartner ? 'Your access is read-only. Use what you see only for the work agreed with Easy Beans. Data is stored in the EU.' : <>We record your clock-in and clock-out times and breaks, as Spanish law requires (registro de jornada, kept 4 years).
                Times come from our server, not your phone. Your location is never tracked. Data is stored in the EU.</>}
              </Typography>
              {!isPartner && <Button component={RouterLink} to="/registro" variant="outlined" size="small" sx={{ mt: 1.5 }}>My monthly hours record</Button>}
            </CardContent>
          </Card>
        </Box>
      </Stack>
      {pin && <PinDialog onClose={() => setPin(false)} />}
    </>
  )
}
