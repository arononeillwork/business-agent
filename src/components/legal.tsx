import { Box, Link, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { LEGAL } from '../../shared/legal'
import { currentLanguage, msg, t, tr } from '../i18n'
import { formatLocal } from '../../shared/time'
import { tokens } from '../theme'

// Building blocks for the public legal pages (/privacy, /terms, /legal-notice, /dpa…): no sign-in
// needed, plain readable text, and the same header and footer on each.

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

/** Who runs the service, as it should read in a sentence ("The Business Agent, Calle …"). */
export const operatorLine = () => [LEGAL.operator || LEGAL.service, LEGAL.address].filter(Boolean).join(', ')

/**
 * Who processes data for us (our sub-processors): the privacy policy and the data processing agreement
 * both show this one list, so they always agree. `text` is English with {name} for the name.
 */
const PROCESSORS: { name: string; text: string }[] = [
  { name: 'Supabase', text: msg('{name}: database and sign-in, hosted in the European Union (Ireland).') },
  { name: 'Cloudflare', text: msg('{name}: hosting of the app and of photos for posts, our email addresses, and the check on the sign-up form.') },
  { name: 'Stripe', text: msg('{name}: payments for subscriptions, and their invoices. We never see full card numbers.') },
  { name: 'Anthropic', text: msg('{name}: the in-app assistant. A question, and what the assistant looks up in the app to answer it, is sent to Anthropic’s API, whose commercial terms don’t allow it to be used to train its models.') },
  { name: 'Higgsfield, ElevenLabs', text: msg('{name}: AI images for the menu and AI music for posts, only when the business makes one.') },
  { name: msg('Google, Microsoft, Meta, TikTok and Spotify'), text: msg('{name}: only when you connect them, to do what the connection is for.') },
]
export const Processors = () => <Ul items={PROCESSORS.map(p => tr(p.text, { name: <b>{t(p.name)}</b> }))} />

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box component="main" sx={{ maxWidth: 760, mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 4, sm: 6 } }}>
        <Link component={RouterLink} to="/" underline="hover" sx={{ fontSize: 14 }}>← {LEGAL.service}</Link>
        <Typography variant="h3" component="h1" sx={{ mt: 2 }}>{title}</Typography>
        <Typography sx={{ color: 'text.secondary', mt: 1 }}>
          {t('Last updated {date}', { date: formatLocal(`${updated}T12:00:00Z`, currentLanguage() === 'es' ? "d 'de' MMMM 'de' yyyy" : 'd MMMM yyyy') })}
        </Typography>
        {children}
        <Box component="footer" sx={{ mt: 6, pt: 2, borderTop: 1, borderColor: 'divider', display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="caption" sx={{ color: tokens.inkFaint }}>© {LEGAL.service}</Typography>
          <Link component={RouterLink} to="/privacy" variant="caption" underline="hover">{t('Privacy policy')}</Link>
          <Link component={RouterLink} to="/terms" variant="caption" underline="hover">{t('Terms of service')}</Link>
          <Link component={RouterLink} to="/legal-notice" variant="caption" underline="hover">{t('Legal notice')}</Link>
          <Link component={RouterLink} to="/dpa" variant="caption" underline="hover">{t('Data processing agreement')}</Link>
        </Box>
      </Box>
    </Box>
  )
}
