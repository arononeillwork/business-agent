import { Avatar, Box, Button, ButtonBase, Chip, Stack, Switch, TextField, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/CheckCircleRounded'
import CircleIcon from '@mui/icons-material/RadioButtonUncheckedRounded'
import AddPhotoIcon from '@mui/icons-material/AddPhotoAlternateOutlined'
import DoneIcon from '@mui/icons-material/TaskAltRounded'
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { ServiceConnections, connectedMessage } from '../components/Connectors'
import { PersonAvatar } from '../components/common'
import { readLogo } from '../components/Logo'
import { checkTaxId } from '../../shared/taxId'
import { GROUPS, optionName, type ConnectionGroup } from '../../shared/connections'
import { DAY_KEYS, type DayKey, type OpeningHours } from '../../shared/types'
import { hmToMinutes } from '../../shared/time'
import { fonts, tokens } from '../theme'

// A new business's first admin lands here (see App.tsx) until they finish or skip it. Quick on
// purpose: only the business name is needed, every other step can be skipped, and anything
// skipped is waiting in Settings afterwards.
type StepKey = 'business' | 'hours' | 'messages' | 'apps' | 'team'
const STEPS: { key: StepKey; label: string }[] = [
  { key: 'business', label: 'Business' },
  { key: 'hours', label: 'Hours' },
  { key: 'messages', label: 'Messages' },
  { key: 'apps', label: 'Apps' },
  { key: 'team', label: 'Team' },
]
/** The apps each connection step offers: messaging first, as it's what the team notices. */
const MESSAGE_GROUPS: ConnectionGroup[] = ['communication', 'email']
const APP_GROUPS: ConnectionGroup[] = ['calendar', 'files', 'maps', 'social', 'payments']

const groupOf = (provider: string) => GROUPS.find(g => g.options.some(o => o.id === provider))?.key
const isStep = (s: string | null): s is StepKey | 'done' => s === 'done' || STEPS.some(x => x.key === s)

/** The step someone left for an app's sign-in, so a failed one brings them back to it. */
function rememberStep(step?: StepKey) {
  try {
    if (step) sessionStorage.setItem('setup-step', step)
    const s = sessionStorage.getItem('setup-step')
    return isStep(s) && s !== 'done' ? s : null
  } catch {
    return null
  }
}

/** Admins: a quick, full-screen set-up for the business, ending with its apps and team. */
export function SetupPage() {
  const { api, business, refresh } = useApp()
  const run = useAction()
  const notify = useNotify()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const asked = params.get('step')
  const step: StepKey | 'done' = isStep(asked) ? asked : 'business'
  const index = STEPS.findIndex(s => s.key === step)
  const go = (k: StepKey | 'done') => { setParams({ step: k }); window.scrollTo(0, 0) }

  // Back from Google / Microsoft / Meta after connecting an app: say how it went, on its step.
  useEffect(() => {
    const connected = params.get('connected'), failed = params.get('connect_error')
    if (!connected && !failed) return
    if (connected) notify(connectedMessage(connected), 'success')
    if (failed) notify(failed, 'error')
    const back = connected ? (MESSAGE_GROUPS.includes(groupOf(connected)!) ? 'messages' : 'apps') : rememberStep() ?? 'messages'
    setParams({ step: back }, { replace: true })
  }, [params, notify, setParams])
  useEffect(() => { if (step !== 'done') rememberStep(step) }, [step])

  const done = !!business?.setup_completed_at
  const complete = async () => { if (!done) { await api.updateBusiness({ setup_completed_at: new Date().toISOString() }); await refresh() } }
  const exit = () => (done ? navigate('/')
    : run(async () => { await complete(); navigate('/') }, 'Set-up skipped. Pick it up any time from Settings → Set-up.'))
  const next = async () => {
    if (index < STEPS.length - 1) return go(STEPS[index + 1].key)
    if (await run(complete)) go('done')
  }
  const back = () => go(STEPS[Math.max(0, index - 1)].key)

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: tokens.bg, backgroundImage: tokens.backdrop, backgroundRepeat: 'no-repeat' }}>
      <Box component="header" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: { xs: 2, md: 4 }, py: 2 }}>
        <BusinessMark />
        <Typography noWrap sx={{ flex: 1, minWidth: 0, fontFamily: fonts.display, fontSize: '1.05rem' }}>{business?.name}</Typography>
        {step !== 'done' && <Button onClick={exit} sx={{ color: 'text.secondary', flexShrink: 0 }}>{done ? 'Back to the app' : 'Skip set-up'}</Button>}
      </Box>
      {step !== 'done' && <Progress current={index} onPick={go} />}
      <Box component="main" sx={{ flex: 1, width: '100%', maxWidth: 680, mx: 'auto', px: 2, pt: { xs: 3, md: 5 } }}>
        {step === 'business' && <BusinessStep onNext={next} />}
        {step === 'hours' && <HoursStep onNext={next} onBack={back} />}
        {step === 'messages' && <ConnectStep n={3} groups={MESSAGE_GROUPS} onNext={next} onBack={back} title="Keep your team in the loop"
          intro="Shift reminders, rota changes and time-off replies go out by themselves. Connect what you use, or skip it for now." />}
        {step === 'apps' && <ConnectStep n={4} groups={APP_GROUPS} onNext={next} onBack={back} title="Connect your other apps"
          intro="Each is a single sign-in, and all of them are optional. Change them any time in Settings → Connections." />}
        {step === 'team' && <TeamStep onNext={next} onBack={back} />}
        {step === 'done' && <DoneStep />}
      </Box>
    </Box>
  )
}

/** The business's uploaded logo, or its first letter until there is one. */
function BusinessMark() {
  const { api, business } = useApp()
  const brand = useAsync('brand', () => api.brand(), [])
  const logo = brand.data?.logo
  if (logo) return <Box component="img" src={logo} alt="" sx={{ width: 36, height: 36, objectFit: 'contain', borderRadius: '10px', bgcolor: tokens.surface, flexShrink: 0 }} />
  return (
    <Avatar variant="rounded" sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: tokens.rose, color: '#2B2522', fontFamily: fonts.display, fontSize: '1rem' }}>
      {(business?.name ?? '').trim().charAt(0).toUpperCase()}
    </Avatar>
  )
}

/** One bar per step, filled up to the current one. Any step can be opened: they're all optional. */
function Progress({ current, onPick }: { current: number; onPick: (k: StepKey) => void }) {
  return (
    <Box component="nav" aria-label="Set-up steps" sx={{ width: '100%', maxWidth: 680, mx: 'auto', px: 2 }}>
      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))`, gap: 0.75 }}>
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <ButtonBase onClick={() => onPick(s.key)} aria-current={i === current ? 'step' : undefined} aria-label={`${i + 1}. ${s.label}`}
              sx={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 1, py: 0.75,
                '&:focus-visible': { outline: `2px solid ${tokens.roseDeep}`, outlineOffset: 2 } }}>
              <Box sx={{ height: 4, borderRadius: 2, bgcolor: i <= current ? tokens.rose : tokens.lineStrong, transition: 'background-color .25s' }} />
              <Typography variant="caption" noWrap sx={{ display: { xs: 'none', sm: 'block' }, mt: 0.75,
                color: i === current ? 'text.primary' : 'text.secondary', fontWeight: i === current ? 600 : 400 }}>{s.label}</Typography>
            </ButtonBase>
          </li>
        ))}
      </Box>
    </Box>
  )
}

/** A step: its number, a title and one line about it, then its content and actions. */
function Step({ n, title, intro, children, actions, onSubmit }: {
  n: number; title: string; intro: string; children: ReactNode; actions: ReactNode; onSubmit?: () => void
}) {
  return (
    <Box component="section" aria-labelledby="step-title">
      <Typography variant="overline" sx={{ color: tokens.roseDeep }}>Step {n} of {STEPS.length}</Typography>
      <Typography id="step-title" variant="h4" component="h1" sx={{ fontSize: { xs: '1.7rem', md: '2.1rem' } }}>{title}</Typography>
      <Typography sx={{ color: 'text.secondary', mt: 1, maxWidth: 560 }}>{intro}</Typography>
      {onSubmit
        ? <Box component="form" noValidate onSubmit={e => { e.preventDefault(); onSubmit() }} sx={{ mt: { xs: 3, md: 4 } }}>{children}{actions}</Box>
        : <Box sx={{ mt: { xs: 3, md: 4 } }}>{children}{actions}</Box>}
    </Box>
  )
}

/** Back, skip and continue, kept in reach at the bottom of the screen while a long step scrolls. */
function Actions({ onBack, onSkip, onNext, next = 'Continue', busy, submit }: {
  onBack?: () => void; onSkip?: () => void; onNext?: () => void; next?: string; busy?: boolean; submit?: boolean
}) {
  return (
    <Box sx={{ position: 'sticky', bottom: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: 1, mt: 4, mx: -2, px: 2, pt: 2,
      pb: 'calc(16px + env(safe-area-inset-bottom))', bgcolor: tokens.bg, borderTop: `1px solid ${tokens.line}` }}>
      {onBack && <Button onClick={onBack}>Back</Button>}
      <Box sx={{ flex: 1 }} />
      {onSkip && <Button onClick={onSkip} sx={{ color: 'text.secondary' }}>Skip for now</Button>}
      <Button variant="contained" size="large" type={submit ? 'submit' : 'button'} onClick={submit ? undefined : onNext} disabled={busy}>{next}</Button>
    </Box>
  )
}

const KINDS = ['Café', 'Restaurant', 'Bar', 'Bakery', 'Shop', 'Salon', 'Gym', 'Hotel']

function BusinessStep({ onNext }: { onNext: () => void }) {
  const { api, business, refresh } = useApp()
  const run = useAction()
  const [f, setF] = useState(() => ({ name: business?.name ?? '', business_type: business?.business_type ?? '', phone: business?.phone ?? '',
    email: business?.email ?? '', address: business?.address ?? '', tax_id: business?.tax_id ?? '' }))
  const [other, setOther] = useState(() => !!f.business_type && !KINDS.includes(f.business_type))
  const [busy, setBusy] = useState(false)
  const tax = f.tax_id.trim() ? checkTaxId(f.tax_id) : null
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    setBusy(true)
    const ok = await run(async () => {
      if (!f.name.trim()) throw new Error('Your business needs a name')
      if (tax && !tax.ok) throw new Error(tax.error)
      await api.updateBusiness({ name: f.name.trim(), business_type: f.business_type.trim() || null, phone: f.phone.trim() || null,
        email: f.email.trim() || null, address: f.address.trim() || null, tax_id: tax?.ok ? tax.value : null })
      await refresh()
    })
    setBusy(false)
    if (ok) onNext()
  }
  const kind = (k: string, selected: boolean, pick: () => void) => (
    <Chip key={k} label={k} clickable onClick={pick} aria-pressed={selected}
      color={selected ? 'primary' : 'default'} variant={selected ? 'filled' : 'outlined'} sx={{ bgcolor: selected ? undefined : tokens.surface }} />
  )
  return (
    <Step n={1} title="Tell us about your business" intro="Just the basics. Only the name is needed; the rest helps, and you can add it later."
      onSubmit={save} actions={<Actions submit busy={busy} />}>
      <Stack spacing={3.5}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <LogoPicker />
          <TextField label="Business name" value={f.name} onChange={set('name')} required fullWidth autoFocus={!f.name} />
        </Stack>
        <Box>
          <Typography id="kind-label" sx={{ fontWeight: 500, mb: 1.25 }}>What kind of business is it?</Typography>
          <Stack direction="row" role="group" aria-labelledby="kind-label" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
            {KINDS.map(k => kind(k, !other && f.business_type === k, () => { setOther(false); setF({ ...f, business_type: f.business_type === k ? '' : k }) }))}
            {kind('Something else', other, () => { setOther(!other); setF({ ...f, business_type: '' }) })}
          </Stack>
          {other && <TextField label="Type of business" value={f.business_type} onChange={set('business_type')} placeholder="Florist, dental clinic…" autoFocus sx={{ mt: 2 }} />}
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 500 }}>Contact details <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>· optional</Box></Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>For your team, and for Google Maps and WhatsApp once they're connected.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField label="Phone" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} />
            <TextField label="Email" type="email" autoComplete="email" value={f.email} onChange={set('email')} />
            <TextField label="Address" autoComplete="street-address" value={f.address} onChange={set('address')} sx={{ gridColumn: { sm: '1 / -1' } }} />
            <TextField label="CIF / NIF" value={f.tax_id} onChange={set('tax_id')} error={!!tax && !tax.ok}
              helperText={!tax ? 'Company CIF, or NIF/NIE if self-employed' : tax.ok ? `Valid ${tax.kind}` : tax.error} />
          </Box>
        </Box>
      </Stack>
    </Step>
  )
}

/** Add or change the logo in one tap; it's saved straight away and shows across the app. */
function LogoPicker() {
  const { api } = useApp()
  const run = useAction()
  const brand = useAsync('brand', () => api.brand(), [])
  const input = useRef<HTMLInputElement>(null)
  const logo = brand.data?.logo
  return (
    <Box sx={{ flexShrink: 0 }}>
      <ButtonBase onClick={() => input.current?.click()} aria-label={logo ? 'Change your logo' : 'Add your logo'}
        sx={{ width: 64, height: 64, borderRadius: '16px', overflow: 'hidden', flexDirection: 'column', gap: 0.25, color: tokens.inkSoft,
          border: logo ? `1px solid ${tokens.line}` : `1.5px dashed ${tokens.lineStrong}`, bgcolor: logo ? tokens.surface : tokens.surfaceAlt,
          '&:hover': { borderColor: tokens.rose }, '&:focus-visible': { outline: `2px solid ${tokens.roseDeep}`, outlineOffset: 2 } }}>
        {logo
          ? <Box component="img" src={logo} alt="Your logo" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <><AddPhotoIcon sx={{ fontSize: 22 }} /><Typography variant="caption" sx={{ lineHeight: 1 }}>Logo</Typography></>}
      </ButtonBase>
      <input ref={input} type="file" accept="image/*" hidden aria-label="Logo file" onChange={e => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) void run(async () => api.saveBrand({ logo: await readLogo(file) }), 'Logo added')
      }} />
    </Box>
  )
}

const DAY_NAMES: Record<DayKey, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }
const weekly = (days: DayKey[], open: string, close: string): OpeningHours =>
  Object.fromEntries(DAY_KEYS.map(d => [d, days.includes(d) ? { open, close } : null]))
const PRESETS: { label: string; hours: OpeningHours }[] = [
  { label: 'Mon–Fri, 9:00–17:00', hours: weekly(['mon', 'tue', 'wed', 'thu', 'fri'], '09:00', '17:00') },
  { label: 'Mon–Sat, 9:00–18:00', hours: weekly(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], '09:00', '18:00') },
  { label: 'Every day, 8:00–20:00', hours: weekly(DAY_KEYS, '08:00', '20:00') },
]
/** Every day present (closed = null), so two sets of hours compare equal however they were saved. */
const allDays = (h: OpeningHours) => JSON.stringify(DAY_KEYS.map(d => h[d] ?? null))

function HoursStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { api, business, refresh } = useApp()
  const run = useAction()
  const [hours, setHours] = useState<OpeningHours>(() => business?.opening_hours ?? {})
  const [busy, setBusy] = useState(false)
  const bad = (d: DayKey) => { const h = hours[d]; return !!h && hmToMinutes(h.close) <= hmToMinutes(h.open) }
  const changed = allDays(hours) !== allDays(business?.opening_hours ?? {})
  const setDay = (d: DayKey, v: OpeningHours[DayKey]) => setHours({ ...hours, [d]: v })
  const save = async () => {
    if (!changed) return onNext()
    setBusy(true)
    const ok = await run(async () => {
      if (DAY_KEYS.some(bad)) throw new Error('Closing time must be after opening time')
      await api.updateBusiness({ opening_hours: Object.fromEntries(DAY_KEYS.map(d => [d, hours[d] ?? null])) })
      await refresh()
    }, 'Opening hours saved')
    setBusy(false)
    if (ok) onNext()
  }
  return (
    <Step n={2} title="When are you open?" intro="The rota plans around these hours, and once Google Maps is connected they keep your listing right."
      actions={<Actions onBack={onBack} onSkip={onNext} onNext={save} busy={busy} />}>
      <Stack direction="row" role="group" aria-label="Quick choices" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, mb: 2.5 }}>
        {PRESETS.map(p => {
          const on = allDays(p.hours) === allDays(hours)
          return <Chip key={p.label} label={p.label} clickable aria-pressed={on} onClick={() => setHours(p.hours)}
            color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'} sx={{ bgcolor: on ? undefined : tokens.surface }} />
        })}
      </Stack>
      <Stack divider={<Box sx={{ borderTop: `1px solid ${tokens.line}` }} />}>
        {DAY_KEYS.map(d => {
          const h = hours[d]
          return (
            <Stack key={d} direction="row" sx={{ alignItems: 'center', gap: { xs: 0.5, sm: 1.5 }, py: 0.75, minHeight: 56, flexWrap: 'wrap' }}>
              <Typography sx={{ width: { xs: 96, sm: 120 }, flexShrink: 0 }}>{DAY_NAMES[d]}</Typography>
              <Switch checked={!!h} slotProps={{ input: { 'aria-label': `Open on ${DAY_NAMES[d]}` } }}
                onChange={e => setDay(d, e.target.checked ? { open: '09:00', close: '17:00' } : null)} />
              {h ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flex: 1, minWidth: 200 }}>
                  <TextField type="time" size="small" label="Opens" value={h.open} onChange={e => setDay(d, { ...h, open: e.target.value })}
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'aria-label': `${DAY_NAMES[d]} opens` } }} sx={{ maxWidth: 124 }} />
                  <Typography sx={{ color: 'text.secondary' }}>to</Typography>
                  <TextField type="time" size="small" label="Closes" value={h.close} onChange={e => setDay(d, { ...h, close: e.target.value })} error={bad(d)}
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'aria-label': `${DAY_NAMES[d]} closes` } }} sx={{ maxWidth: 124 }} />
                </Stack>
              ) : <Typography sx={{ color: 'text.secondary' }}>Closed</Typography>}
            </Stack>
          )
        })}
      </Stack>
    </Step>
  )
}

/** Apps to connect, from the same tiles as Settings → Connections; sign-ins come back here. */
function ConnectStep({ n, title, intro, groups, onNext, onBack }: {
  n: number; title: string; intro: string; groups: ConnectionGroup[]; onNext: () => void; onBack: () => void
}) {
  const { api } = useApp()
  const data = useAsync('integrations', () => api.integrations(), [])
  const any = data.data?.integrations.some(i => i.status === 'connected' && groups.includes(groupOf(i.provider)!)) ?? false
  return (
    <Step n={n} title={title} intro={intro} actions={<Actions onBack={onBack} onSkip={any ? undefined : onNext} onNext={onNext} />}>
      <ServiceConnections back="setup" groups={groups} hideSoon />
    </Step>
  )
}

function TeamStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { api, me, profiles } = useApp()
  const run = useAction()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const team = profiles.filter(p => p.active && p.id !== me?.id && p.role !== 'kiosk' && p.role !== 'partner')
  const invite = async () => {
    setBusy(true)
    const ok = await run(async () => {
      if (!name.trim()) throw new Error('Add their name')
      await api.invite(email.trim(), name.trim(), 'employee')
    }, `Invite sent to ${email.trim()}`)
    setBusy(false)
    if (ok) { setName(''); setEmail('') }
    return ok
  }
  // Typed someone in but didn't press Invite: send it rather than lose it.
  const finish = async () => { if ((name.trim() || email.trim()) && !(await invite())) return; onNext() }
  return (
    <Step n={5} title="Invite your team" intro="They get an email to join, then see their shifts on their phone. Roles, pay and PINs are on the Team page."
      actions={<Actions onBack={onBack} onSkip={team.length ? undefined : onNext} onNext={finish} next="Finish" busy={busy} />}>
      <Box component="form" aria-label="Invite someone" noValidate onSubmit={e => { e.preventDefault(); void invite() }}
        sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) minmax(0, 1.3fr) auto' }, gap: 1.5, alignItems: 'start' }}>
        <TextField label="Name" autoComplete="off" value={name} onChange={e => setName(e.target.value)} />
        <TextField label="Email" type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} />
        <Button type="submit" variant="outlined" disabled={busy} sx={{ height: { sm: 56 } }}>Invite</Button>
      </Box>
      <Box sx={{ mt: 3.5 }}>
        {team.length === 0
          ? <Typography sx={{ color: 'text.secondary' }}>It's just you so far.</Typography>
          : <>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>On the team</Typography>
            <Stack component="ul" aria-label="On the team" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {team.slice(0, 8).map(p => (
                <Stack component="li" key={p.id} direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 0.75 }}>
                  <PersonAvatar name={p.full_name} colour={p.colour} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography noWrap>{p.full_name}</Typography>
                    {p.email && <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>{p.email}</Typography>}
                  </Box>
                </Stack>
              ))}
            </Stack>
            {team.length > 8 && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>and {team.length - 8} more</Typography>}
          </>}
      </Box>
    </Step>
  )
}

/** The end: what's set up, what was skipped (with a way to it), and into the app. */
function DoneStep() {
  const { api, me, business, profiles } = useApp()
  const data = useAsync('integrations', () => api.integrations(), [])
  const connected = (data.data?.integrations ?? []).filter(i => i.status === 'connected')
  const names = (groups: ConnectionGroup[]) => connected.filter(i => groups.includes(groupOf(i.provider)!)).map(i => optionName(i.provider))
  const messages = names(MESSAGE_GROUPS)
  const apps = names(APP_GROUPS)
  const days = DAY_KEYS.filter(d => business?.opening_hours[d]).length
  const team = profiles.filter(p => p.active && p.id !== me?.id && p.role !== 'kiosk' && p.role !== 'partner').length
  const rows: { title: string; ok: boolean; text: string; to: string }[] = [
    { title: 'Business details', ok: true, text: [business?.name, business?.business_type].filter(Boolean).join(' · '), to: '/business' },
    { title: 'Opening hours', ok: days > 0, text: days ? `Open ${days} day${days > 1 ? 's' : ''} a week` : 'Skipped', to: '/opening-hours' },
    { title: 'Team messages', ok: messages.length > 0, text: messages.join(', ') || 'Skipped', to: '/connections' },
    { title: 'Apps', ok: apps.length > 0, text: apps.join(', ') || 'Skipped', to: '/connections' },
    { title: 'Team', ok: team > 0, text: team ? `${team} ${team > 1 ? 'people' : 'person'} besides you` : 'Just you for now', to: '/team' },
  ]
  return (
    <Box component="section" aria-labelledby="step-title" sx={{ pt: { md: 3 }, pb: 6 }}>
      <Box sx={{ width: 64, height: 64, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: tokens.matchaSoft, color: tokens.matcha, mb: 2.5 }}>
        <DoneIcon sx={{ fontSize: 34 }} />
      </Box>
      <Typography id="step-title" variant="h4" component="h1" sx={{ fontSize: { xs: '1.8rem', md: '2.2rem' } }}>
        You're all set, {me?.full_name.split(' ')[0]}
      </Typography>
      <Typography sx={{ color: 'text.secondary', mt: 1 }}>{business?.name} is ready. Anything you skipped is a tap away.</Typography>
      <Stack component="ul" aria-label="Set-up summary" sx={{ listStyle: 'none', m: 0, p: 0, mt: 4, borderTop: `1px solid ${tokens.line}` }}>
        {rows.map(r => (
          <Stack component="li" key={r.title} direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 1.5, borderBottom: `1px solid ${tokens.line}` }}>
            {r.ok ? <CheckIcon sx={{ color: tokens.matcha }} /> : <CircleIcon sx={{ color: tokens.inkFaint }} />}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography>{r.title}</Typography>
              <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>{r.text}</Typography>
            </Box>
            {!r.ok && <Button size="small" component={RouterLink} to={r.to} aria-label={`Set up ${r.title.toLowerCase()}`}>Set up</Button>}
          </Stack>
        ))}
      </Stack>
      <Button variant="contained" size="large" component={RouterLink} to="/" sx={{ mt: 4 }}>Go to my dashboard</Button>
    </Box>
  )
}
