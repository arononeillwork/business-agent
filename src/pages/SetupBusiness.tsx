import { Alert, Box, Button, ButtonBase, Card, Checkbox, FormControlLabel, LinearProgress, Stack, TextField, Typography } from '@mui/material'
import NewIcon from '@mui/icons-material/RocketLaunchOutlined'
import OpenIcon from '@mui/icons-material/StorefrontOutlined'
import UploadIcon from '@mui/icons-material/AddPhotoAlternateOutlined'
import CheckIcon from '@mui/icons-material/CheckRounded'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { fitLogo, readLogo } from '../lib/logo'
import { useGoogleFont } from '../lib/googleFont'
import { Choice, Screen } from './SetupPage'
import { TEAM_SIZES, type FoundBrand } from '../../shared/brandLookup'
import type { Brand, BrandColour, Business, TeamSize } from '../../shared/types'
import { fonts as typeFonts, tokens } from '../theme'
import { t, tn } from '../i18n'

/** The guide's first steps: is the business new or already open, then its details (new) or its website (open). */
export type BusinessStep = 'business' | 'details' | 'website'

/** Main colours to pick from with one tap (a new business without brand colours yet). */
const SWATCHES = ['#2F5D50', '#1F3A5F', '#7C52AE', '#C8553D', '#D4A017', '#F79BA4', '#2B2522', '#4F8A3F']

/** What the steps save: the business's own details and its brand, each only what was filled in or ticked. */
interface Answers { business: Partial<Business>; brand: Partial<Omit<Brand, 'updated_at'>> }

/**
 * Set-up guide, "Your business": new or already open? A new business adds its name, team size, opening
 * day, logo and main colour (every one skippable). One that's open gives its website, and the guide
 * reads its logo, colours, fonts and contact details there (Firecrawl, worker/brandLookup.ts) for the
 * owner to keep what they tick. Saved to the Business and Brand pages, where all of it can be changed.
 */
export function BusinessSteps({ step, go, onDone }: { step: BusinessStep; go: (step: BusinessStep) => void; onDone: () => void }) {
  const { api, business, refresh } = useApp()
  const run = useAction()
  const [stage, setStage] = useState<'new' | 'open' | null>(business?.stage ?? null)
  const [teamSize, setTeamSize] = useState<TeamSize | null>(business?.team_size ?? null)
  const [busy, setBusy] = useState(false)

  /** Save what was answered (the stage and team size always), then on to the apps. */
  const save = async (a: Answers = { business: {}, brand: {} }) => {
    setBusy(true)
    try {
      const patch: Partial<Business> = { ...(stage ? { stage } : {}), ...(teamSize ? { team_size: teamSize } : {}), ...a.business }
      const ok = await run(async () => {
        if (Object.keys(patch).length) await api.updateBusiness(patch)
        if (Object.keys(a.brand).length) await api.saveBrand(a.brand)
        await refresh()
      }, Object.keys(a.brand).length || Object.keys(a.business).length ? t('Saved') : undefined)
      if (ok) onDone()
    } finally { setBusy(false) }
  }
  const team = <TeamSizePicker value={teamSize} onChange={setTeamSize} />

  if (step === 'business') {
    return (
      <Screen title={t('Is {name} new, or already open?', { name: business?.name ?? t('your business') })}
        sub={t('I’ll set things up to match. You can skip any question and change everything later.')}
        footer={<>
          <span />
          <Button onClick={() => void save()} disabled={busy}>{t('Skip this step')}</Button>
        </>}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, maxWidth: 820 }}>
          <Choice icon={<NewIcon />} tint={tokens.matchaSoft} title={t('It’s new')} selected={stage === 'new'} pressed={stage === 'new'}
            text={t('Just starting out or opening soon. Add your logo, colours and team now, or whenever you’re ready.')}
            onClick={() => { setStage('new'); go('details') }} />
          <Choice icon={<OpenIcon />} tint={tokens.roseSoft} title={t('It’s already open')} selected={stage === 'open'} pressed={stage === 'open'}
            text={t('Give me your website and I’ll bring in your logo, colours, fonts and contact details.')}
            onClick={() => { setStage('open'); go('website') }} />
        </Box>
      </Screen>
    )
  }
  if (step === 'details') return <NewDetails busy={busy} team={team} onBack={() => go('business')} onSkip={() => void save()} onSave={a => void save(a)} />
  return <FromWebsite busy={busy} team={team} onBack={() => go('business')} onSkip={() => void save()} onSave={a => void save(a)}
    onByHand={() => { setStage(s => s ?? 'open'); go('details') }} />
}

/** "How many people work there?" as one tap. */
function TeamSizePicker({ value, onChange }: { value: TeamSize | null; onChange: (v: TeamSize | null) => void }) {
  return (
    <Box role="group" aria-labelledby="setup-team-size">
      <Typography id="setup-team-size" variant="subtitle2">{t('How many people work there, you included?')}</Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mt: 1 }}>
        {TEAM_SIZES.map(s => {
          const on = value === s.value
          return (
            <ButtonBase key={s.value} aria-pressed={on} onClick={() => onChange(on ? null : s.value)}
              sx={{ px: 2, py: 1, borderRadius: 99, fontWeight: 600, border: `1.5px solid ${on ? tokens.roseDeep : tokens.lineStrong}`,
                bgcolor: on ? tokens.today : tokens.surface, color: on ? tokens.roseDeep : 'text.primary' }}>
              {/^\d/.test(s.label) ? s.label : t(s.label)}
            </ButtonBase>
          )
        })}
      </Stack>
    </Box>
  )
}

/** A new business: name, team, opening day, logo and main colour. Only what's filled in is saved. */
function NewDetails({ busy, team, onBack, onSkip, onSave }: { busy: boolean; team: ReactNode; onBack: () => void; onSkip: () => void; onSave: (a: Answers) => void }) {
  const { business } = useApp()
  const [name, setName] = useState(business?.name ?? '')
  const [opensOn, setOpensOn] = useState(business?.opens_on ?? '')
  const [logo, setLogo] = useState<string | null>(null)
  const [colour, setColour] = useState<string | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const b: Partial<Business> = {}
    if (name.trim() && name.trim() !== business?.name) b.name = name.trim().slice(0, 120)
    if (opensOn) b.opens_on = opensOn
    const brand: Answers['brand'] = {}
    if (logo) brand.logo = logo
    if (colour) brand.colours = [{ name: t('Primary'), hex: colour, role: 'primary' }]
    onSave({ business: b, brand })
  }
  return (
    <Box component="form" onSubmit={submit}>
      <Screen eyebrow={t('Your business')} title={t('Tell me about it')} sub={t('Fill in what you know and skip the rest.')}
        footer={<>
          <Button onClick={onBack}>{t('Back')}</Button>
          <Stack direction="row" spacing={1}>
            <Button onClick={onSkip} disabled={busy}>{t('Skip this step')}</Button>
            <Button type="submit" variant="contained" disabled={busy || !name.trim()}>{t('Save and continue')}</Button>
          </Stack>
        </>}>
        <Card sx={{ p: { xs: 2, sm: 3 }, maxWidth: 820 }}>
          <Stack spacing={3}>
            <TextField label={t('Business name')} value={name} onChange={e => setName(e.target.value)} required slotProps={{ htmlInput: { maxLength: 120 } }} />
            {team}
            <TextField type="date" label={t('When do you open?')} value={opensOn} onChange={e => setOpensOn(e.target.value)} sx={{ maxWidth: 280 }}
              helperText={t('Leave it empty if you don’t know yet.')} slotProps={{ inputLabel: { shrink: true } }} />
            <LogoPicker value={logo} onChange={setLogo} />
            <Box role="group" aria-labelledby="setup-colour">
              <Typography id="setup-colour" variant="subtitle2">{t('Your main colour')}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Buttons, menus and screens use it. Add more on the Brand page.')}</Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mt: 1, alignItems: 'center' }}>
                {SWATCHES.map(hex => <Swatch key={hex} hex={hex} on={colour === hex} onClick={() => setColour(colour === hex ? null : hex)} />)}
                <TextField type="color" size="small" label={t('Another colour')} value={colour ?? '#FFFFFF'} onChange={e => setColour(e.target.value.toUpperCase())}
                  sx={{ width: 140 }} slotProps={{ inputLabel: { shrink: true } }} />
              </Stack>
            </Box>
          </Stack>
        </Card>
      </Screen>
    </Box>
  )
}

/** One colour to tap; a tick on the one chosen. */
function Swatch({ hex, on, onClick, label }: { hex: string; on: boolean; onClick: () => void; label?: string }) {
  return (
    <ButtonBase aria-pressed={on} aria-label={label ?? hex} title={label ?? hex} onClick={onClick}
      sx={{ width: 44, height: 44, borderRadius: '12px', bgcolor: hex, border: `1px solid ${tokens.lineStrong}`, display: 'grid', placeItems: 'center',
        boxShadow: on ? `0 0 0 3px ${tokens.surface}, 0 0 0 5px ${tokens.roseDeep}` : 'none' }}>
      {on && <CheckIcon sx={{ color: inkOn(hex), fontSize: 22 }} />}
    </ButtonBase>
  )
}

/** Readable tick on a swatch. */
const inkOn = (hex: string) => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150 ? '#2B2522' : '#FFFFFF'
}

/** The logo: a box to click (or drop a file on), then the logo with Change and Remove. */
function LogoPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const run = useAction()
  const input = useRef<HTMLInputElement>(null)
  const pick = (file: File | undefined) => { if (file) void run(async () => onChange(await readLogo(file))) }
  return (
    <Box>
      <Typography variant="subtitle2">{t('Your logo')}</Typography>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden aria-label={t('Upload your logo')}
        onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
      {value ? (
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mt: 1 }}>
          <Box component="img" src={value} alt={t('Your logo')} sx={{ maxWidth: 220, maxHeight: 90, objectFit: 'contain', p: 1, borderRadius: '12px', bgcolor: '#fff', border: `1px solid ${tokens.line}` }} />
          <Button onClick={() => input.current?.click()}>{t('Change')}</Button>
          <Button onClick={() => onChange(null)}>{t('Remove')}</Button>
        </Stack>
      ) : (
        <ButtonBase onClick={() => input.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files[0]) }}
          sx={{ mt: 1, width: '100%', maxWidth: 420, py: 2.5, borderRadius: '14px', border: `2px dashed ${tokens.lineStrong}`, gap: 1, color: 'text.secondary', bgcolor: tokens.surfaceAlt }}>
          <UploadIcon />
          <Typography>{t('Add your logo')}</Typography>
        </ButtonBase>
      )}
    </Box>
  )
}

/** An open business: its website, read for its brand and details, and what's kept ticked. */
function FromWebsite({ busy, team, onBack, onSkip, onSave, onByHand }: {
  busy: boolean; team: ReactNode; onBack: () => void; onSkip: () => void; onSave: (a: Answers) => void; onByHand: () => void
}) {
  const { api, business } = useApp()
  const [site, setSite] = useState(business?.website ?? '')
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [found, setFound] = useState<FoundBrand | null>(null)
  const look = async (e: FormEvent) => {
    e.preventDefault()
    if (!site.trim()) return
    setReading(true); setError(null)
    try { setFound(await api.lookUpBrand(site)) } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setReading(false) }
  }

  if (found) return <Review found={found} busy={busy} team={team} onBack={() => setFound(null)} onSkip={onSkip} onSave={onSave} />
  return (
    <Box component="form" onSubmit={look}>
      <Screen eyebrow={t('Your business')} title={t('Bring in your brand from your website')}
        sub={t('I’ll read it for your logo, colours, fonts and contact details. You choose what to keep.')}
        footer={<>
          <Button onClick={onBack}>{t('Back')}</Button>
          <Stack direction="row" spacing={1}>
            <Button onClick={onSkip} disabled={busy || reading}>{t('Skip this step')}</Button>
            <Button type="submit" variant="contained" disabled={reading || !site.trim()}>{t('Find my brand')}</Button>
          </Stack>
        </>}>
        <Card sx={{ p: { xs: 2, sm: 3 }, maxWidth: 820 }}>
          <Stack spacing={3}>
            {/* Not type="url": the browser would refuse an address without https://, which is added for it. */}
            <TextField label={t('Website')} value={site} onChange={e => setSite(e.target.value)} placeholder={t('www.yourbusiness.com')} autoFocus disabled={reading}
              slotProps={{ htmlInput: { inputMode: 'url', autoCapitalize: 'none', spellCheck: false } }} />
            {reading && (
              <Box role="status">
                <LinearProgress sx={{ height: 6, borderRadius: 3, bgcolor: tokens.roseSoft }} />
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>{t('Reading your website. This can take up to half a minute.')}</Typography>
              </Box>
            )}
            {error && (
              <Alert severity="warning" action={<Button color="inherit" onClick={onByHand}>{t('Add them myself')}</Button>}>{error}</Alert>
            )}
            <Box>
              <Button onClick={onByHand} sx={{ px: 0 }}>{t('No website? Add your details yourself')}</Button>
            </Box>
            {team}
          </Stack>
        </Card>
      </Screen>
    </Box>
  )
}

/** One thing found, with its tick. */
function Found({ label, checked, onChange, children }: { label: string; checked: boolean; onChange: (on: boolean) => void; children?: ReactNode }) {
  return (
    <Box sx={{ py: 1.25, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
      <FormControlLabel control={<Checkbox checked={checked} onChange={e => onChange(e.target.checked)} />}
        label={<Typography sx={{ fontWeight: 500 }}>{label}</Typography>} />
      {children && <Box sx={{ pl: 4.25, opacity: checked ? 1 : 0.5 }}>{children}</Box>}
    </Box>
  )
}

const DAYS_OPEN = (h: FoundBrand['hours']) => Object.values(h ?? {}).filter(Boolean).length

/** What the website gave, every piece ticked to start with; the owner unticks what they don't want. */
function Review({ found, busy, team, onBack, onSkip, onSave }: {
  found: FoundBrand; busy: boolean; team: ReactNode; onBack: () => void; onSkip: () => void; onSave: (a: Answers) => void
}) {
  const { api, business } = useApp()
  const fontList = useAsync('fonts', () => api.fontList(), [])
  // Only Google Fonts can be used across the app (menus, screens, the Brand page).
  const google = (f: string | null) => (f && fontList.data?.fonts.find(x => x.family.toLowerCase() === f.toLowerCase())?.family) || null
  const heading = google(found.heading_font)
  const body = google(found.body_font)
  useGoogleFont(heading ?? undefined)
  useGoogleFont(body ?? undefined)
  const [logo, setLogo] = useState<string | null>(found.logo)
  // The name was typed at sign-up: the website's is offered, not ticked (and not shown when it's the same).
  const otherName = found.name && found.name.trim().toLowerCase() !== (business?.name ?? '').trim().toLowerCase() ? found.name : null
  const [keep, setKeep] = useState({ logo: !!found.logo, icon: !!found.icon, fonts: true, name: false, phone: !!found.phone, email: !!found.email,
    address: !!found.address, instagram: !!found.instagram, hours: !!found.hours, website: true })
  const [colours, setColours] = useState<string[]>(found.colours.map(c => c.hex))
  const tick = (k: keyof typeof keep) => (on: boolean) => setKeep(x => ({ ...x, [k]: on }))
  const host = found.website.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')

  const use = async () => {
    const b: Partial<Business> = {}
    if (keep.website) b.website = found.website
    if (keep.name && otherName) b.name = otherName.slice(0, 120)
    if (keep.phone && found.phone) b.phone = found.phone
    if (keep.email && found.email) b.email = found.email
    if (keep.address && found.address) b.address = found.address
    if (keep.instagram && found.instagram) b.instagram = `@${found.instagram}`
    if (keep.hours && found.hours) b.opening_hours = found.hours
    const brand: Answers['brand'] = {}
    // Fitted as an upload would be: a big picture becomes a PNG of 800 px (256 for the icon); one that won't load is left out.
    if (keep.logo && logo) brand.logo = await fitLogo(logo).catch(() => null)
    if (keep.icon && found.icon) brand.logo_mark = await fitLogo(found.icon, 256).catch(() => null)
    for (const k of ['logo', 'logo_mark'] as const) if (brand[k] === null) delete brand[k]
    const kept: BrandColour[] = found.colours.filter(c => colours.includes(c.hex)).map(c => ({ ...c, name: t(c.name), ...(c.use ? { use: t(c.use) } : {}) }))
    if (kept.length) brand.colours = kept
    if (keep.fonts && heading) brand.heading_font = heading
    if (keep.fonts && body) brand.body_font = body
    onSave({ business: b, brand })
  }

  return (
    <Screen eyebrow={host} title={t('Here’s what I found')} sub={t('Untick anything you don’t want. You can change it all later on the Brand and Business pages.')}
      footer={<>
        <Button onClick={onBack}>{t('Back')}</Button>
        <Stack direction="row" spacing={1}>
          <Button onClick={onSkip} disabled={busy}>{t('Skip this step')}</Button>
          <Button variant="contained" onClick={() => void use()} disabled={busy}>{t('Use these')}</Button>
        </Stack>
      </>}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, alignItems: 'start', maxWidth: 1040 }}>
        <Card component="section" aria-label={t('Brand')} sx={{ p: 2.5 }}>
          <Typography variant="overline" component="h2" sx={{ color: 'text.secondary' }}>{t('Brand')}</Typography>
          {logo
            ? <Found label={t('Logo')} checked={keep.logo} onChange={tick('logo')}>
              <Box component="img" src={logo} alt={t('The logo on your website')} sx={{ maxWidth: '100%', maxHeight: 90, objectFit: 'contain', p: 1, borderRadius: '12px', bgcolor: '#fff', border: `1px solid ${tokens.line}` }} />
            </Found>
            : <Box sx={{ py: 1.25 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{t('I couldn’t find a logo on your website.')}</Typography>
              <LogoPicker value={logo} onChange={v => { setLogo(v); setKeep(x => ({ ...x, logo: !!v })) }} />
            </Box>}
          {found.icon && (
            <Found label={t('App icon')} checked={keep.icon} onChange={tick('icon')}>
              <Box component="img" src={found.icon} alt={t('The icon on your website')} sx={{ width: 56, height: 56, objectFit: 'contain', borderRadius: '12px', bgcolor: '#fff', border: `1px solid ${tokens.line}` }} />
            </Found>
          )}
          {found.colours.length > 0 && (
            <Box role="group" aria-labelledby="setup-found-colours" sx={{ py: 1.25, borderTop: `1px solid ${tokens.line}` }}>
              <Typography id="setup-found-colours" sx={{ fontWeight: 500 }}>{t('Colours')}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Tap a colour to leave it out.')}</Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.25, mt: 1 }}>
                {found.colours.map(c => {
                  const on = colours.includes(c.hex)
                  return (
                    <Stack key={c.hex} spacing={0.5} sx={{ alignItems: 'center' }}>
                      <Swatch hex={c.hex} on={on} label={`${t(c.name)} ${c.hex}`} onClick={() => setColours(on ? colours.filter(x => x !== c.hex) : [...colours, c.hex])} />
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t(c.name)}</Typography>
                    </Stack>
                  )
                })}
              </Stack>
            </Box>
          )}
          {(heading || body) && (
            <Found label={t('Fonts')} checked={keep.fonts} onChange={tick('fonts')}>
              {heading && <Typography sx={{ fontFamily: `"${heading}", ${typeFonts.display}`, fontSize: '1.4rem', lineHeight: 1.3 }}>{t('Headings: {font}', { font: heading })}</Typography>}
              {body && <Typography sx={{ fontFamily: `"${body}", system-ui, sans-serif` }}>{t('Body text: {font}', { font: body })}</Typography>}
            </Found>
          )}
        </Card>

        <Stack spacing={2}>
          <Card component="section" aria-label={t('Details')} sx={{ p: 2.5 }}>
            <Typography variant="overline" component="h2" sx={{ color: 'text.secondary' }}>{t('Details')}</Typography>
            <Found label={t('Website')} checked={keep.website} onChange={tick('website')}><Typography variant="body2">{host}</Typography></Found>
            {otherName && <Found label={t('Use the name on your website')} checked={keep.name} onChange={tick('name')}>
              <Typography variant="body2">{otherName}</Typography>
            </Found>}
            {found.phone && <Found label={t('Phone')} checked={keep.phone} onChange={tick('phone')}><Typography variant="body2">{found.phone}</Typography></Found>}
            {found.email && <Found label={t('Email')} checked={keep.email} onChange={tick('email')}><Typography variant="body2">{found.email}</Typography></Found>}
            {found.address && <Found label={t('Address')} checked={keep.address} onChange={tick('address')}><Typography variant="body2">{found.address}</Typography></Found>}
            {found.instagram && <Found label={'Instagram'} checked={keep.instagram} onChange={tick('instagram')}><Typography variant="body2">@{found.instagram}</Typography></Found>}
            {found.hours && DAYS_OPEN(found.hours) > 0 && <Found label={t('Opening hours')} checked={keep.hours} onChange={tick('hours')}>
              <Typography variant="body2">{tn(DAYS_OPEN(found.hours), 'Open {n} day a week', 'Open {n} days a week')}</Typography>
            </Found>}
          </Card>
          <Card sx={{ p: 2.5 }}>{team}</Card>
        </Stack>
      </Box>
    </Screen>
  )
}
