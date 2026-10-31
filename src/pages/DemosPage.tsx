// The Demos page (/demos): every film of Business Agent, each a different way of seeing it. The landing
// page shows the first two (the demo and a day in the life); all of them are here, those two included,
// and a new one goes here (DEMOS in marketing/DemoVideo.tsx). At the top, a card for each (its poster,
// the way it shows the app, what it's about and how long it is) brings it up and plays it from the start
// with its sound; then each in its own section with the landing page's player, the sections taking turns
// between a white band and the page's colour.
import { Box, ButtonBase, Container, Typography } from '@mui/material'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { FEATURES } from '../app/features'
import { t, tr, useLanguage } from '../i18n'
import { ClosingCta } from './LoginPage'
import { DEMOS, DayVideo, DemoVideo, OwnerVideo, clock } from './marketing/DemoVideo'
import { BA, Eyebrow, MarketingFrame, display, glow } from './marketing/site'
import { watchVideo } from './marketing/watchDemo'

export function DemosPage() {
  const { hash } = useLocation()
  const lang = useLanguage()
  // /demos#owner: go to that film once it's on the page.
  useEffect(() => {
    if (hash) requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [hash])
  useEffect(() => {
    const before = document.title
    document.title = t('Demos · Business Agent')
    return () => { document.title = before }
  }, [lang])
  const shown = DEMOS.filter(d => d.on)
  // The sections take turns, a white band first: the owner's morning is on one unless only one film is before it.
  const before = [FEATURES.demoVideo, FEATURES.dayVideo].filter(Boolean).length
  return (
    <MarketingFrame>
      <Box component="main">
        <Box sx={{ backgroundImage: glow('50%', '-200px') }}>
          <Container maxWidth="lg" sx={{ pt: { xs: 5, md: 8 }, pb: { xs: 8, md: 10 } }}>
            <Box sx={{ textAlign: 'center', maxWidth: 760, mx: 'auto', mb: { xs: 5, md: 6 } }}>
              <Eyebrow>{t('Demos')}</Eyebrow>
              <Typography component="h1" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '3rem', md: '4.6rem' }, lineHeight: 0.98, letterSpacing: '-0.02em', mt: 1.75 }}>
                {tr('See it {em}', { em: <Box component="em" sx={{ fontStyle: 'italic', color: BA.roseDeep }}>{t('from every side.')}</Box> })}
              </Typography>
              <Typography sx={{ color: BA.soft, fontSize: { xs: '1.08rem', md: '1.2rem' }, mt: 2.5, lineHeight: 1.6 }}>
                {t('Short films of a real café, Easy Beans Coffee, on Business Agent. Each shows it a different way: pick one, or watch them all.')}
              </Typography>
            </Box>
            <Box component="ul" aria-label={t('The films')} sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: { xs: 2.5, md: 3 },
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: `repeat(${Math.min(3, shown.length)}, minmax(0, 1fr))` } }}>
              {shown.map(d => (
                <Box component="li" key={d.id}>
                  <ButtonBase component="a" href={`#${d.id}`} onClick={e => watchVideo(d.id, e)} aria-label={t('Watch {title}', { title: t(d.title) })}
                    sx={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: '22px', overflow: 'hidden', bgcolor: '#fff', border: `1px solid ${BA.line}`,
                      boxShadow: '0 30px 60px -40px rgba(43,37,34,0.35)', transition: 'transform .2s, box-shadow .2s',
                      '&:hover, &:focus-visible': { transform: 'translateY(-3px)', boxShadow: '0 40px 70px -40px rgba(43,37,34,0.45)' } }}>
                    <Box sx={{ position: 'relative', aspectRatio: '16 / 9', bgcolor: BA.tint }}>
                      <Box component="img" src={d.video.poster} alt="" loading="lazy" sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
                      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'linear-gradient(to top, rgba(20,16,14,0.35), rgba(20,16,14,0) 55%)' }}>
                        <Box sx={{ width: 58, height: 58, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.92)', display: 'grid', placeItems: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
                          <PlayIcon sx={{ fontSize: 34, color: BA.ink }} />
                        </Box>
                      </Box>
                      <Box component="span" sx={{ position: 'absolute', right: 12, bottom: 10, px: 1, py: 0.25, borderRadius: '8px', bgcolor: 'rgba(20,16,14,0.72)', color: '#fff',
                        fontSize: '0.8rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{clock(d.video.seconds)}</Box>
                    </Box>
                    <Box sx={{ p: { xs: 2.25, md: 2.75 } }}>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.78rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: BA.roseDeep }}>{t(d.perspective)}</Typography>
                      <Typography component="h2" sx={{ fontFamily: display, fontWeight: 500, fontSize: '1.6rem', lineHeight: 1.15, color: BA.ink, mt: 0.75 }}>{t(d.title)}</Typography>
                      <Typography sx={{ color: BA.soft, fontSize: '0.98rem', lineHeight: 1.55, mt: 1 }}>{t(d.about)}</Typography>
                    </Box>
                  </ButtonBase>
                </Box>
              ))}
            </Box>
          </Container>
        </Box>

        {/* Each film in its own section, with the landing page's player. */}
        <DemoVideo />
        <DayVideo />
        <OwnerVideo white={before !== 1} />

        <Box sx={{ pt: { xs: 8, md: 12 } }}><ClosingCta /></Box>
      </Box>
    </MarketingFrame>
  )
}
