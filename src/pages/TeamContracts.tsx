import {
  Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Link, MenuItem, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import DocumentIcon from '@mui/icons-material/DescriptionOutlined'
import { useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { ErrorBox, PageHeader, PersonAvatar, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import type { Profile } from '../../shared/types'
import {
  CONTRACT_FILTERS, CONTRACT_KINDS, DEFAULT_CONVENIO, SALARY_PERS, contractKind, contractProblem, contractStatus, contractTotals, contractsByPerson,
  daysBetween, inFilter, monthlyGross, trialEndingSoon, type ContractFilter, type ContractKind, type ContractStatus, type EmploymentContract,
  type EmploymentContractInput, type SalaryPer,
} from '../../shared/contracts'
import { currencySymbol, formatLocal, formatMoney, formatNumber, today } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t, tc, tn } from '../i18n'

const day = (d: string | null) => (d ? formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy') : '')
const kindLabel = (k: ContractKind) => t(contractKind(k).label)
const payText = (c: Pick<EmploymentContract, 'salary' | 'salary_per'>) =>
  c.salary == null || !c.salary_per ? '' : t(SALARY_PERS.find(p => p.id === c.salary_per)!.amount, { price: formatMoney(c.salary) })
function datesText(c: Pick<EmploymentContract, 'starts_on' | 'ends_on'>) {
  return c.ends_on ? t('{from} to {to}', { from: day(c.starts_on), to: day(c.ends_on) }) : t('Since {date}', { date: day(c.starts_on) })
}
const onTheTeam = (p: Profile) => p.role === 'admin' || p.role === 'employee'
const STATUS_LABEL: Record<ContractStatus, string> = {
  upcoming: msg('Not started yet'), trial: msg('Trial period'), active: msg('Active'), ending: msg('Ending soon'), ended: msg('Ended'),
}

/** Where a contract is: starting later, in its trial period, running, ending within a month, or ended. */
function StatusTags({ c, now }: { c: EmploymentContract; now: string }) {
  const status = contractStatus(c, now)
  const trialSoon = trialEndingSoon(c, now)
  const trial = c.trial_ends_on && c.trial_ends_on >= now && status !== 'upcoming' && status !== 'ended'
  const left = c.ends_on ? daysBetween(now, c.ends_on) : 0
  const trialLeft = c.trial_ends_on ? daysBetween(now, c.trial_ends_on) : 0
  return (
    <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
      {status === 'upcoming' && <Tag fg={tokens.infoFg} bg={tokens.infoBg}>{t('Starts {date}', { date: day(c.starts_on) })}</Tag>}
      {status === 'active' && <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t(STATUS_LABEL.active)}</Tag>}
      {status === 'ending' && <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{left === 0 ? t('Ends today') : tn(left, 'Ends in {n} day', 'Ends in {n} days')}</Tag>}
      {status === 'ended' && <Tag>{t(STATUS_LABEL.ended)}</Tag>}
      {trial && (trialSoon
        ? <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{trialLeft === 0 ? t('Trial period ends today') : tn(trialLeft, 'Trial period ends in {n} day', 'Trial period ends in {n} days')}</Tag>
        : <Tag fg={tokens.infoFg} bg={tokens.infoBg}>{t(STATUS_LABEL.trial)}</Tag>)}
    </Stack>
  )
}

/**
 * Team → Contracts: each person's employment contract under Spanish law (shared/contracts.ts), one row per
 * contract, newest first for each person, and those with none recorded. Admins (owners and shop managers)
 * add, change and end them; the pay only for those who see pay (an owner, a payroll gestoría), so a shop
 * manager works without it. Everyone else sees their own contract, read-only. The database enforces the same.
 */
export function TeamContracts({ tabs }: { tabs: ReactNode }) {
  const { api, me, profiles, isAdmin, isPartner, partnerCan, canSeePay, business } = useApp()
  const canEdit = isAdmin && !isPartner
  const seesAll = isAdmin || partnerCan('payroll')
  // Pay: those who see pay, and on your own contract (all an employee sees).
  const showPay = canSeePay || !seesAll
  const list = useAsync('employment-contracts', () => api.employmentContracts(), [])
  const [filter, setFilter] = useState<ContractFilter>('all')
  const [editing, setEditing] = useState<EmploymentContractInput | null>(null)
  const [ending, setEnding] = useState<EmploymentContract | null>(null)
  const now = today()

  const contracts = (list.data ?? []).filter(c => seesAll || c.profile_id === me?.id)
  const byPerson = contractsByPerson(contracts)
  const team = profiles.filter(p => onTheTeam(p) && (seesAll || p.id === me?.id))
  // Everyone on the team, and anyone switched off who had a contract; switched off last.
  const people = team.filter(p => p.active || byPerson.has(p.id))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.full_name.localeCompare(b.full_name))
  const nameOf = (id: string) => profiles.find(p => p.id === id)?.full_name ?? ''
  const named = (p: Profile) => (p.id === me?.id ? t('{name} (you)', { name: p.full_name }) : p.full_name)
  const statusOf = (c: EmploymentContract) => contractStatus(c, now)
  const count = (f: ContractFilter) => contracts.filter(c => inFilter(statusOf(c), f)).length
  const totals = contractTotals(contracts, now)
  const endingSoon = contracts.filter(c => statusOf(c) === 'ending').sort((a, b) => a.ends_on!.localeCompare(b.ends_on!))
  const trialsSoon = contracts.filter(c => trialEndingSoon(c, now))
  // A new contract starts with the convenio the business used last.
  const convenio = [...contracts].sort((a, b) => b.created_at.localeCompare(a.created_at)).find(c => c.convenio)?.convenio ?? DEFAULT_CONVENIO
  const add = (profileId = '') => setEditing({ profile_id: profileId, kind: 'indefinido', starts_on: now, convenio })

  const table = (): ExportTable => ({
    title: t('Contracts'), filename: `contracts-${now}`,
    columns: [t('Person'), t('Type of contract'), t('Job and category'), t('Convenio'), t('Starts'), t('Last day'), t('Trial period ends'), t('Hours a week'),
      ...(canSeePay ? [t('Gross salary'), t('Per'), t('Gross a month')] : []), t('Status'), t('Signed contract'), t('Notes')],
    rows: contracts.map(c => [nameOf(c.profile_id), kindLabel(c.kind), c.job_title ?? '', c.convenio ?? '', c.starts_on, c.ends_on ?? '', c.trial_ends_on ?? '',
      c.hours_per_week, ...(canSeePay ? [c.salary, c.salary_per ? t(SALARY_PERS.find(p => p.id === c.salary_per)!.label) : '', monthlyGross(c)] : []),
      t(STATUS_LABEL[statusOf(c)]), c.document_url ?? '', c.notes ?? '']),
    money: canSeePay ? [8, 10] : [],
  })

  const cell = { py: 1.25, borderColor: tokens.line, verticalAlign: 'top' } as const
  const columns = 5 + (showPay ? 1 : 0) + (canEdit ? 1 : 0)
  const personCell = (p: Profile | undefined, id: string) => (
    <TableCell sx={cell}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 170 }}>
        <PersonAvatar name={p?.full_name ?? '?'} colour={p?.colour ?? tokens.inkFaint} size={32} />
        <Typography sx={{ fontWeight: 500 }} noWrap>{p ? named(p) : nameOf(id)}</Typography>
      </Stack>
    </TableCell>
  )

  return (
    <>
      <PageHeader eyebrow={t('Team')} title={t('Team')} actions={<>
        {!canEdit && <Tag>{t('Read-only')}</Tag>}
        {seesAll && <ExportButton table={table} disabled={!contracts.length} folder="Contracts" />}
        {canEdit && <Button variant="contained" startIcon={<AddIcon />} onClick={() => add()}>{t('Add a contract')}</Button>}
      </>} />
      {tabs}
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: 760 }}>
        {!seesAll ? t('Your employment contract with {business}. If something isn’t right, tell an admin.', { business: business?.name ?? '' })
          : canSeePay ? t('Each person’s employment contract under Spanish law: its type, dates, trial period, hours, gross pay and convenio.')
          : t('Each person’s employment contract under Spanish law: its type, dates, trial period, hours and convenio. Pay is shown to owners only.')}
      </Typography>
      <ErrorBox error={list.error} />

      {seesAll && (
        <StatGrid>
          <StatTile label={t('On a contract')} value={list.data ? totals.people : '–'}
            note={t('Of {n} on the team', { n: team.filter(p => p.active).length })} />
          <StatTile label={t('Contracted hours')} value={list.data ? t('{n} h', { n: formatNumber(totals.hours) }) : '–'} note={t('A week, everyone together')} />
          {canSeePay && (
            <StatTile label={t('Gross pay a month')} value={list.data ? formatMoney(totals.monthly) : '–'}
              note={totals.unknown ? tn(totals.unknown, '{n} contract not counted: add its salary or hours', '{n} contracts not counted: add their salary or hours')
                : t('Before tax and Social Security')} />
          )}
          <StatTile label={t('Ending soon')} value={list.data ? endingSoon.length : '–'}
            note={endingSoon.length ? t('First: {name}, {date}', { name: nameOf(endingSoon[0].profile_id), date: day(endingSoon[0].ends_on) }) : t('Within 30 days')} />
        </StatGrid>
      )}

      {canEdit && (endingSoon.length > 0 || trialsSoon.length > 0) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {endingSoon.length > 0 && <div>{t('Ending within 30 days: {list}. Renew it, make it permanent or let it end.',
            { list: endingSoon.map(c => `${nameOf(c.profile_id)} (${day(c.ends_on)})`).join(', ') })}</div>}
          {trialsSoon.length > 0 && <div>{t('Trial period ending soon: {list}.',
            { list: trialsSoon.map(c => `${nameOf(c.profile_id)} (${day(c.trial_ends_on)})`).join(', ') })}</div>}
        </Alert>
      )}

      {seesAll && (
        <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>
          {CONTRACT_FILTERS.map(f => (
            <Chip key={f.id} size="small" clickable label={`${t(f.label)} ${count(f.id)}`} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
              variant={filter === f.id ? 'filled' : 'outlined'} color={filter === f.id ? 'primary' : 'default'} />
          ))}
        </Stack>
      )}

      <Card sx={{ overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label={t('Contracts')}>
            <TableHead>
              <TableRow>
                <TableCell>{t('Person')}</TableCell>
                <TableCell>{t('Contract')}</TableCell>
                <TableCell>{t('Dates')}</TableCell>
                <TableCell align="right">{t('Hours a week')}</TableCell>
                {showPay && <TableCell align="right">{t('Gross salary')}</TableCell>}
                <TableCell>{t('Status')}</TableCell>
                {canEdit && <TableCell><Box component="span" sx={visuallyHidden}>{t('Actions')}</Box></TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {people.flatMap(p => {
                const theirs = byPerson.get(p.id) ?? []
                if (!theirs.length) {
                  if (filter !== 'all' || !p.active) return []
                  return [(
                    <TableRow key={p.id} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                      {personCell(p, p.id)}
                      <TableCell sx={{ ...cell, color: 'text.secondary' }} colSpan={columns - 1}>
                        <Stack direction="row" sx={{ alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                          <span>{t('No contract recorded')}</span>
                          {canEdit && (
                            <Button size="small" startIcon={<AddIcon />} onClick={() => add(p.id)} aria-label={t('Add a contract for {name}', { name: p.full_name })}>
                              {t('Add')}
                            </Button>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )]
                }
                return theirs.filter(c => inFilter(statusOf(c), filter)).map(c => {
                  const monthly = monthlyGross(c)
                  const status = statusOf(c)
                  return (
                    <TableRow key={c.id} sx={{ opacity: status === 'ended' ? 0.7 : 1, '&:last-child td': { borderBottom: 0 } }}>
                      {personCell(p, c.profile_id)}
                      <TableCell sx={cell}>
                        <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 180 }}>{kindLabel(c.kind)}</Typography>
                        {(c.job_title || c.convenio) && (
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{[c.job_title, c.convenio].filter(Boolean).join(' · ')}</Typography>
                        )}
                        {c.document_url && (
                          <Link href={c.document_url} target="_blank" rel="noopener" underline="hover" variant="body2"
                            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }} aria-label={t('{name}’s signed contract', { name: p.full_name })}>
                            <DocumentIcon sx={{ fontSize: 16 }} />{t('Signed contract')}
                          </Link>
                        )}
                        {c.notes && <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>{c.notes}</Typography>}
                      </TableCell>
                      <TableCell sx={{ ...cell, whiteSpace: 'nowrap' }}>
                        <Typography variant="body2">{datesText(c)}</Typography>
                        {c.trial_ends_on && (
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Trial period to {date}', { date: day(c.trial_ends_on) })}</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ ...cell, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }} align="right">
                        {c.hours_per_week == null ? '—' : t('{n} h', { n: formatNumber(c.hours_per_week) })}
                      </TableCell>
                      {showPay && (
                        <TableCell sx={{ ...cell, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }} align="right">
                          <Typography variant="body2">{payText(c) || '—'}</Typography>
                          {monthly !== null && c.salary_per !== 'month' && (
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('About {amount} a month', { amount: formatMoney(monthly) })}</Typography>
                          )}
                        </TableCell>
                      )}
                      <TableCell sx={cell}><StatusTags c={c} now={now} /></TableCell>
                      {canEdit && (
                        <TableCell sx={{ ...cell, whiteSpace: 'nowrap' }} align="right">
                          <Stack direction="row" sx={{ gap: 1.5, justifyContent: 'flex-end' }}>
                            <Link component="button" underline="hover" onClick={() => setEditing(c)} aria-label={t('Edit {name}’s contract', { name: p.full_name })}>
                              {t('Edit')}
                            </Link>
                            {status !== 'ended' && status !== 'upcoming' && (
                              <Link component="button" underline="hover" onClick={() => setEnding(c)} aria-label={t('End {name}’s contract', { name: p.full_name })}>
                                {tc('contract', 'End')}
                              </Link>
                            )}
                          </Stack>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })
              })}
              {list.data && !people.length && (
                <TableRow><TableCell colSpan={columns} sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>{t('Nobody on the team yet.')}</TableCell></TableRow>
              )}
              {list.data && people.length > 0 && filter !== 'all' && !count(filter) && (
                <TableRow><TableCell colSpan={columns} sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>{t('No contracts here.')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </Card>

      {editing && (
        <ContractDialog contract={editing} people={team.filter(p => p.active || p.id === editing.profile_id)} setsPay={canSeePay && canEdit}
          name={nameOf(editing.profile_id ?? '')} onClose={() => setEditing(null)} />
      )}
      {ending && <EndDialog contract={ending} name={nameOf(ending.profile_id)} onClose={() => setEnding(null)} />}
    </>
  )
}

const visuallyHidden = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const
const numberText = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))
const numberOf = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : null)

/**
 * Add a contract or change one: whose, the type, the job, the dates and trial period, the hours, the
 * convenio, the signed contract's link and notes; the gross salary only for an owner (setsPay).
 */
function ContractDialog({ contract, people, setsPay, name, onClose }: {
  contract: EmploymentContractInput; people: Profile[]; setsPay: boolean; name: string; onClose: () => void
}) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [c, setC] = useState<EmploymentContractInput>(contract)
  const [hours, setHours] = useState(numberText(contract.hours_per_week))
  const [salary, setSalary] = useState(numberText(contract.salary))
  const [deleting, setDeleting] = useState(false)
  const set = (p: Partial<EmploymentContractInput>) => setC(x => ({ ...x, ...p }))
  const kind = contractKind(c.kind ?? 'indefinido')
  const per: SalaryPer = c.salary_per ?? 'month'
  const monthly = monthlyGross({ salary: numberOf(salary), salary_per: per, hours_per_week: numberOf(hours) })

  const save = async () => {
    const ok = await run(async () => {
      const h = numberOf(hours), s = numberOf(salary)
      if ((h !== null && Number.isNaN(h)) || (s !== null && Number.isNaN(s))) throw new Error(t('Enter numbers like 12 or 1,45'))
      const input: EmploymentContractInput = {
        ...(c.id ? { id: c.id } : { profile_id: c.profile_id }), kind: c.kind, starts_on: c.starts_on, ends_on: c.ends_on || null,
        trial_ends_on: c.trial_ends_on || null, hours_per_week: h, convenio: c.convenio?.trim() || null, job_title: c.job_title?.trim() || null,
        document_url: c.document_url?.trim() || null, notes: c.notes?.trim() || null,
        // Only an owner sends pay; without it, the pay is left as it is.
        ...(setsPay ? { salary: s, salary_per: s === null ? null : per } : {}),
      }
      const problem = contractProblem({ ...input, profile_id: c.profile_id ?? undefined })
      if (problem) throw new Error(t(problem))
      await api.saveEmploymentContract(input)
    }, c.id ? t('Saved') : t('Contract added for {name}', { name: people.find(p => p.id === c.profile_id)?.full_name ?? '' }))
    if (ok) onClose()
  }
  const remove = async () => {
    if (c.id && await run(() => api.deleteEmploymentContract(c.id!), t('Deleted {name}’s contract', { name }))) onClose()
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle>{c.id ? t('{name}’s contract', { name }) : t('Add a contract')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label={t('Person')} value={people.some(p => p.id === c.profile_id) ? c.profile_id : ''} disabled={!!c.id}
            onChange={e => set({ profile_id: e.target.value })} autoFocus={!c.id && !c.profile_id}>
            {people.map(p => <MenuItem key={p.id} value={p.id}>{p.full_name}</MenuItem>)}
          </TextField>
          <TextField select label={t('Type of contract')} value={c.kind ?? 'indefinido'} helperText={t(kind.summary)}
            onChange={e => set({ kind: e.target.value as ContractKind })}>
            {CONTRACT_KINDS.map(k => <MenuItem key={k.id} value={k.id}>{t(k.label)}</MenuItem>)}
          </TextField>
          <TextField label={t('Job and category (grupo profesional)')} value={c.job_title ?? ''} onChange={e => set({ job_title: e.target.value })}
            placeholder={t('e.g. Camarero/a, grupo II')} slotProps={{ htmlInput: { maxLength: 120 } }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth type="date" label={t('Starts')} value={c.starts_on ?? ''} onChange={e => set({ starts_on: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }} />
            <TextField fullWidth type="date" label={t('Last day')} value={c.ends_on ?? ''} onChange={e => set({ ends_on: e.target.value || null })}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText={kind.temporary ? t('A temporary contract has an end date') : t('Empty while it has no end date')} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth type="date" label={t('Trial period ends')} value={c.trial_ends_on ?? ''} onChange={e => set({ trial_ends_on: e.target.value || null })}
              slotProps={{ inputLabel: { shrink: true } }} helperText={t('The periodo de prueba, if it has one')} />
            <TextField fullWidth label={t('Hours a week')} value={hours} inputMode="decimal" onChange={e => setHours(e.target.value)} />
          </Stack>
          {setsPay && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField fullWidth label={t('Gross salary')} value={salary} inputMode="decimal" onChange={e => setSalary(e.target.value)}
                helperText={monthly !== null && per !== 'month' ? t('About {amount} a month', { amount: formatMoney(monthly) }) : t('Before tax and Social Security')}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">{currencySymbol()}</InputAdornment> } }} />
              <TextField select fullWidth label={t('Per')} value={per} onChange={e => set({ salary_per: e.target.value as SalaryPer })}>
                {SALARY_PERS.map(p => <MenuItem key={p.id} value={p.id}>{t(p.label)}</MenuItem>)}
              </TextField>
            </Stack>
          )}
          <TextField label={t('Convenio')} value={c.convenio ?? ''} onChange={e => set({ convenio: e.target.value })}
            helperText={t('The collective agreement it’s under')} slotProps={{ htmlInput: { maxLength: 200 } }} />
          <TextField label={t('Signed contract')} type="url" placeholder={'https://'} value={c.document_url ?? ''} onChange={e => set({ document_url: e.target.value })}
            helperText={t('A link to it in Drive or OneDrive (optional)')} />
          <TextField label={t('Notes')} value={c.notes ?? ''} onChange={e => set({ notes: e.target.value })} multiline minRows={2}
            slotProps={{ htmlInput: { maxLength: 2000 } }} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {c.id && (deleting ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto' }}>
            <Typography variant="body2" sx={{ color: tokens.badFg }}>{t('Delete this contract? Ending it keeps it on record.')}</Typography>
            <Button size="small" color="error" variant="contained" onClick={() => void remove()}>{t('Delete')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </Stack>
        ) : <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleting(true)} sx={{ mr: 'auto' }}>{t('Delete')}</Button>)}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{c.id ? t('Save') : t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** End a contract: its last day (today unless another is picked). It stays on record as ended. */
function EndDialog({ contract, name, onClose }: { contract: EmploymentContract; name: string; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const now = today()
  const [last, setLast] = useState(now)
  const save = async () => {
    const ok = await run(async () => {
      if (!last || last < contract.starts_on) throw new Error(t('It can’t end before it starts'))
      await api.saveEmploymentContract({ id: contract.id, ends_on: last })
    }, t('{name}’s contract ends on {date}', { name, date: day(last) }))
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('End {name}’s contract', { name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{kindLabel(contract.kind)} · {datesText(contract)}</Typography>
          <TextField type="date" label={t('Last day')} value={last} onChange={e => setLast(e.target.value)} slotProps={{ inputLabel: { shrink: true } }}
            helperText={t('It stays on record as ended. The finiquito and the paperwork are the gestoría’s.')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('End the contract')}</Button>
      </DialogActions>
    </Dialog>
  )
}
