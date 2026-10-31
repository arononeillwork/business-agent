import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/CheckRounded'
import MailIcon from '@mui/icons-material/MailOutlineRounded'
import PerUseIcon from '@mui/icons-material/AddRounded'
import { useState } from 'react'
import { ENTERPRISE, PAY_PER_USE, PLANS, TRIAL_MONTHS, mostIncluded, perUsePrice, planHighlights, type Interval, type Plan } from '../../../shared/plans'
import { shows } from '../../app/features'
import { BA, Eyebrow, display, figures, outlineBtn, primaryBtn, roseBtn } from './site'
import { locale, t, tr } from '../../i18n'

export { TRIAL_MONTHS }

/** A plan's name to show: "Free" is translated; Starter, Pro, Business and Enterprise stay as they are. */
import { planName } from '../../app/plan'
export { planName }

const euro = (n: number) => `€${Number.isInteger(n) ? n.toLocaleString(locale()) : n.toFixed(2)}`
/** An amount in euros as the reader writes it: €94, €1,088.28 (€1.088,28 in Spanish). */
export const money = (n: number) => `€${n.toLocaleString(locale(), { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`
const perMonth = (p: Plan, interval: Interval) => (interval === 'month' ? p.monthly : Math.round(p.yearly / 12 * 100) / 100)
const contactSales = () => `mailto:${ENTERPRISE.email}?subject=${encodeURIComponent('Business Agent Enterprise')}&body=${encodeURIComponent(
  t('Hello,\n\nWe’d like to talk about Business Agent Enterprise.\n\nBusiness:\nNumber of venues:\nPeople on the team (roughly):\nBest phone number:\n\nThank you'))}`

/** The four plan cards with a monthly / yearly switch. */
export function PricingCards() {
  const [interval, setInterval] = useState<Interval>('month')
  return (
    <Box>
      <Stack sx={{ alignItems: 'center', mb: 4.5 }}>
        <ToggleButtonGroup exclusive value={interval} onChange={(_, v) => v && setInterval(v)} aria-label={t('Billing period')}
          sx={{ bgcolor: BA.tint, p: 0.5, borderRadius: '999px', '& .MuiToggleButton-root': {
            border: 0, borderRadius: '999px !important', px: 2.5, py: 0.75, textTransform: 'none', fontWeight: 500, color: BA.soft,
            '&.Mui-selected': { bgcolor: '#fff', color: BA.ink, boxShadow: '0 1px 3px rgba(43,37,34,0.14)', '&:hover': { bgcolor: '#fff' } } } }}>
          <ToggleButton value="month">{t('Monthly')}</ToggleButton>
          <ToggleButton value="year">{t('Yearly')} <Box component="span" sx={{ ml: 1, color: BA.roseDeep, fontWeight: 600 }}>{t('2 months free')}</Box></ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, alignItems: 'stretch' }}>
        {PLANS.map(p => {
          const dark = !!p.trial
          const price = perMonth(p, interval)
          const cta = p.monthly === 0 ? t('Start free') : p.trial ? t('Try free for {n} months', { n: TRIAL_MONTHS }) : t('Choose {plan}', { plan: planName(p) })
          return (
            <Box key={p.id} component="article" aria-label={t('{name} plan', { name: planName(p) })}
              sx={{ position: 'relative', p: 3.25, borderRadius: '24px', bgcolor: dark ? BA.ink : BA.card, color: dark ? '#fff' : BA.ink,
                border: `1px solid ${dark ? BA.ink : p.popular ? BA.lilac : BA.line}`, display: 'flex', flexDirection: 'column',
                backgroundImage: dark ? 'radial-gradient(420px 220px at 100% 0%, rgba(247,155,164,0.22), transparent 70%)' : undefined,
                boxShadow: dark ? '0 34px 70px -34px rgba(43,37,34,0.6)' : p.popular ? '0 24px 50px -36px rgba(91,74,134,0.45)' : 'none' }}>
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', minHeight: 28 }}>
                <Typography component="h3" sx={{ fontWeight: 600, fontSize: '1.05rem', letterSpacing: '0.01em' }}>{planName(p)}</Typography>
                {p.trial && <Chip size="small" label={t('{n} months free', { n: TRIAL_MONTHS })} sx={{ bgcolor: 'rgba(247,155,164,0.18)', color: BA.rose, fontWeight: 500 }} />}
                {p.popular && <Chip size="small" label={t('Most popular')} sx={{ bgcolor: BA.lilacSoft, color: BA.lilacDeep, fontWeight: 500 }} />}
              </Stack>
              <Typography sx={{ color: dark ? 'rgba(255,255,255,0.7)' : BA.soft, mt: 0.75, fontSize: '0.92rem', minHeight: 44 }}>{t(p.blurb)}</Typography>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', mt: 2.25 }}>
                <Typography sx={{ ...figures, fontSize: '2.6rem', lineHeight: 1 }}>{euro(price)}</Typography>
                <Typography sx={{ color: dark ? 'rgba(255,255,255,0.7)' : BA.soft }}>{t('/ month')}</Typography>
              </Stack>
              <Typography variant="body2" sx={{ color: dark ? 'rgba(255,255,255,0.58)' : BA.faint, mt: 0.75, minHeight: 20 }}>
                {p.monthly === 0 ? t('Free for ever, no card') : interval === 'year' ? t('{amount} billed yearly', { amount: euro(p.yearly) }) : t('Billed monthly')}
              </Typography>
              <Button component={RouterLink} to="/#start" fullWidth size="large" variant={dark || p.popular ? 'contained' : 'outlined'}
                sx={{ mt: 2.5, py: 1.15, ...(dark ? roseBtn : p.popular ? primaryBtn : outlineBtn) }}>
                {cta}
              </Button>
              <Stack component="ul" spacing={1.1} sx={{ m: 0, p: 0, mt: 3, listStyle: 'none' }}>
                {planHighlights(p, t).map(f => (
                  <Stack component="li" key={f} direction="row" spacing={1.25} sx={{ alignItems: 'flex-start', fontSize: '0.92rem', lineHeight: 1.5 }}>
                    <CheckIcon sx={{ fontSize: 18, mt: '2px', color: dark ? BA.rose : BA.roseDeep }} />
                    <span>{f}</span>
                  </Stack>
                ))}
              </Stack>
              <PerUse plan={p} dark={dark} />
            </Box>
          )
        })}
      </Box>
      <PerUseNote />
      <Typography variant="body2" sx={{ color: BA.faint, textAlign: 'center', mt: 3 }}>
        {t('Prices in euros, excluding VAT. The {n}-month free trial is for the Business plan: add a card to start, nothing is charged until it ends, cancel any time.', { n: TRIAL_MONTHS })}
      </Typography>
    </Box>
  )
}

/** A plan card's pay-per-use extras, kept apart from what the price includes (at the card's foot). */
function PerUse({ plan: p, dark }: { plan: Plan; dark: boolean }) {
  const lines = PAY_PER_USE.filter(shows).flatMap(u => {
    const price = perUsePrice(u, p.id, t, money)
    return price ? [{ id: u.id, text: t('{what}: {price}', { what: t(u.short), price }) }] : []
  })
  if (!lines.length) return null
  return (
    <Box sx={{ mt: 'auto', pt: 2.5 }}>
      <Box sx={{ borderTop: `1px dashed ${dark ? 'rgba(255,255,255,0.22)' : BA.limewash}`, pt: 2 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: dark ? 'rgba(255,255,255,0.6)' : BA.faint }}>
          {t('Pay per use')}
        </Typography>
        <Stack component="ul" aria-label={t('Pay per use')} spacing={1} sx={{ m: 0, p: 0, mt: 1, listStyle: 'none' }}>
          {lines.map(l => (
            <Stack component="li" key={l.id} direction="row" spacing={1.25} sx={{ alignItems: 'flex-start', fontSize: '0.88rem', lineHeight: 1.5 }}>
              <PerUseIcon sx={{ fontSize: 18, mt: '2px', color: dark ? 'rgba(255,255,255,0.6)' : BA.faint }} />
              <span>{l.text}</span>
            </Stack>
          ))}
        </Stack>
      </Box>
    </Box>
  )
}

/** Under the plan cards: what is charged per use, and what the top plan includes free. */
function PerUseNote() {
  const extras = PAY_PER_USE.filter(shows)
  if (!extras.length) return null
  return (
    <Box role="note" aria-label={t('Pay per use')} sx={{ mt: 3, mx: 'auto', maxWidth: 780, px: { xs: 2.5, sm: 3 }, py: 1.75, borderRadius: '18px', bgcolor: BA.tint, textAlign: 'center' }}>
      <Typography sx={{ fontSize: '0.95rem', lineHeight: 1.6 }}>
        <b>{t('Pay per use:')}</b>{' '}
        {extras.map(u => {
          const top = mostIncluded(u)
          return (
            <span key={u.id}>
              {t('{what}, {price} each on any paid plan, billed monthly with your plan.', { what: t(u.label), price: money(u.price) })}{' '}
              {top && t('{plan} includes {n} free every month.', { plan: planName(top), n: u.included[top.id]! })}{' '}
            </span>
          )
        })}
        {t('Everything else is in the plan price.')}
      </Typography>
    </Box>
  )
}

/** Enterprise, at the foot of the pricing page: by conversation with sales. */
export function EnterprisePlan() {
  return (
    <Box id="enterprise" component="section" aria-label={t('{name} plan', { name: ENTERPRISE.name })}
      sx={{ scrollMarginTop: 88, borderRadius: '32px', bgcolor: BA.ink, color: '#fff', overflow: 'hidden', position: 'relative',
        p: { xs: 3.5, md: 7 }, display: 'grid', gap: { xs: 4, md: 7 }, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'center',
        backgroundImage: 'radial-gradient(640px 320px at 0% 0%, rgba(247,155,164,0.22), transparent 70%), radial-gradient(560px 300px at 100% 100%, rgba(183,163,216,0.22), transparent 70%)' }}>
      <Box>
        <Eyebrow light>{ENTERPRISE.name}</Eyebrow>
        <Typography component="h2" sx={{ fontFamily: display, fontWeight: 500, fontSize: { xs: '2.4rem', md: '3.4rem' }, lineHeight: 1.02, letterSpacing: '-0.015em', mt: 1.75 }}>
          {tr('For groups, franchises and {em} operators.', { em: <Box component="em" sx={{ color: BA.rose }}>{t('multi-site')}</Box> })}
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.72)', mt: 2.5, fontSize: '1.08rem', lineHeight: 1.65, maxWidth: 480 }}>
          {t('Business Agent across every venue, set up and supported by our team, with limits and terms that fit how you work.')}
        </Typography>
        <Typography sx={{ ...figures, fontWeight: 500, fontSize: '1.4rem', mt: 3 }}>{t(ENTERPRISE.price)}</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 3, alignItems: { sm: 'center' } }}>
          <Button href={contactSales()} size="large" variant="contained" startIcon={<MailIcon />} sx={{ ...roseBtn, px: 3.25, py: 1.35 }}>{t('Contact sales')}</Button>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>{t('or write to {email}', { email: ENTERPRISE.email })}</Typography>
        </Stack>
      </Box>
      <Box sx={{ borderRadius: '24px', border: '1px solid rgba(255,255,255,0.12)', bgcolor: 'rgba(255,255,255,0.04)', p: { xs: 2.5, md: 3.5 } }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.75rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' }}>{t('Included')}</Typography>
        <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0, mt: 2 }}>
          {ENTERPRISE.includes.map(i => (
            <Stack component="li" key={i} direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
              <CheckIcon sx={{ fontSize: 18, mt: '3px', color: BA.rose }} />
              <Typography sx={{ lineHeight: 1.55 }}>{t(i)}</Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
    </Box>
  )
}
