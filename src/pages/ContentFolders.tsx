// Synced folders on the Content page (shared/contentFolders.ts): the folders shown, each with when it was
// last looked at (and why not, when it couldn't be), Sync now and Remove; and choosing one, looking through
// the OneDrive (or Google Drive, once switched on: FEATURES.driveFolders) folder by folder.
import {
  Alert, Box, Breadcrumbs, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Link, List, ListItemButton, ListItemIcon,
  ListItemText, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import FolderIcon from '@mui/icons-material/FolderOutlined'
import SyncIcon from '@mui/icons-material/SyncRounded'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAction, useNotify } from '../app/Notify'
import { FEATURES } from '../app/features'
import { NO_DRIVE_FOLDERS, PROVIDER_NAME, type ContentFolder, type FolderListing, type FolderProvider } from '../../shared/contentFolders'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

/** The folders shown, each as a chip: where it is, when it was last looked at, Sync now and Remove. */
export function FoldersBar({ folders, syncing, onSync, onRemove }: {
  folders: ContentFolder[]; syncing: string[]; onSync: (f: ContentFolder) => void; onRemove: (f: ContentFolder) => void
}) {
  return (
    <Box component="section" aria-label={t('Synced folders')} sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('Synced folders')}</Typography>
      <Stack spacing={1}>
        {folders.map(f => (
          <Stack key={f.id} role="group" aria-label={f.name} direction="row"
            sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', p: 1, pl: 1.5, borderRadius: 2, border: `1px solid ${tokens.line}`, bgcolor: 'background.paper' }}>
            <FolderIcon sx={{ color: 'text.secondary' }} />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{f.name}</Typography>
              <Typography variant="caption" sx={{ color: f.last_error ? 'error.main' : 'text.secondary' }}>
                {f.last_error ?? [PROVIDER_NAME[f.provider], f.path,
                  f.last_synced_at ? t('looked at {when}', { when: formatLocal(f.last_synced_at, 'd MMM, HH:mm') }) : null].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            <Button size="small" startIcon={syncing.includes(f.id) ? <CircularProgress size={14} /> : <SyncIcon />} disabled={syncing.includes(f.id)}
              onClick={() => onSync(f)} aria-label={t('Sync {name} now', { name: f.name })}>{t('Sync now')}</Button>
            <Button size="small" color="error" onClick={() => onRemove(f)} aria-label={t('Remove {name}', { name: f.name })}>{t('Remove')}</Button>
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}

/**
 * Choose a folder to show: OneDrive (or Google Drive, switched on and connected with its folders readable),
 * then folder by folder from the top. `connected`: whether each is connected; `driveFolders`: whether Drive's
 * folders may be read.
 */
export function FolderChooser({ connected, driveFolders, onClose, onAdded }: {
  connected: (p: FolderProvider) => boolean; driveFolders: boolean; onClose: () => void; onAdded: () => void
}) {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const usable = (p: FolderProvider) => connected(p) && (p === 'onedrive' || (FEATURES.driveFolders && driveFolders))
  const [provider, setProvider] = useState<FolderProvider>(usable('onedrive') || !usable('google_drive') ? 'onedrive' : 'google_drive')
  // The way down: each folder opened (the top first).
  const [trail, setTrail] = useState<{ id: string | null; name: string }[]>([])
  const [listing, setListing] = useState<FolderListing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const here = trail[trail.length - 1] ?? null

  useEffect(() => {
    if (!usable(provider)) { setListing(null); return }
    let live = true
    setListing(null)
    setError(null)
    api.browseContentFolders(provider, here?.id ?? null)
      .then(l => { if (live) { setListing(l); if (!trail.length) setTrail([l.folder]) } })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : String(e)) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, here?.id])

  const choose = async () => {
    setAdding(true)
    try {
      await run(async () => {
        const path = trail.slice(1).map(s => s.name).join(' › ') || null
        const { folder, sync } = await api.addContentFolder({ provider, folder_id: here!.id!, name: here!.name, path })
        notify(syncWords(folder.name, sync), 'success')
        onAdded()
      })
    } finally {
      setAdding(false)
    }
  }

  return (
    <Dialog open onClose={adding ? undefined : onClose} maxWidth="sm" fullWidth aria-labelledby="folder-chooser-title">
      <DialogTitle id="folder-chooser-title">{t('Show a folder')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {t('Its photos and videos show here straight from the folder: nothing is copied, and new ones appear by themselves. On your phone, OneDrive’s camera upload can fill it for you.')}
        </Typography>
        <ToggleButtonGroup size="small" exclusive value={provider} aria-label={t('Where')}
          onChange={(_, v) => { if (v) { setProvider(v); setTrail([]) } }} sx={{ mb: 2 }}>
          <ToggleButton value="onedrive">{'OneDrive'}</ToggleButton>
          <ToggleButton value="google_drive">{'Google Drive'}</ToggleButton>
        </ToggleButtonGroup>

        {provider === 'google_drive' && !usable('google_drive') ? (
          <Alert severity="info">{t(NO_DRIVE_FOLDERS)}</Alert>
        ) : !connected(provider) ? (
          <Alert severity="info" action={<Button color="inherit" component={RouterLink} to="/connections">{t('Connections')}</Button>}>
            {t('Connect {name} on the Connections page first.', { name: PROVIDER_NAME[provider] })}
          </Alert>
        ) : (
          <>
            <Breadcrumbs aria-label={t('Where you are')} sx={{ mb: 1 }}>
              {trail.map((s, i) => i === trail.length - 1
                ? <Typography key={i} variant="body2" sx={{ fontWeight: 600 }}>{s.name}</Typography>
                : <Link key={i} component="button" variant="body2" onClick={() => setTrail(tr => tr.slice(0, i + 1))}>{s.name}</Link>)}
            </Breadcrumbs>
            {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
            {!listing && !error ? <Box sx={{ py: 3, display: 'grid', placeItems: 'center' }}><CircularProgress size={24} /></Box> : listing && (
              listing.folders.length ? (
                <List dense aria-label={t('Folders')} sx={{ maxHeight: 320, overflowY: 'auto', border: `1px solid ${tokens.line}`, borderRadius: 2 }}>
                  {listing.folders.map(f => (
                    <ListItemButton key={f.id} onClick={() => setTrail(tr => [...tr, { id: f.id, name: f.name }])}>
                      <ListItemIcon sx={{ minWidth: 36 }}><FolderIcon fontSize="small" /></ListItemIcon>
                      <ListItemText primary={f.name} />
                    </ListItemButton>
                  ))}
                </List>
              ) : <Typography variant="body2" sx={{ color: 'text.secondary', py: 1 }}>{t('No folders in here.')}</Typography>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={adding}>{t('Cancel')}</Button>
        <Tooltip title={here?.id ? '' : t('Open the folder to show first')}>
          <span>
            <Button variant="contained" disabled={!here?.id || adding || !usable(provider)} onClick={() => void choose()}
              startIcon={adding ? <CircularProgress size={16} color="inherit" /> : <FolderIcon />}>
              {here?.id ? t('Show {name}', { name: here.name }) : t('Show this folder')}
            </Button>
          </span>
        </Tooltip>
      </DialogActions>
    </Dialog>
  )
}

/** What a look at a folder did, in words for the toast. */
export function syncWords(name: string, s: { added: number; removed: number; total: number; skipped: number }) {
  const parts = [tn(s.total, '{n} photo or video in {name}', '{n} photos and videos in {name}', { name })]
  if (s.added) parts.push(tn(s.added, '{n} new', '{n} new'))
  if (s.removed) parts.push(tn(s.removed, '{n} gone', '{n} gone'))
  if (s.skipped) parts.push(tn(s.skipped, '{n} file can’t be shown here (an iPhone’s HEIC photos, other files)', '{n} files can’t be shown here (an iPhone’s HEIC photos, other files)'))
  return parts.join(' · ')
}

