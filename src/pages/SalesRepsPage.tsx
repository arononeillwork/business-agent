import {
  Alert, Autocomplete, Box, Button, ButtonBase, Card, CardContent, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  InputAdornment, Link, MenuItem, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import PersonAddIcon from '@mui/icons-material/PersonAddAlt'
import EditIcon from '@mui/icons-material/EditOutlined'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import CardsIcon from '@mui/icons-material/BadgeOutlined'
import StarIcon from '@mui/icons-material/AutoAwesomeOutlined'
import RedeemIcon from '@mui/icons-material/RedeemOutlined'
import PayIcon from '@mui/icons-material/PaymentsOutlined'
import ShareIcon from '@mui/icons-material/IosShareOutlined'
import TrophyIcon from '@mui/icons-material/EmojiEventsOutlined'
import GroupsIcon from '@mui/icons-material/GroupsOutlined'
import CampaignIcon from '@mui/icons-material/CampaignOutlined'
import HeartIcon from '@mui/icons-material/VolunteerActivismOutlined'
import LinkIcon from '@mui/icons-material/LinkOutlined'
import SearchIcon from '@mui/icons-material/Search'
import SettingsIcon from '@mui/icons-material/TuneOutlined'
import CloseIcon from '@mui/icons-material/Close'
import CheckIcon from '@mui/icons-material/CheckCircle'
import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { siInstagram } from 'simple-icons'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Brand } from '../components/Connectors'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import { KIND_TONE, ReachBadge, ReachLadder, RepAvatar, RepCode, worth } from '../components/RepBits'
import type { ExportTable } from '../lib/export'
import {
  DEFAULT_PITCH, REP_KINDS, REWARD_IDEAS, RULE_WHO, SOCIALS, balanceOf, bonusFrom, cleanInstagram, cleanRepCode, cleanYoutube, crewOf, crewReach, earnsCredit,
  formatReach, kindLabel, leaderboard, limitReached, mentionsToReward, outstanding, parseCount, reachMultiplier, reachOf, reachTier, rewardAmount, ruleFits,
  timesInMonth, type MentionToReward, type RepKind, type RepReward, type RepSettings, type RewardRule, type RewardRuleInput, type SalesRep, type SalesRepInput,
  type Standing,
} from '../../shared/reps'
import type { Mention } from '../../shared/mentions'
import { customerName } from '../../shared/customers'
import { formatLocal, formatMoney, formatNumber, today } from '../../shared/time'
import { fonts, tokens } from '../theme'
import { msg, t, tn } from '../i18n'

export { RepCode } from '../components/RepBits'

const STATUS_TONE: Record<RepReward['status'], { label: string; fg: string; bg: string }> = {
  approved: { label: msg('Counted'), fg: tokens.goodFg, bg: tokens.goodBg },
  pending: { label: msg('Waiting'), fg: tokens.warnFg, bg: tokens.warnBg },
  rejected: { label: msg('Turned down'), fg: tokens.neutralFg, bg: tokens.neutralBg },
}
type Filter = 'all' | RepKind | 'waiting'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: msg('All') }, { id: 'customer', label: msg('Customers') }, { id: 'ambassador', label: msg('Ambassadors') }, { id: 'team', label: msg('On the team') },
]
/** What each kind of rep is, in a few words, for choosing one. */
const KIND_PITCH: Record<RepKind, string> = {
  customer: msg('A regular who shares us with friends: earns credit to spend here'),
  ambassador: msg('A coach, a studio, a hotel, a local page: earns commission'),
  team: msg('Someone who works here: earns commission'),
}

const day = (d: string) => formatLocal(`${d}T12:00:00Z`, 'd MMM')
/** A ledger line's words: the list's names are as typed; the database's own words are translated. */
const lineLabel = (r: RepReward) => (r.bonus_for ? t('Crew bonus: {name}', { name: bonusFrom(r) }) : r.kind === 'earn' ? r.label : t(r.label))
const HOW_KEY = 'eb-reps-how-hidden'

/**
 * Sales reps & rewards: everyone who talks about the café (the team, ambassadors from outside it
 * like a coach or a yoga studio, customers who spread the word), each with a code for their
 * business cards, their reach (followers and the people they see), and the crew they lead or are
 * in. The café's list says what earns a reward; rewards that grow with reach are bigger for people
 * who reach more, and a crew's leader earns a share of what the crew earns. Customers earn credit
 * to spend in the café; the team and ambassadors earn commission. Anyone on the team adds people
 * (an employee's wait for an admin's OK), logs rewards and lets customers spend their credit at the
 * till; admins say yes to people, set the list, approve what waits and pay commission out. Each rep
 * has their own page (a private link). The database enforces the same.
 */
export function SalesRepsPage() {
  const { api, me, isAdmin, profiles } = useApp()
  // Only an owner (an admin who sees pay) says yes to a new rep; any admin approves rewards.
  const isOwner = isAdmin && !!me?.can_see_pay
  const reps = useAsync('sales-reps', () => api.salesReps(), [])
  const rules = useAsync('reward-rules', () => api.rewardRules(), [])
  const rewards = useAsync('rep-rewards', () => api.repRewards(), [])
  const settings = useAsync('rep-settings', () => api.repSettings(), [])
  const mentions = useAsync('instagram-mentions', () => (isAdmin ? api.instagramMentions() : Promise.resolve([])), [isAdmin])
  const run = useAction()
  const [filter, setFilter] = useState<Filter>('all')
  const [crew, setCrew] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<SalesRepInput | null>(null)
  const [logging, setLogging] = useState<{ rep: SalesRep; mention?: Mention } | null>(null)
  const [settling, setSettling] = useState<SalesRep | null>(null)
  const [rule, setRule] = useState<RewardRuleInput | null>(null)
  const [sharing, setSharing] = useState<SalesRep | null>(null)
  const [tuning, setTuning] = useState(false)
  const [everything, setEverything] = useState(false)

  const now = today()
  const month = now.slice(0, 7)
  const allReps = reps.data ?? []
  const allRules = rules.data ?? []
  const ledger = rewards.data ?? []
  const set: RepSettings = settings.data ?? { welcome_offer: null, crew_share: 10, boost_by_reach: true, pitch: null }
  const active = allReps.filter(r => r.active && r.approved)
  const waitingPeople = allReps.filter(r => !r.approved)
  const myRep = allReps.find(r => r.profile_id === me?.id) ?? null
  const repName = (id: string) => allReps.find(r => r.id === id)?.name ?? ''
  const personName = (id: string | null | undefined) => profiles.find(p => p.id === id)?.full_name ?? ''
  // A rep's balance is known to admins, for customers (the till), and to a rep for their own.
  const seesBalance = (r: SalesRep) => isAdmin || earnsCredit(r.kind) || r.id === myRep?.id
  const pending = ledger.filter(r => r.status === 'pending')
  const thisMonth = ledger.filter(r => r.kind === 'earn' && r.status !== 'rejected' && r.occurred_on.slice(0, 7) === month)
  const owed = outstanding(allReps, ledger)
  const top = leaderboard(active, ledger, month).slice(0, 5)
  const toReward = isAdmin ? mentionsToReward(mentions.data ?? [], allReps, ledger).slice(0, 6) : []
  const activeRules = allRules.filter(r => r.active)
  const named = new Set(allRules.map(r => r.name.toLowerCase()))
  const ideas = REWARD_IDEAS.filter(i => !named.has(t(i.name).toLowerCase()))
  const totalReach = active.reduce((a, r) => a + r.reach, 0)
  const growing = activeRules.find(r => r.scales_with_reach && r.basis === 'fixed')

  // Who shows: a crew's people are under their leader ("See crew"), unless searched for or waiting.
  const q = search.trim().toLowerCase().replace(/^@/, '')
  const shown = allReps.filter(r => {
    if (crew) return r.id === crew || r.leader_id === crew
    if (q) return [r.name, r.code, r.instagram ?? '', r.tiktok ?? ''].some(v => v.toLowerCase().includes(q))
    if (filter === 'waiting') return !r.approved
    if (r.leader_id && r.approved) return false
    return filter === 'all' || r.kind === filter
  }).sort((a, b) => (crew ? Number(b.id === crew) - Number(a.id === crew) : 0) || Number(b.active) - Number(a.active)
    || Number(a.approved) - Number(b.approved) || a.name.localeCompare(b.name))
  const crewLeader = crew ? allReps.find(r => r.id === crew) : null

  const decide = (r: RepReward, approve: boolean) => run(() => api.decideReward(r.id, approve),
    approve ? t('Approved: {amount} for {name}', { amount: formatMoney(r.amount), name: repName(r.rep_id) }) : t('Turned down'))
  const decidePerson = (r: SalesRep, approve: boolean) => run(() => api.decideRep(r.id, approve),
    approve ? t('{name} is a rep', { name: r.name }) : t('{name} isn’t a rep', { name: r.name }))
  const remove = (r: RepReward) => run(() => api.deleteReward(r.id), t('Taken off'))
  const newRep = (): SalesRepInput => ({ name: '', kind: 'customer', active: true })

  const table = (): ExportTable => ({
    title: t('Sales reps & rewards'), filename: `rewards-${now}`,
    columns: [t('Date'), t('Rep'), t('Code'), t('What for'), t('Sale'), t('Amount'), t('Status'), t('Notes')],
    rows: ledger.map(r => [r.occurred_on, repName(r.rep_id), allReps.find(x => x.id === r.rep_id)?.code ?? '', lineLabel(r), r.sale_amount, r.amount,
      t(STATUS_TONE[r.status].label), r.note ?? '']),
    money: [4, 5],
  })

  return (
    <>
      <PageHeader eyebrow={t('Sales')} title={t('Sales reps & rewards')} actions={<>
        {isAdmin && <ExportButton table={table} disabled={!ledger.length} folder="Rewards" />}
        {isAdmin && <Button variant="outlined" startIcon={<CardsIcon />} component={RouterLink} to="/sales-reps/cards" disabled={!active.length}>{t('Business cards')}</Button>}
        {myRep && <Button variant="outlined" startIcon={<LinkIcon />} onClick={() => setSharing(myRep)}>{t('My page')}</Button>}
        <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setEditing(newRep())}>{t('Add someone')}</Button>
      </>} />
      <ErrorBox error={reps.error ?? rules.error ?? rewards.error} />

      <Hero pitch={set.pitch} people={reps.data ? active.length : null} reach={reps.data ? totalReach : null}
        given={rewards.data ? thisMonth.reduce((a, r) => a + r.amount, 0) : null} />

      <HowItWorks crewShare={set.crew_share} boost={set.boost_by_reach} example={growing} />

      <StatGrid>
        <StatTile label={t('Credit to spend')} value={rewards.data ? formatMoney(owed.credit) : '–'} note={t('Customers spend it in the café')} />
        {isAdmin
          ? <StatTile label={t('Commission owed')} value={rewards.data ? formatMoney(owed.commission) : '–'} note={t('To pay the team and ambassadors')} />
          : myRep
            ? <StatTile label={t('My commission')} value={formatMoney(balanceOf(ledger, myRep.id))} note={t('Your code: {code}', { code: myRep.code })} />
            : <StatTile label={t('Rewards this month')} value={rewards.data ? formatMoney(thisMonth.reduce((a, r) => a + r.amount, 0)) : '–'}
                note={tn(thisMonth.length, '{n} reward', '{n} rewards')} />}
        <StatTile label={t('Waiting for approval')} value={rewards.data && reps.data ? pending.length + waitingPeople.length : '–'}
          note={pending.length + waitingPeople.length ? (isAdmin ? t('Say yes or no below') : t('An admin approves them')) : t('Nothing waiting')} />
      </StatGrid>

      {isAdmin && (pending.length > 0 || waitingPeople.length > 0) && (
        <Card component="section" aria-label={t('Waiting for approval')} sx={{ mb: 3, borderLeft: `4px solid ${tokens.rose}` }}>
          <CardContent>
            <SectionTitle>{t('Waiting for approval')}</SectionTitle>
            <Stack spacing={1}>
              {waitingPeople.map(r => {
                const leader = allReps.find(x => x.id === r.leader_id)
                const by = r.created_by ? personName(r.created_by) : null
                return (
                  <Stack key={r.id} role="group" aria-label={t('{name}: new rep', { name: r.name })} direction={{ xs: 'column', sm: 'row' }} spacing={1.5}
                    sx={{ alignItems: { sm: 'center' }, py: 1, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                    <Stack direction="row" spacing={1.5} sx={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
                      <RepAvatar rep={r} size={36} />
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{r.name}</Typography>
                          <Tag {...KIND_TONE[r.kind]}>{t(kindLabel(r.kind))}</Tag>
                          {r.reach > 0 && <ReachBadge reach={r.reach} />}
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {[t('Wants to be a rep'), r.reach > 0 ? t('Reaches {n} people', { n: formatNumber(r.reach) }) : null,
                            leader ? t('In {name}’s crew', { name: leader.name }) : null,
                            by ? t('Added by {name}', { name: by }) : leader ? t('Added from {name}’s page', { name: leader.name }) : null, r.notes].filter(Boolean).join(' · ')}
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <IconButton size="small" aria-label={t('Edit {name}', { name: r.name })} onClick={() => setEditing(r)}><EditIcon fontSize="small" /></IconButton>
                      {isOwner ? <>
                        <Button size="small" onClick={() => void decidePerson(r, false)}>{t('Say no')}</Button>
                        <Tooltip title={r.profile_id === me?.id ? t('Someone else says yes to you') : ''}>
                          <span><Button size="small" variant="contained" disabled={r.profile_id === me?.id} onClick={() => void decidePerson(r, true)}>{t('Say yes')}</Button></span>
                        </Tooltip>
                      </> : <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('An owner says yes')}</Typography>}
                    </Stack>
                  </Stack>
                )
              })}
              {pending.map(r => {
                const own = allReps.find(x => x.id === r.rep_id)?.profile_id === me?.id
                return (
                  <Stack key={r.id} role="group" aria-label={`${repName(r.rep_id)}: ${r.label}`} direction={{ xs: 'column', sm: 'row' }} spacing={1.5}
                    sx={{ alignItems: { sm: 'center' }, py: 1, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{repName(r.rep_id)} · {lineLabel(r)}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {[day(r.occurred_on), r.sale_amount ? t('Sale of {amount}', { amount: formatMoney(r.sale_amount) }) : null,
                          r.multiplier ? t('×{x} for their reach', { x: r.multiplier }) : null, r.note,
                          r.logged_by ? t('Logged by {name}', { name: personName(r.logged_by) }) : r.bonus_for ? null : t('Sent from their own page')].filter(Boolean).join(' · ')}
                        {r.proof_url && <> · <Link href={r.proof_url} target="_blank" rel="noopener">{t('See it')}</Link></>}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontFamily: fonts.display, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(r.amount)}</Typography>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" onClick={() => void decide(r, false)}>{t('Turn down')}</Button>
                      <Tooltip title={own ? t('Someone else approves your own rewards') : ''}>
                        <span><Button size="small" variant="contained" disabled={own} onClick={() => void decide(r, true)}>{t('Approve')}</Button></span>
                      </Tooltip>
                    </Stack>
                  </Stack>
                )
              })}
            </Stack>
          </CardContent>
        </Card>
      )}

      {toReward.length > 0 && (
        <Card component="section" aria-label={t('Stories and posts about the café')} sx={{ mb: 3 }}>
          <CardContent>
            <SectionTitle>{t('Stories and posts about the café')}</SectionTitle>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              {t('From Instagram this week. Reward the people who shared the café, or add them as a customer first.')}
            </Typography>
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
              {toReward.map(m => <MentionCard key={m.mention.id} item={m}
                onReward={rep => setLogging({ rep, mention: m.mention })}
                onAdd={() => setEditing({ name: `@${m.mention.username}`, kind: 'customer', instagram: m.mention.username, active: true })} />)}
            </Box>
          </CardContent>
        </Card>
      )}

      <Card component="section" aria-label={t('Reps')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={
            <ToggleButtonGroup size="small" exclusive value={crew || q ? null : filter} onChange={(_, v: Filter | null) => { if (v) { setFilter(v); setCrew(null); setSearch('') } }}
              aria-label={t('Show')} sx={{ flexWrap: 'wrap' }}>
              {FILTERS.map(f => <ToggleButton key={f.id} value={f.id} sx={{ px: 1.25, py: 0.25 }}>{t(f.label)}</ToggleButton>)}
              {waitingPeople.length > 0 && <ToggleButton value="waiting" sx={{ px: 1.25, py: 0.25 }}>{t('Waiting ({n})', { n: waitingPeople.length })}</ToggleButton>}
            </ToggleButtonGroup>
          }>{t('Reps')}</SectionTitle>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2, alignItems: { sm: 'center' } }}>
            <TextField size="small" value={search} onChange={e => { setSearch(e.target.value); setCrew(null) }} placeholder={t('Name, code or @handle')}
              sx={{ flex: 1, maxWidth: { sm: 360 } }}
              slotProps={{ htmlInput: { 'aria-label': t('Find someone') }, input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />
            {crewLeader && (
              <Chip icon={<GroupsIcon />} label={t('{name}’s crew', { name: crewLeader.name })} onDelete={() => setCrew(null)}
                deleteIcon={<CloseIcon aria-label={t('Show everyone')} />} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }} />
            )}
          </Stack>
          {shown.length === 0
            ? <Empty>{reps.data ? (q ? t('Nobody matches that.') : t('Nobody yet. Add the people who tell others about the café: regulars, a coach and their fighters, a friend with a hotel, someone on the team.')) : t('Loading…')}</Empty>
            : <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
                {shown.map(r => (
                  <PersonCard key={r.id} rep={r} reps={allReps} ledger={ledger} seesBalance={seesBalance(r)} isAdmin={isAdmin} mine={r.profile_id === me?.id && !!me}
                    crewShown={crew === r.id}
                    onReward={() => setLogging({ rep: r })} onSettle={() => setSettling(r)} onEdit={() => setEditing(r)} onShare={() => setSharing(r)}
                    onCrew={() => { setCrew(crew === r.id ? null : r.id); setSearch('') }} />
                ))}
              </Box>}
        </CardContent>
      </Card>

      <Card component="section" aria-label={t('Top sellers this month')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('Top sellers this month')}</SectionTitle>
          {top.length === 0
            ? <Empty>{t('No rewards yet this month.')}</Empty>
            : <Podium standings={top} amounts={top.map(s => seesBalance(s.rep))} />}
        </CardContent>
      </Card>

      <Card component="section" aria-label={t('What earns a reward')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={isAdmin && <Stack direction="row" spacing={1}>
            <Button size="small" startIcon={<SettingsIcon />} onClick={() => setTuning(true)}>{t('Crews & reach')}</Button>
            <Button size="small" startIcon={<AddIcon />} onClick={() => setRule({ name: '', who: 'everyone', basis: 'fixed', amount: 1, needs_approval: false, monthly_limit: null,
              scales_with_reach: false, active: true })}>{t('Add a reward')}</Button>
          </Stack>}>
            {t('What earns a reward')}
          </SectionTitle>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            {t('Customers get theirs as credit to spend in the café; the team and ambassadors as commission. Reward what brings people in, not cards handed out.')}
          </Typography>
          {allRules.length === 0
            ? <Empty>{rules.data ? (isAdmin ? t('Nothing on the list yet. Start from the usual ones below.') : t('Nothing on the list yet.')) : t('Loading…')}</Empty>
            : <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
                {allRules.map(r => <RuleCard key={r.id} rule={r} boost={set.boost_by_reach} onEdit={isAdmin ? () => setRule(r) : undefined} />)}
              </Box>}
          {isAdmin && ideas.length > 0 && (
            <Box sx={{ mt: 2.5 }}>
              <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('Usual for a café')}</Typography>
              <Stack spacing={1} sx={{ mt: 0.5 }}>
                {ideas.map(i => (
                  <Stack key={i.key} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, py: 1, borderTop: 1, borderColor: 'divider' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {t(i.name)} · {worth(i)}{i.scales_with_reach && ` · ${t('grows with reach')}`}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t(i.what)}</Typography>
                    </Box>
                    <Button size="small" variant="outlined" startIcon={<AddIcon />} aria-label={t('Add {name}', { name: t(i.name) })}
                      onClick={() => setRule({ name: t(i.name), who: i.who, basis: i.basis, amount: i.amount, needs_approval: i.needs_approval, monthly_limit: i.monthly_limit,
                        scales_with_reach: i.scales_with_reach, active: true })}>
                      {t('Add')}
                    </Button>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>

      <Card component="section" aria-label={t('Latest rewards')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={ledger.length > 15 && <Button size="small" onClick={() => setEverything(x => !x)}>{everything ? t('Show fewer') : t('Show all {n}', { n: ledger.length })}</Button>}>
            {t('Latest rewards')}
          </SectionTitle>
          {ledger.length === 0
            ? <Empty>{rewards.data ? t('Nothing logged yet.') : t('Loading…')}</Empty>
            : <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" aria-label={t('Latest rewards')}>
                  <TableHead><TableRow>
                    <TableCell>{t('Date')}</TableCell><TableCell>{t('Rep')}</TableCell><TableCell>{t('What for')}</TableCell>
                    <TableCell align="right">{t('Amount')}</TableCell><TableCell>{t('Status')}</TableCell>{isAdmin && <TableCell />}
                  </TableRow></TableHead>
                  <TableBody>
                    {(everything ? ledger : ledger.slice(0, 15)).map(r => (
                      <TableRow key={r.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{day(r.occurred_on)}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{repName(r.rep_id)}</TableCell>
                        <TableCell sx={{ minWidth: 200 }}>
                          {lineLabel(r)}
                          {(r.note || r.sale_amount || r.multiplier) && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                            {[r.sale_amount ? t('Sale of {amount}', { amount: formatMoney(r.sale_amount) }) : null,
                              r.multiplier ? t('×{x} for their reach', { x: r.multiplier }) : null, r.note].filter(Boolean).join(' · ')}
                          </Typography>}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: r.amount < 0 ? 'text.secondary' : undefined }}>
                          {r.amount > 0 ? `+${formatMoney(r.amount)}` : formatMoney(r.amount)}
                        </TableCell>
                        <TableCell><Tag fg={STATUS_TONE[r.status].fg} bg={STATUS_TONE[r.status].bg}>{t(STATUS_TONE[r.status].label)}</Tag></TableCell>
                        {isAdmin && <TableCell align="right">
                          <IconButton size="small" aria-label={t('Take off {what} for {name}', { what: lineLabel(r), name: repName(r.rep_id) })} onClick={() => void remove(r)}>
                            <DeleteIcon fontSize="small" /></IconButton>
                        </TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>}
        </CardContent>
      </Card>

      {editing && <RepDialog rep={editing} reps={allReps} crewShare={set.crew_share} onClose={() => setEditing(null)} />}
      {logging && <LogDialog rep={logging.rep} mention={logging.mention} rules={activeRules} ledger={ledger} isAdmin={isAdmin} self={logging.rep.id === myRep?.id}
        boost={set.boost_by_reach} onClose={() => setLogging(null)} />}
      {settling && <SettleDialog rep={settling} balance={balanceOf(ledger, settling.id)} onClose={() => setSettling(null)} />}
      {rule && <RuleDialog rule={rule} onClose={() => setRule(null)} />}
      {sharing && <ShareDialog rep={sharing} onClose={() => setSharing(null)} />}
      {tuning && settings.data && <SettingsDialog settings={settings.data} onClose={() => setTuning(false)} />}
    </>
  )
}

/** The café's thank-you to the people who talk about it, and what they add up to. */
function Hero({ pitch, people, reach, given }: { pitch: string | null; people: number | null; reach: number | null; given: number | null }) {
  const numbers = [
    { label: t('People talking about us'), value: people === null ? '–' : formatNumber(people) },
    { label: t('People they reach'), value: reach === null ? '–' : formatReach(reach) },
    { label: t('Given back this month'), value: given === null ? '–' : formatMoney(given) },
  ]
  return (
    <Box component="section" aria-label={t('Our people')} sx={{ mb: 3, p: { xs: 2.5, md: 3 }, borderRadius: 4, position: 'relative', overflow: 'hidden',
      background: `linear-gradient(135deg, ${tokens.roseSoft} 0%, ${tokens.ubeSoft} 55%, ${tokens.matchaSoft} 100%)` }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 2.5, md: 4 }} sx={{ alignItems: { md: 'center' } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1, color: tokens.roseDeep }}>
            <HeartIcon fontSize="small" />
            <Typography variant="overline" sx={{ lineHeight: 1.4 }}>{t('Local people, local reach')}</Typography>
          </Stack>
          <Typography component="h2" sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: { xs: '1.4rem', md: '1.7rem' }, lineHeight: 1.2, mb: 1 }}>
            {t('The people who talk about us')}
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', maxWidth: 560 }}>{pitch?.trim() || t(DEFAULT_PITCH)}</Typography>
        </Box>
        <Box component="dl" sx={{ m: 0, display: 'grid', gap: { xs: 1.5, md: 2 }, gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', md: 'repeat(3, auto)' } }}>
          {numbers.map(n => (
            <Box key={n.label} sx={{ p: 1.5, borderRadius: 3, bgcolor: tokens.surface, minWidth: { md: 128 } }}>
              <Typography component="dd" sx={{ m: 0, fontFamily: fonts.display, fontWeight: 600, fontSize: { xs: '1.3rem', md: '1.7rem' }, lineHeight: 1.1,
                fontVariantNumeric: 'tabular-nums' }}>{n.value}</Typography>
              <Typography component="dt" variant="caption" sx={{ color: 'text.secondary' }}>{n.label}</Typography>
            </Box>
          ))}
        </Box>
      </Stack>
    </Box>
  )
}

/** Three steps, the reach ladder and crews: what anyone needs to know, hidden once read. */
function HowItWorks({ crewShare, boost, example }: { crewShare: number; boost: boolean; example?: RewardRule }) {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(HOW_KEY) === '1' } catch { return false } })
  const toggle = () => setHidden(h => { try { localStorage.setItem(HOW_KEY, h ? '0' : '1') } catch { /* private window: fine */ } return !h })
  const steps = [
    { icon: <CampaignIcon />, title: t('They talk about us'), text: t('A story, a post with the café tagged, their card handed to a friend, a crew brought along.') },
    { icon: <StarIcon />, title: t('We see it'), text: t('Their code at the till, Instagram telling us about a story or a tag, or they tell us from their own page.') },
    { icon: <TrophyIcon />, title: t('They get something back'), text: t('Credit to spend here for customers, commission for ambassadors and the team.') },
  ]
  return (
    <Card component="section" aria-label={t('How it works')} sx={{ mb: 3 }}>
      <CardContent>
        <SectionTitle action={<Button size="small" onClick={toggle} aria-expanded={!hidden}>{hidden ? t('Show how it works') : t('Hide')}</Button>}>
          {t('How it works')}
        </SectionTitle>
        <Collapse in={!hidden}>
          <Box sx={{ display: 'grid', gap: 1.5, mb: 2.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
            {steps.map((s, i) => (
              <Stack key={s.title} direction="row" spacing={1.5} sx={{ p: 2, borderRadius: 3, bgcolor: i === 0 ? tokens.roseSoft : i === 1 ? tokens.ubeSoft : tokens.matchaSoft, alignItems: 'flex-start' }}>
                <Box sx={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: tokens.surface,
                  color: i === 0 ? tokens.roseDeep : i === 1 ? tokens.ubeDeep : tokens.matchaDeep }}>{s.icon}</Box>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{`${i + 1}. ${s.title}`}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{s.text}</Typography>
                </Box>
              </Stack>
            ))}
          </Box>
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('The bigger their reach, the bigger the reward')}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.25 }}>
                {boost
                  ? example
                    ? t('A story from someone with 12,000 followers reaches more people than one from someone with 300. Rewards marked “grows with reach” are worth more for them: “{name}” is worth this much at each step.', { name: example.name })
                    : t('A story from someone with 12,000 followers reaches more people than one from someone with 300. Rewards marked “grows with reach” are worth more for them.')
                  : t('Rewards don’t grow with reach just now (Crews & reach).')}
              </Typography>
              <ReachLadder example={boost ? example : undefined} />
            </Box>
            <Box sx={{ p: 2, borderRadius: 3, border: 1, borderColor: 'divider', alignSelf: 'start' }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75, color: tokens.ubeDeep }}>
                <GroupsIcon />
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>{t('Bring your crew')}</Typography>
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {crewShare > 0
                  ? t('A coach and their fighters, a studio and its teachers, a club and its players: whoever brings a crew earns {n}% of everything their crew earns, on top of their own.', { n: formatNumber(crewShare) })
                  : t('A coach and their fighters, a studio and its teachers: put them in a crew to see their reach together.')}
              </Typography>
            </Box>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  )
}

/** Someone who talks about the café: who they are, their reach and crew, their code and balance, and what can be done for them. */
function PersonCard({ rep: r, reps, ledger, seesBalance, isAdmin, mine, crewShown, onReward, onSettle, onEdit, onShare, onCrew }: {
  rep: SalesRep; reps: SalesRep[]; ledger: RepReward[]; seesBalance: boolean; isAdmin: boolean; mine: boolean; crewShown: boolean
  onReward: () => void; onSettle: () => void; onEdit: () => void; onShare: () => void; onCrew: () => void
}) {
  const balance = balanceOf(ledger, r.id)
  const credit = earnsCredit(r.kind)
  const members = crewOf(reps, r.id)
  const leader = reps.find(x => x.id === r.leader_id)
  const socials = SOCIALS.filter(s => r[s.id] || r[s.followers])
  return (
    <Box component="article" aria-label={r.name} sx={{ p: 2, borderRadius: 3, border: 1, borderColor: r.approved ? 'divider' : tokens.rose, display: 'flex', flexDirection: 'column',
      gap: 1.25, opacity: r.active ? 1 : 0.55, bgcolor: r.approved ? 'background.paper' : tokens.roseWash }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <RepAvatar rep={r} size={44} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{r.name}</Typography>
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.25 }}>
            <Tag {...KIND_TONE[r.kind]}>{t(kindLabel(r.kind))}</Tag>
            {r.reach > 0 && <ReachBadge reach={r.reach} />}
            {!r.approved && <Tag fg={tokens.warnFg} bg={tokens.warnBg}>{t('Waiting for an OK')}</Tag>}
            {!r.active && <Tag>{t('Not a rep now')}</Tag>}
          </Stack>
        </Box>
        {isAdmin && <IconButton size="small" sx={{ mt: -0.5, mr: -0.75 }} aria-label={t('Edit {name}', { name: r.name })} onClick={onEdit}><EditIcon fontSize="small" /></IconButton>}
      </Stack>

      {(r.reach > 0 || socials.length > 0) && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>{t('Reaches {n}', { n: formatReach(r.reach) })}</Box>
          {socials.map(s => {
            const handle = r[s.id]
            const followers = r[s.followers]
            const text = `${s.id === 'instagram' ? '' : `${s.label} `}${handle ? `@${handle}` : ''}${followers ? ` ${formatReach(followers)}` : ''}`.trim()
            return handle
              ? <Link key={s.id} href={s.url(handle)} target="_blank" rel="noopener" aria-label={t('{name} on {network}', { name: r.name, network: s.label })}
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  {s.id === 'instagram' && <Box component="span" sx={{ width: 12, height: 12, display: 'inline-flex', '& svg': { width: 12, height: 12 } }}><Brand icon={siInstagram} /></Box>}
                  {text}
                </Link>
              : <span key={s.id}>{`${s.label} ${formatReach(followers)}`}</span>
          })}
          {!!r.community && <span>{t('{n} in person', { n: formatReach(r.community) })}</span>}
        </Typography>
      )}
      {members.length > 0 && (
        <ButtonBase onClick={onCrew} aria-pressed={crewShown} sx={{ justifyContent: 'flex-start', textAlign: 'left', p: 1, borderRadius: 2, bgcolor: tokens.ubeSoft, gap: 1 }}>
          <GroupsIcon fontSize="small" sx={{ color: tokens.ubeDeep }} />
          <Typography variant="caption" sx={{ flex: 1 }}>
            <Box component="span" sx={{ fontWeight: 600 }}>{tn(members.length, 'Leads a crew of {n}', 'Leads a crew of {n}')}</Box>
            {` · ${t('{n} people together', { n: formatReach(crewReach(reps, r)) })}`}
          </Typography>
          <Typography variant="caption" sx={{ color: tokens.ubeDeep, fontWeight: 600 }}>{crewShown ? t('Show everyone') : t('See crew')}</Typography>
        </ButtonBase>
      )}
      {leader && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('In {name}’s crew', { name: leader.name })}</Typography>}
      {r.notes && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{r.notes}</Typography>}

      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 'auto' }}>
        <RepCode code={r.code} />
        {seesBalance && (
          <Box sx={{ textAlign: 'right' }}>
            <Typography sx={{ fontFamily: fonts.display, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{formatMoney(balance)}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{credit ? t('credit') : t('owed')}</Typography>
          </Box>
        )}
      </Stack>
      <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mx: -0.75, mb: -0.5 }}>
        {r.active && <Button size="small" startIcon={<StarIcon />} onClick={onReward} aria-label={t('Log a reward for {name}', { name: r.name })}>{t('Reward')}</Button>}
        {credit && balance > 0 && <Button size="small" startIcon={<RedeemIcon />} onClick={onSettle} aria-label={t('Use the credit of {name}', { name: r.name })}>{t('Use credit')}</Button>}
        {!credit && isAdmin && balance > 0 && !mine && <Button size="small" startIcon={<PayIcon />} onClick={onSettle} aria-label={t('Pay {name}', { name: r.name })}>{t('Pay out')}</Button>}
        {(isAdmin || mine) && r.active && <Button size="small" startIcon={<ShareIcon />} onClick={onShare} aria-label={t('Share the page of {name}', { name: r.name })}>{t('Their page')}</Button>}
      </Stack>
    </Box>
  )
}

/** A reward on the list: what it's worth (at each step of reach, when it grows with it), who earns it, how often. */
function RuleCard({ rule: r, boost, onEdit }: { rule: RewardRule; boost: boolean; onEdit?: () => void }) {
  const grows = r.scales_with_reach && r.basis === 'fixed' && boost
  return (
    <Box component="article" aria-label={r.name} sx={{ p: 2, borderRadius: 3, border: 1, borderColor: 'divider', opacity: r.active ? 1 : 0.55,
      bgcolor: tokens.surfaceAlt, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>{r.name}</Typography>
        {onEdit && <IconButton size="small" sx={{ mt: -0.75, mr: -0.75 }} aria-label={t('Change {name}', { name: r.name })} onClick={onEdit}><EditIcon fontSize="small" /></IconButton>}
      </Stack>
      <Typography sx={{ fontFamily: fonts.display, fontSize: '1.3rem', color: tokens.roseDeep, lineHeight: 1.2 }}>
        {grows ? t('{from} up to {to}', { from: worth(r), to: formatMoney(r.amount * 5) }) : worth(r)}
      </Typography>
      {grows && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {[1, 2, 3, 5].map(x => formatMoney(r.amount * x)).join(' · ')}
        </Typography>
      )}
      <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Tag>{t(RULE_WHO.find(w => w.id === r.who)!.label)}</Tag>
        {grows && <Tag fg={tokens.ubeDeep} bg={tokens.ubeSoft}>{t('Grows with reach')}</Tag>}
        <Tag {...(r.needs_approval ? { fg: tokens.warnFg, bg: tokens.warnBg } : { fg: tokens.goodFg, bg: tokens.goodBg })}>
          {r.needs_approval ? t('An admin approves it') : t('Counts straight away')}</Tag>
        {r.monthly_limit !== null && <Tag>{tn(r.monthly_limit, 'Once a month', 'Up to {n} a month')}</Tag>}
        {!r.active && <Tag>{t('Off')}</Tag>}
      </Stack>
    </Box>
  )
}

const PLACE = [{ bg: tokens.rose, h: 104 }, { bg: tokens.ube, h: 78 }, { bg: tokens.matcha, h: 60 }]

/** The month's top three on a podium (second, first, third), and the next two as a list beside it. */
function Podium({ standings, amounts }: { standings: Standing[]; amounts: boolean[] }) {
  const amount = (i: number) => (amounts[i] ? formatMoney(standings[i].earned) : '')
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 2.5, md: 5 }} sx={{ alignItems: { md: 'flex-end' } }}>
      <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 1, flex: '0 0 auto' }}>
        {standings.slice(0, 3).map((s, i) => (
          <Box component="li" key={s.rep.id} aria-label={t('{place}. {name}', { place: i + 1, name: s.rep.name })}
            sx={{ order: i === 0 ? 2 : i === 1 ? 1 : 3, width: { xs: 104, sm: 128 }, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            {i === 0 && <TrophyIcon sx={{ color: tokens.roseDeep, mb: 0.5 }} />}
            <RepAvatar rep={s.rep} size={i === 0 ? 48 : 40} />
            <Typography variant="body2" sx={{ fontWeight: 600, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', mt: 0.5 }}>{s.rep.name}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.75 }}>{tn(s.rewards, '{n} reward', '{n} rewards')}</Typography>
            <Box sx={{ width: '100%', height: PLACE[i].h, borderRadius: '12px 12px 4px 4px', bgcolor: PLACE[i].bg, color: '#2B2522',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: `inset 0 -6px 0 rgba(43,37,34,0.08)`,
              transformOrigin: 'bottom', animation: 'eb-rise .7s cubic-bezier(.2,.8,.2,1) both', animationDelay: `${(2 - i) * 120}ms`,
              '@keyframes eb-rise': { from: { transform: 'scaleY(0.2)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }}>
              <Typography sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: i === 0 ? '1.8rem' : '1.4rem', lineHeight: 1 }}>{i + 1}</Typography>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{amount(i)}</Typography>
            </Box>
          </Box>
        ))}
      </Box>
      {standings.length > 3 && (
        <Stack component="ol" start={4} spacing={1.25} sx={{ listStyle: 'none', p: 0, m: 0, flex: 1, minWidth: 0, pb: { md: 1 } }}>
          {standings.slice(3).map((s, k) => {
            const i = k + 3
            return (
              <Box component="li" key={s.rep.id} aria-label={t('{place}. {name}', { place: i + 1, name: s.rep.name })}>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                  <Medal place={i + 1} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{s.rep.name}</Typography>
                      <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{amount(i)}</Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t(kindLabel(s.rep.kind))} · {tn(s.rewards, '{n} reward', '{n} rewards')}</Typography>
                  </Box>
                </Stack>
              </Box>
            )
          })}
        </Stack>
      )}
    </Stack>
  )
}

/** First, second and third: rose, ube and matcha; the rest a plain number. */
function Medal({ place }: { place: number }) {
  const bg = place === 1 ? tokens.rose : place === 2 ? tokens.ube : place === 3 ? tokens.matcha : tokens.surfaceAlt
  return (
    <Box aria-hidden sx={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: bg,
      color: place <= 3 ? '#2B2522' : tokens.inkSoft, fontFamily: fonts.display, fontWeight: 600, fontSize: '0.85rem',
      boxShadow: place <= 3 ? `0 0 0 3px ${tokens.surface}, 0 0 0 4px ${bg}` : 'none' }}>{place}</Box>
  )
}

/** A story or post about the café: reward who shared it, or add them first. */
function MentionCard({ item, onReward, onAdd }: { item: MentionToReward; onReward: (rep: SalesRep) => void; onAdd: () => void }) {
  const { mention: m, rep } = item
  return (
    <Box component="article" aria-label={`@${m.username}`} sx={{ display: 'flex', gap: 1.5, p: 1.5, borderRadius: 3, border: 1, borderColor: 'divider' }}>
      {m.media_url
        ? <Box component="img" src={m.media_url} alt="" sx={{ width: 56, height: 72, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
        : <Box sx={{ width: 56, height: 72, borderRadius: 2, bgcolor: tokens.roseSoft, flexShrink: 0 }} />}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>@{m.username}</Typography>
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
          {m.kind === 'story' ? t('Mentioned the café in their story') : t('Tagged the café in a post')} · {formatLocal(m.mentioned_at, 'd MMM')}
          {rep && rep.reach > 0 && ` · ${t('Reaches {n}', { n: formatReach(rep.reach) })}`}
        </Typography>
        {rep
          ? <Button size="small" startIcon={<StarIcon />} sx={{ mt: 0.5, ml: -0.75 }} onClick={() => onReward(rep)}>{t('Reward {name}', { name: rep.name })}</Button>
          : <Button size="small" startIcon={<PersonAddIcon />} sx={{ mt: 0.5, ml: -0.75 }} onClick={onAdd}>{t('Add as a customer')}</Button>}
      </Box>
    </Box>
  )
}

/** Followers as typed into a field: what the form holds until it's saved. */
type Counts = Record<'instagram_followers' | 'tiktok_followers' | 'youtube_followers' | 'facebook_followers' | 'community', string>
const COUNT_KEYS = ['instagram_followers', 'tiktok_followers', 'youtube_followers', 'facebook_followers', 'community'] as const
const asText = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))

/**
 * Add someone or change them. Anyone on the team adds people (an employee's wait for an admin's OK);
 * admins change them and pick who on the team. Their accounts and followers set their reach; a crew
 * puts them with their coach or studio.
 */
function RepDialog({ rep, reps, crewShare, onClose }: { rep: SalesRepInput; reps: SalesRep[]; crewShare: number; onClose: () => void }) {
  const { api, isAdmin, profiles, me } = useApp()
  const isOwner = isAdmin && !!me?.can_see_pay
  const run = useAction()
  const notify = useNotify()
  const [r, setR] = useState<SalesRepInput>(rep)
  const [counts, setCounts] = useState<Counts>(() => Object.fromEntries(COUNT_KEYS.map(k => [k, asText(rep[k])])) as Counts)
  const [looking, setLooking] = useState(false)
  const [lookNote, setLookNote] = useState<string | null>(null)
  const customers = useAsync('customers', () => (isAdmin ? api.customers() : Promise.resolve([])), [isAdmin])
  const set = (p: Partial<SalesRepInput>) => setR(x => ({ ...x, ...p }))
  const kind = r.kind ?? 'customer'
  const editing = !!r.id
  const team = profiles.filter(p => (p.role === 'admin' || p.role === 'employee') && p.active && !reps.some(x => x.profile_id === p.id && x.id !== r.id))
  const customer = (customers.data ?? []).find(c => c.id === r.customer_id) ?? null
  const parsed = Object.fromEntries(COUNT_KEYS.map(k => [k, parseCount(counts[k])])) as Record<(typeof COUNT_KEYS)[number], number | null>
  const reach = reachOf(Object.fromEntries(COUNT_KEYS.map(k => [k, Number.isFinite(parsed[k]) ? parsed[k] : null])))
  const leadsCrew = !!r.id && reps.some(x => x.leader_id === r.id)
  const leaders = reps.filter(x => x.active && x.approved && !x.leader_id && x.id !== r.id).sort((a, b) => a.name.localeCompare(b.name))
  const kinds = REP_KINDS.filter(k => isAdmin || k.id !== 'team').sort((a, b) => ['customer', 'ambassador', 'team'].indexOf(a.id) - ['customer', 'ambassador', 'team'].indexOf(b.id))

  const lookUp = async () => {
    const handle = cleanInstagram(r.instagram)
    if (!handle) return
    setLooking(true)
    setLookNote(null)
    try {
      const found = await api.lookupInstagram(handle)
      if (found.found && found.followers !== undefined) {
        setCounts(c => ({ ...c, instagram_followers: String(found.followers) }))
        set({ ...(found.picture?.startsWith('https://') ? { picture_url: found.picture } : {}), ...(!r.name.trim() || r.name.trim() === `@${handle}` ? { name: found.name ?? r.name } : {}) })
        notify(t('Instagram: {n} followers', { n: formatNumber(found.followers) }), 'success')
      } else setLookNote(found.reason ?? null)
    } catch (e) {
      setLookNote(e instanceof Error ? e.message : String(e))
    } finally { setLooking(false) }
  }

  const save = async () => {
    const ok = await run(async () => {
      if (!r.name.trim()) throw new Error(t('Give them a name'))
      for (const net of ['instagram', 'tiktok'] as const) if (r[net]?.trim() && !cleanInstagram(r[net])) throw new Error(t('That isn’t a {network} handle', { network: net === 'instagram' ? 'Instagram' : 'TikTok' }))
      if (r.youtube?.trim() && !cleanYoutube(r.youtube)) throw new Error(t('That isn’t a {network} handle', { network: 'YouTube' }))
      if (COUNT_KEYS.some(k => Number.isNaN(parsed[k]))) throw new Error(t('Followers are a number, like 1200 or 12.4k'))
      if (r.code?.trim() && !cleanRepCode(r.code)) throw new Error(t('A code is 3 to 12 letters and numbers'))
      if (kind === 'team' && !r.profile_id) throw new Error(t('Choose who on the team it is'))
      await api.saveSalesRep({ ...r, kind, profile_id: kind === 'team' ? r.profile_id : null, instagram: cleanInstagram(r.instagram), tiktok: cleanInstagram(r.tiktok),
        youtube: cleanYoutube(r.youtube), facebook: r.facebook?.trim() || null, ...parsed, code: cleanRepCode(r.code) ?? undefined, leader_id: r.leader_id || null })
    }, editing ? t('Saved') : isOwner ? t('{name} is a rep', { name: r.name.trim() }) : t('{name} is waiting for an OK', { name: r.name.trim() }))
    if (ok) onClose()
  }
  const remove = async () => { if (r.id && await run(() => api.deleteSalesRep(r.id!), t('Rep removed'))) onClose() }
  const count = (k: (typeof COUNT_KEYS)[number], label: string) => (
    <TextField label={label} value={counts[k]} onChange={e => setCounts(c => ({ ...c, [k]: e.target.value }))} inputMode="numeric" sx={{ width: { xs: '100%', sm: 150 } }}
      error={Number.isNaN(parsed[k])} placeholder={'0'} />
  )

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="rep-title">
      <DialogTitle id="rep-title">{editing ? rep.name : t('Add someone')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.25} sx={{ pt: 1 }}>
          {!isOwner && !editing && (
            <Alert severity="info" icon={<HeartIcon />}>{t('Thanks for bringing someone in. An owner says yes before they start earning; rewards you log for them wait until then.')}</Alert>
          )}
          {(isAdmin || !editing) && (
            <Box role="radiogroup" aria-label={t('Who they are')} sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: `repeat(${kinds.length}, minmax(0, 1fr))` } }}>
              {kinds.map(k => {
                const on = kind === k.id
                return (
                  <ButtonBase key={k.id} role="radio" aria-checked={on} onClick={() => set({ kind: k.id, ...(k.id === 'team' ? {} : { profile_id: null }) })}
                    sx={{ display: 'block', textAlign: 'left', p: 1.5, borderRadius: 3, border: 2, borderColor: on ? KIND_TONE[k.id].fg : 'divider', bgcolor: on ? KIND_TONE[k.id].bg : 'transparent' }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{t(k.label)}</Typography>
                      {on && <CheckIcon fontSize="small" sx={{ color: KIND_TONE[k.id].fg }} />}
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t(KIND_PITCH[k.id])}</Typography>
                  </ButtonBase>
                )
              })}
            </Box>
          )}
          {kind === 'team' && (
            <TextField select label={t('Person')} value={r.profile_id ?? ''} onChange={e => {
              const p = profiles.find(x => x.id === e.target.value)
              set({ profile_id: e.target.value || null, ...(p && !r.name.trim() ? { name: p.full_name } : {}) })
            }}>
              {team.map(p => <MenuItem key={p.id} value={p.id}>{p.full_name}{p.id === me?.id ? ` (${t('you')})` : ''}</MenuItem>)}
            </TextField>
          )}
          <TextField label={t('Name')} value={r.name} onChange={e => set({ name: e.target.value })} required autoFocus={!editing} />

          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('Their reach')}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.25 }}>
              {t('Their accounts and roughly how many follow each. Rewards that grow with reach are worth more for people who reach more.')}
            </Typography>
            <Stack spacing={1.25}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField label={'Instagram'} value={r.instagram ?? ''} onChange={e => { set({ instagram: e.target.value }); setLookNote(null) }} sx={{ flex: 1 }}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start">@</InputAdornment>, endAdornment: (
                    <InputAdornment position="end">
                      <Button size="small" onClick={() => void lookUp()} disabled={looking || !cleanInstagram(r.instagram)}>{looking ? t('Looking…') : t('Look up')}</Button>
                    </InputAdornment>) } }} />
                {count('instagram_followers', t('Followers'))}
              </Stack>
              {lookNote && <Alert severity="info" onClose={() => setLookNote(null)}>{lookNote}</Alert>}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField label={'TikTok'} value={r.tiktok ?? ''} onChange={e => set({ tiktok: e.target.value })} sx={{ flex: 1 }}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start">@</InputAdornment> } }} />
                {count('tiktok_followers', t('Followers'))}
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField label={'YouTube'} value={r.youtube ?? ''} onChange={e => set({ youtube: e.target.value })} sx={{ flex: 1 }}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start">@</InputAdornment> } }} />
                {count('youtube_followers', t('Subscribers'))}
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField label={'Facebook'} value={r.facebook ?? ''} onChange={e => set({ facebook: e.target.value })} sx={{ flex: 1 }} placeholder={t('Page name or link')} />
                {count('facebook_followers', t('Followers'))}
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary' }}>{t('People they see in person: a gym’s members, a studio’s clients, a WhatsApp group')}</Typography>
                {count('community', t('People'))}
              </Stack>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1.5, p: 1.25, borderRadius: 2, bgcolor: tokens.surfaceAlt }} aria-live="polite">
              <Typography variant="body2" sx={{ flex: 1 }}>{t('Reaches {n} people', { n: formatNumber(reach) })}</Typography>
              <ReachBadge reach={reach} />
            </Stack>
          </Box>

          {!leadsCrew && leaders.length > 0 && (
            <TextField select label={t('In a crew')} value={r.leader_id ?? ''} onChange={e => set({ leader_id: e.target.value || null })}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              helperText={crewShare > 0 ? t('Their crew’s leader (a coach, a studio) earns {n}% of what they earn', { n: formatNumber(crewShare) }) : t('Their coach, studio or club, if they have one')}>
              <MenuItem value="">{t('Not in a crew')}</MenuItem>
              {leaders.map(l => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
            </TextField>
          )}
          {isAdmin && kind !== 'team' && (
            <Autocomplete options={customers.data ?? []} value={customer} getOptionLabel={c => customerName(c)} isOptionEqualToValue={(a, b) => a.id === b.id}
              onChange={(_, c) => set({ customer_id: c?.id ?? null, ...(c && !r.name.trim() ? { name: customerName(c) } : {}),
                ...(c?.instagram && !r.instagram ? { instagram: c.instagram } : {}), ...(c?.phone && !r.phone ? { phone: c.phone } : {}), ...(c?.email && !r.email ? { email: c.email } : {}) })}
              renderInput={params => <TextField {...params} label={t('On Customers')} helperText={t('Optional: who they are on the Customers page')} />} />
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Phone')} value={r.phone ?? ''} onChange={e => set({ phone: e.target.value })} sx={{ flex: 1 }} />
            <TextField label={t('Email')} value={r.email ?? ''} onChange={e => set({ email: e.target.value })} sx={{ flex: 1 }} />
          </Stack>
          {isAdmin && (
            <TextField label={t('Code on their cards')} value={r.code ?? ''} onChange={e => set({ code: e.target.value.toUpperCase() })}
              helperText={r.code ? t('3 to 12 letters and numbers') : t('Made from their name if left empty')} />
          )}
          <TextField label={t('Notes')} value={r.notes ?? ''} onChange={e => set({ notes: e.target.value })} multiline minRows={2}
            placeholder={t('Who they are, how they help: “Head coach at the MMA gym, 20 fighters”')} />
          {isAdmin && editing && <FormControlLabel control={<Switch checked={r.active ?? true} onChange={e => set({ active: e.target.checked })} />} label={t('Still a rep')} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        {isAdmin && editing && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{editing || isOwner ? t('Save') : t('Send for an OK')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** The reward on the list that fits a story or a post best (by its name), else the first that fits the rep. */
function ruleFor(rules: RewardRule[], kind: RepKind, mention?: Mention) {
  const fits = rules.filter(r => ruleFits(r, kind))
  const words = mention?.kind === 'story' ? /stor|histori/i : mention?.kind === 'post' ? /post|publica|tag|etiquet/i : null
  return (words && fits.find(r => words.test(r.name))) || fits[0] || null
}

/** Log a reward for a rep from the list: what it's for, the sale for a percentage, and a link to it. */
function LogDialog({ rep, mention, rules, ledger, isAdmin, self, boost, onClose }: {
  rep: SalesRep; mention?: Mention; rules: RewardRule[]; ledger: RepReward[]; isAdmin: boolean; self: boolean; boost: boolean; onClose: () => void
}) {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const fits = rules.filter(r => ruleFits(r, rep.kind))
  const [ruleId, setRuleId] = useState(ruleFor(rules, rep.kind, mention)?.id ?? '')
  const [sale, setSale] = useState('')
  const [note, setNote] = useState('')
  const [proof, setProof] = useState(mention?.permalink ?? '')
  const [on, setOn] = useState(today())
  const rule = fits.find(r => r.id === ruleId) ?? null
  const amount = rule ? rewardAmount(rule, Number(sale.replace(',', '.')) || 0, rep.reach, boost) : 0
  const boosted = !!rule && rule.basis === 'fixed' && rule.scales_with_reach && boost && reachMultiplier(rep.reach) > 1
  const full = rule ? limitReached(rule, ledger, rep.id, on) : false
  const waits = !!rule && (self || !rep.approved || (!isAdmin && rule.needs_approval))
  const save = async () => {
    let waiting = false
    const ok = await run(async () => {
      if (!rule) throw new Error(t('Choose what it’s for'))
      if (rule.basis === 'percent' && !(amount > 0)) throw new Error(t('Give the amount of the sale'))
      if (proof.trim() && !/^https?:\/\/\S+$/i.test(proof.trim())) throw new Error(t('The link has to start with https://'))
      const out = await api.logReward({ rep_id: rep.id, rule_id: rule.id, sale_amount: rule.basis === 'percent' ? Number(sale.replace(',', '.')) : null,
        note, proof_url: proof.trim() || null, mention_id: mention?.id ?? null, occurred_on: on })
      waiting = out.status === 'pending'
    })
    if (!ok) return
    onClose()
    notify(waiting ? t('Logged: an admin approves it') : t('{amount} for {name}', { amount: formatMoney(amount), name: rep.name }), 'success')
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="log-title">
      <DialogTitle id="log-title">{t('Reward {name}', { name: rep.name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {fits.length === 0
            ? <Alert severity="info">{earnsCredit(rep.kind) ? t('Nothing on the list is for customers yet.') : t('Nothing on the list is for reps yet.')}</Alert>
            : <TextField select label={t('What for')} value={ruleId} onChange={e => setRuleId(e.target.value)}>
                {fits.map(r => <MenuItem key={r.id} value={r.id}>{r.name} · {r.basis === 'fixed' ? formatMoney(rewardAmount(r, null, rep.reach, boost)) : worth(r)}</MenuItem>)}
              </TextField>}
          {rule?.basis === 'percent' && (
            <TextField label={t('The sale')} value={sale} onChange={e => setSale(e.target.value)} inputMode="decimal" autoFocus
              helperText={t('What the event or order came to')} slotProps={{ input: { startAdornment: <InputAdornment position="start">€</InputAdornment> } }} />
          )}
          <TextField label={t('Day')} type="date" value={on} onChange={e => e.target.value && setOn(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today() } }} />
          <TextField label={t('Link')} value={proof} onChange={e => setProof(e.target.value)} placeholder={'https://'} helperText={t('The story or post, if there is one')} />
          <TextField label={t('Notes')} value={note} onChange={e => setNote(e.target.value)} />
          {rule && (full
            ? <Alert severity="warning">{tn(rule.monthly_limit ?? 0, '{name} has had this once this month, the most there is.', '{name} has had this {n} times this month, the most there is.', { name: rep.name })}</Alert>
            : <Alert severity={waits ? 'info' : 'success'} icon={<StarIcon />}>
                {amount > 0 ? (earnsCredit(rep.kind) ? t('{amount} credit for {name}', { amount: formatMoney(amount), name: rep.name }) : t('{amount} commission for {name}', { amount: formatMoney(amount), name: rep.name })) : t('Give the amount of the sale')}
                {rule.monthly_limit !== null && ` · ${t('{used} of {limit} this month', { used: timesInMonth(ledger, rep.id, rule.id, on), limit: rule.monthly_limit })}`}
                {boosted && <Typography variant="body2">{t('×{x} for reaching {n} people ({tier})', { x: reachMultiplier(rep.reach), n: formatNumber(rep.reach), tier: t(reachTier(rep.reach).label) })}</Typography>}
                {waits && <Typography variant="body2">{self ? t('Your own reward: someone else approves it.') : !rep.approved ? t('{name} is waiting for an OK: it counts once they’re in.', { name: rep.name }) : t('An admin approves it before it counts.')}</Typography>}
              </Alert>)}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" disabled={!rule || full} onClick={() => void save()}>{t('Log it')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** A customer spends credit at the till, or a rep is paid what they're owed. */
function SettleDialog({ rep, balance, onClose }: { rep: SalesRep; balance: number; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const notify = useNotify()
  const credit = earnsCredit(rep.kind)
  const [amount, setAmount] = useState(credit ? '' : String(balance))
  const [note, setNote] = useState('')
  const value = Number(amount.replace(',', '.')) || 0
  const save = async () => {
    let left = 0
    const ok = await run(async () => {
      if (!(value > 0)) throw new Error(t('Give an amount above 0'))
      if (value > balance) throw new Error(credit ? t('{name} has {amount} of credit', { name: rep.name, amount: formatMoney(balance) }) : t('{name} is owed {amount}', { name: rep.name, amount: formatMoney(balance) }))
      left = await api.settleReward(rep.id, value, note)
    })
    if (!ok) return
    onClose()
    notify(credit ? t('Credit used: {left} left', { left: formatMoney(left) }) : t('Paid: {amount} to {name}', { amount: formatMoney(value), name: rep.name }), 'success')
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="settle-title">
      <DialogTitle id="settle-title">{credit ? t('Use the credit of {name}', { name: rep.name }) : t('Pay {name}', { name: rep.name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {credit ? t('{amount} of credit to spend. Take what they spend off their bill at the till, and record it here.', { amount: formatMoney(balance) })
              : t('{name} is owed {amount} in commission. Pay it (by transfer or with payroll), then record it here.', { name: rep.name, amount: formatMoney(balance) })}
          </Typography>
          <TextField label={t('Amount')} value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" autoFocus
            slotProps={{ input: { startAdornment: <InputAdornment position="start">€</InputAdornment> } }} />
          <TextField label={t('Notes')} value={note} onChange={e => setNote(e.target.value)} placeholder={credit ? t('What they had') : t('Bank transfer, with payroll…')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{credit ? t('Use credit') : t('Record the payment')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** A reward on the list: who earns it, what it's worth (and whether it grows with reach), whether it waits for approval and how often. */
function RuleDialog({ rule, onClose }: { rule: RewardRuleInput; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [r, setR] = useState<RewardRuleInput>(rule)
  const [amount, setAmount] = useState(String(rule.amount))
  const set = (p: Partial<RewardRuleInput>) => setR(x => ({ ...x, ...p }))
  const value = Number(amount.replace(',', '.'))
  const save = async () => {
    const ok = await run(async () => {
      if (!r.name.trim()) throw new Error(t('Give it a name'))
      if (!(value > 0) || (r.basis === 'percent' && value > 100)) throw new Error(r.basis === 'percent' ? t('Give a percentage from 0 to 100') : t('Give an amount above 0'))
      await api.saveRewardRule({ ...r, name: r.name.trim(), amount: value, scales_with_reach: r.basis === 'fixed' && r.scales_with_reach })
    }, t('Saved'))
    if (ok) onClose()
  }
  const remove = async () => { if (r.id && await run(() => api.deleteRewardRule(r.id!), t('Taken off the list'))) onClose() }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="rule-title">
      <DialogTitle id="rule-title">{r.id ? rule.name : t('Add a reward')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('What earns it')} value={r.name} onChange={e => set({ name: e.target.value })} required placeholder={t('Reposted our story')} />
          <TextField select label={t('Who earns it')} value={r.who} onChange={e => set({ who: e.target.value as RewardRule['who'] })}
            helperText={t('Customers get credit to spend in the café; reps get commission.')}>
            {RULE_WHO.map(w => <MenuItem key={w.id} value={w.id}>{t(w.label)}</MenuItem>)}
          </TextField>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label={t('Worth')} value={r.basis} onChange={e => set({ basis: e.target.value as RewardRule['basis'] })} sx={{ flex: 1 }}>
              <MenuItem value="fixed">{t('An amount each time')}</MenuItem>
              <MenuItem value="percent">{t('A share of the sale')}</MenuItem>
            </TextField>
            <TextField label={r.basis === 'percent' ? t('Percentage') : t('Amount')} value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" sx={{ flex: 1 }}
              slotProps={{ input: r.basis === 'percent' ? { endAdornment: <InputAdornment position="end">%</InputAdornment> } : { startAdornment: <InputAdornment position="start">€</InputAdornment> } }} />
          </Stack>
          {r.basis === 'fixed' && (
            <Box>
              <FormControlLabel control={<Switch checked={r.scales_with_reach} onChange={e => set({ scales_with_reach: e.target.checked })} />}
                label={t('Grows with their reach')} />
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                {r.scales_with_reach && value > 0
                  ? t('Worth {a}, {b} from 1,000 people, {c} from 10,000 and {d} from 50,000.', { a: formatMoney(value), b: formatMoney(value * 2), c: formatMoney(value * 3), d: formatMoney(value * 5) })
                  : t('For stories, posts and shout-outs: someone with more followers is worth more to the café.')}
              </Typography>
            </Box>
          )}
          <TextField select label={t('How often')} value={r.monthly_limit ?? ''} onChange={e => set({ monthly_limit: e.target.value === '' ? null : Number(e.target.value) })}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} helperText={t('The most times one person earns it in a month')}>
            <MenuItem value="">{t('No limit')}</MenuItem>
            {[1, 2, 4, 10, 20].map(n => <MenuItem key={n} value={n}>{tn(n, 'Once a month', 'Up to {n} a month')}</MenuItem>)}
          </TextField>
          <FormControlLabel control={<Switch checked={r.needs_approval} onChange={e => set({ needs_approval: e.target.checked })} />}
            label={t('An admin approves it before it counts')} />
          {r.id && <FormControlLabel control={<Switch checked={r.active} onChange={e => set({ active: e.target.checked })} />} label={t('On the list')} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        {r.id && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}

/** A rep's own page: its link to send them (copy, WhatsApp), and a new one when it was shared by mistake. */
function ShareDialog({ rep, onClose }: { rep: SalesRep; onClose: () => void }) {
  const { api, isAdmin, me } = useApp()
  const notify = useNotify()
  const run = useAction()
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { api.repLink(rep.id).then(setToken, e => setError(e instanceof Error ? e.message : String(e))) }, [api, rep.id])
  const link = token ? `${window.location.origin}/rep/${token}` : ''
  const mine = rep.profile_id === me?.id
  const text = t('Your page at the café: what you’ve earned, your reach and your crew. {link}', { link })
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); notify(t('Link copied'), 'success') } catch { notify(t('Couldn’t copy: select the link and copy it'), 'error') }
  }
  const renew = () => run(async () => setToken(await api.newRepLink(rep.id)), t('New link made: the old one no longer works'))
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="share-title">
      <DialogTitle id="share-title">{mine ? t('My page') : t('{name}’s own page', { name: rep.name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {mine
              ? t('What you’ve earned, your reach and your crew, and what earns a reward, on one page. Open it on your phone.')
              : t('Their own page shows what they’ve earned, their reach and crew, and what earns a reward. From it they tell you what they shared and add people to their crew; you say yes to both. Anyone with the link can open it, so send it only to them.')}
          </Typography>
          <ErrorBox error={error} />
          <TextField label={t('Link')} value={link || t('Loading…')} slotProps={{ htmlInput: { readOnly: true }, input: { endAdornment: (
            <InputAdornment position="end"><Button size="small" onClick={() => void copy()} disabled={!token}>{t('Copy')}</Button></InputAdornment>) } }}
            onFocus={e => e.target.select()} />
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Button variant="contained" disabled={!token} href={`https://wa.me/${(rep.phone ?? '').replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">{'WhatsApp'}</Button>
            {token
              ? <Button variant="outlined" href={link} target="_blank" rel="noreferrer">{t('Open it')}</Button>
              : <Button variant="outlined" disabled>{t('Open it')}</Button>}
            {isAdmin && <Button disabled={!token} onClick={() => void renew()} sx={{ ml: { sm: 'auto' } }}>{t('New link')}</Button>}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{t('Done')}</Button></DialogActions>
    </Dialog>
  )
}

/** Crews and reach: what a crew's leader earns of their crew's rewards, whether rewards grow with reach, and the café's words to its reps. */
function SettingsDialog({ settings, onClose }: { settings: RepSettings; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [s, setS] = useState(settings)
  const shares = useMemo(() => [...new Set([0, 5, 10, 15, 20, 25, settings.crew_share])].sort((a, b) => a - b), [settings.crew_share])
  const save = async () => {
    if (await run(() => api.updateRepSettings({ crew_share: s.crew_share, boost_by_reach: s.boost_by_reach, pitch: s.pitch?.trim() || null }), t('Saved'))) onClose()
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="tune-title">
      <DialogTitle id="tune-title">{t('Crews & reach')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.25} sx={{ pt: 1 }}>
          <TextField select label={t('A crew’s leader earns')} value={s.crew_share} onChange={e => setS({ ...s, crew_share: Number(e.target.value) })}
            helperText={t('Of everything their crew earns, on top of their own: a coach of what their fighters earn')}>
            {shares.map(n => <MenuItem key={n} value={n}>{n === 0 ? t('Nothing') : `${formatNumber(n)}%`}</MenuItem>)}
          </TextField>
          <Box>
            <FormControlLabel control={<Switch checked={s.boost_by_reach} onChange={e => setS({ ...s, boost_by_reach: e.target.checked })} />}
              label={t('Rewards that grow with reach do')} />
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{t('×2 from 1,000 people, ×3 from 10,000, ×5 from 50,000.')}</Typography>
          </Box>
          <TextField label={t('Your words to your reps')} value={s.pitch ?? ''} onChange={e => setS({ ...s, pitch: e.target.value })} multiline minRows={3}
            placeholder={t(DEFAULT_PITCH)} helperText={t('At the top of each rep’s own page, and of this one')} slotProps={{ htmlInput: { maxLength: 600 } }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
      </DialogActions>
    </Dialog>
  )
}
