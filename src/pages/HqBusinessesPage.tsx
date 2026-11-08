// The Business Agent's back-office, for HQ's admins: every business on the service, with its plan,
// trial, team, set-up and last sign-in, and the totals that matter (paying, trialing, monthly revenue).
// Each business's acts (HqBusinessActions.tsx): make it complimentary or end that (hq_set_complimentary()),
// give a free trial longer (the Worker, through Stripe), and which ones asked to close.
// Under the totals, the funnel and cancellations by month (HqFunnel.tsx, the hq_funnel migration).
import { Alert, Box, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { Empty, ErrorBox, PageHeader, StatGrid, StatTile } from '../components/common'
import { PLANS, plan as planById } from '../../shared/plans'
import type { HqBusiness } from '../data/api'
import { t, tn } from '../i18n'
import { HqBusinessActions, closingLabel } from './HqBusinessActions'
import { HqFunnel } from '../components/HqFunnel'

const PAYING = new Set(['active', 'past_due'])
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

/** What a business pays a month, VAT not included (yearly billing spread over the year); nothing while trialing or complimentary. */
export function monthlyRevenue(b: Pick<HqBusiness, 'plan' | 'status' | 'billing_interval'>): number {
  if (!PAYING.has(b.status)) return 0
  const p = planById(b.plan)
  return b.billing_interval === 'year' ? p.yearly / 12 : p.monthly
}

function statusLabel(b: HqBusiness): { label: string; color: 'default' | 'success' | 'info' | 'warning' | 'error' } {
  if (b.status === 'comped') return { label: t('Complimentary'), color: 'info' }
  if (b.status === 'trialing') return { label: t('Trial'), color: 'info' }
  if (b.status === 'active') return { label: t('Paying'), color: 'success' }
  if (b.status === 'past_due' || b.status === 'unpaid') return { label: t('Payment failed'), color: 'error' }
  if (b.status === 'canceled') return { label: t('Cancelled'), color: 'warning' }
  return { label: t('Free'), color: 'default' }
}

export function HqBusinessesPage() {
  const { api } = useApp()
  const { data, error, reload } = useAsync('hq-businesses', () => api.hqBusinesses(), [])
  const closures = useAsync('hq-closures', () => api.hqClosures(), [])
  const list = data ?? []
  const closing = new Map((closures.data ?? []).map(c => [c.id, c]))
  const mrr = list.reduce((sum, b) => sum + monthlyRevenue(b), 0)
  const euro = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  return (
    <>
      <PageHeader eyebrow={t('The Business Agent')} title={t('Businesses')} />
      <ErrorBox error={error} />
      <StatGrid>
        <StatTile label={t('Businesses')} value={list.filter(b => !b.is_hq).length} />
        <StatTile label={t('Set up')} value={list.filter(b => !b.is_hq && b.set_up_at).length} />
        <StatTile label={t('On a trial')} value={list.filter(b => b.status === 'trialing').length} />
        <StatTile label={t('Paying')} value={list.filter(b => PAYING.has(b.status)).length} note={t('{amount} a month, without VAT', { amount: euro(mrr) })} />
      </StatGrid>
      {!!list.length && <HqFunnel businesses={list} />}
      {closing.size > 0 && (
        <Alert severity="warning" sx={{ mt: 3 }}>
          {tn(closing.size, '{n} business asked to close its account.', '{n} businesses asked to close their accounts.')}{' '}
          {t('Once one has closed, delete its data by hand, except its working-hours records (registro de jornada), which the law keeps for four years. Cancel its Stripe subscription then if it still has one.')}
        </Alert>
      )}
      {data && !list.length && <Empty>{t('No businesses to show. Only admins of The Business Agent HQ see this list.')}</Empty>}
      {!!list.length && (
        <TableContainer sx={{ mt: 3 }}>
          <Table size="small" aria-label={t('Businesses')}>
            <TableHead>
              <TableRow>
                <TableCell>{t('Business')}</TableCell>
                <TableCell>{t('Plan')}</TableCell>
                <TableCell>{t('Trial ends')}</TableCell>
                <TableCell align="right">{t('Team')}</TableCell>
                <TableCell>{t('Set up')}</TableCell>
                <TableCell>{t('Last sign-in')}</TableCell>
                <TableCell>{t('Joined')}</TableCell>
                <TableCell align="right"><Box component="span" sx={visuallyHidden}>{t('Actions')}</Box></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map(b => {
                const s = statusLabel(b)
                const c = closing.get(b.id)
                const closes = c && closingLabel(c)
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{b.name}</Typography>
                      <Typography variant="caption" color="text.secondary">#{b.id}{b.is_hq ? ` · ${t('HQ')}` : ''}</Typography>
                      {closes && <Box sx={{ mt: 0.5 }}><Chip size="small" color={closes.closed ? 'error' : 'warning'} label={closes.label} /></Box>}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span>{PLANS.find(p => p.id === b.plan) ? t(planById(b.plan).name) : b.plan}</span>
                        <Chip size="small" label={s.label} color={s.color} variant="outlined" />
                      </Box>
                    </TableCell>
                    <TableCell>{b.status === 'trialing' ? day(b.trial_ends_at) : '—'}</TableCell>
                    <TableCell align="right">{b.people}</TableCell>
                    <TableCell>{b.set_up_at ? day(b.set_up_at) : t('Not yet')}</TableCell>
                    <TableCell>{day(b.last_sign_in)}</TableCell>
                    <TableCell>{day(b.created_at)}</TableCell>
                    <TableCell align="right"><HqBusinessActions business={b} onDone={() => void reload()} /></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  )
}

const visuallyHidden = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const
