import {
  Alert, Box, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import GoogleIcon from '@mui/icons-material/Google'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import InstagramIcon from '@mui/icons-material/Instagram'
import FavoriteIcon from '@mui/icons-material/FavoriteBorder'
import MusicIcon from '@mui/icons-material/MusicNote'
import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { SectionTitle, Tag } from './common'
import { ShareDialog } from './ShareDialog'
import { DAY_KEYS, type Integration, type IntegrationProvider, type OpeningHours } from '../../shared/types'
import { formatLocal, formatNumber } from '../../shared/time'
import { tokens } from '../theme'

const META: Record<IntegrationProvider, { name: string; icon: ReactNode; does: string }> = {
  google_business: { name: 'Google Maps & Search', icon: <GoogleIcon />, does: 'Opening hours, closures and phone stay in sync on your Google listing. Post events.' },
  whatsapp: { name: 'WhatsApp', icon: <WhatsAppIcon sx={{ color: '#1f9e55' }} />, does: 'Shift reminders, missed clock-ins and the weekly rota go to staff who opted in.' },
  instagram: { name: 'Instagram', icon: <InstagramIcon sx={{ color: '#c13584' }} />, does: 'Followers and recent posts here; publish events and specials.' },
  spotify: { name: 'Spotify', icon: <MusicIcon sx={{ color: '#1db954' }} />, does: 'Pick the approved café playlist. Staff can play or pause it on the café speaker from the app.' },
}

function status(i: Integration | undefined, configured: boolean) {
  if (!configured) return { text: 'Needs setup', fg: tokens.warnFg, bg: tokens.warnBg }
  if (!i || i.status === 'disconnected') return { text: 'Not connected', fg: tokens.neutralFg, bg: tokens.neutralBg }
  if (i.status === 'error') return { text: 'Problem', fg: tokens.badFg, bg: tokens.badBg }
  return { text: 'Connected', fg: tokens.goodFg, bg: tokens.goodBg }
}

const SETUP_HELP: Record<IntegrationProvider, string> = {
  google_business: 'Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and INTEGRATION_KEY to the Worker (see docs/INTEGRATIONS.md), then connect with the Google account that owns the listing.',
  whatsapp: 'Create a Meta app with WhatsApp, verify the business, add the number, then set META_ACCESS_TOKEN, META_APP_SECRET, WHATSAPP_VERIFY_TOKEN and WHATSAPP_PHONE_NUMBER_ID (see docs/INTEGRATIONS.md).',
  spotify: 'Create a free app at developer.spotify.com, add the redirect URL, then set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET (see docs/INTEGRATIONS.md).',
  instagram: 'Switch Instagram to a professional account linked to the Facebook Page, then set INSTAGRAM_USER_ID and give the Meta token Instagram access (see docs/INTEGRATIONS.md).',
}

export function ConnectionsCard() {
  const { api, business, refresh } = useApp()
  const run = useAction()
  const notify = useNotify()
  const data = useAsync('integrations', () => api.integrations(), [])
  const [testTo, setTestTo] = useState(business?.phone ?? '')
  const [compare, setCompare] = useState<OpeningHours | null>(null)

  // Coming back from Google's consent screen.
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    if (q.get('connected')) notify(`${q.get('connected') === 'spotify' ? 'Spotify' : 'Google'} connected`, 'success')
    if (q.get('connect_error')) notify(q.get('connect_error')!, 'error')
    if (q.has('connected') || q.has('connect_error')) history.replaceState(null, '', location.pathname)
  }, [notify])

  const get = (p: IntegrationProvider) => data.data?.integrations.find(i => i.provider === p)
  const configured = (p: IntegrationProvider) => !!data.data?.configured[p]
  const waiting = data.data?.queue.filter(q => q.status === 'pending').length ?? 0
  const failing = data.data?.queue.filter(q => q.status !== 'pending').length ?? 0

  const row = (p: IntegrationProvider, actions: ReactNode) => {
    const i = get(p)
    const st = status(i, configured(p))
    return (
      <Box key={p} sx={{ py: 2, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: tokens.surfaceAlt, border: 1, borderColor: 'divider', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            {META[p].icon}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
              <Typography sx={{ fontWeight: 600 }}>{META[p].name}</Typography>
              <Tag fg={st.fg} bg={st.bg}>{st.text}</Tag>
              {i?.account_label && i.status !== 'disconnected' && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{i.account_label}</Typography>}
            </Stack>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>{META[p].does}</Typography>
            {!configured(p) && <Typography variant="body2" sx={{ mt: 1 }}>{SETUP_HELP[p]}</Typography>}
            {i?.last_error && <Alert severity="error" sx={{ mt: 1 }}>{i.last_error}</Alert>}
            {i?.last_sync_at && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
              Last synced {formatLocal(i.last_sync_at, 'd MMM, HH:mm')}</Typography>}
            {configured(p) && <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 1.25, alignItems: 'center' }}>{actions}</Stack>}
          </Box>
        </Stack>
      </Box>
    )
  }

  const g = get('google_business')
  const googleConnected = g?.status === 'connected' || g?.status === 'error'

  return (
    <Card>
      <CardContent>
        <SectionTitle>Connections</SectionTitle>
        {(waiting > 0 || failing > 0) && (
          <Alert severity={failing ? 'warning' : 'info'} sx={{ mb: 1 }}>
            {waiting > 0 && `${waiting} update${waiting > 1 ? 's' : ''} waiting to send. `}
            {failing > 0 && `${failing} failed and will be retried automatically.`}
          </Alert>
        )}
        {row('google_business', googleConnected ? <>
          {(g?.external.locations?.length ?? 0) > 1 && (
            <TextField select size="small" label="Listing" value={g?.external.location ?? ''} sx={{ minWidth: 220, width: 'auto' }}
              onChange={e => run(async () => { await api.chooseGoogleListing(e.target.value); await data.reload() }, 'Listing chosen')}>
              {g!.external.locations!.map(l => <MenuItem key={l.name} value={l.name}>{l.title}{l.address ? ` · ${l.address}` : ''}</MenuItem>)}
            </TextField>
          )}
          <Button size="small" variant="contained" onClick={() => run(async () => { await api.syncGoogleNow(); await data.reload() }, 'Google updated with the app’s hours')}>
            Push hours to Google
          </Button>
          <Button size="small" variant="outlined" onClick={() => run(async () => setCompare(await api.googleHours()))}>Compare with Google</Button>
          <FormControlLabel sx={{ ml: 0 }} control={<Checkbox size="small" checked={!!g?.external.closed_on_holidays}
            onChange={e => run(async () => { await api.chooseGoogleListing(null, e.target.checked); await data.reload() }, 'Saved')} />}
            label={<Typography variant="body2">We close on public holidays</Typography>} />
          <Button size="small" color="error" onClick={() => run(async () => { await api.disconnect('google_business'); await data.reload() }, 'Google disconnected')}>Disconnect</Button>
        </> : (
          <Button size="small" variant="contained" startIcon={<GoogleIcon />} onClick={() => run(() => api.connectGoogle())}>Connect Google</Button>
        ))}
        {row('whatsapp', <>
          <TextField size="small" label="Test number" value={testTo} onChange={e => setTestTo(e.target.value)} sx={{ width: 200 }} />
          <Button size="small" variant="outlined" onClick={() => run(async () => { await api.whatsappTest(testTo); await data.reload() }, 'Test message sent')}>Send test</Button>
          <Typography variant="caption" sx={{ color: 'text.secondary', flexBasis: '100%' }}>
            Staff choose to receive messages under My account. Replying STOP turns them off.
          </Typography>
        </>)}
        {row('spotify', <SpotifyActions connected={get('spotify')?.status === 'connected'} onChange={data.reload} />)}
        {row('instagram', <Typography variant="body2" sx={{ color: 'text.secondary' }}>Profile and posts are shown below.</Typography>)}
        {!data.data && data.error && <Alert severity="error">{data.error}</Alert>}
      </CardContent>

      <Dialog open={!!compare} onClose={() => setCompare(null)} fullWidth maxWidth="sm">
        <DialogTitle>Opening hours: app vs Google</DialogTitle>
        <DialogContent>
          <Table size="small">
            <TableHead><TableRow><TableCell>Day</TableCell><TableCell>In the app</TableCell><TableCell>On Google</TableCell></TableRow></TableHead>
            <TableBody>
              {DAY_KEYS.map(d => {
                const a = business?.opening_hours[d]; const b = compare?.[d]
                const fmt = (h?: { open: string; close: string } | null) => (h ? `${h.open}–${h.close}` : 'Closed')
                const differs = fmt(a) !== fmt(b)
                return (
                  <TableRow key={d} sx={{ bgcolor: differs ? tokens.warnBg : undefined }}>
                    <TableCell sx={{ textTransform: 'capitalize', fontWeight: 600 }}>{d}</TableCell>
                    <TableCell>{fmt(a)}</TableCell>
                    <TableCell sx={{ fontWeight: differs ? 800 : 400 }}>{fmt(b)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={() => setCompare(null)}>Close</Button>
          <Button variant="outlined" onClick={() => run(async () => {
            await api.updateBusiness({ opening_hours: compare! }); await refresh(); setCompare(null)
          }, 'App now uses Google’s hours')}>Use Google’s hours in the app</Button>
          <Button variant="contained" onClick={() => run(async () => { await api.syncGoogleNow(); setCompare(null); await data.reload() },
            'Google updated with the app’s hours')}>Put the app’s hours on Google</Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}

function SpotifyActions({ connected, onChange }: { connected: boolean; onChange: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const lists = useAsync('spotify-playlists', () => (connected ? api.spotifyPlaylists() : Promise.resolve(null)), [connected])
  if (!connected) {
    return <Button size="small" variant="contained" startIcon={<MusicIcon />} sx={{ bgcolor: '#1db954', '&:hover': { bgcolor: '#17a34a' } }}
      onClick={() => run(() => api.connectSpotify())}>Connect Spotify</Button>
  }
  return <>
    <TextField select size="small" label="Approved playlist" value={lists.data?.approved?.id ?? ''} sx={{ minWidth: 260, width: 'auto' }}
      onChange={e => {
        const p = lists.data?.playlists.find(x => x.id === e.target.value)
        if (p) run(async () => { await api.chooseSpotifyPlaylist(p); await lists.reload(); onChange() }, `“${p.name}” is now the café playlist`)
      }}>
      {(lists.data?.playlists ?? []).map(p => <MenuItem key={p.id} value={p.id}>{p.name} · {p.tracks} songs</MenuItem>)}
    </TextField>
    <Button size="small" color="error" onClick={() => run(async () => { await api.disconnect('spotify'); onChange() }, 'Spotify disconnected')}>Disconnect</Button>
    <Alert severity="warning" sx={{ flexBasis: '100%' }}>
      Spotify’s standard plans are for personal use only. Playing music in the café also needs SGAE/AGEDI licences.
      Spotify’s business option (Soundtrack Your Brand) covers both.
    </Alert>
  </>
}

export function InstagramCard() {
  const { api } = useApp()
  const profile = useAsync('instagram-profile', () => api.instagramProfile(), [])
  const [sharing, setSharing] = useState(false)
  const p = profile.data
  return (
    <Card>
      <CardContent>
        <SectionTitle action={<Button size="small" variant="outlined" onClick={() => setSharing(true)}>New post</Button>}>Instagram</SectionTitle>
        {profile.error && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{profile.error}</Typography>}
        {p && <>
          <Stack direction="row" spacing={3} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
            <Box>
              <Typography sx={{ fontWeight: 600 }}>@{p.username}</Typography>
              {p.biography && <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 360 }}>{p.biography}</Typography>}
            </Box>
            <Box><Typography sx={{ fontWeight: 600, fontSize: '1.3rem', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(p.followers_count)}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>followers</Typography></Box>
            <Box><Typography sx={{ fontWeight: 600, fontSize: '1.3rem' }}>{p.media_count}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>posts</Typography></Box>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 1 }}>
            {p.recent.map(m => (
              <Box key={m.id} component="a" href={m.permalink} target="_blank" rel="noreferrer"
                sx={{ aspectRatio: '1', borderRadius: 2, overflow: 'hidden', position: 'relative', display: 'block', color: 'inherit', textDecoration: 'none',
                  bgcolor: tokens.surfaceAlt, border: 1, borderColor: 'divider', maxWidth: '100%' }}>
                {(m.thumbnail_url ?? m.media_url)
                  ? <Box component="img" src={m.thumbnail_url ?? m.media_url} alt={m.caption ?? 'Instagram post'} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <Typography variant="caption" sx={{ p: 1, display: 'block', fontWeight: 600 }}>{m.caption}</Typography>}
                <Stack direction="row" spacing={0.5} sx={{ position: 'absolute', left: 6, bottom: 6, alignItems: 'center', bgcolor: 'rgba(255,255,255,0.9)', px: 0.75, borderRadius: 1 }}>
                  <FavoriteIcon sx={{ fontSize: 13 }} /><Typography variant="caption" sx={{ fontWeight: 600 }}>{m.like_count ?? 0}</Typography>
                </Stack>
              </Box>
            ))}
          </Box>
        </>}
      </CardContent>
      {sharing && <ShareDialog onClose={() => setSharing(false)} />}
    </Card>
  )
}
