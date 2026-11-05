import {
  Autocomplete, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, Link, MenuItem,
  Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import OfferIcon from '@mui/icons-material/LocalOfferOutlined'
import SoldIcon from '@mui/icons-material/TaskAltOutlined'
import BinIcon from '@mui/icons-material/DeleteSweepOutlined'
import { useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync, useTick } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, SectionTitle, Tag } from '../components/common'
import {
  DISCOUNT_LEADS, MAX_SHELF_HOURS, OFFER_LEADS, SHELF_LIVES, batchFromItem, batchesOf, defaultDiscountAt, freshItemProblem, freshOfferPrice, freshProblem, freshState,
  goodUntil, likeLastTime, newFreshBatch, newFreshItem, onCounter, shelfShare, type FreshBatch, type FreshBatchInput, type FreshItem, type FreshItemInput, type FreshState,
} from '../../shared/freshBatches'
import type { MenuItem as MenuRow } from '../../shared/menu'
import { formatLocal, formatNumber, localDate, localTime, today, zonedIso } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t, tn } from '../i18n'

const HOUR = 3_600_000
const STATE: Record<FreshState, { label: string; fg: string; bg: string }> = {
  fresh: { label: msg('Fresh'), fg: tokens.goodFg, bg: tokens.goodBg },
  discount_soon: { label: msg('Fresh'), fg: tokens.goodFg, bg: tokens.goodBg },
  on_offer: { label: msg('On offer now'), fg: tokens.warnFg, bg: tokens.warnBg },
  past: { label: msg('Past its shelf life'), fg: tokens.badFg, bg: tokens.badBg },
  sold: { label: msg('Sold out'), fg: tokens.neutralFg, bg: tokens.neutralBg },
  binned: { label: msg('Thrown away'), fg: tokens.neutralFg, bg: tokens.neutralBg },
}

/** "14:30", "Tomorrow 08:00" or "Thu 1 Oct, 08:00". */
function when(iso: string) {
  const d = localDate(iso)
  if (d === today()) return localTime(iso)
  return `${formatLocal(iso, 'EEE d MMM')}, ${localTime(iso)}`
}
/** A shelf life in words: "8 hours", "1 day", "36 hours". */
const shelfText = (hours: number) => (hours % 24 === 0 ? tn(hours / 24, '{n} day', '{n} days') : tn(hours, '{n} hour', '{n} hours'))
/** How long before the end an offer starts, in words: "its last 4 hours", "its last day", "its last 2 days". */
const leadText = (hours: number) => (hours % 24 === 0 ? tn(hours / 24, 'its last day', 'its last {n} days') : tn(hours, 'its last hour', 'its last {n} hours'))
/** The discount in words: "30% off" or "2 for €5". */
const discountWords = (b: Pick<FreshBatch, 'discount' | 'percent_off' | 'price'>) => (b.discount === 'percent' ? t('{n}% off', { n: b.percent_off }) : b.price ?? '')
/** For a datetime-local field, in the business's time: "2026-09-30T08:30". */
const toField = (iso: string) => formatLocal(iso, "yyyy-MM-dd'T'HH:mm")
/** What's saved of a batch (the rest the database works out). */
const inputOf = ({ good_until: _g, cleared_at: _c, made_by: _m, ...b }: FreshBatch): FreshBatchInput => b
const fromField = (v: string) => (v ? zonedIso(v.slice(0, 10), v.slice(11, 16)) : '')

/**
 * Freshly made (Stock → Freshly made): what the team made for the counter, when, how long it keeps and when
 * it goes on offer, at what discount. A batch with a discount is on Offers & specials from then until its
 * shelf life ends (by itself: the `fresh_batches` migration). The team records batches and clears them
 * (sold out, thrown away); finance partners read.
 */
export function FreshlyMade() {
  const { api, isAdmin, isPartner, me } = useApp()
  const run = useAction()
  useTick(60_000)
  const batches = useAsync('fresh-batches', () => api.freshBatches(), [])
  const menu = useAsync('menu-items', () => api.menuItems(), [])
  const items = useAsync('fresh-items', () => api.freshItems(), [])
  const [editing, setEditing] = useState<FreshBatchInput | null>(null)
  const [setting, setSetting] = useState<FreshItemInput | null>(null)
  const list = batches.data ?? []
  // The items made here with a set shelf life, as on the menu (from Square when that's where it comes from), by section and name.
  const made = (items.data ?? []).flatMap(i => { const m = menu.data?.find(x => x.id === i.recipe_id); return m ? [{ item: i, menu: m }] : [] })
    .sort((a, b) => (a.menu.category ?? '').localeCompare(b.menu.category ?? '') || a.menu.name.localeCompare(b.menu.name))
  /** A batch of an item made now: its shelf life and offer, and as many as last time. */
  const recordOf = (i: FreshItem, m: MenuRow) => {
    const fresh = newFreshBatch()
    setEditing({ ...fresh, name: m.name, quantity: batchesOf(m, list)[0]?.quantity ?? null, ...batchFromItem(i, fresh.made_at) })
  }
  const now = Date.now()
  const counter = list.filter(b => onCounter(b, now)).sort((a, b) => a.good_until.localeCompare(b.good_until))
  const earlier = list.filter(b => !onCounter(b, now))
  const canRecord = !isPartner
  const sellPrice = (b: FreshBatch) => menu.data?.find(m => m.id === b.recipe_id)?.sell_price ?? null

  const clear = (b: FreshBatch, how: 'sold' | 'binned') => run(async () => {
    await api.saveFreshBatch({ ...inputOf(b), cleared: how })
    await batches.reload()
  }, how === 'sold' ? t('{name}: sold out', { name: b.name }) : t('{name}: thrown away', { name: b.name }))

  return (
    <Box component="section" aria-label={t('Freshly made')}>
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5, alignItems: { sm: 'center' }, justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 760 }}>
          {t('What’s been made for the counter today: when, how long it keeps, and when it goes on offer. A discount puts it on Offers & specials by itself until it has to be gone.')}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          {isAdmin && <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setSetting(newFreshItem())}>{t('Add an item')}</Button>}
          {canRecord && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing(newFreshBatch())}>{t('Record a batch')}</Button>}
        </Stack>
      </Stack>
      <ErrorBox error={batches.error ?? items.error} />

      {/* The items made here with a set shelf life: how long each keeps, when it was last made, and its offer. */}
      <Box component="section" aria-label={t('Made here')} sx={{ mb: 3 }}>
        <SectionTitle>{t('Made here')}</SectionTitle>
        {items.data && menu.data && !made.length ? (
          <Empty>{isAdmin
            ? t('Nothing with a set shelf life yet. Add what you make (pastries, yoghurt pots, chia puddings) with how long it keeps and its offer, or give the item a Shelf life custom attribute in Square: it comes in with the menu.')
            : t('Nothing with a set shelf life yet.')}</Empty>
        ) : (
          <Card sx={{ overflow: 'hidden' }}>
            <Box component="ul" aria-label={t('Made here')} sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {made.map(({ item, menu: m }) => (
                <MadeHereRow key={item.id} item={item} menu={m} batches={batchesOf(m, list)} now={now} canRecord={canRecord} canEdit={isAdmin}
                  onRecord={() => recordOf(item, m)} onEdit={() => setSetting({ ...item })} />
              ))}
            </Box>
          </Card>
        )}
      </Box>

      <SectionTitle>{t('On the counter')}</SectionTitle>
      {batches.data && !counter.length ? (
        <Empty>{canRecord ? t('Nothing on the counter. Record what you make (a banana bread, the day’s sandwiches) to see how long it keeps.') : t('Nothing on the counter.')}</Empty>
      ) : (
        <Box role="list" aria-label={t('On the counter')}
          sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' } }}>
          {counter.map(b => (
            <BatchCard key={b.id} b={b} now={now} sellPrice={sellPrice(b)} offerLink={isAdmin} canRecord={canRecord}
              onEdit={() => setEditing(inputOf(b))} onSold={() => void clear(b, 'sold')} onBinned={() => void clear(b, 'binned')} />
          ))}
        </Box>
      )}

      {earlier.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <SectionTitle>{t('Earlier')}</SectionTitle>
          <Card sx={{ overflow: 'hidden' }}>
            <Box component="ul" aria-label={t('Earlier batches')} sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {earlier.map(b => {
                const state = freshState(b, now)
                return (
                  <Stack component="li" key={b.id} aria-label={b.name} direction="row"
                    sx={{ px: 2, py: 1.25, gap: 1.5, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
                    <Box sx={{ flex: 1, minWidth: 180 }}>
                      <Typography sx={{ fontWeight: 500 }}>{b.quantity ? `${b.name} × ${formatNumber(b.quantity)}` : b.name}</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {t('Made {made} · good until {until}', { made: when(b.made_at), until: when(b.good_until) })}
                      </Typography>
                    </Box>
                    <Tag fg={STATE[state].fg} bg={STATE[state].bg}>
                      {b.cleared_at ? `${t(STATE[state].label)} · ${when(b.cleared_at)}` : t(STATE[state].label)}
                    </Tag>
                    {state === 'past' && canRecord && (
                      <Stack direction="row" spacing={0.5}>
                        <Button size="small" onClick={() => void clear(b, 'sold')}>{t('Sold out')}</Button>
                        <Button size="small" color="error" onClick={() => void clear(b, 'binned')}>{t('Thrown away')}</Button>
                      </Stack>
                    )}
                    {canRecord && (
                      <Tooltip title={t('Edit')}>
                        <IconButton size="small" aria-label={t('Edit {name}', { name: b.name })} onClick={() => setEditing(inputOf(b))}><EditIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                )
              })}
            </Box>
          </Card>
        </Box>
      )}

      {setting && <ItemDialog item={setting} fromSquare={!!items.data?.find(i => i.id === setting.id)?.from_square} menu={menu.data ?? []}
        taken={(items.data ?? []).filter(i => i.id !== setting.id).map(i => i.recipe_id)}
        onClose={() => setSetting(null)} onSaved={() => { setSetting(null); void items.reload() }} />}
      {editing && <BatchDialog batch={editing} batches={list} menu={menu.data ?? []} items={items.data ?? []}
        canDelete={!!editing.id && (isAdmin || list.find(b => b.id === editing.id)?.made_by === me?.id)}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void batches.reload() }} />}
    </Box>
  )
}

/** One batch on the counter: what and how many, its shelf life as a bar with the discount marked, and what to do with it. */
function BatchCard({ b, now, sellPrice, offerLink, canRecord, onEdit, onSold, onBinned }: {
  b: FreshBatch; now: number; sellPrice: number | null; offerLink: boolean; canRecord: boolean; onEdit: () => void; onSold: () => void; onBinned: () => void
}) {
  const { profiles } = useApp()
  const state = freshState(b, now)
  const share = shelfShare(b, now)
  const span = Date.parse(b.good_until) - Date.parse(b.made_at)
  const mark = b.discount_at ? (Date.parse(b.discount_at) - Date.parse(b.made_at)) / Math.max(1, span) : null
  const by = profiles.find(p => p.id === b.made_by)?.full_name.split(' ')[0]
  const left = Math.max(0, Date.parse(b.good_until) - now)
  // Whole days from two days on; hours to the nearest from an hour and a half; minutes in the last of it.
  const leftText = left >= 48 * HOUR ? tn(Math.floor(left / (24 * HOUR)), '{n} day left', '{n} days left')
    : left >= 1.5 * HOUR ? tn(Math.round(left / HOUR), '{n} hour left', '{n} hours left') : tn(Math.ceil(left / 60_000), '{n} minute left', '{n} minutes left')
  const { price, was_price } = freshOfferPrice(b, sellPrice)
  const offerText = state === 'on_offer'
    ? t('On offer now: {price}', { price: discountWords(b) === price ? price : `${discountWords(b)} · ${price}` })
    : b.discount_at ? t('{discount} from {time}', { discount: discountWords(b), time: when(b.discount_at) }) : null
  const tag = offerText && (
    <Tag fg={state === 'on_offer' ? tokens.warnFg : tokens.infoFg} bg={state === 'on_offer' ? tokens.warnBg : tokens.infoBg}>
      <OfferIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: '-2px' }} />{offerText}
    </Tag>
  )
  const fill = state === 'on_offer' ? tokens.warning : tokens.matcha
  return (
    <Card role="listitem" component="article" aria-label={b.name} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h3" sx={{ wordBreak: 'break-word' }}>
            {b.name}{b.quantity ? <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>{` × ${formatNumber(b.quantity)}`}</Box> : null}
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {[by ? t('Made {time} by {name}', { time: when(b.made_at), name: by }) : t('Made {time}', { time: when(b.made_at) }), t('keeps {time}', { time: shelfText(b.shelf_life_hours) })].join(' · ')}
          </Typography>
        </Box>
        {canRecord && (
          <Tooltip title={t('Edit')}>
            <IconButton size="small" onClick={onEdit} aria-label={t('Edit {name}', { name: b.name })} sx={{ mt: -0.5, mr: -0.5 }}><EditIcon fontSize="small" /></IconButton>
          </Tooltip>
        )}
      </Stack>

      {/* Its shelf life: how far through it is, the discount marked where it starts. */}
      <Box>
        <Box role="meter" aria-label={t('Shelf life used')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}
          aria-valuetext={t('{left}, good until {time}', { left: leftText, time: when(b.good_until) })}
          sx={{ position: 'relative', height: 8, borderRadius: 4, bgcolor: tokens.matchaSoft }}>
          <Box sx={{ position: 'absolute', inset: 0, right: 'auto', width: `${share * 100}%`, borderRadius: 4, bgcolor: fill }} />
          {mark !== null && (
            <Tooltip title={t('Discount from {time}', { time: when(b.discount_at!) })}>
              <Box sx={{ position: 'absolute', top: -4, bottom: -4, width: 3, borderRadius: 1, bgcolor: tokens.ink, left: `calc(${mark * 100}% - 1.5px)` }} />
            </Tooltip>
          )}
        </Box>
        <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{leftText}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('Good until {time}', { time: when(b.good_until) })}</Typography>
        </Stack>
      </Box>

      <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
        {state !== 'on_offer' && <Tag fg={STATE[state].fg} bg={STATE[state].bg}>{t(STATE[state].label)}</Tag>}
        {tag && offerLink
          ? <Link component={RouterLink} to="/offers" underline="none" aria-label={t('{offer}, on Offers & specials', { offer: offerText! })}>{tag}</Link>
          : tag}
        {state === 'on_offer' && was_price && <Typography variant="caption" component="s" sx={{ color: 'text.secondary' }}>{was_price}</Typography>}
      </Stack>
      {b.notes && <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap' }}>{b.notes}</Typography>}
      {canRecord && (
        <Stack direction="row" spacing={1} sx={{ mt: 'auto' }}>
          <Button size="small" variant="outlined" startIcon={<SoldIcon />} onClick={onSold} aria-label={t('{name}: sold out', { name: b.name })}>{t('Sold out')}</Button>
          <Button size="small" variant="outlined" color="error" startIcon={<BinIcon />} onClick={onBinned} aria-label={t('{name}: thrown away', { name: b.name })}>{t('Thrown away')}</Button>
        </Stack>
      )}
    </Card>
  )
}

/** Record a batch, or change one: what, how many, when it was made, how long it keeps, and its discount. */
function BatchDialog({ batch, batches, menu, items, canDelete, onClose, onSaved }: {
  batch: FreshBatchInput; batches: FreshBatch[]; menu: { id: string; name: string; sell_price: number | null }[]; items: FreshItem[]
  canDelete: boolean; onClose: () => void; onSaved: () => void
}) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [b, setB] = useState<FreshBatchInput>(batch)
  const [custom, setCustom] = useState(!SHELF_LIVES.some(s => s.hours === batch.shelf_life_hours))
  const [deleting, setDeleting] = useState(false)
  const set = (p: Partial<FreshBatchInput>) => setB(x => ({ ...x, ...p }))
  const names = [...new Set([...menu.map(m => m.name), ...batches.map(x => x.name)])].sort((x, y) => x.localeCompare(y))
  const until = goodUntil(b.made_at, b.shelf_life_hours || 1)
  const sell = menu.find(m => m.id === b.recipe_id)?.sell_price ?? menu.find(m => m.name.toLowerCase() === b.name.trim().toLowerCase())?.sell_price ?? null
  const preview = freshOfferPrice(b, sell)
  const problem = freshProblem(b)

  // The name the batch was last set up for, so leaving the field again keeps what's been changed since.
  const picked = useRef(batch.name.trim().toLowerCase())
  /**
   * A name picked or typed: the menu item it is, and (for a new batch) the last batch of it as a start, and
   * its shelf life and offer when it's an item made here.
   */
  const pickName = (name: string) => {
    const item = menu.find(m => m.name.toLowerCase() === name.trim().toLowerCase())
    if (picked.current === name.trim().toLowerCase()) { set({ name, recipe_id: item?.id ?? null }); return }
    picked.current = name.trim().toLowerCase()
    const last = !batch.id ? likeLastTime(name, batches, b.made_at) : null
    const own = !batch.id && item ? items.find(i => i.recipe_id === item.id) : undefined
    const start = { ...(last ?? {}), ...(own ? batchFromItem(own, b.made_at) : {}) }
    if (start.shelf_life_hours) setCustom(!SHELF_LIVES.some(s => s.hours === start.shelf_life_hours))
    set({ name, recipe_id: item?.id ?? null, ...start })
  }
  /** A new shelf life or time made: the discount keeps its distance from the end. */
  const reshape = (p: Pick<FreshBatchInput, 'made_at' | 'shelf_life_hours'>) => {
    const lead = b.discount_at ? Date.parse(goodUntil(b.made_at, b.shelf_life_hours)) - Date.parse(b.discount_at) : null
    const end = Date.parse(goodUntil(p.made_at, p.shelf_life_hours))
    set({ ...p, discount_at: lead === null ? null : new Date(Math.max(Date.parse(p.made_at), Math.min(end - 60_000, end - lead))).toISOString() })
  }

  const save = async () => {
    const ok = await run(async () => {
      if (problem) throw new Error(t(problem))
      await api.saveFreshBatch({ ...b, name: b.name.trim() })
    }, batch.id ? t('Saved') : b.discount_at ? t('{name} recorded, with its offer', { name: b.name.trim() }) : t('{name} recorded', { name: b.name.trim() }))
    if (ok) onSaved()
  }
  const remove = async () => { if (await run(() => api.deleteFreshBatch(batch.id!), t('Deleted {name}', { name: batch.name }))) onSaved() }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone} aria-labelledby="fresh-dialog-title">
      <DialogTitle id="fresh-dialog-title">{batch.id ? batch.name : t('Record a batch')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Autocomplete freeSolo fullWidth options={names} inputValue={b.name} onInputChange={(_, v, reason) => (reason === 'reset' ? pickName(v) : set({ name: v }))}
              onBlur={() => pickName(b.name)}
              renderInput={p => <TextField {...p} label={t('What was made')} placeholder={t('e.g. Banana bread')} autoFocus={!batch.id} />} />
            <TextField label={t('How many')} type="number" value={b.quantity ?? ''} sx={{ width: { sm: 140 } }}
              onChange={e => set({ quantity: e.target.value === '' ? null : Number(e.target.value) })} slotProps={{ htmlInput: { min: 1, step: 1 } }} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Made at')} type="datetime-local" value={toField(b.made_at)} fullWidth
              onChange={e => e.target.value && reshape({ made_at: fromField(e.target.value), shelf_life_hours: b.shelf_life_hours })}
              slotProps={{ inputLabel: { shrink: true } }} />
            {custom ? (
              <TextField label={t('Shelf life')} type="number" value={b.shelf_life_hours || ''} fullWidth
                onChange={e => reshape({ made_at: b.made_at, shelf_life_hours: Math.max(0, Math.min(MAX_SHELF_HOURS, Math.round(Number(e.target.value)))) })}
                slotProps={{ htmlInput: { min: 1, max: MAX_SHELF_HOURS }, input: { endAdornment: <InputAdornment position="end">{t('hours')}</InputAdornment> } }} />
            ) : (
              <TextField select label={t('Shelf life')} value={b.shelf_life_hours} fullWidth
                onChange={e => { const v = Number(e.target.value); if (v === -1) setCustom(true); else reshape({ made_at: b.made_at, shelf_life_hours: v }) }}>
                {SHELF_LIVES.map(s => <MenuItem key={s.hours} value={s.hours}>{t(s.label)}</MenuItem>)}
                <MenuItem value={-1}>{t('Another length…')}</MenuItem>
              </TextField>
            )}
          </Stack>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: '8px !important' }}>{t('Good until {time}', { time: when(until) })}</Typography>

          <Box sx={{ p: 1.75, borderRadius: 2.5, bgcolor: tokens.surfaceAlt }}>
            <FormControlLabel label={t('Put it on offer before it goes off')} control={
              <Switch checked={!!b.discount_at} onChange={e => set({ discount_at: e.target.checked ? defaultDiscountAt(b.made_at, b.shelf_life_hours || 1) : null })} />} />
            {b.discount_at && (
              <Stack spacing={1.75} sx={{ mt: 1 }}>
                <TextField label={t('Discount from')} type="datetime-local" value={toField(b.discount_at)}
                  onChange={e => e.target.value && set({ discount_at: fromField(e.target.value) })} slotProps={{ inputLabel: { shrink: true } }} />
                <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap', mt: '8px !important' }} role="group" aria-label={t('Start the discount')}>
                  {DISCOUNT_LEADS.filter(l => l.hours < b.shelf_life_hours).map(l => {
                    const at = new Date(Date.parse(until) - l.hours * HOUR).toISOString()
                    return <Button key={l.hours} size="small" variant={b.discount_at === at ? 'contained' : 'outlined'} onClick={() => set({ discount_at: at })}>{t(l.label)}</Button>
                  })}
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
                  <ToggleButtonGroup exclusive size="small" value={b.discount} onChange={(_, v: FreshBatchInput['discount'] | null) => v && set({ discount: v })} aria-label={t('Discount')}>
                    <ToggleButton value="percent" sx={{ px: 1.5 }}>{t('% off')}</ToggleButton>
                    <ToggleButton value="price" sx={{ px: 1.5 }}>{t('Set price')}</ToggleButton>
                  </ToggleButtonGroup>
                  {b.discount === 'percent' ? (
                    <TextField size="small" label={t('Off the menu price')} type="number" value={b.percent_off} sx={{ width: 170 }}
                      onChange={e => set({ percent_off: Math.round(Number(e.target.value)) })}
                      slotProps={{ htmlInput: { min: 5, max: 90, step: 5 }, input: { endAdornment: <InputAdornment position="end">{'%'}</InputAdornment> } }} />
                  ) : (
                    <TextField size="small" label={t('Offer price')} value={b.price ?? ''} placeholder={t('e.g. 2 for €3')} sx={{ width: 200 }}
                      onChange={e => set({ price: e.target.value })} slotProps={{ htmlInput: { maxLength: 40 } }} />
                  )}
                </Stack>
                <Typography variant="body2" role="status" sx={{ color: 'text.secondary' }}>
                  <OfferIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: '-3px', color: tokens.roseDeep }} />
                  {preview.was_price
                    ? t('On Offers & specials from {from} until {until}: {price}, was {was}.', { from: when(b.discount_at), until: when(until), price: preview.price || '…', was: preview.was_price })
                    : t('On Offers & specials from {from} until {until}: {price}.', { from: when(b.discount_at), until: when(until), price: preview.price || '…' })}
                </Typography>
              </Stack>
            )}
          </Box>
          <TextField label={t('Notes')} value={b.notes ?? ''} onChange={e => set({ notes: e.target.value })} placeholder={t('e.g. on the top shelf, gluten free')}
            slotProps={{ htmlInput: { maxLength: 300 } }} />
          {problem && b.name.trim() && <Typography variant="body2" sx={{ color: tokens.badFg }}>{t(problem)}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {canDelete && (deleting ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto' }}>
            <Typography variant="body2" sx={{ color: tokens.badFg }}>{t('Delete {name}?', { name: batch.name })}</Typography>
            <Button size="small" color="error" variant="contained" onClick={() => void remove()}>{t('Delete')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </Stack>
        ) : <Button color="error" onClick={() => setDeleting(true)} sx={{ mr: 'auto' }}>{t('Delete')}</Button>)}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!!problem} onClick={() => void save()}>{batch.id ? t('Save') : t('Record')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** One item made here: how long it keeps, when it was last made (and by whom), its offer and, for the batch on the counter, when that starts. */
function MadeHereRow({ item, menu, batches, now, canRecord, canEdit, onRecord, onEdit }: {
  item: FreshItem; menu: MenuRow; batches: FreshBatch[]; now: number; canRecord: boolean; canEdit: boolean; onRecord: () => void; onEdit: () => void
}) {
  const { profiles } = useApp()
  const last = batches[0]
  const by = last && profiles.find(p => p.id === last.made_by)?.full_name.split(' ')[0]
  const state = last ? freshState(last, now) : null
  const offer = item.offer_hours === null ? null : t('{discount} for {lead}', { discount: discountWords(item) || '…', lead: leadText(item.offer_hours) })
  // The batch on the counter: when its offer starts, or that it's on now.
  const current = !last || !onCounter(last, now) ? null
    : state === 'on_offer' ? { text: t('On offer now, until {time}', { time: when(last.good_until) }), fg: tokens.warnFg, bg: tokens.warnBg }
      : last.discount_at ? { text: t('Offer from {time}', { time: when(last.discount_at) }), fg: tokens.infoFg, bg: tokens.infoBg }
        : { text: t('Good until {time}', { time: when(last.good_until) }), fg: tokens.goodFg, bg: tokens.goodBg }
  return (
    <Stack component="li" aria-label={menu.name} direction="row"
      sx={{ px: 2, py: 1.5, gap: 1.5, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
      <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
        <Stack direction="row" useFlexGap sx={{ gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 600 }}>{menu.name}</Typography>
          {item.from_square && <Tag fg={tokens.neutralFg} bg={tokens.neutralBg}>{t('From Square')}</Tag>}
        </Stack>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {[menu.category ? t(menu.category) : null, t('Keeps {time}', { time: shelfText(item.shelf_life_hours) })].filter(Boolean).join(' · ')}
        </Typography>
      </Box>
      <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
        <Typography variant="body2">
          {last ? (by ? t('Last made {time} by {name}', { time: when(last.made_at), name: by }) : t('Last made {time}', { time: when(last.made_at) })) : t('Not made yet')}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{offer ?? t('No offer')}</Typography>
      </Box>
      <Box sx={{ flex: '0 1 auto' }}>
        {current && <Tag fg={current.fg} bg={current.bg}>{offer && current.bg !== tokens.goodBg && <OfferIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: '-2px' }} />}{current.text}</Tag>}
      </Box>
      <Stack direction="row" spacing={0.5} sx={{ ml: 'auto', alignItems: 'center' }}>
        {canRecord && <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onRecord} aria-label={t('Record a batch of {name}', { name: menu.name })}>{t('Record')}</Button>}
        {canEdit && (
          <Tooltip title={t('Edit')}>
            <IconButton size="small" aria-label={t('Shelf life and offer of {name}', { name: menu.name })} onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
          </Tooltip>
        )}
      </Stack>
    </Stack>
  )
}

/** An item made here (admins): the menu item, how long it keeps (Square's, when it has it) and its offer before it has to be gone. */
function ItemDialog({ item, fromSquare, menu, taken, onClose, onSaved }: {
  item: FreshItemInput; fromSquare: boolean; menu: MenuRow[]; taken: string[]; onClose: () => void; onSaved: () => void
}) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [i, setI] = useState<FreshItemInput>(item)
  const [custom, setCustom] = useState(!SHELF_LIVES.some(s => s.hours === item.shelf_life_hours))
  const [deleting, setDeleting] = useState(false)
  const set = (p: Partial<FreshItemInput>) => setI(x => ({ ...x, ...p }))
  const options = menu.filter(m => !taken.includes(m.id)).sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name))
  const picked = menu.find(m => m.id === i.recipe_id) ?? null
  const problem = freshItemProblem(i)
  const leads = OFFER_LEADS.filter(l => l.hours < i.shelf_life_hours)
  /** The usual offer for a shelf life: the longest of the leads that's at most a quarter of it, or the shortest. */
  const usualLead = (hours: number) => [...OFFER_LEADS].reverse().find(l => l.hours <= hours / 4)?.hours ?? OFFER_LEADS.find(l => l.hours < hours)?.hours ?? null
  const shelf = (hours: number) => set({ shelf_life_hours: hours, offer_hours: i.offer_hours === null ? null : i.offer_hours < hours ? i.offer_hours : usualLead(hours) })
  // What a batch made now would do.
  const now = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString()
  const preview = batchFromItem(i, now)
  const price = freshOfferPrice(i, picked?.sell_price ?? null)

  const save = async () => {
    const ok = await run(async () => {
      if (problem) throw new Error(t(problem))
      await api.saveFreshItem({ ...i, price: i.price?.trim() || null })
    }, t('Saved {name}', { name: picked?.name ?? '' }))
    if (ok) onSaved()
  }
  const remove = async () => { if (await run(() => api.deleteFreshItem(item.id!), t('{name} taken off the list', { name: picked?.name ?? '' }))) onSaved() }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone} aria-labelledby="fresh-item-title">
      <DialogTitle id="fresh-item-title">{item.id && picked ? picked.name : t('Add an item')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!item.id && (
            <Autocomplete options={options} value={picked} onChange={(_, m) => set({ recipe_id: m?.id ?? '' })} getOptionLabel={m => m.name}
              groupBy={m => (m.category ? t(m.category) : t('Other'))} isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={p => <TextField {...p} label={t('Menu item')} placeholder={t('e.g. Mango chia pudding')} autoFocus />} />
          )}
          {custom ? (
            <TextField label={t('Shelf life')} type="number" value={i.shelf_life_hours || ''} disabled={fromSquare}
              onChange={e => shelf(Math.max(0, Math.min(MAX_SHELF_HOURS, Math.round(Number(e.target.value)))))}
              helperText={fromSquare ? t('Set in Square: the item’s Shelf life custom attribute.') : undefined}
              slotProps={{ htmlInput: { min: 1, max: MAX_SHELF_HOURS }, input: { endAdornment: <InputAdornment position="end">{t('hours')}</InputAdornment> } }} />
          ) : (
            <TextField select label={t('Shelf life')} value={i.shelf_life_hours} disabled={fromSquare}
              helperText={fromSquare ? t('Set in Square: the item’s Shelf life custom attribute.') : undefined}
              onChange={e => { const v = Number(e.target.value); if (v === -1) setCustom(true); else shelf(v) }}>
              {SHELF_LIVES.map(x => <MenuItem key={x.hours} value={x.hours}>{t(x.label)}</MenuItem>)}
              <MenuItem value={-1}>{t('Another length…')}</MenuItem>
            </TextField>
          )}

          <Box sx={{ p: 1.75, borderRadius: 2.5, bgcolor: tokens.surfaceAlt }}>
            <FormControlLabel label={t('Put it on offer before it goes off')} control={
              <Switch checked={i.offer_hours !== null} onChange={e => set({ offer_hours: e.target.checked ? usualLead(i.shelf_life_hours) : null })} />} />
            {i.offer_hours !== null && (
              <Stack spacing={1.75} sx={{ mt: 1 }}>
                <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap' }} role="group" aria-label={t('On offer for')}>
                  {leads.map(l => <Button key={l.hours} size="small" variant={i.offer_hours === l.hours ? 'contained' : 'outlined'} onClick={() => set({ offer_hours: l.hours })}>{t(l.label)}</Button>)}
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
                  <ToggleButtonGroup exclusive size="small" value={i.discount} onChange={(_, v: FreshItemInput['discount'] | null) => v && set({ discount: v })} aria-label={t('Discount')}>
                    <ToggleButton value="percent" sx={{ px: 1.5 }}>{t('% off')}</ToggleButton>
                    <ToggleButton value="price" sx={{ px: 1.5 }}>{t('Set price')}</ToggleButton>
                  </ToggleButtonGroup>
                  {i.discount === 'percent' ? (
                    <TextField size="small" label={t('Off the menu price')} type="number" value={i.percent_off} sx={{ width: 170 }}
                      onChange={e => set({ percent_off: Math.round(Number(e.target.value)) })}
                      slotProps={{ htmlInput: { min: 5, max: 90, step: 5 }, input: { endAdornment: <InputAdornment position="end">{'%'}</InputAdornment> } }} />
                  ) : (
                    <TextField size="small" label={t('Offer price')} value={i.price ?? ''} placeholder={t('e.g. 2 for €3')} sx={{ width: 200 }}
                      onChange={e => set({ price: e.target.value })} slotProps={{ htmlInput: { maxLength: 40 } }} />
                  )}
                </Stack>
                {preview.discount_at && (
                  <Typography variant="body2" role="status" sx={{ color: 'text.secondary' }}>
                    <OfferIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: '-3px', color: tokens.roseDeep }} />
                    {t('{discount} for {lead}. Made now: on Offers & specials from {from} until {until}, at {price}.', {
                      discount: discountWords(i) || '…', lead: leadText(i.offer_hours), from: when(preview.discount_at), until: when(goodUntil(now, i.shelf_life_hours)),
                      price: price.price || '…' })}
                  </Typography>
                )}
              </Stack>
            )}
          </Box>
          {problem && i.recipe_id && <Typography variant="body2" sx={{ color: tokens.badFg }}>{t(problem)}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {item.id && (deleting ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto' }}>
            <Typography variant="body2" sx={{ color: tokens.badFg }}>{t('Take it off the list?')}</Typography>
            <Button size="small" color="error" variant="contained" onClick={() => void remove()}>{t('Take off')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </Stack>
        ) : <Button color="error" onClick={() => setDeleting(true)} sx={{ mr: 'auto' }}>{t('Take off the list')}</Button>)}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!!problem} onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
