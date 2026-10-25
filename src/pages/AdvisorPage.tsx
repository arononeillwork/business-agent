import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material'
import GoodIcon from '@mui/icons-material/CheckCircleOutlined'
import WarnIcon from '@mui/icons-material/ErrorOutlineOutlined'
import InfoIcon from '@mui/icons-material/LightbulbOutlined'
import ArrowIcon from '@mui/icons-material/ArrowForwardRounded'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAdvice } from '../app/insightsData'
import { Empty, ErrorBox, Loading, PageHeader, SectionTitle } from '../components/common'
import { ADVICE_AREAS, type Advice, type AdviceArea } from '../../shared/insights'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

const TONE = {
  warn: { Icon: WarnIcon, colour: tokens.warnFg, bg: tokens.warnBg },
  info: { Icon: InfoIcon, colour: tokens.infoFg, bg: tokens.infoBg },
  good: { Icon: GoodIcon, colour: tokens.goodFg, bg: tokens.goodBg },
}

/** One finding: what it is, what the figures say, and where to act on it. */
export function AdviceCard({ a, compact }: { a: Advice; compact?: boolean }) {
  const { Icon, colour } = TONE[a.tone]
  return (
    <Box component="article" aria-label={t(a.title)} sx={{ display: 'flex', gap: 1.5, py: compact ? 1 : 1.5, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 } }}>
      <Icon sx={{ color: colour, mt: 0.25, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }}>{t(a.title)}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>{t(a.text, a.vars)}</Typography>
      </Box>
      {a.to && !compact && (
        <Button size="small" component={RouterLink} to={a.to} endIcon={<ArrowIcon />} sx={{ flexShrink: 0, alignSelf: 'center' }}>{t('Open page')}</Button>
      )}
    </Box>
  )
}

/**
 * Business advisor (Insights, admins): what the last weeks of takings, timecards, the menu, stock
 * and reviews say, and what to try: opening hours (quiet or busy first and last hours), sales patterns
 * (weak days, peak hours, the trend, the average sale), the menu (best and slow sellers, margins, the
 * area's prices), the team (staffing against takings, late starts) and waste. Worked out in the app
 * from figures it already has (shared/insights.ts); nothing is sent anywhere.
 */
export function AdvisorPage() {
  const { isAdmin, canSeePay } = useApp()
  const { advice, loading, till, money, error } = useAdvice()
  const [area, setArea] = useState<AdviceArea | null>(null)
  const act = advice.filter(a => a.tone === 'warn').slice(0, 3)
  const shown = area ? advice.filter(a => a.area === area) : advice
  return (
    <>
      <PageHeader eyebrow={t('Insights')} title={t('Business advisor')} />
      <Typography sx={{ color: 'text.secondary', mb: 2.5, maxWidth: 780 }}>
        {t('What your takings, timecards, menu, stock and reviews say, and what to try next. Worked out from the last eight weeks; it changes as they do.')}
      </Typography>
      <ErrorBox error={error} />
      {isAdmin && !till && (
        <Alert severity="info" sx={{ mb: 2.5 }} action={<Button color="inherit" component={RouterLink} to="/connections">{t('Connections')}</Button>}>
          {t('Connect Square, SumUp or Stripe for advice on opening hours, sales patterns, the menu and staffing: it all starts from the takings.')}
        </Alert>
      )}
      {isAdmin && till && !canSeePay && (
        <Alert severity="info" sx={{ mb: 2.5 }}>{t('Advice on takings and team costs is for admins with pay access.')}</Alert>
      )}
      {loading ? <Loading /> : advice.length === 0 ? (
        <Card><CardContent><Empty>{money ? t('Nothing stands out yet: advice comes once there are a few weeks of takings.') : t('Nothing to say yet.')}</Empty></CardContent></Card>
      ) : <>
        {act.length > 0 && (
          <Card component="section" aria-label={t('Worth acting on first')} sx={{ mb: 3, borderLeft: `4px solid ${tokens.rose}` }}>
            <CardContent>
              <SectionTitle>{t('Worth acting on first')}</SectionTitle>
              {act.map(a => <AdviceCard key={a.id} a={a} />)}
            </CardContent>
          </Card>
        )}
        <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', mb: 2 }} role="group" aria-label={t('Area')}>
          <Chip label={t('Everything ({n})', { n: advice.length })} onClick={() => setArea(null)} aria-pressed={!area}
            color={!area ? 'primary' : 'default'} variant={!area ? 'filled' : 'outlined'} />
          {ADVICE_AREAS.filter(x => advice.some(a => a.area === x.id)).map(x => (
            <Chip key={x.id} label={`${t(x.label)} ${advice.filter(a => a.area === x.id).length}`} onClick={() => setArea(area === x.id ? null : x.id)}
              aria-pressed={area === x.id} color={area === x.id ? 'primary' : 'default'} variant={area === x.id ? 'filled' : 'outlined'} />
          ))}
        </Stack>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' } }}>
          {ADVICE_AREAS.map(x => {
            const list = shown.filter(a => a.area === x.id)
            if (!list.length) return null
            return (
              <Card key={x.id} component="section" aria-label={t(x.label)}>
                <CardContent>
                  <SectionTitle>{t(x.label)}</SectionTitle>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: -1, mb: 1 }}>{t(x.hint)}</Typography>
                  {list.map(a => <AdviceCard key={a.id} a={a} />)}
                </CardContent>
              </Card>
            )
          })}
        </Box>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 2.5 }}>
          {tn(advice.length, '{n} finding, from figures already in the app. Nothing is sent anywhere to work it out.', '{n} findings, from figures already in the app. Nothing is sent anywhere to work them out.')}
        </Typography>
      </>}
    </>
  )
}
