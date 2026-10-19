import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField, Typography,
} from '@mui/material'
import PhotoIcon from '@mui/icons-material/AddPhotoAlternateOutlined'
import { useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAction } from '../app/Notify'
import type { CalendarEvent } from '../../shared/types'
import { formatLocal } from '../../shared/time'

/** Post an event or special to Instagram and/or the Google listing (queued, retried if needed). */
export function ShareDialog({ event, onClose }: { event?: CalendarEvent; onClose: () => void }) {
  const { api, business } = useApp()
  const run = useAction()
  const when = event ? formatLocal(`${event.starts_on}T12:00:00Z`, 'EEEE d MMMM') +
    (event.ends_on && event.ends_on !== event.starts_on ? ` – ${formatLocal(`${event.ends_on}T12:00:00Z`, 'd MMMM')}` : '') : ''
  const [caption, setCaption] = useState(event ? `${event.title}\n${when}\n\n${business?.name ?? ''} · ${business?.address ?? ''}` : '')
  const [image, setImage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [to, setTo] = useState({ instagram: true, google: true })

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    await run(async () => setImage(await api.uploadPhoto(file)))
    setBusy(false)
  }

  const targets = (Object.keys(to) as ('instagram' | 'google')[]).filter(k => to[k])
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{event ? `Share “${event.title}”` : 'New post'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Caption" multiline minRows={4} value={caption} onChange={e => setCaption(e.target.value)}
            helperText={`${caption.length}/2200`} />
          <Box>
            <Button component="label" variant="outlined" startIcon={<PhotoIcon />} disabled={busy}>
              {image ? 'Change photo' : 'Add photo'}
              <input hidden type="file" accept="image/jpeg,image/png" onChange={e => pick(e.target.files?.[0])} />
            </Button>
            {image && <Box component="img" src={image} alt="Post photo" sx={{ display: 'block', mt: 1.5, maxWidth: '100%', maxHeight: 220, borderRadius: 2 }} />}
          </Box>
          <Stack direction="row" spacing={2}>
            <FormControlLabel control={<Checkbox checked={to.instagram} onChange={e => setTo({ ...to, instagram: e.target.checked })} />} label="Instagram" />
            <FormControlLabel control={<Checkbox checked={to.google} onChange={e => setTo({ ...to, google: e.target.checked })} />} label="Google listing" />
          </Stack>
          {to.instagram && !image && <Alert severity="info">Instagram needs a photo (JPEG or PNG).</Alert>}
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Posts go out within a minute. If a service is down, they are retried automatically.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || !targets.length} onClick={async () => {
          if (await run(() => api.share(caption, image, targets, event?.id), 'Post queued')) onClose()
        }}>Post</Button>
      </DialogActions>
    </Dialog>
  )
}
