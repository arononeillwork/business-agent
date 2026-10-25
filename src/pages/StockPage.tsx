import {
  Alert, Box, Button, Card, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment,
  Link, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import UploadIcon from '@mui/icons-material/UploadFileOutlined'
import SearchIcon from '@mui/icons-material/Search'
import InIcon from '@mui/icons-material/AddCircleOutlineOutlined'
import OutIcon from '@mui/icons-material/RemoveCircleOutlineOutlined'
import CountIcon from '@mui/icons-material/Numbers'
import LinkIcon from '@mui/icons-material/OpenInNew'
import CopyIcon from '@mui/icons-material/ContentCopyOutlined'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import EmailIcon from '@mui/icons-material/EmailOutlined'
import PhoneIcon from '@mui/icons-material/PhoneOutlined'
import ChecklistIcon from '@mui/icons-material/FactCheckOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import { useMemo, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton, SortCell, toEnter, useSort } from '../components/tables'
import type { ExportTable } from '../lib/export'
import {
  CATEGORIES, LOCATIONS, REASONS, UNITS, emailLink, isLow, nextOrderDay, orderList, orderMessage, readStockCsv, reasonLabel, retailMargin,
  stockValue, unitLabel, whatsappLink,
  type MovementReason, type StockCsvImport, type StockItem, type StockItemInput, type StockMovement, type Supplier, type SupplierOrder,
} from '../../shared/stock'
import { addDays, formatLocal, formatMoney, formatNumber, today } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t, tn } from '../i18n'

type View = 'items' | 'order' | 'history'
const LOW_TAG = { fg: tokens.badFg, bg: tokens.badBg }

const SORT_BY: Record<string, (i: StockItem) => string | number | null> = {
  name: i => i.name, supplier: i => i.supplier_id, on_hand: i => i.on_hand, reorder: i => i.reorder_at, par: i => i.par_level,
  cost: i => i.cost_per_unit, location: i => i.location, category: i => i.category,
}
const qty = (n: number, unit: StockItem['unit']) => `${formatNumber(n)} ${t(unitLabel(unit))}`

/**
 * Stock: everything bought wholesale and sold in the shop, how many are in, what to order from whom.
 * The team records deliveries, counts and waste; admins add and price items; finance partners read.
 */
export function StockPage() {
  const { api, isAdmin, isPartner } = useApp()
  const items = useAsync('stock', () => api.stockItems(), [])
  const suppliers = useAsync('suppliers', () => api.suppliers(), [])
  const [view, setView] = useState<View>('items')
  const [q, setQ] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [shopOnly, setShopOnly] = useState(false)
  const [category, setCategory] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [location, setLocation] = useState('')
  const [editing, setEditing] = useState<StockItem | 'new' | null>(null)
  const [moving, setMoving] = useState<{ item: StockItem; reason: MovementReason } | null>(null)
  const [stocktake, setStocktake] = useState(false)
  const [importing, setImporting] = useState(false)
  const canRecord = !isPartner

  const all = useMemo(() => (items.data ?? []).filter(i => i.active), [items.data])
  const sups = suppliers.data ?? []
  const supplierOf = (i: StockItem) => sups.find(s => s.id === i.supplier_id) ?? null
  const low = all.filter(isLow)
  const orders = orderList(all, sups)
  const thisWeek = orders.filter(o => !o.supplier || !o.supplier.order_days.length
    || (nextOrderDay(o.supplier, new Date())?.date ?? '9999') <= addDays(today(), 6))
  const used = (f: (i: StockItem) => string | null) => [...new Set(all.map(f).filter((x): x is string => !!x))]
  const categories = [...new Set([...CATEGORIES.filter(c => all.some(i => i.category === c)), ...used(i => i.category)])]
  const locations = [...new Set([...LOCATIONS.filter(l => all.some(i => i.location === l)), ...used(i => i.location)])]
  const needle = q.trim().toLowerCase()
  const shown = all.filter(i => (!lowOnly || isLow(i)) && (!shopOnly || i.retail) && (!category || i.category === category)
    && (!supplierId || i.supplier_id === supplierId) && (!location || i.location === location)
    && (!needle || [i.name, i.supplier_sku, i.category, supplierOf(i)?.name].some(x => x?.toLowerCase().includes(needle))))
  const { rows, sort } = useSort(shown, SORT_BY)
  const filtered = lowOnly || shopOnly || !!category || !!supplierId || !!location || !!needle

  const table = (): ExportTable => ({
    title: lowOnly ? t('Stock: low only') : t('Stock'),
    filename: `stock-${today()}`,
    columns: [t('Item'), t('Category'), t('Supplier'), t('Reference'), t('On hand'), t('Unit'), t('Reorder at'), t('Par level'), t('Cost per unit'),
      t('IVA %'), t('Stock value'), t('Shop price'), t('Location'), t('Link')],
    rows: rows.map(i => [i.name, i.category ? t(i.category) : '', supplierOf(i)?.name ?? '', i.supplier_sku ?? '', i.on_hand, t(unitLabel(i.unit)),
      i.reorder_at, i.par_level, i.cost_per_unit, i.vat_rate, i.cost_per_unit === null ? null : Math.round(Math.max(0, i.on_hand) * i.cost_per_unit * 100) / 100,
      i.sell_price, i.location ? t(i.location) : '', i.product_url ?? '']),
    footer: [t('Total'), '', '', '', '', '', '', '', '', '', stockValue(rows), '', '', ''],
    money: [8, 10, 11],
  })

  const cell = { py: 1, borderColor: tokens.line } as const
  const hide = (from: 'sm' | 'md' | 'lg' | 'xl') => ({ display: { xs: 'none', [from]: 'table-cell' } })
  return (
    <>
      <PageHeader eyebrow={t('Stock')} title={t('Stock')}
        actions={<>
          {isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')}>{t('Add item')}</Button>}
          {canRecord && <Button variant="outlined" startIcon={<ChecklistIcon />} onClick={() => setStocktake(true)} disabled={!all.length}>{t('Stocktake')}</Button>}
          {isAdmin && <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => setImporting(true)}>{t('Import')}</Button>}
        </>} />
      <ErrorBox error={items.error ?? suppliers.error} />

      <StatGrid>
        <StatTile label={t('Items')} value={items.data ? all.length : '–'} note={tn(all.filter(i => i.retail).length, '{n} sold in the shop', '{n} sold in the shop')} />
        <StatTile label={t('Low on stock')} value={items.data ? low.length : '–'} note={low.length ? low.slice(0, 2).map(i => i.name).join(', ') : t('Nothing to order')} />
        <StatTile label={t('Stock value')} value={items.data ? formatMoney(stockValue(all)) : '–'} note={t('at cost, without IVA')} />
        <StatTile label={t('To order this week')} value={items.data ? formatMoney(thisWeek.reduce((s, o) => s + o.net, 0)) : '–'}
          note={tn(thisWeek.length, '{n} supplier', '{n} suppliers')} />
      </StatGrid>

      <Tabs value={view} onChange={(_, v: View) => setView(v)} sx={{ mb: 2, borderBottom: `1px solid ${tokens.line}` }}>
        <Tab value="items" label={t('Items')} />
        <Tab value="order" label={`${t('Order list')}${orders.length ? ` (${orders.length})` : ''}`} />
        <Tab value="history" label={t('History')} />
      </Tabs>

      {view === 'items' && (items.data && all.length === 0 ? (
        <Empty>
          <Typography sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}>{t('Keep every wholesale item in one place')}</Typography>
          {t('Add what you buy (beans, milk, cups, pastries) and what you sell in the shop, with its supplier, cost and link. Set a reorder level and the order list fills itself.')}
          {isAdmin && (
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', mt: 2 }}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')}>{t('Add item')}</Button>
              <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => setImporting(true)}>{t('Import a CSV')}</Button>
            </Stack>
          )}
        </Empty>
      ) : <>
        <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
          <Chip size="small" clickable label={`${t('Low only')} ${low.length}`} onClick={() => setLowOnly(v => !v)} aria-pressed={lowOnly}
            variant={lowOnly ? 'filled' : 'outlined'} color={lowOnly ? 'error' : 'default'} />
          <Chip size="small" clickable label={t('Shop items')} onClick={() => setShopOnly(v => !v)} aria-pressed={shopOnly}
            variant={shopOnly ? 'filled' : 'outlined'} color={shopOnly ? 'primary' : 'default'} />
          <Box sx={{ flex: 1 }} />
          {([[t('Category'), category, setCategory, categories.map(c => [c, t(c)]), t('Every category')],
            [t('Supplier'), supplierId, setSupplierId, sups.map(s => [s.id, s.name]), t('Every supplier')],
            [t('Location'), location, setLocation, locations.map(l => [l, t(l)]), t('Everywhere')]] as const).map(([label, value, set, options, any]) => (
            <TextField key={label} select size="small" value={value} onChange={e => set(e.target.value)} sx={{ width: { xs: '100%', sm: 170 } }}
              slotProps={{ select: { displayEmpty: true, SelectDisplayProps: { 'aria-label': label } } }}>
              <MenuItem value="">{any}</MenuItem>
              {options.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
            </TextField>
          ))}
          <TextField size="small" placeholder={t('Search items…')} value={q} onChange={e => setQ(e.target.value)} sx={{ width: { xs: '100%', sm: 220 } }}
            slotProps={{ htmlInput: { 'aria-label': t('Search stock') }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
          <ExportButton table={table} disabled={!rows.length} folder="Stock" />
        </Stack>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {filtered ? t('{n} of {total} shown', { n: rows.length, total: all.length }) : tn(all.length, '{n} item', '{n} items')}
        </Typography>
        <Card sx={{ overflow: 'hidden' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label={t('Stock items')}>
              <TableHead>
                <TableRow>
                  <SortCell sort={sort} id="name">{t('Item')}</SortCell>
                  <SortCell sort={sort} id="supplier" sx={hide('md')}>{t('Supplier')}</SortCell>
                  <SortCell sort={sort} id="on_hand" align="right">{t('On hand')}</SortCell>
                  <SortCell sort={sort} id="reorder" align="right" sx={hide('sm')}>{t('Reorder at')}</SortCell>
                  <SortCell sort={sort} id="par" align="right" sx={hide('lg')}>{t('Par level')}</SortCell>
                  <SortCell sort={sort} id="cost" align="right" sx={hide('md')}>{t('Cost')}</SortCell>
                  <SortCell sort={sort} id="location" sx={hide('xl')}>{t('Location')}</SortCell>
                  {canRecord && <TableCell sx={{ width: 1 }}><Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{t('Record')}</Box></TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map(i => {
                  const s = supplierOf(i)
                  return (
                    <TableRow key={i.id} hover aria-label={i.name} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      <TableCell sx={{ ...cell, maxWidth: 260 }}>
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                          <Link component="button" underline="hover" onClick={() => setEditing(i)} sx={{ fontWeight: 500, textAlign: 'left', color: 'text.primary' }}>{i.name}</Link>
                          {i.product_url && (
                            <Tooltip title={t('Open on the supplier’s website')}>
                              <IconButton size="small" href={i.product_url} target="_blank" rel="noopener" aria-label={t('{name} on the supplier’s website', { name: i.name })}>
                                <LinkIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          {i.retail && <Tag>{t('Shop')}</Tag>}
                        </Stack>
                        <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>
                          {[i.pack_size, i.supplier_sku, s && `${s.name}`].filter(Boolean).join(' · ') || (i.category ? t(i.category) : '')}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ ...cell, ...hide('md') }}>
                        {s ? (isAdmin ? <Link component={RouterLink} to="/suppliers" underline="hover">{s.name}</Link> : s.name) : '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ ...cell, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {isLow(i) && <Box component="span" sx={{ mr: 1 }}><Tag {...LOW_TAG}>{t('Low')}</Tag></Box>}
                        {qty(i.on_hand, i.unit)}
                      </TableCell>
                      <TableCell align="right" sx={{ ...cell, ...hide('sm'), color: 'text.secondary' }}>{i.reorder_at === null ? '—' : formatNumber(i.reorder_at)}</TableCell>
                      <TableCell align="right" sx={{ ...cell, ...hide('lg'), color: 'text.secondary' }}>{i.par_level === null ? '—' : formatNumber(i.par_level)}</TableCell>
                      <TableCell align="right" sx={{ ...cell, ...hide('md'), whiteSpace: 'nowrap', ...(i.cost_per_unit === null && toEnter) }}>
                        {i.cost_per_unit === null ? '—' : t('{price} / {unit}', { price: formatMoney(i.cost_per_unit), unit: t(unitLabel(i.unit)) })}
                      </TableCell>
                      <TableCell sx={{ ...cell, ...hide('xl'), color: 'text.secondary' }}>{i.location ? t(i.location) : '—'}</TableCell>
                      {canRecord && (
                        <TableCell sx={{ ...cell, whiteSpace: 'nowrap', py: 0.25 }}>
                          <Tooltip title={t('Delivery')}><IconButton size="small" aria-label={t('Delivery of {name}', { name: i.name })} onClick={() => setMoving({ item: i, reason: 'delivery' })}><InIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title={t('Used or wasted')}><IconButton size="small" aria-label={t('Used or wasted: {name}', { name: i.name })} onClick={() => setMoving({ item: i, reason: 'used' })}><OutIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title={t('Count')}><IconButton size="small" aria-label={t('Count {name}', { name: i.name })} onClick={() => setMoving({ item: i, reason: 'count' })}><CountIcon fontSize="small" /></IconButton></Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
                {items.data && rows.length === 0 && (
                  <TableRow><TableCell colSpan={8} sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>{t('Nothing matches that.')}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </Card>
      </>)}

      {view === 'order' && <OrderList orders={orders} />}
      {view === 'history' && <History items={items.data ?? []} />}

      {editing && <ItemDialog item={editing === 'new' ? null : editing} suppliers={sups} categories={categories} locations={locations}
        readOnly={!isAdmin} onClose={() => setEditing(null)} />}
      {moving && <MoveDialog item={moving.item} reason={moving.reason} onClose={() => setMoving(null)} />}
      {stocktake && <StocktakeDialog items={all} locations={locations} onClose={() => setStocktake(false)} />}
      {importing && <ImportDialog suppliers={sups} onClose={() => setImporting(false)} />}
    </>
  )
}

/** A delivery, something used, wasted or sold, or a count, for one item. */
function MoveDialog({ item, reason: start, onClose }: { item: StockItem; reason: MovementReason; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [reason, setReason] = useState<MovementReason>(start)
  const [n, setN] = useState(start === 'count' ? String(item.on_hand) : start === 'delivery' ? String(item.order_multiple) : '1')
  const [note, setNote] = useState('')
  const options = start === 'delivery' ? REASONS.filter(r => r.id === 'delivery' || r.id === 'correction')
    : start === 'count' ? REASONS.filter(r => r.id === 'count') : REASONS.filter(r => r.sign < 0 || r.id === 'correction')
  const value = Number(n.replace(',', '.'))
  const save = () => run(async () => {
    if (!n.trim() || !Number.isFinite(value) || (reason !== 'count' && reason !== 'correction' && value <= 0) || (reason === 'count' && value < 0)) {
      throw new Error(reason === 'count' ? t('Enter how many you counted') : t('Enter how many'))
    }
    const sign = REASONS.find(r => r.id === reason)!.sign
    await api.recordStock([reason === 'count' ? { item_id: item.id, reason, counted: value, note } : { item_id: item.id, reason, change: sign ? sign * value : value, note }])
    onClose()
  }, reason === 'count' ? t('Counted: {qty}', { qty: qty(value, item.unit) }) : t('Recorded'))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{item.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('In stock now: {qty}', { qty: qty(item.on_hand, item.unit) })}</Typography>
          {options.length > 1 && (
            <TextField select label={t('What happened')} value={reason} onChange={e => setReason(e.target.value as MovementReason)}>
              {options.map(r => <MenuItem key={r.id} value={r.id}>{t(r.label)}</MenuItem>)}
            </TextField>
          )}
          <TextField autoFocus label={reason === 'count' ? t('How many are there') : reason === 'correction' ? t('Change (+ or −)') : t('How many')}
            value={n} onChange={e => setN(e.target.value)} inputMode="decimal"
            slotProps={{ input: { endAdornment: <InputAdornment position="end">{t(unitLabel(item.unit))}</InputAdornment> } }} />
          <TextField label={t('Note (optional)')} value={note} onChange={e => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={save}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Count everything in one place (or everywhere) and save all the counts at once. */
function StocktakeDialog({ items, locations, onClose }: { items: StockItem[]; locations: string[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [location, setLocation] = useState('')
  const [counts, setCounts] = useState<Record<string, string>>({})
  const shown = items.filter(i => !location || i.location === location)
  const changed = Object.entries(counts).filter(([id, v]) => v.trim() !== '' && Number(v.replace(',', '.')) !== items.find(i => i.id === id)?.on_hand)
  const save = () => run(async () => {
    const bad = changed.find(([, v]) => !(Number(v.replace(',', '.')) >= 0))
    if (bad) throw new Error(t('Enter how many you counted'))
    await api.recordStock(changed.map(([item_id, v]) => ({ item_id, reason: 'count' as const, counted: Number(v.replace(',', '.')), note: t('Stocktake') })))
    onClose()
  }, tn(changed.length, '{n} count saved', '{n} counts saved'))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle>{t('Stocktake')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Type what you count. Leave a box empty to keep the figure as it is.')}</Typography>
          <TextField select size="small" label={t('Location')} value={location} onChange={e => setLocation(e.target.value)}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
            <MenuItem value="">{t('Everywhere')}</MenuItem>
            {locations.map(l => <MenuItem key={l} value={l}>{t(l)}</MenuItem>)}
          </TextField>
          <Table size="small" aria-label={t('Counts')}>
            <TableBody>
              {shown.map(i => (
                <TableRow key={i.id}>
                  <TableCell sx={{ pl: 0 }}>
                    <Typography sx={{ fontWeight: 500 }}>{i.name}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Now: {qty}', { qty: qty(i.on_hand, i.unit) })}</Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ pr: 0, width: 150 }}>
                    <TextField size="small" value={counts[i.id] ?? ''} onChange={e => setCounts(c => ({ ...c, [i.id]: e.target.value }))} inputMode="decimal"
                      slotProps={{ htmlInput: { 'aria-label': t('Counted: {name}', { name: i.name }) }, input: { endAdornment: <InputAdornment position="end">{t(unitLabel(i.unit))}</InputAdornment> } }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!changed.length} onClick={save}>{tn(changed.length, 'Save {n} count', 'Save {n} counts')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** What to order, supplier by supplier, with the message ready to send. */
function OrderList({ orders }: { orders: SupplierOrder[] }) {
  const { business, isAdmin } = useApp()
  const notify = useNotify()
  const name = business?.name ?? 'Easy Beans Coffee'
  const table = (): ExportTable => ({
    title: t('Order list'),
    filename: `order-list-${today()}`,
    columns: [t('Supplier'), t('Item'), t('Reference'), t('Quantity'), t('Unit'), t('Cost per unit'), t('Without IVA'), t('With IVA')],
    rows: orders.flatMap(o => o.lines.map(l => [o.supplier?.name ?? t('No supplier'), l.item.name, l.item.supplier_sku ?? '', l.qty, t(unitLabel(l.item.unit)),
      l.item.cost_per_unit, l.net, l.gross])),
    footer: [t('Total'), '', '', '', '', '', Math.round(orders.reduce((s, o) => s + o.net, 0) * 100) / 100, Math.round(orders.reduce((s, o) => s + o.gross, 0) * 100) / 100],
    money: [5, 6, 7],
  })
  if (!orders.length) return <Empty>{t('Nothing is low: nothing to order. Items show here when they’re down to their reorder level.')}</Empty>
  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: 'flex-end' }}><ExportButton table={table} folder="Stock" /></Stack>
      {orders.map(o => {
        const s = o.supplier
        const next = s ? nextOrderDay(s, new Date()) : null
        // In Spanish: the suppliers are local.
        const text = orderMessage(o, name, 'es', next?.arrives)
        const copy = async () => { await navigator.clipboard.writeText(text); notify(t('Order copied'), 'success') }
        return (
          <Card key={s?.id ?? 'none'} component="section" aria-label={s?.name ?? t('No supplier')} sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', gap: 1, mb: 1 }}>
              <Box>
                <Typography variant="h6" component="h2">{s?.name ?? t('No supplier')}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {next ? (next.by
                    ? t('Order by {day}, {time} · arrives {arrives}', { day: formatLocal(`${next.date}T12:00:00Z`, 'EEE d MMM'), time: next.by, arrives: formatLocal(`${next.arrives}T12:00:00Z`, 'EEE d MMM') })
                    : t('Order on {day} · arrives {arrives}', { day: formatLocal(`${next.date}T12:00:00Z`, 'EEE d MMM'), arrives: formatLocal(`${next.arrives}T12:00:00Z`, 'EEE d MMM') }))
                    : s ? t('No order days set') : t('Give these items a supplier to order them')}
                </Typography>
              </Box>
              <Box sx={{ textAlign: { sm: 'right' } }}>
                <Typography sx={{ fontWeight: 500 }}>{formatMoney(o.net)}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('{amount} with IVA', { amount: formatMoney(o.gross) })}</Typography>
              </Box>
            </Stack>
            {o.short !== null && <Alert severity="warning" sx={{ mb: 1 }}>{t('{amount} under their minimum order of {minimum}', { amount: formatMoney(o.short), minimum: formatMoney(s!.minimum_order!) })}</Alert>}
            <Table size="small" aria-label={t('Order for {supplier}', { supplier: s?.name ?? t('No supplier') })}>
              <TableBody>
                {o.lines.map(l => (
                  <TableRow key={l.item.id}>
                    <TableCell sx={{ pl: 0 }}>{l.item.name}{l.item.pack_size && <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>{` · ${l.item.pack_size}`}</Typography>}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{qty(l.qty, l.item.unit)}</TableCell>
                    <TableCell align="right" sx={{ pr: 0, whiteSpace: 'nowrap' }}>{formatMoney(l.net)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {s && (
              <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
                <Button size="small" variant="outlined" startIcon={<CopyIcon />} onClick={() => void copy()}>{t('Copy order')}</Button>
                {s.whatsapp && s.phone && <Button size="small" variant="contained" startIcon={<WhatsAppIcon />} href={whatsappLink(s.phone, text)} target="_blank" rel="noopener">{'WhatsApp'}</Button>}
                {s.email && <Button size="small" variant="outlined" startIcon={<EmailIcon />} href={emailLink(s.email, `Pedido ${name}`, text)}>{t('Email')}</Button>}
                {s.phone && <Button size="small" variant="outlined" startIcon={<PhoneIcon />} href={`tel:${s.phone.replace(/\s/g, '')}`}>{t('Call')}</Button>}
                {s.order_url && <Button size="small" variant="outlined" startIcon={<LinkIcon />} href={s.order_url} target="_blank" rel="noopener">{t('Order page')}</Button>}
                {isAdmin && <Button size="small" component={RouterLink} to="/suppliers">{t('Supplier details')}</Button>}
              </Stack>
            )}
          </Card>
        )
      })}
    </Stack>
  )
}

/** Every delivery, count, waste and sale, newest first. */
function History({ items }: { items: StockItem[] }) {
  const { api, profiles } = useApp()
  const moves = useAsync('stock-movements', () => api.stockMovements(), [])
  const nameOf = (id: string | null) => profiles.find(p => p.id === id)?.full_name ?? '—'
  const itemOf = (id: string) => items.find(i => i.id === id)
  const list = moves.data ?? []
  const table = (): ExportTable => ({
    title: t('Stock history'),
    filename: `stock-history-${today()}`,
    columns: [t('When'), t('Item'), t('What happened'), t('Change'), t('After'), t('Who'), t('Note')],
    rows: list.map(m => [formatLocal(m.at, 'yyyy-MM-dd HH:mm'), itemOf(m.item_id)?.name ?? '', t(reasonLabel(m.reason)), m.change, m.on_hand_after, nameOf(m.by), m.note ?? '']),
  })
  return <>
    <ErrorBox error={moves.error} />
    {moves.data && !list.length ? <Empty>{t('Nothing recorded yet.')}</Empty> : (
      <>
        <Stack direction="row" sx={{ justifyContent: 'flex-end', mb: 1.5 }}><ExportButton table={table} disabled={!list.length} folder="Stock" /></Stack>
        <Card sx={{ overflow: 'hidden' }}><Box sx={{ overflowX: 'auto' }}>
          <MovementTable moves={list} itemOf={itemOf} nameOf={nameOf} />
        </Box></Card>
      </>
    )}
  </>
}

function MovementTable({ moves, itemOf, nameOf }: { moves: StockMovement[]; itemOf?: (id: string) => StockItem | undefined; nameOf: (id: string | null) => string }) {
  return (
    <Table size="small" aria-label={t('Stock history')}>
      <TableHead><TableRow>
        <TableCell>{t('When')}</TableCell>{itemOf && <TableCell>{t('Item')}</TableCell>}<TableCell>{t('What happened')}</TableCell>
        <TableCell align="right">{t('Change')}</TableCell><TableCell align="right">{t('After')}</TableCell><TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('Who')}</TableCell>
      </TableRow></TableHead>
      <TableBody>
        {moves.map(m => (
          <TableRow key={m.id}>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatLocal(m.at, 'd MMM, HH:mm')}</TableCell>
            {itemOf && <TableCell>{itemOf(m.item_id)?.name ?? '—'}</TableCell>}
            <TableCell>{t(reasonLabel(m.reason))}{m.note && <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>{` · ${m.note}`}</Typography>}</TableCell>
            <TableCell align="right" sx={{ color: m.change < 0 ? tokens.badFg : m.change > 0 ? tokens.goodFg : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {m.change > 0 ? `+${formatNumber(m.change)}` : formatNumber(m.change)}
            </TableCell>
            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(m.on_hand_after)}</TableCell>
            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, color: 'text.secondary' }}>{nameOf(m.by)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

const ADD = '\u0000add'
const blank = (): StockItemInput => ({ name: '', category: null, supplier_id: null, supplier_sku: null, product_url: null, unit: 'unit', pack_size: null,
  order_multiple: 1, cost_per_unit: null, vat_rate: 10, sell_price: null, on_hand: 0, par_level: null, reorder_at: null, location: 'Storeroom',
  retail: false, notes: null, active: true })

/** Add or edit an item (admins), or look at one and its history (everyone else). */
function ItemDialog({ item, suppliers, categories, locations, readOnly, onClose }: {
  item: StockItem | null; suppliers: Supplier[]; categories: string[]; locations: string[]; readOnly: boolean; onClose: () => void
}) {
  const { api, profiles } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [d, setD] = useState<StockItemInput>(() => (item ? { ...item } : blank()))
  const [deleting, setDeleting] = useState(false)
  const [typing, setTyping] = useState<'category' | 'location' | null>(null)
  const moves = useAsync('stock-movements', () => (item ? api.stockMovements(item.id) : Promise.resolve([])), [item?.id])
  const set = (patch: Partial<StockItemInput>) => setD(x => ({ ...x, ...patch }))
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
  const field = (k: keyof StockItemInput) => (d[k] === null || d[k] === undefined ? '' : String(d[k]))
  const margin = retailMargin({ sell_price: d.sell_price ?? null, cost_per_unit: d.cost_per_unit ?? null, vat_rate: d.vat_rate ?? 10 })

  const save = () => run(async () => {
    if (!d.name.trim()) throw new Error(t('Give the item a name'))
    for (const k of ['cost_per_unit', 'sell_price', 'par_level', 'reorder_at', 'on_hand', 'order_multiple'] as const) {
      const v = d[k]
      if (v !== null && v !== undefined && !(Number.isFinite(v) && (k === 'on_hand' || v >= 0))) throw new Error(t('Enter numbers like 12 or 1,45'))
    }
    if (d.reorder_at != null && d.par_level != null && d.reorder_at > d.par_level) throw new Error(t('Reorder at can’t be more than the par level'))
    if (d.product_url && !/^https?:\/\/\S+$/i.test(d.product_url.trim())) throw new Error(t('The link needs to start with https://'))
    const { updated_at: _u, ...row } = d as StockItem
    await api.saveStockItem({ ...row, name: d.name.trim(), product_url: d.product_url?.trim() || null, order_multiple: d.order_multiple || 1 })
    onClose()
  }, item ? t('Saved') : t('Added {name}', { name: d.name.trim() }))
  const remove = () => run(async () => { await api.deleteStockItem(item!.id); onClose() }, t('Deleted {name}', { name: item!.name }))

  const choice = (k: 'category' | 'location', label: string, options: string[], defaults: string[]) => typing === k ? (
    <TextField autoFocus fullWidth label={label} value={field(k)} onChange={e => set({ [k]: e.target.value })} onBlur={() => setTyping(null)} slotProps={{ htmlInput: { maxLength: 60 } }} />
  ) : (
    <TextField select fullWidth label={label} value={field(k)} disabled={readOnly}
      onChange={e => (e.target.value === ADD ? (set({ [k]: '' }), setTyping(k)) : set({ [k]: e.target.value || null }))}>
      <MenuItem value="">{'—'}</MenuItem>
      {[...new Set([...defaults, ...options, ...(d[k] ? [String(d[k])] : [])])].map(c => <MenuItem key={c} value={c}>{t(c)}</MenuItem>)}
      <MenuItem value={ADD}>{t('Add another…')}</MenuItem>
    </TextField>
  )

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle>{item ? item.name : t('Add an item')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Name')} value={d.name} onChange={e => set({ name: e.target.value })} autoFocus={!item} disabled={readOnly} slotProps={{ htmlInput: { maxLength: 120 } }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {choice('category', t('Category'), categories, CATEGORIES)}
            {choice('location', t('Location'), locations, LOCATIONS)}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select fullWidth label={t('Supplier')} value={d.supplier_id ?? ''} disabled={readOnly} onChange={e => set({ supplier_id: e.target.value || null })}>
              <MenuItem value="">{t('No supplier')}</MenuItem>
              {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
            </TextField>
            <TextField fullWidth label={t('Their reference')} value={field('supplier_sku')} disabled={readOnly} onChange={e => set({ supplier_sku: e.target.value || null })} slotProps={{ htmlInput: { maxLength: 60 } }} />
          </Stack>
          <TextField label={t('Link to the item on their website')} value={field('product_url')} disabled={readOnly} onChange={e => set({ product_url: e.target.value || null })}
            placeholder={'https://'} type="url" />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select fullWidth label={t('Counted in')} value={d.unit ?? 'unit'} disabled={readOnly} onChange={e => set({ unit: e.target.value as StockItem['unit'] })}>
              {UNITS.map(u => <MenuItem key={u.id} value={u.id}>{t(u.label)}</MenuItem>)}
            </TextField>
            <TextField fullWidth label={t('How it comes')} value={field('pack_size')} disabled={readOnly} onChange={e => set({ pack_size: e.target.value || null })}
              placeholder={t('e.g. 6 × 1 l')} slotProps={{ htmlInput: { maxLength: 60 } }} />
            <TextField fullWidth label={t('Order in multiples of')} value={field('order_multiple')} disabled={readOnly} onChange={e => set({ order_multiple: num(e.target.value) ?? 1 })} inputMode="decimal" />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label={t('Cost per unit, without IVA')} value={field('cost_per_unit')} disabled={readOnly} onChange={e => set({ cost_per_unit: num(e.target.value) })} inputMode="decimal"
              slotProps={{ input: { startAdornment: <InputAdornment position="start">{'€'}</InputAdornment> } }} />
            <TextField select fullWidth label={t('IVA')} value={d.vat_rate ?? 10} disabled={readOnly} onChange={e => set({ vat_rate: Number(e.target.value) })}>
              {[0, 4, 10, 21].map(r => <MenuItem key={r} value={r}>{`${r}%`}</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            {!item && <TextField fullWidth label={t('In stock now')} value={field('on_hand')} onChange={e => set({ on_hand: num(e.target.value) ?? 0 })} inputMode="decimal" />}
            <TextField fullWidth label={t('Reorder at')} value={field('reorder_at')} disabled={readOnly} onChange={e => set({ reorder_at: num(e.target.value) })} inputMode="decimal"
              helperText={t('Shows as low at this many')} />
            <TextField fullWidth label={t('Par level')} value={field('par_level')} disabled={readOnly} onChange={e => set({ par_level: num(e.target.value) })} inputMode="decimal"
              helperText={t('Orders top up to this many')} />
          </Stack>
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, px: 1.5, py: 1 }}>
            <FormControlLabel label={t('Sold in the shop')} disabled={readOnly} control={<Checkbox checked={!!d.retail} onChange={e => set({ retail: e.target.checked })} />} />
            {d.retail && (
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mt: 1, mb: 0.5 }}>
                <TextField size="small" label={t('Shop price, with IVA')} value={field('sell_price')} disabled={readOnly} onChange={e => set({ sell_price: num(e.target.value) })} inputMode="decimal"
                  slotProps={{ input: { startAdornment: <InputAdornment position="start">{'€'}</InputAdornment> } }} />
                {margin !== null && <Typography variant="body2" sx={{ color: margin < 50 ? tokens.badFg : 'text.secondary' }}>{t('Margin {pct}%', { pct: formatNumber(margin) })}</Typography>}
              </Stack>
            )}
          </Box>
          <TextField label={t('Notes')} value={field('notes')} disabled={readOnly} onChange={e => set({ notes: e.target.value || null })} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 2000 } }} />
          {item && (
            <Box>
              <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('History')}</Typography>
              {moves.data?.length ? <MovementTable moves={moves.data.slice(0, 10)} nameOf={id => profiles.find(p => p.id === id)?.full_name ?? '—'} />
                : <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Nothing recorded yet.')}</Typography>}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {item && !readOnly && (deleting ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto' }}>
            <Typography variant="body2">{t('Delete {name}?', { name: item.name })}</Typography>
            <Button size="small" color="error" variant="contained" onClick={remove}>{t('Delete')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </Stack>
        ) : <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleting(true)} sx={{ mr: 'auto' }}>{t('Delete')}</Button>)}
        <Button onClick={onClose}>{readOnly ? t('Close') : t('Cancel')}</Button>
        {!readOnly && <Button variant="contained" onClick={save}>{item ? t('Save') : t('Add')}</Button>}
      </DialogActions>
    </Dialog>
  )
}

const FIELD_LABELS: Record<string, string> = {
  name: msg('Name'), category: msg('Category'), supplier: msg('Supplier'), sku: msg('Reference'), url: msg('Link'), unit: msg('Unit'), pack: msg('How it comes'),
  multiple: msg('Order in multiples of'), cost: msg('Cost per unit'), vat: msg('IVA'), price: msg('Shop price'), on_hand: msg('On hand'), par: msg('Par level'),
  reorder: msg('Reorder at'), location: msg('Location'), notes: msg('Notes'),
}

/** Items from a spreadsheet or a supplier's price list; suppliers are matched by name. */
function ImportDialog({ suppliers, onClose }: { suppliers: Supplier[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<{ name: string; csv: StockCsvImport } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const used = file?.csv.columns.filter(c => c.field) ?? []
  const match = (name?: string | null) => (name ? suppliers.find(s => s.name.trim().toLowerCase() === name.trim().toLowerCase())?.id ?? null : null)
  const unmatched = [...new Set((file?.csv.rows ?? []).filter(r => r.supplier && !match(r.supplier)).map(r => r.supplier!))]
  const pick = async (f: File | undefined) => {
    if (!f) return
    setProblem(null)
    const csv = readStockCsv(new Uint8Array(await f.arrayBuffer()))
    if (!csv.columns.some(c => c.field === 'name')) { setFile(null); setProblem(t('No item names in that file. The first line needs headings such as Item, Supplier, Cost, Unit.')); return }
    setFile({ name: f.name, csv })
  }
  const add = () => run(async () => {
    await api.importStockItems(file!.csv.rows.map(({ supplier, ...r }) => ({ ...r, supplier_id: match(supplier) })))
    onClose()
  }, tn(file?.csv.rows.length ?? 0, '{n} item added', '{n} items added'))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('Import items from a CSV file')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('Save your stock sheet or a supplier’s price list as CSV. The first line names the columns, e.g. Item, Supplier, Reference, Unit, Cost, IVA, Stock, Reorder at, Par (in English or Spanish).')}
          </Typography>
          <Box>
            <input ref={input} type="file" hidden accept=".csv,text/csv" aria-label={t('CSV file')} onChange={e => { void pick(e.target.files?.[0]); e.target.value = '' }} />
            <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => input.current?.click()}>{file ? t('Choose another file') : t('Choose a CSV file')}</Button>
            {file && <Typography component="span" variant="body2" sx={{ ml: 1.5, color: 'text.secondary' }}>{file.name}</Typography>}
          </Box>
          {problem && <Alert severity="warning">{problem}</Alert>}
          {file && <>
            <Alert severity={file.csv.rows.length ? 'success' : 'info'} role="status">
              <b>{tn(file.csv.rows.length, '{n} item to add', '{n} items to add')}</b>
              {file.csv.skipped > 0 && <Box>{tn(file.csv.skipped, '{n} line has no item name: left out.', '{n} lines have no item name: left out.')}</Box>}
              {unmatched.length > 0 && <Box>{t('Not on your suppliers yet, so left without one: {names}', { names: unmatched.join(', ') })}</Box>}
            </Alert>
            <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
              {used.map(c => <Chip key={c.heading} size="small" label={`${c.heading} → ${t(FIELD_LABELS[c.field!])}`} />)}
            </Stack>
          </>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!file?.csv.rows.length} onClick={add}>{tn(file?.csv.rows.length ?? 0, 'Add {n} item', 'Add {n} items')}</Button>
      </DialogActions>
    </Dialog>
  )
}
