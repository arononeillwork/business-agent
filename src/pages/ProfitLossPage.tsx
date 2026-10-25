import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { BarChart } from '../components/charts'
import { Empty, ErrorBox, Loading, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import { tillsOf } from '../components/till'
import { Freshness } from '../components/Freshness'
import type { ExportTable } from '../lib/export'
import { buildPnl, COST_OF_SALES, monthsBetween, PEOPLE, yearBefore, type Pnl, type PnlLine, type PnlRow } from '../../shared/pnl'
import { addDays, currencySymbol, formatLocal, formatMoney, today, zonedIso } from '../../shared/time'
import { msg, t, tc } from '../i18n'
import { tokens } from '../theme'

type Period = 'year' | '12' | 'quarter' | 'lastquarter' | 'custom'
const PERIODS: { id: Period; label: string }[] = [
  { id: 'year', label: msg('This year') }, { id: '12', label: msg('Last 12 months') },
  { id: 'quarter', label: msg('This quarter') }, { id: 'lastquarter', label: msg('Last quarter') },
  { id: 'custom', label: msg('Choose months') },
]

const monthOf = (d: string) => d.slice(0, 7)
const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number)
  const i = y * 12 + (m - 1) + n
  return `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`
}
const quarterStart = (month: string) => `${month.slice(0, 4)}-${String(Math.floor((Number(month.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}`
const lastDayOf = (month: string) => addDays(`${addMonths(month, 1)}-01`, -1)
const monthName = (m: string, pattern = 'MMM yy') => formatLocal(`${m}-01T12:00:00Z`, pattern)

/** The months a period covers, never past this month. */
function monthsOf(period: Period, custom: { from: string; to: string }, now: string): [string, string] {
  const m = monthOf(now)
  switch (period) {
    case 'year': return [`${m.slice(0, 4)}-01`, m]
    case '12': return [addMonths(m, -11), m]
    case 'quarter': return [quarterStart(m), m]
    case 'lastquarter': { const q = addMonths(quarterStart(m), -3); return [q, addMonths(q, 2)] }
    case 'custom': {
      const to = custom.to > m ? m : custom.to
      return [custom.from > to ? to : custom.from, to]
    }
  }
}

/** Categories offered for a one-off cost: the cost of sales, the team and the running costs Finances uses. */
const COST_CATEGORIES = [...COST_OF_SALES, PEOPLE, msg('Premises'), msg('Utilities'), msg('Services'), msg('Equipment'), msg('Marketing'),
  msg('Software'), msg('Insurance'), msg('Finance'), msg('Taxes & fees'), msg('Other')]

/** A line's name in the person's language: the app's own names and Finances' categories are translated, one-off lines are as typed. */
const rowLabel = (r: PnlRow) => (r.key.includes('one-off') || r.key.startsWith('income:') ? r.label : t(r.label))
const percent = (v: number | null) => (v === null ? '–' : `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`)

/**
 * Profit and loss, month by month: takings without IVA, the cost of sales, the team and the running
 * costs, with one-off lines on top. An estimate from the app's own data, not the filed accounts.
 * Admins with pay access edit; finance partners read (enforced in the database too).
 */
export function ProfitLossPage() {
  const { canSeeFinances, isPartner, api, rates, settings } = useApp()
  const canEdit = canSeeFinances && !isPartner
  const now = today()
  const [period, setPeriod] = useState<Period>('year')
  const [custom, setCustom] = useState({ from: addMonths(monthOf(now), -5), to: monthOf(now) })
  const [from, to] = monthsOf(period, custom, now)
  const prevFrom = addMonths(from, -12)
  const lastDay = lastDayOf(to) > now ? now : lastDayOf(to)

  const integ = useAsync('integrations', () => (isPartner ? Promise.resolve(null) : api.integrations()), [isPartner])
  const till = tillsOf(integ.data?.integrations).length > 0
  // One read of takings covers this period and the same months a year before.
  const sales = useAsync('pnl-sales', () => (till ? api.sales(`${prevFrom}-01`, lastDay) : Promise.resolve(null)), [till, prevFrom, lastDay])
  const expenses = useAsync('expenses', () => api.expenses(), [])
  const team = useAsync('pnl-team', async () => {
    const [entries, shifts] = await Promise.all([
      api.timeEntries(zonedIso(`${prevFrom}-01`, '00:00'), zonedIso(addDays(lastDay, 1), '00:00')),
      api.shifts(zonedIso(`${prevFrom}-01`, '00:00'), zonedIso(addDays(lastDay, 1), '00:00')),
    ])
    return { entries, shifts }
  }, [prevFrom, lastDay])
  const pnlSettings = useAsync('pnl-settings', () => api.pnlSettings(), [])
  const lines = useAsync('pnl-lines', () => api.pnlLines(prevFrom, to), [prevFrom, to])

  if (!canSeeFinances) {
    return <>
      <PageHeader eyebrow={t('Accounts')} title={t('Profit & loss')} />
      <Alert severity="info">{t('Profit & loss is only visible to admins with pay access.')}</Alert>
    </>
  }

  const loaded = !!expenses.data && !!pnlSettings.data && !!lines.data && !!team.data && (!till || !!sales.data || !!sales.error)
  const days = sales.data?.days ?? []
  // The business opened on the first day the till took money (running costs count from then).
  const opened = days.find(d => d.gross > 0)?.date ?? null
  const input = (months: string[]) => ({
    months, today: now, opened, vatRate: pnlSettings.data?.vat_rate ?? 10, employerMultiplier: settings?.employer_cost_multiplier ?? 1,
    takings: days, expenses: expenses.data ?? [], entries: team.data?.entries ?? [], shifts: team.data?.shifts ?? [], rates, lines: lines.data ?? [],
  })
  // Months before the business opened are left out (unless that leaves nothing to show).
  const all = monthsBetween(from, to)
  const months = opened && all.some(m => m >= monthOf(opened)) ? all.filter(m => m >= monthOf(opened)) : all
  const pnl = loaded ? buildPnl(input(months)) : null
  const before = loaded ? buildPnl(input(yearBefore(months))) : null
  const lastYear = before && before.totals.income > 0 ? before : null
  const periodName = period === 'custom'
    ? `${monthName(months[0], 'MMM yyyy')} – ${monthName(months[months.length - 1], 'MMM yyyy')}`
    : t(PERIODS.find(p => p.id === period)!.label)
  const best = pnl && pnl.operatingProfit.length ? months[pnl.operatingProfit.indexOf(Math.max(...pnl.operatingProfit))] : null

  const picker = (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
      <TextField select size="small" value={period} onChange={e => setPeriod(e.target.value as Period)} sx={{ minWidth: 170 }}
        slotProps={{ select: { SelectDisplayProps: { 'aria-label': t('Period') } } }}>
        {PERIODS.map(p => <MenuItem key={p.id} value={p.id}>{t(p.label)}</MenuItem>)}
      </TextField>
      {period === 'custom' && <>
        <TextField size="small" type="month" label={t('From')} value={custom.from} onChange={e => e.target.value && setCustom(c => ({ ...c, from: e.target.value }))}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: monthOf(now) } }} />
        <TextField size="small" type="month" label={t('To')} value={custom.to} onChange={e => e.target.value && setCustom(c => ({ ...c, to: e.target.value }))}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: monthOf(now) } }} />
      </>}
    </Stack>
  )

  return (
    <>
      <PageHeader eyebrow={t('Accounts')} title={t('Profit & loss')} actions={<>{picker}{!canEdit && <Tag>{t('Read-only')}</Tag>}</>} />
      {sales.data && <Box sx={{ mt: -2, mb: 2 }}><Freshness id="takings" at={sales.data.fetched_at} /></Box>}
      <ErrorBox error={expenses.error ?? team.error ?? pnlSettings.error ?? lines.error} />
      {sales.error && <Alert severity="warning" sx={{ mb: 2 }}>{t('Takings couldn’t be read: {error}', { error: sales.error })}</Alert>}
      {integ.data && !till && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button component={RouterLink} to="/connections" size="small">{t('Connect')}</Button>}>
          {t('Connect Square, SumUp or Stripe to count takings as income. Until then, income is only the one-off lines you add.')}
        </Alert>
      )}
      {isPartner && <Alert severity="info" sx={{ mb: 2 }}>{t('Takings and team costs show to the business’s admins only, so here you see the costs and one-off lines.')}</Alert>}

      <StatGrid>
        <StatTile label={t('Income')} value={pnl ? formatMoney(pnl.totals.income) : '–'}
          note={pnl ? t('{amount} with IVA from the till', { amount: formatMoney(pnl.takingsWithVat) }) : undefined} />
        <StatTile label={t('Gross profit')} value={pnl ? formatMoney(pnl.totals.grossProfit) : '–'}
          note={pnl?.totals.grossMargin != null ? t('{percent} margin', { percent: percent(pnl.totals.grossMargin) }) : undefined} />
        <StatTile label={t('Operating profit')} value={pnl ? formatMoney(pnl.totals.operatingProfit) : '–'}
          note={pnl?.totals.operatingMargin != null ? t('{percent} margin', { percent: percent(pnl.totals.operatingMargin) }) : undefined} />
        <StatTile label={t('Best month')} value={best ? monthName(best, 'MMMM') : '–'}
          note={best && pnl ? formatMoney(pnl.operatingProfit[months.indexOf(best)]) : undefined} />
      </StatGrid>

      {!pnl ? <Loading /> : <>
        <Statement pnl={pnl} lastYear={lastYear} periodName={periodName} />
        <Card component="section" aria-label={t('Income and costs by month')} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle>{t('Income and costs by month')}</SectionTitle>
            <BarChart format={formatMoney} current={t('Income')} previous={t('Costs')}
              label={t('Income per month as bars, with costs as a line; the gap is the operating profit')}
              points={months.map((m, i) => ({ label: monthName(m, 'MMM'), title: monthName(m, 'MMMM yyyy'), value: pnl.income[i], prev: Math.round((pnl.income[i] - pnl.operatingProfit[i]) * 100) / 100 }))} />
          </CardContent>
        </Card>
      </>}

      {lines.data && <OneOffLines lines={lines.data.filter(l => months.includes(monthOf(l.month)))} months={months} canEdit={canEdit} />}
      {pnlSettings.data && <Rates vat={pnlSettings.data.vat_rate} multiplier={settings?.employer_cost_multiplier ?? 1} canEdit={canEdit} />}
    </>
  )
}

/** The statement: one column per month, the total, and the same months last year when there's data for them. */
function Statement({ pnl, lastYear, periodName }: { pnl: Pnl; lastYear: Pnl | null; periodName: string }) {
  const { months } = pnl
  const previous = (r: PnlRow) => lastYear?.rows.find(x => x.key === r.key)?.total ?? null
  const cell = (r: PnlRow, v: number | null) => (r.kind === 'heading' ? '' : r.kind === 'margin' ? percent(v) : v === null ? '–' : formatMoney(v))
  const strong = (r: PnlRow) => r.kind === 'subtotal' || r.kind === 'result' || r.kind === 'heading'

  const table = (): ExportTable => ({
    title: t('Profit & loss: {period}', { period: periodName.toLowerCase() }),
    filename: `profit-and-loss-${months[0]}-${months[months.length - 1]}`,
    columns: [t('Line'), ...months.map(m => monthName(m)), t('Total'), ...(lastYear ? [t('Same months last year')] : [])],
    rows: pnl.rows.map(r => {
      const v = (x: number | null) => (r.kind === 'heading' ? null : r.kind === 'margin' ? (x === null ? '' : `${x}%`) : x)
      return [rowLabel(r), ...r.values.map(v), v(r.total), ...(lastYear ? [v(previous(r))] : [])]
    }),
    bold: pnl.rows.flatMap((r, i) => (strong(r) ? [i] : [])),
    money: [...months.map((_, i) => i + 1), months.length + 1, ...(lastYear ? [months.length + 2] : [])],
  })

  const num = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const
  return (
    <Card component="section" aria-label={t('Profit & loss statement')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={<ExportButton table={table} folder="Finances" />}>{t('Profit & loss statement')}</SectionTitle>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label={t('Profit & loss statement')} sx={{ minWidth: 220 + months.length * 96 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 1 }} />
                {months.map(m => (
                  <TableCell key={m} align="right" sx={num}>
                    {monthName(m)}{pnl.partial.includes(m) && <Tooltip title={t('Part of the month')}><span aria-label={t('Part of the month')}> *</span></Tooltip>}
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ ...num, fontWeight: 600 }}>{t('Total')}</TableCell>
                {lastYear && <TableCell align="right" sx={num}>{t('Last year')}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {pnl.rows.map(r => (
                <TableRow key={r.key} sx={{
                  ...(r.kind === 'result' ? { '& td': { borderTop: `2px solid ${tokens.ink}`, fontWeight: 600 } } : {}),
                  ...(r.kind === 'subtotal' ? { '& td': { fontWeight: 600 } } : {}),
                  ...(r.kind === 'heading' ? { '& td': { pt: 2, fontWeight: 600, color: tokens.roseDeep, borderBottom: 0 } } : {}),
                  ...(r.kind === 'margin' ? { '& td': { color: 'text.secondary', fontSize: '0.8rem' } } : {}),
                }}>
                  <TableCell component="th" scope="row" sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 1, minWidth: 200,
                    pl: r.kind === 'line' || r.kind === 'margin' ? 3 : 2 }}>
                    {rowLabel(r)}
                    {r.note && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 400 }}>{t(r.note)}</Typography>}
                  </TableCell>
                  {r.values.map((v, i) => (
                    <TableCell key={months[i]} align="right" sx={{ ...num, color: r.kind !== 'margin' && v !== null && v < 0 ? tokens.danger : undefined }}>{cell(r, v)}</TableCell>
                  ))}
                  <TableCell align="right" sx={{ ...num, fontWeight: r.kind === 'margin' ? undefined : 600 }}>{cell(r, r.total)}</TableCell>
                  {lastYear && <TableCell align="right" sx={{ ...num, color: 'text.secondary' }}>{cell(r, previous(r))}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1.5 }}>
          {t('An estimate from the app’s own figures (the till, Finances, timecards and the rota), to run the business by. The accounts your gestoría files are the official ones.')}
          {pnl.partial.length > 0 && ` ${t('* Part of the month: this month so far, or the month the business opened.')}`}
        </Typography>
      </CardContent>
    </Card>
  )
}

/** One-off income and costs the till and Finances don't know about: a grant paid out, a repair, stock for an event. */
function OneOffLines({ lines, months, canEdit }: { lines: PnlLine[]; months: string[]; canEdit: boolean }) {
  const { api } = useApp()
  const run = useAction()
  const [editing, setEditing] = useState<Partial<PnlLine> | null>(null)
  return (
    <Card component="section" aria-label={t('One-off income and costs')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={canEdit && (
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setEditing({ month: `${months[months.length - 1]}-01`, kind: 'cost', category: 'Equipment', label: '', amount: 0 })}>
            {t('Add a line')}
          </Button>
        )}>{t('One-off income and costs')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('For what the till and Finances don’t know about: a grant paid out, a repair, stock bought for an event.')}
        </Typography>
        {lines.length === 0 ? <Empty>{t('No one-off lines in these months.')}</Empty> : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label={t('One-off income and costs')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('Month')}</TableCell><TableCell>{t('What')}</TableCell><TableCell>{t('Category')}</TableCell>
                  <TableCell align="right">{t('Amount')}</TableCell>{canEdit && <TableCell />}
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.map(l => (
                  <TableRow key={l.id} hover>
                    <TableCell>{monthName(monthOf(l.month), 'MMMM yyyy')}</TableCell>
                    <TableCell sx={{ fontWeight: 500 }}>{l.label}</TableCell>
                    <TableCell>{l.kind === 'income' ? <Tag fg={tokens.matchaDeep}>{t('Income')}</Tag> : <Tag>{l.category ? t(l.category) : tc('expense', 'Cost')}</Tag>}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{l.kind === 'cost' ? '−' : ''}{formatMoney(l.amount)}</TableCell>
                    {canEdit && (
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap', width: 96 }}>
                        <IconButton size="small" aria-label={t('Edit {name}', { name: l.label })} onClick={() => setEditing(l)}><EditIcon fontSize="small" /></IconButton>
                        <IconButton size="small" aria-label={t('Remove {name}', { name: l.label })} onClick={() => void run(() => api.deletePnlLine(l.id), t('Line removed'))}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardContent>
      {editing && <LineDialog line={editing} months={months} onClose={() => setEditing(null)} />}
    </Card>
  )
}

function LineDialog({ line, months, onClose }: { line: Partial<PnlLine>; months: string[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [d, setD] = useState(line)
  const month = monthOf(d.month ?? `${months[months.length - 1]}-01`)
  const choices = months.includes(month) ? months : [...months, month].sort()
  const save = async () => {
    const ok = await run(() => api.savePnlLine({ id: d.id, month: `${month}-01`, kind: d.kind ?? 'cost', category: d.kind === 'income' ? null : d.category ?? null,
      label: d.label ?? '', amount: Number(d.amount) || 0, notes: d.notes ?? null }), t('Line saved'))
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{d.id ? t('Change the line') : t('Add a line')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select label={t('Income or cost')} value={d.kind ?? 'cost'} onChange={e => setD({ ...d, kind: e.target.value as PnlLine['kind'] })}>
            <MenuItem value="income">{t('Income')}</MenuItem>
            <MenuItem value="cost">{tc('expense', 'Cost')}</MenuItem>
          </TextField>
          <TextField label={t('What it is')} value={d.label ?? ''} onChange={e => setD({ ...d, label: e.target.value })} autoFocus
            placeholder={d.kind === 'income' ? t('For example a grant paid out') : t('For example Grinder repair')} />
          {d.kind !== 'income' && (
            <TextField select label={t('Category')} value={d.category ?? 'Other'} onChange={e => setD({ ...d, category: e.target.value })}
              helperText={t('Stock and Supplies count as cost of sales; People as the team.')}>
              {COST_CATEGORIES.map(c => <MenuItem key={c} value={c}>{t(c)}</MenuItem>)}
            </TextField>
          )}
          <TextField select label={t('Month')} value={month} onChange={e => setD({ ...d, month: `${e.target.value}-01` })}>
            {choices.map(m => <MenuItem key={m} value={m}>{monthName(m, 'MMMM yyyy')}</MenuItem>)}
          </TextField>
          <TextField label={t('Amount')} type="number" value={d.amount ?? 0} onChange={e => setD({ ...d, amount: Number(e.target.value) })}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">{currencySymbol()}</InputAdornment> }, htmlInput: { min: 0, step: 0.01 } }}
            helperText={t('Without IVA')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!d.label?.trim()} onClick={save}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** The IVA taken off the takings, and the employer's Social Security on top of pay (the same the rota and timecards use). */
function Rates({ vat, multiplier, canEdit }: { vat: number; multiplier: number; canEdit: boolean }) {
  const { api, refresh } = useApp()
  const run = useAction()
  const [vatDraft, setVat] = useState(String(vat))
  const ss = Math.round((multiplier - 1) * 1000) / 10
  const [ssDraft, setSs] = useState(String(ss))
  const save = async () => {
    const v = Number(vatDraft), s = Number(ssDraft)
    if (!(v >= 0 && v <= 30)) { await run(async () => { throw new Error(t('IVA is between 0% and 30%')) }); return }
    if (!(s >= 0 && s <= 60)) { await run(async () => { throw new Error(t('Social Security is between 0% and 60%')) }); return }
    await run(async () => {
      if (v !== vat) await api.savePnlSettings({ vat_rate: v })
      if (s !== ss) { await api.updateSettings({ employer_cost_multiplier: Math.round((1 + s / 100) * 1000) / 1000 }); await refresh() }
    }, t('Saved'))
  }
  return (
    <Card component="section" aria-label={t('How the figures are worked out')}>
      <CardContent>
        <SectionTitle>{t('How the figures are worked out')}</SectionTitle>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'flex-start' } }}>
          <TextField label={t('IVA in the takings')} type="number" value={vatDraft} onChange={e => setVat(e.target.value)} disabled={!canEdit}
            slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }, htmlInput: { min: 0, max: 30, step: 0.5 } }}
            helperText={t('10% for food and drink served in a café')} sx={{ maxWidth: 260 }} />
          <TextField label={t('Employer’s Social Security on pay')} type="number" value={ssDraft} onChange={e => setSs(e.target.value)} disabled={!canEdit}
            slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }, htmlInput: { min: 0, max: 60, step: 0.5 } }}
            helperText={t('About 31.5% in Spain. The rota and timecards use it too.')} sx={{ maxWidth: 300 }} />
          {canEdit && <Button variant="contained" onClick={save} sx={{ mt: { sm: 1 } }}>{t('Save')}</Button>}
        </Stack>
        {ss === 0 && canEdit && (
          <Alert severity="info" sx={{ mt: 2 }} action={<Button size="small" onClick={() => setSs('31.5')}>{t('Use 31.5%')}</Button>}>
            {t('No Social Security is added on top of pay yet, so the team costs less here than it really does.')}
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
