// Music in the post composer (docs/SOCIAL_MUSIC_PLAN.md), the way Instagram does it: suggested
// tracks pop up once a story or reel has its photo or video; the picker has For you, Browse,
// Saved and In Instagram; then choose the part on the waveform, the volumes and fades, and watch
// it on the post before saving. Saving puts the music into the file (the render service).
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, LinearProgress, MenuItem, Slider, Stack, Switch,
  Tab, Tabs, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import PauseIcon from '@mui/icons-material/PauseRounded'
import MusicIcon from '@mui/icons-material/MusicNoteOutlined'
import SparkleIcon from '@mui/icons-material/AutoAwesomeOutlined'
import BackIcon from '@mui/icons-material/ArrowBackRounded'
import BestIcon from '@mui/icons-material/BoltRounded'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import {
  CreateWithAiDialog, MusicStatusNotes, SearchAndFilter, TrackRow, Waveform, matchesSearch, usePlayer, useTrackFacts, type Player,
} from './MusicLibrary'
import {
  DEFAULT_PHOTO_SECONDS, MOODS, MOOD_IDS, PHOTO_SECONDS, REASON_LABEL, audioName, clampStart, formatTime, isMood, parseTime, photoCuts, suggest,
} from '../../shared/music'
import type { InstagramMusic, MixedMusic, MusicTrack, PostKind, PostMedia, PostMusic } from '../../shared/types'
import { tokens } from '../theme'
import { formatNumber } from '../../shared/time'
import { t, tc } from '../i18n'

/** What the composer knows about the post, for suggestions and the preview. */
export interface PostContext {
  kind: PostKind
  /** The photo, video or photos before the music. */
  media: PostMedia[]
  caption: string
  /** Its hour where the business is, when it's planned (mornings calmer, evenings livelier). */
  hour: number | null
  /** A video's own length (null for photos, or not known yet). */
  videoSeconds: number | null
  /** Tracks on the business's last few posts. */
  recent: string[]
  /** Likes and comments per post each track had (suggestions that learn). */
  engagement: Record<string, number>
}

/** How long the music plays: a video's own length; photos as chosen (stories up to 60 s). */
export const clipSeconds = (c: Pick<PostContext, 'kind' | 'videoSeconds'>, chosen?: number | null) =>
  c.videoSeconds ?? Math.min(chosen ?? DEFAULT_PHOTO_SECONDS, c.kind === 'story' ? 60 : 180)

/** Music for a track, as first chosen: its best part, full volume for photos, a mix for videos. */
export function startMusic(track: MusicTrack, c: PostContext, business: string): MixedMusic {
  const seconds = clipSeconds(c)
  const video = c.media.length === 1 && c.media[0].type === 'video'
  return {
    mode: 'mixed', track_id: track.id, title: track.title, artist: track.artist, url: track.url,
    start: clampStart(track.highlight_s, track.duration_s, seconds), seconds,
    music_volume: video ? 80 : 100, original_volume: video ? 60 : 0, fade_in: true, fade_out: true,
    audio_name: c.kind === 'reel' ? audioName(business, track.title) : null, label: false,
    source_media: c.media, rendered_url: null, rendered_for: null, bpm: track.bpm,
  }
}

/** Photos that can become a reel with music (a post's photo, or a carousel of photos). */
const allPhotos = (media: PostMedia[]) => media.length > 0 && media.every(m => m.type === 'image')

// ---------------------------------------------------------------------------------------------
// The strip under the photo or video: "♫ Add music?" with three suggestions
// ---------------------------------------------------------------------------------------------
export function MusicStrip({ context, music, onChange, onRemind, onMakeReel, canRender }: {
  context: PostContext
  music: PostMusic | null
  onChange: (m: PostMusic | null) => void
  /** Choosing a song to add in Instagram: the post becomes a reminder. */
  onRemind: () => void
  /** A post's or carousel's photos become a reel, so the music can go in. */
  onMakeReel: () => void
  /** The render service is on (music can go into files). */
  canRender: boolean
}) {
  const { api, business } = useApp()
  const tracks = useAsync('music-tracks', () => api.musicTracks(), [])
  const brand = useAsync('brand', () => api.brand(), [])
  const player = usePlayer()
  const [picker, setPicker] = useState<null | { tab: PickerTab; track?: MusicTrack }>(null)
  const [making, setMaking] = useState(false)
  useTrackFacts(tracks.data)
  const mixable = context.kind === 'story' || context.kind === 'reel'
  const top = useMemo(() => (tracks.data ? suggest(tracks.data, {
    kind: context.kind, seconds: clipSeconds(context), caption: context.caption, hour: context.hour,
    sound: { moods: brand.data?.sound_moods ?? [], avoid: brand.data?.sound_avoid ?? [] }, recent: context.recent, engagement: context.engagement,
  }).slice(0, 3) : []), [tracks.data, brand.data, context])
  useEffect(() => () => player.stop(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const open = (tab: PickerTab, track?: MusicTrack) => { player.stop(); setPicker({ tab, track }) }
  const picked = (m: PostMusic | null) => {
    setPicker(null)
    if (m?.mode === 'in_instagram') onRemind()
    onChange(m)
  }

  let body
  if (music?.mode === 'mixed') {
    body = (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
        <MusicIcon sx={{ color: tokens.roseDeep }} />
        <Typography sx={{ fontWeight: 500 }}>{music.title}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{formatTime(music.start)}–{formatTime(music.start + music.seconds)}</Typography>
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={() => open('foryou', tracks.data?.find(x => x.id === music.track_id))}>{t('Change')}</Button>
        <Button size="small" color="inherit" onClick={() => onChange(null)}>{t('Remove')}</Button>
      </Stack>
    )
  } else if (music?.mode === 'in_instagram') {
    body = (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
        <MusicIcon sx={{ color: tokens.roseDeep }} />
        <Typography>{t('Add in Instagram: {song}', { song: music.song })}</Typography>
        {music.start > 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('from {time}', { time: formatTime(music.start) })}</Typography>}
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={() => open('instagram')}>{t('Change')}</Button>
        <Button size="small" color="inherit" onClick={() => onChange(null)}>{t('Remove')}</Button>
      </Stack>
    )
  } else if (!mixable) {
    const reel = canRender && allPhotos(context.media)
    body = (
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
          {reel ? t('Instagram adds music to photos only in its app. Or make them a reel with music, changing on the beat.') : t('Instagram adds music to photos only in its app.')}
        </Typography>
        {reel && <Button size="small" variant="outlined" startIcon={<MusicIcon />} onClick={() => { onMakeReel(); open('foryou') }}>{t('Make it a reel')}</Button>}
        <Button size="small" startIcon={reel ? undefined : <MusicIcon />} onClick={() => open('instagram')}>{t('Add it in Instagram')}</Button>
      </Stack>
    )
  } else if (!context.media.length) {
    body = <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Add the photo or video, then choose its music.')}</Typography>
  } else if (!canRender) {
    body = (
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>{t('Music goes into the file once the render service is on. Until then, add it in Instagram.')}</Typography>
        <Button size="small" startIcon={<MusicIcon />} onClick={() => open('instagram')}>{t('Add it in Instagram')}</Button>
      </Stack>
    )
  } else {
    body = (
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <MusicIcon sx={{ color: tokens.roseDeep }} />
          <Typography sx={{ fontWeight: 500 }}>{t('Add music?')}</Typography>
        </Stack>
        {!tracks.data && <LinearProgress />}
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }} component="ul" aria-label={t('Suggested music')} style={{ margin: 0, padding: 0 }}>
          {top.map(s => {
            const key = `strip-${s.track.id}`
            const on = player.playing === key
            return (
              <Stack component="li" key={s.track.id} direction="row" aria-label={s.track.title}
                sx={{ listStyle: 'none', alignItems: 'center', border: `1px solid ${tokens.line}`, borderRadius: 999, pr: 0.5, bgcolor: 'background.paper', maxWidth: '100%' }}>
                <IconButton size="small" aria-label={on ? t('Pause {title}', { title: s.track.title }) : t('Play {title}', { title: s.track.title })}
                  onClick={() => player.play(key, s.track.url, s.track.highlight_s, s.track.highlight_s + 15)} sx={{ color: tokens.roseDeep }}>
                  {on ? <PauseIcon fontSize="small" /> : <PlayIcon fontSize="small" />}
                </IconButton>
                <Button size="small" onClick={() => open('foryou', s.track)} sx={{ textTransform: 'none', minWidth: 0, px: 0.75, color: 'text.primary', justifyContent: 'flex-start' }}
                  aria-label={t('Use {title}', { title: s.track.title })}>
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.track.title}
                    <Box component="span" sx={{ color: 'text.secondary', ml: 0.75, fontSize: '0.8em' }}>
                      {s.occasion ? t(s.occasion) : s.reasons[0] ? tc('music', REASON_LABEL[s.reasons[0]]) : s.track.moods.filter(isMood).slice(0, 1).map(m => t(MOODS[m].label)).join('')}
                    </Box>
                  </Box>
                </Button>
              </Stack>
            )
          })}
        </Stack>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Button size="small" variant="outlined" onClick={() => open('foryou')}>{t('More music…')}</Button>
          <Button size="small" startIcon={<SparkleIcon />} onClick={() => { player.stop(); setMaking(true) }}>{t('Make one with AI')}</Button>
          <Button size="small" onClick={() => open('instagram')}>{t('Add it in Instagram')}</Button>
        </Stack>
      </Stack>
    )
  }

  return (
    <Box role="group" aria-label={t('Music')} sx={{ p: 1.5, borderRadius: 2, border: `1px dashed ${tokens.lineStrong}`, bgcolor: tokens.surfaceAlt }}>
      {body}
      {picker && (
        <MusicPickerDialog context={context} initial={picker} current={music} business={business?.name ?? ''} canRender={canRender && mixable}
          onClose={() => setPicker(null)} onPick={picked} />
      )}
      {making && (
        <CreateWithAiDialog seconds={clipSeconds(context)} kind={context.kind} caption={context.caption} onClose={() => setMaking(false)}
          onKept={track => { void tracks.reload(); setMaking(false); setPicker({ tab: 'foryou', track }) }} />
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------------------------
// The picker
// ---------------------------------------------------------------------------------------------
type PickerTab = 'foryou' | 'browse' | 'saved' | 'instagram'

function MusicPickerDialog({ context, initial, current, business, canRender, onClose, onPick }: {
  context: PostContext
  initial: { tab: PickerTab; track?: MusicTrack }
  current: PostMusic | null
  business: string
  /** Stories and reels with the render service on: tracks go into the file. */
  canRender: boolean
  onClose: () => void
  onPick: (m: PostMusic | null) => void
}) {
  const { api } = useApp()
  const phone = useMediaQuery(useTheme().breakpoints.down('sm'))
  const tracks = useAsync('music-tracks', () => api.musicTracks(), [])
  const status = useAsync('music-status', () => api.musicStatus(), [])
  const brand = useAsync('brand', () => api.brand(), [])
  const player = usePlayer()
  const [tab, setTab] = useState<PickerTab>(canRender ? initial.tab : 'instagram')
  const [search, setSearch] = useState('')
  const [mood, setMood] = useState<string | null>(null)
  const [making, setMaking] = useState(false)
  // The part step, straight away for a track chosen on the strip (the post's own music keeps its part).
  const [mix, setMix] = useState<MixedMusic | null>(() => (!initial.track ? null
    : current?.mode === 'mixed' && current.track_id === initial.track.id ? current : startMusic(initial.track, context, business)))
  const close = () => { player.stop(); onClose() }
  const all = tracks.data ?? []
  const ranked = useMemo(() => suggest(all, {
    kind: context.kind, seconds: clipSeconds(context), caption: context.caption, hour: context.hour,
    sound: { moods: brand.data?.sound_moods ?? [], avoid: brand.data?.sound_avoid ?? [] }, recent: context.recent, engagement: context.engagement,
  }), [all, brand.data, context])
  const list = (tab === 'foryou' ? ranked.map(s => s.track) : all)
    .filter(tr => (tab !== 'saved' || tr.saved) && (tab !== 'browse' || !mood || tr.moods.includes(mood)) && matchesSearch(tr, search))
  const choose = (tr: MusicTrack) => { player.stop(); setMix(startMusic(tr, context, business)) }

  const title = mix ? t('Choose the part') : t('Music')
  return (
    <Dialog open onClose={close} fullWidth maxWidth="md" fullScreen={phone} aria-labelledby="music-picker-title">
      <DialogTitle id="music-picker-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {mix && <IconButton aria-label={t('Back to the tracks')} onClick={() => { player.stop(); setMix(null) }} edge="start"><BackIcon /></IconButton>}
        {title}
      </DialogTitle>
      <DialogContent>
        {mix ? (
          <PartStep mix={mix} context={context} track={all.find(x => x.id === mix.track_id) ?? null} player={player} onChange={setMix} />
        ) : (
          <Stack spacing={1.5}>
            <Tabs value={tab} onChange={(_, v: PickerTab) => setTab(v)} variant="scrollable" allowScrollButtonsMobile aria-label={t('Where the music comes from')}
              sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40, textTransform: 'none' } }}>
              <Tab value="foryou" label={t('For you')} disabled={!canRender} />
              <Tab value="browse" label={t('Browse')} disabled={!canRender} />
              <Tab value="saved" label={t('Saved')} disabled={!canRender} />
              <Tab value="instagram" label={t('In Instagram')} />
            </Tabs>
            {tab === 'instagram' ? (
              <InstagramStep current={current?.mode === 'in_instagram' ? current : null} kind={context.kind} onPick={onPick} />
            ) : (
              <>
                <MusicStatusNotes status={status.data} />
                <SearchAndFilter search={search} onSearch={setSearch} />
                {tab === 'browse' && (
                  <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }} role="group" aria-label={t('Moods')}>
                    {MOOD_IDS.map(m => <Chip key={m} label={t(MOODS[m].label)} color={mood === m ? 'primary' : 'default'} variant={mood === m ? 'filled' : 'outlined'}
                      aria-pressed={mood === m} onClick={() => setMood(mood === m ? null : m)} />)}
                  </Stack>
                )}
                <Box>
                  <Button startIcon={<SparkleIcon />} onClick={() => { player.stop(); setMaking(true) }} disabled={!status.data?.ai}>{t('Make one with AI')}</Button>
                </Box>
                {!tracks.data ? <LinearProgress /> : list.length ? (
                  <Box component="ul" aria-label={t('Tracks')} sx={{ m: 0, p: 0 }}>
                    {list.map(tr => (
                      <TrackRow key={tr.id} track={tr} player={player}
                        action={<Button variant="contained" size="small" onClick={() => choose(tr)} aria-label={t('Use {title}', { title: tr.title })}>{t('Use')}</Button>} />
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" sx={{ color: 'text.secondary', py: 3, textAlign: 'center' }}>
                    {tab === 'saved' ? t('Nothing saved yet: star tracks in Music to find them here.') : t('No tracks match.')}
                  </Typography>
                )}
              </>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close}>{t('Cancel')}</Button>
        {mix && <Button variant="contained" onClick={() => { player.stop(); onPick(mix) }}>{t('Done')}</Button>}
      </DialogActions>
      {making && (
        <CreateWithAiDialog seconds={clipSeconds(context)} kind={context.kind} caption={context.caption} onClose={() => setMaking(false)}
          onKept={tr => { void tracks.reload(); setMaking(false); choose(tr) }} />
      )}
    </Dialog>
  )
}

// ---------------------------------------------------------------------------------------------
// Choosing the part, the mix, and watching it on the post
// ---------------------------------------------------------------------------------------------
function PartStep({ mix, context, track, player, onChange }: {
  mix: MixedMusic; context: PostContext; track: MusicTrack | null; player: Player; onChange: (m: MixedMusic) => void
}) {
  const duration = track?.duration_s ?? Math.max(mix.start + mix.seconds, mix.seconds)
  const video = context.media.length === 1 && context.media[0].type === 'video'
  const photo = context.media.length >= 1 && context.media.every(m => m.type === 'image')
  const set = (patch: Partial<MixedMusic>) => onChange({ ...mix, ...patch })
  const setLength = (s: number) => set({ seconds: s, start: clampStart(mix.start, duration, s) })
  const lengths = context.kind === 'story' ? PHOTO_SECONDS : [5, 10, 15, 30, 60, 90]
  const cuts = photo ? photoCuts(mix, context.media.length) : undefined
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ pt: 0.5 }}>
      <PostPreview context={context} mix={mix} player={player} />
      <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
        <Box>
          <Typography sx={{ fontWeight: 600 }}>{mix.title}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('From {from} to {to} ({length})', { from: formatTime(mix.start), to: formatTime(mix.start + mix.seconds), length: t('{n} s', { n: Math.round(mix.seconds) }) })}
          </Typography>
        </Box>
        <Waveform peaks={track?.waveform ?? null} duration={duration} part={{ start: mix.start, seconds: Math.min(mix.seconds, duration) }}
          onMove={start => set({ start })} label={t('The part of the track: drag it, or use the arrow keys')} height={72} />
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, alignItems: 'center' }}>
          {track && (
            <Button size="small" startIcon={<BestIcon />} onClick={() => set({ start: clampStart(track.highlight_s, duration, mix.seconds) })}>{t('Best part')}</Button>
          )}
          {photo && (
            <TextField select size="small" label={t('Length')} value={lengths.includes(Math.round(mix.seconds) as never) ? Math.round(mix.seconds) : ''}
              onChange={e => setLength(Number(e.target.value))} sx={{ minWidth: 120 }}>
              {lengths.map(s => <MenuItem key={s} value={s}>{t('{n} seconds', { n: s })}</MenuItem>)}
            </TextField>
          )}
          {video && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('As long as the video: {length}', { length: formatTime(mix.seconds) })}</Typography>}
        </Stack>
        {cuts && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {mix.bpm ? t('{n} photos, changing on the beat: about {each} s each', { n: cuts.length, each: formatNumber(Math.round((cuts[1] - cuts[0]) * 10) / 10) })
              : t('{n} photos, about {each} s each', { n: cuts.length, each: formatNumber(Math.round((cuts[1] - cuts[0]) * 10) / 10) })}
          </Typography>
        )}
        <Box>
          <Typography variant="body2" id="music-volume">{t('Music volume: {n}%', { n: mix.music_volume })}</Typography>
          <Slider value={mix.music_volume} min={0} max={100} step={5} onChange={(_, v) => set({ music_volume: v as number })} aria-labelledby="music-volume" sx={{ maxWidth: 360 }} />
          {video && (
            <>
              <Typography variant="body2" id="original-volume">{t('The video’s own sound: {n}%', { n: mix.original_volume })}</Typography>
              <Slider value={mix.original_volume} min={0} max={100} step={5} onChange={(_, v) => set({ original_volume: v as number })} aria-labelledby="original-volume" sx={{ maxWidth: 360 }} />
            </>
          )}
        </Box>
        <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 2 }}>
          <FormControlLabel control={<Switch checked={mix.fade_in} onChange={e => set({ fade_in: e.target.checked })} />} label={t('Fade in')} />
          <FormControlLabel control={<Switch checked={mix.fade_out} onChange={e => set({ fade_out: e.target.checked })} />} label={t('Fade out')} />
          {photo && context.kind === 'story' && context.media.length === 1 && (
            <FormControlLabel control={<Switch checked={!!mix.label} onChange={e => set({ label: e.target.checked })} />} label={t('Show the song on the photo')} />
          )}
        </Stack>
        {context.kind === 'reel' && (
          <TextField size="small" label={t('Sound name on Instagram')} value={mix.audio_name ?? ''} onChange={e => set({ audio_name: e.target.value.slice(0, 100) })}
            helperText={t('Others who use your sound see this name. Instagram lets you set it once.')} />
        )}
      </Stack>
    </Stack>
  )
}

/**
 * The post as it will look and sound: 9:16, the photo (a slow zoom) or the video, with the chosen
 * part of the track playing in step and at the chosen volumes. Nothing is made until it's saved.
 */
function PostPreview({ context, mix, player }: { context: PostContext; mix: MixedMusic; player: Player }) {
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  // A reel of photos: each shows from its cut, in time with the music.
  const [shown, setShown] = useState(0)
  const cuts = allPhotos(context.media) ? photoCuts(mix, context.media.length) : undefined
  const src = context.media[cuts ? shown : 0] ?? context.media[0]
  const key = 'preview'
  const on = playing && player.playing === key
  useEffect(() => {
    if (!on || !cuts) { setShown(0); return }
    const tick = setInterval(() => {
      const at = player.time() - mix.start
      setShown(Math.max(0, cuts.findLastIndex(c => c <= at)))
    }, 100)
    return () => clearInterval(tick)
  }, [on, cuts?.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => {
    if (on) { player.stop(); video.current?.pause(); setPlaying(false); return }
    player.play(key, mix.url, mix.start, mix.start + mix.seconds)
    player.setVolume(mix.music_volume / 100)
    const v = video.current
    if (v) { v.currentTime = 0; v.volume = mix.original_volume / 100; void v.play().catch(() => {}) }
    setPlaying(true)
  }
  // The volumes follow the sliders while it plays; a new part starts it again from the top.
  useEffect(() => {
    if (!on) return
    player.setVolume(mix.music_volume / 100)
    if (video.current) video.current.volume = mix.original_volume / 100
  }, [on, mix.music_volume, mix.original_volume]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (on) { player.stop(); video.current?.pause(); setPlaying(false) } }, [mix.start, mix.seconds]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { video.current?.pause() }, [])
  return (
    <Box sx={{ flexShrink: 0, alignSelf: { xs: 'center', md: 'flex-start' } }}>
      <Box aria-label={t('Preview')} sx={{ position: 'relative', width: 200, height: 356, borderRadius: 3, overflow: 'hidden', bgcolor: tokens.ink }}>
        {src?.type === 'video' ? (
          <Box component="video" ref={video} src={src.url} playsInline loop muted={mix.original_volume === 0}
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : src ? (
          <>
            <Box component="img" src={src.url} alt="" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(14px) brightness(0.85)', transform: 'scale(1.15)' }} />
            <Box component="img" src={src.url} alt="" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
              animation: on ? 'music-zoom 12s ease-in-out infinite alternate' : 'none', '@keyframes music-zoom': { from: { transform: 'scale(1)' }, to: { transform: 'scale(1.06)' } } }} />
          </>
        ) : null}
        {mix.label && src?.type === 'image' && (
          <Box sx={{ position: 'absolute', left: '50%', bottom: 44, transform: 'translateX(-50%)', px: 1, py: 0.25, borderRadius: 1, bgcolor: 'rgba(0,0,0,.45)',
            color: '#fff', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            ♫ {[mix.title, mix.artist].filter(Boolean).join(' · ')}
          </Box>
        )}
        <IconButton aria-label={on ? t('Pause the preview') : t('Play the preview')} onClick={toggle}
          sx={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', bgcolor: 'rgba(0,0,0,.45)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,.6)' } }}>
          {on ? <PauseIcon fontSize="large" /> : <PlayIcon fontSize="large" />}
        </IconButton>
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', textAlign: 'center', mt: 0.75 }}>{t('How it will look and sound')}</Typography>
    </Box>
  )
}

// ---------------------------------------------------------------------------------------------
// A song from Instagram's own library, added by whoever posts it (reminders)
// ---------------------------------------------------------------------------------------------
function InstagramStep({ current, kind, onPick }: { current: InstagramMusic | null; kind: PostKind; onPick: (m: PostMusic) => void }) {
  const [song, setSong] = useState(current?.song ?? '')
  const [start, setStart] = useState(current?.start ? formatTime(current.start) : '')
  const seconds = parseTime(start)
  return (
    <Stack spacing={2} sx={{ pt: 1 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('Instagram’s own songs can only be added in the Instagram app. Write which one and where it starts: the reminder shows it, with a button to copy the name.')}
      </Typography>
      <Alert severity="info" variant="outlined">
        {t('Business accounts only see the songs Instagram has cleared for businesses, so a popular song may not be there. Your own tracks always work: choose them under For you.')}
      </Alert>
      <TextField label={t('Song and artist')} value={song} onChange={e => setSong(e.target.value)} slotProps={{ htmlInput: { maxLength: 120 } }} autoFocus />
      <TextField label={t('Starts at (optional)')} value={start} onChange={e => setStart(e.target.value)} placeholder="0:45" sx={{ maxWidth: 200 }}
        error={seconds === null} helperText={seconds === null ? t('Write it like 0:45') : ' '} />
      <Box>
        <Button variant="contained" disabled={!song.trim() || seconds === null} onClick={() => onPick({ mode: 'in_instagram', song: song.trim(), start: seconds ?? 0 })}>
          {kind === 'story' || kind === 'reel' ? t('Use it (I’ll post it myself)') : t('Use it')}
        </Button>
      </Box>
    </Stack>
  )
}

/** "Sunday Morning", or "Bailando (in Instagram)": a post's music in the lists. */
export const musicLabel = (m: PostMusic) => (m.mode === 'mixed' ? m.title : t('{song} (in Instagram)', { song: m.song }))
