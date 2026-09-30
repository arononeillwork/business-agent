import { FEATURES } from '../app/features'
import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment,
  Stack, Table, TableBody, TableCell, TableFooter, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, Stat, StatRow, Tag } from '../components/common'
import { addDays, currencySymbol, formatMoney, today, weekStart, zonedIso } from '../../shared/time'
import { shiftPaidMinutes } from '../../shared/rules'
import type { Expense } from '../../shared/types'
import { Link as RouterLink } from 'react-router-dom'

/** Monthly running costs. Admins with pay access edit; finance partners read (enforced in the database too). */
export function FinancesPage() {
  const { api, canSeeFinances, isPartner } = useApp()
  const canEdit = canSeeFinances && !isPartner
  const data = useAsync('expenses', () => api.expenses(), [])
  const [editing, setEditing] = useState<Partial<Expense> | null>(null)

  if (!canSeeFinances) {
    return <>
      <PageHeader eyebrow="Money" title="Finances" />
      <Alert severity="info">Finances are only visible to admins with pay access.</Alert>
    </>
  }

  const list = (data.data ?? []).filter(e => e.active)
  const total = list.reduce((s, e) => s + Number(e.amount), 0)
  const biggest = [...list].sort((a, b) => b.amount - a.amount)[0]
  const staff = list.filter(e => /wage|staff/i.test(e.name)).reduce((s, e) => s + Number(e.amount), 0)

  return (
    <>
      <PageHeader eyebrow="Money" title="Finances"
        subtitle={canEdit ? 'What it costs to keep Easy Beans open each month. Imported from the Accounts sheet; edit here from now on.'
          : 'What it costs to keep Easy Beans open each month. Read-only.'}
        actions={canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ name: '', amount: 0 })}>Add expense</Button>} />
      <ErrorBox error={data.error} />

      {canEdit && FEATURES.square && <Takings />}

      <StatRow>
        <Stat label="Monthly costs" value={formatMoney(total)} note={`${list.length} items`} />
        <Stat label="A year" value={formatMoney(total * 12)} note="at this rate" />
        <Stat label="Per open day" value={formatMoney(total / 26)} note="26 open days a month" />
        {biggest && <Stat label="Biggest cost" value={biggest.name} note={`${formatMoney(biggest.amount)} · ${Math.round(biggest.amount / total * 100)}%`} />}
        {staff > 0 && <Stat label="Staff share" value={`${Math.round(staff / total * 100)}%`} note="of monthly costs" />}
      </StatRow>

      <Card>
        <CardContent>
          <SectionTitle>Monthly expenses</SectionTitle>
          {data.data && list.length === 0 && <Empty>No expenses yet.</Empty>}
          {list.length > 0 && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow><TableCell>Expense</TableCell><TableCell>Category</TableCell><TableCell align="right">Per month</TableCell>
                    <TableCell align="right">Share</TableCell><TableCell /></TableRow>
                </TableHead>
                <TableBody>
                  {list.map(e => (
                    <TableRow key={e.id} hover>
                      <TableCell sx={{ fontWeight: 500 }}>{e.name}{e.notes && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{e.notes}</Typography>}</TableCell>
                      <TableCell>{e.category && <Tag>{e.category}</Tag>}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{formatMoney(e.amount)}</TableCell>
                      <TableCell align="right" sx={{ width: 160 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                          <Box sx={{ width: 80, height: 6, borderRadius: 3, bgcolor: 'divider', overflow: 'hidden' }}>
                            <Box sx={{ width: `${Math.max(2, e.amount / total * 100)}%`, height: '100%', bgcolor: 'primary.main' }} />
                          </Box>
                          <Typography variant="caption" sx={{ minWidth: 32, textAlign: 'right' }}>{Math.round(e.amount / total * 100)}%</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        {canEdit && <Tooltip title="Edit"><IconButton size="small" aria-label={`Edit ${e.name}`} onClick={() => setEditing(e)}><EditIcon fontSize="small" /></IconButton></Tooltip>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 500, color: 'text.primary', fontSize: '0.95rem' }}>Total</TableCell><TableCell />
                    <TableCell align="right" sx={{ fontWeight: 500, color: 'text.primary', fontSize: '0.95rem', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(total)}</TableCell>
                    <TableCell /><TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </Box>
          )}
        </CardContent>
      </Card>

      {editing && <ExpenseDialog expense={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function ExpenseDialog({ expense, onClose }: { expense: Partial<Expense>; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [e, setE] = useState(expense)
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{e.id ? 'Edit expense' : 'Add expense'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Name" value={e.name ?? ''} onChange={x => setE({ ...e, name: x.target.value })} autoFocus />
          <TextField label="Per month" type="number" value={e.amount ?? 0} onChange={x => setE({ ...e, amount: Number(x.target.value) })}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">{currencySymbol()}</InputAdornment> }, htmlInput: { step: 0.01, min: 0 } }} />
          <TextField label="Category (optional)" value={e.category ?? ''} onChange={x => setE({ ...e, category: x.target.value || null })} />
          <TextField label="Notes (optional)" value={e.notes ?? ''} onChange={x => setE({ ...e, notes: x.target.value || null })} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        {e.id && <Button color="error" sx={{ mr: 'auto' }} onClick={async () => {
          if (await run(() => api.deleteExpense(e.id!), 'Expense removed')) onClose()
        }}>Remove</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={async () => {
          if (await run(() => api.saveExpense({ ...e, name: e.name ?? '', amount: e.amount ?? 0 }), 'Expense saved')) onClose()
        }}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Takings from the payment system (Square), and what the team costs as a share of them. */
function Takings() {
  const { api, rates, settings } = useApp()
  const integ = useAsync('integrations', () => api.integrations(), [])
  const square = integ.data?.integrations.find(i => i.provider === 'square')
  const on = square?.status === 'connected'
  const day = today(), monday = weekStart(day)
  const sales = useAsync('square-sales', () => (on ? api.sales(addDays(day, -29), day) : Promise.resolve(null)), [on, day])
  const shifts = useAsync('takings-shifts', () => (on ? api.shifts(zonedIso(monday, '00:00'), zonedIso(addDays(monday, 7), '00:00')) : Promise.resolve([])), [on, monday])
  if (!integ.data) return null
  if (!on) {
    return (
      <Alert severity="info" sx={{ mb: 3 }} action={<Button component={RouterLink} to="/connections" size="small">Connect</Button>}>
        Connect Square to see takings here, next to what the team costs.
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
    <Box component="section" aria-label="Takings" sx={{ mb: 3 }}>
      <SectionTitle>Takings <Typography component="span" variant="body2" sx={{ color: 'text.secondary' }}>· from Square</Typography></SectionTitle>
      <ErrorBox error={sales.error} />
      <StatRow>
        <Stat label="Today" value={sales.data ? formatMoney(sum(day, day)) : '–'} note={`${days.find(d => d.date === day)?.payments ?? 0} payments`} />
        <Stat label="This week" value={sales.data ? formatMoney(week) : '–'} note={lastWeek ? `${week >= lastWeek ? '+' : ''}${Math.round((week - lastWeek) / lastWeek * 100)}% on last week so far` : 'since Monday'} />
        <Stat label="Last week" value={sales.data ? formatMoney(lastWeek) : '–'} />
        <Stat label="Last 30 days" value={sales.data ? formatMoney(sum(addDays(day, -29), day)) : '–'} note={sales.data ? `${formatMoney(sum(addDays(day, -29), day) / 30)} a day on average` : undefined} />
        {week > 0 && labour > 0 && <Stat label="Team cost this week" value={`${Math.round(labour / week * 100)}%`} note={`${formatMoney(labour)} of shifts so far, as a share of takings`}
          tone={labour / week > 0.35 ? 'warning' : 'good'} />}
      </StatRow>
    </Box>
  )
}
