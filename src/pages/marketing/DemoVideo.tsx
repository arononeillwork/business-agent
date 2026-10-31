// The landing page's demo video (made in video/, see its README): a café changes its hours and a
// price once, and everywhere follows. Plays muted while it's on screen (not for people who've asked
// for less motion), with controls to watch it with its music.
import { Box, Container, Typography } from '@mui/material'
import { useEffect, useRef } from 'react'
import { FEATURES } from '../../app/features'
import { BA, SectionIntro } from './site'
import { t, tr } from '../../i18n'

export const DEMO_VIDEO = { src: '/video/business-agent-demo.mp4', poster: '/video/business-agent-demo.jpg', seconds: 76 }

export function DemoVideo() {
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
  if (!FEATURES.demoVideo) return null
  return (
    <Box component="section" aria-labelledby="demo-video" sx={{ pb: { xs: 8, md: 12 } }}>
      <Container maxWidth="lg">
        <SectionIntro eyebrow={t('See it in {n} seconds', { n: DEMO_VIDEO.seconds })}
          title={<span id="demo-video">{tr('Change it once. It’s changed {em}', { em: <em>{t('everywhere.')}</em> })}</span>}
          text={t('A café sets up, closes on Sundays, adds Christmas and puts a price up, once each: Google Maps, its website, its menus and its team follow.')} />
        <Box sx={{ borderRadius: { xs: '16px', md: '24px' }, overflow: 'hidden', border: `1px solid ${BA.line}`, bgcolor: BA.tint,
          boxShadow: '0 50px 100px -50px rgba(43,37,34,0.38)', aspectRatio: '16 / 9' }}>
          <Box component="video" ref={video} src={DEMO_VIDEO.src} poster={DEMO_VIDEO.poster} controls muted loop playsInline preload="metadata"
            aria-label={t('Business Agent demo video')} aria-describedby="demo-video-about"
            sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
        </Box>
        <Typography id="demo-video-about" variant="body2" sx={{ color: BA.faint, textAlign: 'center', mt: 2 }}>
          {t('Easy Beans Coffee, in the app and on its own website. Turn the sound on for the music.')}
        </Typography>
      </Container>
    </Box>
  )
}
