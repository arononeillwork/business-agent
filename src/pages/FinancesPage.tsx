import { FEATURES } from '../app/features'
import {
  Alert, Box, Button, Card, CardContent, Checkbox, IconButton, InputAdornment,
  Stack, Table, TableBody, TableCell, TableFooter, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, Stat, StatGrid, StatRow, StatTile, Tag } from '../components/common'
import { addDays, currencySymbol, formatMoney, today, weekStart, zonedIso } from '../../shared/time'
import { shiftPaidMinutes } from '../../shared/rules'
import type { Expense } from '../../shared/types'
import { Link as RouterLink } from 'react-router-dom'

/** Monthly running costs. Admins with pay access edit; finance partners read (enforced in the database too). */
export function FinancesPage() {
  const { canSeeFinances, isPartner, api } = useApp()
  const canEdit = canSeeFinances && !isPartner
  const data = useAsync('expenses', () => api.expenses(), [])

  if (!canSeeFinances) {
    return <>
      <PageHeader eyebrow="Money" title="Finances" />
      <Alert severity="info">Finances are only visible to admins with pay access.</Alert>
    </>
  }

  const all = data.data ?? []
  // Expenses switched off ("not counted") stay on the list but are left out of every figure.
  const counted = all.filter(e => e.active)
  const total = counted.reduce((s, e) => s + Number(e.amount), 0)
  const biggest = [...counted].sort((a, b) => b.amount - a.amount)[0]
  const staff = counted.filter(e => /wage|staff/i.test(e.name)).reduce((s, e) => s + Number(e.amount), 0)
  const left = all.length - counted.length

  return (
    <>
      <PageHeader eyebrow="Money" title="Finances"
        subtitle={canEdit ? 'What it costs to keep Easy Beans open each month. Imported from the Accounts sheet; edit here from now on.'
          : 'What it costs to keep Easy Beans open each month. Read-only.'} />
      <ErrorBox error={data.error} />

      <StatGrid>
        <StatTile label="Monthly costs" value={data.data ? formatMoney(total) : '–'}
          note={`${counted.length} items${left ? ` · ${left} not counted` : ''}`} />
        <StatTile label="A year" value={data.data ? formatMoney(total * 12) : '–'} note="at this rate" />
        <StatTile label="Per open day" value={data.data ? formatMoney(total / 26) : '–'} note="26 open days a month" />
        {staff > 0
          ? <StatTile label="Staff share" value={`${Math.round(staff / total * 100)}%`} note={`${formatMoney(staff)} of monthly costs`} />
          : <StatTile label="Biggest cost" value={biggest?.name ?? '–'} note={biggest && total ? `${formatMoney(biggest.amount)} · ${Math.round(biggest.amount / total * 100)}%` : undefined} />}
      </StatGrid>

      {canEdit && FEATURES.square && <Takings />}

      <Expenses list={all} total={total} canEdit={canEdit} loaded={!!data.data} />
    </>
  )
}

type Draft = Partial<Expense> & { key: string; removed?: boolean }
const blank = (): Draft => ({ key: crypto.randomUUID(), name: '', amount: 0, category: null, notes: null, active: true })

/** The list of expenses. One Edit button turns the whole list into fields; Save keeps every change at once. */
function Expenses({ list, total, canEdit, loaded }: { list: Expense[]; total: number; canEdit: boolean; loaded: boolean }) {
  const { api } = useApp()
  const run = useAction()
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const editing = drafts !== null
  const set = (key: string, patch: Partial<Draft>) => setDrafts(d => d!.map(x => (x.key === key ? { ...x, ...patch } : x)))

  const save = async () => {
    const rows = drafts!.filter(d => !d.removed)
    const bad = rows.find(d => !d.name?.trim() && (d.id || d.amount))
    if (bad) { await run(async () => { throw new Error('Every expense needs a name') }); return }
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
    }, changed.length || removed.length ? 'Expenses saved' : undefined)
    if (ok) setDrafts(null)
  }

  const shown = editing ? drafts.filter(d => !d.removed) : list
  return (
    <Card component="section" aria-label="Monthly expenses">
      <CardContent>
        <SectionTitle action={canEdit && (editing ? (
          <Stack direction="row" spacing={1}>
            <Button onClick={() => setDrafts(null)}>Cancel</Button>
            <Button variant="contained" startIcon={<CheckIcon />} onClick={save}>Save changes</Button>
          </Stack>
        ) : (
          <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setDrafts(list.map(e => ({ ...e, key: e.id })))} aria-label="Edit expenses">
            Edit
          </Button>
        ))}>
          Monthly expenses
        </SectionTitle>
        {editing && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
            Untick “Count” to keep an expense on the list without adding it to the total.
          </Typography>
        )}
        {loaded && !editing && list.length === 0 && <Empty>No expenses yet.{canEdit && ' Press Edit to add one.'}</Empty>}
        {(shown.length > 0 || editing) && (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: editing ? 680 : undefined }}>
              <TableHead>
                <TableRow>
                  {editing && <TableCell padding="checkbox">Count</TableCell>}
                  <TableCell>Expense</TableCell><TableCell>Category</TableCell>
                  {editing && <TableCell>Notes</TableCell>}
                  <TableCell align="right">Per month</TableCell>
                  <TableCell align="right">{editing ? '' : 'Share'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {editing ? drafts.filter(d => !d.removed).map(d => (
                  <TableRow key={d.key} sx={{ opacity: d.active ? 1 : 0.6, '& td': { verticalAlign: 'top' } }}>
                    <TableCell padding="checkbox">
                      <Checkbox checked={!!d.active} onChange={e => set(d.key, { active: e.target.checked })}
                        slotProps={{ input: { 'aria-label': `Count ${d.name || 'this expense'} in the total` } }} />
                    </TableCell>
                    <TableCell sx={{ minWidth: 170 }}>
                      <TextField size="small" fullWidth value={d.name ?? ''} onChange={e => set(d.key, { name: e.target.value })} placeholder="Name"
                        slotProps={{ htmlInput: { 'aria-label': 'Name' } }} />
                    </TableCell>
                    <TableCell sx={{ minWidth: 130 }}>
                      <TextField size="small" fullWidth value={d.category ?? ''} onChange={e => set(d.key, { category: e.target.value })} placeholder="Category"
                        slotProps={{ htmlInput: { 'aria-label': `Category for ${d.name || 'this expense'}` } }} />
                    </TableCell>
                    <TableCell sx={{ minWidth: 150 }}>
                      <TextField size="small" fullWidth value={d.notes ?? ''} onChange={e => set(d.key, { notes: e.target.value })} placeholder="Notes"
                        slotProps={{ htmlInput: { 'aria-label': `Notes for ${d.name || 'this expense'}` } }} />
                    </TableCell>
                    <TableCell align="right" sx={{ width: 140 }}>
                      <TextField size="small" type="number" value={d.amount ?? 0} onChange={e => set(d.key, { amount: Number(e.target.value) })}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start">{currencySymbol()}</InputAdornment> },
                          htmlInput: { step: 0.01, min: 0, 'aria-label': `Per month for ${d.name || 'this expense'}`, style: { textAlign: 'right' } } }} />
                    </TableCell>
                    <TableCell align="right" sx={{ width: 48 }}>
                      <Tooltip title="Remove">
                        <IconButton size="small" aria-label={`Remove ${d.name || 'this expense'}`} onClick={() => set(d.key, { removed: true })}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                )) : list.map(e => (
                  <TableRow key={e.id} hover sx={{ '& td': { color: e.active ? undefined : 'text.secondary' } }}>
                    <TableCell sx={{ fontWeight: 500 }}>
                      {e.name}
                      {!e.active && <Box component="span" sx={{ ml: 1 }}><Tag>Not counted</Tag></Box>}
                      {e.notes && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{e.notes}</Typography>}
                    </TableCell>
                    <TableCell>{e.category && <Tag>{e.category}</Tag>}</TableCell>
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
                  <TableRow>
                    <TableCell sx={{ fontWeight: 500, color: 'text.primary', fontSize: '0.95rem' }}>Total</TableCell><TableCell />
                    <TableCell align="right" sx={{ fontWeight: 500, color: 'text.primary', fontSize: '0.95rem', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(total)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </Box>
        )}
        {editing && (
          <Button startIcon={<AddIcon />} sx={{ mt: 1.5 }} onClick={() => setDrafts(d => [...d!, blank()])}>Add expense</Button>
        )}
      </CardContent>
    </Card>
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
