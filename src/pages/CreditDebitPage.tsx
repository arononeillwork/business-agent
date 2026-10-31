import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, LinearProgress, Link, MenuItem, Stack,
  Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import PayIcon from '@mui/icons-material/PaymentsOutlined'
import GrantIcon from '@mui/icons-material/VolunteerActivismOutlined'
import LinkIcon from '@mui/icons-material/OpenInNewRounded'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { formatLocal, formatMoney, today } from '../../shared/time'
import { daysUntil } from '../../shared/licences'
import {
  KINDS, STATUS_LABEL, everyLabel, isMoneyLink, linkSite, moneyLines, statusOf, suggestedPayment, totals,
  type MoneyDirection, type MoneyItem, type MoneyItemInput, type MoneyLine, type MoneyStatus,
} from '../../shared/creditDebit'
import { stageLabel } from '../../shared/grants'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

const day = (d: string | null) => (d ? formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy') : '')
const every = (months: number | null) => t(everyLabel(months), { n: months ?? 0 })
const kindLabel = (l: MoneyLine) => (l.kind === 'grant' ? t('Grant') : t(KINDS.find(k => k.id === l.kind)!.label))
const TONE: Record<MoneyStatus, { fg: string; bg: string }> = {
  overdue: { fg: tokens.badFg, bg: tokens.badBg }, due: { fg: tokens.warnFg, bg: tokens.warnBg }, possible: { fg: tokens.infoFg, bg: tokens.infoBg },
  open: { fg: tokens.neutralFg, bg: tokens.neutralBg }, done: { fg: tokens.goodFg, bg: tokens.goodBg },
}
const EVERY = [null, 1, 3, 6, 12]
/** Where a grant's application is on the Grants page. */
const grantLink = (l: MoneyLine) => `/grants#application-${l.grant!.id}`
const byDate = (a: MoneyLine, b: MoneyLine) => (a.next_due ?? '9999').localeCompare(b.next_due ?? '9999') || a.name.localeCompare(b.name)

/**
 * Credit & debit: money the business still has to pay back (a loan from someone, a machine on
 * finance) and money still to come in or that could be raised (something to sell, a deposit, money
 * owed to it, and the grants it's applying for or was awarded), with each payment recorded as it
 * goes and what's left. Grants are read from the Grants page and money received on one is saved
 * there. Admins with pay access manage it; a gestoría with finances access reads.
 */
export function CreditDebitPage() {
  const { canSeeFinances, isPartner, api } = useApp()
  const canEdit = canSeeFinances && !isPartner
  const items = useAsync('credit-debit', () => api.creditDebit(), [])
  // The same read as the Grants page, so both show the same applications.
  const grants = useAsync('grant-applications', () => api.grantApplications(), [])
  const [editing, setEditing] = useState<MoneyItemInput | null>(null)
  const [paying, setPaying] = useState<MoneyLine | null>(null)

  if (!canSeeFinances) {
    return <>
      <PageHeader eyebrow={t('Accounts')} title={t('Credit & debit')} />
      <Alert severity="info">{t('Credit & debit is only visible to admins with pay access.')}</Alert>
    </>
  }

  const now = today()
  const loaded = !!items.data && !!grants.data
  const lines = moneyLines(items.data ?? [], grants.data ?? [])
  const sum = totals(lines)
  const open = lines.filter(l => !l.done)
  const debts = open.filter(l => l.direction === 'debit').sort(byDate)
  // Agreed money first, then what could be raised.
  const credits = open.filter(l => l.direction === 'credit').sort((a, b) => Number(a.possible) - Number(b.possible) || byDate(a, b))
  const settled = lines.filter(l => l.done)
  const overdue = open.filter(l => statusOf(l, now) === 'overdue')
  const next = debts.find(l => l.next_due)
  const add = (direction: MoneyDirection) => setEditing({ direction, kind: direction === 'debit' ? 'loan' : 'sale', name: '', possible: direction === 'credit' })

  const table = (): ExportTable => ({
    title: t('Credit & debit'), filename: `credit-and-debit-${now}`,
    columns: [t('Which way'), t('Name'), t('Kind'), t('Who'), t('Amount'), t('Paid or received'), t('Left'), t('Each payment'), t('How often'), t('Next due'), t('Status'), t('Notes')],
    rows: [...debts, ...credits, ...settled].map(l => [l.direction === 'debit' ? t('To pay') : t('Coming in'), t(l.name), kindLabel(l), l.party ?? '', l.amount, l.settled,
      l.left, l.instalment, l.instalment ? every(l.every_months) : '', l.next_due ?? '', t(STATUS_LABEL[statusOf(l, now)]), l.item?.notes ?? l.grant?.notes ?? '']),
    money: [4, 5, 6, 7],
  })

  return (
    <>
      <PageHeader eyebrow={t('Accounts')} title={t('Credit & debit')} actions={<>
        {!canEdit && <Tag>{t('Read-only')}</Tag>}
        <ExportButton table={table} disabled={!lines.length} folder="Credit & debit" />
      </>} />
      <ErrorBox error={items.error ?? grants.error} />
      <Typography sx={{ color: 'text.secondary', mb: 2.5, maxWidth: 760 }}>
        {t('Money the business still has to pay back, like a loan or a machine on finance, and money still to come in or that could be raised: something to sell, a deposit, money it’s owed and its grants. Record each payment as it goes to see what’s left.')}
      </Typography>

      <StatGrid>
        <StatTile label={t('To pay back')} value={loaded ? formatMoney(sum.toPay) : '–'}
          note={next ? t('Next: {name}, {date}', { name: t(next.name), date: day(next.next_due) }) : t('Nothing due')} />
        <StatTile label={t('Paid out a month')} value={loaded ? formatMoney(sum.monthly) : '–'} note={t('in regular payments')} />
        <StatTile label={t('Coming in')} value={loaded ? formatMoney(sum.comingIn) : '–'} note={t('agreed, still to come')} />
        <StatTile label={t('Could raise')} value={loaded ? formatMoney(sum.couldRaise) : '–'} note={t('not agreed yet')} />
      </StatGrid>

      {overdue.length > 0 && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {t('Overdue: {list}. Record the payment once it’s made, or change the date.', { list: overdue.map(l => `${t(l.name)} (${day(l.next_due)})`).join(', ') })}
        </Alert>
      )}

      <Lines title={t('To pay back')} lines={debts} now={now} canEdit={canEdit} loaded={loaded} onEdit={setEditing} onPay={setPaying}
        empty={t('Nothing to pay back. Add a loan, or something bought on finance.')}
        action={canEdit && <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => add('debit')}>{t('Add money to pay')}</Button>} />
      <Lines title={t('Coming in')} lines={credits} now={now} canEdit={canEdit} loaded={loaded} onEdit={setEditing} onPay={setPaying}
        empty={t('Nothing coming in yet. Add something to sell or money the business is owed; grants show here once they’re tracked on the Grants page.')}
        action={<Stack direction="row" spacing={1}>
          {/* Each grant links to its own application too; on a phone that's enough. */}
          <Button size="small" component={RouterLink} to="/grants" startIcon={<GrantIcon />} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>{t('Grants')}</Button>
          {canEdit && <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => add('credit')}>{t('Add money coming in')}</Button>}
        </Stack>} />
      {settled.length > 0 && (
        <Lines title={t('Settled')} lines={settled} now={now} canEdit={canEdit} loaded={loaded} onEdit={setEditing} onPay={setPaying} empty="" />
      )}

      {editing && <ItemDialog item={editing} onClose={() => setEditing(null)} />}
      {paying && <PaymentDialog line={paying} onClose={() => setPaying(null)} />}
    </>
  )
}

/** One list: each line with its next date, what's been paid or received so far, and what's left. */
function Lines({ title, lines, now, canEdit, loaded, empty, action, onEdit, onPay }: {
  title: string; lines: MoneyLine[]; now: string; canEdit: boolean; loaded: boolean; empty: string; action?: ReactNode
  onEdit: (i: MoneyItem) => void; onPay: (l: MoneyLine) => void
}) {
  return (
    <Card component="section" aria-label={title} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={action}>{title}</SectionTitle>
        {lines.length === 0
          ? <Empty>{loaded ? empty : t('Loading…')}</Empty>
          : <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead><TableRow>
                  {/* The same widths in every list, so they line up one under the other. */}
                  <TableCell>{t('Name')}</TableCell><TableCell sx={{ width: 230 }}>{t('Next due')}</TableCell>
                  <TableCell sx={{ width: 200 }}>{t('Paid or received')}</TableCell><TableCell align="right" sx={{ width: 120 }}>{t('Left')}</TableCell>
                  <TableCell sx={{ width: 250 }} />
                </TableRow></TableHead>
                <TableBody>{lines.map(l => <Line key={l.key} l={l} now={now} canEdit={canEdit} onEdit={onEdit} onPay={onPay} />)}</TableBody>
              </Table>
            </Box>}
      </CardContent>
    </Card>
  )
}

function Line({ l, now, canEdit, onEdit, onPay }: { l: MoneyLine; now: string; canEdit: boolean; onEdit: (i: MoneyItem) => void; onPay: (l: MoneyLine) => void }) {
  const s = statusOf(l, now)
  const left = l.next_due ? daysUntil(now, l.next_due) : null
  const name = t(l.name)
  // A grant takes money in once it's been awarded; it's applied for and changed on the Grants page.
  const canPay = canEdit && !l.done && (l.item || (l.grant && !l.possible && l.amount != null))
  return (
    <TableRow hover>
      <TableCell sx={{ minWidth: 220 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>{name}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {[kindLabel(l), l.party, l.grant && t(stageLabel(l.grant.stage))].filter(Boolean).join(' · ')}
        </Typography>
        {/* Its page (the listing of something for sale, the agreement), in a new tab. */}
        {l.item?.link && (
          <Link href={l.item.link} target="_blank" rel="noopener noreferrer" variant="caption" underline="hover"
            aria-label={t('Open the page for {name} ({site})', { name, site: linkSite(l.item.link) })}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: 'fit-content', fontWeight: 500 }}>
            {linkSite(l.item.link)}<LinkIcon sx={{ fontSize: 14 }} />
          </Link>
        )}
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        {l.next_due && day(l.next_due)}
        {l.grant?.deadline && !l.done && (
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', whiteSpace: 'normal' }}>
            {t('Next: {date}', { date: day(l.grant.deadline) }) + (l.grant.deadline_label ? ` · ${t(l.grant.deadline_label)}` : '')}
          </Typography>
        )}
        {s !== 'open' && (
          <Box><Tag {...TONE[s]}>{s === 'due' && left !== null ? (left === 0 ? t('Today') : tn(left, 'in {n} day', 'in {n} days')) : t(STATUS_LABEL[s])}</Tag></Box>
        )}
        {l.instalment && !l.done && (
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{formatMoney(l.instalment)} · {every(l.every_months)}</Typography>
        )}
      </TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {l.amount == null ? formatMoney(l.settled) : t('{paid} of {amount}', { paid: formatMoney(l.settled), amount: formatMoney(l.amount) })}
        </Typography>
        {l.amount != null && l.amount > 0 && (
          <LinearProgress variant="determinate" value={Math.min(100, (l.settled / l.amount) * 100)} aria-label={t('{name}: paid or received so far', { name })}
            sx={{ mt: 0.5, height: 5, borderRadius: 3, bgcolor: tokens.neutralBg, '& .MuiLinearProgress-bar': { bgcolor: l.direction === 'debit' ? tokens.roseDeep : tokens.matchaDeep } }} />
        )}
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {l.amount == null
          ? <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('Amount not set')}</Typography>
          : <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatMoney(l.left)}</Typography>}
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        {canPay && (
          <Button size="small" startIcon={<PayIcon />} onClick={() => onPay(l)}
            aria-label={l.direction === 'debit' ? t('Record a payment for {name}', { name }) : t('Record money received for {name}', { name })}>
            {l.direction === 'debit' ? t('Record a payment') : t('Record money received')}
          </Button>
        )}
        {l.grant && (
          <IconButton size="small" component={RouterLink} to={grantLink(l)} aria-label={t('Open {name} in Grants', { name })}><GrantIcon fontSize="small" /></IconButton>
        )}
        {canEdit && l.item && <IconButton size="small" aria-label={t('Edit {name}', { name })} onClick={() => onEdit(l.item!)}><EditIcon fontSize="small" /></IconButton>}
      </TableCell>
    </TableRow>
  )
}

/** Money paid or received: towards an item (it's added to its payments), or a grant (added to what's been received on it). */
function PaymentDialog({ line, onClose }: { line: MoneyLine; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [amount, setAmount] = useState<number | ''>(suggestedPayment(line) || '')
  const [paidOn, setPaidOn] = useState(today())
  const [note, setNote] = useState('')
  const debit = line.direction === 'debit'
  const save = async () => {
    const n = Number(amount)
    const ok = await run(async () => {
      if (!(n > 0)) throw new Error(t('The amount must be more than 0'))
      if (line.grant) await api.saveGrantApplication({ id: line.grant.id, amount_received: Math.round(((line.grant.amount_received ?? 0) + n) * 100) / 100 })
      else await api.addCreditDebitPayment({ item_id: line.item!.id, amount: n, paid_on: paidOn, note })
    }, n >= line.left ? t('All settled: {name}', { name: t(line.name) }) : debit ? t('Payment recorded') : t('Money received recorded'))
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="money-pay-title">
      <DialogTitle id="money-pay-title">{debit ? t('Record a payment') : t('Record money received')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {t('{name}: {left} left', { name: t(line.name), left: formatMoney(line.left) })}
        </Typography>
        <Stack spacing={2}>
          <TextField label={t('Amount')} type="number" value={amount} autoFocus onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
            slotProps={{ htmlInput: { min: 0, step: '0.01' } }} />
          {line.grant
            ? <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('Added to what’s been received on the grant, on the Grants page too.')}</Typography>
            : <>
                <TextField label={debit ? t('Date paid') : t('Date received')} type="date" value={paidOn} onChange={e => setPaidOn(e.target.value || today())}
                  slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label={t('Note')} value={note} onChange={e => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
                {line.instalment && line.every_months && line.next_due && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('The next payment then moves on to its following date.')}</Typography>
                )}
              </>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** An item's details, and the payments made or received towards it. */
function ItemDialog({ item, onClose }: { item: MoneyItemInput; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [m, setM] = useState<MoneyItemInput>(item)
  const set = (p: Partial<MoneyItemInput>) => setM(x => ({ ...x, ...p }))
  const debit = m.direction === 'debit'
  // From the page's read, so a payment removed here goes from the list straight away.
  const all = useAsync('credit-debit', () => api.creditDebit(), [])
  const payments = all.data?.find(x => x.id === m.id)?.payments ?? []
  const money = (v: string) => (v === '' ? null : Number(v))
  const save = async () => {
    const ok = await run(async () => {
      if (!m.name?.trim()) throw new Error(t('Give it a name'))
      if (!(Number(m.amount) > 0)) throw new Error(t('The amount must be more than 0'))
      if (m.instalment != null && !(m.instalment > 0)) throw new Error(t('Each payment must be more than 0'))
      const link = m.link?.trim() || null
      if (link && !isMoneyLink(link)) throw new Error(t('The link must be a web address, starting with https://'))
      const { payments: _payments, ...row } = m as MoneyItemInput & { payments?: unknown }
      await api.saveCreditDebit({ ...row, name: m.name.trim(), link, every_months: m.instalment ? m.every_months ?? null : null })
    }, t('Saved'))
    if (ok) onClose()
  }
  const remove = async () => { if (m.id && await run(() => api.deleteCreditDebit(m.id!), t('Removed'))) onClose() }
  const removePayment = (id: string) => run(() => api.deleteCreditDebitPayment(id), t('Payment removed'))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="money-item-title">
      <DialogTitle id="money-item-title">{m.id ? m.name : debit ? t('Add money to pay') : t('Add money coming in')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <ToggleButtonGroup exclusive size="small" value={m.direction} aria-label={t('Which way')}
            onChange={(_, v: MoneyDirection | null) => v && set({ direction: v, possible: v === 'credit' && m.possible })}>
            <ToggleButton value="debit">{t('To pay')}</ToggleButton>
            <ToggleButton value="credit">{t('Coming in')}</ToggleButton>
          </ToggleButtonGroup>
          <TextField label={t('Name')} value={m.name ?? ''} onChange={e => set({ name: e.target.value })} required
            placeholder={debit ? t('Loan from Jeremy') : t('Old coffee machine')} slotProps={{ htmlInput: { maxLength: 120 } }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('Kind')} value={m.kind ?? 'other'} onChange={e => set({ kind: e.target.value as MoneyItem['kind'] })} sx={{ flex: 1 }}>
              {KINDS.map(k => <MenuItem key={k.id} value={k.id}>{t(k.label)}</MenuItem>)}
            </TextField>
            <TextField label={t('Who')} value={m.party ?? ''} onChange={e => set({ party: e.target.value })} sx={{ flex: 1 }}
              helperText={debit ? t('Who it’s owed to') : t('Who owes it, or who’s buying')} slotProps={{ htmlInput: { maxLength: 120 } }} />
          </Stack>
          <TextField label={t('Amount')} type="number" value={m.amount ?? ''} required onChange={e => set({ amount: money(e.target.value) ?? undefined })}
            helperText={debit ? t('The whole amount: the loan, or the price') : t('The whole amount, or the asking price')} slotProps={{ htmlInput: { min: 0, step: '0.01' } }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Each payment')} type="number" value={m.instalment ?? ''} onChange={e => set({ instalment: money(e.target.value), every_months: m.every_months ?? 1 })} sx={{ flex: 1 }}
              helperText={t('Leave empty if it’s in one go')} slotProps={{ htmlInput: { min: 0, step: '0.01' } }} />
            <TextField select label={t('How often')} value={m.instalment ? m.every_months ?? '' : ''} disabled={!m.instalment} sx={{ flex: 1 }}
              onChange={e => set({ every_months: e.target.value === '' ? null : Number(e.target.value) })}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
              {EVERY.map(n => <MenuItem key={n ?? 'once'} value={n ?? ''}>{every(n)}</MenuItem>)}
            </TextField>
            <TextField label={debit ? t('Next payment due') : t('Expected on')} type="date" value={m.next_due ?? ''} sx={{ flex: 1 }}
              onChange={e => set({ next_due: e.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
          {!debit && (
            <FormControlLabel control={<Switch checked={!!m.possible} onChange={e => set({ possible: e.target.checked })} />}
              label={t('Not agreed yet: money that could be raised')} />
          )}
          {m.id && (
            <FormControlLabel control={<Switch checked={!!m.done} onChange={e => set({ done: e.target.checked })} />}
              label={debit ? t('Settled: paid off, or let off the rest') : t('Settled: received, or sold for less')} />
          )}
          <TextField label={t('Notes')} value={m.notes ?? ''} multiline minRows={2} onChange={e => set({ notes: e.target.value })} slotProps={{ htmlInput: { maxLength: 2000 } }} />
          <TextField label={t('Link')} type="url" value={m.link ?? ''} onChange={e => set({ link: e.target.value })} placeholder={'https://'}
            helperText={debit ? t('A web page about it, like the agreement') : t('A web page about it, like where it’s for sale')} slotProps={{ htmlInput: { maxLength: 500 } }} />
          {payments.length > 0 && (
            <Box role="group" aria-label={debit ? t('Payments') : t('Money received')}>
              <Typography variant="subtitle2">{debit ? t('Payments') : t('Money received')}</Typography>
              {payments.map(p => (
                <Stack key={p.id} direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 0.5, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="body2" sx={{ width: 110, flexShrink: 0 }}>{day(p.paid_on)}</Typography>
                  <Typography variant="body2" sx={{ width: 100, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(p.amount)}</Typography>
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0, color: 'text.secondary' }} noWrap>{p.note ?? ''}</Typography>
                  <IconButton size="small" aria-label={t('Remove the payment of {date}', { date: day(p.paid_on) })} onClick={() => void removePayment(p.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {m.id && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

