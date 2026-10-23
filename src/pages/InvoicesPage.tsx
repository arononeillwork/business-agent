import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Link, MenuItem, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import UploadIcon from '@mui/icons-material/CloudUploadOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import OpenIcon from '@mui/icons-material/OpenInNew'
import MailIcon from '@mui/icons-material/MailOutlined'
import NotesIcon from '@mui/icons-material/StickyNote2Outlined'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import { Freshness } from '../components/Freshness'
import type { ExportTable } from '../lib/export'
import { formatLocal, formatMoney, today } from '../../shared/time'
import {
  INVOICE_STATUSES, bySupplier, dueFrom, isOpen, isOverdue, numberFromName,
  type InboxInvoice, type Invoice, type InvoiceDirection, type InvoiceInput, type InvoiceStatus,
} from '../../shared/invoices'
import type { Supplier } from '../../shared/stock'
import { UploadDialog } from './TaxPage'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

type Row = Invoice & { document?: { name: string; link: string | null } | null }
const day = (d: string | null) => (d ? formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy') : '')
const money = (n: number | null) => (n === null ? '' : formatMoney(n))
const statusLabel = (s: InvoiceStatus) => t(INVOICE_STATUSES.find(x => x.id === s)!.label)
const TONE: Record<InvoiceStatus, { fg: string; bg: string }> = {
  to_check: { fg: tokens.infoFg, bg: tokens.infoBg }, to_pay: { fg: tokens.warnFg, bg: tokens.warnBg }, paid: { fg: tokens.goodFg, bg: tokens.goodBg },
  disputed: { fg: tokens.badFg, bg: tokens.badBg }, sent: { fg: tokens.warnFg, bg: tokens.warnBg }, cancelled: { fg: tokens.neutralFg, bg: tokens.neutralBg },
}

/**
 * Invoices: what suppliers have invoiced (and the sales invoices sent), each tied to its supplier
 * from Stock → Suppliers and to its file in the café's Drive or OneDrive. They come in from the
 * connected mailbox, an upload or are typed in; notes and a status say what's been done about each.
 * Admins with pay access; a gestoría with finances access reads (the database enforces it too).
 */
export function InvoicesPage() {
  const { canSeeFinances, isPartner, api } = useApp()
  const canEdit = canSeeFinances && !isPartner
  const list = useAsync('invoices', () => api.invoices(), [])
  const suppliers = useAsync('suppliers', () => api.suppliers(), [])
  const docs = useAsync('tax-documents', () => (canEdit ? api.taxDocuments(Number(today().slice(0, 4))) : Promise.resolve([])), [Number(today().slice(0, 4))])
  const [direction, setDirection] = useState<InvoiceDirection>('in')
  const [status, setStatus] = useState<'all' | 'open' | InvoiceStatus>('all')
  const [supplier, setSupplier] = useState<string>('all')
  const [editing, setEditing] = useState<InvoiceInput | null>(null)
  const [uploading, setUploading] = useState(false)
  const run = useAction()

  if (!canSeeFinances) {
    return <>
      <PageHeader eyebrow={t('Accounts')} title={t('Invoices')} />
      <Alert severity="info">{t('Invoices are only visible to admins with pay access.')}</Alert>
    </>
  }

  const now = today()
  const all = (list.data ?? []) as Row[]
  const sups = suppliers.data ?? []
  const received = all.filter(i => i.direction === 'in')
  const open = received.filter(isOpen)
  const late = received.filter(i => isOverdue(i, now))
  const paidThisMonth = received.filter(i => i.status === 'paid' && i.paid_on?.slice(0, 7) === now.slice(0, 7))
  const sum = (xs: Invoice[]) => xs.reduce((s, i) => s + Number(i.total ?? 0), 0)
  const nameOf = (i: Invoice) => sups.find(s => s.id === i.supplier_id)?.name ?? i.party_name ?? i.party_email ?? t('Unknown')
  const shown = all.filter(i => i.direction === direction
    && (status === 'all' || (status === 'open' ? isOpen(i) : i.status === status))
    && (supplier === 'all' || (supplier === 'none' ? !i.supplier_id : i.supplier_id === supplier)))

  const table = (): ExportTable => ({
    title: direction === 'in' ? t('Invoices received') : t('Invoices sent'),
    filename: `invoices-${direction === 'in' ? 'received' : 'sent'}-${now}`,
    columns: [t('Date'), direction === 'in' ? t('Supplier') : t('Customer'), t('Number'), t('Category'), t('Net'), t('IVA'), t('Total'), t('Due'), t('Status'), t('Paid on'), t('Notes'), t('File')],
    rows: shown.map(i => [i.issued_on ?? '', nameOf(i), i.number ?? '', i.category ? t(i.category) : '', i.net, i.vat, i.total, i.due_on ?? '', statusLabel(i.status), i.paid_on ?? '', i.notes ?? '', i.document?.link ?? '']),
    footer: [t('Total'), '', '', '', null, null, sum(shown), '', '', '', '', ''],
    money: [4, 5, 6],
  })

  // Each uploaded file becomes an invoice to check, its number read from the file name.
  const kept = async (doc: { id: string; name: string; kind: string }) => {
    await api.saveInvoice({ direction: doc.kind === 'sales_invoice' ? 'out' : 'in', document_id: doc.id, number: numberFromName(doc.name),
      source: 'upload', status: doc.kind === 'sales_invoice' ? 'sent' : 'to_check' })
  }

  return (
    <>
      <PageHeader eyebrow={t('Accounts')} title={t('Invoices')} actions={canEdit ? <>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setEditing({ direction, status: direction === 'in' ? 'to_pay' : 'sent', source: 'manual' })}>{t('Add an invoice')}</Button>
        <Button variant="contained" startIcon={<UploadIcon />} onClick={() => setUploading(true)}>{t('Upload invoices')}</Button>
      </> : <Tag>{t('Read-only')}</Tag>} />
      <ErrorBox error={list.error ?? suppliers.error} />

      <StatGrid>
        <StatTile label={t('To pay')} value={list.data ? formatMoney(sum(open)) : '–'} note={tn(open.length, '{n} invoice', '{n} invoices')} />
        <StatTile label={t('Overdue')} value={list.data ? formatMoney(sum(late)) : '–'} note={late.length ? tn(late.length, '{n} invoice', '{n} invoices') : t('None')} />
        <StatTile label={t('To check')} value={received.filter(i => i.status === 'to_check').length} note={t('Brought in, not checked yet')} />
        <StatTile label={t('Paid this month')} value={list.data ? formatMoney(sum(paidThisMonth)) : '–'} note={tn(paidThisMonth.length, '{n} invoice', '{n} invoices')} />
      </StatGrid>

      {canEdit && <FromEmail suppliers={sups} />}

      <Card component="section" aria-label={t('Invoices')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={<ExportButton table={table} disabled={!shown.length} folder="Invoices" />}>{t('Invoices')}</SectionTitle>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
            <Stack direction="row" spacing={1} role="group" aria-label={t('Received or sent')}>
              {(['in', 'out'] as const).map(d => (
                <Chip key={d} label={d === 'in' ? t('Received') : t('Sent')} color={direction === d ? 'primary' : 'default'} variant={direction === d ? 'filled' : 'outlined'}
                  aria-pressed={direction === d} onClick={() => { setDirection(d); setStatus('all') }} />
              ))}
            </Stack>
            <TextField select size="small" label={t('Status')} value={status} onChange={e => setStatus(e.target.value as typeof status)} sx={{ minWidth: 170 }}>
              <MenuItem value="all">{t('Any status')}</MenuItem>
              <MenuItem value="open">{t('Not paid yet')}</MenuItem>
              {INVOICE_STATUSES.filter(s => s.for.includes(direction)).map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
            </TextField>
            {direction === 'in' && (
              <TextField select size="small" label={t('Supplier')} value={supplier} onChange={e => setSupplier(e.target.value)} sx={{ minWidth: 200 }}>
                <MenuItem value="all">{t('Every supplier')}</MenuItem>
                {sups.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                <MenuItem value="none">{t('Not matched to a supplier')}</MenuItem>
              </TextField>
            )}
          </Stack>
          {shown.length === 0
            ? <Empty>{list.data ? t('No invoices here yet.') : t('Loading…')}</Empty>
            : <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>{t('Date')}</TableCell><TableCell>{direction === 'in' ? t('Supplier') : t('Customer')}</TableCell><TableCell>{t('Number')}</TableCell>
                    <TableCell align="right">{t('Total')}</TableCell><TableCell>{t('Due')}</TableCell><TableCell>{t('Status')}</TableCell><TableCell />
                  </TableRow></TableHead>
                  <TableBody>
                    {shown.map(i => (
                      <TableRow key={i.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{day(i.issued_on) || <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('No date yet')}</Typography>}</TableCell>
                        <TableCell>
                          <Typography variant="body2">{nameOf(i)}</Typography>
                          {i.category && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t(i.category)}</Typography>}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{i.number ?? ''}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{money(i.total)}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {day(i.due_on)}
                          {isOverdue(i, now) && <Box><Tag fg={tokens.badFg} bg={tokens.badBg}>{t('Overdue')}</Tag></Box>}
                        </TableCell>
                        <TableCell>
                          {canEdit
                            ? <TextField select size="small" value={i.status} sx={{ minWidth: 150 }}
                                slotProps={{ htmlInput: { 'aria-label': t('Status of {invoice}', { invoice: i.number ?? nameOf(i) }) } }}
                                onChange={e => void run(() => api.saveInvoice({ id: i.id, status: e.target.value as InvoiceStatus }), t('Saved'))}>
                                {INVOICE_STATUSES.filter(s => s.for.includes(i.direction)).map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
                              </TextField>
                            : <Tag {...TONE[i.status]}>{statusLabel(i.status)}</Tag>}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {i.notes && <IconButton size="small" aria-label={t('Notes: {notes}', { notes: i.notes })} title={i.notes} onClick={() => canEdit && setEditing(i)}><NotesIcon fontSize="small" /></IconButton>}
                          {i.document?.link && <IconButton size="small" component="a" href={i.document.link} target="_blank" rel="noopener" aria-label={t('Open the file of {invoice}', { invoice: i.number ?? nameOf(i) })}><OpenIcon fontSize="small" /></IconButton>}
                          {canEdit && <IconButton size="small" aria-label={t('Edit {invoice}', { invoice: i.number ?? nameOf(i) })} onClick={() => setEditing(i)}><EditIcon fontSize="small" /></IconButton>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>}
        </CardContent>
      </Card>

      {direction === 'in' && <BySupplier invoices={all} suppliers={sups} onPick={setSupplier} />}

      {editing && <InvoiceDialog invoice={editing} suppliers={sups} onClose={() => setEditing(null)} />}
      {uploading && <UploadDialog year={Number(now.slice(0, 4))} known={docs.data ?? []} kind={direction === 'in' ? 'purchase_invoice' : 'sales_invoice'}
        title={t('Upload invoices')} onKept={kept} onClose={() => { setUploading(false); void run(async () => {}) }} />}
    </>
  )
}

/** Totals per supplier for the invoices received: what each invoiced and what's still to pay. */
function BySupplier({ invoices, suppliers, onPick }: { invoices: Invoice[]; suppliers: Supplier[]; onPick: (id: string) => void }) {
  const rows = bySupplier(invoices, suppliers)
  const table = (): ExportTable => ({
    title: t('Invoices by supplier'), filename: `invoices-by-supplier-${today()}`,
    columns: [t('Supplier'), t('Kind'), t('Invoices'), t('Invoiced'), t('Still to pay')],
    rows: rows.map(r => [r.name, r.kind ? t(r.kind) : '', r.count, r.total, r.open]),
    footer: [t('Total'), '', rows.reduce((s, r) => s + r.count, 0), rows.reduce((s, r) => s + r.total, 0), rows.reduce((s, r) => s + r.open, 0)],
    money: [3, 4],
  })
  if (!rows.length) return null
  return (
    <Card component="section" aria-label={t('By supplier')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={<ExportButton table={table} folder="Invoices" />}>{t('By supplier')}</SectionTitle>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>{t('Supplier')}</TableCell><TableCell align="right">{t('Invoices')}</TableCell>
              <TableCell align="right">{t('Invoiced')}</TableCell><TableCell align="right">{t('Still to pay')}</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.key} hover>
                  <TableCell>
                    {r.supplier_id ? <Link component="button" onClick={() => onPick(r.supplier_id!)}>{r.name}</Link> : r.name || t('Unknown')}
                    {r.kind && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{t(r.kind)}</Typography>}
                  </TableCell>
                  <TableCell align="right">{r.count}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.total)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: r.open ? tokens.roseDeep : undefined }}>{formatMoney(r.open)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  )
}

/**
 * Invoices waiting in the connected Gmail or Outlook: emails with a PDF, photo or e-invoice attached,
 * each matched to its supplier by who sent it. Reading the mailbox is asked for separately: the
 * connection on its own only sends email.
 */
function FromEmail({ suppliers }: { suppliers: Supplier[] }) {
  const { api } = useApp()
  const run = useAction()
  const inbox = useAsync('invoice-inbox', () => api.invoiceInbox(60), [])
  const [picked, setPicked] = useState<Record<string, string>>({})
  const box = inbox.data?.mailbox
  const boxName = box === 'outlook' ? 'Outlook' : 'Gmail'
  const waiting = (inbox.data?.messages ?? []).filter(m => m.attachments.some(a => !a.imported))
  const supplierOf = (m: InboxInvoice) => picked[m.id] ?? m.supplier_id ?? ''
  const bring = (m: InboxInvoice, attachment: string) =>
    run(() => api.importInvoice(m, attachment, supplierOf(m) || null), t('Invoice brought in'))
  const bringMatched = () => run(async () => {
    for (const m of waiting.filter(x => supplierOf(x))) for (const a of m.attachments.filter(x => !x.imported)) await api.importInvoice(m, a.id, supplierOf(m))
  }, t('Invoices brought in'))

  return (
    <Card component="section" aria-label={t('From email')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={inbox.data?.can_read && waiting.some(m => supplierOf(m)) && (
          <Button startIcon={<MailIcon />} onClick={() => void bringMatched()}>{t('Bring in all from known suppliers')}</Button>
        )}>{t('From email')}</SectionTitle>
        {inbox.data?.can_read && <Box sx={{ mt: -1, mb: 1.5 }}><Freshness id="mail" at={inbox.data.fetched_at} /></Box>}
        <ErrorBox error={inbox.error} />
        {inbox.data && !box && (
          <Alert severity="info" action={<Button component={RouterLink} to="/connections" color="inherit">{t('Connections')}</Button>}>
            {t('Connect Gmail or Outlook to bring in invoices that come by email.')}
          </Alert>
        )}
        {inbox.data && box && !inbox.data.can_read && (
          <Alert severity="info" action={<Button color="inherit" onClick={() => void run(() => api.connectService(box, 'invoices', { read: true }))}>{t('Allow reading')}</Button>}>
            {t('{mailbox} is connected to send email only. Allow Business Agent to read it too, to find invoices from your suppliers. Nothing is changed or deleted in the mailbox.', { mailbox: boxName })}
          </Alert>
        )}
        {inbox.data?.can_read && (waiting.length === 0
          ? <Empty>{t('No new invoices in {mailbox} from the last 60 days.', { mailbox: boxName })}</Empty>
          : <Stack spacing={1.5}>
              {waiting.map(m => (
                <Box key={m.id} role="article" aria-label={m.subject || m.from} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{m.subject || t('(no subject)')}</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
                        {m.from_name ? `${m.from_name} · ${m.from}` : m.from} · {formatLocal(m.at, 'd MMM')}
                      </Typography>
                    </Box>
                    <TextField select size="small" label={t('Supplier')} value={supplierOf(m)} sx={{ minWidth: 200 }}
                      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                      onChange={e => setPicked(p => ({ ...p, [m.id]: e.target.value }))}>
                      <MenuItem value="">{t('Not one of mine')}</MenuItem>
                      {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                    </TextField>
                  </Stack>
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
                    {m.attachments.filter(a => !a.imported).map(a => (
                      <Button key={a.id} size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => void bring(m, a.id)}
                        aria-label={t('Bring in {file}', { file: a.name })}>{a.name}</Button>
                    ))}
                  </Stack>
                </Box>
              ))}
            </Stack>)}
      </CardContent>
    </Card>
  )
}

/** An invoice's details: supplier, number, days, amounts, status and notes. */
function InvoiceDialog({ invoice, suppliers, onClose }: { invoice: InvoiceInput; suppliers: Supplier[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [i, setI] = useState<InvoiceInput>(invoice)
  const set = (p: Partial<InvoiceInput>) => setI(x => ({ ...x, ...p }))
  const num = (v: string) => (v === '' ? null : Number(v))
  const terms = suppliers.find(s => s.id === i.supplier_id)?.payment_terms
  const save = async () => {
    const due = i.due_on || dueFrom(i.issued_on ?? null, terms)
    // No total typed: net plus IVA.
    const total = i.total ?? (i.net != null ? Math.round((Number(i.net) + Number(i.vat ?? 0)) * 100) / 100 : null)
    if (await run(() => api.saveInvoice({ ...i, due_on: due ?? null, total }), t('Saved'))) onClose()
  }
  const remove = async () => { if (i.id && await run(() => api.deleteInvoice(i.id!), t('Invoice removed. Its file is still in your storage.'))) onClose() }
  const out = i.direction === 'out'
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="invoice-title">
      <DialogTitle id="invoice-title">{i.id ? t('Invoice {number}', { number: i.number ?? '' }).trim() : out ? t('Add a sales invoice') : t('Add an invoice')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!out && (
            <TextField select label={t('Supplier')} value={i.supplier_id ?? ''} onChange={e => set({ supplier_id: e.target.value || null })}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              helperText={terms ? t('Pays at: {terms}', { terms }) : undefined}>
              <MenuItem value="">{t('Not one of mine')}</MenuItem>
              {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
            </TextField>
          )}
          {(out || !i.supplier_id) && <TextField label={out ? t('Customer') : t('From')} value={i.party_name ?? ''} onChange={e => set({ party_name: e.target.value })} />}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Number')} value={i.number ?? ''} onChange={e => set({ number: e.target.value })} sx={{ flex: 1 }} />
            <TextField label={t('Category')} value={i.category ?? ''} onChange={e => set({ category: e.target.value })} sx={{ flex: 1 }}
              helperText={!out && i.supplier_id && !i.category ? t('The supplier’s kind when left empty') : undefined} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Date')} type="date" value={i.issued_on ?? ''} onChange={e => set({ issued_on: e.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            <TextField label={t('Due')} type="date" value={i.due_on ?? ''} onChange={e => set({ due_on: e.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }}
              helperText={!i.due_on && dueFrom(i.issued_on ?? null, terms) ? t('{date} from the supplier’s terms', { date: day(dueFrom(i.issued_on ?? null, terms)) }) : undefined} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Net')} type="number" value={i.net ?? ''} onChange={e => set({ net: num(e.target.value) })} sx={{ flex: 1 }} />
            <TextField label={t('IVA')} type="number" value={i.vat ?? ''} onChange={e => set({ vat: num(e.target.value) })} sx={{ flex: 1 }} />
            <TextField label={t('Total')} type="number" value={i.total ?? ''} onChange={e => set({ total: num(e.target.value) })} sx={{ flex: 1 }}
              helperText={i.total == null && i.net != null ? t('Net plus IVA when left empty') : undefined} />
          </Stack>
          <TextField select label={t('Status')} value={i.status ?? 'to_check'} onChange={e => set({ status: e.target.value as InvoiceStatus })}>
            {INVOICE_STATUSES.filter(s => s.for.includes(i.direction ?? 'in')).map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
          </TextField>
          {i.status === 'paid' && <TextField label={t('Paid on')} type="date" value={i.paid_on ?? ''} onChange={e => set({ paid_on: e.target.value || null })} slotProps={{ inputLabel: { shrink: true } }} />}
          <TextField label={t('Notes')} value={i.notes ?? ''} multiline minRows={3} onChange={e => set({ notes: e.target.value })}
            helperText={t('What it’s for, a query with the supplier, how it was paid…')} />
          {i.email_from && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('From an email from {from}: “{subject}”', { from: i.email_from, subject: i.email_subject ?? '' })}</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        {i.id && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
