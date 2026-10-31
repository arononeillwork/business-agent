// The landing page's videos (made in video/, see its README): the demo (a café changes its hours and a
// price in one place, and everywhere follows) and a day in the life of a café owner, before and with
// Business Agent. Each plays muted while it's on screen (not for people who've asked for less motion),
// with controls to watch it with its music.
import { Box, Container } from '@mui/material'
import { useEffect, useRef, type ReactNode } from 'react'
import { FEATURES } from '../../app/features'
import { BA, SectionIntro } from './site'
import { t, tr } from '../../i18n'

export const DEMO_VIDEO = { src: '/video/business-agent-demo.mp4', poster: '/video/business-agent-demo.jpg', seconds: 108 }
export const DAY_VIDEO = { src: '/video/day-in-the-life.mp4', poster: '/video/day-in-the-life.jpg', seconds: 112 }

/** A video section: a centred intro, then the video, playing muted while it's on screen. */
function VideoSection({ id, eyebrow, title, text, src, poster, label, pad }: {
  id: string; eyebrow: string; title: ReactNode; text: string; src: string; poster: string; label: string; pad?: object
}) {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = video.current
    if (!v || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const seen = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) void v.play().catch(() => { /* the browser wants a tap first: the controls are there */ })
      else v.pause()
    }, { threshold: 0.4 })
    seen.observe(v)
    return () => seen.disconnect()
  }, [])
  return (
    <Box component="section" aria-labelledby={id} sx={pad ?? { pb: { xs: 8, md: 12 } }}>
      <Container maxWidth="lg">
        <SectionIntro eyebrow={eyebrow} title={<span id={id}>{title}</span>} text={text} />
        <Box sx={{ borderRadius: { xs: '16px', md: '24px' }, overflow: 'hidden', border: `1px solid ${BA.line}`, bgcolor: BA.tint,
          boxShadow: '0 50px 100px -50px rgba(43,37,34,0.38)', aspectRatio: '16 / 9' }}>
          <Box component="video" ref={video} src={src} poster={poster} controls muted loop playsInline preload="metadata"
            aria-label={label} sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
        </Box>
      </Container>
    </Box>
  )
}

export function DemoVideo() {
  if (!FEATURES.demoVideo) return null
  return (
    <VideoSection id="demo-video" eyebrow={t('See it in action')} src={DEMO_VIDEO.src} poster={DEMO_VIDEO.poster} label={t('Business Agent demo video')}
      title={tr('Change it in one place. It’s changed {em}', { em: <em>{t('everywhere.')}</em> })}
      text={t('A café sets up, closes on Sundays, adds Christmas and puts a price up, each in one place: Google Maps, its website, its till, its TV and its team follow.')} />
  )
}

export function DayVideo() {
  if (!FEATURES.dayVideo) return null
  return (
    <VideoSection id="day-video" eyebrow={t('A day in the life')} src={DAY_VIDEO.src} poster={DAY_VIDEO.poster} label={t('A day in the life of a café owner, video')}
      pad={{ py: { xs: 8, md: 12 } }}
      title={tr('The same day, {em}', { em: <em>{t('without the chaos.')}</em> })}
      text={t('From opening to closing: the checklists, the messages, the orders, the offers, the bills and the licences, before and with Business Agent.')} />
  )
}
