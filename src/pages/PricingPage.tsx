import { Box, Button, Container, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import CheckIcon from '@mui/icons-material/CheckRounded'
import { useEffect } from 'react'
import { locale, msg, t, tr, useLanguage } from '../i18n'
import { ClosingCta, Faq } from './LoginPage'
import { EnterprisePlan, PricingCards, planName } from './marketing/plans'
import { BA, Eyebrow, MarketingFrame, SectionIntro, display, glow, outlineBtn } from './marketing/site'
import { COMPARE, ENTERPRISE, PLANS, TRIAL_MONTHS, TRIAL_PLAN, plan } from '../../shared/plans'
import { COMPETITORS, euro as euroIn, savings } from '../../shared/competitors'

const euro = (n: number) => euroIn(n, locale())

// Answers may use {plan}, {months} and {email}; filled in where they're shown.
const PRICING_FAQ = [
  { q: msg('How does the free trial work?'), a: msg('The {plan} plan is free for {months} months, with everything switched on. You add a card when you start; nothing is charged until the trial ends, and you can cancel before then in two clicks.') },
  { q: msg('What if the payment doesn\'t go through?'), a: msg('Your business moves to the Free plan until it does: paid features pause, and nothing is deleted. Update your card on the Billing page and everything comes back straight away.') },
  { q: msg('Is the price per person?'), a: msg('No. Each plan is one price for the whole team, up to the number of people it includes.') },
  { q: msg('What is the custom MCP connection?'), a: msg('It lets your own AI (Claude, ChatGPT, Cursor, n8n and others) read and run your business through Business Agent: "who is working Saturday?", "move Maria to the late shift". It is on every plan, including Free.') },
  { q: msg('Do prices include VAT?'), a: msg('Prices are shown without VAT. Spanish VAT (IVA) is added on your invoice where it applies.') },
  { q: msg('Can I switch plans later?'), a: msg('Yes, up or down whenever you like. Moving up is prorated; plans are month to month, or yearly with two months free.') },
  { q: msg('We run several venues. What does Enterprise include?'), a: msg('Business Agent for every venue on one contract, set up and supported by our team: onboarding and data import, single sign-on, custom integrations, a named account manager and annual invoicing. Write to {email} and we’ll put together a plan for your group.') },
]

function Cell({ v, strong }: { v: boolean | string; strong?: boolean }) {
  return (
    <TableCell align="center" sx={{ borderColor: BA.lineSoft, bgcolor: strong ? 'rgba(247,155,164,0.07)' : undefined }}>
      {typeof v === 'string' ? <Typography sx={{ fontWeight: 500, fontSize: '0.92rem' }}>{t(v)}</Typography>
        : v ? <CheckIcon aria-label={t('Included')} sx={{ fontSize: 20, color: BA.roseDeep, verticalAlign: 'middle' }} />
        : <Box component="span" aria-label={t('Not included')} sx={{ color: BA.limewash }}>—</Box>}
    </TableCell>
  )
}

/** Public: the four plans, the free trial, and every feature line by line. */
export function PricingPage() {
  const { hash } = useLocation()
  const lang = useLanguage()
  // /pricing#enterprise (header and footer links): go to that section once it's on the page.
  useEffect(() => {
    if (hash) requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [hash])
  useEffect(() => {
    const before = document.title
    document.title = t('Pricing · Business Agent')
    return () => { document.title = before }
  }, [lang])
  // Each stack against the plan that does what it does.
  const compared = COMPETITORS.map(c => ({ c, p: plan(c.plan), s: savings(c, plan(c.plan).monthly) }))
  const most = Math.max(...compared.map(x => x.s.month))
  return (
    <MarketingFrame>
      <Box component="main">
        <Box sx={{ backgroundImage: glow('50%', '-200px') }}>
          <Container maxWidth="lg" sx={{ pt: { xs: 5, md: 8 }, pb: { xs: 8, md: 11 } }}>
            <Stack sx={{ alignItems: 'center', mb: 4 }}>
              <Button component={RouterLink} to="/compare" variant="outlined" sx={{ ...outlineBtn, borderRadius: 99, px: 2.25 }}>
                {t('Compare with Square and GoHighLevel: save up to {amount} a month →', { amount: euro(most) })}
              </Button>
            </Stack>
            <Box sx={{ textAlign: 'center', maxWidth: 720, mx: 'auto', mb: { xs: 5, md: 7 } }}>
              <Eyebrow>{t('Pricing')}</Eyebrow>
              <Typography component="h1" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '3rem', md: '4.6rem' }, lineHeight: 0.98, letterSpacing: '-0.02em', mt: 1.75 }}>
                {tr('Start free. {em}', { em: <Box component="em" sx={{ fontStyle: 'italic', color: BA.roseDeep }}>{t('Grow into it.')}</Box> })}
              </Typography>
              <Typography sx={{ color: BA.soft, fontSize: { xs: '1.08rem', md: '1.2rem' }, mt: 2.5, lineHeight: 1.6 }}>
                {t('A free plan for the basics, and {months} months of {plan}, our top plan, on us. One price for the whole team.', { months: TRIAL_MONTHS, plan: planName(TRIAL_PLAN) })}
              </Typography>
            </Box>
            <PricingCards />
          </Container>
        </Box>

        <Box sx={{ bgcolor: '#fff', borderTop: `1px solid ${BA.line}`, borderBottom: `1px solid ${BA.line}` }}>
          <Container maxWidth="lg" sx={{ py: { xs: 9, md: 12 } }}>
            <SectionIntro eyebrow={t('Compare plans')} title={tr('Every plan, {em}', { em: <em>{t('side by side')}</em> })} text={t('The custom MCP connection for your AI is on every plan.')} />
            <Box sx={{ overflowX: 'auto', border: `1px solid ${BA.line}`, borderRadius: '22px' }}>
              <Table size="small" sx={{ minWidth: 640, '& td, & th': { color: BA.ink, py: 1.1 } }} aria-label={t('Plan comparison')}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ borderColor: BA.line, width: '36%' }} />
                    {PLANS.map(p => (
                      <TableCell key={p.id} align="center" sx={{ borderColor: BA.line, bgcolor: p.trial ? 'rgba(247,155,164,0.07)' : undefined }}>
                        <Typography sx={{ fontWeight: 600, fontSize: '1.05rem' }}>{planName(p)}</Typography>
                        <Typography variant="body2" sx={{ color: BA.soft }}>{t('€{n} / month', { n: p.monthly })}</Typography>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {COMPARE.flatMap(g => [
                    <TableRow key={g.group}>
                      <TableCell colSpan={PLANS.length + 1} sx={{ bgcolor: BA.bg, borderColor: BA.line, fontWeight: 600, fontSize: '0.8rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: `${BA.soft} !important`, py: 1.25 }}>
                        {t(g.group)}
                      </TableCell>
                    </TableRow>,
                    ...g.rows.map(r => (
                      <TableRow key={r.label}>
                        <TableCell sx={{ borderColor: BA.lineSoft }}>{t(r.label)}</TableCell>
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
          <SectionIntro eyebrow={t('Compare')} title={tr('One app instead of {em}', { em: <em>{t('the add-ons')}</em> })} text={t('What a café with 10 staff pays each month for the same jobs elsewhere, excluding VAT.')} />
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            {compared.map(({ c, p, s }) => (
              <Box key={c.id} sx={{ p: 3.5, borderRadius: '24px', bgcolor: '#fff', border: `1px solid ${BA.line}` }}>
                <Typography component="h3" sx={{ fontFamily: display, fontWeight: 500, fontSize: '1.9rem', lineHeight: 1.1 }}>{t('{plan} vs {name}', { plan: planName(p), name: c.name })}</Typography>
                <Stack spacing={0.75} sx={{ mt: 2, fontVariantNumeric: 'tabular-nums' }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}><span>{t(c.tagline)}</span><b>{euro(s.theirs)}</b></Stack>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}><span>{t('Business Agent {plan}', { plan: planName(p) })}</span><b>{euro(s.ours)}</b></Stack>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', borderTop: `1px solid ${BA.line}`, pt: 1, color: BA.matchaDeep }}>
                    <b>{t('You save')}</b><b>{t('{month}/mo · {year}/yr', { month: euro(s.month), year: euro(s.year) })}</b>
                  </Stack>
                </Stack>
                <Button component={RouterLink} to={`/compare${c.id === 'gohighlevel' ? '?vs=gohighlevel' : ''}`} sx={{ mt: 2, px: 0, color: BA.ink, textTransform: 'none', fontWeight: 500 }}>
                  {t('See it line by line →')}
                </Button>
              </Box>
            ))}
          </Box>
        </Container>

        <Container maxWidth="md" sx={{ pb: { xs: 9, md: 12 } }}>
          <SectionIntro eyebrow={t('FAQ')} title={tr('Pricing {questions}', { questions: <em>{t('questions')}</em> })} />
          <Faq items={PRICING_FAQ.map(f => ({ q: t(f.q), a: t(f.a, { plan: planName(TRIAL_PLAN), months: TRIAL_MONTHS, email: ENTERPRISE.email }) }))} />
        </Container>

        <Container maxWidth="lg" sx={{ pb: { xs: 9, md: 12 } }}>
          <EnterprisePlan />
        </Container>

        <ClosingCta />
      </Box>
    </MarketingFrame>
  )
}
