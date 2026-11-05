// Coffees (Menu section): the coffees in use, bag by bag: where each is from, its roaster, roast and
// process, how it tastes, what it's brewed as, what a bag costs, and a photo of the bag. Each theme day
// on the Calendar serves one of them. Everyone on the team reads it; admins add and change them.
// Under them, the coffee suppliers (from Suppliers): how to reach and order from each roaster, the
// coffees it roasts, and, for admins, how to pay it by bank transfer.
import {
  Autocomplete, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, InputAdornment, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PhoneIcon from '@mui/icons-material/PhoneOutlined'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import EmailIcon from '@mui/icons-material/EmailOutlined'
import WebIcon from '@mui/icons-material/LanguageOutlined'
import OrderIcon from '@mui/icons-material/ShoppingCartOutlined'
import PhotoIcon from '@mui/icons-material/AddAPhotoOutlined'
import { useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, Tag } from '../components/common'
import { CoffeePhoto, ServedOn, brewLabel, countryName, originOf, processLabel, roastLabel, useCoffees, useThemeDays } from '../components/ThemeDays'
import {
  BREWS, COFFEE_COUNTRIES, COFFEE_LIMITS, PROCESSES, ROASTS, coffeeProblem, coffeeSuppliers, coffeesFrom, flagOf, pricePerKg, sortCoffees,
  type BrewUse, type Coffee, type CoffeeInput, type CoffeeProcess, type RoastLevel, type ThemeDays,
} from '../../shared/themeDays'
import type { Supplier } from '../../shared/stock'
import { BankDetails, CopyIban, SupplierDialog } from './SuppliersPage'
import { currencySymbol, formatMoney } from '../../shared/time'
import { tokens } from '../theme'
import { t } from '../i18n'

/** A photo of the bag from the phone or computer: cut to a bag's shape (4:5) from the middle and made small, as a JPEG data: URL. */
async function bagPhoto(file: File, width = 600): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(t('That isn’t a photo'))
  if (file.size > 25_000_000) throw new Error(t('That photo is over 25 MB. Try a smaller one.'))
  const img = await createImageBitmap(file).catch(() => { throw new Error(t('That photo can’t be read here. Use a JPEG or PNG.')) })
  // The biggest 4:5 piece that fits, from the middle.
  const sw = Math.min(img.width, img.height * 0.8)
  const sh = sw / 0.8
  const w = Math.round(Math.min(width, sw))
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: Math.round(w / 0.8) })
  canvas.getContext('2d')!.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height)
  img.close()
  const url = canvas.toDataURL('image/jpeg', 0.85)
  if (url.length > COFFEE_LIMITS.photo) throw new Error(t('That photo is over 25 MB. Try a smaller one.'))
  return url
}

/** A button that picks a photo of the bag and hands it over ready to keep. */
function BagPhotoPicker({ label, inputLabel, onPhoto, variant = 'outlined' }: { label: string; inputLabel: string; onPhoto: (url: string) => void; variant?: 'outlined' | 'text' }) {
  const file = useRef<HTMLInputElement>(null)
  const run = useAction()
  return (
    <>
      <Button size="small" variant={variant} startIcon={<PhotoIcon />} onClick={() => file.current?.click()}>{label}</Button>
      <input ref={file} type="file" accept="image/*" hidden aria-label={inputLabel} onChange={e => {
        const f = e.target.files?.[0]
        e.target.value = ''
        if (f) void run(async () => onPhoto(await bagPhoto(f)))
      }} />
    </>
  )
}

/** "€11.50 for 250 g · €46.00/kg". */
function priceLine(c: Coffee) {
  const kg = pricePerKg(c)
  const bag = c.bag_price != null ? (c.bag_grams ? t('{price} for {grams} g', { price: formatMoney(c.bag_price), grams: c.bag_grams }) : formatMoney(c.bag_price))
    : c.bag_grams ? t('{grams} g bags', { grams: c.bag_grams }) : null
  return [bag, kg != null ? t('{price}/kg', { price: formatMoney(kg) }) : null].filter(Boolean).join(' · ')
}

export function CoffeesPage() {
  const { api, isAdmin } = useApp()
  const coffees = useCoffees()
  const days = useThemeDays()
  const suppliers = useAsync('suppliers', () => api.suppliers(), [])
  const [editing, setEditing] = useState<Coffee | 'new' | null>(null)
  const [supplier, setSupplier] = useState<Supplier | 'new' | null>(null)
  const list = sortCoffees(coffees.data ?? [])
  const roasters = coffeeSuppliers(suppliers.data ?? [], list)
  const inUse = list.filter(c => c.active)
  const retired = list.filter(c => !c.active)
  return (
    <>
      <PageHeader eyebrow={t('Menu')} title={t('Coffees')}
        actions={isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')}>{t('Add a coffee')}</Button>} />
      <ErrorBox error={coffees.error} />
      <Typography sx={{ mb: 2.5, maxWidth: 760 }}>
        {t('The coffees in use, bag by bag: where each is from, how it’s roasted and how it tastes. Each theme day on the Calendar serves one of them.')}
      </Typography>
      {coffees.data && inUse.length === 0 && <Empty>{isAdmin ? t('No coffees yet. Add the bags you use, with a photo of each.') : t('No coffees yet.')}</Empty>}
      <Box role="list" aria-label={t('Coffees in use')} sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' } }}>
        {inUse.map(c => <CoffeeCard key={c.id} coffee={c} days={days.data} onEdit={() => setEditing(c)} />)}
      </Box>
      {(roasters.length > 0 || (isAdmin && suppliers.data)) && (
        <Box component="section" aria-label={t('Coffee suppliers')} sx={{ mt: 4 }}>
          <SectionTitle action={isAdmin && <Button size="small" startIcon={<AddIcon />} onClick={() => setSupplier('new')}>{t('Add a roaster')}</Button>}>
            {t('Coffee suppliers')}
          </SectionTitle>
          {roasters.length === 0 ? <Empty>{t('Add the roasters you buy from, with how to order and pay. A coffee whose roaster is one of them shows on its card.')}</Empty> : (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' } }}>
              {roasters.map(s => <CoffeeSupplierCard key={s.id} supplier={s} coffees={list} onEdit={() => setSupplier(s)} />)}
            </Box>
          )}
        </Box>
      )}
      {retired.length > 0 && (
        <Box component="section" aria-label={t('Not in use')} sx={{ mt: 4 }}>
          <SectionTitle>{t('Not in use')}</SectionTitle>
          <Box role="list" aria-label={t('Not in use')} sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' } }}>
            {retired.map(c => <CoffeeCard key={c.id} coffee={c} days={days.data} onEdit={() => setEditing(c)} />)}
          </Box>
        </Box>
      )}
      {editing && <CoffeeDialog coffee={editing === 'new' ? undefined : editing} coffees={list} roasters={roasters.map(s => s.name)} onClose={() => setEditing(null)} />}
      {supplier && <SupplierDialog supplier={supplier === 'new' ? null : supplier} start={{ kind: 'Coffee roaster', supplies: ['coffee'] }} onClose={() => setSupplier(null)} />}
    </>
  )
}

function CoffeeCard({ coffee: c, days, onEdit }: { coffee: Coffee; days: ThemeDays | null; onEdit: () => void }) {
  const { api, isAdmin } = useApp()
  const run = useAction()
  const tags = [roastLabel(c), processLabel(c), brewLabel(c)].filter((x): x is string => !!x)
  const price = priceLine(c)
  return (
    <Card role="listitem" aria-label={c.name} sx={{ opacity: c.active ? 1 : 0.7 }}>
      <CardContent sx={{ display: 'flex', gap: 2 }}>
        <CoffeePhoto coffee={c} size={96} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h6" component="h3" sx={{ lineHeight: 1.3 }}>{c.name}</Typography>
          {(c.country || c.region) && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{originOf(c)}</Typography>}
          {c.roaster && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Roasted by {roaster}', { roaster: c.roaster })}</Typography>}
          <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', my: 1 }}>
            {tags.map(x => <Tag key={x}>{x}</Tag>)}
            {!c.active && <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Not in use')}</Tag>}
          </Stack>
          {c.tasting_notes && <Typography variant="body2" sx={{ fontStyle: 'italic' }}>{c.tasting_notes}</Typography>}
          {price && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{price}</Typography>}
          <Box sx={{ mt: 1 }}><ServedOn coffee={c} days={days} /></Box>
          {isAdmin && (
            <Stack direction="row" sx={{ gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
              <BagPhotoPicker variant="text" label={c.photo ? t('Change photo') : t('Add photo')} inputLabel={t('Photo of {name}', { name: c.name })}
                onPhoto={photo => run(() => api.saveCoffee({ id: c.id, name: c.name, photo }), t('Photo saved'))} />
              <Button size="small" onClick={onEdit}>{t('Edit')}</Button>
            </Stack>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}

/** A roaster the coffees come from: how to reach and order from them, their coffees, and (admins) how to pay them. */
function CoffeeSupplierCard({ supplier: s, coffees, onEdit }: { supplier: Supplier; coffees: Coffee[]; onEdit: () => void }) {
  const { isAdmin, canSeeFinances } = useApp()
  const theirs = coffeesFrom(s, coffees)
  return (
    <Card component="article" aria-label={s.name} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box>
        <Typography variant="h6" component="h3" sx={{ lineHeight: 1.3 }}>{s.name}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{[s.kind && t(s.kind), s.legal_name, s.contact_name].filter(Boolean).join(' · ') || t('Coffee')}</Typography>
        {s.address && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{s.address}</Typography>}
      </Box>
      <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
        {s.website && <Button size="small" variant="outlined" startIcon={<WebIcon />} href={s.website} target="_blank" rel="noopener">{t('Website')}</Button>}
        {s.order_url && <Button size="small" variant="outlined" startIcon={<OrderIcon />} href={s.order_url} target="_blank" rel="noopener">{t('Order page')}</Button>}
        {s.phone && <Button size="small" variant="outlined" startIcon={<PhoneIcon />} href={`tel:${s.phone.replace(/\s/g, '')}`}>{s.phone}</Button>}
        {s.phone && s.whatsapp && <Button size="small" variant="outlined" startIcon={<WhatsAppIcon />} href={`https://wa.me/${s.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener">{'WhatsApp'}</Button>}
        {s.email && <Button size="small" variant="outlined" startIcon={<EmailIcon />} href={`mailto:${s.email}`}>{t('Email')}</Button>}
      </Stack>
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('Their coffees')}</Typography>
        {theirs.length ? (
          <Stack direction="row" component="ul" aria-label={t('Coffees from {name}', { name: s.name })} sx={{ gap: 0.5, flexWrap: 'wrap', listStyle: 'none', p: 0, m: 0, mt: 0.5 }}>
            {theirs.map(c => (
              <Box component="li" key={c.id}>
                <Tag fg={c.active ? tokens.matchaDeep : undefined} bg={c.active ? tokens.matchaSoft : undefined}>{`${flagOf(c.country)} ${c.name}`.trim()}</Tag>
              </Box>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('None yet. Name them as the roaster on a coffee.')}</Typography>
        )}
      </Box>
      {s.payment_terms && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Paying: {terms}', { terms: s.payment_terms })}</Typography>}
      {(isAdmin || canSeeFinances) && (s.iban || s.legal_name) && (
        <Box role="group" aria-label={t('Bank details of {name}', { name: s.name })} sx={{ p: 1.25, borderRadius: 2, bgcolor: tokens.neutralBg }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('Bank details')}</Typography>
            {s.iban && <CopyIban supplier={s} labelled />}
          </Stack>
          <BankDetails supplier={s} />
        </Box>
      )}
      {s.notes && <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>{s.notes}</Typography>}
      {isAdmin && <Box sx={{ mt: 'auto' }}><Button size="small" onClick={onEdit} aria-label={t('Edit {name}', { name: s.name })}>{t('Edit')}</Button></Box>}
    </Card>
  )
}

/** Add a coffee or change one. */
function CoffeeDialog({ coffee, coffees, roasters, onClose }: { coffee?: Coffee; coffees: Coffee[]; roasters: string[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [f, setF] = useState<CoffeeInput>(coffee ?? { name: '', country: null, region: '', roaster: '', roast: null, process: null, tasting_notes: '', brew: 'both',
    bag_grams: null, bag_price: null, active: true, photo: null })
  const set = (p: Partial<CoffeeInput>) => setF(x => ({ ...x, ...p }))
  const countries = [...COFFEE_COUNTRIES].map(code => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name))
  const number = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
  const save = () => run(async () => {
    const next = { ...f, name: (f.name ?? '').trim() }
    const problem = coffeeProblem(next)
    if (problem) throw new Error(t(problem))
    if (coffees.some(x => x.id !== coffee?.id && x.name.toLowerCase() === next.name.toLowerCase())) throw new Error(t('There’s already a coffee called {name}', { name: next.name }))
    await api.saveCoffee({ ...next, id: coffee?.id })
    onClose()
  }, coffee ? t('Saved') : t('{name} added', { name: (f.name ?? '').trim() }))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{coffee ? coffee.name : t('Add a coffee')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <CoffeePhoto coffee={{ name: (f.name ?? '').trim() || t('This coffee'), photo: f.photo ?? null, country: f.country ?? null }} size={88} />
            <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
              <BagPhotoPicker label={f.photo ? t('Change photo') : t('Add photo')} inputLabel={t('Bag photo file')} onPhoto={photo => set({ photo })} />
              {f.photo && <Button size="small" onClick={() => set({ photo: null })}>{t('Remove photo')}</Button>}
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('A photo of the bag, so everyone knows it on the shelf.')}</Typography>
            </Stack>
          </Stack>
          <TextField label={t('Name')} value={f.name} onChange={e => set({ name: e.target.value })} autoFocus={!coffee}
            placeholder={t('Colombia Huila')} slotProps={{ htmlInput: { maxLength: COFFEE_LIMITS.name } }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField select label={t('Origin')} slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} value={f.country ?? ''} onChange={e => set({ country: e.target.value || null })} sx={{ flex: 1 }}>
              <MenuItem value="">{t('A blend from several countries')}</MenuItem>
              {countries.map(c => <MenuItem key={c.code} value={c.code}>{flagOf(c.code)} {c.name}</MenuItem>)}
            </TextField>
            <TextField label={t('Region or farm (optional)')} value={f.region ?? ''} onChange={e => set({ region: e.target.value })} sx={{ flex: 1 }}
              slotProps={{ htmlInput: { maxLength: COFFEE_LIMITS.region } }} />
          </Stack>
          <Autocomplete freeSolo options={roasters} inputValue={f.roaster ?? ''} onInputChange={(_, v) => set({ roaster: v })}
            renderInput={p => <TextField {...p} label={t('Roaster (optional)')} slotProps={{ ...p.slotProps, htmlInput: { ...p.slotProps.htmlInput, maxLength: COFFEE_LIMITS.roaster } }} />} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField select label={t('Roast')} slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} value={f.roast ?? ''} onChange={e => set({ roast: (e.target.value || null) as RoastLevel | null })} sx={{ flex: 1 }}>
              <MenuItem value="">{t('Not said')}</MenuItem>
              {ROASTS.map(r => <MenuItem key={r.id} value={r.id}>{t(r.label)}</MenuItem>)}
            </TextField>
            <TextField select label={t('Process')} slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} value={f.process ?? ''} onChange={e => set({ process: (e.target.value || null) as CoffeeProcess | null })} sx={{ flex: 1 }}>
              <MenuItem value="">{t('Not said')}</MenuItem>
              {PROCESSES.map(p => <MenuItem key={p.id} value={p.id}>{t(p.label)}</MenuItem>)}
            </TextField>
            <TextField select label={t('Brewed as')} value={f.brew ?? 'both'} onChange={e => set({ brew: e.target.value as BrewUse })} sx={{ flex: 1 }}>
              {BREWS.map(b => <MenuItem key={b.id} value={b.id}>{t(b.label)}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField label={t('Tasting notes (optional)')} value={f.tasting_notes ?? ''} onChange={e => set({ tasting_notes: e.target.value })}
            placeholder={t('Caramel, red apple, chocolate')} slotProps={{ htmlInput: { maxLength: COFFEE_LIMITS.tasting_notes } }} />
          <Stack direction="row" spacing={1.5}>
            <TextField label={t('Bag size (optional)')} type="number" value={f.bag_grams ?? ''} onChange={e => set({ bag_grams: number(e.target.value) })} sx={{ flex: 1 }}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">{'g'}</InputAdornment> }, htmlInput: { min: 1, step: 1 } }} />
            <TextField label={t('Price a bag (optional)')} type="number" value={f.bag_price ?? ''} onChange={e => set({ bag_price: number(e.target.value) })} sx={{ flex: 1 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">{currencySymbol()}</InputAdornment> }, htmlInput: { min: 0, step: 0.01 } }} />
          </Stack>
          <FormControlLabel control={<Switch checked={f.active !== false} onChange={e => set({ active: e.target.checked })} />} label={t('In use')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {coffee && <Button color="error" sx={{ mr: 'auto' }} onClick={() => run(async () => { await api.deleteCoffee(coffee.id); onClose() }, t('{name} removed', { name: coffee.name }))}>
          {t('Remove')}
        </Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!f.name?.trim()} onClick={save}>{coffee ? t('Save') : t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}
