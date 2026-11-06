import {
  Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, ListItemIcon, Menu, MenuItem, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import IdeaIcon from '@mui/icons-material/LightbulbOutlined'
import UploadIcon from '@mui/icons-material/AddPhotoAlternateOutlined'
import PhotoIcon from '@mui/icons-material/PhotoCameraOutlined'
import VideoIcon from '@mui/icons-material/VideocamOutlined'
import TakeIcon from '@mui/icons-material/FrontHandOutlined'
import HandInIcon from '@mui/icons-material/TaskAltOutlined'
import PostIcon from '@mui/icons-material/SendOutlined'
import AgainIcon from '@mui/icons-material/ReplayRounded'
import MoreIcon from '@mui/icons-material/MoreVert'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import CloseIcon from '@mui/icons-material/CloseRounded'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import { useRef, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, SectionTitle, Tag } from '../components/common'
import { IDEA_LIMITS, IDEA_STATUS, WANTS, ideaProblem, sortIdeas, wantsLabel, type IdeaStatus, type IdeaWants, type PostIdea, type PostIdeaInput } from '../../shared/postIdeas'
import type { PostMedia, SocialPost } from '../../shared/types'
import { readyPhoto, readyVideo } from '../lib/media'
import { tokens } from '../theme'
import { msg, t } from '../i18n'

const TONE: Record<IdeaStatus, { fg: string; bg: string }> = {
  open: { fg: tokens.neutralFg, bg: tokens.neutralBg },
  doing: { fg: tokens.infoFg, bg: tokens.infoBg },
  ready: { fg: tokens.roseDeep, bg: tokens.roseSoft },
  done: { fg: tokens.goodFg, bg: tokens.goodBg },
}
const WANTS_ICON: Record<IdeaWants, ReactNode> = {
  either: <><PhotoIcon sx={{ fontSize: 14 }} /><VideoIcon sx={{ fontSize: 14 }} /></>, photo: <PhotoIcon sx={{ fontSize: 14 }} />, video: <VideoIcon sx={{ fontSize: 14 }} />,
}
/** How a post made from an idea is getting on (admins see the planner's posts). */
const POST_STATE: Partial<Record<SocialPost['status'], string>> = {
  draft: msg('A draft on the planner'), scheduled: msg('Scheduled on the planner'), due: msg('A reminder on the planner'), publishing: msg('Posting now'),
  published: msg('Posted'), partly: msg('Partly posted'), failed: msg('Not posted: see the planner'),
}

/**
 * Social planner → Ideas: posts the business wants made, for anyone on the team to pick up. Each says
 * what it's about and whether it wants photos or a video; whoever makes it adds them here and hands it
 * in, and an admin makes the post from it (`onMakePost`, the planner's composer). Admins pass the
 * planner's posts, to say how each idea's post is getting on.
 */
export function PostIdeas({ posts, onMakePost }: { posts?: SocialPost[]; onMakePost?: (idea: PostIdea) => void }) {
  const { api, isAdmin } = useApp()
  const ideas = useAsync('post-ideas', () => api.postIdeas(), [])
  const [editing, setEditing] = useState<Partial<PostIdea> | null>(null)
  const [showDone, setShowDone] = useState(false)
  const all = sortIdeas(ideas.data ?? [])
  const current = all.filter(i => i.status !== 'done')
  const done = all.filter(i => i.status === 'done')
  return (
    <Box component="section" aria-label={t('Ideas for posts')}>
      <SectionTitle action={<Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setEditing({})}>{t('Add an idea')}</Button>}>
        {t('Ideas for posts')}
      </SectionTitle>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1, mb: 2 }}>
        {isAdmin ? t('Posts we want made. Anyone on the team can pick one, take the photos or video and hand it in; then make the post from it.')
          : t('Posts we want made. Pick one, take the photos or video, add them here and hand it in: an admin posts it.')}
      </Typography>
      <ErrorBox error={ideas.error} />
      {ideas.data && !current.length && <Empty>{t('No ideas waiting. Add one: what to post about, and whether it wants photos or a video.')}</Empty>}
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
        {current.map(i => <IdeaCard key={i.id} idea={i} posts={posts} onEdit={() => setEditing(i)} onMakePost={onMakePost} />)}
      </Box>
      {done.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Button size="small" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
            {showDone ? t('Hide done ({n})', { n: done.length }) : t('Show done ({n})', { n: done.length })}
          </Button>
          {showDone && (
            <Box sx={{ mt: 1, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
              {done.map(i => <IdeaCard key={i.id} idea={i} posts={posts} onEdit={() => setEditing(i)} onMakePost={onMakePost} />)}
            </Box>
          )}
        </Box>
      )}
      {editing && <IdeaDialog idea={editing} onClose={() => setEditing(null)} />}
    </Box>
  )
}

/** A photo, or a video's first frame with a play mark. */
function Thumb({ m, size }: { m: PostMedia; size: number }) {
  const box = { width: size, height: size, borderRadius: '8px', objectFit: 'cover' as const, display: 'block', border: `1px solid ${tokens.line}`, bgcolor: tokens.ink }
  if (m.type === 'image') return <Box component="img" src={m.url} alt="" sx={box} />
  return (
    <Box sx={{ position: 'relative', width: size, height: size }}>
      {m.url.startsWith('data:image') ? <Box component="img" src={m.url} alt="" sx={box} /> : <Box component="video" src={`${m.url}#t=0.1`} muted playsInline preload="metadata" sx={box} />}
      <Box aria-label={t('Video')} sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', pointerEvents: 'none' }}>
        <PlayIcon sx={{ fontSize: size * 0.45, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))' }} />
      </Box>
    </Box>
  )
}

/** One idea: what it is, who's making it, its photos and videos, and the next step for whoever's looking. */
function IdeaCard({ idea: i, posts, onEdit, onMakePost }: { idea: PostIdea; posts?: SocialPost[]; onEdit: () => void; onMakePost?: (idea: PostIdea) => void }) {
  const { api, me, isAdmin, profiles } = useApp()
  const run = useAction()
  const file = useRef<HTMLInputElement>(null)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [asking, setAsking] = useState(false)
  const [uploading, setUploading] = useState<{ done: number; of: number } | null>(null)
  const nameOf = (id: string | null) => profiles.find(p => p.id === id)?.full_name ?? t('Someone')
  const mine = !!me && i.taken_by === me.id
  const done = i.status === 'done'
  const canEdit = isAdmin || (!done && i.created_by === me?.id)
  const canDelete = isAdmin || (i.created_by === me?.id && i.status === 'open' && !i.media.length)
  const canChangeMedia = isAdmin || !done
  const room = IDEA_LIMITS.media - i.media.length
  const post = i.post_id ? posts?.find(p => p.id === i.post_id) : undefined
  // A done one: made into a post (and, for admins, how that's getting on), or just marked done.
  const outcome = !done ? null : i.post_id ? (post && POST_STATE[post.status]) || msg('Made into a post') : msg('Marked done')
  const save = (patch: Omit<PostIdeaInput, 'id'>, success?: string) => run(() => api.savePostIdea({ id: i.id, ...patch }), success)

  const add = (files: File[]) => run(async () => {
    const list = files.slice(0, room)
    if (!list.length) throw new Error(t('An idea takes up to 10 photos and videos'))
    setUploading({ done: 0, of: list.length })
    const added: PostMedia[] = []
    try {
      for (const [n, f] of list.entries()) {
        // As for a post: photos made JPEG and cropped to a shape Instagram's feed takes; videos MP4 or MOV.
        const ready = f.type.startsWith('video/') ? readyVideo(f) : await readyPhoto(f, true)
        added.push(await api.uploadIdeaMedia(ready))
        setUploading({ done: n + 1, of: list.length })
      }
    } finally {
      setUploading(null)
      // What went up is kept, even if a later one didn't; and nobody making it yet: it's yours now.
      if (added.length) {
        await api.savePostIdea({ id: i.id, media: [...i.media, ...added],
          ...(i.status === 'open' && me ? { taken_by: me.id, status: 'doing' as const } : {}) })
      }
    }
  }, files.length > room ? t('Only {max} fit: the first {n} were added', { max: IDEA_LIMITS.media, n: room }) : t('Added. Hand it in when it’s all there.'))

  const remove = (k: number) => {
    const media = i.media.filter((_, j) => j !== k)
    // Handed in with nothing left: back to being made.
    const status: IdeaStatus = i.status === 'ready' && !media.length ? (i.taken_by ? 'doing' : 'open') : i.status
    void save({ media, status })
  }

  return (
    <Card component="article" aria-label={t('Idea: {title}', { title: i.title })} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1, opacity: done ? 0.85 : 1 }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, minHeight: 28 }}>
        <Tag fg={TONE[i.status].fg} bg={TONE[i.status].bg}>{t(IDEA_STATUS[i.status].label)}</Tag>
        <Tag><Box component="span" sx={{ display: 'inline-flex', mr: 0.5 }}>{WANTS_ICON[i.wants]}</Box>{t(wantsLabel(i.wants))}</Tag>
        <Box sx={{ flex: 1 }} />
        {(canEdit || canDelete || (isAdmin && !done)) && (
          <IconButton size="small" aria-label={t('More for {title}', { title: i.title })} onClick={e => setMenu(e.currentTarget)} sx={{ my: -0.5 }}><MoreIcon fontSize="small" /></IconButton>
        )}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <IdeaIcon sx={{ color: tokens.roseDeep, fontSize: 20, mt: 0.25 }} />
        <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, lineHeight: 1.35 }}>{i.title}</Typography>
      </Stack>
      {i.details && <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap' }}>{i.details}</Typography>}

      {i.media.length > 0 && (
        <Stack direction="row" role="list" aria-label={t('Photos and videos')} sx={{ gap: 0.75, flexWrap: 'wrap' }}>
          {i.media.map((m, k) => (
            <Box key={`${m.url}-${k}`} role="listitem" sx={{ position: 'relative' }}>
              <Thumb m={m} size={64} />
              {canChangeMedia && (
                <IconButton size="small" aria-label={m.type === 'video' ? t('Remove video {n}', { n: k + 1 }) : t('Remove photo {n}', { n: k + 1 })} onClick={() => remove(k)}
                  sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,.55)', color: '#fff', p: 0.125, '&:hover': { bgcolor: 'rgba(0,0,0,.75)' } }}>
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              )}
            </Box>
          ))}
        </Stack>
      )}
      {uploading && (
        <Box role="status">
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {uploading.of > 1 ? t('Uploading {n} of {total}… (videos can take a minute)', { n: Math.min(uploading.done + 1, uploading.of), total: uploading.of }) : t('Uploading … (videos can take a minute)')}
          </Typography>
          <LinearProgress sx={{ mt: 0.5, borderRadius: 1 }} />
        </Box>
      )}

      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {[i.created_by ? t('Added by {name}', { name: nameOf(i.created_by) }) : null,
          i.taken_by && !done ? (mine ? t('You’re making it') : t('Making it: {name}', { name: nameOf(i.taken_by) })) : null,
          outcome ? t(outcome) : null,
        ].filter(Boolean).join(' · ')}
      </Typography>

      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 'auto', pt: 0.5 }}>
        {i.status === 'open' && me && (
          <Button size="small" variant="outlined" startIcon={<TakeIcon />} onClick={() => void save({ taken_by: me.id, status: 'doing' }, t('It’s yours: add the photos or video when you have them'))}>
            {t('I’ll make it')}
          </Button>
        )}
        {!done && room > 0 && (
          <Button size="small" variant="outlined" startIcon={<UploadIcon />} disabled={!!uploading} onClick={() => file.current?.click()}>
            {i.media.length ? t('Add more') : i.wants === 'video' ? t('Add the video') : i.wants === 'photo' ? t('Add photos') : t('Add photos or video')}
          </Button>
        )}
        {(i.status === 'open' || i.status === 'doing') && i.media.length > 0 && (mine || !i.taken_by || isAdmin) && !(isAdmin && onMakePost) && (
          <Button size="small" variant="contained" startIcon={<HandInIcon />} onClick={() => void save({ status: 'ready', taken_by: i.taken_by ?? me?.id ?? null }, t('Handed in: an admin will make the post'))}>
            {t('Hand it in')}
          </Button>
        )}
        {!done && isAdmin && onMakePost && i.media.length > 0 && (
          <Button size="small" variant="contained" startIcon={<PostIcon />} onClick={() => onMakePost(i)}>{t('Make a post')}</Button>
        )}
        {i.status === 'doing' && mine && !i.media.length && (
          <Button size="small" onClick={() => void save({ taken_by: null, status: 'open' }, t('Up for grabs again'))}>{t('Let it go')}</Button>
        )}
        {i.status === 'ready' && !isAdmin && <Typography variant="body2" sx={{ color: 'text.secondary', alignSelf: 'center' }}>{t('Handed in: an admin will make the post')}</Typography>}
        {done && isAdmin && (
          <Button size="small" startIcon={<AgainIcon />} onClick={() => void save({ status: i.media.length ? 'ready' : i.taken_by ? 'doing' : 'open' }, t('Back on the list'))}>{t('Open again')}</Button>
        )}
      </Stack>
      <input ref={file} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" aria-label={t('Photo or video file')} onChange={e => {
        const files = [...(e.target.files ?? [])]
        if (files.length) void add(files)
        e.target.value = ''
      }} />

      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
        {canEdit && <MenuItem onClick={() => { setMenu(null); onEdit() }}><ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>{t('Edit idea')}</MenuItem>}
        {isAdmin && !done && onMakePost && !i.media.length && (
          <MenuItem onClick={() => { setMenu(null); onMakePost(i) }}><ListItemIcon><PostIcon fontSize="small" /></ListItemIcon>{t('Make a post')}</MenuItem>
        )}
        {isAdmin && !done && <MenuItem onClick={() => { setMenu(null); void save({ status: 'done' }, t('Marked done')) }}><ListItemIcon><HandInIcon fontSize="small" /></ListItemIcon>{t('Mark done')}</MenuItem>}
        {canDelete && <MenuItem onClick={() => { setMenu(null); setAsking(true) }}><ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>{t('Delete')}</MenuItem>}
      </Menu>
      {asking && (
        <Dialog open onClose={() => setAsking(false)} maxWidth="xs" fullWidth>
          <DialogTitle>{t('Delete this idea?')}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {i.media.length ? t('“{title}” goes from the list. Its photos and videos stay in your Drive or OneDrive.', { title: i.title }) : t('“{title}” goes from the list.', { title: i.title })}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAsking(false)}>{t('Keep')}</Button>
            <Button color="error" variant="contained" onClick={() => void run(async () => { await api.deletePostIdea(i.id); setAsking(false) }, t('Idea deleted'))}>{t('Delete')}</Button>
          </DialogActions>
        </Dialog>
      )}
    </Card>
  )
}

/** Add an idea or change one: what it's about, what to show, photos or a video; admins also say who makes it. */
function IdeaDialog({ idea, onClose }: { idea: Partial<PostIdea>; onClose: () => void }) {
  const { api, isAdmin, profiles } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [title, setTitle] = useState(idea.title ?? '')
  const [details, setDetails] = useState(idea.details ?? '')
  const [wants, setWants] = useState<IdeaWants>(idea.wants ?? 'either')
  const [takenBy, setTakenBy] = useState(idea.taken_by ?? '')
  const team = profiles.filter(p => p.active && (p.role === 'admin' || p.role === 'employee'))
  const status = idea.status ?? 'open'
  const problem = ideaProblem({ title, details, status, media: idea.media ?? [] })
  const save = () => run(async () => {
    if (problem) throw new Error(t(problem))
    const who = isAdmin ? { taken_by: takenBy || null, ...(takenBy && status === 'open' ? { status: 'doing' as const } : {}) } : {}
    await api.savePostIdea({ id: idea.id, title, details: details.trim() || null, wants, ...who })
    onClose()
  }, idea.id ? t('Idea saved') : t('Idea added'))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle>{idea.id ? t('Edit idea') : t('New idea for a post')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField label={t('What’s the post about?')} value={title} onChange={e => setTitle(e.target.value)} autoFocus required
            placeholder={t('The coffees we have now')} slotProps={{ htmlInput: { maxLength: IDEA_LIMITS.title } }} />
          <TextField label={t('What to show or say')} value={details} onChange={e => setDetails(e.target.value)} multiline minRows={3}
            placeholder={t('Puchero, Cocobrew and Santa Roaster’s decaf Colombia: the bags and a cup of each')}
            helperText={t('For whoever makes it: what to film or photograph, and anything to mention.')} slotProps={{ htmlInput: { maxLength: IDEA_LIMITS.details } }} />
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>{t('It wants')}</Typography>
            <ToggleButtonGroup exclusive fullWidth size="small" value={wants} onChange={(_, v: IdeaWants | null) => v && setWants(v)} aria-label={t('It wants')}>
              {WANTS.map(w => (
                <ToggleButton key={w.id} value={w.id} sx={{ gap: 0.5, textTransform: 'none' }}>{WANTS_ICON[w.id]}{t(w.label)}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
          {isAdmin && status !== 'done' && (
            <TextField select label={t('Who’s making it')} value={takenBy} onChange={e => setTakenBy(e.target.value)}
              helperText={t('They get a notification. Or leave it for whoever picks it up.')}>
              <MenuItem value="">{t('Nobody yet')}</MenuItem>
              {team.map(p => <MenuItem key={p.id} value={p.id}>{p.full_name}</MenuItem>)}
            </TextField>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ mr: 'auto' }}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{idea.id ? t('Save') : t('Add idea')}</Button>
      </DialogActions>
    </Dialog>
  )
}
