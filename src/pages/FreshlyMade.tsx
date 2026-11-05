import {
  Autocomplete, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, Link, MenuItem,
  Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import OfferIcon from '@mui/icons-material/LocalOfferOutlined'
import SoldIcon from '@mui/icons-material/TaskAltOutlined'
import BinIcon from '@mui/icons-material/DeleteSweepOutlined'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync, useTick } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, SectionTitle, Tag } from '../components/common'
import {
  DISCOUNT_LEADS, MAX_SHELF_HOURS, SHELF_LIVES, defaultDiscountAt, freshOfferPrice, freshProblem, freshState, goodUntil, likeLastTime, newFreshBatch,
  onCounter, shelfShare, type FreshBatch, type FreshBatchInput, type FreshState,
} from '../../shared/freshBatches'
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
  const [editing, setEditing] = useState<FreshBatchInput | null>(null)
  const list = batches.data ?? []
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
        {canRecord && (
          <Button variant="contained" startIcon={<AddIcon />} sx={{ flexShrink: 0 }}
            onClick={() => setEditing(newFreshBatch())}>{t('Record a batch')}</Button>
        )}
      </Stack>
      <ErrorBox error={batches.error} />

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

      {editing && <BatchDialog batch={editing} batches={list} menu={menu.data ?? []}
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
function BatchDialog({ batch, batches, menu, canDelete, onClose, onSaved }: {
  batch: FreshBatchInput; batches: FreshBatch[]; menu: { id: string; name: string; sell_price: number | null }[]
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

  /** A name picked or typed: the menu item it is, and (for a new batch) the last batch of it as a start. */
  const pickName = (name: string) => {
    const item = menu.find(m => m.name.toLowerCase() === name.trim().toLowerCase())
    const last = !batch.id ? likeLastTime(name, batches, b.made_at) : null
    if (last?.shelf_life_hours) setCustom(!SHELF_LIVES.some(s => s.hours === last.shelf_life_hours))
    set({ name, recipe_id: item?.id ?? null, ...(last ?? {}) })
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
