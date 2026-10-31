import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Accordion, AccordionDetails, AccordionSummary, Box, Button, Container, Stack, Typography } from '@mui/material'
import RotaIcon from '@mui/icons-material/CalendarViewWeekOutlined'
import ClockIcon from '@mui/icons-material/AccessTimeOutlined'
import MapIcon from '@mui/icons-material/StorefrontOutlined'
import ChatIcon from '@mui/icons-material/ForumOutlined'
import TvIcon from '@mui/icons-material/LiveTvOutlined'
import LockIcon from '@mui/icons-material/VerifiedUserOutlined'
import SparkIcon from '@mui/icons-material/AutoAwesomeOutlined'
import EuroIcon from '@mui/icons-material/EuroOutlined'
import CampaignIcon from '@mui/icons-material/CampaignOutlined'
import ExpandIcon from '@mui/icons-material/ExpandMoreRounded'
import CheckIcon from '@mui/icons-material/CheckCircleRounded'
import GiftIcon from '@mui/icons-material/CardGiftcardOutlined'
import StockIcon from '@mui/icons-material/Inventory2Outlined'
import InsightsIcon from '@mui/icons-material/InsightsOutlined'
import AdviceIcon from '@mui/icons-material/LightbulbOutlined'
import WarnIcon from '@mui/icons-material/ErrorOutlineOutlined'
import { useEffect, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { cleanCode } from '../../shared/referrals'
import { keepReferral } from '../app/referral'
import { AuthCard } from './marketing/AuthCard'
import { DemoVideo } from './marketing/DemoVideo'
import { PricingCards, TRIAL_MONTHS } from './marketing/plans'
import { BA, MarketingFrame, SectionIntro, display, glow, outlineBtn, primaryBtn, roseBtn } from './marketing/site'
import { msg, t, tr } from '../i18n'

export { AgentMark } from './marketing/site'

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <RotaIcon />, title: msg('Rota in minutes'), text: msg('Drag shifts into place, share the week, and everyone sees their hours on their phone.') },
  { icon: <ClockIcon />, title: msg('Clock-ins and hours'), text: msg('Timecards, breaks and the monthly registro de jornada, ready for your gestoría.') },
  { icon: <MapIcon />, title: msg('Always up to date on Google'), text: msg('Opening hours, holidays and closures update your Google Maps listing by themselves.') },
  { icon: <ChatIcon />, title: msg('The team in the loop'), text: msg('Shift reminders and changes on WhatsApp, text or email: however each person prefers.') },
  { icon: <CampaignIcon />, title: msg('Social, planned'), text: msg('Write a post once and schedule it to Instagram, Facebook, TikTok, LinkedIn and Google.') },
  { icon: <EuroIcon />, title: msg('Takings vs. team cost'), text: msg('Connect Square, SumUp or Stripe and see sales next to what the rota costs, day by day.') },
  { icon: <TvIcon />, title: msg("What's on"), text: msg('Big matches, local fiestas and bank holidays, so you can plan staff and the TV.') },
  { icon: <SparkIcon />, title: msg('Ask your AI'), text: msg('“Who is working Saturday?” Run the business by talking to Claude or ChatGPT.') },
  { icon: <LockIcon />, title: msg('Private by design'), text: msg('Pay stays with the people who should see it. Your data is stored in the EU.') },
]

// Everything the app does, by area: the informative overview under the headline features.
const AREAS: { icon: ReactNode; title: string; items: string[] }[] = [
  { icon: <RotaIcon />, title: msg('Team'), items: [msg('Rota, open shifts and swaps'), msg('Clock-ins, breaks and timecards'), msg('Time off and staff benefits by Spanish law'),
    msg('Hiring, roles and house rules'), msg('Tips and the staff kitty')] },
  { icon: <EuroIcon />, title: msg('Sales and money'), items: [msg('Takings from Square, SumUp or Stripe'), msg('Profit & loss, month by month'), msg('Invoices from Gmail or Outlook'),
    msg('Tax returns and their deadlines'), msg('Expenses, mileage and grants for Andalucía')] },
  { icon: <StockIcon />, title: msg('Stock and menu'), items: [msg('Stock, suppliers and the order list'), msg('Menu costing and margins'), msg('The 14 allergens on every item'),
    msg('Waste log and food safety records')] },
  { icon: <CampaignIcon />, title: msg('Marketing'), items: [msg('Social planner for five networks'), msg('Email, text and WhatsApp campaigns'), msg('Google reviews and your website’s SEO'),
    msg('Competitors’ prices, hours and ratings'), msg('Loyalty, gift cards and sales reps')] },
  { icon: <InsightsIcon />, title: msg('Insights'), items: [msg('Dashboards you build yourself'), msg('Executive and shop manager templates'), msg('A business advisor that reads your figures'),
    msg('Exports to Excel, CSV and PDF')] },
  { icon: <SparkIcon />, title: msg('AI and connections'), items: [msg('Claude, ChatGPT and any MCP client'), msg('A REST API for n8n and Zapier'), msg('Google Drive, OneDrive and calendars'),
    msg('Spotify for the music in the café')] },
]

// Facts worth knowing before signing up.
const FACTS: { value: string; label: string }[] = [
  { value: msg('One price'), label: msg('for the whole team, not per person') },
  { value: msg('Spain-ready'), label: msg('registro de jornada, IVA, holidays and allergens') },
  { value: msg('EU'), label: msg('where your data is kept') },
  { value: msg('10 min'), label: msg('to set up, with your own brand') },
]

const STEPS = [
  { title: msg('Sign up in seconds'), text: msg('One tap with Google, Apple, Facebook or Microsoft, or use your email. No new password to remember.') },
  { title: msg('Set up your business'), text: msg('Add your name, logo and opening hours. Connect the apps you already use, or skip for now.') },
  { title: msg('Invite your team'), text: msg('Everyone gets the app on their phone, in your brand. Your first rota can go out today.') },
]

// Answers may use {months} (the free trial's length); filled in where they're shown.
const FAQ: { q: string; a: string }[] = [
  { q: msg('How does the free trial work?'), a: msg('The Business plan, with everything switched on, is free for {months} months. You add a card to start and nothing is charged until the trial ends; cancel before then and you pay nothing. If the first payment doesn\'t go through, you move to the Free plan until it does.') },
  { q: msg('Do my staff need to pay or download anything?'), a: msg('No. Your team is included in your plan. They open the app in their phone\'s browser and add it to their home screen: no app store needed.') },
  { q: msg('Do I need yet another password?'), a: msg('No. Log in with your Google, Apple, Facebook or Microsoft account in one tap. If you prefer, use your email and a password.') },
  { q: msg('Does it follow the Spanish working-time rules?'), a: msg('Yes. Clock-ins, breaks and the monthly registro de jornada follow the rules for Spain, and you can share them with your gestoría as read-only.') },
  { q: msg('Can I change plan or cancel?'), a: msg('Any time. Plans are month to month (or yearly if you prefer), with no contract and no set-up fee.') },
  { q: msg('Where is my data kept?'), a: msg('In the EU, protected so each person only sees what they should. Pay and personal details stay with the people who need them.') },
]

/** Scroll to #features, #faq, #account or #start, and open "Create account" for #start. */
function useHashTarget(setTab: (t: 'signin' | 'signup') => void) {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    if (hash === '#start') setTab('signup')
    if (hash === '#account') setTab('signin')
    const id = hash === '#start' ? 'account' : hash.slice(1)
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [hash, setTab])
}

/** Signed out: the Business Agent landing page, with sign-in and registration in the hero. */
export function LoginPage() {
  const [tab, setTab] = useState<'signin' | 'signup'>('signin')
  useHashTarget(setTab)
  return (
    <MarketingFrame>
      <Box component="main">
        {/* Hero */}
        <Box sx={{ position: 'relative', backgroundImage: glow() }}>
          <Container maxWidth="lg" sx={{ pt: { xs: 4, md: 9 }, pb: { xs: 7, md: 11 }, display: 'grid', gap: { xs: 5, md: 8 },
            gridTemplateColumns: { xs: '1fr', md: '1.15fr 0.85fr' }, alignItems: 'center' }}>
            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', display: 'inline-flex', px: 1.5, py: 0.6, borderRadius: 99,
                bgcolor: '#fff', border: `1px solid ${BA.line}`, fontSize: '0.85rem', color: BA.soft }}>
                <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#6B8E4E' }} />
                <span>{t('Free plan · {n} months of Business free', { n: TRIAL_MONTHS })}</span>
              </Stack>
              <Typography component="h1" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '3rem', sm: '3.8rem', md: '4.7rem' },
                lineHeight: 0.98, letterSpacing: '-0.02em', mt: 3, maxWidth: 660 }}>
                {tr("The assistant that runs your business's {em}", { em: <Box component="em" sx={{ fontStyle: 'italic', color: BA.roseDeep, whiteSpace: 'nowrap' }}>{t('day\u2011to\u2011day.')}</Box> })}
              </Typography>
              <Typography sx={{ color: BA.soft, fontSize: { xs: '1.08rem', md: '1.2rem' }, mt: 3, maxWidth: 540, lineHeight: 1.6 }}>
                {t('Rota, clock-ins, time off, opening hours and team messages in one calm app, in your own brand. Built for cafés, shops and small teams.')}
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 4 }}>
                <Button component={RouterLink} to="/#start" size="large" variant="contained" sx={{ ...primaryBtn, px: 3.5, py: 1.45 }}>
                  {t('Start your free trial')}
                </Button>
                <Button component={RouterLink} to="/pricing" size="large" variant="outlined" sx={{ ...outlineBtn, px: 3.5, py: 1.45 }}>
                  {t('See pricing')}
                </Button>
              </Stack>
              <Stack direction="row" spacing={{ xs: 2, sm: 3 }} sx={{ mt: 3.5, color: BA.soft, fontSize: '0.9rem', flexWrap: 'wrap', rowGap: 1 }}>
                {[t('Free plan, no card'), t('Set up in 10 minutes'), t('Cancel any time')].map(x => (
                  <Stack key={x} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                    <CheckIcon sx={{ fontSize: 17, color: BA.accent }} /><span>{x}</span>
                  </Stack>
                ))}
              </Stack>
            </Box>
            <Box id="account" sx={{ scrollMarginTop: 88 }}>
              <Invite onSignUp={() => setTab('signup')} />
              <AuthCard tab={tab} onTab={setTab} />
            </Box>
          </Container>
        </Box>

        {/* The demo video */}
        <DemoVideo />

        {/* Product preview */}
        <Container maxWidth="lg" sx={{ pb: { xs: 8, md: 12 } }}>
          <ProductPreview />
        </Container>

        {/* Features */}
        <Box id="features" sx={{ scrollMarginTop: 72, bgcolor: '#fff', borderTop: `1px solid ${BA.line}`, borderBottom: `1px solid ${BA.line}` }}>
          <Container maxWidth="lg" sx={{ py: { xs: 9, md: 13 } }}>
            <SectionIntro eyebrow={t('Features')} title={t("Everything the day needs, nothing it doesn't")}
              text={t('One place for the rota, the hours and the jobs that eat your evenings. Each part works on its own, and better together.')} />
            <Box sx={{ display: 'grid', gap: { xs: 4, md: 6 }, columnGap: 5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' } }}>
              {FEATURES.map(f => (
                <Box key={f.title}>
                  <Box sx={{ width: 42, height: 42, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: BA.tint, color: BA.ink, mb: 2 }}>{f.icon}</Box>
                  <Typography component="h3" sx={{ fontWeight: 600, fontSize: '1.05rem' }}>{t(f.title)}</Typography>
                  <Typography sx={{ color: BA.soft, mt: 0.75, lineHeight: 1.6 }}>{t(f.text)}</Typography>
                </Box>
              ))}
            </Box>
          </Container>
        </Box>

        {/* Know your numbers: dashboards and the business advisor */}
        <Container maxWidth="lg" sx={{ py: { xs: 9, md: 13 } }}>
          <Box sx={{ display: 'grid', gap: { xs: 5, md: 8 }, gridTemplateColumns: { xs: '1fr', md: '0.9fr 1.1fr' }, alignItems: 'center' }}>
            <Box>
              <Typography sx={{ color: BA.roseDeep, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: '0.72rem' }}>{t('Insights')}</Typography>
              <Typography component="h2" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '2.2rem', md: '3rem' }, lineHeight: 1.05, letterSpacing: '-0.015em', mt: 1.75 }}>
                {tr('Know your numbers, {em}', { em: <Box component="em" sx={{ fontStyle: 'italic', color: BA.roseDeep }}>{t('and what to do next.')}</Box> })}
              </Typography>
              <Typography sx={{ color: BA.soft, fontSize: '1.08rem', mt: 2, lineHeight: 1.65 }}>
                {t('Build your own dashboards from takings, team costs, stock and reviews, or start from the Executive and Shop manager templates. The business advisor reads the same figures and says what to try: opening an hour later, a price below your margin, a quiet day that needs a reason to come in.')}
              </Typography>
              <Stack spacing={1.25} sx={{ mt: 3 }}>
                {[t('Takings against the period before, by day and by hour'), t('Team cost against takings, and who works the peaks'), t('Best and slow sellers, margins and the area’s prices')].map(x => (
                  <Stack key={x} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <CheckIcon sx={{ fontSize: 18, color: BA.accent }} /><Typography>{x}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
            <InsightsPreview />
          </Box>
        </Container>

        {/* Everything, by area */}
        <Box id="everything" sx={{ scrollMarginTop: 72, bgcolor: '#fff', borderTop: `1px solid ${BA.line}`, borderBottom: `1px solid ${BA.line}` }}>
          <Container maxWidth="lg" sx={{ py: { xs: 9, md: 13 } }}>
            <SectionIntro eyebrow={t('Everything in one place')} title={t('One app instead of ten')}
              text={t('What a café, shop or small team runs on, each part ready to switch on when you need it.')} />
            <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' } }}>
              {AREAS.map(a => (
                <Box key={a.title} component="section" aria-label={t(a.title)} sx={{ p: 3, borderRadius: '20px', border: `1px solid ${BA.line}`, bgcolor: BA.bg }}>
                  <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 1.5 }}>
                    <Box sx={{ width: 38, height: 38, borderRadius: '11px', display: 'grid', placeItems: 'center', bgcolor: '#fff', border: `1px solid ${BA.line}` }}>{a.icon}</Box>
                    <Typography component="h3" sx={{ fontWeight: 600, fontSize: '1.08rem' }}>{t(a.title)}</Typography>
                  </Stack>
                  <Box component="ul" sx={{ m: 0, pl: 2.25, color: BA.soft, '& li': { mb: 0.5, lineHeight: 1.55 } }}>
                    {a.items.map(i => <li key={i}>{t(i)}</li>)}
                  </Box>
                </Box>
              ))}
            </Box>
            <Box sx={{ mt: { xs: 5, md: 7 }, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
              {FACTS.map(f => (
                <Box key={f.value} sx={{ textAlign: 'center', p: 2 }}>
                  <Typography sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '1.6rem', md: '2rem' }, color: BA.ink }}>{t(f.value)}</Typography>
                  <Typography variant="body2" sx={{ color: BA.soft, mt: 0.5 }}>{t(f.label)}</Typography>
                </Box>
              ))}
            </Box>
          </Container>
        </Box>

        {/* How it works */}
        <Container maxWidth="lg" sx={{ py: { xs: 9, md: 13 } }}>
          <SectionIntro eyebrow={t('How it works')} title={t('Up and running before your next shift')} />
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
            {STEPS.map((s, i) => (
              <Box key={s.title} sx={{ p: 3.5, borderRadius: '20px', border: `1px solid ${BA.line}`, bgcolor: '#fff' }}>
                <Typography sx={{ fontFamily: display, fontStyle: 'italic', color: BA.roseDeep, fontSize: '2.2rem', lineHeight: 1 }}>0{i + 1}</Typography>
                <Typography component="h3" sx={{ fontWeight: 600, fontSize: '1.1rem', mt: 1.5 }}>{t(s.title)}</Typography>
                <Typography sx={{ color: BA.soft, mt: 1, lineHeight: 1.6 }}>{t(s.text)}</Typography>
              </Box>
            ))}
          </Box>
        </Container>

        {/* Pricing */}
        <Box sx={{ bgcolor: '#fff', borderTop: `1px solid ${BA.line}`, borderBottom: `1px solid ${BA.line}` }}>
          <Container maxWidth="lg" sx={{ py: { xs: 9, md: 13 } }}>
            <SectionIntro eyebrow={t('Pricing')} title={tr('Simple plans. {em}', { em: <em>{t('{n} months on us.', { n: TRIAL_MONTHS })}</em> })}
              text={t('One price for the whole team, not per person. Start on Free, or try Business free for 2 months.')} />
            <PricingCards />
            <Box sx={{ textAlign: 'center', mt: 3 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'center' }}>
                <Button component={RouterLink} to="/pricing" sx={{ color: BA.ink, textTransform: 'none', fontWeight: 500 }}>{t('Every plan side by side →')}</Button>
                <Button component={RouterLink} to="/compare" sx={{ color: BA.ink, textTransform: 'none', fontWeight: 500 }}>{t('Compare with Square and GoHighLevel →')}</Button>
              </Stack>
            </Box>
          </Container>
        </Box>

        {/* FAQ */}
        <Container id="faq" maxWidth="md" sx={{ py: { xs: 9, md: 13 }, scrollMarginTop: 72 }}>
          <SectionIntro eyebrow={t('FAQ')} title={t('Questions, answered')} />
          <Faq items={FAQ.map(f => ({ q: t(f.q), a: t(f.a, { months: TRIAL_MONTHS }) }))} />
        </Container>

        <ClosingCta />
      </Box>
    </MarketingFrame>
  )
}

/**
 * Arrived from another business's referral link (/?ref=CODE): who invited you, and on to creating an
 * account. The code is kept until the new business is created (NewBusinessPage), which makes it that
 * business's referral. The link is counted once per visit. A wrong code shows nothing.
 */
function Invite({ onSignUp }: { onSignUp: () => void }) {
  const { api } = useApp()
  const [code] = useState(() => cleanCode(new URLSearchParams(location.search).get('ref')))
  const [by, setBy] = useState<string | null>(null)
  useEffect(() => {
    if (!code) return
    let seen = false
    try { seen = sessionStorage.getItem(`ref-${code}`) === '1'; sessionStorage.setItem(`ref-${code}`, '1') } catch { /* private mode: count it */ }
    void api.openReferral(code, !seen).then(r => { setBy(r.business); keepReferral(code) }, () => {})
  }, [api, code])
  if (!code || !by) return null
  return (
    <Box component="section" aria-label={t('You’re invited')} sx={{ mb: 2.5, p: { xs: 2.5, sm: 3.5 }, borderRadius: '24px', bgcolor: BA.card,
      border: `1px solid ${BA.rose}`, boxShadow: '0 24px 60px -30px rgba(168,90,104,0.45)' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: BA.accent, mb: 1 }}>
        <GiftIcon fontSize="small" />
        <Typography sx={{ fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.75rem' }}>{t('Invited by {name}', { name: by })}</Typography>
      </Stack>
      <Typography variant="h5" component="h2" sx={{ fontFamily: display, fontWeight: 500, fontSize: '2rem' }}>{t('Get your first month free')}</Typography>
      <Typography sx={{ color: BA.soft, mt: 1, mb: 2 }}>
        {t('Create your account, then your business: once it’s set up, you and {name} each get a month free.', { name: by })}
      </Typography>
      <Button variant="contained" size="large" onClick={onSignUp} sx={primaryBtn}>{t('Create my account')}</Button>
    </Box>
  )
}

/** Questions as quiet accordions with hairline dividers. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <Box sx={{ borderTop: `1px solid ${BA.line}` }}>
      {items.map(f => (
        <Accordion key={f.q} disableGutters elevation={0} square
          sx={{ bgcolor: 'transparent', color: BA.ink, borderBottom: `1px solid ${BA.line}`, '&::before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandIcon sx={{ color: BA.soft }} />} sx={{ px: 0, py: 1 }}>
            <Typography sx={{ fontWeight: 500, fontSize: '1.05rem' }}>{f.q}</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 0, pt: 0, pb: 3 }}>
            <Typography sx={{ color: BA.soft, lineHeight: 1.7 }}>{f.a}</Typography>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  )
}

/** The dark band at the bottom of the public pages. */
export function ClosingCta() {
  return (
    <Container maxWidth="lg" sx={{ pb: { xs: 8, md: 12 } }}>
      <Box sx={{ borderRadius: '32px', bgcolor: BA.ink, color: '#fff', px: { xs: 3, md: 8 }, py: { xs: 7, md: 10 }, textAlign: 'center',
        backgroundImage: 'radial-gradient(700px 300px at 50% -80px, rgba(247,155,164,0.32), transparent 70%), radial-gradient(500px 260px at 100% 120%, rgba(183,163,216,0.25), transparent 70%)' }}>
        <Typography component="h2" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '2.5rem', md: '3.6rem' }, letterSpacing: '-0.015em', lineHeight: 1.02 }}>
          {tr('Give your {em} back.', { em: <Box component="em" sx={{ color: BA.rose }}>{t('evenings')}</Box> })}
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.72)', mt: 2, fontSize: '1.1rem', maxWidth: 520, mx: 'auto' }}>
          {t('Start on the Free plan, or try Business free for {n} months. No contract, no set-up fee.', { n: TRIAL_MONTHS })}
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 4, justifyContent: 'center' }}>
          <Button component={RouterLink} to="/#start" size="large" variant="contained"
            sx={{ ...roseBtn, px: 3.5, py: 1.4 }}>{t('Start your free trial')}</Button>
          <Button component={RouterLink} to="/pricing" size="large" variant="outlined"
            sx={{ ...outlineBtn, bgcolor: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.28)', px: 3.5, py: 1.4,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.5)' } }}>{t('See pricing')}</Button>
        </Stack>
      </Box>
    </Container>
  )
}

/** A drawn dashboard and three of the advisor's findings, illustrative like the rota preview. */
function InsightsPreview() {
  const bars = [52, 61, 47, 58, 74, 100, 88]
  const days = [t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat'), t('Sun')]
  return (
    <Box aria-hidden sx={{ borderRadius: '24px', border: `1px solid ${BA.line}`, bgcolor: '#fff', p: { xs: 2, md: 3 }, boxShadow: '0 50px 100px -50px rgba(43,37,34,0.38)' }}>
      <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {[[t('Takings'), '€4,860', '+8%'], [t('Average sale'), '€6.40', '+3%'], [t('Team cost'), '29%', t('of takings')]].map(([label, value, note]) => (
          <Box key={label} sx={{ p: 1.5, borderRadius: '14px', border: `1px solid ${BA.lineSoft}`, bgcolor: BA.bg }}>
            <Typography variant="caption" sx={{ color: BA.faint }}>{label}</Typography>
            <Typography sx={{ fontWeight: 600, fontSize: '1.25rem', fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
            <Typography variant="caption" sx={{ color: BA.matchaDeep, fontWeight: 600 }}>{note}</Typography>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 2, p: 1.5, borderRadius: '14px', border: `1px solid ${BA.lineSoft}` }}>
        <Typography variant="caption" sx={{ color: BA.faint }}>{t('Takings by day of the week')}</Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end', height: 96, mt: 1 }}>
          {bars.map((h, i) => (
            <Stack key={i} spacing={0.5} sx={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
              <Box sx={{ width: '100%', height: `${h}%`, borderRadius: '6px 6px 0 0', bgcolor: i === 2 ? BA.lilac : BA.rose }} />
              <Typography variant="caption" sx={{ color: BA.faint, fontSize: '0.68rem' }}>{days[i]}</Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
      <Stack spacing={1} sx={{ mt: 2 }}>
        {[
          [<WarnIcon key="w" sx={{ color: BA.roseDeep }} />, t('Opening an hour later could pay'), t('The first hour on weekdays takes 18% of a usual hour.')],
          [<WarnIcon key="w2" sx={{ color: BA.roseDeep }} />, t('A best seller makes too little'), t('Flat white: 58% margin, you aim for 70%. At €3.60 it gets there.')],
          [<AdviceIcon key="a" sx={{ color: BA.lilacDeep }} />, t('When the takings come in'), t('Half the day’s takings come between 11:00 and 14:00.')],
        ].map(([icon, title, text], i) => (
          <Stack key={i} direction="row" spacing={1.25} sx={{ p: 1.5, borderRadius: '14px', bgcolor: BA.bg, border: `1px solid ${BA.lineSoft}` }}>
            {icon}
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: '0.92rem' }}>{title}</Typography>
              <Typography variant="caption" sx={{ color: BA.soft }}>{text}</Typography>
            </Box>
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}

const SHIFTS: { who: string; role: string; days: (string | null)[]; tone: string }[] = [
  { who: 'Lucía', role: msg('Barista'), days: ['7–15', '7–15', null, '7–15', '7–15'], tone: '#EFE9F8' },
  { who: 'Marco', role: msg('Kitchen'), days: [null, '10–18', '10–18', '10–18', '12–20'], tone: '#FCEBDD' },
  { who: 'Sara', role: msg('Floor'), days: ['15–23', null, '15–23', '15–23', '16–24'], tone: '#E2F2EA' },
  { who: 'Diego', role: msg('Floor'), days: ['9–17', '9–17', '9–17', null, null], tone: '#FCEDEE' },
]

/** A drawn, illustrative week rota, so visitors see the product without a screenshot to keep current. */
function ProductPreview() {
  const days = [t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri')]
  return (
    <Box aria-hidden sx={{ borderRadius: '24px', border: `1px solid ${BA.line}`, bgcolor: '#fff', overflow: 'hidden',
      boxShadow: '0 50px 100px -50px rgba(43,37,34,0.38)' }}>
      <Stack direction="row" spacing={0.75} sx={{ px: 2.5, py: 1.75, borderBottom: `1px solid ${BA.lineSoft}`, bgcolor: BA.bg }}>
        {['#F0B1A8', '#F2D59A', '#B5DDB8'].map(c => <Box key={c} sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: c }} />)}
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 300px' } }}>
        <Box sx={{ p: { xs: 2, md: 3.5 }, overflowX: 'auto' }}>
          <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 2.5 }}>
            <Typography sx={{ fontFamily: display, fontWeight: 500, fontSize: '1.7rem', lineHeight: 1 }}>{t('This week')}</Typography>
            <Typography variant="body2" sx={{ color: BA.faint }}>{t('142 h · €1,986')}</Typography>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: '110px repeat(5, minmax(64px, 1fr))', gap: 1, minWidth: 480, fontSize: '0.85rem' }}>
            <span />
            {days.map(d => <Typography key={d} variant="caption" sx={{ color: BA.faint, fontWeight: 500 }}>{d}</Typography>)}
            {SHIFTS.map(s => [
              <Box key={s.who} sx={{ py: 0.5 }}>
                <Typography sx={{ fontWeight: 500, fontSize: '0.9rem' }}>{s.who}</Typography>
                <Typography variant="caption" sx={{ color: BA.faint }}>{t(s.role)}</Typography>
              </Box>,
              ...s.days.map((d, i) => (
                <Box key={s.who + i} sx={{ borderRadius: '10px', bgcolor: d ? s.tone : 'transparent', border: d ? 0 : `1px dashed ${BA.line}`,
                  display: 'grid', placeItems: 'center', fontWeight: 500, color: BA.ink, minHeight: 44 }}>{d ?? ''}</Box>
              )),
            ])}
          </Box>
        </Box>
        <Stack spacing={1.5} sx={{ p: { xs: 2, md: 3 }, borderLeft: { md: `1px solid ${BA.lineSoft}` }, bgcolor: BA.bg }}>
          <Typography variant="caption" sx={{ color: BA.faint, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t('Today')}</Typography>
          {[
            [t('Lucía clocked in'), t('06:58 · on time')],
            [t('Google Maps updated'), t('Open late Friday, 08:00–01:00')],
            [t('Shift swap approved'), t('Sara ↔ Diego, Thursday')],
            [t('Big match on Saturday'), 'Real Madrid – Barcelona, 21:00'],
          ].map(([title, s]) => (
            <Box key={title} sx={{ p: 1.75, borderRadius: '14px', bgcolor: '#fff', border: `1px solid ${BA.lineSoft}` }}>
              <Typography sx={{ fontWeight: 500, fontSize: '0.92rem' }}>{title}</Typography>
              <Typography variant="caption" sx={{ color: BA.soft }}>{s}</Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  )
}
