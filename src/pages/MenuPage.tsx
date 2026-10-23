import {
  Alert, Autocomplete, Box, Button, Card, CardActionArea, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  InputAdornment, MenuItem, Stack, Switch, Tab, Tabs, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import SearchIcon from '@mui/icons-material/Search'
import UpIcon from '@mui/icons-material/KeyboardArrowUpRounded'
import DownIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import StarIcon from '@mui/icons-material/StarRounded'
import CoffeeIcon from '@mui/icons-material/LocalCafeOutlined'
import TeaIcon from '@mui/icons-material/EmojiFoodBeverageOutlined'
import ColdIcon from '@mui/icons-material/LocalDrinkOutlined'
import BakeryIcon from '@mui/icons-material/BakeryDiningOutlined'
import FoodIcon from '@mui/icons-material/RestaurantOutlined'
import ShopIcon from '@mui/icons-material/ShoppingBagOutlined'
import LinkIcon from '@mui/icons-material/LinkRounded'
import AiIcon from '@mui/icons-material/AutoAwesomeOutlined'
import WarningIcon from '@mui/icons-material/WarningAmberRounded'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton, toEnter } from '../components/tables'
import { HiggsfieldKeyDialog, useAiImages } from '../components/AiImages'
import type { ExportTable } from '../lib/export'
import {
  ALLERGENS, DIETARY, MAX_DESCRIPTION, allergenNumber, categoryOrder, dietaryClash, menuItemProblem, menuSections, moveInSection, type Allergen, type Dietary,
  type MenuImage, type MenuItem as Item, type MenuItemInput,
} from '../../shared/menu'
import { RECIPE_CATEGORIES } from '../../shared/recipes'
import { formatMoney, today } from '../../shared/time'
import { DesignView } from './menu/DesignView'
import { PhotoUpload } from './menu/PhotoUpload'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

const ICONS: Record<string, ReactNode> = {
  Coffee: <CoffeeIcon />, 'Tea & matcha': <TeaIcon />, 'Cold drinks': <ColdIcon />, Bakery: <BakeryIcon />, Food: <FoodIcon />, Shop: <ShopIcon />,
}

/** An item's photo, or its section's icon while it has none. */
export function ItemPhoto({ item, size = 72 }: { item: Pick<Item, 'name' | 'photo_url' | 'category'>; size?: number }) {
  return item.photo_url
    ? <Box component="img" src={item.photo_url} alt={item.name} sx={{ width: size, height: size, borderRadius: '12px', objectFit: 'cover', flexShrink: 0, bgcolor: tokens.surfaceAlt }} />
    : <Box aria-hidden sx={{ width: size, height: size, borderRadius: '12px', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: tokens.roseWash, color: tokens.roseDeep,
        '& svg': { fontSize: size * 0.42 } }}>{ICONS[item.category ?? ''] ?? <FoodIcon />}</Box>
}

/**
 * The menu as customers see it: every drink and dish by section, with its photo, price, what's in it
 * (the 14 allergens) and whether it's vegan or gluten free. Everyone on the team reads it (handy when
 * a customer asks); admins add, change and arrange items, and make the printed and screen menus on
 * the Design tab.
 */
export function MenuPage() {
  const { isAdmin, isPartner } = useApp()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const admin = isAdmin && !isPartner
  const view = admin && pathname.startsWith('/menu/design') ? 'design' : 'items'
  const { api } = useApp()
  const items = useAsync('menu-items', () => api.menuItems(), [])
  const brand = useAsync('brand', () => api.brand(), [])
  const [open, setOpen] = useState<Item | 'new' | null>(null)
  return (
    <>
      <PageHeader eyebrow={t('Menu')} title={view === 'design' ? t('Menu design') : t('Menu')}
        actions={view === 'items' && admin ? <>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen('new')}>{t('Add menu item')}</Button>
          <Button variant="outlined" component={RouterLink} to="/recipes">{t('Menu costing')}</Button>
          <ExportButton table={() => allergenTable(items.data ?? [])} disabled={!items.data?.length} folder="Menu" />
        </> : undefined} />
      {admin && (
        <Tabs value={view} onChange={(_, v: string) => navigate(v === 'design' ? '/menu/design' : '/menu')} sx={{ mb: 2.5, borderBottom: `1px solid ${tokens.line}` }}>
          <Tab value="items" label={t('Items')} />
          <Tab value="design" label={t('Design')} />
        </Tabs>
      )}
      <ErrorBox error={items.error} />
      {view === 'items'
        ? <Items items={items.data} admin={admin} onOpen={setOpen} />
        : <DesignView items={items.data ?? []} brand={brand.data} />}
      {open && <ItemDialog item={open === 'new' ? null : open} items={items.data ?? []} onClose={() => setOpen(null)} />}
    </>
  )
}

/** The allergen chart: every item with what's in it, for the counter or an inspector. */
function allergenTable(items: Item[]): ExportTable {
  const rows = menuSections(items, { all: true }).flatMap(s => s.items)
  return {
    title: t('Menu and allergens'),
    filename: `menu-allergens-${today()}`,
    columns: [t('Item'), t('Section'), t('Price with IVA'), ...ALLERGENS.map(a => t(a.label)), t('Suitable for'), t('On the menu'), t('Description')],
    rows: rows.map(i => [i.name, i.category ? t(i.category) : '', i.sell_price, ...ALLERGENS.map(a => (i.allergens.includes(a.id) ? '✓' : '')),
      i.dietary.map(d => t(DIETARY.find(x => x.id === d)!.label)).join(', '), i.on_menu ? t('Yes') : t('No'), i.description ?? '']),
    money: [2],
  }
}

function Items({ items, admin, onOpen }: { items: Item[] | null; admin: boolean; onOpen: (i: Item) => void }) {
  const { api } = useApp()
  const run = useAction()
  const [category, setCategory] = useState('')
  const [freeFrom, setFreeFrom] = useState<Allergen[]>([])
  const [offOnly, setOffOnly] = useState(false)
  const [q, setQ] = useState('')
  const all = items ?? []
  const on = all.filter(i => i.on_menu)
  const off = all.filter(i => !i.on_menu)
  const priced = on.filter(i => i.sell_price !== null)
  const noPhoto = on.filter(i => !i.photo_url)
  const categories = categoryOrder(all.map(i => i.category)).filter((c): c is string => !!c)
  const words = q.trim().toLowerCase()
  const shown = all.filter(i => (!category || i.category === category) && (!offOnly || !i.on_menu) && !freeFrom.some(a => i.allergens.includes(a))
    && (!words || i.name.toLowerCase().includes(words) || (i.description ?? '').toLowerCase().includes(words)))
  const sections = menuSections(shown, { all: true })
  const used = ALLERGENS.filter(a => all.some(i => i.allergens.includes(a.id)))
  const move = (i: Item, by: -1 | 1) => run(async () => {
    const ids = moveInSection(all, i.id, by)
    if (ids) await api.reorderMenu(ids)
  })

  return (
    <>
      <StatGrid>
        <StatTile label={t('On the menu')} value={items ? on.length : '–'} note={tn(off.length, '{n} off the menu', '{n} off the menu')} />
        <StatTile label={t('Sections')} value={items ? categories.length : '–'} note={categories.slice(0, 3).map(c => t(c)).join(', ')} />
        <StatTile label={t('Average price')} value={priced.length ? formatMoney(priced.reduce((s, i) => s + i.sell_price!, 0) / priced.length) : '–'} note={t('with IVA')} />
        <StatTile label={t('Without a photo')} value={items ? noPhoto.length : '–'} note={noPhoto.length ? noPhoto.slice(0, 2).map(i => i.name).join(', ') : t('Every item has one')} />
      </StatGrid>

      {items && !all.length ? (
        <Empty>
          <Typography sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}>{t('Put your menu together')}</Typography>
          {t('Add each drink and dish with its price, a line about it, a photo and its allergens. The printed menu and the menu on your screens are made from it.')}
        </Empty>
      ) : <>
        <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
          {off.length > 0 && <Chip size="small" clickable label={`${t('Off the menu')} ${off.length}`} onClick={() => setOffOnly(v => !v)} aria-pressed={offOnly}
            variant={offOnly ? 'filled' : 'outlined'} color={offOnly ? 'warning' : 'default'} />}
          <Box sx={{ flex: 1 }} />
          <Autocomplete multiple size="small" options={ALLERGENS.map(a => a.id)} value={freeFrom} onChange={(_, v) => setFreeFrom(v)} sx={{ width: { xs: '100%', sm: 260 } }}
            getOptionLabel={a => `${allergenNumber(a)} · ${t(ALLERGENS.find(x => x.id === a)!.label)}`} disableCloseOnSelect limitTags={2}
            renderInput={p => <TextField {...p} label={t('Free from')} placeholder={freeFrom.length ? '' : t('e.g. Gluten, Milk')} />} />
          <TextField select size="small" value={category} onChange={e => setCategory(e.target.value)} sx={{ width: { xs: '100%', sm: 180 } }}
            slotProps={{ select: { displayEmpty: true, SelectDisplayProps: { 'aria-label': t('Section') } } }}>
            <MenuItem value="">{t('Every section')}</MenuItem>
            {categories.map(c => <MenuItem key={c} value={c}>{t(c)}</MenuItem>)}
          </TextField>
          <TextField size="small" placeholder={t('Search the menu…')} value={q} onChange={e => setQ(e.target.value)} sx={{ width: { xs: '100%', sm: 220 } }}
            slotProps={{ htmlInput: { 'aria-label': t('Search the menu') }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        </Stack>
        {items && !sections.length && <Empty>{t('Nothing matches that.')}</Empty>}
        {sections.map(s => (
          <Box key={s.category ?? '-'} component="section" aria-label={s.category ? t(s.category) : t('More')} sx={{ mb: 3 }}>
            <Typography variant="overline" component="h2" sx={{ display: 'block', color: tokens.roseDeep, mb: 1 }}>{s.category ? t(s.category) : t('More')}</Typography>
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' } }}>
              {s.items.map((i, n) => <ItemCard key={i.id} item={i} admin={admin} onOpen={() => onOpen(i)}
                move={!words && !category && !offOnly && !freeFrom.length ? { up: n > 0 ? () => move(i, -1) : null, down: n < s.items.length - 1 ? () => move(i, 1) : null } : null} />)}
            </Box>
          </Box>
        ))}
        {used.length > 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            {`${t('Allergens')}: ${used.map(a => `${allergenNumber(a.id)} ${t(a.label)}`).join(' · ')}`}
          </Typography>
        )}
      </>}
    </>
  )
}

function ItemCard({ item: i, admin, onOpen, move }: { item: Item; admin: boolean; onOpen: () => void; move: { up: (() => void) | null; down: (() => void) | null } | null }) {
  const body = (
    <Stack direction="row" spacing={1.5} sx={{ p: 1.5, width: '100%', alignItems: 'flex-start', opacity: i.on_menu ? 1 : 0.62 }}>
      <ItemPhoto item={i} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
          <Typography sx={{ fontWeight: 500, flex: 1, minWidth: 0 }}>
            {i.featured && <StarIcon titleAccess={t('Featured')} sx={{ fontSize: 16, color: tokens.rose, mr: 0.5, verticalAlign: '-2px' }} />}
            {i.name}
          </Typography>
          <Typography sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, whiteSpace: 'nowrap', px: 0.5, borderRadius: 1, ...(i.sell_price === null && toEnter) }}>
            {i.sell_price === null ? '—' : formatMoney(i.sell_price)}
          </Typography>
        </Stack>
        {i.description && (
          <Typography variant="body2" sx={{ color: 'text.secondary', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{i.description}</Typography>
        )}
        {i.variants.length > 0 && (
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            {i.variants.map(v => (v.price_change ? `${v.name} +${formatMoney(v.price_change)}` : v.name)).join(' · ')}
          </Typography>
        )}
        <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', mt: 0.75 }}>
          {!i.on_menu && <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Off the menu')}</Tag>}
          {i.dietary.map(d => <Tag key={d} fg={tokens.goodFg} bg={tokens.goodBg}>{t(DIETARY.find(x => x.id === d)!.label)}</Tag>)}
          {i.allergens.map(a => <Tag key={a}>{`${allergenNumber(a)} · ${t(ALLERGENS.find(x => x.id === a)!.label)}`}</Tag>)}
        </Stack>
      </Box>
    </Stack>
  )
  return (
    <Card component="article" aria-label={i.name} sx={{ display: 'flex', alignItems: 'stretch', overflow: 'hidden' }}>
      {admin ? <CardActionArea onClick={onOpen} aria-label={t('Edit {name}', { name: i.name })} sx={{ display: 'flex', alignItems: 'stretch' }}>{body}</CardActionArea> : body}
      {admin && move && (
        <Stack sx={{ justifyContent: 'center', borderLeft: `1px solid ${tokens.line}`, px: 0.25 }}>
          <IconButton size="small" aria-label={t('Move {name} up', { name: i.name })} disabled={!move.up} onClick={() => move.up?.()}><UpIcon fontSize="small" /></IconButton>
          <IconButton size="small" aria-label={t('Move {name} down', { name: i.name })} disabled={!move.down} onClick={() => move.down?.()}><DownIcon fontSize="small" /></IconButton>
        </Stack>
      )}
    </Card>
  )
}

const blank = (): MenuItemInput => ({ name: '', category: 'Coffee', sell_price: null, vat_rate: 10, description: null, photo_url: null, allergens: [], dietary: [],
  featured: false, on_menu: true })

/** Add or change a menu item: what customers read, its photo, and what's in it. */
function ItemDialog({ item, items, onClose }: { item: Item | null; items: Item[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [m, setM] = useState<MenuItemInput>(() => (item ? (({ variants: _v, menu_sort: _s, ...rest }) => structuredClone(rest))(item) : blank()))
  const [price, setPrice] = useState(item?.sell_price == null ? '' : String(item.sell_price).replace('.', ','))
  const [deleting, setDeleting] = useState(false)
  const [linking, setLinking] = useState(false)
  const set = (patch: Partial<MenuItemInput>) => setM(x => ({ ...x, ...patch }))
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  const categories = [...new Set([...RECIPE_CATEGORIES, ...items.map(i => i.category).filter((c): c is string => !!c), ...(m.category ? [m.category] : [])])]
  const clash = dietaryClash(m)
  const save = () => run(async () => {
    const typed = price.trim().replace(',', '.')
    // Not a number: the check below says how to write it.
    const ready = { ...m, sell_price: typed === '' ? null : Number(typed) }
    const problem = menuItemProblem(ready)
    if (problem) throw new Error(t(problem))
    await api.saveMenuItem({ ...ready, name: ready.name.trim() })
    onClose()
  }, item ? t('Saved') : t('Added {name}', { name: m.name.trim() }))
  const remove = () => run(async () => { await api.deleteRecipe(item!.id); onClose() }, t('Deleted {name}', { name: item!.name }))

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={phone}>
      <DialogTitle>{item ? item.name : t('Add a menu item')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.25} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label={t('Name')} value={m.name} onChange={e => set({ name: e.target.value })} autoFocus={!item} slotProps={{ htmlInput: { maxLength: 120 } }} />
            <Autocomplete freeSolo fullWidth options={categories} value={m.category ?? ''} getOptionLabel={c => t(c)}
              onInputChange={(_, v, reason) => { if (reason !== 'reset') set({ category: v.trim() || null }) }} onChange={(_, v) => set({ category: v || null })}
              renderInput={p => <TextField {...p} label={t('Section')} />} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label={t('Price, with IVA')} value={price} inputMode="decimal" onChange={e => setPrice(e.target.value)}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">{'€'}</InputAdornment> } }} />
            <TextField select fullWidth label={t('IVA')} value={m.vat_rate} onChange={e => set({ vat_rate: Number(e.target.value) })}>
              {[0, 4, 10, 21].map(v => <MenuItem key={v} value={v}>{`${v}%`}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField label={t('Description')} placeholder={t('One line customers read, e.g. Double ristretto with silky steamed milk')} value={m.description ?? ''} multiline minRows={2}
            onChange={e => set({ description: e.target.value || null })} slotProps={{ htmlInput: { maxLength: MAX_DESCRIPTION } }}
            helperText={`${(m.description ?? '').length}/${MAX_DESCRIPTION}`} />

          <Box>
            <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>{t('Photo')}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
              <ItemPhoto item={{ name: m.name, category: m.category, photo_url: m.photo_url }} size={104} />
              <Stack spacing={1} sx={{ flex: 1 }}>
                <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                  <PhotoUpload onDone={url => set({ photo_url: url })} />
                  <Button size="small" variant="outlined" startIcon={<LinkIcon />} onClick={() => setLinking(true)}>{t('Paste a link')}</Button>
                  {m.photo_url && <Button size="small" color="error" onClick={() => set({ photo_url: null })}>{t('Remove photo')}</Button>}
                </Stack>
                {linking && <TextField size="small" autoFocus label={t('Photo address')} placeholder={'https://…'} defaultValue={m.photo_url ?? ''}
                  onBlur={e => { set({ photo_url: e.target.value.trim() || null }); setLinking(false) }} />}
                {item ? <AiPhoto item={item} onReady={url => set({ photo_url: url })} />
                  : <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('Once it’s added, you can make its photo with AI.')}</Typography>}
              </Stack>
            </Stack>
          </Box>

          <Box>
            <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>{t('Contains')}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>{t('Tick each of the 14 allergens it has, even in traces you know of: they show on the menus.')}</Typography>
            <Box role="group" aria-label={t('Allergens')} sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {ALLERGENS.map(a => {
                const has = m.allergens.includes(a.id)
                return <Chip key={a.id} label={`${allergenNumber(a.id)} · ${t(a.label)}`} clickable aria-pressed={has} onClick={() => set({ allergens: toggle(m.allergens, a.id) })}
                  variant={has ? 'filled' : 'outlined'} sx={has ? { bgcolor: tokens.warnBg, color: tokens.warnFg, borderColor: 'transparent' } : undefined} />
              })}
            </Box>
          </Box>
          <Box>
            <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>{t('Suitable for')}</Typography>
            <Box role="group" aria-label={t('Suitable for')} sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {DIETARY.map(d => {
                const has = m.dietary.includes(d.id)
                return <Chip key={d.id} label={t(d.label)} clickable aria-pressed={has} onClick={() => set({ dietary: toggle<Dietary>(m.dietary, d.id) })}
                  variant={has ? 'filled' : 'outlined'} sx={has ? { bgcolor: tokens.goodBg, color: tokens.goodFg, borderColor: 'transparent' } : undefined} />
              })}
            </Box>
            {clash && <Alert severity="warning" icon={<WarningIcon />} sx={{ mt: 1.5 }}>{t(clash)}</Alert>}
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0, sm: 3 }}>
            <FormControlLabel control={<Switch checked={m.on_menu} onChange={e => set({ on_menu: e.target.checked })} />} label={t('On the menu')} />
            <FormControlLabel control={<Switch checked={m.featured} onChange={e => set({ featured: e.target.checked })} />} label={t('Featured (a house favourite)')} />
          </Stack>
          {item && item.variants.length > 0 && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('Variants: {list}. Change them, and what goes in each, on Menu costing.', { list: item.variants.map(v => v.name).join(', ') })}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {item && (deleting ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto' }}>
            <Typography variant="body2">{t('Delete {name}? Its costing goes too.', { name: item.name })}</Typography>
            <Button size="small" color="error" variant="contained" onClick={remove}>{t('Delete')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </Stack>
        ) : <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleting(true)} sx={{ mr: 'auto' }}>{t('Delete')}</Button>)}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={save}>{item ? t('Save') : t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Make an item's photo with AI (Higgsfield): a style if wanted, then it's made and put on the item. */
function AiPhoto({ item, onReady }: { item: Item; onReady: (url: string) => void }) {
  const { api } = useApp()
  const run = useAction()
  const ai = useAiImages()
  const [style, setStyle] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [waiting, setWaiting] = useState<MenuImage | null>(null)
  // While it's being made: ask every few seconds.
  useEffect(() => {
    if (!waiting || waiting.status === 'ready' || waiting.status === 'failed') return
    const id = setTimeout(() => void api.checkMenuImage(waiting.id).then(setWaiting).catch(() => setWaiting(w => w && { ...w, status: 'failed', error: t('It couldn’t be checked. Try again.') })), 3000)
    return () => clearTimeout(id)
  }, [api, waiting])
  // Once ready, the photo goes on the form (once: the item already has it in the database).
  const shown = useRef<string | null>(null)
  useEffect(() => {
    if (waiting?.status !== 'ready' || !waiting.url || shown.current === waiting.id) return
    shown.current = waiting.id
    onReady(waiting.url)
  }, [waiting, onReady])
  if (!ai.loaded) return null
  if (!ai.connected) {
    return (
      <Box>
        <Button size="small" startIcon={<AiIcon />} onClick={() => setConnecting(true)}>{t('Make it with AI: connect Higgsfield')}</Button>
        {connecting && <HiggsfieldKeyDialog onClose={() => setConnecting(false)} onDone={ai.reload} />}
      </Box>
    )
  }
  const making = waiting && (waiting.status === 'queued' || waiting.status === 'working')
  const make = () => run(async () => setWaiting(await api.generateMenuImage({ item_id: item.id, prompt: style, model: 'qwen' })))
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
      <TextField size="small" sx={{ flex: 1 }} label={t('Style for an AI photo (optional)')} placeholder={t('e.g. on a marble table, morning light')} value={style}
        onChange={e => setStyle(e.target.value)} disabled={!!making} slotProps={{ htmlInput: { maxLength: 300 } }} />
      <Button size="small" variant="outlined" startIcon={making ? <CircularProgress size={14} /> : <AiIcon />} disabled={!!making} onClick={make}>
        {making ? t('Making…') : t('Make a photo with AI')}
      </Button>
      {waiting?.status === 'failed' && <Typography variant="caption" sx={{ color: tokens.badFg }}>{waiting.error ?? t('It couldn’t be made. Try again.')}</Typography>}
      {waiting?.status === 'ready' && <Tooltip title={t('It’s on the item now; Save keeps the rest of your changes.')}><Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Photo made')}</Tag></Tooltip>}
    </Stack>
  )
}
