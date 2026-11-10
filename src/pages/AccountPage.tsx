import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { FEATURES } from '../app/features'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAction, useNotify } from '../app/Notify'
import { PageHeader, SectionTitle } from '../components/common'
import { PinDialog } from './TeamPage'
import { ContactMethodField } from '../components/ContactMethod'
import { LanguagePicker, TeamLanguages } from '../components/Language'
import { PhoneField } from '../components/PhoneField'
import { MyPets } from '../components/Pets'
import { TimeZoneField } from '../components/TimeZoneField'
import { DeviceBusinesses, useSignOutLabel } from '../components/BusinessSwitcher'
import { t, tc, tn } from '../i18n'
import { roleNamesOf } from '../../shared/roles'
import { currentCountry } from '../../shared/country'
import { teamRoleLabel } from '../../shared/teamRoles'
import type { ContactMethod } from '../../shared/types'
import { DEFAULT_WHATSAPP_RETENTION, RETENTION_LABEL, WHATSAPP_RETENTION_DAYS, isRetention, type WhatsAppRetention } from '../../shared/messages'

export function AccountPage() {
  const { api, me, isPartner, isAdmin, business, jobRoles } = useApp()
  const run = useAction()
  const [name, setName] = useState(me?.full_name ?? '')
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [method, setMethod] = useState<ContactMethod | null>(me?.contact_method ?? null)
  const [password, setPassword] = useState('')
  // Typed twice, so a slip of the finger can't lock them out.
  const [again, setAgain] = useState('')
  const [pin, setPin] = useState(false)
  // Saving until the details are back saved, so Save can't be pressed twice meanwhile.
  const [saving, setSaving] = useState(false)
  const signOut = useSignOutLabel()
  if (!me) return null
  // Said while typing the second one only once it can't be the start of the first.
  const mismatch = !!again && !password.startsWith(again)
  // Too short, once they've moved on to typing it again.
  const short = !!again && password.length < 8
  const dirty = name !== (me.full_name ?? '') || phone !== (me.phone ?? '') || method !== (me.contact_method ?? null)
  return (
    <>
      <PageHeader eyebrow={t('You')} title={t('My account')}
        actions={<Button variant="outlined" onClick={() => api.signOut()}>{signOut}</Button>} />
      <Stack spacing={2.5}>
        <Card component="section" aria-label={t('Personal details')}>
          <CardContent>
            <SectionTitle>{t('Personal details')}</SectionTitle>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <TextField label={t('Name')} value={name} onChange={e => setName(e.target.value)} />
              <TextField label={t('Email')} value={me.email ?? ''} slotProps={{ input: { readOnly: true } }} />
              {!isPartner && <>
                {/* Fixed: an admin gives them (Roles & responsibilities, and the Team page). */}
                <TextField label={tc('job', 'Role')} value={roleNamesOf(me.id, jobRoles).join(', ') || t('No role yet')}
                  slotProps={{ input: { readOnly: true } }} />
                <TextField label={t('Access')} value={t(teamRoleLabel(me) ?? 'Employee')} slotProps={{ input: { readOnly: true } }} />
                <PhoneField label={t('Mobile')} value={phone} onChange={setPhone} />
                <ContactMethodField value={method} onChange={setMethod} />
              </>}
            </Box>
            {isPartner ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                {t('{company}: read-only partner access. Ask {business} to change what you can see.', { company: me.partner_company ?? '', business: business?.name ?? t('your business') })}
              </Typography>
            ) : (
              (method === 'sms' || method === 'whatsapp') && !phone && (
                <Alert severity="info" sx={{ mt: 1.5 }}>{t('Add your mobile number so the café can reach you that way.')}</Alert>
              )
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: 'flex-end' }}>
              {dirty && <Button onClick={() => { setName(me.full_name ?? ''); setPhone(me.phone ?? ''); setMethod(me.contact_method ?? null) }}>{t('Cancel')}</Button>}
              <Button variant="contained" disabled={saving || !dirty || !name.trim()} onClick={() => { setSaving(true); void run(async () => {
                if (phone && phone.replace(/\D/g, '').length < 8) throw new Error(t('Enter the full mobile number'))
                await api.updateProfile(me.id, { full_name: name, phone: phone || null, ...(isPartner ? {} : { contact_method: method, whatsapp_opt_in: method === 'whatsapp' || method === 'sms' }) })
              }, t('Saved'), { fresh: true }).finally(() => setSaving(false)) }}>{t('Save')}</Button>
            </Stack>
          </CardContent>
        </Card>

        {/* Your dog (or cat), with a photo: the team meets them on the People page. */}
        {!isPartner && <MyPets />}

        <Card component="section" aria-label={t('Language')}>
          <CardContent>
            <SectionTitle>{t('Language')}</SectionTitle>
            <Stack spacing={2} sx={{ maxWidth: 420 }}>
              <LanguagePicker />
              {isAdmin && <TeamLanguages />}
            </Stack>
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
              <Stack spacing={1.5}>
                {/* Said only when something's wrong. */}
                <TextField type="password" label={t('New password')} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
                  error={short} helperText={short ? t('At least 8 characters') : undefined} />
                <TextField type="password" label={t('Confirm new password')} autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)}
                  error={mismatch} helperText={mismatch ? t('The passwords don’t match') : undefined} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button variant="outlined" disabled={password.length < 8 || again !== password} onClick={() => run(async () => {
                    await api.updatePassword(password); setPassword(''); setAgain('')
                  }, t('Password changed'))}>{t('Change')}</Button>
                </Box>
              </Stack>
            </CardContent>
          </Card>
          <Card component="section" aria-label={t('Your data')}>
            <CardContent>
              <SectionTitle>{t('Your data')}</SectionTitle>
              <Typography variant="body2" color="text.secondary">
                {isPartner ? t('Your access is read-only. Use what you see only for the work agreed with {business}. Data is stored in the EU.', { business: business?.name ?? t('your business') })
                  : currentCountry() === 'IE'
                    ? t('We record your clock-in and clock-out times and breaks, as Irish law requires (working time records, kept 3 years). Times come from our server, not your phone. Your location is never tracked. Data is stored in the EU.')
                    : t('We record your clock-in and clock-out times and breaks, as Spanish law requires (registro de jornada, kept 4 years). Times come from our server, not your phone. Your location is never tracked. Data is stored in the EU.')}
              </Typography>
              {!isPartner && <Button component={RouterLink} to="/registro" variant="outlined" size="small" sx={{ mt: 1.5 }}>{t('My monthly hours record')}</Button>}
            </CardContent>
          </Card>
        </Box>

        {isAdmin && !isPartner && <DataRetention />}

        {/* Other businesses on this device: open, add or take one off (also top left, and in the account menu). */}
        <DeviceBusinesses />
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
  const { api, settings } = useApp()
  const run = useAction()
  const notify = useNotify()
  const saved = isRetention(settings?.whatsapp_retention_days) ? settings.whatsapp_retention_days : DEFAULT_WHATSAPP_RETENTION
  // A shorter time waits for a yes: it deletes messages.
  const [shorter, setShorter] = useState<WhatsAppRetention | null>(null)
  const [busy, setBusy] = useState(false)
  // Said as soon as it's done; the question closes once the setting is back, showing the new time.
  const apply = async (days: WhatsAppRetention) => {
    setBusy(true)
    const ok = await run(async () => {
      const { deleted } = await api.setWhatsappRetention(days)
      const kept = t('WhatsApp messages are now kept for {time}.', { time: t(RETENTION_LABEL[days]) })
      notify(deleted ? `${kept} ${tn(deleted, '{n} older message deleted.', '{n} older messages deleted.')}` : kept, 'success')
    }, undefined, { fresh: true })
    setBusy(false)
    if (ok) setShorter(null)
  }
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
          {t('How long The Business Agent keeps what it saves for the business. Anything older is deleted for good, every night.')}
        </Typography>
        {/* What's kept on the left, taking the room it needs; how long on the right, a fixed width (full width on a phone). */}
        <Stack direction={{ xs: 'column', sm: 'row' }} useFlexGap spacing={2} sx={{ alignItems: { sm: 'center' }, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ flex: '1 1 auto', minWidth: 0, maxWidth: 680 }}>
            <Typography variant="subtitle2" component="h3">{t('WhatsApp messages')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('The chats on the Messages page, with their photos, voice notes and files. WhatsApp doesn’t let apps read chats back, so The Business Agent keeps its own copy.')}
            </Typography>
          </Box>
          <TextField select size="small" label={t('Keep for')} value={saved} sx={{ flex: '0 0 auto', width: { xs: '100%', sm: 220 }, ml: { sm: 'auto' } }}
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
            <Button variant="contained" color="error" disabled={busy} onClick={() => void apply(shorter)}>{t('Delete older messages')}</Button>
          </DialogActions>
        </Dialog>
      )}
    </Card>
  )
}
