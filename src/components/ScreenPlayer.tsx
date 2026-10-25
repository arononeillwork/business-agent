import { Box, Typography } from '@mui/material'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { MenuBoard, boardBrand } from './MenuBoard'
import { useTick } from '../app/hooks'
import { sizeOf } from '../../shared/menu'
import { musicEmbedUrl, musicKind, playOrder, playUrl, slideSeconds, type DisplayFeed, type Slide } from '../../shared/screens'
import { formatLocal } from '../../shared/time'
import { t } from '../i18n'

// The slideshow a screen plays: each slide for its time, changing with the screen's effect and
// speed, over the music, with the clock and a running line if the screen has them. Fills whatever
// box it's in: the whole TV on the screen's own link, or a small frame on the Screens page, where it
// previews the changes being made (silently: `preview`).

type Phase = 'enter' | 'shown' | 'exit'
interface Layer { key: number; slide: Slide; phase: Phase }

const looks: Record<string, Record<Phase, CSSProperties>> = {
  fade: { enter: { opacity: 0 }, shown: { opacity: 1 }, exit: { opacity: 0 } },
  slide: { enter: { transform: 'translateX(100%)' }, shown: { transform: 'translateX(0)' }, exit: { transform: 'translateX(-100%)' } },
  zoom: { enter: { opacity: 0, transform: 'scale(1.08)' }, shown: { opacity: 1, transform: 'scale(1)' }, exit: { opacity: 0, transform: 'scale(0.96)' } },
  none: { enter: { opacity: 1 }, shown: { opacity: 1 }, exit: { opacity: 0 } },
}

export function ScreenPlayer({ feed, preview = false, onBlocked }: { feed: DisplayFeed; preview?: boolean; onBlocked?: (blocked: boolean) => void }) {
  const s = feed.screen
  // The order changes only when the slides do (a new shuffle each time round would be too).
  const slidesKey = JSON.stringify(s.slides)
  const order = useMemo(() => playOrder(s.slides, s.shuffle), [slidesKey, s.shuffle])
  const [layers, setLayers] = useState<Layer[]>([])
  const at = useRef(-1)
  const keyRef = useRef(0)
  const [, setTurn] = useState(0)
  const current = layers.find(l => l.phase !== 'exit')?.slide ?? null
  const ms = s.transition === 'none' ? 0 : s.transition_ms

  const next = () => {
    if (!order.length) { setLayers([]); return }
    at.current = (at.current + 1) % order.length
    const slide = order[at.current]
    const key = ++keyRef.current
    setLayers(ls => [...ls.filter(l => l.phase !== 'exit').map(l => ({ ...l, phase: 'exit' as const })), { key, slide, phase: 'enter' }])
    // Next frame: the new slide comes in; after the change, the old one goes.
    requestAnimationFrame(() => requestAnimationFrame(() => setLayers(ls => ls.map(l => (l.key === key ? { ...l, phase: 'shown' } : l)))))
    setTimeout(() => setLayers(ls => ls.filter(l => l.phase !== 'exit' || l.key > key)), ms + 50)
    setTurn(n => n + 1)
  }
  // Start again from the first slide whenever the slides change (an edit, or the screen's minute
  // check found one): straight on, without a change from what was showing.
  useEffect(() => {
    at.current = 0
    setLayers(order.length ? [{ key: ++keyRef.current, slide: order[0], phase: 'shown' }] : [])
  }, [order])
  // Each slide's time, then the next (a video without a time of its own says when it has ended).
  const seconds = current ? slideSeconds(current, s) : null
  useEffect(() => {
    if (!current || seconds === null || order.length < 2) return
    const id = setTimeout(next, seconds * 1000)
    return () => clearTimeout(id)
  }, [current, seconds, order])
  // The next picture loads while this one shows.
  useEffect(() => {
    const coming = order[(at.current + 1) % Math.max(order.length, 1)]
    if (coming?.kind === 'image' && coming.url && !coming.live) new Image().src = coming.url
  }, [current, order])

  const videoWithSound = current?.kind === 'video' && s.video_sound
  return (
    <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', bgcolor: '#000', color: '#fff', containerType: 'size' }}>
      {!s.active ? <Holding feed={feed} /> : !order.length ? <Holding feed={feed} note={t('No slides yet: add them on the Screens page.')} /> : layers.map(l => (
        <Box key={l.key} data-slide={l.slide.id} aria-hidden={l.phase === 'exit'}
          sx={{ position: 'absolute', inset: 0, transition: `opacity ${ms}ms ease, transform ${ms}ms ease`, ...looks[s.transition][l.phase] }}>
          <SlideView slide={l.slide} feed={feed} sound={s.video_sound && !preview} onEnded={l.phase === 'shown' && order.length > 1 ? next : undefined} />
        </Box>
      ))}
      {s.active && s.show_clock && <Clock />}
      {s.active && s.ticker && <Ticker text={s.ticker} />}
      {!preview && s.active && s.music_url && <Music url={s.music_url} volume={s.music_volume} paused={!!videoWithSound} onBlocked={onBlocked} />}
    </Box>
  )
}

/** A switched-off screen, or one with nothing to play: the business's name (and logo) on black. */
function Holding({ feed, note }: { feed: DisplayFeed; note?: string }) {
  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', p: '6cqmin' }}>
      <Box>
        {feed.business.logo && <Box component="img" src={feed.business.logo} alt="" sx={{ height: '18cqmin', mb: '3cqmin', objectFit: 'contain' }} />}
        <Typography sx={{ fontSize: '7cqmin', fontWeight: 500 }}>{feed.business.name}</Typography>
        {note && <Typography sx={{ fontSize: '2.6cqmin', opacity: 0.6, mt: '2cqmin' }}>{note}</Typography>}
      </Box>
    </Box>
  )
}

function SlideView({ slide, feed, sound, onEnded }: { slide: Slide; feed: DisplayFeed; sound: boolean; onEnded?: () => void }) {
  const fit = feed.screen.fit
  // A fresh address each time a live slide comes round (worked out once per showing).
  const src = useMemo(() => playUrl(slide, { sound }), [slide, sound])
  const fill = { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 } as const
  if (slide.kind === 'menu') {
    const m = slide.design_id ? feed.menus[slide.design_id] : undefined
    if (!m) return null
    const z = sizeOf(m.design.size)
    return (
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <Box sx={{ width: `min(100cqw, calc(100cqh * ${z.width / z.height}))` }}>
          <MenuBoard design={m.design} items={m.items} allergens={feed.allergens} image={m.design.image_url} brand={boardBrand(feed.business.name, feed.business)} order={feed.sections} />
        </Box>
      </Box>
    )
  }
  if (!src) return null
  if (slide.kind === 'image') return <Box component="img" src={src} alt={slide.title ?? ''} sx={{ ...fill, objectFit: fit }} />
  if (slide.kind === 'video') {
    // Without a time of its own it plays to its end (then the next slide); with one, it loops until then.
    return <Box component="video" src={src} autoPlay muted={!sound} playsInline loop={!onEnded || slide.seconds !== null} onEnded={slide.seconds === null ? onEnded : undefined}
      sx={{ ...fill, objectFit: fit, bgcolor: '#000' }} />
  }
  return <Box component="iframe" src={src} title={slide.title ?? slide.url ?? ''} allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
    referrerPolicy="strict-origin-when-cross-origin" sx={{ ...fill, bgcolor: slide.kind === 'web' ? '#fff' : '#000' }} />
}

function Clock() {
  useTick(10_000)
  return (
    <Box sx={{ position: 'absolute', top: '3cqmin', right: '3cqmin', px: '2cqmin', py: '0.8cqmin', borderRadius: '1.5cqmin', bgcolor: 'rgba(0,0,0,0.45)',
      fontSize: '5cqmin', fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, backdropFilter: 'blur(4px)' }}>
      {formatLocal(new Date().toISOString(), 'HH:mm')}
    </Box>
  )
}

/** The running line along the bottom; its speed follows its length, so it reads at the same pace. */
function Ticker({ text }: { text: string }) {
  const seconds = Math.max(12, text.length * 0.28)
  return (
    <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, py: '1.2cqmin', bgcolor: 'rgba(0,0,0,0.6)', overflow: 'hidden', whiteSpace: 'nowrap',
      fontSize: '3.4cqmin', fontWeight: 500, backdropFilter: 'blur(4px)',
      '@keyframes ebTicker': { from: { transform: 'translateX(100cqw)' }, to: { transform: 'translateX(-100%)' } } }}>
      <Box component="span" sx={{ display: 'inline-block', pl: '2cqw', animation: `ebTicker ${seconds}s linear infinite` }}>{text}</Box>
    </Box>
  )
}

/**
 * The screen's music: an MP3 or a stream in the browser's own player, or YouTube in a hidden one.
 * Paused while a video plays its own sound. Browsers only start sound after a tap, so a blocked
 * start is reported (the screen's page asks for a tap).
 */
function Music({ url, volume, paused, onBlocked }: { url: string; volume: number; paused: boolean; onBlocked?: (blocked: boolean) => void }) {
  const audio = useRef<HTMLAudioElement>(null)
  const kind = musicKind(url)
  useEffect(() => {
    const a = audio.current
    if (!a) return
    a.volume = Math.max(0, Math.min(1, volume / 100))
    if (paused) { a.pause(); return }
    a.play().then(() => onBlocked?.(false)).catch(() => onBlocked?.(true))
    // When the page is tapped to allow sound, start again.
    const retry = () => { a.play().then(() => onBlocked?.(false)).catch(() => {}) }
    window.addEventListener('pointerdown', retry)
    return () => window.removeEventListener('pointerdown', retry)
  }, [url, volume, paused, onBlocked])
  if (kind === 'youtube') {
    if (paused) return null
    return <Box component="iframe" src={musicEmbedUrl(url) ?? undefined} title={t('Music')} allow="autoplay" aria-hidden
      sx={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', border: 0 }} />
  }
  return <audio ref={audio} src={url} loop preload="auto" />
}
