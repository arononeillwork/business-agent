// The Sales page (/sell, in the site menu as "Sales"): for the people who sell The Business Agent. First the
// kinds of business they talk to (cafés now; restaurants, barbers and more as each is written); a kind's
// card opens /sell/<kind>: the problems its owners have, what the app does about each, what the owner gets
// (more money, time back, lower costs, the legal records kept), and a place for the film that shows it.
// The content is in marketing/salesPlaybook.ts. Public, like Pricing and Demos: no sign-in.
//
// It's /sell and not /sales: /sales is the signed-in Sales page (takings), and public pages are matched first.
import { Box, ButtonBase, Container, Stack, Typography } from '@mui/material'
import CoffeeIcon from '@mui/icons-material/CoffeeOutlined'
import RestaurantIcon from '@mui/icons-material/RestaurantOutlined'
import BarberIcon from '@mui/icons-material/ContentCutOutlined'
import EuroIcon from '@mui/icons-material/EuroOutlined'
import ClockIcon from '@mui/icons-material/AccessTimeOutlined'
import SavingsIcon from '@mui/icons-material/SavingsOutlined'
import LegalIcon from '@mui/icons-material/GavelOutlined'
import PlayIcon from '@mui/icons-material/PlayArrowRounded'
import { useEffect, type ReactNode } from 'react'
import { Link as RouterLink, Navigate, useLocation } from 'react-router-dom'
import { TRIAL_MONTHS } from '../../shared/plans'
import { msg, t, tr, useLanguage } from '../i18n'
import { ClosingCta } from './LoginPage'
import { BUSINESS_TYPES, WINS, businessType, type PainPoint, type Win } from './marketing/salesPlaybook'
import { BA, Eyebrow, HEADER_HEIGHT, MarketingFrame, SectionIntro, display, glow } from './marketing/site'
import { lessMotion } from './marketing/watchDemo'

const TYPE_ICON: Record<string, ReactNode> = { cafes: <CoffeeIcon />, restaurants: <RestaurantIcon />, barbers: <BarberIcon /> }

/** Each win in its own colour and icon, so a card says at a glance what the owner gets. */
const WIN_LOOK: Record<Win, { icon: ReactNode; fg: string; bg: string }> = {
  money: { icon: <EuroIcon />, fg: BA.matchaDeep, bg: BA.matchaSoft },
  time: { icon: <ClockIcon />, fg: BA.lilacDeep, bg: BA.lilacSoft },
  costs: { icon: <SavingsIcon />, fg: BA.roseDeep, bg: BA.roseSoft },
  legal: { icon: <LegalIcon />, fg: BA.soft, bg: BA.tint },
}

const STEPS = [
  { title: msg('Pick the business type'), text: msg('Start with the kind of business you’re talking to. Each has its own problems, in its owners’ own words.') },
  { title: msg('Open with the problem'), text: msg('Ask about the pain before you show anything. When the owner says “yes, that’s me”, show what the app does about it.') },
  { title: msg('Show the film, then the trial'), text: msg('Each problem has a short film. Then offer the free trial: the Free plan, or {n} months of Business on us.') },
]

/** A small label saying one thing the owner gets: "Make money", "Save time". */
function WinTag({ win }: { win: Win }) {
  const look = WIN_LOOK[win]
  return (
    <Stack component="span" direction="row" spacing={0.6} sx={{ alignItems: 'center', px: 1.1, py: 0.35, borderRadius: 99, bgcolor: look.bg, color: look.fg, fontSize: '0.8rem', fontWeight: 600,
      '& svg': { fontSize: 16 } }}>
      {look.icon}<span>{t(WINS.find(w => w.id === win)!.label)}</span>
    </Stack>
  )
}

/** The film that shows a problem solved (it loads only when played), or a place for it until it's made. */
function FilmPlaceholder({ title, film }: { title: string; film?: PainPoint['film'] }) {
  if (film) {
    return (
      <Box component="figure" sx={{ m: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box component="video" src={film.src} poster={film.poster} controls playsInline preload="none" aria-label={t('{title}, video', { title: t(title) })}
          sx={{ display: 'block', width: '100%', aspectRatio: '16 / 9', borderRadius: '16px', bgcolor: BA.tint, objectFit: 'cover' }} />
        <Typography component="figcaption" sx={{ color: BA.soft, fontSize: '0.92rem', mt: 1, lineHeight: 1.45 }}>{t(title)}</Typography>
      </Box>
    )
  }
  return (
    <Box component="figure" sx={{ m: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: '16px', bgcolor: BA.tint, border: `1.5px dashed ${BA.limewash}`, display: 'grid', placeItems: 'center' }}>
        <Stack spacing={1} sx={{ alignItems: 'center', color: BA.faint }}>
          <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.8)', display: 'grid', placeItems: 'center' }}><PlayIcon sx={{ fontSize: 30 }} /></Box>
          <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t('Film coming soon')}</Typography>
        </Stack>
      </Box>
      <Typography component="figcaption" sx={{ color: BA.soft, fontSize: '0.92rem', mt: 1, lineHeight: 1.45 }}>{t(title)}</Typography>
    </Box>
  )
}

/** One problem: what the owner says, what the app does, what they get, and where the film goes. */
function PainCard({ point, n }: { point: PainPoint; n: number }) {
  const block = (label: string, text: string, strong?: boolean) => (
    <Box>
      <Typography sx={{ fontWeight: 600, fontSize: '0.74rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: BA.faint }}>{label}</Typography>
      <Typography sx={{ mt: 0.5, lineHeight: 1.6, color: strong ? BA.ink : BA.soft, fontWeight: strong ? 500 : 400, fontSize: strong ? '1.05rem' : '1rem' }}>{text}</Typography>
    </Box>
  )
  return (
    <Box component="article" id={point.id} aria-label={t(point.title)}
      sx={{ scrollMarginTop: HEADER_HEIGHT + 16, p: { xs: 2.5, md: 3.5 }, borderRadius: '22px', border: `1px solid ${BA.line}`, bgcolor: '#fff',
        display: 'grid', gap: { xs: 3, md: 4 }, gridTemplateColumns: { xs: '1fr', md: '1.35fr 0.65fr' } }}>
      <Stack spacing={2.25}>
        <Box>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline' }}>
            <Typography sx={{ fontFamily: display, fontStyle: 'italic', color: BA.roseDeep, fontSize: '1.7rem', lineHeight: 1 }}>{String(n).padStart(2, '0')}</Typography>
            <Typography component="h3" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '1.5rem', md: '1.8rem' }, lineHeight: 1.15 }}>{t(point.title)}</Typography>
          </Stack>
          <Stack direction="row" sx={{ mt: 1.25, flexWrap: 'wrap', gap: 0.75 }}>{point.wins.map(w => <WinTag key={w} win={w} />)}</Stack>
        </Box>
        {block(t('The owner says'), t(point.says), true)}
        {block(t('What The Business Agent does'), t(point.fix))}
        {block(t('What they get'), t(point.result))}
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
          <Typography sx={{ fontSize: '0.85rem', color: BA.faint, mr: 0.5 }}>{t('In the app')}</Typography>
          {point.pages.map(p => (
            <Box key={p} component="span" sx={{ px: 1.1, py: 0.3, borderRadius: 99, border: `1px solid ${BA.line}`, fontSize: '0.82rem', color: BA.soft }}>{t(p)}</Box>
          ))}
        </Stack>
      </Stack>
      <FilmPlaceholder title={point.video} film={point.film} />
    </Box>
  )
}

/** Every problem under the win it's mainly about: the cheat sheet, each a link to its card. */
function AtAGlance({ points }: { points: PainPoint[] }) {
  return (
    <Box component="section" aria-label={t('Selling points at a glance')}
      sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, mb: { xs: 5, md: 7 } }}>
      {WINS.map(w => {
        const mine = points.filter(p => p.wins[0] === w.id)
        if (!mine.length) return null
        const look = WIN_LOOK[w.id]
        return (
          <Box key={w.id} sx={{ p: 2.5, borderRadius: '18px', bgcolor: look.bg }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: look.fg }}>
              {look.icon}
              <Typography component="h3" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>{t(w.label)}</Typography>
            </Stack>
            <Typography sx={{ color: BA.soft, fontSize: '0.92rem', mt: 0.5 }}>{t(w.line)}</Typography>
            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1.5, display: 'grid', gap: 0.75 }}>
              {mine.map(p => (
                <li key={p.id}>
                  <Box component="a" href={`#${p.id}`} sx={{ color: BA.ink, textDecoration: 'none', fontWeight: 500, fontSize: '0.95rem', '&:hover': { textDecoration: 'underline' } }}>{t(p.title)}</Box>
                </li>
              ))}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

export function SellPage() {
  const { pathname } = useLocation()
  const lang = useLanguage()
  // /sell/cafes → "cafes"; /sell and /sell/ → none yet.
  const typeId = pathname.split('/')[2]
  const type = businessType(typeId)
  useEffect(() => {
    const before = document.title
    document.title = t('Sales · The Business Agent')
    return () => { document.title = before }
  }, [lang])
  // Choosing a kind of business takes you to its problems.
  useEffect(() => {
    if (type) requestAnimationFrame(() => document.getElementById('pains')?.scrollIntoView({ behavior: lessMotion() ? 'auto' : 'smooth', block: 'start' }))
  }, [type])
  // A kind that isn't there (or isn't written yet): back to the choice.
  if (typeId && !type) return <Navigate to="/sell" replace />
  return (
    <MarketingFrame>
      <Box component="main">
        <Box sx={{ backgroundImage: glow('50%', '-200px') }}>
          <Container maxWidth="lg" sx={{ pt: { xs: 5, md: 8 }, pb: { xs: 8, md: 10 } }}>
            <Box sx={{ textAlign: 'center', maxWidth: 760, mx: 'auto', mb: { xs: 5, md: 6 } }}>
              <Eyebrow>{t('Sales')}</Eyebrow>
              <Typography component="h1" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '3rem', md: '4.6rem' }, lineHeight: 0.98, letterSpacing: '-0.02em', mt: 1.75 }}>
                {tr('Know what {em} hurts them.', { em: <Box component="em" sx={{ fontStyle: 'italic', color: BA.roseDeep }}>{t('really')}</Box> })}
              </Typography>
              <Typography sx={{ color: BA.soft, fontSize: { xs: '1.08rem', md: '1.2rem' }, mt: 2.5, lineHeight: 1.6 }}>
                {t('For the people who sell The Business Agent. Pick the kind of business you’re talking to, and see what its owners struggle with, what the app does about it, and the film that shows it.')}
              </Typography>
            </Box>

            {/* The kinds of business. */}
            <Box component="ul" aria-label={t('Business type')} sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: { xs: 2, md: 2.5 },
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: `repeat(${Math.min(4, BUSINESS_TYPES.length)}, minmax(0, 1fr))` } }}>
              {BUSINESS_TYPES.map(b => {
                const chosen = type?.id === b.id
                const body = (
                  <>
                    <Box sx={{ width: 46, height: 46, borderRadius: '13px', display: 'grid', placeItems: 'center', bgcolor: chosen ? BA.ink : BA.tint, color: chosen ? BA.bg : BA.ink }}>{TYPE_ICON[b.id]}</Box>
                    <Typography component="h2" sx={{ fontFamily: display, fontWeight: 500, fontSize: '1.7rem', lineHeight: 1.1, mt: 2 }}>{t(b.name)}</Typography>
                    <Typography sx={{ color: BA.soft, fontSize: '0.95rem', lineHeight: 1.5, mt: 0.75 }}>{t(b.blurb)}</Typography>
                    {!b.live && <Typography sx={{ mt: 1.5, fontWeight: 600, fontSize: '0.74rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: BA.faint }}>{t('Coming soon')}</Typography>}
                  </>
                )
                const card = { display: 'block', width: '100%', textAlign: 'left', p: 3, borderRadius: '22px', bgcolor: '#fff', border: `1.5px solid ${chosen ? BA.ink : BA.line}`, height: '100%' } as const
                return (
                  <Box component="li" key={b.id}>
                    {b.live
                      ? <ButtonBase component={RouterLink} to={`/sell/${b.id}`} aria-current={chosen ? 'page' : undefined}
                          sx={{ ...card, boxShadow: '0 30px 60px -44px rgba(43,37,34,0.4)', transition: 'transform .2s, border-color .2s', '&:hover, &:focus-visible': { transform: 'translateY(-3px)', borderColor: BA.ink } }}>{body}</ButtonBase>
                      : <Box sx={{ ...card, bgcolor: 'rgba(255,255,255,0.55)', borderStyle: 'dashed', color: BA.soft }}>{body}</Box>}
                  </Box>
                )
              })}
            </Box>
            <Typography sx={{ textAlign: 'center', color: BA.faint, fontSize: '0.95rem', mt: 3 }}>
              {t('Restaurants, barbers and more are on the way. Tell us which kind of business to write up next.')}
            </Typography>
          </Container>
        </Box>

        {type ? (
          <Box id="pains" sx={{ scrollMarginTop: HEADER_HEIGHT, bgcolor: '#fff', borderTop: `1px solid ${BA.line}`, borderBottom: `1px solid ${BA.line}` }}>
            <Container maxWidth="lg" sx={{ py: { xs: 8, md: 11 } }}>
              <SectionIntro eyebrow={t(type.name)} title={t('What hurts, and what fixes it')}
                text={t('Open with the owner’s problem, not our features. Each card has what they say, what the app does about it, what they get, and a place for the film.')} />
              <AtAGlance points={type.points} />
              <Stack spacing={{ xs: 2.5, md: 3 }}>
                {type.points.map((p, i) => <PainCard key={p.id} point={p} n={i + 1} />)}
              </Stack>
            </Container>
          </Box>
        ) : (
          <Container maxWidth="lg" sx={{ py: { xs: 8, md: 11 } }}>
            <SectionIntro eyebrow={t('How to use this page')} title={t('From the first hello to a free trial')} />
            <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
              {STEPS.map((s, i) => (
                <Box key={s.title} sx={{ p: 3.5, borderRadius: '20px', border: `1px solid ${BA.line}`, bgcolor: '#fff' }}>
                  <Typography sx={{ fontFamily: display, fontStyle: 'italic', color: BA.roseDeep, fontSize: '2.2rem', lineHeight: 1 }}>0{i + 1}</Typography>
                  <Typography component="h3" sx={{ fontWeight: 600, fontSize: '1.1rem', mt: 1.5 }}>{t(s.title)}</Typography>
                  <Typography sx={{ color: BA.soft, mt: 1, lineHeight: 1.6 }}>{t(s.text, { n: TRIAL_MONTHS })}</Typography>
                </Box>
              ))}
            </Box>
          </Container>
        )}

        <Box sx={{ pt: { xs: 8, md: 12 } }}><ClosingCta /></Box>
      </Box>
    </MarketingFrame>
  )
}
