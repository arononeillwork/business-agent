import { Alert, Box, Button, Card, CardContent, Chip, LinearProgress, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/CheckRounded'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { planName, usePlan } from '../app/plan'
import { PageHeader, SectionTitle } from '../components/common'
import { COMPLIMENTARY_LABEL, ENTERPRISE, PAY_PER_USE, PLANS, TRIAL_MONTHS, effectivePlan, payPerUse, paymentProblem, perUsePrice, plan as planById, planHighlights, type Billing, type Interval, type PlanId } from '../../shared/plans'
import { formatLocal } from '../../shared/time'
import { t, tn, tr } from '../i18n'

const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000))

function statusChip(b: Billing) {
  if (paymentProblem(b)) return <Chip color="warning" label={b.status === 'canceled' ? t('Ended') : b.status === 'trialing' ? t('Trial ended') : t('Payment failed')} />
  if (b.status === 'trialing' && b.trial_ends_at) return <Chip color="info" label={t('Free trial: {n} days left', { n: daysLeft(b.trial_ends_at) })} />
  if (b.status === 'comped') return <Chip color="success" label={t('{label}: free', { label: t(COMPLIMENTARY_LABEL[b.complimentary ?? 'friends_family']) })} />
  if (b.status === 'active') return <Chip color="success" label={b.cancel_at_period_end ? t('Ends at the end of the period') : t('Active')} />
  return null
}

function Meter({ label, used, max }: { label: string; used: number; max: number | null }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" color="text.secondary">{t('{used} of {max}', { used, max: max === null ? t('unlimited') : max })}</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={max === null ? 4 : Math.min(100, (used / Math.max(1, max)) * 100)} sx={{ mt: 0.75, height: 6, borderRadius: 3 }}
        color={max !== null && used >= max ? 'warning' : 'primary'} />
    </Box>
  )
}

const euros = (cents: number) => `€${(cents / 100).toFixed(2)}`

/**
 * Pay per use (PAY_PER_USE in shared/plans.ts): this month's AI music tracks, the free ones, what
 * they add to the monthly bill, and the monthly limit so nothing comes as a surprise.
 */
function PayPerUseCard() {
  const { api } = useApp()
  const run = useAction()
  const quote = useAsync('ai-music-quote', () => api.aiMusicQuote(30), [30])
  const uses = useAsync('ai-music-uses', () => api.aiMusicUses(), [])
  const [limit, setLimit] = useState<string | null>(null)
  const q = quote.data
  const music = payPerUse('ai_music')
  if (!q) return null
  const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const month = (uses.data ?? []).filter(g => g.created_at >= start && g.status === 'done')
  return (
    <Card variant="outlined" component="section" aria-label={t('Pay per use')}>
      <CardContent>
        <SectionTitle>{t('Pay per use')}</SectionTitle>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {q.allowed
            ? t('{what}: {price} each, added to your monthly bill. Only what you make is charged; a track that fails costs nothing.',
              { what: t(music.label), price: euros(q.unit_cents) })
            : t('{what} need a paid plan. Choose one below.', { what: t(music.label) })}
        </Typography>
        {q.allowed && (
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
            <Box>
              <Typography variant="overline" color="text.secondary">{t('This month')}</Typography>
              <Typography variant="h6" component="p">{tn(month.length, '{n} AI track', '{n} AI tracks')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {q.included ? t('{free} of {included} free used · {spent} so far', { free: q.included - q.free_left, included: q.included, spent: euros(q.spent_cents) })
                  : t('{spent} so far', { spent: euros(q.spent_cents) })}
              </Typography>
            </Box>
            <Box sx={{ gridColumn: { md: 'span 2' } }}>
              <Meter label={t('Monthly limit for pay per use')} used={Math.round(q.spent_cents) / 100} max={q.limit_cents / 100} />
              {limit === null ? (
                <Button size="small" sx={{ mt: 1 }} onClick={() => setLimit(String(q.limit_cents / 100))}>{t('Change the limit')}</Button>
              ) : (
                <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: 'center' }}>
                  <TextField size="small" type="number" label={t('Limit (€ a month)')} value={limit} onChange={e => setLimit(e.target.value)}
                    slotProps={{ htmlInput: { min: 0, max: 1000, step: 5 } }} sx={{ width: 160 }} />
                  <Button variant="contained" size="small" onClick={async () => {
                    if (await run(() => api.setPayPerUseLimit(Number(limit)), t('Limit saved'))) { setLimit(null); void quote.reload() }
                  }}>{t('Save')}</Button>
                  <Button size="small" onClick={() => setLimit(null)}>{t('Cancel')}</Button>
                </Stack>
              )}
            </Box>
          </Box>
        )}
        {month.length > 0 && (
          <Box component="ul" aria-label={t('AI tracks this month')} sx={{ m: 0, mt: 2, p: 0, listStyle: 'none' }}>
            {month.map(g => (
              <Stack key={g.id} component="li" direction="row" spacing={1.5} sx={{ py: 0.75, borderTop: 1, borderColor: 'divider', alignItems: 'baseline' }}>
                <Typography variant="body2" color="text.secondary" sx={{ width: 64, flexShrink: 0 }}>{formatLocal(g.created_at, 'd MMM')}</Typography>
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap title={g.prompt}>{g.prompt}</Typography>
                <Typography variant="body2" sx={{ flexShrink: 0 }}>{g.price_cents ? euros(g.price_cents) : t('Free')}</Typography>
              </Stack>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

/** Admins: the business's Business Agent plan, what it uses, and changing plan through Stripe. */
export function BillingPage() {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const { search } = useLocation()
  const navigate = useNavigate()
  const billing = useAsync('billing', () => api.billing(), [])
  const plan = usePlan()
  const [interval, setInterval] = useState<Interval>('month')
  const [busy, setBusy] = useState<PlanId | 'portal' | null>(null)
  const b = billing.data

  // Back from Stripe Checkout: read the new subscription straight away (the webhook may lag).
  useEffect(() => {
    const result = new URLSearchParams(search).get('checkout')
    if (!result) return
    navigate('/account/billing', { replace: true })
    if (result === 'done') {
      void api.syncBilling().then(() => { void billing.reload(); void plan.reload() })
      notify(t('Thanks! Your plan is set up.'), 'success')
    }
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (id: PlanId) => {
    setBusy(id)
    let url: string | undefined
    const ok = await run(async () => { url = (await api.choosePlan(id, interval)).url })
    if (url) { location.href = url; return }
    setBusy(null)
    if (ok) { await Promise.all([billing.reload(), plan.reload()]); notify(t("You're on {plan}", { plan: planName(planById(id)) }), 'success') }
  }
  const portal = async () => {
    setBusy('portal')
    let url = ''
    await run(async () => { url = await api.billingPortal() })
    if (url) location.href = url
    else setBusy(null)
  }

  const inForce = effectivePlan(b)
  const s = plan.status
  return (
    <Box>
      <PageHeader eyebrow={t('My account')} title={t('Billing')} />
      <Stack spacing={3}>
        {b && !b.ready && <Alert severity="info">{t('Paid plans aren\'t switched on yet: the Stripe key (STRIPE_SECRET_KEY) still needs adding. See docs/billing.md.')}</Alert>}
        {b && paymentProblem(b) && (
          <Alert severity="warning">
            {t('You chose {plan}, but it isn\'t paid, so the business is on Free for now. Paid features are paused and nothing is deleted.', { plan: planName(planById(b.plan)) })}
            {b.has_customer ? ` ${t('Update your card to carry on.')}` : ''}
          </Alert>
        )}

        <Card variant="outlined">
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
              <Box>
                <Typography variant="overline" color="text.secondary">{t('Current plan')}</Typography>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Typography variant="h5" component="p">{planName(planById(inForce))}</Typography>
                  {b && statusChip(b)}
                </Stack>
                {b?.status === 'trialing' && b.trial_ends_at && !paymentProblem(b) && (
                  <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                    {t(b.interval === 'year' ? 'Free until {date}. Then €{price} a year goes on your card, unless you cancel before.' : 'Free until {date}. Then €{price} a month goes on your card, unless you cancel before.',
                      { date: formatLocal(b.trial_ends_at, 'd MMMM yyyy'), price: planById(b.plan)[b.interval === 'year' ? 'yearly' : 'monthly'] })}
                  </Typography>
                )}
                {b?.status === 'comped' && (
                  <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                    {b.complimentary === 'founder'
                      ? t('The founding business of Business Agent: every feature of the top plan, free for good.')
                      : t('A friends & family account: every feature of the top plan, free. Nothing to pay and no card needed.')}
                  </Typography>
                )}
                {b && b.referral_months_applied > 0 && (
                  <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                    {tn(b.referral_months_applied, 'Referral credit: {n} free month added to your bill, taken off your next payments.', 'Referral credit: {n} free months added to your bill, taken off your next payments.')}
                  </Typography>
                )}
                {b?.status === 'active' && b.current_period_end && (
                  <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                    {t(b.cancel_at_period_end ? 'Ends on {date}, billed {period}.' : 'Renews on {date}, billed {period}.',
                      { date: formatLocal(b.current_period_end, 'd MMMM yyyy'), period: b.interval === 'year' ? t('yearly') : t('monthly') })}
                  </Typography>
                )}
              </Box>
              {b?.has_customer && (
                <Button variant="outlined" onClick={portal} disabled={busy !== null}>
                  {b && paymentProblem(b) ? t('Update card') : t('Card, invoices and cancelling')}
                </Button>
              )}
            </Stack>
            {s && (
              <Box sx={{ mt: 3, display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
                <Meter label={t('People on the team')} used={s.usage.people} max={s.limits.people} />
                <Meter label={t('Social accounts')} used={s.usage.social_accounts} max={s.limits.social_accounts} />
                <Meter label={t('Posts scheduled this month')} used={s.usage.posts_this_month} max={s.limits.posts_per_month} />
              </Box>
            )}
          </CardContent>
        </Card>

        <PayPerUseCard />

        <Box>
          <SectionTitle action={
            <ToggleButtonGroup size="small" exclusive value={interval} onChange={(_, v) => v && setInterval(v)} aria-label={t('Billing period')}>
              <ToggleButton value="month">{t('Monthly')}</ToggleButton>
              <ToggleButton value="year">{t('Yearly (2 months free)')}</ToggleButton>
            </ToggleButtonGroup>
          }>{t('Plans')}</SectionTitle>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' } }}>
            {PLANS.map(p => {
              const current = b?.plan === p.id && inForce === p.id
              const trial = p.trial && !b?.trial_used
              const price = interval === 'year' ? Math.round(p.yearly / 12 * 100) / 100 : p.monthly
              return (
                <Card key={p.id} variant="outlined" aria-label={t('{plan} plan', { plan: planName(p) })} sx={{ display: 'flex', flexDirection: 'column', borderColor: current ? 'primary.main' : undefined, borderWidth: current ? 2 : 1 }}>
                  <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="h6" component="h3">{planName(p)}</Typography>
                      {trial && <Chip size="small" color="info" label={t('{n} months free', { n: TRIAL_MONTHS })} />}
                    </Stack>
                    <Typography sx={{ mt: 1 }}>{tr('{price} / month', { price: <b style={{ fontSize: '1.6rem' }}>€{price}</b> })}</Typography>
                    <Typography variant="caption" color="text.secondary">{p.monthly === 0 ? t('Free for ever') : interval === 'year' ? t('€{price} billed yearly, plus VAT', { price: p.yearly }) : t('Billed monthly, plus VAT')}</Typography>
                    <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', p: 0, m: 0, mt: 2, flex: 1 }}>
                      {planHighlights(p, t).map(h => (
                        <Stack component="li" key={h} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                          <CheckIcon sx={{ fontSize: 17, mt: '2px' }} color="primary" /><Typography variant="body2">{h}</Typography>
                        </Stack>
                      ))}
                    </Stack>
                    {PAY_PER_USE.map(u => {
                      const price = perUsePrice(u, p.id, t, n => `€${n.toFixed(2)}`)
                      return price && (
                        <Typography key={u.id} variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
                          {t('Pay per use:')} {t('{what}: {price}', { what: t(u.short), price })}
                        </Typography>
                      )
                    })}
                    <Box sx={{ mt: 2 }}>
                      {current ? <Button fullWidth disabled variant="outlined">{t('Current plan')}</Button>
                        : p.id === 'free'
                          ? <Button fullWidth variant="outlined" disabled={!b?.has_customer || b.status === 'comped' || busy !== null} onClick={portal}>
                              {b?.has_customer ? t('Cancel paid plan') : t('Included')}
                            </Button>
                          : <Button fullWidth variant={trial || p.popular ? 'contained' : 'outlined'} disabled={busy !== null || !b || !b.ready || b.status === 'comped'} onClick={() => choose(p.id)}>
                              {busy === p.id ? t('Opening Stripe…') : trial ? t('Start {n}-month free trial', { n: TRIAL_MONTHS }) : t('Choose {plan}', { plan: planName(p) })}
                            </Button>}
                    </Box>
                  </CardContent>
                </Card>
              )
            })}
          </Box>
          <Card variant="outlined" component="section" aria-label={'Enterprise'} sx={{ mt: 2 }}>
            <CardContent sx={{ display: 'flex', gap: 2, alignItems: { sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' } }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h6" component="h3">{ENTERPRISE.name}</Typography>
                <Typography variant="body2" color="text.secondary">{t(ENTERPRISE.blurb)} {t('Every venue on one contract, set up and supported by our team.')}</Typography>
              </Box>
              <Button variant="outlined" href={`mailto:${ENTERPRISE.email}?subject=${encodeURIComponent('Business Agent Enterprise')}`}>{t('Contact sales')}</Button>
            </CardContent>
          </Card>
        </Box>
      </Stack>
    </Box>
  )
}
