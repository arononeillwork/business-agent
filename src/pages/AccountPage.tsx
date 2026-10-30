import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { FEATURES } from '../app/features'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAction, useNotify } from '../app/Notify'
import { PageHeader, SectionTitle } from '../components/common'
import { PinDialog } from './TeamPage'
import { ContactMethodField } from '../components/ContactMethod'
import { LanguagePicker } from '../components/Language'
import { PhoneField } from '../components/PhoneField'
import { MyPets } from '../components/Pets'
import { TimeZoneField } from '../components/TimeZoneField'
import { t, tn } from '../i18n'
import type { ContactMethod } from '../../shared/types'
import { DEFAULT_WHATSAPP_RETENTION, RETENTION_LABEL, WHATSAPP_RETENTION_DAYS, isRetention, type WhatsAppRetention } from '../../shared/messages'

export function AccountPage() {
  const { api, me, refresh, isPartner, isAdmin, business } = useApp()
  const run = useAction()
  const [name, setName] = useState(me?.full_name ?? '')
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [method, setMethod] = useState<ContactMethod | null>(me?.contact_method ?? null)
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState(false)
  if (!me) return null
  const dirty = name !== (me.full_name ?? '') || phone !== (me.phone ?? '') || method !== (me.contact_method ?? null)
  return (
    <>
      <PageHeader eyebrow={t('You')} title={t('My account')}
        actions={<Button variant="outlined" onClick={() => api.signOut()}>{t('Sign out')}</Button>} />
      <Stack spacing={2.5}>
        <Card component="section" aria-label={t('Personal details')}>
          <CardContent>
            <SectionTitle>{t('Personal details')}</SectionTitle>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <TextField label={t('Name')} value={name} onChange={e => setName(e.target.value)} />
              <TextField label={t('Email')} value={me.email ?? ''} helperText={t('Used to sign in. Ask an admin if it needs to change.')}
                slotProps={{ input: { readOnly: true } }} />
              {!isPartner && <>
                <PhoneField label={t('Mobile')} value={phone} onChange={setPhone} helperText={t('For WhatsApp and text alerts')} />
                <ContactMethodField value={method} onChange={setMethod} />
              </>}
            </Box>
            {isPartner ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                {t('{company}: read-only partner access. Ask {business} to change what you can see.', { company: me.partner_company ?? '', business: business?.name ?? 'Easy Beans' })}
              </Typography>
            ) : (
              (method === 'sms' || method === 'whatsapp') && !phone && (
                <Alert severity="info" sx={{ mt: 1.5 }}>{t('Add your mobile number so the café can reach you that way.')}</Alert>
              )
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: 'flex-end' }}>
              {dirty && <Button onClick={() => { setName(me.full_name ?? ''); setPhone(me.phone ?? ''); setMethod(me.contact_method ?? null) }}>{t('Cancel')}</Button>}
              <Button variant="contained" disabled={!dirty || !name.trim()} onClick={() => run(async () => {
                if (phone && phone.replace(/\D/g, '').length < 8) throw new Error(t('Enter the full mobile number'))
                await api.updateProfile(me.id, { full_name: name, phone: phone || null, ...(isPartner ? {} : { contact_method: method, whatsapp_opt_in: method === 'whatsapp' || method === 'sms' }) }); await refresh()
              }, t('Saved'))}>{t('Save')}</Button>
            </Stack>
          </CardContent>
        </Card>

        {/* Your dog (or cat), with a photo: the team meets them on the People page. */}
        {!isPartner && <MyPets />}

        <Card component="section" aria-label={t('Language')}>
          <CardContent>
            <SectionTitle>{t('Language')}</SectionTitle>
            <Box sx={{ maxWidth: 420 }}><LanguagePicker /></Box>
          </CardContent>
        </Card>

        <Card component="section" aria-label={t('Time zone')}>
          <CardContent>
            <SectionTitle>{t('Time zone')}</SectionTitle>
            <TimeZoneField />
          </CardContent>
        </Card>

        {!isPartner && FEATURES.kiosk && (
          <Card component="section" aria-label={t('Café tablet PIN')}>
            <CardContent>
              <SectionTitle>{t('Café tablet PIN')}</SectionTitle>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t('Your 4-digit PIN for clocking in at the counter.')}</Typography>
              <Button variant="outlined" onClick={() => setPin(true)}>{t('Set my PIN')}</Button>
            </CardContent>
          </Card>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
          <Card component="section" aria-label={t('Password')}>
            <CardContent>
              <SectionTitle>{t('Password')}</SectionTitle>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-start' } }}>
                <TextField type="password" label={t('New password')} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
                  helperText={t('At least 8 characters')} sx={{ flex: 1 }} />
                <Button variant="outlined" disabled={password.length < 8} sx={{ mt: { sm: 1 } }} onClick={() => run(async () => {
                  await api.updatePassword(password); setPassword('')
                }, t('Password changed'))}>{t('Change')}</Button>
              </Stack>
            </CardContent>
          </Card>
          <Card component="section" aria-label={t('Your data')}>
            <CardContent>
              <SectionTitle>{t('Your data')}</SectionTitle>
              <Typography variant="body2" color="text.secondary">
                {isPartner ? t('Your access is read-only. Use what you see only for the work agreed with {business}. Data is stored in the EU.', { business: business?.name ?? 'Easy Beans' })
                  : t('We record your clock-in and clock-out times and breaks, as Spanish law requires (registro de jornada, kept 4 years). Times come from our server, not your phone. Your location is never tracked. Data is stored in the EU.')}
              </Typography>
              {!isPartner && <Button component={RouterLink} to="/registro" variant="outlined" size="small" sx={{ mt: 1.5 }}>{t('My monthly hours record')}</Button>}
            </CardContent>
          </Card>
        </Box>

        {isAdmin && !isPartner && <DataRetention />}
      </Stack>
      {pin && <PinDialog onClose={() => setPin(false)} />}
    </>
  )
}

/**
 * How long the business keeps what Business Agent saves for it (admins). Today: the WhatsApp chats on
 * the Messages page, which WhatsApp can't share back, so the app keeps its own copy. A shorter time
 * deletes what's now too old straight away (after asking); a longer one keeps future messages longer.
 */
function DataRetention() {
  const { api, settings, refresh } = useApp()
  const run = useAction()
  const notify = useNotify()
  const saved = isRetention(settings?.whatsapp_retention_days) ? settings.whatsapp_retention_days : DEFAULT_WHATSAPP_RETENTION
  // A shorter time waits for a yes: it deletes messages.
  const [shorter, setShorter] = useState<WhatsAppRetention | null>(null)
  const apply = (days: WhatsAppRetention) => run(async () => {
    const { deleted } = await api.setWhatsappRetention(days)
    await refresh()
    setShorter(null)
    const kept = t('WhatsApp messages are now kept for {time}.', { time: t(RETENTION_LABEL[days]) })
    notify(deleted ? `${kept} ${tn(deleted, '{n} older message deleted.', '{n} older messages deleted.')}` : kept, 'success')
  })
  const choose = (days: WhatsAppRetention) => {
    if (days === saved) return
    if (days < saved) setShorter(days)
    else void apply(days)
  }
  return (
    <Card component="section" aria-label={t('Data retention')}>
      <CardContent>
        <SectionTitle>{t('Data retention')}</SectionTitle>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('How long Business Agent keeps what it saves for the business. Anything older is deleted for good, every night.')}
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" component="h3">{t('WhatsApp messages')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('The chats on the Messages page, with their photos, voice notes and files. WhatsApp doesn’t let apps read chats back, so Business Agent keeps its own copy.')}
            </Typography>
          </Box>
          <TextField select size="small" label={t('Keep for')} value={saved} sx={{ minWidth: 180 }}
            onChange={e => void choose(Number(e.target.value) as WhatsAppRetention)}>
            {WHATSAPP_RETENTION_DAYS.map(d => (
              <MenuItem key={d} value={d}>{d === DEFAULT_WHATSAPP_RETENTION ? t('{time} (default)', { time: t(RETENTION_LABEL[d]) }) : t(RETENTION_LABEL[d])}</MenuItem>
            ))}
          </TextField>
        </Stack>
      </CardContent>
      {shorter && (
        <Dialog open onClose={() => setShorter(null)} fullWidth maxWidth="xs" aria-labelledby="retention-title">
          <DialogTitle id="retention-title">{t('Keep WhatsApp messages for {time}?', { time: t(RETENTION_LABEL[shorter]) })}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              {t('Messages older than {time}, with their photos, voice notes and files, will be deleted now. This can’t be undone.', { time: t(RETENTION_LABEL[shorter]) })}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShorter(null)}>{t('Cancel')}</Button>
            <Button variant="contained" color="error" onClick={() => void apply(shorter)}>{t('Delete older messages')}</Button>
          </DialogActions>
        </Dialog>
      )}
    </Card>
  )
}
