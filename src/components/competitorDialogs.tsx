// The Competitors page's dialogs: add a place (found on Google, or by hand), change one, record the
// prices seen on a visit, choose what's compared (the basket), and write a note or an idea.
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, Link, List, ListItem,
  MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import SearchIcon from '@mui/icons-material/Search'
import { useState, type FormEvent } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { Empty } from './common'
import {
  BASKET, IDEA_STATUSES, KINDS, NOTE_KINDS, PRICE_SOURCES, THREATS, instagramHandle, matchRecipe, priceHistory, priceKey, priceLevelLabel,
  type Competitor, type CompetitorData, type CompetitorInput, type CompetitorNoteInput, type NearbyPlace, type PriceSource,
} from '../../shared/localCompetitors'
import { DAY_KEYS, type DayKey, type OpeningHours } from '../../shared/types'
import { addDays, formatLocal, formatMoney, formatNumber, today } from '../../shared/time'
import { msg, t, tn } from '../i18n'

const day = (d: string) => formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy')
const DAY_LABEL: Record<DayKey, string> = {
  mon: msg('Monday'), tue: msg('Tuesday'), wed: msg('Wednesday'), thu: msg('Thursday'), fri: msg('Friday'), sat: msg('Saturday'), sun: msg('Sunday'),
}

/** "350 m" or "1.2 km". */
export const distanceLabel = (m: number | null) =>
  m === null ? '' : m < 1000 ? t('{n} m', { n: Math.round(m / 10) * 10 }) : t('{n} km', { n: formatNumber(Math.round(m / 100) / 10) })
/** A rating with one decimal, in the person's decimal style. */
export const oneDecimal = (n: number) => (formatNumber(1.5).includes(',') ? n.toFixed(1).replace('.', ',') : n.toFixed(1))
export const stars = (r: number | null) => (r === null ? '–' : `${oneDecimal(r)}★`)
/** A place's name on the page: the business is "You". */
export const placeName = (c: Pick<Competitor, 'is_self' | 'name'>) => (c.is_self ? t('You') : c.name)

/** A place found on Google, with Follow. */
export function PlaceRow({ p, isNew, onFollow, onDismiss, onRestore }: {
  p: NearbyPlace; isNew?: boolean; onFollow: () => void; onDismiss?: () => void; onRestore?: () => void
}) {
  return (
    <ListItem disableGutters divider sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{p.name}</Typography>
          {isNew && <Typography variant="caption" sx={{ px: 0.75, borderRadius: 1, bgcolor: 'action.selected', fontWeight: 600 }}>{t('New')}</Typography>}
        </Stack>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
          {[distanceLabel(p.distance_m), p.rating !== null ? `${stars(p.rating)} (${tn(p.review_count ?? 0, '{n} review', '{n} reviews')})` : t('No rating yet'),
            priceLevelLabel(p.price_level) && t(priceLevelLabel(p.price_level)), p.address].filter(Boolean).join(' · ')}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1}>
        {p.maps_url && <Button size="small" component="a" href={p.maps_url} target="_blank" rel="noopener">{t('Map')}</Button>}
        {onDismiss && <Button size="small" onClick={onDismiss} aria-label={t('Not a competitor: {name}', { name: p.name })}>{t('Not a competitor')}</Button>}
        {onRestore && <Button size="small" onClick={onRestore} aria-label={t('Show {name} again', { name: p.name })}>{t('Show again')}</Button>}
        <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onFollow} aria-label={t('Follow {name}', { name: p.name })}>{t('Follow')}</Button>
      </Stack>
    </ListItem>
  )
}

/** Search Google by name, and follow what's found. */
export function PlaceSearch({ onFollow, autoFocus }: { onFollow: (p: NearbyPlace) => void; autoFocus?: boolean }) {
  const { api } = useApp()
  const [q, setQ] = useState('')
  const [found, setFound] = useState<NearbyPlace[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const search = async (e?: FormEvent) => {
    e?.preventDefault()
    setBusy(true); setError(null)
    try { setFound(await api.findPlaces(q)) } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  return (
    <Box component="form" onSubmit={search}>
      <TextField fullWidth autoFocus={autoFocus} label={t('Find a place on Google')} value={q} onChange={e => setQ(e.target.value)} placeholder={t('A name, or “brunch San Pedro”')}
        slotProps={{ input: { endAdornment: <InputAdornment position="end"><IconButton type="submit" disabled={busy || q.trim().length < 2} aria-label={t('Search')}><SearchIcon /></IconButton></InputAdornment> } }} />
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      {found && (found.length
        ? <List dense aria-label={t('Found on Google')}>{found.map(p => <PlaceRow key={p.place_id} p={p} onFollow={() => onFollow(p)} />)}</List>
        : <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>{t('Nothing on Google by that name.')}</Typography>)}
    </Box>
  )
}

/** Add a competitor: found on Google (everything filled in and kept up to date), or typed in. */
export function AddCompetitorDialog({ google, onClose, onByHand, onFollowed }: {
  google: boolean; onClose: () => void; onByHand: () => void; onFollowed: (id: string) => void
}) {
  const { api } = useApp()
  const run = useAction()
  const follow = async (p: NearbyPlace) => {
    let id = ''
    if (await run(async () => { id = await api.followPlace(p.place_id) }, t('Following {name}', { name: p.name }))) onFollowed(id)
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="add-competitor-title">
      <DialogTitle id="add-competitor-title">{t('Add a competitor')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {google
            ? <>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('Found on Google, its rating, price level, hours and what it offers are filled in, and checked again every week.')}
                </Typography>
                <PlaceSearch onFollow={p => void follow(p)} autoFocus />
              </>
            : <Alert severity="info">{t('Finding places on Google needs the Places key the Reviews page uses. Until then, add them by hand.')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onByHand} sx={{ mr: 'auto' }}>{t('Add it by hand')}</Button>
        <Button onClick={onClose}>{t('Close')}</Button>
      </DialogActions>
    </Dialog>
  )
}

const sameHours = (a: OpeningHours | null, b: OpeningHours | null) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {})

/** A competitor's details (or the business's own: no threat, its hours from Opening hours). */
export function CompetitorDialog({ competitor, google, onClose }: { competitor: CompetitorInput & Partial<Competitor>; google: boolean; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [c, setC] = useState(competitor)
  const [hours, setHours] = useState<OpeningHours>(competitor.hours ?? competitor.google_hours ?? {})
  const [linking, setLinking] = useState(false)
  const [sure, setSure] = useState(false)
  const set = (p: Partial<CompetitorInput>) => setC(x => ({ ...x, ...p }))
  const self = !!competitor.is_self
  const save = async () => {
    const typed = Object.values(hours).some(Boolean) && !sameHours(hours, competitor.google_hours ?? null) ? hours : null
    const { google_hours: _gh, google_features: _gf, google_rating: _gr, google_count: _gc, google_status: _gs, google_checked_at: _gk, created_at: _ca, is_self: _s, ...row } = c
    const ok = await run(async () => {
      if (!row.name?.trim()) throw new Error(t('Give it a name'))
      const instagram = instagramHandle(row.instagram)
      if (instagram === undefined) throw new Error(t('An Instagram handle has letters, numbers, dots and underscores only'))
      const site = row.website?.trim()
      const website = !site ? null : /^https?:\/\//i.test(site) ? site : `https://${site}`
      await api.saveCompetitor({ ...row, name: row.name.trim(), instagram, website, ...(self ? {} : { hours: typed }) })
    }, t('Saved'))
    if (ok) onClose()
  }
  const link = async (p: NearbyPlace) => { if (await run(() => api.followPlace(p.place_id, c.id), t('Linked to Google'))) onClose() }
  const refresh = async () => { if (c.id) await run(() => api.refreshCompetitor(c.id!), t('Updated from Google')) }
  const remove = async () => { if (c.id && await run(() => api.deleteCompetitor(c.id!), t('Removed'))) onClose() }
  const setDay = (d: DayKey, v: { open: string; close: string } | null) => setHours(h => ({ ...h, [d]: v }))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="competitor-title">
      <DialogTitle id="competitor-title">{c.id ? (self ? t('Your café') : c.name) : t('Add a competitor')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!self && <TextField label={t('Name')} value={c.name} onChange={e => set({ name: e.target.value })} required />}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('Kind')} value={c.kind ?? 'cafe'} onChange={e => set({ kind: e.target.value as Competitor['kind'] })} sx={{ flex: 1 }}>
              {KINDS.map(k => <MenuItem key={k.id} value={k.id}>{t(k.label)}</MenuItem>)}
            </TextField>
            {!self && (
              <TextField select label={t('How much it competes')} value={c.threat ?? 'medium'} onChange={e => set({ threat: e.target.value as Competitor['threat'] })} sx={{ flex: 1 }}>
                {THREATS.map(x => <MenuItem key={x.id} value={x.id}>{t(x.label)}</MenuItem>)}
              </TextField>
            )}
            <TextField select label={t('Price level')} value={c.price_level ?? ''} onChange={e => set({ price_level: e.target.value === '' ? null : Number(e.target.value) })}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} sx={{ flex: 1 }}>
              <MenuItem value="">{t('Not known')}</MenuItem>
              {[1, 2, 3, 4].map(n => <MenuItem key={n} value={n}>{priceLevelLabel(n)}</MenuItem>)}
            </TextField>
          </Stack>
          {!self && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label={t('Address')} value={c.address ?? ''} onChange={e => set({ address: e.target.value })} sx={{ flex: 2 }} />
              <TextField label={t('Distance (m)')} type="number" value={c.distance_m ?? ''} onChange={e => set({ distance_m: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })}
                sx={{ flex: 1 }} helperText={c.place_id ? t('From Google') : undefined} />
            </Stack>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Website')} value={c.website ?? ''} onChange={e => set({ website: e.target.value || null })} placeholder={'https://'} sx={{ flex: 1 }} />
            <TextField label={t('Instagram')} value={c.instagram ?? ''} onChange={e => set({ instagram: e.target.value || null })} placeholder={'@'} sx={{ flex: 1 }} />
          </Stack>
          <TextField label={t('What they do well')} value={c.strengths ?? ''} multiline minRows={2} onChange={e => set({ strengths: e.target.value })} />
          <TextField label={t('Where they fall short')} value={c.weaknesses ?? ''} multiline minRows={2} onChange={e => set({ weaknesses: e.target.value })} />
          <TextField label={t('Notes')} value={c.notes ?? ''} multiline minRows={2} onChange={e => set({ notes: e.target.value })} />
          {self
            ? <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Your opening hours come from the Opening hours page, and your prices from Menu costing.')}</Typography>
            : (
              <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
                <Typography component="legend" variant="subtitle2" sx={{ mb: 1 }}>{t('Opening hours')}</Typography>
                {competitor.google_hours && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>{t('From Google unless you change them here.')}</Typography>}
                <Stack spacing={1}>
                  {DAY_KEYS.map(d => {
                    const h = hours[d]
                    return (
                      <Stack key={d} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography variant="body2" sx={{ width: 84 }}>{t(DAY_LABEL[d])}</Typography>
                        <FormControlLabel sx={{ mr: 0 }} control={<Checkbox size="small" checked={!!h} onChange={e => setDay(d, e.target.checked ? { open: '08:00', close: '18:00' } : null)} />}
                          label={<Typography variant="body2">{h ? t('Open') : t('Closed')}</Typography>} />
                        {h && <>
                          <TextField size="small" type="time" value={h.open} onChange={e => setDay(d, { ...h, open: e.target.value })} slotProps={{ htmlInput: { 'aria-label': t('{day} opens', { day: t(DAY_LABEL[d]) }) } }} />
                          <TextField size="small" type="time" value={h.close} onChange={e => setDay(d, { ...h, close: e.target.value })} slotProps={{ htmlInput: { 'aria-label': t('{day} closes', { day: t(DAY_LABEL[d]) }) } }} />
                        </>}
                      </Stack>
                    )
                  })}
                </Stack>
              </Box>
            )}
          {google && c.id && !c.place_id && !self && (linking
            ? <PlaceSearch onFollow={p => void link(p)} autoFocus />
            : <Button startIcon={<SearchIcon />} onClick={() => setLinking(true)} sx={{ alignSelf: 'flex-start' }}>{t('Find it on Google')}</Button>)}
          {google && c.id && (c.place_id || self) && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Button onClick={() => void refresh()}>{t('Update from Google')}</Button>
              {competitor.maps_url && <Link href={competitor.maps_url} target="_blank" rel="noopener" variant="body2">{t('Open on Google Maps')}</Link>}
            </Stack>
          )}
          {sure && <Alert severity="warning">{t('Its prices, notes and ratings go too. To keep them, stop following it instead.')}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {c.id && !self && <Button color="error" onClick={() => (sure ? void remove() : setSure(true))}>{sure ? t('Remove for good') : t('Remove')}</Button>}
        {c.id && !self && <Button onClick={() => set({ active: !(c.active ?? true) })}>{c.active === false ? t('Follow again') : t('Stop following')}</Button>}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Prices seen at one place (or the business's own, for what isn't on Menu costing), all items at once: what a visit gives. */
export function PricesDialog({ data, start, onClose }: { data: CompetitorData; start: { competitor_id?: string; item_id?: string }; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const places = [...data.competitors.filter(c => !c.is_self && c.active).sort((a, b) => a.name.localeCompare(b.name)), ...data.competitors.filter(c => c.is_self)]
  const [who, setWho] = useState(start.competitor_id ?? places[0]?.id ?? '')
  const [on, setOn] = useState(today())
  const [source, setSource] = useState<PriceSource>('visit')
  const [note, setNote] = useState('')
  const [typed, setTyped] = useState<Record<string, string>>({})
  const history = priceHistory(data.prices)
  const items = [...data.items].sort((a, b) => a.sort - b.sort)
  const save = async () => {
    const entries = Object.entries(typed).filter(([, v]) => v.trim() !== '')
    const ok = await run(async () => {
      if (!who) throw new Error(t('Choose the place first'))
      if (!entries.length) throw new Error(t('Type at least one price'))
      for (const [, v] of entries) if (!(Number(v.replace(',', '.')) >= 0)) throw new Error(t('Enter the price in euros'))
      for (const [item_id, v] of entries) await api.recordPrice({ competitor_id: who, item_id, price: Number(v.replace(',', '.')), observed_on: on, source, note: note.trim() || null })
    }, tn(entries.length, '{n} price saved', '{n} prices saved'))
    if (ok) onClose()
  }
  const remove = async (id: string) => { await run(() => api.deletePrice(id), t('Price removed')) }
  const self = data.competitors.find(c => c.id === who)?.is_self
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="prices-title">
      <DialogTitle id="prices-title">{t('Record prices')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('Where')} value={who} onChange={e => { setWho(e.target.value); setTyped({}) }} sx={{ flex: 2 }}>
              {places.map(c => <MenuItem key={c.id} value={c.id}>{placeName(c)}</MenuItem>)}
            </TextField>
            <TextField label={t('Seen on')} type="date" value={on} onChange={e => setOn(e.target.value || today())} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: addDays(today(), 1) } }} sx={{ flex: 1, minWidth: 165 }} />
            <TextField select label={t('Source')} value={source} onChange={e => setSource(e.target.value as PriceSource)} sx={{ flex: 1 }}>
              {PRICE_SOURCES.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
            </TextField>
          </Stack>
          {self && <Alert severity="info">{t('Your own prices come from Menu costing for items linked to it: type yours here only for the rest.')}</Alert>}
          {items.length === 0
            ? <Empty>{t('Choose what to compare first (Basket).')}</Empty>
            : <Stack spacing={1}>
                {items.map(i => {
                  const [last] = history.get(priceKey(who, i.id)) ?? []
                  const linked = self && i.recipe_id
                  return (
                    <Stack key={i.id} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2">{i.name}</Typography>
                        {last && (
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {t('Last: {price} on {date}', { price: formatMoney(last.price), date: day(last.observed_on) })}
                            <IconButton size="small" onClick={() => void remove(last.id)} aria-label={t('Remove the price of {item} seen on {date}', { item: i.name, date: day(last.observed_on) })}>
                              <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Typography>
                        )}
                        {linked && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{t('From Menu costing')}</Typography>}
                      </Box>
                      <TextField size="small" label={t('Price')} value={typed[i.id] ?? ''} disabled={!!linked} autoFocus={i.id === start.item_id}
                        onChange={e => setTyped(x => ({ ...x, [i.id]: e.target.value }))} sx={{ width: 120 }}
                        slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': t('Price of {item}', { item: i.name }) }, input: { startAdornment: <InputAdornment position="start">{'€'}</InputAdornment> } }} />
                    </Stack>
                  )
                })}
              </Stack>}
          <TextField label={t('Note')} value={note} onChange={e => setNote(e.target.value)} placeholder={t('e.g. a bigger cup, oat milk included')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** What's compared everywhere, each item linked to the business's own menu item for its price. */
export function BasketDialog({ data, recipes, onClose }: { data: CompetitorData; recipes: { id: string; name: string; active: boolean }[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [name, setName] = useState('')
  const items = [...data.items].sort((a, b) => a.sort - b.sort)
  const next = () => Math.max(0, ...items.map(i => i.sort)) + 1
  const have = new Set(items.map(i => i.name.toLowerCase()))
  const missing = BASKET.map(b => t(b)).filter(b => !have.has(b.toLowerCase()))
  const menu = recipes.filter(r => r.active).sort((a, b) => a.name.localeCompare(b.name))
  const add = async (e?: FormEvent) => {
    e?.preventDefault()
    const n = name.trim()
    if (n && await run(() => api.savePriceItem({ name: n, recipe_id: matchRecipe(n, recipes)?.id ?? null, sort: next() }), t('Added'))) setName('')
  }
  const usual = () => run(async () => {
    let sort = next()
    for (const b of missing) await api.savePriceItem({ name: b, recipe_id: matchRecipe(b, recipes)?.id ?? null, sort: sort++ })
  }, tn(missing.length, '{n} item added', '{n} items added'))
  // Your own menu items not compared yet, each linked to itself so your price comes from Menu costing.
  const linked = new Set(items.map(i => i.recipe_id).filter(Boolean))
  const notCompared = menu.filter(r => !linked.has(r.id) && !have.has(r.name.toLowerCase()))
  const addMenu = () => run(async () => {
    let sort = next()
    for (const r of notCompared) await api.savePriceItem({ name: r.name, recipe_id: r.id, sort: sort++ })
  }, tn(notCompared.length, '{n} item added', '{n} items added'))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="basket-title">
      <DialogTitle id="basket-title">{t('Basket')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {t('What’s compared at every place. Link each one to your own menu item and your price comes from Menu costing.')}
        </Typography>
        <Stack spacing={1.5}>
          {items.map(i => (
            <Stack key={i.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
              <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>{i.name}</Typography>
              <TextField select size="small" label={t('Your menu item')} value={i.recipe_id ?? ''} sx={{ minWidth: 200 }}
                onChange={e => void run(() => api.savePriceItem({ id: i.id, name: i.name, recipe_id: e.target.value || null }))}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
                <MenuItem value="">{t('Not on my menu')}</MenuItem>
                {menu.map(r => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
              </TextField>
              <IconButton size="small" onClick={() => void run(() => api.deletePriceItem(i.id), t('Removed'))} aria-label={t('Remove {name}', { name: i.name })}><DeleteIcon fontSize="small" /></IconButton>
            </Stack>
          ))}
        </Stack>
        <Stack component="form" onSubmit={add} direction="row" spacing={1} sx={{ mt: 2 }}>
          <TextField size="small" label={t('Add an item')} value={name} onChange={e => setName(e.target.value)} sx={{ flex: 1 }} placeholder={t('e.g. Pumpkin spice latte')} />
          <Button type="submit" startIcon={<AddIcon />} disabled={!name.trim()}>{t('Add')}</Button>
        </Stack>
        {notCompared.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{t('On your menu and not compared yet: {list}.', { list: notCompared.map(r => r.name).join(', ') })}</Typography>
            <Button variant="outlined" size="small" onClick={() => void addMenu()}>{t('Compare my menu items')}</Button>
          </Box>
        )}
        {missing.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{t('Usual for a café in Spain: {list}.', { list: missing.join(', ') })}</Typography>
            <Button variant="outlined" size="small" onClick={() => void usual()}>{items.length ? t('Add the rest of the usual basket') : t('Add the usual basket')}</Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{t('Done')}</Button></DialogActions>
    </Dialog>
  )
}

/** Something seen or heard, or an idea worth borrowing, about one place or the area as a whole. */
export function NoteDialog({ note, data, onClose }: { note: CompetitorNoteInput; data: CompetitorData; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [n, setN] = useState(note)
  const set = (p: Partial<CompetitorNoteInput>) => setN(x => ({ ...x, ...p }))
  const places = data.competitors.filter(c => !c.is_self && (c.active || c.id === note.competitor_id)).sort((a, b) => a.name.localeCompare(b.name))
  const save = async () => {
    const ok = await run(async () => {
      if (!n.text.trim()) throw new Error(t('Write the note first'))
      await api.saveCompetitorNote({ ...n, text: n.text.trim(), status: n.kind === 'idea' ? n.status ?? 'new' : null })
    }, t('Saved'))
    if (ok) onClose()
  }
  const remove = async () => { if (n.id && await run(() => api.deleteCompetitorNote(n.id!), t('Note removed'))) onClose() }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="note-title">
      <DialogTitle id="note-title">{n.id ? t('Note') : n.kind === 'idea' ? t('An idea to borrow') : t('Add a note')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('About')} value={n.competitor_id ?? ''} onChange={e => set({ competitor_id: e.target.value || null })} sx={{ flex: 2 }}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
              <MenuItem value="">{t('The area as a whole')}</MenuItem>
              {places.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
            <TextField select label={t('Kind')} value={n.kind} onChange={e => set({ kind: e.target.value as CompetitorNoteInput['kind'] })} sx={{ flex: 1 }}>
              {NOTE_KINDS.map(k => <MenuItem key={k.id} value={k.id}>{t(k.label)}</MenuItem>)}
            </TextField>
            <TextField label={t('Date')} type="date" value={n.observed_on} onChange={e => set({ observed_on: e.target.value || today() })} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1, minWidth: 165 }} />
          </Stack>
          <TextField label={n.kind === 'idea' ? t('The idea') : t('What you saw or heard')} value={n.text} onChange={e => set({ text: e.target.value })} multiline minRows={3} required autoFocus />
          {n.kind === 'idea' && (
            <TextField select label={t('Where it’s got to')} value={n.status ?? 'new'} onChange={e => set({ status: e.target.value as CompetitorNoteInput['status'] })}>
              {IDEA_STATUSES.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
            </TextField>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {n.id && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
