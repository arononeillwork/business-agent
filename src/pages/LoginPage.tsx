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
import { useEffect, useState, type ReactNode } from 'react'
import { AuthCard } from './marketing/AuthCard'
import { PricingCards, TRIAL_MONTHS } from './marketing/plans'
import { BA, MarketingFrame, SectionIntro, display, outlineBtn, primaryBtn } from './marketing/site'

export { AgentMark } from './marketing/site'

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <RotaIcon />, title: 'Rota in minutes', text: 'Drag shifts into place, share the week, and everyone sees their hours on their phone.' },
  { icon: <ClockIcon />, title: 'Clock-ins and hours', text: 'Timecards, breaks and the monthly registro de jornada, ready for your gestoría.' },
  { icon: <MapIcon />, title: 'Always up to date on Google', text: 'Opening hours, holidays and closures update your Google Maps listing by themselves.' },
  { icon: <ChatIcon />, title: 'The team in the loop', text: 'Shift reminders and changes on WhatsApp, text or email: however each person prefers.' },
  { icon: <CampaignIcon />, title: 'Social, planned', text: 'Write a post once and schedule it to Instagram, Facebook, TikTok and Google.' },
  { icon: <EuroIcon />, title: 'Takings vs. team cost', text: 'Connect Stripe or Square and see sales next to what the rota costs, day by day.' },
  { icon: <TvIcon />, title: "What's on", text: 'Big matches, local fiestas and bank holidays, so you can plan staff and the TV.' },
  { icon: <SparkIcon />, title: 'Ask your AI', text: '“Who is working Saturday?” Run the business by talking to Claude or ChatGPT.' },
  { icon: <LockIcon />, title: 'Private by design', text: 'Pay stays with the people who should see it. Your data is stored in the EU.' },
]

const STEPS = [
  { title: 'Sign up in seconds', text: 'One tap with Google, Apple, Facebook or Microsoft, or use your email. No new password to remember.' },
  { title: 'Set up your business', text: 'Add your name, logo and opening hours. Connect the apps you already use, or skip for now.' },
  { title: 'Invite your team', text: 'Everyone gets the app on their phone, in your brand. Your first rota can go out today.' },
]

const FAQ: { q: string; a: string }[] = [
  { q: 'How does the free trial work?', a: `The Business plan, with everything switched on, is free for ${TRIAL_MONTHS} months. You add a card to start and nothing is charged until the trial ends; cancel before then and you pay nothing. If the first payment doesn't go through, you move to the Free plan until it does.` },
  { q: 'Do my staff need to pay or download anything?', a: 'No. Your team is included in your plan. They open the app in their phone\'s browser and add it to their home screen: no app store needed.' },
  { q: 'Do I need yet another password?', a: 'No. Log in with your Google, Apple, Facebook or Microsoft account in one tap. If you prefer email, use a password or a one-time code we send you.' },
  { q: 'Does it follow the Spanish working-time rules?', a: 'Yes. Clock-ins, breaks and the monthly registro de jornada follow the rules for Spain, and you can share them with your gestoría as read-only.' },
  { q: 'Can I change plan or cancel?', a: 'Any time. Plans are month to month (or yearly if you prefer), with no contract and no set-up fee.' },
  { q: 'Where is my data kept?', a: 'In the EU, protected so each person only sees what they should. Pay and personal details stay with the people who need them.' },
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
        <Box sx={{ position: 'relative', backgroundImage: `radial-gradient(1000px 480px at 80% -160px, rgba(63,60,187,0.10), transparent 70%), radial-gradient(800px 420px at -10% 10%, rgba(214,180,140,0.16), transparent 70%)` }}>
          <Container maxWidth="lg" sx={{ pt: { xs: 4, md: 9 }, pb: { xs: 7, md: 11 }, display: 'grid', gap: { xs: 5, md: 8 },
            gridTemplateColumns: { xs: '1fr', md: '1.15fr 0.85fr' }, alignItems: 'center' }}>
            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', display: 'inline-flex', px: 1.5, py: 0.6, borderRadius: 99,
                bgcolor: '#fff', border: `1px solid ${BA.line}`, fontSize: '0.85rem', color: BA.soft }}>
                <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#22A06B' }} />
                <span>Free plan · {TRIAL_MONTHS} months of Business free</span>
              </Stack>
              <Typography component="h1" sx={{ fontFamily: display, fontWeight: 600, fontSize: { xs: '2.4rem', sm: '3rem', md: '3.6rem' },
                lineHeight: 1.04, letterSpacing: '-0.04em', mt: 3, maxWidth: 640 }}>
                The assistant that runs your business's day-to-day.
              </Typography>
              <Typography sx={{ color: BA.soft, fontSize: { xs: '1.08rem', md: '1.2rem' }, mt: 3, maxWidth: 540, lineHeight: 1.6 }}>
                Rota, clock-ins, time off, opening hours and team messages in one calm app, in your own brand.
                Built for cafés, shops and small teams.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 4 }}>
                <Button component={RouterLink} to="/#start" size="large" variant="contained" sx={{ ...primaryBtn, px: 3, py: 1.4 }}>
                  Start your free trial
                </Button>
                <Button component={RouterLink} to="/pricing" size="large" variant="outlined" sx={{ ...outlineBtn, px: 3, py: 1.4 }}>
                  See pricing
                </Button>
              </Stack>
              <Stack direction="row" spacing={{ xs: 2, sm: 3 }} sx={{ mt: 3.5, color: BA.soft, fontSize: '0.9rem', flexWrap: 'wrap', rowGap: 1 }}>
                {['Free plan, no card', 'Set up in 10 minutes', 'Cancel any time'].map(t => (
                  <Stack key={t} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                    <CheckIcon sx={{ fontSize: 17, color: BA.accent }} /><span>{t}</span>
                  </Stack>
                ))}
              </Stack>
            </Box>
            <Box id="account" sx={{ scrollMarginTop: 88 }}>
              <AuthCard tab={tab} onTab={setTab} />
            </Box>
          </Container>
        </Box>

        {/* Product preview */}
        <Container maxWidth="lg" sx={{ pb: { xs: 8, md: 12 } }}>
          <ProductPreview />
        </Container>

        {/* Features */}
        <Box id="features" sx={{ scrollMarginTop: 72, bgcolor: '#fff', borderTop: `1px solid ${BA.line}`, borderBottom: `1px solid ${BA.line}` }}>
          <Container maxWidth="lg" sx={{ py: { xs: 9, md: 13 } }}>
            <SectionIntro eyebrow="Features" title="Everything the day needs, nothing it doesn't"
              text="One place for the rota, the hours and the jobs that eat your evenings. Each part works on its own, and better together." />
            <Box sx={{ display: 'grid', gap: { xs: 4, md: 6 }, columnGap: 5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' } }}>
              {FEATURES.map(f => (
                <Box key={f.title}>
                  <Box sx={{ width: 42, height: 42, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: BA.tint, color: BA.ink, mb: 2 }}>{f.icon}</Box>
                  <Typography component="h3" sx={{ fontWeight: 600, fontSize: '1.05rem' }}>{f.title}</Typography>
                  <Typography sx={{ color: BA.soft, mt: 0.75, lineHeight: 1.6 }}>{f.text}</Typography>
                </Box>
              ))}
            </Box>
          </Container>
        </Box>

        {/* How it works */}
        <Container maxWidth="lg" sx={{ py: { xs: 9, md: 13 } }}>
          <SectionIntro eyebrow="How it works" title="Up and running before your next shift" />
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
            {STEPS.map((s, i) => (
              <Box key={s.title} sx={{ p: 3.5, borderRadius: '20px', border: `1px solid ${BA.line}`, bgcolor: '#fff' }}>
                <Typography sx={{ fontFamily: display, fontWeight: 600, color: BA.accent, fontSize: '0.9rem' }}>0{i + 1}</Typography>
                <Typography component="h3" sx={{ fontWeight: 600, fontSize: '1.1rem', mt: 1.5 }}>{s.title}</Typography>
                <Typography sx={{ color: BA.soft, mt: 1, lineHeight: 1.6 }}>{s.text}</Typography>
              </Box>
            ))}
          </Box>
        </Container>

        {/* Pricing */}
        <Box sx={{ bgcolor: '#fff', borderTop: `1px solid ${BA.line}`, borderBottom: `1px solid ${BA.line}` }}>
          <Container maxWidth="lg" sx={{ py: { xs: 9, md: 13 } }}>
            <SectionIntro eyebrow="Pricing" title={`Simple plans. ${TRIAL_MONTHS} months on us.`}
              text="One price for the whole team, not per person. Start on Free, or try Business free for 2 months." />
            <PricingCards />
            <Box sx={{ textAlign: 'center', mt: 3 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'center' }}>
                <Button component={RouterLink} to="/pricing" sx={{ color: BA.ink, textTransform: 'none', fontWeight: 500 }}>Compare plans line by line →</Button>
                <Button component={RouterLink} to="/compare" sx={{ color: BA.ink, textTransform: 'none', fontWeight: 500 }}>Compare with Square and GoHighLevel →</Button>
              </Stack>
            </Box>
          </Container>
        </Box>

        {/* FAQ */}
        <Container id="faq" maxWidth="md" sx={{ py: { xs: 9, md: 13 }, scrollMarginTop: 72 }}>
          <SectionIntro eyebrow="FAQ" title="Questions, answered" />
          <Faq items={FAQ} />
        </Container>

        <ClosingCta />
      </Box>
    </MarketingFrame>
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
      <Box sx={{ borderRadius: '28px', bgcolor: BA.ink, color: '#fff', px: { xs: 3, md: 8 }, py: { xs: 6, md: 9 }, textAlign: 'center',
        backgroundImage: 'radial-gradient(700px 300px at 50% -80px, rgba(129,124,255,0.35), transparent 70%)' }}>
        <Typography component="h2" sx={{ fontFamily: display, fontWeight: 600, fontSize: { xs: '1.9rem', md: '2.6rem' }, letterSpacing: '-0.03em', lineHeight: 1.12 }}>
          Give your evenings back.
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.72)', mt: 2, fontSize: '1.1rem', maxWidth: 520, mx: 'auto' }}>
          Start on the Free plan, or try Business free for {TRIAL_MONTHS} months. No contract, no set-up fee.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 4, justifyContent: 'center' }}>
          <Button component={RouterLink} to="/#start" size="large" variant="contained"
            sx={{ ...primaryBtn, bgcolor: '#fff', color: BA.ink, px: 3.5, py: 1.4, '&:hover': { bgcolor: '#ECEAE6' } }}>Start your free trial</Button>
          <Button component={RouterLink} to="/pricing" size="large" variant="outlined"
            sx={{ ...outlineBtn, bgcolor: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.28)', px: 3.5, py: 1.4,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.5)' } }}>See pricing</Button>
        </Stack>
      </Box>
    </Container>
  )
}

const SHIFTS: { who: string; role: string; days: (string | null)[]; tone: string }[] = [
  { who: 'Lucía', role: 'Barista', days: ['7–15', '7–15', null, '7–15', '7–15'], tone: '#E9E7FB' },
  { who: 'Marco', role: 'Kitchen', days: [null, '10–18', '10–18', '10–18', '12–20'], tone: '#FCEBDD' },
  { who: 'Sara', role: 'Floor', days: ['15–23', null, '15–23', '15–23', '16–24'], tone: '#E2F2EA' },
  { who: 'Diego', role: 'Floor', days: ['9–17', '9–17', '9–17', null, null], tone: '#E5EEF8' },
]

/** A drawn, illustrative week rota, so visitors see the product without a screenshot to keep current. */
function ProductPreview() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  return (
    <Box aria-hidden sx={{ borderRadius: '24px', border: `1px solid ${BA.line}`, bgcolor: '#fff', overflow: 'hidden',
      boxShadow: '0 50px 100px -50px rgba(17,19,24,0.35)' }}>
      <Stack direction="row" spacing={0.75} sx={{ px: 2.5, py: 1.75, borderBottom: `1px solid ${BA.lineSoft}`, bgcolor: BA.bg }}>
        {['#F0B1A8', '#F2D59A', '#B5DDB8'].map(c => <Box key={c} sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: c }} />)}
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 300px' } }}>
        <Box sx={{ p: { xs: 2, md: 3.5 }, overflowX: 'auto' }}>
          <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 2.5 }}>
            <Typography sx={{ fontFamily: display, fontWeight: 600, fontSize: '1.2rem' }}>This week</Typography>
            <Typography variant="body2" sx={{ color: BA.faint }}>142 h · €1,986</Typography>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: '110px repeat(5, minmax(64px, 1fr))', gap: 1, minWidth: 480, fontSize: '0.85rem' }}>
            <span />
            {days.map(d => <Typography key={d} variant="caption" sx={{ color: BA.faint, fontWeight: 500 }}>{d}</Typography>)}
            {SHIFTS.map(s => [
              <Box key={s.who} sx={{ py: 0.5 }}>
                <Typography sx={{ fontWeight: 500, fontSize: '0.9rem' }}>{s.who}</Typography>
                <Typography variant="caption" sx={{ color: BA.faint }}>{s.role}</Typography>
              </Box>,
              ...s.days.map((d, i) => (
                <Box key={s.who + i} sx={{ borderRadius: '10px', bgcolor: d ? s.tone : 'transparent', border: d ? 0 : `1px dashed ${BA.line}`,
                  display: 'grid', placeItems: 'center', fontWeight: 500, color: BA.ink, minHeight: 44 }}>{d ?? ''}</Box>
              )),
            ])}
          </Box>
        </Box>
        <Stack spacing={1.5} sx={{ p: { xs: 2, md: 3 }, borderLeft: { md: `1px solid ${BA.lineSoft}` }, bgcolor: BA.bg }}>
          <Typography variant="caption" sx={{ color: BA.faint, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Today</Typography>
          {[
            ['Lucía clocked in', '06:58 · on time'],
            ['Google Maps updated', 'Open late Friday, 08:00–01:00'],
            ['Shift swap approved', 'Sara ↔ Diego, Thursday'],
            ['Big match on Saturday', 'Real Madrid – Barcelona, 21:00'],
          ].map(([t, s]) => (
            <Box key={t} sx={{ p: 1.75, borderRadius: '14px', bgcolor: '#fff', border: `1px solid ${BA.lineSoft}` }}>
              <Typography sx={{ fontWeight: 500, fontSize: '0.92rem' }}>{t}</Typography>
              <Typography variant="caption" sx={{ color: BA.soft }}>{s}</Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  )
}
