// The landing page's videos (made in video/, see its README): the demo (a café changes its hours and a
// price in one place, and everywhere follows) and a day in the life of a café owner, before and with
// Business Agent. Each fills the screen as its own section, plays muted while it's on screen (not for
// people who've asked for less motion), with controls to watch it with its music. "View a demo" in
// the hero brings the demo up and plays it from the start, with its music.
//
// Sound: each starts with its music on when it comes on screen. Browsers only allow that once the
// visitor has clicked, tapped or pressed a key on the page (scrolling doesn't count), so until then it
// plays muted with a "Tap for sound" button, and the first click or tap anywhere turns the sound on.
// One that the visitor muted stays muted; one scrolled away from pauses, so only one ever plays.
//
// Each has its own bar along the bottom, always there: play or pause, the time, a slider to go to any
// moment in it, the sound on or off, and full screen.
//
// Neither loads until it plays (only its poster is fetched; its length shows from DEMO_VIDEO and
// DAY_VIDEO until then): loading both up front cost every visitor about 17 MB, and the browser holding
// those half-read downloads stalled the app's own requests on the same connection after signing in.
// The Worker serves them a part at a time (worker/video.ts), so the slider can go to a moment not
// downloaded yet.
//
// They come one after the other, straight after the hero, and the page's sections take turns between
// its own colour and a white band: the demo is a white band and the day in the life is on the page's
// colour (a white band itself when the demo is switched off, so it's still apart from the hero).
import { Box, Button, Container, IconButton, Slider, Stack, Typography } from '@mui/material'
import SoundIcon from '@mui/icons-material/VolumeUpRounded'
import MutedIcon from '@mui/icons-material/VolumeOffRounded'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import PauseIcon from '@mui/icons-material/PauseRounded'
import FullscreenIcon from '@mui/icons-material/FullscreenRounded'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FEATURES } from '../../app/features'
import { BA, HEADER_HEIGHT, SectionIntro, fullScreen } from './site'
import { lessMotion } from './watchDemo'
import { t, tr } from '../../i18n'


export const DEMO_VIDEO = { src: '/video/business-agent-demo.mp4', poster: '/video/business-agent-demo.jpg', seconds: 108 }
export const DAY_VIDEO = { src: '/video/day-in-the-life.mp4', poster: '/video/day-in-the-life.jpg', seconds: 112 }

/** A moment in a video as a player shows it: 0:07, 1:48. */
export const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export { watchDemo } from './watchDemo'

/** A video section that fills the screen: a compact intro, then the video, playing with its sound while it's on screen. */
function VideoSection({ id, labelledBy, eyebrow, title, text, src, poster, label, seconds, sx }: {
  id: string; labelledBy: string; eyebrow: string; title: ReactNode; text: string; src: string; poster: string; label: string; seconds: number; sx?: object
}) {
  const video = useRef<HTMLVideoElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  // Where it's got to and how long it is (its known length until the file says), playing or not, muted or not.
  const [at, setAt] = useState(0)
  const [length, setLength] = useState(seconds)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  // While the slider is being dragged: where it's been dragged to (the video follows when it's let go of too).
  const [dragging, setDragging] = useState<number | null>(null)
  // Playing muted because the browser wouldn't allow sound yet: the "Tap for sound" button shows.
  const [quiet, setQuiet] = useState(false)
  // Muted or not as the page last set it: a change it didn't make is the visitor's (the video's own button).
  const set = useRef<boolean>(true)
  const mutedByThem = useRef(false)
  const mute = (v: HTMLVideoElement, m: boolean) => { set.current = m; v.muted = m }
  /** Play with its sound on; if the browser won't allow sound yet (no click or tap on the page so far), muted. */
  const play = (v: HTMLVideoElement) => {
    if (mutedByThem.current) { mute(v, true); void v.play().catch(() => {}); return }
    mute(v, false)
    void v.play().then(() => setQuiet(false), () => {
      mute(v, true)
      void v.play().then(() => setQuiet(true), () => { /* the browser wants a tap first: the controls are there */ })
    })
  }
  useEffect(() => {
    const v = video.current
    if (!v || typeof IntersectionObserver === 'undefined') return
    const still = lessMotion()
    let onScreen = false
    const onVolume = () => {
      setMuted(v.muted)
      if (v.muted === set.current) return
      set.current = v.muted
      mutedByThem.current = v.muted
      if (!v.muted) setQuiet(false)
    }
    const onTime = () => setAt(v.currentTime)
    const onLength = () => { if (Number.isFinite(v.duration) && v.duration > 0) setLength(v.duration) }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const events = { volumechange: onVolume, timeupdate: onTime, seeked: onTime, loadedmetadata: onLength, durationchange: onLength, play: onPlay, pause: onPause }
    // The first click, tap or key anywhere on the page lets the sound on: the video on screen gets it
    // (on a phone, once the finger lifts). Not the video or its bar: what's pressed there is the visitor's say.
    const allowed = (e: Event) => {
      if (frame.current?.contains(e.target as Node) || !onScreen || still || !v.muted || v.paused || mutedByThem.current) return
      play(v)
    }
    const seen = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting
      if (!e.isIntersecting) { v.pause(); setQuiet(false) } else if (!still) play(v)
    }, { threshold: 0.4 })
    seen.observe(v)
    for (const [ev, fn] of Object.entries(events)) v.addEventListener(ev, fn)
    for (const ev of ['pointerup', 'keydown'] as const) document.addEventListener(ev, allowed, true)
    return () => {
      seen.disconnect()
      for (const [ev, fn] of Object.entries(events)) v.removeEventListener(ev, fn)
      for (const ev of ['pointerup', 'keydown'] as const) document.removeEventListener(ev, allowed, true)
    }
  }, [])
  const soundOn = () => {
    const v = video.current
    if (!v) return
    mutedByThem.current = false
    play(v)
  }
  const playPause = () => {
    const v = video.current
    if (!v) return
    if (v.paused) play(v)
    else v.pause()
  }
  /** The visitor's own sound button: what they choose stays. */
  const toggleSound = () => {
    const v = video.current
    if (!v) return
    if (v.muted) soundOn()
    else { mutedByThem.current = true; mute(v, true); setQuiet(false) }
  }
  const goTo = (to: number) => {
    const v = video.current
    if (!v) return
    v.currentTime = Math.min(Math.max(0, to), length)
    setAt(v.currentTime)
  }
  const fullScreen_ = () => {
    const box = frame.current
    if (document.fullscreenElement) void document.exitFullscreen?.()
    else if (box?.requestFullscreen) void box.requestFullscreen()
    // An iPhone shows a video full screen only by itself.
    else (video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null)?.webkitEnterFullscreen?.()
  }
  const shown = dragging ?? at
  const bar = { color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.14)' } }
  return (
    <Box component="section" id={id} aria-labelledby={labelledBy} sx={{ ...fullScreen, pt: { xs: 0, md: 4 }, pb: { xs: 8, md: 4 }, ...sx }}>
      <Container maxWidth="lg">
        <SectionIntro eyebrow={eyebrow} compact title={<span id={labelledBy}>{title}</span>} text={text} />
        {/* On a computer the whole video fits on the screen under its title, so none of it is cut off. */}
        <Box ref={frame} sx={{ borderRadius: { xs: '16px', md: '24px' }, overflow: 'hidden', border: `1px solid ${BA.line}`, bgcolor: BA.tint,
          boxShadow: '0 50px 100px -50px rgba(43,37,34,0.38)', aspectRatio: '16 / 9', mx: 'auto',
          maxWidth: { md: `calc((100svh - ${HEADER_HEIGHT}px - 320px) * 16 / 9)` }, position: 'relative',
          '&:fullscreen': { maxWidth: 'none', borderRadius: 0, border: 0, bgcolor: '#000' } }}>
          <Box component="video" ref={video} src={src} poster={poster} muted loop playsInline preload="none"
            onClick={() => (quiet ? soundOn() : playPause())}
            aria-label={label} sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', '*:fullscreen > &': { objectFit: 'contain' } }} />
          {/* Its own bar along the bottom, always there: play or pause, the time, a slider to any moment, the sound and full screen. */}
          <Stack direction="row" role="group" aria-label={t('Video controls')}
            sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: { xs: 0.5, sm: 1 }, px: { xs: 1, sm: 1.5 }, py: { xs: 0.25, sm: 0.75 },
              background: 'linear-gradient(to top, rgba(20,16,14,0.78), rgba(20,16,14,0))', color: '#fff' }}>
            <IconButton size="small" onClick={playPause} aria-label={playing ? t('Pause') : t('Play')} sx={bar}>
              {playing ? <PauseIcon /> : <PlayIcon />}
            </IconButton>
            <Typography component="span" sx={{ fontSize: { xs: '0.75rem', sm: '0.85rem' }, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', opacity: 0.92 }}>
              {clock(shown)}<Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{` / ${clock(length)}`}</Box>
            </Typography>
            <Slider size="small" min={0} max={Math.max(1, length)} step={0.1} value={Math.min(shown, length)}
              onChange={(_, v) => { const to = v as number; setDragging(to); goTo(to) }}
              onChangeCommitted={(_, v) => { goTo(v as number); setDragging(null) }}
              aria-label={t('Position in the video')} getAriaValueText={v => t('{at} of {length}', { at: clock(v), length: clock(length) })}
              sx={{ flex: 1, mx: { xs: 1, sm: 1.5 }, color: BA.rose, height: 4, py: { xs: 1.5, sm: 1.25 },
                '& .MuiSlider-rail': { bgcolor: 'rgba(255,255,255,0.4)', opacity: 1 },
                '& .MuiSlider-thumb': { width: 14, height: 14, bgcolor: '#fff', '&:hover, &.Mui-focusVisible': { boxShadow: '0 0 0 6px rgba(247,197,202,0.35)' } } }} />
            <IconButton size="small" onClick={toggleSound} aria-label={muted ? t('Sound on') : t('Sound off')} aria-pressed={!muted} sx={bar}>
              {muted ? <MutedIcon /> : <SoundIcon />}
            </IconButton>
            <IconButton size="small" onClick={fullScreen_} aria-label={t('Full screen')} sx={bar}>
              <FullscreenIcon />
            </IconButton>
          </Stack>
          {quiet && (
            <Button onClick={soundOn} startIcon={<SoundIcon />} variant="contained"
              sx={{ position: 'absolute', top: { xs: 10, md: 16 }, right: { xs: 10, md: 16 }, borderRadius: 99, px: 2, py: 0.75, textTransform: 'none', fontWeight: 600,
                bgcolor: 'rgba(43,37,34,0.82)', color: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', '&:hover': { bgcolor: 'rgba(43,37,34,0.95)' } }}>
              {t('Tap for sound')}
            </Button>
          )}
        </Box>
      </Container>
    </Box>
  )
}

/** A section on a white band with hairlines above and below, like Features and Pricing. */
const whiteBand = { bgcolor: '#fff', borderTop: `1px solid ${BA.line}`, borderBottom: `1px solid ${BA.line}`, pt: { xs: 8, md: 4 } }

export function DemoVideo() {
  if (!FEATURES.demoVideo) return null
  return (
    <VideoSection id="demo" labelledBy="demo-video" eyebrow={t('See it in action')} src={DEMO_VIDEO.src} poster={DEMO_VIDEO.poster}
      label={t('Business Agent demo video')} seconds={DEMO_VIDEO.seconds} sx={whiteBand}
      title={tr('Change it in one place. It’s changed {em}', { em: <em>{t('everywhere.')}</em> })}
      text={t('A café sets up, closes on Sundays, adds Christmas and puts a price up, each in one place: Google Maps, its website, its till, its TV and its team follow.')} />
  )
}

export function DayVideo() {
  if (!FEATURES.dayVideo) return null
  return (
    <VideoSection id="day" labelledBy="day-video" eyebrow={t('A day in the life')} src={DAY_VIDEO.src} poster={DAY_VIDEO.poster}
      label={t('A day in the life of a café owner, video')} seconds={DAY_VIDEO.seconds} sx={FEATURES.demoVideo ? { pt: { xs: 8, md: 4 } } : whiteBand}
      title={tr('The same day, {em}', { em: <em>{t('without the chaos.')}</em> })}
      text={t('From opening to closing: the checklists, the messages, the orders, the offers, the bills and the licences, before and with Business Agent.')} />
  )
}
