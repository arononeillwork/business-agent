import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Link, MenuItem, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import UploadIcon from '@mui/icons-material/CloudUploadOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import OpenIcon from '@mui/icons-material/OpenInNew'
import MailIcon from '@mui/icons-material/MailOutlined'
import PaidIcon from '@mui/icons-material/TaskAltOutlined'
import { useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import { Freshness } from '../components/Freshness'
import type { ExportTable } from '../lib/export'
import { formatLocal, formatMoney, today } from '../../shared/time'
import {
  INVOICE_STATUSES, bySupplier, dueFrom, isOpen, isOverdue, mainSuppliers, numberFromName,
  type InboxInvoice, type Invoice, type InvoiceDirection, type InvoiceInput, type InvoiceStatus,
} from '../../shared/invoices'
import type { Supplier } from '../../shared/stock'
import { UploadDialog } from './TaxPage'
import { tokens } from '../theme'
import { msg, t, tn } from '../i18n'

type Row = Invoice & { document?: { name: string; link: string | null } | null }
const day = (d: string | null) => (d ? formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy') : '')
const money = (n: number | null) => (n === null ? '' : formatMoney(n))
const statusLabel = (s: InvoiceStatus) => t(INVOICE_STATUSES.find(x => x.id === s)!.label)
const TONE: Record<InvoiceStatus, { fg: string; bg: string }> = {
  to_check: { fg: tokens.infoFg, bg: tokens.infoBg }, to_pay: { fg: tokens.warnFg, bg: tokens.warnBg }, paid: { fg: tokens.goodFg, bg: tokens.goodBg },
  disputed: { fg: tokens.badFg, bg: tokens.badBg }, sent: { fg: tokens.warnFg, bg: tokens.warnBg }, cancelled: { fg: tokens.neutralFg, bg: tokens.neutralBg },
}

/** The status chips over the list: what each shows, and for invoices received, sent or both. */
type View = 'all' | 'open' | 'overdue' | 'to_check' | 'paid'
const VIEWS: { id: View; label: string; for: InvoiceDirection[]; shows: (i: Invoice, today: string) => boolean }[] = [
  { id: 'all', label: msg('All'), for: ['in', 'out'], shows: () => true },
  { id: 'open', label: msg('Not paid yet'), for: ['in', 'out'], shows: i => isOpen(i) },
  { id: 'overdue', label: msg('Overdue'), for: ['in', 'out'], shows: (i, today) => isOverdue(i, today) },
  { id: 'to_check', label: msg('To check'), for: ['in'], shows: i => i.status === 'to_check' },
  { id: 'paid', label: msg('Paid'), for: ['in', 'out'], shows: i => i.status === 'paid' },
]
const short = (d: string) => formatLocal(`${d}T12:00:00Z`, 'd MMM')
/** An invoice's status in a few words, and its colour: overdue since when, due when, paid when. */
function statusOf(i: Invoice, today: string): { text: string; tone: { fg: string; bg: string } } {
  if (isOverdue(i, today)) return { text: t('Overdue since {date}', { date: short(i.due_on!) }), tone: TONE.disputed }
  if (i.status === 'paid') return { text: i.paid_on ? t('Paid {date}', { date: short(i.paid_on) }) : statusLabel(i.status), tone: TONE.paid }
  if ((i.status === 'to_pay' || i.status === 'sent') && i.due_on) return { text: t('Due {date}', { date: short(i.due_on) }), tone: TONE[i.status] }
  return { text: statusLabel(i.status), tone: TONE[i.status] }
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
  const [status, setStatus] = useState<View>('all')
  // From a supplier on Stock → Suppliers (its Invoices link): /invoices?supplier=<id> opens its invoices, and its emails.
  const [params, setParams] = useSearchParams()
  const [supplier, setSupplierNow] = useState<string>(params.get('supplier') || 'all')
  const setSupplier = (id: string) => {
    setSupplierNow(id)
    setParams(p => { const n = new URLSearchParams(p); if (id === 'all' || id === 'none') n.delete('supplier'); else n.set('supplier', id); return n }, { replace: true })
  }
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
  // The invoices received (or sent) from the supplier picked; then those with the status picked, newest first.
  const theirs = all.filter(i => i.direction === direction && (supplier === 'all' || (supplier === 'none' ? !i.supplier_id : i.supplier_id === supplier)))
  const views = VIEWS.filter(v => v.for.includes(direction)).map(v => ({ ...v, count: theirs.filter(i => v.shows(i, now)).length }))
  const shown = theirs.filter(i => (VIEWS.find(v => v.id === status) ?? VIEWS[0]).shows(i, now))
    .sort((a, b) => (b.issued_on ?? '9999').localeCompare(a.issued_on ?? '9999'))
  const months = shown.reduce<{ key: string; label: string; invoices: Row[] }[]>((out, i) => {
    const key = i.issued_on?.slice(0, 7) ?? ''
    const last = out[out.length - 1]
    if (last?.key === key) last.invoices.push(i)
    else out.push({ key, label: key ? formatLocal(`${key}-15T12:00:00Z`, 'MMMM yyyy') : t('No date yet'), invoices: [i] })
    return out
  }, [])

  const table = (): ExportTable => ({
    title: direction === 'in' ? t('Invoices received') : t('Invoices sent'),
    filename: `invoices-${direction === 'in' ? 'received' : 'sent'}-${now}`,
    columns: [t('Date'), direction === 'in' ? t('Supplier') : t('Customer'), t('Number'), t('Category'), t('Net'), t('VAT'), t('Total'), t('Due'), t('Status'), t('Paid on'), t('Notes'), t('File')],
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

      {/* The main suppliers (G&M Cash n Carry…) one press away: their invoices below and their emails under From email. */}
      {sups.length > 0 && (
        <Stack direction="row" role="group" aria-label={t('Main suppliers')} useFlexGap
          sx={{ gap: 0.75, mb: 2.5, alignItems: 'center', flexWrap: { xs: 'nowrap', md: 'wrap' }, overflowX: { xs: 'auto', md: 'visible' }, pb: { xs: 0.5, md: 0 } }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mr: 0.5, flexShrink: 0 }}>{t('Supplier')}</Typography>
          <Chip label={t('Every supplier')} aria-pressed={supplier === 'all'} onClick={() => setSupplier('all')} sx={{ flexShrink: 0 }}
            color={supplier === 'all' ? 'primary' : 'default'} variant={supplier === 'all' ? 'filled' : 'outlined'} />
          {mainSuppliers(sups, all).map(({ supplier: s, count }) => (
            <Chip key={s.id} aria-pressed={supplier === s.id} sx={{ flexShrink: 0 }}
              label={count ? <>{s.name} <Box component="span" sx={{ opacity: 0.7, ml: 0.25 }}>{count}</Box></> : s.name}
              color={supplier === s.id ? 'primary' : 'default'} variant={supplier === s.id ? 'filled' : 'outlined'}
              onClick={() => { setDirection('in'); setSupplier(supplier === s.id ? 'all' : s.id) }} />
          ))}
        </Stack>
      )}

      <Card component="section" aria-label={t('Invoices')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={<ExportButton table={table} disabled={!shown.length} folder="Invoices" />}>{t('Invoices')}</SectionTitle>
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, mb: 2, alignItems: 'center' }}>
            <Stack direction="row" spacing={1} role="group" aria-label={t('Received or sent')}>
              {(['in', 'out'] as const).map(d => (
                <Chip key={d} label={d === 'in' ? t('Received') : t('Sent')} color={direction === d ? 'primary' : 'default'} variant={direction === d ? 'filled' : 'outlined'}
                  aria-pressed={direction === d} onClick={() => { setDirection(d); setStatus('all') }} />
              ))}
            </Stack>
            <Box sx={{ width: '1px', alignSelf: 'stretch', bgcolor: tokens.line, mx: 0.5, display: { xs: 'none', sm: 'block' } }} />
            {/* What's to do at a glance: each with how many, for the supplier picked. */}
            <Stack direction="row" role="group" aria-label={t('Status')} useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap' }}>
              {views.map(v => (
                <Chip key={v.id} aria-pressed={status === v.id} onClick={() => setStatus(v.id)} variant={status === v.id ? 'filled' : 'outlined'}
                  color={status === v.id ? (v.id === 'overdue' ? 'error' : 'primary') : 'default'}
                  label={<>{t(v.label)}<Box component="span" sx={{ opacity: 0.7, ml: 0.75 }}>{v.count}</Box></>} />
              ))}
            </Stack>
            {direction === 'in' && (
              <TextField select size="small" fullWidth={false} label={t('Supplier')} value={supplier} onChange={e => setSupplier(e.target.value)}
                sx={{ minWidth: 200, ml: { md: 'auto' } }}>
                <MenuItem value="all">{t('Every supplier')}</MenuItem>
                {sups.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
                <MenuItem value="none">{t('Not matched to a supplier')}</MenuItem>
              </TextField>
            )}
          </Stack>
          {shown.length === 0
            ? <Empty>{list.data ? t('No invoices here yet.') : t('Loading…')}</Empty>
            : <Stack spacing={2.5}>
                {/* By month, newest first, each with what it comes to. */}
                {months.map(m => (
                  <Box key={m.key}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', px: 0.5, mb: 0.75 }}>
                      <Typography variant="overline" component="h3" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>{m.label}</Typography>
                      <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.6, fontVariantNumeric: 'tabular-nums' }}>
                        {tn(m.invoices.length, '{n} invoice', '{n} invoices')} · {formatMoney(sum(m.invoices))}
                      </Typography>
                    </Stack>
                    <Box component="ul" aria-label={m.label} sx={{ m: 0, p: 0, listStyle: 'none', border: `1px solid ${tokens.line}`, borderRadius: 2.5, overflow: 'hidden' }}>
                      {m.invoices.map(i => (
                        <InvoiceRow key={i.id} invoice={i} name={nameOf(i)} now={now} canEdit={canEdit} onOpen={() => setEditing(i)}
                          onPaid={() => void run(() => api.saveInvoice({ id: i.id, status: 'paid', paid_on: now }), t('{invoice}: paid', { invoice: i.number ?? nameOf(i) }))} />
                      ))}
                    </Box>
                  </Box>
                ))}
              </Stack>}
        </CardContent>
      </Card>

      {canEdit && <FromEmail suppliers={sups} only={sups.find(s => s.id === supplier) ?? null} onAll={() => setSupplier('all')} />}

      {direction === 'in' && <BySupplier invoices={all} suppliers={sups} onPick={setSupplier} />}

      {editing && <InvoiceDialog invoice={editing} suppliers={sups} onClose={() => setEditing(null)} />}
      {uploading && <UploadDialog year={Number(now.slice(0, 4))} known={docs.data ?? []} kind={direction === 'in' ? 'purchase_invoice' : 'sales_invoice'}
        title={t('Upload invoices')} onKept={kept} onClose={() => { setUploading(false); void run(async () => {}) }} />}
    </>
  )
}

/**
 * One invoice in the list: who from (or to), its date, number and what it's for; what it comes to and where it
 * stands; and, while it's to pay, marking it paid in one press. The rest is in the invoice (pressing the row).
 */
function InvoiceRow({ invoice: i, name, now, canEdit, onOpen, onPaid }: {
  invoice: Row; name: string; now: string; canEdit: boolean; onOpen: () => void; onPaid: () => void
}) {
  const st = statusOf(i, now)
  const what = i.number ?? name
  return (
    <Box component="li" aria-label={[name, i.number].filter(Boolean).join(' ')} onClick={canEdit ? onOpen : undefined}
      sx={{ display: 'flex', flexWrap: { xs: 'wrap', sm: 'nowrap' }, alignItems: 'center', columnGap: 2, rowGap: 1, px: 2, py: 1.5,
        borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 },
        ...(canEdit && { cursor: 'pointer', '&:hover': { bgcolor: tokens.surfaceAlt } }) }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{name}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {[i.issued_on ? short(i.issued_on) : t('No date yet'), i.number, i.category ? t(i.category) : null].filter(Boolean).join(' · ')}
        </Typography>
        {i.notes && <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.notes}</Typography>}
      </Box>
      <Stack sx={{ alignItems: 'flex-end', gap: 0.5, flexShrink: 0 }}>
        <Typography sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{money(i.total) || '—'}</Typography>
        <Tag fg={st.tone.fg} bg={st.tone.bg}>{st.text}</Tag>
      </Stack>
      <Stack direction="row" spacing={0.5} onClick={e => e.stopPropagation()}
        sx={{ alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0, width: { xs: '100%', sm: 'auto' }, minWidth: { sm: 172 } }}>
        {canEdit && isOpen(i) && (
          <Button size="small" variant="outlined" startIcon={<PaidIcon />} onClick={onPaid} sx={{ whiteSpace: 'nowrap' }} aria-label={t('Mark {invoice} paid', { invoice: what })}>{t('Mark paid')}</Button>
        )}
        {i.document?.link && (
          <Tooltip title={t('Open the file')}>
            <IconButton size="small" component="a" href={i.document.link} target="_blank" rel="noopener" aria-label={t('Open the file of {invoice}', { invoice: what })}><OpenIcon fontSize="small" /></IconButton>
          </Tooltip>
        )}
        {canEdit && <IconButton size="small" aria-label={t('Edit {invoice}', { invoice: what })} onClick={onOpen}><EditIcon fontSize="small" /></IconButton>}
      </Stack>
    </Box>
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
function FromEmail({ suppliers, only, onAll }: { suppliers: Supplier[]; only: Supplier | null; onAll: () => void }) {
  const { api } = useApp()
  const run = useAction()
  // One supplier's (from its email or invoice senders, or naming it) over the last year; everyone's over 60 days.
  const days = only ? 365 : 60
  const inbox = useAsync('invoice-inbox', () => api.invoiceInbox(days, only?.id), [days, only?.id])
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
        <SectionTitle action={<Stack direction="row" spacing={1}>
          {only && <Button onClick={onAll}>{t('Every supplier')}</Button>}
          {inbox.data?.can_read && waiting.some(m => supplierOf(m)) && (
            <Button startIcon={<MailIcon />} onClick={() => void bringMatched()}>{only ? t('Bring them all in') : t('Bring in all from known suppliers')}</Button>
          )}
        </Stack>}>{only ? t('From email: {name}', { name: only.name }) : t('From email')}</SectionTitle>
        {only && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1, mb: 1.5 }}>
            {(only.invoice_from?.length || only.email)
              ? t('Emails with files from {senders}, or naming {name}, over the last year.', { senders: [...new Set([only.email, ...(only.invoice_from ?? [])].filter(Boolean))].join(', '), name: only.name })
              : t('Emails with files naming {name}, over the last year. Add where its invoices come from on Suppliers to find them all.', { name: only.name })}
          </Typography>
        )}
        {inbox.data?.can_read && <Box sx={{ mt: -1, mb: 1.5 }}><Freshness id="mail" at={inbox.data.fetched_at} /></Box>}
        <ErrorBox error={inbox.error} />
        {inbox.data && !box && (
          <Alert severity="info" action={<Button component={RouterLink} to="/connections" color="inherit">{t('Connections')}</Button>}>
            {t('Connect Gmail or Outlook to bring in invoices that come by email.')}
          </Alert>
        )}
        {inbox.data && box && !inbox.data.can_read && (
          <Alert severity="info" action={<Button color="inherit" onClick={() => void run(() => api.connectService(box, 'invoices', { read: true }))}>{t('Allow reading')}</Button>}>
            {t('{mailbox} is connected to send email only. Allow The Business Agent to read it too, to find invoices from your suppliers. Nothing is changed or deleted in the mailbox.', { mailbox: boxName })}
          </Alert>
        )}
        {inbox.data?.can_read && (waiting.length === 0
          ? <Empty>{only ? t('No new invoices from {name} in {mailbox} over the last year.', { name: only.name, mailbox: boxName }) : t('No new invoices in {mailbox} from the last 60 days.', { mailbox: boxName })}</Empty>
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
            <TextField label={t('VAT')} type="number" value={i.vat ?? ''} onChange={e => set({ vat: num(e.target.value) })} sx={{ flex: 1 }} />
            <TextField label={t('Total')} type="number" value={i.total ?? ''} onChange={e => set({ total: num(e.target.value) })} sx={{ flex: 1 }}
              helperText={i.total == null && i.net != null ? t('Net plus VAT when left empty') : undefined} />
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
