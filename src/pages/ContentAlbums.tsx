// Albums on the Content page, as Google Photos has them (shared/content.ts, the `content_favourites_albums`
// migration): a row of the business's albums, each with its first photo, its name and how many are in it;
// New album; the photos and videos chosen put into one (or a new one); and, inside an album, a bar to go
// back, rename it, delete it (its photos and videos stay on the page) or take the chosen ones out of it.
import {
  Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Radio, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/AddRounded'
import BackIcon from '@mui/icons-material/ArrowBackRounded'
import AlbumIcon from '@mui/icons-material/PhotoAlbumOutlined'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import { albumCover, albumNameProblem, tidyAlbumName, type ContentAlbum, type ContentItem } from '../../shared/content'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

/** An album's picture: its first photo (a video's first frame when it has none), or an album mark. */
function Cover({ item, size }: { item: ContentItem | null; size: number }) {
  const fill = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } as const
  return (
    <Box aria-hidden sx={{ width: size, height: size, borderRadius: 2, overflow: 'hidden', bgcolor: tokens.surfaceAlt, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      {!item ? <AlbumIcon sx={{ color: 'text.secondary', fontSize: size * 0.4 }} />
        : item.kind === 'video' ? <Box component="video" src={item.url} muted playsInline preload="metadata" sx={fill} />
        : <Box component="img" src={item.url} alt="" loading="lazy" sx={fill} />}
    </Box>
  )
}

/** The albums in a row, and New album at the end. */
export function AlbumsRow({ albums, items, onOpen, onNew }: { albums: ContentAlbum[]; items: ContentItem[]; onOpen: (id: string) => void; onNew: () => void }) {
  return (
    <Box component="section" aria-label={t('Albums')} sx={{ mb: 2.5 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('Albums')}</Typography>
      <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 0.5 }}>
        {albums.map(a => (
          <ButtonBase key={a.id} onClick={() => onOpen(a.id)} aria-label={tn(a.item_ids.length, '{name}: {n} photo or video', '{name}: {n} photos and videos', { name: a.name })}
            sx={{ flexDirection: 'column', alignItems: 'flex-start', width: 112, flexShrink: 0, borderRadius: 2, textAlign: 'left' }}>
            <Cover item={albumCover(a, items)} size={112} />
            <Typography variant="body2" noWrap sx={{ fontWeight: 500, mt: 0.75, maxWidth: 112 }}>{a.name}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{tn(a.item_ids.length, '{n} item', '{n} items')}</Typography>
          </ButtonBase>
        ))}
        <ButtonBase onClick={onNew} aria-label={t('New album')} sx={{ flexDirection: 'column', alignItems: 'flex-start', width: 112, flexShrink: 0, borderRadius: 2 }}>
          <Box sx={{ width: 112, height: 112, borderRadius: 2, border: `1px dashed ${tokens.lineStrong}`, display: 'grid', placeItems: 'center' }}>
            <AddIcon sx={{ color: 'text.secondary', fontSize: 36 }} />
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 500, mt: 0.75 }}>{t('New album')}</Typography>
        </ButtonBase>
      </Box>
    </Box>
  )
}

/** An album's name: a new one's, or a new name for one. */
export function AlbumNameDialog({ title, initial = '', others, id, onSave, onClose }: {
  title: string; initial?: string; others: ContentAlbum[]; id?: string; onSave: (name: string) => Promise<unknown>; onClose: () => void
}) {
  const run = useAction()
  const [name, setName] = useState(initial)
  const problem = name.trim() ? albumNameProblem(name, others, id) : null
  const save = () => run(async () => { await onSave(tidyAlbumName(name)); onClose() })
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField label={t('Name')} value={name} onChange={e => setName(e.target.value)} autoFocus fullWidth placeholder={t('e.g. Terrace, Latte art')}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim() && !problem) void save() }}
          helperText={problem ? t(problem) : ' '} error={!!problem} sx={{ mt: 1 }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!name.trim() || !!problem} onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** The photos and videos chosen, into an album (or a new one). */
export function AddToAlbumDialog({ items, albums, all, onClose, onAdded }: {
  items: ContentItem[]; albums: ContentAlbum[]; all: ContentItem[]; onClose: () => void; onAdded: () => void
}) {
  const { api } = useApp()
  const run = useAction()
  const [pick, setPick] = useState<string>(albums[0]?.id ?? 'new')
  const [name, setName] = useState('')
  const target = pick === 'new' ? tidyAlbumName(name) : albums.find(a => a.id === pick)?.name ?? ''
  const problem = pick === 'new' && name.trim() ? albumNameProblem(name, albums) : null
  const ready = pick === 'new' ? !!name.trim() && !problem : !!albums.find(a => a.id === pick)
  const add = () => run(async () => {
    const id = pick === 'new' ? await api.createAlbum(name) : pick
    await api.addToAlbum(id, items.map(i => i.id))
    onAdded()
  }, tn(items.length, '{n} added to {name}', '{n} added to {name}', { name: target }))
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('Add to album')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>{tn(items.length, '{n} photo or video', '{n} photos and videos')}</Typography>
        <Stack role="radiogroup" aria-label={t('Albums')} spacing={0.5}>
          {albums.map(a => (
            <Box key={a.id} component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer', p: 0.5, borderRadius: 1.5, '&:hover': { bgcolor: tokens.hover } }}>
              <Radio checked={pick === a.id} onChange={() => setPick(a.id)} slotProps={{ input: { 'aria-label': a.name } }} />
              <Cover item={albumCover(a, all)} size={40} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>{a.name}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{tn(a.item_ids.length, '{n} item', '{n} items')}</Typography>
              </Box>
            </Box>
          ))}
          <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer', p: 0.5, borderRadius: 1.5, '&:hover': { bgcolor: tokens.hover } }}>
            <Radio checked={pick === 'new'} onChange={() => setPick('new')} slotProps={{ input: { 'aria-label': t('New album') } }} />
            <Box sx={{ width: 40, height: 40, borderRadius: 2, border: `1px dashed ${tokens.lineStrong}`, display: 'grid', placeItems: 'center' }}><AddIcon fontSize="small" /></Box>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>{t('New album')}</Typography>
          </Box>
        </Stack>
        {pick === 'new' && (
          <TextField label={t('Name')} value={name} onChange={e => setName(e.target.value)} autoFocus fullWidth placeholder={t('e.g. Terrace, Latte art')}
            helperText={problem ? t(problem) : ' '} error={!!problem} sx={{ mt: 1.5 }} />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!ready} onClick={() => void add()}>{t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Inside an album: back to everything, its name and count, rename, delete. */
export function AlbumBar({ album, onBack, onRename, onDelete }: { album: ContentAlbum; onBack: () => void; onRename: () => void; onDelete: () => void }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
      <Tooltip title={t('All photos and videos')}>
        <IconButton aria-label={t('All photos and videos')} onClick={onBack}><BackIcon /></IconButton>
      </Tooltip>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography component="h2" variant="h6" noWrap>{album.name}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{tn(album.item_ids.length, '{n} item', '{n} items')}</Typography>
      </Box>
      <Button onClick={onRename}>{t('Rename')}</Button>
      <Button color="error" onClick={onDelete}>{t('Delete album')}</Button>
    </Stack>
  )
}
