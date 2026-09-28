import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/CheckCircleRounded'
import CircleIcon from '@mui/icons-material/RadioButtonUncheckedRounded'
import { useEffect, useState, type ReactNode } from 'react'
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { PageHeader } from '../components/common'
import { ServiceConnections, serviceName } from '../components/Connectors'
import { InviteDialog } from './TeamPage'
import { BrandLogo } from '../components/Logo'
import { checkTaxId } from '../../shared/taxId'
import { DAY_KEYS } from '../../shared/types'
import { tokens } from '../theme'

type StepKey = 'details' | 'brand' | 'hours' | 'team' | 'apps'
const STEPS: { key: StepKey; title: string; hint: string }[] = [
  { key: 'details', title: 'Your business', hint: 'Name, address and tax number' },
  { key: 'brand', title: 'Your brand', hint: 'Logo and colours your team sees' },
  { key: 'hours', title: 'Opening hours', hint: 'Used for the rota and Google Maps' },
  { key: 'team', title: 'Your team', hint: 'Invite the people who work with you' },
  { key: 'apps', title: 'Connect your apps', hint: 'Email, files, Google Maps' },
]

/** Which set-up steps look done, for the wizard and the prompt on Today. */
export function useSetupProgress() {
  const { api, business, profiles, isAdmin } = useApp()
  const brand = useAsync('brand', () => api.brand(), [])
  const links = useAsync('integrations', () => (isAdmin ? api.integrations() : Promise.resolve(null)), [])
  const done: Record<StepKey, boolean> = {
    details: !!(business?.name && business.address && business.tax_id),
    brand: !!brand.data?.logo,
    hours: !!business && DAY_KEYS.some(d => business.opening_hours[d]),
    team: profiles.filter(p => p.active && p.role !== 'kiosk' && p.role !== 'partner').length > 1,
    apps: !!links.data?.integrations.some(i => i.status === 'connected' && ['gmail', 'outlook', 'google_drive', 'onedrive', 'google_business'].includes(i.provider)),
  }
  return { done, count: Object.values(done).filter(Boolean).length, total: STEPS.length }
}

/** Admins: a guided set-up for the business, ending with connecting its apps. */
export function SetupPage() {
  const { api, refresh } = useApp()
  const run = useAction()
  const notify = useNotify()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { done, count, total } = useSetupProgress()
  const step = (STEPS.find(s => s.key === params.get('step'))?.key
    ?? (params.has('connected') || params.has('connect_error') ? 'apps' : STEPS.find(s => !done[s.key])?.key ?? 'apps')) as StepKey
  const go = (k: StepKey) => setParams({ step: k }, { replace: true })
  const index = STEPS.findIndex(s => s.key === step)

  // Back from Google / Microsoft after connecting an app.
  useEffect(() => {
    if (params.get('connected')) notify(`${serviceName(params.get('connected')!)} connected`, 'success')
    if (params.get('connect_error')) notify(params.get('connect_error')!, 'error')
    if (params.has('connected') || params.has('connect_error')) setParams({ step: 'apps' }, { replace: true })
  }, [params, notify, setParams])

  const finish = () => run(async () => { await api.updateBusiness({ setup_completed_at: new Date().toISOString() }); await refresh(); navigate('/') }, 'All set. Welcome to Business Agent!')

  return (
    <>
      <PageHeader eyebrow="Settings" title="Set up your business"
        subtitle={`${count} of ${total} done. Everything can be changed later; skip anything you're not ready for.`} />
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '260px 1fr' }, alignItems: 'start' }}>
        <Box component="nav" aria-label="Set-up steps" sx={{ display: 'grid', gap: 0.5 }}>
          {STEPS.map((s, i) => (
            <Box key={s.key} component="button" type="button" onClick={() => go(s.key)} aria-current={s.key === step ? 'step' : undefined}
              sx={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 1.25, alignItems: 'center', p: 1.25, borderRadius: '12px',
                bgcolor: s.key === step ? tokens.roseSoft : 'transparent', '&:hover': { bgcolor: s.key === step ? tokens.roseSoft : tokens.hover },
                '&:focus-visible': { outline: `2px solid ${tokens.roseDeep}` } }}>
              {done[s.key] ? <CheckIcon sx={{ color: tokens.matcha }} /> : <CircleIcon sx={{ color: tokens.inkFaint }} />}
              <Box>
                <Typography sx={{ fontWeight: s.key === step ? 600 : 500 }}>{i + 1}. {s.title}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{s.hint}</Typography>
              </Box>
            </Box>
          ))}
        </Box>

        <Card component="section" aria-label={STEPS[index].title}>
          <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
            <Typography variant="h5" component="h2" sx={{ mb: 0.5 }}>{STEPS[index].title}</Typography>
            <Typography sx={{ color: 'text.secondary', mb: 3 }}>{STEPS[index].hint}</Typography>
            {step === 'details' && <DetailsStep onNext={() => go('brand')} />}
            {step === 'brand' && <LinkStep done={done.brand} to="/brand" button="Open the Brand page"
              text={<>Upload your logo and pick your colours and fonts. They appear across the app for your team.<Box sx={{ mt: 2 }}><BrandLogo height={72} /></Box></>} />}
            {step === 'hours' && <LinkStep done={done.hours} to="/opening-hours" button="Set opening hours"
              text="Your weekly hours, busy times and holiday closures. The rota uses them, and they update Google Maps when it's connected." />}
            {step === 'team' && <TeamStep />}
            {step === 'apps' && <>
              <Alert severity="info" sx={{ mb: 3 }}>Each connection is one sign-in with that app. You come straight back here afterwards, and you can disconnect any time from Settings → Connections.</Alert>
              <ServiceConnections back="setup" categories={['communication', 'email', 'calendar', 'files']} />
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 3 }}>
                Google Maps, WhatsApp, Instagram and Spotify are on the <RouterLink to="/connections">Connections page</RouterLink>.
              </Typography>
            </>}
            <Stack direction="row" spacing={1} sx={{ mt: 4, justifyContent: 'space-between' }}>
              <Button disabled={index === 0} onClick={() => go(STEPS[index - 1].key)}>Back</Button>
              {index < STEPS.length - 1
                ? step !== 'details' && <Button variant="contained" onClick={() => go(STEPS[index + 1].key)}>Next</Button>
                : <Button variant="contained" onClick={finish}>Finish set-up</Button>}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </>
  )
}

function DetailsStep({ onNext }: { onNext: () => void }) {
  const { api, business, refresh } = useApp()
  const run = useAction()
  const [f, setF] = useState({ name: business?.name ?? '', business_type: business?.business_type ?? '', address: business?.address ?? '',
    phone: business?.phone ?? '', email: business?.email ?? '', tax_id: business?.tax_id ?? '' })
  const tax = f.tax_id.trim() ? checkTaxId(f.tax_id) : null
  const field = (k: keyof typeof f, label: string, extra = {}) =>
    <TextField label={label} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} {...extra} />
  return (
    <Stack spacing={2} sx={{ maxWidth: 560 }}>
      {field('name', 'Business name', { required: true })}
      {field('business_type', 'Type of business', { placeholder: 'Café, shop, salon…' })}
      {field('address', 'Address')}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>{field('phone', 'Phone')}{field('email', 'Email')}</Stack>
      {field('tax_id', 'CIF / NIF', { error: !!tax && !tax.ok, helperText: !tax ? 'Company CIF, or NIF/NIE if self-employed' : tax.ok ? `Valid ${tax.kind}` : tax.error })}
      <Box>
        <Button variant="contained" onClick={async () => {
          const ok = await run(async () => {
            if (!f.name.trim()) throw new Error('The business needs a name')
            if (tax && !tax.ok) throw new Error(tax.error)
            await api.updateBusiness({ ...f, tax_id: tax?.ok ? tax.value : null, business_type: f.business_type || null, address: f.address || null, phone: f.phone || null, email: f.email || null })
            await refresh()
          }, 'Saved')
          if (ok) onNext()
        }}>Save and continue</Button>
      </Box>
    </Stack>
  )
}

function LinkStep({ text, to, button, done }: { text: ReactNode; to: string; button: string; done: boolean }) {
  return (
    <Stack spacing={2} sx={{ maxWidth: 560, alignItems: 'flex-start' }}>
      <Typography component="div">{text}</Typography>
      {done && <Alert severity="success">Done. You can come back and change it any time.</Alert>}
      <Button variant="outlined" component={RouterLink} to={to}>{button}</Button>
    </Stack>
  )
}

function TeamStep() {
  const { profiles } = useApp()
  const [inviting, setInviting] = useState(false)
  const people = profiles.filter(p => p.active && p.role !== 'kiosk' && p.role !== 'partner')
  return (
    <Stack spacing={2} sx={{ maxWidth: 560, alignItems: 'flex-start' }}>
      <Typography>
        {people.length === 1 ? 'It’s just you so far.' : `${people.length} people so far: ${people.map(p => p.full_name.split(' ')[0]).join(', ')}.`}{' '}
        Invite your team by email, or create an account with a temporary password for them.
      </Typography>
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" onClick={() => setInviting(true)}>Invite someone</Button>
        <Button component={RouterLink} to="/team">Open the Team page</Button>
      </Stack>
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </Stack>
  )
}

/** On Today, for admins until set-up is finished: how far along, and a way back in. */
export function SetupPrompt() {
  const { api, refresh } = useApp()
  const run = useAction()
  const { count, total } = useSetupProgress()
  return (
    <Card component="section" aria-label="Finish setting up" sx={{ mb: 2.5, borderColor: tokens.rose, background: `linear-gradient(120deg, ${tokens.roseSoft}, ${tokens.surface} 70%)` }}>
      <CardContent sx={{ display: 'flex', gap: 2, alignItems: { sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 600 }}>Finish setting up your business</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {count} of {total} steps done. Add your details and brand, invite the team, and connect your email and files.
          </Typography>
          <Box sx={{ mt: 1.25, height: 6, borderRadius: 3, bgcolor: tokens.line, overflow: 'hidden', maxWidth: 360 }}
            role="progressbar" aria-label="Set-up progress" aria-valuenow={count} aria-valuemin={0} aria-valuemax={total}>
            <Box sx={{ width: `${(count / total) * 100}%`, height: '100%', bgcolor: tokens.rose, transition: 'width .3s' }} />
          </Box>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button onClick={() => run(async () => { await api.updateBusiness({ setup_completed_at: new Date().toISOString() }); await refresh() }, 'Hidden. Set-up is always under Settings.')}>
            Hide
          </Button>
          <Button variant="contained" component={RouterLink} to="/setup">Continue set-up</Button>
        </Stack>
      </CardContent>
    </Card>
  )
}
