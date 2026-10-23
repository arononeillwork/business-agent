import {
  Box, Button, Card, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, Link, MenuItem, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PhoneIcon from '@mui/icons-material/PhoneOutlined'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import EmailIcon from '@mui/icons-material/EmailOutlined'
import WebIcon from '@mui/icons-material/LanguageOutlined'
import OrderIcon from '@mui/icons-material/ShoppingCartOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import StarIcon from '@mui/icons-material/Star'
import StarOutlineIcon from '@mui/icons-material/StarBorder'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, Tag } from '../components/common'
import { PhoneField } from '../components/PhoneField'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { EMAIL } from '../../shared/customers'
import { SUPPLIER_KINDS, nextOrderDay, sortDays, type Supplier, type SupplierInput } from '../../shared/stock'
import { DAY_KEYS, type DayKey } from '../../shared/types'
import { formatLocal, formatMoney, today } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t, tc, tn } from '../i18n'

const DAY_LABELS: Record<DayKey, string> = {
  mon: msg('Monday'), tue: msg('Tuesday'), wed: msg('Wednesday'), thu: msg('Thursday'), fri: msg('Friday'), sat: msg('Saturday'), sun: msg('Sunday'),
}
const short = (d: DayKey) => t(DAY_LABELS[d]).slice(0, 3)
const days = (s: Pick<Supplier, 'order_days'>) => (s.order_days.length === 7 ? t('Every day') : s.order_days.map(short).join(', '))
// The star's gold, as on the To Do list.
const STAR = '#C98A1E'
// Active: the ones bought from now. Catalogue: every supplier on file, archived ones too. Starred: the ones the café relies on.
type Filter = 'active' | 'catalogue' | 'starred'
const FILTERS: Record<Filter, (s: Supplier) => boolean> = { active: s => s.active, catalogue: () => true, starred: s => s.starred }

/** The businesses the café buys from: how to reach them, when they take orders, what they supply. Admins manage; finance partners read. */
export function SuppliersPage() {
  const { api, isAdmin } = useApp()
  const data = useAsync('suppliers', () => api.suppliers(), [])
  const items = useAsync('stock', () => api.stockItems(), [])
  const moves = useAsync('stock-movements', () => api.stockMovements(), [])
  const run = useAction()
  const [open, setOpen] = useState<Supplier | 'new' | null>(null)
  const [filter, setFilter] = useState<Filter>('active')

  const all = data.data ?? []
  const shown = all.filter(FILTERS[filter])
  const star = (s: Supplier) => run(() => api.saveSupplier({ ...s, starred: !s.starred }))
  const itemsOf = (s: Supplier) => (items.data ?? []).filter(i => i.supplier_id === s.id && i.active)
  const lastDelivery = (s: Supplier) => {
    const ids = new Set(itemsOf(s).map(i => i.id))
    return (moves.data ?? []).find(m => m.reason === 'delivery' && ids.has(m.item_id))?.at ?? null
  }
  const table = (): ExportTable => ({
    title: t('Suppliers'),
    filename: `suppliers-${today()}`,
    columns: [t('Supplier'), t('Type'), t('Contact'), t('Phone'), t('Email'), t('Website'), t('Order page'), t('Customer number'), t('Order days'),
      t('Order by'), t('Delivery (days)'), t('Minimum order'), t('Payment terms'), t('Items'), t('Notes')],
    rows: shown.map(s => [s.name, s.kind ? t(s.kind) : '', s.contact_name ?? '', s.phone ?? '', s.email ?? '', s.website ?? '', s.order_url ?? '',
      s.account_number ?? '', days(s), s.cutoff ?? '', s.lead_days, s.minimum_order, s.payment_terms ?? '', itemsOf(s).length, s.notes ?? '']),
    money: [11],
  })

  return (
    <>
      <PageHeader eyebrow={t('Stock')} title={t('Suppliers')}
        actions={<>
          {isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen('new')}>{t('Add supplier')}</Button>}
          <ExportButton table={table} disabled={!shown.length} folder="Stock" />
        </>} />
      <ErrorBox error={data.error} />
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {([['active', tc('suppliers', 'Active')], ['catalogue', t('Catalogue')], ['starred', tc('suppliers', 'Starred')]] as const).map(([id, label]) => (
          <Chip key={id} size="small" clickable label={`${label} ${all.filter(FILTERS[id]).length}`} aria-pressed={filter === id} onClick={() => setFilter(id)}
            icon={id === 'starred' ? <StarIcon sx={{ fontSize: 16, color: `${filter === id ? 'inherit' : STAR} !important` }} /> : undefined}
            variant={filter === id ? 'filled' : 'outlined'} color={filter === id ? 'primary' : 'default'} />
        ))}
      </Stack>

      {data.data && !shown.length ? (
        <Empty>{filter === 'starred' ? t('Nothing starred. Star the suppliers you rely on most to find them here.')
          : t('Add the businesses you buy from, with their phone, email, website and order days.')}</Empty>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
          {shown.map(s => {
            const next = nextOrderDay(s, new Date())
            const last = lastDelivery(s)
            return (
              <Card key={s.id} component="article" aria-label={s.name} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" component="h2" noWrap>{s.name}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{[s.kind && t(s.kind), s.contact_name].filter(Boolean).join(' · ') || '—'}</Typography>
                  </Box>
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                    {!s.active && <Tag>{tc('supplier', 'Archived')}</Tag>}
                    <Tag>{tn(itemsOf(s).length, '{n} item', '{n} items')}</Tag>
                    {isAdmin ? (
                      <Tooltip title={s.starred ? t('Remove star') : t('Star')}>
                        <IconButton size="small" onClick={() => star(s)} aria-label={t('Star')} aria-pressed={s.starred} sx={{ color: s.starred ? STAR : tokens.inkFaint }}>
                          {s.starred ? <StarIcon sx={{ fontSize: 20 }} /> : <StarOutlineIcon sx={{ fontSize: 20 }} />}
                        </IconButton>
                      </Tooltip>
                    ) : s.starred && <StarIcon role="img" aria-label={tc('supplier', 'Starred')} sx={{ fontSize: 20, color: STAR }} />}
                  </Stack>
                </Stack>
                <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
                  {s.phone && <Button size="small" variant="outlined" startIcon={<PhoneIcon />} href={`tel:${s.phone.replace(/\s/g, '')}`}>{s.phone}</Button>}
                  {s.phone && s.whatsapp && <Button size="small" variant="outlined" startIcon={<WhatsAppIcon />} href={`https://wa.me/${s.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener">{'WhatsApp'}</Button>}
                  {s.email && <Button size="small" variant="outlined" startIcon={<EmailIcon />} href={`mailto:${s.email}`}>{t('Email')}</Button>}
                  {s.website && <Button size="small" variant="outlined" startIcon={<WebIcon />} href={s.website} target="_blank" rel="noopener">{t('Website')}</Button>}
                  {s.order_url && <Button size="small" variant="outlined" startIcon={<OrderIcon />} href={s.order_url} target="_blank" rel="noopener">{t('Order page')}</Button>}
                </Stack>
                <Typography variant="body2">
                  {s.order_days.length
                    ? t('Orders: {days}{cutoff} · delivery in {n} days', { days: days(s), cutoff: s.cutoff ? t(' by {time}', { time: s.cutoff }) : '', n: s.lead_days })
                    : t('No order days set')}
                </Typography>
                {next && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Next order: {day}', { day: formatLocal(`${next.date}T12:00:00Z`, 'EEE d MMM') })}</Typography>}
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {[s.minimum_order ? t('Minimum {amount}', { amount: formatMoney(s.minimum_order) }) : null, s.payment_terms,
                    s.account_number ? t('Customer no. {n}', { n: s.account_number }) : null,
                    last ? t('Last delivery {date}', { date: formatLocal(last, 'd MMM') }) : null].filter(Boolean).join(' · ')}
                </Typography>
                {s.address && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{s.address}</Typography>}
                {s.notes && <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>{s.notes}</Typography>}
                {isAdmin && <Box sx={{ mt: 'auto' }}><Link component="button" underline="hover" onClick={() => setOpen(s)} aria-label={t('Edit {name}', { name: s.name })}>{t('Edit')}</Link></Box>}
              </Card>
            )
          })}
        </Box>
      )}
      {open && <SupplierDialog supplier={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
    </>
  )
}

const blank = (): SupplierInput => ({ name: '', kind: null, contact_name: null, email: null, phone: null, whatsapp: false, website: null, order_url: null,
  address: null, account_number: null, order_days: [], cutoff: null, lead_days: 1, minimum_order: null, payment_terms: null, notes: null, active: true })

function SupplierDialog({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [s, setS] = useState<SupplierInput>(() => (supplier ? { ...supplier } : blank()))
  const [deleting, setDeleting] = useState(false)
  const set = (patch: Partial<SupplierInput>) => setS(x => ({ ...x, ...patch }))
  const text = (v: string | null | undefined) => v?.trim() || null
  const field = (k: keyof SupplierInput) => (s[k] === null || s[k] === undefined ? '' : String(s[k]))

  const save = () => run(async () => {
    if (!s.name.trim()) throw new Error(t('Give the supplier a name'))
    const email = text(s.email)
    if (email && !EMAIL.test(email)) throw new Error(t('Enter a full email address, like name@example.com'))
    for (const url of [text(s.website), text(s.order_url)]) if (url && !/^https?:\/\/\S+$/i.test(url)) throw new Error(t('The link needs to start with https://'))
    if (s.minimum_order !== null && s.minimum_order !== undefined && !(s.minimum_order >= 0)) throw new Error(t('Enter numbers like 12 or 1,45'))
    await api.saveSupplier({ ...s, name: s.name.trim(), email, website: text(s.website), order_url: text(s.order_url), phone: text(s.phone),
      contact_name: text(s.contact_name), kind: text(s.kind), address: text(s.address), account_number: text(s.account_number),
      payment_terms: text(s.payment_terms), notes: text(s.notes), order_days: sortDays(s.order_days ?? []), whatsapp: !!text(s.phone) && !!s.whatsapp })
    onClose()
  }, supplier ? t('Saved') : t('Added {name}', { name: s.name.trim() }))
  const archive = () => run(async () => { await api.saveSupplier({ ...supplier!, active: !supplier!.active }); onClose() },
    supplier?.active ? t('Archived {name}', { name: supplier.name }) : t('{name} is back', { name: supplier!.name }))
  const remove = () => run(async () => { await api.deleteSupplier(supplier!.id); onClose() }, t('Deleted {name}', { name: supplier!.name }))

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle>{supplier ? supplier.name : t('Add a supplier')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label={t('Name')} value={s.name} onChange={e => set({ name: e.target.value })} autoFocus={!supplier} slotProps={{ htmlInput: { maxLength: 120 } }} />
            <TextField select fullWidth label={t('Type')} value={field('kind')} onChange={e => set({ kind: e.target.value || null })}>
              <MenuItem value="">{'—'}</MenuItem>
              {[...new Set([...SUPPLIER_KINDS, ...(s.kind ? [s.kind] : [])])].map(k => <MenuItem key={k} value={k}>{t(k)}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField label={t('Who to talk to')} value={field('contact_name')} onChange={e => set({ contact_name: e.target.value })} slotProps={{ htmlInput: { maxLength: 100 } }} />
          <PhoneField label={t('Phone')} value={field('phone')} onChange={v => set({ phone: v })} />
          <FormControlLabel label={t('They take orders on WhatsApp')} control={<Checkbox checked={!!s.whatsapp} onChange={e => set({ whatsapp: e.target.checked })} />} />
          <TextField label={t('Email')} type="email" value={field('email')} onChange={e => set({ email: e.target.value })} slotProps={{ htmlInput: { maxLength: 254 } }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label={t('Website')} type="url" placeholder={'https://'} value={field('website')} onChange={e => set({ website: e.target.value })} />
            <TextField fullWidth label={t('Order page or trade portal')} type="url" placeholder={'https://'} value={field('order_url')} onChange={e => set({ order_url: e.target.value })} />
          </Stack>
          <TextField label={t('Address')} value={field('address')} onChange={e => set({ address: e.target.value })} slotProps={{ htmlInput: { maxLength: 300 } }} />
          <Box>
            <Typography variant="body2" sx={{ mb: 0.75 }}>{t('Days they take orders')}</Typography>
            <ToggleButtonGroup size="small" value={s.order_days ?? []} onChange={(_, v: DayKey[]) => set({ order_days: v })} aria-label={t('Days they take orders')} sx={{ flexWrap: 'wrap' }}>
              {DAY_KEYS.map(d => <ToggleButton key={d} value={d} aria-label={t(DAY_LABELS[d])}>{short(d)}</ToggleButton>)}
            </ToggleButtonGroup>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth type="time" label={t('Order by')} value={field('cutoff')} onChange={e => set({ cutoff: e.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField fullWidth label={t('Delivery (days)')} value={field('lead_days')} inputMode="numeric"
              onChange={e => set({ lead_days: Math.max(0, Math.min(60, Number(e.target.value.replace(/\D/g, '')) || 0)) })} />
            <TextField fullWidth label={t('Minimum order')} value={field('minimum_order')} inputMode="decimal"
              onChange={e => set({ minimum_order: e.target.value.trim() ? Number(e.target.value.replace(',', '.')) : null })}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">{'€'}</InputAdornment> } }} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label={t('Your customer number')} value={field('account_number')} onChange={e => set({ account_number: e.target.value })} slotProps={{ htmlInput: { maxLength: 60 } }} />
            <TextField fullWidth label={t('Payment terms')} value={field('payment_terms')} onChange={e => set({ payment_terms: e.target.value })} placeholder={t('e.g. 30 days')} slotProps={{ htmlInput: { maxLength: 120 } }} />
          </Stack>
          <TextField label={t('Notes')} value={field('notes')} onChange={e => set({ notes: e.target.value })} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 2000 } }} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {supplier && (deleting ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto' }}>
            <Typography variant="body2" sx={{ color: tokens.badFg }}>{t('Delete {name}? Its items stay, without a supplier.', { name: supplier.name })}</Typography>
            <Button size="small" color="error" variant="contained" onClick={remove}>{t('Delete')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </Stack>
        ) : <>
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleting(true)}>{t('Delete')}</Button>
          <Button onClick={archive} sx={{ mr: 'auto' }}>{supplier.active ? t('Archive') : t('Bring back')}</Button>
        </>)}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={save}>{supplier ? t('Save') : t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}
