import { Alert, Box, Card, CardContent, Grid, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, PageHeader, SectionTitle, Tag } from '../components/common'
import { SortCell, useSort } from '../components/tables'
import { formatLocal } from '../../shared/time'
import type { OutboxItem, Settings } from '../../shared/types'
import { tokens } from '../theme'
import { msg, t, tn, tr } from '../i18n'

const KINDS: { key: keyof Settings; title: string; who: string; when: string }[] = [
  { key: 'alert_shift_reminders', title: msg('Shift reminders'), who: msg('The person on shift'), when: msg('One hour before each shift') },
  { key: 'alert_missed_clock_in', title: msg('Missed clock-in'), who: msg('The person, and admins'), when: msg('15 minutes after a shift starts with no clock-in') },
  { key: 'alert_rota', title: msg('Weekly rota'), who: msg('Everyone on the rota'), when: msg('When an admin taps "Send on WhatsApp" on the Rota') },
  { key: 'alert_time_off', title: msg('Time off'), who: msg('Admins, then the person who asked'), when: msg('When time off is requested, and when it is decided') },
]

const TEMPLATE_LABELS: Record<string, string> = {
  shift_reminder: msg('Shift reminder'), missed_clock_in: msg('Missed clock-in'), missed_clock_in_admin: msg('Missed clock-in (admin)'),
  rota_published: msg('Weekly rota'), time_off_requested: msg('Time off requested'), time_off_decided: msg('Time off decided'), hello_world: msg('Test message'),
}

const STATUS: Record<OutboxItem['status'], { label: string; fg: string; bg: string }> = {
  pending: { label: msg('Waiting'), fg: tokens.ubeDeep, bg: tokens.ubeSoft },
  sending: { label: msg('Sending'), fg: tokens.ubeDeep, bg: tokens.ubeSoft },
  sent: { label: msg('Sent'), fg: tokens.matchaDeep, bg: tokens.matchaSoft },
  failed: { label: msg('Retrying'), fg: tokens.warnFg, bg: tokens.warnBg },
  dead: { label: msg('Failed'), fg: tokens.badFg, bg: tokens.badBg },
}

/** WhatsApp's delivery receipts, as shown (anything else shows as it comes, capitalised). */
const DELIVERY: Record<string, string> = { sent: msg('Sent'), delivered: msg('Delivered'), read: msg('Read'), failed: msg('Failed') }
const deliveryLabel = (d: string) => (DELIVERY[d] ? t(DELIVERY[d]) : d[0].toUpperCase() + d.slice(1))

export function AlertsPage() {
  const { api, settings, profiles, refresh } = useApp()
  const run = useAction()
  const log = useAsync('sent-alerts', () => api.sentAlerts(50), [])
  const integ = useAsync('integrations', () => api.integrations(), [])
  const wa = integ.data?.integrations.find(i => i.provider === 'whatsapp')
  const optedIn = profiles.filter(p => p.whatsapp_opt_in && p.phone && p.active).length

  const describe = (o: OutboxItem) => {
    if (o.kind === 'whatsapp') {
      const who = profiles.find(p => p.id === o.payload.profile_id)?.full_name ?? `+${o.payload.to}`
      const label = TEMPLATE_LABELS[o.payload.template ?? '']
      return { what: label ? t(label) : o.payload.template, to: who, channel: 'WhatsApp' }
    }
    if (o.kind === 'google_sync') return { what: t('Opening hours update'), to: t('Google Maps listing'), channel: 'Google' }
    if (o.kind === 'google_post') return { what: t('Post'), to: t('Google listing'), channel: 'Google' }
    return { what: t('Post'), to: 'Instagram', channel: 'Instagram' }
  }

  const { rows: sent, sort } = useSort(log.data ?? [], {
    when: o => o.created_at, what: o => describe(o).what, to: o => describe(o).to, status: o => o.status,
  }, { by: 'when', dir: 'desc' }, ['when'])
  if (!settings) return null

  return (
    <>
      <PageHeader eyebrow={t('Messages')} title={t('Alerts')} />

      {wa?.status !== 'connected' && (
        <Alert severity="warning" sx={{ mb: 2.5 }}>
          {tr('WhatsApp isn\'t connected yet, so alerts are saved but not delivered. Set it up on {connections}.', {
            connections: <Link to="/connections">{t('Connections')}</Link>,
          })}
        </Alert>
      )}

      <Grid container spacing={2.5}>
        <Grid size={12}>
          <Card>
            <CardContent>
              <SectionTitle>{t('What gets sent')}</SectionTitle>
              <Stack>
                {KINDS.map(k => (
                  <Stack key={k.key} direction="row" spacing={2} sx={{ py: 1.5, borderBottom: 1, borderColor: 'divider', alignItems: 'center', '&:last-of-type': { borderBottom: 0 } }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 500 }}>{t(k.title)}</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('{when} · to {who}', { when: t(k.when), who: t(k.who).toLowerCase() })}</Typography>
                    </Box>
                    <Switch checked={!!settings[k.key]} slotProps={{ input: { 'aria-label': t(k.title) } }}
                      onChange={e => run(async () => { await api.updateSettings({ [k.key]: e.target.checked }); await refresh() },
                        e.target.checked ? t('{title}: switched on', { title: t(k.title) }) : t('{title}: switched off', { title: t(k.title) }))} />
                  </Stack>
                ))}
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
                {tn(optedIn, '{n} team member receive WhatsApp alerts. Each person turns them on under My account; replying STOP turns them off.',
                  '{n} team members receive WhatsApp alerts. Each person turns them on under My account; replying STOP turns them off.')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={12}>
          <Card>
            <CardContent>
              <SectionTitle>{t('Recently sent')}</SectionTitle>
              {log.data && log.data.length === 0 && <Empty>{t('Nothing sent yet.')}</Empty>}
              {(log.data?.length ?? 0) > 0 && (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <SortCell sort={sort} id="when">{t('When')}</SortCell><SortCell sort={sort} id="what">{t('What')}</SortCell>
                        <SortCell sort={sort} id="to">{t('To')}</SortCell><SortCell sort={sort} id="status">{t('Status')}</SortCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sent.map(o => {
                        const d = describe(o)
                        const st = STATUS[o.status]
                        return (
                          <TableRow key={o.id}>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatLocal(o.created_at, 'd MMM HH:mm')}</TableCell>
                            <TableCell>{d.what}<Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{d.channel}</Typography></TableCell>
                            <TableCell>{d.to}</TableCell>
                            <TableCell>
                              <Tag fg={st.fg} bg={st.bg}>{o.delivery && o.status === 'sent' ? deliveryLabel(o.delivery) : t(st.label)}</Tag>
                              {o.last_error && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>{o.last_error}</Typography>}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  )
}
