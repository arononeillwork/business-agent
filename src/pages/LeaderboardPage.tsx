import {
  Alert, Box, Button, Card, Chip, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import TillIcon from '@mui/icons-material/PointOfSaleOutlined'
import PinIcon from '@mui/icons-material/PasswordRounded'
import OnTimeIcon from '@mui/icons-material/AlarmOnOutlined'
import StreakIcon from '@mui/icons-material/LocalFireDepartmentOutlined'
import HoursIcon from '@mui/icons-material/AccessTimeOutlined'
import SalesIcon from '@mui/icons-material/ShoppingBagOutlined'
import ChecklistIcon from '@mui/icons-material/ChecklistRounded'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { Empty, ErrorBox, Loading, PageHeader, PageToolbar, PersonAvatar } from '../components/common'
import { Freshness } from '../components/Freshness'
import { SquareLoginsDialog } from '../components/SquareLogins'
import { SquarePinsDialog } from '../components/SquarePins'
import {
  BOARDS, LEADER_PERIODS, currentStreak, isLeaderPeriod, leaders, myPlaces, periodRange, standings,
  type Board, type LeaderPeriod, type Standing, type TillBoard,
} from '../../shared/leaderboard'
import { RECONNECT_TEAM } from '../../shared/squareTeam'
import { formatLocal, formatMoney, formatNumber, today } from '../../shared/time'
import { fonts, tokens } from '../theme'
import { t, tc, tn, tr } from '../i18n'

const ICON: Record<Board, ReactNode> = {
  on_time: <OnTimeIcon />, streak: <StreakIcon />, hours: <HoursIcon />, sales: <SalesIcon />, checklists: <ChecklistIcon />,
}
const MEDAL = ['🥇', '🥈', '🥉']
const day = (d: string) => formatLocal(`${d}T12:00:00Z`, 'd MMM')

/** The figure a board ranks on, as people read it. */
function figure(board: Board, s: Standing) {
  switch (board) {
    case 'on_time': return `${Math.round(s.value * 100)}%`
    case 'streak': return tn(s.value, '1 shift in a row', '{n} shifts in a row')
    case 'hours': return t('{hours} h', { hours: formatNumber(s.value) })
    case 'sales': return tn(s.value, '1 sale', '{n} sales')
    case 'checklists': return tn(s.value, '1 item ticked', '{n} items ticked')
  }
}

/** What's beside it: on time out of shifts, days worked, what they took (owners only). */
function detail(board: Board, s: Standing) {
  const d = s.detail
  if (board === 'on_time') return [t('{on_time} of {on_shift} on time', { on_time: d.on_time ?? 0, on_shift: d.on_shift ?? 0 }), d.late ? tn(d.late, '1 late', '{n} late') : null].filter(Boolean).join(' · ')
  if (board === 'hours') return tn(d.days ?? 0, '1 day', '{n} days')
  if (board === 'sales') return d.gross === null || d.gross === undefined ? '' : formatMoney(d.gross)
  return ''
}

const ordinal = (n: number) => tn(n, '1st', n === 2 ? '2nd' : n === 3 ? '3rd' : '{n}th')

/**
 * Leaderboard (Team section): the team side by side for a week or a month. On time (clocked in within 5
 * minutes of the shift's start), the longest on-time streak, hours worked, daily checklist items ticked,
 * and who sold most at the till, from Square (each person linked to their own Square login). Everyone on
 * the team sees it; how much each person took is for the owners (admins with pay access). The period is
 * in the address: `/leaderboard?period=last_month`.
 */
export function LeaderboardPage() {
  const { api, me, profiles, isAdmin, canSeePay } = useApp()
  const [params, setParams] = useSearchParams()
  const asked = params.get('period')
  const period: LeaderPeriod = isLeaderPeriod(asked) ? asked : 'month'
  const { from, to } = periodRange(period, today())
  const clock = useAsync('leaderboard', () => api.leaderboard(from, to), [from, to])
  const till = useAsync('leaderboard-till', () => api.leaderboardTill(from, to), [from, to])
  const [board, setBoard] = useState<Board>('on_time')
  const [logins, setLogins] = useState(false)
  // Square PINs: owners see everyone's, anyone else their own.
  const [pins, setPins] = useState(false)

  const stats = clock.data ?? []
  const sales = till.data?.status === 'ok' ? till.data.people : []
  const top = leaders(stats, sales)
  const mine = me ? myPlaces(me.id, stats, sales) : null
  const placed = mine ? BOARDS.filter(b => mine[b.id] !== null) : []
  const person = (id: string) => profiles.find(p => p.id === id)
  const name = (id: string) => person(id)?.full_name ?? '—'
  const myStreak = me ? currentStreak(stats.find(s => s.profile_id === me.id)?.starts ?? '') : 0

  return (
    <>
      <PageHeader eyebrow={t('Team')} title={t('Leaderboard')}
        actions={<>
          {isAdmin && <Button variant="outlined" startIcon={<TillIcon />} onClick={() => setLogins(true)}>{t('Square logins')}</Button>}
          <Button variant="outlined" startIcon={<PinIcon />} onClick={() => setPins(true)}>{isAdmin && canSeePay ? t('Show PINs') : t('Show my PIN')}</Button>
        </>} />
      <PageToolbar actions={
        <ToggleButtonGroup exclusive size="small" value={period} aria-label={t('Period')}
          onChange={(_, v: LeaderPeriod | null) => v && setParams(v === 'month' ? {} : { period: v }, { replace: true })}>
          {LEADER_PERIODS.map(p => <ToggleButton key={p.id} value={p.id}>{t(p.label)}</ToggleButton>)}
        </ToggleButtonGroup>
      }>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {from === to ? day(from) : t('{from} to {to}', { from: day(from), to: day(to) })}
        </Typography>
      </PageToolbar>
      <ErrorBox error={clock.error} />

      {/* Who leads each board. */}
      <Box component="section" aria-label={t('Leaders')}
        sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' }, gap: 1.5, mb: 3 }}>
        {BOARDS.map(b => {
          const first = top[b.id] ?? []
          return (
            <Card key={b.id} component="article" aria-label={t(b.label)} sx={{ p: 1.75, minWidth: 0 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: tokens.inkSoft, '& svg': { fontSize: 18 } }}>
                {ICON[b.id]}<Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{t(b.label)}</Typography>
              </Stack>
              {first.length ? (
                <>
                  <Typography sx={{ fontFamily: fonts.display, fontSize: '1.15rem', mt: 0.75, overflowWrap: 'anywhere' }}>
                    {first.map(s => name(s.profile_id)).join(', ')}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{figure(b.id, first[0])}</Typography>
                </>
              ) : <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75 }}>{t('Nobody yet')}</Typography>}
            </Card>
          )
        })}
      </Box>

      {/* Where I am on each. */}
      {me && placed.length > 0 && (
        <Stack direction="row" useFlexGap spacing={1} role="list" aria-label={t('Your places')} sx={{ flexWrap: 'wrap', alignItems: 'center', mb: 2.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mr: 0.5 }}>{t('You:')}</Typography>
          {placed.map(b => <Chip key={b.id} role="listitem" size="small" label={t('{place} for {board}', { place: ordinal(mine![b.id]!), board: t(b.label).toLowerCase() })} />)}
          {myStreak > 1 && <Chip role="listitem" size="small" color="success" variant="outlined" label={t('{n} on time in a row now', { n: myStreak })} />}
        </Stack>
      )}

      <Tabs value={board} onChange={(_, v: Board) => setBoard(v)} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: `1px solid ${tokens.line}` }}>
        {BOARDS.map(b => <Tab key={b.id} value={b.id} label={t(b.label)} />)}
      </Tabs>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>{t(BOARDS.find(b => b.id === board)!.hint)}</Typography>

      {board === 'sales' && <TillNote till={till.data} error={till.error} admin={isAdmin} owner={isAdmin && canSeePay} onLogins={() => setLogins(true)} />}
      {clock.loading && !clock.data ? <Loading /> : (board !== 'sales' || till.data?.status === 'ok') && (
        <BoardTable board={board} rows={standings(board, stats, sales)} name={name} colour={id => person(id)?.colour ?? tokens.inkSoft} me={me?.id} />
      )}
      {logins && <SquareLoginsDialog onClose={() => setLogins(false)} />}
      {pins && <SquarePinsDialog onClose={() => setPins(false)} />}
    </>
  )
}

function BoardTable({ board, rows, name, colour, me }: { board: Board; rows: Standing[]; name: (id: string) => string; colour: (id: string) => string; me?: string }) {
  const label = t(BOARDS.find(b => b.id === board)!.label)
  if (!rows.length) return <Empty>{t('Nothing on this board for this period yet.')}</Empty>
  return (
    <Card sx={{ overflowX: 'auto' }}>
      <Table aria-label={label} size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 64 }}>{tc('rank', 'Place')}</TableCell>
            <TableCell>{t('Name')}</TableCell>
            <TableCell align="right">{label}</TableCell>
            <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(s => (
            <TableRow key={s.profile_id} selected={s.profile_id === me}>
              <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{MEDAL[s.rank - 1] ?? ''} {s.rank}</TableCell>
              <TableCell>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <PersonAvatar name={name(s.profile_id)} colour={colour(s.profile_id)} size={26} />
                  <span>{s.profile_id === me ? t('{name} (you)', { name: name(s.profile_id) }) : name(s.profile_id)}</span>
                </Stack>
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{figure(board, s)}</TableCell>
              <TableCell align="right" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'table-cell' }, whiteSpace: 'nowrap' }}>{detail(board, s)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

/** Why there's no sales board yet, what's not counted, and how fresh it is. */
function TillNote({ till, error, admin, owner, onLogins }: { till: TillBoard | null; error: string | null; admin: boolean; owner: boolean; onLogins: () => void }) {
  if (error) return <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
  if (!till) return <Loading />
  const connections = <RouterLink to="/connections">{t('Connections')}</RouterLink>
  const why: Record<Exclude<TillBoard['status'], 'ok'>, ReactNode> = {
    plan: t('Sales by person come with takings, on the Pro plan and up.'),
    not_connected: admin ? tr('Connect Square on {connections} to see who sold most: each payment in Square says who took it.', { connections })
      : t('Sales by person come from Square, once an owner connects it.'),
    reconnect: admin ? t(RECONNECT_TEAM) : t('Square needs connecting again before sales by person show. An owner can do it on Connections.'),
    no_links: admin ? t('Link each person to their own Square login to see who sold most.') : t('An owner needs to link each person to their Square login first.'),
  }
  if (till.status !== 'ok') {
    return (
      <Alert severity="info" sx={{ mb: 2 }} action={admin && till.status === 'no_links' ? <Button color="inherit" size="small" onClick={onLogins}>{t('Square logins')}</Button> : undefined}>
        {why[till.status]}
      </Alert>
    )
  }
  return (
    <Stack spacing={0.75} sx={{ mb: 1.5 }}>
      {till.unlinked.sales > 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {tn(till.unlinked.sales, '1 sale was taken in Square by someone not linked to anyone here.', '{n} sales were taken in Square by someone not linked to anyone here.')}
          {owner && till.unlinked.gross !== null ? ` (${formatMoney(till.unlinked.gross)})` : ''}
          {admin && <> <Button size="small" onClick={onLogins} sx={{ ml: 0.5 }}>{t('Square logins')}</Button></>}
        </Typography>
      )}
      {!owner && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('How much each person took is for the owners; everyone sees how many sales.')}</Typography>}
      <Freshness id="takings" at={till.fetched_at} />
    </Stack>
  )
}
