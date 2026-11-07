// The back-office's funnel (the Businesses page, HQ's admins only): signed up, finished set-up, active in
// week two, on a trial, paying and cancelled, each with its count and share, beside the cancellations of the
// last 12 months. The counting is shared/hqFunnel.ts; week two and cancellations are public.hq_funnel().
import { Box, Card, CardContent, Stack, Typography } from '@mui/material'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { hqFunnel, share, type FunnelBusiness, type FunnelStep, type FunnelStepId } from '../../shared/hqFunnel'
import { locale, t, tc, tn } from '../i18n'
import { tokens } from '../theme'
import { BarChart } from './charts'
import { ErrorBox, SectionTitle } from './common'

const label = (id: FunnelStepId) => ({
  signed_up: tc('funnel', 'Signed up'),
  set_up: t('Finished set-up'),
  week_two: t('Active in week two'),
  trial: t('On a trial'),
  paying: t('Paying'),
  cancelled: tc('funnel', 'Cancelled'),
})[id]

const monthDate = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)

export function HqFunnel({ businesses }: { businesses: FunnelBusiness[] }) {
  const { api } = useApp()
  // Asked again when a business's billing changes on the list (an act on this page can end a cancellation).
  const statuses = businesses.map(b => `${b.id}:${b.status}`).join(',')
  const { data, error } = useAsync('hq-funnel', () => api.hqFunnel(), [statuses])
  if (!data) return <ErrorBox error={error} />
  const f = hqFunnel(businesses, data)
  const note = (s: FunnelStep) => s.id !== 'week_two' ? null : [
    t('Share of those at least two weeks old ({n})', { n: s.of }),
    f.weekTwoNotYet ? tn(f.weekTwoNotYet, '{n} is younger: not yet', '{n} are younger: not yet') : null,
  ].filter(Boolean).join(' · ')
  const cancelled = f.byMonth.reduce((n, m) => n + m.count, 0)

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 3 }}>
      <Card component="section" aria-label={t('Funnel')}>
        <CardContent>
          <SectionTitle>{t('Funnel')}</SectionTitle>
          <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {f.steps.map(s => {
              const part = share(s)
              const pct = `${Math.round(part * 100)}%`
              return (
                <Box component="li" key={s.id} aria-label={`${label(s.id)}: ${s.count}, ${pct}`}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
                    <Typography variant="body2">{label(s.id)}</Typography>
                    <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {s.count} <Box component="span" sx={{ color: 'text.secondary', ml: 0.5, display: 'inline-block', minWidth: '2.6em', textAlign: 'right' }}>{pct}</Box>
                    </Typography>
                  </Stack>
                  <Box sx={{ mt: 0.5, height: 6, borderRadius: 3, bgcolor: tokens.line, overflow: 'hidden' }}>
                    <Box sx={{ width: `${Math.max(part > 0 ? 1.5 : 0, part * 100)}%`, height: '100%', borderRadius: 3, bgcolor: tokens.chart }} />
                  </Box>
                  {note(s) && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>{note(s)}</Typography>}
                </Box>
              )
            })}
          </Stack>
        </CardContent>
      </Card>
      <Card component="section" aria-label={t('Cancellations by month')}>
        <CardContent>
          <SectionTitle>{t('Cancellations by month')}</SectionTitle>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {tn(cancelled, '{n} in the last 12 months: a subscription cancelled, or an owner asking to close the account.',
              '{n} in the last 12 months: subscriptions cancelled, or owners asking to close the account.')}
          </Typography>
          <BarChart label={t('Cancellations in each of the last 12 months')} height={200}
            format={n => tn(n, '{n} cancellation', '{n} cancellations')} axisFormat={n => (Number.isInteger(n) ? String(n) : '')}
            points={f.byMonth.map(m => ({
              label: monthDate(m.month).toLocaleDateString(locale(), { month: 'short' }),
              title: monthDate(m.month).toLocaleDateString(locale(), { month: 'long', year: 'numeric' }),
              value: m.count,
            }))} />
          {f.undated > 0 && (
            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
              {tn(f.undated, '{n} more has no date yet: the nightly check with Stripe fills it in.', '{n} more have no date yet: the nightly check with Stripe fills them in.')}
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
