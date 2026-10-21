import {
  Alert, Box, Breadcrumbs, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Link, MenuItem, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import UploadIcon from '@mui/icons-material/CloudUploadOutlined'
import FolderIcon from '@mui/icons-material/FolderOutlined'
import FileIcon from '@mui/icons-material/InsertDriveFileOutlined'
import NewFolderIcon from '@mui/icons-material/CreateNewFolderOutlined'
import OpenIcon from '@mui/icons-material/OpenInNew'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { formatLocal, today } from '../../shared/time'
import { DOC_KINDS, kindInfo, taxFileProblem, type TaxDocKind } from '../../shared/tax'
import {
  LINKED_TO, cleanTags, expiresSoon, expiryOf, filterDocuments, linkedTo, type DocumentFilter, type KeptDocument, type StorageEntry,
} from '../../shared/documents'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

type Storage = KeptDocument['storage']
const STORAGE_NAME: Record<Storage, string> = { google_drive: 'Google Drive', onedrive: 'OneDrive' }
const day = (d: string) => formatLocal(d.length === 10 ? `${d}T12:00:00Z` : d, 'd MMM yyyy')
const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const daysTo = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)
const where = (folder: string[]) => ['Business Agent', ...folder].join(' › ')

async function fingerprint(file: File) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
  return [...hash].map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Documents: every file the business keeps in its own Google Drive or OneDrive (the Tax page's,
 * invoices brought in by email, licences' documents, and contracts, insurance and certificates
 * kept here), with what each one belongs to and when it runs out; and a look inside the café's
 * Business Agent folder there, to open what's in it and upload into its Documents folder.
 * Admins with pay access; a gestoría with finances access reads the list (the database enforces it too).
 */
export function DocumentsPage() {
  const { canSeeFinances, isPartner, api } = useApp()
  const canEdit = canSeeFinances && !isPartner
  const docs = useAsync('documents', () => api.documents(), [])
  const links = useAsync('integrations', () => (canEdit ? api.integrations() : Promise.resolve(null)), [canEdit])

  if (!canSeeFinances) {
    return <>
      <PageHeader eyebrow={t('Business')} title={t('Documents')} />
      <Alert severity="info">{t('Documents are only visible to admins with pay access.')}</Alert>
    </>
  }

  const now = today()
  const all = docs.data ?? []
  const storage = links.data?.integrations.find(i => (i.provider === 'google_drive' || i.provider === 'onedrive') && i.status === 'connected')
  const soon = all.filter(d => expiresSoon(d, now)).sort((a, b) => expiryOf(a)!.localeCompare(expiryOf(b)!))
  const next = soon.find(d => expiryOf(d)! >= now)
  const thisMonth = all.filter(d => formatLocal(d.uploaded_at, 'yyyy-MM') === now.slice(0, 7)).length

  return (
    <>
      <PageHeader eyebrow={t('Business')} title={t('Documents')} actions={!canEdit && <Tag>{t('Read-only')}</Tag>} />
      <ErrorBox error={docs.error} />

      <StatGrid>
        <StatTile label={t('Documents')} value={docs.data ? all.length : '–'}
          note={t('{n} with an invoice or licence', { n: all.filter(d => d.invoices?.length || d.licences?.length).length })} />
        <StatTile label={t('Added this month')} value={docs.data ? thisMonth : '–'} note={formatLocal(`${now}T12:00:00Z`, 'MMMM yyyy')} />
        <StatTile label={t('Kept in')} value={storage ? STORAGE_NAME[storage.provider as Storage] : '–'}
          note={storage?.account_label ?? (canEdit ? t('Not connected') : undefined)} />
        <StatTile label={t('Run out soon')} value={docs.data ? soon.length : '–'}
          note={next ? t('Next: {name}, {date}', { name: next.title ?? next.name, date: day(expiryOf(next)!) }) : t('Within 60 days')} />
      </StatGrid>

      {canEdit && links.data && !storage && (
        <Alert severity="info" sx={{ mb: 3 }} action={<Button component={RouterLink} to="/connections" color="inherit">{t('Connections')}</Button>}>
          {t('Connect Google Drive or OneDrive to look inside it and upload documents. They’re kept in your own storage, in its Business Agent folder.')}
        </Alert>
      )}

      <AllDocuments docs={all} loaded={!!docs.data} canEdit={canEdit} now={now} />
      {canEdit && storage && <BrowseStorage known={all} />}
    </>
  )
}

function AllDocuments({ docs, loaded, canEdit, now }: { docs: KeptDocument[]; loaded: boolean; canEdit: boolean; now: string }) {
  const { api } = useApp()
  const run = useAction()
  const [filter, setFilter] = useState<DocumentFilter>({ q: '', kind: 'all', year: 'all', linked: 'all' })
  const [store, setStore] = useState<'all' | Storage>('all')
  const [editing, setEditing] = useState<KeptDocument | null>(null)
  const years = [...new Set(docs.map(d => d.year))].sort((a, b) => b - a)
  const stores = [...new Set(docs.map(d => d.storage))]
  const shown = filterDocuments(docs, filter).filter(d => store === 'all' || d.storage === store)
  const set = (patch: Partial<DocumentFilter>) => setFilter(f => ({ ...f, ...patch }))

  const belongsTo = (d: KeptDocument) => {
    const l = linkedTo(d)
    if (l === 'invoice') return d.invoices!.map(i => [t('Invoice {number}', { number: i.number ?? '' }).trim(), i.supplier?.name ?? i.party_name].filter(Boolean).join(', ')).join('; ')
    if (l === 'licence') return d.licences!.map(x => x.name).join('; ')
    return t(LINKED_TO.find(x => x.id === l)!.label)
  }
  const table = (): ExportTable => ({
    title: t('Documents'), filename: `documents-${now}`,
    columns: [t('Document'), t('Title'), t('Kind'), t('Year'), t('Belongs to'), t('Folder'), t('Tags'), t('Runs out'), t('Size'), t('Added'), t('Link')],
    rows: shown.map(d => [d.name, d.title ?? '', t(kindInfo(d.kind).label), d.year, belongsTo(d), d.folder.join(' / '), (d.tags ?? []).join(', '),
      expiryOf(d) ?? '', sizeLabel(d.size), d.uploaded_at.slice(0, 10), d.link ?? '']),
  })

  return (
    <Card component="section" aria-label={t('All documents')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={<ExportButton table={table} disabled={!shown.length} folder="Documents" />}>{t('All documents')}</SectionTitle>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mb: 2 }}>
          <TextField size="small" type="search" label={t('Search documents')} value={filter.q} onChange={e => set({ q: e.target.value })} sx={{ minWidth: 220, flex: 1 }} />
          <TextField select size="small" label={t('Kind')} value={filter.kind} onChange={e => set({ kind: e.target.value })} sx={{ minWidth: 170 }}>
            <MenuItem value="all">{t('Every kind')}</MenuItem>
            {DOC_KINDS.map(k => <MenuItem key={k.id} value={k.id}>{t(k.label)}</MenuItem>)}
          </TextField>
          <TextField select size="small" label={t('Year')} value={String(filter.year)} onChange={e => set({ year: e.target.value === 'all' ? 'all' : Number(e.target.value) })} sx={{ minWidth: 120 }}>
            <MenuItem value="all">{t('Every year')}</MenuItem>
            {years.map(y => <MenuItem key={y} value={String(y)}>{y}</MenuItem>)}
          </TextField>
          <TextField select size="small" label={t('Belongs to')} value={filter.linked} onChange={e => set({ linked: e.target.value as DocumentFilter['linked'] })} sx={{ minWidth: 160 }}>
            <MenuItem value="all">{t('Anything')}</MenuItem>
            {LINKED_TO.map(l => <MenuItem key={l.id} value={l.id}>{t(l.label)}</MenuItem>)}
          </TextField>
          {stores.length > 1 && (
            <TextField select size="small" label={t('Kept in')} value={store} onChange={e => setStore(e.target.value as typeof store)} sx={{ minWidth: 150 }}>
              <MenuItem value="all">{t('Anywhere')}</MenuItem>
              {stores.map(s => <MenuItem key={s} value={s}>{STORAGE_NAME[s]}</MenuItem>)}
            </TextField>
          )}
        </Stack>

        {shown.length === 0
          ? <Empty>{!loaded ? t('Loading…') : docs.length ? t('No documents match.') : t('No documents kept yet.')}</Empty>
          : <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label={t('All documents')}>
                <TableHead><TableRow>
                  <TableCell>{t('Document')}</TableCell><TableCell>{t('Kind')}</TableCell><TableCell>{t('Belongs to')}</TableCell>
                  <TableCell>{t('Folder')}</TableCell><TableCell>{t('Runs out')}</TableCell><TableCell align="right">{t('Added')}</TableCell><TableCell />
                </TableRow></TableHead>
                <TableBody>
                  {shown.map(d => {
                    const ends = expiryOf(d)
                    const left = ends ? daysTo(now, ends) : null
                    return (
                      <TableRow key={d.id} hover>
                        <TableCell sx={{ minWidth: 220, maxWidth: 340, overflowWrap: 'anywhere' }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{d.title ?? d.name}</Typography>
                          {d.title && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{d.name}</Typography>}
                          {!!d.tags?.length && (
                            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}>
                              {d.tags.map(tag => <Tag key={tag}>{tag}</Tag>)}
                            </Stack>
                          )}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{t(kindInfo(d.kind).label)}</TableCell>
                        <TableCell sx={{ minWidth: 150 }}><BelongsTo doc={d} /></TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{d.folder.join(' › ')}</Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {ends ? day(ends) : ''}
                          {left !== null && left < 0 && <Box><Tag fg={tokens.badFg} bg={tokens.badBg}>{t('Ran out')}</Tag></Box>}
                          {left !== null && left >= 0 && expiresSoon(d, now) && <Box><Tag fg={tokens.warnFg} bg={tokens.warnBg}>{tn(left, 'in {n} day', 'in {n} days')}</Tag></Box>}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{day(d.uploaded_at)}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {d.link && <IconButton size="small" component="a" href={d.link} target="_blank" rel="noopener" aria-label={t('Open {name}', { name: d.name })}><OpenIcon fontSize="small" /></IconButton>}
                          {canEdit && <IconButton size="small" aria-label={t('Edit {name}', { name: d.name })} onClick={() => setEditing(d)}><EditIcon fontSize="small" /></IconButton>}
                          {canEdit && <IconButton size="small" aria-label={t('Remove {name} from the list', { name: d.name })}
                            onClick={() => void run(() => api.removeTaxDocument(d.id), t('Taken off the list. The file is still in your storage.'))}><DeleteIcon fontSize="small" /></IconButton>}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Box>}
      </CardContent>
      {editing && <EditDialog doc={editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}

/** What a document belongs to, with a link to its page (the invoice's, the licence's, the Tax page). */
function BelongsTo({ doc }: { doc: KeptDocument }) {
  const l = linkedTo(doc)
  const caption = (text: string | null | undefined) => text && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{text}</Typography>
  if (l === 'invoice') {
    return <>{doc.invoices!.map(i => (
      <Box key={i.id}>
        <Link component={RouterLink} to="/invoices">{i.number ? t('Invoice {number}', { number: i.number }) : t('An invoice')}</Link>
        {caption(i.supplier?.name ?? i.party_name)}
      </Box>
    ))}</>
  }
  if (l === 'licence') return <>{doc.licences!.map(x => <Box key={x.id}><Link component={RouterLink} to="/licences">{x.name}</Link></Box>)}</>
  if (l === 'tax') return <Link component={RouterLink} to="/tax">{t('Tax papers')}</Link>
  return caption(t('Nothing else'))
}

/** A document's title, kind, year, tags, when it runs out and notes (where the file is doesn't change). */
function EditDialog({ doc, onClose }: { doc: KeptDocument; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [title, setTitle] = useState(doc.title ?? '')
  const [kind, setKind] = useState<TaxDocKind>(doc.kind)
  const [year, setYear] = useState(doc.year)
  const [tags, setTags] = useState((doc.tags ?? []).join(', '))
  const [expires, setExpires] = useState(doc.expires_on ?? '')
  const [notes, setNotes] = useState(doc.notes ?? '')
  const years = [...new Set([doc.year - 1, doc.year, doc.year + 1, Number(today().slice(0, 4))])].sort((a, b) => b - a)
  const save = async () => {
    if (await run(() => api.updateTaxDocument(doc.id, { title: title.trim() || null, kind, year, tags: cleanTags(tags), expires_on: expires || null, notes }), t('Saved'))) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="document-title">
      <DialogTitle id="document-title" sx={{ overflowWrap: 'anywhere' }}>{doc.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Title')} value={title} onChange={e => setTitle(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }}
            helperText={t('A name that says what it is, if the file’s doesn’t')} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('Kind')} value={kind} onChange={e => setKind(e.target.value as TaxDocKind)} sx={{ flex: 2 }}>
              {DOC_KINDS.map(k => <MenuItem key={k.id} value={k.id}>{t(k.label)}</MenuItem>)}
            </TextField>
            <TextField select label={t('Year')} value={year} onChange={e => setYear(Number(e.target.value))} sx={{ flex: 1 }}>
              {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField label={t('Tags')} value={tags} onChange={e => setTags(e.target.value)} helperText={t('Separated by commas')} />
          <TextField label={t('Runs out')} type="date" value={expires} onChange={e => setExpires(e.target.value)} slotProps={{ inputLabel: { shrink: true } }}
            helperText={doc.licences?.length && !expires ? t('Its licence’s date is used: {date}', { date: expiryOf(doc) ? day(expiryOf(doc)!) : '–' }) : undefined} />
          <TextField label={t('Notes')} value={notes} multiline minRows={2} onChange={e => setNotes(e.target.value)} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('The file stays where it is: {folder}', { folder: where(doc.folder) })}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Inside the café's Business Agent folder: its folders and files, opened in Drive or OneDrive; uploads and new folders go in Documents. */
function BrowseStorage({ known }: { known: KeptDocument[] }) {
  const { api } = useApp()
  const [path, setPath] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [naming, setNaming] = useState(false)
  const folder = useAsync('browse-files', () => api.browseFiles(path), [path.join('/')])
  const here = folder.data && folder.data.path.join('/') === path.join('/') ? folder.data : null
  const target = path[0] === 'Documents' ? path : ['Documents']
  const storageName = here ? STORAGE_NAME[here.storage] : ''
  const keptBy = useMemo(() => new Map(known.map(d => [d.id, d])), [known])

  return (
    <Card component="section" aria-label={t('Browse storage')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={<Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {here?.link && <Button startIcon={<OpenIcon />} href={here.link} target="_blank" rel="noopener">{t('Open in {app}', { app: storageName })}</Button>}
          <Button startIcon={<NewFolderIcon />} onClick={() => setNaming(true)}>{t('New folder')}</Button>
          <Button variant="contained" startIcon={<UploadIcon />} onClick={() => setUploading(true)}>{t('Upload documents')}</Button>
        </Stack>}>{t('Browse storage')}</SectionTitle>

        <Breadcrumbs aria-label={t('Where you are')} separator="›" sx={{ mb: 1 }}>
          {['Business Agent', ...path].map((name, i) => (i === path.length
            ? <Typography key={i} sx={{ color: 'text.primary', fontWeight: 500 }} aria-current="page">{name}</Typography>
            : <Link key={i} component="button" onClick={() => setPath(path.slice(0, i))}>{name}</Link>))}
        </Breadcrumbs>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 2 }}>
          {path[0] === 'Documents' ? t('Uploads and new folders go here.') : t('Uploads and new folders go into {folder}.', { folder: where(['Documents']) })}
        </Typography>

        <ErrorBox error={folder.error} />
        {!here
          ? <Empty>{folder.error ? '' : t('Loading…')}</Empty>
          : here.entries.length === 0
            ? <Empty>{t('Nothing in this folder yet.')}</Empty>
            : <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" aria-label={t('In this folder')}>
                  <TableHead><TableRow>
                    <TableCell>{t('Name')}</TableCell><TableCell align="right">{t('Size')}</TableCell><TableCell align="right">{t('Changed')}</TableCell><TableCell />
                  </TableRow></TableHead>
                  <TableBody>
                    {here.entries.map(e => <EntryRow key={e.id} entry={e} kept={e.kept_id ? keptBy.get(e.kept_id) : undefined} onOpenFolder={() => setPath([...path, e.name])} />)}
                  </TableBody>
                </Table>
              </Box>}
      </CardContent>
      {uploading && <UploadDialog folder={target} known={known} onClose={() => setUploading(false)} onDone={() => setPath(target)} />}
      {naming && <NewFolderDialog parent={target} onClose={() => setNaming(false)} onMade={made => { setNaming(false); setPath(made) }} />}
    </Card>
  )
}

function EntryRow({ entry: e, kept, onOpenFolder }: { entry: StorageEntry; kept?: KeptDocument; onOpenFolder: () => void }) {
  return (
    <TableRow hover>
      <TableCell sx={{ minWidth: 220, overflowWrap: 'anywhere' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {e.folder ? <FolderIcon fontSize="small" color="action" /> : <FileIcon fontSize="small" color="action" />}
          {e.folder
            ? <Link component="button" onClick={onOpenFolder} sx={{ textAlign: 'left' }}>{e.name}</Link>
            : e.link ? <Link href={e.link} target="_blank" rel="noopener">{e.name}</Link> : <span>{e.name}</span>}
          {e.kept_id && <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Kept')}</Tag>}
        </Stack>
        {kept?.title && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', pl: 3.5 }}>{kept.title}</Typography>}
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{e.size === null ? '' : sizeLabel(e.size)}</TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{e.modified ? day(e.modified) : ''}</TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        {!e.folder && e.link && <IconButton size="small" component="a" href={e.link} target="_blank" rel="noopener" aria-label={t('Open {name}', { name: e.name })}><OpenIcon fontSize="small" /></IconButton>}
      </TableCell>
    </TableRow>
  )
}

function NewFolderDialog({ parent, onClose, onMade }: { parent: string[]; onClose: () => void; onMade: (path: string[]) => void }) {
  const { api } = useApp()
  const run = useAction()
  const [name, setName] = useState('')
  const make = async () => {
    let made: string[] = []
    if (await run(async () => { made = await api.makeDocumentsFolder(parent, name) }, t('Folder made'))) onMade(made)
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="new-folder-title">
      <DialogTitle id="new-folder-title">{t('New folder')}</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth label={t('Name')} value={name} onChange={e => setName(e.target.value)} sx={{ mt: 1 }}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) void make() }} helperText={t('Inside {folder}', { folder: where(parent) })} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!name.trim()} onClick={() => void make()}>{t('Make folder')}</Button>
      </DialogActions>
    </Dialog>
  )
}

interface Pending { key: string; file: File; sha256?: string; state: 'checking' | 'ready' | 'refused' | 'duplicate' | 'uploading' | 'done' | 'failed'; error?: string }

/** Upload one or more files into a folder under Documents, with what they are, tags and when they run out. */
function UploadDialog({ folder, known, onClose, onDone }: { folder: string[]; known: KeptDocument[]; onClose: () => void; onDone: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [items, setItems] = useState<Pending[]>([])
  const [kind, setKind] = useState<TaxDocKind>('other')
  const [year, setYear] = useState(Number(today().slice(0, 4)))
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [expires, setExpires] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const set = (key: string, patch: Partial<Pending>) => setItems(list => list.map(x => (x.key === key ? { ...x, ...patch } : x)))
  const thisYear = Number(today().slice(0, 4))

  const add = (list: File[]) => {
    const added: Pending[] = list.filter(f => !f.name.startsWith('.')).map(file => {
      const problem = taxFileProblem(file.name, file.size)
      return { key: crypto.randomUUID(), file, state: problem ? 'refused' : 'checking', error: problem ? t(problem) : undefined }
    })
    setItems(prev => [...prev, ...added])
    for (const x of added.filter(a => a.state === 'checking')) {
      void fingerprint(x.file).then(sha256 => setItems(now => {
        const twice = now.some(o => o.key !== x.key && o.sha256 === sha256)
        const kept = known.find(d => d.sha256 === sha256)
        return now.map(o => (o.key !== x.key ? o : { ...o, sha256, state: kept || twice ? 'duplicate' : 'ready',
          error: kept ? t('Already kept as “{name}”', { name: kept.name }) : twice ? t('The same file is in this upload twice') : undefined }))
      }), () => set(x.key, { state: 'refused', error: t('That file couldn’t be read') }))
    }
  }
  const ready = items.filter(x => x.state === 'ready' || x.state === 'failed')
  const one = items.length === 1

  const upload = async () => {
    setBusy(true)
    let kept = 0
    for (const x of ready) {
      set(x.key, { state: 'uploading', error: undefined })
      try {
        await api.uploadDocument(x.file, { name: x.file.name, kind, year, folder, sha256: x.sha256!, title: one ? title.trim() || null : null, tags: cleanTags(tags), expires_on: expires || null })
        set(x.key, { state: 'done' })
        kept++
      } catch (e) {
        set(x.key, { state: 'failed', error: e instanceof Error ? e.message : String(e) })
      }
    }
    setBusy(false)
    await run(async () => {}, kept ? tn(kept, '{n} document kept', '{n} documents kept') : undefined)
    if (kept === ready.length) { onDone(); onClose() }
  }

  const tag: Record<Pending['state'], ReactNode> = {
    checking: <Tag>{t('Checking…')}</Tag>, ready: <Tag fg={tokens.infoFg} bg={tokens.infoBg}>{t('Ready')}</Tag>,
    duplicate: <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Already kept')}</Tag>, refused: <Tag fg={tokens.badFg} bg={tokens.badBg}>{t('Not taken')}</Tag>,
    uploading: <Tag fg={tokens.infoFg} bg={tokens.infoBg}>{t('Uploading…')}</Tag>, done: <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Kept')}</Tag>,
    failed: <Tag fg={tokens.badFg} bg={tokens.badBg}>{t('Didn’t upload')}</Tag>,
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="upload-documents-title">
      <DialogTitle id="upload-documents-title">{t('Upload documents')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>{t('Files go into: {path}', { path: where(folder) })}</Typography>
        <input ref={input} type="file" multiple hidden onChange={e => { add([...(e.target.files ?? [])]); e.target.value = '' }} />
        <Button startIcon={<UploadIcon />} onClick={() => input.current?.click()} disabled={busy} sx={{ mb: 2 }}>{t('Choose files')}</Button>
        {items.length > 0 && (
          <Table size="small" aria-label={t('Files to upload')} sx={{ mb: 2 }}>
            <TableBody>
              {items.map(x => (
                <TableRow key={x.key}>
                  <TableCell sx={{ overflowWrap: 'anywhere' }}>
                    {x.file.name}
                    {x.error && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{x.error}</Typography>}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{tag[x.state]}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Stack spacing={2}>
          {one && <TextField label={t('Title (optional)')} value={title} onChange={e => setTitle(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('Kind')} value={kind} onChange={e => setKind(e.target.value as TaxDocKind)} sx={{ flex: 2 }}>
              {DOC_KINDS.map(k => <MenuItem key={k.id} value={k.id}>{t(k.label)}</MenuItem>)}
            </TextField>
            <TextField select label={t('Year')} value={year} onChange={e => setYear(Number(e.target.value))} sx={{ flex: 1 }}>
              {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField label={t('Tags')} value={tags} onChange={e => setTags(e.target.value)} helperText={t('Separated by commas')} />
          <TextField label={t('Runs out')} type="date" value={expires} onChange={e => setExpires(e.target.value)} slotProps={{ inputLabel: { shrink: true } }}
            helperText={t('For a contract, a policy or a certificate: a reminder shows here before it does')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={busy || !ready.length} onClick={() => void upload()}>
          {ready.length ? tn(ready.length, 'Upload {n} document', 'Upload {n} documents') : t('Upload')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
