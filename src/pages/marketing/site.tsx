import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Container, Link, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import iconUrl from '../../assets/icon.png'

// Business Agent: the product. Signed-out visitors see its own look (not any one business's
// brand); once someone signs in, they see their business's branded app.
export const BA = {
  ink: '#111318', soft: '#4A505E', faint: '#878D9B', line: '#E7E5E1', lineSoft: '#F0EEEA',
  bg: '#FBFAF8', card: '#FFFFFF', tint: '#F4F2EE',
  accent: '#3F3CBB', accentDeep: '#2E2B94', accentSoft: '#EEEDFB',
}
export const display = '"Poppins", system-ui, sans-serif'

/** The Business Agent mark: the coffee-cup icon the site uses as its favicon. */
export function AgentMark({ size = 32 }: { size?: number }) {
  return (
    <Box component="img" src={iconUrl} alt="" width={size} height={size}
      sx={{ display: 'block', flexShrink: 0, borderRadius: `${Math.round(size * 0.28)}px`, bgcolor: '#fff',
        border: `1px solid ${BA.line}`, p: `${Math.max(2, Math.round(size * 0.1))}px` }} />
  )
}

export const primaryBtn = {
  bgcolor: BA.ink, color: '#fff', fontWeight: 500, textTransform: 'none', borderRadius: '10px', boxShadow: 'none',
  '&:hover': { bgcolor: '#2A2D35', boxShadow: 'none' },
} as const
export const outlineBtn = {
  borderColor: BA.line, color: BA.ink, bgcolor: '#fff', fontWeight: 500, textTransform: 'none', borderRadius: '10px',
  '&:hover': { borderColor: '#C9C6C0', bgcolor: BA.tint },
} as const

/** The light, warm page every public marketing page sits on (inputs styled to match). */
export function MarketingFrame({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: BA.bg, color: BA.ink, colorScheme: 'light', overflowX: 'hidden',
      '& .MuiOutlinedInput-root': { bgcolor: '#fff', color: BA.ink, borderRadius: '10px' },
      '& .MuiOutlinedInput-notchedOutline': { borderColor: BA.line },
      '& .Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: `${BA.ink} !important` },
      '& .MuiInputLabel-root': { color: BA.soft }, '& .MuiInputLabel-root.Mui-focused': { color: BA.ink },
      '& a': { WebkitTapHighlightColor: 'transparent' } }}>
      <SiteHeader />
      {children}
      <SiteFooter />
    </Box>
  )
}

const navLink = { color: BA.soft, fontWeight: 500, fontSize: '0.95rem', textDecoration: 'none', '&:hover': { color: BA.ink } }

function SiteHeader() {
  return (
    <Box component="header" sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: 'rgba(251,250,248,0.82)',
      backdropFilter: 'saturate(180%) blur(12px)', borderBottom: `1px solid ${BA.lineSoft}` }}>
      <Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, md: 4 }, py: 1.5 }}>
        <Stack component={RouterLink} to="/" direction="row" spacing={1.25} aria-label="Business Agent home"
          sx={{ alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
          <AgentMark size={34} />
          <Typography sx={{ fontFamily: display, fontWeight: 600, fontSize: '1.08rem', letterSpacing: '-0.015em' }}>Business Agent</Typography>
        </Stack>
        <Stack component="nav" aria-label="Site" direction="row" spacing={3.5} sx={{ display: { xs: 'none', md: 'flex' }, flex: 1 }}>
          <Link component={RouterLink} to="/#features" sx={navLink}>Features</Link>
          <Link component={RouterLink} to="/pricing" sx={navLink}>Pricing</Link>
          <Link component={RouterLink} to="/#faq" sx={navLink}>FAQ</Link>
        </Stack>
        <Box sx={{ flex: { xs: 1, md: 0 } }} />
        <Link component={RouterLink} to="/#account" sx={{ ...navLink, display: { xs: 'none', sm: 'inline' }, whiteSpace: 'nowrap' }}>Log in</Link>
        <Button component={RouterLink} to="/#start" variant="contained" sx={{ ...primaryBtn, whiteSpace: 'nowrap', px: 2 }}>Start free trial</Button>
      </Container>
    </Box>
  )
}

function SiteFooter() {
  const col = (title: string, links: [string, string][]) => (
    <Stack spacing={1.25}>
      <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{title}</Typography>
      {links.map(([label, to]) => (
        <Link key={label} component={RouterLink} to={to} sx={{ ...navLink, fontSize: '0.9rem', fontWeight: 400 }}>{label}</Link>
      ))}
    </Stack>
  )
  return (
    <Box component="footer" sx={{ borderTop: `1px solid ${BA.line}`, bgcolor: '#fff' }}>
      <Container maxWidth="lg" sx={{ py: 6, display: 'grid', gap: 5, gridTemplateColumns: { xs: '1fr 1fr', md: '2fr 1fr 1fr 1fr' } }}>
        <Stack spacing={1.5} sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            <AgentMark size={28} />
            <Typography sx={{ fontFamily: display, fontWeight: 600 }}>Business Agent</Typography>
          </Stack>
          <Typography variant="body2" sx={{ color: BA.soft, maxWidth: 300 }}>
            The team app for cafés, shops and small businesses. Made in Marbella, data stored in the EU.
          </Typography>
        </Stack>
        {col('Product', [['Features', '/#features'], ['Pricing', '/pricing'], ['FAQ', '/#faq']])}
        {col('Account', [['Log in', '/#account'], ['Start free trial', '/#start']])}
        {col('Legal', [['Privacy policy', '/privacy'], ['Terms of service', '/terms']])}
      </Container>
      <Container maxWidth="lg" sx={{ py: 2.5, borderTop: `1px solid ${BA.lineSoft}` }}>
        <Typography variant="caption" sx={{ color: BA.faint }}>© {new Date().getFullYear()} Business Agent. All rights reserved.</Typography>
      </Container>
    </Box>
  )
}

/** A centred section intro: small label, headline, one line of support. */
export function SectionIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <Box sx={{ textAlign: 'center', maxWidth: 640, mx: 'auto', mb: { xs: 5, md: 7 } }}>
      <Typography sx={{ color: BA.accent, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.75rem' }}>{eyebrow}</Typography>
      <Typography component="h2" sx={{ fontFamily: display, fontWeight: 600, fontSize: { xs: '1.85rem', md: '2.5rem' }, lineHeight: 1.12, letterSpacing: '-0.03em', mt: 1.5 }}>
        {title}
      </Typography>
      {text && <Typography sx={{ color: BA.soft, fontSize: '1.08rem', mt: 2, lineHeight: 1.6 }}>{text}</Typography>}
    </Box>
  )
}
