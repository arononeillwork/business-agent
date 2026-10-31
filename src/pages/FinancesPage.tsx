import {
  Alert, Box, Button, Card, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, InputAdornment,
  MenuItem, Stack, Table, TableBody, TableCell, TableFooter, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { usePayRates, useRotaMonth } from '../app/dailyCost'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, Stat, StatGrid, StatRow, StatTile, Tag } from '../components/common'
import { ExportButton, SortCell, useSort } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { addDays, currencySymbol, formatMoney, today, weekStart, zonedIso } from '../../shared/time'
import { shiftPaidMinutes } from '../../shared/rules'
import type { Expense } from '../../shared/types'
import { Link as RouterLink } from 'react-router-dom'
import { tillNames, tillsOf } from '../components/till'
import { Freshness } from '../components/Freshness'
import { OwnerPaySwitch, StaffWagesDialog, WagesHint, useOwnerPay } from '../components/StaffWages'
import { isWagesExpense, ownersPayOff } from '../../shared/dailyCost'
import OpenIcon from '@mui/icons-material/ChevronRightRounded'
import { msg, t, tc } from '../i18n'

/** Monthly running costs. Admins with pay access edit; finance partners read (enforced in the database too). */
export function FinancesPage() {
  const { canSeeFinances, isPartner, api } = useApp()
  const canEdit = canSeeFinances && !isPartner
  const data = useAsync('expenses', () => api.expenses(), [])
  // Owner pay off: the owners' pay for their hours on this month's rota comes off the monthly costs (their
  // rates are needed, so finance partners, who can't see pay, see the costs as listed).
  const [ownerPay] = useOwnerPay()
  const { owners } = useRotaMonth(today().slice(0, 7), canEdit)

  if (!canSeeFinances) {
    return <>
      <PageHeader eyebrow={t('Accounts')} title={t('Finances')} />
      <Alert severity="info">{t('Finances are only visible to admins with pay access.')}</Alert>
    </>
  }

  const all = data.data ?? []
  // Expenses switched off ("not counted") stay on the list but are left out of every figure.
  const counted = all.filter(e => e.active)
  const listed = counted.reduce((s, e) => s + Number(e.amount), 0)
  const ownersOff = canEdit ? ownersPayOff(ownerPay, owners, counted.filter(isWagesExpense).reduce((s, e) => s + Number(e.amount), 0)) : 0
  const total = listed - ownersOff
  const biggest = [...counted].sort((a, b) => b.amount - a.amount)[0]
  const staff = Math.max(0, counted.filter(e => /wage|staff/i.test(e.name)).reduce((s, e) => s + Number(e.amount), 0) - ownersOff)
  const left = all.length - counted.length

  return (
    <>
      <PageHeader eyebrow={t('Accounts')} title={t('Finances')} actions={!canEdit && <Tag>{t('Read-only')}</Tag>} />
      <ErrorBox error={data.error} />

      <StatGrid>
        <StatTile label={t('Monthly costs')} value={data.data ? formatMoney(total) : '–'}
          note={left ? t('{n} items · {left} not counted', { n: counted.length, left }) : t('{n} items', { n: counted.length })} />
        <StatTile label={t('A year')} value={data.data ? formatMoney(total * 12) : '–'} note={t('at this rate')} />
        <StatTile label={t('Per open day')} value={data.data ? formatMoney(total / 26) : '–'} note={t('26 open days a month')} />
        {staff > 0
          ? <StatTile label={t('Staff share')} value={`${Math.round(staff / total * 100)}%`} note={t('{amount} of monthly costs', { amount: formatMoney(staff) })} />
          : <StatTile label={t('Biggest cost')} value={biggest?.name ?? '–'} note={biggest && total ? `${formatMoney(biggest.amount)} · ${Math.round(biggest.amount / total * 100)}%` : undefined} />}
      </StatGrid>

      {canEdit && <Takings />}

      <Expenses list={all} total={listed} ownersOff={ownersOff} canEdit={canEdit} loaded={!!data.data} />
    </>
  )
}

type Draft = Partial<Expense> & { key: string; removed?: boolean }
const blank = (): Draft => ({ key: crypto.randomUUID(), name: '', amount: 0, category: null, notes: null, active: true })

// Offered in the Category list alongside any the business has added itself. Saved in English (shown with t()).
const CATEGORIES = [msg('Premises'), msg('People'), msg('Utilities'), msg('Services'), msg('Supplies'), msg('Stock'), msg('Equipment'),
  msg('Marketing'), msg('Software'), msg('Insurance'), msg('Finance'), msg('Taxes & fees'), msg('Other')]
const NONE = msg('Uncategorised')
const ADD = '\u0000add'

/**
 * The list of expenses. One Edit button turns the whole list into fields; Save keeps every change at once.
 * `total` is what's listed and counted; `ownersOff`, what owner pay off takes off it (the Owner pay switch is here too).
 */
function Expenses({ list, total, ownersOff, canEdit, loaded }: { list: Expense[]; total: number; ownersOff: number; canEdit: boolean; loaded: boolean }) {
  const { api } = useApp()
  const run = useAction()
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [added, setAdded] = useState<string[]>([])
  const [adding, setAdding] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  // Staff wages opens the rota's hours and cost (Staff wages: the rota's hours and cost).
  const [wages, setWages] = useState<Expense | null>(null)
  const editing = drafts !== null
  const set = (key: string, patch: Partial<Draft>) => setDrafts(d => d!.map(x => (x.key === key ? { ...x, ...patch } : x)))

  const used = [...list.map(e => e.category), ...(drafts ?? []).map(d => d.category)].map(c => c?.trim()).filter((c): c is string => !!c)
  const categories = [...new Set([...CATEGORIES, ...used, ...added])].sort((a, b) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)))

  // Filters: the categories this list actually uses, each with how many expenses are in it.
  const catOf = (e: Expense) => e.category?.trim() || NONE
  const counts = new Map<string, number>()
  for (const e of list) counts.set(catOf(e), (counts.get(catOf(e)) ?? 0) + 1)
  const filters = [...counts.keys()].sort((a, b) => (a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b)))
  const active = picked.filter(c => counts.has(c))
  const filtered = active.length ? list.filter(e => active.includes(catOf(e))) : list
  const { rows, sort } = useSort(filtered, SORT_BY, undefined, ['amount', 'share'])
  // Owner pay off comes off the total while the wages line is shown.
  const offShown = rows.some(e => e.active && isWagesExpense(e)) ? ownersOff : 0
  const shownTotal = rows.filter(e => e.active).reduce((s, e) => s + Number(e.amount), 0) - offShown

  const save = async () => {
    const rows = drafts!.filter(d => !d.removed)
    const bad = rows.find(d => !d.name?.trim() && (d.id || d.amount))
    if (bad) { await run(async () => { throw new Error(t('Every expense needs a name')) }); return }
    const before = new Map(list.map(e => [e.id, e]))
    const changed = rows.filter(d => d.name?.trim()).filter(d => {
      const o = d.id ? before.get(d.id) : undefined
      return !o || o.name !== d.name || Number(o.amount) !== Number(d.amount) || (o.category ?? null) !== (d.category || null)
        || (o.notes ?? null) !== (d.notes || null) || o.active !== d.active
    })
    const removed = drafts!.filter(d => d.removed && d.id)
    const ok = await run(async () => {
      for (const d of removed) await api.deleteExpense(d.id!)
      for (const { key: _key, removed: _removed, ...d } of changed) {
        await api.saveExpense({ ...d, name: d.name!.trim(), amount: Number(d.amount) || 0, category: d.category?.trim() || null, notes: d.notes?.trim() || null })
      }
    }, changed.length || removed.length ? t('Expenses saved') : undefined)
    if (ok) setDrafts(null)
  }

  const table = (): ExportTable => ({
    title: active.length ? t('Monthly expenses: {categories}', { categories: active.map(c => t(c)).join(', ') }) : t('Monthly expenses'),
    filename: `expenses-${today()}`,
    columns: [t('Expense'), t('Category'), t('Notes'), t('Per month ({currency})', { currency: currencySymbol() }), t('Counted'), tc('portion', 'Share')],
    rows: [...rows.map(e => [e.name, e.category ? t(e.category) : '', e.notes ?? '', Number(e.amount), e.active ? t('Yes') : t('No'),
      e.active && total > 0 ? `${Math.round(e.amount / total * 100)}%` : '']),
    ...(offShown ? [[t('Owner pay off'), t('People'), t('Owners’ hours on this month’s rota'), -offShown, t('Yes'), '']] : [])],
    footer: [active.length ? t('Total shown') : t('Total'), '', '', shownTotal, '', ''],
    money: [3],
  })

  const shown = editing ? drafts.filter(d => !d.removed) : rows
  return (
    <Card component="section" aria-label={t('Monthly expenses')}>
      <CardContent>
        <SectionTitle action={editing ? (
          <Stack direction="row" spacing={1}>
            <Button onClick={() => setDrafts(null)}>{t('Cancel')}</Button>
            <Button variant="contained" startIcon={<CheckIcon />} onClick={save}>{t('Save changes')}</Button>
          </Stack>
        ) : (
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 1 }}>
            {canEdit && <OwnerPaySwitch />}
            <ExportButton table={table} disabled={!rows.length} folder="Finances" />
            {canEdit && (
              <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setDrafts(list.map(e => ({ ...e, key: e.id })))} aria-label={t('Edit expenses')}>
                {t('Edit')}
              </Button>
            )}
          </Stack>
        )}>
          {t('Monthly expenses')}
        </SectionTitle>
        {editing && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
            {t('Untick “Count” to keep an expense on the list without adding it to the total.')}
          </Typography>
        )}
        {!editing && filters.length > 1 && (
          <Stack direction="row" role="group" aria-label={t('Filter by category')} sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>
            <Chip size="small" clickable label={t('All {n}', { n: list.length })} onClick={() => setPicked([])} aria-pressed={!active.length}
              variant={!active.length ? 'filled' : 'outlined'} color={!active.length ? 'primary' : 'default'} />
            {filters.map(c => {
              const on = active.includes(c)
              return (
                <Chip key={c} size="small" clickable label={`${t(c)} ${counts.get(c)}`} aria-pressed={on}
                  onClick={() => setPicked(on ? active.filter(x => x !== c) : [...active, c])}
                  variant={on ? 'filled' : 'outlined'} color={on ? 'primary' : 'default'} />
              )
            })}
            {active.length > 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary', ml: 0.5 }}>
                {t('{n} of {total} · {amount} a month', { n: rows.length, total: list.length, amount: formatMoney(shownTotal) })}
              </Typography>
            )}
          </Stack>
        )}
        {loaded && !editing && list.length === 0 && <Empty>{canEdit ? t('No expenses yet. Press Edit to add one.') : t('No expenses yet.')}</Empty>}
        {(shown.length > 0 || editing) && (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label={t('Expenses')} sx={{ minWidth: editing ? 680 : undefined }}>
              <TableHead>
                {editing ? (
                  <TableRow>
                    <TableCell padding="checkbox">{t('Count')}</TableCell>
                    <TableCell>{t('Expense')}</TableCell><TableCell>{t('Category')}</TableCell><TableCell>{t('Notes')}</TableCell>
                    <TableCell align="right">{t('Per month')}</TableCell><TableCell />
                  </TableRow>
                ) : (
                  <TableRow>
                    <SortCell sort={sort} id="name">{t('Expense')}</SortCell>
                    <SortCell sort={sort} id="category">{t('Category')}</SortCell>
                    <SortCell sort={sort} id="amount" align="right">{t('Per month')}</SortCell>
                    <SortCell sort={sort} id="share" align="right">{tc('portion', 'Share')}</SortCell>
                  </TableRow>
                )}
              </TableHead>
              <TableBody>
                {editing ? drafts.filter(d => !d.removed).map(d => (
                  <TableRow key={d.key} sx={{ opacity: d.active ? 1 : 0.6, '& td': { verticalAlign: 'top' } }}>
                    <TableCell padding="checkbox">
                      <Checkbox checked={!!d.active} onChange={e => set(d.key, { active: e.target.checked })}
                        slotProps={{ input: { 'aria-label': t('Count {name} in the total', { name: d.name || t('this expense') }) } }} />
                    </TableCell>
                    <TableCell sx={{ minWidth: 170 }}>
                      <TextField size="small" fullWidth value={d.name ?? ''} onChange={e => set(d.key, { name: e.target.value })} placeholder={t('Name')}
                        slotProps={{ htmlInput: { 'aria-label': t('Name') } }} />
                    </TableCell>
                    <TableCell sx={{ minWidth: 150 }}>
                      <TextField select size="small" fullWidth value={d.category?.trim() ?? ''}
                        onChange={e => (e.target.value === ADD ? setAdding(d.key) : set(d.key, { category: e.target.value || null }))}
                        slotProps={{ select: { displayEmpty: true, SelectDisplayProps: { 'aria-label': t('Category for {name}', { name: d.name || t('this expense') }) } } }}>
                        <MenuItem value=""><Typography component="span" sx={{ color: 'text.secondary' }}>{t('None')}</Typography></MenuItem>
                        {categories.map(c => <MenuItem key={c} value={c}>{t(c)}</MenuItem>)}
                        <Divider />
                        <MenuItem value={ADD} sx={{ color: 'primary.main' }}><AddIcon fontSize="small" sx={{ mr: 1 }} />{t('Add category…')}</MenuItem>
                      </TextField>
                    </TableCell>
                    <TableCell sx={{ minWidth: 150 }}>
                      <TextField size="small" fullWidth value={d.notes ?? ''} onChange={e => set(d.key, { notes: e.target.value })} placeholder={t('Notes')}
                        slotProps={{ htmlInput: { 'aria-label': t('Notes for {name}', { name: d.name || t('this expense') }) } }} />
                    </TableCell>
                    <TableCell align="right" sx={{ width: 140 }}>
                      <TextField size="small" type="number" value={d.amount ?? 0} onChange={e => set(d.key, { amount: Number(e.target.value) })}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start">{currencySymbol()}</InputAdornment> },
                          htmlInput: { step: 0.01, min: 0, 'aria-label': t('Per month for {name}', { name: d.name || t('this expense') }), style: { textAlign: 'right' } } }} />
                    </TableCell>
                    <TableCell align="right" sx={{ width: 48 }}>
                      <Tooltip title={t('Remove')}>
                        <IconButton size="small" aria-label={t('Remove {name}', { name: d.name || t('this expense') })} onClick={() => set(d.key, { removed: true })}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                )) : rows.map(e => (
                  <TableRow key={e.id} hover onClick={isWagesExpense(e) ? () => setWages(e) : undefined}
                    sx={{ '& td': { color: e.active ? undefined : 'text.secondary' }, cursor: isWagesExpense(e) ? 'pointer' : undefined }}>
                    <TableCell sx={{ fontWeight: 500 }}>
                      {isWagesExpense(e) ? (
                        <Button variant="text" endIcon={<OpenIcon fontSize="small" />} onClick={ev => { ev.stopPropagation(); setWages(e) }}
                          aria-label={t('{name}: open the rota’s hours and cost', { name: e.name })}
                          sx={{ p: 0, minWidth: 0, fontWeight: 500, color: 'inherit', textTransform: 'none', fontSize: 'inherit', '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}>
                          {e.name}
                        </Button>
                      ) : e.name}
                      {!e.active && <Box component="span" sx={{ ml: 1 }}><Tag>{t('Not counted')}</Tag></Box>}
                      {e.notes && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{e.notes}</Typography>}
                      {isWagesExpense(e) && e.active && <WagesHint amount={Number(e.amount) - ownersOff} />}
                    </TableCell>
                    <TableCell>{e.category && <Tag>{t(e.category)}</Tag>}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, textDecoration: e.active ? 'none' : 'line-through' }}>
                      {formatMoney(e.amount)}
                    </TableCell>
                    <TableCell align="right" sx={{ width: 160 }}>
                      {e.active && total > 0 && (
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                          <Box sx={{ width: 80, height: 6, borderRadius: 3, bgcolor: 'divider', overflow: 'hidden' }}>
                            <Box sx={{ width: `${Math.max(2, e.amount / total * 100)}%`, height: '100%', bgcolor: 'primary.main' }} />
                          </Box>
                          <Typography variant="caption" sx={{ minWidth: 32, textAlign: 'right' }}>{Math.round(e.amount / total * 100)}%</Typography>
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {!editing && (
                <TableFooter>
                  {offShown > 0 && (
                    <TableRow aria-label={t('Owner pay off')}>
                      <TableCell sx={{ color: 'text.primary' }}>
                        {t('Owner pay off')}
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{t('Owners’ hours on this month’s rota, at their rates, come off Staff wages')}</Typography>
                      </TableCell>
                      <TableCell />
                      <TableCell align="right" sx={{ color: 'text.primary', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>−{formatMoney(offShown)}</TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell sx={{ fontWeight: 500, color: 'text.primary', fontSize: '0.95rem' }}>{active.length ? t('Total shown') : t('Total')}</TableCell><TableCell />
                    <TableCell align="right" sx={{ fontWeight: 500, color: 'text.primary', fontSize: '0.95rem', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(shownTotal)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </Box>
        )}
        {editing && (
          <Button startIcon={<AddIcon />} sx={{ mt: 1.5 }} onClick={() => setDrafts(d => [...d!, blank()])}>{t('Add expense')}</Button>
        )}
      </CardContent>
      {wages && <StaffWagesDialog expense={wages} canEdit={canEdit} onClose={() => setWages(null)} />}
      {adding && (
        <AddCategory existing={categories} onClose={() => setAdding(null)} onAdd={name => {
          setAdded(a => [...a, name]); set(adding, { category: name }); setAdding(null)
        }} />
      )}
    </Card>
  )
}

const SORT_BY: Record<string, (e: Expense) => string | number | null> = {
  name: e => e.name,
  category: e => e.category,
  amount: e => Number(e.amount),
  // Expenses not counted have no share: they sort to the end.
  share: e => (e.active ? Number(e.amount) : null),
}

/** A new option for the Category list; it's kept once an expense is saved with it. */
function AddCategory({ existing, onAdd, onClose }: { existing: string[]; onAdd: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const clean = name.trim()
  const dupe = existing.find(c => c.toLowerCase() === clean.toLowerCase() || t(c).toLowerCase() === clean.toLowerCase())
  const submit = () => { if (clean) onAdd(dupe ?? clean) }
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('Add a category')}</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth label={t('Category name')} value={name} onChange={e => setName(e.target.value)} sx={{ mt: 1 }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
          helperText={dupe ? t('“{name}” is already on the list: it will be used.', { name: t(dupe) }) : t('For example Coffee beans, Repairs or Delivery')} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!clean} onClick={submit}>{t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Takings from the till (Square or SumUp) and Stripe, added up, and what the team costs as a share of them. */
function Takings() {
  const { api, settings } = useApp()
  const rates = usePayRates()
  const integ = useAsync('integrations', () => api.integrations(), [])
  const tills = tillsOf(integ.data?.integrations)
  const on = tills.length > 0
  const name = tillNames(tills)
  const day = today(), monday = weekStart(day)
  const sales = useAsync('payment-sales', () => (on ? api.sales(addDays(day, -29), day) : Promise.resolve(null)), [on, day])
  const shifts = useAsync('takings-shifts', () => (on ? api.shifts(zonedIso(monday, '00:00'), zonedIso(addDays(monday, 7), '00:00')) : Promise.resolve([])), [on, monday])
  if (!integ.data) return null
  if (!on) {
    return (
      <Alert severity="info" sx={{ mb: 3 }} action={<Button component={RouterLink} to="/connections" size="small">{t('Connect')}</Button>}>
        {t('Connect Square, SumUp or Stripe to see takings here, next to what the team costs.')}
      </Alert>
    )
  }
  const days = sales.data?.days ?? []
  const sum = (from: string, to: string) => days.filter(d => d.date >= from && d.date <= to).reduce((s, d) => s + d.gross, 0)
  const week = sum(monday, day), lastWeek = sum(addDays(monday, -7), addDays(monday, -1))
  const mult = settings?.employer_cost_multiplier ?? 1
  const labour = (shifts.data ?? []).filter(s => s.status === 'published' && s.starts_at.slice(0, 10) <= day)
    .reduce((m, s) => m + shiftPaidMinutes(s) / 60 * (s.profile_id ? rates.get(s.profile_id) ?? 0 : 0) * mult, 0)
  return (
    <Box component="section" aria-label={t('Takings')} sx={{ mb: 3 }}>
      <SectionTitle action={<Button component={RouterLink} to="/sales" size="small">{t('See sales')}</Button>}>
        {t('Takings')} <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>{t('· from {name}', { name })}</Typography>
      </SectionTitle>
      {sales.data && <Box sx={{ mt: -1, mb: 1.5 }}><Freshness id="takings" at={sales.data.fetched_at} /></Box>}
      <ErrorBox error={sales.error} />
      <StatRow>
        <Stat label={t('Today')} value={sales.data ? formatMoney(sum(day, day)) : '–'} note={t('{n} payments', { n: days.find(d => d.date === day)?.payments ?? 0 })} />
        <Stat label={t('This week')} value={sales.data ? formatMoney(week) : '–'} note={lastWeek ? t('{change}% on last week so far', { change: `${week >= lastWeek ? '+' : ''}${Math.round((week - lastWeek) / lastWeek * 100)}` }) : t('since Monday')} />
        <Stat label={t('Last week')} value={sales.data ? formatMoney(lastWeek) : '–'} />
        <Stat label={t('Last 30 days')} value={sales.data ? formatMoney(sum(addDays(day, -29), day)) : '–'} note={sales.data ? t('{amount} a day on average', { amount: formatMoney(sum(addDays(day, -29), day) / 30) }) : undefined} />
        {week > 0 && labour > 0 && <Stat label={t('Team cost this week')} value={`${Math.round(labour / week * 100)}%`} note={t('{amount} of shifts so far, as a share of takings', { amount: formatMoney(labour) })}
          tone={labour / week > 0.35 ? 'warning' : 'good'} />}
      </StatRow>
    </Box>
  )
}
