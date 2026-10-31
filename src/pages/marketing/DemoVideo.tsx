// The landing page's demo video (made in video/, see its README): a café changes its hours and a
// price in one place, and everywhere follows. Plays muted while it's on screen (not for people who've
// asked for less motion), with controls to watch it with its music. "View a demo" in the hero brings
// it up and plays it from the start, with its music.
import { Box, Container } from '@mui/material'
import { useEffect, useRef, type MouseEvent } from 'react'
import { FEATURES } from '../../app/features'
import { BA, HEADER_HEIGHT, SectionIntro, fullScreen } from './site'
import { t, tr } from '../../i18n'

export const DEMO_VIDEO = { src: '/video/business-agent-demo.mp4', poster: '/video/business-agent-demo.jpg', seconds: 108 }

const lessMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** "View a demo": scroll down to the video and play it from the start, with its music (the click allows the sound; muted if the browser still says no). */
export function watchDemo(e?: MouseEvent) {
  e?.preventDefault()
  document.getElementById('demo')?.scrollIntoView({ behavior: lessMotion() ? 'auto' : 'smooth', block: 'start' })
  const v = document.querySelector<HTMLVideoElement>('#demo video')
  if (!v) return
  v.currentTime = 0
  v.muted = false
  void v.play().catch(() => { v.muted = true; void v.play().catch(() => { /* the controls are there */ }) })
}

export function DemoVideo() {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = video.current
    if (!v || typeof IntersectionObserver === 'undefined') return
    const still = lessMotion()
    const seen = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) v.pause()
      else if (!still) void v.play().catch(() => { /* the browser wants a tap first: the controls are there */ })
    }, { threshold: 0.4 })
    seen.observe(v)
    return () => seen.disconnect()
  }, [])
  if (!FEATURES.demoVideo) return null
  return (
    <Box component="section" id="demo" aria-labelledby="demo-video" sx={{ ...fullScreen, pt: { xs: 0, md: 4 }, pb: { xs: 8, md: 4 } }}>
      <Container maxWidth="lg">
        <SectionIntro eyebrow={t('See it in action')} compact
          title={<span id="demo-video">{tr('Change it in one place. It’s changed {em}', { em: <em>{t('everywhere.')}</em> })}</span>}
          text={t('A café sets up, closes on Sundays, adds Christmas and puts a price up, each in one place: Google Maps, its website, its till, its TV and its team follow.')} />
        {/* On a computer the whole video fits on the screen under its title, so none of it is cut off. */}
        <Box sx={{ borderRadius: { xs: '16px', md: '24px' }, overflow: 'hidden', border: `1px solid ${BA.line}`, bgcolor: BA.tint,
          boxShadow: '0 50px 100px -50px rgba(43,37,34,0.38)', aspectRatio: '16 / 9', mx: 'auto',
          maxWidth: { md: `calc((100svh - ${HEADER_HEIGHT}px - 320px) * 16 / 9)` } }}>
          <Box component="video" ref={video} src={DEMO_VIDEO.src} poster={DEMO_VIDEO.poster} controls muted loop playsInline preload="metadata"
            aria-label={t('Business Agent demo video')}
            sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
        </Box>
      </Container>
    </Box>
  )
}
