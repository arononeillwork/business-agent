import {
  Alert, Box, Button, Card, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, LinearProgress,
  ListItemIcon, Menu, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import UploadIcon from '@mui/icons-material/FileUploadOutlined'
import SearchIcon from '@mui/icons-material/Search'
import MoreIcon from '@mui/icons-material/MoreVert'
import EditIcon from '@mui/icons-material/EditOutlined'
import LinkIcon from '@mui/icons-material/LinkRounded'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import VideoIcon from '@mui/icons-material/PlayCircleOutlineRounded'
import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Empty, ErrorBox, PageHeader } from '../components/common'
import { Brand } from '../components/Connectors'
import { Composer } from './SocialPlannerPage'
import { readyPhoto } from '../lib/media'
import {
  MAX_TAGS, NO_FILTER, SKIP_TEXT, SOURCES, allTags, cleanTags, contentProblem, filterContent, postFor, titleFromFilename,
  type ContentFilter, type ContentItem, type GooglePhotosImport,
} from '../../shared/content'
import { MAX_VIDEO_BYTES } from '../../shared/social'
import type { SocialPost } from '../../shared/types'
import { siGooglephotos } from 'simple-icons'
import { tokens } from '../theme'
import { t, tn, useLanguage } from '../i18n'

/** The longest side a photo from the device is kept at (as from Google Photos). */
const PHOTO_SIDE = 2560

/** A video's size, read in the browser (null when it can't tell). */
function videoSize(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise(resolve => {
    const v = document.createElement('video')
    const url = URL.createObjectURL(file)
    const done = (width: number | null, height: number | null) => { URL.revokeObjectURL(url); resolve({ width, height }) }
    v.preload = 'metadata'
    v.onloadedmetadata = () => done(v.videoWidth || null, v.videoHeight || null)
    v.onerror = () => done(null, null)
    v.src = url
  })
}

/** Where a Google Photos pick is: waiting for the admin to pick, bringing it in, or done (with what wasn't). */
type Pick =
  | { stage: 'waiting'; id: string; uri: string; blocked: boolean }
  | { stage: 'bringing'; id: string; done: number; left: number }
  | { stage: 'done'; added: number; already: number; skipped: GooglePhotosImport['skipped'] }

/**
 * Content (Marketing, admins): the business's photos and videos in one place, picked in Google Photos or
 * uploaded from the device, kept in the café's Drive or OneDrive. Each can go on a post (a few make a
 * carousel), and its link on an offer or a screen.
 */
export function ContentPage() {
  const { api } = useApp()
  useLanguage()
  const run = useAction()
  const notify = useNotify()
  const items = useAsync('content', () => api.contentItems(), [])
  const integ = useAsync('integrations', () => api.integrations(), [])
  const [filter, setFilter] = useState<ContentFilter>(NO_FILTER)
  const [chosen, setChosen] = useState<string[]>([])
  const [editing, setEditing] = useState<ContentItem | null>(null)
  const [deleting, setDeleting] = useState<ContentItem | null>(null)
  const [pick, setPick] = useState<Pick | null>(null)
  const [post, setPost] = useState<Partial<SocialPost> | null>(null)
  const [uploading, setUploading] = useState<{ done: number; of: number } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  // A pick's polling stops when the dialog closes (or the page goes).
  const live = useRef<string | null>(null)
  useEffect(() => () => { live.current = null }, [])

  const all = items.data ?? []
  const shown = filterContent(all, filter)
  const tags = allTags(all)
  const storage = integ.data?.media_storage ?? null
  const photos = integ.data?.integrations.find(i => i.provider === 'google_photos')
  const photosOn = photos?.status === 'connected'
  const connected = (p: string) => !!integ.data?.integrations.some(i => i.provider === p && i.status === 'connected')
  const chosenItems = all.filter(i => chosen.includes(i.id))

  const toggle = (id: string) => setChosen(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]))

  /** Bring in what was picked, a few at a time, until nothing's left. */
  async function bringIn(id: string) {
    let done = 0, already = 0
    const skipped: GooglePhotosImport['skipped'] = []
    setPick({ stage: 'bringing', id, done: 0, left: 0 })
    for (;;) {
      const r = await api.importGooglePhotos(id, skipped.map(s => s.id))
      done += r.added.length
      already = r.already
      skipped.push(...r.skipped)
      if (live.current !== id) return
      setPick({ stage: 'bringing', id, done, left: r.left })
      await items.reload()
      if (!r.left) break
    }
    live.current = null
    setPick({ stage: 'done', added: done, already, skipped })
  }

  /** Ask Google every few seconds whether the admin has pressed Done, then bring the pick in. */
  async function waitForPick(id: string, every: number, until: number) {
    while (live.current === id && Date.now() < until) {
      await new Promise(r => setTimeout(r, every))
      if (live.current !== id) return
      const s = await api.googlePhotosPicked(id)
      if (s.picked) return bringIn(id)
    }
    if (live.current === id) throw new Error(t('Google Photos waited too long for a pick. Pick again.'))
  }

  const startPick = () => run(async () => {
    const p = await api.startGooglePhotosPick()
    live.current = p.id
    // Google's picker can't sit inside the page: it opens in a window of its own (a phone may open the Google Photos app).
    const opened = p.picker_uri ? !!window.open(p.picker_uri, 'google-photos-picker', 'popup,width=1100,height=760') : true
    setPick({ stage: 'waiting', id: p.id, uri: p.picker_uri, blocked: !opened })
    try {
      await waitForPick(p.id, p.poll_ms, Date.now() + p.timeout_ms)
    } catch (e) {
      live.current = null
      setPick(null)
      throw e
    }
  })

  const closePick = () => {
    if (pick?.stage === 'waiting') void api.cancelGooglePhotosPick(pick.id).catch(() => {})
    live.current = null
    setPick(null)
  }

  const upload = (files: FileList) => run(async () => {
    const list = [...files]
    let done = 0
    setUploading({ done, of: list.length })
    try {
      for (const f of list) {
        const video = f.type.startsWith('video/')
        if (video && f.size > MAX_VIDEO_BYTES) throw new Error(t('Videos can be up to 100 MB'))
        const ready = video ? f : await readyPhoto(f, false, PHOTO_SIDE)
        const size = video ? await videoSize(f) : await createImageBitmap(ready).then(b => { const s = { width: b.width, height: b.height }; b.close(); return s })
        await api.uploadContent(ready, { title: titleFromFilename(f.name), ...size })
        setUploading({ done: ++done, of: list.length })
      }
    } finally {
      setUploading(null)
      if (file.current) file.current.value = ''
    }
  }, tn(files.length, '{n} added', '{n} added'))

  const makePost = () => {
    const p = postFor(chosenItems)
    if (!p) {
      notify(chosenItems.length > 10 ? t('A post takes up to 10 photos and videos.') : t('Posts take JPEG photos and MP4 or MOV videos. Choose one of those.'), 'error')
      return
    }
    setPost({ kind: p.kind, media: p.media, image_url: p.media[0].type === 'image' ? p.media[0].url : null })
  }

  const copyLink = (i: ContentItem) => run(async () => {
    await navigator.clipboard.writeText(new URL(i.url, location.href).href)
  }, t('Link copied. Paste it into an offer, a screen or the menu.'))

  return (
    <>
      <PageHeader eyebrow={t('Marketing')} title={t('Content')} actions={<>
        <input ref={file} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          onChange={e => { if (e.target.files?.length) void upload(e.target.files) }} />
        <Button variant="outlined" startIcon={<UploadIcon />} disabled={!storage || !!uploading} onClick={() => file.current?.click()}>{t('Upload')}</Button>
        <Button variant="contained" startIcon={<Box component="span" sx={{ display: 'grid', '& svg': { width: 18, height: 18 } }}><Brand icon={siGooglephotos} /></Box>}
          disabled={!storage || !photosOn || !!pick} onClick={() => void startPick()}>{t('From Google Photos')}</Button>
      </>} />
      <ErrorBox error={items.error} />

      {integ.data && !storage && (
        <Alert severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" component={RouterLink} to="/connections">{t('Connections')}</Button>}>
          {t('Connect Google Drive or OneDrive to keep photos and videos here: they’re kept in its Business Agent folder, in Content.')}
        </Alert>
      )}
      {integ.data && !photosOn && (
        <Alert severity={photos?.status === 'error' ? 'error' : 'info'} sx={{ mb: 2 }}
          action={<Button color="inherit" onClick={() => void run(() => api.connectService('google_photos', 'content'))}>
            {photos?.status === 'error' ? t('Connect again') : t('Connect Google Photos')}
          </Button>}>
          {photos?.status === 'error' && photos.last_error ? photos.last_error
            : t('Bring in photos and videos from Google Photos: connect it once, then pick the ones you want. Business Agent sees only what you pick.')}
        </Alert>
      )}
      {uploading && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 0.5 }}>{t('Uploading {done} of {of}…', { done: String(uploading.done + 1 > uploading.of ? uploading.of : uploading.done + 1), of: String(uploading.of) })}</Typography>
          <LinearProgress variant="determinate" value={(uploading.done / uploading.of) * 100} />
        </Box>
      )}

      {all.length > 0 && (
        <Stack direction="row" sx={{ gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <ToggleButtonGroup size="small" exclusive value={filter.kind} onChange={(_, v) => v && setFilter(f => ({ ...f, kind: v }))} aria-label={t('Photos or videos')}>
            <ToggleButton value="all">{t('All')}</ToggleButton>
            <ToggleButton value="photo">{t('Photos')}</ToggleButton>
            <ToggleButton value="video">{t('Videos')}</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup size="small" exclusive value={filter.source} onChange={(_, v) => v && setFilter(f => ({ ...f, source: v }))} aria-label={t('Where from')}>
            <ToggleButton value="all">{t('Anywhere')}</ToggleButton>
            {SOURCES.map(s => <ToggleButton key={s.id} value={s.id}>{t(s.label)}</ToggleButton>)}
          </ToggleButtonGroup>
          <TextField size="small" type="search" value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))} placeholder={t('Title or tag')}
            slotProps={{ htmlInput: { 'aria-label': t('Search content') }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
            sx={{ width: { xs: '100%', sm: 240 } }} />
        </Stack>
      )}
      {tags.length > 0 && (
        <Stack direction="row" sx={{ gap: 0.75, mb: 2, flexWrap: 'wrap' }} role="group" aria-label={t('Tags')}>
          {tags.map(({ tag, count }) => (
            <Chip key={tag} size="small" label={`${tag} · ${count}`} variant={filter.tag === tag ? 'filled' : 'outlined'} aria-pressed={filter.tag === tag}
              onClick={() => setFilter(f => ({ ...f, tag: f.tag === tag ? null : tag }))} />
          ))}
        </Stack>
      )}

      {chosen.length > 0 && (
        <Card variant="outlined" sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', position: 'sticky', top: 8, zIndex: 2, bgcolor: 'background.paper' }}>
          <Typography sx={{ fontWeight: 600, flexGrow: 1 }}>{tn(chosen.length, '{n} chosen', '{n} chosen')}</Typography>
          <Button onClick={() => setChosen([])}>{t('Clear')}</Button>
          <Button variant="contained" onClick={makePost}>{t('Make a post')}</Button>
        </Card>
      )}

      {items.data && !all.length ? (
        <Empty>
          <Typography sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}>{t('Your photos and videos, ready for posts, offers and the screens')}</Typography>
          {t('Pick them in Google Photos or upload them from this device. They’re kept in your Drive or OneDrive, each with a link of its own.')}
        </Empty>
      ) : items.data && !shown.length ? (
        <Empty>{t('Nothing matches. Try another filter.')}</Empty>
      ) : (
        <Box role="list" aria-label={t('Photos and videos')}
          sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 210px), 1fr))' }}>
          {shown.map(i => (
            <ContentCard key={i.id} item={i} chosen={chosen.includes(i.id)} onToggle={() => toggle(i.id)}
              onEdit={() => setEditing(i)} onCopy={() => void copyLink(i)} onDelete={() => setDeleting(i)} />
          ))}
        </Box>
      )}

      {pick && <PickDialog pick={pick} onClose={closePick} />}
      {editing && <EditDialog item={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <Dialog open onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
          <DialogTitle>{t('Take {name} off the page?', { name: deleting.title ?? t(deleting.kind === 'video' ? 'this video' : 'this photo') })}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{t('The file stays in your Drive or OneDrive, so posts, offers and screens that use it keep showing it.')}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(null)}>{t('Keep')}</Button>
            <Button variant="contained" color="error" onClick={() => void run(async () => {
              await api.deleteContentItem(deleting.id)
              setChosen(c => c.filter(x => x !== deleting.id))
              setDeleting(null)
            })}>{t('Take off')}</Button>
          </DialogActions>
        </Dialog>
      )}
      {post && (
        <Composer post={post} storage={storage} isConnected={p => connected(p)} recent={[]} engagement={{}} onClose={() => setPost(null)}
          onSaved={async () => { setChosen([]); notify(t('Saved on the Social planner.'), 'success') }} />
      )}
    </>
  )
}

function ContentCard({ item: i, chosen, onToggle, onEdit, onCopy, onDelete }: {
  item: ContentItem; chosen: boolean; onToggle: () => void; onEdit: () => void; onCopy: () => void; onDelete: () => void
}) {
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const name = i.title ?? t(i.kind === 'video' ? 'Untitled video' : 'Untitled photo')
  return (
    <Card role="listitem" aria-label={name} variant="outlined"
      sx={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', outline: chosen ? `2px solid ${tokens.rose}` : 'none' }}>
      <Box sx={{ position: 'relative', aspectRatio: '4 / 3', bgcolor: tokens.surfaceAlt, cursor: 'pointer' }} onClick={onToggle}>
        {i.kind === 'video'
          ? <Box component="video" src={i.url} muted playsInline preload="metadata" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <Box component="img" src={i.url} alt={name} loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        {i.kind === 'video' && <VideoIcon sx={{ position: 'absolute', right: 8, bottom: 8, color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))' }} />}
        <Checkbox checked={chosen} onClick={e => e.stopPropagation()} onChange={onToggle} slotProps={{ input: { 'aria-label': t('Choose {name}', { name }) } }}
          sx={{ position: 'absolute', top: 4, left: 4, bgcolor: 'rgba(255,255,255,.85)', borderRadius: '8px', p: 0.5, '&:hover': { bgcolor: '#fff' } }} />
      </Box>
      <Box sx={{ p: 1.25, display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={name}>{name}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            {i.source === 'google_photos' ? t('Google Photos') : t('Uploaded')}
            {i.taken_at ? ` · ${new Date(i.taken_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
          </Typography>
          {i.tags.length > 0 && (
            <Stack direction="row" sx={{ gap: 0.5, mt: 0.75, flexWrap: 'wrap' }}>
              {i.tags.map(tag => <Chip key={tag} size="small" label={tag} sx={{ height: 20, fontSize: '0.7rem' }} />)}
            </Stack>
          )}
        </Box>
        <Tooltip title={t('More')}>
          <IconButton size="small" aria-label={t('More for {name}', { name })} onClick={e => setMenu(e.currentTarget)}><MoreIcon fontSize="small" /></IconButton>
        </Tooltip>
        <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
          <MenuItem onClick={() => { setMenu(null); onEdit() }}><ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>{t('Title and tags')}</MenuItem>
          <MenuItem onClick={() => { setMenu(null); onCopy() }}><ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>{t('Copy link')}</MenuItem>
          <MenuItem component="a" href={i.url} target="_blank" rel="noreferrer" onClick={() => setMenu(null)}>
            <ListItemIcon><OpenIcon fontSize="small" /></ListItemIcon>{t('Open')}
          </MenuItem>
          <MenuItem onClick={() => { setMenu(null); onDelete() }} sx={{ color: 'error.main' }}>
            <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>{t('Take off the page')}
          </MenuItem>
        </Menu>
      </Box>
    </Card>
  )
}

/** A Google Photos pick: waiting for the admin to press Done in Google's window, bringing it in, then what came in. */
function PickDialog({ pick, onClose }: { pick: Pick; onClose: () => void }) {
  return (
    <Dialog open onClose={pick.stage === 'bringing' ? undefined : onClose} maxWidth="xs" fullWidth aria-labelledby="pick-title">
      <DialogTitle id="pick-title">{t('From Google Photos')}</DialogTitle>
      <DialogContent>
        {pick.stage === 'waiting' && (
          <Stack spacing={2}>
            <Typography variant="body2">
              {pick.blocked ? t('Your browser kept Google Photos from opening. Open it here, pick the photos and videos, then press Done there.')
                : t('Google Photos has opened in a new window. Pick the photos and videos, then press Done there.')}
            </Typography>
            {pick.uri && (
              <Button variant={pick.blocked ? 'contained' : 'outlined'} href={pick.uri} target="google-photos-picker" rel="noreferrer" startIcon={<OpenIcon />}>
                {t('Open Google Photos')}
              </Button>
            )}
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }} role="status">
              <CircularProgress size={18} />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Waiting for your pick…')}</Typography>
            </Stack>
          </Stack>
        )}
        {pick.stage === 'bringing' && (
          <Stack spacing={1.5} role="status">
            <Typography variant="body2">{t('Copying them to your Drive or OneDrive…')}</Typography>
            <LinearProgress variant={pick.left || pick.done ? 'determinate' : 'indeterminate'}
              value={pick.done + pick.left ? (pick.done / (pick.done + pick.left)) * 100 : 0} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{tn(pick.done, '{n} brought in so far', '{n} brought in so far')}</Typography>
          </Stack>
        )}
        {pick.stage === 'done' && (
          <Stack spacing={1.5} role="status">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {pick.added ? tn(pick.added, '{n} photo or video added.', '{n} photos and videos added.') : t('Nothing new was added.')}
            </Typography>
            {pick.already > 0 && <Typography variant="body2">{tn(pick.already, '{n} was here already.', '{n} were here already.')}</Typography>}
            {pick.skipped.length > 0 && (
              <Alert severity="warning">
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{tn(pick.skipped.length, '{n} wasn’t brought in:', '{n} weren’t brought in:')}</Typography>
                {pick.skipped.map(s => <Typography key={s.id} variant="body2">{s.name ?? t('One item')}: {t(SKIP_TEXT[s.reason])}</Typography>)}
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {pick.stage === 'waiting' && <Button onClick={onClose}>{t('Cancel')}</Button>}
        {pick.stage === 'done' && <Button variant="contained" onClick={onClose}>{t('Done')}</Button>}
      </DialogActions>
    </Dialog>
  )
}

/** A photo's or video's title and tags. */
function EditDialog({ item, onClose }: { item: ContentItem; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [title, setTitle] = useState(item.title ?? '')
  const [tags, setTags] = useState(item.tags.join(', '))
  const cleaned = cleanTags(tags)
  const problem = contentProblem({ title, tags: cleaned })
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('Title and tags')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Title')} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          <TextField label={t('Tags')} value={tags} onChange={e => setTags(e.target.value)} placeholder={t('e.g. terrace, latte art, summer')}
            helperText={problem ? t(problem) : t('Separate them with commas (up to {n}).', { n: String(MAX_TAGS) })} error={!!problem} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!!problem} onClick={() => void run(async () => {
          await api.saveContentItem({ id: item.id, title: title.trim() || null, tags: cleaned })
          onClose()
        })}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
