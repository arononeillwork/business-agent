import { Box, Button, Card, CardContent, InputAdornment, Link, Stack, TextField, Typography } from '@mui/material'
import EditIcon from '@mui/icons-material/EditOutlined'
import PlaceIcon from '@mui/icons-material/PlaceOutlined'
import PhoneIcon from '@mui/icons-material/PhoneOutlined'
import MailIcon from '@mui/icons-material/MailOutlined'
import InstagramIcon from '@mui/icons-material/Instagram'
import ChatIcon from '@mui/icons-material/ChatBubbleOutlineOutlined'
import StoreIcon from '@mui/icons-material/StorefrontOutlined'
import BadgeIcon from '@mui/icons-material/BadgeOutlined'
import CurrencyIcon from '@mui/icons-material/PaymentsOutlined'
import { useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { PageHeader, SectionTitle, Tag } from '../components/common'
import type { Business } from '../../shared/types'
import { checkTaxId } from '../../shared/taxId'
import { dayKey, formatLocal, hmToMinutes, localTime, today } from '../../shared/time'
import { tokens } from '../theme'

const CHANNEL: Record<string, string> = { whatsapp: 'WhatsApp', slack: 'Slack', sms: 'Text message' }

function openStatus(b: Business) {
  const h = b.opening_hours[dayKey(today())]
  if (!h) return { open: false, text: 'Closed today' }
  const now = hmToMinutes(localTime(new Date()))
  if (now < hmToMinutes(h.open)) return { open: false, text: `Opens at ${h.open}` }
  if (now >= hmToMinutes(h.close)) return { open: false, text: `Closed now · today ${h.open}–${h.close}` }
  return { open: true, text: `Open now · closes at ${h.close}` }
}

function InfoRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ py: 1.25, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <Box sx={{ color: tokens.inkFaint, pt: 0.25, display: 'flex' }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{label}</Typography>
        <Box sx={{ fontWeight: 500, wordBreak: 'break-word' }}>{children}</Box>
      </Box>
    </Stack>
  )
}

const CURRENCIES: [string, string][] = [
  ['EUR', 'Euro'], ['GBP', 'Pound sterling'], ['USD', 'US dollar'], ['CHF', 'Swiss franc'], ['SEK', 'Swedish krona'],
  ['NOK', 'Norwegian krone'], ['DKK', 'Danish krone'], ['PLN', 'Polish złoty'], ['CZK', 'Czech koruna'], ['HUF', 'Hungarian forint'],
  ['RON', 'Romanian leu'], ['TRY', 'Turkish lira'], ['MAD', 'Moroccan dirham'], ['AED', 'UAE dirham'], ['CAD', 'Canadian dollar'],
  ['AUD', 'Australian dollar'], ['NZD', 'New Zealand dollar'], ['JPY', 'Japanese yen'], ['MXN', 'Mexican peso'], ['BRL', 'Brazilian real'],
]

const currencyLabel = (code: string) => {
  const name = CURRENCIES.find(c => c[0] === code)?.[1] ?? code
  const symbol = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find(p => p.type === 'currency')?.value
  return symbol && symbol !== code ? `${symbol} ${name}` : `${code} · ${name}`
}

/** Phone: digits and spaces, with an optional + in front. */
const cleanPhone = (v: string) => v.replace(/[^\d+ ]/g, '').replace(/(?!^)\+/g, '')
/** Instagram username: letters, numbers, full stops and underscores (Instagram's own rule), without the @. */
const cleanHandle = (v: string) => v.replace(/^@+/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 30)
const handleOf = (b: Business) => (b.instagram ?? '').replace(/^@+/, '')

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
          <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={() => setEditing(true)}>Edit</Button>
        )}>{title}</SectionTitle>
        {editing ? (
          <Box component="form" onSubmit={async e => {
            e.preventDefault()
            setBusy(true)
            try { if (await run(() => onSave(draft!), 'Saved')) setEditing(false) } finally { setBusy(false) }
          }}>
            <Stack spacing={2} sx={{ pt: 1 }}>{form({ d: draft!, set: patch => setDraft({ ...draft!, ...patch }) })}</Stack>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 2.5 }}>
              <Button onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={busy}>Save</Button>
            </Stack>
          </Box>
        ) : view}
      </CardContent>
    </Card>
  )
}

export function BusinessPage() {
  const { api, business: b, isAdmin, refresh } = useApp()
  if (!b) return null
  const status = openStatus(b)
  /** Save only the card's own fields, after checking them. */
  const save = (keys: (keyof Business)[], check: (p: Partial<Business>) => void) => async (d: Business) => {
    const patch = Object.fromEntries(keys.map(k => [k, d[k]])) as Partial<Business>
    check(patch)
    await api.updateBusiness(patch)
    await refresh()
  }

  return (
    <>
      <PageHeader eyebrow="Business" title={b.name}
        subtitle={[b.business_type, b.address].filter(Boolean).join(' · ')}
        actions={<Tag fg={status.open ? tokens.goodFg : tokens.neutralFg} bg={status.open ? tokens.goodBg : tokens.neutralBg}>● {status.text}</Tag>} />

      <Stack spacing={2.5}>
        <EditableCard title="Contact" business={b} canEdit={isAdmin}
          view={<>
            <InfoRow icon={<PlaceIcon fontSize="small" />} label="Address">
              {b.address ? <Link href={`https://maps.google.com/?q=${encodeURIComponent(b.address)}`} target="_blank" rel="noreferrer" underline="hover" color="inherit">{b.address}</Link> : '—'}
            </InfoRow>
            <InfoRow icon={<PhoneIcon fontSize="small" />} label="Phone">{b.phone ?? '—'}</InfoRow>
            <InfoRow icon={<MailIcon fontSize="small" />} label="Email">{b.email ?? '—'}</InfoRow>
            <InfoRow icon={<InstagramIcon fontSize="small" />} label="Instagram">
              {handleOf(b) ? <Link href={`https://instagram.com/${handleOf(b)}`} target="_blank" rel="noreferrer" underline="hover" color="inherit">@{handleOf(b)}</Link> : '—'}
            </InfoRow>
          </>}
          form={({ d, set }) => <>
            <TextField label="Address" value={d.address ?? ''} onChange={e => set({ address: e.target.value })} />
            <TextField label="Phone" type="tel" value={d.phone ?? ''} placeholder="+34 600 000 000"
              slotProps={{ htmlInput: { inputMode: 'tel', maxLength: 20 } }}
              onChange={e => set({ phone: cleanPhone(e.target.value) })} />
            <TextField label="Email" type="email" value={d.email ?? ''} onChange={e => set({ email: e.target.value })} />
            <TextField label="Instagram" value={handleOf(d)} placeholder="yourbusiness"
              helperText="Your Instagram username"
              slotProps={{ input: { startAdornment: <InputAdornment position="start">@</InputAdornment> }, htmlInput: { autoCapitalize: 'none', spellCheck: false } }}
              onChange={e => set({ instagram: cleanHandle(e.target.value) || null })} />
          </>}
          onSave={save(['address', 'phone', 'email', 'instagram'], p => {
            p.address = p.address?.trim() || null
            p.email = p.email?.trim() || null
            p.phone = p.phone?.trim() || null
            if (p.phone && p.phone.replace(/\D/g, '').length < 6) throw new Error('Enter the full phone number')
            if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw new Error('Enter a full email address')
            p.instagram = p.instagram ? `@${cleanHandle(p.instagram)}` : null
          })} />

        <EditableCard title="Company" business={b} canEdit={isAdmin}
          view={<>
            <InfoRow icon={<StoreIcon fontSize="small" />} label="Type of business">{b.business_type || '—'}</InfoRow>
            <InfoRow icon={<BadgeIcon fontSize="small" />} label="CIF / NIF">
              <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>{b.tax_id || (isAdmin ? 'Not added yet' : '—')}</Box>
            </InfoRow>
            <InfoRow icon={<CurrencyIcon fontSize="small" />} label="Currency">{currencyLabel(b.currency ?? 'EUR')}</InfoRow>
            <InfoRow icon={<ChatIcon fontSize="small" />} label="Team alerts go to">{b.team_channel ? CHANNEL[b.team_channel] : 'Not set yet'}</InfoRow>
          </>}
          form={({ d, set }) => {
            const tax = d.tax_id?.trim() ? checkTaxId(d.tax_id) : null
            const taxHint = !tax ? 'Company CIF, or NIF/NIE if self-employed' : tax.ok ? `Valid ${tax.kind}` : tax.error
            return <>
            <TextField label="Name" value={d.name} onChange={e => set({ name: e.target.value })} />
            <TextField label="Type of business" value={d.business_type ?? ''} onChange={e => set({ business_type: e.target.value })} />
            <TextField label="CIF / NIF" value={d.tax_id ?? ''} placeholder="B12345674" helperText={taxHint}
              error={!!d.tax_id?.trim() && !tax?.ok} onChange={e => set({ tax_id: e.target.value })}
              slotProps={{ htmlInput: { maxLength: 20, style: { textTransform: 'uppercase' } } }} />
            {/* The device's own list: opens the same way everywhere, phones included. */}
            <TextField select label="Currency" value={d.currency ?? 'EUR'} onChange={e => set({ currency: e.target.value })}
              slotProps={{ select: { native: true } }}>
              {CURRENCIES.map(([code]) => <option key={code} value={code}>{currencyLabel(code)}</option>)}
            </TextField>
            <TextField select label="Team alerts go to" value={d.team_channel ?? ''} slotProps={{ select: { native: true } }}
              onChange={e => set({ team_channel: (e.target.value || null) as Business['team_channel'] })}>
              <option value="">Not set</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="slack">Slack</option>
              <option value="sms">Text message</option>
            </TextField>
          </>
          }}
          onSave={save(['name', 'business_type', 'tax_id', 'currency', 'team_channel'], p => {
            if (!p.name?.trim()) throw new Error('The business needs a name')
            p.name = p.name.trim()
            if (p.tax_id?.trim()) {
              const t = checkTaxId(p.tax_id)
              if (!t.ok) throw new Error(t.error)
              p.tax_id = t.value
            } else p.tax_id = null
          })} />
      </Stack>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 3 }}>
        Last updated {formatLocal(b.updated_at, 'd MMM yyyy, HH:mm')}
      </Typography>
    </>
  )
}
