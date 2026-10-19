import { Box, Link, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { LEGAL } from '../../shared/legal'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'

// Building blocks for the public legal pages (/privacy and /terms): no sign-in needed, plain
// readable text, and the same header and footer on both.

export const H = ({ children }: { children: ReactNode }) => (
  <Typography variant="h5" component="h2" sx={{ mt: 5, mb: 1.5 }}>{children}</Typography>
)
export const P = ({ children }: { children: ReactNode }) => <Typography sx={{ mb: 1.5, lineHeight: 1.7 }}>{children}</Typography>
export const Ul = ({ items }: { items: ReactNode[] }) => (
  <Box component="ul" sx={{ pl: 3, mt: 0, mb: 2, '& li': { mb: 0.75, lineHeight: 1.7 } }}>
    {items.map((it, i) => <li key={i}>{it}</li>)}
  </Box>
)
export const Mail = ({ to }: { to: string }) => <Link href={`mailto:${to}`}>{to}</Link>

/** Who runs the service, as it should read in a sentence ("Business Agent, Calle …"). */
export const operatorLine = () => [LEGAL.operator || LEGAL.service, LEGAL.address].filter(Boolean).join(', ')

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box component="main" sx={{ maxWidth: 760, mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 4, sm: 6 } }}>
        <Link component={RouterLink} to="/" underline="hover" sx={{ fontSize: 14 }}>← {LEGAL.service}</Link>
        <Typography variant="h3" component="h1" sx={{ mt: 2 }}>{title}</Typography>
        <Typography sx={{ color: 'text.secondary', mt: 1 }}>Last updated {formatLocal(`${updated}T12:00:00Z`, 'd MMMM yyyy')}</Typography>
        {children}
        <Box component="footer" sx={{ mt: 6, pt: 2, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ color: tokens.inkFaint }}>© {LEGAL.service}</Typography>
          <Link component={RouterLink} to="/privacy" variant="caption" underline="hover">Privacy policy</Link>
          <Link component={RouterLink} to="/terms" variant="caption" underline="hover">Terms of service</Link>
        </Box>
      </Box>
    </Box>
  )
}
