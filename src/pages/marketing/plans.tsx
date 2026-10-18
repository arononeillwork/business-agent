import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/CheckRounded'
import { useState } from 'react'
import { PLANS, TRIAL_MONTHS, planHighlights, type Interval } from '../../../shared/plans'
import { BA, display, outlineBtn, primaryBtn } from './site'

export { TRIAL_MONTHS }

const euro = (n: number) => `€${Number.isInteger(n) ? n : n.toFixed(2)}`

/** The four plan cards with a monthly / yearly switch. */
export function PricingCards() {
  const [interval, setInterval] = useState<Interval>('month')
  return (
    <Box>
      <Stack sx={{ alignItems: 'center', mb: 4 }}>
        <ToggleButtonGroup exclusive value={interval} onChange={(_, v) => v && setInterval(v)} aria-label="Billing period"
          sx={{ bgcolor: BA.tint, p: 0.5, borderRadius: '12px', '& .MuiToggleButton-root': {
            border: 0, borderRadius: '9px !important', px: 2.25, py: 0.75, textTransform: 'none', fontWeight: 500, color: BA.soft,
            '&.Mui-selected': { bgcolor: '#fff', color: BA.ink, boxShadow: '0 1px 3px rgba(17,19,24,0.12)', '&:hover': { bgcolor: '#fff' } } } }}>
          <ToggleButton value="month">Monthly</ToggleButton>
          <ToggleButton value="year">Yearly <Box component="span" sx={{ ml: 1, color: BA.accent, fontWeight: 600 }}>2 months free</Box></ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, alignItems: 'stretch' }}>
        {PLANS.map(p => {
          const dark = !!p.trial
          const price = interval === 'month' ? p.monthly : Math.round(p.yearly / 12 * 100) / 100
          const cta = p.monthly === 0 ? 'Start free' : p.trial ? `Try free for ${TRIAL_MONTHS} months` : `Choose ${p.name}`
          return (
            <Box key={p.id} component="article" aria-label={`${p.name} plan`}
              sx={{ position: 'relative', p: 3, borderRadius: '20px', bgcolor: dark ? BA.ink : BA.card, color: dark ? '#fff' : BA.ink,
                border: `1px solid ${dark ? BA.ink : p.popular ? '#BDBBEF' : BA.line}`, display: 'flex', flexDirection: 'column',
                boxShadow: dark ? '0 30px 60px -30px rgba(17,19,24,0.55)' : 'none' }}>
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', minHeight: 28 }}>
                <Typography component="h3" sx={{ fontFamily: display, fontWeight: 600, fontSize: '1.2rem' }}>{p.name}</Typography>
                {p.trial && <Chip size="small" label={`${TRIAL_MONTHS} months free`} sx={{ bgcolor: 'rgba(255,255,255,0.14)', color: '#fff', fontWeight: 500 }} />}
                {p.popular && <Chip size="small" label="Most popular" sx={{ bgcolor: BA.accentSoft, color: BA.accent, fontWeight: 500 }} />}
              </Stack>
              <Typography sx={{ color: dark ? 'rgba(255,255,255,0.72)' : BA.soft, mt: 0.75, fontSize: '0.92rem', minHeight: 44 }}>{p.blurb}</Typography>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', mt: 2 }}>
                <Typography sx={{ fontFamily: display, fontWeight: 600, fontSize: '2.4rem', letterSpacing: '-0.03em', lineHeight: 1 }}>{euro(price)}</Typography>
                <Typography sx={{ color: dark ? 'rgba(255,255,255,0.72)' : BA.soft }}>/ month</Typography>
              </Stack>
              <Typography variant="body2" sx={{ color: dark ? 'rgba(255,255,255,0.6)' : BA.faint, mt: 0.75, minHeight: 20 }}>
                {p.monthly === 0 ? 'Free for ever, no card' : interval === 'year' ? `${euro(p.yearly)} billed yearly` : 'Billed monthly'}
              </Typography>
              <Button component={RouterLink} to="/#start" fullWidth size="large" variant={dark ? 'contained' : 'outlined'}
                sx={{ mt: 2.5, ...(dark ? { ...primaryBtn, bgcolor: '#fff', color: BA.ink, '&:hover': { bgcolor: '#ECEAE6' } } : outlineBtn) }}>
                {cta}
              </Button>
              <Stack component="ul" spacing={1.1} sx={{ m: 0, p: 0, mt: 3, listStyle: 'none' }}>
                {planHighlights(p).map(f => (
                  <Stack component="li" key={f} direction="row" spacing={1.25} sx={{ alignItems: 'flex-start', fontSize: '0.92rem' }}>
                    <CheckIcon sx={{ fontSize: 18, mt: '2px', color: dark ? '#A5B4FC' : BA.accent }} />
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
