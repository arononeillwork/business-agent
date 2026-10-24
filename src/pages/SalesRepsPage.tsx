import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment,
  Link, MenuItem, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
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
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { siInstagram } from 'simple-icons'
import { useApp } from '../app/AppContext'
import { useAsync } from '../app/hooks'
import { useAction, useNotify } from '../app/Notify'
import { Brand } from '../components/Connectors'
import { Empty, ErrorBox, PageHeader, SectionTitle, StatGrid, StatTile, Tag } from '../components/common'
import { ExportButton } from '../components/tables'
import type { ExportTable } from '../lib/export'
import {
  REP_KINDS, REWARD_IDEAS, RULE_WHO, balanceOf, cleanInstagram, cleanRepCode, earnsCredit, kindLabel, leaderboard, limitReached, mentionsToReward,
  outstanding, rewardAmount, ruleFits, timesInMonth,
  type MentionToReward, type RepKind, type RepReward, type RewardRule, type RewardRuleInput, type SalesRep, type SalesRepInput, type Standing,
} from '../../shared/reps'
import type { Mention } from '../../shared/mentions'
import { customerName } from '../../shared/customers'
import { formatLocal, formatMoney, today } from '../../shared/time'
import { fonts, tokens } from '../theme'
import { msg, t, tn } from '../i18n'

const KIND_TONE: Record<RepKind, { fg: string; bg: string }> = {
  customer: { fg: tokens.goodFg, bg: tokens.goodBg }, ambassador: { fg: tokens.infoFg, bg: tokens.infoBg }, team: { fg: tokens.roseDeep, bg: tokens.roseSoft },
}
const STATUS_TONE: Record<RepReward['status'], { label: string; fg: string; bg: string }> = {
  approved: { label: msg('Counted'), fg: tokens.goodFg, bg: tokens.goodBg },
  pending: { label: msg('Waiting'), fg: tokens.warnFg, bg: tokens.warnBg },
  rejected: { label: msg('Turned down'), fg: tokens.neutralFg, bg: tokens.neutralBg },
}
type Filter = 'all' | RepKind
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: msg('All') }, { id: 'customer', label: msg('Customers') }, { id: 'ambassador', label: msg('Ambassadors') }, { id: 'team', label: msg('On the team') },
]

const day = (d: string) => formatLocal(`${d}T12:00:00Z`, 'd MMM')
const instagramUrl = (handle: string) => `https://www.instagram.com/${handle}/`
/** What a reward on the list is worth, in words: "€1.00 credit", "€3.00", "10% of the sale". */
function worth(r: Pick<RewardRule, 'basis' | 'amount' | 'who'>) {
  if (r.basis === 'percent') return t('{n}% of the sale', { n: r.amount })
  return r.who === 'customers' ? t('{amount} credit', { amount: formatMoney(r.amount) }) : formatMoney(r.amount)
}
/** A ledger line's words: the list's names are as typed; the database's own words are translated. */
const lineLabel = (r: RepReward) => (r.kind === 'earn' ? r.label : t(r.label))

/**
 * Sales reps & rewards: everyone who sells the café for it (the team, ambassadors from outside it,
 * customers who spread the word), each with a code for their business cards, and the café's list
 * of what earns a reward. Customers earn credit to spend in the café; the team and ambassadors
 * earn commission, paid out. The team logs rewards and lets customers spend their credit at the
 * till; admins add reps, set the list, approve what waits and pay commission out (the database
 * enforces the same).
 */
export function SalesRepsPage() {
  const { api, me, isAdmin, profiles } = useApp()
  const reps = useAsync('sales-reps', () => api.salesReps(), [])
  const rules = useAsync('reward-rules', () => api.rewardRules(), [])
  const rewards = useAsync('rep-rewards', () => api.repRewards(), [])
  const mentions = useAsync('instagram-mentions', () => (isAdmin ? api.instagramMentions() : Promise.resolve([])), [isAdmin])
  const run = useAction()
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<SalesRepInput | null>(null)
  const [logging, setLogging] = useState<{ rep: SalesRep; mention?: Mention } | null>(null)
  const [settling, setSettling] = useState<SalesRep | null>(null)
  const [rule, setRule] = useState<RewardRuleInput | null>(null)
  const [everything, setEverything] = useState(false)

  const now = today()
  const month = now.slice(0, 7)
  const allReps = reps.data ?? []
  const allRules = rules.data ?? []
  const ledger = rewards.data ?? []
  const active = allReps.filter(r => r.active)
  const myRep = allReps.find(r => r.profile_id === me?.id) ?? null
  const shown = allReps.filter(r => filter === 'all' || r.kind === filter).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
  const repName = (id: string) => allReps.find(r => r.id === id)?.name ?? ''
  const personName = (id: string | null) => profiles.find(p => p.id === id)?.full_name ?? ''
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

  const decide = (r: RepReward, approve: boolean) => run(() => api.decideReward(r.id, approve),
    approve ? t('Approved: {amount} for {name}', { amount: formatMoney(r.amount), name: repName(r.rep_id) }) : t('Turned down'))
  const remove = (r: RepReward) => run(() => api.deleteReward(r.id), t('Taken off'))
  const newRep = (): SalesRepInput => ({ name: '', kind: isAdmin ? 'ambassador' : 'customer', active: true })

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
        <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => setEditing(newRep())}>{isAdmin ? t('Add a rep') : t('Add a customer')}</Button>
      </>} />
      <ErrorBox error={reps.error ?? rules.error ?? rewards.error} />

      <HowItWorks />

      <StatGrid>
        <StatTile label={t('Rewards this month')} value={rewards.data ? formatMoney(thisMonth.reduce((a, r) => a + r.amount, 0)) : '–'}
          note={tn(thisMonth.length, '{n} reward', '{n} rewards')} />
        <StatTile label={t('Credit to spend')} value={rewards.data ? formatMoney(owed.credit) : '–'} note={t('Customers spend it in the café')} />
        {isAdmin
          ? <StatTile label={t('Commission owed')} value={rewards.data ? formatMoney(owed.commission) : '–'} note={t('To pay the team and ambassadors')} />
          : myRep
            ? <StatTile label={t('My commission')} value={formatMoney(balanceOf(ledger, myRep.id))} note={t('Your code: {code}', { code: myRep.code })} />
            : <StatTile label={t('Reps')} value={reps.data ? active.length : '–'} note={tn(active.filter(r => r.kind === 'customer').length, '{n} customer', '{n} customers')} />}
        <StatTile label={t('Waiting for approval')} value={rewards.data ? pending.length : '–'}
          note={pending.length ? (isAdmin ? t('Approve them below') : t('An admin approves them')) : t('Nothing waiting')} />
      </StatGrid>

      {isAdmin && pending.length > 0 && (
        <Card component="section" aria-label={t('Waiting for approval')} sx={{ mb: 3, borderLeft: `4px solid ${tokens.rose}` }}>
          <CardContent>
            <SectionTitle>{t('Waiting for approval')}</SectionTitle>
            <Stack spacing={1}>
              {pending.map(r => {
                const own = allReps.find(x => x.id === r.rep_id)?.profile_id === me?.id
                return (
                  <Stack key={r.id} role="group" aria-label={`${repName(r.rep_id)}: ${r.label}`} direction={{ xs: 'column', sm: 'row' }} spacing={1.5}
                    sx={{ alignItems: { sm: 'center' }, py: 1, borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{repName(r.rep_id)} · {r.label}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {[day(r.occurred_on), r.sale_amount ? t('Sale of {amount}', { amount: formatMoney(r.sale_amount) }) : null, r.note,
                          r.logged_by ? t('Logged by {name}', { name: personName(r.logged_by) }) : null].filter(Boolean).join(' · ')}
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

      <Card component="section" aria-label={t('Top sellers this month')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle>{t('Top sellers this month')}</SectionTitle>
          {top.length === 0
            ? <Empty>{t('No rewards yet this month.')}</Empty>
            : <Podium standings={top} amounts={top.map(s => seesBalance(s.rep))} />}
        </CardContent>
      </Card>

      <Card component="section" aria-label={t('Reps')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={
            <ToggleButtonGroup size="small" exclusive value={filter} onChange={(_, v: Filter | null) => v && setFilter(v)} aria-label={t('Show')}>
              {FILTERS.map(f => <ToggleButton key={f.id} value={f.id} sx={{ px: 1.25, py: 0.25 }}>{t(f.label)}</ToggleButton>)}
            </ToggleButtonGroup>
          }>{t('Reps')}</SectionTitle>
          {shown.length === 0
            ? <Empty>{reps.data ? t('Nobody yet. Add the people who tell others about the café: regulars, a friend with a hotel, someone on the team.') : t('Loading…')}</Empty>
            : <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell>{t('Rep')}</TableCell><TableCell>{t('Code')}</TableCell><TableCell align="right">{t('Balance')}</TableCell><TableCell />
                  </TableRow></TableHead>
                  <TableBody>
                    {shown.map(r => {
                      const balance = balanceOf(ledger, r.id)
                      const credit = earnsCredit(r.kind)
                      return (
                        <TableRow key={r.id} hover sx={{ opacity: r.active ? 1 : 0.55 }}>
                          <TableCell sx={{ minWidth: 200 }}>
                            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>{r.name}</Typography>
                              <Tag {...KIND_TONE[r.kind]}>{t(kindLabel(r.kind))}</Tag>
                              {!r.active && <Tag>{t('Not a rep now')}</Tag>}
                            </Stack>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                              {r.instagram && <Link href={instagramUrl(r.instagram)} target="_blank" rel="noopener" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                                aria-label={t('{name} on Instagram', { name: r.name })}>
                                <Box component="span" sx={{ width: 12, height: 12, display: 'inline-flex', '& svg': { width: 12, height: 12 } }}><Brand icon={siInstagram} /></Box>@{r.instagram}
                              </Link>}
                              {r.notes && <span>{r.notes}</span>}
                            </Typography>
                          </TableCell>
                          <TableCell><RepCode code={r.code} /></TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {seesBalance(r) ? <>
                              {formatMoney(balance)}
                              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{credit ? t('credit') : t('owed')}</Typography>
                            </> : '–'}
                          </TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                            {r.active && <Button size="small" startIcon={<StarIcon />} onClick={() => setLogging({ rep: r })} aria-label={t('Log a reward for {name}', { name: r.name })}>{t('Reward')}</Button>}
                            {credit && balance > 0 && <Button size="small" startIcon={<RedeemIcon />} onClick={() => setSettling(r)} aria-label={t('Use the credit of {name}', { name: r.name })}>{t('Use credit')}</Button>}
                            {!credit && isAdmin && balance > 0 && r.profile_id !== me?.id && <Button size="small" startIcon={<PayIcon />} onClick={() => setSettling(r)} aria-label={t('Pay {name}', { name: r.name })}>{t('Pay out')}</Button>}
                            {isAdmin && <IconButton size="small" aria-label={t('Edit {name}', { name: r.name })} onClick={() => setEditing(r)}><EditIcon fontSize="small" /></IconButton>}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </Box>}
        </CardContent>
      </Card>

      <Card component="section" aria-label={t('What earns a reward')} sx={{ mb: 3 }}>
        <CardContent>
          <SectionTitle action={isAdmin && <Button size="small" startIcon={<AddIcon />} onClick={() => setRule({ name: '', who: 'everyone', basis: 'fixed', amount: 1, needs_approval: false, monthly_limit: null, active: true })}>{t('Add a reward')}</Button>}>
            {t('What earns a reward')}
          </SectionTitle>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            {t('Customers get theirs as credit to spend in the café; the team and ambassadors as commission. Reward what brings people in, not cards handed out.')}
          </Typography>
          {allRules.length === 0
            ? <Empty>{rules.data ? (isAdmin ? t('Nothing on the list yet. Start from the usual ones below.') : t('Nothing on the list yet.')) : t('Loading…')}</Empty>
            : <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
                {allRules.map(r => (
                  <Box key={r.id} component="article" aria-label={r.name} sx={{ p: 2, borderRadius: 3, border: 1, borderColor: 'divider', opacity: r.active ? 1 : 0.55,
                    bgcolor: tokens.surfaceAlt, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{r.name}</Typography>
                      {isAdmin && <IconButton size="small" sx={{ mt: -0.75, mr: -0.75 }} aria-label={t('Change {name}', { name: r.name })} onClick={() => setRule(r)}><EditIcon fontSize="small" /></IconButton>}
                    </Stack>
                    <Typography sx={{ fontFamily: fonts.display, fontSize: '1.3rem', color: tokens.roseDeep, lineHeight: 1.2 }}>{worth(r)}</Typography>
                    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                      <Tag>{t(RULE_WHO.find(w => w.id === r.who)!.label)}</Tag>
                      <Tag {...(r.needs_approval ? { fg: tokens.warnFg, bg: tokens.warnBg } : { fg: tokens.goodFg, bg: tokens.goodBg })}>
                        {r.needs_approval ? t('An admin approves it') : t('Counts straight away')}</Tag>
                      {r.monthly_limit !== null && <Tag>{tn(r.monthly_limit, 'Once a month', 'Up to {n} a month')}</Tag>}
                      {!r.active && <Tag>{t('Off')}</Tag>}
                    </Stack>
                  </Box>
                ))}
              </Box>}
          {isAdmin && ideas.length > 0 && (
            <Box sx={{ mt: 2.5 }}>
              <Typography variant="overline" sx={{ color: 'text.secondary' }}>{t('Usual for a café')}</Typography>
              <Stack spacing={1} sx={{ mt: 0.5 }}>
                {ideas.map(i => (
                  <Stack key={i.key} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, py: 1, borderTop: 1, borderColor: 'divider' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{t(i.name)} · {worth(i)}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t(i.what)}</Typography>
                    </Box>
                    <Button size="small" variant="outlined" startIcon={<AddIcon />} aria-label={t('Add {name}', { name: t(i.name) })}
                      onClick={() => setRule({ name: t(i.name), who: i.who, basis: i.basis, amount: i.amount, needs_approval: i.needs_approval, monthly_limit: i.monthly_limit, active: true })}>
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
                          {(r.note || r.sale_amount) && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                            {[r.sale_amount ? t('Sale of {amount}', { amount: formatMoney(r.sale_amount) }) : null, r.note].filter(Boolean).join(' · ')}
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

      {editing && <RepDialog rep={editing} reps={allReps} onClose={() => setEditing(null)} />}
      {logging && <LogDialog rep={logging.rep} mention={logging.mention} rules={activeRules} ledger={ledger} isAdmin={isAdmin} self={logging.rep.id === myRep?.id}
        onClose={() => setLogging(null)} />}
      {settling && <SettleDialog rep={settling} balance={balanceOf(ledger, settling.id)} onClose={() => setSettling(null)} />}
      {rule && <RuleDialog rule={rule} onClose={() => setRule(null)} />}
    </>
  )
}

/** Three steps across the top: cards with a code, people brought in, a reward for it. */
function HowItWorks() {
  const steps = [
    { icon: <CardsIcon />, title: t('Cards with their code'), text: t('Each rep hands out business cards with their own code.') },
    { icon: <ShareIcon />, title: t('They spread the word'), text: t('A new customer shows the card at the till; customers share the café’s stories.') },
    { icon: <TrophyIcon />, title: t('They earn a reward'), text: t('Credit to spend in the café for customers, commission for reps.') },
  ]
  return (
    <Box component="section" aria-label={t('How it works')} sx={{ display: 'grid', gap: 1.5, mb: 3, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
      {steps.map((s, i) => (
        <Stack key={s.title} direction="row" spacing={1.5} sx={{ p: 2, borderRadius: 3, bgcolor: i === 0 ? tokens.roseSoft : i === 1 ? tokens.ubeSoft : tokens.matchaSoft, alignItems: 'flex-start' }}>
          <Box sx={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: tokens.surface,
            color: i === 0 ? tokens.roseDeep : i === 1 ? tokens.ubeDeep : tokens.matchaDeep }}>{s.icon}</Box>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.title}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{s.text}</Typography>
          </Box>
        </Stack>
      ))}
    </Box>
  )
}

/** The code as it's printed on the cards. */
export function RepCode({ code }: { code: string }) {
  return (
    <Box component="span" sx={{ display: 'inline-block', px: 1, py: 0.25, borderRadius: 1.5, border: `1px dashed ${tokens.lineStrong}`,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.8rem', letterSpacing: '0.08em', fontWeight: 600 }}>{code}</Box>
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
            <Typography variant="body2" sx={{ fontWeight: 600, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.rep.name}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.75 }}>{tn(s.rewards, '{n} reward', '{n} rewards')}</Typography>
            <Box sx={{ width: '100%', height: PLACE[i].h, borderRadius: '12px 12px 4px 4px', bgcolor: PLACE[i].bg, color: '#2B2522',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: `inset 0 -6px 0 rgba(43,37,34,0.08)`,
              transformOrigin: 'bottom', animation: 'eb-rise .7s cubic-bezier(.2,.8,.2,1) both', animationDelay: `${(2 - i) * 120}ms`,
              '@keyframes eb-rise': { from: { transform: 'scaleY(0.2)', opacity: 0 }, to: { transform: 'none', opacity: 1 } } }}>
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
        </Typography>
        {rep
          ? <Button size="small" startIcon={<StarIcon />} sx={{ mt: 0.5, ml: -0.75 }} onClick={() => onReward(rep)}>{t('Reward {name}', { name: rep.name })}</Button>
          : <Button size="small" startIcon={<PersonAddIcon />} sx={{ mt: 0.5, ml: -0.75 }} onClick={onAdd}>{t('Add as a customer')}</Button>}
      </Box>
    </Box>
  )
}

/** Add someone or change them. The team adds customers; admins anyone, and pick who on the team. */
function RepDialog({ rep, reps, onClose }: { rep: SalesRepInput; reps: SalesRep[]; onClose: () => void }) {
  const { api, isAdmin, profiles } = useApp()
  const run = useAction()
  const [r, setR] = useState<SalesRepInput>(rep)
  const customers = useAsync('customers', () => (isAdmin ? api.customers() : Promise.resolve([])), [isAdmin])
  const set = (p: Partial<SalesRepInput>) => setR(x => ({ ...x, ...p }))
  const kind = r.kind ?? 'customer'
  const team = profiles.filter(p => (p.role === 'admin' || p.role === 'employee') && p.active && !reps.some(x => x.profile_id === p.id && x.id !== r.id))
  const customer = (customers.data ?? []).find(c => c.id === r.customer_id) ?? null
  const save = async () => {
    const ok = await run(async () => {
      if (!r.name.trim()) throw new Error(t('Give them a name'))
      if (r.instagram?.trim() && !cleanInstagram(r.instagram)) throw new Error(t('That isn’t an Instagram handle'))
      if (r.code?.trim() && !cleanRepCode(r.code)) throw new Error(t('A code is 3 to 12 letters and numbers'))
      if (kind === 'team' && !r.profile_id) throw new Error(t('Choose who on the team it is'))
      await api.saveSalesRep({ ...r, kind, profile_id: kind === 'team' ? r.profile_id : null, instagram: cleanInstagram(r.instagram),
        code: cleanRepCode(r.code) ?? undefined })
    }, r.id ? t('Saved') : t('{name} is a rep', { name: r.name.trim() }))
    if (ok) onClose()
  }
  const remove = async () => { if (r.id && await run(() => api.deleteSalesRep(r.id!), t('Rep removed'))) onClose() }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="rep-title">
      <DialogTitle id="rep-title">{r.id ? rep.name : isAdmin ? t('Add a rep') : t('Add a customer')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {isAdmin && (
            <TextField select label={t('Who they are')} value={kind} onChange={e => set({ kind: e.target.value as RepKind, ...(e.target.value === 'team' ? {} : { profile_id: null }) })}
              helperText={t(REP_KINDS.find(k => k.id === kind)!.what)}>
              {REP_KINDS.map(k => <MenuItem key={k.id} value={k.id}>{t(k.label)}</MenuItem>)}
            </TextField>
          )}
          {kind === 'team' && (
            <TextField select label={t('Person')} value={r.profile_id ?? ''} onChange={e => {
              const p = profiles.find(x => x.id === e.target.value)
              set({ profile_id: e.target.value || null, ...(p && !r.name.trim() ? { name: p.full_name } : {}) })
            }}>
              {team.map(p => <MenuItem key={p.id} value={p.id}>{p.full_name}</MenuItem>)}
            </TextField>
          )}
          <TextField label={t('Name')} value={r.name} onChange={e => set({ name: e.target.value })} required autoFocus={!r.id} />
          {isAdmin && kind !== 'team' && (
            <Autocomplete options={customers.data ?? []} value={customer} getOptionLabel={c => customerName(c)} isOptionEqualToValue={(a, b) => a.id === b.id}
              onChange={(_, c) => set({ customer_id: c?.id ?? null, ...(c && !r.name.trim() ? { name: customerName(c) } : {}),
                ...(c?.instagram && !r.instagram ? { instagram: c.instagram } : {}), ...(c?.phone && !r.phone ? { phone: c.phone } : {}), ...(c?.email && !r.email ? { email: c.email } : {}) })}
              renderInput={params => <TextField {...params} label={t('On Customers')} helperText={t('Optional: who they are on the Customers page')} />} />
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Instagram')} value={r.instagram ?? ''} onChange={e => set({ instagram: e.target.value })} sx={{ flex: 1 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">@</InputAdornment> } }}
              helperText={t('Their stories about the café are matched by it')} />
            <TextField label={t('Code on their cards')} value={r.code ?? ''} onChange={e => set({ code: e.target.value.toUpperCase() })} sx={{ flex: 1 }}
              disabled={!isAdmin} helperText={r.code ? t('3 to 12 letters and numbers') : t('Made from their name if left empty')} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label={t('Phone')} value={r.phone ?? ''} onChange={e => set({ phone: e.target.value })} sx={{ flex: 1 }} />
            <TextField label={t('Email')} value={r.email ?? ''} onChange={e => set({ email: e.target.value })} sx={{ flex: 1 }} />
          </Stack>
          <TextField label={t('Notes')} value={r.notes ?? ''} onChange={e => set({ notes: e.target.value })} multiline minRows={2} />
          {isAdmin && r.id && <FormControlLabel control={<Switch checked={r.active ?? true} onChange={e => set({ active: e.target.checked })} />} label={t('Still a rep')} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        {isAdmin && r.id && <Button color="error" onClick={() => void remove()} sx={{ mr: 'auto' }}>{t('Remove')}</Button>}
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant="contained" onClick={() => void save()}>{t('Save')}</Button>
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
function LogDialog({ rep, mention, rules, ledger, isAdmin, self, onClose }: {
  rep: SalesRep; mention?: Mention; rules: RewardRule[]; ledger: RepReward[]; isAdmin: boolean; self: boolean; onClose: () => void
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
  const amount = rule ? rewardAmount(rule, Number(sale.replace(',', '.')) || 0) : 0
  const full = rule ? limitReached(rule, ledger, rep.id, on) : false
  const waits = !!rule && (self || (!isAdmin && rule.needs_approval))
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
                {fits.map(r => <MenuItem key={r.id} value={r.id}>{r.name} · {worth(r)}</MenuItem>)}
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
                {waits && <Typography variant="body2">{self ? t('Your own reward: someone else approves it.') : t('An admin approves it before it counts.')}</Typography>}
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

/** A reward on the list: who earns it, what it's worth, whether it waits for approval and how often. */
function RuleDialog({ rule, onClose }: { rule: RewardRuleInput; onClose: () => void }) {
  const { api } = useApp()
  const run = useAction()
  const [r, setR] = useState<RewardRuleInput>(rule)
  const [amount, setAmount] = useState(String(rule.amount))
  const set = (p: Partial<RewardRuleInput>) => setR(x => ({ ...x, ...p }))
  const save = async () => {
    const value = Number(amount.replace(',', '.'))
    const ok = await run(async () => {
      if (!r.name.trim()) throw new Error(t('Give it a name'))
      if (!(value > 0) || (r.basis === 'percent' && value > 100)) throw new Error(r.basis === 'percent' ? t('Give a percentage from 0 to 100') : t('Give an amount above 0'))
      await api.saveRewardRule({ ...r, name: r.name.trim(), amount: value })
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

