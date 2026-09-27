import { Box, Button, Card, CardActionArea, Chip, Stack, Tab, Tabs, Typography } from '@mui/material'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import PauseIcon from '@mui/icons-material/PauseRounded'
import SpeakerIcon from '@mui/icons-material/SpeakerOutlined'
import LockIcon from '@mui/icons-material/LockOutlined'
import MusicIcon from '@mui/icons-material/MusicNote'
import OpenIcon from '@mui/icons-material/OpenInNew'
import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, Tag } from '../components/common'
import type { MusicPlaylist, MusicProvider, MyNowPlaying } from '../../shared/types'
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
 * Music: each person connects their own Spotify or YouTube Music; the page stays locked until
 * they do. Then: their playlists, a player in the page, and (Spotify) play on their devices.
 */
export function MusicPage() {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const [params, setParams] = useSearchParams()
  const mine = useAsync('my-music', () => api.myMusic(), [])
  const connected = PROVIDERS.filter(p => mine.data?.accounts.some(a => a.provider === p))
  const [tab, setTab] = useState<MusicProvider | null>(null)
  const active = tab && connected.includes(tab) ? tab : connected[0] ?? null

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
      <PageHeader eyebrow="Your music" title="Music"
        subtitle="Connect your own Spotify or YouTube Music to play your playlists here. Only you can see your accounts." />
      <ErrorBox error={mine.error} />

      {mine.data && connected.length === 0 && <ConnectGate configured={mine.data.configured} />}

      {mine.data && connected.length > 0 && (
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
    </>
  )
}

function ConnectGate({ configured }: { configured: Record<MusicProvider, boolean> }) {
  const { api } = useApp()
  const run = useAction()
  return (
    <Card component="section" aria-label="Connect a music account" sx={{ p: { xs: 2.5, md: 4 }, border: 'none', position: 'relative', overflow: 'hidden',
      background: `linear-gradient(135deg, ${tokens.espresso} 0%, #3B2F2B 60%, #4A3B36 100%)`, color: '#fff' }}>
      <Box aria-hidden sx={{ position: 'absolute', right: -40, bottom: -60, opacity: 0.07, '& svg': { fontSize: 280 } }}><MusicIcon /></Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <LockIcon sx={{ fontSize: 18, color: tokens.rose }} />
        <Typography variant="overline" sx={{ color: tokens.rose, fontWeight: 600, letterSpacing: '0.12em' }}>Connect to use Music</Typography>
      </Stack>
      <Typography sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: { xs: '1.4rem', md: '1.9rem' }, lineHeight: 1.2, maxWidth: 560 }}>
        Bring your own music. Connect Spotify or YouTube Music to unlock this page.
      </Typography>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, mt: 3, position: 'relative' }}>
        {PROVIDERS.map(p => {
          const b = BRAND[p]
          return (
            <Box key={p} sx={{ bgcolor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Box sx={{ width: 40, height: 40, flexShrink: 0 }}>{b.logo}</Box>
                <Typography sx={{ fontFamily: fonts.display, fontWeight: 500, fontSize: '1.15rem' }}>{b.name}</Typography>
              </Stack>
              <Typography sx={{ opacity: 0.78, flex: 1 }}>{b.blurb}</Typography>
              <Button variant="contained" disabled={!configured[p]} onClick={() => run(() => api.connectMyMusic(p))}
                sx={{ bgcolor: b.colour, color: '#fff', alignSelf: 'flex-start', '&:hover': { bgcolor: b.colour, filter: 'brightness(0.92)' },
                  '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' } }}>
                Connect {b.name}
              </Button>
              {!configured[p] && <Typography variant="caption" sx={{ opacity: 0.7 }}>{b.name} is being set up. Ask an admin.</Typography>}
            </Box>
          )
        })}
      </Box>
      <Typography variant="body2" sx={{ opacity: 0.6, mt: 2.5 }}>
        You sign in on {'Spotify’s'} or {'Google’s'} own page; Easy Beans never sees your password. Disconnect any time.
      </Typography>
    </Card>
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
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 420px' }, alignItems: 'start' }}>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' } }}
            role="list" aria-label="Your playlists">
            {lists.data!.map(p => {
              const on = p.id === current.id
              return (
                <Card key={p.id} role="listitem" sx={{ ...(on ? { borderColor: BRAND[provider].colour, boxShadow: `0 0 0 2px ${BRAND[provider].colour}` } : {}) }}>
                  <CardActionArea onClick={() => setPicked(p)} aria-pressed={on} aria-label={p.name} sx={{ p: 1.25 }}>
                    <Cover playlist={p} />
                    <Typography sx={{ fontWeight: 600, mt: 1 }} noWrap>{p.name}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{p.tracks} {p.tracks === 1 ? 'song' : 'songs'}</Typography>
                  </CardActionArea>
                </Card>
              )
            })}
          </Box>
          <Player playlist={current} />
        </Box>
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
    <Card component="section" aria-label="Player" sx={{ position: { lg: 'sticky' }, top: { lg: 16 }, overflow: 'hidden' }}>
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
          <Typography sx={{ fontWeight: 600, mt: 1 }}>The {b.name} player appears here</Typography>
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
