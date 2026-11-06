import { Autocomplete, Box, Button, ButtonBase, Divider, Stack, TextField, Typography } from '@mui/material'
import CafeIcon from '@mui/icons-material/LocalCafeOutlined'
import RestaurantIcon from '@mui/icons-material/RestaurantOutlined'
import SalonIcon from '@mui/icons-material/ContentCutOutlined'
import PubIcon from '@mui/icons-material/SportsBarOutlined'
import EstateIcon from '@mui/icons-material/RealEstateAgentOutlined'
import StoreIcon from '@mui/icons-material/StorefrontOutlined'
import GiftIcon from '@mui/icons-material/CardGiftcardOutlined'
import CheckIcon from '@mui/icons-material/CheckRounded'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { forgetReferral, keptReferral } from '../app/referral'
import { cleanCode } from '../../shared/referrals'
import type { ReferralOpen } from '../../shared/hqReps'
import { startGuide } from './SetupPage'
import { BackToBusinesses } from '../components/BusinessSwitcher'
import { AgentMark, BA, Wordmark, display, glow, outlineBtn, primaryBtn } from './marketing/site'
import { TRIAL_MONTHS } from './marketing/plans'
import { msg, t, tr } from '../i18n'

type Kind = 'cafe' | 'restaurant' | 'pub' | 'salon' | 'real_estate' | 'other'
const KINDS: { kind: Kind; name: string; icon: ReactNode }[] = [
  { kind: 'cafe', name: msg('Café & coffee shop'), icon: <CafeIcon /> },
  { kind: 'restaurant', name: msg('Restaurant & bar'), icon: <RestaurantIcon /> },
  { kind: 'pub', name: msg('Pub'), icon: <PubIcon /> },
  { kind: 'salon', name: msg('Salon & beauty'), icon: <SalonIcon /> },
  { kind: 'real_estate', name: msg('Real estate agency'), icon: <EstateIcon /> },
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
  // A code from a Business Agent rep or another business: kept from their link, or typed in.
  const [code, setCode] = useState(() => keptReferral() ?? '')
  const clean = cleanCode(code)
  const [by, setBy] = useState<(ReferralOpen & { code: string }) | null>(null)
  const [unknown, setUnknown] = useState(false)
  useEffect(() => {
    setUnknown(false)
    if (!clean) { setBy(null); return }
    let live = true
    const wait = setTimeout(() => {
      void api.openReferral(clean, false).then(r => {
        if (!live) return
        setBy({ ...r, code: clean })
        // A rep for one kind of business: that kind, to start with.
        if (r.rep?.categories.length === 1) setKind(k => k ?? r.rep!.categories[0])
      }, () => { if (live) { setBy(null); setUnknown(true) } })
    }, 350)
    return () => { live = false; clearTimeout(wait) }
  }, [api, clean])
  const known = by && by.code === clean ? by : null
  const invitedBy = known?.rep ? t('Introduced by {name}, from The Business Agent: your first month is free, and they’ll help you set it up', { name: known.rep.name })
    : known?.business ? t('Invited by {name}: your first month is on us', { name: known.business }) : null

  const create = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await api.createBusiness({ name: name.trim(), kind, timezone: zone, referral: known ? clean : null })
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
          {invitedBy && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: BA.accent }}>
              <GiftIcon fontSize="small" />
              <Typography sx={{ fontWeight: 500, fontSize: '0.9rem' }}>{invitedBy}</Typography>
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

          <TextField label={t('Code from a rep for The Business Agent or another business (optional)')} value={code}
            onChange={e => setCode(e.target.value.toUpperCase())} error={unknown}
            helperText={unknown ? t('That code isn’t one we know. Check it, or leave it empty.') : known ? null : t('If someone gave you a code, put it here: your first month is free.')}
            slotProps={{ htmlInput: { maxLength: 16, autoCapitalize: 'characters', spellCheck: false } }} />

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
            {/* Came here adding another business: the ones already on this device are a click away. */}
            <Box sx={{ mt: 1 }}><BackToBusinesses sx={outlineBtn} /></Box>
          </Box>
        </Stack>
      </Box>
    </Box>
  )
}
