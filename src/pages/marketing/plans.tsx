import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/CheckRounded'
import { useState } from 'react'
import { BA, display, outlineBtn, primaryBtn } from './site'

/** Every plan starts with this many months free. No card needed to start. */
export const TRIAL_MONTHS = 2
/** Paying yearly costs this many months fewer. */
export const YEARLY_MONTHS_FREE = 2

export interface Plan {
  name: string
  blurb: string
  /** Euros a month, billed monthly (VAT not included). */
  monthly: number
  team: string
  popular?: boolean
  intro: string
  features: string[]
}

export const PLANS: Plan[] = [
  {
    name: 'Starter', blurb: 'For a small team getting organised.', monthly: 19, team: 'Up to 5 people',
    intro: 'Includes',
    features: ['Drag-and-drop rota, shared to phones', 'Clock-ins, breaks and timecards', 'Time off and holiday allowance',
      'Monthly registro de jornada', 'Shift reminders by email'],
  },
  {
    name: 'Team', blurb: 'For busy venues that want it all in sync.', monthly: 39, team: 'Up to 15 people', popular: true,
    intro: 'Everything in Starter, plus',
    features: ['Opening hours synced to Google Maps', 'Social planner: Instagram, Facebook, TikTok',
      'WhatsApp and text reminders', 'Takings from Stripe or Square next to team cost', 'Match nights, fiestas and bank holidays',
      'Run it by talking to Claude or ChatGPT'],
  },
  {
    name: 'Business', blurb: 'For larger teams and their advisers.', monthly: 79, team: 'Up to 40 people',
    intro: 'Everything in Team, plus',
    features: ['Read-only access for your gestoría and partners', 'Clock-in tablet with staff PINs', 'API and personal access keys',
      'Payroll exports to Google Drive or OneDrive', 'Priority support'],
  },
]

const euro = (n: number) => `€${Number.isInteger(n) ? n : n.toFixed(2)}`
const yearlyMonthly = (p: Plan) => Math.round((p.monthly * (12 - YEARLY_MONTHS_FREE) / 12) * 100) / 100

/** The three plan cards with a monthly / yearly switch. */
export function PricingCards() {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  return (
    <Box>
      <Stack sx={{ alignItems: 'center', mb: 4 }}>
        <ToggleButtonGroup exclusive value={billing} onChange={(_, v) => v && setBilling(v)} aria-label="Billing period"
          sx={{ bgcolor: BA.tint, p: 0.5, borderRadius: '12px', '& .MuiToggleButton-root': {
            border: 0, borderRadius: '9px !important', px: 2.25, py: 0.75, textTransform: 'none', fontWeight: 500, color: BA.soft,
            '&.Mui-selected': { bgcolor: '#fff', color: BA.ink, boxShadow: '0 1px 3px rgba(17,19,24,0.12)', '&:hover': { bgcolor: '#fff' } } } }}>
          <ToggleButton value="monthly">Monthly</ToggleButton>
          <ToggleButton value="yearly">Yearly <Box component="span" sx={{ ml: 1, color: BA.accent, fontWeight: 600 }}>{YEARLY_MONTHS_FREE} months free</Box></ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, alignItems: 'stretch' }}>
        {PLANS.map(p => {
          const price = billing === 'monthly' ? p.monthly : yearlyMonthly(p)
          return (
            <Box key={p.name} component="article" aria-label={`${p.name} plan`}
              sx={{ position: 'relative', p: { xs: 3, md: 3.5 }, borderRadius: '20px', bgcolor: p.popular ? BA.ink : BA.card, color: p.popular ? '#fff' : BA.ink,
                border: `1px solid ${p.popular ? BA.ink : BA.line}`, display: 'flex', flexDirection: 'column',
                boxShadow: p.popular ? '0 30px 60px -30px rgba(17,19,24,0.55)' : 'none' }}>
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography component="h3" sx={{ fontFamily: display, fontWeight: 600, fontSize: '1.2rem' }}>{p.name}</Typography>
                {p.popular && <Chip size="small" label="Most popular" sx={{ bgcolor: 'rgba(255,255,255,0.14)', color: '#fff', fontWeight: 500 }} />}
              </Stack>
              <Typography sx={{ color: p.popular ? 'rgba(255,255,255,0.72)' : BA.soft, mt: 0.75, fontSize: '0.95rem' }}>{p.blurb}</Typography>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', mt: 3 }}>
                <Typography sx={{ fontFamily: display, fontWeight: 600, fontSize: '2.6rem', letterSpacing: '-0.03em', lineHeight: 1 }}>{euro(price)}</Typography>
                <Typography sx={{ color: p.popular ? 'rgba(255,255,255,0.72)' : BA.soft }}>/ month</Typography>
              </Stack>
              <Typography variant="body2" sx={{ color: p.popular ? 'rgba(255,255,255,0.6)' : BA.faint, mt: 0.75, minHeight: 20 }}>
                {billing === 'yearly' ? `${euro(p.monthly * (12 - YEARLY_MONTHS_FREE))} billed yearly` : 'Billed monthly'} · {p.team}
              </Typography>
              <Button component={RouterLink} to="/#start" fullWidth size="large" variant={p.popular ? 'contained' : 'outlined'}
                sx={{ mt: 3, ...(p.popular ? { ...primaryBtn, bgcolor: '#fff', color: BA.ink, '&:hover': { bgcolor: '#ECEAE6' } } : outlineBtn) }}>
                Try {p.name} free for {TRIAL_MONTHS} months
              </Button>
              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', mt: 3.5, mb: 1.5 }}>{p.intro}</Typography>
              <Stack component="ul" spacing={1.25} sx={{ m: 0, p: 0, listStyle: 'none' }}>
                {p.features.map(f => (
                  <Stack component="li" key={f} direction="row" spacing={1.25} sx={{ alignItems: 'flex-start', fontSize: '0.95rem' }}>
                    <CheckIcon sx={{ fontSize: 18, mt: '3px', color: p.popular ? '#A5B4FC' : BA.accent }} />
                    <span>{f}</span>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )
        })}
      </Box>
      <Typography variant="body2" sx={{ color: BA.faint, textAlign: 'center', mt: 3 }}>
        Prices exclude VAT. Every plan starts with {TRIAL_MONTHS} months free, no card needed. Cancel any time.
      </Typography>
    </Box>
  )
}
