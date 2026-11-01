import { Alert, Box, Button, Card, CardActionArea, Chip, IconButton, InputAdornment, LinearProgress, Slider, Stack, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import PauseIcon from '@mui/icons-material/PauseRounded'
import NextIcon from '@mui/icons-material/SkipNextRounded'
import PrevIcon from '@mui/icons-material/SkipPreviousRounded'
import ShuffleIcon from '@mui/icons-material/ShuffleRounded'
import VolumeIcon from '@mui/icons-material/VolumeUpRounded'
import DragIcon from '@mui/icons-material/DragIndicator'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/CloseRounded'
import NextUpIcon from '@mui/icons-material/PlaylistPlayRounded'
import QueueAddIcon from '@mui/icons-material/PlaylistAddRounded'
import CafeAddIcon from '@mui/icons-material/LibraryAddRounded'
import CafeAddedIcon from '@mui/icons-material/LibraryAddCheckRounded'
import SpeakerIcon from '@mui/icons-material/SpeakerOutlined'
import MusicIcon from '@mui/icons-material/MusicNote'
import OpenIcon from '@mui/icons-material/OpenInNew'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useState, type ReactNode } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { CAFE_PLAYLIST_ID, playlistOrder, useCafeMusic, useWatchCafeMusic } from '../app/CafeSpeaker'
import { useAsync, useTick } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Empty, ErrorBox, SectionTitle, Tag } from '../components/common'
import { MusicCard } from '../components/MusicCard'
import { restrictToVerticalAxis } from '../components/dnd'
import type { CafeTrack, MusicPlaylist, MusicProvider, MyNowPlaying, SpotifyPlaylist } from '../../shared/types'
import { fonts, tokens } from '../theme'
import { msg, t, tn, tc } from '../i18n'
import { ThemeMusicShortcut } from '../components/ThemeDays'

const BRAND: Record<MusicProvider, { name: string; colour: string; soft: string; blurb: string; logo: ReactNode }> = {
  spotify: {
    name: 'Spotify', colour: '#1DB954', soft: '#E7F7EC',
    blurb: msg('Your playlists, played here or on your phone and speakers (Premium plays on your devices).'),
    logo: (
      <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden><circle cx="12" cy="12" r="12" fill="#1DB954" />
        <path d="M17.5 16.3a.75.75 0 0 1-1 .25c-2.8-1.7-6.3-2.1-10.4-1.2a.75.75 0 1 1-.33-1.46c4.5-1 8.4-.56 11.5 1.36.35.21.46.67.24 1.05zm1.4-3.2a.94.94 0 0 1-1.3.31c-3.2-2-8.1-2.55-11.9-1.4a.94.94 0 1 1-.54-1.8c4.3-1.3 9.7-.68 13.4 1.6.44.27.58.85.31 1.29zm.12-3.3C15.2 7.5 8.8 7.3 5.1 8.4a1.12 1.12 0 1 1-.65-2.15c4.3-1.3 11.3-1.05 15.7 1.57a1.12 1.12 0 0 1-1.15 1.93z" fill="#fff" /></svg>
    ),
  },
  youtube: {
    name: 'YouTube Music', colour: '#FF0033', soft: '#FDE8EC',
    blurb: msg('Your YouTube Music playlists, played right here in the page.'),
    logo: (
      <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden><circle cx="12" cy="12" r="12" fill="#FF0033" />
        <circle cx="12" cy="12" r="6.2" fill="none" stroke="#fff" strokeWidth="1.3" /><path d="M10.3 9.3v5.4l4.6-2.7z" fill="#fff" /></svg>
    ),
  },
}
const PROVIDERS: MusicProvider[] = ['spotify', 'youtube']

/**
 * Music. Top: the café's music (the YouTube Music account an admin connected): one device plays
 * it, anyone on the team controls it. Below: each person's own Spotify / YouTube Music, if they
 * want to connect it (only they see it).
 */
export function MusicPage() {
  const notify = useNotify()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<MusicProvider | null>(null)

  // Back from Spotify / Google: say how it went, then tidy the address bar.
  useEffect(() => {
    const ok = params.get('connected'), err = params.get('connect_error')
    if (!ok && !err) return
    if (ok) { notify(t('{name} connected', { name: BRAND[ok as MusicProvider]?.name ?? t('Music') }), 'success'); setTab(ok as MusicProvider) }
    if (err) notify(err, 'error')
    setParams({}, { replace: true })
  }, [params, setParams, notify])

  return (
    <>
      {/* No visible header: the player is the page. The title stays for screen readers. */}
      <Typography variant="h4" component="h1" sx={visuallyHidden}>{t('Music')}</Typography>
      <Stack spacing={3}>
        <ThemeMusicShortcut />
        <CafeMusicSection />
        <PersonalMusic tab={tab} setTab={setTab} />
      </Stack>
    </>
  )
}

/** Read by screen readers, not shown. */
const visuallyHidden = { position: 'absolute', width: '1px', height: '1px', p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function CafeMusicSection() {
  const music = useWatchCafeMusic()
  const { isAdmin } = useApp()
  if (!music || !music.library) return null
  if (music.library.provider === 'spotify') return <MusicCard />
  if (!music.enabled) {
    return (
      <Alert severity="info" action={isAdmin && <Button component={RouterLink} to="/connections" size="small">{t('Connect')}</Button>}>
        {t('No café music connected yet.')} {isAdmin ? t('Connect the café’s YouTube Music on Connections.') : t('An admin connects it on the Connections page.')}
      </Alert>
    )
  }
  return (
    <>
      <ErrorBox error={music.error} />
      <NowPlaying />
      <FindMusic />
      <Queue />
      <CafePlaylists />
    </>
  )
}

function NowPlaying() {
  const music = useCafeMusic()!
  const run = useAction()
  const s = music.state
  useTick(1000)
  const track = s?.queue[s.position]
  const live = music.live
  const elapsed = music.elapsed()
  const duration = s?.duration ?? 0
  const art = track?.image ?? s?.playlist?.image
  return (
    <Card component="section" aria-label={t('Now playing')} sx={{ overflow: 'hidden' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Box sx={{ width: { xs: '100%', sm: 132 }, maxWidth: 220, aspectRatio: '1', borderRadius: 3, overflow: 'hidden', flexShrink: 0, alignSelf: { xs: 'center', sm: 'flex-start' },
          background: `linear-gradient(135deg, ${BRAND.youtube.colour} 0%, ${tokens.espresso} 130%)`, display: 'grid', placeItems: 'center' }}>
          {art ? <Box component="img" src={art} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <MusicIcon sx={{ color: '#fff', fontSize: 52 }} />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: live ? tokens.matchaDeep : 'text.secondary' }}>
            {!live ? t('Nothing playing') : music.here ? t('Playing on this device') : t('Playing on {device}', { device: s?.device_name ?? t('another device') })}
          </Typography>
          <Typography variant="h5" component="h2" sx={{ lineHeight: 1.25, wordBreak: 'break-word' }}>{track?.title ?? t('Pick a playlist below')}</Typography>
          <Typography sx={{ color: 'text.secondary' }} noWrap>
            {[track?.artist, s?.playlist?.name].filter(Boolean).join(' · ') || `${BRAND.youtube.name}${music.library?.account ? ` · ${music.library.account}` : ''}`}
          </Typography>
          {/* Hidden until a song plays, but its room is kept, so starting one doesn't push the search results under the finger. */}
          <Box sx={{ mt: 1.5, visibility: live && track ? undefined : 'hidden' }}>
            <LinearProgress variant="determinate" value={duration ? Math.min(100, (elapsed / duration) * 100) : 0} aria-label={t('Song progress')}
              sx={{ height: 6, borderRadius: 3, bgcolor: tokens.surfaceAlt, '& .MuiLinearProgress-bar': { bgcolor: BRAND.youtube.colour } }} />
            <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{mmss(elapsed)}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{duration ? mmss(duration) : ''}</Typography>
            </Stack>
          </Box>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, mt: 1.5, flexWrap: 'wrap' }}>
            <IconButton aria-label={t('Previous song')} disabled={!live} onClick={() => run(() => music.control('previous'))}><PrevIcon /></IconButton>
            {s?.playing && live
              ? <IconButton aria-label={t('Pause')} onClick={() => run(() => music.control('pause'))} sx={{ bgcolor: BRAND.youtube.colour, color: '#fff', '&:hover': { bgcolor: BRAND.youtube.colour } }}><PauseIcon /></IconButton>
              : <IconButton aria-label={t('Play')} disabled={!live} onClick={() => run(() => music.control('play'))} sx={{ bgcolor: BRAND.youtube.colour, color: '#fff', '&:hover': { bgcolor: BRAND.youtube.colour }, '&.Mui-disabled': { bgcolor: tokens.surfaceAlt } }}><PlayIcon /></IconButton>}
            <IconButton aria-label={t('Next song')} disabled={!live} onClick={() => run(() => music.control('next'))}><NextIcon /></IconButton>
            {live && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', ml: { sm: 2 }, width: 150 }}>
                <VolumeIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                <Slider size="small" value={s?.volume ?? 80} aria-label={t('Volume')} key={music.here ? 'here' : s?.volume}
                  onChangeCommitted={(_, v) => void run(() => music.control('volume', v as number))} />
              </Stack>
            )}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2, alignItems: { sm: 'center' } }}>
            {!live && <Button variant="contained" startIcon={<SpeakerIcon />} onClick={() => run(() => music.claim())}>{t('Play on this device')}</Button>}
            {live && !music.here && <Button variant="outlined" startIcon={<SpeakerIcon />} onClick={() => run(() => music.claim())}>{t('Play here instead')}</Button>}
            {music.here && <Button onClick={() => run(() => music.release(), t('Stopped playing on this device'))}>{t('Stop playing on this device')}</Button>}
          </Stack>
        </Box>
      </Stack>
    </Card>
  )
}

/** The songs in play order: tap one to play it, drag to change the order, take one off, shuffle what's left. */
function Queue() {
  const music = useCafeMusic()!
  const run = useAction()
  const s = music.state
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  if (!s?.queue.length) return null
  const current = s.queue[s.position]
  const keys = s.queue.map((x, i) => `${i}:${x.id}`)
  const reorder = (queue: CafeTrack[]) => music.setQueue(s.playlist, queue, Math.max(0, queue.findIndex(x => x === current)))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    void run(() => reorder(arrayMove(s.queue, keys.indexOf(String(active.id)), keys.indexOf(String(over.id)))))
  }
  const shuffle = () => {
    const rest = s.queue.filter((_, i) => i !== s.position)
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]] }
    return run(() => music.setQueue(s.playlist, [current, ...rest], 0), t('Shuffled'))
  }
  // The song playing now stays where it is; the speaker doesn't restart it.
  const remove = (i: number) => run(() => music.setQueue(s.playlist, s.queue.filter((_, j) => j !== i), i < s.position ? s.position - 1 : s.position),
    t('Removed {title}', { title: s.queue[i].title }))
  return (
    <Card component="section" aria-label={t('Up next')}>
      <Stack direction="row" sx={{ alignItems: 'center', px: 2, pt: 1.5, pb: 1 }}>
        <Typography variant="h6" component="h2" sx={{ flex: 1 }}>{t('Up next')} <Typography component="span" sx={{ color: 'text.secondary' }}>· {t('{n} songs', { n: s.queue.length })}</Typography></Typography>
        <Button size="small" startIcon={<ShuffleIcon />} onClick={shuffle}>{t('Shuffle')}</Button>
      </Stack>
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          <Box role="list" aria-label={t('Queue')} sx={{ maxHeight: 420, overflowY: 'auto' }}>
            {s.queue.map((x, i) => (
              <QueueRow key={keys[i]} id={keys[i]} track={x} index={i} current={i === s.position} playing={i === s.position && s.playing && music.live}
                onPlay={() => run(() => music.control('jump', i))} onRemove={i === s.position ? undefined : () => remove(i)} />
            ))}
          </Box>
        </SortableContext>
      </DndContext>
    </Card>
  )
}

function QueueRow({ id, track, index, current, playing, onPlay, onRemove }: {
  id: string; track: CafeTrack; index: number; current: boolean; playing: boolean; onPlay: () => void; onRemove?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <Box ref={setNodeRef} role="listitem" aria-label={track.title} aria-current={current ? 'true' : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderTop: `1px solid ${tokens.line}`,
        bgcolor: current ? tokens.roseSoft : isDragging ? tokens.surfaceAlt : 'transparent', position: 'relative', zIndex: isDragging ? 2 : 'auto' }}>
      <IconButton size="small" {...attributes} {...listeners} aria-label={t('Move {name}', { name: track.title })} sx={{ cursor: 'grab', touchAction: 'none', color: tokens.inkFaint }}>
        <DragIcon fontSize="small" />
      </IconButton>
      <CardActionArea onClick={onPlay} aria-label={t('Play {title}', { title: track.title })} sx={{ display: 'flex', justifyContent: 'flex-start', gap: 1.25, borderRadius: 2, p: 0.5, minWidth: 0 }}>
        <Typography variant="body2" sx={{ width: 22, textAlign: 'right', color: current ? BRAND.youtube.colour : 'text.secondary', flexShrink: 0 }}>
          {playing ? '♪' : index + 1}
        </Typography>
        <Box sx={{ width: 40, height: 40, borderRadius: 1.5, overflow: 'hidden', flexShrink: 0, bgcolor: tokens.surfaceAlt, display: 'grid', placeItems: 'center' }}>
          {track.image ? <Box component="img" src={track.image} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <MusicIcon sx={{ fontSize: 18, color: tokens.inkFaint }} />}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: current ? 600 : 400 }} noWrap>{track.title}</Typography>
          {track.artist && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} noWrap>{track.artist}</Typography>}
        </Box>
      </CardActionArea>
      {onRemove
        ? <Tooltip title={t('Remove from the queue')}><IconButton size="small" aria-label={t('Remove {title} from the queue', { title: track.title })} onClick={onRemove} sx={{ color: tokens.inkFaint }}><CloseIcon fontSize="small" /></IconButton></Tooltip>
        : <Box sx={{ width: 34, flexShrink: 0 }} />}
    </Box>
  )
}

/** Search all of YouTube Music: play a song now or next, add it to the queue, or play a whole playlist. */
function FindMusic() {
  const music = useCafeMusic()!
  const { api } = useApp()
  const run = useAction()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'songs' | 'playlists'>('songs')
  const [asked, setAsked] = useState<{ q: string; kind: 'songs' | 'playlists' } | null>(null)
  const results = useAsync('music-search', () => (asked ? api.cafeSearch(asked.q, asked.kind) : Promise.resolve(null)), [asked?.q, asked?.kind])
  const search = (k = kind) => { if (q.trim().length >= 2) setAsked({ q: q.trim(), kind: k }) }
  const r = asked && results.data
  const s = music.state
  /** The song the speaker has on now (playing or paused), if it's this one. */
  const isOn = (x: CafeTrack) => music.live && s?.queue[s.position]?.id === x.id
  /** Songs already in the café playlist (each goes in once). */
  const inCafe = new Set((s?.cafe_playlist ?? []).map(x => x.id))
  // One press plays it: pause and resume when it's the one on; when it's next in line with nothing playing, this device starts it.
  const press = (x: CafeTrack) => (isOn(x) ? run(() => music.control(s?.playing ? 'pause' : 'play'))
    : s?.queue[s.position]?.id === x.id ? run(() => music.claim())
      : run(() => music.addTracks([x], 'now'), t('Playing {name}', { name: x.title })))
  return (
    <Card component="section" aria-label={t('Find music')}>
      <Box component="form" onSubmit={e => { e.preventDefault(); search() }} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', p: 2, pb: r ? 1 : 2 }}>
        <TextField value={q} onChange={e => setQ(e.target.value)} placeholder={t('Search songs, artists or playlists')} size="small" sx={{ flex: '1 1 240px' }}
          slotProps={{ input: {
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            endAdornment: (q || asked) && <InputAdornment position="end">
              <IconButton size="small" edge="end" aria-label={t('Clear search')} onClick={() => { setQ(''); setAsked(null) }}><CloseIcon fontSize="small" /></IconButton>
            </InputAdornment>,
          }, htmlInput: { 'aria-label': t('Search music') } }} />
        <ToggleButtonGroup exclusive size="small" value={kind} aria-label={t('Search for')} onChange={(_, v) => { if (v) { setKind(v); if (asked) search(v) } }}>
          <ToggleButton value="songs" sx={{ px: 1.75 }}>{t('Songs')}</ToggleButton>
          <ToggleButton value="playlists" sx={{ px: 1.75 }}>{t('Playlists')}</ToggleButton>
        </ToggleButtonGroup>
        <Button type="submit" variant="contained" disabled={q.trim().length < 2}>{t('Search')}</Button>
      </Box>
      <ErrorBox error={asked ? results.error : null} />
      {asked && results.loading && !r && <Typography variant="body2" sx={{ color: 'text.secondary', px: 2, pb: 2 }}>{t('Searching…')}</Typography>}
      {r && r.tracks.length + r.playlists.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary', px: 2, pb: 2 }}>{t('Nothing found for “{q}”.', { q: asked.q })}</Typography>}
      {r && r.tracks.length > 0 && (
        <Box role="list" aria-label={t('Songs found')} sx={{ maxHeight: 360, overflowY: 'auto' }}>
          {r.tracks.map(x => {
            const on = isOn(x), playing = on && !!s?.playing, added = inCafe.has(x.id)
            return (
              <Stack key={x.id} role="listitem" aria-label={x.title} aria-current={on ? 'true' : undefined} direction="row" spacing={1.25}
                sx={{ alignItems: 'center', px: 2, py: 0.75, borderTop: `1px solid ${tokens.line}`, bgcolor: on ? tokens.roseSoft : undefined }}>
                <Thumb src={x.image} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: on ? 600 : undefined }} noWrap>{x.title}</Typography>
                  {(x.artist || added) && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} noWrap>{[x.artist, added && t('In the café playlist')].filter(Boolean).join(' · ')}</Typography>}
                </Box>
                <Tooltip title={playing ? t('Pause') : t('Play now')}>
                  <IconButton size="small" aria-label={playing ? t('Pause {title}', { title: x.title }) : t('Play {title} now', { title: x.title })} onClick={() => press(x)}
                    sx={on ? { color: BRAND.youtube.colour } : undefined}>{playing ? <PauseIcon /> : <PlayIcon />}</IconButton>
                </Tooltip>
                <Tooltip title={added ? t('Remove from the café playlist') : t('Add to the café playlist')}>
                  <IconButton size="small" aria-pressed={added} sx={added ? { color: tokens.matchaDeep } : undefined}
                    aria-label={added ? t('Remove {title} from the café playlist', { title: x.title }) : t('Add {title} to the café playlist', { title: x.title })}
                    onClick={() => (added ? run(() => music.removeFromCafePlaylist(x.id), t('Removed {title} from the café playlist', { title: x.title }))
                      : run(() => music.addToCafePlaylist(x), t('Added {title} to the café playlist', { title: x.title })))}>
                    {added ? <CafeAddedIcon fontSize="small" /> : <CafeAddIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('Play next')}><IconButton size="small" aria-label={t('Play {title} next', { title: x.title })} onClick={() => run(() => music.addTracks([x], 'next'), t('{title} plays next', { title: x.title }))}><NextUpIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title={t('Add to the end of the queue')}><IconButton size="small" aria-label={t('Add {title} to the queue', { title: x.title })} onClick={() => run(() => music.addTracks([x], 'end'), t('Added {title}', { title: x.title }))}><QueueAddIcon fontSize="small" /></IconButton></Tooltip>
              </Stack>
            )
          })}
        </Box>
      )}
      {r && r.playlists.length > 0 && (
        <Box role="list" aria-label={t('Playlists found')} sx={{ maxHeight: 360, overflowY: 'auto' }}>
          {r.playlists.map(p => (
            <Stack key={p.id} role="listitem" aria-label={p.name} direction="row" spacing={1.25} sx={{ alignItems: 'center', px: 2, py: 0.75, borderTop: `1px solid ${tokens.line}` }}>
              <Thumb src={p.image} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" noWrap>{p.name}</Typography>
                {p.owner && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} noWrap>{p.owner}</Typography>}
              </Box>
              <Button size="small" startIcon={<PlayIcon />} onClick={() => run(() => music.playPlaylist(p), music.live ? t('Playing {name}', { name: p.name }) : t('{name} is up next', { name: p.name }))}>{t('Play')}</Button>
            </Stack>
          ))}
        </Box>
      )}
    </Card>
  )
}

function Thumb({ src }: { src?: string }) {
  return (
    <Box sx={{ width: 40, height: 40, borderRadius: 1.5, overflow: 'hidden', flexShrink: 0, bgcolor: tokens.surfaceAlt, display: 'grid', placeItems: 'center' }}>
      {src ? <Box component="img" src={src} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <MusicIcon sx={{ fontSize: 18, color: tokens.inkFaint }} />}
    </Box>
  )
}

/**
 * The café account's YouTube Music playlists, in the order they play: when one ends, the next
 * starts (back to the first after the last). Drag to change the order; tap one to play it now.
 */
function CafePlaylists() {
  const music = useCafeMusic()!
  const run = useAction()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const lib = music.library!
  const lists = playlistOrder(music.state?.playlist_order ?? [], lib)
  if (!lists.length) return <Empty>{t('The café’s YouTube Music account has no playlists yet. Make one in YouTube Music and it shows up here.')}</Empty>
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const ids = lists.map(p => p.id)
    void run(() => music.setPlaylistOrder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))), t('Playlist order saved'))
  }
  return (
    <Card component="section" aria-label={t('Café playlists')}>
      <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
        <Typography variant="h6" component="h2">{t('Playlists')}</Typography>
        {lists.length > 1 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('They play one after another, in this order. Drag to change it.')}</Typography>}
      </Box>
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
        <SortableContext items={lists.map(p => p.id)} strategy={verticalListSortingStrategy}>
          <Box role="list" aria-label={t('Café playlists')}>
            {lists.map((p, i) => (
              <PlaylistRow key={p.id} playlist={p} index={i} approved={p.id === lib.approved?.id} playing={music.state?.playlist?.id === p.id}
                onPlay={() => run(() => music.playPlaylist(p), music.live ? t('Playing {name}', { name: p.name }) : t('{name} is up next. Press Play on this device, or on the café tablet.', { name: p.name }))} />
            ))}
          </Box>
        </SortableContext>
      </DndContext>
    </Card>
  )
}

function PlaylistRow({ playlist: p, index, approved, playing, onPlay }: { playlist: SpotifyPlaylist; index: number; approved: boolean; playing: boolean; onPlay: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id })
  return (
    <Box ref={setNodeRef} role="listitem" aria-label={p.name} style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: 0.5, borderTop: `1px solid ${tokens.line}`, position: 'relative', zIndex: isDragging ? 2 : 'auto',
        bgcolor: playing ? tokens.roseSoft : isDragging ? tokens.surfaceAlt : tokens.surface }}>
      <IconButton size="small" {...attributes} {...listeners} aria-label={t('Move {name}', { name: p.name })} sx={{ cursor: 'grab', touchAction: 'none', color: tokens.inkFaint }}>
        <DragIcon fontSize="small" />
      </IconButton>
      <CardActionArea aria-label={p.name} aria-pressed={playing} onClick={onPlay}
        sx={{ pr: 2, py: 1.25, display: 'flex', justifyContent: 'flex-start', gap: 1.5 }}>
        <Typography variant="body2" sx={{ width: 18, color: 'text.secondary', textAlign: 'right', flexShrink: 0 }}>{index + 1}</Typography>
        <Cover playlist={{ ...p, provider: 'youtube' }} size={48} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 500 }} noWrap>{p.name}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{tn(p.tracks, '{n} song', '{n} songs')}{p.id === CAFE_PLAYLIST_ID && p.owner ? ` · ${p.owner}` : ''}</Typography>
        </Box>
        {approved && <Tag>{t('Approved')}</Tag>}
        {playing && <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Playing')}</Tag>}
      </CardActionArea>
    </Box>
  )
}

/** Each person's own Spotify / YouTube Music: optional, only they see it. */
function PersonalMusic({ tab, setTab }: { tab: MusicProvider | null; setTab: (p: MusicProvider) => void }) {
  const { api } = useApp()
  const run = useAction()
  const mine = useAsync('my-music', () => api.myMusic(), [])
  const connected = PROVIDERS.filter(p => mine.data?.accounts.some(a => a.provider === p))
  const active = tab && connected.includes(tab) ? tab : connected[0] ?? null
  if (!mine.data) return <ErrorBox error={mine.error} />
  return (
    <Box component="section" aria-label={connected.length ? t('Your own music') : t('Connect a music account')}>
      <SectionTitle>{t('Your own music')}</SectionTitle>
      {connected.length === 0 ? (
        <Card sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
            {t('Optional: connect your own Spotify or YouTube Music to play your playlists here. Only you see your account.')}
          </Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            {PROVIDERS.map(p => <ConnectButton key={p} provider={p} disabled={!mine.data!.configured[p]} onClick={() => run(() => api.connectMyMusic(p))} />)}
          </Stack>
        </Card>
      ) : (
        <>
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2.5 }}>
            {mine.data.accounts.map(a => (
              <Chip key={a.provider} variant="outlined"
                avatar={<Logo provider={a.provider} />}
                label={`${BRAND[a.provider].name}${a.account_label ? ` · ${a.account_label}` : ''}`}
                onDelete={() => run(() => api.disconnectMyMusic(a.provider), t('{name} disconnected', { name: BRAND[a.provider].name }))} />
            ))}
            {PROVIDERS.filter(p => !connected.includes(p) && mine.data!.configured[p]).map(p => (
              <ConnectButton key={p} provider={p} small onClick={() => run(() => api.connectMyMusic(p))} />
            ))}
          </Stack>
          {connected.length > 1 && (
            <Tabs value={active} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} aria-label={t('Music service')}>
              {connected.map(p => <Tab key={p} value={p} label={BRAND[p].name} />)}
            </Tabs>
          )}
          {active && <Library key={active} provider={active} />}
        </>
      )}
    </Box>
  )
}

/** A service's logo at icon size, centred on the text beside it (a block, so it doesn't sit on the text's baseline). */
function Logo({ provider, size = 20 }: { provider: MusicProvider; size?: number }) {
  return <Box component="span" sx={{ display: 'flex', width: size, height: size, flexShrink: 0, '& > svg': { display: 'block' } }}>{BRAND[provider].logo}</Box>
}

/** Connect Spotify / Connect YouTube Music: the same height for both, the logo the same size and in line with the words. */
function ConnectButton({ provider, small, disabled, onClick }: { provider: MusicProvider; small?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <Button variant="outlined" size={small ? 'small' : 'medium'} disabled={disabled} onClick={onClick} startIcon={<Logo provider={provider} size={small ? 18 : 20} />}
      sx={{ height: small ? 32 : 40, gap: 1, '& .MuiButton-startIcon': { display: 'flex', alignItems: 'center', m: 0 } }}>
      {t('Connect {name}', { name: BRAND[provider].name })}
    </Button>
  )
}

function Library({ provider }: { provider: MusicProvider }) {
  const { api } = useApp()
  const lists = useAsync(`my-playlists-${provider}`, () => api.myPlaylists(provider), [provider])
  const [picked, setPicked] = useState<MusicPlaylist | null>(null)
  const current = picked ?? lists.data?.[0] ?? null
  return (
    <>
      <ErrorBox error={lists.error} />
      {lists.data?.length === 0 && <Empty>{t('No playlists in this {name} account yet. Make one in the app and it shows up here.', { name: BRAND[provider].name })}</Empty>}
      {current && (
        <Stack spacing={3}>
          <Player playlist={current} />
          <Card>
            <Box role="list" aria-label={t('Your playlists')}>
              {lists.data!.map(p => {
                const on = p.id === current.id
                return (
                  <Box key={p.id} role="listitem" sx={{ borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
                    <CardActionArea onClick={() => setPicked(p)} aria-pressed={on} aria-label={p.name}
                      sx={{ px: 2, py: 1.25, display: 'flex', justifyContent: 'flex-start', gap: 1.5, ...(on ? { bgcolor: tokens.roseSoft } : {}) }}>
                      <Cover playlist={p} size={48} />
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontWeight: 500 }} noWrap>{p.name}</Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{tn(p.tracks, '{n} song', '{n} songs')}</Typography>
                      </Box>
                      {on && <Typography variant="caption" sx={{ color: BRAND[provider].colour, fontWeight: 500 }}>{t('Selected')}</Typography>}
                    </CardActionArea>
                  </Box>
                )
              })}
            </Box>
          </Card>
        </Stack>
      )}
    </>
  )
}

function Cover({ playlist, size }: { playlist: MusicPlaylist; size?: number }) {
  const b = BRAND[playlist.provider]
  return (
    <Box sx={{ width: size ?? '100%', aspectRatio: '1', borderRadius: 2, overflow: 'hidden', flexShrink: 0,
      background: `linear-gradient(135deg, ${b.colour} 0%, ${tokens.espresso} 130%)`, display: 'grid', placeItems: 'center' }}>
      {playlist.image
        ? <Box component="img" src={playlist.image} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <MusicIcon sx={{ color: '#fff', fontSize: size ? size / 2 : 40, opacity: 0.9 }} />}
    </Box>
  )
}

function Player({ playlist }: { playlist: MusicPlaylist }) {
  const { api } = useApp()
  const run = useAction()
  const b = BRAND[playlist.provider]
  const sample = playlist.id.startsWith('demo-')
  const spotify = playlist.provider === 'spotify'
  const now = useAsync(`my-now-playing-${playlist.provider}`, (): Promise<MyNowPlaying> => spotify ? api.myNowPlaying() : Promise.resolve({ playing: false }), [spotify],
    { refetchInterval: spotify ? 20_000 : undefined })
  const src = playlist.provider === 'spotify'
    ? `https://open.spotify.com/embed/playlist/${encodeURIComponent(playlist.id)}?theme=0`
    : `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(playlist.id)}`
  return (
    <Card component="section" aria-label={t('Player')} sx={{ position: { lg: 'sticky' }, top: { lg: 76 }, overflow: 'hidden' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 2, bgcolor: b.soft }}>
        <Cover playlist={playlist} size={56} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.4 }}>{b.name}</Typography>
          <Typography sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: '1.1rem' }} noWrap>{playlist.name}</Typography>
        </Box>
        <Button size="small" endIcon={<OpenIcon fontSize="small" />} href={playlist.url} target="_blank" rel="noreferrer">{tc('verb', 'Open')}</Button>
      </Stack>
      {sample ? (
        <Box sx={{ p: 3, textAlign: 'center', bgcolor: tokens.surfaceAlt }}>
          <MusicIcon sx={{ fontSize: 40, color: b.colour }} />
          <Typography sx={{ fontWeight: 500, mt: 1 }}>{t('The {name} player appears here', { name: b.name })}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Sample data: connect a real account on the live app.')}</Typography>
        </Box>
      ) : (
        <Box component="iframe" key={src} src={src} title={t('{provider} player: {name}', { provider: b.name, name: playlist.name })} loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          sx={{ display: 'block', width: '100%', border: 0, height: playlist.provider === 'spotify' ? 380 : 'auto', aspectRatio: playlist.provider === 'youtube' ? '16 / 9' : undefined }} />
      )}
      {playlist.provider === 'spotify' && (
        <Stack spacing={1} sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <SpeakerIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1, minWidth: 0 }} noWrap>
              {now.data?.playing ? `${now.data.track ?? ''}${now.data.artist ? ` · ${now.data.artist}` : ''}` : t('Nothing playing on your devices')}
            </Typography>
            {now.data?.playing && now.data.device && <Tag fg={tokens.matchaDeep} bg={tokens.matchaSoft}>{t('On {device}', { device: now.data.device })}</Tag>}
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" startIcon={<PlayIcon />} sx={{ bgcolor: b.colour, color: '#fff', '&:hover': { bgcolor: b.colour, filter: 'brightness(0.92)' } }}
              onClick={() => run(() => api.playMySpotify(playlist.id), t('Playing {name}', { name: playlist.name }))}>{t('Play on my devices')}</Button>
            {now.data?.playing && <Button variant="outlined" startIcon={<PauseIcon />} onClick={() => run(() => api.pauseMySpotify(), t('Paused'))}>{t('Pause')}</Button>}
          </Stack>
        </Stack>
      )}
    </Card>
  )
}
