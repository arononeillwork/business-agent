import { Box, Button, Card, CardContent, Link, Stack, Typography } from '@mui/material'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import PauseIcon from '@mui/icons-material/PauseRounded'
import MusicIcon from '@mui/icons-material/MusicNote'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { SectionTitle, Tag } from './common'
import { tokens } from '../theme'

/** The approved café playlist: Spotify plays and pauses on the café speaker; YouTube Music opens on the café device. */
export function MusicCard() {
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
        <SectionTitle action={m?.playlist && <Link href={m.playlist.url} target="_blank" rel="noreferrer" variant="body2">Open in {youtube ? 'YouTube Music' : 'Spotify'}</Link>}>
          Café music
        </SectionTitle>
        {m && !m.playlist && <Typography sx={{ color: 'text.secondary' }}>No playlist approved yet. An admin picks one on the Connections page.</Typography>}
        {m?.playlist && (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 56, height: 56, borderRadius: 2, overflow: 'hidden', flexShrink: 0, bgcolor: youtube ? '#FF0000' : '#1db954', display: 'grid', placeItems: 'center' }}>
              {m.playlist.image ? <Box component="img" src={m.playlist.image} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <MusicIcon sx={{ color: '#fff' }} />}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600 }} noWrap>{m.playlist.name}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>
                {youtube ? 'Plays on the café device' : m.playing ? `${m.track ?? ''}${m.artist ? ` · ${m.artist}` : ''}` : 'Not playing'}
              </Typography>
              <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }}>
                {m.playing && <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{m.device ? `On ${m.device}` : 'Playing'}</Tag>}
                {m.playing && !m.onApprovedPlaylist && <Tag fg={tokens.warnFg} bg={tokens.warnBg}>Not the approved playlist</Tag>}
              </Stack>
            </Box>
            {youtube
              ? <Button variant="contained" startIcon={<PlayIcon />} href={m.playlist.url} target="_blank" rel="noreferrer">Open playlist</Button>
              : m.playing
                ? <Button variant="outlined" startIcon={<PauseIcon />} onClick={() => run(() => api.musicPause(), 'Paused')}>Pause</Button>
                : <Button variant="contained" startIcon={<PlayIcon />} onClick={() => run(() => api.musicPlay(), 'Playing the café playlist')}>Play</Button>}
          </Stack>
        )}
        {now.error && !quiet(now.error) && <Typography variant="body2" sx={{ color: 'error.main', mt: 1 }}>{now.error}</Typography>}
      </CardContent>
    </Card>
  )
}
