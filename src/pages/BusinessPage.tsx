import {
  Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, Link, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/EditOutlined'
import PlaceIcon from '@mui/icons-material/PlaceOutlined'
import PhoneIcon from '@mui/icons-material/PhoneOutlined'
import MailIcon from '@mui/icons-material/MailOutlined'
import InstagramIcon from '@mui/icons-material/Instagram'
import ChatIcon from '@mui/icons-material/ChatBubbleOutlineOutlined'
import StoreIcon from '@mui/icons-material/StorefrontOutlined'
import BadgeIcon from '@mui/icons-material/BadgeOutlined'
import CurrencyIcon from '@mui/icons-material/PaymentsOutlined'
import MapIcon from '@mui/icons-material/MapOutlined'
import { useEffect, useState, type ReactNode } from 'react'
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
        <Box sx={{ fontWeight: 600, wordBreak: 'break-word' }}>{children}</Box>
      </Box>
    </Stack>
  )
}

export function BusinessPage() {
  const { business: b, isAdmin } = useApp()
  const [editing, setEditing] = useState(false)
  if (!b) return null
  const status = openStatus(b)
  const edit = () => isAdmin && (
    <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={() => setEditing(true)}>Edit</Button>
  )

  return (
    <>
      <PageHeader eyebrow="Business" title={b.name}
        subtitle={[b.business_type, b.address].filter(Boolean).join(' · ')}
        actions={<Tag fg={status.open ? tokens.goodFg : tokens.neutralFg} bg={status.open ? tokens.goodBg : tokens.neutralBg}>● {status.text}</Tag>} />

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <SectionTitle action={edit()}>Contact</SectionTitle>
              <InfoRow icon={<PlaceIcon fontSize="small" />} label="Address">
                {b.address ? <Link href={`https://maps.google.com/?q=${encodeURIComponent(b.address)}`} target="_blank" rel="noreferrer" underline="hover" color="inherit">{b.address}</Link> : '—'}
              </InfoRow>
              <InfoRow icon={<PhoneIcon fontSize="small" />} label="Phone">{b.phone ?? '—'}</InfoRow>
              <InfoRow icon={<MailIcon fontSize="small" />} label="Email">{b.email ?? '—'}</InfoRow>
              <InfoRow icon={<InstagramIcon fontSize="small" />} label="Instagram">
                {b.instagram ? <Link href={`https://instagram.com/${b.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" underline="hover" color="inherit">{b.instagram}</Link> : '—'}
              </InfoRow>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <SectionTitle action={edit()}>Company</SectionTitle>
              <InfoRow icon={<StoreIcon fontSize="small" />} label="Type of business">{b.business_type || '—'}</InfoRow>
              <InfoRow icon={<BadgeIcon fontSize="small" />} label="CIF / NIF">
                <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>{b.tax_id || (isAdmin ? 'Not added yet' : '—')}</Box>
              </InfoRow>
              <InfoRow icon={<CurrencyIcon fontSize="small" />} label="Currency">
                {isAdmin ? <CurrencySelect /> : currencyLabel(b.currency ?? 'EUR')}
              </InfoRow>
              <InfoRow icon={<ChatIcon fontSize="small" />} label="Team alerts go to">{b.team_channel ? CHANNEL[b.team_channel] : 'Not set yet'}</InfoRow>
              {b.towns_followed.length > 0 && (
                <InfoRow icon={<MapIcon fontSize="small" />} label="Nearby towns on the calendar">
                  <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>{b.towns_followed.map(t => <Tag key={t}>{t}</Tag>)}</Stack>
                </InfoRow>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 3 }}>
        Last updated {formatLocal(b.updated_at, 'd MMM yyyy, HH:mm')}
      </Typography>

      {editing && <DetailsDialog onClose={() => setEditing(false)} />}
    </>
  )
}

function useBusinessDraft() {
  const { business } = useApp()
  const [b, setB] = useState<Business | null>(business)
  useEffect(() => setB(business), [business])
  return [b!, setB as (b: Business) => void] as const
}

function EditDialog({ title, onClose, onSave, children }: { title: string; onClose: () => void; onSave: () => Promise<unknown>; children: ReactNode }) {
  const run = useAction()
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>{children}</Stack></DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={async () => { if (await run(onSave, 'Saved')) onClose() }}>Save</Button>
      </DialogActions>
    </Dialog>
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

/** Right on the page: the café's currency, euro unless an admin picks another. Saves straight away. */
function CurrencySelect() {
  const { api, business, refresh } = useApp()
  const run = useAction()
  const value = business?.currency ?? 'EUR'
  return (
    <TextField select size="small" value={value} variant="standard" aria-label="Currency" sx={{ minWidth: 200, mt: 0.25 }}
      slotProps={{ select: { disableUnderline: true, sx: { fontWeight: 600 } } as never, htmlInput: { 'aria-label': 'Currency' } }}
      onChange={e => run(async () => { await api.updateBusiness({ currency: e.target.value }); await refresh() }, `Currency: ${currencyLabel(e.target.value)}`)}>
      {CURRENCIES.map(([code]) => <MenuItem key={code} value={code}>{currencyLabel(code)}</MenuItem>)}
    </TextField>
  )
}

function DetailsDialog({ onClose }: { onClose: () => void }) {
  const { api, refresh } = useApp()
  const [b, setB] = useBusinessDraft()
  const tax = b.tax_id?.trim() ? checkTaxId(b.tax_id) : null
  const taxHint = !tax ? 'Company CIF, or NIF/NIE if self-employed' : tax.ok ? `Valid ${tax.kind}` : tax.error
  const field = (key: keyof Business, label: string) => (
    <TextField label={label} value={(b[key] as string) ?? ''} onChange={e => setB({ ...b, [key]: e.target.value })} />
  )
  return (
    <EditDialog title="Business details" onClose={onClose} onSave={async () => {
      const { updated_at: _u, ...patch } = b
      if (!patch.name?.trim()) throw new Error('The business needs a name')
      if (patch.tax_id?.trim()) {
        const t = checkTaxId(patch.tax_id)
        if (!t.ok) throw new Error(t.error)
        patch.tax_id = t.value
      } else patch.tax_id = null
      await api.updateBusiness(patch); await refresh()
    }}>
      {field('name', 'Name')}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        {field('business_type', 'Type')}
        <TextField label="CIF / NIF" value={b.tax_id ?? ''} placeholder="B12345674" helperText={taxHint}
          error={!!b.tax_id?.trim() && !tax?.ok} onChange={e => setB({ ...b, tax_id: e.target.value })}
          slotProps={{ htmlInput: { maxLength: 20, style: { textTransform: 'uppercase' } } }} />
      </Stack>
      {field('address', 'Address')}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>{field('phone', 'Phone')}{field('email', 'Email')}</Stack>
      {field('instagram', 'Instagram')}
      <TextField select label="Team alerts go to" value={b.team_channel ?? ''}
        onChange={e => setB({ ...b, team_channel: (e.target.value || null) as Business['team_channel'] })}>
        <MenuItem value="">Not set</MenuItem>
        <MenuItem value="whatsapp">WhatsApp</MenuItem>
        <MenuItem value="slack">Slack</MenuItem>
        <MenuItem value="sms">Text message</MenuItem>
      </TextField>
      <TextField label="Nearby towns to follow" helperText="Comma separated" value={b.towns_followed.join(', ')}
        onChange={e => setB({ ...b, towns_followed: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} />
    </EditDialog>
  )
}
