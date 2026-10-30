import {
  Alert, Box, Button, Card, CardActionArea, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, MenuItem, Radio,
  RadioGroup, Stack, Switch, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CameraIcon from '@mui/icons-material/VideocamOutlined'
import NoPictureIcon from '@mui/icons-material/VideocamOffOutlined'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import KeptIcon from '@mui/icons-material/FlagOutlined'
import PhoneIcon from '@mui/icons-material/PhoneIphoneRounded'
import OpenIcon from '@mui/icons-material/OpenInNewRounded'
import CopyIcon from '@mui/icons-material/ContentCopyOutlined'
import RefreshIcon from '@mui/icons-material/AutorenewRounded'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync, useTick } from '../app/hooks'
import { useConnected } from '../app/connected'
import { useAction, useNotify } from '../app/Notify'
import { Empty, ErrorBox, PageHeader, Tag } from '../components/common'
import { ago } from '../components/Freshness'
import {
  KEEP_DAY_CHOICES, MAX_KEEP_DAYS, PICTURE_SECONDS, PLACEMENTS, VIDEO_PIECE_MB, bytesPerDay, cameraProblem, clipsByDay, isLive, newCamera, sizeText,
  type Camera, type CameraClip, type CameraInput, type CameraLive, type Placement,
} from '../../shared/cameras'
import { addDays, formatLocal, today, TZ } from '../../shared/time'
import { tokens } from '../theme'
import { t, tn, tr } from '../i18n'

const inputOf = ({ id, name, placement, keep_days, keep_video, active }: Camera): CameraInput => ({ id, name, placement, keep_days, keep_video, active })

/** The Reolink app: opened where it's installed (Android), its App Store page on an iPhone, its download page elsewhere. */
function reolinkApp() {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'intent://#Intent;package=com.mcu.reolink;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.mcu.reolink;end'
  if (/iphone|ipad|ipod/i.test(ua)) return 'https://apps.apple.com/app/reolink/id995927563'
  return 'https://reolink.com/software-and-manual/'
}

/**
 * Cameras (admins): the café's CCTV cameras (Reolink, which send by FTP to Business Agent's camera
 * upload server). Each shows a picture that refreshes every few seconds while the page is open, and
 * its clips by day, kept in the business's own Google Drive or OneDrive for the days chosen, then
 * deleted. Live video stays in the Reolink app (free, no subscription).
 */
export function CamerasPage() {
  const { api, business } = useApp()
  const tz = business?.timezone ?? TZ
  const cams = useAsync('cameras', () => api.cameras(), [], { refetchInterval: 60_000 })
  const service = useAsync('camera-service', () => api.cameraService(), [])
  const live = useAsync('cameras-live', () => api.camerasLive(), [], { refetchInterval: 15_000 })
  const drive = useConnected('google_drive')
  const onedrive = useConnected('onedrive')
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  useTick(30_000)
  const list = cams.data ?? []
  const current = list.find(c => c.id === selected) ?? list[0] ?? null
  const noStorage = drive === false && onedrive === false

  return (
    <>
      <PageHeader eyebrow={t('Business')} title={t('Cameras')} actions={<>
        <Button variant="outlined" startIcon={<PhoneIcon />} component="a" href={reolinkApp()} target="_blank" rel="noopener">{t('Live video: Reolink app')}</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>{t('Add camera')}</Button>
      </>} />
      <ErrorBox error={cams.error} />
      {service.data && !service.data.ftp && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('Camera uploads aren’t switched on yet, so cameras have nowhere to send to. Once they are, each camera’s address and login show here.')}
        </Alert>
      )}
      {noStorage && (
        <Alert severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" size="small" component={RouterLink} to="/connections">{t('Connections')}</Button>}>
          {t('Connect Google Drive or OneDrive to keep the cameras’ video. It goes in its Business Agent/Cameras folder, so it uses your own storage, not a subscription.')}
        </Alert>
      )}
      {cams.data && !list.length ? (
        <Empty>
          <Typography sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}>{t('Your cameras, with their video in your own storage')}</Typography>
          {t('Add a camera, type its address and login into the Reolink app, and its picture shows here every few seconds. Video is kept in your Google Drive or OneDrive for the days you choose. No subscription.')}
          <Typography variant="body2" sx={{ mt: 1 }}>
            {t('Works with Reolink cameras that plug in (Wi-Fi) or take a network cable (PoE), such as the E1 Zoom inside and the E1 Outdoor outside. Not battery or solar ones, nor the E1, E1 Pro 4MP or Lumus: they can’t upload by FTP.')}
          </Typography>
          <Box sx={{ mt: 2 }}><Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>{t('Add camera')}</Button></Box>
        </Empty>
      ) : (
        <>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, mb: 2.5 }}>
            {list.map(c => <CameraTile key={c.id} camera={c} live={live.data?.[c.id]} selected={c.id === current?.id} onClick={() => setSelected(c.id)} tz={tz} />)}
          </Box>
          {current && <CameraDetail key={current.id} camera={current} live={live.data?.[current.id]} ftp={service.data?.ftp ?? null} tz={tz} />}
        </>
      )}
      {creating && <NewCameraDialog onClose={() => setCreating(false)} onMade={setSelected} />}
    </>
  )
}

function Status({ camera, live }: { camera: Camera; live?: CameraLive }) {
  if (!camera.active) return <Tag>{t('Switched off')}</Tag>
  if (camera.last_error) return <Tag fg={tokens.badFg} bg={tokens.badBg}>{t('Video not kept')}</Tag>
  if (isLive(live)) return <Tag fg={tokens.goodFg} bg={tokens.goodBg}>{t('Sending now')}</Tag>
  const seen = camera.last_seen_at ?? live?.picture_at ?? null
  return <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{seen ? t('Last seen {when}', { when: ago(seen) }) : t('Not connected yet')}</Tag>
}

/** The camera's latest picture, asked for again every few seconds while the page is in view. */
function LivePicture({ camera, live }: { camera: Camera; live?: CameraLive }) {
  const { api } = useApp()
  const [src, setSrc] = useState<string | null>(null)
  const [none, setNone] = useState(false)
  useEffect(() => {
    if (!camera.active) return
    let stopped = false
    let shown: string | null = null
    const load = () => {
      if (document.visibilityState !== 'visible') return
      api.cameraPicture(camera.id).then(blob => {
        if (stopped) return
        setNone(!blob)
        if (!blob) return
        const next = URL.createObjectURL(blob)
        setSrc(next)
        if (shown) URL.revokeObjectURL(shown)
        shown = next
      }).catch(() => { if (!stopped) setNone(true) })
    }
    load()
    const id = setInterval(load, PICTURE_SECONDS * 1000)
    return () => { stopped = true; clearInterval(id); if (shown) URL.revokeObjectURL(shown) }
  }, [api, camera.id, camera.active])
  return (
    <Box sx={{ position: 'relative', aspectRatio: '16 / 9', bgcolor: '#15110f', color: '#d8cfc8', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      {src && camera.active && !none
        ? <Box component="img" src={src} alt={t('The latest picture from {name}', { name: camera.name })} sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        : (
          <Stack sx={{ alignItems: 'center', gap: 0.5, px: 2, textAlign: 'center' }}>
            <NoPictureIcon />
            <Typography variant="body2">{camera.active ? t('No picture yet') : t('Switched off')}</Typography>
          </Stack>
        )}
      {live?.picture_at && isLive(live) && (
        <Box sx={{ position: 'absolute', left: 8, top: 8, px: 1, py: 0.25, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: '0.75rem' }}>
          {t('Picture from {when}', { when: ago(live.picture_at) })}
        </Box>
      )}
    </Box>
  )
}

function CameraTile({ camera, live, selected, onClick, tz }: { camera: Camera; live?: CameraLive; selected: boolean; onClick: () => void; tz: string }) {
  return (
    <Card variant="outlined" sx={{ overflow: 'hidden', ...(selected ? { borderColor: tokens.rose, boxShadow: `0 0 0 1px ${tokens.rose}` } : {}) }}>
      <CardActionArea onClick={onClick} aria-pressed={selected} aria-label={camera.name}>
        <LivePicture camera={camera} live={live} />
        <Box sx={{ p: 1.5 }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 500, flex: 1, minWidth: 0 }} noWrap>{camera.name}</Typography>
            <Status camera={camera} live={live} />
          </Stack>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
            {[camera.placement === 'outdoor' ? t('Outdoor') : t('Indoor'),
              camera.last_clip_at ? t('last clip {time}', { time: formatLocal(camera.last_clip_at, 'HH:mm', tz) }) : t('no clips yet'),
              live && (live.kept_today || live.skipped_today) ? t('{kept} kept today, {skipped} still ones left out', { kept: live.kept_today, skipped: live.skipped_today }) : null,
            ].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
      </CardActionArea>
    </Card>
  )
}

function CameraDetail({ camera, live, ftp, tz }: { camera: Camera; live?: CameraLive; ftp: { host: string; port: number } | null; tz: string }) {
  const [tab, setTab] = useState<'clips' | 'setup' | 'settings'>(camera.last_seen_at || live?.picture_at ? 'clips' : 'setup')
  return (
    <Card sx={{ p: { xs: 1.5, md: 2 } }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <CameraIcon sx={{ color: tokens.inkSoft }} />
        <Typography variant="h6" component="h2" sx={{ flex: 1 }}>{camera.name}</Typography>
        <Status camera={camera} live={live} />
      </Stack>
      {camera.last_error && <Alert severity="error" sx={{ mb: 1.5 }}>{camera.last_error}</Alert>}
      <Tabs value={tab} onChange={(_, v: typeof tab) => setTab(v)} sx={{ mb: 2, borderBottom: `1px solid ${tokens.line}` }} variant="scrollable" allowScrollButtonsMobile>
        <Tab value="clips" label={t('Recordings')} />
        <Tab value="setup" label={t('Set up')} />
        <Tab value="settings" label={t('Settings')} />
      </Tabs>
      {tab === 'clips' && <Recordings camera={camera} tz={tz} />}
      {tab === 'setup' && <SetUp camera={camera} ftp={ftp} />}
      {tab === 'settings' && <CameraSettings camera={camera} />}
    </Card>
  )
}

const dayLabel = (day: string) => (day === today() ? t('Today') : day === addDays(today(), -1) ? t('Yesterday') : formatLocal(`${day}T12:00:00Z`, 'EEE d MMM'))
const lengthText = (s: number | null) => (s === null ? '' : s < 60 ? tn(s, '{n} second', '{n} seconds') : t('{m} min {s} s', { m: Math.floor(s / 60), s: s % 60 }))

/** The camera's clips by day, each to play, keep for an incident or delete. */
function Recordings({ camera, tz }: { camera: Camera; tz: string }) {
  const { api } = useApp()
  const clips = useAsync('camera-clips', () => api.cameraClips(camera.id), [camera.id], { refetchInterval: 60_000 })
  const days = useMemo(() => clipsByDay(clips.data ?? [], tz), [clips.data, tz])
  const [day, setDay] = useState<string | null>(null)
  const [playing, setPlaying] = useState<CameraClip | null>(null)
  const [keeping, setKeeping] = useState<CameraClip | null>(null)
  const shown = days.find(d => d.day === day) ?? days[0] ?? null
  const all = clips.data ?? []
  const perDay = bytesPerDay(all)
  const total = all.reduce((n, c) => n + c.bytes, 0)
  const kept = all.filter(c => c.kept)

  return (
    <>
      <ErrorBox error={clips.error} />
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
        {[tn(all.length, '{n} clip', '{n} clips'), sizeText(total || 1),
          perDay ? t('about {size} a day', { size: sizeText(perDay) }) : null,
          tn(camera.keep_days, 'kept {n} day, then deleted', 'kept {n} days, then deleted')].filter(Boolean).join(' · ')}
        {kept.length ? ` · ${tn(kept.length, '{n} kept for an incident', '{n} kept for an incident')}` : ''}
      </Typography>
      {clips.data && !all.length ? (
        <Empty>{t('No clips yet. Once the camera sends video, it shows here by day, and goes in your storage under Business Agent/Cameras/{name}.', { name: camera.name })}</Empty>
      ) : (
        <>
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mb: 1.5 }} role="tablist" aria-label={t('Days')}>
            {days.map(d => (
              <Chip key={d.day} role="tab" aria-selected={d.day === shown?.day} label={`${dayLabel(d.day)} (${d.clips.length})`} onClick={() => setDay(d.day)}
                color={d.day === shown?.day ? 'primary' : 'default'} variant={d.day === shown?.day ? 'filled' : 'outlined'} />
            ))}
          </Stack>
          <Stack spacing={0.75}>
            {shown?.clips.map(c => (
              <Box key={c.id} component="article" aria-label={formatLocal(c.started_at, 'HH:mm:ss', tz)}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', p: 1, borderRadius: 2, border: `1px solid ${c.kept ? tokens.rose : tokens.line}` }}>
                <IconButton aria-label={t('Play the clip from {time}', { time: formatLocal(c.started_at, 'HH:mm:ss', tz) })} onClick={() => setPlaying(c)}><PlayIcon /></IconButton>
                <Box sx={{ flex: 1, minWidth: 140 }}>
                  <Typography sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{formatLocal(c.started_at, 'HH:mm:ss', tz)}</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{[lengthText(c.seconds), sizeText(c.bytes), c.motion ? t('something moved') : null].filter(Boolean).join(' · ')}</Typography>
                  {c.kept && <Typography variant="caption" sx={{ display: 'block', color: tokens.roseDeep }}>{c.note ? t('Kept: {note}', { note: c.note }) : t('Kept for an incident')}</Typography>}
                </Box>
                <Tooltip title={c.kept ? t('Kept for an incident: not deleted after {n} days', { n: camera.keep_days }) : t('Keep for an incident')}>
                  <IconButton aria-label={c.kept ? t('Change why it’s kept') : t('Keep for an incident')} onClick={() => setKeeping(c)} sx={c.kept ? { color: tokens.roseDeep } : undefined}><KeptIcon /></IconButton>
                </Tooltip>
                {c.link && <Tooltip title={c.storage === 'onedrive' ? t('Open in OneDrive') : t('Open in Google Drive')}>
                  <IconButton component="a" href={c.link} target="_blank" rel="noopener" aria-label={c.storage === 'onedrive' ? t('Open in OneDrive') : t('Open in Google Drive')}><OpenIcon /></IconButton>
                </Tooltip>}
              </Box>
            ))}
          </Stack>
        </>
      )}
      {playing && <PlayDialog clip={playing} tz={tz} onClose={() => setPlaying(null)} />}
      {keeping && <KeepDialog clip={keeping} tz={tz} onClose={() => setKeeping(null)} />}
    </>
  )
}

function PlayDialog({ clip, tz, onClose }: { clip: CameraClip; tz: string; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    let stopped = false
    api.playClip(clip.id).then(u => { if (!stopped) setUrl(u) }, e => { if (!stopped) setError(e instanceof Error ? e.message : String(e)) })
    return () => { stopped = true }
  }, [api, clip.id])
  const remove = async () => { if (await run(() => api.deleteClip(clip.id), t('Clip deleted, from your storage too'))) onClose() }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{`${dayLabel(formatLocal(clip.started_at, 'yyyy-MM-dd', tz))}, ${formatLocal(clip.started_at, 'HH:mm:ss', tz)}`}</DialogTitle>
      <DialogContent>
        <ErrorBox error={error} />
        {url ? <Box component="video" src={url} controls autoPlay playsInline sx={{ width: '100%', borderRadius: 2, bgcolor: '#000' }} />
          : url === null ? <Empty>{t('In the demo there’s no video to play. With your own cameras the clip plays here, straight from your storage.')}</Empty>
          : !error && <Typography variant="body2">{t('Loading…')}</Typography>}
      </DialogContent>
      <DialogActions>
        {deleting ? <>
          <Typography variant="body2" sx={{ mr: 'auto', pl: 1 }}>{t('Delete this clip? It’s deleted from your storage too.')}</Typography>
          <Button color="error" variant="contained" onClick={remove}>{t('Delete')}</Button>
          <Button onClick={() => setDeleting(false)}>{t('Keep')}</Button>
        </> : <>
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleting(true)} sx={{ mr: 'auto' }}>{t('Delete clip')}</Button>
          <Button onClick={onClose}>{t('Close')}</Button>
        </>}
      </DialogActions>
    </Dialog>
  )
}

function KeepDialog({ clip, tz, onClose }: { clip: CameraClip; tz: string; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [note, setNote] = useState(clip.note ?? '')
  const save = async (kept: boolean) => {
    if (await run(() => api.keepClip(clip.id, kept, kept ? note.trim() || null : null), kept ? t('Kept for the incident') : t('No longer kept: deleted when its days are up'))) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Keep for an incident')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          {t('The clip from {time} isn’t deleted when its days are up. If it shows a crime, the law asks for it to be handed to the police within 72 hours of finding it.', { time: formatLocal(clip.started_at, 'HH:mm:ss', tz) })}
        </Typography>
        <TextField fullWidth autoFocus label={t('What happened (optional)')} value={note} onChange={e => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
      </DialogContent>
      <DialogActions>
        {clip.kept && <Button onClick={() => save(false)} sx={{ mr: 'auto' }}>{t('Stop keeping it')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => save(true)}>{t('Keep the clip')}</Button>
      </DialogActions>
    </Dialog>
  )
}

function Field({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const notify = useNotify()
  const copy = () => navigator.clipboard.writeText(value).then(() => notify(t('Copied'), 'success'), () => notify(value, 'info'))
  return (
    <TextField fullWidth size="small" label={label} value={value}
      slotProps={{ htmlInput: { readOnly: true, style: mono ? { fontFamily: 'monospace' } : undefined },
        input: { endAdornment: <InputAdornment position="end"><Tooltip title={t('Copy')}><IconButton size="small" aria-label={t('Copy {what}', { what: label })} onClick={copy}><CopyIcon fontSize="small" /></IconButton></Tooltip></InputAdornment> } }} />
  )
}

/** Where the camera sends to, and the steps in the Reolink app. */
function SetUp({ camera, ftp }: { camera: Camera; ftp: { host: string; port: number } | null }) {
  const { api } = useApp()
  const run = useAction()
  const [relinking, setRelinking] = useState(false)
  const renew = () => run(async () => { await api.newCameraPassword(camera.id); setRelinking(false) }, t('New password made. Type it into the camera’s FTP settings: the old one no longer works.'))
  const step = (n: number, text: ReactNode) => (
    <Stack direction="row" sx={{ gap: 1.25 }} component="li">
      <Box sx={{ width: 24, height: 24, flexShrink: 0, borderRadius: '50%', bgcolor: tokens.roseSoft, color: tokens.roseDeep, display: 'grid', placeItems: 'center', fontSize: '0.8rem', fontWeight: 600 }}>{n}</Box>
      <Typography variant="body2" sx={{ pt: 0.25 }}>{text}</Typography>
    </Stack>
  )
  const b = (s: string | number) => <Box component="b" sx={{ fontWeight: 600 }}>{s}</Box>
  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>{t('What to type into the camera')}</Typography>
        {!ftp && <Alert severity="info" sx={{ my: 1 }}>{t('Camera uploads aren’t switched on yet: the server address shows here once they are. The username and password are ready already.')}</Alert>}
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' }, mt: 1 }}>
          <Field label={t('FTP server')} value={ftp?.host ?? '…'} />
          <Field label={t('Port')} value={String(ftp?.port ?? 21)} />
          <Field label={t('User Name')} value={camera.ftp_user} />
          <Stack direction="row" sx={{ gap: 0.5, alignItems: 'center' }}>
            <Field label={t('Password')} value={camera.ftp_password} />
            <Tooltip title={t('New password')}><IconButton aria-label={t('New password')} onClick={() => setRelinking(true)}><RefreshIcon /></IconButton></Tooltip>
          </Stack>
        </Box>
      </Box>

      <Box>
        <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>{t('In the Reolink app')}</Typography>
        <Stack component="ol" spacing={1.25} sx={{ listStyle: 'none', p: 0, m: 0, mt: 1 }}>
          {step(1, t('Set the camera up as usual on the café’s Wi-Fi (or its cable), with a microSD card in it: it keeps recording there too, as a backup you watch in the app.'))}
          {step(2, t('Turn off sound recording (camera settings → Audio). In Spain staff can’t be recorded with sound.'))}
          {step(3, tr('Tap the gear icon → {more} → {ftp} → turn on {upload} → {setup}.', { more: b(t('More Features')), ftp: b('FTP'), upload: b(t('FTP Upload')), setup: b(t('Set Up Now')) }))}
          {step(4, tr('Type in the {server}, {port}, {user} and {password} above. Leave {anon} off and {dir} empty, and set {mode} to {pasv}.', {
            server: b(t('FTP server')), port: b(t('Port')), user: b(t('User Name')), password: b(t('Password')), anon: b(t('Anonymous')), dir: b(t('Directory')),
            mode: b(t('Transport Mode')), pasv: b('Pasv') }))}
          {step(5, tr('Turn on {ftps} so what it sends is encrypted. If the test says it can’t connect, turn it off again.', { ftps: b(t('FTPs Only')) }))}
          {step(6, tr('{type}: {both}. {interval}: {seconds}. {size}: {mb}.', { type: b(t('File Type')), both: b(t('Video and picture')), interval: b(t('Interval')),
            seconds: b(tn(PICTURE_SECONDS, '{n} second', '{n} seconds')), size: b(t('Max File Size')), mb: b(`${VIDEO_PIECE_MB} MB`) }))}
          {step(7, tr('Schedule: {timer} for every hour (recommended) sends a picture every few seconds and the video all the time; this page keeps only the video in which something moves. Or {alarm} only: a clip when something moves, and the picture here changes only then.', {
            timer: b(t('Timer')), alarm: b(t('Alarm (motion)')) }))}
          {step(8, t('Save. The camera shows here as sending now within a minute, with its picture.'))}
        </Stack>
      </Box>

      <Alert severity="info" icon={false}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{t('Cameras and the law in Spain')}</Typography>
        <Stack component="ul" sx={{ m: 0, pl: 2.5 }} spacing={0.25}>
          <Typography component="li" variant="body2">{t('Put up a “Zona videovigilada” sign at the entrance, saying who’s responsible and how to ask about the recordings.')}</Typography>
          <Typography component="li" variant="body2">{t('Tell the team in writing before the cameras go on, and add them to the staff rules.')}</Typography>
          <Typography component="li" variant="body2">{t('No cameras in the toilets, changing room or staff rest area, and none pointing at the street.')}</Typography>
          <Typography component="li" variant="body2">{t('Video is deleted after a month at most: this page does it, after the days you choose ({n} at most).', { n: MAX_KEEP_DAYS })}</Typography>
        </Stack>
      </Alert>

      {relinking && (
        <Dialog open onClose={() => setRelinking(false)} maxWidth="xs" fullWidth>
          <DialogTitle>{t('Make a new password?')}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{t('The old one stops working straight away, so the camera can’t send anything until the new one is typed into its FTP settings. Do this if the password was shared by mistake.')}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRelinking(false)}>{t('Cancel')}</Button>
            <Button variant="contained" color="error" onClick={renew}>{t('Make a new password')}</Button>
          </DialogActions>
        </Dialog>
      )}
    </Stack>
  )
}

function CameraSettings({ camera }: { camera: Camera }) {
  const { api } = useApp()
  const run = useAction()
  const saved = inputOf(camera)
  const [c, setC] = useState<CameraInput>(saved)
  const [deleting, setDeleting] = useState(false)
  const dirty = JSON.stringify(c) !== JSON.stringify(saved)
  const set = (patch: Partial<CameraInput>) => setC(x => ({ ...x, ...patch }))
  const save = () => run(async () => {
    const problem = cameraProblem(c)
    if (problem) throw new Error(t(problem))
    await api.saveCamera(c)
  }, t('Saved'))
  const remove = () => run(() => api.deleteCamera(camera.id), t('Deleted {name}, with its clips', { name: camera.name }))
  return (
    <Stack spacing={2.25}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField fullWidth label={t('Name')} value={c.name} onChange={e => set({ name: e.target.value })} slotProps={{ htmlInput: { maxLength: 60 } }}
          helperText={t('Also its folder’s name in your storage.')} />
        <ToggleButtonGroup exclusive size="small" value={c.placement} onChange={(_, v: Placement | null) => v && set({ placement: v })} aria-label={t('Where it is')}
          sx={{ alignSelf: { sm: 'flex-start' }, mt: { sm: 1 }, flexShrink: 0 }}>
          {PLACEMENTS.map(p => <ToggleButton key={p.id} value={p.id}>{t(p.label)}</ToggleButton>)}
        </ToggleButtonGroup>
      </Stack>
      <TextField select label={t('Keep video for')} value={c.keep_days} onChange={e => set({ keep_days: Number(e.target.value) })}
        helperText={t('Then it’s deleted from your storage. Spain allows a month at most; a clip kept for an incident stays.')}>
        {[...new Set([...KEEP_DAY_CHOICES, c.keep_days])].sort((a, b) => a - b).map(n => <MenuItem key={n} value={n}>{tn(n, '{n} day', '{n} days')}</MenuItem>)}
      </TextField>
      <Box>
        <Typography variant="overline" component="h4" sx={{ color: 'text.secondary' }}>{t('Which video to keep')}</Typography>
        <RadioGroup value={c.keep_video} onChange={e => set({ keep_video: e.target.value as CameraInput['keep_video'] })}>
          <FormControlLabel value="motion" control={<Radio size="small" />} label={t('Only video in which something moves (saves space)')} />
          <FormControlLabel value="all" control={<Radio size="small" />} label={t('Everything the camera sends')} />
        </RadioGroup>
      </Box>
      <FormControlLabel control={<Switch checked={c.active} onChange={e => set({ active: e.target.checked })} />}
        label={c.active ? t('On: what it sends is kept') : t('Switched off: what it sends is turned away')} />
      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="contained" disabled={!dirty} onClick={save}>{t('Save changes')}</Button>
        {dirty && <Button onClick={() => setC(saved)}>{t('Undo changes')}</Button>}
        <Box sx={{ flex: 1 }} />
        {deleting ? <>
          <Typography variant="body2">{t('Delete {name} and all its clips? They’re deleted from your storage too.', { name: camera.name })}</Typography>
          <Button size="small" color="error" variant="contained" onClick={remove}>{t('Delete')}</Button>
          <Button size="small" onClick={() => setDeleting(false)}>{t('Keep')}</Button>
        </> : <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={() => setDeleting(true)}>{t('Delete camera')}</Button>}
      </Stack>
    </Stack>
  )
}

function NewCameraDialog({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const { api } = useApp()
  const run = useAction()
  const [name, setName] = useState('')
  const [placement, setPlacement] = useState<Placement>('indoor')
  const make = async () => {
    let id = ''
    const problem = cameraProblem({ name, keep_days: MAX_KEEP_DAYS })
    const ok = await run(async () => {
      if (problem) throw new Error(t(problem))
      id = await api.saveCamera(newCamera(name.trim(), placement))
    }, t('Added {name}. Now type its login into the Reolink app.', { name: name.trim() }))
    if (ok) { onMade(id); onClose() }
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Add a camera')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField autoFocus label={t('Name')} placeholder={t('e.g. Counter')} value={name} onChange={e => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) void make() }} />
          <ToggleButtonGroup exclusive fullWidth size="small" value={placement} onChange={(_, v: Placement | null) => v && setPlacement(v)} aria-label={t('Where it is')}>
            {PLACEMENTS.map(p => <ToggleButton key={p.id} value={p.id}>{t(p.label)}</ToggleButton>)}
          </ToggleButtonGroup>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('It gets its own login for the camera’s app, and keeps its video for 30 days unless you choose fewer.')}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!name.trim()} onClick={make}>{t('Add')}</Button>
      </DialogActions>
    </Dialog>
  )
}
