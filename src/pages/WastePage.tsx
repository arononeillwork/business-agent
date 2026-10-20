import {
  Autocomplete, Box, Button, Card, InputAdornment, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { WASTE_REASONS, wasteReasonLabel, wasteSummary, type WasteReason } from '../../shared/recipes'
import { unitLabel, type StockItem } from '../../shared/stock'
import { addDays, formatLocal, formatMoney, formatNumber, localDate, today, weekStart } from '../../shared/time'
import { t, tn } from '../i18n'

type Period = 'today' | 'week' | 'month'

/** The waste log: the team writes down what's thrown away and why; admins with pay access see what it cost. */
export function WastePage() {
  const { api, canSeePay, isPartner, profiles } = useApp()
  const stock = useAsync('stock', () => api.stockItems(), [])
  const moves = useAsync('stock-movements', () => api.stockMovements(), [])
  const [period, setPeriod] = useState<Period>('week')
  const items = useMemo(() => (stock.data ?? []).filter(i => i.active), [stock.data])
  const showCost = canSeePay
  const from = period === 'today' ? today() : period === 'week' ? weekStart(today()) : `${today().slice(0, 7)}-01`
  const inPeriod = (moves.data ?? []).filter(m => localDate(m.at) >= from)
  const waste = inPeriod.filter(m => m.reason === 'waste')
  const summary = wasteSummary(inPeriod, items)
  const itemOf = (id: string) => items.find(i => i.id === id)
  const costOf = (id: string, change: number) => Math.abs(change) * (itemOf(id)?.cost_per_unit ?? 0)
  const byDay = [...new Set(waste.map(m => localDate(m.at)))].sort().reverse()
  const nameOf = (id: string | null) => profiles.find(p => p.id === id)?.full_name ?? '—'
  const label = { today: t('Today'), week: t('This week'), month: t('This month') }[period]

  const table = (): ExportTable => ({
    title: t('Waste: {period}', { period: label }),
    filename: `waste-${from}-${today()}`,
    columns: [t('When'), t('Item'), t('Quantity'), t('Unit'), t('Why'), t('Note'), t('Who'), ...(showCost ? [t('Cost')] : [])],
    rows: waste.map(m => [formatLocal(m.at, 'yyyy-MM-dd HH:mm'), itemOf(m.item_id)?.name ?? '', Math.abs(m.change), itemOf(m.item_id) ? t(unitLabel(itemOf(m.item_id)!.unit)) : '',
      t(wasteReasonLabel(m.waste_reason)), m.note ?? '', nameOf(m.by), ...(showCost ? [Math.round(costOf(m.item_id, m.change) * 100) / 100] : [])]),
    ...(showCost ? { footer: [t('Total'), '', '', '', '', '', '', summary.cost], money: [7] } : {}),
  })

  return (
    <>
      <PageHeader eyebrow={t('Stock')} title={t('Waste log')} actions={<ExportButton table={table} disabled={!waste.length} folder="Stock" />} />
      <ErrorBox error={stock.error ?? moves.error} />
      {!isPartner && <LogWaste items={items} />}

      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <ToggleButtonGroup exclusive size="small" value={period} onChange={(_, v: Period | null) => v && setPeriod(v)} aria-label={t('Period')}>
          <ToggleButton value="today">{t('Today')}</ToggleButton>
          <ToggleButton value="week">{t('This week')}</ToggleButton>
          <ToggleButton value="month">{t('This month')}</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <StatGrid>
        <StatTile label={t('Times logged')} value={moves.data ? waste.length : '–'} note={label} />
        {showCost && <StatTile label={t('Cost of waste')} value={moves.data ? formatMoney(summary.cost) : '–'} note={t('at cost, without IVA')} />}
        {showCost && <StatTile label={t('Of what was delivered')} value={summary.ofPurchases === null ? '—' : `${formatNumber(summary.ofPurchases)}%`}
          note={summary.ofPurchases === null ? t('No deliveries recorded') : t('waste ÷ deliveries, at cost')} />}
        <StatTile label={t('Wasted most')} value={summary.top[0]?.name ?? '—'}
          note={summary.top[0] ? (showCost ? formatMoney(summary.top[0].cost) : formatNumber(summary.top[0].quantity)) : undefined} />
      </StatGrid>

      {moves.data && !waste.length ? <Empty>{t('Nothing thrown away {period}.', { period: label.toLowerCase() })}</Empty> : <>
        {summary.top.length > 1 && (
          <Card component="section" aria-label={t('Wasted most')} sx={{ p: 2, mb: 2 }}>
            <SectionTitle>{t('Wasted most')}</SectionTitle>
            <Stack spacing={0.75}>
              {summary.top.slice(0, 5).map(x => (
                <Stack key={x.name} direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography>{x.name}</Typography>
                  <Typography sx={{ color: 'text.secondary' }}>{showCost ? formatMoney(x.cost) : formatNumber(x.quantity)}</Typography>
                </Stack>
              ))}
            </Stack>
          </Card>
        )}
        {byDay.map(day => {
          const list = waste.filter(m => localDate(m.at) === day)
          const total = list.reduce((s, m) => s + costOf(m.item_id, m.change), 0)
          return (
            <Card key={day} component="section" aria-label={formatLocal(`${day}T12:00:00Z`, 'EEEE d MMMM')} sx={{ mb: 2, overflow: 'hidden' }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', px: 2, pt: 1.5 }}>
                <Typography sx={{ fontWeight: 500 }}>{day === today() ? t('Today') : day === addDays(today(), -1) ? t('Yesterday') : formatLocal(`${day}T12:00:00Z`, 'EEEE d MMMM')}</Typography>
                {showCost && <Typography sx={{ color: 'text.secondary' }}>{formatMoney(total)}</Typography>}
              </Stack>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" aria-label={t('Waste on {day}', { day })}>
                  <TableHead><TableRow>
                    <TableCell>{t('Item')}</TableCell><TableCell align="right">{t('Quantity')}</TableCell><TableCell>{t('Why')}</TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('Who')}</TableCell>{showCost && <TableCell align="right">{t('Cost')}</TableCell>}
                  </TableRow></TableHead>
                  <TableBody>
                    {list.map(m => {
                      const item = itemOf(m.item_id)
                      return (
                        <TableRow key={m.id}>
                          <TableCell>{item?.name ?? '—'}{m.note && <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>{` · ${m.note}`}</Typography>}</TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{`${formatNumber(Math.abs(m.change))} ${item ? t(unitLabel(item.unit)) : ''}`}</TableCell>
                          <TableCell><Tag>{t(wasteReasonLabel(m.waste_reason))}</Tag></TableCell>
                          <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, color: 'text.secondary' }}>{nameOf(m.by)}</TableCell>
                          {showCost && <TableCell align="right">{formatMoney(costOf(m.item_id, m.change))}</TableCell>}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </Box>
            </Card>
          )
        })}
      </>}
    </>
  )
}

/** Quick: what, how many, why. It comes off the item's stock straight away. */
function LogWaste({ items }: { items: StockItem[] }) {
  const { api } = useApp()
  const run = useAction()
  const [item, setItem] = useState<StockItem | null>(null)
  const [n, setN] = useState('1')
  const [why, setWhy] = useState<WasteReason>('expired')
  const [note, setNote] = useState('')
  const log = () => run(async () => {
    const qty = Number(n.replace(',', '.'))
    if (!item) throw new Error(t('Choose what was thrown away'))
    if (!(qty > 0)) throw new Error(t('Enter how many'))
    await api.recordStock([{ item_id: item.id, reason: 'waste', change: -qty, waste_reason: why, note }])
    setItem(null); setN('1'); setNote('')
  }, item ? tn(Number(n.replace(',', '.')) || 0, '{n} logged as waste', '{n} logged as waste') : undefined)
  return (
    <Card component="section" aria-label={t('Log waste')} sx={{ p: 2, mb: 3 }}>
      <SectionTitle>{t('Log waste')}</SectionTitle>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'flex-start' } }}>
        <Autocomplete size="small" sx={{ flex: 2, minWidth: 200 }} options={items} value={item} onChange={(_, v) => setItem(v)} getOptionLabel={o => o.name}
          isOptionEqualToValue={(a, b) => a.id === b.id} renderInput={p => <TextField {...p} label={t('What')} />} />
        <TextField size="small" sx={{ width: { md: 130 } }} label={t('How many')} value={n} onChange={e => setN(e.target.value)} inputMode="decimal"
          slotProps={{ input: { endAdornment: item ? <InputAdornment position="end">{t(unitLabel(item.unit))}</InputAdornment> : undefined } }} />
        <TextField select size="small" sx={{ width: { md: 190 } }} label={t('Why')} value={why} onChange={e => setWhy(e.target.value as WasteReason)}>
          {WASTE_REASONS.map(r => <MenuItem key={r.id} value={r.id}>{t(r.label)}</MenuItem>)}
        </TextField>
        <TextField size="small" sx={{ flex: 1 }} label={t('Note (optional)')} value={note} onChange={e => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
        <Button variant="contained" onClick={log}>{t('Log it')}</Button>
      </Stack>
    </Card>
  )
}
