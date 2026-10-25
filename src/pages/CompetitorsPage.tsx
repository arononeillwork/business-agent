import {
  Alert, Box, Button, Card, CardContent, Chip, FormControlLabel, IconButton, Link, List, Menu, MenuItem, Stack, Switch, Tab, Table, TableBody, TableCell, TableHead,
  TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import OpenIcon from '@mui/icons-material/OpenInNew'
import GoodIcon from '@mui/icons-material/CheckCircleOutlined'
import WarnIcon from '@mui/icons-material/ErrorOutlineOutlined'
import InfoIcon from '@mui/icons-material/InfoOutlined'
import YesIcon from '@mui/icons-material/Check'
import NoIcon from '@mui/icons-material/Close'
import UpIcon from '@mui/icons-material/ArrowUpward'
import DownIcon from '@mui/icons-material/ArrowDownward'
import { useState, type MouseEvent } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton, toEnter } from '../components/tables'
import { ScatterChart } from '../components/charts'
import { Freshness, ago } from '../components/Freshness'
import {
  AddCompetitorDialog, BasketDialog, CompetitorDialog, NoteDialog, PlaceRow, PlaceSearch, PricesDialog, distanceLabel, oneDecimal, placeName, stars,
} from '../components/competitorDialogs'
import type { ExportTable } from '../lib/export'
import {
  BASKET, FEATURE_GROUPS, FEATURES, IDEA_STATUSES, KINDS, NOTE_KINDS, RADII, THREATS, analyse, featuresOf, hoursOf, insights, matchRecipe, priceLevelLabel,
  walkMinutes, type Analysis, type Competitor, type CompetitorData, type CompetitorInput, type CompetitorKind, type CompetitorNoteInput, type Feature,
  type Insight, type NearbyPlace, type Threat,
} from '../../shared/localCompetitors'
import type { DayKey, OpeningHours } from '../../shared/types'
import { formatLocal, formatMoney, today } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t, tn } from '../i18n'

type View = 'places' | 'prices' | 'offer' | 'google' | 'notes' | 'nearby'

const day = (d: string) => formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy')
const kindLabel = (k: CompetitorKind) => t(KINDS.find(x => x.id === k)?.label ?? 'Other')
const threatLabel = (x: Threat) => t(THREATS.find(y => y.id === x)!.label)
const THREAT_TONE: Record<Threat, { fg: string; bg: string }> = {
  high: { fg: tokens.badFg, bg: tokens.badBg }, medium: { fg: tokens.warnFg, bg: tokens.warnBg }, low: { fg: tokens.neutralFg, bg: tokens.neutralBg },
}
const TONE = {
  good: { Icon: GoodIcon, colour: tokens.goodFg }, warn: { Icon: WarnIcon, colour: tokens.warnFg }, info: { Icon: InfoIcon, colour: tokens.infoFg },
}
/** Prices against the area: 100 is the average, shown as "+7%" or "−4%". */
const vsArea = (index: number | null) => (index === null ? '–' : index === 100 ? '±0%' : `${index > 100 ? '+' : '−'}${Math.abs(index - 100)}%`)
/** The findings, by area. */
const AREAS: { id: Insight['area']; label: string }[] = [
  { id: 'prices', label: msg('Prices') }, { id: 'offer', label: msg('What they offer') }, { id: 'hours', label: msg('Opening hours') },
  { id: 'google', label: msg('Google') }, { id: 'nearby', label: msg('Nearby') },
]
const sayIt = (i: Insight) => (i.count !== undefined && i.plural ? tn(i.count, i.text, i.plural, i.vars) : t(i.text, i.vars))
const WEEKDAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri']
/** "07:30–19:00" over some days (the earliest opening, the latest close), "Closed", or "–" when not known. */
function hoursLabel(h: OpeningHours | null, days: DayKey[]) {
  if (!h || !Object.values(h).some(Boolean)) return '–'
  const open = days.map(d => h[d]).filter((x): x is { open: string; close: string } => !!x)
  if (!open.length) return t('Closed')
  return `${open.map(x => x.open).sort()[0]}–${open.map(x => x.close).sort().at(-1)}`
}

/**
 * Competitors (Marketing): the cafés around the business, followed over time. What each one charges
 * for the same basket (yours from Menu costing), what it offers, its hours and its Google rating, with
 * what it all means for the business in plain words; notes from visits and ideas worth borrowing; and
 * what Google lists nearby, looked at again every week. Admins only (the database enforces it too).
 */
export function CompetitorsPage() {
  const { isAdmin, isPartner, api, business } = useApp()
  const canEdit = isAdmin && !isPartner
  const data = useAsync('competitors', () => (canEdit ? api.competitors() : Promise.resolve(null)), [canEdit])
  const recipes = useAsync('competitor-recipes', () => (canEdit ? api.recipes() : Promise.resolve([])), [canEdit])
  const google = useAsync('competitor-google', () => (canEdit ? api.competitorGoogle() : Promise.resolve({ places: false, own_place: false })), [canEdit])
  const run = useAction()
  const [view, setView] = useState<View>('places')
  const [editing, setEditing] = useState<(CompetitorInput & Partial<Competitor>) | null>(null)
  const [adding, setAdding] = useState(false)
  const [pricing, setPricing] = useState<{ competitor_id?: string; item_id?: string } | null>(null)
  const [basket, setBasket] = useState(false)
  const [noting, setNoting] = useState<CompetitorNoteInput | null>(null)

  if (!canEdit) {
    return <>
      <PageHeader eyebrow={t('Marketing')} title={t('Competitors')} />
      <Alert severity="info">{t('Competitors are only visible to admins.')}</Alert>
    </>
  }

  const now = today()
  const d = data.data
  const menu = recipes.data ?? []
  const a = d ? analyse(d, menu, business?.opening_hours ?? null, now) : null
  const found = a ? insights(a, { money: formatMoney, rating: oneDecimal, label: s => t(s) }) : []
  const places = !!google.data?.places
  const newNote = (p: Partial<CompetitorNoteInput> = {}) => setNoting({ competitor_id: null, kind: 'visit', text: '', observed_on: now, status: null, ...p })
  const usualBasket = () => run(async () => {
    for (const [i, name] of BASKET.entries()) await api.savePriceItem({ name: t(name), recipe_id: matchRecipe(t(name), menu)?.id ?? null, sort: i + 1 })
  }, tn(BASKET.length, '{n} item added', '{n} items added'))
  const follow = (p: NearbyPlace) => run(() => api.followPlace(p.place_id), t('Following {name}', { name: p.name }))

  const nearest = a?.rivals.filter(c => c.distance_m !== null).sort((x, y) => x.distance_m! - y.distance_m!)[0]
  const mine = a?.ratings.find(r => r.competitor.is_self)
  const rated = a?.ratings.filter(r => !r.competitor.is_self && r.rating !== null) ?? []
  const higher = mine?.rating != null ? rated.filter(r => r.rating! > mine.rating!).length : 0
  const latest = a?.changes[0]
  const itemName = (id: string) => d?.items.find(i => i.id === id)?.name ?? ''
  const nameOf = (id: string) => d?.competitors.find(c => c.id === id)?.name ?? ''

  const table = (): ExportTable => ({
    title: t('Competitors’ prices'), filename: `competitor-prices-${now}`,
    columns: [t('Item'), t('You'), ...(a?.rivals.map(c => c.name) ?? []), t('Area average'), t('Cheapest'), t('Dearest')],
    rows: (a?.rows ?? []).map(r => [r.item.name, r.ours?.price ?? '', ...(a?.rivals.map(c => r.cells[c.id]?.price ?? '') ?? []), r.avg ?? '', r.min ?? '', r.max ?? '']),
    money: Array.from({ length: (a?.rivals.length ?? 0) + 4 }, (_, i) => i + 1),
  })

  return (
    <>
      <PageHeader eyebrow={t('Marketing')} title={t('Competitors')} actions={<>
        <ExportButton table={table} disabled={!a?.rows.length} folder="Competitors" />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>{t('Add a competitor')}</Button>
      </>} />
      <ErrorBox error={data.error} />

      <StatGrid>
        <StatTile label={t('Following')} value={a ? a.rivals.length : '–'}
          note={nearest ? t('Nearest: {name}, {distance}', { name: nearest.name, distance: distanceLabel(nearest.distance_m) }) : t('None yet')} />
        <StatTile label={t('Your prices')} value={a ? vsArea(a.ourIndex.index) : '–'}
          note={a?.ourIndex.items ? tn(a.ourIndex.items, 'against the area, on {n} item', 'against the area, on {n} items') : t('Add prices to compare')} />
        <StatTile label={t('Google rating')} value={stars(mine?.rating ?? null)}
          note={!rated.length || mine?.rating == null ? t('Not compared yet') : higher ? tn(higher, '{n} place nearby rates higher', '{n} places nearby rate higher') : t('The highest of the places you follow')} />
        <StatTile label={t('Price changes')} value={a ? a.changes.length : '–'}
          note={latest ? t('Latest: {name}, {item} {from} → {to}', { name: nameOf(latest.competitor_id), item: itemName(latest.item_id), from: formatMoney(latest.from), to: formatMoney(latest.to) })
            : t('None in the last 90 days')} />
      </StatGrid>

      {a && (
        <Card component="section" aria-label={t('What it means for you')} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle>{t('What it means for you')}</SectionTitle>
            {found.length === 0
              ? <Empty>{t('Follow the cafés around you and add a few of their prices: what it means for you shows here.')}</Empty>
              : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, columnGap: 4, rowGap: 2.5 }}>
                  {AREAS.filter(g => found.some(i => i.area === g.id)).map(g => (
                    <Box key={g.id} role="group" aria-label={t(g.label)}>
                      <Typography variant="overline" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>{t(g.label)}</Typography>
                      <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                        {found.filter(i => i.area === g.id).map((i, n) => {
                          const { Icon, colour } = TONE[i.tone]
                          return (
                            <Stack component="li" key={n} direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
                              <Icon sx={{ color: colour, fontSize: 20, mt: '1px' }} aria-label={i.tone === 'good' ? t('Good') : i.tone === 'warn' ? t('Worth a look') : t('Good to know')} />
                              <Typography variant="body2">{sayIt(i)}</Typography>
                            </Stack>
                          )
                        })}
                      </Stack>
                    </Box>
                  ))}
                </Box>}
          </CardContent>
        </Card>
      )}

      <Tabs value={view} onChange={(_, v: View) => setView(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: `1px solid ${tokens.line}` }}>
        <Tab value="places" label={t('Places')} />
        <Tab value="prices" label={t('Prices')} />
        <Tab value="offer" label={t('What they offer')} />
        <Tab value="google" label={t('Google')} />
        <Tab value="notes" label={t('Notes & ideas')} />
        <Tab value="nearby" label={`${t('Nearby')}${a?.untracked.length ? ` (${a.untracked.length})` : ''}`} />
      </Tabs>

      {!a || !d ? <Empty>{t('Loading…')}</Empty> : <>
        {view === 'places' && <PlacesView a={a} d={d} ownHours={business?.opening_hours ?? null} onEdit={setEditing} onAdd={() => setAdding(true)} onNearby={() => setView('nearby')} />}
        {view === 'prices' && <PricesView a={a} d={d} onRecord={setPricing} onBasket={() => setBasket(true)} onUsual={() => void usualBasket()} />}
        {view === 'offer' && <OfferView a={a} ownHours={business?.opening_hours ?? null} />}
        {view === 'google' && <GoogleView a={a} places={places} />}
        {view === 'notes' && <NotesView d={d} onNote={newNote} onEdit={n => setNoting(n)} />}
        {view === 'nearby' && <NearbyView a={a} d={d} places={places} onFollow={p => void follow(p)} />}
      </>}

      {adding && <AddCompetitorDialog google={places} onClose={() => setAdding(false)} onFollowed={() => setAdding(false)}
        onByHand={() => { setAdding(false); setEditing({ name: '', kind: 'cafe', threat: 'medium', active: true }) }} />}
      {editing && <CompetitorDialog competitor={editing} google={places} onClose={() => setEditing(null)} />}
      {pricing && d && <PricesDialog data={d} start={pricing} onClose={() => setPricing(null)} />}
      {basket && d && <BasketDialog data={d} recipes={menu} onClose={() => setBasket(false)} />}
      {noting && d && <NoteDialog note={noting} data={d} onClose={() => setNoting(null)} />}
    </>
  )
}

/** Every place followed (you first), how much it competes, its rating, prices and hours, and what it does well or not. */
function PlacesView({ a, d, ownHours, onEdit, onAdd, onNearby }: {
  a: Analysis; d: CompetitorData; ownHours: OpeningHours | null; onEdit: (c: Competitor) => void; onAdd: () => void; onNearby: () => void
}) {
  const order: Record<Threat, number> = { high: 0, medium: 1, low: 2 }
  const rows = [...(a.self ? [a.self] : []), ...[...a.rivals].sort((x, y) => order[x.threat ?? 'low'] - order[y.threat ?? 'low'] || (x.distance_m ?? 1e9) - (y.distance_m ?? 1e9))]
  const stopped = d.competitors.filter(c => !c.is_self && !c.active)
  const rating = (c: Competitor) => a.ratings.find(r => r.competitor.id === c.id)
  const index = (c: Competitor) => (c.is_self ? a.ourIndex : a.rivalIndex.get(c.id) ?? { index: null, items: 0 })
  return (
    <Card component="section" aria-label={t('Places followed')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('Places followed')}</SectionTitle>
        {a.rivals.length === 0
          ? <Empty>
              <Typography sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}>{t('Follow the cafés around you')}</Typography>
              <Typography variant="body2" sx={{ mb: 1.5 }}>{t('Find them on Google, or add them by hand, then compare prices, what they offer and how they do.')}</Typography>
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
                <Button variant="outlined" onClick={onNearby}>{t('See what’s nearby')}</Button>
                <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd}>{t('Add a competitor')}</Button>
              </Stack>
            </Empty>
          : <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell>{t('Place')}</TableCell><TableCell>{t('Competes')}</TableCell><TableCell>{t('Google')}</TableCell>
                  <TableCell>{t('Price vs area')}</TableCell><TableCell>{t('Weekdays')}</TableCell><TableCell />
                </TableRow></TableHead>
                <TableBody>
                  {rows.map(c => {
                    const r = rating(c), i = index(c)
                    return (
                      <TableRow key={c.id} hover sx={c.is_self ? { bgcolor: tokens.surfaceAlt } : undefined}>
                        <TableCell sx={{ minWidth: 260, verticalAlign: 'top' }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{c.is_self ? t('{name} (you)', { name: c.name }) : c.name}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            {[kindLabel(c.kind), c.distance_m !== null && !c.is_self ? `${distanceLabel(c.distance_m)} (${t('{n} min walk', { n: walkMinutes(c.distance_m) })})` : null,
                              c.price_level !== null ? priceLevelLabel(c.price_level) : null].filter(Boolean).join(' · ')}
                          </Typography>
                          {c.strengths && <Typography variant="caption" sx={{ display: 'block' }}>{t('Does well: {text}', { text: c.strengths })}</Typography>}
                          {c.weaknesses && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{t('Falls short: {text}', { text: c.weaknesses })}</Typography>}
                        </TableCell>
                        <TableCell sx={{ verticalAlign: 'top' }}>{c.threat ? <Tag {...THREAT_TONE[c.threat]}>{threatLabel(c.threat)}</Tag> : ''}</TableCell>
                        <TableCell sx={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{stars(r?.rating ?? null)}</Typography>
                          {r?.count != null && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{tn(r.count, '{n} review', '{n} reviews')}</Typography>}
                          {c.google_status && c.google_status !== 'open' && (
                            <Tag fg={tokens.badFg} bg={tokens.badBg}>{c.google_status === 'closed_permanently' ? t('Closed for good') : t('Temporarily closed')}</Tag>
                          )}
                        </TableCell>
                        <TableCell sx={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{vsArea(i.index)}</Typography>
                          {i.items > 0 && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{tn(i.items, 'on {n} item', 'on {n} items')}</Typography>}
                        </TableCell>
                        <TableCell sx={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>{hoursLabel(c.is_self ? ownHours : hoursOf(c), WEEKDAYS)}</TableCell>
                        <TableCell align="right" sx={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          {c.website && <IconButton size="small" component="a" href={c.website} target="_blank" rel="noopener" aria-label={t('Open the website of {name}', { name: placeName(c) })}><OpenIcon fontSize="small" /></IconButton>}
                          {c.instagram && <Button size="small" component="a" href={`https://www.instagram.com/${c.instagram}/`} target="_blank" rel="noopener">{`@${c.instagram}`}</Button>}
                          <IconButton size="small" onClick={() => onEdit(c)} aria-label={t('Edit {name}', { name: placeName(c) })}><EditIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Box>}
        {stopped.length > 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
            {t('No longer followed:')}{' '}
            {stopped.map((c, i) => <span key={c.id}>{i > 0 && ', '}<Link component="button" onClick={() => onEdit(c)}>{c.name}</Link></span>)}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * One item at every place (a cappuccino across all the cafés): each one's latest price as a bar,
 * cheapest first, yours marked, and the area's average as a line. Your menu items come first.
 */
function ItemCompare({ a }: { a: Analysis }) {
  const rows = a.rows.filter(r => r.n > 0).sort((x, y) => Number(!!y.ours) - Number(!!x.ours))
  const [picked, setPicked] = useState<string | null>(null)
  const row = rows.find(r => r.item.id === picked) ?? rows.find(r => /cappuccino|capuchino/i.test(r.item.name)) ?? rows[0]
  const bars = [
    ...a.rivals.flatMap(c => (row.cells[c.id] ? [{ id: c.id, name: c.name, price: row.cells[c.id].price, you: false, seen: row.cells[c.id].observed_on }] : [])),
    ...(row.ours ? [{ id: 'you', name: a.self?.name ?? t('You'), price: row.ours.price, you: true, seen: null as string | null }] : []),
  ].sort((x, y) => x.price - y.price || Number(y.you) - Number(x.you))
  const max = Math.max(...bars.map(b => b.price)) * 1.08
  const avgAt = row.avg !== null ? row.avg / max * 100 : null
  return (
    <Card component="section" aria-label={t('Compare one item')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('Compare one item')}</SectionTitle>
        <Stack direction="row" useFlexGap spacing={0.75} sx={{ flexWrap: 'wrap', mb: 2 }} role="group" aria-label={t('Item')}>
          {rows.map(r => (
            <Chip key={r.item.id} size="small" label={r.item.name} onClick={() => setPicked(r.item.id)} aria-pressed={r.item.id === row.item.id}
              color={r.item.id === row.item.id ? 'primary' : 'default'} variant={r.item.id === row.item.id ? 'filled' : 'outlined'}
              title={r.ours ? t('On your menu') : undefined} />
          ))}
        </Stack>
        <Typography sx={{ mb: 1.5 }}>
          {row.ours && row.avg !== null
            ? row.ours.price === row.avg
              ? t('Your {item} is {price}, the same as the area’s average.', { item: row.item.name, price: formatMoney(row.ours.price) })
              : t('Your {item} is {price}: {diff} {way} than the area’s average of {avg}. {cheaper} of {n} charge less.', {
                item: row.item.name, price: formatMoney(row.ours.price), diff: formatMoney(Math.abs(row.ours.price - row.avg)),
                way: row.ours.price > row.avg ? t('dearer') : t('cheaper'), avg: formatMoney(row.avg), cheaper: row.cheaper, n: row.n })
            : t('{item}: from {min} to {max} nearby, {avg} on average. Add your price to see where you sit.', {
              item: row.item.name, min: formatMoney(row.min ?? 0), max: formatMoney(row.max ?? 0), avg: formatMoney(row.avg ?? 0) })}
        </Typography>
        <Box component="ul" aria-label={t('{item} at each place', { item: row.item.name })} sx={{ listStyle: 'none', m: 0, p: 0, position: 'relative' }}>
          {bars.map(b => (
            <Box component="li" key={b.id} aria-label={`${b.you ? t('You') : b.name}: ${formatMoney(b.price)}`}
              sx={{ display: 'grid', gridTemplateColumns: { xs: '110px 1fr 64px', sm: '200px 1fr 72px' }, alignItems: 'center', gap: 1.5, py: 0.6 }}>
              <Typography variant="body2" noWrap title={b.name} sx={{ fontWeight: b.you ? 600 : 400 }}>
                {b.you ? t('{name} (you)', { name: b.name }) : b.name}
              </Typography>
              <Tooltip title={b.seen ? t('Seen {date}', { date: day(b.seen) }) : t('Your price')}>
                <Box sx={{ position: 'relative', height: 14 }}>
                  <Box sx={{ height: '100%', width: `${Math.max(2, b.price / max * 100)}%`, borderRadius: '0 4px 4px 0', bgcolor: b.you ? tokens.chartYou : tokens.chart }} />
                  {avgAt !== null && <Box aria-hidden sx={{ position: 'absolute', top: -4, bottom: -4, left: `${avgAt}%`, borderLeft: `2px dashed ${tokens.inkSoft}` }} />}
                </Box>
              </Tooltip>
              <Typography variant="body2" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: b.you ? 600 : 400 }}>{formatMoney(b.price)}</Typography>
            </Box>
          ))}
        </Box>
        {row.avg !== null && (
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
            {t('Dashed line: the area’s average, {avg}. Your bar is in purple.', { avg: formatMoney(row.avg) })}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

/** The basket item by item: your price, each place's latest, the area's average and range; and what's moved lately. */
function PricesView({ a, d, onRecord, onBasket, onUsual }: {
  a: Analysis; d: CompetitorData; onRecord: (s: { competitor_id?: string; item_id?: string }) => void; onBasket: () => void; onUsual: () => void
}) {
  const nameOf = (id: string) => d.competitors.find(c => c.id === id)?.name ?? ''
  const itemOf = (id: string) => d.items.find(i => i.id === id)?.name ?? ''
  const num = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const
  return (
    <>
      {a.rows.some(r => r.n > 0) && <ItemCompare a={a} />}
      <Card component="section" aria-label={t('Prices')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={<Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" onClick={onBasket}>{t('Basket')}</Button>
            {d.items.length > 0 && <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => onRecord({})}>{t('Record prices')}</Button>}
          </Stack>}>{t('Prices')}</SectionTitle>
          {d.items.length === 0
            ? <Empty>
                <Typography variant="body2" sx={{ mb: 1.5 }}>{t('Choose what to compare at every place: the usual basket for a café in Spain, or your own items.')}</Typography>
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
                  <Button variant="contained" onClick={onUsual}>{t('Add the usual basket')}</Button>
                  <Button variant="outlined" onClick={onBasket}>{t('Choose items')}</Button>
                </Stack>
              </Empty>
            : <>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead><TableRow>
                      <TableCell>{t('Item')}</TableCell><TableCell align="right">{t('You')}</TableCell>
                      {a.rivals.map(c => <TableCell key={c.id} align="right" sx={{ minWidth: 90 }}>{c.name}</TableCell>)}
                      <TableCell align="right">{t('Area average')}</TableCell><TableCell align="right">{t('Range')}</TableCell>
                    </TableRow></TableHead>
                    <TableBody>
                      {a.rows.map(r => (
                        <TableRow key={r.item.id} hover>
                          <TableCell sx={{ minWidth: 140 }}>{r.item.name}</TableCell>
                          <TableCell align="right" sx={{ ...num, ...(r.ours ? {} : toEnter) }}>
                            {r.ours
                              ? <Tooltip title={r.ours.from === 'menu' ? t('From Menu costing') : t('Typed in here')}>
                                  <span>
                                    <Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>{formatMoney(r.ours.price)}</Typography>
                                    {r.vsAvg !== null && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{vsArea(Math.round((1 + r.vsAvg) * 100))}</Typography>}
                                  </span>
                                </Tooltip>
                              : r.item.recipe_id
                                ? <Typography variant="caption">{t('No price in Menu costing')}</Typography>
                                : <Button size="small" onClick={() => onRecord({ competitor_id: a.self?.id, item_id: r.item.id })}>{t('Add yours')}</Button>}
                          </TableCell>
                          {a.rivals.map(c => {
                            const cell = r.cells[c.id]
                            const label = cell ? t('{item} at {name}: {price}', { item: r.item.name, name: c.name, price: formatMoney(cell.price) }) : t('Add the price of {item} at {name}', { item: r.item.name, name: c.name })
                            return (
                              <TableCell key={c.id} align="right" sx={{ ...num, ...(cell?.stale ? toEnter : {}) }}>
                                <Tooltip title={cell ? `${t('Seen {date}', { date: day(cell.observed_on) })}${cell.previous !== null && cell.previous !== cell.price ? ` · ${t('before: {price}', { price: formatMoney(cell.previous) })}` : ''}${cell.stale ? ` · ${t('worth checking again')}` : ''}` : t('Add a price')}>
                                  <Button size="small" onClick={() => onRecord({ competitor_id: c.id, item_id: r.item.id })} aria-label={label}
                                    sx={{ minWidth: 0, px: 1, color: cell ? 'text.primary' : 'text.disabled', fontWeight: 400 }}>
                                    {cell ? formatMoney(cell.price) : '–'}
                                    {cell && cell.previous !== null && cell.previous !== cell.price && (cell.price > cell.previous
                                      ? <UpIcon sx={{ fontSize: 14, ml: 0.25 }} aria-label={t('up')} /> : <DownIcon sx={{ fontSize: 14, ml: 0.25 }} aria-label={t('down')} />)}
                                  </Button>
                                </Tooltip>
                              </TableCell>
                            )
                          })}
                          <TableCell align="right" sx={num}>{r.avg !== null ? formatMoney(r.avg) : '–'}</TableCell>
                          <TableCell align="right" sx={num}>{r.min !== null ? (r.min === r.max ? formatMoney(r.min) : `${formatMoney(r.min)}–${formatMoney(r.max!)}`) : '–'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1.5 }}>
                  {t('Tap a price to add a newer one. Shaded: seen over six months ago, or yours still to add. Arrows: up or down since the time before.')}
                </Typography>
              </>}
        </CardContent>
      </Card>

      <Card component="section" aria-label={t('Price changes')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('Price changes in the last 90 days')}</SectionTitle>
          {a.changes.length === 0
            ? <Empty>{t('No price changes seen in the last 90 days.')}</Empty>
            : <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {a.changes.map(ch => (
                  <Stack component="li" key={`${ch.competitor_id}-${ch.item_id}-${ch.on}`} direction="row" spacing={1.5} sx={{ alignItems: 'baseline' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', width: 88, flexShrink: 0 }}>{day(ch.on)}</Typography>
                    <Typography variant="body2" sx={{ flex: 1 }}>{t('{name}: {item}', { name: nameOf(ch.competitor_id), item: itemOf(ch.item_id) })}</Typography>
                    <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {`${formatMoney(ch.from)} → ${formatMoney(ch.to)}`}
                      <Box component="span" sx={{ color: 'text.secondary', ml: 1 }}>{`${ch.to > ch.from ? '+' : '−'}${Math.round(Math.abs(ch.to / ch.from - 1) * 100)}%`}</Box>
                    </Typography>
                  </Stack>
                ))}
              </Stack>}
        </CardContent>
      </Card>
    </>
  )
}

/** One place's answer for one feature, changed from a short menu (an admin's answer wins over Google's). */
function Answer({ c, f }: { c: Competitor; f: Feature }) {
  const { api } = useApp()
  const run = useAction()
  const [at, setAt] = useState<HTMLElement | null>(null)
  const value = featuresOf(c)[f.key]
  const google = !(f.key in c.features) && f.key in c.google_features
  const set = (v: boolean | undefined) => {
    setAt(null)
    const features = { ...c.features }
    if (v === undefined) delete features[f.key]; else features[f.key] = v
    void run(() => api.saveCompetitor({ id: c.id, name: c.name, features }))
  }
  const said = value === true ? t('yes') : value === false ? t('no') : t('not known')
  return (
    <>
      <Button size="small" onClick={(e: MouseEvent<HTMLElement>) => setAt(e.currentTarget)} sx={{ minWidth: 0, px: 1, color: value ? tokens.goodFg : 'text.secondary' }}
        aria-label={t('{feature} at {name}: {answer}. Change', { feature: t(f.label), name: placeName(c), answer: said })}>
        {value === true ? <YesIcon fontSize="small" /> : value === false ? <NoIcon fontSize="small" /> : '–'}
        {google && <Typography component="span" variant="caption" sx={{ ml: 0.25, color: 'text.secondary' }}>{'G'}</Typography>}
      </Button>
      <Menu anchorEl={at} open={!!at} onClose={() => setAt(null)}>
        <MenuItem onClick={() => set(true)}>{t('Yes')}</MenuItem>
        <MenuItem onClick={() => set(false)}>{t('No')}</MenuItem>
        <MenuItem onClick={() => set(undefined)}>{f.key in c.google_features ? t('As Google says') : t('Not known')}</MenuItem>
      </Menu>
    </>
  )
}

/** What each place offers next to you, grouped, with the gaps and what sets you apart; and everyone's hours. */
function OfferView({ a, ownHours }: { a: Analysis; ownHours: OpeningHours | null }) {
  const cols = [...(a.self ? [a.self] : []), ...a.rivals]
  const row = (key: string) => a.features.find(r => r.feature.key === key)!
  const span = (h: OpeningHours | null, days: DayKey[]) => hoursLabel(h, days)
  return (
    <>
      <Card component="section" aria-label={t('What they offer')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('What they offer')}</SectionTitle>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
            {t('Tap an answer to change it. G: from Google, checked every week; your answer wins over Google’s.')}
          </Typography>
          {a.rivals.length === 0
            ? <Empty>{t('Follow a few places first.')}</Empty>
            : <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell sx={{ minWidth: 200 }}>{t('What')}</TableCell>
                    {cols.map(c => <TableCell key={c.id} align="center" sx={{ minWidth: 76 }}>{placeName(c)}</TableCell>)}
                  </TableRow></TableHead>
                  <TableBody>
                    {FEATURE_GROUPS.map(g => [
                      <TableRow key={g.id}><TableCell colSpan={cols.length + 1} sx={{ bgcolor: tokens.surfaceAlt, fontWeight: 600 }}>{t(g.label)}</TableCell></TableRow>,
                      ...FEATURES.filter(f => f.group === g.id).map(f => {
                        const r = row(f.key)
                        return (
                          <TableRow key={f.key} hover>
                            <TableCell>
                              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                <Typography variant="body2">{t(f.label)}</Typography>
                                {r.verdict === 'gap' && f.actionable !== false && <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Most offer it')}</Tag>}
                                {r.verdict === 'edge' && <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Your edge')}</Tag>}
                              </Stack>
                            </TableCell>
                            {cols.map(c => <TableCell key={c.id} align="center" sx={{ py: 0.25 }}><Answer c={c} f={f} /></TableCell>)}
                          </TableRow>
                        )
                      }),
                    ])}
                  </TableBody>
                </Table>
              </Box>}
        </CardContent>
      </Card>

      <Card component="section" aria-label={t('Opening hours')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('Opening hours')}</SectionTitle>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>{t('Place')}</TableCell><TableCell>{t('Weekdays')}</TableCell><TableCell>{t('Saturday')}</TableCell><TableCell>{t('Sunday')}</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {cols.map(c => {
                  const h = c.is_self ? ownHours : hoursOf(c)
                  return (
                    <TableRow key={c.id} sx={c.is_self ? { bgcolor: tokens.surfaceAlt } : undefined}>
                      <TableCell>{placeName(c)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{span(h, WEEKDAYS)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{span(h, ['sat'])}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{span(h, ['sun'])}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    </>
  )
}

/** Where each place sits on price and Google rating, and the ratings with how fast reviews come in. */
function GoogleView({ a, places }: { a: Analysis; places: boolean }) {
  const { api } = useApp()
  const run = useAction()
  const index = (c: Competitor) => (c.is_self ? a.ourIndex.index : a.rivalIndex.get(c.id)?.index ?? null)
  const points = a.ratings.flatMap(r => {
    const x = index(r.competitor)
    return r.rating !== null && x !== null ? [{ id: r.competitor.id, label: placeName(r.competitor), x, y: r.rating, size: r.count ?? 0, you: r.competitor.is_self,
      details: [r.count !== null ? tn(r.count, '{n} review', '{n} reviews') : ''].filter(Boolean) }] : []
  })
  const rivalRatings = a.ratings.filter(r => !r.competitor.is_self && r.rating !== null)
  const average = rivalRatings.length ? rivalRatings.reduce((s, r) => s + r.rating!, 0) / rivalRatings.length : null
  const checked = a.ratings.map(r => r.competitor.google_checked_at).filter((x): x is string => !!x).sort().at(-1)
  return (
    <>
      {!places && <Alert severity="info" sx={{ mb: 3 }}>{t('Ratings, hours and what each place offers come from Google once the Places key the Reviews page uses is set. Everything else here works without it.')}</Alert>}
      <Card component="section" aria-label={t('Price against rating')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={<Freshness id="competitors" at={checked} />}>{t('Price against rating')}</SectionTitle>
          {points.length < 2
            ? <Empty>{t('Places with both a Google rating and prices show here.')}</Empty>
            : <>
                <ScatterChart points={points} xFormat={n => vsArea(Math.round(n))} yFormat={n => `${oneDecimal(n)}★`} xLabel={t('Prices against the area')} yLabel={t('Google rating')}
                  xGuide={{ value: 100, label: t('Area average') }} yGuide={average !== null ? { value: average, label: t('Average rating') } : undefined}
                  label={t('Each place by its prices against the area and its Google rating')} legend={{ you: t('You'), them: t('Competitors'), size: t('Bigger: more reviews') }} />
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
                  {t('Up and to the left: better rated and cheaper than the area. Down and to the right: dearer and less well rated.')}
                </Typography>
              </>}
        </CardContent>
      </Card>
      <Card component="section" aria-label={t('Google ratings')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('Google ratings')}</SectionTitle>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>{t('Place')}</TableCell><TableCell align="right">{t('Rating')}</TableCell><TableCell align="right">{t('Over 3 months')}</TableCell>
                <TableCell align="right">{t('Reviews')}</TableCell><TableCell align="right">{t('New reviews a month')}</TableCell><TableCell>{t('Checked')}</TableCell><TableCell />
              </TableRow></TableHead>
              <TableBody>
                {a.ratings.map(r => (
                  <TableRow key={r.competitor.id} hover sx={r.competitor.is_self ? { bgcolor: tokens.surfaceAlt } : undefined}>
                    <TableCell>{placeName(r.competitor)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{stars(r.rating)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.change === null ? '–' : r.change === 0 ? '±0' : `${r.change > 0 ? '+' : '−'}${oneDecimal(Math.abs(r.change))}`}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.count ?? '–'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.perMonth === null ? '–' : Math.round(r.perMonth)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{r.competitor.google_checked_at ? ago(r.competitor.google_checked_at) : '–'}</TableCell>
                    <TableCell align="right">
                      {places && (r.competitor.place_id || r.competitor.is_self) && (
                        <Button size="small" onClick={() => void run(() => api.refreshCompetitor(r.competitor.id), t('Updated from Google'))}
                          aria-label={t('Update {name} from Google', { name: placeName(r.competitor) })}>{t('Update')}</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    </>
  )
}

/** Ideas worth borrowing, by where they've got to, and everything seen or heard, newest first. */
function NotesView({ d, onNote, onEdit }: { d: CompetitorData; onNote: (p?: Partial<CompetitorNoteInput>) => void; onEdit: (n: CompetitorNoteInput) => void }) {
  const { api } = useApp()
  const run = useAction()
  const about = (id: string | null) => (id ? d.competitors.find(c => c.id === id)?.name ?? '' : t('The area'))
  const kindOf = (k: CompetitorNoteInput['kind']) => t(NOTE_KINDS.find(x => x.id === k)!.label)
  const ideas = d.notes.filter(n => n.kind === 'idea')
  return (
    <>
      <Card component="section" aria-label={t('Ideas to borrow')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={<Button size="small" startIcon={<AddIcon />} onClick={() => onNote({ kind: 'idea', status: 'new' })}>{t('Add an idea')}</Button>}>
            {t('Ideas to borrow')}
          </SectionTitle>
          {ideas.length === 0
            ? <Empty>{t('Seen something worth trying? Keep it here and follow where it gets to.')}</Empty>
            : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
                {IDEA_STATUSES.map(s => {
                  const list = ideas.filter(n => n.status === s.id)
                  return (
                    <Box key={s.id} role="group" aria-label={t(s.label)} sx={{ bgcolor: tokens.surfaceAlt, borderRadius: 3, p: 1.25 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>{`${t(s.label)} (${list.length})`}</Typography>
                      <Stack spacing={1}>
                        {list.map(n => (
                          <Card key={n.id} component="article" aria-label={n.text} variant="outlined" sx={{ p: 1.25 }}>
                            <Typography variant="body2">{n.text}</Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.75 }}>{`${about(n.competitor_id)} · ${day(n.observed_on)}`}</Typography>
                            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                              <TextField select size="small" label={t('Where it’s got to')} value={n.status ?? 'new'} sx={{ flex: 1 }}
                                onChange={e => void run(() => api.saveCompetitorNote({ ...n, status: e.target.value as CompetitorNoteInput['status'] }))}>
                                {IDEA_STATUSES.map(x => <MenuItem key={x.id} value={x.id}>{t(x.label)}</MenuItem>)}
                              </TextField>
                              <IconButton size="small" onClick={() => onEdit(n)} aria-label={t('Edit the idea')}><EditIcon fontSize="small" /></IconButton>
                            </Stack>
                          </Card>
                        ))}
                      </Stack>
                    </Box>
                  )
                })}
              </Box>}
        </CardContent>
      </Card>
      <Card component="section" aria-label={t('Notes')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={<Button size="small" startIcon={<AddIcon />} onClick={() => onNote()}>{t('Add a note')}</Button>}>{t('Notes')}</SectionTitle>
          {d.notes.length === 0
            ? <Empty>{t('A new menu, a 2x1, queues on Saturday: what you see on visits, kept with the date.')}</Empty>
            : <Stack component="ul" spacing={1.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {d.notes.map(n => (
                  <Stack component="li" key={n.id} direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', width: 88, flexShrink: 0, pt: '2px' }}>{day(n.observed_on)}</Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{about(n.competitor_id)}</Typography>
                        <Tag>{kindOf(n.kind)}</Tag>
                      </Stack>
                      <Typography variant="body2">{n.text}</Typography>
                    </Box>
                    <IconButton size="small" onClick={() => onEdit(n)} aria-label={t('Edit the note from {date}', { date: day(n.observed_on) })}><EditIcon fontSize="small" /></IconButton>
                  </Stack>
                ))}
              </Stack>}
        </CardContent>
      </Card>
    </>
  )
}

/** What Google lists around the business: look now or every week, follow what matters, put aside what doesn't. */
function NearbyView({ a, d, places, onFollow }: { a: Analysis; d: CompetitorData; places: boolean; onFollow: (p: NearbyPlace) => void }) {
  const { api } = useApp()
  const run = useAction()
  const [radius, setRadius] = useState(d.settings.radius_m)
  const fresh = new Set(a.newNearby.map(p => p.place_id))
  const aside = d.nearby.filter(p => p.dismissed)
  if (!places) {
    return <Alert severity="info" sx={{ mb: 3 }}>
      {t('Looking around needs the Places key the Reviews page uses (GOOGLE_PLACES_API_KEY; the setup guide, section 16, says how). Everything else on this page works without it.')}
    </Alert>
  }
  return (
    <>
      <Card component="section" aria-label={t('Look around')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('Look around')}</SectionTitle>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, mb: 1 }}>
            <TextField select size="small" label={t('How far')} value={radius} onChange={e => setRadius(Number(e.target.value))} sx={{ width: { sm: 150 }, flexShrink: 0 }}>
              {RADII.map(r => <MenuItem key={r} value={r}>{distanceLabel(r)}</MenuItem>)}
            </TextField>
            <Button variant="contained" onClick={() => void run(() => api.lookAround(radius), t('Looked around'))} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{t('Look around now')}</Button>
            <FormControlLabel control={<Switch checked={d.settings.scan_weekly}
              onChange={e => void run(() => api.saveCompetitorSettings({ radius_m: d.settings.radius_m, scan_weekly: e.target.checked }))} />}
              label={t('Look again every week and tell me about new places')} />
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
            {d.settings.scanned_at ? t('Last looked {ago}, {distance} around.', { ago: ago(d.settings.scanned_at), distance: distanceLabel(d.settings.radius_m) }) : t('Not looked yet.')}
          </Typography>
          <PlaceSearch onFollow={onFollow} />
        </CardContent>
      </Card>
      <Card component="section" aria-label={t('Nearby on Google')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('Nearby on Google')}</SectionTitle>
          {a.untracked.length === 0
            ? <Empty>{d.settings.scanned_at ? t('Nothing else nearby: everything Google lists is followed or put aside.') : t('Look around to see the cafés Google lists near you.')}</Empty>
            : <List dense>
                {a.untracked.map(p => <PlaceRow key={p.place_id} p={p} isNew={fresh.has(p.place_id)} onFollow={() => onFollow(p)}
                  onDismiss={() => void run(() => api.dismissNearby(p.place_id, true), t('Put aside'))} />)}
              </List>}
          {aside.length > 0 && <>
            <Typography variant="subtitle2" sx={{ mt: 2 }}>{t('Put aside')}</Typography>
            <List dense>
              {aside.map(p => <PlaceRow key={p.place_id} p={p} onFollow={() => onFollow(p)} onRestore={() => void run(() => api.dismissNearby(p.place_id, false))} />)}
            </List>
          </>}
        </CardContent>
      </Card>
    </>
  )
}
