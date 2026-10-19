import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/CheckRounded'
import MailIcon from '@mui/icons-material/MailOutlineRounded'
import { useState } from 'react'
import { ENTERPRISE, PLANS, TRIAL_MONTHS, planHighlights, type Interval, type Plan } from '../../../shared/plans'
import { BA, Eyebrow, display, figures, outlineBtn, primaryBtn, roseBtn } from './site'

export { TRIAL_MONTHS }

const euro = (n: number) => `€${Number.isInteger(n) ? n.toLocaleString('en-IE') : n.toFixed(2)}`
const perMonth = (p: Plan, interval: Interval) => (interval === 'month' ? p.monthly : Math.round(p.yearly / 12 * 100) / 100)
const contactSales = `mailto:${ENTERPRISE.email}?subject=${encodeURIComponent('Business Agent Enterprise')}&body=${encodeURIComponent(
  'Hello,\n\nWe’d like to talk about Business Agent Enterprise.\n\nBusiness:\nNumber of venues:\nPeople on the team (roughly):\nBest phone number:\n\nThank you')}`

/** The four plan cards with a monthly / yearly switch. */
export function PricingCards() {
  const [interval, setInterval] = useState<Interval>('month')
  return (
    <Box>
      <Stack sx={{ alignItems: 'center', mb: 4.5 }}>
        <ToggleButtonGroup exclusive value={interval} onChange={(_, v) => v && setInterval(v)} aria-label="Billing period"
          sx={{ bgcolor: BA.tint, p: 0.5, borderRadius: '999px', '& .MuiToggleButton-root': {
            border: 0, borderRadius: '999px !important', px: 2.5, py: 0.75, textTransform: 'none', fontWeight: 500, color: BA.soft,
            '&.Mui-selected': { bgcolor: '#fff', color: BA.ink, boxShadow: '0 1px 3px rgba(43,37,34,0.14)', '&:hover': { bgcolor: '#fff' } } } }}>
          <ToggleButton value="month">Monthly</ToggleButton>
          <ToggleButton value="year">Yearly <Box component="span" sx={{ ml: 1, color: BA.roseDeep, fontWeight: 600 }}>2 months free</Box></ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, alignItems: 'stretch' }}>
        {PLANS.map(p => {
          const dark = !!p.trial
          const price = perMonth(p, interval)
          const cta = p.monthly === 0 ? 'Start free' : p.trial ? `Try free for ${TRIAL_MONTHS} months` : `Choose ${p.name}`
          return (
            <Box key={p.id} component="article" aria-label={`${p.name} plan`}
              sx={{ position: 'relative', p: 3.25, borderRadius: '24px', bgcolor: dark ? BA.ink : BA.card, color: dark ? '#fff' : BA.ink,
                border: `1px solid ${dark ? BA.ink : p.popular ? BA.lilac : BA.line}`, display: 'flex', flexDirection: 'column',
                backgroundImage: dark ? 'radial-gradient(420px 220px at 100% 0%, rgba(247,155,164,0.22), transparent 70%)' : undefined,
                boxShadow: dark ? '0 34px 70px -34px rgba(43,37,34,0.6)' : p.popular ? '0 24px 50px -36px rgba(91,74,134,0.45)' : 'none' }}>
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', minHeight: 28 }}>
                <Typography component="h3" sx={{ fontWeight: 600, fontSize: '1.05rem', letterSpacing: '0.01em' }}>{p.name}</Typography>
                {p.trial && <Chip size="small" label={`${TRIAL_MONTHS} months free`} sx={{ bgcolor: 'rgba(247,155,164,0.18)', color: BA.rose, fontWeight: 500 }} />}
                {p.popular && <Chip size="small" label="Most popular" sx={{ bgcolor: BA.lilacSoft, color: BA.lilacDeep, fontWeight: 500 }} />}
              </Stack>
              <Typography sx={{ color: dark ? 'rgba(255,255,255,0.7)' : BA.soft, mt: 0.75, fontSize: '0.92rem', minHeight: 44 }}>{p.blurb}</Typography>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', mt: 2.25 }}>
                <Typography sx={{ ...figures, fontSize: '2.6rem', lineHeight: 1 }}>{euro(price)}</Typography>
                <Typography sx={{ color: dark ? 'rgba(255,255,255,0.7)' : BA.soft }}>/ month</Typography>
              </Stack>
              <Typography variant="body2" sx={{ color: dark ? 'rgba(255,255,255,0.58)' : BA.faint, mt: 0.75, minHeight: 20 }}>
                {p.monthly === 0 ? 'Free for ever, no card' : interval === 'year' ? `${euro(p.yearly)} billed yearly` : 'Billed monthly'}
              </Typography>
              <Button component={RouterLink} to="/#start" fullWidth size="large" variant={dark || p.popular ? 'contained' : 'outlined'}
                sx={{ mt: 2.5, py: 1.15, ...(dark ? roseBtn : p.popular ? primaryBtn : outlineBtn) }}>
                {cta}
              </Button>
              <Stack component="ul" spacing={1.1} sx={{ m: 0, p: 0, mt: 3, listStyle: 'none' }}>
                {planHighlights(p).map(f => (
                  <Stack component="li" key={f} direction="row" spacing={1.25} sx={{ alignItems: 'flex-start', fontSize: '0.92rem', lineHeight: 1.5 }}>
                    <CheckIcon sx={{ fontSize: 18, mt: '2px', color: dark ? BA.rose : BA.roseDeep }} />
                    <span>{f}</span>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )
        })}
      </Box>
      <Typography variant="body2" sx={{ color: BA.faint, textAlign: 'center', mt: 3 }}>
        Prices in euros, excluding VAT. The {TRIAL_MONTHS}-month free trial is for the Business plan: add a card to start, nothing is charged until it ends, cancel any time.
      </Typography>
    </Box>
  )
}

/** Enterprise, at the foot of the pricing page: by conversation with sales. */
export function EnterprisePlan() {
  return (
    <Box id="enterprise" component="section" aria-label="Enterprise plan"
      sx={{ scrollMarginTop: 88, borderRadius: '32px', bgcolor: BA.ink, color: '#fff', overflow: 'hidden', position: 'relative',
        p: { xs: 3.5, md: 7 }, display: 'grid', gap: { xs: 4, md: 7 }, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'center',
        backgroundImage: 'radial-gradient(640px 320px at 0% 0%, rgba(247,155,164,0.22), transparent 70%), radial-gradient(560px 300px at 100% 100%, rgba(183,163,216,0.22), transparent 70%)' }}>
      <Box>
        <Eyebrow light>Enterprise</Eyebrow>
        <Typography component="h2" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '2.4rem', md: '3.4rem' }, lineHeight: 1.02, letterSpacing: '-0.015em', mt: 1.75 }}>
          For groups, franchises and <Box component="em" sx={{ color: BA.rose }}>multi-site</Box> operators.
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.72)', mt: 2.5, fontSize: '1.08rem', lineHeight: 1.65, maxWidth: 480 }}>
          Business Agent across every venue, set up and supported by our team, with limits and terms that fit how you work.
        </Typography>
        <Typography sx={{ ...figures, fontWeight: 500, fontSize: '1.4rem', mt: 3 }}>{ENTERPRISE.price}</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 3, alignItems: { sm: 'center' } }}>
          <Button href={contactSales} size="large" variant="contained" startIcon={<MailIcon />} sx={{ ...roseBtn, px: 3.25, py: 1.35 }}>Contact sales</Button>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>or write to {ENTERPRISE.email}</Typography>
        </Stack>
      </Box>
      <Box sx={{ borderRadius: '24px', border: '1px solid rgba(255,255,255,0.12)', bgcolor: 'rgba(255,255,255,0.04)', p: { xs: 2.5, md: 3.5 } }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.75rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>Included</Typography>
        <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0, mt: 2 }}>
          {ENTERPRISE.includes.map(i => (
            <Stack component="li" key={i} direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
              <CheckIcon sx={{ fontSize: 18, mt: '3px', color: BA.rose }} />
              <Typography sx={{ lineHeight: 1.55 }}>{i}</Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
    </Box>
  )
}
