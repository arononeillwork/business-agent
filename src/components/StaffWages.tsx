import {
  Alert, Box, Button, Dialog, FormControlLabel, Switch, DialogActions, DialogContent, DialogTitle, InputAdornment, Stack, Table, TableBody, TableCell, TableFooter,
  TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import RotaIcon from '@mui/icons-material/CalendarViewWeekOutlined'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useRotaMonth } from '../app/dailyCost'
import { useAction } from '../app/Notify'
import { Loading, PersonAvatar, Stat, StatRow } from './common'
import { addDays, currencySymbol, formatDuration, formatLocal, formatMoney, today, weekStart } from '../../shared/time'
import type { Expense } from '../../shared/types'
import { tokens } from '../theme'
import { t, tn } from '../i18n'

const monthOf = (d: string) => d.slice(0, 7)
const nextMonth = (m: string) => addDays(`${m}-28`, 4).slice(0, 7)
const monthName = (m: string) => formatLocal(`${m}-15T12:00:00Z`, 'MMMM yyyy')

/** Under the Staff wages line on Finances: the month's rota in hours and cost, or what it needs to be costed. */
export function WagesHint({ amount }: { amount: number }) {
  const { profiles } = useApp()
  const { month } = useRotaMonth(monthOf(today()))
  if (!month || !month.people.length) return null
  const names = month.unpriced.map(id => profiles.find(p => p.id === id)?.full_name ?? '?').join(', ')
  const diff = month.cost - amount
  return (
    <Typography variant="caption" sx={{ display: 'block', color: month.complete && Math.abs(diff) >= 1 ? tokens.warning : 'text.secondary' }}>
      {month.complete
        ? t('Rota this month: {hours} · {cost}', { hours: formatDuration(Math.round(month.hours * 60)), cost: formatMoney(month.cost) })
        : t('Rota this month: {hours} · add a pay rate for {names} to cost it', { hours: formatDuration(Math.round(month.hours * 60)), names })}
    </Typography>
  )
}

/**
 * Staff wages, opened from Finances: the rota's hours for the month, each person's pay rate and what
 * they cost (with the employer's Social Security), the week that costs most, and the estimate on
 * Finances set to the rota's figure in one press. A missing pay rate is typed in here.
 */
export function StaffWagesDialog({ expense, canEdit, onClose }: { expense: Expense; canEdit: boolean; onClose: () => void }) {
  const { api, profiles, refresh, settings, rates } = useApp()
  // Owner pay: whether the owners' rota hours are wages. Off, an owner's hours cost nothing here (their
  // rate stays set, and breakeven still counts it).
  const saved = settings?.owner_pay !== false
  // Shown at once while it saves; back as it was if saving fails.
  const [pending, setPending] = useState<boolean | null>(null)
  useEffect(() => setPending(null), [saved])
  const ownerPay = pending ?? saved
  const isOwner = (id: string) => { const p = profiles.find(x => x.id === id); return !!p && p.role === 'admin' && p.can_see_pay }
  const setOwnerPay = async (on: boolean) => {
    setPending(on)
    const ok = await run(async () => { await api.updateSettings({ owner_pay: on }); await refresh() },
      on ? t('Owners are paid for their hours on the rota') : t('Owners’ hours on the rota aren’t wages now (breakeven still counts them)'))
    if (!ok) setPending(null)
  }
  const run = useAction()
  const [month, setMonth] = useState(monthOf(today()))
  const { month: rota, error } = useRotaMonth(month)
  const mult = settings?.employer_cost_multiplier ?? 1
  const person = (id: string) => profiles.find(p => p.id === id)
  const setRate = (id: string, value: string) => {
    const v = Number(value)
    if (value === '' || !Number.isFinite(v) || v < 0) return
    void run(async () => { await api.setPayRate(id, v); await refresh() }, t('Pay rate saved'))
  }
  const useRota = () => run(async () => {
    await api.saveExpense({ ...expense, amount: Math.round(rota!.cost * 100) / 100 })
    await refresh()
    onClose()
  }, t('Staff wages set to {amount} from the rota', { amount: formatMoney(rota!.cost) }))

  // The weeks of the month (Monday to Sunday), with the one that costs most marked.
  const weeks = new Map<string, { hours: number; cost: number }>()
  for (const d of rota?.days ?? []) {
    const w = weekStart(d.date)
    const row = weeks.get(w) ?? { hours: 0, cost: 0 }
    row.hours += d.minutes / 60
    row.cost += d.cost
    weeks.set(w, row)
  }
  const weekRows = [...weeks.entries()].filter(([, w]) => w.hours > 0)
  const top = weekRows.reduce<string | null>((best, [w, v]) => (!best || v.cost > weeks.get(best)!.cost ? w : best), null)
  const busiest = (rota?.days ?? []).reduce<{ date: string; minutes: number; cost: number } | null>((b, d) => (!b || d.cost > b.cost || (d.cost === b.cost && d.minutes > b.minutes) ? d : b), null)
  const diff = rota ? rota.cost - Number(expense.amount) : 0

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth aria-labelledby="staff-wages-title">
      <DialogTitle id="staff-wages-title">{t('Staff wages: the rota’s hours and cost')}</DialogTitle>
      <DialogContent>
        <ToggleButtonGroup size="small" exclusive value={month} onChange={(_, m: string | null) => m && setMonth(m)} aria-label={t('Month')} sx={{ mb: 2 }}>
          <ToggleButton value={monthOf(today())}>{monthName(monthOf(today()))}</ToggleButton>
          <ToggleButton value={nextMonth(monthOf(today()))}>{monthName(nextMonth(monthOf(today())))}</ToggleButton>
        </ToggleButtonGroup>
        {error && <Alert severity="error">{error}</Alert>}
        {!rota ? <Loading /> : !rota.people.length ? (
          <Alert severity="info">{t('Nobody is on the published rota in {month} yet. Its hours and cost show here as soon as shifts are published.', { month: monthName(month) })}</Alert>
        ) : <>
          <StatRow>
            <Stat label={t('Hours on the rota')} value={formatDuration(Math.round(rota.hours * 60))} />
            <Stat label={t('From the rota')} value={rota.complete ? formatMoney(rota.cost) : '–'}
              note={rota.complete ? (mult !== 1 ? t('incl. ×{mult} employer cost', { mult }) : undefined) : t('needs every pay rate')} tone={rota.complete ? 'good' : 'warning'} />
            <Stat label={t('On Finances')} value={formatMoney(Number(expense.amount))}
              note={rota.complete && Math.abs(diff) >= 1 ? (diff > 0 ? t('{amount} under the rota', { amount: formatMoney(diff) }) : t('{amount} over the rota', { amount: formatMoney(-diff) })) : undefined}
              tone={rota.complete && Math.abs(diff) >= 1 ? 'warning' : undefined} />
          </StatRow>
          <FormControlLabel sx={{ mt: 1.5 }} disabled={!canEdit}
            control={<Switch checked={ownerPay} onChange={e => void setOwnerPay(e.target.checked)} slotProps={{ input: { 'aria-label': t('Owner pay') } }} />}
            label={<Box>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{t('Owner pay')}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                {ownerPay ? t('Owners on the rota are paid their rate, here, on the Rota and in Profit & loss.')
                  : t('Owners’ hours on the rota aren’t counted as wages here, on the Rota or in Profit & loss.')}
                {' '}{t('Breakeven always counts them at their rate.')}
              </Typography>
            </Box>} />
          {rota.unpriced.length > 0 && (
            <Alert severity="warning" sx={{ my: 2 }}>
              {canEdit
                ? t('{names}: no pay rate yet, so the rota can’t be costed. Type an hourly rate below (0 for an owner who draws no pay).', {
                  names: rota.unpriced.map(id => person(id)?.full_name ?? '?').join(', ') })
                : t('Someone on the rota has no pay rate yet, so it can’t be costed.')}
            </Alert>
          )}
          <Box sx={{ overflowX: 'auto', mt: 2 }}>
            <Table size="small" aria-label={t('Hours and cost by person')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('Person')}</TableCell><TableCell align="right">{t('Hours')}</TableCell>
                  <TableCell align="right">{t('Pay rate')}</TableCell><TableCell align="right">{t('Cost')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rota.people.map(p => {
                  const who = person(p.id)
                  return (
                    <TableRow key={p.id} sx={{ bgcolor: p.rate === null ? tokens.warnBg : undefined }}>
                      <TableCell>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          {who && <PersonAvatar name={who.full_name} colour={who.colour} size={26} />}
                          <span>{who?.full_name ?? '?'}</span>
                          {isOwner(p.id) && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{ownerPay ? t('owner') : t('owner · not paid')}</Typography>}
                        </Stack>
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatDuration(p.minutes)}</TableCell>
                      <TableCell align="right" sx={{ width: 150 }}>
                        {canEdit ? (
                          <TextField size="small" type="number" defaultValue={rates.get(p.id) ?? ''} key={`${p.id}:${rates.get(p.id)}`} placeholder={t('Not set')}
                            onBlur={e => { if (e.target.value !== String(rates.get(p.id) ?? '')) setRate(p.id, e.target.value) }}
                            slotProps={{ input: { endAdornment: <InputAdornment position="end">{t('{currency}/h', { currency: currencySymbol() })}</InputAdornment> },
                              htmlInput: { step: 0.05, min: 0, 'aria-label': t('Hourly rate for {name}', { name: who?.full_name ?? '' }), style: { textAlign: 'right' } } }} />
                        ) : !rates.has(p.id) ? t('Not set') : `${formatMoney(rates.get(p.id)!)}/h`}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{p.rate === null ? '–' : formatMoney(p.cost)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell sx={{ fontWeight: 500, color: 'text.primary' }}>{t('Total')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 500, color: 'text.primary' }}>{formatDuration(Math.round(rota.hours * 60))}</TableCell>
                  <TableCell />
                  <TableCell align="right" sx={{ fontWeight: 500, color: 'text.primary' }}>{rota.complete ? formatMoney(rota.cost) : '–'}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Box>
          {weekRows.length > 0 && (
            <Box component="section" aria-label={t('By week')} sx={{ mt: 2.5 }}>
              <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('By week')}</Typography>
              <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                {weekRows.map(([w, v]) => {
                  const max = Math.max(...weekRows.map(([, x]) => (rota.complete ? x.cost : x.hours)))
                  const value = rota.complete ? v.cost : v.hours
                  const isTop = rota.complete && w === top && weekRows.length > 1
                  return (
                    <Stack key={w} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ width: 120, flexShrink: 0 }}>{t('Week of {date}', { date: formatLocal(`${w}T12:00:00Z`, 'd MMM') })}</Typography>
                      <Box sx={{ flex: 1, height: 10, borderRadius: 5, bgcolor: 'divider', overflow: 'hidden' }}>
                        <Box sx={{ width: `${max ? Math.max(3, value / max * 100) : 0}%`, height: '100%', bgcolor: isTop ? tokens.warning : 'primary.main' }} />
                      </Box>
                      <Typography variant="body2" sx={{ width: 150, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: isTop ? 600 : 400 }}>
                        {formatDuration(Math.round(v.hours * 60))}{rota.complete ? ` · ${formatMoney(v.cost)}` : ''}
                      </Typography>
                      <Tooltip title={t('Open this week on the rota, with its cost')}>
                        <Button size="small" component={RouterLink} to={`/rota?costs=1&week=${w}`} aria-label={t('Open the week of {date} on the rota', { date: formatLocal(`${w}T12:00:00Z`, 'd MMM') })}>
                          <RotaIcon fontSize="small" />
                        </Button>
                      </Tooltip>
                    </Stack>
                  )
                })}
              </Stack>
              {rota.complete && busiest && busiest.cost > 0 && (
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
                  {t('Costliest day: {day}, {amount} for {hours} on the rota.', { day: formatLocal(`${busiest.date}T12:00:00Z`, 'EEEE d MMMM'), amount: formatMoney(busiest.cost), hours: formatDuration(busiest.minutes) })}
                </Typography>
              )}
              {!rota.complete && (
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 1 }}>
                  {tn(rota.people.length, '{n} person on the rota this month', '{n} people on the rota this month')}
                </Typography>
              )}
            </Box>
          )}
        </>}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button component={RouterLink} to={`/rota?costs=1&week=${weekStart(month === monthOf(today()) ? today() : `${month}-01`)}`} startIcon={<RotaIcon />}>{t('Open the rota with its cost')}</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>{t('Close')}</Button>
        {canEdit && rota?.complete && Math.abs(diff) >= 1 && (
          <Button variant="contained" onClick={useRota}>{t('Use {amount} from the rota', { amount: formatMoney(rota.cost) })}</Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
