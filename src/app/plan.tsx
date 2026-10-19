import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material'
import LockIcon from '@mui/icons-material/LockOutlined'
import { Link as RouterLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useApp } from './AppContext'
import { useAsync } from './hooks'
import { FEATURE_LABEL, paymentProblem, plan as planById, planFor, type Feature } from '../../shared/plans'

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
  const { isAdmin } = useApp()
  const needs = planFor(feature)
  return (
    <Card variant="outlined" sx={{ maxWidth: 560 }}>
      <CardContent>
        <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: 'action.hover' }}><LockIcon /></Box>
          <Typography variant="h6" component="h2">{FEATURE_LABEL[feature]} is on the {needs.name} plan</Typography>
          <Typography color="text.secondary">
            {children ?? `Your current plan doesn't include it. ${needs.name} is €${needs.monthly} a month.`}
          </Typography>
          {isAdmin
            ? <Button component={RouterLink} to="/account/billing" variant="contained">See plans</Button>
            : <Typography variant="body2" color="text.secondary">Ask an admin to upgrade on the Billing page.</Typography>}
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

/** Across the top of the app for admins: the subscription isn't paid, so paid features are paused. */
export function BillingBanner() {
  const { api, isAdmin } = useApp()
  const billing = useAsync('billing', () => (isAdmin ? api.billing() : Promise.resolve(null)), [isAdmin])
  const b = billing.data
  if (!b || !paymentProblem(b)) return null
  const name = planById(b.plan).name
  const why = b.status === 'trialing' ? `Your free trial of ${name} has ended`
    : b.status === 'canceled' ? `Your ${name} plan has ended` : `The payment for ${name} didn't go through`
  return (
    <Alert severity="warning" sx={{ borderRadius: 0 }} action={<Button color="inherit" size="small" component={RouterLink} to="/account/billing">Fix billing</Button>}>
      {why}. You're on the Free plan until it's paid: paid features are paused, nothing is deleted.
    </Alert>
  )
}
