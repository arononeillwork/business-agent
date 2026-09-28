import {
  Alert, Box, Button, Card, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  Radio, RadioGroup, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PhotoIcon from '@mui/icons-material/AddPhotoAlternateOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/EditOutlined'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import { siFacebook, siGooglemaps, siInstagram, siTiktok, type SimpleIcon } from 'simple-icons'
import { useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle } from '../components/common'
import { formatLocal, localDate, localTime, today, zonedIso } from '../../shared/time'
import type { IntegrationProvider, SocialNetwork, SocialPost } from '../../shared/types'
import { tokens } from '../theme'

/** The networks the planner posts to, and which connection each needs. */
const NETWORKS: { id: SocialNetwork; name: string; icon: SimpleIcon; provider: IntegrationProvider; limit: number; needsPhoto?: boolean }[] = [
  { id: 'instagram', name: 'Instagram', icon: siInstagram, provider: 'instagram', limit: 2200, needsPhoto: true },
  { id: 'facebook', name: 'Facebook', icon: siFacebook, provider: 'facebook', limit: 2200 },
  { id: 'tiktok', name: 'TikTok', icon: siTiktok, provider: 'tiktok', limit: 2200, needsPhoto: true },
  { id: 'google', name: 'Google Maps', icon: siGooglemaps, provider: 'google_business', limit: 1500 },
]
const networkOf = (id: SocialNetwork) => NETWORKS.find(n => n.id === id)!

function Mark({ icon, size = 16 }: { icon: SimpleIcon; size?: number }) {
  return (
    <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: size, height: size, display: 'block', flexShrink: 0 }}>
      <path d={icon.path} fill={icon.hex === '000000' ? 'currentColor' : `#${icon.hex}`} />
    </Box>
  )
}

const dayLabel = (iso: string) => {
  const d = localDate(iso)
  return d === today() ? 'Today' : formatLocal(iso, 'EEEE d MMMM')
}

/** Admins: plan posts for every social account at once, then they go out by themselves at the chosen time. */
export function SocialPlannerPage() {
  const { api } = useApp()
  const posts = useAsync('social-posts', () => api.socialPosts(), [], { refetchInterval: 30_000 })
  const integ = useAsync('integrations', () => api.integrations(), [])
  const [editing, setEditing] = useState<Partial<SocialPost> | null>(null)
  const connected = (p: IntegrationProvider) => integ.data?.integrations.find(i => i.provider === p && i.status === 'connected')

  const all = posts.data ?? []
  const upcoming = all.filter(p => p.status === 'scheduled').sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
  const drafts = all.filter(p => p.status === 'draft')
  const sent = all.filter(p => !['scheduled', 'draft'].includes(p.status))
    .sort((a, b) => (b.published_at ?? b.scheduled_at ?? '').localeCompare(a.published_at ?? a.scheduled_at ?? ''))
  const byDay = upcoming.reduce<[string, SocialPost[]][]>((acc, p) => {
    const d = dayLabel(p.scheduled_at!)
    const last = acc.at(-1)
    if (last?.[0] === d) last[1].push(p); else acc.push([d, [p]])
    return acc
  }, [])

  return (
    <>
      <PageHeader eyebrow="Business" title="Social planner"
        subtitle="Write a post once, pick the accounts and the time, and it goes out by itself. Every post is checked before it's scheduled, and you can see where it went."
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ caption: '', targets: [], image_url: null })}>New post</Button>} />
      <ErrorBox error={posts.error} />

      <Stack spacing={3}>
        <Card component="section" aria-label="Accounts">
          {NETWORKS.map(n => {
            const row = connected(n.provider)
            return (
              <Stack key={n.id} direction="row" spacing={1.5} sx={{ alignItems: 'center', px: { xs: 2, sm: 2.75 }, py: 1.5, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
                <Box sx={{ color: tokens.ink }}><Mark icon={n.icon} size={20} /></Box>
                <Typography sx={{ flex: 1, minWidth: 0 }} noWrap>{n.name}</Typography>
                {row
                  ? <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{row.account_label ?? 'Connected'}</Typography>
                  : <Button size="small" component={RouterLink} to="/connections">Connect</Button>}
              </Stack>
            )
          })}
        </Card>

        <Box component="section" aria-label="Coming up">
          <SectionTitle>Coming up</SectionTitle>
          {posts.data && upcoming.length === 0 && <Empty>Nothing scheduled. Press New post to plan one.</Empty>}
          <Stack spacing={2}>
            {byDay.map(([day, list]) => (
              <Box key={day}>
                <Typography variant="overline" sx={{ color: 'text.secondary' }}>{day}</Typography>
                <Card>{list.map(p => <PostRow key={p.id} p={p} onEdit={() => setEditing(p)} reload={posts.reload} />)}</Card>
              </Box>
            ))}
          </Stack>
        </Box>

        {drafts.length > 0 && (
          <Box component="section" aria-label="Drafts">
            <SectionTitle>Drafts</SectionTitle>
            <Card>{drafts.map(p => <PostRow key={p.id} p={p} onEdit={() => setEditing(p)} reload={posts.reload} />)}</Card>
          </Box>
        )}

        <Box component="section" aria-label="Sent">
          <SectionTitle>Sent</SectionTitle>
          {posts.data && sent.length === 0 && <Empty>Posts that have gone out show here, with a link to each one.</Empty>}
          {sent.length > 0 && <Card>{sent.map(p => <PostRow key={p.id} p={p} reload={posts.reload} />)}</Card>}
        </Box>
      </Stack>

      {editing && <Composer post={editing} isConnected={p => !!connected(p)} onClose={() => setEditing(null)} onSaved={posts.reload} />}
    </>
  )
}

const STATUS: Record<SocialPost['status'], { label: string; fg: string; bg: string }> = {
  draft: { label: 'Draft', fg: tokens.neutralFg, bg: tokens.neutralBg },
  scheduled: { label: 'Scheduled', fg: tokens.infoFg, bg: tokens.infoBg },
  publishing: { label: 'Posting…', fg: tokens.warnFg, bg: tokens.warnBg },
  published: { label: 'Posted', fg: tokens.goodFg, bg: tokens.goodBg },
  partly: { label: 'Partly posted', fg: tokens.warnFg, bg: tokens.warnBg },
  failed: { label: 'Not posted', fg: tokens.badFg, bg: tokens.badBg },
}

/** One post as a row: when, where, what; and for sent posts, what happened on each network. */
function PostRow({ p, onEdit, reload }: { p: SocialPost; onEdit?: () => void; reload: () => Promise<void> }) {
  const { api } = useApp()
  const run = useAction()
  const st = STATUS[p.status]
  const sent = !['draft', 'scheduled'].includes(p.status)
  return (
    <Box component="article" aria-label={`Post: ${p.caption.slice(0, 40) || 'photo'}`}
      sx={{ display: 'flex', gap: 1.5, px: { xs: 2, sm: 2.75 }, py: 1.75, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
      {p.image_url
        ? <Box component="img" src={p.image_url} alt="" sx={{ width: 56, height: 56, borderRadius: '10px', objectFit: 'cover', flexShrink: 0, border: `1px solid ${tokens.line}` }} />
        : <Box sx={{ width: 56, height: 56, borderRadius: '10px', flexShrink: 0, bgcolor: tokens.surfaceAlt, border: `1px solid ${tokens.line}` }} />}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          {p.scheduled_at && <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {sent ? formatLocal(p.published_at ?? p.scheduled_at, 'd MMM, HH:mm') : localTime(p.scheduled_at)}
          </Typography>}
          <Chip size="small" label={st.label} sx={{ bgcolor: st.bg, color: st.fg }} />
          <Stack direction="row" spacing={0.75} sx={{ color: tokens.ink }}>
            {p.targets.map(t => <Tooltip key={t} title={networkOf(t).name}><Box aria-label={networkOf(t).name}><Mark icon={networkOf(t).icon} /></Box></Tooltip>)}
          </Stack>
        </Stack>
        <Typography sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {p.caption || <Box component="span" sx={{ color: 'text.secondary' }}>Photo only</Box>}
        </Typography>
        {sent && (
          <Stack component="ul" aria-label="Where it went" sx={{ listStyle: 'none', m: 0, p: 0, mt: 0.75, gap: 0.25 }}>
            {p.targets.map(t => {
              const r = p.results[t]
              const ok = r?.status === 'published'
              return (
                <Stack component="li" key={t} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                  <Box sx={{ color: tokens.ink }}><Mark icon={networkOf(t).icon} size={14} /></Box>
                  <Typography variant="body2" sx={{ color: ok ? tokens.goodFg : r?.status === 'failed' ? tokens.badFg : 'text.secondary' }}>
                    {networkOf(t).name}: {ok ? 'posted' : r?.status === 'failed' ? `not posted (${r.error ?? 'failed'})` : r?.status === 'retrying' ? `trying again (${r.error ?? ''})` : 'sending'}
                  </Typography>
                  {ok && r?.url && <IconButton size="small" component="a" href={r.url} target="_blank" rel="noreferrer" aria-label={`Open on ${networkOf(t).name}`}><OpenIcon sx={{ fontSize: 15 }} /></IconButton>}
                </Stack>
              )
            })}
          </Stack>
        )}
      </Box>
      <Stack direction="row" sx={{ alignItems: 'flex-start', flexShrink: 0 }}>
        {onEdit && <Tooltip title="Edit"><IconButton size="small" aria-label="Edit post" onClick={onEdit}><EditIcon fontSize="small" /></IconButton></Tooltip>}
        {!['publishing'].includes(p.status) && (
          <Tooltip title={sent ? 'Remove from the list (it stays on the networks)' : 'Delete'}>
            <IconButton size="small" aria-label="Delete post" onClick={() => run(async () => { await api.deleteSocialPost(p.id); await reload() }, sent ? 'Removed from the list' : 'Post deleted')}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Box>
  )
}

/** Write or edit a post: text, photo, accounts, and when. */
function Composer({ post, isConnected, onClose, onSaved }: {
  post: Partial<SocialPost>; isConnected: (p: IntegrationProvider) => boolean; onClose: () => void; onSaved: () => Promise<void>
}) {
  const { api } = useApp()
  const run = useAction()
  const file = useRef<HTMLInputElement>(null)
  const [caption, setCaption] = useState(post.caption ?? '')
  const [image, setImage] = useState<string | null>(post.image_url ?? null)
  const [targets, setTargets] = useState<SocialNetwork[]>(post.targets?.length ? post.targets : NETWORKS.filter(n => isConnected(n.provider)).map(n => n.id))
  const [when, setWhen] = useState<'now' | 'later'>(post.scheduled_at ? 'later' : 'now')
  const [date, setDate] = useState(post.scheduled_at ? localDate(post.scheduled_at) : today())
  const [time, setTime] = useState(post.scheduled_at ? localTime(post.scheduled_at) : '10:00')
  const [uploading, setUploading] = useState(false)
  const chosen = NETWORKS.filter(n => targets.includes(n.id))
  const limit = Math.min(2200, ...chosen.map(n => n.limit))
  const needsPhoto = chosen.filter(n => n.needsPhoto && !image)

  const save = (status: 'draft' | 'scheduled') => run(async () => {
    const scheduled_at = status === 'draft' ? (when === 'later' ? zonedIso(date, time) : null) : when === 'now' ? new Date().toISOString() : zonedIso(date, time)
    if (status === 'scheduled' && when === 'later' && Date.parse(scheduled_at!) < Date.now() - 60_000) throw new Error('That time has passed. Pick a later one, or Post now.')
    await api.saveSocialPost({ id: post.id, caption, image_url: image, targets, status, scheduled_at })
    await onSaved()
    onClose()
  }, status === 'draft' ? 'Draft saved' : when === 'now' ? 'Posting now' : `Scheduled for ${formatLocal(zonedIso(date, time), 'EEE d MMM, HH:mm')}`)

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{post.id ? 'Edit post' : 'New post'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField label="Caption" multiline minRows={4} value={caption} onChange={e => setCaption(e.target.value)}
            error={caption.length > limit} helperText={`${caption.length} / ${limit}${chosen.some(n => n.id === 'google') ? ' (Google Maps allows 1500)' : ''}`} />

          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>Photo {chosen.some(n => n.needsPhoto) ? '(Instagram and TikTok need one; TikTok takes JPEG)' : '(optional)'}</Typography>
            {image
              ? <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Box component="img" src={image} alt="The post’s photo" sx={{ width: 96, height: 96, objectFit: 'cover', borderRadius: '12px', border: `1px solid ${tokens.line}` }} />
                  <Button onClick={() => setImage(null)}>Remove</Button>
                </Stack>
              : <Button variant="outlined" startIcon={<PhotoIcon />} disabled={uploading} onClick={() => file.current?.click()}>{uploading ? 'Uploading…' : 'Add a photo'}</Button>}
            <input ref={file} type="file" accept="image/jpeg,image/png" hidden aria-label="Photo file" onChange={e => {
              const f = e.target.files?.[0]
              if (f) void run(async () => { setUploading(true); try { setImage(await api.uploadPhoto(f)) } finally { setUploading(false) } })
              e.target.value = ''
            }} />
          </Box>

          <Box role="group" aria-label="Post to">
            <Typography variant="body2" sx={{ mb: 0.5 }}>Post to</Typography>
            <Stack>
              {NETWORKS.map(n => {
                const ok = isConnected(n.provider)
                return (
                  <FormControlLabel key={n.id} disabled={!ok}
                    control={<Checkbox checked={targets.includes(n.id)} onChange={e => setTargets(e.target.checked ? [...targets, n.id] : targets.filter(t => t !== n.id))} />}
                    label={<Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Mark icon={n.icon} /><span>{n.name}</span>
                      {!ok && <Typography variant="caption" sx={{ color: 'text.secondary' }}>not connected</Typography>}
                    </Stack>} />
                )
              })}
            </Stack>
          </Box>

          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>When</Typography>
            <RadioGroup value={when} onChange={e => setWhen(e.target.value as 'now' | 'later')}>
              <FormControlLabel value="now" control={<Radio />} label="Post now" />
              <FormControlLabel value="later" control={<Radio />} label="Schedule" />
            </RadioGroup>
            {when === 'later' && (
              <Stack spacing={1.5} sx={{ mt: 1, maxWidth: 260 }}>
                <TextField type="date" label="Date" value={date} onChange={e => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today() } }} />
                <TextField type="time" label="Time (Madrid)" value={time} onChange={e => setTime(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              </Stack>
            )}
          </Box>
          {needsPhoto.length > 0 && <Alert severity="warning">{needsPhoto.map(n => n.name).join(' and ')} need{needsPhoto.length === 1 ? 's' : ''} a photo.</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose} sx={{ mr: 'auto' }}>Cancel</Button>
        <Button variant="outlined" onClick={() => save('draft')}>Save draft</Button>
        <Button variant="contained" onClick={() => save('scheduled')}>{when === 'now' ? 'Post now' : 'Schedule'}</Button>
      </DialogActions>
    </Dialog>
  )
}
