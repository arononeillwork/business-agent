import { Box, Button, Container, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import CheckIcon from '@mui/icons-material/CheckRounded'
import { useEffect } from 'react'
import { ClosingCta, Faq } from './LoginPage'
import { PricingCards } from './marketing/plans'
import { BA, MarketingFrame, SectionIntro, display, outlineBtn } from './marketing/site'
import { COMPARE, PLANS, TRIAL_MONTHS, TRIAL_PLAN } from '../../shared/plans'
import { COMPETITORS, euro, savings } from '../../shared/competitors'

const PRICING_FAQ = [
  { q: 'How does the free trial work?', a: `The ${TRIAL_PLAN.name} plan is free for ${TRIAL_MONTHS} months, with everything switched on. You add a card when you start; nothing is charged until the trial ends, and you can cancel before then in two clicks.` },
  { q: 'What if the payment doesn\'t go through?', a: 'Your business moves to the Free plan until it does: paid features pause, and nothing is deleted. Update your card on the Billing page and everything comes back straight away.' },
  { q: 'Is the price per person?', a: 'No. Each plan is one price for the whole team, up to the number of people it includes.' },
  { q: 'What is the custom MCP connection?', a: 'It lets your own AI (Claude, ChatGPT, Cursor, n8n and others) read and run your business through Business Agent: "who is working Saturday?", "move Maria to the late shift". It is on every plan, including Free.' },
  { q: 'Do prices include VAT?', a: 'Prices are shown without VAT. Spanish VAT (IVA) is added on your invoice where it applies.' },
  { q: 'Can I switch plans later?', a: 'Yes, up or down whenever you like. Moving up is prorated; plans are month to month, or yearly with two months free.' },
]

function Cell({ v, strong }: { v: boolean | string; strong?: boolean }) {
  return (
    <TableCell align="center" sx={{ borderColor: BA.lineSoft, bgcolor: strong ? 'rgba(63,60,187,0.035)' : undefined }}>
      {typeof v === 'string' ? <Typography sx={{ fontWeight: 500, fontSize: '0.95rem' }}>{v}</Typography>
        : v ? <CheckIcon aria-label="Included" sx={{ fontSize: 20, color: BA.accent, verticalAlign: 'middle' }} />
        : <Box component="span" aria-label="Not included" sx={{ color: '#C9C6C0' }}>—</Box>}
    </TableCell>
  )
}

/** Public: the four plans, the free trial, and every feature line by line. */
export function PricingPage() {
  useEffect(() => {
    const before = document.title
    document.title = 'Pricing · Business Agent'
    return () => { document.title = before }
  }, [])
  const square = savings(COMPETITORS[0], TRIAL_PLAN.monthly)
  const ghl = savings(COMPETITORS[1], TRIAL_PLAN.monthly)
  return (
    <MarketingFrame>
      <Box component="main">
        <Box sx={{ backgroundImage: 'radial-gradient(1000px 420px at 50% -180px, rgba(63,60,187,0.10), transparent 70%)' }}>
          <Container maxWidth="lg" sx={{ pt: { xs: 5, md: 8 }, pb: { xs: 8, md: 11 } }}>
            <Stack sx={{ alignItems: 'center', mb: 4 }}>
              <Button component={RouterLink} to="/compare" variant="outlined" sx={{ ...outlineBtn, borderRadius: 99, px: 2.25 }}>
                Compare with Square and GoHighLevel: save up to {euro(ghl.month)} a month →
              </Button>
            </Stack>
            <Box sx={{ textAlign: 'center', maxWidth: 720, mx: 'auto', mb: { xs: 5, md: 7 } }}>
              <Typography sx={{ color: BA.accent, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '0.75rem' }}>Pricing</Typography>
              <Typography component="h1" sx={{ fontFamily: display, fontWeight: 600, fontSize: { xs: '2.3rem', md: '3.4rem' }, lineHeight: 1.06, letterSpacing: '-0.04em', mt: 1.5 }}>
                Start free. Grow into it.
              </Typography>
              <Typography sx={{ color: BA.soft, fontSize: { xs: '1.08rem', md: '1.2rem' }, mt: 2.5, lineHeight: 1.6 }}>
                A free plan for the basics, and {TRIAL_MONTHS} months of {TRIAL_PLAN.name}, our top plan, on us. One price for the whole team.
              </Typography>
            </Box>
            <PricingCards />
          </Container>
        </Box>

        <Box sx={{ bgcolor: '#fff', borderTop: `1px solid ${BA.line}`, borderBottom: `1px solid ${BA.line}` }}>
          <Container maxWidth="lg" sx={{ py: { xs: 9, md: 12 } }}>
            <SectionIntro eyebrow="Compare plans" title="Every feature, line by line" text="The custom MCP connection for your AI is on every plan." />
            <Box sx={{ overflowX: 'auto', border: `1px solid ${BA.line}`, borderRadius: '18px' }}>
              <Table sx={{ minWidth: 720, '& td, & th': { color: BA.ink } }} aria-label="Plan comparison">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ borderColor: BA.line, width: '36%' }} />
                    {PLANS.map(p => (
                      <TableCell key={p.id} align="center" sx={{ borderColor: BA.line, bgcolor: p.trial ? 'rgba(63,60,187,0.035)' : undefined }}>
                        <Typography sx={{ fontFamily: display, fontWeight: 600, fontSize: '1.05rem' }}>{p.name}</Typography>
                        <Typography variant="body2" sx={{ color: BA.soft }}>{p.monthly ? `€${p.monthly} / month` : 'Free'}</Typography>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {COMPARE.flatMap(g => [
                    <TableRow key={g.group}>
                      <TableCell colSpan={PLANS.length + 1} sx={{ bgcolor: BA.bg, borderColor: BA.line, fontWeight: 600, fontSize: '0.8rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: `${BA.soft} !important`, py: 1.25 }}>
                        {g.group}
                      </TableCell>
                    </TableRow>,
                    ...g.rows.map(r => (
                      <TableRow key={r.label}>
                        <TableCell sx={{ borderColor: BA.lineSoft }}>
                          {r.label}
                          {r.note && <Typography variant="caption" component="div" sx={{ color: BA.faint }}>{r.note}</Typography>}
                        </TableCell>
                        {PLANS.map(p => <Cell key={p.id} v={r.values[p.id]} strong={p.trial} />)}
                      </TableRow>
                    )),
                  ])}
                </TableBody>
              </Table>
            </Box>
          </Container>
        </Box>

        <Container maxWidth="lg" sx={{ py: { xs: 9, md: 12 } }}>
          <SectionIntro eyebrow="Compare" title={`${TRIAL_PLAN.name} vs buying the add-ons`} text="What a café with 10 staff pays each month for the same jobs elsewhere, excluding VAT." />
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            {[{ c: COMPETITORS[0], s: square }, { c: COMPETITORS[1], s: ghl }].map(({ c, s }) => (
              <Box key={c.id} sx={{ p: 3.5, borderRadius: '20px', bgcolor: '#fff', border: `1px solid ${BA.line}` }}>
                <Typography component="h3" sx={{ fontFamily: display, fontWeight: 600, fontSize: '1.2rem' }}>vs {c.name}</Typography>
                <Stack spacing={0.75} sx={{ mt: 2, fontVariantNumeric: 'tabular-nums' }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between' }}><span>{c.tagline}</span><b>{euro(s.theirs)}</b></Stack>
                  <Stack direction="row" sx={{ justifyContent: 'space-between' }}><span>Business Agent {TRIAL_PLAN.name}</span><b>{euro(s.ours)}</b></Stack>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', borderTop: `1px solid ${BA.line}`, pt: 1, color: '#15803D' }}>
                    <b>You save</b><b>{euro(s.month)}/mo · {euro(s.year)}/yr</b>
                  </Stack>
                </Stack>
                <Button component={RouterLink} to={`/compare${c.id === 'gohighlevel' ? '?vs=gohighlevel' : ''}`} sx={{ mt: 2, px: 0, color: BA.ink, textTransform: 'none', fontWeight: 500 }}>
                  See it line by line →
                </Button>
              </Box>
            ))}
          </Box>
        </Container>

        <Container maxWidth="md" sx={{ pb: { xs: 9, md: 12 } }}>
          <SectionIntro eyebrow="FAQ" title="Pricing questions" />
          <Faq items={PRICING_FAQ} />
        </Container>

        <ClosingCta />
      </Box>
    </MarketingFrame>
  )
}
