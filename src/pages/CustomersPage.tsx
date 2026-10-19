import {
  Alert, Autocomplete, Box, Button, Card, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, InputAdornment,
  Link, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
  useMediaQuery, useTheme,
} from '@mui/material'
import PersonAddIcon from '@mui/icons-material/PersonAddAlt'
import UploadIcon from '@mui/icons-material/UploadFileOutlined'
import SearchIcon from '@mui/icons-material/Search'
import ConsentIcon from '@mui/icons-material/MarkEmailReadOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import { useMemo, useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, StatGrid, StatTile, Tag } from '../components/common'
import { PhoneField } from '../components/PhoneField'
import { ExportButton, SortCell, useSort } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { EMAIL, SOURCES, customerName, decodeCsv, matchesSearch, readCustomersCsv, sourceLabel, withoutDuplicates, type CsvImport, type ImportField } from '../../shared/customers'
import type { Customer, CustomerInput, CustomerKind, CustomerSource } from '../../shared/types'
import { formatLocal, localDate, today, zonedIso } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t, tn } from '../i18n'

type Kind = 'all' | CustomerKind
const KINDS: { key: Kind; label: string }[] = [
  { key: 'all', label: msg('All') }, { key: 'customer', label: msg('Customers') }, { key: 'lead', label: msg('Leads') },
]
const KIND_TAG: Record<CustomerKind, { label: string; fg: string; bg: string }> = {
  customer: { label: msg('Customer'), fg: tokens.goodFg, bg: tokens.goodBg },
  lead: { label: msg('Lead'), fg: tokens.infoFg, bg: tokens.infoBg },
}

const SORT_BY: Record<string, (c: Customer) => string | number | null> = {
  name: c => customerName(c), kind: c => c.kind, email: c => c.email, phone: c => c.phone, company: c => c.company,
  source: c => t(sourceLabel(c.source)), tags: c => c.tags.join(', ') || null, consent: c => (c.marketing_consent ? 0 : 1),
  added: c => c.created_at,
}

/** Admins: the people the business sells to (customers) and hopes to (leads), for marketing. */
export function CustomersPage() {
  const { api } = useApp()
  const data = useAsync('customers', () => api.customers(), [])
  const [kind, setKind] = useState<Kind>('all')
  const [consentOnly, setConsentOnly] = useState(false)
  const [source, setSource] = useState<CustomerSource | ''>('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Customer | 'new' | null>(null)
  const [importing, setImporting] = useState(false)

  const all = useMemo(() => data.data ?? [], [data.data])
  const shown = all.filter(c => (kind === 'all' || c.kind === kind) && (!consentOnly || c.marketing_consent)
    && (!source || c.source === source) && matchesSearch(c, q))
  const { rows, sort } = useSort(shown, SORT_BY, undefined, ['added'])
  const count = (k: Kind) => (k === 'all' ? all.length : all.filter(c => c.kind === k).length)
  const month = today().slice(0, 7)
  const agreed = all.filter(c => c.marketing_consent).length
  const tags = [...new Set(all.flatMap(c => c.tags))].sort((a, b) => a.localeCompare(b))
  const filtered = kind !== 'all' || consentOnly || !!source || !!q.trim()

  const table = (): ExportTable => {
    const who = kind === 'customer' ? t('Customers') : kind === 'lead' ? t('Leads') : t('Customers and leads')
    const extra = [consentOnly ? t('Marketing OK') : '', source ? t(sourceLabel(source)) : '', q.trim() ? `“${q.trim()}”` : ''].filter(Boolean)
    return {
      title: extra.length ? `${who}: ${extra.join(', ')}` : who,
      filename: `${kind === 'customer' ? 'customers' : kind === 'lead' ? 'leads' : 'customers-and-leads'}${consentOnly ? '-marketing-ok' : ''}-${today()}`,
      columns: [t('First name'), t('Last name'), t('Type'), t('Email'), t('Phone'), t('Company'), t('Source'), t('Tags'), t('Marketing OK'),
        t('Birthday'), t('Notes'), t('Added')],
      rows: rows.map(c => [c.first_name ?? '', c.last_name ?? '', t(KIND_TAG[c.kind].label), c.email ?? '', c.phone ?? '', c.company ?? '',
        t(sourceLabel(c.source)), c.tags.join(', '), c.marketing_consent ? t('Yes') : t('No'), c.birthday ?? '', c.notes ?? '', localDate(c.created_at)]),
    }
  }

  const cell = { py: 1.25, borderColor: tokens.line } as const
  const hide = (from: 'sm' | 'md' | 'lg') => ({ display: { xs: 'none', [from]: 'table-cell' } })
  return (
    <>
      <PageHeader eyebrow={t('Business')} title={t('Customers')}
        actions={<>
          <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setOpen('new')}>{t('Add')}</Button>
          <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => setImporting(true)}>{t('Import')}</Button>
          <ExportButton table={table} disabled={!rows.length} folder="Customers" />
        </>} />
      <ErrorBox error={data.error} />

      <StatGrid>
        <StatTile label={t('Customers')} value={data.data ? count('customer') : '–'} note={t('people who buy')} />
        <StatTile label={t('Leads')} value={data.data ? count('lead') : '–'} note={t('people who might')} />
        <StatTile label={t('Agreed to marketing')} value={data.data ? agreed : '–'}
          note={all.length ? t('{pct}% of everyone', { pct: Math.round(agreed / all.length * 100) }) : undefined} />
        <StatTile label={t('Added this month')} value={data.data ? all.filter(c => localDate(c.created_at).startsWith(month)).length : '–'}
          note={formatLocal(new Date(), 'MMMM')} />
      </StatGrid>

      {data.data && all.length === 0 ? (
        <Empty>
          <Typography sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}>{t('Keep your customers and leads in one place')}</Typography>
          {t('Add regulars, people who asked about catering or an event, and businesses you’d like to work with (a hotel, an office, a gym). Tick who agreed to receive marketing, then export them for a newsletter or an offer. Have a list already? Import it from a CSV file.')}
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', mt: 2 }}>
            <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setOpen('new')}>{t('Add someone')}</Button>
            <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => setImporting(true)}>{t('Import a CSV')}</Button>
          </Stack>
        </Empty>
      ) : <>
        {/* Filters */}
        <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1.5, pb: 1.5, borderBottom: `1px solid ${tokens.line}` }}>
          <Stack direction="row" role="group" aria-label={t('Filter by type')} sx={{ gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
            {KINDS.map(k => (
              <Chip key={k.key} size="small" clickable label={`${t(k.label)} ${count(k.key)}`} onClick={() => setKind(k.key)} aria-pressed={kind === k.key}
                variant={kind === k.key ? 'filled' : 'outlined'} color={kind === k.key ? 'primary' : 'default'} />
            ))}
            <Chip size="small" clickable icon={<ConsentIcon />} label={t('Marketing OK')} onClick={() => setConsentOnly(v => !v)} aria-pressed={consentOnly}
              variant={consentOnly ? 'filled' : 'outlined'} color={consentOnly ? 'success' : 'default'} />
          </Stack>
          <Box sx={{ flex: 1 }} />
          <TextField select size="small" value={source} onChange={e => setSource(e.target.value as CustomerSource | '')} sx={{ minWidth: 160 }}
            slotProps={{ select: { displayEmpty: true, SelectDisplayProps: { 'aria-label': t('Source') } } }}>
            <MenuItem value="">{t('Every source')}</MenuItem>
            {SOURCES.map(s => <MenuItem key={s.key} value={s.key}>{t(s.label)}</MenuItem>)}
          </TextField>
          <TextField size="small" placeholder={t('Search name, email, phone, notes…')} value={q} onChange={e => setQ(e.target.value)} sx={{ width: { xs: '100%', sm: 280 } }}
            slotProps={{ htmlInput: { 'aria-label': t('Search customers') }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
        </Stack>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {filtered ? t('{n} of {total} shown', { n: rows.length, total: all.length }) : tn(all.length, '{n} person', '{n} people')}
        </Typography>

        <Card sx={{ overflow: 'hidden' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label={t('Customers')}>
              <TableHead>
                <TableRow>
                  <SortCell sort={sort} id="name">{t('Name')}</SortCell>
                  <SortCell sort={sort} id="kind">{t('Type')}</SortCell>
                  <SortCell sort={sort} id="email" sx={hide('sm')}>{t('Email')}</SortCell>
                  <SortCell sort={sort} id="phone" sx={hide('md')}>{t('Phone')}</SortCell>
                  <SortCell sort={sort} id="company" sx={hide('lg')}>{t('Company')}</SortCell>
                  <SortCell sort={sort} id="source" sx={hide('md')}>{t('Source')}</SortCell>
                  <SortCell sort={sort} id="tags" sx={hide('lg')}>{t('Tags')}</SortCell>
                  <SortCell sort={sort} id="consent">{t('Marketing OK')}</SortCell>
                  <SortCell sort={sort} id="added" sx={hide('sm')}>{t('Added')}</SortCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map(c => (
                  <TableRow key={c.id} hover onClick={() => setOpen(c)} tabIndex={0} aria-label={t('{name}: open details', { name: customerName(c) })}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(c) } }}
                    sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 }, '&:focus-visible': { outline: `2px solid ${tokens.roseDeep}`, outlineOffset: -2 } }}>
                    <TableCell sx={cell}>
                      <Typography sx={{ fontWeight: 500 }} noWrap>{customerName(c)}</Typography>
                      {/* On a phone, the columns that are hidden come under the name. */}
                      <Typography variant="body2" noWrap sx={{ color: 'text.secondary', display: { xs: 'block', lg: c.company && c.company !== customerName(c) ? 'block' : 'none' } }}>
                        {[c.company !== customerName(c) ? c.company : null, c.email ?? c.phone].filter(Boolean).join(' · ')}
                      </Typography>
                    </TableCell>
                    <TableCell sx={cell}><Tag fg={KIND_TAG[c.kind].fg} bg={KIND_TAG[c.kind].bg}>{t(KIND_TAG[c.kind].label)}</Tag></TableCell>
                    <TableCell sx={{ ...cell, ...hide('sm') }}>
                      {c.email ? <Link href={`mailto:${c.email}`} onClick={e => e.stopPropagation()} underline="hover">{c.email}</Link> : '—'}
                    </TableCell>
                    <TableCell sx={{ ...cell, ...hide('md'), whiteSpace: 'nowrap' }}>
                      {c.phone ? <Link href={`tel:${c.phone.replace(/\s/g, '')}`} onClick={e => e.stopPropagation()} underline="hover">{c.phone}</Link> : '—'}
                    </TableCell>
                    <TableCell sx={{ ...cell, ...hide('lg'), color: 'text.secondary' }}>{c.company ?? '—'}</TableCell>
                    <TableCell sx={{ ...cell, ...hide('md') }}>{t(sourceLabel(c.source))}</TableCell>
                    <TableCell sx={{ ...cell, ...hide('lg') }}>
                      <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>{c.tags.map(x => <Tag key={x}>{x}</Tag>)}</Stack>
                    </TableCell>
                    <TableCell sx={cell}>
                      {c.marketing_consent
                        ? <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: tokens.goodFg }}><ConsentIcon sx={{ fontSize: 18 }} /><span>{t('Yes')}</span></Stack>
                        : <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>{t('No')}</Typography>}
                    </TableCell>
                    <TableCell sx={{ ...cell, ...hide('sm'), color: 'text.secondary', whiteSpace: 'nowrap' }}>{formatLocal(c.created_at, 'd MMM yyyy')}</TableCell>
                  </TableRow>
                ))}
                {data.data && rows.length === 0 && (
                  <TableRow><TableCell colSpan={9} sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>{t('Nobody matches that.')}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </Card>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
          {t('Marketing OK: they agreed to receive offers and news from you. In Spain (GDPR) only send marketing to these people.')}
        </Typography>
      </>}

      {open && <CustomerDialog customer={open === 'new' ? null : open} tags={tags} onClose={() => setOpen(null)} />}
      {importing && <ImportDialog existing={all} onClose={() => setImporting(false)} />}
    </>
  )
}

const blank = (): CustomerInput => ({ kind: 'lead', first_name: '', last_name: '', email: '', phone: '', company: '', source: 'walk_in',
  instagram: '', birthday: null, tags: [], notes: '', marketing_consent: false, last_contacted_at: null })

/** Add or edit one person: every field, consent, and (editing) delete or make a lead a customer. */
function CustomerDialog({ customer, tags, onClose }: { customer: Customer | null; tags: string[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [c, setC] = useState<CustomerInput>(() => (customer ? { ...customer } : blank()))
  const [deleting, setDeleting] = useState(false)
  const set = (patch: Partial<CustomerInput>) => setC(x => ({ ...x, ...patch }))
  const name = customer ? customerName(customer) : ''

  const clean = (): CustomerInput => {
    const text = (v: string | null | undefined) => v?.trim() || null
    const out: CustomerInput = { ...c, first_name: text(c.first_name), last_name: text(c.last_name), email: text(c.email), phone: text(c.phone),
      company: text(c.company), instagram: text(c.instagram)?.replace(/^@/, '') ?? null, notes: text(c.notes), birthday: c.birthday || null }
    if (!out.first_name && !out.last_name && !out.email && !out.phone) throw new Error(t('Add a name, an email or a phone number'))
    if (out.email && !EMAIL.test(out.email)) throw new Error(t('Enter a full email address, like name@example.com'))
    if (out.instagram && !/^[A-Za-z0-9._]{1,30}$/.test(out.instagram)) throw new Error(t('An Instagram name has only letters, numbers, dots and underscores'))
    // Only what the app may write: the database keeps the dates itself.
    const { consent_at: _c, created_at: _a, updated_at: _u, ...row } = out as Customer
    return row
  }
  const typed = customerName({ first_name: c.first_name?.trim() || null, last_name: c.last_name?.trim() || null, company: c.company?.trim() || null,
    email: c.email?.trim() || null, phone: c.phone || null })
  const save = () => run(async () => { await api.saveCustomer(clean()); onClose() }, customer ? t('Saved') : t('Added {name}', { name: typed }))
  const makeCustomer = () => run(async () => { await api.saveCustomer({ ...clean(), kind: 'customer' }); onClose() }, t('{name} is now a customer', { name }))
  const remove = () => run(async () => { await api.deleteCustomer(customer!.id); onClose() }, t('Deleted {name}', { name }))

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle>{customer ? name : t('Add a customer or lead')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <ToggleButtonGroup exclusive fullWidth size="small" value={c.kind} aria-label={t('Type')} onChange={(_, v: CustomerKind | null) => v && set({ kind: v })}>
            <ToggleButton value="customer">{t('Customer')}</ToggleButton>
            <ToggleButton value="lead">{t('Lead')}</ToggleButton>
          </ToggleButtonGroup>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('First name')} value={c.first_name ?? ''} onChange={e => set({ first_name: e.target.value })} fullWidth autoFocus={!customer}
              slotProps={{ htmlInput: { maxLength: 100 } }} />
            <TextField label={t('Last name')} value={c.last_name ?? ''} onChange={e => set({ last_name: e.target.value })} fullWidth
              slotProps={{ htmlInput: { maxLength: 100 } }} />
          </Stack>
          <TextField label={t('Email')} type="email" value={c.email ?? ''} onChange={e => set({ email: e.target.value })} slotProps={{ htmlInput: { maxLength: 254 } }} />
          <PhoneField label={t('Phone')} value={c.phone ?? ''} onChange={v => set({ phone: v })} />
          <TextField label={t('Company (optional)')} value={c.company ?? ''} onChange={e => set({ company: e.target.value })}
            helperText={t('For a business you’d like to work with: a hotel, an office, a gym')} slotProps={{ htmlInput: { maxLength: 120 } }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('Where they came from')} value={c.source ?? 'walk_in'} onChange={e => set({ source: e.target.value as CustomerSource })} fullWidth>
              {SOURCES.map(s => <MenuItem key={s.key} value={s.key}>{t(s.label)}</MenuItem>)}
            </TextField>
            <TextField label={t('Instagram (optional)')} value={c.instagram ?? ''} onChange={e => set({ instagram: e.target.value })} fullWidth
              slotProps={{ input: { startAdornment: <InputAdornment position="start">@</InputAdornment> }, htmlInput: { maxLength: 31 } }} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Birthday (optional)')} type="date" value={c.birthday ?? ''} onChange={e => set({ birthday: e.target.value || null })} fullWidth
              helperText={t('For a birthday offer')} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: '1900-01-01', max: today() } }} />
            <TextField label={t('Last contacted')} type="date" fullWidth value={c.last_contacted_at ? localDate(c.last_contacted_at) : ''}
              onChange={e => set({ last_contacted_at: e.target.value ? zonedIso(e.target.value, '12:00') : null })}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today() } }} />
          </Stack>
          <Autocomplete multiple freeSolo options={tags} value={c.tags ?? []} filterSelectedOptions
            onChange={(_, v) => set({ tags: [...new Set(v.map(x => x.trim()).filter(Boolean))].slice(0, 20) })}
            renderValue={(value, getItemProps) => value.map((x, i) => { const { key, ...p } = getItemProps({ index: i }); return <Chip key={key} size="small" label={x} {...p} /> })}
            renderInput={params => <TextField {...params} label={t('Tags')} helperText={t('Type a tag and press Enter, e.g. regular or oat milk')} />} />
          <TextField label={t('Notes')} value={c.notes ?? ''} onChange={e => set({ notes: e.target.value })} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 2000 } }} />

          {/* Consent stands out: in Spain (GDPR) marketing goes only to people who said yes. */}
          <Box sx={{ border: 1, borderRadius: 2, px: 1.5, py: 1, borderColor: c.marketing_consent ? tokens.matcha : 'divider', bgcolor: c.marketing_consent ? tokens.goodBg : 'transparent' }}>
            <FormControlLabel label={<Typography sx={{ fontWeight: 500 }}>{t('Agreed to receive marketing')}</Typography>}
              control={<Checkbox checked={!!c.marketing_consent} onChange={e => set({ marketing_consent: e.target.checked })} />} />
            <Typography variant="body2" sx={{ color: 'text.secondary', ml: 4 }}>
              {customer?.marketing_consent && c.marketing_consent && customer.consent_at
                ? t('They said yes on {date}. Untick it if they ask you to stop.', { date: formatLocal(customer.consent_at, 'd MMM yyyy') })
                : t('Tick only if they said yes to offers and news (GDPR). The date they agreed is kept.')}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {customer && (deleting ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 'auto' }}>
            <Typography variant="body2">{t('Delete {name}?', { name })}</Typography>
            <Button size="small" color="error" variant="contained" onClick={remove}>{t('Delete')}</Button>
            <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
          </Stack>
        ) : (
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleting(true)} sx={{ mr: 'auto' }}>{t('Delete')}</Button>
        ))}
        {customer?.kind === 'lead' && !deleting && <Button variant="outlined" onClick={makeCustomer}>{t('Mark as customer')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={save}>{customer ? t('Save') : t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}

const FIELD_LABELS: Record<ImportField, string> = {
  first_name: msg('First name'), last_name: msg('Last name'), full_name: msg('Name'), email: msg('Email'), phone: msg('Phone'),
  company: msg('Company'), notes: msg('Notes'), instagram: 'Instagram', birthday: msg('Birthday'), tags: msg('Tags'), consent: msg('Marketing OK'),
}

/** Bring in a list from a spreadsheet or another app: pick a CSV, check what was found, add them as leads or customers. */
function ImportDialog({ existing, onClose }: { existing: Customer[]; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<{ name: string; csv: CsvImport } | null>(null)
  const [kind, setKind] = useState<CustomerKind>('lead')
  const [source, setSource] = useState<CustomerSource>('other')
  const [problem, setProblem] = useState<string | null>(null)
  const { fresh, duplicates } = file ? withoutDuplicates(file.csv.rows, existing) : { fresh: [], duplicates: 0 }
  const used = file?.csv.columns.filter(c => c.field) ?? []
  const unused = file?.csv.columns.filter(c => !c.field && c.heading) ?? []
  const consentColumn = used.find(c => c.field === 'consent')

  const pick = async (f: File | undefined) => {
    if (!f) return
    setProblem(null)
    const csv = readCustomersCsv(decodeCsv(new Uint8Array(await f.arrayBuffer())))
    if (!csv.columns.some(c => c.field)) { setFile(null); setProblem(t('No columns we know in that file. The first line needs headings such as First name, Last name, Email or Phone.')); return }
    setFile({ name: f.name, csv })
  }
  const add = () => run(async () => {
    await api.importCustomers(fresh.map(r => ({ ...r, kind, source })))
    onClose()
  }, kind === 'lead' ? tn(fresh.length, '{n} lead added', '{n} leads added') : tn(fresh.length, '{n} customer added', '{n} customers added'))

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('Import from a CSV file')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('Save your list as CSV from Excel, Google Sheets or another app. The first line should name the columns, e.g. First name, Last name, Email, Phone, Company, Notes (in English or Spanish).')}
          </Typography>
          <Box>
            <input ref={input} type="file" hidden accept=".csv,text/csv" aria-label={t('CSV file')} onChange={e => { void pick(e.target.files?.[0]); e.target.value = '' }} />
            <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => input.current?.click()}>{file ? t('Choose another file') : t('Choose a CSV file')}</Button>
            {file && <Typography component="span" variant="body2" sx={{ ml: 1.5, color: 'text.secondary' }}>{file.name}</Typography>}
          </Box>
          {problem && <Alert severity="warning">{problem}</Alert>}
          {file && <>
            <Alert severity={fresh.length ? 'success' : 'info'} role="status">
              <b>{tn(fresh.length, '{n} new person to add', '{n} new people to add')}</b>
              {duplicates > 0 && <Box>{tn(duplicates, '{n} is already on your list (same email or phone): left out.', '{n} are already on your list (same email or phone): left out.')}</Box>}
              {file.csv.skipped > 0 && <Box>{tn(file.csv.skipped, '{n} line has no name, email or phone: left out.', '{n} lines have no name, email or phone: left out.')}</Box>}
            </Alert>
            <Box>
              <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('Columns found')}</Typography>
              <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
                {used.map(c => <Chip key={c.heading} size="small" label={`${c.heading} → ${t(FIELD_LABELS[c.field!])}`} />)}
              </Stack>
              {unused.length > 0 && (
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>{t('Not used: {columns}', { columns: unused.map(c => c.heading).join(', ') })}</Typography>
              )}
            </Box>
            {fresh.length > 0 && (
              <Table size="small" aria-label={t('First people in the file')}>
                <TableHead><TableRow><TableCell>{t('Name')}</TableCell><TableCell>{t('Email')}</TableCell><TableCell>{t('Phone')}</TableCell></TableRow></TableHead>
                <TableBody>
                  {fresh.slice(0, 5).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{[r.first_name, r.last_name].filter(Boolean).join(' ') || r.company || '—'}</TableCell>
                      <TableCell>{r.email ?? '—'}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{r.phone ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
              <ToggleButtonGroup exclusive size="small" value={kind} aria-label={t('Add them as')} onChange={(_, v: CustomerKind | null) => v && setKind(v)}>
                <ToggleButton value="lead">{t('Leads')}</ToggleButton>
                <ToggleButton value="customer">{t('Customers')}</ToggleButton>
              </ToggleButtonGroup>
              <TextField select size="small" label={t('Where they came from')} value={source} onChange={e => setSource(e.target.value as CustomerSource)} sx={{ minWidth: 200 }}>
                {SOURCES.map(s => <MenuItem key={s.key} value={s.key}>{t(s.label)}</MenuItem>)}
              </TextField>
            </Stack>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {consentColumn
                ? t('Marketing OK comes from the “{column}” column. Only mark people who really agreed.', { column: consentColumn.heading })
                : t('Nobody is marked Marketing OK: tick it for each person who agreed to receive offers.')}
            </Typography>
          </>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!fresh.length} onClick={add}>
          {kind === 'lead' ? tn(fresh.length, 'Add {n} lead', 'Add {n} leads') : tn(fresh.length, 'Add {n} customer', 'Add {n} customers')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
