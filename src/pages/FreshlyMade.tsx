import {
  Autocomplete, Box, Button, Card, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, Link, MenuItem,
  Radio, RadioGroup, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import OfferIcon from '@mui/icons-material/LocalOfferOutlined'
import SoldIcon from '@mui/icons-material/TaskAltOutlined'
import BinIcon from '@mui/icons-material/DeleteSweepOutlined'
import RemoveIcon from '@mui/icons-material/Remove'
import ScreenIcon from '@mui/icons-material/TvOutlined'
import { useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync, useTick } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, SectionTitle, Tag } from '../components/common'
import {
  DISCOUNT_LEADS, MAX_SHELF_HOURS, OFFER_LEADS, SHELF_LIVES, batchFromItem, batchesOf, defaultDiscountAt, freshItemProblem, freshOfferPrice, freshProblem, freshState,
  goodUntil, likeLastTime, newFreshBatch, newFreshItem, onCounter, shelfShare, type FreshBatch, type FreshBatchInput, type FreshItem, type FreshItemInput, type FreshState,
  madeHere, menuShelfLife, type MadeHereItem, defaultSecondAt, discountNow, secondDiscount, batchScreens, type FreshScreenMode, type FreshScreens,
  FRESH_KINDS, freshKind, type FreshKind,
} from '../../shared/freshBatches'
import type { Screen } from '../../shared/screens'
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
/** Made here's columns, on wide screens: the item, how long it keeps, last made, the batch on the counter, its offer, and what to do. */
// The buttons' column has a set width, so the header row (which has none) divides the rest the same way.
const MADE_COLUMNS = 'minmax(0, 1.9fr) minmax(0, 0.65fr) minmax(0, 1.15fr) minmax(0, 1.8fr) minmax(0, 2fr) 150px'
/** A discount's words for an item: "30% off for its last 2 days", then ", then 50% off for its last day" when it has a second. */
function offerWords(i: Pick<FreshItem, 'offer_hours' | 'discount' | 'percent_off' | 'price' | 'offer2_hours' | 'discount2' | 'percent_off2' | 'price2'>) {
  if (i.offer_hours === null) return null
  const first = t('{discount} for {lead}', { discount: discountWords(i) || '…', lead: leadText(i.offer_hours) })
  if (i.offer2_hours == null) return first
  return t('{first}, then {second}', { first, second: t('{discount} for {lead}', { discount: discountWords(secondDiscount(i)) || '…', lead: leadText(i.offer2_hours) }) })
}
/** The usual second offer for a first one: the longest lead that's at most half of it, or the shortest below it. */
const usualSecondLead = (first: number) => [...OFFER_LEADS].reverse().find(l => l.hours <= first / 2)?.hours ?? OFFER_LEADS.find(l => l.hours < first)?.hours ?? null

/** What's saved of an item made here: one the menu suggested has no row yet, so no id. */
const itemInput = ({ id, from_square: _f, suggested, ...i }: MadeHereItem): FreshItemInput => (suggested ? i : { id, ...i })

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
  // Where an offer can show: the screens (admins'; the team gets each item's choice as it is).
  const screens = useAsync('screens', () => (isAdmin ? api.screens() : Promise.resolve([] as Screen[])), [isAdmin])
  const [editing, setEditing] = useState<FreshBatchInput | null>(null)
  const [setting, setSetting] = useState<{ item: FreshItemInput; suggested: boolean } | null>(null)
  const list = batches.data ?? []
  // The items made here with a set shelf life, as on the menu (from Square when that's where it comes from), and the menu's
  // perishables not set yet (its bakery, cakes, chia puddings), with their usual shelf life; by section and name.
  const onList = madeHere(menu.data ?? [], items.data ?? [])
  const made = onList.flatMap(i => { const m = menu.data?.find(x => x.id === i.recipe_id); return m ? [{ item: i, menu: m }] : [] })
    .sort((a, b) => (a.menu.category ?? '').localeCompare(b.menu.category ?? '') || a.menu.name.localeCompare(b.menu.name))
  // The filters: pastries, cakes, yoghurt and chia pots (and anything else, when there is some), each with how many
  // things there are of it, on the list or on the counter (each once).
  const [kind, setKind] = useState<FreshKind | 'all'>('all')
  const kindOfBatch = (b: FreshBatch) => { const m = menu.data?.find(x => x.id === b.recipe_id); return m ? freshKind(m.name, m.category) : freshKind(b.name) }
  const now = Date.now()
  const things = [...made.map(x => ({ name: x.menu.name, kind: freshKind(x.menu.name, x.menu.category) })),
    ...list.filter(b => onCounter(b, now)).map(b => ({ name: b.name, kind: kindOfBatch(b) }))]
  const howMany = (k: FreshKind | 'all') => new Set(things.filter(x => k === 'all' || x.kind === k).map(x => x.name.trim().toLowerCase())).size
  const kinds = [...FRESH_KINDS, { id: 'other' as const, label: msg('Other') }].map(k => ({ ...k, count: howMany(k.id) })).filter(k => k.id !== 'other' || k.count > 0)
  const madeShown = made.filter(x => kind === 'all' || freshKind(x.menu.name, x.menu.category) === kind)
  /** A batch of an item made now: its shelf life and offer, and as many as last time. */
  const recordOf = (i: FreshItem, m: MenuRow) => {
    const fresh = newFreshBatch()
    setEditing({ ...fresh, name: m.name, quantity: batchesOf(m, list)[0]?.quantity ?? null, ...batchFromItem(i, fresh.made_at) })
  }
  const shownBatches = list.filter(b => kind === 'all' || kindOfBatch(b) === kind)
  const counter = shownBatches.filter(b => onCounter(b, now)).sort((a, b) => a.good_until.localeCompare(b.good_until))
  const earlier = shownBatches.filter(b => !onCounter(b, now))
  const canRecord = !isPartner
  const sellPrice = (b: FreshBatch) => menu.data?.find(m => m.id === b.recipe_id)?.sell_price ?? null

  const clear = (b: FreshBatch, how: 'sold' | 'binned') => run(async () => {
    await api.saveFreshBatch({ ...inputOf(b), cleared: how })
    await batches.reload()
  }, how === 'sold' ? t('{name}: sold out', { name: b.name }) : t('{name}: thrown away', { name: b.name }))

  return (
    <Box component="section" aria-label={t('Freshly made')}>
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5, alignItems: { sm: 'center' }, justifyContent: 'space-between', mb: 2 }}>
        <Stack direction="row" role="group" aria-label={t('Show')} useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
          {[{ id: 'all' as const, label: msg('All'), count: howMany('all') }, ...kinds].map(k => (
            <Chip key={k.id} aria-pressed={kind === k.id} onClick={() => setKind(kind === k.id && k.id !== 'all' ? 'all' : k.id)}
              color={kind === k.id ? 'primary' : 'default'} variant={kind === k.id ? 'filled' : 'outlined'}
              label={<>{t(k.label)}<Box component="span" sx={{ opacity: 0.7, ml: 0.75 }}>{k.count}</Box></>} />
          ))}
        </Stack>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          {isAdmin && <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setSetting({ item: newFreshItem(), suggested: false })}>{t('Add an item')}</Button>}
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
        ) : items.data && menu.data && !madeShown.length ? (
          <Empty>{t('None of these on the list.')}</Empty>
        ) : (
          <Card sx={{ overflow: 'hidden' }}>
            {/* The columns' names, on wide screens (on narrow ones each row names its own). */}
            <Box aria-hidden sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: MADE_COLUMNS, columnGap: 2, px: 2, py: 1,
              borderBottom: `1px solid ${tokens.line}`, bgcolor: tokens.surfaceAlt }}>
              {[t('Item'), t('Keeps'), t('Last made'), t('Good until'), t('Offer'), ''].map((h, n) => (
                <Typography key={n} variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{h}</Typography>
              ))}
            </Box>
            <Box component="ul" aria-label={t('Made here')} sx={{ m: 0, p: 0, listStyle: 'none' }}>
              {madeShown.map(({ item, menu: m }) => (
                <MadeHereRow key={item.id} item={item} menu={m} batches={batchesOf(m, list)} now={now} canRecord={canRecord} canEdit={isAdmin}
                  onRecord={() => recordOf(item, m)} onEdit={() => setSetting({ item: itemInput(item), suggested: item.suggested })} />
              ))}
            </Box>
          </Card>
        )}
      </Box>

      <SectionTitle>{t('On the counter')}</SectionTitle>
      {batches.data && !counter.length ? (
        <Empty>{kind !== 'all' ? t('None of these on the counter.')
          : canRecord ? t('Nothing on the counter. Record what you make (a banana bread, the day’s sandwiches) to see how long it keeps.') : t('Nothing on the counter.')}</Empty>
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

      {setting && <ItemDialog item={setting.item} suggested={setting.suggested} items={items.data ?? []} menu={menu.data ?? []} screens={screens.data ?? []}
        taken={onList.filter(i => i.recipe_id !== setting.item.recipe_id).map(i => i.recipe_id)}
        onClose={() => setSetting(null)} onSaved={() => { setSetting(null); void items.reload() }} />}
      {editing && <BatchDialog batch={editing} batches={list} menu={menu.data ?? []} items={onList} screens={screens.data ?? []} canPickScreens={isAdmin}
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
  const markAt = (at: string | null) => (at ? (Date.parse(at) - Date.parse(b.made_at)) / Math.max(1, span) : null)
  const marks = [{ at: b.discount_at, share: markAt(b.discount_at) }, { at: b.discount2_at, share: markAt(b.discount2_at) }]
    .filter((m): m is { at: string; share: number } => m.share !== null)
  const by = profiles.find(p => p.id === b.made_by)?.full_name.split(' ')[0]
  const left = Math.max(0, Date.parse(b.good_until) - now)
  // Whole days from two days on; hours to the nearest from an hour and a half; minutes in the last of it.
  const leftText = left >= 48 * HOUR ? tn(Math.floor(left / (24 * HOUR)), '{n} day left', '{n} days left')
    : left >= 1.5 * HOUR ? tn(Math.round(left / HOUR), '{n} hour left', '{n} hours left') : tn(Math.ceil(left / 60_000), '{n} minute left', '{n} minutes left')
  // The discount on now (the second once it has started), and the one still to come.
  const on = state === 'on_offer' ? discountNow(b, now) : null
  const next = !on ? (b.discount_at ? { at: b.discount_at, d: b } : null) : on.stage === 1 && b.discount2_at ? { at: b.discount2_at, d: secondDiscount(b) } : null
  const { price, was_price } = freshOfferPrice(on ?? b, sellPrice)
  const tags = [
    on && { text: t('On offer now: {price}', { price: discountWords(on) === price ? price : `${discountWords(on)} · ${price}` }), fg: tokens.warnFg, bg: tokens.warnBg },
    next && { text: t('{discount} from {time}', { discount: discountWords(next.d), time: when(next.at) }), fg: tokens.infoFg, bg: tokens.infoBg },
  ].filter((x): x is { text: string; fg: string; bg: string } => !!x)
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
          {marks.map(m => (
            <Tooltip key={m.at} title={t('Discount from {time}', { time: when(m.at) })}>
              <Box sx={{ position: 'absolute', top: -4, bottom: -4, width: 3, borderRadius: 1, bgcolor: tokens.ink, left: `calc(${m.share * 100}% - 1.5px)` }} />
            </Tooltip>
          ))}
        </Box>
        <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{leftText}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('Good until {time}', { time: when(b.good_until) })}</Typography>
        </Stack>
      </Box>

      <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
        {state !== 'on_offer' && <Tag fg={STATE[state].fg} bg={STATE[state].bg}>{t(STATE[state].label)}</Tag>}
        {tags.map((x, n) => {
          const tag = <Tag fg={x.fg} bg={x.bg}><OfferIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: '-2px' }} />{x.text}</Tag>
          return (
            <Box key={x.text} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
              {offerLink ? <Link component={RouterLink} to="/offers" underline="none" aria-label={t('{offer}, on Offers & specials', { offer: x.text })}>{tag}</Link> : tag}
              {n === 0 && on && was_price && <Typography variant="caption" component="s" sx={{ color: 'text.secondary' }}>{was_price}</Typography>}
            </Box>
          )
        })}
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
function BatchDialog({ batch, batches, menu, items, screens, canPickScreens, canDelete, onClose, onSaved }: {
  batch: FreshBatchInput; batches: FreshBatch[]; menu: { id: string; name: string; sell_price: number | null }[]; items: FreshItem[]
  screens: Screen[]; canPickScreens: boolean; canDelete: boolean; onClose: () => void; onSaved: () => void
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
  const preview2 = freshOfferPrice(secondDiscount(b), sell)
  const problem = freshProblem(b)
  // The lead buttons: so long before the end, inside its shelf life (the second's after the first's start).
  const leadsFor = (after: string | null) => DISCOUNT_LEADS.filter(l => l.hours < b.shelf_life_hours)
    .map(l => ({ ...l, at: new Date(Date.parse(until) - l.hours * HOUR).toISOString() }))
    .filter(l => !after || Date.parse(l.at) > Date.parse(after))
  /** The first discount moved: a second that no longer comes after it moves to halfway between it and the end. */
  const setFirst = (at: string) => set({ discount_at: at,
    ...(b.discount2_at && Date.parse(b.discount2_at) <= Date.parse(at) ? { discount2_at: defaultSecondAt({ ...b, discount_at: at }) } : {}) })

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
  /** A new shelf life or time made: each discount keeps its distance from the end. */
  const reshape = (p: Pick<FreshBatchInput, 'made_at' | 'shelf_life_hours'>) => {
    const was = Date.parse(goodUntil(b.made_at, b.shelf_life_hours)), end = Date.parse(goodUntil(p.made_at, p.shelf_life_hours))
    const move = (at: string | null) => (at === null ? null : new Date(Math.max(Date.parse(p.made_at), Math.min(end - 60_000, end - (was - Date.parse(at))))).toISOString())
    const first = move(b.discount_at), second = move(b.discount2_at)
    set({ ...p, discount_at: first, discount2_at: first && second && second > first ? second : null })
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
            <CountField value={b.quantity} onChange={quantity => set({ quantity })} />
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

          <Box sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2.5, bgcolor: tokens.surfaceAlt }}>
            <FormControlLabel sx={{ m: 0, gap: 1.25 }} label={t('Put it on offer before it goes off')} control={
              <Switch checked={!!b.discount_at}
                onChange={e => set(e.target.checked ? { discount_at: defaultDiscountAt(b.made_at, b.shelf_life_hours || 1) } : { discount_at: null, discount2_at: null })} />} />
            {b.discount_at && (
              <Stack spacing={2} sx={{ mt: 2 }}>
                <TextField label={t('Discount from')} type="datetime-local" value={toField(b.discount_at)}
                  onChange={e => e.target.value && setFirst(fromField(e.target.value))} slotProps={{ inputLabel: { shrink: true } }} />
                <LeadButtons label={t('Start the discount')} leads={leadsFor(null)} chosen={b.discount_at} onPick={setFirst} />
                <DiscountValue kind={b.discount} percent={b.percent_off} price={b.price} onChange={p => set(p)} />
                {b.discount2_at ? (
                  <Box component="section" aria-label={t('Then a bigger discount')} sx={{ pt: 2, borderTop: `1px solid ${tokens.line}` }}>
                    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                      <Typography sx={{ fontWeight: 600 }}>{t('Then a bigger discount')}</Typography>
                      <Button size="small" color="error" onClick={() => set({ discount2_at: null })} aria-label={t('Remove the second discount')}>{t('Remove')}</Button>
                    </Stack>
                    <Stack spacing={2}>
                      <TextField label={t('Then from')} type="datetime-local" value={toField(b.discount2_at)}
                        onChange={e => e.target.value && set({ discount2_at: fromField(e.target.value) })} slotProps={{ inputLabel: { shrink: true } }} />
                      <LeadButtons label={t('Start the second discount')} leads={leadsFor(b.discount_at)} chosen={b.discount2_at} onPick={at => set({ discount2_at: at })} />
                      <DiscountValue second kind={b.discount2} percent={b.percent_off2} price={b.price2}
                        onChange={p => set({ discount2: p.discount, percent_off2: p.percent_off, price2: p.price })} />
                    </Stack>
                  </Box>
                ) : defaultSecondAt(b) && (
                  <Button size="small" startIcon={<AddIcon />} sx={{ alignSelf: 'flex-start' }} onClick={() => set({ discount2_at: defaultSecondAt(b) })}>
                    {t('Add another discount')}
                  </Button>
                )}
                <Typography variant="body2" role="status" sx={{ color: 'text.secondary' }}>
                  <OfferIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: '-3px', color: tokens.roseDeep }} />
                  {preview.was_price
                    ? t('On Offers & specials from {from} until {until}: {price}, was {was}.', { from: when(b.discount_at), until: when(b.discount2_at ?? until), price: preview.price || '…', was: preview.was_price })
                    : t('On Offers & specials from {from} until {until}: {price}.', { from: when(b.discount_at), until: when(b.discount2_at ?? until), price: preview.price || '…' })}
                  {b.discount2_at && ` ${preview2.was_price
                    ? t('Then from {from} until {until}: {price}, was {was}.', { from: when(b.discount2_at), until: when(until), price: preview2.price || '…', was: preview2.was_price })
                    : t('Then from {from} until {until}: {price}.', { from: when(b.discount2_at), until: when(until), price: preview2.price || '…' })}`}
                </Typography>
                <BatchScreens b={b} items={items} screens={screens} canPick={canPickScreens} onChange={set} />
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

/** A Made here cell: its value, with its column's name in front on narrow screens (the header row names it on wide ones). */
function Cell({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <Typography variant="body2" component="div" sx={{ minWidth: 0 }}>
      {label && <Box component="span" sx={{ display: { md: 'none' }, color: 'text.secondary' }}>{label}{' '}</Box>}
      {children}
    </Typography>
  )
}

/** One item made here: how long it keeps, when it was last made (and by whom), the batch on the counter, its offer, and what to do. */
function MadeHereRow({ item, menu, batches, now, canRecord, canEdit, onRecord, onEdit }: {
  item: MadeHereItem; menu: MenuRow; batches: FreshBatch[]; now: number; canRecord: boolean; canEdit: boolean; onRecord: () => void; onEdit: () => void
}) {
  const { profiles } = useApp()
  const last = batches[0]
  const by = last && profiles.find(p => p.id === last.made_by)?.full_name.split(' ')[0]
  const offer = offerWords(item)
  // The batch on the counter: until when, and its offer on now or still to come.
  const counter = last && onCounter(last, now) ? last : null
  const on = counter && discountNow(counter, now)
  const next = counter && !on ? counter.discount_at : null
  return (
    <Box component="li" aria-label={menu.name} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: MADE_COLUMNS }, columnGap: 2, rowGap: 0.5,
      alignItems: 'center', px: 2, py: 1.5, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" useFlexGap sx={{ gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 600 }}>{menu.name}</Typography>
          {item.from_square && <Tag fg={tokens.neutralFg} bg={tokens.neutralBg}>{t('From Square')}</Tag>}
          {item.suggested && <Tag fg={tokens.infoFg} bg={tokens.infoBg}>{t('From the menu')}</Tag>}
        </Stack>
        {menu.category && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t(menu.category)}</Typography>}
      </Box>
      <Cell label={t('Keeps')}>{shelfText(item.shelf_life_hours)}</Cell>
      {last
        ? <Cell label={t('Last made')}>{by ? t('{time} by {name}', { time: when(last.made_at), name: by }) : when(last.made_at)}</Cell>
        : <Cell><Box component="span" sx={{ color: 'text.secondary' }}>{t('Not made yet')}</Box></Cell>}
      <Cell label={counter ? t('Good until') : undefined}>
        {counter ? (
          <>
            {when(counter.good_until)}
            {/* Its offer under it: on now, or from when. */}
            {(on || next) && (
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, fontSize: '0.78rem', fontWeight: 500,
                color: on ? tokens.warnFg : tokens.infoFg }}>
                <OfferIcon sx={{ fontSize: 14 }} />{on ? t('On offer now') : t('Offer from {time}', { time: when(next!) })}
              </Box>
            )}
          </>
        ) : <Box component="span" sx={{ color: 'text.secondary', display: { xs: 'none', md: 'inline' } }}>{'—'}</Box>}
      </Cell>
      <Cell label={t('Offer')}><Box component="span" sx={{ color: offer ? 'text.primary' : 'text.secondary' }}>{offer ?? t('No offer')}</Box></Cell>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifySelf: { xs: 'start', md: 'end' }, mt: { xs: 0.5, md: 0 } }}>
        {canRecord && <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onRecord} aria-label={t('Record a batch of {name}', { name: menu.name })}>{t('Record')}</Button>}
        {canEdit && (
          <Tooltip title={t('Edit')}>
            <IconButton size="small" aria-label={t('Shelf life and offer of {name}', { name: menu.name })} onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
          </Tooltip>
        )}
      </Stack>
    </Box>
  )
}

/** How many were made: a number, with one fewer and one more either side of it. */
function CountField({ value, onChange }: { value: number | null; onChange: (n: number | null) => void }) {
  const step = (d: number) => onChange(Math.max(1, Math.min(10_000, (value ?? 0) + d)))
  return (
    <TextField label={t('How many')} type="number" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      sx={{ width: { xs: '100%', sm: 176 }, flexShrink: 0, '& input': { textAlign: 'center', MozAppearance: 'textfield' },
        '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': { WebkitAppearance: 'none', m: 0 } }}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: { min: 1, max: 10_000, step: 1, inputMode: 'numeric' },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <IconButton size="small" edge="start" aria-label={t('One fewer')} disabled={!value || value <= 1} onClick={() => step(-1)}><RemoveIcon fontSize="small" /></IconButton>
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" edge="end" aria-label={t('One more')} onClick={() => step(1)}><AddIcon fontSize="small" /></IconButton>
            </InputAdornment>
          ),
        },
      }} />
  )
}

/** When a discount starts, as buttons: so long before it has to be gone. */
function LeadButtons({ label, leads, chosen, onPick }: { label: string; leads: { hours: number; label: string; at: string }[]; chosen: string | null; onPick: (at: string) => void }) {
  if (!leads.length) return null
  return (
    <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap', mt: '8px !important' }} role="group" aria-label={label}>
      {leads.map(l => <Button key={l.hours} size="small" variant={chosen === l.at ? 'contained' : 'outlined'} onClick={() => onPick(l.at)}>{t(l.label)}</Button>)}
    </Stack>
  )
}

/** What a discount takes off: a % off the menu price, or a set price ("2 for €3"). The second's fields say "then". */
function DiscountValue({ second, kind, percent, price, onChange }: {
  second?: boolean; kind: 'percent' | 'price'; percent: number; price: string | null
  onChange: (p: { discount: 'percent' | 'price'; percent_off: number; price: string | null }) => void
}) {
  const now = { discount: kind, percent_off: percent, price }
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
      <ToggleButtonGroup exclusive size="small" value={kind} onChange={(_, v: 'percent' | 'price' | null) => v && onChange({ ...now, discount: v })}
        aria-label={second ? t('Second discount') : t('Discount')}>
        <ToggleButton value="percent" sx={{ px: 1.5 }}>{t('% off')}</ToggleButton>
        <ToggleButton value="price" sx={{ px: 1.5 }}>{t('Set price')}</ToggleButton>
      </ToggleButtonGroup>
      {kind === 'percent' ? (
        <TextField size="small" label={second ? t('Then off the menu price') : t('Off the menu price')} type="number" value={percent} sx={{ width: 200 }}
          onChange={e => onChange({ ...now, percent_off: Math.round(Number(e.target.value)) })}
          slotProps={{ htmlInput: { min: 5, max: 90, step: 5 }, input: { endAdornment: <InputAdornment position="end">{'%'}</InputAdornment> } }} />
      ) : (
        <TextField size="small" label={second ? t('Then the offer price') : t('Offer price')} value={price ?? ''} placeholder={t('e.g. 2 for €3')} sx={{ width: 200 }}
          onChange={e => onChange({ ...now, price: e.target.value })} slotProps={{ htmlInput: { maxLength: 40 } }} />
      )}
    </Stack>
  )
}

/**
 * An item made here (admins): the menu item, how long it keeps (Square's, when it has it) and its offer before it has to be
 * gone. One the menu suggested is saved the first time it's set; one taken off the list stays off when the menu or Square
 * would put it back, and picking it again puts it back as it was.
 */
function ItemDialog({ item, suggested, items, menu, screens, taken, onClose, onSaved }: {
  item: FreshItemInput; suggested: boolean; items: FreshItem[]; menu: MenuRow[]; screens: Screen[]; taken: string[]; onClose: () => void; onSaved: () => void
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
  const fromSquare = !!items.find(x => x.id === i.id)?.from_square
  const isNew = !item.recipe_id
  const problem = freshItemProblem(i)
  const leads = OFFER_LEADS.filter(l => l.hours < i.shelf_life_hours)
  /** The usual offer for a shelf life: the longest of the leads that's at most a quarter of it, or the shortest. */
  const usualLead = (hours: number) => [...OFFER_LEADS].reverse().find(l => l.hours <= hours / 4)?.hours ?? OFFER_LEADS.find(l => l.hours < hours)?.hours ?? null
  /** A first offer chosen: a second that no longer fits inside it moves to the usual one for it (none without a first). */
  const withFirst = (first: number | null) => ({ offer_hours: first,
    offer2_hours: first === null || i.offer2_hours == null ? null : i.offer2_hours < first ? i.offer2_hours : usualSecondLead(first) })
  const shelf = (hours: number) => set({ shelf_life_hours: hours, ...withFirst(i.offer_hours === null ? null : i.offer_hours < hours ? i.offer_hours : usualLead(hours)) })
  const leads2 = i.offer_hours === null ? [] : OFFER_LEADS.filter(l => l.hours < i.offer_hours!)
  /** A menu item picked to add: as it was when it was taken off the list, or keeping as long as the menu says it usually does. */
  const pick = (m: MenuRow | null) => {
    const was = m && items.find(x => x.recipe_id === m.id && !x.made_here)
    const hours = m && !was ? menuShelfLife(m) : null
    if (was) { const { from_square: _f, ...rest } = was; setI({ ...rest, made_here: true }); setCustom(!SHELF_LIVES.some(s => s.hours === was.shelf_life_hours)); return }
    set({ id: undefined, recipe_id: m?.id ?? '', made_here: true })
    if (hours) { shelf(hours); setCustom(false) }
  }
  // What a batch made now would do.
  const now = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString()
  const preview = batchFromItem(i, now)
  const price = freshOfferPrice(i, picked?.sell_price ?? null)
  const price2 = freshOfferPrice(secondDiscount(i), picked?.sell_price ?? null)
  const end = goodUntil(now, i.shelf_life_hours)

  const save = async () => {
    const ok = await run(async () => {
      if (problem) throw new Error(t(problem))
      await api.saveFreshItem({ ...i, price: i.price?.trim() || null, price2: i.price2?.trim() || null })
    }, t('Saved {name}', { name: picked?.name ?? '' }))
    if (ok) onSaved()
  }
  // Taken off the list: kept as not made here when the menu or Square would put it back, else deleted.
  const keepOff = suggested || fromSquare || (picked ? menuShelfLife(picked) !== null : false)
  const remove = async () => {
    if (await run(() => (keepOff ? api.saveFreshItem({ ...item, made_here: false }).then(() => undefined) : api.deleteFreshItem(item.id!)),
      t('{name} taken off the list', { name: picked?.name ?? '' }))) onSaved()
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone} aria-labelledby="fresh-item-title">
      <DialogTitle id="fresh-item-title">{!isNew && picked ? picked.name : t('Add an item')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {isNew && (
            <Autocomplete options={options} value={picked} onChange={(_, m) => pick(m)} getOptionLabel={m => m.name}
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

          <Box sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2.5, bgcolor: tokens.surfaceAlt }}>
            <FormControlLabel sx={{ m: 0, gap: 1.25 }} label={t('Put it on offer before it goes off')} control={
              <Switch checked={i.offer_hours !== null} onChange={e => set(withFirst(e.target.checked ? usualLead(i.shelf_life_hours) : null))} />} />
            {i.offer_hours !== null && (
              <Stack spacing={2} sx={{ mt: 2 }}>
                <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap' }} role="group" aria-label={t('On offer for')}>
                  {leads.map(l => <Button key={l.hours} size="small" variant={i.offer_hours === l.hours ? 'contained' : 'outlined'} onClick={() => set(withFirst(l.hours))}>{t(l.label)}</Button>)}
                </Stack>
                <DiscountValue kind={i.discount} percent={i.percent_off} price={i.price} onChange={p => set(p)} />
                {i.offer2_hours != null ? (
                  <Box component="section" aria-label={t('Then a bigger discount')} sx={{ pt: 2, borderTop: `1px solid ${tokens.line}` }}>
                    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                      <Typography sx={{ fontWeight: 600 }}>{t('Then a bigger discount')}</Typography>
                      <Button size="small" color="error" onClick={() => set({ offer2_hours: null })} aria-label={t('Remove the second discount')}>{t('Remove')}</Button>
                    </Stack>
                    <Stack spacing={2}>
                      <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap' }} role="group" aria-label={t('Then on offer for')}>
                        {leads2.map(l => <Button key={l.hours} size="small" variant={i.offer2_hours === l.hours ? 'contained' : 'outlined'} onClick={() => set({ offer2_hours: l.hours })}>{t(l.label)}</Button>)}
                      </Stack>
                      <DiscountValue second kind={i.discount2} percent={i.percent_off2} price={i.price2}
                        onChange={p => set({ discount2: p.discount, percent_off2: p.percent_off, price2: p.price })} />
                    </Stack>
                  </Box>
                ) : leads2.length > 0 && (
                  <Button size="small" startIcon={<AddIcon />} sx={{ alignSelf: 'flex-start' }} onClick={() => set({ offer2_hours: usualSecondLead(i.offer_hours!) })}>
                    {t('Add another discount')}
                  </Button>
                )}
                {preview.discount_at && (
                  <Typography variant="body2" role="status" sx={{ color: 'text.secondary' }}>
                    <OfferIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: '-3px', color: tokens.roseDeep }} />
                    {t('{discount} for {lead}. Made now: on Offers & specials from {from} until {until}, at {price}.', {
                      discount: discountWords(i) || '…', lead: leadText(i.offer_hours), from: when(preview.discount_at), until: when(preview.discount2_at ?? end),
                      price: price.price || '…' })}
                    {preview.discount2_at && i.offer2_hours != null && ` ${t('Then {discount} for {lead}: from {from}, at {price}.', {
                      discount: discountWords(secondDiscount(i)) || '…', lead: leadText(i.offer2_hours), from: when(preview.discount2_at), price: price2.price || '…' })}`}
                  </Typography>
                )}
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{t('On the screens')}</Typography>
                  <OfferScreens value={{ screen_ids: i.screen_ids, screen_mode: i.screen_mode }} screens={screens} onChange={set} />
                </Box>
              </Stack>
            )}
          </Box>
          {problem && i.recipe_id && <Typography variant="body2" sx={{ color: tokens.badFg }}>{t(problem)}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {!isNew && (deleting ? (
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

/** Where an offer shows, in words: "Every screen that’s on", "Window TV, on its own", "Not on a screen". */
function whereText(c: FreshScreens, screens: Screen[]) {
  if (c.screen_mode === 'none') return t('Not on a screen')
  const names = c.screen_ids.flatMap(id => screens.find(s => s.id === id)?.name ?? [])
  // Picked screens that are all gone show it on every screen that's on (as the database does); the team can't see their names.
  const where = !c.screen_ids.length || (screens.length && !names.length) ? t('Every screen that’s on') : names.length ? names.join(', ') : t('The screens picked for it')
  return c.screen_mode === 'only' ? t('{screens}, on its own', { screens: where }) : where
}

/** Which screens an offer shows on, and how: in turn with each screen's slides, on its own, or on none (it's still on Offers & specials). */
function OfferScreens({ value, screens, onChange }: { value: FreshScreens; screens: Screen[]; onChange: (v: FreshScreens) => void }) {
  return (
    <Stack spacing={0.5}>
      <RadioGroup value={value.screen_mode} onChange={e => onChange({ ...value, screen_mode: e.target.value as FreshScreenMode })} aria-label={t('How it shows')}>
        <FormControlLabel value="turns" control={<Radio size="small" />} label={t('In turn with the screen’s other slides')} />
        <FormControlLabel value="only" control={<Radio size="small" />} label={t('On its own: the screen shows only this offer until it ends')} />
        <FormControlLabel value="none" control={<Radio size="small" />} label={t('Not on the screens (it’s still on Offers & specials)')} />
      </RadioGroup>
      {value.screen_mode !== 'none' && (screens.length ? <>
        <FormControlLabel label={t('Every screen that’s on')} control={<Checkbox size="small" checked={!value.screen_ids.length}
          onChange={e => onChange({ ...value, screen_ids: e.target.checked ? [] : [(screens.find(x => x.active) ?? screens[0]).id] })} />} />
        {!!value.screen_ids.length && (
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', columnGap: 1, pl: 3 }} role="group" aria-label={t('Screens')}>
            {screens.map(x => (
              <FormControlLabel key={x.id} label={x.name} control={<Checkbox size="small" checked={value.screen_ids.includes(x.id)}
                onChange={e => onChange({ ...value, screen_ids: e.target.checked ? [...value.screen_ids, x.id] : value.screen_ids.filter(id => id !== x.id) })} />} />
            ))}
          </Stack>
        )}
      </> : (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('No screens yet.')} <Button size="small" component={RouterLink} to="/screens">{t('Add one on Screens')}</Button>
        </Typography>
      ))}
    </Stack>
  )
}

/** Where a batch's offer shows: as its item says, unless an admin changes it for this batch. */
function BatchScreens({ b, items, screens, canPick, onChange }: {
  b: FreshBatchInput; items: FreshItem[]; screens: Screen[]; canPick: boolean; onChange: (p: Pick<FreshBatchInput, 'screen_ids' | 'screen_mode'>) => void
}) {
  const own = b.screen_mode !== null
  const choice = batchScreens(b, items)
  return (
    <Box>
      <Stack direction="row" useFlexGap sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          <ScreenIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: '-3px' }} />{t('On the screens: {where}', { where: whereText(choice, screens) })}
        </Typography>
        {canPick && (own
          ? <Button size="small" onClick={() => onChange({ screen_ids: null, screen_mode: null })}>{t('As usual for it')}</Button>
          : <Button size="small" onClick={() => onChange({ ...choice })}>{t('Change for this batch')}</Button>)}
      </Stack>
      {canPick && own && <OfferScreens value={choice} screens={screens} onChange={onChange} />}
    </Box>
  )
}
