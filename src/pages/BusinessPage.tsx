import { Box, Button, Card, CardContent, InputAdornment, Link, Stack, TextField, Typography } from '@mui/material'
import EditIcon from '@mui/icons-material/EditOutlined'
import PlaceIcon from '@mui/icons-material/PlaceOutlined'
import PhoneIcon from '@mui/icons-material/PhoneOutlined'
import MailIcon from '@mui/icons-material/MailOutlined'
import WebIcon from '@mui/icons-material/LanguageOutlined'
import InstagramIcon from '@mui/icons-material/Instagram'
import ChatIcon from '@mui/icons-material/ChatBubbleOutlineOutlined'
import StoreIcon from '@mui/icons-material/StorefrontOutlined'
import NameIcon from '@mui/icons-material/BadgeOutlined'
import BadgeIcon from '@mui/icons-material/ReceiptLongOutlined'
import CurrencyIcon from '@mui/icons-material/PaymentsOutlined'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { PageHeader, SectionTitle } from '../components/common'
import { PhoneField } from '../components/PhoneField'
import { msg, t } from '../i18n'
import type { Business } from '../../shared/types'
import { optionName } from '../../shared/connections'
import { checkTaxId } from '../../shared/taxId'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'

const CHANNEL: Record<string, string> = { whatsapp: 'WhatsApp', slack: 'Slack', sms: msg('Text message') }

/** One detail: the icon says what it is (its name shows on hover and is read out by screen readers). */
function InfoRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ py: 1.25, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      {/* As tall as one line of the text beside it, so every icon sits level with the first line. */}
      <Box title={label} sx={{ color: tokens.inkFaint, height: '1.65em', width: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Box component="span" sx={visuallyHidden}>{label}: </Box>
        <Box sx={{ fontWeight: 500, wordBreak: 'break-word' }}>{children}</Box>
      </Box>
    </Stack>
  )
}

const visuallyHidden = { position: 'absolute', width: '1px', height: '1px', p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const

/** A quiet note after a value ("· connected"). */
const Aside = ({ children }: { children: ReactNode }) => (
  <Typography component="span" variant="body2" sx={{ color: 'text.secondary', fontWeight: 400 }}> · {children}</Typography>
)

const CURRENCIES: [string, string][] = [
  ['EUR', msg('Euro')], ['GBP', msg('Pound sterling')], ['USD', msg('US dollar')], ['CHF', msg('Swiss franc')], ['SEK', msg('Swedish krona')],
  ['NOK', msg('Norwegian krone')], ['DKK', msg('Danish krone')], ['PLN', msg('Polish złoty')], ['CZK', msg('Czech koruna')], ['HUF', msg('Hungarian forint')],
  ['RON', msg('Romanian leu')], ['TRY', msg('Turkish lira')], ['MAD', msg('Moroccan dirham')], ['AED', msg('UAE dirham')], ['CAD', msg('Canadian dollar')],
  ['AUD', msg('Australian dollar')], ['NZD', msg('New Zealand dollar')], ['JPY', msg('Japanese yen')], ['MXN', msg('Mexican peso')], ['BRL', msg('Brazilian real')],
]

const currencyLabel = (code: string) => {
  const found = CURRENCIES.find(c => c[0] === code)?.[1]
  const name = found ? t(found) : code
  const symbol = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find(p => p.type === 'currency')?.value
  return symbol && symbol !== code ? `${symbol} ${name}` : `${code} · ${name}`
}

/** Instagram username: letters, numbers, full stops and underscores (Instagram's own rule), without the @. */
const cleanHandle = (v: string) => v.replace(/^@+/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 30)
const handleOf = (b: Business) => (b.instagram ?? '').replace(/^@+/, '')
/** A web address as typed ("easybeanscoffee.com") made whole ("https://easybeanscoffee.com"). */
const cleanWebsite = (v: string) => { const w = v.trim(); return !w ? null : /^https?:\/\//i.test(w) ? w : `https://${w}` }
/** The address without https:// and the trailing slash, for reading. */
const shortUrl = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '')

/** A card whose rows turn into fields right where they are when an admin presses Edit. */
type Form = { d: Business; set: (patch: Partial<Business>) => void }

function EditableCard({ title, business, canEdit, view, form, onSave }: {
  title: string; business: Business; canEdit: boolean; view: ReactNode
  form: (f: Form) => ReactNode; onSave: (d: Business) => Promise<unknown>
}) {
  const run = useAction()
  // This card's unsaved changes; Cancel drops them.
  const [draft, setDraft] = useState<Business | null>(null)
  const [busy, setBusy] = useState(false)
  const editing = draft !== null
  const setEditing = (on: boolean) => setDraft(on ? { ...business } : null)
  return (
    <Card component="section" aria-label={title}>
      <CardContent>
        <SectionTitle action={canEdit && !editing && (
          <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={() => setEditing(true)}>{t('Edit')}</Button>
        )}>{title}</SectionTitle>
        {editing ? (
          <Box component="form" onSubmit={async e => {
            e.preventDefault()
            setBusy(true)
            try { if (await run(() => onSave(draft!), t('Saved'))) setEditing(false) } finally { setBusy(false) }
          }}>
            <Stack spacing={2} sx={{ pt: 1 }}>{form({ d: draft!, set: patch => setDraft({ ...draft!, ...patch }) })}</Stack>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 2.5 }}>
              <Button onClick={() => setEditing(false)} disabled={busy}>{t('Cancel')}</Button>
              <Button type="submit" variant="contained" disabled={busy}>{t('Save')}</Button>
            </Stack>
          </Box>
        ) : view}
      </CardContent>
    </Card>
  )
}

export function BusinessPage() {
  const { api, business: b, isAdmin, refresh } = useApp()
  // Admins: the connected Instagram account and mailbox, which fill in the handle and the email
  // (both can still be changed here).
  const integ = useAsync('integrations', () => (isAdmin ? api.integrations() : Promise.resolve(null)), [isAdmin])
  const igRow = integ.data?.integrations.find(i => i.provider === 'instagram' && i.status === 'connected')
  const connectedHandle = igRow ? String(igRow.external?.username ?? igRow.account_label ?? '').replace(/^@+/, '') : ''
  const mailRow = integ.data?.integrations.find(i => (i.provider === 'gmail' || i.provider === 'outlook') && i.status === 'connected')
  const mailbox = mailRow?.account_label?.includes('@') ? mailRow.account_label : ''
  const mailApp = mailRow ? optionName(mailRow.provider) : ''
  if (!b) return null
  /** Save only the card's own fields, after checking them. */
  const save = (keys: (keyof Business)[], check: (p: Partial<Business>) => void) => async (d: Business) => {
    const patch = Object.fromEntries(keys.map(k => [k, d[k]])) as Partial<Business>
    check(patch)
    await api.updateBusiness(patch)
    await refresh()
  }
  // No email of its own yet: the connected mailbox is the business's email.
  const email = b.email || mailbox || null

  return (
    <>
      <PageHeader eyebrow={t('Business')} title={b.name} />

      <Stack spacing={2.5}>
        <EditableCard title={t('Contact')} business={b} canEdit={isAdmin}
          view={<>
            <InfoRow icon={<PlaceIcon fontSize="small" />} label={t('Address')}>
              {b.address ? <Link href={`https://maps.google.com/?q=${encodeURIComponent(b.address)}`} target="_blank" rel="noreferrer" underline="hover" color="inherit">{b.address}</Link> : '—'}
            </InfoRow>
            <InfoRow icon={<PhoneIcon fontSize="small" />} label={t('Phone')}>
              {b.phone ? <Link href={`tel:${b.phone.replace(/[^\d+]/g, '')}`} underline="hover" color="inherit">{b.phone}</Link> : '—'}
            </InfoRow>
            <InfoRow icon={<MailIcon fontSize="small" />} label={t('Email')}>
              {email ? <Link href={`mailto:${email}`} underline="hover" color="inherit">{email}</Link> : '—'}
              {mailbox && email?.toLowerCase() === mailbox.toLowerCase() && <Aside>{t('connected to {app}', { app: mailApp })}</Aside>}
            </InfoRow>
            <InfoRow icon={<WebIcon fontSize="small" />} label={t('Website')}>
              {b.website ? <Link href={b.website} target="_blank" rel="noreferrer" underline="hover" color="inherit">{shortUrl(b.website)}</Link> : '—'}
            </InfoRow>
            <InfoRow icon={<InstagramIcon fontSize="small" />} label={'Instagram'}>
              {handleOf(b) ? <Link href={`https://instagram.com/${handleOf(b)}`} target="_blank" rel="noreferrer" underline="hover" color="inherit">@{handleOf(b)}</Link> : '—'}
              {connectedHandle && connectedHandle.toLowerCase() === handleOf(b).toLowerCase() && <Aside>{t('connected')}</Aside>}
            </InfoRow>
            {isAdmin && !mailRow && integ.data && (
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
                {t('Connect Gmail or Outlook and its address fills in here by itself.')}{' '}
                <Link component={RouterLink} to="/connections" underline="hover">{t('Connections')}</Link>
              </Typography>
            )}
          </>}
          form={({ d, set }) => <>
            <TextField label={t('Address')} value={d.address ?? ''} onChange={e => set({ address: e.target.value })} />
            <PhoneField label={t('Phone')} value={d.phone ?? ''} onChange={phone => set({ phone })} />
            <TextField label={t('Email')} type="email" value={d.email ?? ''} placeholder={mailbox || undefined}
              helperText={mailbox
                ? (d.email ?? '').toLowerCase() === mailbox.toLowerCase() || !d.email
                  ? t('Filled in from your connected {app} ({email}). You can change it.', { app: mailApp, email: mailbox })
                  : t('Your connected {app} is {email}. This address is used instead.', { app: mailApp, email: mailbox })
                : undefined}
              onChange={e => set({ email: e.target.value })} />
            {mailbox && d.email && d.email.toLowerCase() !== mailbox.toLowerCase() && (
              <Box sx={{ mt: -1 }}><Button size="small" onClick={() => set({ email: mailbox })}>{t('Use {email}', { email: mailbox })}</Button></Box>
            )}
            {/* Not type="url": the browser would refuse an address without https://, which is added on save. */}
            <TextField label={t('Website')} value={d.website ?? ''} placeholder={t('https://www.yourbusiness.com')}
              slotProps={{ htmlInput: { inputMode: 'url', autoCapitalize: 'none', spellCheck: false } }}
              onChange={e => set({ website: e.target.value })} />
            <TextField label={'Instagram'} value={handleOf(d)} placeholder={connectedHandle || t('yourbusiness')}
              helperText={connectedHandle ? t('Filled in from your connected Instagram (@{handle}). You can change it.', { handle: connectedHandle }) : t('Your Instagram username')}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">@</InputAdornment> }, htmlInput: { autoCapitalize: 'none', spellCheck: false } }}
              onChange={e => set({ instagram: cleanHandle(e.target.value) || null })} />
          </>}
          onSave={save(['address', 'phone', 'email', 'website', 'instagram'], p => {
            p.address = p.address?.trim() || null
            // Left empty while a mailbox is connected: the mailbox's address.
            p.email = p.email?.trim() || mailbox || null
            p.phone = p.phone?.trim() || null
            p.website = cleanWebsite(p.website ?? '')
            if (p.phone && p.phone.replace(/\D/g, '').length < 6) throw new Error(t('Enter the full phone number'))
            if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw new Error(t('Enter a full email address'))
            if (p.website && !/^https?:\/\/[^\s/]+\.[^\s/]{2,}/i.test(p.website)) throw new Error(t('Enter the website’s full address, like www.yourbusiness.com'))
            p.instagram = p.instagram ? `@${cleanHandle(p.instagram)}` : null
          })} />

        <EditableCard title={t('Company')} business={b} canEdit={isAdmin}
          view={<>
            <InfoRow icon={<NameIcon fontSize="small" />} label={t('Business name')}>{b.name}</InfoRow>
            <InfoRow icon={<StoreIcon fontSize="small" />} label={t('Type of business')}>{b.business_type || '—'}</InfoRow>
            <InfoRow icon={<BadgeIcon fontSize="small" />} label={'CIF / NIF'}>
              <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>{b.tax_id || (isAdmin ? t('Not added yet') : '—')}</Box>
            </InfoRow>
            <InfoRow icon={<CurrencyIcon fontSize="small" />} label={t('Currency')}>{currencyLabel(b.currency ?? 'EUR')}</InfoRow>
            <InfoRow icon={<ChatIcon fontSize="small" />} label={t('Team alerts go to')}>{b.team_channel ? t(CHANNEL[b.team_channel]) : t('Not set yet')}</InfoRow>
          </>}
          form={({ d, set }) => {
            const tax = d.tax_id?.trim() ? checkTaxId(d.tax_id) : null
            const taxHint = !tax ? t('Company CIF, or NIF/NIE if self-employed') : tax.ok ? t('Valid {kind}', { kind: tax.kind }) : t(tax.error)
            return <>
            <TextField label={t('Business name')} value={d.name} onChange={e => set({ name: e.target.value })}
              helperText={t('Shown at the top left of the app, next to your logo (the logo is set on the Brand page).')} />
            <TextField label={t('Type of business')} value={d.business_type ?? ''} onChange={e => set({ business_type: e.target.value })} />
            <TextField label={'CIF / NIF'} value={d.tax_id ?? ''} placeholder={'B12345674'} helperText={taxHint}
              error={!!d.tax_id?.trim() && !tax?.ok} onChange={e => set({ tax_id: e.target.value })}
              slotProps={{ htmlInput: { maxLength: 20, style: { textTransform: 'uppercase' } } }} />
            {/* The device's own list: opens the same way everywhere, phones included. */}
            <TextField select label={t('Currency')} value={d.currency ?? 'EUR'} onChange={e => set({ currency: e.target.value })}
              slotProps={{ select: { native: true } }}>
              {CURRENCIES.map(([code]) => <option key={code} value={code}>{currencyLabel(code)}</option>)}
            </TextField>
            {/* The label stays above: "Not set" is a choice shown in the box, not an empty one. */}
            <TextField select label={t('Team alerts go to')} value={d.team_channel ?? ''} slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
              onChange={e => set({ team_channel: (e.target.value || null) as Business['team_channel'] })}>
              <option value="">{t('Not set')}</option>
              <option value="whatsapp">{'WhatsApp'}</option>
              <option value="slack">{'Slack'}</option>
              <option value="sms">{t('Text message')}</option>
            </TextField>
          </>
          }}
          onSave={save(['name', 'business_type', 'tax_id', 'currency', 'team_channel'], p => {
            if (!p.name?.trim()) throw new Error(t('The business needs a name'))
            p.name = p.name.trim()
            if (p.tax_id?.trim()) {
              const tax = checkTaxId(p.tax_id)
              if (!tax.ok) throw new Error(t(tax.error))
              p.tax_id = tax.value
            } else p.tax_id = null
          })} />
      </Stack>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 3 }}>
        {t('Last updated {when}', { when: formatLocal(b.updated_at, 'd MMM yyyy, HH:mm') })}
      </Typography>
    </>
  )
}
