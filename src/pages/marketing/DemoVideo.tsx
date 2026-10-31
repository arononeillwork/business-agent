// The landing page's videos (made in video/, see its README): the demo (a café changes its hours and a
// price in one place, and everywhere follows) and a day in the life of a café owner, before and with
// Business Agent. Each fills the screen as its own section and plays with its music while it's on
// screen (not by itself for people who've asked for less motion). "View a demo" in the hero, and Demo
// in the site menu, bring the demo up and play it from the start, with its music.
//
// Sound: each starts with its music on when it comes on screen. Browsers only allow that once the
// visitor has clicked, tapped or pressed a key on the page (scrolling doesn't count, and no site can
// get round it), so until then it doesn't play silently: it waits on its poster with a big "Play with
// sound" button, and one tap starts it with its music. One that the visitor muted stays muted; one
// scrolled away from pauses, so only one ever plays.
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
// The Demos page (/demos) has these two and every other video (DEMOS, at the end of this file): a new
// one goes there only. Under the landing page's last video, a link to it.
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
import ArrowIcon from '@mui/icons-material/ArrowForwardRounded'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FEATURES } from '../../app/features'
import { BA, HEADER_HEIGHT, SectionIntro, fullScreen } from './site'
import { lessMotion } from './watchDemo'
import { msg, t, tr } from '../../i18n'


export const DEMO_VIDEO = { src: '/video/business-agent-demo.mp4', poster: '/video/business-agent-demo.jpg', seconds: 108 }
export const DAY_VIDEO = { src: '/video/day-in-the-life.mp4', poster: '/video/day-in-the-life.jpg', seconds: 112 }

/** A moment in a video as a player shows it: 0:07, 1:48. */
export const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export { watchDemo } from './watchDemo'

/** A video section that fills the screen: a compact intro, then the video, playing with its sound while it's on screen. */
function VideoSection({ id, labelledBy, eyebrow, title, text, src, poster, label, seconds, sx, more }: {
  id: string; labelledBy: string; eyebrow: string; title: ReactNode; text: string; src: string; poster: string; label: string; seconds: number; sx?: object
  /** Under the video: the link to the Demos page, under the landing page's last one. */
  more?: ReactNode
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
  // Not started yet (the browser wouldn't let it start with its sound, or the visitor asked for less
  // motion): it waits on its poster with the big "Play with sound" button.
  const [started, setStarted] = useState(false)
  // Muted or not as the page last set it: a change it didn't make is the visitor's (the video's own button).
  const set = useRef<boolean>(true)
  const mutedByThem = useRef(false)
  const mute = (v: HTMLVideoElement, m: boolean) => { set.current = m; v.muted = m }
  /** Play with its sound on (muted only if the visitor muted it). If the browser won't allow sound yet (no click or tap on the page so far), it doesn't play: it waits for a tap. */
  const play = (v: HTMLVideoElement) => {
    mute(v, mutedByThem.current)
    void v.play().catch(() => { /* no sound before a tap: the "Play with sound" button is there */ })
  }
  useEffect(() => {
    const v = video.current
    if (!v || typeof IntersectionObserver === 'undefined') return
    const still = lessMotion()
    const onVolume = () => {
      setMuted(v.muted)
      if (v.muted === set.current) return
      set.current = v.muted
      mutedByThem.current = v.muted
    }
    const onTime = () => setAt(v.currentTime)
    const onLength = () => { if (Number.isFinite(v.duration) && v.duration > 0) setLength(v.duration) }
    const onPlay = () => { setPlaying(true); setStarted(true) }
    const onPause = () => setPlaying(false)
    const events = { volumechange: onVolume, timeupdate: onTime, seeked: onTime, loadedmetadata: onLength, durationchange: onLength, play: onPlay, pause: onPause }
    const seen = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) v.pause()
      else if (!still) play(v)
    }, { threshold: 0.4 })
    seen.observe(v)
    for (const [ev, fn] of Object.entries(events)) v.addEventListener(ev, fn)
    return () => {
      seen.disconnect()
      for (const [ev, fn] of Object.entries(events)) v.removeEventListener(ev, fn)
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
    else { mutedByThem.current = true; mute(v, true) }
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
            onClick={playPause}
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
          {/* Not started: the poster, and one tap starts it with its sound. */}
          {!started && (
            <Box sx={{ position: 'absolute', inset: 0, bottom: { xs: 40, sm: 52 }, display: 'grid', placeItems: 'center', pointerEvents: 'none',
              background: 'radial-gradient(closest-side, rgba(20,16,14,0.28), rgba(20,16,14,0))' }}>
              <Button onClick={soundOn} variant="contained" aria-label={t('Play with sound')}
                sx={{ pointerEvents: 'auto', borderRadius: 99, px: { xs: 2.5, sm: 3.5 }, py: { xs: 1.25, sm: 1.75 }, gap: 1.25, textTransform: 'none',
                  fontWeight: 600, fontSize: { xs: '0.95rem', sm: '1.1rem' }, bgcolor: 'rgba(43,37,34,0.86)', color: '#fff',
                  boxShadow: '0 18px 40px rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)', '&:hover': { bgcolor: 'rgba(43,37,34,0.96)', transform: 'scale(1.03)' },
                  transition: 'transform .15s, background-color .15s' }}>
                <Box component="span" sx={{ width: { xs: 36, sm: 44 }, height: { xs: 36, sm: 44 }, borderRadius: '50%', bgcolor: BA.rose, color: BA.ink,
                  display: 'grid', placeItems: 'center' }}><PlayIcon sx={{ fontSize: { xs: 26, sm: 32 } }} /></Box>
                {t('Play with sound')}
                <SoundIcon sx={{ fontSize: { xs: 20, sm: 22 }, opacity: 0.85 }} />
              </Button>
            </Box>
          )}
        </Box>
        {more}
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
      label={t('Business Agent demo video')} seconds={DEMO_VIDEO.seconds} sx={whiteBand} more={!FEATURES.dayVideo && <MoreDemos />}
      title={tr('Change it in one place. It’s changed {em}', { em: <em>{t('everywhere.')}</em> })}
      text={t('A café sets up, closes on Sundays, adds Christmas and puts a price up, each in one place: Google Maps, its website, its till, its TV and its team follow.')} />
  )
}

export function DayVideo() {
  if (!FEATURES.dayVideo) return null
  return (
    <VideoSection id="day" labelledBy="day-video" eyebrow={t('A day in the life')} src={DAY_VIDEO.src} poster={DAY_VIDEO.poster}
      label={t('A day in the life of a café owner, video')} seconds={DAY_VIDEO.seconds} sx={FEATURES.demoVideo ? { pt: { xs: 8, md: 4 } } : whiteBand} more={<MoreDemos />}
      title={tr('The same day, {em}', { em: <em>{t('without the chaos.')}</em> })}
      text={t('From opening to closing: the checklists, the messages, the orders, the offers, the bills and the licences, before and with Business Agent.')} />
  )
}

export const OWNER_VIDEO = { src: '/video/run-your-cafe.mp4', poster: '/video/run-your-cafe.jpg', seconds: 114 }

/** The owner's morning, on the Demos page: on a white band, or on the page's colour where the one before it is white. */
export function OwnerVideo({ white = true }: { white?: boolean }) {
  if (!FEATURES.ownerVideo) return null
  return (
    <VideoSection id="owner" labelledBy="owner-video" eyebrow={t('An owner’s morning')} src={OWNER_VIDEO.src} poster={OWNER_VIDEO.poster}
      label={t('Run your café from one place, video')} seconds={OWNER_VIDEO.seconds} sx={white ? whiteBand : { pt: { xs: 8, md: 4 } }}
      title={tr('Run your café {em}', { em: <em>{t('from one place.')}</em> })}
      text={t('Today and the business advisor say what to do. Each change is made once, and Google Maps, the website, the café’s TV, the printed menu and Instagram follow.')} />
  )
}

/**
 * Every video, in the Demos page's order (src/pages/DemosPage.tsx): its section, the way it shows the app,
 * its title and what it's about, whether it's switched on. The landing page has the first two; a new
 * video goes here, and on the Demos page only.
 */
export const DEMOS = [
  { id: 'demo', on: FEATURES.demoVideo, video: DEMO_VIDEO, perspective: msg('The idea'), title: msg('Change it in one place'),
    about: msg('A café closes on Sundays, adds Christmas and puts a price up, once each: everywhere it shows follows.') },
  { id: 'day', on: FEATURES.dayVideo, video: DAY_VIDEO, perspective: msg('A whole day'), title: msg('A day in the life'),
    about: msg('A café owner’s day before Business Agent, and the same day with it, from opening to closing.') },
  { id: 'owner', on: FEATURES.ownerVideo, video: OWNER_VIDEO, perspective: msg('An owner’s morning'), title: msg('Run your café from one place'),
    about: msg('Today and the advisor say what to do; each change is made once, and everywhere it shows follows.') },
]

/** Under the landing page's last video: the rest are on the Demos page (not on the Demos page itself). */
function MoreDemos() {
  const { pathname } = useLocation()
  if (pathname !== '/') return null
  return (
    <Box sx={{ textAlign: 'center', mt: { xs: 3, md: 2.5 } }}>
      <Button component={RouterLink} to="/demos" endIcon={<ArrowIcon />} sx={{ color: BA.roseDeep, fontWeight: 600, textTransform: 'none', fontSize: '1rem' }}>
        {t('More films on the Demos page')}
      </Button>
    </Box>
  )
}
