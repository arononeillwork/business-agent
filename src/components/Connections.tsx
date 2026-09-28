import {
  Alert, Box, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import FavoriteIcon from '@mui/icons-material/FavoriteBorder'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { SectionTitle } from './common'
import { ShareDialog } from './ShareDialog'
import { DAY_KEYS, type OpeningHours } from '../../shared/types'
import { formatLocal, formatNumber } from '../../shared/time'
import { tokens } from '../theme'

/** Google Maps settings once it's connected: which listing, push hours, compare with Google. */
export function GoogleMapsCard() {
  const { api, business, refresh } = useApp()
  const run = useAction()
  const data = useAsync('integrations', () => api.integrations(), [])
  const [compare, setCompare] = useState<OpeningHours | null>(null)
  const g = data.data?.integrations.find(i => i.provider === 'google_business')
  const waiting = data.data?.queue.filter(q => q.status === 'pending').length ?? 0
  const failing = data.data?.queue.filter(q => q.status !== 'pending').length ?? 0
  if (g?.status !== 'connected' && g?.status !== 'error') return null

  return (
    <Card component="section" aria-label="Google Maps settings">
      <CardContent>
        <SectionTitle>Google Maps</SectionTitle>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {g.account_label}{g.last_sync_at ? ` · last updated ${formatLocal(g.last_sync_at, 'd MMM, HH:mm')}` : ''}
        </Typography>
        {(waiting > 0 || failing > 0) && (
          <Alert severity={failing ? 'warning' : 'info'} sx={{ mb: 1.5 }}>
            {waiting > 0 && `${waiting} update${waiting > 1 ? 's' : ''} waiting to send. `}
            {failing > 0 && `${failing} failed and will be retried automatically.`}
          </Alert>
        )}
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {(g.external.locations?.length ?? 0) > 1 && (
            <TextField select size="small" label="Listing" value={g.external.location ?? ''} sx={{ minWidth: 220, width: 'auto' }}
              onChange={e => run(async () => { await api.chooseGoogleListing(e.target.value); await data.reload() }, 'Listing chosen')}>
              {g.external.locations!.map(l => <MenuItem key={l.name} value={l.name}>{l.title}{l.address ? ` · ${l.address}` : ''}</MenuItem>)}
            </TextField>
          )}
          <Button size="small" variant="contained" onClick={() => run(async () => { await api.syncGoogleNow(); await data.reload() }, 'Google updated with the app’s hours')}>
            Push hours to Google
          </Button>
          <Button size="small" variant="outlined" onClick={() => run(async () => setCompare(await api.googleHours()))}>Compare with Google</Button>
          <FormControlLabel sx={{ ml: 0 }} control={<Checkbox size="small" checked={!!g.external.closed_on_holidays}
            onChange={e => run(async () => { await api.chooseGoogleListing(null, e.target.checked); await data.reload() }, 'Saved')} />}
            label={<Typography variant="body2">We close on public holidays</Typography>} />
        </Stack>
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
                    <TableCell sx={{ textTransform: 'capitalize', fontWeight: 500 }}>{d}</TableCell>
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

/** Instagram once it's connected: followers, recent posts, and a new post. */
export function InstagramCard() {
  const { api } = useApp()
  const data = useAsync('integrations', () => api.integrations(), [])
  const on = data.data?.integrations.some(i => i.provider === 'instagram' && i.status === 'connected') ?? false
  const profile = useAsync('instagram-profile', () => (on ? api.instagramProfile() : Promise.resolve(null)), [on])
  const [sharing, setSharing] = useState(false)
  const p = profile.data
  if (!on) return null
  return (
    <Card component="section" aria-label="Instagram">
      <CardContent>
        <SectionTitle action={<Button size="small" variant="outlined" onClick={() => setSharing(true)}>New post</Button>}>Instagram</SectionTitle>
        {profile.error && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{profile.error}</Typography>}
        {p && <>
          <Stack direction="row" spacing={3} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
            <Box>
              <Typography sx={{ fontWeight: 500 }}>@{p.username}</Typography>
              {p.biography && <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 360 }}>{p.biography}</Typography>}
            </Box>
            <Box><Typography sx={{ fontWeight: 500, fontSize: '1.3rem', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(p.followers_count)}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>followers</Typography></Box>
            <Box><Typography sx={{ fontWeight: 500, fontSize: '1.3rem' }}>{p.media_count}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>posts</Typography></Box>
          </Stack>
          <Stack component="ul" aria-label="Recent posts" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {p.recent.map(m => (
              <Box component="li" key={m.id} sx={{ borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
                <Box component="a" href={m.permalink} target="_blank" rel="noreferrer"
                  sx={{ display: 'flex', gap: 1.5, alignItems: 'center', py: 1.25, color: 'inherit', textDecoration: 'none', '&:hover': { color: tokens.roseDeep } }}>
                  <Box sx={{ width: 56, height: 56, flexShrink: 0, borderRadius: 2, overflow: 'hidden', bgcolor: tokens.surfaceAlt, border: 1, borderColor: 'divider' }}>
                    {(m.thumbnail_url ?? m.media_url) && <Box component="img" src={m.thumbnail_url ?? m.media_url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography noWrap>{m.caption ?? 'Instagram post'}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatLocal(m.timestamp, 'd MMM')}</Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                    <FavoriteIcon sx={{ fontSize: 15 }} /><Typography variant="body2">{m.like_count ?? 0}</Typography>
                  </Stack>
                </Box>
              </Box>
            ))}
          </Stack>
        </>}
      </CardContent>
      {sharing && <ShareDialog onClose={() => setSharing(false)} />}
    </Card>
  )
}
