import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import InvoiceIcon from '@mui/icons-material/DescriptionOutlined'
import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { addDays, formatLocal, formatMoney, today } from '../../shared/time'
import { customerName } from '../../shared/customers'
import { isOpen } from '../../shared/leads'
import {
  DEFAULT_VALID_DAYS, QUOTE_STATUSES, VAT_RATES, lineNet, lineProblem, quoteStatusLabel, statusOn, totals,
  type Quote, type QuoteInput, type QuoteLine, type QuoteStatus,
} from '../../shared/quotes'
import type { Customer } from '../../shared/types'
import { tokens } from '../theme'
import { t } from '../i18n'

const day = (d: string | null) => (d ? formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy') : '')
const TONE: Record<QuoteStatus, { fg: string; bg: string }> = {
  draft: { fg: tokens.neutralFg, bg: tokens.neutralBg }, sent: { fg: tokens.infoFg, bg: tokens.infoBg }, accepted: { fg: tokens.goodFg, bg: tokens.goodBg },
  declined: { fg: tokens.badFg, bg: tokens.badBg }, expired: { fg: tokens.warnFg, bg: tokens.warnBg },
}
const blankLine = (): QuoteLine => ({ description: '', quantity: 1, unit_price: 0, vat_rate: 10 })
const forWhom = (q: Pick<Quote, 'customer'>) => (q.customer ? customerName(q.customer) : '')

/**
 * Quotes & estimates (Sales): what the business offers to do for a price, line by line with its IVA,
 * numbered by the database. One can start from an enquiry (Leads & enquiries, which it moves to
 * Quoted, and to Won once accepted); accepted, it goes to Invoices as a sales invoice to issue.
 * Admins only (the database enforces it too).
 */
export function QuotesPage() {
  const { api, isAdmin, canSeePay, isPartner } = useApp()
  const list = useAsync('quotes', () => api.quotes(), [])
  const enquiries = useAsync('enquiries', () => api.enquiries(), [])
  const run = useAction()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<QuoteInput | null>(null)

  // From an enquiry (its Quote button): a new quote for it, filled in.
  const fromEnquiry = params.get('enquiry')
  useEffect(() => {
    if (!fromEnquiry || !enquiries.data) return
    const e = enquiries.data.find(x => x.id === fromEnquiry)
    if (e) setEditing({ title: e.title, enquiry_id: e.id, customer_id: e.customer_id, status: 'draft', lines: [blankLine()], discount_pct: 0 })
    setParams({}, { replace: true })
  }, [fromEnquiry, enquiries.data, setParams])

  if (!isAdmin) {
    return <>
      <PageHeader eyebrow={t('Sales')} title={t('Quotes & estimates')} />
      <Alert severity="info">{t('Quotes are only visible to admins.')}</Alert>
    </>
  }

  const now = today()
  const all = list.data ?? []
  const status = (q: Quote) => statusOn(q, now)
  const waiting = all.filter(q => status(q) === 'sent')
  const decided = all.filter(q => ['accepted', 'declined', 'expired'].includes(status(q)) && (q.issued_on ?? '') >= addDays(now, -365))
  const accepted = decided.filter(q => status(q) === 'accepted')
  const sum = (qs: Quote[]) => qs.reduce((s, q) => s + q.total, 0)
  const toInvoice = all.filter(q => q.status === 'accepted' && !q.invoice_id)

  const invoice = (q: Quote) => run(() => api.invoiceQuote(q.id), t('Added to Invoices as a sales invoice to issue'))
  const table = (): ExportTable => ({
    title: t('Quotes & estimates'), filename: `quotes-${now}`,
    columns: [t('Number'), t('Quote'), t('For'), t('Dated'), t('Valid until'), t('Without IVA'), t('IVA'), t('Total'), t('Status')],
    rows: all.map(q => [q.number, q.title, forWhom(q), q.issued_on ?? '', q.valid_until ?? '', q.net, q.vat, q.total, t(quoteStatusLabel(status(q)))]),
    money: [5, 6, 7],
  })

  return (
    <>
      <PageHeader eyebrow={t('Sales')} title={t('Quotes & estimates')} actions={<>
        <ExportButton table={table} disabled={!all.length} folder="Quotes" />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ title: '', status: 'draft', lines: [blankLine()], discount_pct: 0 })}>{t('New quote')}</Button>
      </>} />
      <ErrorBox error={list.error} />

      <StatGrid>
        <StatTile label={t('Waiting on an answer')} value={list.data ? waiting.length : '–'} note={formatMoney(sum(waiting))} />
        <StatTile label={t('Accepted this year')} value={accepted.length} note={formatMoney(sum(accepted))} />
        <StatTile label={t('Acceptance rate')} value={decided.length ? `${Math.round((accepted.length / decided.length) * 100)}%` : '–'} note={t('Of those answered in the last year')} />
        <StatTile label={t('Drafts')} value={all.filter(q => q.status === 'draft').length} note={t('Not sent yet')} />
      </StatGrid>

      {canSeePay && !isPartner && toInvoice.length > 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {t('Accepted and not on Invoices yet: {list}.', { list: toInvoice.map(q => `${q.number} (${q.title})`).join(', ') })}
        </Alert>
      )}

      <Card component="section" aria-label={t('Quotes')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('Quotes')}</SectionTitle>
          {all.length === 0
            ? <Empty>{list.data ? t('No quotes yet. Make one here, or from an enquiry on Leads & enquiries.') : t('Loading…')}</Empty>
            : <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>{t('Number')}</TableCell><TableCell>{t('Quote')}</TableCell><TableCell>{t('Dated')}</TableCell>
                    <TableCell align="right">{t('Total')}</TableCell><TableCell>{t('Status')}</TableCell><TableCell />
                  </TableRow></TableHead>
                  <TableBody>
                    {all.map(q => {
                      const s = status(q)
                      return (
                        <TableRow key={q.id} hover>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{q.number}</TableCell>
                          <TableCell sx={{ minWidth: 220 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{q.title}</Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{forWhom(q)}</Typography>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>
                            {day(q.issued_on)}
                            {q.valid_until && s === 'sent' && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{t('Until {date}', { date: day(q.valid_until) })}</Typography>}
                          </TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(q.total)}</TableCell>
                          <TableCell><Tag {...TONE[s]}>{t(quoteStatusLabel(s))}</Tag></TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                            {q.invoice_id
                              ? <Button size="small" component={RouterLink} to="/invoices" startIcon={<InvoiceIcon />}>{t('On Invoices')}</Button>
                              : q.status === 'accepted' && canSeePay && !isPartner && (
                                <Button size="small" startIcon={<InvoiceIcon />} onClick={() => void invoice(q)} aria-label={t('Add {name} to Invoices', { name: q.number })}>{t('Add to Invoices')}</Button>
                              )}
                            <IconButton size="small" aria-label={t('Edit {name}', { name: q.number })} onClick={() => setEditing(q)}><EditIcon fontSize="small" /></IconButton>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </Box>}
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
            {t('The app keeps your quotes. Issuing the invoice itself needs invoicing software that meets Verifactu.')}
          </Typography>
        </CardContent>
      </Card>

      {editing && <QuoteDialog quote={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

/** A quote's lines, who it's for, its dates and terms; the totals as the database works them out. */
function QuoteDialog({ quote, onClose }: { quote: QuoteInput; onClose: () => void }) {
  const { api, business } = useApp()
  const run = useAction()
  const people = useAsync('customers', () => api.customers(), [])
  const enquiries = useAsync('enquiries', () => api.enquiries(), [])
  const [q, setQ] = useState<QuoteInput>(quote)
  const set = (p: Partial<QuoteInput>) => setQ(x => ({ ...x, ...p }))
  const lines = q.lines ?? []
  const setLine = (i: number, p: Partial<QuoteLine>) => set({ lines: lines.map((l, n) => (n === i ? { ...l, ...p } : l)) })
  const sums = totals(lines, q.discount_pct ?? 0)
  const options = useMemo(() => [...(people.data ?? [])].sort((a, b) => customerName(a).localeCompare(customerName(b))), [people.data])
  const picked = options.find(c => c.id === q.customer_id) ?? null
  const openEnquiries = (enquiries.data ?? []).filter(e => isOpen(e) || e.id === q.enquiry_id)
  const number = (quote as Quote).number

  const sheet = (): ExportTable => ({
    title: [business?.name, number ?? t('Quote'), q.title].filter(Boolean).join(' · '), filename: `quote-${number ?? 'draft'}`,
    columns: [t('Description'), t('Quantity'), t('Price'), t('IVA'), t('Amount')],
    rows: [
      ...lines.map(l => [l.description, l.quantity, l.unit_price, `${l.vat_rate}%`, lineNet(l)]),
      ...(q.discount_pct ? [[t('Discount'), '', '', '', `−${q.discount_pct}%`]] : []),
      ...sums.byRate.map(r => [t('IVA at {rate}%', { rate: r.rate }), '', '', '', r.vat]),
      ...(q.terms ? [[q.terms, '', '', '', '']] : []),
    ],
    footer: [t('Total'), '', '', '', sums.total],
    money: [2, 4],
  })

  const save = async () => {
    const ok = await run(async () => {
      if (!q.title.trim()) throw new Error(t('Give the quote a title'))
      const used = lines.filter(l => l.description.trim() || l.unit_price)
      for (const l of used) { const problem = lineProblem(l); if (problem) throw new Error(t(problem)) }
      const { customer: _c, ...input } = q as QuoteInput & { customer?: unknown }
      await api.saveQuote({ ...input, title: q.title.trim(), lines: used.map(l => ({ ...l, description: l.description.trim() })) })
    }, t('Saved'))
    if (ok) onClose()
  }
  const remove = async () => { if (q.id && await run(() => api.deleteQuote(q.id!), t('Quote removed'))) onClose() }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="quote-title">
      <DialogTitle id="quote-title">{q.id ? `${number} · ${q.title}` : t('New quote')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Title')} value={q.title} onChange={x => set({ title: x.target.value })} required helperText={t('What it’s for: “Catering for 40, Saturday 14th”')} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Autocomplete sx={{ flex: 1 }} options={options} value={picked} onChange={(_, c: Customer | null) => set({ customer_id: c?.id ?? null })}
              getOptionLabel={c => [customerName(c), c.company].filter(Boolean).join(' · ')} isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText={t('Nobody by that name')} renderInput={p => <TextField {...p} label={t('For')} />} />
            <TextField select label={t('Enquiry')} value={q.enquiry_id ?? ''} onChange={x => {
              const e = openEnquiries.find(y => y.id === x.target.value)
              set({ enquiry_id: e?.id ?? null, customer_id: e ? e.customer_id : q.customer_id })
            }} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} sx={{ flex: 1 }}>
              <MenuItem value="">{t('None')}</MenuItem>
              {openEnquiries.map(e => <MenuItem key={e.id} value={e.id}>{e.title}</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('Status')} value={q.status ?? 'draft'} onChange={x => set({ status: x.target.value as QuoteStatus })} sx={{ flex: 1 }}>
              {QUOTE_STATUSES.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
            </TextField>
            <TextField label={t('Dated')} type="date" value={q.issued_on ?? ''} onChange={x => set({ issued_on: x.target.value || null })} slotProps={{ inputLabel: { shrink: true } }}
              helperText={t('Today when sent, unless you pick a day')} sx={{ flex: 1 }} />
            <TextField label={t('Valid until')} type="date" value={q.valid_until ?? ''} onChange={x => set({ valid_until: x.target.value || null })} slotProps={{ inputLabel: { shrink: true } }}
              helperText={t('{n} days from the date unless you pick one', { n: DEFAULT_VALID_DAYS })} sx={{ flex: 1 }} />
          </Stack>

          <Box component="section" aria-label={t('Lines')} sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>{t('Description')}</TableCell><TableCell sx={{ width: 90 }}>{t('Quantity')}</TableCell>
                <TableCell sx={{ width: 120 }}>{t('Price without IVA')}</TableCell><TableCell sx={{ width: 90 }}>{t('IVA')}</TableCell>
                <TableCell align="right" sx={{ width: 100 }}>{t('Amount')}</TableCell><TableCell sx={{ width: 40 }} />
              </TableRow></TableHead>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell sx={{ minWidth: 220 }}>
                      <TextField size="small" fullWidth value={l.description} onChange={x => setLine(i, { description: x.target.value })}
                        slotProps={{ htmlInput: { 'aria-label': t('Description of line {n}', { n: i + 1 }) } }} />
                    </TableCell>
                    <TableCell><TextField size="small" type="number" value={l.quantity} onChange={x => setLine(i, { quantity: Number(x.target.value) })}
                      slotProps={{ htmlInput: { 'aria-label': t('Quantity of line {n}', { n: i + 1 }), min: 0, step: 'any' } }} /></TableCell>
                    <TableCell><TextField size="small" type="number" value={l.unit_price} onChange={x => setLine(i, { unit_price: Number(x.target.value) })}
                      slotProps={{ htmlInput: { 'aria-label': t('Price of line {n}', { n: i + 1 }), min: 0, step: 'any' } }} /></TableCell>
                    <TableCell>
                      <TextField select size="small" value={l.vat_rate} onChange={x => setLine(i, { vat_rate: Number(x.target.value) })}
                        slotProps={{ select: { SelectDisplayProps: { 'aria-label': t('IVA of line {n}', { n: i + 1 }) } } }}>
                        {VAT_RATES.map(r => <MenuItem key={r} value={r}>{`${r}%`}</MenuItem>)}
                      </TextField>
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatMoney(lineNet(l))}</TableCell>
                    <TableCell>
                      <IconButton size="small" aria-label={t('Remove line {n}', { n: i + 1 })} onClick={() => set({ lines: lines.filter((_, n) => n !== i) })}><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button size="small" startIcon={<AddIcon />} onClick={() => set({ lines: [...lines, blankLine()] })} sx={{ mt: 1 }}>{t('Add a line')}</Button>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'flex-start' } }}>
            <TextField label={t('Discount %')} type="number" value={q.discount_pct ?? 0} sx={{ width: { sm: 160 } }}
              onChange={x => set({ discount_pct: Math.max(0, Math.min(100, Number(x.target.value) || 0)) })} />
            <Box sx={{ flex: 1 }} role="list" aria-label={t('Totals')}>
              <Stack role="listitem" direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2">{t('Without IVA')}</Typography><Typography variant="body2">{formatMoney(sums.net)}</Typography></Stack>
              {sums.byRate.map(r => (
                <Stack key={r.rate} role="listitem" direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography variant="body2">{t('IVA at {rate}%', { rate: r.rate })}</Typography><Typography variant="body2">{formatMoney(r.vat)}</Typography>
                </Stack>
              ))}
              <Stack role="listitem" direction="row" sx={{ justifyContent: 'space-between', borderTop: `1px solid ${tokens.line}`, mt: 0.5, pt: 0.5 }}>
                <Typography sx={{ fontWeight: 600 }}>{t('Total')}</Typography><Typography sx={{ fontWeight: 600 }}>{formatMoney(sums.total)}</Typography>
              </Stack>
            </Box>
          </Stack>
          <TextField label={t('Terms')} value={q.terms ?? ''} multiline minRows={2} onChange={x => set({ terms: x.target.value })}
            helperText={t('On the quote: what’s included, the deposit, how to accept')} />
          <TextField label={t('Notes')} value={q.notes ?? ''} multiline minRows={2} onChange={x => set({ notes: x.target.value })} helperText={t('Only for the team')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {q.id && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <ExportButton table={sheet} disabled={!lines.length} folder="Quotes" />
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
