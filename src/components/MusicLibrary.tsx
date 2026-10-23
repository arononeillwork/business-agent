// The business's music for stories and reels (docs/SOCIAL_MUSIC_PLAN.md): the library (starter
// pack, its own uploads, AI tracks), uploading a track with the rights tick, and Create with AI
// (ElevenLabs, paid per use). The composer's music picker (MusicPicker.tsx) is built from these.
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  InputAdornment, LinearProgress, Menu, MenuItem, Slider, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
  useMediaQuery, useTheme,
} from '@mui/material'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import PauseIcon from '@mui/icons-material/PauseRounded'
import StarIcon from '@mui/icons-material/StarRounded'
import StarOutlineIcon from '@mui/icons-material/StarOutlineRounded'
import MoreIcon from '@mui/icons-material/MoreVert'
import UploadIcon from '@mui/icons-material/UploadFileOutlined'
import SparkleIcon from '@mui/icons-material/AutoAwesomeOutlined'
import SearchIcon from '@mui/icons-material/Search'
import MusicIcon from '@mui/icons-material/MusicNoteOutlined'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { PromptError, type AiTrackResult, type MusicStatus } from '../data/api'
import { analyzeAudio } from '../lib/media'
import { INSTRUMENTS, MAX_AUDIO_BYTES, MOODS, MOOD_IDS, aiPrompt, aiSeconds, energyOf, formatTime, isMood, namesArtist } from '../../shared/music'
import type { MusicTrack, PostKind } from '../../shared/types'
import { formatLocal, ownTimeZone } from '../../shared/time'
import { tokens } from '../theme'
import { msg, t, tn } from '../i18n'

// ---------------------------------------------------------------------------------------------
// Playing a track (one at a time on the page)
// ---------------------------------------------------------------------------------------------
export interface Player {
  /** What's playing (the key it was started with), or null. */
  playing: string | null
  /** Play `url` from `from`, looping back at `to`; the same key again stops it. */
  play: (key: string, url: string, from?: number, to?: number) => void
  stop: () => void
  /** Where it is now, in seconds (for following along on a waveform). */
  time: () => number
}

export function usePlayer(): Player {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  const current = useRef<string | null>(null)
  const stop = useCallback(() => {
    audio.current?.pause()
    current.current = null
    setPlaying(null)
  }, [])
  const play = useCallback((key: string, url: string, from = 0, to?: number) => {
    if (current.current === key) { stop(); return }
    const a = audio.current ?? (audio.current = new Audio())
    a.pause()
    a.src = url
    a.preload = 'auto'
    const seek = () => { try { a.currentTime = from } catch { /* not seekable yet */ } }
    a.onloadedmetadata = seek
    a.ontimeupdate = () => { if (to !== undefined && a.currentTime >= to) a.currentTime = from }
    a.onended = () => { if (to !== undefined) { seek(); void a.play() } else stop() }
    seek()
    current.current = key
    setPlaying(key)
    a.play().catch(() => { if (current.current === key) stop() })
  }, [stop])
  useEffect(() => () => { audio.current?.pause() }, [])
  return { playing, play, stop, time: () => audio.current?.currentTime ?? 0 }
}

// ---------------------------------------------------------------------------------------------
// The waveform, with the chosen part when there is one
// ---------------------------------------------------------------------------------------------
/** The shape of a track, and the window of the part chosen (drag it, or tap where it should start). */
export function Waveform({ peaks, duration, part, onMove, height = 56, label }: {
  peaks: number[] | null; duration: number; part?: { start: number; seconds: number }; onMove?: (start: number) => void; height?: number; label?: string
}) {
  const box = useRef<SVGSVGElement>(null)
  const drag = useRef<{ offset: number } | null>(null)
  const bars = peaks?.length ? peaks : Array.from({ length: 120 }, (_, i) => 0.25 + 0.15 * Math.sin(i / 3))
  const w = 1000
  const timeAt = (clientX: number) => {
    const r = box.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * duration
  }
  const move = (start: number) => onMove?.(Math.round(Math.min(Math.max(0, start), Math.max(0, duration - (part?.seconds ?? 0))) * 10) / 10)
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!onMove || !part) return
    const at = timeAt(e.clientX)
    // Grabbing the window keeps where it was held; elsewhere, the window starts there.
    drag.current = { offset: at >= part.start && at <= part.start + part.seconds ? at - part.start : part.seconds / 2 }
    e.currentTarget.setPointerCapture(e.pointerId)
    move(at - drag.current.offset)
  }
  const x = (s: number) => (duration ? (s / duration) * w : 0)
  return (
    <Box component="svg" ref={box} viewBox={`0 0 ${w} 100`} preserveAspectRatio="none" role={onMove ? 'slider' : 'img'}
      aria-label={label ?? t('The track')} {...(onMove && part ? {
        tabIndex: 0, 'aria-valuemin': 0, 'aria-valuemax': Math.max(0, Math.round(duration - part.seconds)), 'aria-valuenow': Math.round(part.start),
        'aria-valuetext': t('From {from} to {to}', { from: formatTime(part.start), to: formatTime(part.start + part.seconds) }),
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); move(part.start + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1)) }
        },
      } : {})}
      onPointerDown={down} onPointerMove={e => { if (drag.current) move(timeAt(e.clientX) - drag.current.offset) }}
      onPointerUp={() => { drag.current = null }}
      sx={{ width: '100%', height, display: 'block', touchAction: 'none', cursor: onMove ? 'grab' : 'default', borderRadius: 1.5, bgcolor: tokens.surfaceAlt,
        '&:focus-visible': { outline: `2px solid ${tokens.roseDeep}`, outlineOffset: 2 } }}>
      {part && <rect x={x(part.start)} y={0} width={Math.max(4, x(part.seconds))} height={100} fill={tokens.roseSoft} stroke={tokens.roseDeep} strokeWidth={3} rx={8} />}
      {bars.map((p, i) => {
        const at = (i / bars.length) * duration
        const inPart = part && at >= part.start && at <= part.start + part.seconds
        const h = Math.max(4, p * 84)
        return <rect key={i} x={(i / bars.length) * w + 1} y={50 - h / 2} width={Math.max(1, w / bars.length - 2)} height={h} rx={2}
          fill={inPart ? tokens.roseDeep : tokens.inkFaint} opacity={peaks ? 1 : 0.35} />
      })}
    </Box>
  )
}

// ---------------------------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------------------------
const SOURCE_LABEL: Record<MusicTrack['source'], string> = { starter: msg('Starter pack'), ai: msg('Made with AI'), upload: msg('Yours') }
export const sourceLabel = (s: MusicTrack['source']) => t(SOURCE_LABEL[s])

/** A track in a list: play, its name and moods, its length; star, and more (rename, remove) for admins. */
export function TrackRow({ track, player, onStar, onRename, onRemove, action, part }: {
  track: MusicTrack; player: Player; onStar?: () => void; onRename?: () => void; onRemove?: () => void; action?: ReactNode
  /** Play this part rather than from the best part. */
  part?: { start: number; seconds: number }
}) {
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const key = `track-${track.id}`
  const on = player.playing === key
  const from = part?.start ?? track.highlight_s
  return (
    <Stack direction="row" spacing={1.25} component="li" aria-label={track.title}
      sx={{ alignItems: 'center', py: 1, px: 1, borderRadius: 2, listStyle: 'none', '&:hover': { bgcolor: tokens.surfaceAlt } }}>
      <IconButton aria-label={on ? t('Pause {title}', { title: track.title }) : t('Play {title}', { title: track.title })}
        onClick={() => player.play(key, track.url, from, part ? part.start + part.seconds : undefined)}
        sx={{ bgcolor: on ? tokens.roseDeep : tokens.roseSoft, color: on ? '#fff' : tokens.roseDeep, '&:hover': { bgcolor: on ? tokens.roseDeep : tokens.roseSoft } }}>
        {on ? <PauseIcon /> : <PlayIcon />}
      </IconButton>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 500 }}>{track.title}</Typography>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.25, color: 'text.secondary' }}>
          <Typography variant="caption">{track.artist ? `${track.artist} · ` : ''}{sourceLabel(track.source)} · {formatTime(track.duration_s)}</Typography>
          {track.moods.filter(isMood).slice(0, 3).map(m => (
            <Box key={m} component="span" sx={{ fontSize: '0.7rem', px: 0.75, borderRadius: 1, bgcolor: tokens.neutralBg }}>{t(MOODS[m].label)}</Box>
          ))}
        </Stack>
      </Box>
      {onStar && (
        <Tooltip title={track.saved ? t('Saved') : t('Save')}>
          <IconButton aria-label={track.saved ? t('Unsave {title}', { title: track.title }) : t('Save {title}', { title: track.title })} aria-pressed={track.saved} onClick={onStar}>
            {track.saved ? <StarIcon sx={{ color: tokens.roseDeep }} /> : <StarOutlineIcon />}
          </IconButton>
        </Tooltip>
      )}
      {action}
      {(onRename || onRemove) && (
        <>
          <IconButton aria-label={t('More for {title}', { title: track.title })} onClick={e => setMenu(e.currentTarget)}><MoreIcon /></IconButton>
          <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
            {onRename && <MenuItem onClick={() => { setMenu(null); onRename() }}>{t('Rename')}</MenuItem>}
            {onRemove && <MenuItem onClick={() => { setMenu(null); onRemove() }}>{t('Remove from the library')}</MenuItem>}
          </Menu>
        </>
      )}
    </Stack>
  )
}

/**
 * Tracks made before their shape was known (AI and starter tracks are made by the Worker): work it
 * out in the browser, one at a time, and keep it with the track.
 */
const triedFacts = new Set<string>()
export function useTrackFacts(tracks: MusicTrack[] | null) {
  const { api, isAdmin } = useApp()
  useEffect(() => {
    if (!isAdmin || !tracks) return
    let stopped = false
    void (async () => {
      for (const tr of tracks.filter(x => !x.waveform && !triedFacts.has(x.id))) {
        if (stopped) return
        triedFacts.add(tr.id)
        try {
          const f = await analyzeAudio(tr.url)
          if (!stopped) await api.saveTrack(tr.id, { waveform: f.waveform, highlight_s: f.highlight, ...(tr.bpm ? {} : { bpm: f.bpm }) })
          Object.assign(tr, { waveform: f.waveform, highlight_s: f.highlight })
        } catch { /* left without a shape: it still plays */ }
      }
    })()
    return () => { stopped = true }
  }, [tracks, api, isAdmin])
}

// ---------------------------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------------------------
type Filter = 'all' | 'saved' | 'yours' | 'starter'

/** The music library, from the Social planner's Music button. */
export function MusicLibraryDialog({ onClose }: { onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const tracks = useAsync('music-tracks', () => api.musicTracks(), [])
  const status = useAsync('music-status', () => api.musicStatus(), [])
  const player = usePlayer()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [upload, setUpload] = useState(false)
  const [create, setCreate] = useState(false)
  const [renaming, setRenaming] = useState<MusicTrack | null>(null)
  useTrackFacts(tracks.data)
  const shown = (tracks.data ?? []).filter(tr => (filter === 'all' || (filter === 'saved' ? tr.saved : filter === 'starter' ? tr.source === 'starter' : tr.source !== 'starter'))
    && matchesSearch(tr, search))
  return (
    <Dialog open onClose={() => { player.stop(); onClose() }} fullWidth maxWidth="sm" fullScreen={phone} aria-labelledby="music-library-title">
      <DialogTitle id="music-library-title">{t('Music')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('Tracks for your stories and reels: the starter pack, your own and the ones made with AI. Only music you have the right to use goes out with posts.')}
          </Typography>
          <MusicStatusNotes status={status.data} />
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <Button variant="contained" startIcon={<SparkleIcon />} onClick={() => setCreate(true)} disabled={!status.data?.ai}>{t('Create with AI')}</Button>
            <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => setUpload(true)} disabled={!status.data?.storage}>{t('Upload a track')}</Button>
          </Stack>
          <SearchAndFilter search={search} onSearch={setSearch} filter={filter} onFilter={setFilter} />
          <ErrorText error={tracks.error} />
          {!tracks.data ? <LinearProgress />
            : shown.length ? (
              <Box component="ul" aria-label={t('Tracks')} sx={{ m: 0, p: 0 }}>
                {shown.map(tr => (
                  <TrackRow key={tr.id} track={tr} player={player}
                    onStar={() => run(() => api.saveTrack(tr.id, { saved: !tr.saved }))}
                    onRename={() => setRenaming(tr)}
                    onRemove={() => run(async () => { player.stop(); await api.deleteTrack(tr.id) }, t('Removed from the library'))} />
                ))}
              </Box>
            ) : <EmptyLibrary filtered={!!search || filter !== 'all'} />}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => { player.stop(); onClose() }}>{t('Close')}</Button>
      </DialogActions>
      {upload && <UploadTrackDialog onClose={() => setUpload(false)} onSaved={() => { void tracks.reload() }} />}
      {create && <CreateWithAiDialog seconds={30} kind="reel" onClose={() => setCreate(false)} onKept={() => { void tracks.reload() }} />}
      {renaming && <RenameDialog track={renaming} onClose={() => setRenaming(null)} />}
    </Dialog>
  )
}

export const matchesSearch = (tr: MusicTrack, q: string) => {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return [tr.title, tr.artist ?? '', tr.genre ?? '', ...tr.moods.filter(isMood).flatMap(m => [m, t(MOODS[m].label)])].some(x => x.toLowerCase().includes(s))
}

export function SearchAndFilter({ search, onSearch, filter, onFilter }: { search: string; onSearch: (s: string) => void; filter: Filter; onFilter: (f: Filter) => void }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
      <TextField size="small" value={search} onChange={e => onSearch(e.target.value)} placeholder={t('Search by name or mood')}
        slotProps={{ htmlInput: { 'aria-label': t('Search the music') }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} sx={{ flex: 1 }} />
      <ToggleButtonGroup exclusive size="small" value={filter} onChange={(_, v: Filter | null) => v && onFilter(v)} aria-label={t('Which tracks')}>
        <ToggleButton value="all" sx={{ px: 1.25 }}>{t('All')}</ToggleButton>
        <ToggleButton value="saved" sx={{ px: 1.25 }}>{t('Saved')}</ToggleButton>
        <ToggleButton value="yours" sx={{ px: 1.25 }}>{t('Yours')}</ToggleButton>
        <ToggleButton value="starter" sx={{ px: 1.25 }}>{t('Starter pack')}</ToggleButton>
      </ToggleButtonGroup>
    </Stack>
  )
}

function EmptyLibrary({ filtered }: { filtered: boolean }) {
  return (
    <Stack spacing={1} sx={{ alignItems: 'center', py: 4, color: 'text.secondary', textAlign: 'center' }}>
      <MusicIcon />
      <Typography variant="body2">{filtered ? t('No tracks match.') : t('No tracks yet. Upload one of your own, or create one with AI.')}</Typography>
    </Stack>
  )
}

const ErrorText = ({ error }: { error: string | null }) => (error ? <Alert severity="error">{error}</Alert> : null)

/** What isn't switched on yet, and what to do about it. */
export function MusicStatusNotes({ status }: { status: MusicStatus | null }) {
  if (!status) return null
  return (
    <>
      {!status.storage && (
        <Alert severity="info" action={<Button size="small" component={RouterLink} to="/connections">{t('Connect')}</Button>}>
          {t('Connect Google Drive or OneDrive to keep your tracks and the posts made with them.')}
        </Alert>
      )}
      {status.starter.on && status.starter.made < status.starter.of && (
        <Alert severity="info">{t('The starter pack is on its way: {made} of {of} tracks so far.', { made: status.starter.made, of: status.starter.of })}</Alert>
      )}
    </>
  )
}

function RenameDialog({ track, onClose }: { track: MusicTrack; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [title, setTitle] = useState(track.title)
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('Rename')}</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth label={t('Name')} value={title} onChange={e => setTitle(e.target.value)} sx={{ mt: 1 }} slotProps={{ htmlInput: { maxLength: 80 } }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!title.trim()} onClick={async () => { if (await run(() => api.saveTrack(track.id, { title: title.trim() }), t('Saved'))) onClose() }}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------------------------
// Uploading a track of the business's own
// ---------------------------------------------------------------------------------------------
export function UploadTrackDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (t: MusicTrack) => void }) {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [facts, setFacts] = useState<Awaited<ReturnType<typeof analyzeAudio>> | null>(null)
  const [reading, setReading] = useState(false)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [moods, setMoods] = useState<string[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const choose = async (f: File) => {
    if (f.size > MAX_AUDIO_BYTES) { notify(t('Tracks can be up to 20 MB'), 'error'); return }
    if (!/\.(mp3|m4a)$/i.test(f.name) && !/^audio\/(mpeg|mp3|mp4|x-m4a)$/.test(f.type)) { notify(t('Use an MP3 or M4A track'), 'error'); return }
    setFile(f)
    setTitle(f.name.replace(/\.\w+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 80))
    setReading(true)
    try { setFacts(await analyzeAudio(f)) } catch (e) { notify(e instanceof Error ? e.message : String(e), 'error'); setFile(null) } finally { setReading(false) }
  }
  const save = () => run(async () => {
    setSaving(true)
    try {
      const track = await api.uploadTrack(file!, { title: title.trim(), artist: artist.trim() || null, moods, duration_s: facts!.duration,
        waveform: facts!.waveform, highlight_s: facts!.highlight, bpm: facts!.bpm, confirmed })
      onSaved(track)
      onClose()
    } finally { setSaving(false) }
  }, t('Added to your music'))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="upload-track-title">
      <DialogTitle id="upload-track-title">{t('Upload a track')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <input ref={input} type="file" hidden accept="audio/mpeg,audio/mp4,audio/x-m4a,.mp3,.m4a" aria-label={t('Track file')}
            onChange={e => { const f = e.target.files?.[0]; if (f) void choose(f); e.target.value = '' }} />
          <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => input.current?.click()} sx={{ alignSelf: 'flex-start' }}>
            {file ? t('Choose another file') : t('Choose an MP3 or M4A')}
          </Button>
          {reading && <LinearProgress aria-label={t('Reading the track')} />}
          {file && facts && (
            <>
              <Waveform peaks={facts.waveform} duration={facts.duration} label={t('The track')} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('{length} long', { length: formatTime(facts.duration) })}</Typography>
              <TextField label={t('Name')} value={title} onChange={e => setTitle(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} />
              <TextField label={t('Artist (optional)')} value={artist} onChange={e => setArtist(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} />
              <MoodChips value={moods} onChange={setMoods} label={t('Moods')} max={5} />
              <FormControlLabel control={<Checkbox checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />}
                label={t('We have the right to use this music on social media (we made it, bought a licence that covers it, or it’s free for commercial use).')} />
              <Alert severity="warning" variant="outlined">
                {t('Songs from Spotify, YouTube or a CD can’t be used: listening to them isn’t a licence to post them, and Instagram can mute or remove the post.')}
              </Alert>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!file || !facts || !title.trim() || !confirmed || saving} onClick={save}>{saving ? t('Saving…') : t('Add to my music')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** Mood chips to pick (up to `max`). */
export function MoodChips({ value, onChange, label, max = 5 }: { value: string[]; onChange: (v: string[]) => void; label: string; max?: number }) {
  return (
    <Box role="group" aria-label={label}>
      <Typography variant="body2" sx={{ mb: 0.75 }}>{label}</Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
        {MOOD_IDS.map(m => {
          const on = value.includes(m)
          return <Chip key={m} label={t(MOODS[m].label)} color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'} aria-pressed={on}
            onClick={() => onChange(on ? value.filter(x => x !== m) : value.length >= max ? value : [...value, m])} />
        })}
      </Stack>
    </Box>
  )
}

// ---------------------------------------------------------------------------------------------
// Create with AI (ElevenLabs, pay per use)
// ---------------------------------------------------------------------------------------------
/** "Free (the last free one this month)", "€0.99", "2 uses · €1.98". */
export function priceWords(q: { price_cents: number; uses: number; free: number; free_left: number }) {
  const euros = (c: number) => `€${(c / 100).toFixed(2)}`
  const after = q.free_left - q.free
  if (q.price_cents === 0) return after > 0 ? tn(after, 'Free (1 more free this month)', 'Free ({n} more free this month)') : t('Free (the last free one this month)')
  return q.uses > 1 ? t('{uses} uses · {price}', { uses: q.uses, price: euros(q.price_cents) }) : euros(q.price_cents)
}

/**
 * Create with AI: moods (the brand's to start), instruments, energy and a few words; two versions
 * to choose from. The price is shown before anything is made; a refused prompt costs nothing.
 */
export function CreateWithAiDialog({ seconds: clip, kind, caption, postId, onClose, onKept }: {
  /** How long the music must be (a story's or reel's length); the track is made a little longer. */
  seconds: number
  kind: PostKind
  caption?: string
  postId?: string | null
  onClose: () => void
  onKept: (track: MusicTrack) => void
}) {
  const { api, business } = useApp()
  const run = useAction()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const brand = useAsync('brand', () => api.brand(), [])
  const player = usePlayer()
  const [length, setLength] = useState(Math.min(600, Math.max(5, Math.round(clip))))
  const seconds = aiSeconds(length)
  const quote = useAsync('ai-music-quote', () => api.aiMusicQuote(seconds), [seconds])
  const [moods, setMoods] = useState<string[] | null>(null)
  const [instruments, setInstruments] = useState<string[]>([])
  const [energy, setEnergy] = useState(3)
  const [describe, setDescribe] = useState(caption?.trim().split('\n')[0].slice(0, 160) ?? '')
  const [title, setTitle] = useState(() => t('AI track · {date}', { date: formatLocal(new Date(), 'd MMM', ownTimeZone()) }))
  const [making, setMaking] = useState(false)
  const [error, setError] = useState<{ message: string; suggestion?: string } | null>(null)
  const [made, setMade] = useState<AiTrackResult | null>(null)
  const chosenMoods = moods ?? brand.data?.sound_moods?.filter(isMood).slice(0, 3) ?? []
  const what = business?.business_type?.split(',')[0]?.trim()
  const prompt = aiPrompt({ moods: chosenMoods, instruments, energy, describe, kind, business: what ? `a ${what.toLowerCase()}` : undefined })
  const artist = namesArtist(describe)
  const q = quote.data

  const make = async () => {
    setError(null)
    setMaking(true)
    player.stop()
    try {
      setMade(await api.makeAiTrack({ prompt, seconds, title: title.trim() || t('AI track'), moods: chosenMoods, energy, bpm: energyOf(energy).bpm, post_id: postId ?? null }))
      void quote.reload()
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : String(e), suggestion: e instanceof PromptError ? e.suggestion : undefined })
    } finally { setMaking(false) }
  }
  const keep = (track: MusicTrack) => run(async () => {
    await api.keepAiTrack(made!.generation.id, track.id)
    player.stop()
    onKept(track)
    onClose()
  }, t('Added to your music'))

  return (
    <Dialog open onClose={() => { if (!making) { player.stop(); onClose() } }} fullWidth maxWidth="sm" fullScreen={phone} aria-labelledby="ai-music-title">
      <DialogTitle id="ai-music-title">{t('Create with AI')}</DialogTitle>
      <DialogContent>
        {made ? (
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <Alert severity="success">
              {made.generation.price_cents ? t('Two versions, made for you. {price} added to your monthly bill.', { price: `€${(made.generation.price_cents / 100).toFixed(2)}` })
                : t('Two versions, made for you. This one was free.')}
            </Alert>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Listen to both and keep the one you like. The other stays out of your library.')}</Typography>
            <Box component="ul" aria-label={t('The two versions')} sx={{ m: 0, p: 0 }}>
              {made.tracks.map(tr => (
                <TrackRow key={tr.id} track={tr} player={player} action={<Button variant="contained" size="small" onClick={() => keep(tr)}>{t('Keep this one')}</Button>} />
              ))}
            </Box>
          </Stack>
        ) : (
          <Stack spacing={2.25} sx={{ pt: 0.5 }}>
            <MoodChips value={chosenMoods} onChange={setMoods} label={t('Mood')} max={4} />
            <Box role="group" aria-label={t('Instruments')}>
              <Typography variant="body2" sx={{ mb: 0.75 }}>{t('Instruments')}</Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                {Object.entries(INSTRUMENTS).map(([id, ins]) => {
                  const on = instruments.includes(id)
                  return <Chip key={id} label={t(ins.label)} color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'} aria-pressed={on}
                    onClick={() => setInstruments(on ? instruments.filter(x => x !== id) : instruments.length >= 3 ? instruments : [...instruments, id])} />
                })}
              </Stack>
            </Box>
            <Box>
              <Typography variant="body2" id="ai-energy">{t('Energy: {level}', { level: t(energyOf(energy).label) })}</Typography>
              <Slider value={energy} min={1} max={5} step={1} marks onChange={(_, v) => setEnergy(v as number)} aria-labelledby="ai-energy"
                getAriaValueText={v => t(energyOf(v).label)} sx={{ maxWidth: 360, ml: 1 }} />
            </Box>
            <TextField label={t('Describe it (optional)')} value={describe} onChange={e => setDescribe(e.target.value)} multiline minRows={2}
              placeholder={t('e.g. a sunny morning, coffee being poured')} slotProps={{ htmlInput: { maxLength: 300 } }}
              error={artist} helperText={artist ? t('Describe the feel instead: AI music can’t copy a real artist or song.') : t('In any language. No artists or song names.')} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField label={t('Name')} value={title} onChange={e => setTitle(e.target.value)} sx={{ flex: '1 1 auto' }} slotProps={{ htmlInput: { maxLength: 70 } }} />
              <TextField select label={t('Length')} value={length} onChange={e => setLength(Number(e.target.value))} sx={{ flex: { sm: '0 0 150px' } }}>
                {[...new Set([15, 30, 60, 90, Math.round(clip)])].filter(s => s >= 5 && s <= 600).sort((a, b) => a - b).map(s => (
                  <MenuItem key={s} value={s}>{formatTime(s)}</MenuItem>
                ))}
              </TextField>
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary' }} aria-label={t('What ElevenLabs is asked')}>
              {t('What ElevenLabs is asked: “{prompt}”', { prompt })}
            </Typography>
            {error && (
              <Alert severity="error" action={error.suggestion
                ? <Button size="small" onClick={() => { setDescribe(error.suggestion!); setError(null) }}>{t('Use this instead')}</Button> : undefined}>
                {error.message}{error.suggestion ? ` ${t('ElevenLabs suggests: “{text}”', { text: error.suggestion })}` : ''}
              </Alert>
            )}
            {q?.reason && <Alert severity="warning" action={<Button size="small" component={RouterLink} to="/account/billing">{t('Billing')}</Button>}>{q.reason}</Alert>}
            {making && (
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }} role="status">
                <CircularProgress size={20} />
                <Typography variant="body2">{t('Making two versions… this takes up to a minute.')}</Typography>
              </Stack>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        {!made && q && !q.reason && (
          <Typography variant="body2" sx={{ mr: 'auto', color: 'text.secondary' }} aria-label={t('Price')}>
            {q.price_cents ? t('{price}, added to your monthly bill', { price: priceWords(q) }) : priceWords(q)}
          </Typography>
        )}
        <Button onClick={() => { player.stop(); onClose() }} disabled={making}>{made ? t('Close') : t('Cancel')}</Button>
        {made
          ? <Button onClick={() => { setMade(null); player.stop() }}>{t('Try again')}</Button>
          : <Button variant="contained" startIcon={<SparkleIcon />} disabled={making || !q || !!q.reason || artist || !chosenMoods.length && !describe.trim()} onClick={make}>
              {q ? t('Make 2 versions · {price}', { price: q.price_cents ? `€${(q.price_cents / 100).toFixed(2)}` : t('Free') }) : t('Make 2 versions')}
            </Button>}
      </DialogActions>
    </Dialog>
  )
}

