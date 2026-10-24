import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Link, MenuItem, Stack, Switch,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CarIcon from '@mui/icons-material/DirectionsCarOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import AttachIcon from '@mui/icons-material/AttachFileOutlined'
import { useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { formatLocal, formatMoney, formatNumber, today } from '../../shared/time'
import {
  CLAIM_CATEGORIES, CLAIM_STATUSES, DEFAULT_MILEAGE_RATE, claimStatusLabel, claimTotals, mileageAmount, tripKm,
  type ClaimInput, type ClaimStatus, type ExpenseClaim,
} from '../../shared/claims'
import { taxFileProblem } from '../../shared/tax'
import { tokens } from '../theme'
import { t } from '../i18n'

const day = (d: string | null) => (d ? formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy') : '')
const TONE: Record<ClaimStatus, { fg: string; bg: string }> = {
  submitted: { fg: tokens.warnFg, bg: tokens.warnBg }, approved: { fg: tokens.infoFg, bg: tokens.infoBg },
  paid: { fg: tokens.goodFg, bg: tokens.goodBg }, rejected: { fg: tokens.neutralFg, bg: tokens.neutralBg },
}
type Show = 'all' | ClaimStatus

/**
 * Expenses & mileage (Accounts): what people on the team spent for the business or drove for it in
 * their own car, sent to be approved and paid back. Everyone sends their own and sees them; admins
 * with pay access see everyone's, decide and pay back (with the receipt kept under Tax › Expenses);
 * a gestoría with finances access reads. The database enforces who does what.
 */
export function ExpensesPage() {
  const { api, me, profiles, canSeePay, isPartner, settings, refresh } = useApp()
  const list = useAsync('expense-claims', () => api.expenseClaims(), [])
  const run = useAction()
  const [show, setShow] = useState<Show>('all')
  const [person, setPerson] = useState('')
  const [editing, setEditing] = useState<ClaimInput | null>(null)
  const decides = canSeePay && !isPartner
  const everyone = decides || isPartner
  const rate = settings?.mileage_rate ?? DEFAULT_MILEAGE_RATE
  const [rateText, setRateText] = useState(String(rate))

  const now = today()
  const all = list.data ?? []
  const shown = all.filter(c => (show === 'all' || c.status === show) && (!person || c.profile_id === person))
  const sums = claimTotals(everyone ? all : all.filter(c => c.profile_id === me?.id), `${now.slice(0, 7)}-01`)
  const nameOf = (id: string) => profiles.find(p => p.id === id)?.full_name ?? ''
  const people = [...new Set(all.map(c => c.profile_id))].map(id => ({ id, name: nameOf(id) })).sort((a, b) => a.name.localeCompare(b.name))
  const mine = (c: ExpenseClaim) => c.profile_id === me?.id
  const canEdit = (c: ExpenseClaim) => decides || (mine(c) && c.status === 'submitted' && !isPartner)

  const decide = (c: ExpenseClaim, status: ClaimStatus) => run(() => api.saveClaim({ id: c.id, description: c.description, kind: c.kind, km: c.km, return_trip: c.return_trip, status }),
    status === 'approved' ? t('Approved') : status === 'paid' ? t('Marked paid back') : t('Turned down'))
  const saveRate = () => run(async () => {
    const n = Number(rateText.replace(',', '.'))
    if (!(n >= 0 && n <= 5)) throw new Error(t('A rate a kilometre is between 0 and 5'))
    await api.updateSettings({ mileage_rate: n })
    await refresh()
  }, t('Saved'))

  const table = (): ExportTable => ({
    title: t('Expenses & mileage'), filename: `expenses-${now}`,
    columns: [t('Date'), t('Who'), t('What'), t('Category'), t('Starting point'), t('Destination'), t('Kilometres'), t('Rate a km'), t('Amount'), t('Status'), t('Paid back'), t('Receipt')],
    rows: shown.map(c => [c.spent_on, nameOf(c.profile_id), c.description, c.category ? t(c.category) : '', c.from_place ?? '', c.to_place ?? '',
      c.kind === 'mileage' ? tripKm(c) : '', c.rate_per_km ?? '', c.amount, t(claimStatusLabel(c.status)), c.paid_on ?? '', c.document?.link ?? '']),
    footer: [t('Total'), '', '', '', '', '', '', '', Math.round(shown.reduce((s, c) => s + (c.status === 'rejected' ? 0 : c.amount), 0) * 100) / 100, '', '', ''],
    money: [8],
  })

  return (
    <>
      <PageHeader eyebrow={t('Accounts')} title={t('Expenses & mileage')} actions={<>
        <ExportButton table={table} disabled={!shown.length} folder="Expenses" />
        {!isPartner && <>
          <Button variant="outlined" startIcon={<CarIcon />} onClick={() => setEditing({ description: '', kind: 'mileage', spent_on: now, return_trip: true })}>{t('Add a trip')}</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ description: '', kind: 'expense', spent_on: now })}>{t('Add an expense')}</Button>
        </>}
      </>} />
      <ErrorBox error={list.error} />

      <StatGrid>
        <StatTile label={t('To approve')} value={list.data ? formatMoney(sums.toApprove) : '–'} note={everyone ? t('Waiting on an admin') : t('Yours, waiting on an admin')} />
        <StatTile label={t('To pay back')} value={formatMoney(sums.toPayBack)} note={t('Approved, not paid yet')} />
        <StatTile label={t('Paid back this month')} value={formatMoney(sums.paidSince)} />
        <StatTile label={t('Driven this month')} value={`${formatNumber(sums.km)} km`} note={t('{rate} a km', { rate: formatMoney(rate) })} />
      </StatGrid>

      {decides && sums.toApprove > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>{t('Waiting on you: {list}.', { list: all.filter(c => c.status === 'submitted').map(c => `${nameOf(c.profile_id)} (${formatMoney(c.amount)})`).join(', ') })}</Alert>
      )}

      <Card component="section" aria-label={t('Claims')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={
            <Stack direction="row" spacing={1}>
              {everyone && (
                <TextField select size="small" label={t('Who')} value={person} onChange={e => setPerson(e.target.value)} sx={{ minWidth: 150 }}
                  slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
                  <MenuItem value="">{t('Everyone')}</MenuItem>
                  {people.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </TextField>
              )}
              <TextField select size="small" label={t('Show')} value={show} onChange={e => setShow(e.target.value as Show)} sx={{ minWidth: 150 }}>
                <MenuItem value="all">{t('All')}</MenuItem>
                {CLAIM_STATUSES.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
              </TextField>
            </Stack>
          }>{everyone ? t('Claims') : t('Your claims')}</SectionTitle>
          {shown.length === 0
            ? <Empty>{list.data ? t('Nothing here. Add what you spent for the business, or a trip in your own car.') : t('Loading…')}</Empty>
            : <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>{t('Date')}</TableCell>{everyone && <TableCell>{t('Who')}</TableCell>}<TableCell>{t('What')}</TableCell>
                    <TableCell align="right">{t('Amount')}</TableCell><TableCell>{t('Status')}</TableCell><TableCell />
                  </TableRow></TableHead>
                  <TableBody>
                    {shown.map(c => (
                      <TableRow key={c.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{day(c.spent_on)}</TableCell>
                        {everyone && <TableCell sx={{ whiteSpace: 'nowrap' }}>{nameOf(c.profile_id)}</TableCell>}
                        <TableCell sx={{ minWidth: 220 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{c.description}</Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {c.kind === 'mileage'
                              ? [`${c.from_place ?? ''} → ${c.to_place ?? ''}`, t('{km} km at {rate}', { km: formatNumber(tripKm(c)), rate: formatMoney(c.rate_per_km ?? rate) })].join(' · ')
                              : c.category ? t(c.category) : ''}
                          </Typography>
                          {c.decision_note && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{c.decision_note}</Typography>}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(c.amount)}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Tag {...TONE[c.status]}>{t(claimStatusLabel(c.status))}</Tag>
                          {c.paid_on && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{day(c.paid_on)}</Typography>}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {c.document?.link && <IconButton size="small" component="a" href={c.document.link} target="_blank" rel="noopener" aria-label={t('Open the receipt for {name}', { name: c.description })}><AttachIcon fontSize="small" /></IconButton>}
                          {decides && c.status === 'submitted' && <>
                            <Button size="small" onClick={() => void decide(c, 'approved')} aria-label={t('Approve {name}', { name: c.description })}>{t('Approve')}</Button>
                            <Button size="small" color="inherit" onClick={() => setEditing({ ...c, status: 'rejected' })} aria-label={t('Turn down {name}', { name: c.description })}>{t('Turn down')}</Button>
                          </>}
                          {decides && c.status === 'approved' && (
                            <Button size="small" onClick={() => void decide(c, 'paid')} aria-label={t('Paid back {name}', { name: c.description })}>{t('Paid back')}</Button>
                          )}
                          {canEdit(c) && <IconButton size="small" aria-label={t('Edit {name}', { name: c.description })} onClick={() => setEditing(c)}><EditIcon fontSize="small" /></IconButton>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>}
        </CardContent>
      </Card>

      {decides && (
        <Card component="section" aria-label={t('Mileage rate')} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle>{t('Mileage rate')}</SectionTitle>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              {t('What the business pays back a kilometre driven in someone’s own car. In Spain up to €0.26 a km is paid back without tax; above it, the extra is taxed as pay (check with your gestoría).')}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField size="small" label={t('Euros a km')} value={rateText} onChange={e => setRateText(e.target.value)} sx={{ width: 140 }} />
              <Button variant="outlined" onClick={() => void saveRate()} disabled={Number(rateText.replace(',', '.')) === rate}>{t('Save')}</Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {editing && <ClaimDialog claim={editing} rate={rate} decides={decides} onClose={() => setEditing(null)} />}
    </>
  )
}

/** An expense or a trip: what, when and how much; an admin with pay access also decides and adds the receipt. */
function ClaimDialog({ claim, rate, decides, onClose }: { claim: ClaimInput; rate: number; decides: boolean; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [c, setC] = useState<ClaimInput>(claim)
  const [file, setFile] = useState<File | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const set = (p: Partial<ClaimInput>) => setC(x => ({ ...x, ...p }))
  const trip = c.kind === 'mileage'
  const perKm = c.rate_per_km ?? rate
  const amount = trip ? mileageAmount(c.km ?? 0, perKm, !!c.return_trip) : c.amount ?? 0

  const save = async () => {
    const ok = await run(async () => {
      if (!c.description.trim()) throw new Error(t('Say what it was for'))
      if (trip && !(c.km && c.km > 0)) throw new Error(t('Enter the kilometres'))
      if (!trip && !(Number(c.amount) > 0)) throw new Error(t('Enter what it cost'))
      let documentId = c.document_id ?? null
      if (file) {
        const problem = taxFileProblem(file.name, file.size)
        if (problem) throw new Error(t(problem))
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('')
        const spent = c.spent_on ?? today()
        documentId = (await api.uploadTaxDocument(file, { name: file.name, kind: 'receipt', year: Number(spent.slice(0, 4)),
          quarter: (Math.floor((Number(spent.slice(5, 7)) - 1) / 3) + 1) as 1 | 2 | 3 | 4, folder: ['Tax', 'Expenses'], sha256: hash })).id
      }
      const { document: _d, ...row } = c as ExpenseClaim
      await api.saveClaim({ ...row, description: c.description.trim(), amount: trip ? amount : Number(c.amount), document_id: documentId,
        rate_per_km: trip ? (decides ? perKm : c.rate_per_km ?? null) : null })
    }, c.id ? t('Saved') : t('Sent to be approved'))
    if (ok) onClose()
  }
  const remove = async () => { if (c.id && await run(() => api.deleteClaim(c.id!), t('Claim removed'))) onClose() }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="claim-title">
      <DialogTitle id="claim-title">{c.id ? c.description : trip ? t('Add a trip') : t('Add an expense')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!c.id && (
            <ToggleButtonGroup exclusive size="small" value={c.kind} onChange={(_, v) => v && set({ kind: v })} aria-label={t('Kind')}>
              <ToggleButton value="expense">{t('Something bought')}</ToggleButton>
              <ToggleButton value="mileage">{t('A trip in my own car')}</ToggleButton>
            </ToggleButtonGroup>
          )}
          <TextField label={t('What it was for')} value={c.description} onChange={e => set({ description: e.target.value })} required />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Date')} type="date" value={c.spent_on ?? ''} onChange={e => set({ spent_on: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            <TextField select label={t('Category')} value={c.category ?? ''} onChange={e => set({ category: e.target.value || null })} sx={{ flex: 1 }}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
              <MenuItem value="">{t('None')}</MenuItem>
              {CLAIM_CATEGORIES.map(x => <MenuItem key={x} value={x}>{t(x)}</MenuItem>)}
            </TextField>
          </Stack>
          {trip ? <>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label={t('Starting point')} value={c.from_place ?? ''} onChange={e => set({ from_place: e.target.value })} sx={{ flex: 1 }} />
              <TextField label={t('Destination')} value={c.to_place ?? ''} onChange={e => set({ to_place: e.target.value })} sx={{ flex: 1 }} />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
              <TextField label={t('Kilometres (one way)')} type="number" value={c.km ?? ''} onChange={e => set({ km: e.target.value === '' ? null : Number(e.target.value) })} sx={{ flex: 1 }} />
              <FormControlLabel control={<Switch checked={!!c.return_trip} onChange={e => set({ return_trip: e.target.checked })} />} label={t('There and back')} sx={{ flex: 1 }} />
            </Stack>
            <Typography variant="body2">{t('{km} km at {rate} a km: {amount}', { km: formatNumber((c.km ?? 0) * (c.return_trip ? 2 : 1)), rate: formatMoney(perKm), amount: formatMoney(amount) })}</Typography>
          </> : (
            <TextField label={t('Amount (with IVA)')} type="number" value={c.amount ?? ''} onChange={e => set({ amount: e.target.value === '' ? undefined : Number(e.target.value) })} />
          )}
          {decides && <>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField select label={t('Status')} value={c.status ?? 'submitted'} onChange={e => set({ status: e.target.value as ClaimStatus })} sx={{ flex: 1 }}>
                {CLAIM_STATUSES.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
              </TextField>
              {c.status === 'paid' && <TextField label={t('Paid back on')} type="date" value={c.paid_on ?? ''} onChange={e => set({ paid_on: e.target.value || null })}
                slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />}
            </Stack>
            {(c.status === 'rejected' || c.decision_note) && <TextField label={t('Note for them')} value={c.decision_note ?? ''} onChange={e => set({ decision_note: e.target.value })} />}
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Button startIcon={<AttachIcon />} onClick={() => input.current?.click()}>{c.document_id || file ? t('Replace the receipt') : t('Add the receipt')}</Button>
              <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
                {file?.name ?? ((claim as ExpenseClaim).document ? <Link href={(claim as ExpenseClaim).document!.link ?? undefined} target="_blank" rel="noopener">{(claim as ExpenseClaim).document!.name}</Link>
                  : t('Kept in your Drive or OneDrive, under Tax › Expenses'))}
              </Typography>
              <input ref={input} type="file" hidden onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
            </Stack>
          </>}
          {!decides && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Keep the receipt and give it to an admin: they add it when they pay you back.')}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        {c.id && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{c.id ? t('Save') : t('Send')}</Button>
      </DialogActions>
    </Dialog>
  )
}
