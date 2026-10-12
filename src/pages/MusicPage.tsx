import { Alert, Box, Button, Card, CardActionArea, Chip, IconButton, LinearProgress, Slider, Stack, Tab, Tabs, Typography } from '@mui/material'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import PauseIcon from '@mui/icons-material/PauseRounded'
import NextIcon from '@mui/icons-material/SkipNextRounded'
import PrevIcon from '@mui/icons-material/SkipPreviousRounded'
import ShuffleIcon from '@mui/icons-material/ShuffleRounded'
import VolumeIcon from '@mui/icons-material/VolumeUpRounded'
import DragIcon from '@mui/icons-material/DragIndicator'
import SpeakerIcon from '@mui/icons-material/SpeakerOutlined'
import MusicIcon from '@mui/icons-material/MusicNote'
import OpenIcon from '@mui/icons-material/OpenInNew'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useState, type ReactNode } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useCafeMusic, useWatchCafeMusic } from '../app/CafeSpeaker'
import { useAsync, useTick } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, SectionTitle, Tag } from '../components/common'
import { MusicCard } from '../components/MusicCard'
import { restrictToVerticalAxis } from '../components/dnd'
import type { CafeTrack, MusicPlaylist, MusicProvider, MyNowPlaying } from '../../shared/types'
import { fonts, tokens } from '../theme'

const BRAND: Record<MusicProvider, { name: string; colour: string; soft: string; blurb: string; logo: ReactNode }> = {
  spotify: {
    name: 'Spotify', colour: '#1DB954', soft: '#E7F7EC',
    blurb: 'Your playlists, played here or on your phone and speakers (Premium plays on your devices).',
    logo: (
      <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden><circle cx="12" cy="12" r="12" fill="#1DB954" />
        <path d="M17.5 16.3a.75.75 0 0 1-1 .25c-2.8-1.7-6.3-2.1-10.4-1.2a.75.75 0 1 1-.33-1.46c4.5-1 8.4-.56 11.5 1.36.35.21.46.67.24 1.05zm1.4-3.2a.94.94 0 0 1-1.3.31c-3.2-2-8.1-2.55-11.9-1.4a.94.94 0 1 1-.54-1.8c4.3-1.3 9.7-.68 13.4 1.6.44.27.58.85.31 1.29zm.12-3.3C15.2 7.5 8.8 7.3 5.1 8.4a1.12 1.12 0 1 1-.65-2.15c4.3-1.3 11.3-1.05 15.7 1.57a1.12 1.12 0 0 1-1.15 1.93z" fill="#fff" /></svg>
    ),
  },
  youtube: {
    name: 'YouTube Music', colour: '#FF0033', soft: '#FDE8EC',
    blurb: 'Your YouTube Music playlists, played right here in the page.',
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
    if (ok) { notify(`${BRAND[ok as MusicProvider]?.name ?? 'Music'} connected`, 'success'); setTab(ok as MusicProvider) }
    if (err) notify(err, 'error')
    setParams({}, { replace: true })
  }, [params, setParams, notify])

  return (
    <>
      <PageHeader eyebrow="What's on" title="Music"
        subtitle="The café’s music: play it on the café tablet or computer, and control it from any phone." />
      <Stack spacing={3}>
        <CafeMusicSection />
        <PersonalMusic tab={tab} setTab={setTab} />
      </Stack>
    </>
  )
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function CafeMusicSection() {
  const music = useWatchCafeMusic()
  const { isAdmin } = useApp()
  if (!music || !music.library) return null
  if (music.library.provider === 'spotify') return <MusicCard />
  if (!music.enabled) {
    return (
      <Alert severity="info" action={isAdmin && <Button component={RouterLink} to="/connections" size="small">Connect</Button>}>
        No café music connected yet. {isAdmin ? 'Connect the café’s YouTube Music on Connections.' : 'An admin connects it on the Connections page.'}
      </Alert>
    )
  }
  return (
    <>
      <ErrorBox error={music.error} />
      <NowPlaying />
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
    <Card component="section" aria-label="Now playing" sx={{ overflow: 'hidden' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Box sx={{ width: { xs: '100%', sm: 132 }, maxWidth: 220, aspectRatio: '1', borderRadius: 3, overflow: 'hidden', flexShrink: 0, alignSelf: { xs: 'center', sm: 'flex-start' },
          background: `linear-gradient(135deg, ${BRAND.youtube.colour} 0%, ${tokens.espresso} 130%)`, display: 'grid', placeItems: 'center' }}>
          {art ? <Box component="img" src={art} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <MusicIcon sx={{ color: '#fff', fontSize: 52 }} />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: live ? tokens.matchaDeep : 'text.secondary' }}>
            {!live ? 'Nothing playing' : music.here ? 'Playing on this device' : `Playing on ${s?.device_name ?? 'another device'}`}
          </Typography>
          <Typography variant="h5" component="h2" sx={{ lineHeight: 1.25, wordBreak: 'break-word' }}>{track?.title ?? 'Pick a playlist below'}</Typography>
          <Typography sx={{ color: 'text.secondary' }} noWrap>
            {[track?.artist, s?.playlist?.name].filter(Boolean).join(' · ') || `${BRAND.youtube.name}${music.library?.account ? ` · ${music.library.account}` : ''}`}
          </Typography>
          {live && track && (
            <Box sx={{ mt: 1.5 }}>
              <LinearProgress variant="determinate" value={duration ? Math.min(100, (elapsed / duration) * 100) : 0} aria-label="Song progress"
                sx={{ height: 6, borderRadius: 3, bgcolor: tokens.surfaceAlt, '& .MuiLinearProgress-bar': { bgcolor: BRAND.youtube.colour } }} />
              <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{mmss(elapsed)}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{duration ? mmss(duration) : ''}</Typography>
              </Stack>
            </Box>
          )}
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, mt: 1.5, flexWrap: 'wrap' }}>
            <IconButton aria-label="Previous song" disabled={!live} onClick={() => run(() => music.control('previous'))}><PrevIcon /></IconButton>
            {s?.playing && live
              ? <IconButton aria-label="Pause" onClick={() => run(() => music.control('pause'))} sx={{ bgcolor: BRAND.youtube.colour, color: '#fff', '&:hover': { bgcolor: BRAND.youtube.colour } }}><PauseIcon /></IconButton>
              : <IconButton aria-label="Play" disabled={!live} onClick={() => run(() => music.control('play'))} sx={{ bgcolor: BRAND.youtube.colour, color: '#fff', '&:hover': { bgcolor: BRAND.youtube.colour }, '&.Mui-disabled': { bgcolor: tokens.surfaceAlt } }}><PlayIcon /></IconButton>}
            <IconButton aria-label="Next song" disabled={!live} onClick={() => run(() => music.control('next'))}><NextIcon /></IconButton>
            {live && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', ml: { sm: 2 }, width: 150 }}>
                <VolumeIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                <Slider size="small" value={s?.volume ?? 80} aria-label="Volume" key={music.here ? 'here' : s?.volume}
                  onChangeCommitted={(_, v) => void run(() => music.control('volume', v as number))} />
              </Stack>
            )}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2, alignItems: { sm: 'center' } }}>
            {!live && <Button variant="contained" startIcon={<SpeakerIcon />} onClick={() => run(() => music.claim())}>Play on this device</Button>}
            {live && !music.here && <Button variant="outlined" startIcon={<SpeakerIcon />} onClick={() => run(() => music.claim())}>Play here instead</Button>}
            {music.here && <Button onClick={() => run(() => music.release(), 'Stopped playing on this device')}>Stop playing on this device</Button>}
            {!live && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Use the café tablet or computer that’s connected to the speaker. Then anyone on the team can control it from their phone.
              </Typography>
            )}
          </Stack>
        </Box>
      </Stack>
    </Card>
  )
}

/** The songs in play order: tap one to play it, drag to change the order, shuffle what's left. */
function Queue() {
  const music = useCafeMusic()!
  const run = useAction()
  const s = music.state
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  if (!s?.queue.length) return null
  const current = s.queue[s.position]
  const keys = s.queue.map((t, i) => `${i}:${t.id}`)
  const reorder = (queue: CafeTrack[]) => music.setQueue(s.playlist, queue, Math.max(0, queue.findIndex(t => t === current)))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    void run(() => reorder(arrayMove(s.queue, keys.indexOf(String(active.id)), keys.indexOf(String(over.id)))))
  }
  const shuffle = () => {
    const rest = s.queue.filter((_, i) => i !== s.position)
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]] }
    return run(() => music.setQueue(s.playlist, [current, ...rest], 0), 'Shuffled')
  }
  return (
    <Card component="section" aria-label="Up next">
      <Stack direction="row" sx={{ alignItems: 'center', px: 2, pt: 1.5, pb: 1 }}>
        <Typography variant="h6" component="h2" sx={{ flex: 1 }}>Up next <Typography component="span" sx={{ color: 'text.secondary' }}>· {s.queue.length} songs</Typography></Typography>
        <Button size="small" startIcon={<ShuffleIcon />} onClick={shuffle}>Shuffle</Button>
      </Stack>
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          <Box role="list" aria-label="Queue" sx={{ maxHeight: 420, overflowY: 'auto' }}>
            {s.queue.map((t, i) => (
              <QueueRow key={keys[i]} id={keys[i]} track={t} index={i} current={i === s.position} playing={i === s.position && s.playing && music.live}
                onPlay={() => run(() => music.control('jump', i))} />
            ))}
          </Box>
        </SortableContext>
      </DndContext>
    </Card>
  )
}

function QueueRow({ id, track, index, current, playing, onPlay }: { id: string; track: CafeTrack; index: number; current: boolean; playing: boolean; onPlay: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <Box ref={setNodeRef} role="listitem" aria-label={track.title} aria-current={current ? 'true' : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderTop: `1px solid ${tokens.line}`,
        bgcolor: current ? tokens.roseSoft : isDragging ? tokens.surfaceAlt : 'transparent', position: 'relative', zIndex: isDragging ? 2 : 'auto' }}>
      <IconButton size="small" {...attributes} {...listeners} aria-label={`Move ${track.title}`} sx={{ cursor: 'grab', touchAction: 'none', color: tokens.inkFaint }}>
        <DragIcon fontSize="small" />
      </IconButton>
      <CardActionArea onClick={onPlay} aria-label={`Play ${track.title}`} sx={{ display: 'flex', justifyContent: 'flex-start', gap: 1.25, borderRadius: 2, p: 0.5, minWidth: 0 }}>
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
    </Box>
  )
}

function CafePlaylists() {
  const music = useCafeMusic()!
  const run = useAction()
  const lib = music.library!
  const lists = [...lib.playlists].sort((a, b) => Number(b.id === lib.approved?.id) - Number(a.id === lib.approved?.id))
  if (!lists.length) return <Empty>The café’s YouTube Music account has no playlists yet. Make one in YouTube Music and it shows up here.</Empty>
  return (
    <Card component="section" aria-label="Café playlists">
      <Typography variant="h6" component="h2" sx={{ px: 2, pt: 1.5, pb: 1 }}>Playlists</Typography>
      <Box role="list" aria-label="Café playlists">
        {lists.map(p => {
          const on = music.state?.playlist?.id === p.id
          return (
            <Box key={p.id} role="listitem" sx={{ borderTop: `1px solid ${tokens.line}` }}>
              <CardActionArea aria-label={p.name} aria-pressed={on}
                onClick={() => run(() => music.playPlaylist(p), music.live ? `Playing ${p.name}` : `${p.name} is up next. Press Play on this device, or on the café tablet.`)}
                sx={{ px: 2, py: 1.25, display: 'flex', justifyContent: 'flex-start', gap: 1.5, ...(on ? { bgcolor: tokens.roseSoft } : {}) }}>
                <Cover playlist={{ ...p, provider: 'youtube' }} size={48} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontWeight: 500 }} noWrap>{p.name}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{p.tracks} {p.tracks === 1 ? 'song' : 'songs'}</Typography>
                </Box>
                {p.id === lib.approved?.id && <Tag>Approved</Tag>}
                {on && <Tag fg={tokens.goodFg} bg={tokens.goodBg}>Playing</Tag>}
              </CardActionArea>
            </Box>
          )
        })}
      </Box>
    </Card>
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
    <Box component="section" aria-label={connected.length ? 'Your own music' : 'Connect a music account'}>
      <SectionTitle>Your own music</SectionTitle>
      {connected.length === 0 ? (
        <Card sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
            Optional: connect your own Spotify or YouTube Music to play your playlists here. Only you see your account.
          </Typography>
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            {PROVIDERS.map(p => (
              <Button key={p} variant="outlined" disabled={!mine.data!.configured[p]} onClick={() => run(() => api.connectMyMusic(p))}
                startIcon={<Box sx={{ width: 18, height: 18 }}>{BRAND[p].logo}</Box>}>Connect {BRAND[p].name}</Button>
            ))}
          </Stack>
        </Card>
      ) : (
        <>
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2.5 }}>
            {mine.data.accounts.map(a => (
              <Chip key={a.provider} variant="outlined"
                avatar={<Box sx={{ width: 20, height: 20, ml: 0.5 }}>{BRAND[a.provider].logo}</Box>}
                label={`${BRAND[a.provider].name}${a.account_label ? ` · ${a.account_label}` : ''}`}
                onDelete={() => run(() => api.disconnectMyMusic(a.provider), `${BRAND[a.provider].name} disconnected`)} />
            ))}
            {PROVIDERS.filter(p => !connected.includes(p) && mine.data!.configured[p]).map(p => (
              <Button key={p} size="small" onClick={() => run(() => api.connectMyMusic(p))}>Connect {BRAND[p].name}</Button>
            ))}
          </Stack>
          {connected.length > 1 && (
            <Tabs value={active} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} aria-label="Music service">
              {connected.map(p => <Tab key={p} value={p} label={BRAND[p].name} />)}
            </Tabs>
          )}
          {active && <Library key={active} provider={active} />}
        </>
      )}
    </Box>
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
      {lists.data?.length === 0 && <Empty>No playlists in this {BRAND[provider].name} account yet. Make one in the app and it shows up here.</Empty>}
      {current && (
        <Stack spacing={3}>
          <Player playlist={current} />
          <Card>
            <Box role="list" aria-label="Your playlists">
              {lists.data!.map(p => {
                const on = p.id === current.id
                return (
                  <Box key={p.id} role="listitem" sx={{ borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
                    <CardActionArea onClick={() => setPicked(p)} aria-pressed={on} aria-label={p.name}
                      sx={{ px: 2, py: 1.25, display: 'flex', justifyContent: 'flex-start', gap: 1.5, ...(on ? { bgcolor: tokens.roseSoft } : {}) }}>
                      <Cover playlist={p} size={48} />
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontWeight: 500 }} noWrap>{p.name}</Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{p.tracks} {p.tracks === 1 ? 'song' : 'songs'}</Typography>
                      </Box>
                      {on && <Typography variant="caption" sx={{ color: BRAND[provider].colour, fontWeight: 500 }}>Selected</Typography>}
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
    <Card component="section" aria-label="Player" sx={{ position: { lg: 'sticky' }, top: { lg: 76 }, overflow: 'hidden' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 2, bgcolor: b.soft }}>
        <Cover playlist={playlist} size={56} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.4 }}>{b.name}</Typography>
          <Typography sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: '1.1rem' }} noWrap>{playlist.name}</Typography>
        </Box>
        <Button size="small" endIcon={<OpenIcon fontSize="small" />} href={playlist.url} target="_blank" rel="noreferrer">Open</Button>
      </Stack>
      {sample ? (
        <Box sx={{ p: 3, textAlign: 'center', bgcolor: tokens.surfaceAlt }}>
          <MusicIcon sx={{ fontSize: 40, color: b.colour }} />
          <Typography sx={{ fontWeight: 500, mt: 1 }}>The {b.name} player appears here</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Sample data: connect a real account on the live app.</Typography>
        </Box>
      ) : (
        <Box component="iframe" key={src} src={src} title={`${b.name} player: ${playlist.name}`} loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          sx={{ display: 'block', width: '100%', border: 0, height: playlist.provider === 'spotify' ? 380 : 'auto', aspectRatio: playlist.provider === 'youtube' ? '16 / 9' : undefined }} />
      )}
      {playlist.provider === 'spotify' && (
        <Stack spacing={1} sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <SpeakerIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1, minWidth: 0 }} noWrap>
              {now.data?.playing ? `${now.data.track ?? ''}${now.data.artist ? ` · ${now.data.artist}` : ''}` : 'Nothing playing on your devices'}
            </Typography>
            {now.data?.playing && now.data.device && <Tag fg={tokens.matchaDeep} bg={tokens.matchaSoft}>On {now.data.device}</Tag>}
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" startIcon={<PlayIcon />} sx={{ bgcolor: b.colour, color: '#fff', '&:hover': { bgcolor: b.colour, filter: 'brightness(0.92)' } }}
              onClick={() => run(() => api.playMySpotify(playlist.id), `Playing ${playlist.name}`)}>Play on my devices</Button>
            {now.data?.playing && <Button variant="outlined" startIcon={<PauseIcon />} onClick={() => run(() => api.pauseMySpotify(), 'Paused')}>Pause</Button>}
          </Stack>
        </Stack>
      )}
    </Card>
  )
}
