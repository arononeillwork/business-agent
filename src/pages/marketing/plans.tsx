import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, ButtonBase, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/CheckRounded'
import MailIcon from '@mui/icons-material/MailOutlineRounded'
import { useState } from 'react'
import { COMPARE, ENTERPRISE, PLANS, TRIAL_MONTHS, planHighlights, type Interval, type Plan, type PlanId } from '../../../shared/plans'
import { BA, Eyebrow, SectionIntro, display, outlineBtn, primaryBtn, roseBtn } from './site'

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
                <Typography sx={{ fontFamily: display, fontWeight: 400, fontSize: '3.1rem', letterSpacing: '-0.02em', lineHeight: 1 }}>{euro(price)}</Typography>
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

/** The cheapest plan with a feature, for "On Pro and up". */
function fromPlan(values: Record<PlanId, boolean | string>) {
  const i = PLANS.findIndex(p => !!values[p.id])
  return i < 0 ? null : `On ${PLANS[i].name}${i < PLANS.length - 1 ? ' and up' : ''}`
}

/**
 * Plan details, for anyone: pick a plan; first the overview (who it's for, the limits that matter),
 * then every feature and limit underneath, each in plain words, with what isn't included and
 * which plan has it.
 */
export function PlanDetails() {
  const [id, setId] = useState<PlanId>('pro')
  const p = PLANS.find(x => x.id === id)!
  const l = p.limits
  const tiles: [string, string][] = [
    ['People on the team', l.people === null ? 'Unlimited' : `Up to ${l.people}`],
    ['Social accounts', `${l.socialAccounts}`],
    ['Scheduled posts a month', l.postsPerMonth === null ? 'Unlimited' : `${l.postsPerMonth}`],
    ['Help', p.support],
  ]
  return (
    <Box component="section" aria-label="Plan details">
      <SectionIntro eyebrow="Plan details" title={<>What each plan includes, <em>in plain words</em></>}
        text="Choose a plan. First the overview, then every feature and limit underneath." />
      <Stack direction="row" role="tablist" aria-label="Plans" sx={{ justifyContent: 'center', flexWrap: 'wrap', gap: 1, mb: 3.5 }}>
        {PLANS.map(x => (
          <ButtonBase key={x.id} role="tab" aria-selected={x.id === id} onClick={() => setId(x.id)}
            sx={{ px: 2.5, py: 1.1, borderRadius: '999px', fontWeight: 500, fontSize: '0.95rem', fontFamily: 'inherit',
              border: `1px solid ${x.id === id ? BA.ink : BA.line}`, bgcolor: x.id === id ? BA.ink : '#fff', color: x.id === id ? BA.bg : BA.ink,
              transition: 'background-color .15s, color .15s', '&:hover': { borderColor: BA.ink } }}>
            {x.name}
            {x.monthly > 0 && <Box component="span" sx={{ ml: 1, opacity: 0.7, fontWeight: 400 }}>€{x.monthly}</Box>}
          </ButtonBase>
        ))}
      </Stack>

      <Box role="tabpanel" aria-label={`${p.name} plan details`} sx={{ borderRadius: '28px', border: `1px solid ${BA.line}`, bgcolor: '#fff', overflow: 'hidden' }}>
        {/* Overview */}
        <Box sx={{ p: { xs: 3, md: 5 }, display: 'grid', gap: { xs: 3, md: 5 }, gridTemplateColumns: { xs: '1fr', md: '1fr 1.1fr' }, alignItems: 'center',
          bgcolor: BA.tint, backgroundImage: 'radial-gradient(520px 260px at 0% 0%, rgba(247,155,164,0.16), transparent 70%)' }}>
          <Box>
            <Eyebrow>Overview</Eyebrow>
            <Typography component="h3" sx={{ fontFamily: display, fontWeight: 400, fontSize: { xs: '2.4rem', md: '3rem' }, lineHeight: 1, mt: 1.25 }}>
              {p.name}
            </Typography>
            <Typography sx={{ mt: 1.25, fontSize: '1.05rem' }}>
              {p.monthly ? <><b>€{p.monthly}</b> a month, or €{p.yearly.toLocaleString('en-IE')} a year</> : <b>Free for ever</b>}
              <Box component="span" sx={{ color: BA.faint }}>{p.monthly ? ' · plus VAT' : ' · no card'}</Box>
            </Typography>
            <Typography sx={{ color: BA.soft, mt: 2, lineHeight: 1.7, maxWidth: 460 }}>{p.bestFor}</Typography>
          </Box>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: '1fr 1fr' }}>
            {tiles.map(([label, value]) => (
              <Box key={label} sx={{ p: 2.25, borderRadius: '18px', bgcolor: '#fff', border: `1px solid ${BA.line}` }}>
                <Typography variant="caption" sx={{ color: BA.faint, display: 'block' }}>{label}</Typography>
                <Typography sx={{ fontFamily: value.length > 12 ? undefined : display, fontSize: value.length > 12 ? '0.98rem' : '2rem', lineHeight: 1.15, mt: 0.5, fontWeight: value.length > 12 ? 500 : 400 }}>
                  {value}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Every feature and limit */}
        <Box sx={{ p: { xs: 2.5, md: 5 }, display: 'grid', gap: { xs: 3, md: 4.5 }, columnGap: 6, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          {COMPARE.map(g => (
            <Box key={g.group} component="section" aria-label={g.group}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.75rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: BA.faint, pb: 1, borderBottom: `1px solid ${BA.line}` }}>
                {g.group}
              </Typography>
              <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {g.rows.map(r => {
                  const v = r.values[p.id]
                  const on = !!v
                  return (
                    <Stack component="li" key={r.label} direction="row" spacing={1.5} aria-label={`${r.label}: ${typeof v === 'string' ? v : on ? 'included' : 'not included'}`}
                      sx={{ py: 1.4, borderBottom: `1px solid ${BA.lineSoft}`, alignItems: 'flex-start' }}>
                      <Box sx={{ width: 22, height: 22, mt: '1px', borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                        bgcolor: on ? BA.roseSoft : BA.tint, color: on ? BA.roseDeep : BA.faint }}>
                        {on ? <CheckIcon sx={{ fontSize: 15 }} /> : <Box component="span" sx={{ width: 8, height: 1.5, bgcolor: 'currentColor', borderRadius: 1 }} />}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 500, fontSize: '0.95rem', color: on ? BA.ink : BA.faint }}>{r.label}</Typography>
                        {r.explain && <Typography variant="body2" sx={{ color: BA.soft, lineHeight: 1.55 }}>{r.explain}</Typography>}
                        {!on && fromPlan(r.values) && <Typography variant="caption" sx={{ color: BA.roseDeep, fontWeight: 500 }}>{fromPlan(r.values)}</Typography>}
                      </Box>
                      {typeof v === 'string' && (
                        <Typography sx={{ fontWeight: 600, fontSize: '0.92rem', textAlign: 'right', maxWidth: 170, flexShrink: 0 }}>{v}</Typography>
                      )}
                    </Stack>
                  )
                })}
              </Stack>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}

/** Enterprise, at the foot of the plans: exclusive, by conversation with sales. */
export function EnterprisePlan() {
  return (
    <Box id="enterprise" component="section" aria-label="Enterprise plan"
      sx={{ scrollMarginTop: 88, borderRadius: '32px', bgcolor: BA.ink, color: '#fff', overflow: 'hidden', position: 'relative',
        p: { xs: 3.5, md: 7 }, display: 'grid', gap: { xs: 4, md: 7 }, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'center',
        backgroundImage: 'radial-gradient(640px 320px at 0% 0%, rgba(247,155,164,0.22), transparent 70%), radial-gradient(560px 300px at 100% 100%, rgba(183,163,216,0.22), transparent 70%)' }}>
      <Box>
        <Eyebrow light>Enterprise</Eyebrow>
        <Typography component="h2" sx={{ fontFamily: display, fontWeight: 400, fontSize: { xs: '2.4rem', md: '3.4rem' }, lineHeight: 1.02, letterSpacing: '-0.015em', mt: 1.75 }}>
          For groups, franchises and <Box component="em" sx={{ color: BA.rose }}>multi-site</Box> operators.
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.72)', mt: 2.5, fontSize: '1.08rem', lineHeight: 1.65, maxWidth: 480 }}>
          Business Agent across every venue, set up and supported by our team, with limits and terms that fit how you work.
        </Typography>
        <Typography sx={{ fontFamily: display, fontSize: '1.7rem', mt: 3 }}>{ENTERPRISE.price}</Typography>
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
