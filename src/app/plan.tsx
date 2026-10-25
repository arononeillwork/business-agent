import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material'
import LockIcon from '@mui/icons-material/LockOutlined'
import { Link as RouterLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useApp } from './AppContext'
import { useAsync } from './hooks'
import { FEATURE_LABEL, paymentProblem, plan as planById, planFor, type Feature } from '../../shared/plans'
import { t } from '../i18n'

/** A plan's name to show: Starter, Pro and Business are names and stay in English; Free is translated. */
export const planName = (p: { name: string }) => (p.name === 'Free' ? t('Free') : p.name)

/** The plan in force for the business (everyone), with `allows` for feature locks. */
export function usePlan() {
  const { api } = useApp()
  const q = useAsync('plan-status', () => api.planStatus(), [])
  const s = q.data
  return {
    status: s,
    plan: planById(s?.plan),
    // Until it's known, nothing is locked (the server checks anyway).
    allows: (f: Feature) => !s || s.limits.features.includes(f),
    reload: q.reload,
  }
}

/** "This needs the Pro plan": what the feature is, which plan has it, and a way there. */
export function UpgradeCard({ feature, children }: { feature: Feature; children?: ReactNode }) {
  const { isAdmin, canSeePay } = useApp()
  const needs = planFor(feature)
  return (
    <Card variant="outlined" sx={{ maxWidth: 560 }}>
      <CardContent>
        <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: 'action.hover' }}><LockIcon /></Box>
          <Typography variant="h6" component="h2">{t('{feature} is on the {plan} plan', { feature: t(FEATURE_LABEL[feature]), plan: planName(needs) })}</Typography>
          <Typography color="text.secondary">
            {children ?? t('Your current plan doesn\'t include it. {plan} is €{price} a month.', { plan: planName(needs), price: needs.monthly })}
          </Typography>
          {isAdmin && canSeePay
            ? <Button component={RouterLink} to="/account/billing" variant="contained">{t('See plans')}</Button>
            : <Typography variant="body2" color="text.secondary">{t('Ask a boss to upgrade on the Billing page.')}</Typography>}
        </Stack>
      </CardContent>
    </Card>
  )
}

/** Shows the page if the plan includes the feature, otherwise the upgrade card. */
export function PlanGate({ feature, children }: { feature: Feature; children: ReactNode }) {
  const { allows } = usePlan()
  if (allows(feature)) return <>{children}</>
  return <Box sx={{ p: { xs: 2, md: 4 } }}><UpgradeCard feature={feature} /></Box>
}

/** Across the top of the app for bosses (billing is theirs): the subscription isn't paid, so paid features are paused. */
export function BillingBanner() {
  const { api, isAdmin, canSeePay } = useApp()
  const boss = isAdmin && canSeePay
  const billing = useAsync('billing', () => (boss ? api.billing() : Promise.resolve(null)), [boss])
  const b = billing.data
  if (!b || !paymentProblem(b)) return null
  const name = planName(planById(b.plan))
  const why = b.status === 'trialing' ? t('Your free trial of {plan} has ended', { plan: name })
    : b.status === 'canceled' ? t('Your {plan} plan has ended', { plan: name }) : t('The payment for {plan} didn\'t go through', { plan: name })
  return (
    <Alert severity="warning" sx={{ borderRadius: 0 }} action={<Button color="inherit" size="small" component={RouterLink} to="/account/billing">{t('Fix billing')}</Button>}>
      {t('{why}. You\'re on the Free plan until it\'s paid: paid features are paused, nothing is deleted.', { why })}
    </Alert>
  )
}
