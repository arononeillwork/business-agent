// Today's takings against the day's breakeven (what it costs to run the business today: the running
// costs on Finances spread over the open days, plus the team on the rota), for the Today page: the
// figure, a bar that fills towards the breakeven mark and goes green past it, and the takings building
// up through the day against the breakeven line. Admins with pay access and a till only.
import { Box, Button, Stack, Typography } from '@mui/material'
import DoneIcon from '@mui/icons-material/CheckCircleRounded'
import UpIcon from '@mui/icons-material/TrendingUpRounded'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useDailyCosts } from '../app/dailyCost'
import { useTick } from '../app/hooks'
import { useSales, useTakings } from './dashboardWidgets'
import { RunningTotal } from './charts'
import { dashRange } from '../../shared/dashboards'
import { takingsSoFar } from '../../shared/todayGlance'
import { currencySymbol, dayKey, formatMoney, formatNumber, localTime, today } from '../../shared/time'
import { fonts, tokens } from '../theme'
import { t } from '../i18n'

const wholeMoney = (n: number) => `${currencySymbol()}${formatNumber(Math.round(n))}`
const hourText = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

/** The card's body: takings so far, the bar to breakeven, and the day so far as a line. */
export function BreakevenToday() {
  const { business } = useApp()
  const { on, ready } = useTakings()
  useTick(60_000)
  const d = today()
  const sales = useSales(dashRange('today', d))
  const { costs, error: costError } = useDailyCosts(d, d, on)
  if (!ready || (on && !sales.data && !sales.error)) return <Typography variant="body2" sx={{ color: 'text.secondary', py: 1.5 }}>{t('Loading…')}</Typography>
  if (sales.error) return <Typography variant="body2" sx={{ color: 'text.secondary', py: 1.5 }}>{sales.error}</Typography>

  const [hh, mm] = localTime(new Date()).split(':').map(Number)
  const now = hh + mm / 60
  const cost = costs?.[0]
  const day = sales.data?.days.find(x => x.date === d)
  const r = takingsSoFar(day, cost?.open ? cost.total : 0, now, business?.opening_hours[dayKey(d)])
  const known = !!cost && cost.open && cost.total > 0
  const there = known && r.takings >= r.breakeven
  // The bar's scale: up to breakeven, or further once the takings pass it.
  const scale = Math.max(r.takings, r.breakeven, 1)
  const mark = known ? r.breakeven / scale : null

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
        <Box>
          <Typography sx={{ fontFamily: fonts.display, fontSize: '2.1rem', lineHeight: 1.15, overflowWrap: 'anywhere' }}>{formatMoney(r.takings)}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {known ? t('so far, of {money} to break even', { money: formatMoney(r.breakeven) }) : t('so far today')}
          </Typography>
        </Box>
        {known && (
          <Stack direction="row" spacing={0.5} role="status" sx={{ alignItems: 'center', px: 1.25, py: 0.5, borderRadius: 99,
            color: there ? tokens.goodFg : tokens.warnFg, bgcolor: there ? tokens.goodBg : tokens.warnBg }}>
            {there ? <DoneIcon sx={{ fontSize: 17 }} /> : <UpIcon sx={{ fontSize: 17 }} />}
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {there ? t('{money} over breakeven', { money: formatMoney(r.over) }) : t('{money} to go', { money: formatMoney(r.short) })}
            </Typography>
          </Stack>
        )}
      </Stack>

      {known && (
        <Box sx={{ mt: 1.75 }}>
          <Box role="meter" aria-valuemin={0} aria-valuemax={Math.round(r.breakeven * 100) / 100} aria-valuenow={Math.round(Math.min(r.takings, r.breakeven) * 100) / 100}
            aria-label={t('Takings towards breakeven')}
            aria-valuetext={t('{takings} of {breakeven} ({pct}%)', { takings: formatMoney(r.takings), breakeven: formatMoney(r.breakeven), pct: Math.round((r.share ?? 0) * 100) })}
            sx={{ position: 'relative', height: 12, borderRadius: 6, bgcolor: tokens.roseSoft }}>
            {/* Up to breakeven in the brand pink, the part above it in green: a 2px gap between them. */}
            <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 6, bgcolor: tokens.chart,
              width: `${Math.min(r.takings, r.breakeven) / scale * 100}%` }} />
            {there && r.over > 0 && (
              <Box sx={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 6, bgcolor: tokens.matcha,
                left: `calc(${mark! * 100}% + 2px)`, width: `calc(${r.over / scale * 100}% - 2px)` }} />
            )}
            <Box aria-hidden sx={{ position: 'absolute', top: -4, bottom: -4, width: 2, borderRadius: 1, bgcolor: tokens.ink,
              left: `calc(${mark! * 100}% - 1px)` }} />
          </Box>
          <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.5 }} aria-hidden>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatMoney(0)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              {r.reachedAt ? t('Broke even by {time}', { time: r.reachedAt }) : t('Breakeven {money}', { money: formatMoney(r.breakeven) })}
            </Typography>
          </Stack>
        </Box>
      )}

      {r.points.length > 1 && (
        <Box sx={{ mt: 1.5 }}>
          <RunningTotal points={r.points} from={r.from} to={r.to} target={known ? r.breakeven : undefined} targetName={t('Breakeven')}
            format={formatMoney} axisFormat={wholeMoney} tipTitle={p => t('By {time}', { time: hourText(p.at) })}
            label={known
              ? t('Takings through the day, {takings} so far, against a breakeven of {breakeven}', { takings: formatMoney(r.takings), breakeven: formatMoney(r.breakeven) })
              : t('Takings through the day, {takings} so far', { takings: formatMoney(r.takings) })} />
        </Box>
      )}

      {cost && !cost.open && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>{t('Closed today: there’s no breakeven to reach.')}</Typography>}
      {cost && cost.open && cost.total <= 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('Add the running costs on Finances to see the day’s breakeven.')}</Typography>
          <Button size="small" component={RouterLink} to="/finances" sx={{ ml: -1 }}>{t('Finances')}</Button>
        </Box>
      )}
      {costError && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>{costError}</Typography>}
      {known && (
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
          {cost!.teamFrom === 'rota'
            ? t('Breakeven: the running costs on Finances for a day, plus the team on today’s rota.')
            : t('Breakeven: the running costs on Finances for a day, with the team from the Staff wages estimate.')}
        </Typography>
      )}
    </Box>
  )
}
