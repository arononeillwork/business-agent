import {
  Alert, Autocomplete, Box, Button, Card, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import type { TextFieldProps } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import WarningIcon from '@mui/icons-material/WarningAmberRounded'
import { useMemo, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton, SortCell, toEnter, useSort } from '../components/tables'
import type { ExportTable } from '../lib/export'
import {
  DEFAULT_TARGET_MARGIN, RECIPE_CATEGORIES, costing, lineCost, linesFor, priceForTarget, unitsFor, type Recipe, type RecipeInput, type RecipeLine, type RecipeVariant,
} from '../../shared/recipes'
import { unitLabel, type StockItem } from '../../shared/stock'
import { addDays, formatMoney, formatNumber, today } from '../../shared/time'
import { tokens } from '../theme'
import { t, tc, tn } from '../i18n'

const pct = (n: number | null) => (n === null ? '—' : `${formatNumber(n)}%`)
/** empty: nothing entered for what goes in, so no cost or margin yet. pending: empty, or an ingredient without a cost. */
type Row = Recipe & { c: ReturnType<typeof costing>; empty: boolean; pending: boolean }
const SORT_BY: Record<string, (r: Row) => string | number | null> = {
  name: r => r.name, category: r => r.category, price: r => r.sell_price, cost: r => (r.empty ? null : r.c.cost), margin: r => r.c.margin, pct: r => r.c.marginPct,
}
const row = (r: Recipe, items: StockItem[]): Row => {
  const c = costing(r, items)
  const empty = linesFor(r).length === 0
  return { ...r, c: empty ? { ...c, margin: null, marginPct: null, below: false } : c, empty, pending: empty || c.missing.length > 0 }
}

/** Admins: what each drink and dish costs to make, from the stock items in it, and the margin it makes. */
export function RecipesPage() {
  const { api, isPartner } = useApp()
  const data = useAsync('recipes', () => api.recipes(), [])
  const stock = useAsync('stock', () => api.stockItems(), [])
  const [open, setOpen] = useState<Recipe | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const [category, setCategory] = useState('')
  const [belowOnly, setBelowOnly] = useState(false)
  const [q, setQ] = useState('')
  const items = useMemo(() => stock.data ?? [], [stock.data])
  const all: Row[] = (data.data ?? []).filter(r => r.active).map(r => row(r, items))
  const below = all.filter(r => r.c.below)
  const shown = all.filter(r => (!category || r.category === category) && (!belowOnly || r.c.below) && (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())))
  const { rows, sort } = useSort(shown, SORT_BY, { by: 'pct', dir: 'asc' })
  const priced = all.filter(r => r.c.marginPct !== null)
  const average = priced.length ? Math.round(priced.reduce((s, r) => s + r.c.marginPct!, 0) / priced.length * 10) / 10 : null
  const categories = [...new Set([...RECIPE_CATEGORIES.filter(c => all.some(r => r.category === c)), ...all.map(r => r.category).filter((c): c is string => !!c)])]

  const table = (): ExportTable => ({
    title: t('Menu costing'),
    filename: `menu-costing-${today()}`,
    columns: [t('Item'), t('Variant'), t('Category'), t('Price with IVA'), t('Price without IVA'), t('Cost'), t('Margin'), t('Margin %'), t('Target %')],
    rows: rows.flatMap(r => [
      [r.name, '', r.category ? t(r.category) : '', r.c.price, r.c.net === null ? null : Math.round(r.c.net * 100) / 100, r.empty ? null : Math.round(r.c.cost * 100) / 100,
        r.c.margin === null ? null : Math.round(r.c.margin * 100) / 100, r.c.marginPct, r.target_margin],
      ...r.variants.map(v => {
        const c = costing(r, items, v.id)
        return [r.name, v.name, r.category ? t(r.category) : '', c.price, c.net === null ? null : Math.round(c.net * 100) / 100, Math.round(c.cost * 100) / 100,
          c.margin === null ? null : Math.round(c.margin * 100) / 100, c.marginPct, r.target_margin]
      }),
    ]),
    money: [3, 4, 5, 6],
  })

  const cell = { py: 1, borderColor: tokens.line } as const
  const hide = (from: 'sm' | 'md' | 'lg') => ({ display: { xs: 'none', [from]: 'table-cell' } })
  return (
    <>
      <PageHeader eyebrow={t('Stock')} title={t('Menu costing')}
        actions={<>
          {!isPartner && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen('new')}>{t('Add menu item')}</Button>}
          {!isPartner && <Button variant="outlined" onClick={() => setImporting(true)}>{t('Import from Square')}</Button>}
          <ExportButton table={table} disabled={!rows.length} folder="Stock" />
        </>} />
      <ErrorBox error={data.error ?? stock.error} />
      <StatGrid>
        <StatTile label={t('Menu items')} value={data.data ? all.length : '–'} note={tn(all.reduce((s, r) => s + r.variants.length, 0), '{n} variant', '{n} variants')} />
        <StatTile label={t('Average margin')} value={pct(average)} note={t('on the price without IVA')} />
        <StatTile label={t('Below target')} value={data.data ? below.length : '–'} note={below.length ? below.slice(0, 2).map(r => r.name).join(', ') : t('All on target')} />
        <StatTile label={t('Lowest margin')} value={priced.length ? pct(Math.min(...priced.map(r => r.c.marginPct!))) : '–'}
          note={priced.length ? [...priced].sort((a, b) => a.c.marginPct! - b.c.marginPct!)[0].name : undefined} />
      </StatGrid>

      {data.data && !all.length ? (
        <Empty>
          <Typography sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}>{t('Know what every drink costs to make')}</Typography>
          {t('Add a menu item and what goes in it (18 g of beans, 180 ml of milk, a cup and a lid). The cost follows your stock prices, and the margin shows against the menu price.')}
        </Empty>
      ) : <>
        <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
          <Chip size="small" clickable label={`${t('Below target')} ${below.length}`} onClick={() => setBelowOnly(v => !v)} aria-pressed={belowOnly}
            variant={belowOnly ? 'filled' : 'outlined'} color={belowOnly ? 'error' : 'default'} />
          <Box sx={{ flex: 1 }} />
          <TextField select size="small" value={category} onChange={e => setCategory(e.target.value)} sx={{ width: { xs: '100%', sm: 180 } }}
            slotProps={{ select: { displayEmpty: true, SelectDisplayProps: { 'aria-label': t('Category') } } }}>
            <MenuItem value="">{t('Every category')}</MenuItem>
            {categories.map(c => <MenuItem key={c} value={c}>{t(c)}</MenuItem>)}
          </TextField>
          <TextField size="small" placeholder={t('Search the menu…')} value={q} onChange={e => setQ(e.target.value)} sx={{ width: { xs: '100%', sm: 220 } }}
            slotProps={{ htmlInput: { 'aria-label': t('Search the menu') }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        </Stack>
        <Card sx={{ overflow: 'hidden' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label={t('Menu costing')}>
              <TableHead><TableRow>
                <SortCell sort={sort} id="name">{t('Item')}</SortCell>
                <SortCell sort={sort} id="category" sx={hide('lg')}>{t('Category')}</SortCell>
                <SortCell sort={sort} id="price" align="right">{t('Price')}</SortCell>
                <SortCell sort={sort} id="cost" align="right" sx={hide('sm')}>{t('Cost')}</SortCell>
                <SortCell sort={sort} id="margin" align="right" sx={hide('md')}>{t('Margin')}</SortCell>
                <SortCell sort={sort} id="pct" align="right">{t('Margin %')}</SortCell>
              </TableRow></TableHead>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id} hover onClick={() => setOpen(r)} tabIndex={0} aria-label={r.name} sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(r) } }}>
                    <TableCell sx={cell}>
                      <Typography sx={{ fontWeight: 500 }}>{r.name}</Typography>
                      {(r.variants.length > 0 || r.pending) && (
                        <Typography variant="body2" sx={{ color: r.pending ? tokens.badFg : 'text.secondary' }}>
                          {r.empty ? t('No ingredients yet') : r.c.missing.length ? t('No cost for: {items}', { items: r.c.missing.join(', ') }) : r.variants.map(v => v.name).join(' · ')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ ...cell, ...hide('lg'), color: 'text.secondary' }}>{r.category ? t(r.category) : '—'}</TableCell>
                    <TableCell align="right" sx={{ ...cell, whiteSpace: 'nowrap', ...(r.c.price === null && toEnter) }}>
                      {r.c.price === null ? '—' : formatMoney(r.c.price)}
                      {r.c.net !== null && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('{amount} net', { amount: formatMoney(r.c.net) })}</Typography>}
                    </TableCell>
                    <TableCell align="right" sx={{ ...cell, ...hide('sm'), ...(r.pending && toEnter) }}>{r.empty ? '—' : formatMoney(r.c.cost)}</TableCell>
                    <TableCell align="right" sx={{ ...cell, ...hide('md'), ...((r.pending || r.c.price === null) && toEnter) }}>{r.c.margin === null ? '—' : formatMoney(r.c.margin)}</TableCell>
                    <TableCell align="right" sx={{ ...cell, whiteSpace: 'nowrap', ...((r.pending || r.c.price === null) && toEnter) }}>
                      {r.c.below && <Tooltip title={t('Below the {target}% aimed for', { target: formatNumber(r.target_margin) })}><WarningIcon sx={{ fontSize: 16, color: tokens.badFg, mr: 0.5, verticalAlign: 'text-bottom' }} /></Tooltip>}
                      <Box component="span" sx={{ fontWeight: 500, color: r.c.below ? tokens.badFg : 'inherit' }}>{pct(r.c.marginPct)}</Box>
                    </TableCell>
                  </TableRow>
                ))}
                {data.data && !rows.length && <TableRow><TableCell colSpan={6} sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>{t('Nothing matches that.')}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Box>
        </Card>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 2 }}>
          <Box sx={{ ...toEnter, width: 14, height: 14, borderRadius: 0.5, border: `1px solid ${tokens.line}`, flexShrink: 0 }} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('Shaded: still to be entered (the menu price, what goes in, or an ingredient’s cost on the Stock page).')}
          </Typography>
        </Stack>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          {t('Margin: the menu price without IVA, less what goes in (with its waste allowance), as a share of that price. Costs come from Stock: change a supplier’s price there and every recipe follows.')}
        </Typography>
      </>}
      {open && <RecipeDialog recipe={open === 'new' ? null : open} items={items} readOnly={isPartner} onClose={() => setOpen(null)} />}
      {importing && <SquareImport existing={data.data ?? []} onClose={() => setImporting(false)} />}
    </>
  )
}

const blank = (): RecipeInput => ({ name: '', category: 'Coffee', square_item: null, sell_price: null, vat_rate: 10, target_margin: DEFAULT_TARGET_MARGIN,
  wastage_pct: 0, notes: null, active: true, variants: [], lines: [] })

/** One menu item: its price, what goes in, its variants, and the cost and margin as you type. */
/**
 * A number typed in (a price, an amount, a percentage): what's typed stays as typed while it's the same
 * number ("2." on the way to "2.90", or "2,9"), so the decimal point isn't lost as you type it.
 */
function DecimalField({ value, onNumber, ...props }: Omit<TextFieldProps, 'value' | 'onChange'> & { value: number | null; onNumber: (n: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value))
  const typed = text.trim() === '' ? null : Number(text.replace(',', '.'))
  return (
    <TextField {...props} inputMode="decimal" value={Object.is(typed, value) ? text : value === null ? '' : String(value)}
      onChange={e => { setText(e.target.value); onNumber(e.target.value.trim() === '' ? null : Number(e.target.value.replace(',', '.'))) }} />
  )
}

function RecipeDialog({ recipe, items, readOnly, onClose }: { recipe: Recipe | null; items: StockItem[]; readOnly: boolean; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [r, setR] = useState<RecipeInput>(() => (recipe ? structuredClone(recipe) : blank()))
  const [deleting, setDeleting] = useState(false)
  const set = (patch: Partial<RecipeInput>) => setR(x => ({ ...x, ...patch }))
  const setLine = (i: number, patch: Partial<RecipeLine>) => set({ lines: r.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const addLine = (variant_id: string | null) => {
    const first = items[0]
    if (first) set({ lines: [...r.lines, { item_id: first.id, quantity: 1, unit: unitsFor(first.unit)[0], variant_id, replaces_item_id: null }] })
  }
  const base = costing(r, items)
  const save = () => run(async () => {
    if (!r.name.trim()) throw new Error(t('Give it a name'))
    if (r.sell_price !== null && !(r.sell_price >= 0)) throw new Error(t('Enter numbers like 12 or 1,45'))
    if (r.lines.some(l => !(l.quantity > 0))) throw new Error(t('Every ingredient needs a quantity'))
    if (r.variants.some(v => !v.name.trim())) throw new Error(t('Give every variant a name'))
    await api.saveRecipe({ ...r, name: r.name.trim(), variants: r.variants.map(v => ({ ...v, name: v.name.trim() })) })
    onClose()
  }, recipe ? t('Saved') : t('Added {name}', { name: r.name.trim() }))
  const remove = () => run(async () => { await api.deleteRecipe(recipe!.id); onClose() }, t('Deleted {name}', { name: recipe!.name }))

  const lines = (variant: RecipeVariant | null) => (
    <Stack spacing={1}>
      {r.lines.map((l, i) => ({ l, i })).filter(({ l }) => l.variant_id === (variant?.id ?? null)).map(({ l, i }) => {
        const item = items.find(x => x.id === l.item_id)
        const c = lineCost(l, item)
        return (
          <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Autocomplete size="small" sx={{ flex: 2, minWidth: 0 }} options={items} value={item} disableClearable disabled={readOnly}
              getOptionLabel={o => o.name} isOptionEqualToValue={(a, b) => a.id === b.id}
              onChange={(_, v) => v && setLine(i, { item_id: v.id, unit: unitsFor(v.unit).includes(l.unit) ? l.unit : unitsFor(v.unit)[0] })}
              renderInput={p => <TextField {...p} label={t('Ingredient')} />} />
            <DecimalField size="small" sx={{ width: 90 }} label={tc('quantity', 'Amount')} value={l.quantity} disabled={readOnly}
              onNumber={n => setLine(i, { quantity: n ?? 0 })} />
            <TextField select size="small" sx={{ width: 90 }} label={t('Unit')} value={l.unit} disabled={readOnly} onChange={e => setLine(i, { unit: e.target.value as RecipeLine['unit'] })}>
              {unitsFor(item?.unit ?? 'unit').map(u => <MenuItem key={u} value={u}>{t(unitLabel(u))}</MenuItem>)}
            </TextField>
            {variant && (
              <TextField select size="small" sx={{ width: 140, display: { xs: 'none', sm: 'flex' } }} label={t('Instead of')} value={l.replaces_item_id ?? ''} disabled={readOnly}
                onChange={e => setLine(i, { replaces_item_id: e.target.value || null })}>
                <MenuItem value="">{t('Nothing (added)')}</MenuItem>
                {r.lines.filter(x => x.variant_id === null).map(x => <MenuItem key={x.item_id} value={x.item_id}>{items.find(it => it.id === x.item_id)?.name ?? '?'}</MenuItem>)}
              </TextField>
            )}
            <Typography variant="body2" sx={{ width: 64, textAlign: 'right', color: c === null ? tokens.badFg : 'text.secondary', ...(c === null && { ...toEnter, borderRadius: 1, px: 0.5 }) }}>
              {c === null ? t('No cost') : formatMoney(c)}
            </Typography>
            {!readOnly && <IconButton size="small" aria-label={t('Remove {name}', { name: item?.name ?? '' })} onClick={() => set({ lines: r.lines.filter((_, j) => j !== i) })}><CloseIcon fontSize="small" /></IconButton>}
          </Stack>
        )
      })}
      {!readOnly && <Box><Button size="small" startIcon={<AddIcon />} onClick={() => addLine(variant?.id ?? null)} disabled={!items.length}>{t('Add ingredient')}</Button></Box>}
    </Stack>
  )
  const summary = (c: ReturnType<typeof costing>) => (
    <Typography variant="body2" sx={{ color: c.below ? tokens.badFg : 'text.secondary' }}>
      {c.marginPct === null
        ? t('Cost {cost}', { cost: formatMoney(c.cost) })
        : t('Cost {cost} · {price} without IVA · margin {margin} ({pct})', { cost: formatMoney(c.cost), price: formatMoney(c.net!), margin: formatMoney(c.margin!), pct: pct(c.marginPct) })}
    </Typography>
  )
  const target = priceForTarget(base.cost, r.target_margin, r.vat_rate)

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={phone}>
      <DialogTitle>{recipe ? recipe.name : t('Add a menu item')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label={t('Name')} value={r.name} onChange={e => set({ name: e.target.value })} disabled={readOnly} autoFocus={!recipe} slotProps={{ htmlInput: { maxLength: 120 } }} />
            <TextField select fullWidth label={t('Category')} value={r.category ?? ''} disabled={readOnly} onChange={e => set({ category: e.target.value || null })}>
              <MenuItem value="">{'—'}</MenuItem>
              {[...new Set([...RECIPE_CATEGORIES, ...(r.category ? [r.category] : [])])].map(c => <MenuItem key={c} value={c}>{t(c)}</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <DecimalField fullWidth label={t('Menu price, with IVA')} value={r.sell_price} disabled={readOnly} onNumber={n => set({ sell_price: n })}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">{'€'}</InputAdornment> } }} />
            <TextField select fullWidth label={t('IVA')} value={r.vat_rate} disabled={readOnly} onChange={e => set({ vat_rate: Number(e.target.value) })}>
              {[0, 4, 10, 21].map(v => <MenuItem key={v} value={v}>{`${v}%`}</MenuItem>)}
            </TextField>
            <DecimalField fullWidth label={t('Target margin')} value={r.target_margin} disabled={readOnly} onNumber={n => set({ target_margin: Math.min(99, n ?? 0) })}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">{'%'}</InputAdornment> } }} />
            <DecimalField fullWidth label={t('Waste allowance')} value={r.wastage_pct} disabled={readOnly} onNumber={n => set({ wastage_pct: Math.min(50, n ?? 0) })}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">{'%'}</InputAdornment> } }} />
          </Stack>

          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('What goes in')}</Typography>
            {lines(null)}
            <Box sx={{ mt: 1 }}>{summary(base)}</Box>
            {base.below && target !== null && (
              <Alert severity="warning" sx={{ mt: 1 }}>{t('Below the {target}% aimed for. At {price} with IVA it would be on target.', { target: formatNumber(r.target_margin), price: formatMoney(target) })}</Alert>
            )}
            {base.missing.length > 0 && <Alert severity="info" sx={{ mt: 1 }}>{t('No cost for: {items}. Add their cost on the Stock page.', { items: base.missing.join(', ') })}</Alert>}
          </Box>

          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('Variants')}</Typography>
            <Stack spacing={2}>
              {r.variants.map((v, vi) => (
                <Card key={v.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                    <TextField size="small" label={t('Variant')} value={v.name} disabled={readOnly} placeholder={t('e.g. Oat milk, Extra shot, Large')}
                      onChange={e => set({ variants: r.variants.map((x, j) => (j === vi ? { ...x, name: e.target.value } : x)) })} sx={{ flex: 1 }} />
                    <DecimalField size="small" label={t('Price change')} value={v.price_change} disabled={readOnly} sx={{ width: 130 }}
                      onNumber={n => set({ variants: r.variants.map((x, j) => (j === vi ? { ...x, price_change: n ?? 0 } : x)) })}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start">{'+€'}</InputAdornment> } }} />
                    {!readOnly && <IconButton size="small" aria-label={t('Remove {name}', { name: v.name || t('Variant') })}
                      onClick={() => set({ variants: r.variants.filter(x => x.id !== v.id), lines: r.lines.filter(l => l.variant_id !== v.id) })}><DeleteIcon fontSize="small" /></IconButton>}
                  </Stack>
                  {lines(v)}
                  <Box sx={{ mt: 1 }}>{summary(costing(r, items, v.id))}</Box>
                </Card>
              ))}
              {!readOnly && <Box><Button size="small" startIcon={<AddIcon />} onClick={() => set({ variants: [...r.variants, { id: crypto.randomUUID(), name: '', price_change: 0 }] })}>{t('Add a variant')}</Button></Box>}
            </Stack>
          </Box>
          <TextField label={t('Notes')} value={r.notes ?? ''} disabled={readOnly} onChange={e => set({ notes: e.target.value || null })} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 2000 } }} />
          {r.square_item && <Tag>{t('From Square: {name}', { name: r.square_item })}</Tag>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {recipe && !readOnly && (deleting ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto' }}>
            <Typography variant="body2">{t('Delete {name}?', { name: recipe.name })}</Typography>
            <Button size="small" color="error" variant="contained" onClick={remove}>{t('Delete')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </Stack>
        ) : <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleting(true)} sx={{ mr: 'auto' }}>{t('Delete')}</Button>)}
        <Button onClick={onClose}>{readOnly ? t('Close') : t('Cancel')}</Button>
        {!readOnly && <Button variant="contained" onClick={save}>{recipe ? t('Save') : t('Add')}</Button>}
      </DialogActions>
    </Dialog>
  )
}

/**
 * Menu items from the Square till: what sold in the last 90 days, at its average price. Read from
 * Square's orders (the till connection reads those already); the recipe is added by hand after.
 */
function SquareImport({ existing, onClose }: { existing: Recipe[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const to = today()
  const sold = useAsync('sales-items', () => api.salesItems(addDays(to, -90), to), [to])
  const [picked, setPicked] = useState<string[]>([])
  const known = new Set(existing.flatMap(r => [r.square_item, r.name].filter(Boolean).map(x => x!.toLowerCase())))
  const items = (sold.data?.items ?? []).filter(i => i.quantity > 0 && i.name !== 'Custom amount' && !known.has(i.name.toLowerCase()))
  const price = (i: { gross: number; quantity: number }) => Math.round(i.gross / i.quantity * 100) / 100
  const add = () => run(async () => {
    for (const i of items.filter(x => picked.includes(x.name))) {
      await api.saveRecipe({ ...blank(), name: i.name, square_item: i.name, sell_price: price(i), category: null })
    }
    onClose()
  }, tn(picked.length, '{n} menu item added', '{n} menu items added'))
  const reason = sold.data && !sold.data.items
    ? sold.data.reason === 'reconnect' ? t('Connect Square again on the Connections page so its items can be read.') : t('Square isn’t your till, so there are no items to bring in. Add them by hand.')
    : null
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('Import from Square')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('What sold on the till in the last 90 days, at its average price. Pick the ones to add, then say what goes in each.')}</Typography>
          <ErrorBox error={sold.error ? t('Square couldn’t be read. Is it connected on the Connections page?') : null} />
          {reason && <Alert severity="info">{reason}</Alert>}
          {sold.data?.items && !items.length && <Alert severity="info">{t('Everything that sold is on your menu already.')}</Alert>}
          {items.length > 0 && (
            <Table size="small" aria-label={t('Square items')}>
              <TableHead><TableRow><TableCell padding="checkbox" /><TableCell>{t('Item')}</TableCell><TableCell align="right">{t('Sold')}</TableCell><TableCell align="right">{t('Price')}</TableCell></TableRow></TableHead>
              <TableBody>
                {items.map(i => (
                  <TableRow key={i.name} hover onClick={() => setPicked(p => (p.includes(i.name) ? p.filter(x => x !== i.name) : [...p, i.name]))} sx={{ cursor: 'pointer' }}>
                    <TableCell padding="checkbox"><Checkbox checked={picked.includes(i.name)} slotProps={{ input: { 'aria-label': i.name } }} /></TableCell>
                    <TableCell>{i.name}</TableCell>
                    <TableCell align="right">{formatNumber(i.quantity)}</TableCell>
                    <TableCell align="right">{formatMoney(price(i))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!picked.length} onClick={add}>{tn(picked.length, 'Add {n} item', 'Add {n} items')}</Button>
      </DialogActions>
    </Dialog>
  )
}
