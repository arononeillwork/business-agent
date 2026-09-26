import { Alert, Box, Card, CardContent, Grid, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { Empty, PageHeader, SectionTitle, Tag } from '../components/common'
import { formatLocal } from '../../shared/time'
import type { OutboxItem, Settings } from '../../shared/types'
import { tokens } from '../theme'

const KINDS: { key: keyof Settings; title: string; who: string; when: string }[] = [
  { key: 'alert_shift_reminders', title: 'Shift reminders', who: 'The person on shift', when: 'One hour before each shift' },
  { key: 'alert_missed_clock_in', title: 'Missed clock-in', who: 'The person, and admins', when: '15 minutes after a shift starts with no clock-in' },
  { key: 'alert_rota', title: 'Weekly rota', who: 'Everyone on the rota', when: 'When an admin taps "Send on WhatsApp" on the Rota' },
  { key: 'alert_time_off', title: 'Time off', who: 'Admins, then the person who asked', when: 'When time off is requested, and when it is decided' },
]

const TEMPLATE_LABELS: Record<string, string> = {
  shift_reminder: 'Shift reminder', missed_clock_in: 'Missed clock-in', missed_clock_in_admin: 'Missed clock-in (admin)',
  rota_published: 'Weekly rota', time_off_requested: 'Time off requested', time_off_decided: 'Time off decided', hello_world: 'Test message',
}

const STATUS: Record<OutboxItem['status'], { label: string; fg: string; bg: string }> = {
  pending: { label: 'Waiting', fg: tokens.ubeDeep, bg: tokens.ubeSoft },
  sending: { label: 'Sending', fg: tokens.ubeDeep, bg: tokens.ubeSoft },
  sent: { label: 'Sent', fg: tokens.matchaDeep, bg: tokens.matchaSoft },
  failed: { label: 'Retrying', fg: '#7E3F4B', bg: tokens.roseWash },
  dead: { label: 'Failed', fg: '#8E2B3A', bg: tokens.dangerSoft },
}

export function AlertsPage() {
  const { api, settings, profiles, refresh } = useApp()
  const run = useAction()
  const log = useAsync('sent-alerts', () => api.sentAlerts(50), [])
  const integ = useAsync('integrations', () => api.integrations(), [])
  const wa = integ.data?.integrations.find(i => i.provider === 'whatsapp')
  const optedIn = profiles.filter(p => p.whatsapp_opt_in && p.phone && p.active).length
  if (!settings) return null

  const describe = (o: OutboxItem) => {
    if (o.kind === 'whatsapp') {
      const who = profiles.find(p => p.id === o.payload.profile_id)?.full_name ?? `+${o.payload.to}`
      return { what: TEMPLATE_LABELS[o.payload.template ?? ''] ?? o.payload.template, to: who, channel: 'WhatsApp' }
    }
    if (o.kind === 'google_sync') return { what: 'Opening hours update', to: 'Google Maps listing', channel: 'Google' }
    if (o.kind === 'google_post') return { what: 'Post', to: 'Google listing', channel: 'Google' }
    return { what: 'Post', to: 'Instagram', channel: 'Instagram' }
  }

  return (
    <>
      <PageHeader eyebrow="Messages" title="Alerts"
        subtitle="Choose which WhatsApp alerts go out, and see everything the app has sent to WhatsApp, Google and Instagram." />

      {wa?.status !== 'connected' && (
        <Alert severity="warning" sx={{ mb: 2.5 }}>
          WhatsApp isn't connected yet, so alerts are saved but not delivered. Set it up on <Link to="/connections">Connections</Link>.
        </Alert>
      )}

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card>
            <CardContent>
              <SectionTitle>What gets sent</SectionTitle>
              <Stack>
                {KINDS.map(k => (
                  <Stack key={k.key} direction="row" spacing={2} sx={{ py: 1.5, borderBottom: 1, borderColor: 'divider', alignItems: 'center', '&:last-of-type': { borderBottom: 0 } }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 600 }}>{k.title}</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{k.when} · to {k.who.toLowerCase()}</Typography>
                    </Box>
                    <Switch checked={!!settings[k.key]} slotProps={{ input: { 'aria-label': k.title } }}
                      onChange={e => run(async () => { await api.updateSettings({ [k.key]: e.target.checked }); await refresh() },
                        `${k.title} ${e.target.checked ? 'on' : 'off'}`)} />
                  </Stack>
                ))}
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>
                {optedIn} team member{optedIn === 1 ? '' : 's'} receive WhatsApp alerts. Each person turns them on under My account; replying STOP turns them off.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card>
            <CardContent>
              <SectionTitle>Recently sent</SectionTitle>
              {log.data && log.data.length === 0 && <Empty>Nothing sent yet.</Empty>}
              {(log.data?.length ?? 0) > 0 && (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead><TableRow><TableCell>When</TableCell><TableCell>What</TableCell><TableCell>To</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
                    <TableBody>
                      {log.data!.map(o => {
                        const d = describe(o)
                        const st = STATUS[o.status]
                        return (
                          <TableRow key={o.id}>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatLocal(o.created_at, 'd MMM HH:mm')}</TableCell>
                            <TableCell>{d.what}<Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{d.channel}</Typography></TableCell>
                            <TableCell>{d.to}</TableCell>
                            <TableCell>
                              <Tag fg={st.fg} bg={st.bg}>{o.delivery && o.status === 'sent' ? o.delivery[0].toUpperCase() + o.delivery.slice(1) : st.label}</Tag>
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
