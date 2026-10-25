import {
  Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Link, MenuItem, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import UploadIcon from '@mui/icons-material/UploadFileOutlined'
import SearchIcon from '@mui/icons-material/Search'
import LinkIcon from '@mui/icons-material/OpenInNew'
import PhoneIcon from '@mui/icons-material/PhoneOutlined'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import EmailIcon from '@mui/icons-material/EmailOutlined'
import WebIcon from '@mui/icons-material/LanguageOutlined'
import OrderIcon from '@mui/icons-material/ShoppingCartOutlined'
import { useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { Empty, ErrorBox, PageHeader, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import {
  CATEGORIES, LOCATIONS, costWithVat, lastPriceChanges, retailMargin, risesSince, unitLabel,
  type PriceChange, type StockItem, type StockPrice, type Supplier,
} from '../../shared/stock'
import { addDays, formatLocal, formatMoney, formatNumber, today } from '../../shared/time'
import { tokens } from '../theme'
import { t, tc, tn } from '../i18n'
import { ImportDialog, ItemDialog } from './StockPage'

type Show = 'all' | 'changed' | 'shop' | 'unpriced'
/** Price changes this recent count as new (the tile, the filter). */
const RECENT_DAYS = 90

const pct = (n: number) => `${n > 0 ? '+' : ''}${formatNumber(n)}%`
/** "€18,50 / kg" by weight or volume; "€6,20 each" for bottles, packs and the like (the pack size says what one is). */
const perUnit = (price: number, unit: StockItem['unit']) => (['kg', 'g', 'l', 'ml'].includes(unit)
  ? t('{price} / {unit}', { price: formatMoney(price), unit: t(unitLabel(unit)) }) : t('{price} each', { price: formatMoney(price) }))

/**
 * Wholesale: everything bought from suppliers, by supplier: what it costs with and without IVA, how
 * it comes, the link to order it, what went up and when, and the shop's margin on what's sold.
 * Admins add and price items (or import a supplier's price list); finance partners read.
 */
export function WholesalePage() {
  const { api, isAdmin } = useApp()
  const items = useAsync('stock', () => api.stockItems(), [])
  const suppliers = useAsync('suppliers', () => api.suppliers(), [])
  const prices = useAsync('stock-prices', () => api.stockPrices(), [])
  const [show, setShow] = useState<Show>('all')
  const [q, setQ] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [category, setCategory] = useState('')
  const [editing, setEditing] = useState<StockItem | 'new' | null>(null)
  const [history, setHistory] = useState<StockItem | null>(null)
  const [importing, setImporting] = useState(false)

  const all = useMemo(() => (items.data ?? []).filter(i => i.active).sort((a, b) => a.name.localeCompare(b.name)), [items.data])
  const sups = suppliers.data ?? []
  const supplierOf = (i: StockItem) => sups.find(s => s.id === i.supplier_id) ?? null
  const changes = useMemo(() => lastPriceChanges(prices.data ?? []), [prices.data])
  const changeOf = (i: StockItem) => changes.find(c => c.item_id === i.id) ?? null
  const since = addDays(today(), -RECENT_DAYS)
  const changedLately = (i: StockItem) => (changeOf(i)?.at.slice(0, 10) ?? '') >= since
  const rises = risesSince(changes.filter(c => all.some(i => i.id === c.item_id)), since)
  const nameOf = (id: string) => all.find(i => i.id === id)?.name ?? ''
  const margins = all.filter(i => i.retail).map(retailMargin).filter((m): m is number => m !== null)
  const unpriced = all.filter(i => i.cost_per_unit === null)
  const used = (f: (i: StockItem) => string | null) => [...new Set(all.map(f).filter((x): x is string => !!x))]
  const categories = [...new Set([...CATEGORIES.filter(c => all.some(i => i.category === c)), ...used(i => i.category)])]
  const locations = [...new Set([...LOCATIONS.filter(l => all.some(i => i.location === l)), ...used(i => i.location)])]

  const needle = q.trim().toLowerCase()
  const fits: Record<Show, (i: StockItem) => boolean> = {
    all: () => true, changed: changedLately, shop: i => i.retail, unpriced: i => i.cost_per_unit === null,
  }
  const shown = all.filter(i => fits[show](i) && (!supplierId || i.supplier_id === supplierId) && (!category || i.category === category)
    && (!needle || [i.name, i.supplier_sku, i.category, i.pack_size, supplierOf(i)?.name].some(x => x?.toLowerCase().includes(needle))))
  const groups = [
    ...sups.map(s => ({ supplier: s as Supplier | null, items: shown.filter(i => i.supplier_id === s.id) })),
    { supplier: null, items: shown.filter(i => !supplierOf(i)) },
  ].filter(g => g.items.length)
  const filtered = show !== 'all' || !!supplierId || !!category || !!needle

  const table = (): ExportTable => ({
    title: t('Wholesale'),
    filename: `wholesale-${today()}`,
    columns: [t('Supplier'), t('Item'), t('Category'), t('Reference'), t('How it comes'), t('Unit'), t('Order in multiples of'), t('Cost per unit'),
      t('IVA %'), t('Cost with IVA'), t('Last price change %'), t('Changed on'), t('Shop price'), t('Margin %'), t('Link')],
    rows: groups.flatMap(g => g.items.map(i => {
      const c = changeOf(i)
      return [g.supplier?.name ?? '', i.name, i.category ? t(i.category) : '', i.supplier_sku ?? '', i.pack_size ?? '', t(unitLabel(i.unit)), i.order_multiple,
        i.cost_per_unit, i.vat_rate, costWithVat(i), c?.pct ?? null, c ? formatLocal(c.at, 'dd/MM/yyyy') : '', i.retail ? i.sell_price : null,
        i.retail ? retailMargin(i) : null, i.product_url ?? '']
    })),
    money: [7, 9, 12],
  })

  return (
    <>
      <PageHeader eyebrow={t('Stock')} title={t('Wholesale')}
        actions={<>
          {isAdmin && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')}>{t('Add item')}</Button>}
          {isAdmin && <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => setImporting(true)}>{t('Import a price list')}</Button>}
          <ExportButton table={table} disabled={!shown.length} folder="Stock" />
        </>} />
      <ErrorBox error={items.error ?? suppliers.error ?? prices.error} />

      <StatGrid>
        <StatTile label={t('Items')} value={items.data ? all.length : '–'}
          note={tn(new Set(all.map(i => supplierOf(i)?.id).filter(Boolean)).size, 'from {n} supplier', 'from {n} suppliers')} />
        <StatTile label={t('Price rises, last 90 days')} value={prices.data ? rises.length : '–'}
          note={rises.length ? `${nameOf(rises[0].item_id)} ${pct(rises[0].pct)}` : t('No prices up lately')} />
        <StatTile label={t('Shop margin')} value={margins.length ? `${formatNumber(Math.round(margins.reduce((s, m) => s + m, 0) / margins.length * 10) / 10)}%` : '–'}
          note={margins.length ? tn(margins.length, 'average of {n} shop item', 'average of {n} shop items') : t('No shop items priced yet')} />
        <StatTile label={t('Without a cost')} value={items.data ? unpriced.length : '–'}
          note={unpriced.length ? unpriced.slice(0, 2).map(i => i.name).join(', ') : t('Every item has its cost')} />
      </StatGrid>

      {items.data && all.length === 0 ? (
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
          {([['all', t('All'), all.length], ['changed', t('Price changes'), all.filter(changedLately).length], ['shop', t('Shop items'), all.filter(i => i.retail).length],
            ['unpriced', t('No cost yet'), unpriced.length]] as const).map(([id, label, n]) => (
            <Chip key={id} size="small" clickable label={`${label} ${n}`} onClick={() => setShow(id)} aria-pressed={show === id}
              variant={show === id ? 'filled' : 'outlined'} color={show === id ? 'primary' : 'default'} />
          ))}
          <Box sx={{ flex: 1 }} />
          {([[t('Supplier'), supplierId, setSupplierId, sups.map(s => [s.id, s.name]), t('Every supplier')],
            [t('Category'), category, setCategory, categories.map(c => [c, t(c)]), t('Every category')]] as const).map(([label, value, set, options, any]) => (
            <TextField key={label} select size="small" value={value} onChange={e => set(e.target.value)} sx={{ width: { xs: '100%', sm: 170 } }}
              slotProps={{ select: { displayEmpty: true, SelectDisplayProps: { 'aria-label': label } } }}>
              <MenuItem value="">{any}</MenuItem>
              {options.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
            </TextField>
          ))}
          <TextField size="small" placeholder={t('Search items…')} value={q} onChange={e => setQ(e.target.value)} sx={{ width: { xs: '100%', sm: 220 } }}
            slotProps={{ htmlInput: { 'aria-label': t('Search wholesale items') }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        </Stack>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {filtered ? t('{n} of {total} shown', { n: shown.length, total: all.length }) : tn(all.length, '{n} item', '{n} items')}
          {' · '}{t('Costs are per unit, wholesale.')}
        </Typography>
        {items.data && !groups.length && <Empty>{t('Nothing matches that.')}</Empty>}
        <Stack spacing={2}>
          {groups.map(g => (
            <SupplierItems key={g.supplier?.id ?? 'none'} supplier={g.supplier} items={g.items} changeOf={changeOf} isAdmin={isAdmin}
              onOpen={setEditing} onHistory={setHistory} />
          ))}
        </Stack>
      </>}

      {editing && <ItemDialog item={editing === 'new' ? null : editing} suppliers={sups} categories={categories} locations={locations}
        readOnly={!isAdmin} onClose={() => setEditing(null)} />}
      {importing && <ImportDialog suppliers={sups} items={items.data ?? []} onClose={() => setImporting(false)} />}
      {history && <PriceHistory item={history} prices={(prices.data ?? []).filter(p => p.item_id === history.id)} onClose={() => setHistory(null)} />}
    </>
  )
}

/** One supplier: how to reach and order from them, and what the café buys from them at what price. */
function SupplierItems({ supplier: s, items, changeOf, isAdmin, onOpen, onHistory }: {
  supplier: Supplier | null; items: StockItem[]; changeOf: (i: StockItem) => PriceChange | null; isAdmin: boolean
  onOpen: (i: StockItem) => void; onHistory: (i: StockItem) => void
}) {
  const name = s?.name ?? t('No supplier')
  const cell = { py: 1, borderColor: tokens.line } as const
  const hide = (from: 'sm' | 'md' | 'lg') => ({ display: { xs: 'none', [from]: 'table-cell' } })
  return (
    <Card component="section" aria-label={name} sx={{ overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${tokens.line}` }}>
        <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: 1, justifyContent: 'space-between', alignItems: { md: 'center' } }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" component="h2">
              {s && isAdmin ? <Link component={RouterLink} to="/suppliers" underline="hover" color="inherit">{name}</Link> : name}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {s ? [s.kind && t(s.kind), s.contact_name, s.minimum_order ? t('Minimum {amount}', { amount: formatMoney(s.minimum_order) }) : null, s.payment_terms,
                s.account_number ? t('Customer no. {n}', { n: s.account_number }) : null].filter(Boolean).join(' · ') || tn(items.length, '{n} item', '{n} items')
                : t('Give these a supplier to see them with the rest of their order.')}
            </Typography>
          </Box>
          {s && (
            <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
              {s.phone && <Button size="small" variant="outlined" startIcon={<PhoneIcon />} href={`tel:${s.phone.replace(/\s/g, '')}`}>{s.phone}</Button>}
              {s.phone && s.whatsapp && <Button size="small" variant="outlined" startIcon={<WhatsAppIcon />} href={`https://wa.me/${s.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener">{'WhatsApp'}</Button>}
              {s.email && <Button size="small" variant="outlined" startIcon={<EmailIcon />} href={`mailto:${s.email}`}>{t('Email')}</Button>}
              {s.order_url && <Button size="small" variant="outlined" startIcon={<OrderIcon />} href={s.order_url} target="_blank" rel="noopener">{t('Order page')}</Button>}
              {!s.order_url && s.website && <Button size="small" variant="outlined" startIcon={<WebIcon />} href={s.website} target="_blank" rel="noopener">{t('Website')}</Button>}
            </Stack>
          )}
        </Stack>
      </Box>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" aria-label={s ? t('Items from {name}', { name }) : t('Items without a supplier')}>
          <TableHead>
            <TableRow>
              <TableCell>{t('Item')}</TableCell>
              <TableCell align="right">{t('Cost')}</TableCell>
              <TableCell align="right" sx={hide('sm')}>{t('With IVA')}</TableCell>
              <TableCell sx={hide('md')}>{t('Last price change')}</TableCell>
              <TableCell align="right" sx={hide('lg')}>{t('Shop price')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map(i => {
              const c = changeOf(i)
              const margin = i.retail ? retailMargin(i) : null
              const withVat = costWithVat(i)
              return (
                <TableRow key={i.id} hover aria-label={i.name} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                  <TableCell sx={{ ...cell, maxWidth: 320 }}>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                      <Link component="button" underline="hover" onClick={() => onOpen(i)} sx={{ fontWeight: 500, textAlign: 'left', color: 'text.primary' }}>{i.name}</Link>
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
                      {[i.pack_size, i.supplier_sku && t('ref. {sku}', { sku: i.supplier_sku }), i.order_multiple > 1 && t('in {n}s', { n: formatNumber(i.order_multiple) }),
                        i.category && t(i.category)].filter(Boolean).join(' · ')}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ ...cell, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {i.cost_per_unit === null ? <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('No cost yet')}</Tag> : perUnit(i.cost_per_unit, i.unit)}
                  </TableCell>
                  <TableCell align="right" sx={{ ...cell, ...hide('sm'), whiteSpace: 'nowrap', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                    {withVat === null ? '—' : `${formatMoney(withVat)} (${formatNumber(i.vat_rate)}%)`}
                  </TableCell>
                  <TableCell sx={{ ...cell, ...hide('md'), whiteSpace: 'nowrap' }}>
                    {c ? (
                      <Link component="button" underline="hover" onClick={() => onHistory(i)} aria-label={t('Price history of {name}', { name: i.name })}
                        sx={{ color: c.to > c.from ? tokens.badFg : tokens.goodFg, fontVariantNumeric: 'tabular-nums' }}>
                        {t('{pct} on {date}', { pct: pct(c.pct), date: formatLocal(c.at, 'd MMM') })}
                      </Link>
                    ) : <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>{t('No change')}</Typography>}
                  </TableCell>
                  <TableCell align="right" sx={{ ...cell, ...hide('lg'), whiteSpace: 'nowrap' }}>
                    {i.retail && i.sell_price !== null ? <>
                      {formatMoney(i.sell_price)}
                      {margin !== null && (
                        <Typography component="div" variant="body2" sx={{ color: margin < 50 ? tokens.badFg : 'text.secondary' }}>{t('Margin {pct}%', { pct: formatNumber(margin) })}</Typography>
                      )}
                    </> : '—'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Box>
    </Card>
  )
}

/** Every price an item has had, newest first, with how much each one changed. */
function PriceHistory({ item, prices, onClose }: { item: StockItem; prices: StockPrice[]; onClose: () => void }) {
  const list = [...prices].sort((a, b) => b.changed_at.localeCompare(a.changed_at))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Price history: {name}', { name: item.name })}</DialogTitle>
      <DialogContent>
        <Table size="small" aria-label={t('Prices')}>
          <TableHead>
            <TableRow>
              <TableCell>{t('From')}</TableCell>
              <TableCell align="right">{t('Cost')}</TableCell>
              <TableCell align="right">{tc('difference', 'Change')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map((p, n) => {
              const before = list[n + 1]
              const change = before && Number(before.cost_per_unit) > 0
                ? Math.round((p.cost_per_unit - before.cost_per_unit) / before.cost_per_unit * 1000) / 10 : null
              return (
                <TableRow key={`${p.changed_at}-${n}`}>
                  <TableCell>{formatLocal(p.changed_at, 'd MMM yyyy')}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{perUnit(p.cost_per_unit, item.unit)}</TableCell>
                  <TableCell align="right" sx={{ color: change === null ? 'text.secondary' : change > 0 ? tokens.badFg : tokens.goodFg }}>
                    {change === null ? '—' : pct(change)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>{t('Kept each time its cost changes, here or from a price list.')}</Typography>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{t('Close')}</Button></DialogActions>
    </Dialog>
  )
}
