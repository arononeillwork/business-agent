// "Connect a speaker" on the Music page: how to get the café music out of a Bluetooth speaker (a Bose
// SoundLink, a Sonos Roam, Move or Era…) or a Wi‑Fi one (most Sonos, Bose smart speakers), with the
// steps for the device in hand and a test chime. A browser can't pair a speaker itself, so the device
// that plays the music pairs it in its own settings, once; after that it reconnects by itself.
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme } from '@mui/material'
import BluetoothIcon from '@mui/icons-material/BluetoothAudioRounded'
import VolumeIcon from '@mui/icons-material/VolumeUpRounded'
import WifiIcon from '@mui/icons-material/WifiRounded'
import { useState, type ReactNode } from 'react'
import { playChime, thisPlatform, type SpeakerPlatform } from '../lib/speaker'
import { msg, t } from '../i18n'
import { tokens } from '../theme'

/**
 * The button that opens the steps. `playingOn`: the music plays on another device right now (its name),
 * so that's the one to connect. `spotify`: the café's music is Spotify, which reaches Wi‑Fi speakers itself.
 */
export function ConnectSpeakerButton({ playingOn, spotify }: { playingOn?: string; spotify?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button startIcon={<BluetoothIcon />} onClick={() => setOpen(true)}>{t('Connect a speaker')}</Button>
      {open && <SpeakerDialog playingOn={playingOn} spotify={spotify} onClose={() => setOpen(false)} />}
    </>
  )
}

const DEVICES: { value: SpeakerPlatform; label: string }[] = [
  { value: 'ios', label: msg('iPad / iPhone') },
  { value: 'android', label: 'Android' },
  { value: 'windows', label: 'Windows' },
  { value: 'mac', label: 'Mac' },
]

/** Pairing it in the device's own Bluetooth settings. */
const PAIR: Record<SpeakerPlatform, string> = {
  ios: msg('Open Settings → Bluetooth, turn Bluetooth on, and tap the speaker under Other Devices.'),
  android: msg('Swipe down from the top of the screen and touch and hold Bluetooth. Turn it on, tap Pair new device (on a Samsung, Scan), and tap the speaker.'),
  windows: msg('Open Settings → Bluetooth & devices → Add device → Bluetooth, and pick the speaker.'),
  mac: msg('Open System Settings → Bluetooth, and click Connect next to the speaker.'),
  other: msg('Open the device’s Bluetooth settings, turn Bluetooth on, and pick the speaker from the list.'),
}

/** Putting the speaker where a device can find it (from Bose's and Sonos's own guides). */
const PAIRING_MODE: { speaker: string; how: string }[] = [
  { speaker: 'Bose', how: msg('Press and hold the Bluetooth button until the light blinks blue.') },
  { speaker: msg('Sonos Era 100 or Era 300'), how: msg('Press and hold the Bluetooth button on the back until it chimes and the light flashes blue.') },
  { speaker: 'Sonos Move', how: msg('Press the Bluetooth button on the back once, then press and hold it until it chimes again and the light flashes blue.') },
  { speaker: 'Sonos Roam', how: msg('Press and hold the power button on the back for 2 seconds, until it chimes and the light flashes blue.') },
  { speaker: msg('Other speakers'), how: msg('Hold the Bluetooth button until the light flashes (the speaker’s manual says which button).') },
]

/** A speaker on the café's Wi‑Fi, without Bluetooth: AirPlay from Apple devices; elsewhere, a browser can't reach it. */
const WIFI: Record<SpeakerPlatform, string> = {
  ios: msg('Open Control Centre (swipe down from the top-right corner), tap the AirPlay icon on the music tile, and pick the speaker. Sonos and Bose smart speakers show up there when they’re on the same Wi‑Fi.'),
  mac: msg('Click Control Centre in the menu bar, then Sound, and pick the speaker. Sonos and Bose smart speakers show up there when they’re on the same Wi‑Fi.'),
  android: msg('A browser on Android can’t send sound to a Wi‑Fi speaker. Use the speaker’s Bluetooth if it has one (steps above), or play the music from an iPad, iPhone or Mac, which reach it with AirPlay.'),
  windows: msg('A browser on Windows can’t send sound to a Wi‑Fi speaker. Use the speaker’s Bluetooth if it has one (steps above), or play the music from an iPad, iPhone or Mac, which reach it with AirPlay.'),
  other: msg('Only an iPad, iPhone or Mac can send a browser’s sound to a Wi‑Fi speaker (with AirPlay). On anything else, use the speaker’s Bluetooth if it has one (steps above).'),
}

function SpeakerDialog({ playingOn, spotify, onClose }: { playingOn?: string; spotify?: boolean; onClose: () => void }) {
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [device, setDevice] = useState<SpeakerPlatform>(thisPlatform)
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" fullScreen={phone} aria-labelledby="speaker-title">
      <DialogTitle id="speaker-title">{t('Connect a speaker')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('A web page can’t connect to Bluetooth itself, so the device that plays the music (usually the café tablet) connects to the speaker in its own settings. You do it once: after that, it reconnects by itself whenever the speaker is on.')}
          </Typography>
          {playingOn && (
            <Alert severity="info">{t('The music is playing on {device}: connect the speaker to that one. Or connect it to this device, then press Play here instead.', { device: playingOn })}</Alert>
          )}
          <Box>
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 0.5 }} id="speaker-device">{t('The device that plays the music')}</Typography>
            <ToggleButtonGroup exclusive size="small" value={device} aria-labelledby="speaker-device" onChange={(_, v: SpeakerPlatform | null) => { if (v) setDevice(v) }}>
              {DEVICES.map(d => <ToggleButton key={d.value} value={d.value} sx={{ px: 1.5 }}>{t(d.label)}</ToggleButton>)}
            </ToggleButtonGroup>
          </Box>

          <Step n={1} title={t('Put the speaker in pairing mode')}>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {PAIRING_MODE.map(p => (
                <Typography key={p.speaker} component="li" variant="body2" sx={{ mb: 0.5 }}>
                  <Box component="strong" sx={{ fontWeight: 600 }}>{t(p.speaker)}</Box>: {t(p.how)}
                </Typography>
              ))}
            </Box>
          </Step>
          <Step n={2} title={t('Pair it in the device’s Bluetooth settings')}>
            <Typography variant="body2">{t(PAIR[device])}</Typography>
          </Step>
          <Step n={3} title={t('Check the sound comes from the speaker')}>
            <TestSound />
          </Step>

          <Box component="section" aria-labelledby="speaker-wifi" sx={{ p: 1.75, borderRadius: 2, bgcolor: tokens.surfaceAlt }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}>
              <WifiIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              <Typography id="speaker-wifi" variant="subtitle2" component="h3">{t('A Sonos or Bose on Wi‑Fi instead')}</Typography>
            </Stack>
            <Typography variant="body2" sx={{ mb: 0.75 }}>{t('Sonos One, Five, Beam, Arc and Ray have no Bluetooth; Bose smart speakers have both.')}</Typography>
            <Typography variant="body2">{t(WIFI[device])}</Typography>
            {spotify && (
              <Typography variant="body2" sx={{ mt: 0.75 }}>
                {t('With Spotify, a speaker on the Wi‑Fi also shows up in Spotify’s own list of devices: in the Spotify app, tap the devices icon under the song and pick the speaker.')}
              </Typography>
            )}
          </Box>

          <Box component="section" aria-labelledby="speaker-help">
            <Typography id="speaker-help" variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>{t('Still coming out of the device?')}</Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>{t('A speaker plays from one device at a time. If someone’s phone is connected to it, turn Bluetooth off on that phone, or turn the speaker off and on again.')}</Typography>
              <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>{t('Turn the volume up on the device as well as on the speaker.')}</Typography>
              <Typography component="li" variant="body2">{t('Next time, just turn the speaker on: the device connects to it by itself, then press Play.')}</Typography>
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{t('Done')}</Button>
      </DialogActions>
    </Dialog>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Stack direction="row" spacing={1.5} component="section" aria-label={title}>
      <Box aria-hidden sx={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
        bgcolor: tokens.roseSoft, color: tokens.roseDeep, fontWeight: 600, fontSize: 13 }}>{n}</Box>
      <Box sx={{ minWidth: 0, flex: 1, pt: 0.25 }}>
        <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>{title}</Typography>
        {children}
      </Box>
    </Stack>
  )
}

/** A chime through whatever this device plays sound on: from the speaker, it's connected. */
function TestSound() {
  const [state, setState] = useState<'idle' | 'playing' | 'played' | 'failed'>('idle')
  const play = () => {
    setState('playing')
    playChime().then(() => setState('played'), () => setState('failed'))
  }
  return (
    <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
      <Typography variant="body2">{t('Press the button on the device that plays the music: the chime should come out of the speaker.')}</Typography>
      <Button variant="outlined" size="small" startIcon={<VolumeIcon />} disabled={state === 'playing'} onClick={play}>
        {state === 'playing' ? t('Playing the test sound…') : t('Play a test sound')}
      </Button>
      {state === 'played' && <Typography variant="body2" sx={{ color: 'text.secondary' }} role="status">{t('Heard it from the speaker? You’re set. Heard it from the device instead? See below.')}</Typography>}
      {state === 'failed' && <Typography variant="body2" sx={{ color: 'error.main' }} role="alert">{t('The test sound didn’t play. Turn the volume up and try again.')}</Typography>}
    </Stack>
  )
}
