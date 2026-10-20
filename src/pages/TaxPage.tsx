import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, LinearProgress,
  Link, MenuItem, Radio, RadioGroup, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import UploadIcon from '@mui/icons-material/CloudUploadOutlined'
import FolderIcon from '@mui/icons-material/FolderOutlined'
import NewFolderIcon from '@mui/icons-material/CreateNewFolderOutlined'
import OpenIcon from '@mui/icons-material/OpenInNew'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import MailIcon from '@mui/icons-material/MailOutlined'
import CloseIcon from '@mui/icons-material/Close'
import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { formatLocal, formatMoney, today } from '../../shared/time'
import {
  DEFAULT_TAX_SETTINGS, DOC_KINDS, FILING_STATUSES, autoFolder, daysBetween, filingKey, filingsFor, guessKind, guessPeriod, kindInfo, overdue,
  quarterOf, taxFileProblem, upcoming, type Filing, type FilingRecord, type FilingStatus, type Quarter, type TaxDocKind, type TaxDocument, type TaxSettings,
} from '../../shared/tax'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

const day = (d: string) => formatLocal(`${d}T12:00:00Z`, 'd MMM yyyy')
const periodLabel = (p: string) => (p === '0A' ? t('Year') : p.endsWith('T') ? t('Q{n}', { n: p[0] }) : t('Instalment {n}', { n: p[0] }))
const quarterLabel = (q: Quarter | null) => (q ? t('Q{n}', { n: q }) : t('Whole year'))
const STATUS_TONE: Record<FilingStatus, { fg: string; bg: string }> = {
  to_do: { fg: tokens.warnFg, bg: tokens.warnBg }, with_gestor: { fg: tokens.infoFg, bg: tokens.infoBg },
  filed: { fg: tokens.goodFg, bg: tokens.goodBg }, not_needed: { fg: tokens.neutralFg, bg: tokens.neutralBg },
}
const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/**
 * Tax: the returns due this year (worked out from what the business files), what's been done about
 * each, and the documents for them, uploaded in bulk into the café's own Google Drive or OneDrive.
 * Admins with pay access; a gestoría with finances access reads (the database enforces it too).
 */
export function TaxPage() {
  const { canSeeFinances, isPartner, api } = useApp()
  const canEdit = canSeeFinances && !isPartner
  const [year, setYear] = useState(Number(today().slice(0, 4)))
  const [uploading, setUploading] = useState(false)
  const settings = useAsync('tax-settings', () => api.taxSettings(), [])
  const records = useAsync('tax-filings', () => api.taxFilings(year), [year])
  const docs = useAsync('tax-documents', () => api.taxDocuments(year), [year])
  const links = useAsync('integrations', () => (canEdit ? api.integrations() : Promise.resolve(null)), [canEdit])

  if (!canSeeFinances) {
    return <>
      <PageHeader eyebrow={t('Accounts')} title={t('Tax')} />
      <Alert severity="info">{t('Tax is only visible to admins with pay access.')}</Alert>
    </>
  }

  const s = settings.data ?? DEFAULT_TAX_SETTINGS
  const filings = filingsFor(year, s)
  const done = records.data ?? []
  const now = today()
  const next = upcoming(filings, done, now)[0]
  const late = overdue(filings, done, now)
  const storage = links.data?.integrations.find(i => (i.provider === 'google_drive' || i.provider === 'onedrive') && i.status === 'connected')
  const storageName = storage?.provider === 'onedrive' ? 'OneDrive' : 'Google Drive'
  const thisQuarter = Number(now.slice(0, 4)) === year ? quarterOf(now) : null
  const all = docs.data ?? []
  const years = [...new Set([Number(now.slice(0, 4)) + 1, Number(now.slice(0, 4)), Number(now.slice(0, 4)) - 1, Number(now.slice(0, 4)) - 2, year])].sort((a, b) => b - a)

  return (
    <>
      <PageHeader eyebrow={t('Accounts')} title={t('Tax')} actions={<>
        {!canEdit && <Tag>{t('Read-only')}</Tag>}
        <TextField select size="small" label={t('Tax year')} value={year} onChange={e => setYear(Number(e.target.value))} sx={{ minWidth: 120 }}>
          {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
        </TextField>
        {canEdit && <Button variant="contained" startIcon={<UploadIcon />} onClick={() => setUploading(true)}>{t('Upload documents')}</Button>}
      </>} />
      <ErrorBox error={settings.error ?? records.error ?? docs.error} />

      <StatGrid>
        <StatTile label={t('Next return')} value={next ? `${next.model} · ${periodLabel(next.period)}` : '–'}
          note={next ? t('By {date} · {days}', { date: day(next.due), days: tn(daysBetween(now, next.due), 'in {n} day', 'in {n} days') }) : t('Nothing due')} />
        <StatTile label={t('Overdue')} value={late.length} note={late.length ? t('Not marked filed') : t('All up to date')} />
        <StatTile label={t('Documents')} value={docs.data ? all.length : '–'}
          note={thisQuarter ? t('{n} this quarter', { n: all.filter(d => d.quarter === thisQuarter).length }) : t('For {year}', { year })} />
        <StatTile label={t('Kept in')} value={storage ? storageName : '–'} note={storage?.account_label ?? (canEdit ? t('Not connected') : undefined)} />
      </StatGrid>

      {late.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {t('Past their last day and not marked filed: {list}. Mark them filed (or not needed) once done.', { list: late.map(f => `${f.model} ${periodLabel(f.period)}`).join(', ') })}
        </Alert>
      )}
      {canEdit && links.data && !storage && (
        <Alert severity="info" sx={{ mb: 3 }} action={<Button component={RouterLink} to="/connections" color="inherit">{t('Connections')}</Button>}>
          {t('Connect Google Drive or OneDrive to upload documents. They’re kept in your own storage, in its Business Agent › Tax folder.')}
        </Alert>
      )}

      <Calendar year={year} filings={filings} records={done} canEdit={canEdit} />
      <Documents year={year} docs={all} canEdit={canEdit} gestor={s.gestor_email} onUpload={() => setUploading(true)} />
      {canEdit && settings.data && <WhatYouFile settings={settings.data} />}
      {uploading && <UploadDialog year={year} known={all} onClose={() => setUploading(false)} />}
    </>
  )
}

/** The returns for the year, soonest first, with what's been done about each. */
function Calendar({ year, filings, records, canEdit }: { year: number; filings: Filing[]; records: FilingRecord[]; canEdit: boolean }) {
  const { api } = useApp()
  const run = useAction()
  const [editing, setEditing] = useState<FilingRecord | null>(null)
  const byKey = new Map(records.map(r => [filingKey(r), r]))
  const now = today()
  const recordOf = (f: Filing): FilingRecord => byKey.get(filingKey(f)) ?? { model: f.model, year: f.year, period: f.period, status: 'to_do', amount: null, filed_on: null, reference: null, notes: null }
  const setStatus = (f: Filing, status: FilingStatus) => run(() => api.saveTaxFiling({ ...recordOf(f), status }), t('{model} {period}: {status}', { model: f.model, period: periodLabel(f.period), status: t(FILING_STATUSES.find(x => x.id === status)!.label) }))

  const table = (): ExportTable => ({
    title: t('Tax returns {year}', { year }),
    filename: `tax-returns-${year}`,
    columns: [t('Modelo'), t('Return'), t('Period'), t('Last day'), t('Status'), t('Amount'), t('Filed on'), t('Receipt number'), t('Notes')],
    rows: filings.map(f => {
      const r = recordOf(f)
      return [f.model, t(f.name), periodLabel(f.period), f.due, t(FILING_STATUSES.find(x => x.id === r.status)!.label), r.amount, r.filed_on ?? '', r.reference ?? '', r.notes ?? '']
    }),
    money: [5],
  })

  return (
    <Card component="section" aria-label={t('Tax returns')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={<ExportButton table={table} disabled={!filings.length} folder="Tax" />}>{t('Tax returns')}</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {t('What an SL files with the Agencia Tributaria, from what the business does (change it under What you file). A last day on a weekend moves to the Monday; paying by direct debit closes 5 days earlier.')}
        </Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>{t('Modelo')}</TableCell><TableCell>{t('Return')}</TableCell><TableCell>{t('Period')}</TableCell>
              <TableCell>{t('Last day')}</TableCell><TableCell>{t('Status')}</TableCell><TableCell align="right">{t('Amount')}</TableCell><TableCell />
            </TableRow></TableHead>
            <TableBody>
              {filings.map(f => {
                const r = recordOf(f)
                const open = r.status === 'to_do' || r.status === 'with_gestor'
                const days = daysBetween(now, f.due)
                return (
                  <TableRow key={filingKey(f)} hover>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{f.model === 'CCAA' ? t('Accounts') : f.model}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{t(f.name)}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t(f.what)}</Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{periodLabel(f.period)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {day(f.due)}
                      {open && days < 0 && <Box><Tag fg={tokens.badFg} bg={tokens.badBg}>{t('Overdue')}</Tag></Box>}
                      {open && days >= 0 && days <= 30 && <Box><Tag fg={tokens.warnFg} bg={tokens.warnBg}>{tn(days, 'in {n} day', 'in {n} days')}</Tag></Box>}
                    </TableCell>
                    <TableCell>
                      {canEdit
                        ? <TextField select size="small" value={r.status} onChange={e => void setStatus(f, e.target.value as FilingStatus)}
                            slotProps={{ htmlInput: { 'aria-label': t('Status of {model} {period}', { model: f.model, period: periodLabel(f.period) }) } }} sx={{ minWidth: 170 }}>
                            {FILING_STATUSES.map(x => <MenuItem key={x.id} value={x.id}>{t(x.label)}</MenuItem>)}
                          </TextField>
                        : <Tag {...STATUS_TONE[r.status]}>{t(FILING_STATUSES.find(x => x.id === r.status)!.label)}</Tag>}
                      {r.status === 'filed' && r.filed_on && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{t('Filed {date}', { date: day(r.filed_on) })}</Typography>}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{r.amount === null ? '' : formatMoney(r.amount)}</TableCell>
                    <TableCell align="right">
                      {canEdit && <IconButton size="small" aria-label={t('Edit {model} {period}', { model: f.model, period: periodLabel(f.period) })} onClick={() => setEditing(r)}><EditIcon fontSize="small" /></IconButton>}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
      {editing && <FilingDialog record={editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}

/** A return's details: status, the amount filed, the day and AEAT's receipt number. */
function FilingDialog({ record, onClose }: { record: FilingRecord; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [r, setR] = useState(record)
  const save = async () => {
    const amount = r.amount === null || Number.isNaN(Number(r.amount)) ? null : Number(r.amount)
    if (await run(() => api.saveTaxFiling({ ...r, amount }), t('Saved'))) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="filing-title">
      <DialogTitle id="filing-title">{t('Modelo {model} · {period}', { model: record.model, period: periodLabel(record.period) })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label={t('Status')} value={r.status} onChange={e => setR({ ...r, status: e.target.value as FilingStatus })}>
            {FILING_STATUSES.map(x => <MenuItem key={x.id} value={x.id}>{t(x.label)}</MenuItem>)}
          </TextField>
          <TextField label={t('Amount')} type="number" value={r.amount ?? ''} helperText={t('To pay, or with a minus to get back')}
            onChange={e => setR({ ...r, amount: e.target.value === '' ? null : Number(e.target.value) })} />
          <TextField label={t('Filed on')} type="date" value={r.filed_on ?? ''} onChange={e => setR({ ...r, filed_on: e.target.value || null })}
            slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label={t('Receipt number')} value={r.reference ?? ''} helperText={t('The número de justificante or CSV on AEAT’s receipt')}
            onChange={e => setR({ ...r, reference: e.target.value })} />
          <TextField label={t('Notes')} value={r.notes ?? ''} multiline minRows={2} onChange={e => setR({ ...r, notes: e.target.value })} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** The documents kept for the year, by quarter and kind, with links to them in Drive or OneDrive. */
function Documents({ year, docs, canEdit, gestor, onUpload }: { year: number; docs: TaxDocument[]; canEdit: boolean; gestor: string | null; onUpload: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [quarter, setQuarter] = useState<'all' | Quarter | 0>('all')
  const [kind, setKind] = useState<'all' | TaxDocKind>('all')
  const [editing, setEditing] = useState<TaxDocument | null>(null)
  const shown = docs.filter(d => (quarter === 'all' || (d.quarter ?? 0) === quarter) && (kind === 'all' || d.kind === kind))
  const periodOf = quarter === 'all' ? String(year) : quarter === 0 ? t('{year}, whole year', { year }) : t('Q{n} {year}', { n: quarter, year })

  const openFolder = () => run(async () => {
    const { link } = await api.taxFolders(quarter === 'all' || quarter === 0 ? ['Tax', String(year)] : ['Tax', String(year), `Q${quarter}`])
    if (link) window.open(link, '_blank', 'noopener')
  })
  // An email to the gestoría with every document shown, each with its link (opens in the person's own email app).
  const mailto = () => {
    const subject = t('Documents for {period}', { period: periodOf })
    const lines = shown.map(d => `• ${d.name} (${t(kindInfo(d.kind).label)})${d.link ? `\n  ${d.link}` : ''}`)
    const body = [t('Hello,'), '', t('Here are the documents for {period}:', { period: periodOf }), '', ...lines, '', t('Thank you')].join('\n')
    return `mailto:${encodeURIComponent(gestor ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  const table = (): ExportTable => ({
    title: t('Tax documents: {period}', { period: periodOf }),
    filename: `tax-documents-${year}${quarter === 'all' ? '' : `-${quarter ? `Q${quarter}` : 'year'}`}`,
    columns: [t('Document'), t('Kind'), t('Period'), t('Folder'), t('Size'), t('Added'), t('Link')],
    rows: shown.map(d => [d.name, t(kindInfo(d.kind).label), `${quarterLabel(d.quarter)} ${d.year}`, d.folder.join(' / '), sizeLabel(d.size), d.uploaded_at.slice(0, 10), d.link ?? '']),
  })

  return (
    <Card component="section" aria-label={t('Documents')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={<Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {canEdit && <Button startIcon={<FolderIcon />} onClick={() => void openFolder()}>{t('Open folder')}</Button>}
          {gestor && shown.length > 0 && <Button startIcon={<MailIcon />} href={mailto()}>{t('Email the gestoría')}</Button>}
          <ExportButton table={table} disabled={!shown.length} folder="Tax" />
        </Stack>}>{t('Documents')}</SectionTitle>

        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }} role="group" aria-label={t('Quarter')}>
          {(['all', 1, 2, 3, 4, 0] as const).map(q => (
            <Chip key={q} label={q === 'all' ? t('All') : quarterLabel(q || null)} color={quarter === q ? 'primary' : 'default'}
              variant={quarter === q ? 'filled' : 'outlined'} onClick={() => setQuarter(q)} aria-pressed={quarter === q} />
          ))}
          <TextField select size="small" label={t('Kind')} value={kind} onChange={e => setKind(e.target.value as typeof kind)} sx={{ minWidth: 190, ml: { sm: 'auto' } }}>
            <MenuItem value="all">{t('Every kind')}</MenuItem>
            {DOC_KINDS.map(k => <MenuItem key={k.id} value={k.id}>{t(k.label)}</MenuItem>)}
          </TextField>
        </Stack>

        {shown.length === 0
          ? <Empty>{docs.length ? t('No documents match.') : <>{t('No documents for {year} yet.', { year })}{canEdit && <> <Link component="button" onClick={onUpload}>{t('Upload some')}</Link></>}</>}</Empty>
          : <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell>{t('Document')}</TableCell><TableCell>{t('Kind')}</TableCell><TableCell>{t('Period')}</TableCell>
                  <TableCell>{t('Folder')}</TableCell><TableCell align="right">{t('Size')}</TableCell><TableCell />
                </TableRow></TableHead>
                <TableBody>
                  {shown.map(d => (
                    <TableRow key={d.id} hover>
                      <TableCell sx={{ maxWidth: 320, overflowWrap: 'anywhere' }}>
                        {d.link ? <Link href={d.link} target="_blank" rel="noopener">{d.name}</Link> : d.name}
                      </TableCell>
                      <TableCell>{t(kindInfo(d.kind).label)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{quarterLabel(d.quarter)}</TableCell>
                      <TableCell><Typography variant="caption" sx={{ color: 'text.secondary' }}>{d.folder.slice(1).join(' › ')}</Typography></TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{sizeLabel(d.size)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {d.link && <IconButton size="small" component="a" href={d.link} target="_blank" rel="noopener" aria-label={t('Open {name}', { name: d.name })}><OpenIcon fontSize="small" /></IconButton>}
                        {canEdit && <IconButton size="small" aria-label={t('Edit {name}', { name: d.name })} onClick={() => setEditing(d)}><EditIcon fontSize="small" /></IconButton>}
                        {canEdit && <IconButton size="small" aria-label={t('Remove {name} from the list', { name: d.name })}
                          onClick={() => void run(() => api.removeTaxDocument(d.id), t('Taken off the list. The file is still in your storage.'))}><DeleteIcon fontSize="small" /></IconButton>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>}
      </CardContent>
      {editing && <DocumentDialog doc={editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}

/** What a document is and when it's for (where the file is doesn't change). */
function DocumentDialog({ doc, onClose }: { doc: TaxDocument; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [kind, setKind] = useState(doc.kind)
  const [period, setPeriod] = useState(`${doc.year}-${doc.quarter ?? 0}`)
  const [notes, setNotes] = useState(doc.notes ?? '')
  const save = async () => {
    const [y, q] = period.split('-').map(Number)
    if (await run(() => api.updateTaxDocument(doc.id, { kind, year: y, quarter: (q || null) as Quarter | null, notes }), t('Saved'))) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="doc-title">
      <DialogTitle id="doc-title" sx={{ overflowWrap: 'anywhere' }}>{doc.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <KindField value={kind} onChange={setKind} />
          <PeriodField year={doc.year} value={period} onChange={setPeriod} />
          <TextField label={t('Notes')} value={notes} multiline minRows={2} onChange={e => setNotes(e.target.value)} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('The file stays where it is: {folder}', { folder: doc.folder.join(' › ') })}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

function KindField({ value, onChange, label = t('Kind'), size }: { value: TaxDocKind; onChange: (k: TaxDocKind) => void; label?: string; size?: 'small' }) {
  return (
    <TextField select size={size} label={label} value={value} onChange={e => onChange(e.target.value as TaxDocKind)} sx={{ minWidth: 170 }}>
      {DOC_KINDS.map(k => <MenuItem key={k.id} value={k.id}>{t(k.label)}</MenuItem>)}
    </TextField>
  )
}

/** "2026-3": a year's quarter, or "2026-0" for the whole year; the year before and after are offered too. */
function PeriodField({ year, value, onChange, label = t('Period'), size }: { year: number; value: string; onChange: (v: string) => void; label?: string; size?: 'small' }) {
  const options = [year - 1, year, year + 1].flatMap(y => [1, 2, 3, 4, 0].map(q => ({ v: `${y}-${q}`, label: `${quarterLabel((q || null) as Quarter | null)} ${y}` })))
  if (!options.some(o => o.v === value)) options.unshift({ v: value, label: value })
  return (
    <TextField select size={size} label={label} value={value} onChange={e => onChange(e.target.value)} sx={{ minWidth: 140 }}>
      {options.map(o => <MenuItem key={o.v} value={o.v}>{o.label}</MenuItem>)}
    </TextField>
  )
}

/** The switches that decide which returns are listed, and the gestoría's email. */
function WhatYouFile({ settings }: { settings: TaxSettings }) {
  const { api } = useApp()
  const run = useAction()
  const [email, setEmail] = useState(settings.gestor_email ?? '')
  const toggle = (k: keyof Omit<TaxSettings, 'gestor_email'>, on: boolean) => run(() => api.saveTaxSettings({ [k]: on }))
  const row = (k: keyof Omit<TaxSettings, 'gestor_email'>, label: string, hint: string) => (
    <FormControlLabel sx={{ alignItems: 'flex-start', m: 0, gap: 1 }}
      control={<Switch checked={settings[k]} onChange={e => void toggle(k, e.target.checked)} sx={{ mt: -0.5 }} />}
      label={<Box><Typography>{label}</Typography><Typography variant="body2" sx={{ color: 'text.secondary' }}>{hint}</Typography></Box>} />
  )
  return (
    <Card component="section" aria-label={t('What you file')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle>{t('What you file')}</SectionTitle>
        <Stack spacing={2}>
          {row('withholding', t('Staff or freelancers'), t('Income tax held back from payslips or invoices: modelos 111 and 190.'))}
          {row('rent', t('Rented premises'), t('Income tax held back from the rent: modelos 115 and 180.'))}
          {row('intra_eu', t('Trade with EU businesses'), t('Buying from or selling to businesses elsewhere in the EU: modelo 349.'))}
          {row('instalments', t('Corporate tax instalments'), t('From the second year, when the last corporate tax return had tax to pay: modelo 202.'))}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
            <TextField label={t('Gestoría’s email')} type="email" value={email} onChange={e => setEmail(e.target.value)} sx={{ flex: 1, maxWidth: 420 }}
              helperText={t('For “Email the gestoría” on the documents list.')} />
            <Button disabled={(settings.gestor_email ?? '') === email.trim().toLowerCase()}
              onClick={() => void run(() => api.saveTaxSettings({ gestor_email: email.trim() || null }), t('Saved'))}>{t('Save')}</Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------------------------
// Bulk upload
// ---------------------------------------------------------------------------------------------

interface Pending {
  key: string
  file: File
  kind: TaxDocKind
  /** "2026-3" (see PeriodField). */
  period: string
  sha256?: string
  state: 'checking' | 'ready' | 'duplicate' | 'refused' | 'uploading' | 'done' | 'failed'
  error?: string
}

const DEST_KEY = 'tax-upload-destination'
const remembered = (): { mode: 'auto' | 'folder'; path: string[] } => {
  try {
    const v = JSON.parse(localStorage.getItem(DEST_KEY) ?? 'null') as { mode?: string; path?: unknown }
    if (v && (v.mode === 'auto' || v.mode === 'folder') && Array.isArray(v.path) && v.path[0] === 'Tax') return { mode: v.mode, path: v.path as string[] }
  } catch { /* storage unavailable */ }
  return { mode: 'auto', path: ['Tax'] }
}

async function fingerprint(file: File) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
  return [...hash].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Every file in what was dropped, folders included (read one level at a time, as browsers hand them over). */
async function droppedFiles(e: DragEvent): Promise<File[]> {
  const entries = [...e.dataTransfer.items].map(i => i.webkitGetAsEntry?.()).filter((x): x is FileSystemEntry => !!x)
  if (!entries.length) return [...e.dataTransfer.files]
  const out: File[] = []
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) { out.push(await new Promise<File>((ok, fail) => (entry as FileSystemFileEntry).file(ok, fail))); return }
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((ok, fail) => reader.readEntries(ok, fail))
      if (!batch.length) break
      for (const child of batch) await walk(child)
    }
  }
  for (const entry of entries) await walk(entry)
  return out
}

/**
 * Upload many documents at once: choose files or a whole folder (or drop them), check what each one
 * is and which quarter it's for (guessed from its name), then send them to the café's Drive or
 * OneDrive, sorted into Tax/<year>/Q<n>/<kind> or into one folder chosen (or made) there.
 */
function UploadDialog({ year, known, onClose }: { year: number; known: TaxDocument[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [items, setItems] = useState<Pending[]>([])
  const [dest, setDest] = useState(remembered)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const files = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const set = (key: string, patch: Partial<Pending>) => setItems(list => list.map(x => (x.key === key ? { ...x, ...patch } : x)))

  const add = (list: File[]) => {
    const added: Pending[] = list.filter(f => !f.name.startsWith('.')).map(file => {
      const p = guessPeriod(file.name, file.lastModified)
      const problem = taxFileProblem(file.name, file.size)
      return { key: crypto.randomUUID(), file, kind: guessKind(file.name), period: `${p.year}-${p.quarter}`,
        state: problem ? 'refused' : 'checking', error: problem ? t(problem) : undefined }
    })
    setItems(prev => [...prev, ...added])
    // Fingerprints, so the same file isn't kept twice (in this batch, or already on the list).
    for (const x of added.filter(a => a.state === 'checking')) {
      void fingerprint(x.file).then(sha256 => setItems(list => {
        const twice = list.some(o => o.key !== x.key && o.sha256 === sha256)
        const kept = known.find(d => d.sha256 === sha256)
        return list.map(o => (o.key !== x.key ? o : { ...o, sha256, state: kept || twice ? 'duplicate' : 'ready',
          error: kept ? t('Already kept as “{name}”', { name: kept.name }) : twice ? t('The same file is in this upload twice') : undefined }))
      }), () => set(x.key, { state: 'refused', error: t('That file couldn’t be read') }))
    }
  }

  const ready = items.filter(x => x.state === 'ready' || x.state === 'failed')
  const finished = items.filter(x => x.state === 'done').length
  const target = (x: Pending) => {
    const [y, q] = x.period.split('-').map(Number)
    return { year: y, quarter: (q || null) as Quarter | null, folder: dest.mode === 'auto' ? autoFolder(x.kind, y, (q || null) as Quarter | null) : dest.path }
  }

  const upload = async () => {
    setBusy(true)
    try { localStorage.setItem(DEST_KEY, JSON.stringify(dest)) } catch { /* storage unavailable */ }
    const queue = [...ready]
    let kept = 0
    // Two at a time: quick on a good connection, gentle on a phone's.
    const worker = async () => {
      for (let x = queue.shift(); x; x = queue.shift()) {
        set(x.key, { state: 'uploading', error: undefined })
        try {
          await api.uploadTaxDocument(x.file, { name: x.file.name, kind: x.kind, sha256: x.sha256!, ...target(x) })
          set(x.key, { state: 'done' })
          kept++
        } catch (e) {
          set(x.key, { state: 'failed', error: e instanceof Error ? e.message : String(e) })
        }
      }
    }
    await Promise.all([worker(), worker()])
    setBusy(false)
    await run(async () => {}, kept ? tn(kept, '{n} document kept', '{n} documents kept') : undefined)
  }

  const stateTag: Record<Pending['state'], ReactNode> = {
    checking: <Tag>{t('Checking…')}</Tag>, ready: <Tag fg={tokens.infoFg} bg={tokens.infoBg}>{t('Ready')}</Tag>,
    duplicate: <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Already kept')}</Tag>, refused: <Tag fg={tokens.badFg} bg={tokens.badBg}>{t('Not taken')}</Tag>,
    uploading: <Tag fg={tokens.infoFg} bg={tokens.infoBg}>{t('Uploading…')}</Tag>, done: <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Kept')}</Tag>,
    failed: <Tag fg={tokens.badFg} bg={tokens.badBg}>{t('Didn’t upload')}</Tag>,
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby="upload-title">
      <DialogTitle id="upload-title">{t('Upload documents')}</DialogTitle>
      <DialogContent>
        <Box onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); void droppedFiles(e).then(add) }}
          sx={{ border: '2px dashed', borderColor: over ? 'primary.main' : 'divider', borderRadius: 3, p: 3, textAlign: 'center', mb: 2,
            bgcolor: over ? 'action.hover' : 'transparent' }}>
          <Typography sx={{ mb: 1.5 }}>{t('Drop invoices, receipts, payslips or a whole folder here')}</Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button variant="outlined" onClick={() => files.current?.click()} disabled={busy}>{t('Choose files')}</Button>
            <Button variant="outlined" onClick={() => folderInput.current?.click()} disabled={busy}>{t('Choose a folder')}</Button>
          </Stack>
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1.5 }}>
            {t('PDFs, photos (JPEG, PNG, HEIC), spreadsheets, documents and e-invoices (XML), up to 25 MB each.')}
          </Typography>
          <input ref={files} type="file" multiple hidden onChange={e => { add([...(e.target.files ?? [])]); e.target.value = '' }} />
          <input ref={folderInput} type="file" multiple hidden {...{ webkitdirectory: '', directory: '' }}
            onChange={e => { add([...(e.target.files ?? [])]); e.target.value = '' }} />
        </Box>

        {items.length > 0 && (
          <Box sx={{ overflowX: 'auto', mb: 2 }}>
            <Table size="small" aria-label={t('Files to upload')}>
              <TableHead><TableRow>
                <TableCell>{t('File')}</TableCell><TableCell>{t('Kind')}</TableCell><TableCell>{t('Period')}</TableCell><TableCell /><TableCell />
              </TableRow></TableHead>
              <TableBody>
                {items.map(x => {
                  const locked = busy || x.state === 'done' || x.state === 'uploading'
                  return (
                    <TableRow key={x.key}>
                      <TableCell sx={{ maxWidth: 260, overflowWrap: 'anywhere' }}>
                        <Typography variant="body2">{x.file.name}</Typography>
                        <Typography variant="caption" sx={{ color: x.error ? tokens.badFg : 'text.secondary' }}>{x.error ?? sizeLabel(x.file.size)}</Typography>
                      </TableCell>
                      <TableCell>{locked || x.state === 'refused' ? t(kindInfo(x.kind).label)
                        : <KindField size="small" label={t('Kind of {name}', { name: x.file.name })} value={x.kind} onChange={kind => set(x.key, { kind })} />}</TableCell>
                      <TableCell>{locked || x.state === 'refused' ? x.period
                        : <PeriodField size="small" year={year} label={t('Period of {name}', { name: x.file.name })} value={x.period} onChange={period => set(x.key, { period })} />}</TableCell>
                      <TableCell>{stateTag[x.state]}</TableCell>
                      <TableCell align="right">
                        {!locked && <IconButton size="small" aria-label={t('Leave out {name}', { name: x.file.name })} onClick={() => setItems(l => l.filter(o => o.key !== x.key))}><CloseIcon fontSize="small" /></IconButton>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Box>
        )}

        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{t('Where they go')}</Typography>
        <RadioGroup value={dest.mode} onChange={e => setDest({ ...dest, mode: e.target.value as 'auto' | 'folder' })}>
          <FormControlLabel value="auto" control={<Radio />} disabled={busy}
            label={t('Sorted for me: Tax › year › quarter › kind (e.g. Tax › {year} › Q4 › Purchase invoices)', { year })} />
          <FormControlLabel value="folder" control={<Radio />} disabled={busy} label={t('All into one folder I choose')} />
        </RadioGroup>
        {dest.mode === 'folder' && <FolderPicker path={dest.path} onChange={path => setDest({ ...dest, path })} disabled={busy} />}

        {busy && <LinearProgress variant="determinate" value={items.length ? finished / items.filter(x => x.state !== 'refused' && x.state !== 'duplicate').length * 100 : 0}
          sx={{ mt: 2 }} aria-label={t('Upload progress')} />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{finished ? t('Done') : t('Cancel')}</Button>
        <Button variant="contained" startIcon={<UploadIcon />} disabled={busy || !ready.length || items.some(x => x.state === 'checking')} onClick={() => void upload()}>
          {ready.length ? tn(ready.length, 'Upload {n} document', 'Upload {n} documents') : t('Upload')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** Browse the folders under Business Agent › Tax in the café's Drive or OneDrive, and make new ones. */
function FolderPicker({ path, onChange, disabled }: { path: string[]; onChange: (p: string[]) => void; disabled?: boolean }) {
  const { api } = useApp()
  const run = useAction()
  const [name, setName] = useState('')
  const list = useAsync('tax-folders', () => api.taxFolders(path), [path.join('/')])
  const make = async () => {
    let made: string[] = []
    if (await run(async () => { made = await api.makeTaxFolder(path, name) }, t('Folder made'))) { setName(''); onChange(made) }
  }
  const where = list.data?.storage === 'onedrive' ? 'OneDrive' : 'Google Drive'
  return (
    <Box component="section" aria-label={t('Choose a folder')} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2, mt: 1 }}>
      <ErrorBox error={list.error} />
      <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', mb: 1 }} aria-label={t('Folder')}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{list.data ? `${where} ›` : ''} {'Business Agent'} ›</Typography>
        {path.map((p, i) => (
          <Stack key={i} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            {i > 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>›</Typography>}
            {i === path.length - 1
              ? <Typography variant="body2" sx={{ fontWeight: 600 }}>{p}</Typography>
              : <Link component="button" variant="body2" disabled={disabled} onClick={() => onChange(path.slice(0, i + 1))}>{p}</Link>}
          </Stack>
        ))}
        {list.data?.link && <Tooltip title={t('Open in {where}', { where })}>
          <IconButton size="small" component="a" href={list.data.link} target="_blank" rel="noopener" aria-label={t('Open in {where}', { where })}><OpenIcon fontSize="small" /></IconButton>
        </Tooltip>}
      </Stack>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 1.5 }} role="list" aria-label={t('Folders inside')}>
        {list.data?.folders.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('No folders inside yet.')}</Typography>}
        {list.data?.folders.map(f => (
          <Chip role="listitem" key={f} icon={<FolderIcon />} label={f} disabled={disabled} onClick={() => onChange([...path, f])} variant="outlined" />
        ))}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <TextField size="small" label={t('New folder')} value={name} onChange={e => setName(e.target.value)} disabled={disabled}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { e.preventDefault(); void make() } }} />
        <Button startIcon={<NewFolderIcon />} disabled={disabled || !name.trim()} onClick={() => void make()}>{t('Make folder')}</Button>
      </Stack>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
        {t('Files go into: {path}', { path: ['Business Agent', ...path].join(' › ') })}
      </Typography>
    </Box>
  )
}
