import { Box, Button, Card, CardContent, IconButton, Stack, Typography } from '@mui/material'
import CopyIcon from '@mui/icons-material/ContentCopyOutlined'
import GroupIcon from '@mui/icons-material/GroupsOutlined'
import { useState } from 'react'
import { useApp } from '../../app/AppContext'
import { useNotify } from '../../app/Notify'
import { Empty, ErrorBox, Loading } from '../../components/common'
import { QrPicture } from '../../components/QrCode'
import { formatMoney } from '../../../shared/time'
import { introStage } from '../../../shared/hqReps'
import type { Earnings } from '../../../shared/adminArea'
import { TeamDialog } from './SettingsTab'
import { signUpLink, useAdminQuery } from './shared'
import { tokens } from '../../theme'
import { t, tn } from '../../i18n'

const NOTHING: Earnings = { earned: 0, waiting: 0, paid: 0, owed: 0 }

/**
 * Sales team: each salesperson's code, sign-up link and QR (a business that signs up with it gets a month free
 * and is theirs), the businesses they've brought and how many pay, and their commission: counted, waiting
 * its 30 days, paid out, and owed.
 */
export function TeamTab() {
  const { api } = useApp()
  const notify = useNotify()
  const board = useAdminQuery('sales', tk => api.salesBoard(tk))
  const hq = useAdminQuery('hq', tk => api.adminHq(tk))
  const [managing, setManaging] = useState(false)
  if (!board.data || !hq.data) return board.error ?? hq.error ? <ErrorBox error={board.error ?? hq.error} /> : <Loading />
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); notify(t('Copied'), 'success') } catch { notify(t('Select the link and copy it'), 'info') }
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
          {t('A business that signs up with someone’s code gets its first month free, and is theirs: €50 at its first payment, then 20% for its first 12 paid months.')}
        </Typography>
        <Button startIcon={<GroupIcon />} onClick={() => setManaging(true)} sx={{ flexShrink: 0 }}>{t('Change the team')}</Button>
      </Stack>
      {board.data.team.length === 0 && <Empty>{t('Nobody on the sales team yet.')}</Empty>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        {board.data.team.map(m => {
          const mine = hq.data!.introductions.filter(i => i.rep_id && i.rep_id === m.rep_id)
          const paying = mine.filter(i => introStage(i) === 'paying').length
          const money = (m.rep_id && hq.data!.earnings[m.rep_id]) || NOTHING
          const link = m.code ? signUpLink(m.code) : null
          return (
            <Card key={m.id} component="section" aria-label={m.name} variant="outlined">
              <CardContent>
                <Stack direction="row" spacing={2}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h6" component="h2">{m.name}</Typography>
                    {m.code && link ? <>
                      <Typography variant="body2" sx={{ fontWeight: 600, letterSpacing: 1 }} aria-label={t('Code {code}', { code: m.code })}>{m.code}</Typography>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</Typography>
                        <IconButton size="small" onClick={() => void copy(link)} aria-label={t('Copy the sign-up link of {name}', { name: m.name })}><CopyIcon fontSize="small" /></IconButton>
                      </Stack>
                    </> : <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('No code yet')}</Typography>}
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      {tn(mine.length, '{n} business brought, {paying} paying', '{n} businesses brought, {paying} paying', { paying })}
                    </Typography>
                  </Box>
                  {link && <QrPicture payload={link} look={{ dark: '#1F1A17', light: '#FFFFFF' }} size={96} label={t('QR code for the sign-up link of {name}', { name: m.name })} />}
                </Stack>
                <Box role="list" aria-label={t('Commission of {name}', { name: m.name })}
                  sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1, mt: 2, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
                  <Money label={t('Earned')} value={money.earned} />
                  <Money label={t('Waiting')} value={money.waiting} />
                  <Money label={t('Paid out')} value={money.paid} />
                  <Money label={t('Owed')} value={money.owed} strong />
                </Box>
              </CardContent>
            </Card>
          )
        })}
      </Box>
      {managing && <TeamDialog team={board.data.team} onClose={() => setManaging(false)} />}
    </Stack>
  )
}

function Money({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <Box role="listitem" aria-label={label}>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 600 : 400, color: strong && value > 0 ? tokens.goodFg : undefined }}>{formatMoney(value)}</Typography>
    </Box>
  )
}
