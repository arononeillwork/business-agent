import { Alert, Box, Button, Card, CardContent, Chip, LinearProgress, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/CheckRounded'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { usePlan } from '../app/plan'
import { PageHeader, SectionTitle } from '../components/common'
import { COMPLIMENTARY_LABEL, PLANS, TRIAL_MONTHS, effectivePlan, paymentProblem, plan as planById, planHighlights, type Billing, type Interval, type PlanId } from '../../shared/plans'
import { formatLocal } from '../../shared/time'

const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400_000))

function statusChip(b: Billing) {
  if (paymentProblem(b)) return <Chip color="warning" label={b.status === 'canceled' ? 'Ended' : b.status === 'trialing' ? 'Trial ended' : 'Payment failed'} />
  if (b.status === 'trialing' && b.trial_ends_at) return <Chip color="info" label={`Free trial: ${daysLeft(b.trial_ends_at)} days left`} />
  if (b.status === 'comped') return <Chip color="success" label={`${COMPLIMENTARY_LABEL[b.complimentary ?? 'friends_family']}: free`} />
  if (b.status === 'active') return <Chip color="success" label={b.cancel_at_period_end ? 'Ends at the end of the period' : 'Active'} />
  return null
}

function Meter({ label, used, max }: { label: string; used: number; max: number | null }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" color="text.secondary">{used} of {max === null ? 'unlimited' : max}</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={max === null ? 4 : Math.min(100, (used / Math.max(1, max)) * 100)} sx={{ mt: 0.75, height: 6, borderRadius: 3 }}
        color={max !== null && used >= max ? 'warning' : 'primary'} />
    </Box>
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
    navigate('/billing', { replace: true })
    if (result === 'done') {
      void api.syncBilling().then(() => { void billing.reload(); void plan.reload() })
      notify('Thanks! Your plan is set up.', 'success')
    }
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (id: PlanId) => {
    setBusy(id)
    let url: string | undefined
    const ok = await run(async () => { url = (await api.choosePlan(id, interval)).url })
    if (url) { location.href = url; return }
    setBusy(null)
    if (ok) { await Promise.all([billing.reload(), plan.reload()]); notify(`You're on ${planById(id).name}`, 'success') }
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
      <PageHeader eyebrow="Settings" title="Billing" />
      <Stack spacing={3}>
        {b && !b.ready && <Alert severity="info">Paid plans aren't switched on yet: the Stripe key (STRIPE_SECRET_KEY) still needs adding. See docs/billing.md.</Alert>}
        {b && paymentProblem(b) && (
          <Alert severity="warning">
            You chose {planById(b.plan).name}, but it isn't paid, so the business is on Free for now. Paid features are paused and nothing is deleted.
            {b.has_customer ? ' Update your card to carry on.' : ''}
          </Alert>
        )}

        <Card variant="outlined">
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
              <Box>
                <Typography variant="overline" color="text.secondary">Current plan</Typography>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Typography variant="h5" component="p">{planById(inForce).name}</Typography>
                  {b && statusChip(b)}
                </Stack>
                {b?.status === 'trialing' && b.trial_ends_at && !paymentProblem(b) && (
                  <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                    Free until {formatLocal(b.trial_ends_at, 'd MMMM yyyy')}. Then €{planById(b.plan)[b.interval === 'year' ? 'yearly' : 'monthly']} a {b.interval === 'year' ? 'year' : 'month'} goes on your card, unless you cancel before.
                  </Typography>
                )}
                {b?.status === 'comped' && (
                  <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                    {b.complimentary === 'founder'
                      ? 'The founding business of Business Agent: every feature of the top plan, free for good.'
                      : 'A friends & family account: every feature of the top plan, free. Nothing to pay and no card needed.'}
                  </Typography>
                )}
                {b?.status === 'active' && b.current_period_end && (
                  <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                    {b.cancel_at_period_end ? 'Ends' : 'Renews'} on {formatLocal(b.current_period_end, 'd MMMM yyyy')}, billed {b.interval === 'year' ? 'yearly' : 'monthly'}.
                  </Typography>
                )}
              </Box>
              {b?.has_customer && (
                <Button variant="outlined" onClick={portal} disabled={busy !== null}>
                  {b && paymentProblem(b) ? 'Update card' : 'Card, invoices and cancelling'}
                </Button>
              )}
            </Stack>
            {s && (
              <Box sx={{ mt: 3, display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
                <Meter label="People on the team" used={s.usage.people} max={s.limits.people} />
                <Meter label="Social accounts" used={s.usage.social_accounts} max={s.limits.social_accounts} />
                <Meter label="Posts scheduled this month" used={s.usage.posts_this_month} max={s.limits.posts_per_month} />
              </Box>
            )}
          </CardContent>
        </Card>

        <Box>
          <SectionTitle action={
            <ToggleButtonGroup size="small" exclusive value={interval} onChange={(_, v) => v && setInterval(v)} aria-label="Billing period">
              <ToggleButton value="month">Monthly</ToggleButton>
              <ToggleButton value="year">Yearly (2 months free)</ToggleButton>
            </ToggleButtonGroup>
          }>Plans</SectionTitle>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' } }}>
            {PLANS.map(p => {
              const current = b?.plan === p.id && inForce === p.id
              const trial = p.trial && !b?.trial_used
              const price = interval === 'year' ? Math.round(p.yearly / 12 * 100) / 100 : p.monthly
              return (
                <Card key={p.id} variant="outlined" aria-label={`${p.name} plan`} sx={{ display: 'flex', flexDirection: 'column', borderColor: current ? 'primary.main' : undefined, borderWidth: current ? 2 : 1 }}>
                  <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="h6" component="h3">{p.name}</Typography>
                      {trial && <Chip size="small" color="info" label={`${TRIAL_MONTHS} months free`} />}
                    </Stack>
                    <Typography sx={{ mt: 1 }}><b style={{ fontSize: '1.6rem' }}>€{price}</b> / month</Typography>
                    <Typography variant="caption" color="text.secondary">{p.monthly === 0 ? 'Free for ever' : interval === 'year' ? `€${p.yearly} billed yearly, plus VAT` : 'Billed monthly, plus VAT'}</Typography>
                    <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', p: 0, m: 0, mt: 2, flex: 1 }}>
                      {planHighlights(p).map(h => (
                        <Stack component="li" key={h} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                          <CheckIcon sx={{ fontSize: 17, mt: '2px' }} color="primary" /><Typography variant="body2">{h}</Typography>
                        </Stack>
                      ))}
                    </Stack>
                    <Box sx={{ mt: 2 }}>
                      {current ? <Button fullWidth disabled variant="outlined">Current plan</Button>
                        : p.id === 'free'
                          ? <Button fullWidth variant="outlined" disabled={!b?.has_customer || b.status === 'comped' || busy !== null} onClick={portal}>
                              {b?.has_customer ? 'Cancel paid plan' : 'Included'}
                            </Button>
                          : <Button fullWidth variant={trial || p.popular ? 'contained' : 'outlined'} disabled={busy !== null || !b || !b.ready || b.status === 'comped'} onClick={() => choose(p.id)}>
                              {busy === p.id ? 'Opening Stripe…' : trial ? `Start ${TRIAL_MONTHS}-month free trial` : `Choose ${p.name}`}
                            </Button>}
                    </Box>
                  </CardContent>
                </Card>
              )
            })}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Payments are taken by Stripe. The {TRIAL_MONTHS}-month trial of Business asks for a card up front and charges nothing until it ends; if the payment
            then doesn't go through, the business moves to Free until it does. Change or cancel any time.
          </Typography>
        </Box>
      </Stack>
    </Box>
  )
}
