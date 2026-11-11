import {
  Alert, Box, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/EditOutlined'
import { useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction } from '../app/Notify'
import { usePlan } from '../app/plan'
import { Empty, ErrorBox, Loading, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import { Freshness } from '../components/Freshness'
import { SquareLoginsDialog } from '../components/SquareLogins'
import type { ExportTable } from '../lib/export'
import { addDays, formatDuration, formatLocal, formatMoney, today, weekStart, zonedIso } from '../../shared/time'
import {
  POOL_STATUSES, TIP_SPLITS, minutesWorked, myTips, poolStatusLabel, splitLabel, splitTips,
  type PoolStatus, type TipPool, type TipPoolInput, type TipSplit,
} from '../../shared/tips'
import { LEADER_PERIODS, periodRange, type LeaderPeriod } from '../../shared/leaderboard'
import { RECONNECT_TEAM } from '../../shared/squareTeam'
import { tokens } from '../theme'
import { t, tn } from '../i18n'
import { countryProfile } from '../../shared/country'

const day = (d: string) => formatLocal(`${d}T12:00:00Z`, 'd MMM')
const period = (p: Pick<TipPool, 'starts_on' | 'ends_on'>) => (p.starts_on === p.ends_on ? day(p.starts_on) : `${day(p.starts_on)} – ${formatLocal(`${p.ends_on}T12:00:00Z`, 'd MMM yyyy')}`)
const TONE: Record<PoolStatus, { fg: string; bg: string }> = {
  draft: { fg: tokens.neutralFg, bg: tokens.neutralBg }, shared: { fg: tokens.warnFg, bg: tokens.warnBg }, paid: { fg: tokens.goodFg, bg: tokens.goodBg },
}
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Tips (Team): what customers left over a period (cash in the jar, card tips from the till) shared
 * out by the hours each person worked (Timecards) or equally. Everyone sees their own share once
 * it's shared out; admins with pay access share them out and mark them paid; a payroll gestoría reads.
 * With Square connected, the tips left at the till come in too, by who took each payment.
 */
export function TipsPage() {
  const { api, me, profiles, canSeePay, isPartner } = useApp()
  const pools = useAsync('tip-pools', () => api.tipPools(), [])
  const [editing, setEditing] = useState<TipPool | 'new' | null>(null)
  const manages = canSeePay && !isPartner
  const seesAll = canSeePay
  const all = pools.data ?? []
  const nameOf = (id: string) => profiles.find(p => p.id === id)?.full_name ?? ''
  const year = today().slice(0, 4)
  const mine = myTips(all, me?.id ?? '')
  const thisYear = all.filter(p => p.starts_on.startsWith(year) && p.status !== 'draft')
  const unpaid = all.filter(p => p.status === 'shared')

  const table = (): ExportTable => ({
    title: t('Tips'), filename: `tips-${today()}`,
    columns: [t('First day'), t('Last day'), t('Person'), t('Hours'), t('Their share'), t('Status')],
    rows: all.filter(p => p.status !== 'draft').flatMap(p => p.shares.map(s => [p.starts_on, p.ends_on, nameOf(s.profile_id), round2(s.minutes / 60), s.amount, t(poolStatusLabel(p.status))])),
    money: [4],
  })

  return (
    <>
      <PageHeader eyebrow={t('Team')} title={t('Tips')} actions={<>
        {seesAll && <ExportButton table={table} disabled={!all.length} folder="Tips" />}
        {manages && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing('new')}>{t('Share out tips')}</Button>}
      </>} />
      <ErrorBox error={pools.error} />

      {seesAll ? (
        <StatGrid>
          <StatTile label={t('Tips this year')} value={pools.data ? formatMoney(thisYear.reduce((s, p) => s + p.cash + p.card, 0)) : '–'} note={tn(thisYear.length, '{n} pool shared out', '{n} pools shared out')} />
          <StatTile label={t('Still to pay')} value={formatMoney(unpaid.reduce((s, p) => s + p.cash + p.card, 0))} note={unpaid.length ? unpaid.map(period).join(', ') : t('All paid')} />
          <StatTile label={t('Last shared out')} value={all[0] ? formatMoney(all[0].cash + all[0].card) : '–'} note={all[0] ? period(all[0]) : t('None yet')} />
        </StatGrid>
      ) : (
        <StatGrid>
          <StatTile label={t('Your tips')} value={pools.data ? formatMoney(mine.total) : '–'} note={tn(mine.list.length, 'From {n} pool', 'From {n} pools')} />
          <StatTile label={t('Still to be paid')} value={formatMoney(mine.unpaid)} />
        </StatGrid>
      )}

      {!isPartner && <TillTipsCard />}

      <Card component="section" aria-label={seesAll ? t('Tips shared out') : t('Your tips')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{seesAll ? t('Tips shared out') : t('Your tips')}</SectionTitle>
          {all.length === 0
            ? <Empty>{pools.data ? (manages ? t('No tips shared out yet. Count the jar, add the card tips and share them out by hours.') : t('No tips shared out with you yet.')) : t('Loading…')}</Empty>
            : seesAll
              ? <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead><TableRow>
                      <TableCell>{t('Period')}</TableCell><TableCell align="right">{t('Cash')}</TableCell><TableCell align="right">{t('Card')}</TableCell>
                      <TableCell align="right">{t('Total')}</TableCell><TableCell>{t('Split')}</TableCell><TableCell>{t('Status')}</TableCell><TableCell />
                    </TableRow></TableHead>
                    <TableBody>
                      {all.map(p => (
                        <TableRow key={p.id} hover>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{period(p)}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(p.cash)}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(p.card)}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{formatMoney(p.cash + p.card)}</TableCell>
                          <TableCell sx={{ minWidth: 220 }}>
                            <Typography variant="body2">{t(splitLabel(p.split))}</Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{p.shares.map(s => `${nameOf(s.profile_id)} ${formatMoney(s.amount)}`).join(' · ')}</Typography>
                          </TableCell>
                          <TableCell><Tag {...TONE[p.status]}>{t(poolStatusLabel(p.status))}</Tag></TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                            {manages && p.status === 'shared' && <PaidButton pool={p} />}
                            {manages && <IconButton size="small" aria-label={t('Edit the tips for {period}', { period: period(p) })} onClick={() => setEditing(p)}><EditIcon fontSize="small" /></IconButton>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              : <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead><TableRow>
                      <TableCell>{t('Period')}</TableCell><TableCell>{t('Your hours')}</TableCell><TableCell align="right">{t('Your share')}</TableCell><TableCell>{t('Status')}</TableCell>
                    </TableRow></TableHead>
                    <TableBody>
                      {mine.list.map(({ pool, share }) => (
                        <TableRow key={pool.id} hover>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{period(pool)}</TableCell>
                          <TableCell>{pool.split === 'hours' ? formatDuration(share.minutes) : t(splitLabel(pool.split))}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{formatMoney(share.amount)}</TableCell>
                          <TableCell><Tag {...TONE[pool.status]}>{t(poolStatusLabel(pool.status))}</Tag></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>}
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 2 }}>{t('Tips paid through payroll are taxed like pay: ask your {adviser} how yours are handled.', { adviser: t(countryProfile().adviser) })}</Typography>
        </CardContent>
      </Card>

      {editing && <PoolDialog pool={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

const num = { fontVariantNumeric: 'tabular-nums' } as const

/**
 * Tips on Square: what customers left on payments at the till over a period, by who took each payment
 * (each person's own Square login, linked on the Team page or the Leaderboard). Owners see everyone's,
 * what nobody linked took, and one person's day by day; anyone else on the team sees their own, day by day.
 */
function TillTipsCard() {
  const { api, profiles, canSeePay, isAdmin } = useApp()
  const { allows } = usePlan()
  const on = allows('takings')
  const [period, setPeriod] = useState<LeaderPeriod>('month')
  const [person, setPerson] = useState('')
  const [logins, setLogins] = useState(false)
  const { from, to } = periodRange(period, today())
  const tips = useAsync('till-tips', () => (on ? api.tillTips(from, to) : Promise.resolve(null)), [on, from, to])
  const d = tips.data
  // Nothing to say without takings on the plan; Square to connect (again) is for an admin to see to.
  if (!on || d?.status === 'plan' || (!isAdmin && (d?.status === 'not_connected' || d?.status === 'reconnect'))) return null
  const nameOf = (id: string) => profiles.find(p => p.id === id)?.full_name ?? ''
  // Owners: everyone, or the one picked; anyone else: themselves.
  const one = canSeePay ? d?.people.find(p => p.profile_id === person) : d?.people[0]
  const connections = <Button component={RouterLink} to="/connections" color="inherit" size="small">{t('Connections')}</Button>
  const squareLogins = isAdmin && <Button color="inherit" size="small" onClick={() => setLogins(true)}>{t('Square logins')}</Button>
  const totalCell = { ...num, fontWeight: 600 }

  return (
    <Card component="section" aria-label={t('Tips on Square')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={d?.status === 'ok' && (
          <ToggleButtonGroup exclusive size="small" value={period} aria-label={t('Period')} onChange={(_, v: LeaderPeriod | null) => v && setPeriod(v)}
            sx={{ flexWrap: 'wrap' }}>
            {LEADER_PERIODS.map(p => <ToggleButton key={p.id} value={p.id}>{t(p.label)}</ToggleButton>)}
          </ToggleButtonGroup>
        )}>{t('Tips on Square')}</SectionTitle>
        <ErrorBox error={tips.error} />
        {!d ? (!tips.error && <Loading />)
          : d.status === 'not_connected' ? <Alert severity="info" action={connections}>{t('Connect Square on Connections to bring in the tips left at the till, by who took each payment.')}</Alert>
          : d.status === 'reconnect' ? <Alert severity="info" action={connections}>{t(RECONNECT_TEAM)}</Alert>
          : d.status === 'not_linked' ? (
            <Alert severity="info" action={squareLogins}>
              {isAdmin ? t('Link yourself to your own Square login to see the tips on the payments you take.')
                : t('Your Square login isn’t linked yet. Once an owner links it on the Team page, the tips on the payments you take show here.')}
            </Alert>
          ) : <>
            {canSeePay && (
              <TextField select fullWidth={false} size="small" label={t('Person')} value={one ? person : ''} onChange={e => setPerson(e.target.value)} sx={{ minWidth: 220, mb: 2 }}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
                <MenuItem value="">{t('Everyone')}</MenuItem>
                {d.people.map(p => <MenuItem key={p.profile_id} value={p.profile_id}>{nameOf(p.profile_id)}</MenuItem>)}
              </TextField>
            )}
            {one ? (
              one.days.length === 0 ? <Empty>{t('No tips on Square for {name} in this period.', { name: nameOf(one.profile_id) })}</Empty> : (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small" aria-label={t('Tips on Square for {name}', { name: nameOf(one.profile_id) })}>
                    <TableHead><TableRow>
                      <TableCell>{t('Day')}</TableCell><TableCell align="right">{t('Payments with a tip')}</TableCell><TableCell align="right">{t('Tips')}</TableCell>
                    </TableRow></TableHead>
                    <TableBody>
                      {one.days.map(x => (
                        <TableRow key={x.date} hover>
                          <TableCell sx={{ whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{formatLocal(`${x.date}T12:00:00Z`, 'EEE d MMM')}</TableCell>
                          <TableCell align="right" sx={num}>{x.tipped}</TableCell>
                          <TableCell align="right" sx={num}>{formatMoney(x.tips)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>{t('Total')}</TableCell>
                        <TableCell align="right" sx={totalCell}>{one.tipped}</TableCell>
                        <TableCell align="right" sx={totalCell}>{formatMoney(one.tips)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </Box>
              )
            ) : (
              <>
                {!d.people.length && (
                  <Alert severity="info" action={squareLogins} sx={{ mb: 2 }}>{t('Link each person to their own Square login to see whose tips are whose.')}</Alert>
                )}
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small" aria-label={t('Tips on Square by person')}>
                    <TableHead><TableRow>
                      <TableCell>{t('Person')}</TableCell><TableCell align="right">{t('Payments with a tip')}</TableCell><TableCell align="right">{t('Tips')}</TableCell>
                    </TableRow></TableHead>
                    <TableBody>
                      {d.people.map(p => (
                        <TableRow key={p.profile_id} hover>
                          <TableCell>{nameOf(p.profile_id)}</TableCell>
                          <TableCell align="right" sx={num}>{p.tipped}</TableCell>
                          <TableCell align="right" sx={num}>{formatMoney(p.tips)}</TableCell>
                        </TableRow>
                      ))}
                      {!!d.unlinked?.tipped && (
                        <TableRow>
                          <TableCell sx={{ color: 'text.secondary' }}>{t('Someone not linked to anyone here')}</TableCell>
                          <TableCell align="right" sx={{ ...num, color: 'text.secondary' }}>{d.unlinked.tipped}</TableCell>
                          <TableCell align="right" sx={{ ...num, color: 'text.secondary' }}>{formatMoney(d.unlinked.tips)}</TableCell>
                        </TableRow>
                      )}
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>{t('Total')}</TableCell>
                        <TableCell align="right" sx={totalCell}>{d.people.reduce((n, p) => n + p.tipped, d.unlinked?.tipped ?? 0)}</TableCell>
                        <TableCell align="right" sx={totalCell}>{formatMoney(round2(d.people.reduce((n, p) => n + p.tips, d.unlinked?.tips ?? 0)))}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </Box>
              </>
            )}
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 1.5 }}>
              <Freshness id="takings" at={d.fetched_at} />
              {canSeePay && !!d.unlinked?.tipped && squareLogins}
            </Stack>
          </>}
      </CardContent>
      {logins && <SquareLoginsDialog onClose={() => { setLogins(false); void tips.reload() }} />}
    </Card>
  )
}


function PaidButton({ pool }: { pool: TipPool }) {
  const { api } = useApp()
  const run = useAction()
  return (
    <Button size="small" onClick={() => void run(() => api.saveTipPool({ ...pool, status: 'paid' }, pool.shares), t('Marked paid'))}
      aria-label={t('Paid the tips for {period}', { period: period(pool) })}>{t('Paid')}</Button>
  )
}

/**
 * A pool of tips: the period, what came in (the till's card tips for it, when one is connected),
 * how it's split and among whom. The hours come from the timecards; the shares always add up.
 */
function PoolDialog({ pool, onClose }: { pool: TipPool | null; onClose: () => void }) {
  const { api, profiles } = useApp()
  const { allows } = usePlan()
  const run = useAction()
  const lastMonday = addDays(weekStart(today()), -7)
  const [p, setP] = useState<TipPoolInput>(pool ?? { starts_on: lastMonday, ends_on: addDays(lastMonday, 6), cash: 0, card: 0, split: 'hours', status: 'draft', notes: '' })
  const set = (x: Partial<TipPoolInput>) => setP(y => ({ ...y, ...x }))
  // Who shares: everyone in it already, or the employees (owners can tick themselves in).
  const team = profiles.filter(x => x.active && (x.role === 'employee' || x.role === 'admin'))
  const [sharing, setSharing] = useState<string[]>(pool ? pool.shares.map(s => s.profile_id) : team.filter(x => x.role === 'employee').map(x => x.id))
  const entries = useAsync('tip-hours', () => api.timeEntries(zonedIso(p.starts_on, '00:00'), zonedIso(addDays(p.ends_on, 1), '00:00')), [p.starts_on, p.ends_on])
  const till = useAsync('tip-till', () => (allows('takings') ? api.sales(p.starts_on, p.ends_on).catch(() => null) : Promise.resolve(null)), [p.starts_on, p.ends_on])
  const cardTips = till.data ? round2(till.data.days.reduce((s, d) => s + d.tips, 0)) : null
  const worked = useMemo(() => minutesWorked(entries.data ?? [], p.starts_on, p.ends_on), [entries.data, p.starts_on, p.ends_on])
  const total = round2((p.cash || 0) + (p.card || 0))
  const shares = splitTips(total, team.filter(x => sharing.includes(x.id)).map(x => ({ profile_id: x.id, minutes: worked.get(x.id) ?? 0 })), p.split)
  const shareOf = (id: string) => shares.find(s => s.profile_id === id)

  const save = async () => {
    const ok = await run(async () => {
      if (p.ends_on < p.starts_on) throw new Error(t('It can’t end before it starts'))
      if (p.status !== 'draft' && !shares.length) throw new Error(t('Pick who shares them'))
      await api.saveTipPool({ ...p, id: pool?.id, notes: p.notes ?? null }, shares)
    }, p.status === 'draft' ? t('Saved as a draft') : t('Shared out: everyone sees their share'))
    if (ok) onClose()
  }
  const remove = async () => { if (pool && await run(() => api.deleteTipPool(pool.id), t('Removed'))) onClose() }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="tips-title">
      <DialogTitle id="tips-title">{pool ? t('Tips for {period}', { period: period(pool) }) : t('Share out tips')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('First day')} type="date" value={p.starts_on} onChange={e => set({ starts_on: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
            <TextField label={t('Last day')} type="date" value={p.ends_on} onChange={e => set({ ends_on: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} sx={{ flex: 1 }} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'flex-start' } }}>
            <TextField label={t('Cash')} type="number" value={p.cash || ''} onChange={e => set({ cash: Number(e.target.value) || 0 })} helperText={t('Counted from the jar')} sx={{ flex: 1 }} />
            <TextField label={t('Card')} type="number" value={p.card || ''} onChange={e => set({ card: Number(e.target.value) || 0 })} sx={{ flex: 1 }}
              helperText={cardTips !== null ? t('The till says {amount}', { amount: formatMoney(cardTips) }) : t('Left on card payments')} />
          </Stack>
          {cardTips !== null && cardTips !== p.card && (
            <Box><Button size="small" onClick={() => set({ card: cardTips })}>{t('Use the till’s card tips: {amount}', { amount: formatMoney(cardTips) })}</Button></Box>
          )}
          <TextField select label={t('Split')} value={p.split} onChange={e => set({ split: e.target.value as TipSplit })}>
            {TIP_SPLITS.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
          </TextField>
          <Table size="small" aria-label={t('Who shares them')}>
            <TableHead><TableRow>
              <TableCell padding="checkbox" /><TableCell>{t('Person')}</TableCell><TableCell>{t('Hours worked')}</TableCell><TableCell align="right">{t('Their share')}</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {team.map(x => (
                <TableRow key={x.id}>
                  <TableCell padding="checkbox">
                    <Checkbox checked={sharing.includes(x.id)} onChange={e => setSharing(s => (e.target.checked ? [...s, x.id] : s.filter(y => y !== x.id)))}
                      slotProps={{ input: { 'aria-label': t('{name} shares them', { name: x.full_name }) } }} />
                  </TableCell>
                  <TableCell>{x.full_name}</TableCell>
                  <TableCell>{formatDuration(worked.get(x.id) ?? 0)}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{shareOf(x.id) ? formatMoney(shareOf(x.id)!.amount) : ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Typography variant="body2">{t('{total} shared among {n}', { total: formatMoney(total), n: shares.length })}</Typography>
          {p.split === 'hours' && team.some(x => sharing.includes(x.id) && !worked.get(x.id)) && (
            <Alert severity="info">{t('Someone ticked has no hours on their timecards in this period, so gets nothing by hours.')}</Alert>
          )}
          <TextField select label={t('Status')} value={p.status} onChange={e => set({ status: e.target.value as PoolStatus })}
            helperText={t('Shared out: everyone in it sees their share and hears in the bell.')}>
            {POOL_STATUSES.map(s => <MenuItem key={s.id} value={s.id}>{t(s.label)}</MenuItem>)}
          </TextField>
          <TextField label={t('Notes')} value={p.notes ?? ''} multiline minRows={2} onChange={e => set({ notes: e.target.value })} />
        </Stack>
      </DialogContent>
      <DialogActions>
        {pool && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
