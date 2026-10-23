import {
  Alert, Box, Button, Card, CardContent, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Link, List,
  ListItemButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DownIcon from '@mui/icons-material/ArrowDropDown'
import EditIcon from '@mui/icons-material/EditOutlined'
import OpenIcon from '@mui/icons-material/OpenInNew'
import ViewIcon from '@mui/icons-material/VisibilityOutlined'
import PdfIcon from '@mui/icons-material/PictureAsPdfOutlined'
import ImageIcon from '@mui/icons-material/ImageOutlined'
import FileIcon from '@mui/icons-material/InsertDriveFileOutlined'
import FolderIcon from '@mui/icons-material/FolderOutlined'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { LOGO } from '../components/Connectors'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import { pickFromGoogleDrive } from '../lib/googlePicker'
import { formatLocal, today } from '../../shared/time'
import {
  LEGAL_KINDS, LEGAL_STORAGES, byKind, matchesSearch, previewOf, storageName, titleOf,
  type LegalDocument, type LegalDocumentPatch, type LegalSource, type LegalStorage,
} from '../../shared/legalDocs'
import { currentLanguage, t, tn } from '../i18n'

const day = (at: string | null) => (at ? formatLocal(at, 'd MMM yyyy') : '')
const kindLabel = (k: LegalDocument['kind']) => t(LEGAL_KINDS.find(x => x.id === k)!.label)
const size = (bytes: number | null) => (bytes === null ? '' : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)
const where = (d: LegalDocument) => (d.location ? `${storageName(d.storage)} › ${d.location.split('/').join(' › ')}` : storageName(d.storage))

function FileKind({ d }: { d: LegalDocument }) {
  const p = previewOf(d)
  const Icon = p?.as === 'image' ? ImageIcon : p?.as === 'pdf' ? PdfIcon : FileIcon
  return <Icon sx={{ color: 'text.secondary' }} />
}

/**
 * Legal: the business's legal documents (the lease, the company's deeds, insurance, contracts,
 * licences, its policies), kept where they already are in its Google Drive or OneDrive. An admin picks
 * them from whichever storage is connected; the page lists them by kind, shows each one (asked of its
 * storage there and then) and opens it there. Nothing is copied. A gestoría with finances access reads.
 */
export function LegalDocumentsPage() {
  const { api, isAdmin, isPartner, partnerCan } = useApp()
  const canEdit = isAdmin && !isPartner
  const docs = useAsync('legal-documents', () => api.legalDocuments(), [])
  const sources = useAsync('legal-sources', () => (canEdit ? api.legalSources() : Promise.resolve(null)), [canEdit])
  const [query, setQuery] = useState('')
  const [browsing, setBrowsing] = useState<LegalStorage | null>(null)
  const [viewing, setViewing] = useState<LegalDocument | null>(null)
  const [editing, setEditing] = useState<LegalDocument | null>(null)

  if (!canEdit && !partnerCan('finances')) {
    return <>
      <PageHeader eyebrow={t('Business')} title={t('Legal')} />
      <Alert severity="info">{t('Legal documents are only visible to admins.')}</Alert>
    </>
  }

  const all = docs.data ?? []
  const groups = byKind(all.filter(d => matchesSearch(d, query)))
  const connected = (sources.data ?? []).filter(s => s.connected)
  const last = [...all].sort((a, b) => b.added_at.localeCompare(a.added_at))[0]
  const storageNote = (s: LegalStorage) => {
    const src = sources.data?.find(x => x.storage === s)
    return src ? (src.connected ? src.account ?? t('Connected') : t('Not connected')) : undefined
  }

  const table = (): ExportTable => ({
    title: t('Legal'), filename: `legal-${today()}`,
    columns: [t('Document'), t('Kind'), t('File'), t('Kept in'), t('Changed'), t('Notes'), t('Link')],
    rows: byKind(all).flatMap(g => g.docs).map(d => [d.title, kindLabel(d.kind), d.file_name, where(d), d.modified_at?.slice(0, 10) ?? '', d.notes ?? '', d.link ?? '']),
  })

  return (
    <>
      <PageHeader eyebrow={t('Business')} title={t('Legal')} actions={<>
        {!canEdit && <Tag>{t('Read-only')}</Tag>}
        <ExportButton table={table} disabled={!all.length} folder="Legal" />
        {canEdit && <AddButton sources={sources.data} onBrowse={setBrowsing} />}
      </>} />
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5, maxWidth: 760 }}>
        {t('The café’s legal documents, kept where they already are in its Google Drive or OneDrive. Business Agent only remembers where each one is: it shows them here and opens them there, and copies nothing.')}
      </Typography>
      <ErrorBox error={docs.error ?? sources.error} />
      {canEdit && sources.data && connected.length === 0 && (
        <Alert severity="info" sx={{ mb: 3 }} action={<Button component={RouterLink} to="/connections" color="inherit">{t('Connections')}</Button>}>
          {t('Connect Google Drive or OneDrive (or both) to pick the café’s legal documents from them.')}
        </Alert>
      )}

      <StatGrid>
        <StatTile label={t('Documents')} value={docs.data ? all.length : '–'} note={tn(byKind(all).length, '{n} kind', '{n} kinds')} />
        {LEGAL_STORAGES.map(s => (
          <StatTile key={s.id} label={s.name} value={docs.data ? all.filter(d => d.storage === s.id).length : '–'} note={storageNote(s.id)} />
        ))}
        <StatTile label={t('Last added')} value={last ? day(last.added_at) : '–'} note={last?.title ?? t('Nothing yet')} />
      </StatGrid>

      {all.length > 0 && (
        <TextField size="small" placeholder={t('Search the documents')} value={query} onChange={e => setQuery(e.target.value)} sx={{ mb: 2, width: { xs: '100%', sm: 320 } }}
          slotProps={{ htmlInput: { 'aria-label': t('Search the documents') }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
      )}

      {groups.length === 0 && (
        <Card sx={{ mb: 3 }}><CardContent>
          <Empty>{!docs.data ? t('Loading…') : all.length ? t('Nothing matches “{q}”.', { q: query.trim() })
            : t('No legal documents yet. Add them from Google Drive or OneDrive: they stay where they are.')}</Empty>
        </CardContent></Card>
      )}
      {groups.map(g => (
        <Card key={g.id} component="section" aria-label={t(g.label)} sx={{ mb: 2 }}>
          <CardContent>
            <SectionTitle>{t(g.label)}</SectionTitle>
            {g.docs.map(d => {
              const preview = previewOf(d)
              const facts = [where(d), titleOf(d.file_name) !== d.title ? d.file_name : null, size(d.size) || null, d.modified_at ? t('changed {date}', { date: day(d.modified_at) }) : null]
              return (
                <Stack key={d.id} component="article" aria-label={d.title} direction="row" spacing={1.5}
                  sx={{ alignItems: 'center', py: 1.25, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                  <FileKind d={d} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {preview
                      ? <Link component="button" variant="body2" onClick={() => setViewing(d)} sx={{ fontWeight: 500, textAlign: 'left' }}>{d.title}</Link>
                      : <Typography variant="body2" sx={{ fontWeight: 500 }}>{d.title}</Typography>}
                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', overflowWrap: 'anywhere' }}>{facts.filter(Boolean).join(' · ')}</Typography>
                    {d.notes && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>{d.notes}</Typography>}
                  </Box>
                  <Stack direction="row" sx={{ flexShrink: 0 }}>
                    {preview && <IconButton size="small" aria-label={t('View {name}', { name: d.title })} onClick={() => setViewing(d)}><ViewIcon fontSize="small" /></IconButton>}
                    {d.link && <IconButton size="small" component="a" href={d.link} target="_blank" rel="noopener"
                      aria-label={t('Open {name} in {where}', { name: d.title, where: storageName(d.storage) })}><OpenIcon fontSize="small" /></IconButton>}
                    {canEdit && <IconButton size="small" aria-label={t('Edit {name}', { name: d.title })} onClick={() => setEditing(d)}><EditIcon fontSize="small" /></IconButton>}
                  </Stack>
                </Stack>
              )
            })}
          </CardContent>
        </Card>
      ))}

      {browsing && <StorageBrowser storage={browsing} onClose={() => setBrowsing(null)} />}
      {viewing && <Viewer doc={viewing} onClose={() => setViewing(null)} />}
      {editing && <EditDialog doc={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

/** Add picked files, then say what was added and what wasn't (and why). True when anything was added. */
function useAddDocuments() {
  const { api } = useApp()
  const notify = useNotify()
  const client = useQueryClient()
  return async (storage: LegalStorage, ids: string[]) => {
    try {
      const { added, skipped } = await api.addLegalDocuments(storage, ids)
      void client.invalidateQueries()
      const why = skipped.map(s => `${s.name ?? t('a file')}: ${t(s.why)}`).join('; ')
      if (added.length) {
        const done = tn(added.length, 'Added {n} document from {where}', 'Added {n} documents from {where}', { where: storageName(storage) })
        notify(why ? `${done}. ${t('Not added: {list}', { list: why })}` : done, why ? 'warning' : 'success')
      } else {
        notify(why ? t('Not added: {list}', { list: why }) : t('Nothing was added'), 'warning')
      }
      return added.length > 0
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
      return false
    }
  }
}

/** "Add documents": choose which connected storage to pick from (or connect one). */
function AddButton({ sources, onBrowse }: { sources: LegalSource[] | null; onBrowse: (s: LegalStorage) => void }) {
  const { api } = useApp()
  const notify = useNotify()
  const add = useAddDocuments()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [busy, setBusy] = useState(false)
  const pick = async (s: LegalSource) => {
    setAnchor(null)
    if (s.how === 'browse') return onBrowse(s.storage)
    setBusy(true)
    try {
      const p = await api.legalPicker()
      const ids = await pickFromGoogleDrive({ token: p.token, key: p.key, appId: p.app_id, title: t('Choose the café’s legal documents'), language: currentLanguage() })
      if (ids.length) await add(s.storage, ids)
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button variant="contained" startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <AddIcon />} endIcon={<DownIcon />} disabled={busy || !sources}
        onClick={e => setAnchor(e.currentTarget)} aria-haspopup="menu" aria-expanded={!!anchor}>{t('Add documents')}</Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {(sources ?? []).map(s => s.connected
          ? (
            <MenuItem key={s.storage} disabled={!!s.problem} onClick={() => void pick(s)} sx={{ whiteSpace: 'normal', maxWidth: 360 }}>
              <ListItemIcon sx={{ '& svg': { width: 20, height: 20 } }}>{LOGO[s.storage]}</ListItemIcon>
              <ListItemText primary={t('From {where}', { where: storageName(s.storage) })} secondary={s.problem ? t(s.problem) : s.account} />
            </MenuItem>
          ) : (
            <MenuItem key={s.storage} component={RouterLink} to="/connections" sx={{ whiteSpace: 'normal', maxWidth: 360 }}>
              <ListItemIcon sx={{ '& svg': { width: 20, height: 20 }, opacity: 0.6 }}>{LOGO[s.storage]}</ListItemIcon>
              <ListItemText primary={t('Connect {app}', { app: storageName(s.storage) })} secondary={t('On the Connections page')} />
            </MenuItem>
          ))}
      </Menu>
    </>
  )
}

/** Look through a storage folder by folder and tick the files to add (they can come from several folders). */
function StorageBrowser({ storage, onClose }: { storage: LegalStorage; onClose: () => void }) {
  const { api } = useApp()
  const add = useAddDocuments()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  // The folders opened, from the top; empty is the top of the storage.
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([])
  const folder = trail.at(-1)?.id ?? null
  const list = useAsync('legal-browse', () => api.browseLegalStorage(storage, folder), [storage, folder])
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const here = list.data && list.data.folder.id === folder ? list.data : null
  const free = (here?.items ?? []).filter(i => !i.folder && !i.added_id)
  const allHere = free.length > 0 && free.every(f => chosen.has(f.id))
  const toggle = (id: string) => setChosen(c => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const chooseHere = () => setChosen(c => { const n = new Set(c); for (const f of free) { if (allHere) n.delete(f.id); else n.add(f.id) } return n })
  const save = async () => {
    setSaving(true)
    const ok = await add(storage, [...chosen])
    setSaving(false)
    if (ok) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone} aria-labelledby="legal-browse-title">
      <DialogTitle id="legal-browse-title">{t('Choose from {where}', { where: storageName(storage) })}</DialogTitle>
      <DialogContent dividers sx={{ minHeight: 360 }}>
        <Stack component="nav" aria-label={t('Folder')} direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
          {trail.length === 0
            ? <Typography variant="body2" sx={{ fontWeight: 600 }}>{here?.folder.name ?? storageName(storage)}</Typography>
            : <Link component="button" variant="body2" onClick={() => setTrail([])}>{storageName(storage)}</Link>}
          {trail.map((f, i) => (
            <Stack key={f.id} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>›</Typography>
              {i === trail.length - 1
                ? <Typography variant="body2" sx={{ fontWeight: 600 }}>{f.name}</Typography>
                : <Link component="button" variant="body2" onClick={() => setTrail(trail.slice(0, i + 1))}>{f.name}</Link>}
            </Stack>
          ))}
        </Stack>
        <ErrorBox error={list.error} />
        {!here && !list.error && <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress aria-label={t('Loading…')} /></Box>}
        {here && here.items.length === 0 && <Empty>{t('Nothing in this folder.')}</Empty>}
        {here && here.items.length > 0 && (
          <List dense aria-label={t('In this folder')}>
            {here.items.map(i => i.folder ? (
              <ListItemButton key={i.id} onClick={() => setTrail([...trail, { id: i.id, name: i.name }])} aria-label={t('Open the folder {name}', { name: i.name })}>
                <ListItemIcon sx={{ minWidth: 40 }}><FolderIcon /></ListItemIcon>
                <ListItemText primary={i.name} />
              </ListItemButton>
            ) : (
              <ListItemButton key={i.id} disabled={!!i.added_id} onClick={() => toggle(i.id)}>
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <Checkbox edge="start" checked={!!i.added_id || chosen.has(i.id)} disabled={!!i.added_id} tabIndex={-1} disableRipple
                    slotProps={{ input: { 'aria-label': i.name } }} />
                </ListItemIcon>
                <ListItemText primary={i.name}
                  secondary={i.added_id ? t('Already on the Legal page') : [size(i.size), i.modified ? t('changed {date}', { date: day(i.modified) }) : ''].filter(Boolean).join(' · ')} />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {free.length > 0 && <Button onClick={chooseHere} sx={{ mr: 'auto' }}>{allHere ? t('Untick the files here') : tn(free.length, 'Tick the file here', 'Tick the {n} files here')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!chosen.size || saving} onClick={() => void save()}>
          {chosen.size ? tn(chosen.size, 'Add {n} document', 'Add {n} documents') : t('Add documents')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** A document shown in the page: fetched from its storage now (a PDF or a picture), never kept. */
function Viewer({ doc, onClose }: { doc: LegalDocument; onClose: () => void }) {
  const { api } = useApp()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const as = previewOf(doc)?.as ?? 'pdf'
  useEffect(() => {
    let gone = false
    let made: string | null = null
    api.legalFile(doc.id).then(blob => {
      if (gone) return
      made = URL.createObjectURL(as === 'pdf' ? new Blob([blob], { type: 'application/pdf' }) : blob)
      setUrl(made)
    }).catch(e => { if (!gone) setError(e instanceof Error ? e.message : String(e)) })
    return () => { gone = true; if (made) URL.revokeObjectURL(made) }
  }, [api, doc.id, as])
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg" fullScreen={phone} aria-labelledby="legal-view-title"
      slotProps={{ paper: { sx: { height: phone ? '100%' : '90vh' } } }}>
      <DialogTitle id="legal-view-title" sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</Box>
        {doc.link && <Button size="small" startIcon={<OpenIcon />} href={doc.link} target="_blank" rel="noopener" sx={{ flexShrink: 0 }}>
          {t('Open in {where}', { where: storageName(doc.storage) })}
        </Button>}
        <IconButton aria-label={t('Close')} onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}
        {!error && !url && <Box sx={{ m: 'auto', p: 4 }}><CircularProgress aria-label={t('Loading…')} /></Box>}
        {url && as === 'pdf' && <Box component="iframe" src={url} title={doc.title} sx={{ border: 0, width: '100%', flex: 1, minHeight: 400 }} />}
        {url && as === 'image' && <Box component="img" src={url} alt={doc.title} sx={{ maxWidth: '100%', m: 'auto', display: 'block' }} />}
      </DialogContent>
      <Typography variant="caption" sx={{ px: 3, py: 1, color: 'text.secondary' }}>
        {t('Shown straight from {where}. Business Agent doesn’t keep a copy.', { where: storageName(doc.storage) })}
      </Typography>
    </Dialog>
  )
}

/** What a document is called and what kind it is, its notes; or take it off the page (the file stays). */
function EditDialog({ doc, onClose }: { doc: LegalDocument; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [d, setD] = useState<Required<LegalDocumentPatch>>({ title: doc.title, kind: doc.kind, notes: doc.notes ?? '' })
  const save = async () => {
    if (await run(async () => {
      if (!d.title.trim()) throw new Error(t('Give it a name'))
      await api.updateLegalDocument(doc.id, { title: d.title.trim(), kind: d.kind, notes: d.notes?.trim() || null })
    }, t('Saved'))) onClose()
  }
  const remove = async () => {
    if (await run(() => api.removeLegalDocument(doc.id), t('Taken off the Legal page. The file is still in {where}.', { where: storageName(doc.storage) }))) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="legal-edit-title">
      <DialogTitle id="legal-edit-title">{doc.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Name')} value={d.title} onChange={e => setD({ ...d, title: e.target.value })} required />
          <TextField select label={t('Kind')} value={d.kind} onChange={e => setD({ ...d, kind: e.target.value as LegalDocument['kind'] })}>
            {LEGAL_KINDS.map(k => <MenuItem key={k.id} value={k.id}>{t(k.label)}</MenuItem>)}
          </TextField>
          <TextField label={t('Notes')} value={d.notes ?? ''} multiline minRows={2} onChange={e => setD({ ...d, notes: e.target.value })}
            helperText={t('When it ends, who signed it, what to check…')} />
          <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
            {t('The file: {name}, in {where}.', { name: doc.file_name, where: where(doc) })}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Take off the list')}</Button>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
