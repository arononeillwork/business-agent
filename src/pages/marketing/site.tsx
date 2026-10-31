import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Box, Button, Container, Link, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import iconUrl from '../../assets/icon.png'
import { ENTERPRISE } from '../../../shared/plans'
import { t } from '../../i18n'
import { LanguageToggle } from '../../components/Language'
import { shows } from '../../app/features'
import { watchDemo } from './watchDemo'

// Business Agent: the product. Signed-out visitors see its own look (not any one business's
// brand); once someone signs in, they see their business's branded app. The palette is natural
// and warm, from the first Easy Beans colours: rose pink, grey limewash and ube lilac on cream,
// with espresso ink. Headlines and the wordmark are set in a sturdy serif (Fraunces, weight 500);
// prices and figures stay in the plain sans so they read at a glance.
export const BA = {
  ink: '#2B2522', soft: '#5F5852', faint: '#8E877F', line: '#E7E1DA', lineSoft: '#F0EBE5',
  bg: '#FBF8F4', card: '#FFFFFF', tint: '#F3EEE8', limewash: '#C6C2BB',
  rose: '#F79BA4', roseHover: '#F28893', roseDeep: '#A85A68', roseSoft: '#FCEDEE',
  lilac: '#B7A3D8', lilacDeep: '#5B4A86', lilacSoft: '#F3EFFA',
  matchaDeep: '#4A6536', matchaSoft: '#EEF4E8',
  // The accent (labels, ticks, links) is the deep rose: readable on cream and white.
  accent: '#A85A68', accentDeep: '#8E4655', accentSoft: '#FCEDEE',
}
/** The serif for headlines and the wordmark. */
export const display = '"Fraunces", Georgia, serif'
/** Prices and big figures: the body sans, so numbers read at a glance. */
export const figures = { fontFamily: '"Figtree", system-ui, sans-serif', fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' } as const
export const CONTACT = { hello: 'hello@businesssagent.com', sales: ENTERPRISE.email, support: 'support@businesssagent.com' }

/** Soft glows of the three brand colours, for hero backgrounds; without the grey one along the bottom (`floor`), no edge shows where the next section starts. */
export const glow = (x = '80%', y = '-160px', floor = true) =>
  `radial-gradient(900px 460px at ${x} ${y}, rgba(247,155,164,0.20), transparent 70%), ` +
  'radial-gradient(760px 420px at -10% 10%, rgba(183,163,216,0.18), transparent 70%)' +
  (floor ? ', radial-gradient(700px 380px at 50% 110%, rgba(198,194,187,0.30), transparent 70%)' : '')

/** The Business Agent mark: the coffee-cup icon the site uses as its favicon. */
export function AgentMark({ size = 32 }: { size?: number }) {
  return (
    <Box component="img" src={iconUrl} alt="" width={size} height={size}
      sx={{ display: 'block', flexShrink: 0, borderRadius: `${Math.round(size * 0.3)}px`, bgcolor: '#fff',
        border: `1px solid ${BA.line}`, p: `${Math.max(2, Math.round(size * 0.1))}px` }} />
  )
}

/** "Business Agent", set in the serif, Agent in italic. */
export function Wordmark({ size = '1.6rem', light }: { size?: string; light?: boolean }) {
  return (
    <Typography component="span" sx={{ fontFamily: display, fontWeight: 500, fontSize: size, letterSpacing: '-0.01em', lineHeight: 1,
      color: light ? '#fff' : BA.ink, whiteSpace: 'nowrap' }}>
      {'Business '}<Box component="em" sx={{ fontStyle: 'italic', color: light ? BA.rose : BA.roseDeep }}>{'Agent'}</Box>
    </Typography>
  )
}

/** Small spaced capitals above a headline. */
export function Eyebrow({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <Typography sx={{ color: light ? BA.rose : BA.roseDeep, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: '0.72rem' }}>
      {children}
    </Typography>
  )
}

const pill = { fontWeight: 500, textTransform: 'none', borderRadius: '999px', boxShadow: 'none', letterSpacing: '0.005em' } as const
export const primaryBtn = {
  ...pill, bgcolor: BA.ink, color: BA.bg, '&:hover': { bgcolor: '#433A35', boxShadow: 'none' },
} as const
export const roseBtn = {
  ...pill, bgcolor: BA.rose, color: BA.ink, '&:hover': { bgcolor: BA.roseHover, boxShadow: 'none' },
} as const
export const outlineBtn = {
  ...pill, borderColor: BA.limewash, color: BA.ink, bgcolor: 'transparent',
  '&:hover': { borderColor: BA.ink, bgcolor: 'rgba(43,37,34,0.03)' },
} as const

/** The light, warm page every public marketing page sits on (inputs styled to match). */
export function MarketingFrame({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: BA.bg, color: BA.ink, colorScheme: 'light', overflowX: 'hidden',
      '& .MuiOutlinedInput-root': { bgcolor: '#fff', color: BA.ink, borderRadius: '12px' },
      '& .MuiOutlinedInput-notchedOutline': { borderColor: BA.line },
      '& .Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: `${BA.ink} !important` },
      '& .MuiInputLabel-root': { color: BA.soft }, '& .MuiInputLabel-root.Mui-focused': { color: BA.ink },
      '& a': { WebkitTapHighlightColor: 'transparent' }, '& ::selection': { bgcolor: BA.roseSoft } }}>
      <SiteHeader />
      {children}
      <SiteFooter />
    </Box>
  )
}

/** The sticky header's height. */
export const HEADER_HEIGHT = 64

/**
 * A landing-page section that fills the screen under the header on a computer, its content centred,
 * so the next section doesn't peek in at the bottom and a menu link lands on the whole section.
 */
export const fullScreen = {
  minHeight: { md: `calc(100svh - ${HEADER_HEIGHT}px)` }, scrollMarginTop: HEADER_HEIGHT,
  display: { md: 'flex' }, flexDirection: 'column', justifyContent: 'center',
} as const

const navLink = { color: BA.soft, fontWeight: 500, fontSize: '0.93rem', textDecoration: 'none', '&:hover': { color: BA.ink } }

function SiteHeader() {
  const { pathname } = useLocation()
  return (
    <Box component="header" sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: 'rgba(251,248,244,0.84)', height: HEADER_HEIGHT,
      backdropFilter: 'saturate(160%) blur(14px)', borderBottom: `1px solid ${BA.lineSoft}` }}>
      <Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, md: 2, lg: 4 }, height: '100%' }}>
        <Stack component={RouterLink} to="/" direction="row" spacing={1.25} aria-label={t('Business Agent home')}
          sx={{ alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
          <AgentMark size={34} />
          <Wordmark size="1.55rem" />
        </Stack>
        <Stack component="nav" aria-label={t('Site')} direction="row" spacing={{ md: 2, lg: 3.5 }} sx={{ display: { xs: 'none', md: 'flex' }, flex: 1, justifyContent: 'center' }}>
          {/* The demo video, the landing page's first: played from the start there, like "View a demo"; from another page, opened at it. */}
          {shows({ onlyWith: 'demoVideo' }) && (
            <Link component={RouterLink} to="/#demo" onClick={e => { if (pathname === '/') watchDemo(e) }} sx={navLink}>{t('Demo')}</Link>
          )}
          <Link component={RouterLink} to="/#features" sx={navLink}>{t('Features')}</Link>
          <Link component={RouterLink} to="/pricing" sx={navLink}>{t('Pricing')}</Link>
          <Link component={RouterLink} to="/pricing#enterprise" sx={navLink}>{ENTERPRISE.name}</Link>
          <Link component={RouterLink} to="/#faq" sx={navLink}>{t('FAQ')}</Link>
        </Stack>
        <Box sx={{ flex: { xs: 1, md: 0 } }} />
        {/* No room on a phone: the flags are in the footer there. */}
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}><LanguageToggle always /></Box>
        <Link component={RouterLink} to="/#account" sx={{ ...navLink, display: { xs: 'none', sm: 'inline' }, whiteSpace: 'nowrap' }}>{t('Log in')}</Link>
        <Button component={RouterLink} to="/#start" variant="contained" sx={{ ...primaryBtn, whiteSpace: 'nowrap', px: 2.25 }}>{t('Start free trial')}</Button>
      </Container>
    </Box>
  )
}

function SiteFooter() {
  const col = (title: string, links: [string, string][]) => (
    <Stack spacing={1.25}>
      <Typography sx={{ fontWeight: 600, fontSize: '0.78rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: BA.faint }}>{title}</Typography>
      {links.map(([label, to]) => (
        to.startsWith('mailto:')
          ? <Link key={label} href={to} sx={{ ...navLink, fontSize: '0.92rem', fontWeight: 400 }}>{label}</Link>
          : <Link key={label} component={RouterLink} to={to} sx={{ ...navLink, fontSize: '0.92rem', fontWeight: 400 }}>{label}</Link>
      ))}
    </Stack>
  )
  return (
    <Box component="footer" sx={{ borderTop: `1px solid ${BA.line}`, bgcolor: BA.tint }}>
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 8 }, display: 'grid', gap: 5, gridTemplateColumns: { xs: '1fr 1fr', md: '2fr 1fr 1fr 1fr 1fr' } }}>
        <Stack spacing={2} sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            <AgentMark size={30} />
            <Wordmark size="1.45rem" />
          </Stack>
          <Typography variant="body2" sx={{ color: BA.soft, maxWidth: 300, lineHeight: 1.7 }}>
            {t('The team app for cafés, shops and small businesses. Made in Marbella, data stored in the EU.')}
          </Typography>
          <Box><LanguageToggle always /></Box>
        </Stack>
        {col(t('Product'), [[t('Demos'), '/demos'], [t('Features'), '/#features'], [t('Pricing'), '/pricing'], [ENTERPRISE.name, '/pricing#enterprise']])}
        {col(t('Account'), [[t('Log in'), '/#account'], [t('Start free trial'), '/#start']])}
        {col(t('Contact'), [[CONTACT.hello, `mailto:${CONTACT.hello}`], [CONTACT.sales, `mailto:${CONTACT.sales}`], [CONTACT.support, `mailto:${CONTACT.support}`]])}
        {col(t('Legal'), [[t('Privacy policy'), '/privacy'], [t('Terms of service'), '/terms']])}
      </Container>
      <Container maxWidth="lg" sx={{ py: 2.5, borderTop: `1px solid ${BA.line}` }}>
        <Typography variant="caption" sx={{ color: BA.faint }}>{t('© {year} Business Agent. All rights reserved.', { year: new Date().getFullYear() })}</Typography>
      </Container>
    </Box>
  )
}

/** A centred section intro: small label, headline, one line of support. */
export function SectionIntro({ eyebrow, title, text, light, compact }: { eyebrow: string; title: ReactNode; text?: string; light?: boolean; compact?: boolean }) {
  return (
    <Box sx={{ textAlign: 'center', maxWidth: 680, mx: 'auto', mb: compact ? { xs: 4, md: 4 } : { xs: 5, md: 7 } }}>
      <Eyebrow light={light}>{eyebrow}</Eyebrow>
      <Typography component="h2" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '2.2rem', md: '3.1rem' }, lineHeight: 1.05, letterSpacing: '-0.015em', mt: 1.75,
        color: light ? '#fff' : BA.ink, '& em': { fontStyle: 'italic', color: light ? BA.rose : BA.roseDeep } }}>
        {title}
      </Typography>
      {text && <Typography sx={{ color: light ? 'rgba(255,255,255,0.72)' : BA.soft, fontSize: '1.08rem', mt: 2, lineHeight: 1.65 }}>{text}</Typography>}
    </Box>
  )
}
