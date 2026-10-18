import { Box, Container, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/CheckRounded'
import { useEffect } from 'react'
import { ClosingCta, Faq } from './LoginPage'
import { PLANS, PricingCards, TRIAL_MONTHS } from './marketing/plans'
import { BA, MarketingFrame, SectionIntro, display } from './marketing/site'

type Row = [feature: string, starter: boolean | string, team: boolean | string, business: boolean | string]
const COMPARE: { group: string; rows: Row[] }[] = [
  { group: 'Team', rows: [
    ['People included', '5', '15', '40'],
    ['Rota with drag and drop', true, true, true],
    ['Clock-ins, breaks and timecards', true, true, true],
    ['Time off and holiday allowance', true, true, true],
    ['Registro de jornada (monthly record)', true, true, true],
    ['Clock-in tablet with staff PINs', false, false, true],
  ] },
  { group: 'Messages', rows: [
    ['Shift reminders by email', true, true, true],
    ['WhatsApp and text reminders', false, true, true],
  ] },
  { group: 'Your business online', rows: [
    ['Opening hours synced to Google Maps', false, true, true],
    ['Social planner (Instagram, Facebook, TikTok, Google)', false, true, true],
    ["What's on: matches, fiestas, bank holidays", false, true, true],
  ] },
  { group: 'Money and admin', rows: [
    ['Takings from Stripe or Square', false, true, true],
    ['Payroll exports to Google Drive or OneDrive', false, false, true],
    ['Read-only access for your gestoría and partners', false, false, true],
  ] },
  { group: 'AI and integrations', rows: [
    ['Run it from Claude or ChatGPT', false, true, true],
    ['API and personal access keys', false, false, true],
  ] },
  { group: 'Support', rows: [
    ['Help by email', true, true, true],
    ['Priority support', false, false, true],
  ] },
]

const PRICING_FAQ = [
  { q: 'What happens when my free trial ends?', a: `Nothing is charged automatically. Before your ${TRIAL_MONTHS} free months are up we'll remind you, and you choose the plan that fits, or leave with your data.` },
  { q: 'Is the price per person?', a: 'No. Each plan is one price for the whole team, up to the number of people it includes. Need more people? Move up a plan.' },
  { q: 'Do I need a card to start?', a: 'No. Start with just your name and email, or one tap with Google, Apple, Facebook or Microsoft.' },
  { q: 'Do prices include VAT?', a: 'Prices are shown without VAT. Spanish VAT (IVA) is added on your invoice where it applies.' },
  { q: 'Can I switch plans later?', a: 'Yes, up or down whenever you like. Plans are month to month, or yearly with two months free.' },
]

function Cell({ v, strong }: { v: boolean | string; strong?: boolean }) {
  return (
    <TableCell align="center" sx={{ borderColor: BA.lineSoft, bgcolor: strong ? 'rgba(63,60,187,0.03)' : undefined }}>
      {typeof v === 'string' ? <Typography sx={{ fontWeight: 500, fontSize: '0.95rem' }}>{v}</Typography>
        : v ? <CheckIcon aria-label="Included" sx={{ fontSize: 20, color: BA.accent, verticalAlign: 'middle' }} />
        : <Box component="span" aria-label="Not included" sx={{ color: BA.line }}>—</Box>}
    </TableCell>
  )
}

/** Public: plans, the free trial, and a feature-by-feature comparison. */
export function PricingPage() {
  useEffect(() => {
    const before = document.title
    document.title = 'Pricing · Business Agent'
    return () => { document.title = before }
  }, [])
  return (
    <MarketingFrame>
      <Box component="main">
        <Box sx={{ backgroundImage: 'radial-gradient(1000px 420px at 50% -180px, rgba(63,60,187,0.10), transparent 70%)' }}>
          <Container maxWidth="lg" sx={{ pt: { xs: 6, md: 10 }, pb: { xs: 8, md: 11 } }}>
            <Box sx={{ textAlign: 'center', maxWidth: 720, mx: 'auto', mb: { xs: 5, md: 7 } }}>
              <Typography sx={{ color: BA.accent, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.75rem' }}>Pricing</Typography>
              <Typography component="h1" sx={{ fontFamily: display, fontWeight: 600, fontSize: { xs: '2.3rem', md: '3.4rem' }, lineHeight: 1.06, letterSpacing: '-0.04em', mt: 1.5 }}>
                Start free. Pay only when it's working for you.
              </Typography>
              <Typography sx={{ color: BA.soft, fontSize: { xs: '1.08rem', md: '1.2rem' }, mt: 2.5, lineHeight: 1.6 }}>
                Every plan comes with {TRIAL_MONTHS} months free and every feature switched on. No card needed, cancel any time.
              </Typography>
            </Box>
            <PricingCards />
          </Container>
        </Box>

        <Box sx={{ bgcolor: '#fff', borderTop: `1px solid ${BA.line}`, borderBottom: `1px solid ${BA.line}` }}>
          <Container maxWidth="lg" sx={{ py: { xs: 9, md: 12 } }}>
            <SectionIntro eyebrow="Compare" title="Every plan, side by side" />
            <Box sx={{ overflowX: 'auto', border: `1px solid ${BA.line}`, borderRadius: '18px' }}>
              <Table sx={{ minWidth: 640, '& td, & th': { color: BA.ink } }} aria-label="Plan comparison">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ borderColor: BA.line, width: '40%' }} />
                    {PLANS.map(p => (
                      <TableCell key={p.name} align="center" sx={{ borderColor: BA.line, bgcolor: p.popular ? 'rgba(63,60,187,0.03)' : undefined }}>
                        <Typography sx={{ fontFamily: display, fontWeight: 600, fontSize: '1.05rem' }}>{p.name}</Typography>
                        <Typography variant="body2" sx={{ color: BA.soft }}>€{p.monthly} / month</Typography>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {COMPARE.flatMap(g => [
                    <TableRow key={g.group}>
                      <TableCell colSpan={4} sx={{ bgcolor: BA.bg, borderColor: BA.line, fontWeight: 600, fontSize: '0.8rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: `${BA.soft} !important`, py: 1.25 }}>
                        {g.group}
                      </TableCell>
                    </TableRow>,
                    ...g.rows.map(([feature, ...values]) => (
                      <TableRow key={feature}>
                        <TableCell sx={{ borderColor: BA.lineSoft }}>{feature}</TableCell>
                        {values.map((v, i) => <Cell key={i} v={v} strong={PLANS[i].popular} />)}
                      </TableRow>
                    )),
                  ])}
                </TableBody>
              </Table>
            </Box>
          </Container>
        </Box>

        <Container maxWidth="md" sx={{ py: { xs: 9, md: 12 } }}>
          <SectionIntro eyebrow="FAQ" title="Pricing questions" />
          <Faq items={PRICING_FAQ} />
        </Container>

        <ClosingCta />
      </Box>
    </MarketingFrame>
  )
}
