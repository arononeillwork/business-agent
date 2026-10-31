// Coffees (Menu section): the coffees in use, bag by bag: where each is from, its roaster, roast and
// process, how it tastes, what it's brewed as, what a bag costs, and a photo of the bag. Each theme day
// on the Calendar serves one of them. Everyone on the team reads it; admins add and change them.
import {
  Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, InputAdornment, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PhotoIcon from '@mui/icons-material/AddAPhotoOutlined'
import { useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, Tag } from '../components/common'
import { CoffeePhoto, ServedOn, brewLabel, countryName, originOf, processLabel, roastLabel, useCoffees, useThemeDays } from '../components/ThemeDays'
import {
  BREWS, COFFEE_COUNTRIES, COFFEE_LIMITS, PROCESSES, ROASTS, coffeeProblem, flagOf, pricePerKg, sortCoffees,
  type BrewUse, type Coffee, type CoffeeInput, type CoffeeProcess, type RoastLevel, type ThemeDays,
} from '../../shared/themeDays'
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
  const { isAdmin } = useApp()
  const coffees = useCoffees()
  const days = useThemeDays()
  const [editing, setEditing] = useState<Coffee | 'new' | null>(null)
  const list = sortCoffees(coffees.data ?? [])
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
      {retired.length > 0 && (
        <Box component="section" aria-label={t('Not in use')} sx={{ mt: 4 }}>
          <SectionTitle>{t('Not in use')}</SectionTitle>
          <Box role="list" aria-label={t('Not in use')} sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' } }}>
            {retired.map(c => <CoffeeCard key={c.id} coffee={c} days={days.data} onEdit={() => setEditing(c)} />)}
          </Box>
        </Box>
      )}
      {editing && <CoffeeDialog coffee={editing === 'new' ? undefined : editing} coffees={list} onClose={() => setEditing(null)} />}
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

/** Add a coffee or change one. */
function CoffeeDialog({ coffee, coffees, onClose }: { coffee?: Coffee; coffees: Coffee[]; onClose: () => void }) {
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
          <TextField label={t('Roaster (optional)')} value={f.roaster ?? ''} onChange={e => set({ roaster: e.target.value })}
            slotProps={{ htmlInput: { maxLength: COFFEE_LIMITS.roaster } }} />
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
