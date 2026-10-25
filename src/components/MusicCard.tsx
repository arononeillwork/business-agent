import { Box, Button, Card, CardContent, IconButton, Link, Stack, Typography } from '@mui/material'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import PauseIcon from '@mui/icons-material/PauseRounded'
import NextIcon from '@mui/icons-material/SkipNextRounded'
import MusicIcon from '@mui/icons-material/MusicNote'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useWatchCafeMusic } from '../app/CafeSpeaker'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { SectionTitle, Tag } from './common'
import { tokens } from '../theme'
import { t } from '../i18n'

/** Café music at a glance. YouTube Music: what the café speaker is playing, with play/pause/next. Spotify: the approved playlist on the café speaker. */
export function MusicCard() {
  const cafe = useWatchCafeMusic()
  if (cafe?.enabled) return <CafeSpeakerCard />
  return <SpotifyCard />
}

function CafeSpeakerCard() {
  const music = useWatchCafeMusic()!
  const run = useAction()
  const s = music.state
  const track = s?.queue[s.position]
  return (
    <Card component="section" aria-label={t('Café music')}>
      <CardContent>
        <SectionTitle action={<Link component={RouterLink} to="/music" variant="body2">{t('Open Music')}</Link>}>{t('Café music')}</SectionTitle>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 56, height: 56, borderRadius: 2, overflow: 'hidden', flexShrink: 0, bgcolor: '#FF0033', display: 'grid', placeItems: 'center' }}>
            {track?.image ?? s?.playlist?.image
              ? <Box component="img" src={track?.image ?? s?.playlist?.image} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <MusicIcon sx={{ color: '#fff' }} />}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 500 }} noWrap>{music.live && track ? track.title : t('Nothing playing')}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
              {music.live ? [track?.artist, music.here ? t('on this device') : t('on {device}', { device: s?.device_name ?? t('the café speaker') })].filter(Boolean).join(' · ')
                : t('Start it on the café tablet from the Music page')}
            </Typography>
          </Box>
          {music.live && (
            <Stack direction="row">
              {s?.playing
                ? <IconButton aria-label={t('Pause')} onClick={() => run(() => music.control('pause'))}><PauseIcon /></IconButton>
                : <IconButton aria-label={t('Play')} onClick={() => run(() => music.control('play'))}><PlayIcon /></IconButton>}
              <IconButton aria-label={t('Next song')} onClick={() => run(() => music.control('next'))}><NextIcon /></IconButton>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

function SpotifyCard() {
  const { api } = useApp()
  const run = useAction()
  const now = useAsync('music-now', () => api.musicNow(), [], { refetchInterval: 30_000 })
  const quiet = (e: string) => /not (set up|connected)|No café music/i.test(e)
  if (now.error && quiet(now.error)) return null
  const m = now.data
  const youtube = m?.provider === 'youtube'
  return (
    <Card>
      <CardContent>
        <SectionTitle action={m?.playlist && <Link href={m.playlist.url} target="_blank" rel="noreferrer" variant="body2">{t('Open in {app}', { app: youtube ? 'YouTube Music' : 'Spotify' })}</Link>}>
          {t('Café music')}
        </SectionTitle>
        {m && !m.playlist && <Typography sx={{ color: 'text.secondary' }}>{t('No playlist approved yet. An admin picks one on the Connections page.')}</Typography>}
        {m?.playlist && (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 56, height: 56, borderRadius: 2, overflow: 'hidden', flexShrink: 0, bgcolor: youtube ? '#FF0000' : '#1db954', display: 'grid', placeItems: 'center' }}>
              {m.playlist.image ? <Box component="img" src={m.playlist.image} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <MusicIcon sx={{ color: '#fff' }} />}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 500 }} noWrap>{m.playlist.name}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
                {youtube ? t('Plays on the café device') : m.playing ? `${m.track ?? ''}${m.artist ? ` · ${m.artist}` : ''}` : t('Not playing')}
              </Typography>
              <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }}>
                {m.playing && <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{m.device ? t('On {device}', { device: m.device }) : t('Playing')}</Tag>}
                {m.playing && !m.onApprovedPlaylist && <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Not the approved playlist')}</Tag>}
              </Stack>
            </Box>
            {youtube
              ? <Button variant="contained" startIcon={<PlayIcon />} href={m.playlist.url} target="_blank" rel="noreferrer">{t('Open playlist')}</Button>
              : m.playing
                ? <Button variant="outlined" startIcon={<PauseIcon />} onClick={() => run(() => api.musicPause(), t('Paused'))}>{t('Pause')}</Button>
                : <Button variant="contained" startIcon={<PlayIcon />} onClick={() => run(() => api.musicPlay(), t('Playing the café playlist'))}>{t('Play')}</Button>}
          </Stack>
        )}
        {now.error && !quiet(now.error) && <Typography variant="body2" sx={{ color: 'error.main', mt: 1 }}>{now.error}</Typography>}
      </CardContent>
    </Card>
  )
}
