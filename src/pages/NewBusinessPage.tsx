import { Autocomplete, Box, Button, ButtonBase, Divider, Stack, TextField, Typography } from '@mui/material'
import CafeIcon from '@mui/icons-material/LocalCafeOutlined'
import RestaurantIcon from '@mui/icons-material/RestaurantOutlined'
import SalonIcon from '@mui/icons-material/ContentCutOutlined'
import StoreIcon from '@mui/icons-material/StorefrontOutlined'
import GiftIcon from '@mui/icons-material/CardGiftcardOutlined'
import CheckIcon from '@mui/icons-material/CheckRounded'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { forgetReferral, keptReferral } from '../app/referral'
import { startGuide } from './SetupPage'
import { AgentMark, BA, Wordmark, display, glow, outlineBtn, primaryBtn } from './marketing/site'
import { TRIAL_MONTHS } from './marketing/plans'
import { msg, t, tr } from '../i18n'

type Kind = 'cafe' | 'restaurant' | 'salon' | 'other'
const KINDS: { kind: Kind; name: string; icon: ReactNode }[] = [
  { kind: 'cafe', name: msg('Café & coffee shop'), icon: <CafeIcon /> },
  { kind: 'restaurant', name: msg('Restaurant & bar'), icon: <RestaurantIcon /> },
  { kind: 'salon', name: msg('Salon & beauty'), icon: <SalonIcon /> },
  { kind: 'other', name: msg('Something else'), icon: <StoreIcon /> },
]

/** Every time zone the browser knows, the person's own first. */
function timeZones(own: string) {
  let all: string[] = []
  try { all = Intl.supportedValuesOf('timeZone') } catch { all = ['Europe/Madrid', 'Atlantic/Canary', 'Europe/Lisbon', 'Europe/London'] }
  return [own, ...all.filter(z => z !== own)]
}
const ownZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid' } catch { return 'Europe/Madrid' }
}

/**
 * Signed up on their own and in no business yet: create theirs (they run it: admin and owner, on the
 * Free plan), then on to the set-up guide. Or ask a manager to add them to an existing team. Shown
 * in Business Agent's own look, like the sign-up card they came from.
 */
export function NewBusinessPage() {
  const { api, me, refresh } = useApp()
  const run = useAction()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Kind | null>(null)
  const [zone, setZone] = useState(ownZone)
  const zones = useMemo(() => timeZones(ownZone()), [])
  const [code] = useState(keptReferral)
  const [by, setBy] = useState<string | null>(null)
  useEffect(() => {
    if (code) void api.openReferral(code, false).then(r => setBy(r.business), () => {})
  }, [api, code])

  const create = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await api.createBusiness({ name: name.trim(), kind, timezone: zone, referral: by ? code : null })
      forgetReferral()
      startGuide(kind)
      navigate('/setup', { replace: true })
      await refresh()
    })
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2, bgcolor: BA.bg, color: BA.ink, colorScheme: 'light', backgroundImage: glow() }}>
      <Box component="form" onSubmit={create} aria-labelledby="new-business-title"
        sx={{ width: '100%', maxWidth: 560, p: { xs: 2.5, sm: 4 }, borderRadius: '24px', bgcolor: BA.card, border: `1px solid ${BA.line}`,
          boxShadow: '0 24px 60px -30px rgba(43,37,34,0.35)' }}>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            <AgentMark />
            <Wordmark size="1.3rem" />
          </Stack>
          {by && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: BA.accent }}>
              <GiftIcon fontSize="small" />
              <Typography sx={{ fontWeight: 500, fontSize: '0.9rem' }}>{t('Invited by {name}: your first month is on us', { name: by })}</Typography>
            </Stack>
          )}
          <Box>
            <Typography id="new-business-title" variant="h4" component="h1" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '1.9rem', sm: '2.3rem' }, lineHeight: 1.1 }}>
              {me?.full_name ? t('Welcome, {name}. Let’s set up your business.', { name: me.full_name.split(' ')[0] }) : t('Let’s set up your business.')}
            </Typography>
            <Typography sx={{ color: BA.soft, mt: 1 }}>
              {t('You’ll run it: you can add your team and change everything later. It starts on the Free plan, and Business is free for {n} months whenever you want it.', { n: TRIAL_MONTHS })}
            </Typography>
          </Box>

          <TextField label={t('Business name')} value={name} onChange={e => setName(e.target.value)} required autoFocus
            slotProps={{ htmlInput: { maxLength: 120 } }} />

          <Box role="group" aria-labelledby="new-business-kind">
            <Typography id="new-business-kind" variant="subtitle2" sx={{ mb: 1 }}>{t('What kind of business is it?')}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
              {KINDS.map(k => {
                const on = kind === k.kind
                return (
                  <ButtonBase key={k.kind} aria-pressed={on} onClick={() => setKind(on ? null : k.kind)}
                    sx={{ justifyContent: 'flex-start', gap: 1.25, p: 1.5, borderRadius: '14px', textAlign: 'left',
                      border: `2px solid ${on ? BA.roseDeep : BA.line}`, bgcolor: on ? BA.roseSoft : BA.card }}>
                    <Box sx={{ width: 38, height: 38, borderRadius: '11px', display: 'grid', placeItems: 'center', bgcolor: BA.tint, flexShrink: 0 }}>{k.icon}</Box>
                    <Typography sx={{ flex: 1, fontWeight: 500 }}>{t(k.name)}</Typography>
                    {on && <CheckIcon sx={{ color: BA.roseDeep }} />}
                  </ButtonBase>
                )
              })}
            </Box>
          </Box>

          <Autocomplete options={zones} value={zone} disableClearable onChange={(_, z) => setZone(z)}
            renderInput={params => <TextField {...params} label={t('Time zone')} helperText={t('Shifts, clock-ins and opening hours use it')} />} />

          <Button type="submit" variant="contained" size="large" disabled={!name.trim()} sx={{ ...primaryBtn, py: 1.4 }}>
            {t('Add my business')}
          </Button>

          <Divider />
          <Box>
            <Typography sx={{ fontWeight: 500 }}>{t('Joining a team instead?')}</Typography>
            <Typography variant="body2" sx={{ color: BA.soft, mt: 0.5 }}>
              {tr("Ask your manager to add {email} on their Team page. You'll get straight in next time you sign in.", { email: <b>{me?.email}</b> })}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button variant="outlined" onClick={() => location.reload()} sx={outlineBtn}>{t('Check again')}</Button>
              <Button variant="outlined" onClick={() => void api.signOut()} sx={outlineBtn}>{t('Sign out')}</Button>
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Box>
  )
}
