import { Box, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { useState } from 'react'
import { useApp } from '../../app/AppContext'
import { Empty, ErrorBox, Loading, StatGrid, StatTile, Tag } from '../../components/common'
import { formatLocal, today } from '../../../shared/time'
import { businessKindLabel, introStage, stageInfo, type IntroStage } from '../../../shared/hqReps'
import { helpLabel, helpNeeded } from '../../../shared/adminArea'
import { useAdminQuery } from './shared'
import { tokens } from '../../theme'
import { t } from '../../i18n'

type Show = 'all' | 'help' | 'trial' | 'paying'
const TONE: Record<'good' | 'info' | 'warn' | 'bad' | 'neutral', { fg: string; bg: string }> = {
  good: { fg: tokens.goodFg, bg: tokens.goodBg }, info: { fg: tokens.infoFg, bg: tokens.infoBg }, warn: { fg: tokens.warnFg, bg: tokens.warnBg },
  bad: { fg: tokens.neutralFg, bg: tokens.neutralBg }, neutral: { fg: tokens.neutralFg, bg: tokens.neutralBg },
}
const day = (d: string) => formatLocal(d, 'd MMM yyyy')
/** Columns a phone leaves out (said under the business's name instead). */
const WIDE = { display: { xs: 'none', sm: 'table-cell' } }

/**
 * Onboarding: every business that signed up with a rep's code (HQ's list), newest first: whose code, where
 * it is (signed up, set up, on a trial, paying, payment failed, cancelled), and whether it needs a hand,
 * which is where the half hour helping it set up happens.
 */
export function OnboardingTab() {
  const { api } = useApp()
  const hq = useAdminQuery('hq', tk => api.adminHq(tk))
  const [show, setShow] = useState<Show>('all')
  const now = today('Europe/Madrid')
  if (!hq.data) return hq.error ? <ErrorBox error={hq.error} /> : <Loading />
  const repName = (id: string | null) => hq.data!.reps.find(r => r.id === id)?.name ?? null
  const rows = hq.data.introductions.map(i => ({ i, stage: introStage(i) as IntroStage, help: helpNeeded(i, now) }))
  const count = (s: Show) => rows.filter(r => s === 'all' || (s === 'help' ? !!r.help : s === 'trial' ? r.stage === 'trial' || r.stage === 'signed_up' || r.stage === 'set_up' : r.stage === 'paying')).length
  const shown = rows.filter(r => show === 'all' || (show === 'help' ? !!r.help : show === 'trial' ? ['trial', 'signed_up', 'set_up'].includes(r.stage) : r.stage === 'paying'))

  return (
    <Stack spacing={2}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('Every business that signed up with a rep’s code, and how it’s getting on. Help one that hasn’t finished setting up: it’s the half hour that makes it stay.')}
      </Typography>
      <StatGrid>
        <StatTile label={t('Signed up with a code')} value={rows.length} />
        <StatTile label={t('Getting started')} value={count('trial')} />
        <StatTile label={t('Paying')} value={count('paying')} />
        <StatTile label={t('Need a hand')} value={count('help')} />
      </StatGrid>
      <ToggleButtonGroup exclusive size="small" value={show} onChange={(_, v: Show | null) => v && setShow(v)} aria-label={t('Show')}>
        <ToggleButton value="all">{t('All')}</ToggleButton>
        <ToggleButton value="help">{t('Need a hand')}</ToggleButton>
        <ToggleButton value="trial">{t('Getting started')}</ToggleButton>
        <ToggleButton value="paying">{t('Paying')}</ToggleButton>
      </ToggleButtonGroup>
      <ErrorBox error={hq.error} />
      {shown.length === 0 ? <Empty>{t('No businesses here yet.')}</Empty> : (
        <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Table size="small" aria-label={t('Businesses that signed up with a code')}>
            <TableHead>
              <TableRow>
                <TableCell>{t('Business')}</TableCell>
                <TableCell sx={WIDE}>{t('Code')}</TableCell>
                <TableCell sx={WIDE}>{t('Signed up')}</TableCell>
                <TableCell>{t('Where it is')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map(({ i, stage, help }) => {
                const info = stageInfo(stage)
                return (
                  <TableRow key={i.id}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{i.name}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{t(businessKindLabel(i.kind))}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: { xs: 'block', sm: 'none' } }}>
                        {t('Signed up {date} with {code}', { date: day(i.created_at), code: i.code })}
                      </Typography>
                    </TableCell>
                    <TableCell sx={WIDE}>
                      <Typography variant="body2">{i.code}</Typography>
                      {repName(i.rep_id) && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{repName(i.rep_id)}</Typography>}
                    </TableCell>
                    <TableCell sx={WIDE}>{day(i.created_at)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        <Tag {...TONE[info.tone]}>{t(info.label)}</Tag>
                        {help && <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t(helpLabel(help))}</Tag>}
                      </Box>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  )
}
