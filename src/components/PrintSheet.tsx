// A document on A4, to print or save as a PDF for the staff (no menu around it): a bar with Back and
// "Print or save as PDF" that doesn't print, then the paper. Used by a role (RolePrintPage) and the staff
// rules (StaffRulesPrintPage); the pieces below keep the two looking the same.
import { Box, Button, GlobalStyles, Stack, Typography } from '@mui/material'
import BackIcon from '@mui/icons-material/ArrowBackRounded'
import PrintIcon from '@mui/icons-material/PrintOutlined'
import { Link as RouterLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { fonts } from '../theme'
import { t } from '../i18n'

const INK = '#2B2522'
const SOFT = '#5F5852'
const FAINT = '#8E877F'
const LINE = '#DDD5CE'

/** The page: `title` names the paper (an article) and the bar; `back` is where Back goes. */
export function PrintSheet({ title, back, children }: { title: string; back: string; children: ReactNode }) {
  return (
    <Box sx={{ bgcolor: '#E9E4DE', minHeight: '100vh', '@media print': { bgcolor: '#fff', minHeight: 0 } }}>
      {/* The page's margin on paper, so a long document carries on to a second page with room at its top too. */}
      <GlobalStyles styles={{ '@page': { size: 'A4', margin: '14mm 0' } }} />
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: '#fff', borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap', '@media print': { display: 'none' } }}>
        <Button component={RouterLink} to={back} startIcon={<BackIcon />}>{t('Back')}</Button>
        <Typography sx={{ flex: 1, fontWeight: 500, minWidth: 120 }}>{title}</Typography>
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>{t('Print or save as PDF')}</Button>
      </Stack>
      <Box component="article" aria-label={title} sx={{ width: '210mm', minHeight: '297mm', maxWidth: '100%', mx: 'auto', my: 3, bgcolor: '#fff', color: INK,
        boxShadow: '0 12px 34px rgba(60,40,30,0.22)', px: '18mm', py: '16mm', boxSizing: 'border-box',
        '@media print': { my: 0, minHeight: 0, maxWidth: 'none', boxShadow: 'none', py: 0 } }}>
        {children}
      </Box>
    </Box>
  )
}

/** The business's name small above the document's title. */
export function PrintTitle({ business, children }: { business?: string; children: ReactNode }) {
  return (
    <>
      {business && <Typography sx={{ fontSize: '9pt', color: FAINT, letterSpacing: '0.08em', textTransform: 'uppercase', mb: '2mm' }}>{business}</Typography>}
      <Typography component="h1" sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: '26pt', lineHeight: 1.15, mb: '4mm' }}>{children}</Typography>
    </>
  )
}

/** A part of the document: its heading over a line, kept on one page where it fits. `intro`: a line under the heading. */
export function PrintSection({ heading, intro, children }: { heading: string; intro?: string | null; children: ReactNode }) {
  return (
    <Box sx={{ mb: '5mm', breakInside: 'avoid-page' }}>
      <Typography component="h2" sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: '14pt', pb: '1.5mm', mb: '2.5mm', borderBottom: `0.3mm solid ${LINE}` }}>
        {heading}
      </Typography>
      {intro && <Typography sx={{ fontSize: '10.5pt', color: SOFT, fontStyle: 'italic', whiteSpace: 'pre-line', mb: '2mm' }}>{intro}</Typography>}
      {children}
    </Box>
  )
}

/** A list of lines (duties, rules): bullets, or numbered with `numbered`. */
export function PrintList({ label, items, numbered }: { label: string; items: string[]; numbered?: boolean }) {
  return (
    <Box component={numbered ? 'ol' : 'ul'} aria-label={label} sx={{ m: 0, pl: numbered ? '6mm' : '5mm' }}>
      {items.map(text => (
        <Typography key={text} component="li" sx={{ fontSize: '11pt', lineHeight: 1.45, mb: '1.2mm', breakInside: 'avoid' }}>{text}</Typography>
      ))}
    </Box>
  )
}

/** A small label over a value (who's in a role, who it answers to). */
export function PrintFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography sx={{ fontSize: '8.5pt', color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</Typography>
      <Typography sx={{ fontSize: '11pt', fontWeight: 500 }}>{children}</Typography>
    </Box>
  )
}

/** Plain text in the document's own size: muted with `soft`. */
export function PrintText({ soft, children }: { soft?: boolean; children: ReactNode }) {
  return <Typography sx={{ fontSize: '11pt', whiteSpace: 'pre-line', color: soft ? SOFT : INK, mb: '5mm' }}>{children}</Typography>
}

/** The small line at the end (when it was last updated). */
export function PrintFootnote({ children }: { children: ReactNode }) {
  return <Typography sx={{ fontSize: '9pt', color: FAINT, mt: '8mm' }}>{children}</Typography>
}
